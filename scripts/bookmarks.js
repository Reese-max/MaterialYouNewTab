/*
 * Material You NewTab
 * Copyright (c) 2024-2026 Prem, 2023-2025 XengShi
 * Licensed under the GNU General Public License v3.0 (GPL-3.0)
 */

// ------------------------ Bookmark System -----------------------------------
const bookmarkButton = document.getElementById("bookmarkButton");
const bookmarkSidebar = document.getElementById("bookmarkSidebar");
const bookmarkList = document.getElementById("bookmarkList");
const bookmarkSearch = document.getElementById("bookmarkSearch");
const bookmarkSearchClearButton = document.getElementById("clearSearchButton");
const bookmarkViewGrid = document.getElementById("bookmarkViewGrid");
const bookmarkViewList = document.getElementById("bookmarkViewList");
const bookmarksCheckbox = document.getElementById("bookmarksCheckbox");
const bookmarkShortcutStatus = document.getElementById("bookmarkShortcutStatus");
const bookmarkState = document.getElementById("bookmarkState");
const bookmarkStateTitle = document.getElementById("bookmarkStateTitle");
const bookmarkStateDescription = document.getElementById("bookmarkStateDescription");
const bookmarkStatePrimary = document.getElementById("bookmarkStatePrimary");
const bookmarkStateSecondary = document.getElementById("bookmarkStateSecondary");
const bookmarkContent = document.getElementById("bookmarkContent");
const bookmarkAddButton = document.getElementById("bookmarkAddButton");
const bookmarkCloseButton = document.getElementById("bookmarkCloseButton");
const bookmarkUndoBar = document.getElementById("bookmarkUndoBar");
const bookmarkUndoMessage = document.getElementById("bookmarkUndoMessage");
const bookmarkUndoButton = document.getElementById("bookmarkUndoButton");
const editBookmarkModal = document.getElementById("editBookmarkModal");
const editBookmarkHeading = document.getElementById("editBookmarkHeading");
const editBookmarkName = document.getElementById("editBookmarkName");
const editBookmarkURL = document.getElementById("editBookmarkURL");
const editBookmarkFavicon = document.getElementById("editBookmarkFavicon");
const bookmarkEditorError = document.getElementById("bookmarkEditorError");
const saveBookmarkChanges = document.getElementById("saveBookmarkChanges");
const cancelBookmarkEdit = document.getElementById("cancelBookmarkEdit");
const sortAlphabetical = document.getElementById("sortAlphabetical");
const sortTimeAdded = document.getElementById("sortTimeAdded");
const sortManual = document.getElementById("sortManual");
const editBookmarkURLField = document.getElementById("editBookmarkURLField");
const editBookmarkFolder = document.getElementById("editBookmarkFolder");

const BOOKMARK_FAVORITES_KEY = "myntBookmarkFavorites";
const BOOKMARK_FOLDERS_KEY = "myntBookmarkExpandedFolders";
const BOOKMARK_UNDO_MS = 7000;
const BOOKMARK_RECENT_SHOWN = 4;
const BOOKMARK_RECENT_MAX = 12;
const BOOKMARK_OPEN_ALL_CONFIRM = 10;
let bookmarksAPI = null;
let bookmarkApiUsesPromises = false;
let bookmarkTree = [];
let recentBookmarks = [];
let bookmarkNodeMap = new Map();
let currentBookmarkId = null;
let currentEditorIsFolder = false;
let currentEditorParentId = null;
let recentBookmarksExpanded = false;
let draggedBookmark = null;
let bookmarkRenderSection = "";
let currentSortMethod = readBookmarkSetting("bookmarkSortMethod") || "title";
let bookmarkStatusTimer = null;
let bookmarkSearchTimer = null;
let bookmarkUndoTimer = null;
let pendingBookmarkUndo = null;
let bookmarkDataAvailable = false;
let bookmarkLoadGeneration = 0;
let bookmarkPermissionPending = false;
let bookmarkMutationPending = false;
let bookmarkEditorSaving = false;
let bookmarkRefreshTimer = null;
let observedBookmarkAPI = null;

function readBookmarkSetting(key) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function bookmarkLocale() {
    try {
        return Intl.getCanonicalLocales(String(currentLanguage || "en").replace(/_/gu, "-"))[0] || "en";
    } catch {
        return "en";
    }
}

function bookmarkText(key, replacements = {}) {
    let value = translations[currentLanguage]?.[key] || translations.en?.[key] || key;
    for (const [name, replacement] of Object.entries(replacements)) {
        value = value.replace(`{${name}}`, replacement);
    }
    return value;
}

function readStoredArray(key) {
    try {
        const value = JSON.parse(readBookmarkSetting(key) || "[]");
        return Array.isArray(value) ? value.map(String) : [];
    } catch {
        return [];
    }
}

function writeStoredArray(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify([...new Set(value.map(String))]));
        return true;
    } catch {
        setBookmarkStatus("bookmarkLocalSaveError", {}, 5000);
        return false;
    }
}

function getFavoriteIds() {
    return readStoredArray(BOOKMARK_FAVORITES_KEY);
}

function getExpandedFolderIds() {
    // Until the user toggles a folder, the first browser root (the bookmarks bar) starts open.
    if (readBookmarkSetting(BOOKMARK_FOLDERS_KEY) === null) {
        const first = bookmarkTree.flatMap(root => root.children || []).find(node => node.children?.length);
        return new Set(first ? [String(first.id)] : []);
    }
    return new Set(readStoredArray(BOOKMARK_FOLDERS_KEY));
}

function getBookmarkNamespace() {
    if (globalThis.browser?.bookmarks) {
        bookmarkApiUsesPromises = true;
        return globalThis.browser.bookmarks;
    }
    if (globalThis.chrome?.bookmarks) {
        bookmarkApiUsesPromises = false;
        return globalThis.chrome.bookmarks;
    }
    return null;
}

function getPermissionNamespace() {
    return globalThis.browser?.permissions || globalThis.chrome?.permissions || null;
}

function callBookmarkApi(method, ...args) {
    return new Promise((resolve, reject) => {
        if (typeof bookmarksAPI?.[method] !== "function") {
            reject(new Error(`Bookmarks API method unavailable: ${method}`));
            return;
        }
        // The executor also catches synchronous throws from either API flavor.
        if (bookmarkApiUsesPromises) {
            resolve(bookmarksAPI[method](...args));
            return;
        }
        bookmarksAPI[method](...args, result => {
            const error = globalThis.chrome?.runtime?.lastError;
            if (error) reject(new Error(error.message));
            else resolve(result);
        });
    });
}

function callPermissionApi(method, details) {
    return new Promise((resolve, reject) => {
        const permissionAPI = getPermissionNamespace();
        if (typeof permissionAPI?.[method] !== "function") {
            reject(new Error(`Permissions API method unavailable: ${method}`));
            return;
        }
        if (globalThis.browser?.permissions === permissionAPI) {
            resolve(permissionAPI[method](details));
            return;
        }
        permissionAPI[method](details, result => {
            const error = globalThis.chrome?.runtime?.lastError;
            if (error) reject(new Error(error.message));
            else resolve(result);
        });
    });
}

function requiredBookmarkPermissions() {
    return { permissions: (isFirefox || isOpera) ? ["bookmarks"] : ["bookmarks", "favicon"] };
}

function observeBookmarkChanges() {
    if (!bookmarksAPI || observedBookmarkAPI === bookmarksAPI) return;
    observedBookmarkAPI = bookmarksAPI;
    for (const event of [bookmarksAPI.onCreated, bookmarksAPI.onChanged, bookmarksAPI.onRemoved, bookmarksAPI.onMoved, bookmarksAPI.onChildrenReordered]) {
        event?.addListener(() => {
            clearTimeout(bookmarkRefreshTimer);
            bookmarkRefreshTimer = setTimeout(() => {
                if (bookmarkSidebar.classList.contains("open") && !bookmarkMutationPending) refreshBookmarkAvailability();
            }, 120);
        });
    }
}

function configureStateButton(button, label, action) {
    button.hidden = !label;
    button.textContent = label || "";
    button.onclick = action ? () => action() : null;
}

function renderBookmarkState(kind) {
    const states = {
        loading: ["bookmarkStateLoadingTitle", "bookmarkStateLoadingDescription"],
        preview: ["bookmarkStatePreviewTitle", "bookmarkStatePreviewDescription"],
        unsupported: ["bookmarkStateUnsupportedTitle", "bookmarkStateUnsupportedDescription"],
        permission: ["bookmarkStatePermissionTitle", "bookmarkStatePermissionDescription", "bookmarkPermissionAction", requestBookmarkPermission, "bookmarkNotNowAction", closeBookmarkSidebar],
        denied: ["bookmarkStateDeniedTitle", "bookmarkStateDeniedDescription", "bookmarkPermissionRetryAction", requestBookmarkPermission, "bookmarkNotNowAction", closeBookmarkSidebar],
        empty: ["bookmarkStateEmptyTitle", "bookmarkStateEmptyDescription", "bookmarkAddFirstAction", openBookmarkEditor, "bookmarkReloadAction", loadBookmarks],
        "search-empty": ["bookmarkStateSearchEmptyTitle", "bookmarkStateSearchEmptyDescription", "bookmarkClearSearchAction", clearBookmarkSearch],
        error: ["bookmarkStateErrorTitle", "bookmarkStateErrorDescription", "bookmarkRetryAction", refreshBookmarkAvailability]
    };
    const state = states[kind] || states.error;
    if (!["empty", "search-empty"].includes(kind)) bookmarkDataAvailable = false;
    bookmarkState.dataset.state = kind;
    bookmarkStateTitle.textContent = bookmarkText(state[0]);
    bookmarkStateDescription.textContent = bookmarkText(state[1]);
    configureStateButton(bookmarkStatePrimary, state[2] ? bookmarkText(state[2]) : "", state[3]);
    configureStateButton(bookmarkStateSecondary, state[4] ? bookmarkText(state[4]) : "", state[5]);
    bookmarkState.hidden = false;
    bookmarkContent.hidden = true;
    bookmarkSearch.disabled = !["empty", "search-empty"].includes(kind);
    bookmarkAddButton.disabled = !["empty", "search-empty"].includes(kind);
}

function showBookmarkContent() {
    bookmarkState.hidden = true;
    bookmarkContent.hidden = false;
    bookmarkSearch.disabled = false;
    bookmarkAddButton.disabled = false;
}

function setBookmarkStatus(key, replacements = {}, duration = 3200) {
    bookmarkShortcutStatus.textContent = bookmarkText(key, replacements);
    clearTimeout(bookmarkStatusTimer);
    bookmarkStatusTimer = setTimeout(() => {
        bookmarkShortcutStatus.textContent = "";
    }, duration);
}

async function requestBookmarkPermission() {
    if (bookmarkPermissionPending) return false;
    bookmarkPermissionPending = true;
    const generation = ++bookmarkLoadGeneration;
    renderBookmarkState("loading");
    try {
        // Invoke directly in the user's click, before any asynchronous work.
        const granted = await callPermissionApi("request", requiredBookmarkPermissions());
        if (generation !== bookmarkLoadGeneration) return false;
        if (!granted) {
            renderBookmarkState("denied");
            if (bookmarkSidebar.classList.contains("open")) bookmarkStatePrimary.focus();
            return false;
        }
        bookmarksAPI = getBookmarkNamespace();
        observeBookmarkChanges();
        const loaded = await loadBookmarks();
        if (loaded && bookmarkSidebar.classList.contains("open")) bookmarkSearch.focus();
        return loaded;
    } catch (error) {
        console.error("Error requesting bookmark access:", error);
        if (generation === bookmarkLoadGeneration) renderBookmarkState("error");
        return false;
    } finally {
        bookmarkPermissionPending = false;
    }
}

async function refreshBookmarkAvailability() {
    const generation = ++bookmarkLoadGeneration;
    renderBookmarkState("loading");
    bookmarksAPI = getBookmarkNamespace();
    const permissionAPI = getPermissionNamespace();
    // Optional APIs may be hidden until access is granted. Check permissions first.
    if (!bookmarksAPI && !permissionAPI?.contains) {
        renderBookmarkState(["http:", "https:", "file:"].includes(location.protocol) ? "preview" : "unsupported");
        return false;
    }
    try {
        if (permissionAPI?.contains) {
            // Missing favicon access must not block otherwise-authorized bookmarks.
            const granted = await callPermissionApi("contains", { permissions: ["bookmarks"] });
            if (generation !== bookmarkLoadGeneration) return false;
            if (!granted) {
                renderBookmarkState(permissionAPI.request ? "permission" : "unsupported");
                return false;
            }
        }
        bookmarksAPI = getBookmarkNamespace();
        observeBookmarkChanges();
        return await loadBookmarks();
    } catch (error) {
        console.error("Error checking bookmark access:", error);
        if (generation === bookmarkLoadGeneration) renderBookmarkState("error");
        return false;
    }
}

function openBookmarkSidebar() {
    if (bookmarkSidebar.classList.contains("open")) return;
    bookmarkSidebar.classList.add("open");
    bookmarkSidebar.removeAttribute("inert");
    bookmarkSidebar.setAttribute("aria-hidden", "false");
    bookmarkButton.classList.add("rotate");
    bookmarkButton.setAttribute("aria-expanded", "true");
    refreshBookmarkAvailability().then(() => {
        if (!bookmarkSidebar.classList.contains("open")) return;
        const target = bookmarkSearch.disabled ? bookmarkStatePrimary : bookmarkSearch;
        if (target && !target.hidden && !target.disabled) target.focus();
        else bookmarkCloseButton.focus();
    });
}

function closeBookmarkSidebar() {
    if (!bookmarkSidebar.classList.contains("open")) return;
    bookmarkSidebar.classList.remove("open");
    bookmarkSidebar.setAttribute("aria-hidden", "true");
    bookmarkSidebar.setAttribute("inert", "");
    bookmarkButton.classList.remove("rotate");
    bookmarkButton.setAttribute("aria-expanded", "false");
    bookmarkButton.focus();
}

function toggleBookmarkSidebar() {
    if (bookmarkSidebar.classList.contains("open")) closeBookmarkSidebar();
    else openBookmarkSidebar();
}

function flattenBookmarkNodes(nodes, target = []) {
    for (const node of nodes || []) {
        if (node.url || Array.isArray(node.children)) target.push(node);
        if (node.children) flattenBookmarkNodes(node.children, target);
    }
    return target;
}

function bookmarkComparableUrl(url) {
    if (typeof myntNormalizeShortcutUrl === "function") return myntNormalizeShortcutUrl(url);
    try {
        return new URL(url).href;
    } catch {
        return null;
    }
}

function seedFavoritesFromShortcuts(allNodes) {
    if (readBookmarkSetting(BOOKMARK_FAVORITES_KEY) !== null) return;
    const count = Number.parseInt(readBookmarkSetting("shortcutAmount") || "0", 10);
    const shortcutUrls = new Set();
    for (let index = 0; index < count; index += 1) {
        const url = bookmarkComparableUrl(readBookmarkSetting(`shortcutURL${index}`));
        if (url) shortcutUrls.add(url);
    }
    const matches = allNodes
        .filter(node => node.url && shortcutUrls.has(bookmarkComparableUrl(node.url)))
        .slice(0, 6)
        .map(node => String(node.id));
    writeStoredArray(BOOKMARK_FAVORITES_KEY, matches);
}

function hasBookmarkContent() {
    const rootIds = new Set(bookmarkTree.map(root => String(root.id)));
    return [...bookmarkNodeMap.values()].some(node => node.url ||
        (Array.isArray(node.children) && node.parentId != null && !rootIds.has(String(node.parentId))));
}

function sortBookmarkNodes(nodes) {
    const sorted = [...nodes];
    if (currentSortMethod === "date") return sorted.sort((a, b) => (a.dateAdded || 0) - (b.dateAdded || 0));
    if (currentSortMethod === "manual") return sorted.sort((a, b) => (a.index || 0) - (b.index || 0));
    return sorted.sort((a, b) => (a.title || "").localeCompare(b.title || "", bookmarkLocale()));
}

async function loadBookmarks() {
    const generation = ++bookmarkLoadGeneration;
    if (!bookmarksAPI?.getTree) {
        renderBookmarkState("unsupported");
        return false;
    }
    renderBookmarkState("loading");
    try {
        const [tree, recent] = await Promise.all([
            callBookmarkApi("getTree"),
            bookmarksAPI.getRecent ? callBookmarkApi("getRecent", BOOKMARK_RECENT_MAX).catch(() => []) : Promise.resolve([])
        ]);
        if (generation !== bookmarkLoadGeneration) return false;
        if (!Array.isArray(tree)) throw new Error("Invalid bookmark tree response");
        bookmarkTree = tree;
        recentBookmarks = (Array.isArray(recent) ? recent : []).filter(node => node.url).slice(0, BOOKMARK_RECENT_MAX);
        const allNodes = flattenBookmarkNodes(bookmarkTree);
        bookmarkNodeMap = new Map(allNodes.map(node => [String(node.id), node]));
        seedFavoritesFromShortcuts(allNodes);
        bookmarkDataAvailable = true;
        if (!hasBookmarkContent()) {
            bookmarkList.replaceChildren();
            renderBookmarkState("empty");
            return true;
        }
        renderBookmarks();
        return true;
    } catch (error) {
        console.error("Error loading bookmarks:", error);
        if (generation === bookmarkLoadGeneration) renderBookmarkState("error");
        return false;
    }
}

function renderBookmarks() {
    if (!bookmarkDataAvailable) return;
    const query = bookmarkSearch.value.trim().toLocaleLowerCase(bookmarkLocale());
    bookmarkSearchClearButton.hidden = !query;
    bookmarkList.replaceChildren();
    if (query) {
        const matches = [...bookmarkNodeMap.values()].filter(node =>
            `${node.title || ""} ${node.url || ""}`.toLocaleLowerCase(bookmarkLocale()).includes(query)
        );
        if (!matches.length) {
            renderBookmarkState("search-empty");
            return;
        }
        bookmarkList.append(createBookmarkSection("bookmarkSectionSearch", matches, "bookmarkSectionSearchEmpty"));
        showBookmarkContent();
        return;
    }
    if (!hasBookmarkContent()) {
        renderBookmarkState("empty");
        return;
    }
    const favorites = getFavoriteIds().map(id => bookmarkNodeMap.get(id)).filter(Boolean);
    // Browser root folders keep the browser's own order (bookmarks bar first); empty ones are hidden.
    const roots = bookmarkTree.flatMap(root => root.children || []).filter(node => node.url || node.children?.length);
    const recentShown = recentBookmarksExpanded ? recentBookmarks : recentBookmarks.slice(0, BOOKMARK_RECENT_SHOWN);
    const recent = createBookmarkSection("bookmarkSectionRecent", recentShown, "bookmarkSectionRecentEmpty", true, recentBookmarks.length);
    if (recentBookmarks.length > BOOKMARK_RECENT_SHOWN) recent.append(createRecentToggle());
    bookmarkList.append(
        createBookmarkSection("bookmarkSectionFavorites", favorites, "bookmarkSectionFavoritesEmpty", true),
        recent,
        createBookmarkSection("bookmarkSectionFolders", roots, "bookmarkSectionFoldersEmpty", true)
    );
    showBookmarkContent();
}

function createRecentToggle() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "bookmark-recent-toggle";
    button.setAttribute("aria-expanded", String(recentBookmarksExpanded));
    button.textContent = recentBookmarksExpanded
        ? bookmarkText("bookmarkShowLessRecent")
        : bookmarkText("bookmarkShowMoreRecent", { count: String(recentBookmarks.length - BOOKMARK_RECENT_SHOWN) });
    button.addEventListener("click", () => {
        recentBookmarksExpanded = !recentBookmarksExpanded;
        renderBookmarks();
        bookmarkList.querySelector?.(".bookmark-recent-toggle")?.focus();
    });
    return button;
}

// Wraps the first case-insensitive match in <mark>; text whose lowercase form changes length is left plain.
function appendHighlightedText(element, text) {
    const query = bookmarkSearch.value.trim().toLocaleLowerCase(bookmarkLocale());
    const lower = text.toLocaleLowerCase(bookmarkLocale());
    const start = query ? lower.indexOf(query) : -1;
    if (start < 0 || lower.length !== text.length) {
        element.textContent = text;
        return;
    }
    const mark = document.createElement("mark");
    mark.textContent = text.slice(start, start + query.length);
    element.append(document.createTextNode(text.slice(0, start)), mark, document.createTextNode(text.slice(start + query.length)));
}

function createBookmarkSection(titleKey, nodes, emptyKey, keepOrder = false, total = nodes.length) {
    const section = document.createElement("li");
    section.className = "bookmark-section";
    section.dataset.section = titleKey;
    const header = document.createElement("div");
    header.className = "bookmark-section-header";
    const heading = document.createElement("h3");
    heading.textContent = bookmarkText(titleKey);
    const count = document.createElement("span");
    count.textContent = bookmarkText("bookmarkSectionCount", { count: String(total) });
    header.append(heading, count);
    section.append(header);
    if (!nodes.length) {
        const empty = document.createElement("p");
        empty.className = "bookmark-section-empty";
        empty.textContent = bookmarkText(emptyKey);
        section.append(empty);
        return section;
    }
    const list = document.createElement("ul");
    list.className = "bookmark-section-list";
    // Action menus differ per section (move up/down only makes sense in the folder tree).
    bookmarkRenderSection = titleKey;
    for (const node of keepOrder ? nodes : sortBookmarkNodes(nodes)) list.append(createBookmarkNode(node));
    bookmarkRenderSection = "";
    section.append(list);
    return section;
}

function createBookmarkNode(node) {
    return node.url ? createBookmarkItem(node) : createBookmarkFolder(node);
}

function createFolderIcon() {
    const icon = document.getElementById("folderIconTemplate").cloneNode(true);
    icon.removeAttribute("id");
    icon.setAttribute("aria-hidden", "true");
    return icon;
}

function createBookmarkFolder(node) {
    const item = document.createElement("li");
    item.className = "bookmark-folder";
    item.dataset.id = node.id;
    const row = document.createElement("div");
    row.className = "bookmark-folder-row";
    const disclosure = document.createElement("button");
    disclosure.type = "button";
    disclosure.className = "bookmark-folder-disclosure";
    const expandedIds = getExpandedFolderIds();
    const isExpanded = expandedIds.has(String(node.id));
    disclosure.setAttribute("aria-expanded", String(isExpanded));
    disclosure.append(createFolderIcon());
    const title = document.createElement("span");
    appendHighlightedText(title, node.title || bookmarkText("bookmarkUntitledFolder"));
    const chevron = document.createElement("span");
    chevron.className = "bookmark-folder-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "›";
    disclosure.append(title, chevron);
    row.append(disclosure, createBookmarkActions(node));
    makeBookmarkDraggable(row, node);
    const children = document.createElement("ul");
    children.className = "bookmark-folder-children";
    children.hidden = !isExpanded;
    for (const child of sortBookmarkNodes(node.children || [])) children.append(createBookmarkNode(child));
    disclosure.addEventListener("click", () => {
        const expanded = disclosure.getAttribute("aria-expanded") !== "true";
        disclosure.setAttribute("aria-expanded", String(expanded));
        children.hidden = !expanded;
        const next = getExpandedFolderIds();
        if (expanded) next.add(String(node.id));
        else next.delete(String(node.id));
        writeStoredArray(BOOKMARK_FOLDERS_KEY, [...next]);
    });
    item.append(row, children);
    return item;
}

function setBookmarkFavicon(image, pageUrl) {
    const offlineFallback = () => {
        image.onerror = null;
        image.src = "./svgs/offline.svg";
    };
    try {
        const url = new URL(pageUrl);
        // Never send private bookmark domains to a third-party favicon service.
        if (["http:", "https:"].includes(url.protocol) && !isFirefox && !isOpera && globalThis.chrome?.runtime?.id) {
            image.onerror = offlineFallback;
            image.src = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(url.href)}&size=32`;
        } else {
            offlineFallback();
        }
    } catch {
        offlineFallback();
    }
}

function safeBookmarkLink(value) {
    try {
        const url = new URL(value);
        return ["javascript:", "data:", "vbscript:", "blob:"].includes(url.protocol) ? null : url.href;
    } catch {
        return null;
    }
}

function safeHostname(url) {
    try {
        return new URL(url).hostname || url;
    } catch {
        return url;
    }
}

function createBookmarkItem(node) {
    const item = document.createElement("li");
    item.className = "bookmark-item";
    item.dataset.id = node.id;
    item.dataset.url = node.url;
    const link = document.createElement("a");
    const safeUrl = safeBookmarkLink(node.url);
    if (safeUrl) link.href = safeUrl;
    else {
        link.setAttribute("aria-disabled", "true");
        link.title = bookmarkText("bookmarkInvalidUrl");
        link.addEventListener("click", event => {
            event.preventDefault();
            setBookmarkStatus("bookmarkInvalidUrl");
        });
    }
    const favicon = document.createElement("img");
    favicon.className = "favicon";
    favicon.alt = "";
    setBookmarkFavicon(favicon, node.url);
    const copy = document.createElement("span");
    copy.className = "bookmark-item-copy";
    const title = document.createElement("strong");
    appendHighlightedText(title, node.title || safeHostname(node.url));
    const url = document.createElement("small");
    // Search results also name the folder, so same-named bookmarks can be told apart.
    const parent = bookmarkSearch.value.trim() ? bookmarkNodeMap.get(String(node.parentId)) : null;
    const folder = parent && !bookmarkTree.some(root => String(root.id) === String(parent.id)) ? parent.title || bookmarkText("bookmarkUntitledFolder") : "";
    url.textContent = folder ? `${safeHostname(node.url)} · ${folder}` : safeHostname(node.url);
    copy.append(title, url);
    link.append(favicon, copy);
    item.append(link, createBookmarkActions(node));
    makeBookmarkDraggable(item, node);
    return item;
}

// Top-level browser folders (bookmarks bar, other bookmarks) and managed folders cannot be renamed, moved or deleted.
function isFixedBookmarkFolder(node) {
    return !node.url && (node.unmodifiable || node.parentId == null || bookmarkTree.some(root => String(root.id) === String(node.parentId)));
}

// True when node is the folder itself or anywhere below it.
function isBookmarkInside(node, folderId) {
    for (let current = node; current; current = bookmarkNodeMap.get(String(current.parentId))) {
        if (String(current.id) === String(folderId)) return true;
    }
    return false;
}

function collectBookmarkLinks(node, target = []) {
    for (const child of node?.children || []) {
        if (child.url) target.push(child);
        else collectBookmarkLinks(child, target);
    }
    return target;
}

function sectionOf(element) {
    return element.closest?.("[data-section]")?.dataset.section || "";
}

// "before" means: insert in front of the node now at beforeIndex. Chromium counts that index before the moved
// node leaves a shared folder; Firefox counts the final position.
// shortcut: the Firefox branch follows MDN and was not run in Firefox; verify there before relying on it.
function bookmarkMoveIndex(node, parentId, beforeIndex) {
    const sameParent = String(node.parentId) === String(parentId);
    // Not bookmarkApiUsesPromises: Chromium also exposes the promise-based browser namespace.
    return isFirefox && sameParent && beforeIndex > node.index ? beforeIndex - 1 : beforeIndex;
}

async function moveBookmarkNode(id, destination) {
    if (bookmarkMutationPending) return false;
    bookmarkMutationPending = true;
    try {
        await callBookmarkApi("move", String(id), destination);
        setBookmarkStatus("bookmarkMoved");
        await loadBookmarks();
        return true;
    } catch (error) {
        console.error("Error moving bookmark:", error);
        setBookmarkStatus("bookmarkMoveError");
        return false;
    } finally {
        bookmarkMutationPending = false;
    }
}

function moveBookmarkWithinFolder(node, direction) {
    const parent = bookmarkNodeMap.get(String(node.parentId));
    const siblings = parent?.children || [];
    const index = siblings.findIndex(child => String(child.id) === String(node.id));
    const target = index + direction;
    if (index < 0 || target < 0 || target >= siblings.length) return Promise.resolve(false);
    const beforeIndex = direction < 0 ? target : target + 1;
    return moveBookmarkNode(node.id, { parentId: String(parent.id), index: bookmarkMoveIndex({ ...node, index }, parent.id, beforeIndex) });
}

// Decides what dropping the dragged bookmark on target would do, or null when it would do nothing.
function resolveBookmarkDrop(target, targetSection) {
    const source = draggedBookmark && bookmarkNodeMap.get(draggedBookmark.id);
    if (!source || String(source.id) === String(target.id)) return null;
    if (draggedBookmark.section === "bookmarkSectionFavorites") {
        return targetSection === "bookmarkSectionFavorites" && getFavoriteIds().includes(String(target.id))
            ? { type: "favorite", sourceId: String(source.id), beforeId: String(target.id) } : null;
    }
    if (targetSection === "bookmarkSectionFavorites") return null;
    if (!target.url) {
        if (isBookmarkInside(target, source.id) || String(source.parentId) === String(target.id)) return null;
        return { type: "into", sourceId: String(source.id), parentId: String(target.id) };
    }
    const parent = bookmarkNodeMap.get(String(target.parentId));
    if (!parent || isBookmarkInside(parent, source.id)) return null;
    if (currentSortMethod === "manual" && targetSection === "bookmarkSectionFolders") {
        return { type: "before", sourceId: String(source.id), parentId: String(parent.id), index: bookmarkMoveIndex(source, parent.id, target.index) };
    }
    return String(source.parentId) === String(parent.id) ? null : { type: "into", sourceId: String(source.id), parentId: String(parent.id) };
}

function applyBookmarkDrop(action) {
    if (action.type === "favorite") {
        const favorites = getFavoriteIds().filter(id => id !== action.sourceId);
        favorites.splice(Math.max(0, favorites.indexOf(action.beforeId)), 0, action.sourceId);
        writeStoredArray(BOOKMARK_FAVORITES_KEY, favorites);
        renderBookmarks();
        return Promise.resolve(true);
    }
    const destination = { parentId: action.parentId };
    if (action.type === "before") destination.index = action.index;
    return moveBookmarkNode(action.sourceId, destination);
}

function clearBookmarkDropMarkers() {
    bookmarkList.querySelectorAll?.(".drop-into, .drop-before").forEach(element => element.classList.remove("drop-into", "drop-before"));
}

// Pointer-only shortcut; every move here also exists in the action menu (folder picker, move up/down).
function makeBookmarkDraggable(element, node) {
    if (!bookmarkSearch.value.trim() && !(!node.url && isFixedBookmarkFolder(node))) {
        element.draggable = true;
        element.addEventListener("dragstart", event => {
            if (bookmarkMutationPending) {
                event.preventDefault();
                return;
            }
            event.stopPropagation();
            draggedBookmark = { id: String(node.id), section: sectionOf(element) };
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", node.url || node.title || "");
            element.classList.add("dragging");
        });
        element.addEventListener("dragend", () => {
            draggedBookmark = null;
            element.classList.remove("dragging");
            clearBookmarkDropMarkers();
        });
    }
    element.addEventListener("dragover", event => {
        const action = resolveBookmarkDrop(node, sectionOf(element));
        if (!action) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        element.classList.toggle("drop-into", action.type === "into");
        element.classList.toggle("drop-before", action.type !== "into");
    });
    element.addEventListener("dragleave", event => {
        if (!element.contains(event.relatedTarget)) element.classList.remove("drop-into", "drop-before");
    });
    element.addEventListener("drop", event => {
        const action = resolveBookmarkDrop(node, sectionOf(element));
        clearBookmarkDropMarkers();
        if (!action) return;
        event.preventDefault();
        event.stopPropagation();
        draggedBookmark = null;
        applyBookmarkDrop(action);
    });
}

function getTabsNamespace() {
    return globalThis.browser?.tabs || globalThis.chrome?.tabs || null;
}

async function openBookmarksInTabs(nodes) {
    const urls = nodes.map(node => safeBookmarkLink(node.url)).filter(Boolean);
    if (!urls.length) {
        setBookmarkStatus("bookmarkFolderNoLinks");
        return 0;
    }
    if (urls.length > BOOKMARK_OPEN_ALL_CONFIRM && !await confirmPrompt(bookmarkText("bookmarkOpenAllConfirm", { count: String(urls.length) }))) return 0;
    const tabs = getTabsNamespace();
    let opened = 0;
    for (const url of urls) {
        try {
            if (!tabs?.create) throw new Error("Tabs API unavailable");
            await tabs.create({ url, active: false });
            opened += 1;
        } catch (error) {
            console.error("Error opening bookmark:", error);
        }
    }
    setBookmarkStatus(opened === urls.length ? "bookmarkOpenedTabs" : "bookmarkOpenError", { count: String(opened) });
    return opened;
}

async function copyBookmarkUrl(node) {
    try {
        await navigator.clipboard.writeText(node.url);
        setBookmarkStatus("bookmarkCopied");
        return true;
    } catch (error) {
        console.error("Error copying bookmark URL:", error);
        setBookmarkStatus("bookmarkCopyError");
        return false;
    }
}

function createActionButton(label, className, action, disabled = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.disabled = disabled;
    button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        const menu = button.closest("details");
        if (menu) menu.open = false;
        action();
    });
    return button;
}

function createBookmarkActions(node) {
    const actions = document.createElement("details");
    actions.className = "bookmark-action-menu";
    const summary = document.createElement("summary");
    const label = `${bookmarkText("bookmarkMoreActions")}: ${node.title || node.url || bookmarkText("bookmarkUntitledFolder")}`;
    summary.setAttribute("aria-label", label);
    summary.title = bookmarkText("bookmarkMoreActions");
    summary.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/></svg>';
    const menu = document.createElement("div");
    menu.className = "bookmark-action-popover";
    const favorites = getFavoriteIds();
    const favoriteIndex = favorites.indexOf(String(node.id));
    const isFavorite = favoriteIndex >= 0;
    if (node.url) {
        menu.append(
            createActionButton(bookmarkText("bookmarkOpenNewTab"), "bookmark-open-button", () => openBookmarksInTabs([node]), !safeBookmarkLink(node.url)),
            createActionButton(bookmarkText("bookmarkCopyUrl"), "bookmark-copy-button", () => copyBookmarkUrl(node))
        );
    }
    menu.append(createActionButton(
        bookmarkText(isFavorite ? "bookmarkRemoveFavorite" : "bookmarkAddFavorite"),
        "bookmark-favorite-button",
        () => toggleBookmarkFavorite(node.id)
    ));
    if (isFavorite) {
        menu.append(
            createActionButton(bookmarkText("bookmarkMoveFavoriteUp"), "bookmark-move-button", () => moveBookmarkFavorite(node.id, -1), favoriteIndex === 0),
            createActionButton(bookmarkText("bookmarkMoveFavoriteDown"), "bookmark-move-button", () => moveBookmarkFavorite(node.id, 1), favoriteIndex === favorites.length - 1)
        );
    }
    const fixed = !node.url && isFixedBookmarkFolder(node);
    if (!fixed && currentSortMethod === "manual" && !bookmarkSearch.value.trim() && bookmarkRenderSection === "bookmarkSectionFolders") {
        const siblings = bookmarkNodeMap.get(String(node.parentId))?.children || [];
        const index = siblings.findIndex(child => String(child.id) === String(node.id));
        menu.append(
            createActionButton(bookmarkText("bookmarkMoveUp"), "bookmark-move-button", () => moveBookmarkWithinFolder(node, -1), index <= 0),
            createActionButton(bookmarkText("bookmarkMoveDown"), "bookmark-move-button", () => moveBookmarkWithinFolder(node, 1), index < 0 || index === siblings.length - 1)
        );
    }
    if (!node.url) {
        menu.append(
            createActionButton(bookmarkText("bookmarkOpenAll"), "bookmark-open-button", () => openBookmarksInTabs(collectBookmarkLinks(node))),
            createActionButton(bookmarkText("bookmarkAddHere"), "bookmark-add-here-button", () => openBookmarkEditor(null, { parentId: node.id })),
            createActionButton(bookmarkText("bookmarkAddSubfolder"), "bookmark-add-folder-button", () => openBookmarkEditor(null, { folder: true, parentId: node.id }))
        );
        if (!fixed) {
            menu.append(
                createActionButton(bookmarkText("bookmarkEditFolder"), "bookmark-edit-button", () => openBookmarkEditor(node)),
                createActionButton(bookmarkText("bookmarkDeleteFolder"), "bookmark-delete-button", () => deleteBookmarkFolder(node))
            );
        }
    }
    if (node.url) {
        menu.append(
            createActionButton(bookmarkText("bookmarkPinToShortcuts"), "bookmark-shortcut-button", () => {
                document.dispatchEvent(new CustomEvent("mynt:add-shortcut", { detail: { name: node.title, url: node.url } }));
            }),
            createActionButton(bookmarkText("bookmarkEditLabel"), "bookmark-edit-button", () => openBookmarkEditor(node)),
            createActionButton(bookmarkText("bookmarkDeleteLabel"), "bookmark-delete-button", () => deleteBookmark(node))
        );
    }
    actions.append(summary, menu);
    actions.addEventListener("toggle", () => {
        if (!actions.open) return;
        document.querySelectorAll(".bookmark-action-menu[open]").forEach(other => {
            if (other !== actions) other.open = false;
        });
    });
    return actions;
}

function toggleBookmarkFavorite(id) {
    const favorites = getFavoriteIds();
    const normalizedId = String(id);
    const index = favorites.indexOf(normalizedId);
    if (index >= 0) {
        favorites.splice(index, 1);
        setBookmarkStatus("bookmarkFavoriteRemoved");
    } else {
        favorites.push(normalizedId);
        setBookmarkStatus("bookmarkFavoriteAdded");
    }
    writeStoredArray(BOOKMARK_FAVORITES_KEY, favorites);
    renderBookmarks();
}

function moveBookmarkFavorite(id, direction) {
    const favorites = getFavoriteIds();
    const from = favorites.indexOf(String(id));
    const to = from + direction;
    if (from < 0 || to < 0 || to >= favorites.length) return;
    [favorites[from], favorites[to]] = [favorites[to], favorites[from]];
    writeStoredArray(BOOKMARK_FAVORITES_KEY, favorites);
    renderBookmarks();
}

function normalizeBookmarkUrl(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) return null;
    const candidate = /^[a-z][a-z\d+.-]*:/iu.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
        const parsed = new URL(candidate);
        return safeBookmarkLink(parsed.href);
    } catch {
        return null;
    }
}

// Folders a bookmark can be saved into, labelled by path so the closed picker still shows where it is.
// A folder being edited cannot move into itself or below itself.
function bookmarkFolderOptions(excludeId = null) {
    const options = [];
    const visit = (nodes, path) => {
        for (const node of nodes || []) {
            if (node.url || node.unmodifiable || String(node.id) === String(excludeId)) continue;
            const label = [...path, node.title || bookmarkText("bookmarkUntitledFolder")];
            options.push({ id: String(node.id), label: label.join(" › ") });
            visit(node.children, label);
        }
    };
    for (const root of bookmarkTree) visit(root.children, []);
    return options;
}

function openBookmarkEditor(node = null, { folder = false, parentId = null } = {}) {
    if (!bookmarkDataAvailable || bookmarkMutationPending || editBookmarkModal.open) return;
    currentBookmarkId = node?.id ? String(node.id) : null;
    currentEditorIsFolder = Boolean(folder || (node && !node.url));
    currentEditorParentId = node?.parentId != null ? String(node.parentId) : null;
    const headingKey = currentEditorIsFolder ? (node ? "editFolderHeading" : "addFolderHeading") : (node ? "editBookmarkHeading" : "addBookmarkHeading");
    editBookmarkHeading.textContent = bookmarkText(headingKey);
    editBookmarkName.value = node?.title || "";
    editBookmarkURL.value = node?.url || "";
    editBookmarkURLField.hidden = currentEditorIsFolder;
    editBookmarkFavicon.hidden = currentEditorIsFolder;
    const options = bookmarkFolderOptions(currentEditorIsFolder ? currentBookmarkId : null);
    editBookmarkFolder.replaceChildren(...options.map(option => {
        const element = document.createElement("option");
        element.value = option.id;
        element.textContent = option.label;
        return element;
    }));
    const preferred = String(node?.parentId ?? parentId ?? "");
    editBookmarkFolder.value = options.some(option => option.id === preferred) ? preferred : options[0]?.id || "";
    bookmarkEditorError.textContent = "";
    saveBookmarkChanges.disabled = false;
    if (node?.url) setBookmarkFavicon(editBookmarkFavicon, node.url);
    else editBookmarkFavicon.src = "./svgs/offline.svg";
    editBookmarkModal.showModal();
    editBookmarkName.focus();
}

function closeBookmarkEditor() {
    // A browser API write cannot be cancelled after dispatch. Keep that state explicit.
    if (bookmarkEditorSaving) return;
    currentBookmarkId = null;
    if (editBookmarkModal.open) editBookmarkModal.close();
    bookmarkAddButton.focus();
}

function setBookmarkEditorSaving(saving) {
    bookmarkEditorSaving = saving;
    saveBookmarkChanges.disabled = saving;
    cancelBookmarkEdit.disabled = saving;
    editBookmarkName.disabled = saving;
    editBookmarkURL.disabled = saving;
    editBookmarkFolder.disabled = saving;
    editBookmarkModal.setAttribute("aria-busy", String(saving));
}

async function saveBookmarkEditor() {
    if (!editBookmarkModal.open || bookmarkMutationPending) return false;
    const title = editBookmarkName.value.trim();
    const isFolder = currentEditorIsFolder;
    const url = isFolder ? null : normalizeBookmarkUrl(editBookmarkURL.value);
    if (isFolder && !title) {
        bookmarkEditorError.textContent = bookmarkText("bookmarkFolderNameRequired");
        editBookmarkName.focus();
        return false;
    }
    if (!isFolder && !url) {
        bookmarkEditorError.textContent = bookmarkText("bookmarkInvalidUrl");
        editBookmarkURL.focus();
        return false;
    }
    const id = currentBookmarkId;
    const parentId = editBookmarkFolder.value || null;
    const fields = isFolder ? { title } : { title, url };
    bookmarkMutationPending = true;
    setBookmarkEditorSaving(true);
    bookmarkEditorError.textContent = "";
    try {
        if (id) {
            await callBookmarkApi("update", id, fields);
            if (parentId && parentId !== currentEditorParentId) {
                await callBookmarkApi("move", id, { parentId });
                currentEditorParentId = parentId;
            }
            setBookmarkStatus(isFolder ? "bookmarkFolderUpdated" : "bookmarkUpdated");
        } else {
            await callBookmarkApi("create", parentId ? { parentId, ...fields } : fields);
            setBookmarkStatus(isFolder ? "bookmarkFolderCreated" : "bookmarkCreated");
        }
        setBookmarkEditorSaving(false);
        closeBookmarkEditor();
        await loadBookmarks();
        return true;
    } catch (error) {
        console.error("Error saving bookmark:", error);
        bookmarkEditorError.textContent = bookmarkText("bookmarkSaveError");
        return false;
    } finally {
        setBookmarkEditorSaving(false);
        bookmarkMutationPending = false;
    }
}

async function deleteBookmark(node) {
    if (bookmarkMutationPending || !node?.url) return false;
    bookmarkMutationPending = true;
    try {
        const message = bookmarkText("deleteBookmark", { title: node.title || node.url });
        if (!await confirmPrompt(message)) return false;
        const favorites = getFavoriteIds();
        const favoriteIndex = favorites.indexOf(String(node.id));
        await callBookmarkApi("remove", node.id);
        // Capture recovery data immediately, before any fallible preference write.
        pendingBookmarkUndo = {
            title: node.title || "",
            url: node.url,
            parentId: node.parentId,
            index: node.index,
            favoriteIndex
        };
        showBookmarkUndo(false);
        if (favoriteIndex >= 0) {
            favorites.splice(favoriteIndex, 1);
            writeStoredArray(BOOKMARK_FAVORITES_KEY, favorites);
        }
        await loadBookmarks();
        // Give the user the full undo window after refresh stops blocking mutations.
        showBookmarkUndo();
        return true;
    } catch (error) {
        console.error("Error removing bookmark:", error);
        setBookmarkStatus("bookmarkDeleteError");
        return false;
    } finally {
        bookmarkMutationPending = false;
    }
}

async function deleteBookmarkFolder(node) {
    if (bookmarkMutationPending || !node || node.url || isFixedBookmarkFolder(node)) return false;
    bookmarkMutationPending = true;
    try {
        const message = bookmarkText("deleteBookmarkFolder", {
            title: node.title || bookmarkText("bookmarkUntitledFolder"),
            count: String(collectBookmarkLinks(node).length)
        });
        if (!await confirmPrompt(message)) return false;
        // Snapshot right before removal so the undo copy matches what is deleted.
        const [snapshot] = await callBookmarkApi("getSubTree", String(node.id));
        if (!snapshot?.children) throw new Error("Folder not found");
        const favorites = getFavoriteIds();
        const removedIds = new Set(flattenBookmarkNodes([snapshot]).map(item => String(item.id)));
        await callBookmarkApi("removeTree", String(node.id));
        pendingBookmarkUndo = {
            title: snapshot.title || "",
            parentId: snapshot.parentId,
            index: snapshot.index,
            favoriteIndex: -1,
            folderId: String(snapshot.id),
            children: snapshot.children,
            favorites: favorites.map((id, index) => [id, index]).filter(([id]) => removedIds.has(id))
        };
        showBookmarkUndo(false);
        if (pendingBookmarkUndo.favorites.length) writeStoredArray(BOOKMARK_FAVORITES_KEY, favorites.filter(id => !removedIds.has(id)));
        await loadBookmarks();
        showBookmarkUndo();
        return true;
    } catch (error) {
        console.error("Error removing bookmark folder:", error);
        setBookmarkStatus("bookmarkDeleteError");
        return false;
    } finally {
        bookmarkMutationPending = false;
    }
}

async function restoreBookmarkChildren(children, parentId, idMap) {
    for (const child of children || []) {
        const details = { parentId, title: child.title || "" };
        if (child.url) details.url = child.url;
        const created = await callBookmarkApi("create", details);
        idMap.set(String(child.id), String(created.id));
        if (!child.url) await restoreBookmarkChildren(child.children, String(created.id), idMap);
    }
}

function showBookmarkUndo(startTimer = true) {
    clearTimeout(bookmarkUndoTimer);
    bookmarkUndoMessage.textContent = bookmarkText(pendingBookmarkUndo?.children ? "bookmarkFolderDeletedWithUndo" : "bookmarkDeletedWithUndo");
    bookmarkUndoBar.hidden = false;
    bookmarkUndoButton.disabled = !startTimer;
    if (startTimer) bookmarkUndoTimer = setTimeout(clearBookmarkUndo, BOOKMARK_UNDO_MS);
}

function clearBookmarkUndo() {
    clearTimeout(bookmarkUndoTimer);
    bookmarkUndoBar.hidden = true;
    pendingBookmarkUndo = null;
}

async function undoBookmarkDelete() {
    const pending = pendingBookmarkUndo;
    if (!pending || bookmarkMutationPending) return false;
    bookmarkMutationPending = true;
    bookmarkUndoButton.disabled = true;
    // Keep the only recovery copy until the browser confirms creation.
    clearTimeout(bookmarkUndoTimer);
    try {
        const details = { title: pending.title };
        if (pending.url) details.url = pending.url;
        const tree = await callBookmarkApi("getTree");
        if (!Array.isArray(tree)) throw new Error("Invalid bookmark tree response");
        const parent = flattenBookmarkNodes(tree).find(node => String(node.id) === String(pending.parentId));
        if (parent && Array.isArray(parent.children) && !parent.unmodifiable) {
            details.parentId = String(parent.id);
            if (Number.isInteger(pending.index)) details.index = Math.max(0, Math.min(pending.index, parent.children.length));
        }
        // Exactly one create attempt. A failed write is not blindly retried elsewhere.
        const restored = await callBookmarkApi("create", details);
        clearBookmarkUndo();
        let savedPreferences = true;
        let partial = false;
        if (pending.children && restored?.id) {
            // The folder itself exists again, so undo is spent; a failed child is reported, never retried blindly.
            const idMap = new Map([[pending.folderId, String(restored.id)]]);
            try {
                await restoreBookmarkChildren(pending.children, String(restored.id), idMap);
            } catch (error) {
                console.error("Error restoring bookmark folder contents:", error);
                partial = true;
            }
            if (pending.favorites.length) {
                const favorites = getFavoriteIds();
                for (const [oldId, index] of pending.favorites) {
                    if (idMap.has(oldId)) favorites.splice(Math.min(index, favorites.length), 0, idMap.get(oldId));
                }
                savedPreferences = writeStoredArray(BOOKMARK_FAVORITES_KEY, favorites);
            }
        } else if (pending.favoriteIndex >= 0 && restored?.id) {
            const favorites = getFavoriteIds();
            favorites.splice(Math.min(pending.favoriteIndex, favorites.length), 0, String(restored.id));
            savedPreferences = writeStoredArray(BOOKMARK_FAVORITES_KEY, favorites);
        }
        if (partial) setBookmarkStatus("bookmarkFolderRestorePartial", {}, 5000);
        else if (savedPreferences) setBookmarkStatus("bookmarkRestored");
        await loadBookmarks();
        return true;
    } catch (error) {
        console.error("Error restoring bookmark:", error);
        bookmarkUndoMessage.textContent = bookmarkText("bookmarkRestoreError");
        setBookmarkStatus("bookmarkRestoreError", {}, 5000);
        return false;
    } finally {
        bookmarkUndoButton.disabled = false;
        bookmarkMutationPending = false;
    }
}

function clearBookmarkSearch() {
    bookmarkSearch.value = "";
    bookmarkSearchClearButton.hidden = true;
    renderBookmarks();
    bookmarkSearch.focus();
}

const bookmarkSortButtons = { title: sortAlphabetical, date: sortTimeAdded, manual: sortManual };

function updateSortButtons() {
    if (!bookmarkSortButtons[currentSortMethod]) currentSortMethod = "title";
    for (const [method, button] of Object.entries(bookmarkSortButtons)) {
        button.classList.toggle("active", method === currentSortMethod);
        button.setAttribute("aria-pressed", String(method === currentSortMethod));
    }
}

function bookmarkNavigationTargets() {
    return [...bookmarkList.querySelectorAll(".bookmark-item > a, .bookmark-folder-disclosure, .bookmark-recent-toggle")]
        .filter(element => element.getClientRects().length && !element.closest("[hidden]"));
}

function updateViewButtons() {
    const grid = bookmarkGridCheckbox.checked;
    bookmarkList.classList.toggle("grid-view", grid);
    bookmarkViewGrid.setAttribute("aria-pressed", String(grid));
    bookmarkViewList.setAttribute("aria-pressed", String(!grid));
}

function updateBookmarkUI(enabled) {
    bookmarksCheckbox.checked = enabled;
    bookmarkButton.style.display = enabled ? "flex" : "none";
    saveDisplayStatus("bookmarksDisplayStatus", enabled ? "flex" : "none");
    saveCheckboxState("bookmarksCheckboxState", bookmarksCheckbox);
    if (!enabled) closeBookmarkSidebar();
}

function trapBookmarkFocus(event) {
    if (event.key !== "Tab" || !bookmarkSidebar.classList.contains("open") || editBookmarkModal.open) return;
    const focusable = [...bookmarkSidebar.querySelectorAll("button:not([disabled]):not([hidden]), input:not([disabled]), summary, a[href]")]
        // Buttons inside a collapsed action menu still report boxes in Chromium; they cannot take focus.
        .filter(element => !element.closest("[hidden]") && !element.closest("details:not([open]) > :not(summary)") && element.getClientRects().length);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

bookmarkButton.addEventListener("click", toggleBookmarkSidebar);
bookmarkCloseButton.addEventListener("click", closeBookmarkSidebar);
bookmarkAddButton.addEventListener("click", () => openBookmarkEditor());
bookmarkUndoButton.addEventListener("click", undoBookmarkDelete);
bookmarkSearchClearButton.addEventListener("click", clearBookmarkSearch);
bookmarkSearch.addEventListener("input", () => {
    clearTimeout(bookmarkSearchTimer);
    bookmarkSearchClearButton.hidden = !bookmarkSearch.value;
    bookmarkSearchTimer = setTimeout(renderBookmarks, 120);
});
bookmarkViewGrid.addEventListener("click", () => {
    try { localStorage.setItem("myntBookmarkView", "grid"); } catch { /* the view still switches for this page */ }
    if (!bookmarkGridCheckbox.checked) bookmarkGridCheckbox.click();
});
bookmarkViewList.addEventListener("click", () => {
    try { localStorage.setItem("myntBookmarkView", "list"); } catch { /* the view still switches for this page */ }
    if (bookmarkGridCheckbox.checked) bookmarkGridCheckbox.click();
});
for (const [method, button] of Object.entries(bookmarkSortButtons)) {
    button.addEventListener("click", () => {
        currentSortMethod = method;
        try {
            localStorage.setItem("bookmarkSortMethod", currentSortMethod);
        } catch {
            setBookmarkStatus("bookmarkLocalSaveError", {}, 5000);
        }
        updateSortButtons();
        renderBookmarks();
    });
}
// Arrow keys walk the visible rows; Enter in the search box opens the first result.
bookmarkSearch.addEventListener("keydown", event => {
    if (event.isComposing) return;
    if (event.key === "ArrowDown") {
        const first = bookmarkNavigationTargets()[0];
        if (first) {
            event.preventDefault();
            first.focus();
        }
    } else if (event.key === "Enter" && bookmarkSearch.value.trim()) {
        event.preventDefault();
        clearTimeout(bookmarkSearchTimer);
        renderBookmarks();
        bookmarkList.querySelector?.(".bookmark-item > a[href]")?.click();
    }
});
bookmarkList.addEventListener("keydown", event => {
    if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
    const targets = bookmarkNavigationTargets();
    const index = targets.indexOf(event.target);
    if (index < 0) return;
    event.preventDefault();
    if (event.key === "ArrowUp" && index === 0) bookmarkSearch.focus();
    else targets[Math.max(0, Math.min(targets.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))].focus();
});

saveBookmarkChanges.addEventListener("click", saveBookmarkEditor);
cancelBookmarkEdit.addEventListener("click", closeBookmarkEditor);
editBookmarkModal.addEventListener("cancel", event => {
    event.preventDefault();
    closeBookmarkEditor();
});
editBookmarkName.addEventListener("keydown", event => {
    if (event.key === "Enter") {
        event.preventDefault();
        editBookmarkURL.focus();
    }
});
editBookmarkURL.addEventListener("keydown", event => {
    if (event.key === "Enter") {
        event.preventDefault();
        saveBookmarkEditor();
    }
});
editBookmarkURL.addEventListener("input", () => {
    bookmarkEditorError.textContent = "";
});

document.addEventListener("mynt:shortcut-feedback", event => {
    const key = {
        added: "bookmarkShortcutAdded",
        duplicate: "bookmarkShortcutExists",
        full: "bookmarkShortcutFull",
        invalid: "bookmarkShortcutInvalid",
        error: "bookmarkShortcutError"
    }[event.detail?.status];
    if (key) setBookmarkStatus(key, { title: event.detail?.name || event.detail?.url || "" });
});

document.addEventListener("click", event => {
    if (!bookmarkSidebar.classList.contains("open") || editBookmarkModal.open) return;
    if (document.getElementById("prompt-modal-container")?.style.display === "flex") return;
    // The confirm dialog hides itself before its button click bubbles here; that click is not an outside click.
    if (event.target.closest?.("#prompt-modal-container")) return;
    // Re-rendering the list detaches the clicked control; a detached target is not an outside click.
    if (event.target.isConnected === false) return;
    if (!bookmarkSidebar.contains(event.target) && !bookmarkButton.contains(event.target)) closeBookmarkSidebar();
});

bookmarkSidebar.addEventListener("keydown", event => {
    if (event.key === "Escape" && !event.isComposing && !editBookmarkModal.open) {
        event.preventDefault();
        event.stopPropagation();
        closeBookmarkSidebar();
    }
});

document.addEventListener("keydown", event => {
    trapBookmarkFocus(event);
    // A pending mutation means the delete confirmation owns Escape; cancelling it must not close the sidebar.
    if (event.key === "Escape" && bookmarkSidebar.classList.contains("open") && !editBookmarkModal.open && !bookmarkMutationPending) {
        event.preventDefault();
        closeBookmarkSidebar();
        return;
    }
    const menu = document.getElementById("menuBar");
    const menuOpen = menu && menu.style.display !== "none" && menu.style.display !== "";
    if (event.key === "ArrowRight" && !event.repeat && !menuOpen && bookmarksCheckbox.checked && !bookmarkMutationPending &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName) && !event.target.isContentEditable) {
        event.preventDefault();
        toggleBookmarkSidebar();
    }
});

// Lazy-loaded by lazy-loader.js after DOMContentLoaded, so run as soon as the DOM is ready.
(fn => (document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", fn) : fn()))(() => {
    bookmarksCheckbox.addEventListener("change", () => updateBookmarkUI(bookmarksCheckbox.checked));
    bookmarkGridCheckbox.addEventListener("change", () => {
        saveCheckboxState("bookmarkGridCheckboxState", bookmarkGridCheckbox);
        updateViewButtons();
    });
    loadCheckboxState("bookmarksCheckboxState", bookmarksCheckbox);
    loadDisplayStatus("bookmarksDisplayStatus", bookmarkButton);
    loadCheckboxState("bookmarkGridCheckboxState", bookmarkGridCheckbox);
    // The grid used to be switched on automatically and saved as if chosen; only a grid picked in
    // display options (myntBookmarkView) is kept. Re-checked on every load, so restores and failed writes settle.
    try {
        if (bookmarkGridCheckbox.checked && localStorage.getItem("myntBookmarkView") !== "grid") bookmarkGridCheckbox.click();
    } catch { /* Storage blocked: keep the current view. */ }
    if (bookmarksCheckbox.checked) bookmarkButton.style.display = "flex";
    updateSortButtons();
    updateViewButtons();

    const permissionAPI = getPermissionNamespace();
    for (const permissionEvent of [permissionAPI?.onAdded, permissionAPI?.onRemoved]) {
        permissionEvent?.addListener(change => {
            if (change?.permissions && !change.permissions.includes("bookmarks") && !change.permissions.includes("favicon")) return;
            if (bookmarkSidebar.classList.contains("open") && !bookmarkPermissionPending) refreshBookmarkAvailability();
        });
    }
});

// ------------------------ End of Bookmark System -----------------------------

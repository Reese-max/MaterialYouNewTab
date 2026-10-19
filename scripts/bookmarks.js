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

const BOOKMARK_FAVORITES_KEY = "myntBookmarkFavorites";
const BOOKMARK_FOLDERS_KEY = "myntBookmarkExpandedFolders";
const BOOKMARK_UNDO_MS = 7000;
let bookmarksAPI = null;
let bookmarkApiUsesPromises = false;
let bookmarkTree = [];
let recentBookmarks = [];
let bookmarkNodeMap = new Map();
let currentBookmarkId = null;
let currentSortMethod = localStorage.getItem("bookmarkSortMethod") || "title";
let bookmarkStatusTimer = null;
let bookmarkSearchTimer = null;
let bookmarkUndoTimer = null;
let pendingBookmarkUndo = null;

function bookmarkText(key, replacements = {}) {
    let value = translations[currentLanguage]?.[key] || translations.en?.[key] || key;
    for (const [name, replacement] of Object.entries(replacements)) {
        value = value.replace(`{${name}}`, replacement);
    }
    return value;
}

function readStoredArray(key) {
    try {
        const value = JSON.parse(localStorage.getItem(key) || "[]");
        return Array.isArray(value) ? value.map(String) : [];
    } catch {
        return [];
    }
}

function writeStoredArray(key, value) {
    localStorage.setItem(key, JSON.stringify([...new Set(value.map(String))]));
}

function getFavoriteIds() {
    return readStoredArray(BOOKMARK_FAVORITES_KEY);
}

function getExpandedFolderIds() {
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
    if (!bookmarksAPI?.[method]) return Promise.reject(new Error(`Bookmarks API method unavailable: ${method}`));
    if (bookmarkApiUsesPromises) return bookmarksAPI[method](...args);
    return new Promise((resolve, reject) => {
        bookmarksAPI[method](...args, result => {
            const error = globalThis.chrome?.runtime?.lastError;
            if (error) reject(new Error(error.message));
            else resolve(result);
        });
    });
}

function callPermissionApi(method, details) {
    const permissionAPI = getPermissionNamespace();
    if (!permissionAPI?.[method]) return Promise.resolve(false);
    if (globalThis.browser?.permissions === permissionAPI) return permissionAPI[method](details);
    return new Promise(resolve => permissionAPI[method](details, resolve));
}

function requiredBookmarkPermissions() {
    return { permissions: (isFirefox || isOpera) ? ["bookmarks"] : ["bookmarks", "favicon"] };
}

function configureStateButton(button, label, action) {
    button.hidden = !label;
    button.textContent = label || "";
    button.onclick = action || null;
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
    bookmarkState.dataset.state = kind;
    bookmarkStateTitle.textContent = bookmarkText(state[0]);
    bookmarkStateDescription.textContent = bookmarkText(state[1]);
    configureStateButton(bookmarkStatePrimary, state[2] ? bookmarkText(state[2]) : "", state[3]);
    configureStateButton(bookmarkStateSecondary, state[4] ? bookmarkText(state[4]) : "", state[5]);
    bookmarkState.hidden = false;
    bookmarkContent.hidden = true;
    bookmarkSearch.disabled = !["empty", "search-empty"].includes(kind);
    bookmarkAddButton.disabled = kind !== "empty";
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
    const granted = await callPermissionApi("request", requiredBookmarkPermissions());
    if (!granted) {
        renderBookmarkState("denied");
        bookmarkStatePrimary.focus();
        return false;
    }
    bookmarksAPI = getBookmarkNamespace();
    await loadBookmarks();
    bookmarkSearch.focus();
    return true;
}

async function refreshBookmarkAvailability() {
    renderBookmarkState("loading");
    bookmarksAPI = getBookmarkNamespace();
    if (!bookmarksAPI) {
        renderBookmarkState(["http:", "https:", "file:"].includes(location.protocol) ? "preview" : "unsupported");
        return;
    }
    if (!await callPermissionApi("contains", requiredBookmarkPermissions())) {
        renderBookmarkState("permission");
        return;
    }
    await loadBookmarks();
}

function openBookmarkSidebar() {
    if (bookmarkSidebar.classList.contains("open")) return;
    bookmarkSidebar.classList.add("open");
    bookmarkSidebar.removeAttribute("inert");
    bookmarkSidebar.setAttribute("aria-hidden", "false");
    bookmarkButton.classList.add("rotate");
    bookmarkButton.setAttribute("aria-expanded", "true");
    refreshBookmarkAvailability().then(() => {
        const target = bookmarkSearch.disabled ? bookmarkStatePrimary : bookmarkSearch;
        if (target && !target.hidden) target.focus();
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
    if (localStorage.getItem(BOOKMARK_FAVORITES_KEY) !== null) return;
    const count = Number.parseInt(localStorage.getItem("shortcutAmount") || "0", 10);
    const shortcutUrls = new Set();
    for (let index = 0; index < count; index += 1) {
        const url = bookmarkComparableUrl(localStorage.getItem(`shortcutURL${index}`));
        if (url) shortcutUrls.add(url);
    }
    const matches = allNodes
        .filter(node => node.url && shortcutUrls.has(bookmarkComparableUrl(node.url)))
        .slice(0, 6)
        .map(node => String(node.id));
    writeStoredArray(BOOKMARK_FAVORITES_KEY, matches);
}

function sortBookmarkNodes(nodes) {
    const sorted = [...nodes];
    if (currentSortMethod === "date") return sorted.sort((a, b) => (a.dateAdded || 0) - (b.dateAdded || 0));
    return sorted.sort((a, b) => (a.title || "").localeCompare(b.title || "", currentLanguage));
}

async function loadBookmarks() {
    if (!bookmarksAPI?.getTree) {
        renderBookmarkState("unsupported");
        return;
    }
    renderBookmarkState("loading");
    try {
        const [tree, recent] = await Promise.all([
            callBookmarkApi("getTree"),
            bookmarksAPI.getRecent ? callBookmarkApi("getRecent", 4).catch(() => []) : Promise.resolve([])
        ]);
        bookmarkTree = tree || [];
        recentBookmarks = (recent || []).filter(node => node.url).slice(0, 4);
        const allNodes = flattenBookmarkNodes(bookmarkTree);
        bookmarkNodeMap = new Map(allNodes.map(node => [String(node.id), node]));
        seedFavoritesFromShortcuts(allNodes);
        if (!allNodes.some(node => node.url)) {
            bookmarkList.replaceChildren();
            renderBookmarkState("empty");
            return;
        }
        renderBookmarks();
    } catch (error) {
        console.error("Error loading bookmarks:", error);
        renderBookmarkState("error");
    }
}

function renderBookmarks() {
    const query = bookmarkSearch.value.trim().toLocaleLowerCase(currentLanguage);
    bookmarkSearchClearButton.hidden = !query;
    bookmarkList.replaceChildren();
    if (query) {
        const matches = [...bookmarkNodeMap.values()].filter(node =>
            `${node.title || ""} ${node.url || ""}`.toLocaleLowerCase(currentLanguage).includes(query)
        );
        if (!matches.length) {
            renderBookmarkState("search-empty");
            return;
        }
        bookmarkList.append(createBookmarkSection("bookmarkSectionSearch", matches, "bookmarkSectionSearchEmpty"));
        showBookmarkContent();
        return;
    }
    const favorites = getFavoriteIds().map(id => bookmarkNodeMap.get(id)).filter(Boolean);
    const roots = bookmarkTree.flatMap(root => root.children || []);
    bookmarkList.append(
        createBookmarkSection("bookmarkSectionFavorites", favorites, "bookmarkSectionFavoritesEmpty", true),
        createBookmarkSection("bookmarkSectionRecent", recentBookmarks, "bookmarkSectionRecentEmpty", true),
        createBookmarkSection("bookmarkSectionFolders", sortBookmarkNodes(roots), "bookmarkSectionFoldersEmpty", true)
    );
    showBookmarkContent();
}

function createBookmarkSection(titleKey, nodes, emptyKey, keepOrder = false) {
    const section = document.createElement("li");
    section.className = "bookmark-section";
    const header = document.createElement("div");
    header.className = "bookmark-section-header";
    const heading = document.createElement("h3");
    heading.textContent = bookmarkText(titleKey);
    const count = document.createElement("span");
    count.textContent = bookmarkText("bookmarkSectionCount", { count: String(nodes.length) });
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
    for (const node of keepOrder ? nodes : sortBookmarkNodes(nodes)) list.append(createBookmarkNode(node));
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
    title.textContent = node.title || bookmarkText("bookmarkUntitledFolder");
    const chevron = document.createElement("span");
    chevron.className = "bookmark-folder-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "›";
    disclosure.append(title, chevron);
    row.append(disclosure, createBookmarkActions(node));
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
        const hostname = new URL(pageUrl).hostname;
        const googleFallback = () => {
            image.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`;
            image.onerror = offlineFallback;
        };
        if (!isFirefox && !isOpera && globalThis.chrome?.runtime?.id) {
            image.src = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=32`;
            image.onerror = googleFallback;
        } else {
            googleFallback();
        }
    } catch {
        offlineFallback();
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
    link.href = node.url;
    const favicon = document.createElement("img");
    favicon.className = "favicon";
    favicon.alt = "";
    setBookmarkFavicon(favicon, node.url);
    const copy = document.createElement("span");
    copy.className = "bookmark-item-copy";
    const title = document.createElement("strong");
    title.textContent = node.title || safeHostname(node.url);
    const url = document.createElement("small");
    url.textContent = safeHostname(node.url);
    copy.append(title, url);
    link.append(favicon, copy);
    item.append(link, createBookmarkActions(node));
    return item;
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
        button.closest("details").open = false;
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
        return ["javascript:", "data:", "vbscript:"].includes(parsed.protocol) ? null : parsed.href;
    } catch {
        return null;
    }
}

function openBookmarkEditor(node = null) {
    currentBookmarkId = node?.id ? String(node.id) : null;
    editBookmarkHeading.textContent = bookmarkText(node ? "editBookmarkHeading" : "addBookmarkHeading");
    editBookmarkName.value = node?.title || "";
    editBookmarkURL.value = node?.url || "";
    bookmarkEditorError.textContent = "";
    saveBookmarkChanges.disabled = false;
    if (node?.url) setBookmarkFavicon(editBookmarkFavicon, node.url);
    else editBookmarkFavicon.src = "./svgs/offline.svg";
    editBookmarkModal.showModal();
    editBookmarkName.focus();
}

function closeBookmarkEditor() {
    currentBookmarkId = null;
    if (editBookmarkModal.open) editBookmarkModal.close();
    bookmarkAddButton.focus();
}

async function saveBookmarkEditor() {
    const title = editBookmarkName.value.trim();
    const url = normalizeBookmarkUrl(editBookmarkURL.value);
    if (!url) {
        bookmarkEditorError.textContent = bookmarkText("bookmarkInvalidUrl");
        editBookmarkURL.focus();
        return;
    }
    saveBookmarkChanges.disabled = true;
    bookmarkEditorError.textContent = "";
    try {
        if (currentBookmarkId) {
            await callBookmarkApi("update", currentBookmarkId, { title, url });
            setBookmarkStatus("bookmarkUpdated");
        } else {
            await callBookmarkApi("create", { title, url });
            setBookmarkStatus("bookmarkCreated");
        }
        closeBookmarkEditor();
        await loadBookmarks();
    } catch (error) {
        console.error("Error saving bookmark:", error);
        bookmarkEditorError.textContent = bookmarkText("bookmarkSaveError");
        saveBookmarkChanges.disabled = false;
    }
}

async function deleteBookmark(node) {
    const message = bookmarkText("deleteBookmark", { title: node.title || node.url });
    if (!await confirmPrompt(message)) return;
    const favorites = getFavoriteIds();
    const favoriteIndex = favorites.indexOf(String(node.id));
    try {
        await callBookmarkApi("remove", node.id);
        if (favoriteIndex >= 0) {
            favorites.splice(favoriteIndex, 1);
            writeStoredArray(BOOKMARK_FAVORITES_KEY, favorites);
        }
        pendingBookmarkUndo = {
            title: node.title || "",
            url: node.url,
            parentId: node.parentId,
            index: node.index,
            favoriteIndex
        };
        showBookmarkUndo();
        await loadBookmarks();
    } catch (error) {
        console.error("Error removing bookmark:", error);
        setBookmarkStatus("bookmarkDeleteError");
    }
}

function showBookmarkUndo() {
    clearTimeout(bookmarkUndoTimer);
    bookmarkUndoMessage.textContent = bookmarkText("bookmarkDeletedWithUndo");
    bookmarkUndoBar.hidden = false;
    bookmarkUndoTimer = setTimeout(clearBookmarkUndo, BOOKMARK_UNDO_MS);
}

function clearBookmarkUndo() {
    clearTimeout(bookmarkUndoTimer);
    bookmarkUndoBar.hidden = true;
    pendingBookmarkUndo = null;
}

async function undoBookmarkDelete() {
    const pending = pendingBookmarkUndo;
    if (!pending) return;
    clearBookmarkUndo();
    try {
        const details = { title: pending.title, url: pending.url };
        if (pending.parentId) details.parentId = pending.parentId;
        if (Number.isInteger(pending.index)) details.index = pending.index;
        let restored;
        try {
            restored = await callBookmarkApi("create", details);
        } catch {
            restored = await callBookmarkApi("create", { title: pending.title, url: pending.url });
        }
        if (pending.favoriteIndex >= 0 && restored?.id) {
            const favorites = getFavoriteIds();
            favorites.splice(Math.min(pending.favoriteIndex, favorites.length), 0, String(restored.id));
            writeStoredArray(BOOKMARK_FAVORITES_KEY, favorites);
        }
        setBookmarkStatus("bookmarkRestored");
        await loadBookmarks();
    } catch (error) {
        console.error("Error restoring bookmark:", error);
        setBookmarkStatus("bookmarkRestoreError", {}, 5000);
    }
}

function clearBookmarkSearch() {
    bookmarkSearch.value = "";
    bookmarkSearchClearButton.hidden = true;
    renderBookmarks();
    bookmarkSearch.focus();
}

function updateSortButtons() {
    const alphabetical = currentSortMethod === "title";
    sortAlphabetical.classList.toggle("active", alphabetical);
    sortTimeAdded.classList.toggle("active", !alphabetical);
    sortAlphabetical.setAttribute("aria-pressed", String(alphabetical));
    sortTimeAdded.setAttribute("aria-pressed", String(!alphabetical));
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
        .filter(element => !element.closest("[hidden]") && element.getClientRects().length);
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
    if (!bookmarkGridCheckbox.checked) bookmarkGridCheckbox.click();
});
bookmarkViewList.addEventListener("click", () => {
    if (bookmarkGridCheckbox.checked) bookmarkGridCheckbox.click();
});
sortAlphabetical.addEventListener("click", () => {
    currentSortMethod = "title";
    localStorage.setItem("bookmarkSortMethod", currentSortMethod);
    updateSortButtons();
    renderBookmarks();
});
sortTimeAdded.addEventListener("click", () => {
    currentSortMethod = "date";
    localStorage.setItem("bookmarkSortMethod", currentSortMethod);
    updateSortButtons();
    renderBookmarks();
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
    if (!bookmarkSidebar.contains(event.target) && !bookmarkButton.contains(event.target)) closeBookmarkSidebar();
});

document.addEventListener("keydown", event => {
    trapBookmarkFocus(event);
    if (event.key === "Escape" && bookmarkSidebar.classList.contains("open") && !editBookmarkModal.open) {
        event.preventDefault();
        closeBookmarkSidebar();
        return;
    }
    const menu = document.getElementById("menuBar");
    const menuOpen = menu && menu.style.display !== "none" && menu.style.display !== "";
    if (event.key === "ArrowRight" && !event.repeat && !menuOpen && bookmarksCheckbox.checked &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName) && !event.target.isContentEditable) {
        event.preventDefault();
        toggleBookmarkSidebar();
    }
});

document.addEventListener("DOMContentLoaded", () => {
    bookmarksCheckbox.addEventListener("change", () => updateBookmarkUI(bookmarksCheckbox.checked));
    bookmarkGridCheckbox.addEventListener("change", () => {
        saveCheckboxState("bookmarkGridCheckboxState", bookmarkGridCheckbox);
        updateViewButtons();
    });
    loadCheckboxState("bookmarksCheckboxState", bookmarksCheckbox);
    loadDisplayStatus("bookmarksDisplayStatus", bookmarkButton);
    loadCheckboxState("bookmarkGridCheckboxState", bookmarkGridCheckbox);
    if (bookmarksCheckbox.checked) bookmarkButton.style.display = "flex";
    updateSortButtons();
    updateViewButtons();

    const permissionAPI = getPermissionNamespace();
    for (const permissionEvent of [permissionAPI?.onAdded, permissionAPI?.onRemoved]) {
        permissionEvent?.addListener(() => {
            if (bookmarkSidebar.classList.contains("open")) refreshBookmarkAvailability();
        });
    }
});

// ------------------------ End of Bookmark System -----------------------------

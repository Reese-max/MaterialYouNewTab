/* Isolated DOM/localStorage mocks for the shortcut settings editor.
 * No browser, host or user data; storage is in-memory only.
 */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = process.argv[2] || path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const adapter = require(path.join(root, "scripts/local-mcp-data.js"));

function matchCompound(node, part) {
    let notSel = null;
    part = part.replace(/:not\(([^)]+)\)/gu, (_, inner) => { notSel = inner; return ""; });
    const match = part.match(/^([a-zA-Z][\w-]*)?((?:\.[\w-]+)*)$/u);
    if (!match) return false;
    const [, tag, classes] = match;
    if (tag && node.tagName !== tag.toUpperCase()) return false;
    if (classes && !classes.split(".").filter(Boolean).every(name => node.classList.contains(name))) return false;
    if (notSel && matchCompound(node, notSel)) return false;
    return true;
}
function matchSimple(node, selector) {
    const parts = selector.trim().split(/\s+/u);
    if (!matchCompound(node, parts[parts.length - 1])) return false;
    let ancestor = node.parentElement;
    for (let i = parts.length - 2; i >= 0; i--) {
        while (ancestor && !matchCompound(ancestor, parts[i])) ancestor = ancestor.parentElement;
        if (!ancestor) return false;
        ancestor = ancestor.parentElement;
    }
    return true;
}
const matchSelector = (node, selector) => selector.split(",").some(part => matchSimple(node, part));

function decodeHtml(text) {
    return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

// createShortcutEntry assigns innerHTML; rebuild the queryable child tree it declares.
function buildEntryChildren(entry, html) {
    const doc = entry.ownerDocument;
    const field = cls => {
        const match = html.match(new RegExp(`class="${cls}"[^>]*value="([^"]*)"`, "u"));
        return match ? decodeHtml(match[1]) : "";
    };
    const grip = doc.createElement("div"); grip.className = "grip-container";
    const group = doc.createElement("div"); group.className = "shortcutInputGroup";
    const nameInput = doc.createElement("input"); nameInput.className = "shortcutName"; nameInput.value = field("shortcutName");
    const urlRow = doc.createElement("div"); urlRow.className = "shortcutInputRow";
    const urlInput = doc.createElement("input"); urlInput.className = "URL"; urlInput.value = field("URL");
    const describedBy = html.match(/class="URL"[^>]*aria-describedby="([^"]*)"/u);
    if (describedBy) urlInput.setAttribute("aria-describedby", describedBy[1]);
    urlRow.appendChild(urlInput);
    const message = doc.createElement("div"); message.className = "shortcutFieldMessage shortcutUrlMessage";
    const messageId = html.match(/class="shortcutFieldMessage shortcutUrlMessage" id="([^"]*)"/u);
    if (messageId) { message.id = messageId[1]; message.setAttribute("id", messageId[1]); }
    message.setAttribute("role", "status"); message.setAttribute("aria-live", "polite"); message.hidden = true;
    const iconRow = doc.createElement("div"); iconRow.className = "shortcutInputRow";
    const iconInput = doc.createElement("input"); iconInput.className = "iconURL"; iconInput.value = field("iconURL");
    iconRow.appendChild(iconInput);
    group.append(nameInput, urlRow, message, iconRow);
    const actions = doc.createElement("div"); actions.className = "shortcutActions";
    const upload = doc.createElement("button"); upload.className = "uploadCustomIconButton"; upload.type = "button";
    const file = doc.createElement("input"); file.className = "iconFileInput"; file.type = "file"; file.hidden = true;
    const del = doc.createElement("div"); del.className = "shortcutDelete";
    const delButton = doc.createElement("button");
    const delClasses = html.match(/class="shortcutDelete">\s*<button class="([^"]*)"/u);
    delButton.className = delClasses ? delClasses[1] : "";
    del.appendChild(delButton);
    actions.append(upload, file, del);
    entry.append(grip, group, actions);
}

class Element {
    constructor(tag, document) {
        this.tagName = tag.toUpperCase(); this.ownerDocument = document;
        this.children = []; this.parentElement = null; this.listeners = new Map();
        this.attributes = {}; this.style = {}; this.dataset = {};
        this.id = ""; this.value = ""; this.textContent = ""; this.type = "";
        this.checked = false; this.disabled = false; this.hidden = false;
        this.draggable = false; this.tabIndex = 0;
        const classes = new Set();
        this.classList = {
            add: (...names) => names.forEach(name => classes.add(name)),
            remove: (...names) => names.forEach(name => classes.delete(name)),
            contains: name => classes.has(name),
            toggle: (name, on = !classes.has(name)) => { on ? classes.add(name) : classes.delete(name); return on; }
        };
        let markup = "";
        Object.defineProperty(this, "className", {
            get: () => [...classes].join(" "),
            set: value => { classes.clear(); String(value).split(/\s+/u).filter(Boolean).forEach(name => classes.add(name)); }
        });
        Object.defineProperty(this, "innerHTML", {
            get: () => markup,
            set: value => {
                markup = String(value);
                this.children = [];
                if (markup && this.classList.contains("shortcutSettingsEntry")) buildEntryChildren(this, markup);
            }
        });
    }
    get nextSibling() { const p = this.parentElement; return p ? p.children[p.children.indexOf(this) + 1] || null : null; }
    get previousSibling() { const p = this.parentElement; return p ? p.children[p.children.indexOf(this) - 1] || null : null; }
    get lastElementChild() { return this.children[this.children.length - 1] || null; }
    appendChild(node) { if (node.parentElement) node.parentElement.removeChild(node); node.parentElement = this; this.children.push(node); return node; }
    append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
    insertBefore(node, ref) {
        if (!ref) return this.appendChild(node);
        const index = this.children.indexOf(ref);
        if (index < 0) return this.appendChild(node);
        if (node.parentElement) node.parentElement.removeChild(node);
        node.parentElement = this; this.children.splice(index, 0, node); return node;
    }
    removeChild(node) { const index = this.children.indexOf(node); if (index >= 0) { this.children.splice(index, 1); node.parentElement = null; } return node; }
    replaceChild(node, old) {
        const index = this.children.indexOf(old);
        if (index < 0) return this.appendChild(node);
        if (node.parentElement) node.parentElement.removeChild(node);
        this.children[index] = node; node.parentElement = this; old.parentElement = null; return old;
    }
    replaceChildren(...nodes) { this.children.forEach(node => { node.parentElement = null; }); this.children = []; this.append(...nodes); }
    remove() { this.parentElement?.removeChild(this); }
    all() { return this.children.flatMap(node => [node, ...node.all()]); }
    contains(node) { return node === this || this.all().includes(node); }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return Object.hasOwn(this.attributes, key) ? this.attributes[key] : null; }
    removeAttribute(key) { delete this.attributes[key]; }
    addEventListener(type, fn) { (this.listeners.get(type) || this.listeners.set(type, []).get(type)).push(fn); }
    removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter(listener => listener !== fn)); }
    emit(type, extra = {}) {
        const event = { type, target: this, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...extra };
        for (const fn of this.listeners.get(type) || []) fn.call(this, event);
        return event;
    }
    dispatchEvent(event) { this.emit(event.type, event); return !event.defaultPrevented; }
    click() { return this.emit("click"); }
    focus() { this.ownerDocument.activeElement = this; }
    blur() { this.emit("blur"); }
    select() {}
    scrollIntoView() {}
    getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
    matches(selector) { return matchSelector(this, selector); }
    closest(selector) { for (let node = this; node; node = node.parentElement) if (matchSelector(node, selector)) return node; return null; }
    querySelector(selector) { return this.all().find(node => matchSelector(node, selector)) || null; }
    querySelectorAll(selector) { return this.all().filter(node => matchSelector(node, selector)); }
}

function createDocument() {
    const listeners = new Map();
    const document = {
        activeElement: null, listeners,
        addEventListener(type, fn) { (listeners.get(type) || listeners.set(type, []).get(type)).push(fn); },
        emit(type, extra = {}) {
            const event = { type, target: document, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {}, ...extra };
            for (const fn of listeners.get(type) || []) fn.call(document, event);
            return event;
        },
        dispatchEvent(event) { return document.emit(event.type, event); },
    };
    document.documentElement = new Element("html", document);
    document.body = new Element("body", document);
    document.documentElement.appendChild(document.body);
    document.activeElement = document.body;
    document.createElement = tag => new Element(tag, document);
    document.createElementNS = (_ns, tag) => new Element(tag, document);
    document.createDocumentFragment = () => new Element("fragment", document);
    document.getElementById = id => document.documentElement.all().find(node => node.id === id) || null;
    document.querySelector = selector => document.documentElement.querySelector(selector);
    document.querySelectorAll = selector => document.documentElement.querySelectorAll(selector);
    return document;
}

function createStorage(initial = {}) {
    const data = new Map(Object.entries(initial));
    let failures = [];
    let setCalls = 0;
    return {
        data,
        failNext(error, count = 1, skip = 0) { failures = [...Array(skip).fill(null), ...Array(count).fill(error)]; },
        getItem: key => (data.has(key) ? data.get(key) : null),
        setItem(key, value) { setCalls++; if (failures.length) { const error = failures.shift(); if (error) throw error; } data.set(key, String(value)); },
        removeItem(key) { data.delete(key); },
    };
}

function loadTranslations() {
    const locale = code => vm.runInContext(`${read(`locales/${code}.js`)}\n;${code}`, vm.createContext({}));
    const en = locale("en"), zhTW = locale("zh_TW");
    return { en, zh_TW: { ...en, ...zhTW } };
}

function seed(count, overrides = {}) {
    const names = ["Alpha", "Beta", "Gamma", "Delta"];
    const hosts = ["alpha.example", "beta.example", "gamma.example", "delta.example"];
    const storage = { selectedLanguage: "zh_TW", shortcutAmount: String(count) };
    for (let i = 0; i < count; i++) {
        storage[`shortcutName${i}`] = names[i];
        storage[`shortcutURL${i}`] = `https://${hosts[i]}/`;
        storage[`shortcutIcon${i}`] = `icon-${i}`;
    }
    return { ...storage, ...overrides };
}

const IDS = ["shortcuts-section", "shortcutsCheckbox", "shortcutEditField", "adaptiveIconField",
    "adaptiveIconToggle", "shortcutList", "shortcutsContainer", "newShortcutButton", "resetButton",
    "prompt-modal-container"];

function harness({ language = "zh_TW", storage: initial = {} } = {}) {
    const document = createDocument();
    const byId = new Map();
    for (const id of IDS) {
        const tag = /Checkbox|Toggle/u.test(id) ? "input" : /Button|button/u.test(id) ? "button" : "div";
        const node = document.createElement(tag);
        node.id = id; byId.set(id, node);
        if (id === "shortcutList") {
            const panel = document.createElement("div");
            document.body.appendChild(panel);
            panel.appendChild(node);
        } else {
            document.body.appendChild(node);
        }
    }
    const storage = createStorage(initial);
    const alerts = [];
    const windowListeners = new Map();
    const context = {
        document, URL, Intl, TextDecoder, Uint8Array, atob, console,
        localStorage: storage,
        currentLanguage: language, translations: loadTranslations(),
        setTimeout, clearTimeout, requestAnimationFrame: () => 0,
        CustomEvent: class { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } },
        alertPrompt: message => alerts.push(String(message)),
        confirmPrompt: async () => true,
        localizeNumbers: value => String(value),
        loadCheckboxState() {}, saveCheckboxState() {}, loadActiveStatus() {}, saveActiveStatus() {},
        loadDisplayStatus() {}, saveDisplayStatus() {},
        location: { href: "", protocol: "chrome-extension:" },
        MyntMcpData: adapter,
        addEventListener(type, fn) { (windowListeners.get(type) || windowListeners.set(type, []).get(type)).push(fn); },
        removeEventListener() {},
    };
    vm.createContext(context);
    context.window = context;
    vm.runInContext(read("scripts/storage-sync.js"), context);
    vm.runInContext(read("scripts/local-recovery-controls.js"), context);
    vm.runInContext(read("scripts/quicklink-icons.js"), context);
    vm.runInContext(read("scripts/shortcuts.js"), context, { filename: "scripts/shortcuts.js" });
    document.emit("DOMContentLoaded");
    return {
        document, storage, alerts, context,
        el: id => byId.get(id),
        entries: () => document.querySelectorAll(".shortcutSettingsEntry"),
        recoveryRow: () => byId.get("shortcutList").parentElement.querySelector(".myntRecoveryControl"),
    };
}

// --- Test 1: UI delete writes a valid recovery record and later items shift down.
{
    const h = harness({ storage: seed(3) });
    assert.equal(h.entries().length, 3);
    assert.equal(h.recoveryRow().hidden, true, "No recovery record yet, Undo stays hidden");
    h.entries()[0].querySelector(".shortcutDelete button").emit("click");

    assert.equal(h.storage.getItem("shortcutAmount"), "2");
    assert.equal(h.storage.getItem("shortcutName0"), "Beta");
    assert.equal(h.storage.getItem("shortcutURL0"), "https://beta.example/");
    assert.equal(h.storage.getItem("shortcutIcon0"), "icon-1");
    assert.equal(h.storage.getItem("shortcutName1"), "Gamma");
    assert.equal(h.storage.getItem("shortcutURL2"), null);
    assert.equal(h.storage.getItem("shortcutName2"), null);
    assert.equal(h.storage.getItem("shortcutIcon2"), null);

    const record = adapter.validateShortcutRecovery(h.storage.getItem("myntShortcutRecoveryV1"));
    assert.deepEqual(record, {
        version: 1, index: 0,
        item: { name: "Alpha", url: "https://alpha.example/", icon: "icon-0" }
    });

    const entries = h.entries();
    assert.equal(entries.length, 2, "Editor DOM rebuilt without the deleted row");
    assert.deepEqual(entries.map(e => e._index), [0, 1]);
    assert.equal(entries[0].querySelector("input.URL").value, "https://beta.example/");

    const row = h.recoveryRow();
    const undoButton = row.querySelector(".myntRecoveryUndo");
    assert.equal(row.hidden, false, "Undo control appears after a UI delete");
    assert.equal(undoButton.hidden, false);
    assert.equal(undoButton.textContent, "復原捷徑刪除");
    assert.equal(undoButton.getAttribute("aria-label"), "復原捷徑刪除");
}

// --- Test 2: a throwing localStorage.setItem leaves storage and DOM unchanged.
{
    const h = harness({ storage: seed(3) });
    const before = Object.fromEntries(h.storage.data);
    const quota = new Error("simulated quota failure"); quota.name = "QuotaExceededError";
    // Let the rewritten shortcut order persist, then fail the recovery record write.
    h.storage.failNext(quota, 1, 7);
    h.entries()[1].querySelector(".shortcutDelete button").emit("click");

    assert.deepEqual(Object.fromEntries(h.storage.data), before, "Failed delete must restore every storage key");
    assert.equal(h.entries().length, 3, "Failed delete leaves the editor DOM unchanged");
    assert.deepEqual(h.entries().map(e => e._index), [0, 1, 2]);
    assert.equal(h.alerts.length, 1, "Quota failure surfaces the quota message once");
    assert.equal(h.alerts[0], "瀏覽器儲存空間不足，無法儲存此圖示。");
    assert.equal(h.recoveryRow().hidden, true, "No recovery record was committed");
}

// --- Test 3: the last remaining shortcut can be deleted; a stored "0" survives reload.
{
    const h = harness({ storage: seed(1) });
    const button = h.entries()[0].querySelector(".shortcutDelete button");
    assert(!button.classList.contains("inactive"), "The last shortcut stays deletable");
    button.emit("click");
    assert.equal(h.storage.getItem("shortcutAmount"), "0");
    assert.equal(h.storage.getItem("shortcutName0"), null);
    assert.equal(h.storage.getItem("shortcutURL0"), null);
    assert.equal(h.storage.getItem("shortcutIcon0"), null);
    assert.equal(adapter.validateShortcutRecovery(h.storage.getItem("myntShortcutRecoveryV1")).item.name, "Alpha");
    assert.equal(h.entries().length, 0);
    assert.equal(adapter.validateBackupStorage(Object.fromEntries(h.storage.data)), true, "A zero-shortcut backup validates");

    const reloaded = harness({ storage: { selectedLanguage: "zh_TW", shortcutAmount: "0" } });
    assert.equal(reloaded.entries().length, 0, "Stored 0 does not revive the presets");
    assert.equal(harness().entries().length, 6, "Only a missing amount falls back to the presets");
    for (const [corrupt, expected] of [["abc", 0], ["-3", 0], ["999", 50]]) {
        assert.equal(harness({ storage: { shortcutAmount: corrupt } }).entries().length, expected, `Corrupt amount ${corrupt} is clamped`);
    }
    const cleared = harness({ storage: seed(2, { shortcutName0: "" }) });
    assert.equal(cleared.entries()[0].querySelector(".shortcutName").value, "", "A deliberately emptied name stays empty");
}

// --- Test 4: invalid URL on blur is not saved; field restores and flags invalid.
{
    const h = harness({ storage: seed(3) });
    const entry = h.entries()[0];
    const urlInput = entry.querySelector("input.URL");
    const message = entry.querySelector(".shortcutUrlMessage");
    assert.equal(urlInput.getAttribute("aria-describedby"), message.id);
    assert.equal(message.getAttribute("aria-live"), "polite");

    urlInput.value = "javascript:alert(1)";
    urlInput.emit("blur");
    assert.equal(h.storage.getItem("shortcutURL0"), "https://alpha.example/", "Invalid URL is never persisted");
    assert.equal(urlInput.value, "https://alpha.example/", "Field restores the last saved URL");
    assert.equal(urlInput.getAttribute("aria-invalid"), "true");
    assert.equal(message.hidden, false);
    assert.equal(message.textContent, "網址無效，已還原為上次儲存的網址。");

    urlInput.value = "   ";
    urlInput.emit("blur");
    assert.equal(h.storage.getItem("shortcutURL0"), "https://alpha.example/", "Blank input is also rejected");

    urlInput.value = "https://delta.example/";
    urlInput.emit("blur");
    assert.equal(h.storage.getItem("shortcutURL0"), "https://delta.example/", "Next valid input saves normally");
    assert.equal(urlInput.getAttribute("aria-invalid"), null, "Valid save clears the invalid flag");
    assert.equal(message.hidden, true);
    assert.equal(message.textContent, "");
}

// --- Test 5: duplicate URL is still saved but surfaces a non-blocking note.
{
    const h = harness({ storage: seed(3) });
    const entry = h.entries()[1];
    const urlInput = entry.querySelector("input.URL");
    urlInput.value = "alpha.example";
    urlInput.emit("blur");
    assert.equal(h.storage.getItem("shortcutURL1"), "alpha.example", "Duplicate URL is still saved");
    assert.equal(urlInput.getAttribute("aria-invalid"), null);
    const message = entry.querySelector(".shortcutUrlMessage");
    assert.equal(message.hidden, false);
    assert.equal(message.textContent, "這個網址已經在其他捷徑中。");

    urlInput.value = "https://beta.example/";
    urlInput.emit("blur");
    assert.equal(message.hidden, true, "Unique URL clears the duplicate note");
}

// --- Test 6: a host with a space is invalid; spaces in the path or query stay valid.
{
    const { myntNormalizeShortcutUrl } = require(path.join(root, "scripts/shortcuts.js"));
    assert.equal(myntNormalizeShortcutUrl("not a url"), null);
    assert.equal(myntNormalizeShortcutUrl("example.com/a b?q=c d"), "https://example.com/a%20b?q=c%20d");
}

// --- Test 7: "+" adds an unsaved draft; it is stored only once it has a valid URL.
{
    const h = harness({ language: "en", storage: seed(2, { selectedLanguage: "en" }) });
    const before = Object.fromEntries(h.storage.data);
    const drafts = () => h.entries().filter(entry => entry.classList.contains("draft"));
    h.el("newShortcutButton").click();
    h.el("newShortcutButton").click();
    assert.equal(drafts().length, 1, "A second + reuses the draft");
    const draft = drafts()[0], urlInput = draft.querySelector("input.URL"), message = draft.querySelector(".shortcutUrlMessage");
    assert.equal(draft.draggable, false, "Only the grip starts a row drag");
    assert.equal(urlInput.value, "", "No default URL");
    assert.equal(draft.querySelector(".shortcutName").value, "New Shortcut", "Default name is localized");

    urlInput.emit("blur");
    assert.equal(message.hidden, true, "A blank draft is not an error");
    urlInput.value = "not a url"; urlInput.emit("blur");
    assert.equal(urlInput.value, ""); assert.equal(message.textContent, "Enter a valid web address, such as example.com.");
    draft.querySelector(".iconURL").value = "icon-draft"; draft.querySelector(".shortcutName").emit("blur");
    assert.deepEqual(Object.fromEntries(h.storage.data), before, "Nothing is stored for an unfinished draft");
    assert.equal(h.el("shortcutsContainer").children.length, 2, "Nothing is rendered for an unfinished draft");

    h.entries()[0].querySelector(".shortcutDelete button").emit("click");
    assert.equal(drafts()[0], draft, "Deleting a saved row keeps the draft");
    urlInput.value = "example.org"; urlInput.emit("blur");
    assert.equal(drafts().length, 0);
    assert.equal(h.storage.getItem("shortcutAmount"), "2");
    assert.equal(h.storage.getItem("shortcutURL1"), "example.org");
    assert.equal(h.storage.getItem("shortcutIcon1"), "icon-draft", "The draft keeps its icon");
    assert.equal(h.el("shortcutsContainer").children.length, 2);

    h.el("newShortcutButton").click();
    drafts()[0].querySelector(".shortcutDelete button").emit("click");
    assert.equal(h.entries().length, 2, "Trash on a draft just removes it");
    assert.equal(h.storage.getItem("shortcutAmount"), "2");
}

console.log("SHORTCUT_EDITING_OK");

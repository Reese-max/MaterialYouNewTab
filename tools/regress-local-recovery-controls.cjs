/* Isolated browser-control and backup fixtures. No browser, host or user data. */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");
const root = process.argv[2] || process.cwd();
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const adapter = require(path.join(root, "scripts/local-mcp-data.js"));
const { createEngine } = require(path.join(root, "scripts/local-mcp-bridge.js"));
const todo = { version: 1, index: 0, item: { id: "trecovery", title: "私人待辦", status: "completed", pinned: true } };
const shortcut = { version: 1, index: 0, item: { name: "Private shortcut", url: "https://example.org/?private=fixture#fragment", icon: "data:image/png;base64,UFJJVkFURS1JQ09O" } };
const habit = { version: 1, index: 2, item: { id: "hfixture", name: "Read daily", source: null, doneDates: ["2024-02-29", "2026-10-24"] } };
const keyFor = domain => ({ todos: "myntTodoRecoveryV1", shortcuts: "myntShortcutRecoveryV1", habits: "myntHabitRecoveryV1" })[domain];
function storageFixture(initial = {}) {
    const storage = Object.assign(Object.create(null), initial), writes = [];
    Object.defineProperties(storage, {
        getItem: { value: key => Object.hasOwn(storage, key) ? storage[key] : null },
        setItem: { value: (key, value) => { writes.push(key); storage[key] = String(value); } },
        removeItem: { value: key => { writes.push(key); delete storage[key]; } }
    });
    return { storage, writes };
}
function eventTarget() {
    const events = {};
    return { events, addEventListener(type, callback) { (events[type] ||= []).push(callback); },
        async emit(type, value = {}) { for (const callback of events[type] || []) await callback(value); } };
}
function uiFixture(domain, recovery, language = "en") {
    const initial = { selectedLanguage: language, todoList: "{}", myntHabits: "[]", shortcutAmount: "1", shortcutName0: "Existing", shortcutURL0: "https://example.com/", shortcutIcon0: "" };
    if (recovery !== undefined) initial[keyFor(domain)] = typeof recovery === "string" ? recovery : JSON.stringify(recovery);
    const { storage, writes } = storageFixture(initial), timers = new Map();
    const document = Object.assign(eventTarget(), { activeElement: null });
    function element(tagName = "div") {
        return Object.assign(eventTarget(), {
            tagName: tagName.toUpperCase(), children: [], attributes: {}, hidden: false, textContent: "",
            setAttribute(key, value) { this.attributes[key] = value; },
            append(...nodes) { this.children.push(...nodes); },
            insertBefore(node, before) { const index = this.children.indexOf(before); this.children.splice(index < 0 ? this.children.length : index, 0, node); },
            focus() { document.activeElement = this; }
        });
    }
    document.createElement = element;
    const window = eventTarget();
    const context = vm.createContext({ ...window, document, localStorage: storage, MyntMcpData: adapter,
        setTimeout(fn) { const id = timers.size + 1; timers.set(id, fn); return id; }, clearTimeout(id) { timers.delete(id); } });
    vm.runInContext(read("scripts/local-recovery-controls.js"), context);
    const container = element(), focusTarget = element("input"), before = element("ul");
    container.append(before);
    const control = context.MyntRecoveryControls.create({ domain, container, before, focusTarget });
    const row = container.children[0], [button, status] = row.children;
    let calls = 0, result;
    const engine = createEngine({ storage, adapters: [adapter], refresh(_, changes) {
        for (const change of changes) for (const listener of window.events.storage || []) listener({ key: change.key });
    } });
    context.myntLocalRecovery = { async undo(actualDomain) {
        calls++; assert.equal(actualDomain, domain);
        if (result) return typeof result === "function" ? result() : result;
        const options = { storage, crypto: webcrypto, commit: engine.commit };
        const current = await adapter.execute(`mynt_${domain}_get`, {}, options);
        if (!current.ok) return current;
        return adapter.execute(`mynt_${domain}_mutate`, { operation: "undo", expectedRevision: current.revision }, options);
    } };
    return { control, context, row, button, status, storage, writes, engine, document, focusTarget,
        calls: () => calls, result: value => { result = value; },
        storageEvent: key => window.emit("storage", { key }),
        expire: () => { for (const fn of timers.values()) fn(); timers.clear(); } };
}
function backupFixture(initial = {}) {
    const { storage, writes } = storageFixture(initial), reads = [];
    const nodes = Object.create(null);
    const context = vm.createContext({ Blob, URL, Uint8Array, atob, console, localStorage: storage, MyntMcpData: adapter,
        currentLanguage: "en", translations: { en: {} }, document: { getElementById(id) { return nodes[id] ||= { addEventListener() {} }; } },
        reads, setTimeout() {}, alertPrompt() {}, confirmPrompt() {}, location: { reload() {} } });
    vm.runInContext(read("scripts/backup-restore.js"), context);
    const run = code => vm.runInContext(code, context);
    run(`readIndexedDBEntries = async () => { reads.push('wallpaper'); return []; };
        readMediaEntries = async kind => { reads.push(kind); return []; };
        replaceIndexedDB = async () => { throw Error('Unexpected media write'); };
        replaceMediaEntries = async () => { throw Error('Unexpected media write'); };`);
    function setBackup(value) { context.fixtureJSON = JSON.stringify(value); run("globalThis.fixture = JSON.parse(fixtureJSON)"); }
    return { storage, writes, reads, run, context, setBackup };
}
function settingsBackup(recovery = todo) {
    return { format: "material-you-newtab", version: 3, scope: "settings", indexedDB: {}, localStorage: {
        myntTodoRecoveryV1: JSON.stringify(recovery), myntShortcutRecoveryV1: JSON.stringify(shortcut), myntHabitRecoveryV1: JSON.stringify(habit)
    } };
}

(async () => {
    const absent = uiFixture("todos");
    assert(absent.row.hidden); assert(absent.button.hidden); assert.equal(absent.writes.length, 0);
    for (const [domain, recovery] of [["todos", todo], ["shortcuts", shortcut], ["habits", habit]]) {
        const ui = uiFixture(domain, recovery);
        assert(!ui.row.hidden); assert(!ui.button.hidden);
        assert.equal(ui.button.tagName, "BUTTON"); assert.equal(ui.button.type, "button");
        assert.match(ui.button.attributes["aria-label"], /Undo .* deletion/);
        assert.equal(ui.status.attributes.role, "status");
        assert.equal(ui.engine.status().enabled, false, "Ordinary undo must not require a remote session");
        assert.equal(ui.writes.length, 0, "Rendering never writes recovery data");
        assert(!JSON.stringify([ui.button.textContent, ui.status.textContent, ui.button.attributes]).includes("UFJJVkFURS1JQ09O"));
        ui.button.focus();
        await ui.button.emit("click");
        assert.equal(ui.calls(), 1); assert.equal(ui.storage.getItem(keyFor(domain)), null);
        assert.equal(ui.document.activeElement, ui.focusTarget, "Keyboard focus must not stay on a disappearing Undo button");
        assert(ui.button.hidden); assert.equal(ui.status.textContent, "Restored.");
        ui.expire(); assert(ui.row.hidden);
        if (domain === "todos") assert.equal(JSON.parse(ui.storage.todoList).trecovery.title, todo.item.title);
        else if (domain === "shortcuts") { assert.equal(ui.storage.shortcutName0, shortcut.item.name); assert.equal(ui.storage.shortcutIcon0, shortcut.item.icon); }
        else assert.deepEqual(JSON.parse(ui.storage.myntHabits)[2], habit.item);
        assert.equal(ui.engine.status().enabled, false, "Undo must not grant remote access");
    }
    const translated = uiFixture("todos", todo, "zh_TW");
    assert.equal(translated.button.textContent, "復原待辦刪除");
    translated.storage.setItem("selectedLanguage", "fr");
    await translated.document.emit("change", { target: { id: "languageSelector" } });
    assert.equal(translated.button.textContent, "Undo task deletion", "Other locales fall back to English");
    translated.storage.removeItem("myntTodoRecoveryV1"); await translated.storageEvent(null); assert(translated.row.hidden);
    translated.storage.setItem("myntTodoRecoveryV1", JSON.stringify(todo)); await translated.storageEvent("myntTodoRecoveryV1"); assert(!translated.row.hidden);
    const malformed = uiFixture("todos", "not json");
    assert(malformed.button.hidden); assert.match(malformed.status.textContent, /invalid/); assert.equal(malformed.writes.length, 0);
    const stale = uiFixture("todos", todo); stale.result({ ok: false, error: { code: "CONFLICT" } });
    await stale.button.emit("click"); assert.match(stale.status.textContent, /changed/); assert(!stale.button.disabled); assert(stale.storage.getItem("myntTodoRecoveryV1"));
    const missing = uiFixture("todos", todo); delete missing.context.myntLocalRecovery;
    await missing.button.emit("click"); assert.match(missing.status.textContent, /unavailable/); assert.equal(missing.writes.length, 0);
    const pending = uiFixture("todos", todo); let finish;
    pending.result(() => new Promise(resolve => { finish = resolve; }));
    const first = pending.button.emit("click"); await pending.button.emit("click");
    assert.equal(pending.calls(), 1); assert(pending.button.disabled);
    finish({ ok: false, error: { code: "ROLLBACK_FAILED" } }); await first;
    assert.match(pending.status.textContent, /Keep this page open/); assert(pending.storage.getItem("myntTodoRecoveryV1"));

    const backup = backupFixture({ myntTodoRecoveryV1: JSON.stringify(todo), myntShortcutRecoveryV1: JSON.stringify(shortcut), myntHabitRecoveryV1: JSON.stringify(habit),
        weatherApiKey: "FIXTURE_SECRET", myntWallpaperCurrent: "private photo", myntPomoMusicSettingsV1: "private music" });
    const exported = await backup.run('createBackup("settings")');
    assert.equal(exported.backup.localStorage.myntTodoRecoveryV1, JSON.stringify(todo));
    assert.equal(exported.backup.localStorage.myntShortcutRecoveryV1, JSON.stringify(shortcut));
    assert.equal(exported.backup.localStorage.myntHabitRecoveryV1, JSON.stringify(habit));
    assert.equal(backup.reads.length, 0, "Settings-only recovery never reads media databases");
    assert.equal(backup.writes.length, 0); assert(!exported.serialized.includes("FIXTURE_SECRET"));
    assert(!exported.serialized.includes("private photo")); assert(!exported.serialized.includes("private music"));
    assert(!Object.hasOwn(exported.backup, "media"));
    const full = await backup.run('createBackup("full")');
    assert.equal(full.backup.localStorage.myntShortcutRecoveryV1, JSON.stringify(shortcut));
    const valid = backupFixture(); valid.setBackup(settingsBackup()); await valid.run("restoreData(fixture)");
    assert.equal(valid.storage.myntTodoRecoveryV1, JSON.stringify(todo));
    assert.equal(valid.storage.myntShortcutRecoveryV1, JSON.stringify(shortcut)); assert.equal(valid.reads.length, 0);
    assert.equal(valid.storage.myntHabitRecoveryV1, JSON.stringify(habit));
    for (const invalid of ["broken", JSON.stringify({ ...todo, version: 2 }), JSON.stringify({ ...todo, index: -1 }),
        JSON.stringify({ ...todo, item: { title: "Missing id", status: "pending", pinned: false } }),
        JSON.stringify({ ...todo, item: { ...todo.item, pinned: "yes" } }), JSON.stringify({ ...todo, extra: true })]) {
        const env = backupFixture({ untouched: "fixture" }), candidate = settingsBackup(); candidate.localStorage.myntTodoRecoveryV1 = invalid;
        env.setBackup(candidate); assert.equal(env.run("isValidBackupFile(fixture)"), false);
        await assert.rejects(env.run("restoreData(fixture)"), /Invalid backup/); assert.equal(env.writes.length, 0); assert.equal(env.reads.length, 0);
    }
    for (const invalid of ["[]", JSON.stringify({ ...shortcut, index: 50 }), JSON.stringify({ ...shortcut, item: { ...shortcut.item, icon: 7 } }),
        JSON.stringify({ ...shortcut, item: { ...shortcut.item, icon: "x".repeat(150001) } })]) {
        const env = backupFixture(), candidate = settingsBackup(); candidate.localStorage.myntShortcutRecoveryV1 = invalid;
        env.setBackup(candidate); assert.equal(env.run("isValidBackupFile(fixture)"), false);
        await assert.rejects(env.run("restoreData(fixture)"), /Invalid backup/); assert.equal(env.writes.length, 0);
    }
    for (const invalid of ["broken", JSON.stringify({ ...habit, item: { ...habit.item, id: "system-todo" } }), JSON.stringify({ ...habit, item: { ...habit.item, doneDates: ["2026-02-30"] } })]) {
        const env = backupFixture(), candidate = settingsBackup(); candidate.localStorage.myntHabitRecoveryV1 = invalid;
        env.setBackup(candidate); await assert.rejects(env.run("restoreData(fixture)"), /Invalid backup/);
        assert.equal(env.writes.length, 0); assert.equal(env.reads.length, 0);
    }
    const music = backupFixture();
    music.run(`readMediaEntries = async kind => kind === 'music' ? [['retained-track', { id:'retained-track', name:'retained.mp3', removedAt:1234, blob:new Blob(['private fixture music'], {type:'audio/mpeg'}) }]] : [];`);
    music.context.FileReader = class { readAsDataURL(blob) { blob.arrayBuffer().then(bytes => { this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString("base64")}`; this.onload(); }); } };
    const musicBackup = await music.run('createBackup("full")'); music.setBackup(musicBackup.backup);
    const preparedMusic = music.run("prepareBackupForRestore(fixture).media.music[0][1]");
    assert.equal(preparedMusic.removedAt, 1234); assert.equal(await preparedMusic.blob.text(), "private fixture music");
    for (const removedAt of [0, -1, "1234", null]) {
        music.context.removedAt = removedAt; music.run("fixture.media.music[0][1].removedAt=removedAt");
        assert.equal(music.run("isValidBackupFile(fixture)"), false, "Malformed music tombstones are rejected before restore");
    }
    music.run("fixture.media.music[0][1].removedAt=Infinity"); assert.equal(music.run("isValidBackupFile(fixture)"), false);
    assert.equal(music.writes.length, 0);
    const rejectedExport = backupFixture({ myntTodoRecoveryV1: "broken" });
    await assert.rejects(rejectedExport.run('createBackup("settings")'), /Nothing was exported/);
    assert.equal(rejectedExport.reads.length, 0); assert.equal(rejectedExport.writes.length, 0);
    const missingValidator = backupFixture(); missingValidator.setBackup(settingsBackup()); delete missingValidator.context.MyntMcpData;
    assert.equal(missingValidator.run("isValidBackupFile(fixture)"), false, "Recovery validation fails closed when adapter is absent");
    const css = read("styles/local-recovery-controls.css");
    assert.match(css, /:focus-visible/); assert.match(css, /overflow-wrap: anywhere/); assert.match(css, /\[hidden\]/);
    const helper = require(path.join(root, "scripts/shortcuts.js"));
    assert.equal(helper.myntNormalizeShortcutUrl("example.org"), "https://example.org/");
    const shortcutsSource = read("scripts/shortcuts.js");
    const dragSource = shortcutsSource.slice(shortcutsSource.indexOf("    function setupDragAndDrop()"), shortcutsSource.indexOf("    // Updates indices of all shortcut entries"));
    const dragList = eventTarget(), dragDocument = eventTarget(), dragWindow = eventTarget();
    vm.runInNewContext(`let shortcutDragInitialized=false; ${dragSource}; setupDragAndDrop(); setupDragAndDrop();`,
        { dom: { shortcutSettingsContainer: dragList }, document: dragDocument, window: dragWindow });
    assert.equal(dragList.events.dragstart.length, 1, "Reload must not duplicate delegated drag handlers");
    assert.equal(dragDocument.events.dragend.length, 1); assert.equal(dragWindow.events.blur.length, 1);
    const loadSource = shortcutsSource.slice(shortcutsSource.indexOf("    function loadShortcuts()"), shortcutsSource.indexOf("    // Creates a shortcut entry element"));
    const states = [], loadContext = vm.createContext({ localStorage: { getItem: key => key === "shortcutAmount" ? "49" : "" },
        presets: [], PLACEHOLDER: { name: "Fixture", url: "https://example.org" }, MAX_SHORTCUTS: 50,
        dom: { shortcutSettingsContainer: { appendChild() {} }, newShortcutButton: { classList: { toggle: (name, active) => states.push(active) } } },
        createShortcutEntry() {}, renderShortcut() {}, setupDragAndDrop() {} });
    vm.runInContext(`let shortcutsCache=[]; ${loadSource}; loadShortcuts();`, loadContext);
    assert.equal(states.at(-1), false, "A deletion from a full list re-enables the Add shortcut control");
    const dashboardSource = read("scripts/dashboard-tools.js");
    const habitReadSource = dashboardSource.slice(dashboardSource.indexOf("        let habitsStorageInvalid"), dashboardSource.indexOf("        function markSystemHabit"));
    const { myntValidateHabits } = require(path.join(root, "scripts/dashboard-tools.js"));
    for (const invalid of ["", "broken", "{}", JSON.stringify([{ ...habit.item, doneDates: ["2026-02-30"] }])]) {
        const fixture = storageFixture({ myntHabits: invalid });
        const context = vm.createContext({ localStorage: fixture.storage, KEYS: { habits: "myntHabits" }, myntValidateHabits, normalizeHabits: value => value });
        vm.runInContext(`${habitReadSource}; saveHabits();`, context);
        assert.equal(fixture.writes.length, 0, "Dashboard initialization must not overwrite malformed habit storage");
        assert.equal(fixture.storage.myntHabits, invalid);
    }
    for (const locale of ["en", "zh_TW"]) {
        const words = vm.runInNewContext(`${read(`locales/${locale}.js`)}\n;${locale}`, {});
        assert(words.recovery_todos); assert(words.recovery_shortcuts);
    }
    console.log("Local recovery controls passed: native keyboard buttons, translations, reload/storage refresh, safe undo, backup scope and pre-write validation.");
})().catch(error => { console.error(error); process.exitCode = 1; });

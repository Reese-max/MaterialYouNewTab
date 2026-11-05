'use strict';
// Real production scripts in independent tabs sharing storage; no browser profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const sourceRoot = process.argv[2] ? path.resolve(process.argv[2]) : root;
const read = file => fs.readFileSync(path.join(file.startsWith('scripts/') ? sourceRoot : root, file), 'utf8');
function test(name, run) {
    try { run(); console.log('PASS ' + name); }
    catch (error) { console.error('FAIL ' + name + ': ' + error.stack); process.exitCode = 1; }
}
const fixture = {};
const fixtureFile = path.join(__dirname, 'regress-shortcut-editing.cjs');
vm.runInNewContext(read('tools/regress-shortcut-editing.cjs').split('// --- Test 1:')[0] +
    '\nObject.assign(fixture, { harness, seed, createDocument, createStorage, loadTranslations });',
{ require: createRequire(fixtureFile), process: { argv: ['node', fixtureFile, sourceRoot] }, __dirname, fixture, console, setTimeout, clearTimeout, URL, TextDecoder, Uint8Array, atob });
const between = (file, start, end) => {
    const source = read(file), a = source.indexOf(start), b = source.indexOf(end, a);
    assert(a >= 0 && b > a, 'Production excerpt boundaries');
    return source.slice(a, b);
};
function tab(localStorage, ids = []) {
    const document = fixture.createDocument(), listeners = new Map();
    for (const id of ids) {
        const node = document.createElement(id === 'scratchpadInput' ? 'textarea' : 'div');
        node.id = id; document.body.appendChild(node);
    }
    const c = vm.createContext({ document, localStorage, console, translations: fixture.loadTranslations(),
        addEventListener(type, fn) { (listeners.get(type) || listeners.set(type, []).get(type)).push(fn); },
        CustomEvent: class { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } },
        Event: class { constructor(type) { this.type = type; } }, Node: { TEXT_NODE: 3 },
        setTimeout: () => 1, clearTimeout() {}, applyLanguage() {},
        loadCheckboxState() {}, saveCheckboxState() {}, loadDisplayStatus() {}, saveDisplayStatus() {} });
    c.window = c;
    vm.runInContext(read('scripts/storage-sync.js'), c);
    return { c, document, el: id => document.getElementById(id),
        run: code => vm.runInContext(code, c),
        storage(key) { for (const fn of listeners.get('storage') || []) fn({ key, storageArea: localStorage }); } };
}
function scratch(localStorage) {
    const h = tab(localStorage, ['scratchpadInput', 'scratchpadCharCount']);
    h.run(read('scripts/scratchpad.js')); h.document.emit('DOMContentLoaded');
    return h;
}
// notes-ai#1: delayed events, normal refresh, active drafts, keyboard writes, clear.
test('notes-ai#1', () => {
    const storage = fixture.createStorage({ myntScratchpadContent: 'base' });
    const a = scratch(storage), b = scratch(storage);
    a.el('scratchpadInput').value = 'base\nA'; a.el('scratchpadInput').emit('input');
    b.el('scratchpadInput').value = 'base\nB'; b.el('scratchpadInput').emit('input');
    const text = storage.getItem('myntScratchpadContent');
    assert(text.includes('base\nA') && text.includes('base\nB') && text.includes('衝突副本'));
    a.storage('myntScratchpadContent'); assert.equal(a.el('scratchpadInput').value, text);
    a.el('scratchpadInput').value = 'unsaved draft'; a.storage('myntScratchpadContent');
    assert.equal(a.el('scratchpadInput').value, 'unsaved draft');
    storage.setItem('myntScratchpadContent', 'remote keyboard');
    a.el('scratchpadInput').selectionStart = 0; a.el('scratchpadInput').selectionEnd = 0;
    a.el('scratchpadInput').emit('keydown', { key: 'Tab' });
    assert(storage.getItem('myntScratchpadContent').includes('remote keyboard'));
    assert(storage.getItem('myntScratchpadContent').includes('unsaved draft'));
});
// notes-ai#2: no homepage-widget subscription; delayed events must merge writes.
test('notes-ai#2', () => {
    const storage = fixture.createStorage({ todoLastUpdateDate: new Date().toLocaleDateString(),
        todoList: JSON.stringify({ t1: { title: 'original', status: 'pending', pinned: false } }) });
    const ids = ['todoContainer', 'todoListCont', 'todoullist', 'todoAdd', 'todoInput', 'todoListCheckbox'];
    const a = tab(storage, ids), b = tab(storage, ids);
    for (const h of [a, b]) h.run(read('scripts/todo-list.js'));
    a.run('todoList.t1.status = "completed"; SaveToDoData();');
    b.run('createTodo("second tab")');
    let todos = JSON.parse(storage.getItem('todoList'));
    assert.equal(todos.t1.status, 'completed'); assert.equal(Object.keys(todos).length, 2);
    a.storage('todoList'); assert.equal(a.c.myntTodoApi.list().length, 2);
    b.run('todoList.t1.title = "local title";');
    storage.setItem('todoList', JSON.stringify({ ...todos, t1: { ...todos.t1, title: 'remote title' } }));
    b.run('SaveToDoData()'); todos = Object.values(JSON.parse(storage.getItem('todoList')));
    assert(todos.some(todo => todo.title === 'local title') && todos.some(todo => todo.title === 'remote title'));
});
// notes-ai#4 and focus-study#2: stale UI/API changes cannot replace current focus.
test('notes-ai#4', () => {
    const storage = fixture.createStorage();
    const ids = ['userText', 'userTextCheckbox', 'dailyFocusActions', 'dailyFocusStatus', 'dailyFocusToggle', 'dailyFocusCounter'];
    const a = tab(storage, ids), b = tab(storage, ids);
    for (const h of [a, b]) { h.run(read('scripts/custom-text.js')); h.document.emit('DOMContentLoaded'); }
    b.c.myntFocus.update({ text: 'new focus', subject: 'db', steps: [{ text: 'new step', done: false }], linked: true });
    a.el('userText').textContent = 'old tab draft'; a.el('userText').emit('input');
    let focus = JSON.parse(storage.getItem('myntDailyFocus'));
    assert.equal(focus.text, 'new focus'); assert.equal(focus.subject, 'db');
    assert(storage.getItem('myntScratchpadContent').includes('old tab draft'));
    a.storage('myntDailyFocus'); assert.equal(a.el('userText').textContent, 'new focus');
    a.document.activeElement = a.el('userText');
    b.c.myntFocus.update({ text: 'newer focus', steps: [{ text: 'newer step', done: true }] });
    assert.equal(a.c.myntFocus.update({ rounds: 1 }), false);
    focus = JSON.parse(storage.getItem('myntDailyFocus'));
    assert.equal(focus.text, 'newer focus'); assert.equal(focus.steps[0].text, 'newer step');
    a.document.activeElement = a.document.body;
    assert.equal(a.c.myntFocus.get().text, 'newer focus');
    a.c.myntFocus.update({ rounds: 1 });
    assert.equal(JSON.parse(storage.getItem('myntDailyFocus')).subject, 'db');
    b.c.myntFocus.get(); b.c.myntFocus.update({ text: 'final focus', completed: false });
    a.el('dailyFocusToggle').emit('click');
    assert.equal(JSON.parse(storage.getItem('myntDailyFocus')).text, 'final focus');
    assert.equal(JSON.parse(storage.getItem('myntDailyFocus')).completed, false);
});
test('focus-study#2', () => {
    const storage = fixture.createStorage();
    const ids = ['userText', 'userTextCheckbox', 'dailyFocusActions', 'dailyFocusStatus', 'dailyFocusToggle', 'dailyFocusCounter'];
    const a = tab(storage, ids), b = tab(storage, ids);
    for (const h of [a, b]) { h.run(read('scripts/custom-text.js')); h.document.emit('DOMContentLoaded'); }
    b.c.myntFocus.update({ text: 'Remote focus', subject: 'db', steps: [{ text: 'Remote step', done: true }], linked: true });
    a.c.myntFocus.update({ rounds: 1 });
    const focus = JSON.parse(storage.getItem('myntDailyFocus'));
    assert.equal(focus.text, 'Remote focus'); assert.equal(focus.subject, 'db');
    assert.equal(focus.steps[0].text, 'Remote step'); assert.equal(focus.steps[0].done, true);
});
// search-nav#1: A removes row 0; B's row 1 blur must not overwrite old row 2.
test('search-nav#1', () => {
    const h = fixture.harness({ storage: fixture.seed(3) });
    const old = h.entries()[1], field = old.querySelector('.URL');
    h.storage.setItem('shortcutAmount', '2');
    for (const prefix of ['shortcutName', 'shortcutURL', 'shortcutIcon']) {
        h.storage.setItem(prefix + '0', h.storage.getItem(prefix + '1'));
        h.storage.setItem(prefix + '1', h.storage.getItem(prefix + '2'));
        h.storage.removeItem(prefix + '2');
    }
    field.value = 'https://draft.example/'; field.emit('blur');
    assert.equal(h.storage.getItem('shortcutURL1'), 'https://gamma.example/');
    assert(h.storage.getItem('myntScratchpadContent').includes('https://draft.example/'));
    assert.equal(h.entries().length, 2); assert.equal(h.alerts.length, 1);
    field.value = 'https://detached.example/'; field.emit('blur');
    assert.equal(h.storage.getItem('shortcutURL1'), 'https://gamma.example/');
});
// Dashboard excerpts execute unchanged production handlers, not algorithm copies.
const dashboard = require('../scripts/dashboard-tools.js');
// focus-study#1: timer completion handlers read persistent totals, even without events.
test('focus-study#1', () => {
    const storage = fixture.createStorage();
    const a = tab(storage), b = tab(storage);
    for (const h of [a, b]) {
        Object.assign(h.c, { KEYS: { focusHistory: 'myntFocusHistory' }, myntDateKey: () => '2026-11-05',
            normalizeFocusHistory: x => x, readJSON: (key, fallback) => JSON.parse(storage.getItem(key) || 'null') || fallback,
            markSystemHabit() {}, renderFocusStats() { h.c.displayed = h.run('focusHistory["2026-11-05"]?.minutes || 0'); },
            myntDashboard: { reloadHabits() {}, reloadWorkspaces() {} } });
        h.run('let focusHistory = {};');
        h.run(between('scripts/dashboard-tools.js', '        function saveFocusHistory()', '        function renderFocusStats()'));
        h.run(between('scripts/dashboard-tools.js', '        document.addEventListener("mynt:pomodoro-complete"', '        let previousTodoStatuses'));
    }
    for (const h of [a, b]) h.document.emit('mynt:pomodoro-complete', { detail: { minutes: 25 } });
    assert.deepEqual(JSON.parse(storage.getItem('myntFocusHistory'))['2026-11-05'], { sessions: 2, minutes: 50 });
    a.run(between('scripts/dashboard-tools.js', '        window.MyntStorageSync?.watch([KEYS.habits', '        localizeStaticUI();'));
    a.storage('myntFocusHistory'); assert.equal(a.c.displayed, 50);
});
// Append-like habit dates and newly added habits also share the three-way merge.
test('habit merge', () => {
    const initial = [{ id: 'read', name: 'Read', source: null, doneDates: [] }];
    const storage = fixture.createStorage({ myntHabits: JSON.stringify(initial) });
    const a = tab(storage), b = tab(storage);
    for (const h of [a, b]) {
        Object.assign(h.c, { KEYS: { habits: 'myntHabits' }, myntValidateHabits: dashboard.myntValidateHabits, normalizeHabits: x => x });
        h.run(between('scripts/dashboard-tools.js', '        let habitsStorageInvalid', '        function markSystemHabit'));
    }
    a.run('habits[0].doneDates.push("2026-11-04"); saveHabits()');
    b.run('habits[0].doneDates.push("2026-11-05"); habits.push({id:"run",name:"Run",source:null,doneDates:[]}); saveHabits()');
    const result = JSON.parse(storage.getItem('myntHabits'));
    assert.deepEqual(result[0].doneDates, ['2026-11-04', '2026-11-05']); assert.equal(result.length, 2);
});
// notes-ai#5: list and form baselines reject stale saves while retaining drafts.
test('notes-ai#5', () => {
    const base = [{ id: 'work', name: 'Work', widgets: {}, background: 'video', focusMinutes: 25, urls: [] }];
    const storage = fixture.createStorage({ myntWorkspacePresets: JSON.stringify(base) });
    const ids = ['workspacePresetGrid', 'workspaceStatus', 'workspaceAddBtn', 'workspaceCancelBtn', 'workspaceNameInput',
        'workspaceEditorForm', 'workspaceEditorId', 'workspaceBackgroundSelect', 'workspaceFocusMinutesInput', 'workspaceDeleteBtn', 'workspaceUrlsInput'];
    const h = tab(storage, ids);
    for (const id of ids) { h.el(id).setCustomValidity = text => { h.el(id).validationMessage = text; }; h.el(id).reportValidity = () => false; }
    Object.assign(h.c, { KEYS: { workspaces: 'myntWorkspacePresets', workspace: 'myntWorkspacePreset' },
        MYNT_WORKSPACE_WIDGETS: [], workspaceDefaults: base, myntNormalizeWorkspaces: dashboard.myntNormalizeWorkspaces,
        readJSON: (key, fallback) => JSON.parse(storage.getItem(key) || 'null') || fallback,
        t: (key, fallback) => fallback, format: (key, fallback) => fallback, requestAnimationFrame() {}, syncDecorativeVideo() {} });
    h.run(between('scripts/dashboard-tools.js', '        let workspaces =', '        // Optional extension'));
    h.c.myntDashboard = { reloadWorkspaces: () => h.run('workspaces = myntNormalizeWorkspaces(readJSON(KEYS.workspaces, null), workspaceDefaults); workspaceBaseline = localStorage.getItem(KEYS.workspaces);') };
    h.run('openWorkspaceEditor()');
    storage.setItem('myntWorkspacePresets', JSON.stringify([...base, { ...base[0], id: 'other', name: 'Other tab' }]));
    h.el('workspaceNameInput').value = 'My draft'; h.el('workspaceBackgroundSelect').value = 'video'; h.el('workspaceFocusMinutesInput').value = '25';
    h.el('workspaceEditorForm').emit('submit');
    assert.equal(JSON.parse(storage.getItem('myntWorkspacePresets')).length, 2);
    assert(JSON.parse(storage.getItem('myntWorkspacePresets')).some(item => item.id === 'other'));
    assert.equal(h.el('workspaceNameInput').value, 'My draft'); assert.equal(h.el('workspaceEditorForm').hidden, false);
    assert(storage.getItem('myntScratchpadContent').includes('My draft'));
    assert(h.el('workspaceNameInput').validationMessage);
});
if (!process.exitCode) console.log('B3_CROSS_TAB_OK');

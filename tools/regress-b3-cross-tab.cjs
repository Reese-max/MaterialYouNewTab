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

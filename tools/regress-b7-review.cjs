'use strict';
// Real production scripts, isolated storage/DOM. B7_BASE_FILE accepts a git-source JSON snapshot.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { webcrypto } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const baseline = process.env.B7_BASE_FILE ? JSON.parse(fs.readFileSync(process.env.B7_BASE_FILE, 'utf8').replace(/^\uFEFF/, '')) : null;
const read = file => baseline && file.startsWith('scripts/')
    ? baseline[file] ?? assert.fail('Missing baseline source: ' + file)
    : fs.readFileSync(path.join(root, file), 'utf8');
const modules = new Map();
function production(file) {
    if (modules.has(file)) return modules.get(file);
    const module = { exports: {} };
    const native = createRequire(path.join(root, file));
    const requireScript = name => name.startsWith('./') ? production(path.posix.join(path.posix.dirname(file), name)) : native(name);
    vm.runInThisContext('(function(module, require) {\n' + read(file) + '\n})', { filename: file })(module, requireScript);
    modules.set(file, module.exports);
    return module.exports;
}
const adapter = production('scripts/local-mcp-data.js');
const fixture = {}, fixtureFile = path.join(__dirname, 'regress-shortcut-editing.cjs');
vm.runInNewContext(read('tools/regress-shortcut-editing.cjs').split('// --- Test 1:')[0] +
    '\nObject.assign(fixture, { harness, createDocument, createStorage });', {
    require(name) {
        if (name === 'node:fs') return { ...fs, readFileSync: (file, encoding) => read(path.relative(root, file).replaceAll('\\', '/')) };
        if (name.endsWith('scripts/local-mcp-data.js')) return adapter;
        return createRequire(fixtureFile)(name);
    }, __dirname, process: { argv: ['node', fixtureFile, root] }, fixture, console,
    setTimeout: fn => { fn(); return 1; }, clearTimeout() {}, URL, TextDecoder, Uint8Array, atob
});
const between = (file, start, end) => {
    const source = read(file), a = source.indexOf(start), b = source.indexOf(end, a);
    assert(a >= 0 && b > a, 'Production excerpt boundaries');
    return source.slice(a, b);
};
function tab(storage, ids = []) {
    const document = fixture.createDocument();
    const createElement = document.createElement;
    document.createElement = tag => {
        const node = createElement(tag), set = node.setAttribute.bind(node);
        node.setAttribute = (key, value) => {
            set(key, value);
            if (key === 'class') node.className = value;
            if (key.startsWith('data-')) node.dataset[key.slice(5)] = value;
        };
        Object.defineProperty(node, 'childNodes', { get: () => node.children });
        if (tag === 'li') Object.defineProperty(node, 'textContent', {
            get: () => node.children.map(child => child.textContent).join(''),
            set: text => { node.replaceChildren(document.createTextNode(text)); }
        });
        return node;
    };
    document.createTextNode = text => Object.assign(document.createElement('text'), { nodeType: 3, textContent: text });
    for (const id of ids) { const node = document.createElement('div'); node.id = id; document.body.appendChild(node); }
    const c = vm.createContext({ document, localStorage: storage, console, Node: { TEXT_NODE: 3 },
        MyntMcpData: adapter, addEventListener() {}, setTimeout: () => 1, clearTimeout() {},
        CustomEvent: class { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } },
        loadCheckboxState() {}, saveCheckboxState() {}, loadDisplayStatus() {}, saveDisplayStatus() {} });
    c.window = c;
    vm.runInContext(read('scripts/storage-sync.js'), c);
    return { c, document, run: code => vm.runInContext(code, c), el: id => document.getElementById(id) };
}
function habitsTab(initial) {
    const storage = fixture.createStorage({ myntHabits: JSON.stringify(initial) });
    const h = tab(storage, ['habitInput']);
    Object.assign(h.c, { KEYS: { habits: 'myntHabits' }, myntValidateHabits: production('scripts/dashboard-tools.js').myntValidateHabits,
        normalizeHabits: x => x, renderHabits() {} });
    h.run(between('scripts/dashboard-tools.js', '        let habitsStorageInvalid', '        function markSystemHabit'));
    h.run(between('scripts/dashboard-tools.js', '        function deleteHabit', '        function renderHabits'));
    return { ...h, storage };
}
const habit = (id, name = id) => ({ id, name, source: null, doneDates: [] });
function todosTab() {
    const storage = fixture.createStorage({ todoLastUpdateDate: new Date().toLocaleDateString(),
        todoList: JSON.stringify({ t1: { title: 'Original', status: 'pending', pinned: false } }) });
    const h = tab(storage, ['todoContainer', 'todoListCont', 'todoullist', 'todoAdd', 'todoInput', 'todoListCheckbox']);
    h.run(read('scripts/todo-list.js'));
    return { ...h, storage };
}
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const { environment } = require('./regress-backup-completion.cjs');
test('P1-1 weather location backup and restore validation', async () => {
    for (const value of ['Taipei', '', '100', JSON.stringify('Taipei'), JSON.stringify({ name: 'Taipei', lat: 25, lon: 121 })]) {
        const h = environment(); h.context.MyntMcpData = adapter;
        h.storage.setItem('weatherLocation', value);
        const backup = await h.run("createBackup('settings')");
        h.context.savedBackup = backup.backup;
        assert.equal(h.run('isValidBackupFile(savedBackup)'), true);
        await h.run('restoreData(savedBackup)');
        assert.equal(h.storage.getItem('weatherLocation'), value);
    }
    assert.throws(() => adapter.validateBackupStorage({ weatherLocation: 'x'.repeat(513) }));
});
const sparseStates = [
    { shortcutAmount: '7', shortcutName6: 'New', shortcutURL6: 'https://example.com/' },
    { shortcutName0: 'Edited preset', shortcutURL0: 'https://example.com/' },
    { shortcutAmount: '2', shortcutName0: 'Name only', shortcutURL1: 'https://example.com/' },
    { shortcutAmount: '8', shortcutName6: 'New', shortcutURL6: 'https://example.com/' }
];
test('P1-2 legacy sparse shortcut backup/restore', async () => {
    for (const initial of sparseStates) {
        assert.equal(adapter.validateBackupStorage(initial), true);
        const backup = environment(); backup.context.MyntMcpData = adapter;
        Object.assign(backup.storage, initial);
        const saved = await backup.run("createBackup('settings')");
        backup.context.savedBackup = saved.backup;
        await backup.run('restoreData(savedBackup)');
        for (const [key, value] of Object.entries(initial)) assert.equal(backup.storage.getItem(key), value);
    }
});
test('P1-2 legacy sparse shortcut MCP read/mutate', async () => {
    for (const initial of sparseStates) {
        const h = fixture.harness({ storage: initial });
        const before = Object.fromEntries(h.storage.data);
        const context = { storage: h.storage, crypto: webcrypto,
            commit(plan) { for (const w of plan.writes) w.value === null ? h.storage.removeItem(w.key) : h.storage.setItem(w.key, w.value); return { ok: true }; } };
        const result = await adapter.execute('mynt_shortcuts_get', {}, context);
        assert.equal(result.ok, true, result.message);
        assert.equal(result.data.shortcuts[0].title, initial.shortcutName0 || 'YouTube');
        assert.deepEqual(Object.fromEntries(h.storage.data), before, 'Load only fills memory');
        const changed = await adapter.execute('mynt_shortcuts_mutate', { operation: 'create', name: 'MCP', url: 'https://mcp.example/', expectedRevision: result.revision }, context);
        assert.equal(changed.ok, true, changed.message);
        assert.equal(adapter.validateBackupStorage(Object.fromEntries(h.storage.data)), true);
    }
});
test('P1-2 add persists every default and rolls back quota failure', () => {
    const h = fixture.harness(); h.el('newShortcutButton').click();
    assert.equal(h.storage.getItem('shortcutAmount'), '7');
    for (let i = 0; i < 7; i++) assert(h.storage.getItem('shortcutName' + i) && h.storage.getItem('shortcutURL' + i));
    assert.equal(adapter.validateBackupStorage(Object.fromEntries(h.storage.data)), true);
    const f = fixture.harness(), before = Object.fromEntries(f.storage.data);
    f.storage.failNext(Object.assign(Error('quota'), { name: 'QuotaExceededError' }), 1, 4);
    f.el('newShortcutButton').click();
    assert.deepEqual(Object.fromEntries(f.storage.data), before);
    assert.equal(f.entries().length, 6); assert.equal(f.context.myntShortcuts.getItems().length, 6);
});
test('P1-2 edit persists complete list and restores default fields on failure', () => {
    const h = fixture.harness(), input = h.entries()[0].querySelector('.shortcutName');
    input.value = 'Edited'; input.emit('blur');
    assert.equal(h.storage.getItem('shortcutAmount'), '6');
    assert.equal(h.storage.getItem('shortcutName0'), 'Edited');
    for (let i = 0; i < 6; i++) assert(h.storage.getItem('shortcutName' + i) && h.storage.getItem('shortcutURL' + i));
    const f = fixture.harness(), before = Object.fromEntries(f.storage.data), field = f.entries()[0].querySelector('.URL');
    f.storage.failNext(Object.assign(Error('quota'), { name: 'QuotaExceededError' }), 1, 4);
    field.value = 'https://changed.example/'; field.emit('blur');
    assert.deepEqual(Object.fromEntries(f.storage.data), before);
    assert.equal(field.value, 'youtube.com');
    assert.equal(f.context.myntShortcuts.getItems()[0].url, 'youtube.com');
});
test('P1-2 reset removes orphan keys without shortcutAmount', async () => {
    const h = fixture.harness({ storage: { shortcutName0: 'Edited', shortcutURL0: 'https://example.com/' } });
    h.el('resetButton').appendChild(h.document.createElement('svg'));
    await h.el('resetButton').listeners.get('click')[0]();
    assert.equal(h.storage.getItem('shortcutName0'), null);
    assert.equal(h.entries()[0].querySelector('.shortcutName').value, 'YouTube');
});
test('P2-3 overflowing habit merge preserves valid remote state and stays usable', () => {
    const initial = Array.from({ length: 11 }, (_, i) => habit('h' + i));
    const h = habitsTab(initial), remote = [...initial, habit('remote')];
    h.storage.setItem('myntHabits', JSON.stringify(remote));
    h.run('habits.push({id:"local",name:"Local",source:null,doneDates:[]})');
    assert.equal(h.run('saveHabits()'), false);
    assert.equal(h.run('habitsStorageInvalid'), false);
    assert.equal(h.storage.getItem('myntHabits'), JSON.stringify(remote));
    assert.equal(h.run('JSON.stringify(habits)'), JSON.stringify(remote));
    h.run('habits[0].doneDates.push("2026-11-05")');
    assert.equal(h.run('saveHabits()'), true);
});
test('P2-3 delete refreshes baseline after a remote habit update', () => {
    const h = habitsTab([habit('keep'), habit('remove')]);
    h.storage.setItem('myntHabits', JSON.stringify([{ ...habit('keep'), doneDates: ['2026-11-05'] }, habit('remove')]));
    assert.equal(h.run('deleteHabit("remove")'), true);
    assert.equal(h.run('JSON.stringify(habitsBaseline)'), h.storage.getItem('myntHabits'));
    h.run('habits[0].doneDates=[]'); assert.equal(h.run('saveHabits()'), true);
    assert.deepEqual(JSON.parse(h.storage.getItem('myntHabits'))[0].doneDates, []);
});
test('P2-4 stale delete refreshes and succeeds on retry', () => {
    const h = todosTab();
    h.storage.setItem('todoList', JSON.stringify({ t1: { title: 'Remote', status: 'completed', pinned: false } }));
    assert.equal(h.run('deleteTodo("t1")'), false);
    assert.equal(h.run('todoList.t1.title'), 'Remote');
    assert.equal(h.run('deleteTodo("t1")'), true);
});
test('P2-4 Escape refreshes storage changed during inline edit', () => {
    const h = todosTab(), list = h.el('todoullist');
    const button = list.querySelector('.todoeditbtn');
    list.emit('click', { target: button });
    const input = list.querySelector('.edit-input'); assert(input);
    h.storage.setItem('todoList', JSON.stringify({ t1: { title: 'Remote', status: 'completed', pinned: false } }));
    input.emit('keydown', { key: 'Escape' });
    assert.equal(h.run('todoList.t1.title'), 'Remote');
    assert.equal(h.run('deleteTodo("t1")'), true);
});
test('P3-5 actual completion order does not double count fresh or legacy rounds', () => {
    const h = tab(fixture.createStorage());
    const focus = { date: '2026-11-05', text: 'Database', subject: 'db', rounds: 0, linked: true, completed: false };
    const api = production('scripts/focus-card.js');
    let log = {};
    Object.assign(h.c, { api: { get: () => focus, update: patch => Object.assign(focus, patch) },
        writeLog: (f, round) => { log = api.myntRecordFocusLog(log, f, 14, round); } });
    h.run(between('scripts/focus-card.js', '    document.addEventListener("mynt:pomodoro-complete"', '    document.addEventListener("mynt:focus-completed"'));
    h.document.emit('mynt:pomodoro-complete', { detail: { minutes: 25 } });
    assert.equal(focus.rounds, 1);
    assert.equal(api.myntWeeklySubjectMinutes(log, 25, new Date(2026, 10, 5))[0][1], 25);
    h.document.emit('mynt:pomodoro-complete', { detail: { minutes: 40 } });
    assert.equal(api.myntWeeklySubjectMinutes(log, 25, new Date(2026, 10, 5))[0][1], 65);
    log = {}; focus.rounds = 1; // One older round plus the newly completed round.
    h.document.emit('mynt:pomodoro-complete', { detail: { minutes: 25 } });
    assert.equal(api.myntWeeklySubjectMinutes(log, 25, new Date(2026, 10, 5))[0][1], 50);
    log = { '2026-11-05': { t: 'Database', s: 'db', r: 1, c: 0 } }; focus.rounds = 1;
    h.document.emit('mynt:pomodoro-complete', { detail: { minutes: 25 } });
    assert.equal(api.myntWeeklySubjectMinutes(log, 25, new Date(2026, 10, 5))[0][1], 50);
});
(async () => {
    for (const [name, fn] of tests) {
        try { await fn(); console.log('PASS ' + name); }
        catch (error) { process.exitCode = 1; console.error('FAIL ' + name + ': ' + error.stack); }
    }
    if (!process.exitCode) console.log('B7_REVIEW_OK');
})();

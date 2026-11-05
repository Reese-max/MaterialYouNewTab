'use strict';
// Production scripts in disposable VM/DOM/storage fixtures; no profile or network access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const baseline = process.env.B2_BASELINE ? JSON.parse(fs.readFileSync(process.env.B2_BASELINE, 'utf8').replace(/^\uFEFF/, '')) : null;
const read = file => baseline?.[file] ?? fs.readFileSync(path.join(root, file), 'utf8');
const between = (file, start, end) => {
    const source = read(file), a = source.indexOf(start), b = source.indexOf(end, a + start.length);
    assert(a >= 0 && b > a, `Production boundary: ${start}`);
    return source.slice(a, b);
};
// Reuse the existing editor fixture instead of maintaining another HTML parser.
const fixtureSource = fs.readFileSync(path.join(__dirname, 'regress-shortcut-editing.cjs'), 'utf8').split('// --- Test 1:')[0];
const fixtureContext = vm.createContext({ require: name => name === 'node:fs' ? {
    readFileSync(file, encoding) { const relative = path.relative(root, file).replaceAll('\\', '/'); return baseline?.[relative] ?? fs.readFileSync(file, encoding); }
} : require(name), __dirname, process: { argv: [] }, console, URL, Intl, TextDecoder, Uint8Array, atob, setTimeout, clearTimeout });
vm.runInContext(fixtureSource + '\nglobalThis.fixture = { harness, seed, createDocument, createStorage, Element, loadTranslations };', fixtureContext);
const { harness, seed, createDocument, createStorage, Element, loadTranslations } = fixtureContext.fixture;
const adapter = require('../scripts/local-mcp-data.js');
const { myntValidateHabits } = require('../scripts/dashboard-tools.js');
const tests = [];
const test = (id, fn) => tests.push([id, fn]);
const event = class { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } };
const json = value => JSON.parse(JSON.stringify(value));

function todoFixture() {
    const document = createDocument();
    const make = document.createElement;
    document.createTextNode = text => { const node = make('#text'); node.nodeType = 3; node.textContent = text; return node; };
    document.createDocumentFragment = () => make('fragment');
    document.createElement = tag => {
        const node = make(tag), set = node.setAttribute.bind(node);
        node.setAttribute = (key, value) => { set(key, value); if (key === 'class') node.className = value; if (key.startsWith('data-')) node.dataset[key.slice(5)] = value; };
        Object.defineProperty(node, 'childNodes', { get: () => node.children });
        if (tag === 'li') Object.defineProperty(node, 'textContent', { get: () => node.children.map(x => x.textContent).join(''), set: text => node.replaceChildren(document.createTextNode(text)) });
        const append = node.appendChild.bind(node);
        node.appendChild = child => { if (child.tagName === 'FRAGMENT') { for (const item of [...child.children]) append(item); return child; } return append(child); };
        return node;
    };
    const ids = ['todoContainer', 'todoListCont', 'todoullist', 'todoAdd', 'todoInput', 'todoListCheckbox'];
    for (const id of ids) { const node = document.createElement(id === 'todoullist' ? 'ul' : 'div'); node.id = id; document.body.appendChild(node); }
    const initial = { t1: { title: '法規複習', status: 'pending', pinned: false }, t2: { title: 'Second', status: 'completed', pinned: true } };
    const localStorage = createStorage({ todoList: JSON.stringify(initial), todoLastUpdateDate: new Date().toLocaleDateString(), selectedLanguage: 'zh_TW' });
    const context = vm.createContext({ document, localStorage, translations: loadTranslations(), MyntMcpData: adapter, console: { ...console, error() {} },
        Node: { TEXT_NODE: 3 }, CustomEvent: event, setTimeout: () => 1, clearTimeout() {}, MutationObserver: class { observe() {} },
        addEventListener() {}, saveCheckboxState() {}, loadCheckboxState() {}, saveDisplayStatus() {}, loadDisplayStatus() {} });
    context.window = context;
    vm.runInContext(read('scripts/local-recovery-controls.js'), context);
    vm.runInContext(read('scripts/todo-list.js'), context);
    document.emit('DOMContentLoaded');
    const list = document.getElementById('todoullist');
    return { context, document, localStorage, list, initial, click: target => list.emit('click', { target }) };
}

test('notes-ai#3', () => {
    const h = todoFixture();
    h.click(h.list.children[0].querySelector('.todoremovebtn'));
    const retained = adapter.validateTodoRecovery(h.localStorage.getItem('myntTodoRecoveryV1'));
    assert.deepEqual(retained, { version: 1, index: 0, item: { id: 't1', ...h.initial.t1 } });
    assert.equal(h.localStorage.getItem('todoList'), JSON.stringify({ t2: h.initial.t2 }));
    assert.equal(h.document.querySelector('.myntRecoveryControl').hidden, false);
    assert.equal(h.document.activeElement, h.document.getElementById('todoInput'));
    // Reload retains the same production-compatible recovery record.
    vm.runInContext('ShowToDoList()', h.context);
    assert.equal(h.document.querySelector('.myntRecoveryUndo').hidden, false);
    for (const skip of [0, 1]) {
        const failed = todoFixture(), before = [...failed.localStorage.data];
        failed.localStorage.failNext(Error('quota'), 1, skip);
        failed.click(failed.list.children[0].querySelector('.todoremovebtn'));
        assert.deepEqual([...failed.localStorage.data], before, 'Both storage keys roll back after either write fails');
        assert.equal(failed.list.children.length, 2);
    }
});

test('notes-ai#10', () => {
    const h = todoFixture(), row = h.list.children[0];
    for (const cls of ['todoeditbtn', 'todoremovebtn', 'todopinbtn']) {
        const button = row.querySelector('.' + cls);
        assert.equal(button.tagName, 'BUTTON'); assert.equal(button.type, 'button'); assert(button.getAttribute('aria-label'));
    }
    const box = row.querySelector('.todocomplete');
    assert.equal(box.type, 'checkbox'); assert.equal(box.getAttribute('aria-label'), '法規複習');
    box.checked = true; h.list.emit('change', { target: box });
    assert.equal(JSON.parse(h.localStorage.getItem('todoList')).t1.status, 'completed');
    h.click(row.querySelector('.todopinbtn')); assert.equal(row.querySelector('.todopinbtn').getAttribute('aria-pressed'), 'true');
    h.click(row.querySelector('.todoeditbtn'));
    const input = row.querySelector('.edit-input'); input.value = 'Changed'; input.emit('keydown', { key: 'Escape' });
    assert.equal(h.document.activeElement, row.querySelector('.todoeditbtn'));
    assert.equal(JSON.parse(h.localStorage.getItem('todoList')).t1.title, '法規複習');
});

function habitFixture() {
    const document = createDocument();
    for (const id of ['habitList', 'habitInput', 'habitAddBtn']) { const el = document.createElement('div'); el.id = id; document.body.appendChild(el); }
    const items = [{ id: 'system-todo', name: '', source: 'todo', doneDates: [] }, { id: 'read', name: 'Reading', source: null, doneDates: ['2026-11-04', '2026-11-05'] }, { id: 'run', name: 'Run', source: null, doneDates: [] }];
    const localStorage = createStorage({ myntHabits: JSON.stringify(items) });
    let refreshes = 0;
    const c = vm.createContext({ document, localStorage, console: { ...console, error() {} }, CustomEvent: event, myntValidateHabits,
        window: { MyntMcpData: adapter, myntDialog: { confirm: async () => true } }, KEYS: { habits: 'myntHabits' }, normalizeHabits: x => x,
        myntDateKey: () => '2026-11-05', t: (key, fallback) => fallback, format: (key, fallback, values) => fallback.replace('{name}', values.name) });
    vm.runInContext(between('scripts/dashboard-tools.js', '        let habitsStorageInvalid', '        function markSystemHabit') +
        between('scripts/dashboard-tools.js', '        function markSystemHabit', '        document.getElementById("habitForm")') +
        '\nhabitRecoveryControl = { refresh() { onRefresh(); } }; renderHabits();', Object.assign(c, { onRefresh: () => refreshes++ }));
    return { c, document, localStorage, items, refreshes: () => refreshes };
}
test('focus-study#4', async () => {
    const h = habitFixture(), remove = h.document.querySelector('.habitDeleteBtn');
    // Execute the actual async UI confirmation listener.
    await remove.listeners.get('click')[0]();
    assert.deepEqual(adapter.validateHabitRecovery(h.localStorage.getItem('myntHabitRecoveryV1')), { version: 1, index: 1, item: h.items[1] });
    assert.equal(JSON.parse(h.localStorage.getItem('myntHabits')).length, 2);
    assert(h.refreshes() >= 2); assert.equal(h.document.activeElement.id, 'habitInput');
    assert.equal(vm.runInContext('deleteHabit("system-todo")', h.c), false);
    for (const skip of [0, 1]) {
        const failed = habitFixture(), before = [...failed.localStorage.data];
        failed.localStorage.failNext(Error('quota'), 1, skip);
        await failed.document.querySelector('.habitDeleteBtn').listeners.get('click')[0]();
        assert.deepEqual([...failed.localStorage.data], before);
    }
});

test('search-nav#7', () => {
    const html = read('index.html');
    assert(/<dialog\b[^>]*id="aiToolsSettingsModal"[^>]*aria-labelledby="aiSettingsHeader"/.test(html), 'AI settings uses a labelled native dialog');
    assert(/<button\b[^>]*id="closeAISettingsBtn"[^>]*aria-label=/.test(html), 'Close is a named native button');
    const document = createDocument(), dialog = document.createElement('dialog'), close = document.createElement('button'), opener = document.createElement('button');
    opener.isConnected = true; document.activeElement = opener;
    dialog.showModal = () => { dialog.open = true; }; dialog.close = () => { dialog.open = false; dialog.emit('close'); };
    const c = vm.createContext({ document, aiToolsSettingsModal: dialog, closeAISettingsBtn: close, aiToolsForm: document.createElement('form'),
        translations: loadTranslations(), currentLanguage: 'zh_TW', loadAIToolsSettings: () => [], generateAIToolsForm() {} });
    vm.runInContext('let aiSettingsReturnFocus = null;\n' + between('scripts/ai-tools.js', 'function showAIToolsSettings()', '// Function to update the enabled/disabled') +
        between('scripts/ai-tools.js', 'function closeAIToolsSettings()', '// Function to toggle AI Tools panel'), c);
    vm.runInContext('showAIToolsSettings()', c);
    assert.equal(dialog.open, true); assert.equal(document.activeElement, close); assert(close.getAttribute('aria-label'));
    // Native Escape produces close; browser focus containment is a separate acceptance layer.
    dialog.close(); assert.equal(document.activeElement, opener);
    vm.runInContext('showAIToolsSettings(); closeAIToolsSettings()', c); assert.equal(document.activeElement, opener);
});

test('search-nav#8', async () => {
    const document = createDocument();
    for (const id of ['commandPaletteList', 'commandPaletteEmpty', 'commandPaletteInput']) { const el = document.createElement('div'); el.id = id; document.body.appendChild(el); }
    const commandDialog = document.createElement('dialog'); commandDialog.close = () => {};
    const c = vm.createContext({ URL, document, commandDialog, controlDialog: { open: false }, requestAnimationFrame() {},
        commandDefinitions: [], workspaces: [], hiddenCommandIds: new Set(['quick-create-task']), t: (_k, fallback) => fallback, format: (_k, fallback) => fallback,
        window: { myntShortcuts: { getItems: () => [
        { name: '法規題庫', url: 'https://law.example/questions' }, { name: 'Unsafe', url: 'javascript:alert(1)' }, { name: 'Broken', url: 'not a url' }
    ] }, location: { href: '' } } });
    vm.runInContext(between('scripts/bookmarks.js', 'function safeBookmarkLink(', 'function safeHostname(') +
        between('scripts/dashboard-tools.js', '        let filteredCommands = []', '        function remoteWorkspaceState()'), c);
    await vm.runInContext('renderCommands("法規")', c);
    assert.equal(document.getElementById('commandPaletteList').children.length, 1);
    await vm.runInContext('renderCommands("law.example")', c);
    const choices = document.getElementById('commandPaletteList').children; assert.equal(choices.length, 1);
    choices[0].click(); assert.equal(c.window.location.href, 'https://law.example/questions');
    await vm.runInContext('renderCommands("unsafe")', c); assert.equal(document.getElementById('commandPaletteList').children.length, 0);
});

test('search-nav#9', () => {
    const h = harness({ storage: seed(3) });
    assert.equal(h.entries()[0].querySelector('.shortcutMoveUp').disabled, true);
    assert.equal(h.entries()[2].querySelector('.shortcutMoveDown').disabled, true);
    const move = h.entries()[1].querySelector('.shortcutMoveUp'); assert.match(move.getAttribute('aria-label'), /Beta/);
    move.click(); assert.equal(h.storage.getItem('shortcutName0'), 'Beta'); assert.equal(h.storage.getItem('shortcutName1'), 'Alpha');
    assert.equal(h.document.activeElement, h.entries()[0].querySelector('.shortcutMoveDown'));
    h.entries()[0].querySelector('.shortcutMoveDown').click(); assert.equal(h.storage.getItem('shortcutName0'), 'Alpha');
    for (const skip of [0, 3]) {
        const failed = harness({ storage: seed(3) }), before = [...failed.storage.data];
        failed.storage.failNext(Object.assign(Error('quota'), { name: 'QuotaExceededError' }), 1, skip);
        failed.entries()[1].querySelector('.shortcutMoveUp').click();
        assert.deepEqual([...failed.storage.data], before); assert.equal(failed.entries()[1].querySelector('.shortcutName').value, 'Beta');
        assert.equal(failed.document.activeElement, failed.entries()[1].querySelector('.shortcutMoveUp'));
    }
});

test('focus-study#5', () => {
    const c = vm.createContext({ module: { exports: {} } }); vm.runInContext(read('scripts/focus-card.js'), c);
    const { myntRecordFocusLog: record, myntWeeklySubjectMinutes: stats } = c.module.exports;
    const date = '2026-11-05', today = new Date(2026, 10, 5), focus = { date, text: 'Read', subject: 'db', linked: true };
    let log = record({}, focus, 14, { minutes: 25 });
    log = record(log, { ...focus, subject: 'sec', rounds: 1 }, 14, { minutes: 50 });
    log = record(log, { ...focus, subject: 'law', rounds: 2 });
    assert.deepEqual(json(stats(log, 120, today)), [['sec', 50], ['db', 25]]);
    assert.deepEqual(json(stats(log, 10, today)), json(stats(log, 120, today)), 'Changing duration never rewrites history');
    const legacy = { [date]: { t: 'Old', c: 0, s: 'db', r: 2 } };
    const migrated = record(legacy, { ...focus, subject: 'sec', rounds: 2 }, 14, { minutes: 50 });
    assert.deepEqual(json(stats(migrated, 120, today)), [['sec', 50], ['db', 50]]);
    assert.equal(migrated[date].v, 2); assert.equal(migrated[date].sessions[0].subject, 'sec');
    assert.deepEqual(json(stats(legacy, 50, today)), [['db', 50]], 'Unmigrated legacy data uses a stable estimate too');
    // Execute the real completion listener, not just the aggregation helper.
    const document = createDocument(); let saved, patch;
    vm.runInNewContext(between('scripts/focus-card.js', '    document.addEventListener("mynt:pomodoro-complete"', '    document.addEventListener("mynt:focus-completed"'),
        { document, api: { get: () => focus, update: x => { patch = x; } }, writeLog: (f, r) => { saved = record({}, f, 14, r); } });
    document.emit('mynt:pomodoro-complete', { detail: { minutes: 50 } });
    assert.equal(saved[date].sessions[0].minutes, 50); assert.equal(patch.rounds, 1);
    // The strict MCP reader must accept/preserve v2, and reject malformed minutes.
    const validate = vm.createContext({ parse: (raw, fallback) => raw === null ? fallback : JSON.parse(raw), plain: x => x && typeof x === 'object' && !Array.isArray(x),
        core: () => ({ parseDate() {} }), fail: (_code, message) => { throw Error(message); } });
    vm.runInContext(between('scripts/local-mcp-data.js', 'function focusLog(', 'function workspaceState('), validate);
    validate.raw = JSON.stringify(migrated); assert.deepEqual(json(vm.runInContext('focusLog(raw)', validate)), json(migrated));
    migrated[date].sessions[0].minutes = -1; validate.raw = JSON.stringify(migrated); assert.throws(() => vm.runInContext('focusLog(raw)', validate), /Invalid focus sessions/);
});

(async () => {
    let failures = 0;
    for (const [id, fn] of tests) { try { await fn(); console.log('PASS ' + id); } catch (error) { failures++; console.error('FAIL ' + id + ': ' + error.stack); } }
    if (failures) { process.exitCode = 1; console.error(`B2_FAILED ${failures}/${tests.length}`); }
    else console.log('B2_RECOVERY_A11Y_OK');
})();

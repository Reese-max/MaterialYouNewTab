'use strict';
// Real production source in disposable VM boundaries; no network/browser/profile access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const baseline = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8').replace(/^\uFEFF/, '')) : null;
const read = file => baseline?.[file] ?? fs.readFileSync(path.join(root, file), 'utf8');
function between(file, start, end) {
    const source = read(file), a = source.indexOf(start), b = source.indexOf(end, a + start.length);
    assert.ok(a >= 0 && b > a, `Source boundary: ${start}`);
    return source.slice(a, b);
}
function node() {
    const classes = new Set();
    return { children: [], listeners: {}, attrs: {}, dataset: {}, style: {}, value: '', textContent: '',
        classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x), toggle(x, on) { on ? classes.add(x) : classes.delete(x); } },
        addEventListener(k, fn) { (this.listeners[k] ||= []).push(fn); },
        emit(k, data = {}) { const e = { target: this, key: '', preventDefault() { this.prevented = true; }, stopPropagation() {}, ...data }; for (const fn of this.listeners[k] || []) fn.call(this, e); return e; },
        setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; }, removeAttribute(k) { delete this.attrs[k]; },
        append(...xs) { this.children.push(...xs); }, appendChild(x) { this.children.push(x); }, replaceChildren(...xs) { this.children = xs; },
        querySelector(q) { return q === '.active' ? this.children.find(x => x.classList.contains('active')) : null; },
        focus() {}, scrollIntoView() {}, click() { this.onclick?.(); this.emit('click'); }, close() { this.open = false; }
    };
}
function store(initial = {}) {
    const map = new Map(Object.entries(initial));
    return { map, getItem: k => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) };
}
function context(extra = {}) {
    const nodes = new Map(), document = node();
    document.getElementById = id => { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); };
    document.querySelectorAll = () => [];
    document.createElement = () => node(); document.body = node();
    const c = { document, window: {}, localStorage: store(), console: { ...console, warn() {} }, URL, setTimeout: () => 1, clearTimeout() {},
        CustomEvent: class { constructor(type, init) { this.type = type; Object.assign(this, init); } }, ...extra };
    document.dispatchEvent = e => document.emit(e.type, e);
    vm.createContext(c);
    return c;
}
const run = (c, source) => vm.runInContext(source, c);
const tests = [];
const test = (id, fn) => tests.push([id, fn]);

for (const finding of ['2', '5']) test('search-nav#' + finding, () => {
    const c = context(); c.searchInput = node(); c.searchbar = { contains: () => true }; let searched = 0;
    c.performSearch = () => searched++;
    run(c, read('scripts/search-suggestions.js'));
    const box = c.document.getElementById('resultBox'), input = c.searchInput, item = node();
    item.textContent = '!yt · YouTube'; item.setAttribute('data-query', '!yt '); item.setAttribute('data-index', '0');
    item.classList.add('active'); box.children = [item]; box.classList.add('show');
    if (finding === '2') for (const flag of [{ isComposing: true }, { keyCode: 229 }]) for (const key of ['Enter', 'ArrowDown', 'ArrowUp', 'ArrowRight', 'Tab']) {
        input.value = '!y'; input.selectionStart = 2;
        assert.ok(!input.emit('keydown', { key, ...flag }).prevented); assert.equal(input.value, '!y');
    }
    assert.equal(searched, 0);
    run(c, 'lastInteractionBy = "mouse";');
    for (const key of ['Tab', 'ArrowRight']) { input.value = '!y'; input.selectionStart = 2; input.emit('keydown', { key }); assert.equal(input.value, '!yt '); }
    box.children = []; box.classList.remove('show'); input.emit('keydown', { key: 'Enter' }); assert.equal(searched, 1);
});

for (const finding of ['6', '9']) test('notes-ai#' + finding, () => {
    const c = context({ updateCounts() {}, STORAGE_KEY: 'note' }); c.scratchpadInput = node();
    run(c, between('scripts/scratchpad.js', '    // Smart list continuation', '    // Global shortcut'));
    const n = c.scratchpadInput;
    if (finding === '6') for (const flag of [{ isComposing: true }, { keyCode: 229 }]) {
        n.value = '- [ ] 注音'; n.selectionStart = n.value.length;
        assert.ok(!n.emit('keydown', { key: 'Enter', ...flag }).prevented); assert.equal(n.value, '- [ ] 注音');
    }
    for (const marker of ['x', 'X']) {
        n.value = `- [${marker}] Task`; n.selectionStart = 7;
        n.emit('keydown', { key: 'Enter', ctrlKey: true }); assert.equal(n.value, '- [ ] Task');
        n.emit('keydown', { key: 'Enter', ctrlKey: true }); assert.equal(n.value, '- [x] Task');
    }
});

test('search-nav#3', () => {
    const c = context({ MAX_SHORTCUTS: 3, isQuotaExceededError: e => e.name === 'QuotaExceededError', alertPrompt() {}, translations: { en: { iconStorageQuotaMessage: 'quota' } }, currentLanguage: 'en', shortcutsCache: [{ name: 'Old', url: 'https://old.test', icon: 'oldicon' }] });
    c.localStorage = store({ shortcutAmount: '1', shortcutName0: 'Old', shortcutURL0: 'https://old.test', shortcutIcon0: 'oldicon' });
    const saved = [...c.localStorage.map]; const set = c.localStorage.setItem;
    c.localStorage.setItem = (k, v) => { if (v === 'newicon') throw Object.assign(Error('quota'), { name: 'QuotaExceededError' }); set(k, v); };
    run(c, between('scripts/shortcuts.js', '    function snapshotShortcutStorage()', '    function rebuildShortcutEditor('));
    run(c, between('scripts/shortcuts.js', '    function saveShortcut(entry)', '    // Keyboard shortcuts:'));
    const fields = { '.shortcutName': { value: 'New' }, '.URL': { value: 'https://new.test' }, '.iconURL': { value: 'newicon' } };
    c.saveShortcut({ _index: 0, querySelector: s => fields[s] });
    assert.deepEqual([...c.localStorage.map], saved); assert.equal(fields['.iconURL'].value, 'oldicon'); assert.equal(fields['.shortcutName'].value, 'Old');
    assert.equal(c.shortcutsCache[0].icon, 'oldicon');
});

for (const finding of ['2-palette', '4', '6']) test('search-nav#' + finding, async () => {
    let resolveSearch, executed = 0;
    const c = context({ commandDefinitions: [], workspaces: [], hiddenCommandIds: new Set(['quick-create-task']), t: (k, f) => f,
        format: (k, f) => f, applyWorkspace() {}, controlDialog: node(), commandDialog: node(), requestAnimationFrame() {} });
    c.browser = { bookmarks: { search: () => new Promise(resolve => { resolveSearch = resolve; }) } };
    c.window.location = {};
    run(c, between('scripts/bookmarks.js', 'function safeBookmarkLink(', 'function safeHostname('));
    run(c, between('scripts/dashboard-tools.js', '        let filteredCommands = []', '        function remoteWorkspaceState()'));
    c.window.myntFocusCommands = () => [{ id: 'old', labelText: 'OLD', run: () => executed++ }];
    const first = c.renderCommands('old'); resolveSearch([]); await first;
    const input = c.document.getElementById('commandPaletteInput');
    if (finding === '2-palette') for (const flag of [{ isComposing: true }, { keyCode: 229 }]) for (const key of ['Enter', 'ArrowDown', 'ArrowUp']) assert.ok(!input.emit('keydown', { key, ...flag }).prevented);
    assert.equal(executed, 0);
    if (finding === '4') {
        const second = c.renderCommands('new'); input.emit('keydown', { key: 'Enter' }); assert.equal(executed, 0, 'pending query must invalidate OLD'); resolveSearch([]); await second;
    }
    const links = c.bookmarkCommands('bad'); resolveSearch([{ title: 'bad', url: 'javascript:alert(1)' }, { title: 'bad', url: 'data:text/html,x' }, { title: 'bad', url: 'https://safe.test/' }]);
    const result = await links; assert.equal(result.length, 1); result[0].run(); assert.equal(c.window.location?.href, 'https://safe.test/');
});

for (const finding of ['7', '8']) test('notes-ai#' + finding, async () => {
    let release, applied = 0, successes = 0, failures = 0;
    const c = context({ pendingAction: { id: 'p1', type: 'todo.create', title: 'Task' }, pendingPlan: {}, finishingAction: false,
        decisions: new Map(), confirmButton: node(), rejectButton: node(), actionDialog: node(), focusBreakdownUntil: 0,
        myntPlanDaidaiAction: () => ({ valid: true }), localState: () => ({}), acknowledge: async () => {},
        showActionFeedback: () => successes++, notify: () => failures++, t: (k, f) => f, pollActions() {} });
    c.document.addEventListener('mynt:todo-action', e => { applied++; e.detail.applied = true; });
    c.storageCall = () => new Promise(resolve => { release = resolve; }); c.DECISIONS_KEY = 'decisions';
    run(c, between('scripts/daidai-integration.js', '    async function rememberDecision(', '    async function acknowledge('));
    run(c, between('scripts/daidai-integration.js', '    async function finishAction(', '    rejectButton.addEventListener('));
    const a = c.finishAction('confirmed', true), b = finding === '8' ? c.finishAction('confirmed', true) : Promise.resolve();
    assert.equal(applied, 1); if (finding === '8') assert.equal(c.confirmButton.disabled, true); release(); await Promise.all([a, b]);
    assert.equal(successes, 1); assert.equal(failures, 0);
    c.pendingAction = { id: 'p1', type: 'todo.create' }; await c.finishAction('confirmed', true); assert.equal(applied, 1);
    c.pendingAction = { id: 'p2', type: 'scratchpad.replace' }; c.myntPlanDaidaiAction = () => ({ valid: false });
    const invalid = c.finishAction('confirmed', true); release(); await invalid; assert.equal(failures, 1);
});

test('look-layout#3', async () => {
    let status, applies = 0;
    const c = context({ addBlob: async file => { if (file.fail) throw Error('quota'); return file.skip ? null : file; }, renderGallery: async () => {}, applyItem: async () => applies++, setStatus: s => status = s, t: (k, f) => f });
    run(c, between('scripts/wallpaper-gallery.js', '    async function addFiles(', '    async function addUrl('));
    await c.addFiles([{ fail: true }]); assert.match(status, /^Added 0/); assert.match(status, /retry/); assert.equal(applies, 0);
    await c.addFiles([{}, { fail: true }, { skip: true }]); assert.match(status, /^Added 1/); assert.match(status, /2/); assert.equal(applies, 1);
});

test('look-layout#8', () => {
    const c = context({ currentLanguage: 'en', translations: { en: { feelsLike: 'Feels like' } }, isMinMaxEnabled: false, isRTL: false,
        localizedTempFahrenheit: '68', localizedTempCelsius: '20', localizedFeelsLikeFahrenheit: '70', localizedFeelsLikeCelsius: '21' });
    run(c, between('scripts/weather.js', '                const fahrenheitCheckbox =', '                updateTemperatureDisplay();') + '\nupdateTemperatureDisplay();\n' +
        between('scripts/weather.js', '                updateTemperatureDisplay();', '                // Setting weather Icon').split('\n').slice(1).join('\n'));
    const checkbox = c.document.getElementById('fahrenheitCheckbox'); checkbox.checked = true; checkbox.onchange?.(); checkbox.emit('change');
    assert.equal(c.document.getElementById('temp').textContent, '68'); assert.match(c.document.getElementById('feelsLike').textContent, /°F/);
});

test('focus-study#7', () => {
    let marks = 0;
    const c = context({ markSystemHabit: () => marks++, habitRecoveryControl: null, myntValidateHabits() {} });
    c.localStorage = store({ todoList: JSON.stringify({ old: { status: 'completed' }, fresh: { status: 'pending' } }) });
    const source = read('scripts/dashboard-tools.js'), start = source.includes('        let previousTodoStatuses') ? '        let previousTodoStatuses' : '        document.addEventListener("mynt:todo-updated"';
    run(c, between('scripts/dashboard-tools.js', start, '        // Accessibility settings'));
    c.document.emit('DOMContentLoaded'); assert.equal(marks, 0, 'old completion must not check today');
    c.document.emit('mynt:todo-updated', { detail: { completed: 1, items: [{ id: 'old', status: 'completed' }, { id: 'fresh', status: 'pending' }] } }); assert.equal(marks, 0);
    c.document.emit('mynt:todo-updated', { detail: { completed: 2, items: [{ id: 'old', status: 'completed' }, { id: 'fresh', status: 'completed' }] } }); assert.equal(marks, 1);
});

test('focus-study#6', async () => {
    let day = 5, fetched = 0;
    const c = context({ Date: class extends Date { constructor(...args) { super(...(args.length ? args : [2026, 10, day])); } },
        fetch: async () => { fetched++; return { ok: true, json: async () => ({ questions: Array.from({ length: 80 }, () => ({ type: 'choice', stem: `Day ${day}`, options: { A: 'a', B: 'b' }, answer: 'A' })) }) }; } });
    c.document.readyState = 'complete'; c.document.querySelector = () => null;
    run(c, read('scripts/exam-daily.js')); await c.window.myntExam.ensure(); assert.equal(fetched, 1);
    day = 6; c.window.myntExam.open(); await c.window.myntExam.ensure(); assert.equal(fetched, 2); assert.equal(c.document.getElementById('examDailyStem').textContent, 'Day 6');
    day = 7; c.document.emit('visibilitychange'); await c.window.myntExam.ensure(); assert.equal(fetched, 3);
});

test('focus-study#8', async () => {
    const tasks = new Map(), sources = []; let seq = 0;
    function audioNode() { return { gain: { value: .5, setValueAtTime() {}, linearRampToValueAtTime() {} }, frequency: { setValueAtTime() {} }, connect() {}, start() {}, stop() { this.stopped = true; }, disconnect() {} }; }
    const c = context({ setTimeout: fn => { tasks.set(++seq, fn); return seq; }, clearTimeout: id => tasks.delete(id) });
    c.window.AudioContext = class { constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 4; } createGain() { return audioNode(); } createBuffer(n, size) { return { getChannelData: () => new Float32Array(size) }; } createBufferSource() { const n = audioNode(); sources.push(n); return n; } createBiquadFilter() { return audioNode(); } createOscillator() { return audioNode(); } };
    run(c, read('scripts/ambient-sound.js')); const a = c.myntAmbientAudio;
    await a.play('rain'); a.stop(); await a.play('campfire'); for (const fn of [...tasks.values()]) fn();
    assert.equal(a.isPlaying(), true); assert.ok(!sources.at(-1).stopped);
    a.stop(); a.stop(true); for (const fn of [...tasks.values()]) fn(); assert.equal(a.isPlaying(), false);
    c.window.AudioContext = class { constructor() { throw Error('blocked'); } };
    const failed = context(); failed.window.AudioContext = c.window.AudioContext; run(failed, read('scripts/ambient-sound.js'));
    assert.equal(await failed.myntAmbientAudio.play('rain'), false); assert.equal(failed.myntAmbientAudio.isPlaying(), false);
});

test('focus-study#3', async () => {
    let plays = 0, starts = 0; const state = { phase: 'work' };
    const c = context({ timer: { start: () => ++starts, getState: () => state }, getPomodoroBool: () => true, KEYS: { ambientAuto: 'auto' }, pomodoroAmbientSelect: { value: 'rain' }, myntAmbientAudio: { play: () => plays++ } });
    run(c, between('scripts/pomodoro.js', '    function startPomodoro()', '    function pausePomodoro()'));
    await c.startPomodoro(); assert.equal(plays, 1); assert.equal(starts, 1);
    c.getPomodoroBool = () => false; await c.startPomodoro(); assert.equal(plays, 1);
    c.getPomodoroBool = () => true; state.phase = 'shortBreak'; await c.startPomodoro(); assert.equal(plays, 1);
    state.phase = 'work'; state.isRunning = true; await c.startPomodoro(); assert.equal(plays, 1);
    c.pomodoroAmbientToggleBtn = node(); c.getPomodoroText = (k, f) => f;
    run(c, between('scripts/pomodoro.js', '        document.addEventListener("mynt:ambient-state"', '        // Programmatic API'));
    c.document.emit('mynt:ambient-state', { detail: { isPlaying: false, error: true } });
    assert.equal(c.pomodoroAmbientToggleBtn.getAttribute('aria-pressed'), 'false'); assert.match(c.document.getElementById('pomodoroAmbientStatus').textContent, /retry/);
    c.document.emit('mynt:ambient-state', { detail: { isPlaying: true } }); assert.equal(c.pomodoroAmbientToggleBtn.getAttribute('aria-pressed'), 'true');
});

test('focus-study#9', () => {
    const c = context({ api: { get: () => ({ text: 'Read', subject: '' }) }, MYNT_FOCUS_SUBJECTS: [], myntBuildFocusPrompt: x => x, myntDaysUntil: () => 999 });
    run(c, read('scripts/event-countdown-core.js')); c.window.MYNTCountdownCore = c.MYNTCountdownCore;
    run(c, between('scripts/focus-card.js', '    function prompt()', '    function openGpt()'));
    run(c, `const model = MYNTCountdownCore.defaultState(); model.events = [
      {id:'e-old',name:'Past',date:'2000-01-01',category:'exam',emoji:'',color:'blue',annual:false},
      {id:'e-future',name:'Exam',date:'2090-01-01',category:'exam',emoji:'',color:'blue',annual:false}];
      localStorage.setItem(MYNTCountdownCore.KEY, JSON.stringify(model)); localStorage.setItem('myntExamDate','2000-01-01');`);
    assert.ok(c.prompt().days > 0 && c.prompt().days !== 999);
    run(c, "model.events=[]; localStorage.setItem(MYNTCountdownCore.KEY,JSON.stringify(model));"); assert.equal(c.prompt().days, null);
});

test('data-platform#5', () => {
    for (const file of ['manifest.json', 'manifest(firefox).json']) {
        const manifest = JSON.parse(read(file)); const calls = [], c = context({ chrome: { runtime: { onInstalled: { addListener: fn => calls.push(fn) }, getURL: s => s, setUninstallURL: url => assert.match(url, /Reese-max/) }, tabs: { create: value => calls.push(value) } } });
        const script = manifest.manifest_version === 2 ? manifest.background?.scripts?.[0] : manifest.background?.service_worker;
        assert.equal(script, 'scripts/background.js'); run(c, read(script)); calls[0]({ reason: 'update' }); assert.equal(calls[1].url, 'docs/whats-new.html');
    }
});

(async () => {
    let failures = 0;
    for (const [id, fn] of tests) { try { await fn(); console.log('PASS ' + id); } catch (error) { failures++; console.error('FAIL ' + id + ': ' + error.stack); } }
    if (failures) { console.log(`B1_QUICK_FAILED ${failures}/${tests.length}`); process.exitCode = 1; }
    else console.log('B1_QUICK_OK');
})();

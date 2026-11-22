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
    const c = { document, window: { addEventListener() {} }, localStorage: store(), console: { ...console, warn() {} }, URL, setTimeout: () => 1, clearTimeout() {},
        CustomEvent: class { constructor(type, init) { this.type = type; Object.assign(this, init); } }, ...extra };
    document.dispatchEvent = e => document.emit(e.type, e);
    vm.createContext(c);
    return c;
}
const run = (c, source) => vm.runInContext(source, c);
const tests = [];
const test = (id, fn) => tests.push([id, fn]);

test('search-enter#2', () => {
    const c = context(); c.searchInput = node(); const searched = [];
    c.performSearch = query => searched.push(query);
    run(c, between('scripts/search.js', '// Enter searches;', 'enterBTN.addEventListener'));
    const input = c.searchInput; input.value = '!yt cats';
    for (const flag of [{ isComposing: true }, { keyCode: 229 }]) assert.ok(!input.emit('keydown', { key: 'Enter', ...flag }).prevented);
    assert.ok(!input.emit('keydown', { key: 'ArrowDown' }).prevented);
    assert.deepEqual(searched, []);
    assert.ok(input.emit('keydown', { key: 'Enter' }).prevented); assert.deepEqual(searched, ['!yt cats']);
});

test('search-stays-in-browser', () => {
    // iOS hands google.com/search to the Google app ("Open in Google?") unless noiga=1 is present.
    const c = context(); c.searchInput = node(); c.window = { location: { href: '' } };
    c.localStorage = store({ selectedLanguage: 'zh_TW' });
    run(c, between('scripts/search.js', 'const SEARCH_BANGS', '// Enter searches;'));
    c.performSearch('還 書');
    const url = new URL(c.window.location.href);
    assert.equal(url.origin + url.pathname, 'https://www.google.com/search');
    assert.equal(url.searchParams.get('q'), '還 書');
    assert.equal(url.searchParams.get('hl'), 'zh-TW');
    assert.equal(url.searchParams.get('noiga'), '1');
    c.performSearch('!yt cats');
    assert.equal(c.window.location.href, 'https://www.youtube.com/results?search_query=cats');
    c.performSearch('https://example.com/a?b=1');
    assert.equal(c.window.location.href, 'https://example.com/a?b=1');
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
    c.commandDefinitions.push({ id: 'old', labelText: 'OLD', run: () => executed++ });
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
    function audioNode() { const param = () => ({ value: .5, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} }); return { gain: param(), frequency: param(), Q: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), connect() {}, start() {}, stop(at) { this.stopAt = at; if (at === undefined) this.stopped = true; }, disconnect() {} }; }
    const c = context({ setTimeout: fn => { tasks.set(++seq, fn); return seq; }, clearTimeout: id => tasks.delete(id) });
    c.window.AudioContext = class { constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 4; } createDynamicsCompressor() { return audioNode(); } createGain() { return audioNode(); } createBuffer(n, size) { return { getChannelData: () => new Float32Array(size) }; } createBufferSource() { const n = audioNode(); sources.push(n); return n; } createBiquadFilter() { return audioNode(); } createOscillator() { return audioNode(); } };
    run(c, read('scripts/ambient-sound.js')); const a = c.myntAmbientAudio;
    await a.play('rain'); a.stop(); await a.play('campfire'); for (const fn of [...tasks.values()]) fn();
    assert.equal(a.isPlaying(), true); assert.ok(!sources.at(-1).stopped);
    a.stop(); a.stop(true); for (const fn of [...tasks.values()]) fn(); assert.equal(a.isPlaying(), false);
    c.window.AudioContext = class { constructor() { throw Error('blocked'); } };
    const failed = context(); failed.window.AudioContext = c.window.AudioContext; run(failed, read('scripts/ambient-sound.js'));
    assert.equal(await failed.myntAmbientAudio.play('rain'), false); assert.equal(failed.myntAmbientAudio.isPlaying(), false);
});

test('focus-study#3', async () => {
    let plays = 0, starts = 0; const state = { phase: 'work', isRunning: false, durations: {} };
    let subscriber;
    const c = context({
        pomodoroState: { ...state },
        timer: {
            start() { starts++; c.pomodoroState = { ...state }; subscriber({ ...state, isRunning: true }); },
            subscribe(fn) { subscriber = fn; fn({ ...state }); }
        },
        initPomodoro() {}, updatePomodoroUI() {},
        pomodoroWorkInput: {}, pomodoroShortBreakInput: {}, pomodoroLongBreakInput: {}, pomodoroRoundsInput: {},
        getPomodoroBool: () => true, KEYS: { ambientAuto: 'auto' },
        pomodoroAmbientSelect: { value: 'rain' }, myntAmbientAudio: { play: () => plays++ }
    });
    run(c, between('scripts/pomodoro.js', '    function startPomodoro()', '    function pausePomodoro()'));
    run(c, between('scripts/pomodoro.js', '        initPomodoro();', '        setInterval(() => { timer.tick()'));
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

test('data-platform#5', () => {
    for (const file of ['manifest.json', 'manifest(firefox).json']) {
        const manifest = JSON.parse(read(file)); const calls = [], c = context({ chrome: { runtime: { onInstalled: { addListener: fn => calls.push(fn) }, getURL: s => s, getManifest: () => manifest, setUninstallURL: url => assert.match(url, /Reese-max/) }, tabs: { create: value => calls.push(value) } } });
        const script = manifest.manifest_version === 2 ? manifest.background?.scripts?.[0] : manifest.background?.service_worker;
        assert.equal(script, 'scripts/background.js'); run(c, read(script));
        calls[0]({ reason: 'update', previousVersion: manifest.version }); assert.equal(calls.length, 1, 'reload without a version change stays quiet');
        calls[0]({ reason: 'update', previousVersion: '0.0.1' }); assert.equal(calls[1].url, 'docs/whats-new.html');
    }
});

(async () => {
    let failures = 0;
    for (const [id, fn] of tests) { try { await fn(); console.log('PASS ' + id); } catch (error) { failures++; console.error('FAIL ' + id + ': ' + error.stack); } }
    if (failures) { console.log(`B1_QUICK_FAILED ${failures}/${tests.length}`); process.exitCode = 1; }
    else console.log('B1_QUICK_OK');
})();

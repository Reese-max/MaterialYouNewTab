'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../scripts/pomodoro-music.js');
let count = 0;
function test(name, fn) { fn(); count++; console.log(`✓ ${name}`); }
const file = (overrides = {}) => ({ name: 'song.mp3', type: 'audio/mpeg', size: 1024, ...overrides });
test('File format, MIME, empty and size limits reject invalid input', () => {
    assert.equal(core.validate(file(), 0, 0), '');
    for (const input of [file({ name: 'evil.html' }), file({ type: 'text/html' })]) assert.equal(core.validate(input, 0, 0), 'format');
    for (const size of [0, -1, Infinity, core.MAX_FILE + 1]) assert.equal(core.validate(file({ size }), 0, 0), 'fileSize');
    assert.equal(core.validate(file({ type: '' }), 0, 0), '');
});
test('Library bounds apply before storing a blob', () => {
    assert.equal(core.validate(file(), core.MAX_TOTAL, 0), 'libraryFull');
    assert.equal(core.validate(file(), 0, core.MAX_TRACKS), 'libraryFull');
});
test('Settings discard blobs, arbitrary fields and invalid modes', () => {
    const normalized = core.normalize({ blob: file(), volume: Infinity, order: ['b', 'a', 'b', null], shuffle: 'yes', mode: 'bad' });
    assert.deepEqual(normalized.order, ['b', 'a']); assert.equal(normalized.volume, .5); assert.equal(normalized.mode, 'off'); assert.equal(normalized.shuffle, false); assert.ok(!('blob' in normalized));
    assert.equal(core.normalize({ volume: -1 }).volume, 0); assert.equal(core.normalize({ volume: 4 }).volume, 1);
});
test('Ordering preserves unknown tracks and never mutates input', () => {
    const tracks = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    assert.deepEqual(core.ordered(tracks, ['b', 'a']).map(x => x.id), ['b', 'a', 'c']); assert.equal(tracks[0].id, 'a');
});
test('Repeat off stops at end; one repeats; all wraps', () => {
    assert.equal(core.nextId(['a', 'b'], 'a', 'off', false), 'b');
    assert.equal(core.nextId(['a', 'b'], 'b', 'off', false), null);
    assert.equal(core.nextId(['a', 'b'], 'b', 'all', false), 'a');
    assert.equal(core.nextId(['a', 'b'], 'b', 'one', false), 'b');
});
test('Shuffle does not immediately repeat current track', () => {
    for (const r of [0, .2, .99]) assert.notEqual(core.nextId(['a', 'b', 'c'], 'b', 'all', true, () => r), 'b');
    assert.equal(core.nextId(['a'], 'a', 'off', true), null);
});
test('Quota has actionable distinct error classification', () => {
    assert.equal(core.errorKey({ name: 'QuotaExceededError' }), 'quota'); assert.equal(core.errorKey(new Error()), 'storageError');
});
test('Fade monotonically reaches silence without negative volume', () => {
    assert.equal(core.fadeVolume(.8, 0), .8); assert.equal(core.fadeVolume(.8, 125), .4); assert.equal(core.fadeVolume(.8, 250), 0); assert.equal(core.fadeVolume(.8, 1000), 0);
});
test('Seek clamps valid positions and rejects missing, infinite or invalid metadata', () => {
    assert.equal(core.seekTarget(-5, 30), 0); assert.equal(core.seekTarget('45', 30), 30); assert.equal(core.seekTarget('12.5', 30), 12.5);
    for (const duration of [0, -1, NaN, Infinity, undefined]) assert.equal(core.seekTarget(12, duration), null);
    for (const value of ['', ' ', null, undefined, NaN, Infinity, 'oops', {}, true]) assert.equal(core.seekTarget(value, 30), null);
});
test('Timeline requires selected metadata and ownership of active playback, not paused audio', () => {
    const media = { dataset: { track: 'a' }, duration: 30, currentTime: 12, readyState: 1, paused: false };
    assert.deepEqual(core.timeline(media, 'a', true), { duration: 30, current: 12, disabled: false });
    assert.equal(core.timeline(media, 'a', false).disabled, true);
    assert.equal(core.timeline({ ...media, paused: true }, 'a', false).disabled, false);
    for (const input of [null, { ...media, duration: Infinity }, { ...media, duration: NaN }, { ...media, readyState: 0 }, { ...media, error: {} }]) assert.equal(core.timeline(input, 'a', true).disabled, true);
    assert.deepEqual(core.timeline(media, 'b', true), { duration: 0, current: 0, disabled: true });
    assert.equal(core.timeline({ ...media, currentTime: 100 }, 'a', true).current, 30);
    assert.equal(core.timeline({ ...media, currentTime: -20 }, 'a', true).current, 0);
});
test('Elapsed time supports hours and has safe empty-state output', () => {
    assert.equal(core.formatTime(65.9), '1:05'); assert.equal(core.formatTime(3661), '1:01:01');
    for (const value of [-1, NaN, Infinity, undefined]) assert.equal(core.formatTime(value), '0:00');
});
const source = fs.readFileSync(require.resolve('../scripts/pomodoro-music.js'), 'utf8');
class Element {
    constructor(tag, document) { this.tag = tag; this.ownerDocument = document; this.children = []; this.listeners = {}; this.dataset = {}; this.hidden = false; this.style = { setProperty(name, value) { this[name] = value; } }; }
    get disabled() { return this._disabled || false; }
    set disabled(value) { this._disabled = value; if (value && this.ownerDocument?.activeElement === this) this.ownerDocument.activeElement = this.ownerDocument.body; }
    focus() { if (!this.disabled && this.ownerDocument) { this.ownerDocument.activeElement = this; this.ownerDocument.focusChanged?.(this); } }
    append(child) { this.children.push(child); }
    replaceChildren() { this.children = []; }
    addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
    setAttribute(name, value) { this[name] = value; }
    emit(name, detail = {}) { for (const fn of this.listeners[name] || []) fn({ currentTarget: this, ...detail }); }
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate) {
    for (let i = 0; i < 200; i++) { if (predicate()) return; await sleep(5); }
    assert.ok(predicate(), 'asynchronous fixture reached expected state');
}
function sharedLibrary(initial = [{ id: 'a', name: '<script>safe.mp3', blob: file() }, { id: 'b', name: 'second.mp3', blob: file() }], notify = false) {
    const shared = { records: new Map(initial.map(record => [record.id, record])), values: new Map(), tabs: new Set(), channels: new Set(), notify, nextId: 0 };
    let queue = Promise.resolve();
    // Model transaction serialization and rollback, not just individual requests.
    shared.db = { transaction(_store, mode) {
        const operations = []; let aborted = false;
        const enqueue = (operation, value) => { const req = {}; operations.push({ operation, value, req }); return req; };
        const tx = {
            objectStore: () => ({ getAll: () => enqueue('getAll'), put: value => enqueue('put', value), delete: value => enqueue('delete', value) }),
            abort: () => { aborted = true; }
        };
        queue = queue.then(() => new Promise(resolve => {
            const working = new Map(shared.records);
            const step = () => {
                if (aborted) { tx.onabort?.(); resolve(); return; }
                const next = operations.shift();
                if (!next) { if (mode === 'readwrite') shared.records = working; tx.oncomplete?.(); resolve(); return; }
                const { operation, value, req } = next;
                if (operation === 'getAll') req.result = [...working.values()];
                else if (operation === 'put') { working.set(value.id, value); req.result = value.id; }
                else working.delete(value);
                req.onsuccess?.({ target: req });
                setTimeout(step, 0);
            };
            setTimeout(step, 0);
        }));
        return tx;
    } };
    shared.BroadcastChannel = class {
        constructor(name) { this.name = name; shared.channels.add(this); }
        postMessage(data) { for (const other of shared.channels) if (other !== this && other.name === this.name) setTimeout(() => other.onmessage?.({ data }), 0); }
        close() { shared.channels.delete(this); }
    };
    return shared;
}
async function browserFixture({ locked = false, playError = null, noLocks = false, confirm = true, shared = sharedLibrary() } = {}) {
    const host = new Element('div'), events = {}, audios = [], values = shared.values; let revoked = 0, lockReleased = 0, lockRequests = 0, confirmations = 0;
    const db = shared.db;
    class Audio extends Element {
        constructor() { super('audio'); this.paused = true; this.volume = 1; this.currentTime = 0; this.duration = NaN; this.readyState = 0; audios.push(this); }
        async play() { this.playCalls = (this.playCalls || 0) + 1; if (playError) throw Object.assign(new Error(), { name: playError }); this.paused = false; this.emit('playing'); }
        pause() { this.paused = true; this.emit('pause'); }
        removeAttribute() { this.readyState = 0; this.duration = NaN; } load() { this.emit('emptied'); }
        set src(value) { this._src = value; queueMicrotask(() => { this.readyState = 1; this.duration = 30; this.onloadedmetadata?.(); this.emit('loadedmetadata'); }); }
        get src() { return this._src; }
    }
    const window = { document: null, crypto: { randomUUID: () => `track-${++shared.nextId}` }, confirm: () => { confirmations++; return confirm; }, addEventListener(name, fn) { events[name] = fn; } };
    if (shared.notify) window.BroadcastChannel = shared.BroadcastChannel;
    const document = { addEventListener(name, fn) { events[name] = fn; }, readyState: 'complete', getElementById: () => host, createElement: tag => new Element(tag, document), focusChanged: target => events.focusin?.({ target }) }; window.document = document;
    document.body = new Element('body', document); document.activeElement = document.body;
    const navigator = noLocks ? {} : { locks: { request: async (_name, _options, fn) => { lockRequests++; await fn(locked ? null : {}); lockReleased++; } } };
    shared.tabs.add(events);
    const context = { window, document, navigator, currentLanguage: 'en', localStorage: { getItem: key => values.get(key) || null, setItem(k, v) { const oldValue = values.get(k); values.set(k, v); if (shared.notify && oldValue !== v) for (const other of shared.tabs) if (other !== events) setTimeout(() => other.storage?.({ key: k, newValue: v }), 0); }, removeItem: k => values.delete(k) }, indexedDB: { open() { const req = { result: db }; setTimeout(() => req.onsuccess(), 0); return req; } }, Audio, URL: { createObjectURL: () => 'blob:local', revokeObjectURL: () => revoked++ }, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, console };
    vm.runInNewContext(source, context); await sleep(25);
    const flat = el => [el, ...el.children.flatMap(flat)];
    return { api: window.myntPomoMusic, document, events, audios, shared, get revoked() { return revoked; }, get lockReleased() { return lockReleased; }, get lockRequests() { return lockRequests; }, get confirmations() { return confirmations; }, get buttons() { return flat(host).filter(x => x.tag === 'button'); }, get input() { return flat(host).find(x => x.type === 'file'); }, get seek() { return flat(host).find(x => x['aria-label'] === 'Playback position'); }, get volume() { return flat(host).find(x => x.type === 'range' && x['aria-label'] === 'Volume'); }, get current() { return flat(host).find(x => x.className === 'mynt-music-current'); }, get disclosure() { return flat(host).find(x => x.className === 'mynt-music-library'); }, get status() { return flat(host).find(x => x.role === 'status')?.textContent; }, host };
}
(async () => {
    const f = await browserFixture();
    assert.equal(f.audios.length, 0); count++; console.log('✓ Reload mounts without creating or playing audio');
    assert.equal(f.seek.disabled, true); assert.equal(f.seek['aria-valuetext'], '0:00 / 0:00');
    assert.notEqual(f.disclosure.open, true); assert.equal(f.current.textContent, '<script>safe.mp3'); assert.equal(f.current.title, '<script>safe.mp3');
    assert.equal(f.buttons.find(x => x.textContent === 'Pause').disabled, true);
    f.seek.value = '15'; f.seek.emit('input'); assert.equal(f.audios.length, 0);
    count++; console.log('✓ Compact selected title is safe text; library starts collapsed and unloaded seeking is disabled');
    assert.equal(f.api.getTracks()[0].name, '<script>safe.mp3');
    f.buttons.find(x => x.textContent === 'Play').emit('click'); await sleep(10);
    assert.equal(f.audios[0].paused, false); assert.equal(f.status, 'Playing'); count++; console.log('✓ Explicit play gesture acquires audio ownership');
    assert.equal(f.seek.disabled, false); assert.equal(f.seek.max, '30');
    assert.equal(f.buttons.find(x => x.textContent === 'Play').disabled, true); assert.equal(f.buttons.find(x => x.textContent === 'Pause').disabled, false);
    f.audios[0].currentTime = 12.8; f.audios[0].emit('timeupdate'); assert.equal(f.seek.value, '12.8'); assert.equal(f.seek['aria-valuetext'], '0:12 / 0:30');
    f.seek.value = '100'; f.seek.emit('input'); assert.equal(f.audios[0].currentTime, 30);
    f.seek.value = '-1'; f.seek.emit('input'); assert.equal(f.audios[0].currentTime, 0);
    f.seek.value = '12.5'; f.seek.emit('input'); assert.equal(f.audios[0].currentTime, 12.5);
    assert.equal(f.audios[0].playCalls, 1); assert.equal(f.lockRequests, 1);
    f.audios[0].duration = Infinity; f.audios[0].emit('durationchange'); assert.equal(f.seek.disabled, true);
    f.seek.value = '4'; f.seek.emit('input'); assert.equal(f.audios[0].currentTime, 12.5);
    f.audios[0].duration = 30; f.audios[0].emit('loadedmetadata'); assert.equal(f.seek.disabled, false);
    f.audios[0].paused = true; f.audios[0].emit('pause'); assert.equal(f.status, 'Paused'); assert.equal(f.buttons.find(x => x.textContent === 'Play').disabled, false);
    f.audios[0].paused = false; f.audios[0].emit('playing'); assert.equal(f.status, 'Playing'); assert.equal(f.buttons.find(x => x.textContent === 'Pause').disabled, false);
    f.volume.value = '.7'; f.volume.emit('input'); assert.equal(f.audios[0].volume, .7); assert.equal(f.volume['aria-valuetext'], '70%');
    assert.equal(f.volume.style['--music-progress'], '70%');
    count++; console.log('✓ Metadata, playback events, bounded seeking and volume synchronize without extra playback or lock requests');
    f.api.pause(); assert.equal(f.audios[0].paused, false); await sleep(150); f.api.pause(); await sleep(140);
    assert.equal(f.audios[0].paused, true); assert.equal(f.lockReleased, 1); count++; console.log('✓ Repeated pause does not restart fade; ownership is released');
    assert.equal(f.buttons.find(x => x.textContent === 'Play').disabled, false); assert.equal(f.buttons.find(x => x.textContent === 'Pause').disabled, true);
    f.seek.value = '8'; f.seek.emit('input'); assert.equal(f.audios[0].currentTime, 8); assert.equal(f.audios[0].paused, true);
    assert.equal(f.audios[0].playCalls, 1); assert.equal(f.lockRequests, 1);
    count++; console.log('✓ Seeking a paused local track stays paused and does not acquire playback ownership');
    f.buttons.find(x => x.textContent === 'Play').emit('click'); await sleep(10);
    f.events['mynt:pomodoro-state']({ detail: { phase: 'shortBreak', isRunning: true } }); await sleep(290);
    assert.equal(f.audios[0].paused, true); count++; console.log('✓ Break policy pauses without automatic resume');
    f.buttons.find(x => x.textContent === 'Play').emit('click'); await sleep(10);
    f.events['mynt:pomodoro-state']({ detail: { phase: 'shortBreak', isRunning: true, timeRemaining: 100 } }); await sleep(290);
    assert.equal(f.audios[0].paused, false); count++; console.log('✓ Manual resume during a running break survives subsequent timer ticks');
    f.api.applySettings({ ...f.api.getSettings(), restPolicy: 'continue' });
    f.buttons.find(x => x.textContent === 'Play').emit('click'); await sleep(10);
    f.events['mynt:pomodoro-state']({ detail: { phase: 'shortBreak', isRunning: true } }); await sleep(10);
    assert.equal(f.audios[0].paused, false); count++; console.log('✓ Continue policy leaves break music playing');
    f.events.pagehide(); assert.equal(f.audios[0].paused, true); assert.equal(f.revoked, 1); count++; console.log('✓ Page exit stops sound and revokes blob URL');
    const busy = await browserFixture({ locked: true }); busy.buttons.find(x => x.textContent === 'Play').emit('click'); await sleep(10);
    assert.equal(busy.audios.length, 0); assert.match(busy.status, /another tab/); count++; console.log('✓ Cross-tab lock conflict does not start audio');
    const blocked = await browserFixture({ playError: 'NotAllowedError' }); blocked.buttons.find(x => x.textContent === 'Play').emit('click'); await sleep(10);
    assert.match(blocked.status, /Press Play again/); assert.equal(blocked.audios[0].paused, true); count++; console.log('✓ Autoplay rejection is explained and releases playback');
    const focusFixture = await browserFixture();
    const focusPlay = focusFixture.buttons.find(x => x.textContent === 'Play'), focusPause = focusFixture.buttons.find(x => x.textContent === 'Pause');
    focusPlay.focus(); focusPlay.emit('click'); await until(() => focusFixture.audios[0]?.paused === false);
    assert.equal(focusFixture.document.activeElement, focusPause);
    focusPause.emit('click'); await until(() => focusFixture.audios[0].paused);
    assert.equal(focusFixture.document.activeElement, focusPlay);
    count++; console.log('✓ User-activated Play and faded Pause hand keyboard focus to the enabled counterpart');
    focusPlay.emit('click'); focusFixture.volume.focus(); await until(() => focusFixture.audios[0].paused === false);
    assert.equal(focusFixture.document.activeElement, focusFixture.volume);
    focusPause.focus(); focusPause.emit('click'); focusFixture.volume.focus(); await until(() => focusFixture.audios[0].paused);
    assert.equal(focusFixture.document.activeElement, focusFixture.volume);
    focusPlay.focus(); focusFixture.audios[0].paused = false; focusFixture.audios[0].emit('playing');
    assert.notEqual(focusFixture.document.activeElement, focusPause);
    focusPause.focus(); focusFixture.audios[0].paused = true; focusFixture.audios[0].emit('pause');
    assert.notEqual(focusFixture.document.activeElement, focusPlay);
    focusFixture.events.pagehide(); count++; console.log('✓ Moved focus and background playback events never trigger a transport focus handoff');
    assert.equal(busy.seek.disabled, true);
    const switched = await browserFixture(); switched.buttons.find(x => x.textContent === 'Play').emit('click'); await sleep(10);
    const oldAudio = switched.audios[0]; oldAudio.currentTime = 15; oldAudio.emit('timeupdate');
    switched.buttons.find(x => x.textContent === 'second.mp3').emit('click');
    assert.equal(switched.current.textContent, 'second.mp3'); assert.equal(switched.seek.disabled, true); assert.equal(switched.seek['aria-valuetext'], '0:00 / 0:00');
    assert.equal(oldAudio.paused, true); assert.equal(switched.revoked, 1);
    oldAudio.duration = 300; oldAudio.readyState = 1; oldAudio.emit('loadedmetadata'); oldAudio.emit('timeupdate'); oldAudio.emit('ended');
    await sleep(10); assert.equal(switched.audios.length, 1); assert.equal(switched.seek.max, '1'); assert.equal(switched.status, 'Ready. Press Play to listen.');
    count++; console.log('✓ Selection resets metadata without autoplay; detached audio events cannot alter the selected track');
    const fallback = await browserFixture({ noLocks: true }); fallback.buttons.find(x => x.textContent === 'Play').emit('click'); await sleep(10);
    fallback.shared.values.set('myntPomoMusicOwnerV1', 'other-tab'); fallback.events.storage({ key: 'myntPomoMusicOwnerV1', newValue: 'other-tab' });
    assert.equal(fallback.audios[0].paused, true); assert.match(fallback.status, /another tab/);
    fallback.seek.value = '4'; fallback.seek.emit('input'); assert.equal(fallback.audios[0].currentTime, 4);
    assert.equal(fallback.audios[0].paused, true); assert.equal(fallback.audios[0].playCalls, 1); assert.equal(fallback.shared.values.get('myntPomoMusicOwnerV1'), 'other-tab');
    fallback.events.pagehide(); switched.events.pagehide(); blocked.events.pagehide(); busy.events.pagehide();
    count++; console.log('✓ Losing fallback ownership pauses audio; seeking never takes ownership back from another tab');
    const declined = await browserFixture({ confirm: false }); declined.buttons.find(x => x.textContent === 'Delete track').emit('click'); await sleep(10);
    assert.equal(declined.confirmations, 1); assert.equal(declined.api.getTracks().length, 2); assert.equal(declined.buttons.find(x => x.textContent === 'Undo deletion').hidden, true);
    declined.events.pagehide(); count++; console.log('✓ Discreet delete still requires confirmation and cancellation leaves the library intact');
    const longName = '很長的專注播放曲目名稱'.repeat(12) + '.mp3';
    const restored = await browserFixture({ shared: sharedLibrary([{ id: 'long', name: longName, blob: file() }]) });
    assert.equal(restored.current.title, longName); assert.equal(restored.buttons.find(x => x.className === 'mynt-music-track').title, longName);
    restored.buttons.find(x => x.textContent === 'Delete track').emit('click');
    await until(() => restored.api.getTracks().length === 0);
    assert.equal(restored.current.textContent, 'No track selected'); assert.equal(restored.seek.disabled, true); assert.equal(restored.buttons.find(x => x.textContent === 'Play').disabled, true);
    restored.buttons.find(x => x.textContent === 'Undo deletion').emit('click'); await until(() => restored.api.getTracks().length === 1);
    assert.equal(restored.current.title, longName); assert.equal(restored.buttons.find(x => x.textContent === 'Undo deletion').hidden, true); assert.equal(restored.audios.length, 0);
    restored.events.pagehide(); count++; console.log('✓ Full long filenames remain accessible; last-track deletion and undo update the compact state without autoplay');
    const importAudio = (fixture, files) => { fixture.input.files = files; fixture.input.emit('change'); };
    const records = count => Array.from({ length: count }, (_, i) => ({ id: `seed-${i}`, name: `seed-${i}.mp3`, blob: file() }));
    const capped = sharedLibrary(records(29)), capA = await browserFixture({ shared: capped }), capB = await browserFixture({ shared: capped });
    importAudio(capA, [file({ name: 'from-a.mp3' })]); importAudio(capB, [file({ name: 'from-b.mp3' })]);
    await until(() => !capA.input.disabled && !capB.input.disabled);
    assert.equal(capped.records.size, 30); assert.ok([capA.status, capB.status].some(status => status.includes('Library limit')));
    count++; console.log('✓ Concurrent stale tabs cannot import beyond 30 tracks');
    const large = sharedLibrary(records(2).map(record => ({ ...record, blob: file({ size: 100 * 1024 * 1024 }) })));
    const largeA = await browserFixture({ shared: large }), largeB = await browserFixture({ shared: large });
    importAudio(largeA, [file({ size: 75 * 1024 * 1024 })]); importAudio(largeB, [file({ size: 75 * 1024 * 1024 })]);
    await until(() => !largeA.input.disabled && !largeB.input.disabled);
    assert.equal([...large.records.values()].reduce((sum, record) => sum + record.blob.size, 0), 275 * 1024 * 1024);
    count++; console.log('✓ Atomic transaction also enforces shared total-byte cap');
    const undoShared = sharedLibrary(records(29)), undoA = await browserFixture({ shared: undoShared }), undoB = await browserFixture({ shared: undoShared });
    undoA.buttons.find(x => x.textContent === 'Delete track').emit('click');
    await until(() => undoShared.records.size === 28 && undoA.status.includes('deleted'));
    importAudio(undoB, [file({ name: 'new-1.mp3' }), file({ name: 'new-2.mp3' })]);
    await until(() => !undoB.input.disabled); assert.equal(undoShared.records.size, 30);
    undoA.buttons.find(x => x.textContent === 'Undo deletion').emit('click');
    await until(() => undoA.status.includes('Library limit'));
    assert.equal(undoShared.records.size, 30); assert.ok(!undoShared.records.has('seed-0'));
    assert.equal(undoA.buttons.find(x => x.textContent === 'Undo deletion').hidden, false);
    count++; console.log('✓ Stale-tab undo cannot exceed shared cap and remains recoverable');
    const undoBytes = sharedLibrary(records(3).map(record => ({ ...record, blob: file({ size: 100 * 1024 * 1024 }) })));
    const undoBytesA = await browserFixture({ shared: undoBytes }), undoBytesB = await browserFixture({ shared: undoBytes });
    undoBytesA.buttons.find(x => x.textContent === 'Delete track').emit('click');
    await until(() => undoBytes.records.size === 2 && undoBytesA.status.includes('deleted'));
    importAudio(undoBytesB, [file({ name: 'replacement.mp3', size: 50 * 1024 * 1024 })]);
    await until(() => !undoBytesB.input.disabled);
    undoBytesA.buttons.find(x => x.textContent === 'Undo deletion').emit('click');
    await until(() => undoBytesA.status.includes('Library limit'));
    assert.equal([...undoBytes.records.values()].reduce((sum, record) => sum + record.blob.size, 0), 250 * 1024 * 1024);
    assert.ok(!undoBytes.records.has('seed-0')); count++; console.log('✓ Stale-tab undo also observes the shared byte cap');
    const live = sharedLibrary(undefined, true), liveA = await browserFixture({ shared: live }), liveB = await browserFixture({ shared: live });
    liveA.buttons.find(x => x.textContent === 'Play').emit('click'); await sleep(20);
    const playing = liveA.audios[0]; assert.equal(playing.paused, false);
    liveB.api.applySettings({ ...liveB.api.getSettings(), selectedId: 'a', volume: .2 });
    await until(() => playing.volume === .2); assert.equal(playing.playCalls, 1);
    liveB.buttons.find(x => x.textContent === 'Delete track').emit('click');
    await until(() => playing.paused && liveA.api.getTracks().length === 1);
    assert.equal(liveA.revoked, 1); assert.equal(playing.playCalls, 1); assert.equal(liveB.audios.length, 0);
    count++; console.log('✓ Remote settings do not restart audio; remote deletion stops and unloads stale playback');
    liveA.events.pagehide(); liveB.events.pagehide();
    f.events.pageshow({ persisted: true }); f.buttons.find(x => x.textContent === 'Play').emit('click'); await sleep(20);
    assert.equal(f.audios.length, 2); assert.equal(f.audios[1].paused, false);
    f.events.pagehide(); count++; console.log('✓ Returning from pagehide rebuilds unloaded audio before manual play');
    const resetShared=sharedLibrary();resetShared.values.set('myntPomoMusicSettingsV1',JSON.stringify({volume:.1,mode:'all'}));
    resetShared.values.clear(); // Settings reset does not touch the independent media database.
    const afterReset=await browserFixture({shared:resetShared});
    assert.equal(afterReset.api.getTracks().length,2);assert.equal(afterReset.api.getSettings().volume,.5);assert.equal(afterReset.audios.length,0);
    afterReset.buttons.find(x=>x.textContent==='Play').emit('click');await until(()=>afterReset.audios[0]?.paused===false);afterReset.events.pagehide();
    count++;console.log('✓ After settings reset, imported tracks remain listed and playable with default settings');
    console.log(`${count} Pomodoro music checks passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });

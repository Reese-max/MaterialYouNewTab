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
const source = fs.readFileSync(require.resolve('../scripts/pomodoro-music.js'), 'utf8');
class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.dataset = {}; this.hidden = false; }
    append(child) { this.children.push(child); }
    replaceChildren() { this.children = []; }
    addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
    setAttribute(name, value) { this[name] = value; }
    emit(name, detail = {}) { for (const fn of this.listeners[name] || []) fn({ currentTarget: this, ...detail }); }
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function browserFixture({ locked = false, playError = null } = {}) {
    const host = new Element('div'), events = {}, audios = [], values = new Map(); let revoked = 0, lockReleased = 0;
    const records = [{ id: 'a', name: '<script>safe.mp3', blob: file() }, { id: 'b', name: 'second.mp3', blob: file() }];
    const db = { transaction() {
        const tx = { objectStore() { return { getAll() { const req = { result: records }; setTimeout(() => tx.oncomplete(), 0); return req; } }; } }; return tx;
    } };
    class Audio extends Element {
        constructor() { super('audio'); this.paused = true; this.volume = 1; this.currentTime = 0; this.duration = 30; audios.push(this); }
        async play() { if (playError) throw Object.assign(new Error(), { name: playError }); this.paused = false; }
        pause() { this.paused = true; }
        removeAttribute() {} load() {}
    }
    const window = { document: null, crypto: { randomUUID: () => 'owner' }, confirm: () => true, addEventListener(name, fn) { events[name] = fn; } };
    const document = { addEventListener(name, fn) { events[name] = fn; }, readyState: 'complete', getElementById: () => host, createElement: tag => new Element(tag) }; window.document = document;
    const navigator = { locks: { request: async (_name, _options, fn) => { await fn(locked ? null : {}); lockReleased++; } } };
    const context = { window, document, navigator, currentLanguage: 'en', localStorage: { getItem: key => values.get(key) || null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) }, indexedDB: { open() { const req = { result: db }; setTimeout(() => req.onsuccess(), 0); return req; } }, Audio, URL: { createObjectURL: () => 'blob:local', revokeObjectURL: () => revoked++ }, setTimeout, clearTimeout, setInterval, clearInterval, console };
    vm.runInNewContext(source, context); await sleep(25);
    const flat = el => [el, ...el.children.flatMap(flat)];
    return { api: window.myntPomoMusic, events, audios, get revoked() { return revoked; }, get lockReleased() { return lockReleased; }, get buttons() { return flat(host).filter(x => x.tag === 'button'); }, get status() { return flat(host).find(x => x.role === 'status')?.textContent; }, host };
}
(async () => {
    const f = await browserFixture();
    assert.equal(f.audios.length, 0); count++; console.log('✓ Reload mounts without creating or playing audio');
    assert.equal(f.api.getTracks()[0].name, '<script>safe.mp3');
    f.buttons.find(x => x.textContent === 'Play').emit('click'); await sleep(10);
    assert.equal(f.audios[0].paused, false); assert.equal(f.status, 'Playing'); count++; console.log('✓ Explicit play gesture acquires audio ownership');
    f.api.pause(); assert.equal(f.audios[0].paused, false); await sleep(150); f.api.pause(); await sleep(140);
    assert.equal(f.audios[0].paused, true); assert.equal(f.lockReleased, 1); count++; console.log('✓ Repeated pause does not restart fade; ownership is released');
    f.buttons.find(x => x.textContent === 'Play').emit('click'); await sleep(10);
    f.events['mynt:pomodoro-state']({ detail: { phase: 'shortBreak', isRunning: true } }); await sleep(290);
    assert.equal(f.audios[0].paused, true); count++; console.log('✓ Break policy pauses without automatic resume');
    f.api.applySettings({ ...f.api.getSettings(), restPolicy: 'continue' });
    f.buttons.find(x => x.textContent === 'Play').emit('click'); await sleep(10);
    f.events['mynt:pomodoro-state']({ detail: { phase: 'shortBreak', isRunning: true } }); await sleep(10);
    assert.equal(f.audios[0].paused, false); count++; console.log('✓ Continue policy leaves break music playing');
    f.events.pagehide(); assert.equal(f.audios[0].paused, true); assert.equal(f.revoked, 1); count++; console.log('✓ Page exit stops sound and revokes blob URL');
    const busy = await browserFixture({ locked: true }); busy.buttons.find(x => x.textContent === 'Play').emit('click'); await sleep(10);
    assert.equal(busy.audios.length, 0); assert.match(busy.status, /another tab/); count++; console.log('✓ Cross-tab lock conflict does not start audio');
    const blocked = await browserFixture({ playError: 'NotAllowedError' }); blocked.buttons.find(x => x.textContent === 'Play').emit('click'); await sleep(10);
    assert.match(blocked.status, /Press Play again/); assert.equal(blocked.audios[0].paused, true); count++; console.log('✓ Autoplay rejection is explained and releases playback');
    console.log(`${count} Pomodoro music checks passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; });

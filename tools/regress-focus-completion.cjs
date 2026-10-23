#!/usr/bin/env node
'use strict';
// Production modules, disposable in-memory boundaries, and a deterministic clock.
// This is not real browser/media decoding, audible output, or real sleep testing.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const timerCore = require('../scripts/pomodoro-timer-core.js');
const musicSource = fs.readFileSync(require.resolve('../scripts/pomodoro-music.js'), 'utf8');
let checks = 0;
const pass = label => { checks++; console.log('PASS ' + label); };

function clock() {
    let now = 1900000000000, sequence = 0;
    const pending = new Map();
    const schedule = (fn, delay = 0, repeat = false) => {
        const id = ++sequence; pending.set(id, { fn, at: now + delay, delay, repeat }); return id;
    };
    const api = {
        now: () => now,
        setTimeout: (fn, delay) => schedule(fn, delay), clearTimeout: id => pending.delete(id),
        setInterval: (fn, delay) => schedule(fn, delay, true), clearInterval: id => pending.delete(id),
        async flush() {
            // Drain promise chains and ready tasks without waiting for real time.
            for (let turn = 0; turn < 80; turn++) {
                await Promise.resolve();
                const ready = [...pending].filter(([, item]) => item.at <= now);
                for (const [id, item] of ready) {
                    if (!pending.has(id)) continue;
                    if (item.repeat) item.at = now + item.delay; else pending.delete(id);
                    item.fn();
                }
            }
        },
        async jump(ms) { now += ms; await api.flush(); }
    };
    return api;
}
function locks() {
    const held = new Set(), waiting = new Map();
    let granted = 0;
    return { get granted() { return granted; }, held, request(name, options, callback) {
        if (typeof options === 'function') { callback = options; options = {}; }
        return new Promise((resolve, reject) => {
            const execute = () => {
                if (held.has(name)) {
                    if (options.ifAvailable) { Promise.resolve().then(() => callback(null)).then(resolve, reject); return; }
                    const queue = waiting.get(name) || []; queue.push(execute); waiting.set(name, queue); return;
                }
                held.add(name); granted++;
                Promise.resolve().then(() => callback({ name })).then(resolve, reject).finally(() => {
                    held.delete(name); waiting.get(name)?.shift()?.();
                });
            };
            execute();
        });
    } };
}
const storage = () => {
    const values = new Map();
    return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
};

async function timerChecks() {
    const time = clock(), shared = storage(), mutex = locks(), completions = [];
    const options = { storage: shared, locks: mutex, now: time.now, onComplete: (completed, next) => completions.push({ completed, next }) };
    const a = timerCore.create(options), b = timerCore.create(options);
    await a.setDurations({ workMinutes: 120, shortBreakMinutes: 60, longBreakMinutes: 60 });
    await a.setTask('Long-form reading'); await a.start();
    const deadline = a.getState().endAt, sessionId = a.getState().sessionId;
    await time.jump(90 * 60000 + 333); await b.tick(); a.sync();
    assert.equal(a.getState().timeRemaining, 1800);
    assert.equal(a.getState().endAt, deadline);
    assert.equal(a.getState().sessionId, sessionId);
    await time.jump(-30000); await a.tick();
    assert.equal(a.getState().timeRemaining, 1830, 'wall-clock rollback follows the unchanged deadline, not repeated interval decrements');
    assert.equal(a.getState().endAt, deadline);
    await time.jump(12 * 3600000);
    await Promise.all(Array.from({ length: 24 }, (_, index) => (index % 2 ? a : b).tick()));
    assert.equal(completions.length, 1);
    assert.equal(completions[0].completed.sessionId, sessionId);
    assert.equal(a.getState().phase, 'shortBreak'); assert.equal(b.getState().phase, 'shortBreak');
    assert.equal(a.getState().timeRemaining, 3600); assert.equal(a.getState().isRunning, false);
    assert.equal(timerCore.create(options).getState().task, 'Long-form reading');
    await a.tick(); await b.tick(); assert.equal(completions.length, 1);
    pass('timer: two tabs, two-hour session, delayed ticks, clock rollback, 12-hour wake, reload, one completion');

    shared.setItem('pomodoroAutoStart', 'true'); await a.start();
    await time.jump(3 * 86400000);
    await Promise.all([a.tick(), b.tick(), a.tick(), b.tick()]);
    assert.equal(completions.length, 2); assert.equal(a.getState().phase, 'work');
    assert.equal(a.getState().endAt, time.now() + 120 * 60000);
    assert.equal(a.getState().currentRound, 2);
    pass('timer: auto-start reconciles only one phase after multi-day sleep');

    const faultyStore = storage(); let alarmCalls = 0;
    const faultOptions = { storage: faultyStore, locks: locks(), now: time.now, onComplete() { alarmCalls++; throw Error('simulated audio failure'); } };
    const failing = timerCore.create(faultOptions); await failing.setDurations({ workMinutes: 1 }); await failing.start();
    await time.jump(61000); await assert.rejects(failing.tick(), /simulated audio failure/);
    await failing.tick(); await timerCore.create(faultOptions).tick();
    assert.equal(alarmCalls, 1); assert.equal(failing.getState().phase, 'shortBreak');
    pass('timer: completion is committed before a failing alarm; retries/reload never replay it');

    for (const mode of ['no-locks', 'denied-locks', 'failed-storage']) {
        const safeStore = mode === 'failed-storage' ? { getItem: () => null, setItem() { throw Error('quota'); } } : storage();
        let effects = 0;
        const silent = timerCore.create({ storage: safeStore, locks: mode === 'no-locks' ? null : mode === 'denied-locks' ? { request: () => Promise.reject(Error('denied')) } : locks(), now: time.now, onComplete: () => effects++ });
        await silent.setDurations({ workMinutes: 1 }); await silent.start(); await time.jump(61000); await silent.tick();
        assert.equal(effects, 0); assert.equal(silent.getState().phase, 'shortBreak');
        assert.notEqual(silent.getState().safetyStatus, 'ready');
    }
    pass('timer: unavailable coordination/storage remains usable but fails silent for completion effects');
}

class Element {
    constructor(tag, ownerDocument) { this.tag = tag; this.ownerDocument = ownerDocument; this.children = []; this.listeners = {}; this.dataset = {}; this.style = { setProperty(name, value) { this[name] = value; } }; }
    append(...items) { this.children.push(...items); }
    replaceChildren(...items) { this.children = items; }
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
    setAttribute(name, value) { this[name] = String(value); }
    focus() { this.ownerDocument.activeElement = this; }
    emit(name, detail = {}) { const event = { target: this, currentTarget: this, ...detail }; this['on' + name]?.(event); for (const fn of this.listeners[name] || []) fn(event); }
}
function mediaStore(time) {
    const shared = { storage: storage(), locks: locks(), records: new Map(), tabs: new Set(), nextId: 0 };
    for (const id of ['a', 'b']) shared.records.set(id, { id, name: id + '.mp3', blob: { name: id + '.mp3', type: 'audio/mpeg', size: 1024 } });
    let queue = Promise.resolve();
    shared.db = { transaction(_name, mode) {
        const operations = [], tx = { objectStore: () => ({ getAll: () => add('getAll'), put: value => add('put', value), delete: value => add('delete', value) }), abort() { tx.aborted = true; } };
        function add(kind, value) { const request = {}; operations.push({ kind, value, request }); return request; }
        queue = queue.then(() => new Promise(resolve => {
            const working = new Map(shared.records);
            const step = () => {
                if (tx.aborted) { tx.onabort?.(); resolve(); return; }
                const item = operations.shift();
                if (!item) { if (mode === 'readwrite') shared.records = working; tx.oncomplete?.(); resolve(); return; }
                if (item.kind === 'getAll') item.request.result = [...working.values()];
                if (item.kind === 'put') working.set(item.value.id, item.value);
                if (item.kind === 'delete') working.delete(item.value);
                item.request.onsuccess?.(); time.setTimeout(step, 0);
            };
            time.setTimeout(step, 0);
        }));
        return tx;
    } };
    return shared;
}
async function musicTab(shared, time, options = {}) {
    const events = new Element('events'), document = new Element('document'), host = new Element('div', document), audios = [], revoked = [];
    document.body = new Element('body', document); document.activeElement = document.body;
    document.readyState = 'complete'; document.hidden = false;
    document.getElementById = () => host; document.createElement = tag => new Element(tag, document);
    class Audio extends Element {
        constructor() { super('audio', document); this.dataset = {}; this.paused = true; this.duration = NaN; this.currentTime = 0; this.readyState = 0; this.volume = 1; this.playCalls = 0; audios.push(this); }
        set src(value) { this._src = value; time.setTimeout(() => { this.readyState = 1; this.duration = this.preload === 'metadata' ? options.probeDuration ?? 10800 : 10800; this.emit('loadedmetadata'); }, 0); }
        get src() { return this._src; }
        async play() { this.playCalls++; if (options.playError) throw Object.assign(Error('play failed'), { name: options.playError }); this.paused = false; this.emit('playing'); }
        pause() { this.paused = true; this.emit('pause'); }
        removeAttribute(name) { if (name === 'src') { this._src = ''; this.duration = NaN; this.readyState = 0; } }
        load() { this.emit('emptied'); }
    }
    const window = { document, crypto: { randomUUID: () => 'fixture-' + (++shared.nextId) }, addEventListener: events.addEventListener.bind(events), confirm: () => false };
    const localStorage = {
        getItem: shared.storage.getItem,
        setItem(key, value) {
            const oldValue = shared.storage.getItem(key); shared.storage.setItem(key, value);
            if (oldValue !== value) for (const tab of shared.tabs) if (tab !== events) time.setTimeout(() => tab.emit('storage', { key, newValue: value }), 0);
        },
        removeItem: shared.storage.removeItem
    };
    shared.tabs.add(events);
    const context = { window, document, navigator: { locks: shared.locks }, localStorage, Audio, currentLanguage: 'en', console,
        Date: class extends Date { static now() { return time.now(); } },
        setTimeout: time.setTimeout, clearTimeout: time.clearTimeout, setInterval: time.setInterval, clearInterval: time.clearInterval,
        URL: { createObjectURL: () => 'blob:fixture-' + (++shared.nextId), revokeObjectURL: url => revoked.push(url) },
        indexedDB: { open() { const request = { result: shared.db }; time.setTimeout(() => request.onsuccess?.(), 0); return request; } }
    };
    vm.runInNewContext(musicSource, context); await time.flush();
    const flatten = node => [node, ...node.children.flatMap(flatten)];
    return { api: window.myntPomoMusic, events, document, audios, revoked, get nodes() { return flatten(host); },
        find: className => flatten(host).find(node => node.className === className),
        button: label => flatten(host).find(node => node.tag === 'button' && node.textContent === label),
        input: type => flatten(host).find(node => node.type === type),
        get status() { return flatten(host).find(node => node.role === 'status')?.textContent; },
        get seek() { return flatten(host).find(node => node['aria-label'] === 'Playback position'); }
    };
}

async function musicChecks() {
    const time = clock(), shared = mediaStore(time), a = await musicTab(shared, time), b = await musicTab(shared, time);
    assert.equal(a.audios.length + b.audios.length, 0, 'mount/reload never autoplays');
    a.button('Play').emit('click'); b.button('Play').emit('click'); await time.flush();
    assert.equal(a.audios.length, 1); assert.equal(b.audios.length, 0); assert.match(b.status, /another tab/);
    const first = a.audios[0]; assert.equal(first.paused, false); assert.equal(shared.locks.held.size, 1);
    pass('music: simultaneous tabs use one shared Web Lock and create only one playing media element');

    first.currentTime = 7261.5; first.emit('timeupdate');
    assert.equal(a.seek.max, '10800'); assert.equal(a.seek['aria-valuetext'], '2:01:01 / 3:00:00');
    a.document.hidden = true; a.document.emit('visibilitychange');
    await time.jump(20 * 60000); first.currentTime = 8461.5;
    a.document.hidden = false; a.document.emit('visibilitychange'); await time.flush();
    assert.equal(a.seek['aria-valuetext'], '2:21:01 / 3:00:00'); assert.equal(first.playCalls, 1);
    assert.equal(shared.locks.granted, 1, 'background return refreshes state without reacquiring or restarting');
    pass('music: three-hour metadata and background return refresh elapsed text without replay');

    first.currentTime = 10799.85; first.emit('timeupdate'); assert.ok(first.volume < .3);
    first.duration = 14400; first.emit('durationchange'); assert.equal(first.volume, .5, 'growing metadata restores volume away from track tail');
    first.currentTime = 14399.85; first.emit('timeupdate'); assert.ok(first.volume < .3);
    first.currentTime = 3600; first.emit('seeked'); assert.equal(first.volume, .5, 'native seek away from tail restores volume');
    first.duration = Infinity; first.emit('durationchange'); assert.equal(a.seek.disabled, true); assert.equal(first.volume, .5);
    first.duration = 14400; first.emit('loadedmetadata'); assert.equal(a.seek.disabled, false);
    pass('music: late duration growth, native seeking, and temporary unknown duration never leave volume faded');

    a.api.pause(); a.api.pause(); first.emit('ended'); await time.flush();
    assert.equal(a.audios.length, 1, 'an ended event during a requested pause cannot advance the playlist');
    await time.jump(300);
    assert.equal(first.paused, true); assert.equal(shared.locks.held.size, 0);
    first.emit('ended'); await time.flush();
    assert.equal(a.audios.length, 1, 'a delayed ended event after pause cannot restart music without ownership');
    assert.equal(shared.locks.held.size, 0);
    b.button('Play').emit('click'); await time.flush(); assert.equal(b.audios[0].paused, false);
    first.emit('ended'); await time.flush();
    assert.equal(b.audios[0].playCalls, 1); assert.equal(first.paused, true);
    a.events.emit('pagehide'); b.events.emit('pagehide'); await time.flush();
    assert.equal(shared.locks.held.size, 0); assert.equal(a.revoked.length, 1); assert.equal(b.revoked.length, 1);
    first.emit('loadedmetadata'); first.emit('ended'); first.emit('timeupdate'); await time.flush();
    assert.equal(a.audios.length, 1, 'events from unloaded media do not create playback');
    a.events.emit('pageshow', { persisted: true }); await time.flush();
    assert.equal(a.audios.length, 1); assert.equal(shared.locks.held.size, 0);
    pass('music: repeated pause, ownership transfer, stale events, pagehide, and BFCache return do not restart playback');

    const endTime = clock(), playlist = mediaStore(endTime), natural = await musicTab(playlist, endTime);
    natural.button('Play').emit('click'); await endTime.flush();
    const endedTrack = natural.audios[0]; endedTrack.currentTime = endedTrack.duration; endedTrack.paused = true;
    endedTrack.emit('ended'); endedTrack.emit('ended'); await endTime.flush();
    assert.equal(natural.audios.length, 2); assert.equal(natural.audios[1].dataset.track, 'b');
    assert.equal(natural.audios[1].playCalls, 1); assert.equal(playlist.locks.granted, 1);
    endedTrack.emit('ended'); await endTime.flush(); assert.equal(natural.audios.length, 2);
    const lastTrack = natural.audios[1]; lastTrack.currentTime = lastTrack.duration; lastTrack.paused = true;
    lastTrack.emit('ended'); await endTime.flush();
    assert.equal(playlist.locks.held.size, 0); assert.equal(lastTrack.paused, true);
    assert.equal(natural.audios.length, 2); natural.events.emit('pagehide'); await endTime.flush();
    pass('music: natural completion still advances once under the same lock, and repeat-off stops at playlist end');

    const importTime = clock(), library = mediaStore(importTime), delayed = await musicTab(library, importTime, { probeDuration: Infinity });
    const input = delayed.input('file'); input.files = [{ name: 'long-session.mp3', type: 'audio/mpeg', size: 4096 }]; input.emit('change'); await importTime.flush();
    const probe = delayed.audios[0]; assert.equal(input.disabled, true); assert.equal(library.records.size, 2);
    await importTime.jump(5000); probe.duration = 18000; probe.emit('durationchange'); await importTime.flush();
    assert.equal(input.disabled, false); assert.equal(library.records.size, 3); assert.equal(probe.playCalls, 0);
    assert.equal(delayed.revoked.length, 1); assert.equal(probe.ondurationchange, null);
    pass('music: bounded delayed finite metadata accepts a five-hour local track without playing the probe');

    const timeoutTime = clock(), unchanged = mediaStore(timeoutTime), invalid = await musicTab(unchanged, timeoutTime, { probeDuration: NaN });
    const invalidInput = invalid.input('file'); invalidInput.files = [{ name: 'invalid.mp3', type: 'audio/mpeg', size: 4096 }]; invalidInput.emit('change'); await timeoutTime.flush();
    await timeoutTime.jump(10001); assert.equal(unchanged.records.size, 2); assert.equal(invalidInput.disabled, false);
    assert.match(invalid.status, /cannot play/); assert.equal(invalid.revoked.length, 1);
    invalid.audios[0].duration = 500; invalid.audios[0].emit('durationchange'); await timeoutTime.flush();
    assert.equal(unchanged.records.size, 2, 'late metadata cannot commit a timed-out import');
    pass('music: invalid metadata times out, releases the temporary URL, and ignores late events without changing the library');

    const failureTime = clock(), failureShared = mediaStore(failureTime), failure = await musicTab(failureShared, failureTime, { playError: 'NotAllowedError' });
    failure.button('Play').emit('click'); await failureTime.flush();
    assert.match(failure.status, /Press Play again/); assert.equal(failureShared.locks.held.size, 0);
    failure.events.emit('pagehide'); delayed.events.emit('pagehide'); invalid.events.emit('pagehide');
    await failureTime.flush(); await importTime.flush(); await timeoutTime.flush();
    pass('music: autoplay rejection releases ownership and exposes a manual recovery action');
}

(async () => {
    await timerChecks(); await musicChecks();
    console.log(`FOCUS_COMPLETION_OK: ${checks} deterministic production-logic regressions; no real media, storage, browser permissions, or network used.`);
})().catch(error => { console.error(error); process.exitCode = 1; });

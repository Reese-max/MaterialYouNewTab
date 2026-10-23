#!/usr/bin/env node
'use strict';
// Production music logic with disposable DOM, media, locks, and transactional
// IndexedDB fixtures. No browser control, actual files/media, network, or restore.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../scripts/pomodoro-music.js');
const source = fs.readFileSync(require.resolve('../scripts/pomodoro-music.js'), 'utf8');
const MiB = 1024 * 1024;
const file = (overrides = {}) => ({ name: 'focus.mp3', size: MiB, type: 'audio/mpeg', ...overrides });
const seed = (id, size = MiB) => ({ id, name: `${id}.mp3`, blob: file({ name: `${id}.mp3`, size }) });
let checks = 0;
const pass = name => { checks++; console.log(`PASS ${name}`); };

function clock() {
    let now = 1900000000000, sequence = 0;
    const pending = new Map();
    const schedule = (fn, delay = 0, repeat = false) => { const id = ++sequence; pending.set(id, { fn, at: now + delay, delay, repeat }); return id; };
    const api = {
        now: () => now,
        setTimeout: (fn, delay) => schedule(fn, delay), clearTimeout: id => pending.delete(id),
        setInterval: (fn, delay) => schedule(fn, delay, true), clearInterval: id => pending.delete(id),
        async flush() {
            for (let turn = 0; turn < 600; turn++) {
                await Promise.resolve();
                for (const [id, item] of [...pending].filter(([, value]) => value.at <= now)) {
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
class Element {
    constructor(tag, document) {
        this.tag = tag; this.ownerDocument = document; this.children = []; this.listeners = {}; this.dataset = {}; this.hidden = false;
        this.style = { setProperty(key, value) { this[key] = value; } };
    }
    get disabled() { return Boolean(this._disabled); }
    set disabled(value) { this._disabled = Boolean(value); if (value && this.ownerDocument?.activeElement === this) this.ownerDocument.activeElement = this.ownerDocument.body; }
    append(...items) { for (const item of items) { item.parentElement = this; this.children.push(item); } }
    contains(target) { return target === this || this.children.some(child => child.contains(target)); }
    replaceChildren(...items) {
        if (this.children.some(child => child.contains(this.ownerDocument?.activeElement))) this.ownerDocument.activeElement = this.ownerDocument.body;
        this.children = []; this.append(...items);
    }
    addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
    setAttribute(name, value) { this[name] = String(value); }
    focus() { if (!this.disabled) { this.ownerDocument.activeElement = this; this.ownerDocument.emit('focusin', { target: this }); } }
    click() { if (!this.disabled) { this.clickCalls = (this.clickCalls || 0) + 1; this.emit('click'); } }
    emit(name, detail = {}) {
        const event = { target: this, currentTarget: this, prevented: false, stopped: false,
            preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...detail };
        this['on' + name]?.(event);
        for (const callback of this.listeners[name] || []) callback(event);
        return event;
    }
}
function sharedStore(time, records = []) {
    const shared = { records: new Map(records.map(value => [value.id, value])), values: new Map(), tabs: new Set(), nextId: 0, putAttempts: 0, deleteAttempts: 0, readAttempts: 0, quotaAt: Infinity, failReads: false, holdReads: false, blockedReads: [], lockHeld: false, lockGrants: 0 };
    let queue = Promise.resolve();
    shared.db = { transaction(_name, mode) {
        const pending = [], tx = { objectStore: () => ({ getAll: () => add('getAll'), put: value => add('put', value), delete: value => add('delete', value) }), abort() { tx.aborted = true; } };
        function add(kind, value) { const request = {}; pending.push({ kind, value, request }); return request; }
        queue = queue.then(() => new Promise(resolve => {
            const working = new Map(shared.records);
            const fail = name => { tx.error = Object.assign(Error(name), { name }); tx.onabort?.(); resolve(); };
            const step = () => {
                if (tx.aborted) { tx.onabort?.(); resolve(); return; }
                const item = pending.shift();
                if (!item) { if (mode === 'readwrite') shared.records = working; tx.oncomplete?.(); resolve(); return; }
                if (item.kind === 'getAll') {
                    shared.readAttempts++;
                    if (shared.failReads) { fail('UnknownError'); return; }
                    if (shared.holdReads) { shared.blockedReads.push(() => { pending.unshift(item); step(); }); return; }
                    item.request.result = [...working.values()];
                }
                if (item.kind === 'put') {
                    shared.putAttempts++;
                    if (shared.putAttempts === shared.quotaAt) { fail('QuotaExceededError'); return; }
                    working.set(item.value.id, item.value);
                }
                if (item.kind === 'delete') { shared.deleteAttempts++; working.delete(item.value); }
                item.request.onsuccess?.(); time.setTimeout(step, 0);
            };
            time.setTimeout(step, 0);
        }));
        return tx;
    } };
    shared.releaseReads = () => { shared.holdReads = false; for (const resume of shared.blockedReads.splice(0)) resume(); };
    shared.locks = { request: async (_name, _options, callback) => {
        if (shared.lockHeld) return callback(null);
        shared.lockHeld = true; shared.lockGrants++;
        try { await callback({}); } finally { shared.lockHeld = false; }
    } };
    return shared;
}
async function tab(shared, time, { language = 'en', noLocks = false } = {}) {
    const events = new Element('events'), document = new Element('document'), host = new Element('div', document), audios = [], urls = new Map(), revoked = [];
    let confirmations = 0;
    document.body = new Element('body', document); document.activeElement = document.body; document.readyState = 'complete'; document.hidden = false;
    document.getElementById = () => host; document.createElement = tag => new Element(tag, document);
    class Audio extends Element {
        constructor() { super('audio', document); this.paused = true; this.duration = NaN; this.readyState = 0; this.currentTime = 0; this.playCalls = 0; this.volume = 1; audios.push(this); }
        set src(value) {
            this._src = value;
            const media = urls.get(value);
            if (media?.pending) return;
            time.setTimeout(() => {
                if (media?.decodeError) { this.emit('error'); return; }
                this.readyState = 1; this.duration = media?.duration ?? 120; this.emit('loadedmetadata');
            }, 0);
        }
        get src() { return this._src; }
        async play() { this.playCalls++; this.paused = false; this.emit('playing'); }
        pause() { this.paused = true; this.emit('pause'); }
        removeAttribute(name) { if (name === 'src') { this._src = ''; this.readyState = 0; this.duration = NaN; } }
        load() { this.emit('emptied'); }
    }
    const window = { document, crypto: { randomUUID: () => `fixture-${++shared.nextId}` }, addEventListener: events.addEventListener.bind(events), confirm: () => { confirmations++; return true; } };
    shared.tabs.add(events);
    const localStorage = {
        getItem: key => shared.values.get(key) ?? null,
        setItem(key, value) { const old = shared.values.get(key); shared.values.set(key, value); if (old !== value) for (const other of shared.tabs) if (other !== events) time.setTimeout(() => other.emit('storage', { key, newValue: value }), 0); },
        removeItem: key => shared.values.delete(key)
    };
    const context = { window, document, navigator: noLocks ? {} : { locks: shared.locks }, localStorage, Audio, currentLanguage: language, console,
        Date: class extends Date { static now() { return time.now(); } },
        setTimeout: time.setTimeout, clearTimeout: time.clearTimeout, setInterval: time.setInterval, clearInterval: time.clearInterval,
        URL: { createObjectURL(value) { const url = 'blob:fixture-' + (++shared.nextId); urls.set(url, value); return url; }, revokeObjectURL(url) { urls.delete(url); revoked.push(url); } },
        indexedDB: { open() { const request = { result: shared.db }; time.setTimeout(() => request.onsuccess?.(), 0); return request; } }
    };
    vm.runInNewContext(source, context); await time.flush();
    const flatten = node => [node, ...node.children.flatMap(flatten)];
    const find = className => flatten(host).find(node => node.className === className);
    return { api: window.myntPomoMusic, document, events, audios, revoked, get confirmations() { return confirmations; },
        get nodes() { return flatten(host); }, find, get capacity() { return find('mynt-music-capacity'); },
        get library() { return find('mynt-music-library'); }, get report() { return find('mynt-music-import-status'); },
        get input() { return flatten(host).find(node => node.type === 'file'); }, get seek() { return flatten(host).find(node => node['aria-label'] === (language === 'zh_TW' ? '播放進度' : 'Playback position')); },
        get status() { return find('mynt-music-status').textContent; },
        button: label => flatten(host).find(node => node.tag === 'button' && node.textContent === label),
        action: (id, action) => flatten(host).find(node => node.dataset.musicTrack === id && node.dataset.musicAction === action),
        import(files) { this.input.files = files; this.input.emit('change'); },
        finishProbe(index, duration = 120) { const probe = audios[index]; probe.readyState = 1; probe.duration = duration; probe.emit('loadedmetadata'); },
        close() { events.emit('pagehide'); }
    };
}

(async () => {
    assert.deepEqual(core.libraryUsage([]), { count: 0, bytes: 0 });
    assert.deepEqual(core.libraryUsage([seed('a', 100 * MiB), seed('b', 50 * MiB)]), { count: 2, bytes: 150 * MiB });
    assert.equal(core.libraryUsage([{ id: 'bad' }]).bytes, null);
    assert.equal(core.formatMiB(0), '0'); assert.equal(core.formatMiB(1024), '<0.1'); assert.equal(core.formatMiB(1.5 * MiB), '1.5');
    assert.equal(core.formatMiB(NaN), '?');
    pass('capacity helpers use stored bytes, precise MiB limits, and never invent zero for unknown media');

    {
        const time = clock(), shared = sharedStore(time, [seed('a', 50 * MiB)]); shared.holdReads = true;
        const f = await tab(shared, time);
        assert.equal(f.capacity.textContent, 'Checking local music…'); assert.equal(f.find('mynt-music-count').textContent, '…');
        assert.equal(f.input.disabled, true); assert.equal(f.library['aria-busy'], 'true'); assert.equal(f.audios.length, 0);
        f.import([file()]); await time.flush(); assert.equal(shared.putAttempts, 0);
        shared.releaseReads(); await time.flush();
        assert.equal(f.capacity.textContent, '1/30 tracks · 50/300 MiB'); assert.equal(f.input.disabled, false);
        assert.equal(f.capacity.parentElement, f.library); assert.notEqual(f.library.open, true);
        assert.match(f.capacity.title, /not free device space/); assert.match(f.input['aria-describedby'], /myntMusicCapacityHint/);
        assert.equal(f.audios.length, 0); f.close();
        pass('before import, loading is distinct from empty and capacity stays only inside the collapsed playlist');
    }
    {
        const time = clock(), shared = sharedStore(time); shared.failReads = true;
        const f = await tab(shared, time);
        assert.equal(f.capacity.textContent, 'Local music usage unavailable'); assert.equal(f.find('mynt-music-count').textContent, '…');
        assert.match(f.status, /Local storage is unavailable/); assert.equal(f.input.disabled, false);
        shared.failReads = false; f.document.emit('visibilitychange'); await time.flush();
        assert.equal(f.capacity.textContent, '0/30 tracks · 0/300 MiB'); assert.equal(f.audios.length, 0); f.close();
        pass('failed storage reads show unknown usage, then recover truthfully without autoplay');
    }
    {
        const time = clock(), shared = sharedStore(time), f = await tab(shared, time);
        const input = f.input, trigger = f.button('Import audio');
        assert.equal(trigger.tag, 'button'); assert.equal(trigger.type, 'button'); assert.equal(input.hidden, true); assert.equal(input.tabIndex, -1);
        assert.equal(input.multiple, true); assert.match(input.accept, /\.wav/); assert.match(trigger['aria-describedby'], /myntMusicCapacityHint/);
        trigger.focus(); trigger.click(); assert.equal(input.clickCalls, 1); assert.equal(f.document.activeElement, trigger);
        const priorStatus = f.status; f.import([]); await time.flush(); assert.equal(f.status, priorStatus); assert.equal(f.audios.length, 0); assert.equal(trigger.disabled, false);
        f.import([file({ pending: true })]); await time.flush(); assert.equal(trigger.disabled, true); assert.equal(input.disabled, true);
        trigger.emit('click'); assert.equal(input.clickCalls, 1, 'synthetic duplicate activation cannot open a second chooser while pending');
        f.finishProbe(0); await time.flush(); assert.equal(trigger.disabled, false); assert.equal(input.disabled, false); assert.equal(f.input, input);
        trigger.click(); assert.equal(input.clickCalls, 2); assert.equal(shared.records.size, 1); assert.equal(f.audios[0].playCalls, 0); f.close();
        pass('localized native button opens the same normal chooser once, supports cancellation/reselection, and disables alongside pending input');
    }
    {
        const time = clock(), shared = sharedStore(time, [seed('existing')]), f = await tab(shared, time);
        f.button('Play').emit('click'); await time.flush(); const playing = f.audios[0];
        f.import([file({ pending: true })]); await time.flush();
        assert.equal(f.input.disabled, true); assert.equal(f.library['aria-busy'], 'true'); assert.match(f.report.textContent, /Importing 1\/1/);
        for (const node of f.nodes.filter(node => ['up', 'down', 'remove'].includes(node.dataset.musicAction))) assert.equal(node.disabled, true);
        assert.equal(f.button('Undo deletion').disabled, true); assert.equal(f.button('Pause').disabled, false);
        f.action('existing', 'remove').emit('click'); assert.equal(f.confirmations, 0); assert.equal(shared.deleteAttempts, 0);
        f.import([file({ name: 'duplicate.mp3' })]); await time.flush(); assert.equal(f.audios.length, 2);
        f.finishProbe(1); await time.flush();
        assert.equal(shared.records.size, 2); assert.equal(shared.putAttempts, 1); assert.equal(f.input.disabled, false); assert.equal(f.library['aria-busy'], 'false');
        assert.equal(playing.playCalls, 1); assert.equal(playing.paused, false); assert.equal(shared.lockGrants, 1); assert.equal(f.audios[1].playCalls, 0);
        assert.match(f.report.textContent, /^1 imported · 0 not imported\./); assert.equal(f.audios[1].onloadedmetadata, null);
        f.close(); await time.flush();
        pass('pending import blocks duplicate/destructive writes while existing playback, owner, and explicit controls stay intact');
    }
    {
        const time = clock(), shared = sharedStore(time), f = await tab(shared, time);
        const longName = '<script>' + '很長的專注曲目'.repeat(12) + '.mp3';
        f.import([file({ size: 0 }), file({ name: 'unsafe.html' }), file({ size: core.MAX_FILE + 1 }), file({ decodeError: true }), file({ name: longName })]);
        await time.flush();
        assert.equal(shared.records.size, 1); assert.equal(shared.putAttempts, 1); assert.equal(f.audios.length, 2);
        assert.match(f.report.textContent, /^1 imported · 4 not imported\./);
        assert.match(f.report.textContent, /2 × Each file.*100 MiB/); assert.match(f.report.textContent, /1 × Choose MP3/); assert.match(f.report.textContent, /1 × This browser cannot play/);
        assert.equal(f.find('mynt-music-current').textContent, longName); assert.equal(f.find('mynt-music-current').title, longName);
        const row = f.find('mynt-music-track'); assert.equal(row.title, longName); assert.equal(row['aria-label'], `Select track: ${longName}`);
        assert.equal(f.find('mynt-music-status')['aria-live'], 'polite'); assert.match(f.input['aria-describedby'], /myntMusicImportResult/);
        assert.ok(f.audios.every(media => media.playCalls === 0)); assert.equal(f.revoked.length, 2); assert.equal(shared.lockGrants, 0); f.close();
        pass('mixed oversize, empty, format, and decode failures retain later successes and expose every reason without interpreting filenames as HTML');
    }
    {
        const time = clock(), shared = sharedStore(time), f = await tab(shared, time); shared.quotaAt = 2;
        f.import([file({ name: 'kept.mp3' }), file({ name: 'quota.mp3' }), file({ name: 'unattempted.mp3' })]); await time.flush();
        assert.equal(shared.records.size, 1); assert.equal(shared.putAttempts, 2); assert.equal(f.audios.length, 2);
        assert.match(f.report.textContent, /^1 imported · 2 not imported\./); assert.match(f.status, /Device storage is full/);
        assert.equal(f.capacity.textContent, '1/30 tracks · 1/300 MiB'); assert.equal(f.input.disabled, false); assert.equal(f.library['aria-busy'], 'false');
        assert.ok(f.audios.every(media => media.playCalls === 0)); assert.equal(shared.lockGrants, 0); f.close();
        pass('quota failure preserves committed successes, reports the unattempted remainder, and stops repeated writes');
    }
    {
        const time = clock(), shared = sharedStore(time, [seed('large-a', 100 * MiB), seed('large-b', 100 * MiB)]), f = await tab(shared, time);
        f.import([file({ size: 75 * MiB }), file({ size: 50 * MiB }), file({ size: 25 * MiB })]); await time.flush();
        assert.equal(shared.records.size, 4); assert.equal(core.libraryUsage([...shared.records.values()]).bytes, 300 * MiB);
        assert.match(f.report.textContent, /^2 imported · 1 not imported\./); assert.match(f.report.textContent, /Library limit/);
        assert.equal(f.capacity.textContent, '4/30 tracks · 300/300 MiB'); f.close();
        pass('an oversized remaining-library candidate does not prevent a smaller later file from fitting atomically');
    }
    {
        const time = clock(), shared = sharedStore(time), f = await tab(shared, time);
        f.import(Array.from({ length: 35 }, (_, i) => file({ name: `candidate-${i}.mp3`, decodeError: true }))); await time.flush();
        assert.equal(f.audios.length, 30); assert.equal(shared.putAttempts, 0); assert.equal(shared.records.size, 0);
        assert.match(f.report.textContent, /^0 imported · 35 not imported\./); assert.match(f.report.textContent, /5 × Only 30 audio files/);
        assert.equal(f.revoked.length, 30); assert.equal(f.input.disabled, false); f.close();
        pass('large bad batches have bounded metadata work and explicitly account for unprocessed files');
    }
    {
        const time = clock(), shared = sharedStore(time, Array.from({ length: 29 }, (_, index) => seed(`seed-${index}`))), a = await tab(shared, time), b = await tab(shared, time);
        a.import([file({ name: 'from-a.mp3' })]); b.import([file({ name: 'from-b.mp3' })]); await time.flush();
        assert.equal(shared.records.size, 30); assert.equal(a.capacity.textContent, '30/30 tracks · 30/300 MiB'); assert.equal(b.capacity.textContent, '30/30 tracks · 30/300 MiB');
        assert.ok([a.report.textContent, b.report.textContent].some(value => value.startsWith('0 imported · 1 not imported.')));
        assert.ok(a.audios.every(media => media.playCalls === 0) && b.audios.every(media => media.playCalls === 0)); a.close(); b.close();
        pass('concurrent imports retain the atomic cap and both successful and rejected tabs refresh truthful capacity');
    }
    {
        for (const [key, expected] of [['ArrowLeft', 35], ['ArrowDown', 35], ['ArrowRight', 45], ['ArrowUp', 45], ['PageDown', 10], ['PageUp', 70], ['Home', 0], ['End', 120]]) assert.equal(core.keyboardSeek(key, 40, 120), expected);
        assert.equal(core.keyboardSeek('ArrowLeft', 2, 120), 0); assert.equal(core.keyboardSeek('PageUp', 115, 120), 120);
        for (const key of ['Enter', 'toString', ' ']) assert.equal(core.keyboardSeek(key, 40, 120), null);
        for (const duration of [NaN, Infinity, 0, -1]) assert.equal(core.keyboardSeek('End', 40, duration), null);
        const time = clock(), shared = sharedStore(time, [seed('a')]), f = await tab(shared, time);
        let event = f.seek.emit('keydown', { key: 'ArrowRight' }); assert.equal(event.prevented, false); assert.equal(f.audios.length, 0);
        f.button('Play').focus(); f.button('Play').emit('click'); await time.flush(); const media = f.audios[0];
        assert.equal(f.document.activeElement, f.button('Pause')); f.seek.focus(); media.currentTime = 40;
        event = f.seek.emit('keydown', { key: 'ArrowRight' }); assert.ok(event.prevented && event.stopped); assert.equal(media.currentTime, 45);
        assert.equal(f.seek['aria-valuetext'], '0:45 / 2:00'); assert.equal(f.document.activeElement, f.seek);
        for (const modifier of ['ctrlKey', 'altKey', 'metaKey', 'isComposing']) { event = f.seek.emit('keydown', { key: 'ArrowRight', [modifier]: true }); assert.equal(event.prevented, false); assert.equal(media.currentTime, 45); }
        assert.match(f.seek.title, /5 seconds/); assert.equal(f.seek['aria-describedby'], 'myntMusicSeekHint');
        f.api.pause(); await time.jump(300); assert.equal(media.paused, true); assert.equal(shared.lockHeld, false);
        f.seek.emit('keydown', { key: 'End' }); assert.equal(media.currentTime, 120); assert.equal(media.paused, true); assert.equal(media.playCalls, 1); assert.equal(shared.lockGrants, 1);
        f.close(); await time.flush();
        pass('keyboard seeking has useful bounded steps, native Home/End semantics, descriptive help, stable focus, and never autoplays or reclaims ownership');
    }
    {
        const time = clock(), shared = sharedStore(time, [seed('a'), seed('b'), seed('c')]), f = await tab(shared, time);
        f.action('b', 'select').focus(); f.action('b', 'select').emit('click'); assert.equal(f.document.activeElement, f.action('b', 'select'));
        f.action('b', 'up').focus(); f.action('b', 'up').emit('click'); assert.equal(f.api.getTracks()[0].id, 'b'); assert.equal(f.document.activeElement, f.action('b', 'select'));
        f.action('b', 'down').focus(); f.action('b', 'down').emit('click'); assert.equal(f.api.getTracks()[1].id, 'b'); assert.equal(f.document.activeElement, f.action('b', 'down'));
        f.button('Play').focus(); f.document.emit('visibilitychange'); await time.flush(); assert.equal(f.document.activeElement, f.button('Play'));
        assert.equal(f.audios.length, 0); f.close();
        pass('playlist selection/reordering preserves meaningful keyboard focus without stealing outside focus on background refresh');
    }
    {
        const time = clock(), shared = sharedStore(time, [seed('a'), seed('b')]), f = await tab(shared, time);
        f.library.open = true; f.action('a', 'remove').focus(); f.action('a', 'remove').emit('click');
        assert.equal(f.document.activeElement, f.action('a', 'select'));
        f.action('a', 'remove').emit('click'); await time.flush();
        assert.equal(shared.deleteAttempts, 1); assert.equal(f.confirmations, 1); assert.equal(f.document.activeElement, f.action('b', 'select'));
        f.action('b', 'remove').focus(); f.action('b', 'remove').emit('click'); await time.flush();
        assert.equal(f.document.activeElement, f.button('Undo deletion')); assert.equal(shared.records.size, 0);
        f.button('Undo deletion').emit('click'); await time.flush();
        assert.equal(f.document.activeElement, f.action('b', 'select')); assert.equal(shared.records.size, 1); assert.equal(f.audios.length, 0);
        shared.holdReads = true; f.action('b', 'remove').focus(); f.action('b', 'remove').emit('click'); await time.flush();
        f.button('Play').focus(); shared.releaseReads(); await time.flush();
        assert.notEqual(f.document.activeElement, f.button('Undo deletion'), 'moving focus while delete is pending cancels the focus handoff');
        f.close();
        pass('confirmed delete/undo are single pending writes and hand keyboard focus to the next usable control only if the user stayed');
    }
    {
        const time = clock(), shared = sharedStore(time, [seed('a'), seed('b')]), f = await tab(shared, time);
        f.button('Play').emit('click'); await time.flush(); const playing = f.audios[0];
        shared.quotaAt = 1; f.import([file({ pending: true })]); await time.flush();
        shared.records.delete('a'); // Another tab deleted it before the rejected import's authoritative read.
        f.finishProbe(1); await time.flush();
        assert.equal(f.api.getSettings().selectedId, 'b'); assert.equal(playing.paused, true); assert.equal(playing.playCalls, 1);
        assert.equal(f.find('mynt-music-current').textContent, 'b.mp3'); assert.equal(f.seek.disabled, true); assert.equal(shared.lockHeld, false);
        assert.equal(f.capacity.textContent, '1/30 tracks · 1/300 MiB'); assert.match(f.report.textContent, /Device storage is full/);
        f.close();
        pass('post-failure capacity refresh also unloads a remotely deleted playing track without autoplaying its replacement');
    }
    {
        const time = clock(), shared = sharedStore(time, [seed('a')]), f = await tab(shared, time, { noLocks: true });
        f.button('Play').emit('click'); await time.flush(); const media = f.audios[0];
        shared.values.set('myntPomoMusicOwnerV1', 'other-tab'); f.events.emit('storage', { key: 'myntPomoMusicOwnerV1', newValue: 'other-tab' });
        f.seek.emit('keydown', { key: 'PageUp' }); assert.equal(media.currentTime, 30); assert.equal(media.paused, true); assert.equal(media.playCalls, 1);
        assert.equal(shared.values.get('myntPomoMusicOwnerV1'), 'other-tab'); f.close();
        shared.values.clear(); const afterReset = await tab(shared, time); assert.equal(afterReset.api.getTracks().length, 1); assert.equal(afterReset.audios.length, 0);
        assert.equal(afterReset.capacity.textContent, '1/30 tracks · 1/300 MiB'); afterReset.close();
        pass('fallback-owner loss and settings-only reset preserve media while keyboard seeking cannot take ownership back');
    }
    {
        const time = clock(), shared = sharedStore(time), f = await tab(shared, time, { language: 'zh_TW' });
        assert.equal(f.capacity.textContent, '0/30 首 · 0/300 MiB');
        assert.equal(f.button('匯入音樂').type, 'button'); assert.equal(f.input.hidden, true);
        f.import([file({ size: 0 }), file({ name: '專注.mp3' })]); await time.flush();
        assert.match(f.report.textContent, /^已匯入 1 首 · 未匯入 1 首。/); assert.match(f.report.textContent, /100 MiB/); assert.match(f.seek.title, /方向鍵：5 秒/); f.close();
        const css = fs.readFileSync(require.resolve('../styles/pomodoro-music.css'), 'utf8');
        assert.match(css, /\.mynt-music-capacity\s*\{[^}]*white-space:\s*nowrap/);
        assert.match(css, /\.mynt-music-import-status\s*\{[^}]*overflow-wrap:\s*anywhere/);
        assert.match(css, /\.mynt-music-sr-only\s*\{[^}]*clip-path:\s*inset\(50%\)/);
        pass('Traditional Chinese fallback, one-line capacity, wrapped error text, and hidden accessible seek help remain present');
    }
    console.log(`MUSIC_DAILY_OK: ${checks} production-logic regression groups. Synthetic fixtures only; real browser rendering, decoding, sound, and device storage were not exercised.`);
})().catch(error => { console.error(error); process.exitCode = 1; });

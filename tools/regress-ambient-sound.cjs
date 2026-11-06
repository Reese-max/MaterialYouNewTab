'use strict';
// No browser, audio hardware, dependencies or network. Optional JSON snapshot tests the original tree.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const base = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8').replace(/^\uFEFF/, '')) : null;
const read = file => base ? base[file] : fs.readFileSync(path.join(root, file), 'utf8');
const expected = ['rain', 'thunder', 'ocean', 'stream', 'wind', 'forest', 'night', 'campfire', 'whitenoise', 'pink', 'brown'];

function fixture(saved = {}, suspended = false) {
    let time = 0, id = 0, resume, seed = 1234567;
    const timers = new Map(), nodes = [], buffers = [], events = [], listeners = {};
    const param = value => ({ value, events: [], setValueAtTime(v, t) { this.value = v; this.events.push(['set', v, t]); },
        linearRampToValueAtTime(v, t) { this.value = v; this.events.push(['ramp', v, t]); },
        exponentialRampToValueAtTime(v, t) { this.value = v; this.events.push(['exp', v, t]); },
        cancelScheduledValues(t) { this.events = this.events.filter(e => e[2] < t); },
        cancelAndHoldAtTime(t) { this.events.push(['hold', this.value, t]); } });
    function node(kind) {
        const n = { kind, connections: new Set(), gain: param(1), frequency: param(440), Q: param(1),
            threshold: param(0), knee: param(0), ratio: param(0), attack: param(0), release: param(0),
            connect(to) { this.connections.add(to); return to; }, disconnect() { this.connections.clear(); },
            start(at = time, offset = 0) { assert.equal(this.started, undefined); this.started = at; this.offset = offset; },
            stop(at = time) { this.stopped = at; } };
        nodes.push(n); return n;
    }
    const ctx = { state: suspended ? 'suspended' : 'running', sampleRate: 16000, destination: {}, get currentTime() { return time; },
        createGain: () => node('gain'), createBiquadFilter: () => node('filter'),
        createBufferSource: () => node('source'), createOscillator: () => node('oscillator'), createDynamicsCompressor: () => node('compressor'),
        createBuffer(channels, size, rate) { const data = new Float32Array(size); const buffer = { duration: size / rate, getChannelData: () => data }; buffers.push(buffer); return buffer; },
        resume() { return new Promise(resolve => { resume = () => { ctx.state = 'running'; resolve(); }; }); } };
    const storage = new Map(Object.entries(saved));
    const on = (name, fn) => (listeners[name] ||= []).push(fn);
    const sandbox = { window: { AudioContext: function () { return ctx; }, addEventListener: on },
        document: { hidden: false, addEventListener: on, dispatchEvent: e => events.push(e) },
        CustomEvent: class { constructor(type, init) { this.type = type; Object.assign(this, init); } },
        Math: Object.assign(Object.create(Math), { random: () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296) }),
        localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)) },
        setTimeout(fn, ms) { timers.set(++id, { fn, at: time + ms / 1000 }); return id; }, clearTimeout: key => timers.delete(key), console };
    vm.runInNewContext(read('scripts/ambient-sound.js'), sandbox);
    function advance(seconds) {
        const end = time + seconds;
        for (let steps = 0; steps < 20000; steps++) {
            const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
            const ended = nodes.filter(n => n.started !== undefined && !n.ended && n.stopped <= (next ? Math.min(next[1].at, end) : end));
            for (const n of ended) { n.ended = true; n.onended?.(); }
            if (!next || next[1].at > end) { time = end; return; }
            time = next[1].at; timers.delete(next[0]); next[1].fn();
        }
        assert.fail('timer runaway');
    }
    const activeSources = () => nodes.filter(n => n.started !== undefined && (n.stopped === undefined || n.stopped > time));
    const connected = () => nodes.filter(n => n.connections.size);
    function released() { assert.equal(timers.size, 0, 'no orphan timer'); assert.equal(activeSources().length, 0, 'all sources stopped'); assert.equal(connected().length, 0, 'all nodes disconnected'); }
    return { api: sandbox.myntAmbientAudio, ctx, nodes, buffers, timers, events, storage, sandbox, advance, activeSources, connected, released,
        emit: name => listeners[name]?.forEach(fn => fn()), resume: () => resume() };
}

(async () => {
    const f = fixture();
    assert.deepEqual(Array.from(f.api.types || []), expected, 'all 11 types are exported');
    assert.ok(Object.isFrozen(f.api.types), 'shared type list cannot drift at runtime');
    const balancedGains = [1, 1, .45, .8, 1.1, 3.5, 3, .5, .4, .4, .35];
    const soundBuffers = {};
    for (const type of expected) {
        const createdBefore = f.nodes.length;
        assert.equal(await f.api.play(type), true, `${type} plays`);
        assert.deepEqual(JSON.parse(JSON.stringify(f.api.getState())), { type, playing: true, volume: .5 });
        const master = f.connected().find(n => [...n.connections].some(to => to.kind === 'compressor'));
        const bus = f.connected().find(n => n.connections.has(master));
        assert.equal(master.gain.value, .5, 'type balance preserves the user volume');
        assert.deepEqual(bus.gain.events.at(-1), ['ramp', balancedGains[expected.indexOf(type)], f.ctx.currentTime + .45], `${type} balances the whole voice before the limiter with the existing fade duration`);
        f.advance(30);
        soundBuffers[type] = f.activeSources().filter(n => n.loop).map(n => n.buffer);
        assert.ok(f.activeSources().length > 0, `${type} has live sources`);
        assert.ok(f.nodes.some(n => n.kind === 'compressor'), 'master limiter present');
        assert.ok(f.activeSources().filter(n => n.loop).every(n => n.buffer.duration >= 10), 'long loop buffers');
        if (['rain', 'thunder', 'stream', 'campfire', 'forest', 'night'].includes(type)) assert.ok(f.nodes.slice(createdBefore).some(n => n.started !== undefined && !n.loop), `${type} schedules transients`);
        assert.ok(f.connected().length < 60, `${type} releases ended transients during playback`);
        f.api.stop(); f.advance(.8); f.released();
    }
    assert.equal(f.buffers.length, 3, 'one cached buffer per noise colour');
    function correlation(buffer) {
        const data = buffer.getChannelData(0); let dot = 0, energy = 0;
        for (let i = 1; i < 10000; i++) { dot += data[i] * data[i - 1]; energy += data[i] * data[i]; }
        return dot / energy;
    }
    assert.ok(Math.abs(correlation(soundBuffers.whitenoise[0])) < .1, 'white noise has uncorrelated samples');
    assert.ok(correlation(soundBuffers.pink[0]) > .6, 'pink noise retains its low-frequency weighting');
    assert.ok(correlation(soundBuffers.brown[0]) > .9, 'brown noise retains its deeper weighting');
    assert.notEqual(soundBuffers.whitenoise[0], soundBuffers.pink[0], 'white noise never reuses pink noise');
    for (let i = 0; i < expected.length; i++) {
        await f.api.play(expected[i]); f.advance(1);
        const oldNodes = f.connected().filter(n => n.kind !== 'compressor' && ![...n.connections].some(to => to.kind === 'compressor'));
        const oldTimers = [...f.timers.keys()];
        await f.api.play(expected[(i + 1) % expected.length]); f.advance(.8);
        assert.ok(oldNodes.every(n => !n.connections.size), `${expected[i]} switch disconnects its entire graph`);
        assert.ok(oldTimers.every(id => !f.timers.has(id)), `${expected[i]} switch cancels its old timers`);
        f.api.stop(true); f.released();
    }
    for (const buffer of f.buffers) {
        const data = buffer.getChannelData(0); assert.ok(data.every(Number.isFinite));
        assert.ok(Math.max(...data.subarray(0, 10000).map(Math.abs)) <= 1, 'bounded noise samples');
    }
    assert.equal(await f.api.play('invalid'), false); f.released();
    await f.api.play('rain'); f.advance(.8); const before = f.activeSources();
    await f.api.play('ocean');
    assert.ok(before.some(n => n.connections.size), 'old sound survives until the crossfade finishes');
    f.advance(.8); assert.ok(before.every(n => !n.connections.size), 'old sound released within 800ms');
    for (const type of expected) await f.api.play(type);
    f.advance(.8);
    assert.equal(f.api.getState().type, 'brown');
    assert.equal(f.activeSources().length, 1, 'rapid switching leaves only the final brown source');
    assert.equal(f.timers.size, 0, 'static noise needs no scheduler');
    f.api.stop(true); f.released();
    await f.api.play('pink'); f.advance(1);
    const retiring = f.activeSources()[0];
    await f.api.play('brown');
    for (let i = 0; i < 20; i++) { f.advance(.04); await f.api.play(i % 2 ? 'pink' : 'brown'); }
    assert.equal(retiring.connections.size, 0, 'rapid switching never postpones an old fade deadline');
    f.advance(.8); assert.equal(f.activeSources().length, 1); f.api.stop(true); f.released();
    for (const type of ['rain', 'ocean', 'whitenoise', 'campfire']) {
        const legacy = fixture({ myntAmbientType: type }); assert.equal(await legacy.api.play(), true);
        assert.equal(legacy.api.getState().type, type); legacy.api.stop(true); legacy.released();
    }
    // Switching to another tab must keep focus audio playing; only leaving the page stops it.
    await f.api.play('forest'); f.sandbox.document.hidden = true; f.emit('visibilitychange');
    assert.equal(f.api.getState().playing, true, 'a hidden tab keeps ambient playing'); f.sandbox.document.hidden = false;
    f.emit('pagehide'); f.released();
    // While stopped, a choice saved by the panel/float drives state and toggle.
    f.sandbox.localStorage.setItem('myntAmbientType', 'wind'); assert.equal(f.api.getState().type, 'wind', 'stopped state follows stored choice');
    await f.api.toggle(); assert.equal(f.api.getState().type, 'wind', 'toggle plays the stored choice'); f.api.stop(true); f.released();
    const pending = fixture({}, true), start = pending.api.play('forest');
    pending.api.stop(true); pending.resume(); assert.equal(await start, false); pending.released();
    const hidden = fixture({}, true), hiddenStart = hidden.api.play('rain');
    hidden.emit('pagehide'); hidden.resume(); assert.equal(await hiddenStart, false); hidden.released();
    const remote = fixture({}, true); let allowed = true;
    const access = remote.api.playRemote('thunder', () => { if (!allowed) throw Error('ACCESS_REVOKED'); });
    allowed = false; remote.resume(); await assert.rejects(access, /ACCESS_REVOKED/); remote.released();
    await f.api.play('rain'); assert.equal(await f.api.play('bogus'), false); assert.equal(f.api.getState().playing, true, 'invalid input preserves existing playback');
    f.api.setVolume(1); assert.equal(f.api.getState().volume, 1);
    f.api.setVolume(NaN); assert.equal(f.api.getState().volume, 1, 'non-finite volume ignored');
    f.api.stop(true); f.released();

    const html = read('index.html').match(/<select id="pomodoroAmbientSelect"[\s\S]*?<\/select>/)[0];
    assert.deepEqual([...html.matchAll(/<option value="([^"]+)"/g)].map(m => m[1]), expected);
    assert.equal((html.match(/<optgroup /g) || []).length, 2, 'panel groups nature and noise');
    const float = read('scripts/pomodoro-float.js');
    assert.match(float, /ambientTypes\s*=\s*ambient\?\.types/, 'float consumes the exported list');
    assert.match(float, /optgroup/, 'floating selector groups nature and noise');
    for (const type of expected) assert.ok(float.includes('ambient_' + type + ':'), `${type} floating label fallback`);
    const mcp = {};
    vm.runInNewContext(read('scripts/local-mcp-ui.js'), mcp);
    const enumOf = list => list.find(t => t.name === 'mynt_ambient_control').inputSchema.properties.type.enum;
    assert.deepEqual(Array.from(enumOf(mcp.MyntMcpUi.tools)), expected);
    assert.deepEqual(enumOf(JSON.parse(read('local-mcp/ui-tools.json'))), expected);
    for (const lang of ['en', 'zh_TW']) {
        const words = vm.runInNewContext(read(`locales/${lang}.js`) + `\n;${lang}`);
        for (const type of expected) assert.ok(words['pomoFloat_ambient_' + type], `${lang} ${type} label`);
        for (const group of ['nature', 'noise']) assert.ok(words['pomoFloat_ambient_' + group]);
    }
    const words = lang => vm.runInNewContext(read(`locales/${lang}.js`) + `\n;${lang}`);
    assert.deepEqual(Object.keys(words('en')).sort(), Object.keys(words('zh_TW')).sort(), 'complete English/Traditional Chinese key parity');
    console.log('AMBIENT_SOUND_OK: 11 types, per-type balance before limiter, cached long buffers, limiter, scheduled transients, crossfade/rapid switches, zero leaked nodes/timers, legacy storage, lifecycle/access gates and synchronized UI/MCP types');
})().catch(error => { console.error(error); process.exitCode = 1; });

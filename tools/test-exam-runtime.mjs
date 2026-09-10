import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const source = name => readFileSync(new URL(name, root), 'utf8');
const coreSource = source('scripts/exam-countdown-core.js');
const weatherSource = source('scripts/weather.js');
const dashboardSource = source('scripts/dashboard-tools.js');
const examSource = source('scripts/exam-dashboard.js');
const tick = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };
const passed = [];
async function test(name, fn) { await fn(); passed.push(name); console.log('PASS ' + name); }
class Element extends EventTarget {
    constructor() {
        super(); this.attributes = new Map(); this.style = {}; this.dataset = {};
        this.value = ''; this.checked = false; this.children = []; this.textContent = '';
        const classes = new Set();
        this.classList = { contains: key => classes.has(key), add: key => classes.add(key),
            remove: key => classes.delete(key), toggle: (key, on = !classes.has(key)) => on ? classes.add(key) : classes.delete(key) };
    }
    getClientRects() { return this.classList.contains('weather-hidden') ? [] : [{}]; }
    setAttribute(key, value) { this.attributes.set(key, String(value)); }
    removeAttribute(key) { this.attributes.delete(key); }
    hasAttribute(key) { return this.attributes.has(key); }
    appendChild(node) { this.children.push(node); }
    contains(node) { return this === node || this.children.includes(node); }
    querySelector() { return new Element(); }
    querySelectorAll() { return []; }
    matches() { return false; }
    click() { this.dispatchEvent(new Event('click')); }
}
const weatherFixture = {
    location: { name: 'Fixture' }, current: { condition: { text: 'Sunny', icon: '//cdn.weatherapi.com/weather/64x64/day/113.png' },
        temp_c: 25, temp_f: 77, humidity: 50, feelslike_c: 26, feelslike_f: 78 },
    forecast: { forecastday: [{ day: { mintemp_c: 20, maxtemp_c: 30, mintemp_f: 68, maxtemp_f: 86 } }] }
};
function harness({ raw, core = true, gps = false, manual = '', handler } = {}) {
    const elements = new Map(), calls = [], faults = [], dom = new EventTarget(), events = new EventTarget();
    dom.hidden = false; dom.visibilityState = 'visible'; dom.body = new Element();
    dom.getElementById = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
    dom.querySelector = selector => dom.getElementById(selector);
    dom.createElement = () => new Element();
    const storage = new Map([['useGPS', String(gps)], ['weatherApiKey', 'fixture-not-a-real-key'], ['weatherLocation', manual]]);
    if (raw !== undefined) storage.set('myntExamDashboard', raw);
    const ctx = {
        document: dom, console: { log() {}, error: (...args) => faults.push(args.map(String).join(' ')) },
        localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)) },
        setTimeout, clearTimeout, Event, EventTarget, AbortController, DOMException, Response,
        MutationObserver: class { observe() {} },
        translations: { en: {}, zh_TW: {} }, currentLanguage: 'zh_TW', isRTL: false,
        localizeNumbers: value => value, saveCheckboxState() {}, loadCheckboxState() {},
        location: { reload() {} }, navigator: { geolocation: { getCurrentPosition: success => {
            calls.push({ kind: 'gps' }); queueMicrotask(() => success({ coords: { latitude: 25, longitude: 121 } }));
        } } },
        fetch: async (url, options = {}) => {
            const kind = String(url).includes('ipinfo') ? 'ip' : String(url).includes('search.json') ? 'suggestions' : 'forecast';
            calls.push({ kind, signal: options.signal });
            return handler ? handler(kind, options.signal) : new Response(JSON.stringify(kind === 'ip' ? { loc: '25,121' } : kind === 'suggestions' ? [] : weatherFixture));
        },
        getComputedStyle: node => ({ display: node.classList.contains('weather-hidden') ? 'none' : 'block', visibility: 'visible' }),
        addEventListener: events.addEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events)
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    if (core) vm.runInContext(coreSource, ctx);
    vm.runInContext(weatherSource, ctx);
    return { ctx, dom, storage, calls, faults, elements,
        init: () => dom.dispatchEvent(new Event('DOMContentLoaded')),
        sync: () => dom.dispatchEvent(new Event('mynt:exam-layout-change')),
        set: patch => storage.set('myntExamDashboard', JSON.stringify({ ...ctx.MyntExamCore.DEFAULTS, ...patch })) };
}
const base = harness().ctx.MyntExamCore.DEFAULTS;
await test('Cold default Study does not invoke fetch or GPS before CSS exists', async () => {
    const h = harness({ gps: true }); h.init(); await tick(); h.sync(); await tick();
    assert.equal(h.calls.length, 0); assert.ok(h.elements.has('saveAPI'));
});
await test('Missing core fails closed and Classic starts once after core readiness', async () => {
    const h = harness({ core: false, raw: JSON.stringify({ ...base, layout: false }), manual: 'Fixture' });
    h.init(); await tick(); assert.equal(h.calls.length, 0);
    vm.runInContext(coreSource, h.ctx); h.sync(); h.sync(); await tick();
    assert.deepEqual(h.calls.map(x => x.kind), ['forecast']); assert.deepEqual(h.faults, []);
});
for (const raw of ['{', JSON.stringify({ layout: false }), JSON.stringify({ ...base, layout: false, examStart: 'bad' })]) {
    await test('Invalid saved state cannot opt into weather: ' + raw.slice(0, 32), async () => {
        const h = harness({ raw }); h.init(); h.sync(); await tick(); assert.equal(h.calls.length, 0);
    });
}
await test('Hidden countdown is not permission to fetch hidden Study weather', async () => {
    const h = harness({ raw: JSON.stringify({ ...base, enabled: false, useWallpaper: true }) });
    h.init(); h.sync(); await tick(); assert.equal(h.calls.length, 0);
});
await test('Visible Classic has a positive IP, forecast and icon control', async () => {
    const h = harness({ raw: JSON.stringify({ ...base, layout: false }) }); h.init(); await tick();
    assert.deepEqual(h.calls.map(x => x.kind), ['ip', 'forecast']);
    assert.match(h.elements.get('wIcon').src, /^https:\/\/cdn.weatherapi.com/);
    h.sync(); await tick(); assert.equal(h.calls.length, 2); assert.deepEqual(h.faults, []);
});
await test('Visible Classic supports opted-in GPS instead of IP lookup', async () => {
    const h = harness({ gps: true, raw: JSON.stringify({ ...base, layout: false }) }); h.init(); await tick();
    assert.deepEqual(h.calls.map(x => x.kind), ['gps', 'forecast']); assert.deepEqual(h.faults, []);
});
await test('Hide-weather and background-tab gates deny network', async () => {
    for (const reason of ['hidden-setting', 'hidden-tab', 'visible-study']) {
        const h = harness({ raw: JSON.stringify({ ...base, layout: false }) });
        if (reason === 'hidden-setting') h.storage.set('hideWeatherVisible', 'true');
        if (reason === 'hidden-tab') h.dom.hidden = true;
        if (reason === 'visible-study') h.dom.body.setAttribute('data-exam-layout', '');
        h.init(); h.sync(); await tick(); assert.equal(h.calls.length, 0, reason);
    }
});
await test('Study to Classic starts weather without re-registering controls', async () => {
    const h = harness(); h.init(); await tick(); assert.equal(h.calls.length, 0);
    h.set({ layout: false }); h.sync(); h.sync(); await tick();
    assert.deepEqual(h.calls.map(x => x.kind), ['ip', 'forecast']); assert.deepEqual(h.faults, []);
});
await test('Hiding during IP lookup aborts it with no forecast/fallback or cached write', async () => {
    let release;
    const h = harness({ raw: JSON.stringify({ ...base, layout: false }), handler: () => new Promise(r => release = r) });
    h.init(); await tick(); assert.equal(h.calls[0].kind, 'ip');
    h.set({ layout: true }); h.sync(); assert.equal(h.calls[0].signal.aborted, true);
    release(new Response(JSON.stringify({ loc: '25,121' }))); await tick();
    assert.deepEqual(h.calls.map(x => x.kind), ['ip']); assert.equal(h.storage.has('weatherParsedData'), false);
    assert.deepEqual(h.faults, []);
});
await test('Hiding during forecast rejects late data and remote icon assignment', async () => {
    let release;
    const h = harness({ manual: 'Fixture', raw: JSON.stringify({ ...base, layout: false }), handler: () => new Promise(r => release = r) });
    h.init(); await tick(); h.set({ layout: true }); h.sync();
    release(new Response(JSON.stringify(weatherFixture))); await tick();
    assert.equal(h.storage.has('weatherParsedData'), false); assert.equal(h.elements.has('wIcon'), false);
    assert.equal(h.calls[0].signal.aborted, true); assert.deepEqual(h.faults, []);
});
await test('Autocomplete never invokes fetch while Study hides its controls', async () => {
    const h = harness(); h.init(); h.dom.getElementById('userLoc').value = 'Taipei';
    h.dom.getElementById('userLoc').dispatchEvent(new Event('input')); await tick(); assert.equal(h.calls.length, 0);
});
await test('Autocomplete has a visible positive control and cancels on hiding', async () => {
    let release;
    const h = harness({ manual: 'Fixture', raw: JSON.stringify({ ...base, layout: false }), handler: kind => kind === 'suggestions'
        ? new Promise(r => release = r) : Promise.resolve(new Response(JSON.stringify(weatherFixture))) });
    h.init(); await tick(); const input = h.dom.getElementById('userLoc'); input.value = 'Taipei'; input.dispatchEvent(new Event('input'));
    await tick(); const request = h.calls.find(x => x.kind === 'suggestions'); assert.ok(request);
    h.set({ layout: true }); h.sync(); assert.equal(request.signal.aborted, true);
    release(new Response(JSON.stringify([{ name: 'late', country: 'fixture' }]))); await tick();
    assert.equal(h.dom.getElementById('locationSuggestions').style.display, 'none'); assert.deepEqual(h.faults, []);
});
// Execute the production playback gate rather than duplicating its implementation.
const reduced = dashboardSource.slice(dashboardSource.indexOf('        function effectiveReducedMotion()'), dashboardSource.indexOf('        const decorativeVideo ='));
const gate = dashboardSource.slice(dashboardSource.indexOf('        function canPlayDecorativeVideo()'), dashboardSource.indexOf('        function cancelDecorativeVideoStart()'));
await test('Production playback gate enforces all 64 Study/wallpaper/preference/visibility combinations', async () => {
    for (let mask = 0; mask < 64; mask++) {
        const [layout, useWallpaper, reduceMotion, highContrast, saveData, hidden] = Array.from({ length: 6 }, (_, i) => !!(mask & (1 << i)));
        const h = harness({ raw: JSON.stringify({ ...base, layout, useWallpaper }) });
        h.dom.body.dataset.workspaceBackground = 'video'; h.dom.visibilityState = hidden ? 'hidden' : 'visible';
        Object.assign(h.ctx, { decorativeVideo: {}, accessibility: { reduceMotion, highContrast }, reducedMotionQuery: { matches: false }, networkConnection: { saveData } });
        vm.runInContext(reduced + gate, h.ctx);
        assert.equal(vm.runInContext('canPlayDecorativeVideo()', h.ctx), (!layout || useWallpaper) && !reduceMotion && !highContrast && !saveData && !hidden, 'combination ' + mask);
    }
});
await test('System reduced motion and explicit override share the original gate', async () => {
    const h = harness({ raw: JSON.stringify({ ...base, layout: false }) }); h.dom.body.dataset.workspaceBackground = 'video';
    Object.assign(h.ctx, { decorativeVideo: {}, accessibility: { reduceMotion: null, highContrast: false }, reducedMotionQuery: { matches: true }, networkConnection: {} });
    vm.runInContext(reduced + gate, h.ctx); assert.equal(vm.runInContext('canPlayDecorativeVideo()', h.ctx), false);
    h.ctx.accessibility.reduceMotion = false; assert.equal(vm.runInContext('canPlayDecorativeVideo()', h.ctx), true);
});
await test('Exam UI uses the original playback synchronizer, not a second play implementation', async () => {
    assert.doesNotMatch(examSource, /\bvideo\.play\(|\bsyncExamVideo\(/);
    assert.match(examSource, /dispatchEvent\(new Event\('mynt:exam-layout-change'\)\)/);
    assert.match(dashboardSource, /addEventListener\("mynt:exam-layout-change", syncDecorativeVideo\)/);
});
console.log(`EXAM_RUNTIME_UNIT_OK checks=${passed.length} playbackCombinations=64`);

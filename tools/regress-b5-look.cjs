/* Execute production functions at their DOM/IDB boundary; no browser profile or dependencies. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function part(file, start, end) {
    const source = read(file), a = source.indexOf(start), b = source.indexOf(end, a + start.length);
    assert(a >= 0 && b > a, `${file}: production boundary exists`);
    return source.slice(a, b);
}
const run = (c, source) => vm.runInContext(source, c);
const context = extra => vm.createContext({ console: { error() {}, warn() {} }, ...extra });
function node() {
    return { dataset: {}, children: [], listeners: {}, attributes: {}, style: {
        setProperty(k, v) { this[k] = v; }, removeProperty(k) { delete this[k]; }
    }, append(...items) { this.children.push(...items); }, appendChild(item) { this.append(item); },
    setAttribute(k, v) { this.attributes[k] = v; }, addEventListener(k, fn) { this.listeners[k] = fn; },
    classList: { add() {}, contains() { return false; } }, querySelector: () => node(),
    getBoundingClientRect: () => ({ left: 0, right: 100, width: 100 }), pause() {}, load() {}, removeAttribute() {} };
}
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('look-layout#1', () => {
    const bar = node(), wrapper = node();
    const c = context({ document: { getElementById: () => bar, querySelectorAll: s => s === '#searchbar' ? [bar] : [wrapper] } });
    run(c, part('scripts/layout-editor.js', '    const elementsFor =', '    const visible =') + ';result=elementsFor("#rightDiv");');
    assert.equal(c.result[0], bar, 'Editor measures the actual fixed search bar');
    const button = node();
    button.getBoundingClientRect = () => {
        const [x, y] = (button.style.translate || '0 0').split(' ').map(parseFloat), scale = Number(button.style.scale || 1);
        return { left: 20 + x, top: 16 + y, right: 20 + x + 48 * scale, bottom: 16 + y + 48 * scale, width: 48 * scale, height: 48 * scale };
    };
    Object.assign(c, { MYNT_LAYOUT_BLOCKS: [['pomodoro', '#pomodoroCont']], layout: { blocks: { pomodoro: { x: .1, y: .15, s: 1.5 } } },
        innerWidth: 1200, innerHeight: 800, visible: () => true, settleClock() {},
        myntClampOffset: require(path.join(root, 'scripts/layout-editor.js')).myntClampOffset });
    c.document.querySelectorAll = () => [button];
    run(c, part('scripts/layout-editor.js', '    function applyBlock(', '    function settleClock()'));
    c.applyBlock('pomodoro');
    assert.equal(button.style.translate, '120px 120px'); assert.equal(button.style.scale, '1.5');
    assert.equal(button.dataset.myntLayout, 'pomodoro');
    delete c.layout.blocks.pomodoro; c.applyBlock('pomodoro');
    assert.equal(button.style.translate, undefined); assert.equal(button.style.scale, undefined);
    const css = read('styles/centered-home.css');
    for (const [start, end] of [
        ['body #searchbar {', 'body #quickLinksRow {'],
        ['body #homeToolbar :is(#googleAppsCont, #bookmarkButton) {', 'body #homeToolbar #googleAppsCont svg'],
        ['html.mynt-removed-features body #pomodoroCont#pomodoroCont {', 'html.mynt-removed-features body :is(#wallpaperGalleryBtn'],
        ['body #searchbar { inset-block-start: 43vh', 'body #searchbar .searchbar-content']
    ]) assert.doesNotMatch(css.slice(css.indexOf(start), css.indexOf(end, css.indexOf(start))), /(?:translate:\s*none|scale:\s*1)\s*!important/, 'Centered defaults must allow inline manual transforms');
    assert.match(read('tools/smoke-chromium.mjs'), /B5_CSS_LAYOUT_OK/, 'Real browser CSS integration is also required');
});

test('look-layout#2', () => {
    const nodes = new Map(['opacityTextContainer', 'opacitySlider', 'opacityLevel', 'opacityBarControl'].map(id => [id, node()]));
    const bar = node(), events = {}, saved = new Map(), doc = { documentElement: node(),
        getElementById: id => nodes.get(id), querySelector: () => bar, createElement: () => node(), createTextNode: text => text,
        addEventListener: (name, fn) => events[name] = fn, dispatchEvent: event => events[event.type]?.(event) };
    const c = context({ document: doc, content: node(), config: { opacity: true }, t: (_, fallback) => fallback,
        persist() {}, applyModes() {}, schedule() {}, CustomEvent: class { constructor(type) { this.type = type; } },
        localStorage: { getItem: k => saved.get(k), setItem: (k, v) => saved.set(k, v) }, localizeNumbers: x => x, currentLanguage: 'en', isRTL: false });
    run(c, part('scripts/adaptive-background.js', '    const labels =', '    const analyzeButton='));
    assert.equal(nodes.get('opacityTextContainer').children.length, 1, 'Auto checkbox is beside the slider, outside hidden panel');
    run(c, read('scripts/widgets-transparency.js'));
    assert.equal(c.config.opacity, true, 'Initialization preserves auto preference');
    c.handleDrag({ type: 'mousedown', clientX: 47 });
    assert.equal(c.config.opacity, false);
    assert.equal(saved.get('bgOpacity'), 47);
    assert.equal(doc.documentElement.style['--transparency'], '47%');
    bar.listeners.keydown({ key: 'Home', preventDefault() {} });
    assert.equal(saved.get('bgOpacity'), 20); assert.equal(bar.attributes['aria-valuenow'], '20');
    assert.match(read('styles/centered-home.css'), /--mynt-glass-strong: rgb\(252 253 255 \/ var\(--transparency, 90%\)\)/, 'All-off appearance still uses manual opacity');
});

test('look-layout#4', async () => {
    const original = { id: 'a', source: 'upload', name: 'old', blob: 'keep', added: 1 };
    const records = new Map([['a', { ...original, removedAt: 10 }]]); let status;
    const c = context({ window: { myntDialog: { prompt: async () => 'new', confirm: async () => true } },
        t: (_, f) => f, setStatus: text => status = text, renderGallery: async () => {},
        document: { getElementById: () => null }, localStorage: { getItem: () => 'other' }, KEY_CURRENT: 'current',
        putItem: async item => records.set(item.id, { ...item }),
        reqP: async x => x, hiddenIds: () => new Set(), saveHidden() {},
        tx: async (_, fn) => { const copy = new Map(records); const result = await fn({ get: id => copy.get(id), put: x => copy.set(x.id, x) }); records.clear(); copy.forEach((v, k) => records.set(k, v)); return result; } });
    run(c, part('scripts/wallpaper-gallery.js', '    async function allItems(', '    // Items that take part'));
    run(c, part('scripts/wallpaper-gallery.js', '    // ---------- Gallery UI ----------', '    function renderSelection()'));
    c.renderGallery = async () => {}; c.setStatus = text => status = text;
    await c.renameItem(original);
    assert.equal(records.get('a').removedAt, 10); assert.equal(records.get('a').name, 'old'); assert(status);
    records.set('a', { ...original, name: 'newer' });
    await c.removeItems([original]);
    assert.equal(records.get('a').name, 'newer', 'Removal preserves another tab\'s rename'); assert(records.get('a').removedAt);
    records.set('a', { ...original, name: 'concurrent' });
    await c.renameItem(original); assert.equal(records.get('a').name, 'concurrent', 'Stale rename reports conflict');
    await c.renameItem(records.get('a')); assert.equal(records.get('a').name, 'new'); assert.equal(records.get('a').blob, 'keep');
});

test('look-layout#5', async () => {
    let valid = false, writes = 0, applied = 0, revoked = 0, mediaError = false;
    const c = context({ Image: class { constructor() { this.naturalWidth = this.naturalHeight = 100; } decode() { return valid ? Promise.resolve() : Promise.reject(Error('broken')); } },
        document: { createElement: () => { const v = node(); v.videoWidth = v.videoHeight = 100;
            Object.defineProperty(v, 'src', { set() { queueMicrotask(() => valid ? v.onloadeddata?.() : v.onerror?.()); } }); return v; } },
        URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => revoked++ }, setTimeout: () => 1, clearTimeout() {},
        newId: () => 'new', VIDEO_WARN_BYTES: 9999, videoThumb: async () => null, putItem: async () => writes++,
        t: (_, f) => f, setStatus: () => mediaError = true, renderGallery: async () => {}, fetch: async () => { throw Error('offline'); } });
    if (read('scripts/wallpaper-gallery.js').includes('    async function validateMedia('))
        run(c, part('scripts/wallpaper-gallery.js', '    async function validateMedia(', '    function videoThumb('));
    run(c, part('scripts/wallpaper-gallery.js', '    async function addBlob(', '    async function addFiles('));
    run(c, part('scripts/wallpaper-gallery.js', '    async function applyItem(', '    async function next('));
    await assert.rejects(c.addBlob({ type: 'image/png' }, 'broken.png')); assert.equal(writes, 0);
    await assert.rejects(c.addBlob({ type: 'video/mp4' }, 'broken.mp4')); assert.equal(writes, 0);
    assert.equal(await c.applyItem({ id: 'bad', type: 'image', src: 'https://invalid.test' }), false); assert(mediaError);
    c.applyItem = async () => { applied++; return true; };
    run(c, part('scripts/wallpaper-gallery.js', '    async function addUrl(', '    // ---------- Gallery UI ----------'));
    await c.addUrl('https://invalid.test/image'); assert.equal(writes, 0); assert.equal(applied, 0);
    valid = true;
    await c.addBlob({ type: 'image/png' }, 'valid.png');
    await c.addBlob({ type: 'video/mp4' }, 'valid.mp4'); assert.equal(writes, 2);
    await c.addUrl('https://valid.test/image'); assert.equal(writes, 3); assert.equal(applied, 1);
    assert.equal(revoked, 4, 'All temporary blob validation URLs are released');
});

test('look-layout#6', async () => {
    const calls = [], c = context({ localStorage: { getItem: () => null },
        loadImageAndDetails: async () => ['cached', '2000-01-01T00:00:00Z', 'random'],
        applyBlobBackground: blob => calls.push(blob), toggleBackgroundType: value => calls.push(value),
        fetch: async () => { calls.push('refresh'); throw Error('offline'); } });
    run(c, part('scripts/wallpaper.js', 'const RANDOM_IMAGE_URL =', '// Function to update the background type attribute'));
    run(c, part('scripts/wallpaper.js', 'function checkAndUpdateImage()', '// Event listeners for buttons'));
    c.checkAndUpdateImage(); await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls, ['cached', true, 'refresh'], 'Expired cache is visible before network refresh');
    c.localStorage.getItem = () => 'gallery-selection'; calls.length = 0; c.checkAndUpdateImage();
    assert.deepEqual(calls, [], 'Gallery selection retains priority');
});

test('look-layout#7', async () => {
    const weather = { location: { name: 'Taipei' }, current: { condition: { text: 'Cloudy', icon: '//cdn.weatherapi.com/weather/64x64/day/116.png' },
        temp_c: 20, temp_f: 68, humidity: 50, feelslike_c: 21, feelslike_f: 70 },
        forecast: { forecastday: [{ day: { mintemp_c: 10, maxtemp_c: 22, mintemp_f: 50, maxtemp_f: 72 } }] } };
    const saved = new Map(Object.entries({ weatherParsedData: JSON.stringify(weather), weatherParsedTime: '1000', weatherParsedLocation: 'Taipei', weatherParsedLang: 'en' }));
    const nodes = new Map(), listeners = {}; let now = 2000000, fetched = 0, online = false, interval;
    const get = id => { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); };
    const c = context({ document: { hidden: false, createElement: () => node(), getElementById: get, querySelector: () => get('tile'), addEventListener: (k, f) => listeners[k] = f },
        localStorage: { getItem: k => saved.get(k), setItem: (k, v) => saved.set(k, v) }, Date: class extends Date { static now() { return now; } },
        translations: { en: { weatherUpdatedAt: 'Updated: {time}', weatherStale: 'Outdated: {time}', humidityLevel: 'Humidity', feelsLike: 'Feels like' } },
        savedApiKey: null, savedLocation: 'Taipei', currentUserLocation: 'Taipei', currentLanguage: 'en', apiKey: '',
        isRTL: false, isMinMaxEnabled: false, localizeNumbers: x => x, isWeatherWidgetRendered: () => true,
        setTimeout: () => 1, clearTimeout() {}, setInterval: fn => interval = fn,
        fetch: async () => { fetched++; if (!online) throw Error('offline'); return { ok: true, json: async () => weather }; } });
    const source = read('scripts/weather.js');
    if (source.includes('    const weatherStatus ='))
        run(c, part('scripts/weather.js', '    const weatherStatus =', '    // Show cached weather before'));
    run(c, source.slice(source.indexOf('    async function fetchWeather('), source.indexOf('\n}\n\n// Save and load toggle state')));
    await c.fetchWeather(true);
    assert.equal(get('temp').textContent, '20'); assert.equal(fetched, 0, 'Cache renders before location/network lookups');
    await c.fetchWeather();
    assert.equal(get('temp').textContent, '20', 'Expired offline cache still renders');
    assert.equal(get('hideWeather').children[0].dataset.stale, 'true'); assert.equal(fetched, 1);
    listeners.visibilitychange(); assert.equal(fetched, 1, 'Visibility retries are throttled');
    now += 60000; c.document.hidden = true; interval(); assert.equal(fetched, 1);
    c.document.hidden = false; online = true; listeners.visibilitychange();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(fetched, 2); assert.equal(get('hideWeather').children[0].dataset.stale, 'false');
    now += 60000; interval(); await new Promise(resolve => setImmediate(resolve)); assert.equal(fetched, 2, 'Fresh cache avoids repeated network requests');
    assert.equal(Object.keys(get('tile').listeners).length, 0, 'Repeated refresh does not stack click/hover listeners');
});

(async () => {
    for (const [name, fn] of tests) { if (process.argv[3] && process.argv[3] !== name) continue; await fn(); console.log(`${name} OK`); }
    console.log('B5_LOOK_OK');
})().catch(error => { console.error(error); process.exitCode = 1; });

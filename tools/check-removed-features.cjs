const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const ids = ['todo', 'exam', 'profilesEntry', 'adaptiveEntry', 'weather'];
const removed = read('scripts/removed-features.js');
const match = removed.match(/Object\.freeze\(\[([^\]]+)\]\)/);
assert.ok(match, 'removed component list must be frozen');
assert.deepEqual([...match[1].matchAll(/'([^']+)'/g)].map(value => value[1]), ids);

const core = require('../scripts/component-visibility-core.js');
const css = read('styles/removed-features.css');
for (const id of ids) {
    const definition = core.definitions.find(item => item.id === id);
    assert.ok(definition, `missing component definition: ${id}`);
    for (const selector of [...definition.selectors, ...definition.panelSelectors]) {
        assert.ok(css.includes(selector), `hide rule missing ${id} selector ${selector}`);
    }
}

const manager = read('scripts/component-manager.js');
assert.match(manager, /core\.definitions\.filter\(item => !removed\.has\(item\.id\)\)/);
assert.match(manager, /const isRemoved = removed\.has\(item\.id\);\s*node\.toggleAttribute\('data-mynt-component-hidden', isRemoved \|\| !item\.visible\);\s*const display = isRemoved \? 'none' : item\.display;/, 'removed IDs remain hidden');
assert.match(manager, /for \(const selector of item\.panelSelectors\) for \(const node of document\.querySelectorAll\(selector\)\) node\.toggleAttribute\('data-mynt-component-hidden', !item\.visible\);/, 'panel selectors follow user visibility only, not removal');
for (const checkbox of ['todoListCheckbox', 'examDailyCheckbox', 'hideWeatherCheckbox']) {
    assert.ok(css.includes(`:has(#${checkbox})`), `settings toggle row remains visible: ${checkbox}`);
}
assert.ok(css.includes('[data-workspace-widget="todoListCheckbox"]'));
assert.ok(css.includes('label:has(> [data-workspace-widget="todoListCheckbox"])'), 'The workspace editor hides the whole To-Do choice, not only its checkbox');
const displayRule = css.slice(0, css.indexOf('\n}'));
assert.match(displayRule, /display:\s*none\s*!important/);
for (const selector of ['#todoListCont', '#examDaily', '#myntProfilesPanel', '#myntAdaptivePanel']) assert.ok(displayRule.includes(selector), `other removed feature must retain display:none: ${selector}`);
assert.match(read('scripts/layout-editor.js'), /MYNT_REMOVED_LAYOUT_IDS\.has\(id\)/);
assert.ok(read('index.html').indexOf('scripts/removed-features.js') < read('index.html').indexOf('style.css'));
const weatherRule = css.slice(css.indexOf('html.mynt-removed-weather'));
assert.match(weatherRule, /display:\s*none\s*!important/);
for (const selector of ['#hideWeather#hideWeather#hideWeather', '#hideWeather .lrectangle', '#hideWeather .rAndakar',
    '[data-settings-component="weather"]', '.permissionRow:has([data-permission-action="location"])',
    '#privacyDisclosureWeather', '#privacyDisclosureIp']) assert.ok(weatherRule.includes(selector), `weather hide rule: ${selector}`);
assert.match(weatherRule, /\.permissionRow:has\(\[data-permission-action="notifications"\]\)\s*\{\s*border-bottom: 0;/, 'No trailing divider after the last visible permission');
assert.match(read('scripts/menu-shortcut-page.js'), /componentEnabled = String\(item\?\.visible === true && !\(window\.MYNT_REMOVED_COMPONENT_IDS/);
assert.match(read('scripts/dashboard-tools.js'), /weather: \["weather"\]/);

(async () => {
    // Execute the full weather script, including DOM-ready initialization, with old enabled data.
    // Any unexpected network, GPS, refresh timer or storage write fails immediately.
    const listeners = {}, nodes = new Map();
    const fail = () => assert.fail('Removed weather must not request, schedule or write');
    const saved = { hideWeatherVisible: 'false', weatherApiKey: 'test-key', useGPS: 'true' };
    const context = vm.createContext({
        window: { MYNT_REMOVED_COMPONENT_IDS: ids, getComputedStyle: fail },
        document: { addEventListener(name, fn) { listeners[name] = fn; }, getElementById(id) {
            if (!nodes.has(id)) nodes.set(id, { style: {}, classList: { toggle() {} }, addEventListener() {} });
            return nodes.get(id);
        }, querySelector() { return { classList: { toggle() {} } }; } },
        localStorage: { getItem: key => saved[key] ?? null, setItem: fail, removeItem: fail },
        navigator: { geolocation: { getCurrentPosition: fail } }, fetch: fail, setInterval: fail, setTimeout: fail,
        loadCheckboxState() {}, console
    });
    vm.runInContext(read('scripts/weather.js'), context);
    listeners.DOMContentLoaded();
    await context.initializeWeather({ allowNetwork: true });
    await context.getWeatherData({ allowNetwork: true });
    assert.equal(context.isWeatherWidgetRendered(), false);
    assert.equal(listeners.visibilitychange, undefined, 'No refresh listener registered');
    // Removing only the ID restores the original visibility decision.
    context.window.MYNT_REMOVED_COMPONENT_IDS = [];
    context.window.getComputedStyle = () => ({ display: 'flex', visibility: 'visible' });
    nodes.get('hideWeather').getClientRects = () => [1];
    assert.equal(context.isWeatherWidgetRendered(), true);

    // Saved weather failures stay stored but cannot raise the service alert.
    const dashboard = read('scripts/dashboard-tools.js');
    const definitions = dashboard.slice(dashboard.indexOf('        const weatherRemoved ='), dashboard.indexOf('        function serviceFromRequest'));
    const alert = dashboard.slice(dashboard.indexOf('        function updateServiceAlert()'), dashboard.indexOf('        const serviceAlertCheckbox'));
    for (const removed of [true, false]) {
        const pill = { classList: { toggle() {} } }, text = {};
        const state = { weather: { status: 'error', at: Date.now() }, location: { status: 'error', at: Date.now() } };
        const c = vm.createContext({ window: { MYNT_REMOVED_COMPONENT_IDS: removed ? ids : [] },
            KEYS: { serviceStatus: 'status' }, readJSON: () => state, serviceAlertEnabled: () => true,
            navigator: { onLine: true }, t: (_, fallback) => fallback,
            document: { getElementById: id => id === 'serviceStatusPill' ? pill : text } });
        vm.runInContext(definitions + alert + '\nupdateServiceAlert(); serviceIds = serviceDefinitions.map(([id]) => id);', c);
        assert.deepEqual(Array.from(c.serviceIds), removed ? ['network', 'wallpaper'] : ['network', 'weather', 'location', 'wallpaper']);
        assert.equal(pill.hidden, removed, 'Weather-only failures ignored only while removed');
        assert.equal(state.weather.status, 'error', 'No old status is cleared');
    }
    console.log('Removed feature checks passed: CSS, manager, settings, layout, weather zero-network initialization and retained-service alerts.');
})().catch(error => { console.error(error); process.exitCode = 1; });

/* Isolated clock runtime fixtures. No browser, profile, network or installed packages. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../scripts/clock.js'), 'utf8');

function fixture(initial = {}, { readyState = 'complete', visibilityState = 'visible', narrow = false, video = false } = {}) {
    const values = new Map(Object.entries(initial)), writes = [], nodes = new Map(), intervals = new Map();
    const documentEvents = new Map(), windowEvents = new Map();
    let sequence = 0, now = new Date(2026, 9, 24, 18, 12, 0).getTime();
    const bind = (map, key, fn, options) => { if (!map.has(key)) map.set(key, []); map.get(key).push({ fn, once: options?.once }); };
    const emit = (map, key) => { for (const item of [...(map.get(key) || [])]) { if (item.once) map.get(key).splice(map.get(key).indexOf(item), 1); item.fn({}); } };
    const node = id => {
        if (!nodes.has(id)) {
            const classes = new Set(), handlers = new Map();
            nodes.set(id, { id, style: {}, checked: false, disabled: false, value: '', handlers, classes, children: [],
                append(child) { this.children.push(child); },
                classList: { add: name => classes.add(name), remove: name => classes.delete(name),
                    toggle(name, state) { if (state) classes.add(name); else classes.delete(name); } },
                addEventListener: (key, fn, options) => bind(handlers, key, fn, options) });
        }
        return nodes.get(id);
    };
    const localStorage = { getItem: key => values.get(key) ?? null,
        setItem(key, value) { writes.push(key); values.set(key, String(value)); }, removeItem(key) { writes.push(key); values.delete(key); } };
    const document = { readyState, visibilityState, body: { dataset: { workspaceBackground: video ? 'video' : '' } }, getElementById: node, querySelector: node,
        createElement: tag => ({ tagName: tag }),
        addEventListener: (key, fn, options) => bind(documentEvents, key, fn, options) };
    class FixtureDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } }
    const context = { document, localStorage, Date: FixtureDate,
        matchMedia: () => ({ matches: narrow }), addEventListener: (key, fn, options) => bind(windowEvents, key, fn, options),
        setInterval(fn, delay) { const id = ++sequence; intervals.set(id, { fn, delay }); return id; },
        clearInterval: id => intervals.delete(id), setTimeout: () => ++sequence,
        getLanguageStatus: () => values.get('selectedLanguage') || 'en', localizeNumbers: value => value, numberMappings: {}, isFirefoxAll: false,
        myntNormalizeGreetingName: value => value || '', myntFormatGreeting: (greeting, name) => name ? `${greeting}, ${name}` : greeting,
        translations: { en: { days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
            months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
            greeting: { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' } } },
        saveCheckboxState: (key, input) => localStorage.setItem(key, input.checked ? 'checked' : 'unchecked'),
        saveActiveStatus: (key, value) => localStorage.setItem(key, value),
        loadCheckboxState: (key, input) => { input.checked = localStorage.getItem(key) === 'checked'; },
        loadActiveStatus: (key, input) => input.classList.toggle('inactive', localStorage.getItem(key) !== 'active') };
    context.window = context;
    vm.runInNewContext(source, context);
    return { context, document, values, writes, node, intervals, documentEvents, windowEvents,
        emitWindow: key => emit(windowEvents, key), emitDocument: key => emit(documentEvents, key),
        change(id, checked) { node(id).checked = checked; emit(node(id).handlers, 'change'); },
        tick(milliseconds) { now += milliseconds; for (const timer of [...intervals.values()]) timer.fn(); } };
}

// A hidden-at-start clock can be enabled after DOMContentLoaded and still have working controls.
const late = fixture({ hideClockVisible: 'true', clocktype: 'analog', myntLayout: 'private-position-data' });
assert.equal(late.context.myntClockPreferences, undefined);
assert.equal(late.node('hideClock').checked, false, 'An explicitly hidden clock has an unchecked Show clock control.');
late.change('hideClock', true);
assert.equal(late.values.get('hideClockVisible'), 'false', 'Checked means shown; the canonical hidden boolean remains inverse.');
assert.equal(typeof late.context.myntClockPreferences.refreshVisibility, 'function');
assert.equal(late.node('digitalCheckbox').handlers.get('change').length, 1);
late.change('digitalCheckbox', true);
assert.equal(late.values.get('clocktype'), 'digital');
assert.equal(late.node('digitalClock').style.display, 'block');
assert.deepEqual([...late.intervals.values()].map(timer => timer.delay), [1000]);
const initialMinute = late.node('digiminutes').textContent;
late.tick(60000);
assert.notEqual(late.node('digiminutes').textContent, initialMinute, 'Re-added digital clock continues ticking.');

for (let index = 0; index < 20; index++) late.emitWindow('resize');
assert.equal(late.node('hideClock').handlers.get('change').length, 1, 'Resize does not duplicate visibility controls.');
assert.equal(late.node('digitalCheckbox').handlers.get('change').length, 1, 'Resize reuses one clock closure.');
assert.equal(late.documentEvents.get('visibilitychange').length, 1);
assert.equal(late.intervals.size, 1);

// Synchronization only changes clock display and intervals, never sibling geometry or saved data.
const classes = ['leftDiv', 'rightDiv', '.clockOptions'].map(id => [...late.node(id).classes]);
late.node('digitalClock').style.translate = '125px 75px';
late.node('digitalClock').style.scale = '0.8';
late.writes.length = 0;
late.values.set('clocktype', 'analog'); late.context.myntClockPreferences.refreshVisibility();
assert.deepEqual([...late.intervals.values()].map(timer => timer.delay), [500]);
assert.equal(late.node('analogClock').style.display, 'block');
assert.equal(late.node('digitalCheckbox').checked, false, 'Cross-tab mode changes also update the original control.');
assert.equal(late.node('greetingcheckbox').disabled, true);
assert.equal(late.node('timeformatField').classes.has('inactive'), true);
assert.equal(late.node('greetingField').classes.has('inactive'), true);
late.node('greetingNameInput').value = 'in-progress name';
late.values.set('clocktype', 'digital'); late.values.set('hourformat', 'true'); late.values.set('greetingEnabled', 'false');
late.context.myntClockPreferences.refreshVisibility();
assert.equal(late.node('digitalCheckbox').checked, true);
assert.equal(late.node('12hourcheckbox').checked, true);
assert.equal(late.node('greetingcheckbox').disabled, false);
assert.equal(late.node('greetingcheckbox').checked, false);
assert.equal(late.node('timeformatField').classes.has('inactive'), false);
assert.equal(late.node('greetingField').classes.has('inactive'), false);
assert.equal(late.node('greetingNameInput').disabled, true);
assert.equal(late.node('greetingNameInput').value, 'in-progress name', 'Clock synchronization does not replace a name draft.');
assert.deepEqual(['leftDiv', 'rightDiv', '.clockOptions'].map(id => [...late.node(id).classes]), classes);
assert.equal(late.node('digitalClock').style.translate, '125px 75px');
assert.equal(late.node('digitalClock').style.scale, '0.8');
assert.equal(late.values.get('myntLayout'), 'private-position-data');
assert.equal(late.writes.length, 0);

late.values.set('hideClockVisible', 'true'); late.context.myntClockPreferences.refreshVisibility();
assert.equal(late.intervals.size, 0);
late.emitDocument('visibilitychange'); assert.equal(late.intervals.size, 0, 'Hidden clocks do not resume on tab focus.');
late.values.set('hideClockVisible', 'false'); late.document.visibilityState = 'hidden';
late.context.myntClockPreferences.refreshVisibility(); assert.equal(late.intervals.size, 0);
late.document.visibilityState = 'visible'; late.emitDocument('visibilitychange'); assert.equal(late.intervals.size, 1);
late.values.set('clocktype', 'invalid');
assert.equal(late.context.myntClockPreferences.refreshVisibility(), false);
assert.equal(late.values.get('clocktype'), 'invalid'); assert.equal(late.writes.length, 0);

const early = fixture({ clocktype: 'digital' }, { readyState: 'loading', visibilityState: 'hidden' });
assert.equal(early.intervals.size, 0, 'Background startup does not start a timer.');
assert.equal(early.node('digitalCheckbox').handlers.has('change'), false);
early.document.readyState = 'interactive'; early.emitDocument('DOMContentLoaded');
assert.equal(early.node('digitalCheckbox').handlers.get('change').length, 1);
assert.equal(early.node('digitalCheckbox').checked, true, 'Canonical digital mode wins over an absent legacy checkbox cache.');
early.emitDocument('DOMContentLoaded'); assert.equal(early.node('digitalCheckbox').handlers.get('change').length, 1);
early.document.visibilityState = 'visible'; early.emitDocument('visibilitychange'); assert.equal(early.intervals.size, 1);

const narrow = fixture({ hideClockVisible: 'true' }, { narrow: true });
assert.equal(narrow.intervals.size, 0, 'Narrow-layout initialization respects an explicitly hidden clock.');
assert.equal(narrow.node('hideClock').checked, false);
narrow.emitWindow('resize'); assert.equal(narrow.intervals.size, 0);
const staleCache = fixture({ clocktype: 'digital', digitalCheckboxState: 'unchecked', hourformat: 'true', hourcheckboxState: 'unchecked' });
assert.equal(staleCache.node('digitalCheckbox').checked, true);
assert.equal(staleCache.node('12hourcheckbox').checked, true);
assert.equal(staleCache.values.get('digitalCheckboxState'), 'unchecked', 'Rendering does not rewrite legacy cache data.');

const fresh = fixture({}, { video: true });
assert.equal(fresh.node('hideClock').checked, true, 'New installations show the clock.');
assert.equal(fresh.values.has('hideClockVisible'), false, 'Rendering does not invent a hidden preference.');
assert.equal(fresh.node('analogClock').style.display, 'block');
const analogDate = fresh.node('analogClock').children[0];
assert.equal(analogDate.className, 'mynt-clock-date');
assert.equal(analogDate.textContent, 'Sat, Oct 24', 'Video workspaces show a date below the analog clock.');
assert.equal(fresh.node('date').innerText, 'Evening', 'The existing greeting is retained separately.');
fresh.change('hideClock', false);
assert.equal(fresh.values.get('hideClockVisible'), 'true', 'Unchecked stores the canonical hidden=true.');
assert.equal(fresh.intervals.size, 0);
fresh.change('hideClock', true);
assert.equal(fresh.values.get('hideClockVisible'), 'false');
assert.equal(fresh.intervals.size, 1);
fresh.context.myntClockPreferences.reload();
assert.equal(fresh.node('hideClock').checked, true, 'MCP reload also uses the positive control.');
assert.equal(fresh.node('analogClock').children.length, 1, 'Re-enabling never duplicates the date.');
fresh.tick(86400000);
assert.equal(analogDate.textContent, 'Sun, Oct 25', 'The analog date advances at midnight.');

const videoDigital = fixture({ clocktype: 'digital', greetingEnabled: 'false', hourformat: 'false' }, { video: true });
assert.equal(videoDigital.node('digihours').textContent, '18');
assert.equal(videoDigital.node('digidate').textContent, '24 Sat');
assert.equal(videoDigital.node('date').style.display, 'none');
videoDigital.values.set('hourformat', 'true'); videoDigital.context.myntClockPreferences.refreshVisibility();
assert.equal(videoDigital.node('digihours').textContent, '6');
assert.equal(videoDigital.node('amPm').textContent, 'PM');
videoDigital.values.set('greetingEnabled', 'true'); videoDigital.context.myntClockPreferences.refreshVisibility();
assert.equal(videoDigital.node('date').style.display, 'block');
assert.equal(videoDigital.node('date').innerText, 'Evening');

function locale(name) {
    return vm.runInNewContext(fs.readFileSync(require.resolve(`../locales/${name}.js`), 'utf8') + `;${name}`);
}
const en = locale('en'), zh = locale('zh_TW');
assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort(), 'English and Traditional Chinese keys stay consistent.');
assert.equal(en.showClockBox, 'Show clock');
assert.equal(en.showClockBoxInfo, 'Show the clock and date on the home page');
assert.equal(zh.showClockBox, '顯示時鐘');
assert.equal(zh.showClockBoxInfo, '在首頁顯示時鐘與日期');
assert.equal(en.hideClockBox, 'Hide Clock', 'Legacy translation keys keep their original meaning.');
for (const language of ['en', 'zh_TW', 'de']) {
    const translated = fixture({ selectedLanguage: language, hideClockVisible: 'true' });
    translated.context.translations.en = en;
    translated.context.translations.zh_TW = zh;
    // Run the actual label binding with the same English fallback as the locale loader.
    vm.runInNewContext(source.slice(source.indexOf('for (const key of'), source.indexOf('const analogDate')), translated.context);
    assert.equal(translated.node('showClockBox').textContent, language === 'zh_TW' ? zh.showClockBox : en.showClockBox);
    assert.equal(translated.node('showClockBoxInfo').textContent, language === 'zh_TW' ? zh.showClockBoxInfo : en.showClockBoxInfo);
}
const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
assert.match(html, /award-fix-home-hierarchy\.css" rel="stylesheet">\s*<link href="styles\/award-fix-clock\.css"/);
assert.match(html, /id="hideClock"[^>]*aria-labelledby="showClockBox"[^>]*aria-describedby="showClockBoxInfo"/);
const css = fs.readFileSync(require.resolve('../styles/award-fix-clock.css'), 'utf8');
assert.match(css, /body:is\([^\n]+:not\(\.mynt-layout-editing\):not\(:has\(\[data-mynt-layout\]\)\) \{/);
assert.match(css, /font-size: 128px; font-weight: 300/);
assert.match(css, /font-size: calc\(14px \* var\(--mynt-font-scale, 1\)\)/);
assert.doesNotMatch(css, /backdrop-filter/);
// 兩個有界的 !important 是必要覆寫：顯示影片自訂鐘與明確關閉所有鐘。
const customClockRule = css.match(/body\[data-workspace-background="video"\]:has\(\[data-mynt-layout\]\):has\(#hideClock:checked\)[^{]+\{([^}]+)\}/);
assert(customClockRule, 'Video custom layouts have an explicit shown-clock override');
assert.match(customClockRule[0], /:is\(#analogClock, #digitalClock\)\[data-mynt-component-display="block"\]:not\(\[data-mynt-component-hidden\]\)/);
assert.match(customClockRule[1], /display: block !important/);
assert.doesNotMatch(customClockRule[1], /translate|scale|position|width|height/, 'Saved geometry belongs to the layout engine');
assert.match(css, /body:has\(#hideClock:not\(:checked\)\) \.leftDiv :is\(#analogClock, #digitalClock\)\s*\{\s*display: none !important;/);
assert.equal((css.match(/!important;/g) || []).length, 2, 'Only the two visibility rules need priority');
assert.match(css, /body\.mynt-manual-workspace:not\(\[data-workspace-background="video"\]\) #analogClock \.mynt-clock-date\s*\{\s*display: none;/, 'The focus-card analog date is the sole date outside video workspaces');
const manual = fixture({ clocktype: 'analog' });
assert.equal(manual.node('date').innerText, manual.node('analogClock').children[0].textContent, 'The duplicate date content is covered by the CSS rule above');
for (const [, animation] of css.matchAll(/\banimation:\s*([^;]+);/g)) assert.equal(animation.trim(), 'none');
console.log('Clock lifecycle checks passed: late/early controls, one runtime across resize, ticking re-add, mode synchronization, no hidden-tab timers, malformed preservation and untouched saved positions.');
console.log('Clock defaults checks passed: new-install visibility, positive toggle/readback, video dates, 12/24 hours, greeting, locale fallback and scoped layout styling.');

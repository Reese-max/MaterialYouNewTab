const assert = require('node:assert/strict');
const fs = require('node:fs');
const api = require('../scripts/centered-layout.js');

function storage(seed = {}) {
    const values = new Map(Object.entries(seed)), writes = [];
    return { values, writes, getItem: key => values.has(key) ? values.get(key) : null, setItem(key, value) { writes.push(key); values.set(key, value); } };
}
const old = { version: 2, snap: true, locked: false, blocks: { clock: { x: .23, y: .36, s: .5 }, bookmarks: { x: .1, y: .2, s: 1.75 } } };
const fresh = () => ({ version: 1, revision: 8, active: 'pactive', profiles: [{ id: 'pactive', name: 'Work', layouts: { wide: structuredClone(old), narrow: structuredClone(old) }, previous: {} }] });
const unrelated = { theme: 'dark', selectedLanguage: 'en' };
const store = storage({ ...unrelated, [api.KEY]: JSON.stringify(fresh()) });
assert.equal(api.migrate(store), true);
const migrated = JSON.parse(store.getItem(api.KEY)), active = migrated.profiles.find(p => p.id === 'pactive'), backup = migrated.profiles.find(p => p.name === '舊版面（自動備份）');
assert.ok(backup); assert.notEqual(backup.id, active.id);
assert.deepEqual(backup.layouts.wide.blocks, old.blocks); assert.deepEqual(backup.layouts.narrow.blocks, old.blocks);
for (const size of ['wide', 'narrow']) { assert.deepEqual(active.layouts[size].blocks, {}); assert.deepEqual({ version: active.layouts[size].version, snap: active.layouts[size].snap, locked: active.layouts[size].locked }, { version: old.version, snap: old.snap, locked: old.locked }); }
assert.deepEqual(Object.fromEntries([...store.values].filter(([key]) => ![api.KEY, api.FLAG].includes(key))), unrelated);
assert.equal(api.migrate(store), false); assert.equal(store.writes.filter(key => key === api.KEY).length, 1);
store.values.delete(api.FLAG); assert.equal(api.migrate(store), true);
assert.equal(JSON.parse(store.getItem(api.KEY)).profiles.filter(p => p.name === '舊版面（自動備份）').length, 1, 'A saved profile write with a failed flag write cannot duplicate its backup on retry.');
for (const initial of [{ ...unrelated }, { ...unrelated, [api.KEY]: '{malformed' }]) {
    const safe = storage(initial); assert.equal(api.migrate(safe), true);
    assert.equal(safe.getItem(api.KEY), initial[api.KEY] ?? null); assert.deepEqual(Object.fromEntries([...safe.values].filter(([key]) => key !== api.FLAG && key !== api.KEY)), unrelated);
}
const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
assert.match(html, /<div[^>]*id="homeToolbar"[^>]*>[\s\S]*?id="googleAppsCont"[\s\S]*?id="bookmarkButton"/);
assert.match(html, /id="myntHomeWidgets"[^>]*hidden/);
const centeredCss = fs.readFileSync(require.resolve('../styles/centered-home.css'), 'utf8');
assert.match(centeredCss, /body \.centerDiv,\s*body #rightDiv\s*\{[^}]*transform: none !important;[^}]*translate: none !important;[^}]*scale: none !important;/, 'Centered search ancestors must not establish a fixed-position containing block, including in edit mode.');
assert.match(centeredCss, /#quickLinksRow #shortcutsContainer > \* > a[\s\S]*?height:\s*42px[\s\S]*?padding:\s*0 14px/);
assert.match(centeredCss, /#quickLinksRow #shortcutsContainer \.shortcut-name[\s\S]*?position:\s*static[\s\S]*?visibility:\s*visible/);
const centeredSource = fs.readFileSync(require.resolve('../scripts/centered-layout.js'), 'utf8');
const addFlow = centeredSource.slice(centeredSource.indexOf("const wireAdd"));
for (const step of ['shortcutsCheckbox', 'menuButton', 'data-settings-group-button="work"', 'shortcutEditButton', 'newShortcutButton']) {
    assert.ok(addFlow.includes(step), `Quick-link add flow must use ${step}.`);
}
assert.ok(addFlow.indexOf('menuButton') < addFlow.indexOf('shortcutEditButton'));
assert.ok(addFlow.indexOf('shortcutEditButton') < addFlow.indexOf('newShortcutButton'));
for (const [, selectors, declarations] of centeredCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const targetsShortcuts = selectors.split(',').some(selector => /#shortcuts-section(?:\s*:[\w-]+(?:\([^)]*\))?)*\s*$/.test(selector.trim()));
    if (targetsShortcuts) assert.doesNotMatch(declarations, /display\s*:\s*(?!none\b)[^;}]+!important/i, 'Disabled shortcuts must retain the component manager hidden state.');
}
const widgets = fs.readFileSync(require.resolve('../scripts/home-widgets.js'), 'utf8');
assert.match(widgets, /mynt-removed-features[\s\S]*?return;/);
assert.match(centeredCss, /#myntComponentManager label:has\(#myntComponent-homeWidgets\)/);
assert.match(centeredCss, /#quickLinksRow #aiToolsCont:not\(\[data-mynt-component-hidden\]\):not\(\[style\*="display: none"\]\)/, 'Disabled AI tools must stay hidden.');
assert.doesNotMatch(centeredCss, /#quickLinksRow #aiToolsCont,/, 'Unguarded #aiToolsCont display override would show disabled AI tools.');
const full = storage({ [api.KEY]: JSON.stringify(fresh()) }); const originalSet = full.setItem; full.setItem = (key, value) => { if (key === api.KEY) throw Error('QuotaExceededError'); originalSet.call(full, key, value); };
assert.equal(api.migrate(full), false); assert.equal(full.getItem(api.FLAG), null, 'A failed profile write must leave the migration pending.');
full.setItem = originalSet; assert.equal(api.migrate(full), true); assert.equal(full.getItem(api.FLAG), 'true');
assert.match(html, /id="quickLinksRow" role="group" aria-label=/);
assert.match(centeredCss, /@media \(max-width: 600px\) \{ body #quickLinksRow \{ row-gap: 6px; column-gap: 6px; \} \}\s*$/);
const dashboardTools = fs.readFileSync(require.resolve('../scripts/dashboard-tools.js'), 'utf8');
const removedCommandMap = dashboardTools.match(/REMOVED_COMMANDS = \{([\s\S]*?)\}/);
assert.ok(removedCommandMap, 'Command palette must map removed features to their commands.');
for (const id of ['todo', 'quick-create-task', 'scratchpad', 'scratchpadCopy', 'focus-history', 'focus-gpt', 'exam-today']) assert.ok(removedCommandMap[1].includes(`"${id}"`), `Removed feature command ${id} must be hidden from the palette.`);
assert.match(dashboardTools, /\]\.filter\(command => !hiddenCommandIds\.has\(command\.id\)\)/, 'Palette results must drop commands of removed features.');
const lazyBookmarks = fs.readFileSync(require.resolve('../scripts/bookmarks.js'), 'utf8');
assert.doesNotMatch(lazyBookmarks, /^\s*document\.addEventListener\(\s*["']DOMContentLoaded["']/m, 'bookmarks.js is lazy-loaded after DOMContentLoaded, so its init must run immediately when the DOM is ready.');
assert.match(centeredCss, /html\.mynt-removed-features body (?:#analogClock){3},\s*html\.mynt-removed-features body (?:#digitalClock){3},\s*html\.mynt-removed-features body (?:#date){3} \{ display: none !important; \}/, 'The owner removed the clock and the date from the homepage.');
assert.match(centeredCss, /html\.mynt-removed-features body #searchbar \{ inset-block-start: calc\(50vh - 96px\) !important; \}/, 'Search group must sit on the optical center once clock and date are removed.');
assert.match(centeredCss, /#pomodoroCont#pomodoroCont \{[\s\S]*?inset: 16px auto auto 20px !important;[\s\S]*?border-radius: 50% !important;/, 'Pomodoro button must mirror the top-right toolbar as a circle.');
assert.match(centeredCss, /#quickLinksRow #shortcuts-section \{ column-gap: 8px; row-gap: 8px;/, 'Shortcut pills need the row gap because component-manager forces #shortcuts-section to flex.');
assert.doesNotMatch(centeredCss.match(/#pomodoroCont#pomodoroCont \{[^}]*\}/)[0], /display\s*:[^;]*!important/, 'Pomodoro corner rule must not force display, or disabling the widget cannot hide it.');
const pomodoroSource = fs.readFileSync(require.resolve('../scripts/pomodoro.js'), 'utf8');
assert.match(pomodoroSource, /e\.key !== "Escape" \|\| !panelOpen[\s\S]*?closePanel\(\);[\s\S]*?pomodoroCont\.focus\(\)/, 'Escape must close the pomodoro panel and return focus to its button.');
assert.match(pomodoroSource, /pomodoroCont\.classList\.toggle\("pomodoro-active", active\)[\s\S]*?--pomo-elapsed/, 'The corner button must mirror an active countdown.');
assert.match(centeredCss, /#pomodoroCont#pomodoroCont\.pomodoro-active::before \{[\s\S]*?conic-gradient\(#234c78 calc\(var\(--pomo-elapsed/, 'Active pomodoro needs the elapsed-time ring.');
const studioSource = fs.readFileSync(require.resolve('../scripts/pomodoro-studio.js'), 'utf8');
assert.match(studioSource, /fitBackdrop=css=>\{if\(!panel\.clientHeight\)return;[\s\S]*?const height=Math\.floor\([\s\S]*?if\(!\(height>0\)\)return;/, 'The panel backdrop must floor its height, or a subpixel overflow shows a scrollbar.');
assert.match(centeredCss, /#pomodoroCont\[aria-expanded="true"\] #pomodoroHover \{ display: none !important; \}/, 'The corner tooltip must not peek out from behind the open pomodoro panel.');
assert.match(centeredCss, /\.pomodoroControls #pomodoroResetBtn \{[^}]*border-radius: 50% !important;/, 'Reset is a round secondary next to a full-width start button.');
assert.match(centeredCss, /#pomodoroPanel::after \{ content: none !important; \}/, 'The main panel must not cover the chosen background with an opaque surface.');
assert.match(centeredCss, /#pomodoroPanel\.mynt-pomo-static > \.pomoStudioBackdrop::before \{[^}]*background-image: var\(--pomo-background, none\)/, 'Static backgrounds paint on the sticky backdrop so they show in the main panel without a scroll seam.');
assert.match(centeredCss, /\.pomoStudioBackdrop > \.pomodoro-bg-overlay \{ background: color-mix\(in srgb, var\(--pomo-surface, #ffffff\) 74%, transparent\) !important;/, 'A 74% surface scrim keeps muted and accent text at WCAG AA even over a black background.');
assert.match(centeredCss, /\.pomoStudioBackdrop::before \{ filter: invert\(1\) hue-rotate\(180deg\) blur\(14px\) saturate\(1\.5\); \}/, 'Dark mode must undo the page inversion on the picture layer so photos are not negatives.');
assert.match(centeredCss, /\.mynt-pomo-background-choices \{ grid-template-columns: minmax\(0, 1fr\) !important;[\s\S]*?\.mynt-pomo-background-label \{[^}]*overflow-wrap: normal !important;/, 'Background choices are a one-column list so English labels never break mid-word in the ~200px panel.');
console.log('CENTERED_LAYOUT_CHECK_OK');

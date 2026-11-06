const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const ids = ['focus', 'todo', 'scratchpad', 'exam', 'profilesEntry', 'adaptiveEntry'];
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
assert.match(manager, /const isRemoved = removed\.has\(item\.id\);\s*node\.toggleAttribute\('data-mynt-component-hidden', item\.id === 'focus' \? !item\.visible : isRemoved \|\| !item\.visible\);\s*const display = isRemoved && item\.id !== 'focus' \? 'none' : item\.display;/, 'focus hidden attribute follows only the user preference; other removed IDs remain hidden');
assert.match(manager, /for \(const selector of item\.panelSelectors\) for \(const node of document\.querySelectorAll\(selector\)\) node\.toggleAttribute\('data-mynt-component-hidden', !item\.visible\);/, 'panel selectors follow user visibility only, not removal');
assert.match(manager, /if \(item\.id === 'focus'\) node\.inert = isRemoved;/, 'removed focus must be inert');
assert.match(manager, /if \(item\.id === 'focus' && item\.visible\) \{\s*const heading = document\.getElementById\('userText'\), actions = document\.getElementById\('dailyFocusActions'\);\s*if \(heading\) heading\.style\.display = 'block';\s*if \(actions\) actions\.style\.display = 'flex';\s*\}/, 'original focus display restoration block must remain');
for (const checkbox of ['userTextCheckbox', 'todoListCheckbox', 'scratchpadCheckbox', 'examDailyCheckbox']) {
    assert.ok(css.includes(`:has(#${checkbox})`), `settings toggle row remains visible: ${checkbox}`);
}
assert.ok(css.includes('[data-workspace-widget="todoListCheckbox"]'));
assert.ok(css.includes('[data-workspace-widget="scratchpadCheckbox"]'));
const focusRule = [...css.matchAll(/html\.mynt-removed-features body :is\(([^)]*)\)\s*\{([^}]*)\}/g)].find(match => /visibility:\s*hidden\s*!important/.test(match[2]));
assert.ok(focusRule, 'removed focus needs a dedicated rule');
for (const selector of ['#dailyFocusPanel', '.ttteexxtt', '#userText', '#dailyFocusActions']) assert.ok(focusRule[1].includes(selector), `focus visibility rule missing ${selector}`);
assert.match(focusRule[2], /visibility:\s*hidden\s*!important/);
assert.match(focusRule[2], /pointer-events:\s*none\s*!important/);
const displayRule = css.slice(0, css.indexOf('\n}'));
assert.match(displayRule, /display:\s*none\s*!important/);
for (const selector of ['#dailyFocusPanel', '.ttteexxtt', '#userText', '#dailyFocusActions']) {
    const exactSelector = new RegExp(`(?<![\\w-])${selector.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}(?![\\w-])`);
    assert.ok(!exactSelector.test(displayRule), `${selector} must not collapse via display:none`);
}
const focus = core.definitions.find(item => item.id === 'focus');
assert.deepEqual(focus.selectors, ['#userText', '#dailyFocusActions']);
assert.deepEqual(focus.panelSelectors, ['#dailyFocusPanel']);
for (const selector of ['.ttteexxtt', '#userText', '#dailyFocusActions']) {
    assert.ok(!focus.panelSelectors.includes(selector), `${selector} must not be hidden through a removed focus panel selector`);
}
for (const selector of ['#todoListCont', '#scratchpadCont', '#examDaily', '#myntProfilesPanel', '#myntAdaptivePanel']) assert.ok(displayRule.includes(selector), `other removed feature must retain display:none: ${selector}`);
assert.match(read('scripts/layout-editor.js'), /MYNT_REMOVED_LAYOUT_IDS\.has\(id\)/);
assert.ok(read('index.html').indexOf('scripts/removed-features.js') < read('index.html').indexOf('style.css'));
console.log('Removed feature visibility, settings, manager, and layout checks passed.');

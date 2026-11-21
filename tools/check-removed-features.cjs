const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const ids = ['todo', 'exam', 'profilesEntry', 'adaptiveEntry'];
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
for (const checkbox of ['todoListCheckbox', 'examDailyCheckbox']) {
    assert.ok(css.includes(`:has(#${checkbox})`), `settings toggle row remains visible: ${checkbox}`);
}
assert.ok(css.includes('[data-workspace-widget="todoListCheckbox"]'));
assert.ok(css.includes('label:has(> [data-workspace-widget="todoListCheckbox"])'), 'The workspace editor hides the whole To-Do choice, not only its checkbox');
const displayRule = css.slice(0, css.indexOf('\n}'));
assert.match(displayRule, /display:\s*none\s*!important/);
for (const selector of ['#todoListCont', '#examDaily', '#myntProfilesPanel', '#myntAdaptivePanel']) assert.ok(displayRule.includes(selector), `other removed feature must retain display:none: ${selector}`);
assert.match(read('scripts/layout-editor.js'), /MYNT_REMOVED_LAYOUT_IDS\.has\(id\)/);
assert.ok(read('index.html').indexOf('scripts/removed-features.js') < read('index.html').indexOf('style.css'));
console.log('Removed feature visibility, settings, manager, and layout checks passed.');

'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../scripts/component-visibility-core.js');

const rows = {
    shortcuts: ['shortcutEditField', 'adaptiveIconField'],
    aiTools: ['aiToolsEditField']
};
const preferences = { shortcuts: 'shortcutsCheckboxState', aiTools: 'aiToolsCheckboxState' };
const preserved = {
    shortcutAmount: '1', shortcutName0: 'Saved shortcut', shortcutURL0: 'https://example.org/',
    shortcutIcon0: 'data:image/png;base64,fixture', adaptiveIconToggle: 'checked',
    aiToolsSettings: '[{"chatGPT":true},{"gemini":false},{"claude":true}]',
    myntLayoutProfilesV1: 'saved-layout', myntPomoTimerV1: 'running-timer',
    myntScratchpadContent: 'saved-note'
};
const entries = app => [...app.values].sort(([a], [b]) => a.localeCompare(b));

function fixture(initial = {}) {
    const values = new Map(Object.entries({
        ...preserved, myntComponentsMigrationV1: '{"version":1,"previous":{}}', ...initial
    }));
    const nodes = new Map(), all = [], events = {}, writes = [];
    class Element {
        constructor() {
            this.children = []; this.dataset = {}; this.attrs = new Map(); this.handlers = {};
            this.style = { setProperty(key, value) { this[key] = value; } };
            const classes = new Set(['ttcont']);
            this.classList = {
                contains: name => classes.has(name), remove: name => classes.delete(name),
                toggle(name, force = !classes.has(name)) {
                    if (force) classes.add(name); else classes.delete(name);
                    return Boolean(force);
                }
            };
        }
        append(...items) { this.children.push(...items); }
        prepend(item) { this.children.unshift(item); }
        setAttribute(key, value) { this.attrs.set(key, String(value)); }
        hasAttribute(key) { return this.attrs.has(key); }
        toggleAttribute(key, force) { if (force) this.attrs.set(key, ''); else this.attrs.delete(key); }
        addEventListener(type, handler) { this.handlers[type] = handler; }
        contains(target) { return this === target || this.children.some(child => child.contains(target)); }
        matches() { return false; }
    }
    const node = id => {
        if (!nodes.has(id)) { const element = new Element(); element.id = id; nodes.set(id, element); }
        return nodes.get(id);
    };
    for (const item of core.definitions) for (const selector of [...item.selectors, ...item.panelSelectors]) node(selector.slice(1));
    // These classes model legacy loadSettings before the manager starts.
    for (const [id, settingsRows] of Object.entries(rows)) {
        for (const row of settingsRows) {
            const active = id === 'shortcuts' ? values.get(row) === 'active' : values.get(preferences[id]) === 'checked';
            node(row).classList.toggle('inactive', !active);
        }
    }
    const host = new Element();
    const document = {
        readyState: 'complete', body: new Element(), getElementById: node,
        createElement() { const element = new Element(); all.push(element); return element; },
        querySelector: selector => selector === '#overviewPage > .toggleTextsCont' ? host : null,
        querySelectorAll: selector => nodes.has(selector.slice(1)) ? [node(selector.slice(1))] : [],
        addEventListener(type, handler) { events[type] = handler; }, dispatchEvent() {}
    };
    const localStorage = {
        getItem: key => values.get(key) ?? null,
        setItem(key, value) { writes.push(['setItem', key, value]); values.set(key, value); },
        removeItem(key) { writes.push(['removeItem', key]); values.delete(key); }
    };
    const root = {
        MYNTComponentVisibilityCore: core, addEventListener(type, handler) { events[type] = handler; },
        myntAiPreferences: { reload() { assert.fail('Visibility refresh must not reload AI content.'); } },
        myntShortcuts: { reload() { assert.fail('Visibility refresh must not reload shortcuts.'); } }
    };
    vm.runInNewContext(fs.readFileSync(require.resolve('../scripts/component-manager.js'), 'utf8'), {
        window: root, localStorage, document, queueMicrotask: callback => callback(),
        MutationObserver: class { observe() {} }, CustomEvent: class {}
    });
    const control = id => all.find(element => element.id === `myntComponent-${id}`);
    return { values, node, events, root, control, writes,
        change(id, visible) { const input = control(id); input.checked = visible; input.handlers.change(); }
    };
}

function assertState(app, id, visible) {
    assert.equal(app.control(id).checked, visible, `${id} manager checkbox`);
    assert.equal(app.node(id === 'shortcuts' ? 'shortcutsCheckbox' : 'aiToolsCheckbox').checked, visible, `${id} original checkbox`);
    for (const row of rows[id]) {
        assert.equal(app.node(row).classList.contains('inactive'), !visible, `${row} follows canonical visibility`);
        assert(app.node(row).classList.contains('ttcont'), `${row} retains unrelated classes`);
    }
    assert.equal(app.node(id === 'shortcuts' ? 'shortcuts-section' : 'aiToolsCont').hasAttribute('data-mynt-component-hidden'), !visible);
}

for (const id of Object.keys(rows)) {
    const key = preferences[id];
    const app = fixture({ [key]: 'unchecked', shortcutEditField: 'inactive', adaptiveIconField: 'inactive' });
    assertState(app, id, false);
    assert.equal(app.writes.length, 0, 'Initial refresh does not write storage.');
    for (const visible of [true, false]) {
        app.change(id, visible);
        assertState(app, id, visible);
        if (id === 'shortcuts') {
            for (const row of rows.shortcuts) assert.equal(app.values.get(row), visible ? 'active' : 'inactive');
        }
        for (const [key, value] of Object.entries(preserved)) assert.equal(app.values.get(key), value, `${key} survives visibility toggles`);
        const before = entries(app);
        app.writes.length = 0;
        app.root.myntComponents.refresh();
        assertState(app, id, visible);
        assert.deepEqual(entries(app), before, 'Refresh preserves every stored value.');
        assert.equal(app.writes.length, 0, 'Refresh never rewrites visibility/cache/content data.');
    }

    // Another tab can update the canonical checkbox while legacy class caches
    // remain stale. Both directions must immediately follow canonical visibility.
    for (const visible of [true, false]) {
        app.values.set(key, visible ? 'checked' : 'unchecked');
        const before = entries(app);
        app.events.storage({ key });
        assertState(app, id, visible);
        assert.deepEqual(entries(app), before, 'Cross-tab refresh preserves stale cache values rather than writing them.');
        assert.equal(app.writes.length, 0, 'Cross-tab refresh is read-only.');
    }
    app.values.set(key, 'checked');
    app.events['mynt:mcp-settings-refresh']();
    assertState(app, id, true);
    assert.equal(app.writes.length, 0, 'MCP settings refresh is read-only.');
    app.values.set(key, 'broken');
    const corrupt = entries(app);
    app.root.myntComponents.refresh();
    assert(app.control(id).disabled);
    for (const row of rows[id]) assert.equal(app.node(row).classList.contains('inactive'), false, 'Invalid preferences do not overwrite the last valid row state.');
    assert.deepEqual(entries(app), corrupt, 'Malformed preferences are preserved.');
    assert.equal(app.writes.length, 0);
}

const coldEnabled = fixture({ shortcutsCheckboxState: 'checked', aiToolsCheckboxState: 'checked', shortcutEditField: 'inactive', adaptiveIconField: 'inactive' });
for (const id of Object.keys(rows)) assertState(coldEnabled, id, true);
assert.equal(coldEnabled.writes.length, 0, 'Cold initialization reconciles stale row caches without writing data.');

const defaults = fixture();
for (const id of Object.keys(rows)) assertState(defaults, id, false);
assert.equal(defaults.writes.length, 0, 'Default rendering does not materialize preferences.');
for (const key of Object.values(preferences)) defaults.values.set(key, 'checked');
defaults.root.myntComponents.refresh();
for (const id of Object.keys(rows)) assertState(defaults, id, true);
defaults.values.clear();
defaults.events.storage({ key: null });
for (const id of Object.keys(rows)) assertState(defaults, id, false);
assert.equal(defaults.writes.length, 0, 'Cross-tab storage clear does not recreate preferences.');
assert.equal(defaults.values.size, 0);
console.log('Component settings regression passed: shortcut/AI false-to-true-to-false controls, cross-tab/MCP refresh, canonical defaults, malformed-state preservation, unchanged content/layout/timer data and zero refresh writes.');

#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../scripts/component-visibility-core.js');
const countdown = require('../scripts/event-countdown-core.js');
const source = fs.readFileSync(path.join(__dirname, '../scripts/component-visibility-core.js'), 'utf8');

function storage(seed = {}) {
    const data = new Map(Object.entries(seed));
    return { data, getItem: key => data.has(key) ? data.get(key) : null,
        setItem() { throw Error('Pure planning must never write.'); },
        removeItem() { throw Error('Pure planning must never remove.'); } };
}
function apply(store, plan) { plan.writes.forEach(({ key, value }) => store.data.set(key, value)); }
function item(store, id) { return core.read(store).find(value => value.id === id); }
function throwsCode(fn, code) { assert.throws(fn, error => error.code === code); }

const ids = ['clock', 'weather', 'focus', 'search', 'shortcuts', 'aiTools', 'googleApps', 'bookmarks', 'todo', 'pomodoro', 'homeWidgets', 'bongo', 'scratchpad', 'studyQuote', 'motivationalQuotes', 'exam', 'countdowns', 'galleryEntry', 'profilesEntry', 'adaptiveEntry'];
assert.deepEqual(core.definitions.map(value => value.id), ids);
assert.equal(new Set(core.definitions.map(value => value.key)).size, ids.length);
assert.deepEqual(core.definitions.find(value => value.id === 'clock').selectors, ['#analogClock', '#digitalClock', '#date']);
assert.deepEqual(core.definitions.find(value => value.id === 'countdowns').panelSelectors, [], 'Countdown configuration remains accessible while the card is hidden.');
assert.ok(Object.isFrozen(core.definitions));
assert.ok(Object.isFrozen(core.storageKeys));
assert.ok(core.definitions.every(value => Object.isFrozen(value) && Object.isFrozen(value.keys) && Object.isFrozen(value.selectors)));
assert.deepEqual(core.definitions.filter(value => value.newPreference).map(value => value.key), ['myntSearchVisible', 'myntHomeWidgetsVisible', 'myntGalleryEntryVisible', 'myntProfilesEntryVisible', 'myntAdaptiveEntryVisible']);
assert.ok(core.definitions.filter(value => value.newPreference).every(value => !value.key.startsWith('myntWallpaper')),
    'New entry preferences must survive settings-only backup media filtering.');
const empty = storage();
const defaultsOn = new Set(['clock', 'weather', 'focus', 'search', 'homeWidgets', 'scratchpad', 'studyQuote', 'exam', 'countdowns', 'galleryEntry', 'profilesEntry', 'adaptiveEntry']);
for (const value of core.read(empty)) {
    assert.equal(value.valid, true, value.id);
    assert.equal(value.visible, defaultsOn.has(value.id), value.id);
}
assert.equal(empty.data.size, 0, 'Reads must not populate defaults.');

for (const definition of core.definitions) {
    const store = storage({ unrelatedPersonalData: 'retain' });
    for (const visible of [false, true, false, true]) {
        const before = [...store.data];
        const plan = core.plan(store, definition.id, visible);
        assert.deepEqual([...store.data], before, 'Planning must not write.');
        assert.deepEqual(plan.expected.map(value => value.key), core.storageKeys);
        assert.equal(plan.id, definition.id);
        assert.equal(plan.visible, visible);
        assert.equal(plan.unchanged, plan.writes.length === 0);
        assert.ok(plan.writes.every(value => definition.keys.includes(value.key)), 'No unrelated writes.');
        apply(store, plan);
        assert.equal(item(store, definition.id).visible, visible, definition.id);
        assert.equal(store.data.get('unrelatedPersonalData'), 'retain');
        assert.equal(core.plan(store, definition.id, visible).writes.length, 0, 'Same-value plans are idempotent.');
    }
}
for (const id of ['clock', 'weather']) {
    const plan = core.plan(storage(), id, false);
    assert.equal(plan.writes[0].value, 'true', 'Legacy hidden booleans are inverted.');
}
assert.deepEqual(core.plan(storage(), 'shortcuts', true).writes, [
    { key: 'shortcutsCheckboxState', value: 'checked' },
    { key: 'shortcutsDisplayStatus', value: 'flex' },
    { key: 'shortcutEditField', value: 'active' },
    { key: 'adaptiveIconField', value: 'active' }
]);
assert.equal(core.plan(storage(), 'bongo', true).writes.find(value => value.key === 'bongoCatDisplayStatus').value, 'block');
assert.deepEqual(core.plan(storage(), 'studyQuote', false).writes, [{ key: 'myntStudyQuoteEnabled', value: '0' }]);
const mismatch = storage({ aiToolsCheckboxState: 'checked', aiToolsDisplayStatus: 'none' });
assert.equal(item(mismatch, 'aiTools').visible, true, 'Canonical preference owns visibility.');
assert.deepEqual(core.plan(mismatch, 'aiTools', true).writes, [{ key: 'aiToolsDisplayStatus', value: 'flex' }]);

for (const definition of core.definitions) {
    const raw = definition.kind === 'event-enabled' ? '{"version":99}' : 'malformed';
    const store = storage({ [definition.key]: raw });
    const before = [...store.data];
    const value = item(store, definition.id);
    assert.equal(value.valid, false, definition.id);
    assert.equal(value.visible, null);
    assert.equal(value.error.code, 'INVALID_STORAGE');
    throwsCode(() => core.plan(store, definition.id, true), 'INVALID_STORAGE');
    assert.deepEqual([...store.data], before, 'Malformed data must remain intact.');
}
const badCache = storage({ pomodoroCheckboxState: 'checked', pomodoroDisplayStatus: 'grid' });
throwsCode(() => core.plan(badCache, 'pomodoro', false), 'INVALID_STORAGE');
assert.equal(item(badCache, 'pomodoro').visible, null);
assert.equal(item(badCache, 'focus').valid, true, 'Unrelated invalid preferences do not disable healthy UI controls.');
assert.ok(core.plan(badCache, 'focus', false).writes.every(value => value.key === 'userTextVisible'));

const event = { id: 'e-test', name: '  Keep original text  ', date: '2027-01-01', category: 'custom', emoji: '📅', color: 'blue', annual: false };
const eventData = { version: 1, revision: 5, enabled: true, events: [event], deleted: { index: 0, event: { ...event, id: 'e-retained' } } };
countdown.validate(eventData);
const events = storage({ myntEventCountdownsV1: JSON.stringify(eventData), myntExamDate: '2026-12-31' });
const eventPlan = core.plan(events, 'countdowns', false);
const nextEvents = JSON.parse(eventPlan.writes[0].value);
assert.equal(nextEvents.revision, 6);
assert.equal(nextEvents.enabled, false);
assert.deepEqual(nextEvents.events, eventData.events, 'Do not normalize away valid original event content.');
assert.deepEqual(nextEvents.deleted, eventData.deleted, 'Preserve recoverable event data.');
assert.equal(eventPlan.writes.length, 1, 'Legacy date must never be changed.');
assert.ok(eventPlan.expected.some(value => value.key === 'myntExamDate' && value.value === '2026-12-31'));
apply(events, eventPlan);
assert.equal(core.plan(events, 'countdowns', false).writes.length, 0, 'No revision increments for no-op requests.');
const legacy = storage({ myntExamDate: '2027-01-20' });
assert.equal(item(legacy, 'countdowns').visible, true);
const migrationPlan = core.plan(legacy, 'countdowns', false);
const migrated = JSON.parse(migrationPlan.writes[0].value);
assert.equal(migrated.events[0].date, '2027-01-20');
assert.equal(migrated.revision, 1);
assert.equal(legacy.data.size, 1, 'Legacy migration is planned, not written.');
throwsCode(() => core.plan(storage({ myntExamDate: 'not-a-date' }), 'countdowns', false), 'INVALID_STORAGE');
throwsCode(() => core.plan(storage({ myntEventCountdownsV1: JSON.stringify({ ...eventData, revision: Number.MAX_SAFE_INTEGER }) }), 'countdowns', false), 'INVALID_STORAGE');

for (const value of [undefined, 'false', 0, null, {}, []]) throwsCode(() => core.plan(storage(), 'focus', value), 'INVALID_ARGUMENT');
for (const value of ['__proto__', 'constructor', 'unknown', null, {}]) throwsCode(() => core.plan(storage(), value, true), 'INVALID_ARGUMENT');
throwsCode(() => core.read(null), 'UNAVAILABLE');
throwsCode(() => core.read({ getItem() { throw Error('denied'); } }), 'STORAGE_FAILURE');
throwsCode(() => core.read({ getItem() { return undefined; } }), 'STORAGE_FAILURE');

// Upgrade compatibility initializes absent preferences only, with recoverable preimages.
assert.equal(core.MIGRATION_KEY, 'myntComponentsMigrationV1');
assert.ok(!core.storageKeys.includes(core.MIGRATION_KEY), 'Compatibility metadata is not parallel visibility state.');
assert.equal(core.validateMigration(null), null);
const migrationStore = storage({ unrelatedPersonalData: 'retain' });
const legacyDefaults = core.planMigration(migrationStore, { hiddenByLegacyStyles: ['clock', 'weather'] });
assert.deepEqual([...migrationStore.data], [['unrelatedPersonalData', 'retain']], 'Migration planning never writes.');
assert.deepEqual(legacyDefaults.migrated, ['weather']);
assert.deepEqual(legacyDefaults.expected.map(value => value.key), [...core.storageKeys, core.MIGRATION_KEY]);
assert.deepEqual(legacyDefaults.writes.slice(0, -1), [{ key: 'hideWeatherVisible', value: 'true' }]);
const marker = core.validateMigration(legacyDefaults.writes.at(-1).value);
assert.deepEqual(marker, { version: 1, previous: { hideWeatherVisible: null } });
apply(migrationStore, legacyDefaults);
assert.equal(item(migrationStore, 'clock').visible, true, 'Legacy CSS no longer auto-hides a new-install clock.');
assert.equal(migrationStore.data.has('hideClockVisible'), false);
assert.equal(item(migrationStore, 'weather').visible, false);
assert.deepEqual(core.planMigration(migrationStore, { hiddenByLegacyStyles: ['clock', 'weather'] }).writes, []);
apply(migrationStore, core.plan(migrationStore, 'clock', true));
assert.equal(item(migrationStore, 'clock').visible, true, 'Intentional edits use only canonical preferences.');
assert.deepEqual(core.planMigration(migrationStore, { hiddenByLegacyStyles: ['clock'] }).writes, [], 'Marker never reapplies CSS defaults.');
// The old marker records an initial preimage, never later user intent.
for (const hidden of ['true', 'false']) {
    const old = storage({ hideClockVisible: hidden, [core.MIGRATION_KEY]: '{"version":1,"previous":{"hideClockVisible":null}}' });
    const before = [...old.data];
    for (let run = 0; run < 3; run++) apply(old, core.planMigration(old, { hiddenByLegacyStyles: ['clock'] }));
    assert.deepEqual([...old.data], before, 'Old auto-initialized and later explicitly edited values are indistinguishable; preserve both.');
    assert.equal(item(old, 'clock').visible, hidden === 'false');
}
for (const clock of ['true', 'false']) for (const weather of ['true', 'false']) {
    const store = storage({ hideClockVisible: clock, hideWeatherVisible: weather });
    const plan = core.planMigration(store, { hiddenByLegacyStyles: ['clock', 'weather'] });
    assert.deepEqual(plan.migrated, []);
    assert.deepEqual(plan.writes, [{ key: core.MIGRATION_KEY, value: '{"version":1,"previous":{}}' }], 'Explicit show and hide preferences both remain untouched.');
}
const notHidden = core.planMigration(storage(), { hiddenByLegacyStyles: [] });
assert.deepEqual(notHidden.migrated, []);
assert.equal(notHidden.writes.length, 1, 'No positive hidden evidence means no visibility changes.');
assert.equal(notHidden.writes[0].key, core.MIGRATION_KEY);
for (const malformed of ['{', 'null', '[]', '{}', '{"version":2,"previous":{}}', '{"version":1,"previous":{},"extra":true}', '{"version":1,"previous":{"hideClockVisible":"false"}}', '{"version":1,"previous":{"unknown":null}}']) {
    throwsCode(() => core.validateMigration(malformed), 'INVALID_STORAGE');
    const store = storage({ [core.MIGRATION_KEY]: malformed });
    throwsCode(() => core.planMigration(store, { hiddenByLegacyStyles: ['clock'] }), 'INVALID_STORAGE');
    assert.equal(store.data.size, 1);
    assert.equal(store.data.get(core.MIGRATION_KEY), malformed);
}
for (const key of ['hideClockVisible', 'hideWeatherVisible']) {
    const store = storage({ [key]: 'invalid' });
    throwsCode(() => core.planMigration(store, { hiddenByLegacyStyles: ['clock', 'weather'] }), 'INVALID_STORAGE');
    assert.equal(store.data.has(core.MIGRATION_KEY), false);
}
for (const options of [undefined, null, {}, [], { hiddenByLegacyStyles: ['focus'] }, { hiddenByLegacyStyles: ['clock', 'clock'] }, { hiddenByLegacyStyles: [], extra: true }]) {
    throwsCode(() => core.planMigration(storage(), options), 'INVALID_ARGUMENT');
}

const browser = { MYNTCountdownCore: countdown };
vm.runInNewContext(source, browser, { filename: 'component-visibility-core.js' });
assert.equal(browser.MYNTComponentVisibilityCore.definitions.length, ids.length);
assert.equal(browser.MYNTComponentVisibilityCore.read(storage()).every(value => value.valid), true);
assert.equal(browser.MYNTComponentVisibilityCore.plan(storage(), 'search', false).writes[0].value, 'false');
assert.equal(browser.MYNTComponentVisibilityCore.planMigration(storage(), { hiddenByLegacyStyles: ['weather'] }).migrated[0], 'weather');
const unloadedBrowser = {};
vm.runInNewContext(source, unloadedBrowser);
const unloaded = unloadedBrowser.MYNTComponentVisibilityCore.read(storage());
assert.equal(unloaded.find(value => value.id === 'countdowns').error.code, 'UNAVAILABLE');
assert.equal(unloaded.find(value => value.id === 'focus').valid, true);
assert.ok(!/\b(?:document|fetch|XMLHttpRequest|location)\s*\./.test(source), 'Core must remain independent of DOM and network.');
console.log('Component visibility core checks passed: 20 entries, legacy keys, cache plans, safe defaults, absent-only migration, malformed preservation, countdown revisions and browser UMD.');

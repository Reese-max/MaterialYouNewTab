'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { webcrypto } = require('node:crypto');
const api = require('../scripts/local-mcp-components.js');
const core = require('../scripts/component-visibility-core.js');
const countdown = require('../scripts/event-countdown-core.js');
const { createEngine } = require('../scripts/local-mcp-bridge.js');

function setup(initial = {}, options = {}) {
    const map = new Map(Object.entries(initial));
    let nextId = 0, failKey, busy = false;
    const reads = [], refreshes = [];
    const storage = {
        getItem(key) { reads.push(key); return map.has(key) ? map.get(key) : null; },
        setItem(key, value) { if (failKey === key) { failKey = null; throw Error('quota'); } map.set(key, value); },
        removeItem(key) { map.delete(key); }
    };
    const engine = createEngine({
        storage, adapters: options.adapter ? [options.adapter] : [api], canWrite: async () => true,
        isBusy: () => busy, canRefresh: options.canRefresh || (() => true),
        refresh(domain, writes) { refreshes.push({ domain, writes }); options.refresh?.(domain, writes); }
    });
    engine.setAccess({ enabled: true, writes: true });
    return {
        map, storage, engine, reads, refreshes,
        fail(key) { failKey = key; }, busy(value) { busy = value; },
        call(tool, args = {}, requestId) { return engine.execute({ tool, args, requestId: requestId || 'component-' + ++nextId }); },
        context: { storage, crypto: webcrypto, commit: engine.commit }
    };
}
const component = (result, id) => result.data.components.find(item => item.id === id);
const allEntries = map => [...map.entries()].sort(([a], [b]) => a.localeCompare(b));

(async () => {
    assert.deepEqual(JSON.parse(fs.readFileSync(require.resolve('../local-mcp/components-tools.json'), 'utf8')), api.tools);
    assert.deepEqual(api.tools[1].inputSchema.properties.id.enum, core.definitions.map(item => item.id));
    for (const tool of api.tools) assert.equal(tool.inputSchema.additionalProperties, false);

    const eventState = countdown.defaultState();
    eventState.events.push({ id: 'event-private', name: 'PRIVATE EVENT', date: '2028-01-01', category: 'custom', emoji: '', color: 'blue', annual: false });
    countdown.validate(eventState);
    const privateData = { weatherApiKey: 'PRIVATE KEY', weatherLocation: 'PRIVATE LOCATION', myntScratchpadContent: 'PRIVATE NOTES', todoList: 'PRIVATE TASKS', cachedQuote: 'KEEP QUOTE', myntEventCountdownsV1: JSON.stringify(eventState) };
    const f = setup(privateData);
    let current = await f.call('mynt_components_get');
    assert(current.ok);
    assert.equal(current.data.components.length, 19);
    assert.equal(current.revision.length, 64);
    assert.equal(current.data.visibilityOnly, true);
    assert.equal(current.data.playbackUnchanged, true);
    assert(!/PRIVATE|weatherApiKey|selectors|checkboxId/.test(JSON.stringify(current)));
    assert(f.reads.every(key => core.storageKeys.includes(key)), 'Only registered visibility keys may be read');
    for (const item of core.definitions) assert.equal(component(current, item.id).visible, item.defaultVisible);

    const beforeQuota = allEntries(f.map);
    f.fail('shortcutEditField');
    let result = await f.call('mynt_components_update', { id: 'shortcuts', visible: true, expectedRevision: current.revision });
    assert.equal(result.error.code, 'STORAGE_FAILURE');
    assert.deepEqual(allEntries(f.map), beforeQuota);
    assert.equal(f.refreshes.length, 0);
    result = await f.call('mynt_components_update', { id: 'shortcuts', visible: true, expectedRevision: current.revision }, 'replay-shortcuts');
    assert(result.ok);
    assert.equal(f.storage.getItem('shortcutsCheckboxState'), 'checked');
    assert.equal(f.storage.getItem('shortcutsDisplayStatus'), 'flex');
    assert.equal(f.storage.getItem('shortcutEditField'), 'active');
    assert.equal(f.storage.getItem('adaptiveIconField'), 'active');
    assert.equal(f.refreshes[0].domain, 'components');
    assert.deepEqual(await f.call('mynt_components_update', { id: 'shortcuts', visible: true, expectedRevision: current.revision }, 'replay-shortcuts'), result);
    assert.equal(f.refreshes.length, 1, 'Replay must not refresh or write twice');
    assert.equal((await f.call('mynt_components_update', { id: 'shortcuts', visible: false, expectedRevision: result.revision }, 'replay-shortcuts')).error.code, 'REQUEST_ID_CONFLICT');
    assert.equal((await f.call('mynt_components_update', { id: 'todo', visible: true, expectedRevision: current.revision })).error.code, 'CONFLICT');
    assert.equal(f.storage.getItem('todoListCheckboxState'), null);
    current = result;
    result = await f.call('mynt_components_update', { id: 'shortcuts', visible: true, expectedRevision: current.revision });
    assert(result.unchanged);
    assert.equal(f.refreshes.length, 1);

    // Countdown visibility alters only enabled/revision, never event or recovery contents.
    result = await f.call('mynt_components_update', { id: 'countdowns', visible: false, expectedRevision: current.revision });
    assert(result.ok);
    const hiddenEvents = JSON.parse(f.storage.getItem('myntEventCountdownsV1'));
    assert.deepEqual(hiddenEvents.events, eventState.events);
    assert.equal(hiddenEvents.deleted, eventState.deleted);
    assert.equal(hiddenEvents.enabled, false);
    assert.equal(hiddenEvents.revision, 1);
    for (const [key, value] of Object.entries(privateData)) if (key !== 'myntEventCountdownsV1') assert.equal(f.storage.getItem(key), value);

    // Exercise every ID using a fresh full-domain revision, including network boundaries.
    for (const definition of core.definitions) {
        const one = setup();
        let state = await one.call('mynt_components_get');
        const visible = !definition.defaultVisible;
        let changed = await one.call('mynt_components_update', { id: definition.id, visible, expectedRevision: state.revision });
        if (visible && ['weather', 'motivationalQuotes', 'exam'].includes(definition.id)) {
            assert.equal(changed.error.code, 'ACTION_REQUIRED');
            assert.equal(one.map.size, 0);
            continue;
        }
        assert(changed.ok, definition.id + ': ' + JSON.stringify(changed));
        assert.equal(component(changed, definition.id).visible, visible);
        assert([...one.map.keys()].every(key => definition.keys.includes(key)), 'Unexpected write for ' + definition.id);
        state = await one.call('mynt_components_get');
        changed = await one.call('mynt_components_update', { id: definition.id, visible: !visible, expectedRevision: state.revision });
        if (!visible && ['weather', 'motivationalQuotes', 'exam'].includes(definition.id)) assert.equal(changed.error.code, 'ACTION_REQUIRED');
        else { assert(changed.ok); assert.equal(component(changed, definition.id).visible, !visible); }
    }

    for (const malformed of [
        { id: 'weather', values: { hideWeatherVisible: '{broken' } },
        { id: 'shortcuts', values: { shortcutsDisplayStatus: 'url(https://invalid.test)' } },
        { id: 'studyQuote', values: { myntStudyQuoteEnabled: 'true' } },
        { id: 'countdowns', values: { myntEventCountdownsV1: '{broken' } },
        { id: 'countdowns', values: { myntExamDate: 'not-a-date' } }
    ]) {
        const bad = setup(malformed.values), unchanged = allEntries(bad.map);
        const state = await bad.call('mynt_components_get');
        assert(state.ok);
        assert.equal(component(state, malformed.id).visible, null);
        assert.equal(component(state, malformed.id).valid, false);
        assert.equal((await bad.call('mynt_components_update', { id: malformed.id, visible: false, expectedRevision: state.revision })).error.code, 'INVALID_STORAGE');
        assert.deepEqual(allEntries(bad.map), unchanged);
        const unaffected = await bad.call('mynt_components_update', { id: 'search', visible: false, expectedRevision: state.revision });
        assert(unaffected.ok, 'Unrelated valid component stays editable');
        for (const [key, value] of unchanged) assert.equal(bad.storage.getItem(key), value);
    }
    const oversized = setup({ hideClockVisible: 'x'.repeat(262145) });
    assert.equal((await oversized.call('mynt_components_get')).error.code, 'INVALID_STORAGE');
    assert.equal(oversized.map.get('hideClockVisible').length, 262145);

    const invalid = setup(), initial = await invalid.call('mynt_components_get');
    for (const args of [
        { id: 'weatherApiKey', visible: false, expectedRevision: initial.revision },
        { id: 'search', visible: 'false', expectedRevision: initial.revision },
        { id: 'search', visible: false, expectedRevision: initial.revision, key: 'weatherApiKey' },
        { id: 'search', visible: false },
        { id: 'search', visible: false, expectedRevision: 'stale' },
        { id: 'search', visible: false, expectedRevision: initial.revision, requestId: 'bad id!' },
        Object.assign(Object.create({ injected: true }), { id: 'search', visible: false, expectedRevision: initial.revision })
    ]) assert.equal((await invalid.call('mynt_components_update', args)).error.code, 'INVALID_ARGUMENT');
    assert.equal((await invalid.call('mynt_components_get', { key: 'weatherApiKey' })).error.code, 'INVALID_ARGUMENT');
    assert.equal((await invalid.engine.execute({ tool: 'mynt_components_update', args: { id: 'search', visible: false, expectedRevision: initial.revision } })).error.code, 'REQUEST_ID_REQUIRED');
    assert.equal((await invalid.call('mynt_components_update', { id: 'search', visible: false, expectedRevision: initial.revision, requestId: 'request-inner' }, 'request-outer')).error.code, 'INVALID_ARGUMENT');
    assert.equal(invalid.map.size, 0);

    // A change to another component also invalidates the list-wide revision.
    invalid.map.set('myntStudyQuoteEnabled', '0');
    assert.equal((await invalid.call('mynt_components_update', { id: 'search', visible: false, expectedRevision: initial.revision })).error.code, 'CONFLICT');
    assert.equal(invalid.map.get('myntSearchVisible'), undefined);

    // Mutation immediately before coordinated commit must fail CAS.
    const race = setup(), raceState = await race.call('mynt_components_get');
    const raceContext = { ...race.context, commit(plan) { race.map.set('myntGalleryEntryVisible', 'false'); return race.engine.commit(plan); } };
    result = await api.execute('mynt_components_update', { id: 'todo', visible: true, expectedRevision: raceState.revision }, raceContext);
    assert.equal(result.error.code, 'CONFLICT');
    assert.equal(race.map.get('todoListCheckboxState'), undefined);

    // Access can be revoked during hashing; it must be checked again before commit.
    for (const revokedDuringHash of [1, 2]) {
        let release, calls = 0;
        const gatedCrypto = { subtle: { async digest(...args) {
            if (++calls === revokedDuringHash) await new Promise(resolve => { release = resolve; });
            return webcrypto.subtle.digest(...args);
        } } };
        const delayedAdapter = { tools: api.tools, execute(name, args, context) { return api.execute(name, args, { ...context, crypto: gatedCrypto }); } };
        const revoked = setup({}, { adapter: delayedAdapter });
        const revokedInitial = await api.execute('mynt_components_get', {}, revoked.context);
        const pending = revoked.call('mynt_components_update', { id: 'todo', visible: true, expectedRevision: revokedInitial.revision });
        while (!release) await new Promise(resolve => setImmediate(resolve));
        revoked.engine.setAccess({ enabled: false }); release();
        assert.equal((await pending).error.code, 'ACCESS_REVOKED');
        assert.equal(revoked.map.size, 0);
        assert.equal(revoked.refreshes.length, 0);
    }

    const unavailable = setup({}, { canRefresh: () => false }), unavailableState = await unavailable.call('mynt_components_get');
    assert.equal((await unavailable.call('mynt_components_update', { id: 'todo', visible: true, expectedRevision: unavailableState.revision })).error.code, 'UNAVAILABLE');
    assert.equal(unavailable.map.size, 0);
    unavailable.busy(true);
    assert.equal((await unavailable.call('mynt_components_update', { id: 'todo', visible: true, expectedRevision: unavailableState.revision })).error.code, 'EDITOR_BUSY');

    // In a browser the safe runtime refresh must exist, and lazy clock re-enable is explicit.
    const runtime = setup({ hideClockVisible: 'true' });
    const runtimeState = await runtime.call('mynt_components_get');
    global.document = {};
    try {
        assert.equal((await runtime.call('mynt_components_update', { id: 'clock', visible: true, expectedRevision: runtimeState.revision })).error.code, 'ACTION_REQUIRED');
        assert.equal((await runtime.call('mynt_components_update', { id: 'search', visible: false, expectedRevision: runtimeState.revision })).error.code, 'ACTION_REQUIRED');
        global.myntComponents = { refresh() { throw Error('Adapter must not directly refresh'); } };
        global.myntClockPreferences = { reload() { throw Error('Adapter must not directly initialize'); } };
        const ready = await runtime.call('mynt_components_update', { id: 'clock', visible: true, expectedRevision: runtimeState.revision });
        assert(ready.ok);
        assert.equal(runtime.map.get('hideClockVisible'), 'false');
    } finally { delete global.document; delete global.myntComponents; delete global.myntClockPreferences; }

    const source = fs.readFileSync(require.resolve('../scripts/local-mcp-components.js'), 'utf8');
    assert(!/\.click\s*\(|dispatchEvent\s*\(|fetch\s*\(|\.play\s*\(|permissions\.request|location\.reload|myntLazy\.load/.test(source));
    console.log('Local MCP components regressions passed: fixed registry, visibility-only plans, privacy, malformed preservation, rollback, all-domain CAS, replay/revocation and explicit initialization boundaries.');
})().catch(error => { console.error(error); process.exitCode = 1; });

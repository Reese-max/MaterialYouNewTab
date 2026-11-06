/* Real backup/guard/bridge scripts in isolated VMs. No browser or user storage. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { environment, loadFixture, snapshot } = require('./regress-backup-completion.cjs');
const KEY = 'myntRestoreJournalV1';
const read = name => fs.readFileSync(require('node:path').join(__dirname, '..', name), 'utf8');
function watchWrites(env, beforeWrite = () => {}) {
    let count = 0;
    env.context.localStorage = new Proxy(Object.create(null), {
        ownKeys: () => Object.keys(env.storage),
        getOwnPropertyDescriptor: (_, key) => Object.hasOwn(env.storage, key) ? { value: env.storage[key], enumerable: true, configurable: true } : undefined,
        get(_, key) {
            if (['setItem', 'removeItem', 'clear'].includes(key)) return (...args) => { count++; beforeWrite(key, ...args); return env.storage[key](...args); };
            return env.storage[key];
        }
    });
    return () => count;
}
async function until(predicate) {
    for (let n = 0; n < 200; n++) { if (predicate()) return; await new Promise(resolve => setImmediate(resolve)); }
    assert.fail('Fixture never reached the durable interruption point');
}
(async () => {
    for (const [key, value] of [
        ['todoList', '{broken json'], ['todoList', '[]'], ['todoList', '{"tbad":{"title":"missing fields"}}'],
        ['myntHabits', '{broken json'], ['myntHabits', '{}'],
        ['myntHabits', '[{"id":"hbad","name":"Habit","source":null,"doneDates":["2026-02-30"]}]'],
        ['myntLayout', '{broken json'], ['myntLayout', '{}'],
        ['myntLayout', '{"version":2,"snap":true,"locked":true,"blocks":{"search":{"x":8,"y":0,"s":1}}}'],
        ['myntLayoutProfiles', '{broken json'], ['myntLayoutProfiles', '{}'],
        ['myntDailyFocus', '{broken json'], ['myntWorkspacePresets', '{broken json'],
        ['myntAccessibility', '{broken json'], ['myntFocusLog', '{broken json'],
        ['pomodoroState', '{broken json'], ['aiToolsSettings', '{broken json'],
        ['myntPomoScenarios', '{broken json'], ['myntPomoMusicSettingsV1', '{broken json'],
        [KEY, '{"version":1,"phase":"snapshot"}']
    ]) {
        const env = environment(); loadFixture(env);
        env.context.badKey = key; env.context.badValue = value;
        env.run('fixture.localStorage[badKey]=badValue');
        const before = await snapshot(env), writes = watchWrites(env);
        assert.equal(env.run('isValidBackupFile(fixture)'), false, key);
        await assert.rejects(env.run('restoreData(fixture)'), /Invalid backup/);
        assert.deepEqual(await snapshot(env), before); assert.equal(writes(), 0); assert.equal(env.writes.length, 0);
    }
    // Quota at durable snapshot creation cannot leave a changed domain or marker.
    const quota = environment(); loadFixture(quota); const quotaBefore = await snapshot(quota);
    watchWrites(quota, (method, key, value) => { if (method === 'setItem' && key === KEY && JSON.parse(value).phase === 'apply') throw Error('fixture journal quota'); });
    await assert.rejects(quota.run('restoreData(fixture)'), /journal quota/);
    assert.deepEqual(await snapshot(quota), quotaBefore); assert.equal(quota.writes.length, 0);

    // A tab running an older build can bypass the new gate: detect its changes
    // during asynchronous snapshots before replacing any domain.
    const snapshotRace = environment(); loadFixture(snapshotRace);
    snapshotRace.run(`const originalRead=readIndexedDBEntries; readIndexedDBEntries=async()=>{const data=await originalRead();localStorage.setItem('myntScratchpadContent','new note during snapshot');return data;};`);
    await assert.rejects(snapshotRace.run('restoreData(fixture)'), /Concurrent changes were kept/);
    assert.equal(snapshotRace.storage.myntScratchpadContent, 'new note during snapshot');
    assert.equal(snapshotRace.writes.length, 0); assert(!snapshotRace.storage[KEY]);

    // Compare each affected key immediately before rollback, including additions
    // and deletions. Never report a complete preimage restoration on conflicts.
    const race = environment(); loadFixture(race); const beforeRace = await snapshot(race);
    race.run(`replaceMediaEntries=async()=>{localStorage.setItem('myntScratchpadContent','newer note');localStorage.setItem('other-tab-added','keep');localStorage.removeItem('todoList');throw Error('fixture interrupted media');};`);
    await assert.rejects(race.run('restoreData(fixture)'), /Concurrent changes were kept/);
    assert.equal(race.storage.myntScratchpadContent, 'newer note'); assert.equal(race.storage['other-tab-added'], 'keep');
    assert.equal(race.storage.todoList, undefined); assert(!race.storage[KEY]);
    assert.deepEqual((await snapshot(race)).stores, beforeRace.stores);
    const mediaRace = environment(); loadFixture(mediaRace);
    mediaRace.run(`const originalMediaWrite=replaceMediaEntries;replaceMediaEntries=async(key,entries)=>{
        if(key==='timerImage'){await originalMediaWrite('gallery',[['newer',{id:'newer',name:'newer.png',type:'image',source:'upload',added:42,blob:new Blob(['newer'],{type:'image/png'})}]]);throw Error('fixture media conflict');}
        return originalMediaWrite(key,entries);
    };`);
    await assert.rejects(mediaRace.run('restoreData(fixture)'), /Concurrent changes were kept/);
    assert.equal(mediaRace.databases.get('MYNTWallpaperGallery').entries.get('newer').name, 'newer.png');
    assert(!mediaRace.storage[KEY]);
    assert(mediaRace.run(`sameRestoreEntries([['b',{x:1,y:2}],['a',0]],[['a',0],['b',{y:2,x:1}]])`), 'IDB key/property order cannot cause false conflicts');

    // Simulate process death AFTER each independently committed media store,
    // abandoning the original promise rather than letting catch() roll it back.
    for (const stop of ['wallpaper', 'gallery', 'timerImage', 'music']) {
        const env = environment(); loadFixture(env); const before = await snapshot(env);
        env.context.stopAt = stop;
        env.run(`const originalWallpaper=replaceIndexedDB,originalMedia=replaceMediaEntries;
            replaceIndexedDB=async entries=>{await originalWallpaper(entries);if(stopAt==='wallpaper'){globalThis.crashed=true;await new Promise(()=>{});}};
            replaceMediaEntries=async(key,entries)=>{await originalMedia(key,entries);if(stopAt===key){globalThis.crashed=true;await new Promise(()=>{});}};`);
        env.run('restoreData(fixture)');
        await until(() => env.context.crashed);
        assert.equal(JSON.parse(env.storage[KEY]).phase, 'apply');
        assert(!env.storage[KEY].includes('fixture-secret-do-not-export'), 'journal must not duplicate preserved credentials');
        const next = environment({ local: { ...env.storage }, databases: env.databases });
        assert.equal(next.nodes.restoreBtn.disabled, true, 'startup must close normal controls');
        await next.context.myntRestoreReady;
        assert.equal(next.reloads(), 1, stop); assert.deepEqual(await snapshot(next), before, stop);
    }
    // A crash while reading snapshots has no domain changes to undo.
    const marker = environment(); const beforeMarker = await snapshot(marker);
    const markerNext = environment({ local: { ...marker.storage, [KEY]: JSON.stringify({ version: 1, phase: 'snapshot' }) }, databases: marker.databases });
    await markerNext.context.myntRestoreReady; assert.deepEqual(await snapshot(markerNext), beforeMarker);

    // Failed recovery retains the journal, stays closed, and retries next startup.
    const failed = environment(); loadFixture(failed);
    failed.faults.failWrites = new Set(['myntPomodoroMusicV1:1', 'MYNTWallpaperGallery:2']);
    const failedBefore = await snapshot(failed);
    await assert.rejects(failed.run('restoreData(fixture)'), /Restore and recovery could not finish/);
    assert(failed.storage[KEY]);
    const retry = environment({ local: { ...failed.storage }, databases: failed.databases });
    await retry.context.myntRestoreReady; assert.deepEqual(await snapshot(retry), failedBefore);
    const failedUi = environment(); loadFixture(failedUi); const fatalAlerts = [];
    failedUi.context.MyntRestoreGuard = { allow: fn => fn(), lock: fn => Promise.resolve().then(fn) };
    failedUi.context.alert = message => fatalAlerts.push(message);
    failedUi.faults.failWrites = new Set(['myntPomodoroMusicV1:1', 'MYNTWallpaperGallery:2']);
    failedUi.context.fileEvent = { currentTarget: { value: 'fixture.json', files: [{ size: 1000, text: async () => failedUi.run('JSON.stringify(fixture)') }] } };
    await failedUi.run('validateAndRestoreData(fileEvent)');
    assert.equal(fatalAlerts.length, 1, 'fatal recovery uses an accessible native alert while page controls are inert');
    assert.equal(failedUi.alerts.length, 0); assert.equal(failedUi.nodes.restoreBtn.disabled, true);
    assert.equal(failedUi.context.document.documentElement.inert, true); assert(failedUi.storage[KEY]);

    // Exercise the REAL early guard in two independent page realms, sharing
    // persistent storage. Normal UI and MCP use these same native entry points.
    const shared = new Map(), page = () => {
        const events = {}, context = vm.createContext({ shared, navigator: { locks: { request: (_name, fn) => fn() } },
            document: { documentElement: { inert: false } }, location: { reload() {} }, addEventListener: (name, fn) => { events[name] = fn; } });
        vm.runInContext(`class Storage { getItem(k){return shared.get(k)??null;} setItem(k,v){shared.set(k,String(v));} removeItem(k){shared.delete(k);} clear(){shared.clear();} }
            class IDBDatabase { transaction(){return 'admitted';} }
            globalThis.Storage=Storage;globalThis.IDBDatabase=IDBDatabase;globalThis.localStorage=new Storage();globalThis.db=new IDBDatabase();`, context);
        vm.runInContext(read('scripts/restore-guard.js'), context);
        return { context, run: code => vm.runInContext(code, context), events };
    };
    const owner = page(), other = page();
    owner.run(`MyntRestoreGuard.allow(()=>localStorage.setItem('${KEY}','pending'))`);
    for (const code of ["localStorage.setItem('note','lost')", "localStorage.removeItem('note')", 'localStorage.clear()', "db.transaction('items','readwrite')"])
        assert.throws(() => other.run(code), /MYNT_RESTORE_BUSY/);
    assert.equal(other.run("db.transaction('items','readonly')"), 'admitted');
    assert.equal(owner.run("MyntRestoreGuard.allow(()=>db.transaction('items','readwrite'))"), 'admitted');
    assert.throws(() => owner.run("localStorage.setItem('note','unrelated owner UI')"), /MYNT_RESTORE_BUSY/);
    other.events.storage({ key: KEY, newValue: 'pending' }); assert.equal(other.context.document.documentElement.inert, true);
    owner.run(`MyntRestoreGuard.allow(()=>localStorage.removeItem('${KEY}'))`);
    other.run("localStorage.setItem('note','retained')"); assert.equal(shared.get('note'), 'retained');
    const html = read('index.html'); assert(html.indexOf('scripts/restore-guard.js') < html.indexOf('scripts/preload.js'));

    // Real bridge UI: permission requests only follow explicit trusted clicks.
    const elements = {}, handlers = {}; let requests = 0, connections = 0, granted = false;
    for (const selector of ['[data-mcp-connect]', '[data-mcp-disconnect]', '[role=status]', '[data-mcp-write]', '[data-mcp-private]'])
        elements[selector] = { checked: false, addEventListener: (type, fn) => { handlers[selector + type] = fn; } };
    const ui = vm.createContext({ localStorage: {}, navigator: {}, addEventListener() {},
        document: { readyState: 'complete', getElementById: () => ({ querySelector: key => elements[key] }) },
        chrome: { permissions: { async request(options) { assert.deepEqual(Array.from(options.permissions), ['nativeMessaging']); requests++; return granted; } },
            runtime: { connectNative() { connections++; return { onMessage: { addListener() {} }, onDisconnect: { addListener() {} }, disconnect() {} }; } } } });
    vm.runInContext(read('scripts/local-mcp-bridge.js'), ui);
    const connect = handlers['[data-mcp-connect]click'];
    assert.equal(requests, 0); await connect({ isTrusted: false }); assert.equal(requests, 0);
    await connect({ isTrusted: true }); assert.equal(requests, 1); assert.equal(connections, 0); assert.equal(ui.myntLocalMcp.status().enabled, false);
    granted = true; await connect({ isTrusted: true }); assert.equal(connections, 1); assert.equal(ui.myntLocalMcp.status().enabled, true);
    for (const file of ['manifest.json', 'manifest(firefox).json']) {
        const manifest = JSON.parse(read(file));
        assert(!manifest.permissions.includes('nativeMessaging')); assert(manifest.optional_permissions.includes('nativeMessaging'));
    }
    console.log('B4_BACKUP_PERMS_OK');
})().catch(error => { console.error(error); process.exitCode = 1; });

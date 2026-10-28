/* Isolated scoped-backup fixtures. Never opens a browser or real storage. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = process.argv[2] || process.cwd();
const source = fs.readFileSync(path.join(root, 'scripts/backup-restore.js'), 'utf8');
const LIMIT = 32 * 1024 * 1024;

function environment() {
    const faults = {}, reads = [], writes = [], blobReads = [], alerts = [], confirmations = [], downloads = [];
    const storage = Object.create(null);
    function storageFault(kind, key) {
        if (faults[kind] === key || faults[kind] === '*') { delete faults[kind]; throw Error('fixture storage unavailable'); }
    }
    Object.defineProperties(storage, {
        getItem: { value(key) { storageFault('get', key); return Object.hasOwn(storage, key) ? storage[key] : null; } },
        setItem: { value(key, value) { storageFault('set', key); if (faults.permanentSet === key) throw Error('fixture permanent quota'); storage[key] = String(value); } },
        removeItem: { value(key) { storageFault('remove', key); delete storage[key]; } },
        clear: { value() { for (const key of Object.keys(storage)) delete storage[key]; } }
    });
    const ids = ['backupBtn', 'restoreBtn', 'fileInput', 'resetsettings', 'backupScopeText', 'backupScopeDetailsText', 'backupDetailsLabel', 'backupStatus', 'backupScopeSelect', 'backupScopeLabel', 'backupScopeFull', 'backupScopeSettings'];
    const nodes = Object.fromEntries(ids.map(id => [id, { value: id === 'backupScopeSelect' ? 'full' : '', disabled: false, textContent: '', handlers: {}, addEventListener(type, fn) { this.handlers[type] = fn; }, click() {} }]));
    class Reader {
        readAsDataURL(blob) {
            blobReads.push(blob);
            blob.arrayBuffer().then(bytes => {
                this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(bytes).toString('base64')}`;
                this.onload();
            }).catch(error => { this.error = error; this.onerror(); });
        }
    }
    // Large metadata fixtures prove preflight rejection without allocating hundreds
    // of MiB or ever reading the fake payload. Successful exports use real Blobs.
    class SizedBlob extends Blob {
        constructor(size, type) { super(['fixture'], { type }); this.reportedSize = size; }
        get size() { return this.reportedSize; }
        arrayBuffer() { throw Error('Oversized metadata fixture must never be encoded'); }
    }
    let accepted = true, reloads = 0;
    const context = vm.createContext({
        Blob, SizedBlob, URL, Uint8Array, atob, FileReader: Reader, localStorage: storage, console,
        faults, reads, writes, currentLanguage: 'en', translations: { en: { failedbackup: 'Backup failed: ', restorefailed: 'Restore failed: ', restorecompleted: 'Restored.' } },
        setTimeout: fn => fn(), document: { getElementById: id => nodes[id], body: { appendChild() {} }, createElement: () => ({ click() { downloads.push(this.download); }, remove() {} }) },
        alertPrompt: async text => { alerts.push(text); }, confirmPrompt: async text => { confirmations.push(text); return accepted; }, location: { reload() { reloads++; } }
    });
    vm.runInContext(source, context);
    const run = code => vm.runInContext(code, context);
    run(`
        globalThis.stores = {
            wallpaper: [['backgroundImage',new Blob(['wallpaper'],{type:'image/png'})],['lastUpdateTime','2026-10-23T14:00:00Z'],['imageType','upload'],['future-metadata','untouched']],
            gallery: [['old-photo',{id:'old-photo',name:'舊圖片.png',type:'image',source:'upload',added:1,blob:new Blob(['gallery'],{type:'image/png'})}]],
            timerImage: [['background',new Blob(['timer image'],{type:'image/png'})]],
            music: [['old-song',{id:'old-song',name:'old.mp3',blob:new Blob(['audio'],{type:'audio/mpeg'})}]]
        };
        readIndexedDBEntries = async () => { reads.push('wallpaper'); if(faults.database)throw Error('fixture blocked database'); return stores.wallpaper; };
        readMediaEntries = async key => { reads.push(key); if(faults.database)throw Error('fixture blocked database'); return stores[key]; };
        replaceIndexedDB = async entries => { writes.push('wallpaper'); if(faults.writeDatabase)throw Error('fixture database write'); stores.wallpaper=entries; };
        replaceMediaEntries = async (key,entries) => { writes.push(key); if(faults.writeDatabase)throw Error('fixture database write'); stores[key]=entries; };
        localStorage.setItem('weatherApiKey','private fixture key');
        localStorage.setItem('myntPomoMusicOwnerV1','active fixture tab');
        localStorage.setItem('myntWallpaperCurrent','old-photo');
        localStorage.setItem('myntWallpaperMode','rotate');
        localStorage.setItem('myntWallpaperMinutes','15');
        localStorage.setItem('myntWallpaperHiddenBuiltins','["bundled-video-bg"]');
        localStorage.setItem('myntWallpaperFuturePreference','future retained');
        localStorage.setItem('myntPomodoroAppearance.v1','{"version":1,"mode":"image"}');
        localStorage.setItem('myntPomoMusicSettingsV1','{"selectedId":"old-song","order":["old-song"],"volume":0.4}');
        localStorage.setItem('myntPomoScenarios','{"version":1,"presets":[{"name":"My music","music":{"selectedId":"old-song"}}]}');
        localStorage.setItem('selectedLanguage','en');
        localStorage.setItem('todoList','existing tasks');
        localStorage.setItem('myntLayout','existing layout');
        globalThis.settingsFixture = {
            format:'material-you-newtab', version:3, scope:'settings', createdAt:'2026-10-23T14:00:00Z',
            localStorage:{selectedLanguage:'zh_TW',todoList:'restored tasks',myntLayout:'restored layout',myntScratchpadContent:'備份便籤',
                pomodoroState:JSON.stringify({version:2,phase:'work',totalTime:120,timeRemaining:120,currentRound:1,isRunning:true,endAt:Date.parse('2026-10-23T14:00:45Z')})}, indexedDB:{}
        };
    `);
    return { run, context, storage, nodes, faults, reads, writes, blobReads, alerts, confirmations, downloads, accept: value => { accepted = value; }, reloads: () => reloads };
}
async function canonical(value) {
    if (value instanceof Blob) return { type: value.type, data: Buffer.from(await value.arrayBuffer()).toString('base64') };
    if (Array.isArray(value)) return Promise.all(value.map(canonical));
    if (value && typeof value === 'object') return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, item]) => [key, await canonical(item)])));
    return value;
}
const localSnapshot = env => JSON.parse(JSON.stringify(env.storage));
const storeSnapshot = env => canonical(env.run('stores'));
const clone = value => JSON.parse(JSON.stringify(value));
function fileEvent(env, expression = 'settingsFixture') {
    const input = { value: 'fixture.json', files: [{ size: 1000, text: async () => env.run(`JSON.stringify(${expression})`) }] };
    env.context.fileEvent = { currentTarget: input };
    return input;
}

(async () => {
    const exporting = environment();
    const beforeExport = localSnapshot(exporting), beforeStores = await storeSnapshot(exporting);
    const full = await exporting.run('createBackup()');
    assert.equal(full.backup.version, 3); assert.equal(full.backup.scope, 'full');
    assert.equal(full.estimatedBytes, new Blob([full.serialized]).size, 'preflight includes Unicode JSON, keys, separators and base64');
    assert.equal(full.backup.media.music.length, 1);
    assert(!full.serialized.includes('private fixture key')); assert(!full.serialized.includes('active fixture tab'));
    assert.equal(exporting.writes.length, 0); assert.deepEqual(localSnapshot(exporting), beforeExport); assert.deepEqual(await storeSnapshot(exporting), beforeStores);

    for (const type of ['', 'image/png']) {
        exporting.context.blobType = type;
        exporting.run('globalThis.estimateSample={unicode:"台灣 🌱",escaped:"\\\\ \\\" \\n",items:[null,true,0,new Blob(["abcde"],{type:blobType})]};');
        const actual = await exporting.run('encodeBackupValue(estimateSample,{bytes:0}).then(JSON.stringify)');
        assert.equal(exporting.run('estimateBackupBytes(estimateSample)'), new Blob([actual]).size);
    }
    assert.equal(exporting.run('estimateBackupBytes([,undefined,,])'), Buffer.byteLength('[null,null,null]'));
    exporting.run('globalThis.cyclic={}; cyclic.self=cyclic');
    assert.throws(() => exporting.run('estimateBackupBytes(cyclic)'), /Invalid or deeply nested/);

    const oversized = environment();
    oversized.run("stores.music=[['huge',{id:'huge',name:'huge.mp3',blob:new SizedBlob(300*1024*1024,'audio/mpeg')}]];");
    const beforeLarge = localSnapshot(oversized);
    await assert.rejects(oversized.run('createBackup()'), /exceeds 32 MiB/);
    assert.equal(oversized.blobReads.length, 0, 'preflight rejects a large final track before encoding even the first wallpaper');
    assert.equal(oversized.writes.length, 0); assert.deepEqual(localSnapshot(oversized), beforeLarge);
    oversized.nodes.backupScopeSelect.value = 'settings';
    oversized.nodes.backupScopeSelect.handlers.change();
    assert(oversized.nodes.backupScopeText.textContent.includes('No media or media-linked preferences. Maximum 32 MiB.'));
    assert(oversized.nodes.backupScopeDetailsText.textContent.includes('Settings only:'));
    assert(oversized.nodes.backupScopeDetailsText.textContent.includes('Those media and preferences stay unchanged on restore.'));
    assert.equal(oversized.nodes.backupDetailsLabel.textContent, 'What does this backup include?');
    oversized.reads.length = 0; oversized.faults.database = true;
    await oversized.run('backupData()');
    assert.equal(oversized.downloads.length, 1); assert.match(oversized.downloads[0], /MYNT_Backup_Settings_/);
    assert(oversized.nodes.backupStatus.textContent.includes('Settings-only backup prepared'));
    assert.equal(oversized.reads.length, 0, 'settings-only must work without opening any media database');
    assert.equal(oversized.blobReads.length, 0); assert(!oversized.nodes.backupScopeSelect.disabled);
    const small = await oversized.run('createBackup("settings")');
    assert.equal(small.backup.scope, 'settings'); assert(!Object.hasOwn(small.backup, 'media')); assert.deepEqual(clone(small.backup.indexedDB), {});
    assert.equal(small.estimatedBytes, new Blob([small.serialized]).size);
    assert.equal(small.backup.localStorage.todoList, 'existing tasks');
    for (const key of Object.keys(beforeLarge).filter(key => key.startsWith('myntWallpaper') || ['myntPomodoroAppearance.v1','myntPomoMusicSettingsV1','myntPomoScenarios','weatherApiKey','myntPomoMusicOwnerV1'].includes(key))) {
        assert(!Object.hasOwn(small.backup.localStorage, key), `${key} must not import a dangling media reference`);
        assert(small.backup.excludedLocalStorageKeys.includes(key));
    }

    const capacity = environment();
    capacity.run('globalThis.base={a:new SizedBlob(0,"audio/mpeg")};');
    const overhead = capacity.run('estimateBackupBytes(base)');
    const largestFittingBlob = Math.floor((LIMIT - overhead) / 4) * 3;
    capacity.context.largest = largestFittingBlob;
    assert(capacity.run('estimateBackupBytes({a:new SizedBlob(largest,"audio/mpeg")})') <= LIMIT);
    assert(capacity.run('estimateBackupBytes({a:new SizedBlob(largest+3,"audio/mpeg")})') > LIMIT);
    capacity.run('stores.wallpaper[0][1]=new SizedBlob(12*1024*1024,"image/png"); stores.music[0][1].blob=new SizedBlob(13*1024*1024,"audio/mpeg");');
    await assert.rejects(capacity.run('createBackup()'), /exceeds 32 MiB/);
    assert.equal(capacity.blobReads.length, 0, 'combined libraries must also be checked before any encoding');
    const hugeSettings = environment();
    hugeSettings.run('localStorage.setItem("largeFixture","x".repeat(32*1024*1024))');
    await assert.rejects(hugeSettings.run('createBackup("settings")'), /settings-only backup exceeds 32 MiB/);
    assert.equal(hugeSettings.reads.length, 0); assert.equal(hugeSettings.blobReads.length, 0); assert.equal(hugeSettings.downloads.length, 0);

    const restored = environment(), previousLocal = localSnapshot(restored), previousMedia = await storeSnapshot(restored);
    restored.faults.database = true;
    await restored.run('restoreData(settingsFixture)');
    assert.equal(restored.storage.todoList, 'restored tasks'); assert.equal(restored.storage.myntScratchpadContent, '備份便籤');
    assert.equal(restored.storage.myntLayout, 'restored layout');
    for (const key of Object.keys(previousLocal).filter(key => key.startsWith('myntWallpaper') || ['myntPomodoroAppearance.v1','myntPomoMusicSettingsV1','myntPomoScenarios','weatherApiKey','myntPomoMusicOwnerV1'].includes(key))) assert.equal(restored.storage[key], previousLocal[key]);
    assert.deepEqual(await storeSnapshot(restored), previousMedia); assert.equal(restored.reads.length, 0); assert.equal(restored.writes.length, 0);
    const timer = JSON.parse(restored.storage.pomodoroState);
    assert.equal(timer.isRunning, false); assert.equal(timer.endAt, null); assert.equal(timer.timeRemaining, 45);
    restored.run('settingsFixture.localStorage.pomodoroState=JSON.stringify({phase:"work",totalTime:120,timeRemaining:120,currentRound:1,isRunning:true,lastTick:Date.parse(settingsFixture.createdAt)-30000});');
    await restored.run('restoreData(settingsFixture)');
    assert.equal(JSON.parse(restored.storage.pomodoroState).timeRemaining, 90); assert.equal(JSON.parse(restored.storage.pomodoroState).isRunning, false);
    const preview = restored.run('backupScopePreview(settingsFixture)');
    assert(preview.includes('settings-only backup')); assert(preview.includes('stay unchanged')); assert(!preview.includes('Files not present'));
    const noPreferences = environment();
    noPreferences.run('Object.keys(localStorage).filter(isMediaLocalStorageKey).forEach(key=>localStorage.removeItem(key))');
    await noPreferences.run('restoreData(settingsFixture)');
    assert.deepEqual(Object.keys(noPreferences.storage).filter(key => key.startsWith('myntWallpaper') || key === 'myntPomoMusicSettingsV1'), [], 'absent destination media preferences stay absent');

    // A file's validated scope, not the current export selector, controls restore.
    const viaUi = environment(); viaUi.nodes.backupScopeSelect.value = 'full';
    const uiStores = await storeSnapshot(viaUi); fileEvent(viaUi);
    await viaUi.run('validateAndRestoreData(fileEvent)');
    assert.equal(viaUi.reloads(), 1); assert(viaUi.confirmations[0].includes('settings-only backup'));
    assert.deepEqual(await storeSnapshot(viaUi), uiStores); assert.equal(viaUi.writes.length, 0); assert.equal(viaUi.reads.length, 0);
    const fullUi = environment(); fullUi.nodes.backupScopeSelect.value = 'settings';
    fullUi.context.fullString = JSON.stringify({ format:'material-you-newtab',version:3,scope:'full',localStorage:{todoList:'full replacement'},indexedDB:{},media:{version:1,gallery:[],timerImage:[],music:[]} });
    fullUi.run('globalThis.fullFixture=JSON.parse(fullString)'); fileEvent(fullUi, 'fullFixture');
    await fullUi.run('validateAndRestoreData(fileEvent)');
    assert(fullUi.confirmations[0].includes('Files not present in the backup will be removed'));
    assert.equal(fullUi.run('stores.gallery.length+stores.timerImage.length+stores.music.length'), 0);
    assert.equal(fullUi.reloads(), 1);

    for (const value of [null, false, {}, [], '', 'media', 'FULL', 0]) {
        const env = environment(); env.context.badScope = value;
        const before = localSnapshot(env);
        env.run('settingsFixture.scope=badScope');
        await assert.rejects(env.run('restoreData(settingsFixture)'), /Invalid backup/);
        assert.deepEqual(localSnapshot(env), before); assert.equal(env.reads.length, 0); assert.equal(env.writes.length, 0);
    }
    for (const mutation of [
        'delete settingsFixture.scope', 'settingsFixture.version=2', 'settingsFixture.version=4',
        'settingsFixture.media={version:1,gallery:[],timerImage:[],music:[]}', 'settingsFixture.media=null',
        'settingsFixture.indexedDB.imageType="upload"', 'settingsFixture.localStorage.myntWallpaperCurrent="missing-id"',
        'settingsFixture.localStorage["myntPomodoroAppearance.v1"]="{}"', 'settingsFixture.localStorage.myntPomoMusicSettingsV1="{}"',
        'settingsFixture.localStorage.myntPomoScenarios="{}"', 'settingsFixture.scope="full"'
    ]) {
        const env = environment(), before = localSnapshot(env); env.run(mutation);
        await assert.rejects(env.run('restoreData(settingsFixture)'), /Invalid backup/);
        assert.deepEqual(localSnapshot(env), before); assert.equal(env.reads.length, 0); assert.equal(env.writes.length, 0);
    }
    const invalidSelection = environment(); invalidSelection.nodes.backupScopeSelect.value = 'other';
    await invalidSelection.run('backupData()');
    assert.equal(invalidSelection.downloads.length, 0); assert.equal(invalidSelection.blobReads.length, 0); assert.equal(invalidSelection.reads.length, 0);
    assert(invalidSelection.alerts[0].includes('Invalid backup scope'));
    assert(!invalidSelection.nodes.backupScopeSelect.disabled);

    for (const version of [undefined, 1, 2]) {
        const legacy = environment(), before = localSnapshot(legacy), media = await storeSnapshot(legacy);
        legacy.context.legacyString = JSON.stringify({ version, localStorage:{todoList:'legacy task',myntWallpaperCurrent:'dangling-old-id',myntPomoMusicSettingsV1:'{"selectedId":"not-present"}'}, indexedDB:{} });
        await legacy.run('restoreData(JSON.parse(legacyString))');
        assert.equal(legacy.storage.todoList, 'legacy task');
        assert.equal(legacy.storage.myntWallpaperCurrent, before.myntWallpaperCurrent);
        assert.equal(legacy.storage.myntPomoMusicSettingsV1, before.myntPomoMusicSettingsV1);
        const after = await storeSnapshot(legacy);
        for (const key of ['gallery','timerImage','music']) assert.deepEqual(after[key], media[key]);
    }
    const oldFull = environment(); oldFull.context.fullString = full.serialized;
    oldFull.run('globalThis.oldFixture=JSON.parse(fullString); delete oldFixture.scope');
    assert(oldFull.run('isValidBackupFile(oldFixture)'), 'unscoped v3 continues to mean a complete backup');
    await oldFull.run('restoreData(oldFixture)');

    for (const [kind, key] of [['get','todoList'],['set','todoList'],['remove','myntLayout']]) {
        const env = environment(), before = localSnapshot(env), media = await storeSnapshot(env);
        if (kind === 'remove') env.run('delete settingsFixture.localStorage.myntLayout');
        env.faults[kind] = key;
        await assert.rejects(env.run('restoreData(settingsFixture)'), kind === 'get' ? /storage unavailable/ : /previous local data was restored/);
        assert.deepEqual(localSnapshot(env), before, `settings rollback after ${kind}`);
        assert.deepEqual(await storeSnapshot(env), media); assert.equal(env.reads.length, 0); assert.equal(env.writes.length, 0);
    }
    const unavailable = environment(); unavailable.faults.database = true;
    await assert.rejects(unavailable.run('createBackup()'), /blocked database/);
    assert.equal(unavailable.blobReads.length, 0); assert.equal(unavailable.writes.length, 0);
    const exportFailure = environment(); exportFailure.faults.get = 'todoList';
    await exportFailure.run('backupData()');
    assert.equal(exportFailure.downloads.length, 0); assert.equal(exportFailure.writes.length, 0); assert(!exportFailure.nodes.backupBtn.disabled);
    const recoveryFailure = environment(); recoveryFailure.run('delete settingsFixture.localStorage.todoList');
    recoveryFailure.faults.set = 'selectedLanguage'; recoveryFailure.faults.permanentSet = 'todoList';
    await assert.rejects(recoveryFailure.run('restoreData(settingsFixture)'), /Restore and recovery could not finish/);
    assert.equal(recoveryFailure.reads.length, 0); assert.equal(recoveryFailure.writes.length, 0);

    const cancelled = environment(); cancelled.accept(false);
    const cancelledLocal = localSnapshot(cancelled), cancelledStores = await storeSnapshot(cancelled), input = fileEvent(cancelled);
    await cancelled.run('validateAndRestoreData(fileEvent)');
    assert.deepEqual(localSnapshot(cancelled), cancelledLocal); assert.deepEqual(await storeSnapshot(cancelled), cancelledStores);
    assert.equal(cancelled.reloads(), 0); assert.equal(input.value, ''); assert(!cancelled.nodes.backupScopeSelect.disabled);
    const hugeFile = environment(); let fileReads = 0;
    hugeFile.context.fileEvent = { currentTarget:{ value:'huge.json', files:[{ size:LIMIT+1,text:async()=>{fileReads++;return '{}';} }] } };
    await hugeFile.run('validateAndRestoreData(fileEvent)');
    assert.equal(fileReads, 0); assert.equal(hugeFile.confirmations.length, 0); assert.equal(hugeFile.writes.length, 0);
    assert(hugeFile.alerts[0].includes('32 MiB restore limit'));

    const componentBackup = environment();
    componentBackup.context.MYNTComponentVisibilityCore = require('../scripts/component-visibility-core.js');
    componentBackup.run(`settingsFixture.localStorage.myntSearchVisible = 'false'; settingsFixture.localStorage.myntComponentsMigrationV1 = '{"version":1,"previous":{"hideClockVisible":null}}';`);
    assert(componentBackup.run('isValidBackupFile(settingsFixture)'), 'Settings backup accepts validated visibility and absence-only migration.');
    const componentMedia = await storeSnapshot(componentBackup);
    await componentBackup.run('restoreData(settingsFixture)'); // Isolated in-memory fixture, not browser confirmation.
    assert.equal(componentBackup.storage.myntSearchVisible, 'false');
    assert.deepEqual(await storeSnapshot(componentBackup), componentMedia, 'Visibility restoration cannot touch media.');
    componentBackup.run(`settingsFixture.localStorage.myntSearchVisible = 'maybe';`);
    assert(!componentBackup.run('isValidBackupFile(settingsFixture)'));
    componentBackup.run(`settingsFixture.localStorage.myntSearchVisible = 'true'; settingsFixture.localStorage.myntComponentsMigrationV1 = '{"version":1,"previous":{"hideClockVisible":"false"}}';`);
    assert(!componentBackup.run('isValidBackupFile(settingsFixture)'), 'Migration cannot claim an explicit user preference was replaced.');

    // Production end-to-end settings roundtrip, entirely in isolated storage/DOM fixtures.
    // Media references intentionally differ at the destination: settings-only restore
    // must retain them, rather than inventing copied files or dangling source references.
    const { setup: componentEnvironment } = require('./check-component-manager.cjs');
    const componentCore = require('../scripts/component-visibility-core.js');
    const countdownCore = require('../scripts/event-countdown-core.js');
    const layoutProfiles = require('../scripts/layout-profiles.js');
    const { myntNormalizeLayout: normalizeLayout } = require('../scripts/layout-editor.js');
    const dataAdapter = require('../scripts/local-mcp-data.js');
    const { webcrypto } = require('node:crypto');
    assert.equal(layoutProfiles.KEY,'myntLayoutProfiles');
    const manualLayout = {version:2,locked:true,snap:false,blocks:{clock:{x:.15,y:.2,s:.8},focus:{x:.3,y:.1,s:1}}};
    const profileState = layoutProfiles.migrate(manualLayout,normalizeLayout);
    profileState.profiles[0].name='隔離手動配置';
    profileState.profiles[0].layouts.narrow.blocks.focus={x:.05,y:.35,s:.9};
    profileState.profiles[0].previous.wide=clone(manualLayout);
    assert.deepEqual(layoutProfiles.validate(profileState,normalizeLayout),profileState,'Production profile validator accepts the real wide/narrow/previous schema.');
    const todoState = {tfixture:{title:'隔離待辦',status:'pending',pinned:false}};
    const retained = {
        myntLayout: JSON.stringify(manualLayout),
        [layoutProfiles.KEY]: JSON.stringify(profileState),
        myntScratchpadContent: '隔離便箋\nKeep this exact text 🌱',
        todoList: JSON.stringify(todoState),
        myntWallpaperCurrent: 'source-photo'
    };
    const eventState = {...countdownCore.defaultState(),events:[{id:'e-fixture-day',name:'Fixture anniversary',date:'2027-06-12',category:'anniversary',emoji:'🎉',color:'blue',annual:false}]};
    countdownCore.validate(eventState);
    const origin = componentEnvironment({...retained, selectedLanguage:'en', clocktype:'analog', greetingEnabled:'true', myntEventCountdownsV1:JSON.stringify(eventState)});
    const todoBefore=await dataAdapter.execute('mynt_todos_get',{}, {storage:origin.context.localStorage,crypto:webcrypto});
    assert.equal(todoBefore.ok,true,'Production task reader validates the real keyed title/status/pinned format.');
    assert.deepEqual(todoBefore.data,todoState);
    const desired = new Map(componentCore.definitions.map((item,index)=>[item.id,index%2===1]));
    for(const item of componentCore.definitions) origin.change(item.id,desired.get(item.id));
    const canonicalKeys = ['hideClockVisible', 'hideWeatherVisible', 'userTextVisible', 'myntSearchVisible',
        'shortcutsCheckboxState', 'aiToolsCheckboxState', 'googleAppsCheckboxState', 'bookmarksCheckboxState',
        'todoListCheckboxState', 'pomodoroCheckboxState', 'myntHomeWidgetsVisible', 'bongoCatCheckboxState',
        'scratchpadCheckboxState', 'myntStudyQuoteEnabled', 'motivationalQuotesVisible', 'myntExamDailyVisible',
        'myntEventCountdownsV1', 'myntGalleryEntryVisible', 'myntProfilesEntryVisible', 'myntAdaptiveEntryVisible'];
    assert.deepEqual(componentCore.definitions.map(item=>item.key),canonicalKeys);
    assert.equal(desired.size,canonicalKeys.length);
    assert.equal(origin.values.get('hideClockVisible'),'true','Clock stays hidden for the later cold-start test.');
    for(const [key,value] of Object.entries(retained)) assert.equal(origin.values.get(key),value,'Visibility controls preserve original content: '+key);
    const sourceVisibility = componentCore.snapshot(origin.context.localStorage);
    const sourceCanonical = componentCore.definitions.map(item=>[item.key,origin.context.localStorage.getItem(item.key)]);
    const exportEnv = environment();
    for(const [key,value] of origin.values) exportEnv.storage.setItem(key,value);
    for(const script of ['event-countdown-core.js','component-visibility-core.js']) exportEnv.run(fs.readFileSync(path.join(root,'scripts',script),'utf8'));
    const packed = await exportEnv.run('createBackup("settings")');
    exportEnv.context.serializedRoundtrip=packed.serialized;
    assert(exportEnv.run('isValidBackupFile(JSON.parse(serializedRoundtrip))'),'Production validator accepts the actual serialized settings export.');
    assert.equal(exportEnv.reads.length,0,'Settings export never opens a media database.');
    assert(!Object.hasOwn(packed.backup.localStorage,'myntWallpaperCurrent'));
    assert.equal(packed.backup.localStorage.myntHomeWidgetsVisible,'false','Settings export includes the local homepage widget visibility preference.');

    const importEnv = environment();
    for(const script of ['event-countdown-core.js','component-visibility-core.js']) importEnv.run(fs.readFileSync(path.join(root,'scripts',script),'utf8'));
    importEnv.storage.setItem('myntWallpaperCurrent','destination-photo');
    importEnv.storage.setItem('myntPomoMusicSettingsV1','{"selectedId":"destination-song","volume":0.3}');
    const destinationMedia = Object.fromEntries(Object.entries(importEnv.storage).filter(([key])=>key.startsWith('myntWallpaper')||['myntPomodoroAppearance.v1','myntPomoMusicSettingsV1','myntPomoScenarios'].includes(key)));
    const destinationStores = await storeSnapshot(importEnv);
    importEnv.context.serializedRoundtrip=packed.serialized;
    assert(importEnv.run('isValidBackupFile(JSON.parse(serializedRoundtrip))'));
    await importEnv.run('restoreData(JSON.parse(serializedRoundtrip))'); // Real restore logic, fake local storage only.
    assert.equal(importEnv.confirmations.length,0);assert.equal(importEnv.reloads(),0,'Direct isolated restore invokes no browser confirmation or navigation.');
    assert.equal(importEnv.reads.length,0);assert.equal(importEnv.writes.length,0,'Settings restore neither reads nor writes media databases.');
    assert.deepEqual(await storeSnapshot(importEnv),destinationStores);
    for(const [key,value] of Object.entries(destinationMedia)) assert.equal(importEnv.storage.getItem(key),value,'Destination media reference remains unchanged: '+key);
    for(const [key,value] of sourceCanonical) assert.equal(importEnv.storage.getItem(key),value,'All 20 canonical keys survive serialized production restore: '+key);
    assert.deepEqual(componentCore.snapshot(importEnv.storage),sourceVisibility,'Visibility cache and legacy values also roundtrip exactly.');
    assert.deepEqual(layoutProfiles.validate(JSON.parse(importEnv.storage.getItem(layoutProfiles.KEY)),normalizeLayout),profileState,'Restored real profile key still passes production validation.');
    const todoRestored=await dataAdapter.execute('mynt_todos_get',{}, {storage:importEnv.storage,crypto:webcrypto});
    assert.equal(todoRestored.ok,true);assert.deepEqual(todoRestored.data,todoState);

    const cold = componentEnvironment(localSnapshot(importEnv),false,JSON.parse(retained.myntLayout));
    for(const [id,visible] of desired) assert.equal(cold.control(id).checked,visible,'Cold-start checkbox matches restored preference: '+id);
    assert.equal(cold.root.myntClockPreferences,undefined);
    // Mount the real legacy storage helpers and real clock runtime into that same
    // restored fixture; the manager's initializer stub is replaced by clock.js.
    const intervals = new Map();let nextTimer=0;
    const originalQuery=cold.context.document.querySelector;
    cold.context.document.querySelector=selector=>selector==='.clockOptions'?cold.node('fixtureClockOptions'):originalQuery(selector);
    cold.context.document.visibilityState='visible';
    cold.root.matchMedia=()=>({matches:false});
    Object.assign(cold.context,{
        setTimeout:()=>++nextTimer,setInterval(fn,delay){const id=++nextTimer;intervals.set(id,{fn,delay});return id;},clearInterval:id=>intervals.delete(id),
        getLanguageStatus:()=> 'en',localizeNumbers:value=>value,numberMappings:{},isFirefoxAll:false,
        myntNormalizeGreetingName:require('../scripts/dashboard-tools.js').myntNormalizeGreetingName,
        myntFormatGreeting:require('../scripts/dashboard-tools.js').myntFormatGreeting,
        translations:{en:{days:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],months:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],greeting:{morning:'Morning',afternoon:'Afternoon',evening:'Evening'}}}
    });
    for(const script of ['save-load-states.js','clock.js']) vm.runInNewContext(fs.readFileSync(path.join(root,'scripts',script),'utf8'),cold.context);
    assert.equal(cold.root.myntClockPreferences,undefined,'Hidden-at-start real clock does not initialize.');
    cold.change('clock',true);
    assert.equal(typeof cold.root.myntClockPreferences.refreshVisibility,'function');
    assert.equal(cold.calls.clockInit,0,'The manager uses the real initializer, not the fixture stub.');
    assert.equal(intervals.size,1);assert.equal(cold.node('analogClock').style.display,'block');
    assert.equal(typeof cold.node('digitalCheckbox').handlers.change,'function','Late clock controls are bound after restore.');
    cold.values.set('clocktype','digital');cold.events.storage({key:'clocktype'});
    assert.equal(cold.node('digitalClock').style.display,'block');assert.equal(cold.node('digitalCheckbox').checked,true);
    assert.deepEqual([...intervals.values()].map(timer=>timer.delay),[1000]);
    cold.values.set('hourformat','true');cold.events.storage({key:'hourformat'});assert.equal(cold.node('12hourcheckbox').checked,true);
    cold.values.set('myntSearchVisible','false');cold.events.storage({key:'myntSearchVisible'});
    assert.equal(cold.control('search').checked,false);assert(cold.node('searchbar').hasAttribute('data-mynt-component-hidden'));
    for(const key of ['myntLayout',layoutProfiles.KEY,'myntScratchpadContent','todoList']) assert.equal(cold.values.get(key),retained[key],'Roundtrip/re-add/cross-tab preserve exact personal data bytes: '+key);
    assert.deepEqual(layoutProfiles.validate(JSON.parse(cold.values.get(layoutProfiles.KEY)),normalizeLayout),profileState);
    for(const [key,value] of Object.entries(destinationMedia)) assert.equal(cold.values.get(key),value);
    assert.deepEqual(JSON.parse(cold.values.get('myntEventCountdownsV1')).events,eventState.events);
    console.log('COMPONENT_BACKUP_ROUNDTRIP_OK: all 20 canonical visibility keys and caches survive real settings export/serialization/validation/restore/cold-start; real late clock initialization and cross-tab mode/hour/search sync; exact layout/note/todo/event preservation; distinct destination media references and blobs untouched; zero real browser/profile/permission/confirmation operations.');

    console.log('BACKUP_SCOPE_OK: explicit full/settings scope; oversized and blocked media escape route; pre-encoding total and boundary estimates; Unicode/base64 accounting; omitted media/preferences preserved; v1/v2/v3 compatibility; malformed scopes fail before writes; file scope wins over export UI; imported active timer states stay paused; confirmation/cancellation; local read/write rollback and recovery errors. Isolated fixtures only.');
})().catch(error => { console.error(error); process.exitCode = 1; });

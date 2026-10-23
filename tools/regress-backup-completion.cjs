/* Isolated, deterministic backup fixtures. No browser profile or real storage. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(process.argv[2] || process.cwd(), 'scripts/backup-restore.js'), 'utf8');

function environment() {
    const databases = new Map(), faults = {}, writes = [], alerts = [], confirmations = [], downloads = [];
    const storage = Object.create(null);
    Object.defineProperties(storage, {
        getItem: { value: key => Object.hasOwn(storage, key) ? storage[key] : null },
        setItem: { value: (key, value) => { if (faults.local === key) { delete faults.local; throw Error('fixture quota'); } storage[key] = String(value); } },
        removeItem: { value: key => { delete storage[key]; } },
        clear: { value: () => { for (const key of Object.keys(storage)) delete storage[key]; } }
    });
    function connection(name) {
        const config = databases.get(name);
        return {
            close() {},
            createObjectStore(store, options) { config.store = store; config.keyPath = options?.keyPath; return { createIndex() {} }; },
            transaction(store, mode) {
                assert.equal(store, config.store);
                const pending = new Map(config.entries);
                const sequence = mode === "readwrite" ? (config.writeCount = (config.writeCount || 0) + 1) : 0;
                const tx = { error: null, aborted: false, abort() { this.aborted = true; } };
                const request = value => {
                    const req = {};
                    queueMicrotask(() => { req.result = value; req.onsuccess?.(); });
                    return req;
                };
                tx.objectStore = () => ({
                    getAllKeys: () => request([...pending.keys()]), getAll: () => request([...pending.values()]),
                    clear: () => { pending.clear(); },
                    put(value, key) {
                        if (faults.throwPut === name) { delete faults.throwPut; throw Error('fixture DataCloneError'); }
                        pending.set(config.keyPath ? value[config.keyPath] : key, value);
                    }
                });
                setImmediate(() => {
                    if (mode === 'readwrite') writes.push(name);
                    if (mode === 'readwrite' && (faults.commit === name || faults.failWrites?.has(name + ':' + sequence))) { delete faults.commit; tx.error = Error('fixture transaction failure'); tx.aborted = true; }
                    if (tx.aborted) tx.onabort?.();
                    else { if (mode === 'readwrite') config.entries = pending; tx.oncomplete?.(); }
                });
                return tx;
            }
        };
    }
    const indexedDB = { open(name) {
        const req = {};
        queueMicrotask(() => {
            const isNew = !databases.has(name);
            if (isNew) databases.set(name, { entries: new Map() });
            req.result = connection(name);
            if (isNew) req.onupgradeneeded?.();
            req.onsuccess?.();
        });
        return req;
    } };
    const nodes = Object.fromEntries(['backupBtn', 'restoreBtn', 'fileInput', 'resetsettings', 'backupScopeText', 'backupStatus'].map(id => [id, { disabled: false, textContent: '', addEventListener() {}, click() {} }]));
    class Reader {
        readAsDataURL(blob) { blob.arrayBuffer().then(buffer => { this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(buffer).toString('base64')}`; this.onload(); }).catch(error => { this.error = error; this.onerror(); }); }
    }
    let reloads = 0, accepted = true;
    const context = vm.createContext({
        Blob, URL, Uint8Array, atob, FileReader: Reader, indexedDB, localStorage: storage, console,
        setTimeout: fn => { fn(); }, currentLanguage: 'en', translations: { en: { failedbackup: 'Backup failed: ', restorefailed: 'Restore failed: ', restorecompleted: 'Restored.' } },
        document: { getElementById: id => nodes[id], body: { appendChild() {} }, createElement: () => ({ click() { downloads.push(this.download); }, remove() {} }) },
        confirmPrompt: async text => { confirmations.push(text); return accepted; }, alertPrompt: async text => { alerts.push(text); }, location: { reload() { reloads++; } },
        storeName: 'backgroundImages', openDatabase: async () => connection('ImageDB'),
        seed(name, store, keyPath, entries) { databases.set(name, { store, keyPath, entries: new Map(entries) }); }
    });
    vm.runInContext(source, context);
    vm.runInContext(`
        seed('ImageDB', 'backgroundImages', null, [['backgroundImage', new Blob(['old wallpaper'], {type:'image/png'})], ['lastUpdateTime', '2026-10-20T00:00:00Z'], ['imageType','upload'], ['future-metadata','keep me']]);
        seed('MYNTWallpaperGallery', 'items', 'id', [['old-gallery',{id:'old-gallery',name:'old.png',type:'image',source:'upload',added:1,blob:new Blob(['old gallery'],{type:'image/png'})}]]);
        seed('MyntPomodoroAppearance', 'images', null, [['background',new Blob(['old timer'],{type:'image/png'})]]);
        seed('myntPomodoroMusicV1', 'tracks', 'id', [['old-track',{id:'old-track',name:'old.mp3',blob:new Blob(['old audio'],{type:'audio/mpeg'})}]]);
        localStorage.setItem('weatherApiKey','fixture-secret-do-not-export');
        localStorage.setItem('myntPomoMusicOwnerV1','fixture-active-tab');
        localStorage.setItem('todoList',JSON.stringify({today:[{title:'existing task',completed:false}]}));
        localStorage.setItem('myntLayout','existing manual layout');
    `, context);
    const run = code => vm.runInContext(code, context);
    return { run, context, databases, faults, writes, alerts, confirmations, downloads, nodes, storage, accept: value => accepted = value, reloads: () => reloads };
}
async function canonical(value) {
    if (value instanceof Blob) return { type: value.type, data: Buffer.from(await value.arrayBuffer()).toString('base64') };
    if (Array.isArray(value)) return Promise.all(value.map(canonical));
    if (value && typeof value === 'object') return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, item]) => [key, await canonical(item)])));
    return value;
}
async function snapshot(env) {
    return { local: { ...env.storage }, stores: await canonical(Object.fromEntries([...env.databases].map(([key, value]) => [key, [...value.entries]]))) };
}
const newFixture = `({format:'material-you-newtab',version:3,createdAt:'2026-10-23T10:00:00Z',
    localStorage:{selectedLanguage:'zh_TW',myntWallpaperCurrent:'none',myntWallpaperMode:'fixed',myntLayout:'manual layout kept exactly',
        myntLayoutProfiles:'profiles fixture',todoList:'{"today":[{"title":"備份待辦","completed":false}]}',myntScratchpadContent:'fixture scratchpad',
        myntPomoMusicSettingsV1:'{"selectedId":"song"}',weatherApiKey:'untrusted-import-key',myntPomoMusicOwnerV1:'untrusted-owner',
        pomodoroState:'{"version":2,"phase":"work","timeRemaining":120,"totalTime":120,"currentRound":1,"isRunning":true,"endAt":1792749660000}'},
    indexedDB:{backgroundImage:{isBlob:true,blob:'data:image/png;base64,bmV3IHdhbGxwYXBlcg=='},lastUpdateTime:'2026-10-23T00:00:00Z',imageType:'upload'},
    media:{version:1,gallery:[['photo',{id:'photo',name:'photo.png',type:'image',source:'upload',added:5,removedAt:10,blob:{isBlob:true,blob:'data:image/png;base64,Z2FsbGVyeQ=='}}],['link',{id:'link',name:'linked video',type:'video',source:'url',src:'https://example.test/video.mp4',added:6}]],timerImage:[['background',{isBlob:true,blob:'data:image/webp;base64,dGltZXI='}]],music:[['song',{id:'song',name:'song.mp3',blob:{isBlob:true,blob:'data:audio/mpeg;base64,bXVzaWM='}}]]}})`;
function loadFixture(env) { env.run(`globalThis.fixture = ${newFixture};`); }

(async () => {
    const exporting = environment();
    const beforeExport = await snapshot(exporting);
    const result = await exporting.run('createBackup()');
    assert.equal(result.backup.version, 3);
    assert(!result.serialized.includes('fixture-secret-do-not-export'));
    assert(!result.serialized.includes('fixture-active-tab'));
    assert.equal(result.backup.media.gallery.length, 1);
    assert.equal(result.backup.media.timerImage.length, 1);
    assert.equal(result.backup.media.music.length, 1);
    assert(!Object.hasOwn(result.backup.indexedDB, 'future-metadata'));
    assert.deepEqual(await snapshot(exporting), beforeExport);

    const fresh = environment();
    fresh.context.serialized = result.serialized;
    await fresh.run('restoreData(JSON.parse(serialized))');
    const roundTrip = await fresh.run('createBackup()');
    assert.deepEqual(JSON.parse(JSON.stringify(roundTrip.backup.media)), JSON.parse(JSON.stringify(result.backup.media)));
    assert.deepEqual(JSON.parse(JSON.stringify(roundTrip.backup.indexedDB)), JSON.parse(JSON.stringify(result.backup.indexedDB)));
    assert.deepEqual(JSON.parse(JSON.stringify(roundTrip.backup.localStorage)), JSON.parse(JSON.stringify(result.backup.localStorage)));

    const full = environment(); loadFixture(full);
    const { myntNormalizeLayout } = require(path.join(process.argv[2] || process.cwd(), 'scripts/layout-editor.js'));
    const profiles = require(path.join(process.argv[2] || process.cwd(), 'scripts/layout-profiles.js'));
    const manual = { version: 2, locked: true, snap: true, blocks: { search: { x: .1, y: -.2, s: 1.2 } } };
    const profileData = profiles.migrate(manual, myntNormalizeLayout);
    full.context.layoutFixture = JSON.stringify(manual);
    full.context.profileFixture = JSON.stringify(profileData);
    full.run('fixture.localStorage.myntLayout=layoutFixture; fixture.localStorage.myntLayoutProfiles=profileFixture');
    await full.run('restoreData(fixture)');
    assert.equal(full.storage.myntLayout, JSON.stringify(manual));
    assert.deepEqual(profiles.validate(JSON.parse(full.storage.myntLayoutProfiles), myntNormalizeLayout), profileData);
    assert.equal(full.storage.myntScratchpadContent, 'fixture scratchpad');
    assert.equal(full.storage.myntWallpaperCurrent, 'none');
    assert.equal(JSON.parse(full.storage.todoList).today[0].title, '備份待辦');
    assert.equal(full.storage.weatherApiKey, 'fixture-secret-do-not-export');
    assert.equal(full.storage.myntPomoMusicOwnerV1, 'fixture-active-tab');
    assert.equal(JSON.parse(full.storage.pomodoroState).isRunning, false);
    assert.equal(JSON.parse(full.storage.pomodoroState).endAt, null);
    assert.equal(full.databases.get('MYNTWallpaperGallery').entries.get('photo').removedAt, 10);
    assert.equal(await full.databases.get('myntPomodoroMusicV1').entries.get('song').blob.text(), 'music');
    assert.equal(await full.databases.get('MyntPomodoroAppearance').entries.get('background').text(), 'timer');
    assert.equal(full.databases.get('ImageDB').entries.get('future-metadata'), 'keep me');
    assert(!full.databases.get('MYNTWallpaperGallery').entries.has('old-gallery'));

    for (const [kind, name] of [['commit','ImageDB'], ['commit','MYNTWallpaperGallery'], ['commit','MyntPomodoroAppearance'], ['commit','myntPomodoroMusicV1'], ['throwPut','MYNTWallpaperGallery'], ['local','todoList']]) {
        const env = environment(); loadFixture(env); const before = await snapshot(env);
        env.faults[kind] = name;
        await assert.rejects(env.run('restoreData(fixture)'), /previous local data was restored/);
        assert.deepEqual(await snapshot(env), before, `rollback must preserve all stores after ${kind}/${name}`);
    }

    const recoveryFailure = environment(); loadFixture(recoveryFailure);
    const beforeRecoveryFailure = await snapshot(recoveryFailure);
    recoveryFailure.faults.failWrites = new Set(['myntPomodoroMusicV1:1', 'MYNTWallpaperGallery:2']);
    await assert.rejects(recoveryFailure.run('restoreData(fixture)'), /Restore and recovery could not finish/);
    const partialRecovery = await snapshot(recoveryFailure);
    assert.deepEqual(partialRecovery.local, beforeRecoveryFailure.local);
    for (const key of ['ImageDB', 'MyntPomodoroAppearance', 'myntPomodoroMusicV1']) assert.deepEqual(partialRecovery.stores[key], beforeRecoveryFailure.stores[key]);
    assert.equal(recoveryFailure.reloads(), 0);

    const empty = environment(); loadFixture(empty);
    empty.run('fixture.media.gallery=[];fixture.media.timerImage=[];fixture.media.music=[]');
    assert(empty.run('backupScopePreview(fixture)').includes('Files not present in the backup will be removed'));
    await empty.run('restoreData(fixture)');
    for (const key of ['MYNTWallpaperGallery', 'MyntPomodoroAppearance', 'myntPomodoroMusicV1']) assert.equal(empty.databases.get(key).entries.size, 0);

    const invalid = environment(); loadFixture(invalid); const beforeInvalid = await snapshot(invalid);
    for (const mutation of [
        'fixture.version=4', 'fixture.format="another-app"', 'fixture.media.version=2', 'delete fixture.media.music',
        'fixture.media.music.push(fixture.media.music[0])', 'fixture.media.gallery[0][1].src="javascript:alert(1)"',
        'fixture.media.music[0][1].blob.blob="data:text/html;base64,bXVzaWM="',
        'fixture.media.timerImage[0][1].blob="data:image/png;base64,A==="',
        'fixture.media.gallery[0][1].unexpected="field"', 'fixture.localStorage.todoList={}',
        'fixture.indexedDB.unowned="overwrite"', 'fixture.localStorage.large="x".repeat(32*1024*1024)',
        'fixture.media.music=Array.from({length:31},(_,i)=>["s"+i,{id:"s"+i,name:"s.mp3",blob:{isBlob:true,blob:"data:audio/mpeg;base64,bXVzaWM="}}])'
    ]) {
        loadFixture(invalid); invalid.run(mutation);
        await assert.rejects(invalid.run('restoreData(fixture)'), /Invalid backup/);
        assert.deepEqual(await snapshot(invalid), beforeInvalid);
        assert.equal(invalid.writes.length, 0, 'validation must precede every storage write');
    }

    const legacy = environment(), beforeLegacy = await snapshot(legacy);
    await legacy.run('restoreData({version:2,localStorage:{myntLayout:"legacy layout"},indexedDB:{}})');
    assert.equal(legacy.storage.myntLayout, 'legacy layout');
    for (const key of ['MYNTWallpaperGallery', 'MyntPomodoroAppearance', 'myntPomodoroMusicV1']) {
        assert.deepEqual((await snapshot(legacy)).stores[key], beforeLegacy.stores[key], 'legacy backup cannot clear media absent from its file');
    }
    assert(legacy.run('backupScopePreview({version:2,localStorage:{},indexedDB:{}})').includes('older backup'));
    assert(legacy.run('isValidBackupFile({localStorage:{},indexedDB:{}})'), 'unversioned legacy backup remains accepted');

    const cancelled = environment(); loadFixture(cancelled); cancelled.accept(false);
    const input = { files: [{ size: 1000, text: async () => cancelled.run('JSON.stringify(fixture)') }], value: 'fixture.json' };
    cancelled.context.event = { currentTarget: input };
    const beforeCancel = await snapshot(cancelled);
    await cancelled.run('validateAndRestoreData(event)');
    assert.equal(cancelled.confirmations.length, 1);
    assert(cancelled.confirmations[0].includes('gallery entries: 2'));
    assert.deepEqual(await snapshot(cancelled), beforeCancel);
    assert.equal(cancelled.reloads(), 0); assert.equal(input.value, '');
    assert(!cancelled.nodes.restoreBtn.disabled); assert(cancelled.nodes.backupStatus.textContent.includes('cancelled'));
    cancelled.accept(true); await cancelled.run('validateAndRestoreData(event)');
    assert.equal(cancelled.reloads(), 1); assert(cancelled.alerts.includes('Restored.'));

    const oversized = environment();
    oversized.run(`seed('myntPomodoroMusicV1','tracks','id',[['large',{id:'large',name:'large.mp3',blob:new Blob([new Uint8Array(25*1024*1024)],{type:'audio/mpeg'})}]]);`);
    const beforeOversized = await snapshot(oversized);
    await oversized.run('backupData()');
    assert.equal(oversized.downloads.length, 0); assert(oversized.alerts[0].includes('exceeds 32 MiB'));
    assert.deepEqual(await snapshot(oversized), beforeOversized);
    assert(!oversized.nodes.backupBtn.disabled);
    assert.equal(oversized.writes.length, 0);
    console.log('BACKUP_COMPLETION_OK: full v3 export/restore, exact media bytes, layout/tasks/notes, removed gallery, safe timer pause, exclusions, legacy media preservation, schema/version/size/security rejection, confirmation/cancel/reload, all-store rollback, synchronous transaction abort and oversized export without omission. Isolated fixtures only.');
})().catch(error => { console.error(error); process.exitCode = 1; });

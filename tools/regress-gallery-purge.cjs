/* Synthetic browser/IndexedDB only. Never opens a browser or touches user media. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../scripts/wallpaper-gallery.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const clone = value => value === undefined ? undefined : structuredClone(value);
function sharedState() {
    const blob = text => new Blob([text], { type: 'image/png' });
    return {
        records: new Map([
            ['a', { id: 'a', name: 'Fixture A', source: 'upload', type: 'image', added: 1, blob: blob('original A'), thumb: blob('thumbnail A'), removedAt: 10 }],
            ['b', { id: 'b', name: 'Keep B', source: 'upload', type: 'image', added: 2, blob: blob('original B') }],
            ['builtin', { id: 'builtin', name: 'Built-in', source: 'bundled', type: 'image', added: 0, blob: blob('packaged') }]
        ]),
        settings: new Map([['myntWallpaperSeeded', '1'], ['myntWallpaperCurrent', 'none'], ['myntWallpaperMode', 'fixed']]),
        lockQueue: Promise.resolve(), lockDepth: 0, locks: [], writes: 0, deletes: 0,
        abortDelete: false, throwDelete: false, cacheFailure: false, cacheCalls: 0,
        cache: { owner: null, blob: blob('unowned legacy copy') }, channels: []
    };
}
function fixture(shared = sharedState(), options = {}) {
    const listeners = new Map(), elements = new Map(), revoked = [], objectUrls = [], confirmations = [], saves = [];
    let objectCounter = 0, accept = false, promptResult = null;
    const classList = () => ({ add() {}, remove() {}, toggle() {}, contains() { return false; } });
    class Element {
        constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.style = { values: {}, setProperty(k,v) { this.values[k] = v; }, removeProperty(k) { delete this.values[k]; } }; this.classList = classList(); this.events = new Map(); this.hidden = false; this.attributes = {}; this.value = ''; this.paused = true; this.textContent = ''; }
        appendChild(child) { this.children.push(child); return child; }
        prepend(child) { this.children.unshift(child); }
        replaceChildren(...children) { this.children = children; }
        setAttribute(k,v) { this.attributes[k] = v; }
        removeAttribute(k) { delete this.attributes[k]; if (k === 'src') delete this.src; }
        addEventListener(name, callback) { this.events.set(name, callback); }
        focus() { document.activeElement = this; }
        pause() { this.paused = true; }
        play() { this.paused = false; this.playCount = (this.playCount || 0) + 1; return Promise.resolve(); }
        load() {}
        querySelector(selector) { return this.children.find(child => child.className === selector.slice(1)) || null; }
    }
    for (const id of ['wallpaperGalleryGrid', 'wallpaperGalleryStatus', 'wallpaperRecoveryList', 'wallpaperRecoveryTitle', 'wallpaperRecoveryEmpty', 'wallpaperStorageUsage', 'wallpaperUndoBar', 'wallpaperUndoText', 'wallpaperUndoBtn', 'wallpaperGalleryEmpty', 'wallpaperModeSelect', 'wallpaperIntervalGroup', 'wallpaperMinutesSelect', 'closeWallpaperGalleryBtn']) elements.set(id, new Element());
    const document = {
        readyState: 'loading', hidden: false, visibilityState: 'visible', body: new Element('body'), documentElement: new Element('html'),
        getElementById: id => elements.get(id) || null,
        createElement: tag => new Element(tag),
        addEventListener: (name, fn) => { listeners.set('document:' + name, [...(listeners.get('document:' + name) || []), fn]); },
        querySelectorAll: () => elements.get('wallpaperGalleryGrid').children,
        contains: () => true
    };
    const database = { transaction(_store, mode) {
        let aborted = false, pending = 0, finishScheduled = false, staged = new Map([...shared.records].map(([key,value]) => [key,clone(value)])), deleted = 0, written = 0;
        const transaction = { error: null, abort() { if (aborted) return; aborted = true; queueMicrotask(() => transaction.onabort?.()); } };
        function schedule() {
            if (finishScheduled) return;
            finishScheduled = true;
            setImmediate(() => {
                finishScheduled = false;
                if (aborted || pending) return;
                if (mode === 'readwrite' && deleted && shared.abortDelete) { shared.abortDelete = false; transaction.abort(); return; }
                if (mode === 'readwrite') {
                    shared.records.clear(); for (const [key,value] of staged) shared.records.set(key,value);
                    shared.deletes += deleted; shared.writes += written;
                }
                transaction.oncomplete?.();
            });
        }
        function request(fn) {
            const req = {}; pending++;
            queueMicrotask(() => {
                if (aborted) { pending--; return; }
                try { req.result = fn(); req.onsuccess?.(); }
                catch (error) { transaction.error = req.error = error; req.onerror?.(); transaction.abort(); }
                pending--; schedule();
            });
            return req;
        }
        transaction.objectStore = () => ({
            get: id => request(() => clone(staged.get(id))), getAll: () => request(() => [...staged.values()].map(clone)),
            put(value) { if (mode !== 'readwrite') throw Error('readonly'); staged.set(value.id,clone(value)); written++; return request(() => value.id); },
            delete(id) { if (shared.throwDelete) throw Error('Synthetic delete failure'); staged.delete(id); deleted++; return request(() => undefined); }
        });
        schedule(); return transaction;
    } };
    const indexedDB = { open() { const request = {}; queueMicrotask(() => { request.result = database; request.onsuccess?.(); }); return request; } };
    const lockManager = { request(name, operation) {
        shared.locks.push(name);
        const pending = shared.lockQueue.catch(() => {}).then(async () => { shared.lockDepth++; try { return await operation(); } finally { shared.lockDepth--; } });
        shared.lockQueue = pending.catch(() => {}); return pending;
    } };
    class Channel {
        constructor(name) { this.name = name; this.closed = false; shared.channels.push(this); }
        postMessage(data) { for (const channel of shared.channels) if (channel !== this && !channel.closed) queueMicrotask(() => channel.onmessage?.({data:clone(data)})); }
        close() { this.closed = true; }
    }
    const window = {
        addEventListener: (name, fn) => { listeners.set(name, [...(listeners.get(name) || []), fn]); },
        matchMedia: () => ({ matches: false }),
        myntDialog: { confirm: async (message, config) => { confirmations.push({message,config}); return typeof accept === 'function' ? accept() : accept; }, prompt: async () => typeof promptResult === 'function' ? promptResult() : promptResult },
        myntGalleryCache: { purgeOwned: async id => {
            assert.equal(shared.lockDepth, 1, 'Cache cleanup must hold the shared gallery lock, not re-enter it');
            shared.cacheCalls++;
            if (shared.cacheFailure) throw Error('Synthetic cache failure');
            if (shared.cache.owner === id) { shared.cache = { owner: null, blob: null }; return { deleted: true, retainedUnowned: false }; }
            return { deleted: false, retainedUnowned: !shared.cache.owner && Boolean(shared.cache.blob) };
        } }
    };
    const context = {
        window, document, indexedDB, navigator: { locks: options.noLocks ? undefined : lockManager },
        localStorage: { getItem: key => shared.settings.get(key) ?? null, setItem: (key,value) => shared.settings.set(key,String(value)), removeItem: key => shared.settings.delete(key) },
        BroadcastChannel: Channel, URL: { createObjectURL: () => { const value = `blob:fixture-${++objectCounter}`; objectUrls.push(value); return value; }, revokeObjectURL: value => revoked.push(value) },
        saveImageToIndexedDB: async (blob, random, owner) => { assert.equal(shared.lockDepth,1); saves.push({blob,random,owner}); if (options.saveGate) await options.saveGate.promise; shared.cache = {owner,blob}; },
        applyBlobBackground: blob => { assert(blob instanceof Blob); assert.equal(shared.lockDepth,1); document.body.style.setProperty('--bg-image','url(blob:legacy-fixture)'); },
        crypto: require('node:crypto').webcrypto, console, Blob, Date, Promise, Set, Map, Error, Number, String, Boolean,
        setTimeout, clearTimeout, setInterval: () => 1, clearInterval() {}, requestAnimationFrame: callback => callback()
    };
    vm.createContext(context);
    const testExports = 'window.__galleryTest = { purgeItem, applyItem, renderGallery, renameItem, refreshSharedGallery, clearGalleryBackground, getItem, tx, updateItems, withGalleryWrite };\n';
    vm.runInContext(source.replace('    window.myntWallpaper =', testExports + '    window.myntWallpaper ='), context);
    return { shared, context, api: window.myntWallpaper, test: window.__galleryTest, elements, document, revoked, objectUrls, confirmations, saves,
        accept: value => { accept = value; }, prompt: value => { promptResult = value; }, emit: async (name,event={}) => { for (const fn of listeners.get(name) || []) await fn(event); },
        status: () => elements.get('wallpaperGalleryStatus').textContent };
}
async function settle(shared) { for (let i=0;i<12;i++) { await tick(); await shared.lockQueue; } }
(async () => {
    // Cancellation and per-item scope, including originals and thumbnails.
    const f = fixture(); await f.test.renderGallery();
    assert.equal(f.elements.get('wallpaperRecoveryList').children[0].children.length,4);
    assert.equal(await f.test.purgeItem('a'),false); assert(f.shared.records.has('a')); assert.equal(f.shared.cacheCalls,0);
    assert.match(f.confirmations[0].message,/Fixture A/); assert.match(f.confirmations[0].message,/cannot be restored/);
    assert.equal(f.confirmations[0].config.danger,true); assert.equal(f.confirmations[0].config.focusCancel,true);
    const other = await f.shared.records.get('b').blob.text(), legacy = f.shared.cache.blob;
    f.accept(true); assert.equal(await f.test.purgeItem('a'),true);
    assert(!f.shared.records.has('a')); assert.equal(await f.shared.records.get('b').blob.text(),other);
    assert(f.shared.records.has('builtin')); assert.equal(f.shared.cache.blob,legacy);
    assert.match(f.status(),/Other saved copies/); assert.equal(f.elements.get('wallpaperRecoveryList').children.length,0);
    await f.api.undo('a'); assert(!f.shared.records.has('a'));
    const reload = fixture(f.shared); assert(!(await reload.api.all(true)).some(item=>item.id==='a'));
    assert.equal(typeof f.api.purgeItem,'undefined'); assert.equal(typeof f.api.purge,'undefined');
    // Built-ins and active records can never be purged or produce a dialog.
    const builtin = fixture(); builtin.accept(true);
    assert.equal(await builtin.test.purgeItem('builtin'),false); assert.equal(await builtin.test.purgeItem('b'),false);
    assert.equal(builtin.confirmations.length,0); assert.equal(builtin.shared.deletes,0);
    builtin.shared.records.get('builtin').removedAt=20; await builtin.test.renderGallery();
    assert.equal(builtin.elements.get('wallpaperRecoveryList').children.find(row=>row.children[0].textContent==='Built-in').children.length,3);
    // Missing primitives fail closed without asking misleading confirmation.
    const unsupported=fixture(sharedState(),{noLocks:true}); unsupported.accept(true);
    assert.equal(await unsupported.test.purgeItem('a'),false); assert.equal(unsupported.confirmations.length,0); assert(unsupported.shared.records.has('a'));
    const noHelper=fixture(); delete noHelper.context.window.myntGalleryCache;
    assert.equal(await noHelper.test.purgeItem('a'),false); assert.equal(noHelper.shared.deletes,0);
    const noDialog=fixture(); delete noDialog.context.window.myntDialog;
    assert.equal(await noDialog.test.purgeItem('a'),false); assert.equal(noDialog.shared.cacheCalls,0); assert.equal(noDialog.shared.deletes,0);
    // Abort and synchronous write failure preserve the gallery's full record.
    for(const fault of ['abortDelete','throwDelete','cacheFailure']) {
        const broken=fixture(); broken.accept(true); broken.shared[fault]=true; broken.shared.cache.owner='a';
        assert.equal(await broken.test.purgeItem('a'),false,fault); assert.equal(await broken.shared.records.get('a').blob.text(),'original A');
        assert.equal(await broken.shared.records.get('a').thumb.text(),'thumbnail A'); assert.equal(broken.shared.deletes,0);
        assert.match(broken.status(),/not permanently deleted/);
    }
    // A stale confirmation cannot delete a restored or renamed item.
    for(const change of ['restore','rename','current','same-size-blob','same-size-thumb']) {
        const stale=fixture(), gate=deferred(); stale.accept(()=>gate.promise);
        const pending=stale.test.purgeItem('a'); while(!stale.confirmations.length)await tick();
        if(change==='restore')await stale.api.restore('a');
        else if(change==='rename')stale.shared.records.get('a').name='Changed in another context';
        else if(change==='current')stale.shared.settings.set('myntWallpaperCurrent','a');
        else if(change==='same-size-blob')stale.shared.records.get('a').blob=new Blob(['replaced A'],{type:'image/png'});
        else stale.shared.records.get('a').thumb=new Blob(['different A'],{type:'image/png'});
        gate.resolve(true); assert.equal(await pending,false,change); assert(stale.shared.records.has('a')); assert.equal(stale.shared.cacheCalls,0);
    }
    // Exactly one commit under repeated clicks.
    const repeated=fixture(), confirmGate=deferred(); repeated.accept(()=>confirmGate.promise);
    const first=repeated.test.purgeItem('a'); while(!repeated.confirmations.length)await tick();
    assert.equal(await repeated.test.purgeItem('a'),false); confirmGate.resolve(true); assert.equal(await first,true); assert.equal(repeated.shared.deletes,1);
    // Pending old rename/remove/undo and stale apply cannot resurrect a purge.
    const race=fixture(), renameGate=deferred(); race.accept(true); race.prompt(()=>renameGate.promise);
    const staleItem=clone(race.shared.records.get('a')), rename=race.test.renameItem(staleItem);
    assert.equal(await race.test.purgeItem('a'),true); renameGate.resolve('Stale rename'); await rename;
    await race.api.restore('a'); await race.api.remove([staleItem]);
    assert.equal(await race.test.applyItem(staleItem),false); assert(!race.shared.records.has('a')); assert.equal(race.saves.length,0);
    // Selected image saves complete under the lock before removal and purge.
    const saved=sharedState(); delete saved.records.get('a').removedAt; const saveGate=deferred(), slow=fixture(saved,{saveGate}); slow.accept(true);
    const applying=slow.test.applyItem(saved.records.get('a')); while(!slow.saves.length)await tick();
    const removing=slow.api.remove([clone(saved.records.get('a'))]); await tick(); assert(!saved.records.get('a').removedAt);
    saveGate.resolve(); assert.equal(await applying,true); await removing;
    assert(saved.records.get('a').removedAt); assert(slow.revoked.includes(slow.objectUrls[0]));
    assert.equal(await slow.test.purgeItem('a'),true); assert(!saved.records.has('a')); assert.notEqual(saved.cache.owner,'a');
    // All record mutation/selection paths use one cross-tab lock name.
    assert(saved.locks.length>0); assert(saved.locks.every(name=>name==='mynt-wallpaper-gallery-write'));
    // Random/legacy switching holds the lock for cache, state and final paint.
    const legacyRace=fixture(), legacyBlob=new Blob(['legacy'],{type:'image/png'}); await legacyRace.test.applyItem(legacyRace.shared.records.get('b'));
    await legacyRace.api.useLegacy(legacyBlob); assert.equal(legacyRace.shared.settings.has('myntWallpaperCurrent'),false);
    assert.equal(legacyRace.document.body.style.values['--bg-image'],'url(blob:legacy-fixture)'); assert.equal(legacyRace.shared.cache.owner,undefined);
    const [legacySwitch,newSelection]=await Promise.all([legacyRace.api.useLegacy(legacyBlob),legacyRace.test.applyItem(legacyRace.shared.records.get('b'))]);
    assert.equal(newSelection,true); assert.equal(legacyRace.document.body.dataset.wallpaperId,'b');
    const latestGalleryUrl=legacyRace.objectUrls.at(-1); assert.equal(legacyRace.document.body.style.values['--bg-image'],`url(${latestGalleryUrl})`); assert(!legacyRace.revoked.includes(latestGalleryUrl));
    await assert.rejects(legacyRace.api.useLegacy({size:1}),/Blob/);
    // Another tab's stale background and thumbnails release after invalidation.
    const cross=sharedState(); delete cross.records.get('a').removedAt;
    const tabA=fixture(cross),tabB=fixture(cross); tabA.accept(true);
    await tabB.test.applyItem(cross.records.get('a')); await settle(cross); await tabB.test.renderGallery();
    const staleUrls=[...tabB.objectUrls];
    await tabA.api.remove([clone(cross.records.get('a'))]); await settle(cross);
    assert.equal(await tabA.test.purgeItem('a'),true); await settle(cross);
    assert.notEqual(tabB.document.body.dataset.wallpaperId,'a');
    assert(staleUrls.every(url=>tabB.revoked.includes(url)),'Deleted image and obsolete thumbnails must be revoked in other tabs');
    assert(!(await tabB.api.all(true)).some(item=>item.id==='a'));
    // BFCache keeps live URLs/channel; restore revalidates instead of going blank.
    const cache=fixture(); await cache.test.applyItem(cache.shared.records.get('b')); const before=cache.revoked.length;
    await cache.emit('pagehide',{persisted:true}); assert.equal(cache.revoked.length,before); assert.equal(cache.shared.channels[0].closed,false);
    await cache.emit('pageshow',{persisted:true}); await settle(cache.shared); assert.equal(cache.document.body.dataset.wallpaperId,'b');
    await cache.emit('pagehide',{persisted:false}); assert.equal(cache.shared.channels[0].closed,true); assert(cache.revoked.length>before);
    // Hidden/BFCache video must not resume before a delayed lock revalidates it.
    for (const lifecycle of ['visibility','bfcache']) {
        const videoState=sharedState(); videoState.records.set('v',{id:'v',name:'Video',source:'upload',type:'video',added:3,blob:new Blob(['video'],{type:'video/mp4'})});
        const video=fixture(videoState); await video.test.applyItem(videoState.records.get('v'));
        const player=video.document.body.children.find(node=>node.id==='myntGalleryVideo'); assert.equal(player.playCount,1);
        if(lifecycle==='visibility') { video.document.hidden=true; video.document.visibilityState='hidden'; await video.emit('document:visibilitychange'); }
        else await video.emit('pagehide',{persisted:true});
        assert.equal(player.paused,true);
        const gate=deferred(); const blocking=video.test.withGalleryWrite(()=>gate.promise); await tick();
        if(lifecycle==='visibility') { video.document.hidden=false; video.document.visibilityState='visible'; await video.emit('document:visibilitychange'); }
        else await video.emit('pageshow',{persisted:true});
        assert.equal(player.playCount,1,'Playback must wait for revalidation, not restart on the event');
        videoState.records.delete('v'); videoState.settings.set('myntWallpaperCurrent','none'); gate.resolve(); await blocking; await settle(videoState);
        assert.equal(player.playCount,1,'Purged video must never resume'); assert.equal(player.paused,true); assert.notEqual(video.document.body.dataset.wallpaperId,'v');
    }
    console.log('GALLERY_PURGE_OK: per-item confirmation, cancellation, builtin/current protection, owned-cache boundary, abort rollback, stale/racing resurrection prevention, awaited writes, cross-tab URLs, reload and BFCache');
})().catch(error=>{console.error(error);process.exitCode=1;});

/* Isolated API doubles only: never runs a real browser or edits user bookmarks/media. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../scripts/local-mcp-media.js'), 'utf8');
function setup(extra = {}) {
    const window = { document: { body: { dataset: {} } }, ...extra };
    vm.runInNewContext(source, { window, URL, TextEncoder });
    return window.MyntMcpMedia;
}
const plain = x => JSON.parse(JSON.stringify(x));
(async () => {
    const absent = setup();
    assert.equal((await absent.execute('mynt_music_get', {})).error.code, 'UNAVAILABLE');
    assert.equal((await absent.execute('arbitrary_script', { script: 'bad' })).ok, false);
    assert.equal((await absent.execute('mynt_music_get', { path: '/secret' })).error.code, 'INVALID_ARGUMENT');
    assert.equal((await absent.execute('mynt_ui_features', {})).data.features.length, 9);
    let state = { sessionId: 'test', phase: 'work', isRunning: false, endAt: null, timeRemaining: 1500, totalTime: 1500, task: '', durations: { workMinutes: 25 } };
    const p = { getState: () => ({ ...state }), setTask: async task => { state.task = task; }, setDurations: async d => { state.durations = { ...state.durations, ...d }; return true; }, start: async () => { state.isRunning = true; }, pause: async () => { state.isRunning = false; }, extend: async n => { state.totalTime += n * 60; }, reset: async () => { state.task = 'reset'; } };
    p.runRemote = async (method, value, gate) => { await Promise.resolve(); gate(); return p[method](value); };
    let confirms = 0;
    const api = setup({ myntPomodoro: p, confirm: () => { confirms++; return false; } });
    const rev = async () => (await api.execute('mynt_pomodoro_get', {})).data.revision;
    assert.equal((await api.execute('mynt_pomodoro_control', { action: 'start' })).error.code, 'INVALID_ARGUMENT');
    assert.equal((await api.execute('mynt_pomodoro_control', { action: 'start', expectedRevision: 'stale' })).error.code, 'CONFLICT');
    assert.equal(state.isRunning, false);
    assert.equal((await api.execute('mynt_pomodoro_control', { action: 'start', expectedRevision: await rev() })).ok, true);
    assert.equal(state.isRunning, true);
    assert.equal((await api.execute('mynt_pomodoro_control', { action: 'reset', expectedRevision: await rev() })).error.code, 'ACTION_REQUIRED');
    assert.equal(confirms, 0); assert.equal(state.task, '');
    assert.equal((await api.execute('mynt_pomodoro_configure', { durations: { workMinutes: 121 }, expectedRevision: await rev() })).error.code, 'INVALID_ARGUMENT');
    assert.equal((await api.execute('mynt_pomodoro_configure', { task: 'Study', expectedRevision: await rev() })).ok, true);
    assert.equal(state.task, 'Study');
    const concurrent = setup({ myntPomodoro: p, confirm: () => { state.task = 'other tab'; return true; } });
    assert.equal((await concurrent.execute('mynt_pomodoro_control', { action: 'reset', expectedRevision: await rev() })).error.code, 'ACTION_REQUIRED');
    assert.equal(state.task, 'Study');
    let settings = { selectedId: 'a', order: ['a'], volume: .5, mode: 'off', shuffle: false, restPolicy: 'pause' }, pauses = 0;
    const music = { getSettings: () => settings, getTracks: () => [{ id: 'a', name: 'Song', blob: 'DO NOT EXPORT' }], applyRemoteSettings: s => { settings = s; }, pauseImmediate: () => { pauses++; }, getPlayback: () => ({ playing: false }) };
    const m = setup({ myntPomoMusic: music });
    const mr = async () => (await m.execute('mynt_music_get', {})).data.revision;
    assert.equal(JSON.stringify(await m.execute('mynt_music_get', {})).includes('DO NOT EXPORT'), false);
    assert.equal((await m.execute('mynt_music_configure', { volume: 0, expectedRevision: await mr() })).ok, true);
    assert.equal(settings.volume, 0);
    assert.equal((await m.execute('mynt_music_configure', { selectedId: 'missing', expectedRevision: await mr() })).ok, false);
    assert.equal((await m.execute('mynt_music_configure', { volume: NaN, expectedRevision: await mr() })).ok, false);
    assert.equal((await m.execute('mynt_music_control', { action: 'play', expectedRevision: await mr() }, { userGesture: true })).error.code, 'ACTION_REQUIRED');
    assert.equal((await m.execute('mynt_music_control', { action: 'pause', expectedRevision: await mr() })).ok, true); assert.equal(pauses, 1);
    let playback = { playing: false, status: 'gesture', disabled: false, current: 0, duration: 100 };
    music.getPlayback = () => ({ ...playback }); music.playRemote = async gate => { gate(); }; music.seek = n => { playback.current = n; };
    assert.equal((await m.execute('mynt_music_control', { action: 'play', expectedRevision: await mr() })).error.code, 'ACTION_REQUIRED');
    music.playRemote = async gate => { gate(); playback.playing = true; };
    assert.equal((await m.execute('mynt_music_control', { action: 'play', expectedRevision: await mr() })).ok, true);
    assert.equal((await m.execute('mynt_music_control', { action: 'seek', seconds: 50, expectedRevision: await mr() })).ok, true);
    assert.equal((await m.execute('mynt_music_control', { action: 'seek', seconds: 101, expectedRevision: await mr() })).ok, false);
    let granted = false, reads = 0, permissionRequests = 0, mutations = 0;
    const browser = { permissions: { contains: async () => granted, request: () => { permissionRequests++; } }, bookmarks: { getTree: async () => { reads++; return [{ id: '0', title: 'Root', children: [{ id: '1', parentId: '0', title: 'Site', url: 'https://example.com' }] }]; }, create: () => { mutations++; }, remove: () => { mutations++; }, update: () => { mutations++; } } };
    const b = setup({ browser });
    assert.equal((await b.execute('mynt_bookmarks_list', {})).error.code, 'ACTION_REQUIRED'); assert.equal(reads, 0); assert.equal(permissionRequests, 0);
    granted = true;
    assert.equal((await b.execute('mynt_bookmarks_list', { limit: 1 })).data.truncated, true);
    assert.equal((await b.execute('mynt_bookmarks_list', { limit: 500 })).data.items.length, 2);
    for (const url of ['javascript:alert(1)', 'file:///secret', 'https://user:password@example.com']) assert.equal((await b.execute('mynt_bookmarks_preview', { action: 'create', title: 'Bad', url })).error.code, 'INVALID_ARGUMENT');
    assert.equal((await b.execute('mynt_bookmarks_preview', { action: 'create', title: 'Site', url: 'https://example.com' })).error.code, 'ACTION_REQUIRED');
    assert.equal((await b.execute('mynt_bookmarks_preview', { action: 'remove', id: '1' })).error.code, 'ACTION_REQUIRED'); assert.equal(mutations, 0);
    browser.bookmarks.getTree = async () => { throw Error('Service unavailable'); };
    assert.equal((await b.execute('mynt_bookmarks_list', {})).error.code, 'OPERATION_FAILED');
    const chrome = { runtime: {}, permissions: { contains: (_, cb) => cb(true) }, bookmarks: { getTree: cb => cb([{ id: 'x', title: 'Chrome' }]) } };
    assert.equal((await setup({ chrome }).execute('mynt_bookmarks_list', {})).data.items[0].id, 'x');
    const wallpaper = { list: async () => [{ id: 'wall', name: 'Wallpaper', type: 'video', blob: { size: 1024, secret: 'SECRET' }, src: 'PRIVATE', thumb: 'SECRET' }], next: async () => false };
    wallpaper.runRemote = async (action, gate) => { await Promise.resolve(); gate(); return wallpaper[action](); };
    const w = setup({ myntWallpaper: wallpaper });
    const listing = await w.execute('mynt_wallpaper_list', {});
    assert.equal(JSON.stringify(listing).includes('SECRET'), false); assert.equal(JSON.stringify(listing).includes('PRIVATE'), false);
    assert.equal((await w.execute('mynt_wallpaper_control', { action: 'next', expectedRevision: listing.data.revision })).error.code, 'UNAVAILABLE');
    assert.equal((await w.execute('mynt_wallpaper_control', { action: 'remove', expectedRevision: listing.data.revision })).error.code, 'INVALID_ARGUMENT');
    const dataset = {}; let savedWallpaper = null;
    wallpaper.next = async () => { dataset.wallpaperId = 'wall'; return true; };
    const verifiedWallpaper = setup({ myntWallpaper: wallpaper, document: { body: { dataset } }, localStorage: { getItem: () => savedWallpaper } });
    assert.equal((await verifiedWallpaper.execute('mynt_wallpaper_control', { action: 'next', expectedRevision: '' })).error.code, 'OPERATION_FAILED');
    savedWallpaper = 'wall';
    assert.equal((await verifiedWallpaper.execute('mynt_wallpaper_control', { action: 'next', expectedRevision: 'wall' })).ok, true);
    assert.equal((await api.execute('mynt_pomodoro_control', { action: 'pause', expectedRevision: await rev(), requestId: 'invalid space' })).error.code, 'INVALID_ARGUMENT');
    assert.equal((await api.execute('mynt_pomodoro_control', { action: 'pause', expectedRevision: await rev(), requestId: 'valid-id-123' })).ok, true);
    music.applyRemoteSettings = () => { throw Error('Storage unavailable'); };
    const beforeVolume = settings.volume;
    assert.equal((await m.execute('mynt_music_configure', { volume: .9, expectedRevision: await mr() })).error.code, 'OPERATION_FAILED');
    assert.equal(settings.volume, beforeVolume);
    delete music.applyRemoteSettings;
    assert.equal((await m.execute('mynt_music_configure', { volume: .9, expectedRevision: await mr() })).error.code, 'ACTION_REQUIRED');
    p.setTask = async () => false;
    assert.equal((await api.execute('mynt_pomodoro_configure', { task: 'Not saved', expectedRevision: await rev() })).ok, false);
    state.safetyStatus = 'storage-unavailable';
    assert.equal((await api.execute('mynt_pomodoro_control', { action: 'pause', expectedRevision: await rev() })).error.code, 'OPERATION_FAILED');
    const revoked = () => { const error = Error('Disconnected'); error.code = 'ACCESS_REVOKED'; throw error; };
    assert.equal((await b.execute('mynt_bookmarks_list', {}, { assertAccess: revoked })).error.code, 'ACCESS_REVOKED');
    let access = true, readsAfterRevoke = 0;
    const gate = () => { if (!access) revoked(); };
    const delayedBrowser = { permissions: { contains: async () => true }, bookmarks: { getTree: async () => { access = false; return [{ id: 's', title: 'Private', url: 'https://user:secret@example.com' }]; } } };
    assert.equal((await setup({ browser: delayedBrowser }).execute('mynt_bookmarks_list', {}, { assertAccess: gate })).error.code, 'ACCESS_REVOKED');
    delayedBrowser.bookmarks.getTree = async () => [{ id: 's', title: 'Private', url: 'https://user:secret@example.com' }, { id: 'j', title: 'JS', url: 'javascript:alert(1)' }];
    const redacted = await setup({ browser: delayedBrowser }).execute('mynt_bookmarks_list', {});
    assert.equal(JSON.stringify(redacted).includes('user:secret'), false);
    assert.equal(redacted.data.items.every(n => n.url === null && n.urlRedacted), true);
    access = true;
    const revocationWallpaper = { list: async () => { access = false; return [{ id: 'wall' }]; }, next: async () => { readsAfterRevoke++; return true; } };
    revocationWallpaper.runRemote = async (_, gate) => { gate(); readsAfterRevoke++; return true; };
    const revokeAdapter = setup({ myntWallpaper: revocationWallpaper });
    const denied = await revokeAdapter.execute('mynt_wallpaper_control', { action: 'next', expectedRevision: '' }, { assertAccess: gate });
    assert.equal(denied.error.code, 'ACCESS_REVOKED'); assert.equal(readsAfterRevoke, 0); assert.equal(denied.error.operationMayHaveExecuted, false);
    access = true; state.safetyStatus = 'ready';
    p.pause = async () => { state.isRunning = false; access = false; };
    const uncertain = await api.execute('mynt_pomodoro_control', { action: 'pause', expectedRevision: await rev() }, { assertAccess: gate });
    assert.equal(uncertain.error.code, 'ACCESS_REVOKED'); assert.equal(uncertain.error.operationMayHaveExecuted, true);
    access = true; playback.playing = false;
    music.playRemote = async guard => { access = false; guard(); playback.playing = true; };
    const playbackDenied = await m.execute('mynt_music_control', { action: 'play', expectedRevision: await mr() }, { assertAccess: gate });
    assert.equal(playbackDenied.error.code, 'ACCESS_REVOKED'); assert.equal(playback.playing, false);
    delete music.playRemote;
    assert.equal((await m.execute('mynt_music_control', { action: 'play', expectedRevision: await mr() })).error.code, 'ACTION_REQUIRED');
    delete wallpaper.runRemote;
    assert.equal((await w.execute('mynt_wallpaper_control', { action: 'next', expectedRevision: '' })).error.code, 'ACTION_REQUIRED');
    const Timer = require('../scripts/pomodoro-timer-core.js');
    for (const failure of ['ACCESS_REVOKED', 'CONFLICT']) {
        let stored = null, writes = 0, release;
        const storage = { getItem: key => key === 'pomodoroState' ? stored : null, setItem: (key, value) => { writes++; if (key === 'pomodoroState') stored = value; } };
        const locks = { request: (_, fn) => new Promise((resolve, reject) => { release = () => { try { resolve(fn()); } catch (e) { reject(e); } }; }) };
        const timer = Timer.create({ storage, locks });
        const guarded = { getState: timer.getState, runRemote: (method, value, gate) => ['start', 'pause'].includes(method) ? timer[method](gate) : timer[method](value, gate) };
        const timerAdapter = setup({ myntPomodoro: guarded });
        const original = (await timerAdapter.execute('mynt_pomodoro_get', {})).data.revision;
        let allowed = true;
        const pending = timerAdapter.execute('mynt_pomodoro_control', { action: 'start', expectedRevision: original }, { assertAccess: () => { if (!allowed) revoked(); } });
        while (!release) await new Promise(resolve => setImmediate(resolve));
        if (failure === 'ACCESS_REVOKED') allowed = false;
        else stored = JSON.stringify({ ...timer.getState(), task: 'Changed in another tab' });
        release();
        const result = await pending;
        assert.equal(result.error.code, failure); assert.equal(result.error.operationMayHaveExecuted, false);
        assert.equal(timer.getState().isRunning, false); assert.equal(writes, 0);
    }
    const largeBookmarks = setup({ browser: { permissions: { contains: async()=>true }, bookmarks: { getTree: async()=>Array.from({length:500},(_,i)=>({id:String(i),title:'字'.repeat(2000),url:'https://example.com/'+ 'a'.repeat(1800)})) } } });
    const bounded = await largeBookmarks.execute('mynt_bookmarks_list',{limit:500});
    assert.equal(bounded.ok,true); assert.equal(bounded.data.truncated,true);
    assert(Buffer.byteLength(JSON.stringify(bounded))<210000);
    assert(bounded.data.items.every(item=>item.title.length<=500));
    // Actual bookmark mutation adapter with isolated browser API doubles only.
    const bookNodes = new Map([['folder', { id: 'folder', title: 'Folder' }], ['site', { id: 'site', parentId: 'folder', title: 'Old', url: 'https://example.com/' }]]);
    let bookmarkWrites = 0;
    const mutableBookmarks = { getTree: async () => [], get: async id => bookNodes.has(id) ? [{ ...bookNodes.get(id) }] : [],
        getChildren: async id => [...bookNodes.values()].filter(n => n.parentId === id).map(n => ({ ...n })),
        create: async fields => { bookmarkWrites++; const result = { ...fields, id: 'created-' + bookmarkWrites }; bookNodes.set(result.id, result); return result; },
        update: async (id, fields) => { bookmarkWrites++; const result = { ...bookNodes.get(id), ...fields }; bookNodes.set(id, result); return result; } };
    const mb = setup({ crypto: require('node:crypto').webcrypto, browser: { permissions: { contains: async () => true }, bookmarks: mutableBookmarks } });
    const siteBefore = await mb.execute('mynt_bookmarks_get', { id: 'site' });
    assert.equal(siteBefore.ok, true); assert.match(siteBefore.data.revision, /^[a-f0-9]{64}$/);
    let edit = await mb.execute('mynt_bookmarks_update', { id: 'site', title: 'New title', expectedRevision: siteBefore.data.revision });
    assert.equal(edit.ok, true); assert.equal(bookNodes.get('site').title, 'New title');
    assert.equal((await mb.execute('mynt_bookmarks_update', { id: 'site', title: 'Stale', expectedRevision: siteBefore.data.revision })).error.code, 'CONFLICT');
    assert.equal(bookmarkWrites, 1);
    const folderBefore = await mb.execute('mynt_bookmarks_get', { id: 'folder' });
    assert.equal((await mb.execute('mynt_bookmarks_create', { parentId: 'folder', title: 'Created', url: 'https://example.org/', expectedRevision: folderBefore.data.childrenRevision })).ok, true);
    assert.equal((await mb.execute('mynt_bookmarks_create', { parentId: 'folder', title: 'Stale', expectedRevision: folderBefore.data.childrenRevision })).error.code, 'CONFLICT');
    assert.equal(bookmarkWrites, 2);
    const currentSite = (await mb.execute('mynt_bookmarks_get', { id: 'site' })).data.revision;
    assert.equal((await mb.execute('mynt_bookmarks_update', { id: 'site', url: 'javascript:alert(1)', expectedRevision: currentSite })).error.code, 'INVALID_ARGUMENT');
    assert.equal((await mb.execute('mynt_bookmarks_update', { id: 'site', title: 'Denied', expectedRevision: currentSite }, { assertAccess: revoked })).error.code, 'ACCESS_REVOKED');
    assert.equal(bookmarkWrites, 2);
    const noGrant = setup({ browser: { permissions: { contains: async () => false }, bookmarks: mutableBookmarks } });
    assert.equal((await noGrant.execute('mynt_bookmarks_create', { parentId: 'folder', title: 'No grant', expectedRevision: 'no' })).error.code, 'ACTION_REQUIRED');
    assert.equal(bookmarkWrites, 2);
    const chromeMethods = Object.fromEntries(Object.entries(mutableBookmarks).map(([name, fn]) => [name, (...args) => { const callback = args.pop(); Promise.resolve(fn(...args)).then(callback); }]));
    const chromeMutations = setup({ crypto: require('node:crypto').webcrypto, chrome: { runtime: {}, permissions: { contains: (_, callback) => callback(true) }, bookmarks: chromeMethods } });
    const chromeSnapshot = await chromeMutations.execute('mynt_bookmarks_get', { id: 'site' });
    assert.equal((await chromeMutations.execute('mynt_bookmarks_update', { id: 'site', title: 'Chrome callback', expectedRevision: chromeSnapshot.data.revision })).ok, true);
    assert.equal(bookNodes.get('site').title, 'Chrome callback');
    let bookmarkAccess = true;
    const originalGet = mutableBookmarks.get;
    mutableBookmarks.get = async id => { const result = await originalGet(id); bookmarkAccess = false; return result; };
    const writesBeforeRevoke = bookmarkWrites;
    const lateDenied = await mb.execute('mynt_bookmarks_update', { id: 'site', title: 'Must not write', expectedRevision: currentSite }, { assertAccess: () => { if (!bookmarkAccess) revoked(); } });
    assert.equal(lateDenied.error.code, 'ACCESS_REVOKED'); assert.equal(bookmarkWrites, writesBeforeRevoke);
    mutableBookmarks.get = originalGet;
    // Reversible bookmark removal is a move only: no remove/removeTree capability exists in this fixture.
    const moveNodes = new Map([
        ['root', { id: 'root', title: 'Root' }], ['bar', { id: 'bar', parentId: 'root', title: 'Bookmarks bar', index: 0 }],
        ['a', { id: 'a', parentId: 'bar', title: 'A', index: 0 }], ['b', { id: 'b', parentId: 'bar', title: 'B', index: 1 }],
        ['trash', { id: 'trash', parentId: 'bar', title: 'MYNT MCP Trash', index: 2 }],
        ['site', { id: 'site', parentId: 'a', title: 'Keep ID', index: 0, url: 'https://example.com/' }],
        ['subtree', { id: 'subtree', parentId: 'a', title: 'Subtree', index: 1 }],
        ['leaf', { id: 'leaf', parentId: 'subtree', title: 'Child ID', index: 0, url: 'https://example.org/' }],
        ['managed', { id: 'managed', parentId: 'bar', title: 'Managed', index: 3, unmodifiable: 'managed' }]
    ]);
    const childrenOf = id => [...moveNodes.values()].filter(n => n.parentId === id).sort((a, b) => a.index - b.index);
    let moves = 0, moveAllowed = true, revokeInsideMove = false, corruptReadback = false;
    const moveAPI = { getTree: async () => [], get: async id => moveNodes.has(id) ? [{ ...moveNodes.get(id) }] : [], getChildren: async id => childrenOf(id).map(n => ({ ...n })),
        move: async (id, destination) => {
            moves++; const node = moveNodes.get(id), oldParent = node.parentId;
            const target = childrenOf(destination.parentId).filter(n => n.id !== id), index = destination.index ?? target.length;
            target.splice(index, 0, node); node.parentId = destination.parentId;
            childrenOf(oldParent).filter(n => n.id !== id).forEach((n, i) => { n.index = i; });
            target.forEach((n, i) => { n.index = i; });
            if (revokeInsideMove) moveAllowed = false;
            if (corruptReadback) node.parentId = oldParent;
            return { ...node };
        } };
    const moveAdapter = setup({ crypto: require('node:crypto').webcrypto, browser: { permissions: { contains: async () => true }, bookmarks: moveAPI } });
    const moveGate = () => { if (!moveAllowed) revoked(); };
    const versions = async (id, destination) => ({ expectedRevision: (await moveAdapter.execute('mynt_bookmarks_get', { id })).data.revision, targetRevision: (await moveAdapter.execute('mynt_bookmarks_get', { id: destination })).data.childrenRevision });
    let moveVersions = await versions('site', 'b');
    let movedResult = await moveAdapter.execute('mynt_bookmarks_move', { id: 'site', parentId: 'b', index: 0, ...moveVersions });
    assert.equal(movedResult.ok, true); assert.equal(moveNodes.get('site').id, 'site'); assert.equal(moveNodes.get('site').parentId, 'b');
    assert.equal((await moveAdapter.execute('mynt_bookmarks_move', { id: 'site', parentId: 'b', ...moveVersions })).error.code, 'CONFLICT');
    const beforeInvalidMoves = moves;
    for (const [id, target] of [['bar', 'a'], ['a', 'subtree'], ['a', 'a'], ['managed', 'b'], ['site', 'root'], ['site', 'managed']]) {
        const deniedMove = await moveAdapter.execute('mynt_bookmarks_move', { id, parentId: target, ...(await versions(id, target)) });
        assert.equal(deniedMove.ok, false, `${id} -> ${target} must fail`);
    }
    assert.equal(moves, beforeInvalidMoves);
    const wrongTrash = await moveAdapter.execute('mynt_bookmarks_trash', { id: 'subtree', trashFolderId: 'b', ...(await versions('subtree', 'b')) });
    assert.equal(wrongTrash.error.code, 'INVALID_ARGUMENT');
    const oldLeaf = JSON.stringify(moveNodes.get('leaf'));
    const trashed = await moveAdapter.execute('mynt_bookmarks_trash', { id: 'subtree', trashFolderId: 'trash', ...(await versions('subtree', 'trash')) });
    assert.equal(trashed.ok, true); assert.equal(moveNodes.get('subtree').parentId, 'trash'); assert.equal(JSON.stringify(moveNodes.get('leaf')), oldLeaf);
    assert.equal(trashed.data.restorationReceipt.idsPreserved, true); assert.equal(moveNodes.size, 9);
    const receipt = trashed.data.restorationReceipt;
    const restoreArgs = { id: receipt.id, trashFolderId: receipt.trashFolderId, originalParentId: receipt.originalParentId, originalIndex: receipt.originalIndex, ...(await versions(receipt.id, receipt.originalParentId)) };
    const restored = await moveAdapter.execute('mynt_bookmarks_restore', restoreArgs);
    assert.equal(restored.ok, true); assert.equal(moveNodes.get('subtree').parentId, 'a'); assert.equal(JSON.stringify(moveNodes.get('leaf')), oldLeaf);
    assert.equal((await moveAdapter.execute('mynt_bookmarks_restore', { ...restoreArgs, ...(await versions('subtree', 'a')) })).error.code, 'INVALID_ARGUMENT');
    moveAllowed = false;
    const beforeAccess = moves;
    assert.equal((await moveAdapter.execute('mynt_bookmarks_move', { id: 'site', parentId: 'a', ...(await versions('site', 'a')) }, { assertAccess: moveGate })).error.code, 'ACCESS_REVOKED');
    assert.equal(moves, beforeAccess);
    moveAllowed = true; revokeInsideMove = true;
    const completedRevocation = await moveAdapter.execute('mynt_bookmarks_move', { id: 'site', parentId: 'a', ...(await versions('site', 'a')) }, { assertAccess: moveGate });
    assert.equal(completedRevocation.error.code, 'ACCESS_REVOKED'); assert.equal(completedRevocation.error.operationMayHaveExecuted, true); assert.equal(moveNodes.get('site').parentId, 'a');
    moveAllowed = true; revokeInsideMove = false; corruptReadback = true;
    assert.equal((await moveAdapter.execute('mynt_bookmarks_move', { id: 'site', parentId: 'b', ...(await versions('site', 'b')) })).error.code, 'OPERATION_FAILED');
    corruptReadback = false;
    const parallelVersions = await versions('site', 'b'), parallelBefore = moves;
    const parallelArgs = { id: 'site', parentId: 'b', ...parallelVersions };
    const parallelResults = await Promise.all([moveAdapter.execute('mynt_bookmarks_move', parallelArgs), moveAdapter.execute('mynt_bookmarks_move', parallelArgs)]);
    assert.equal(parallelResults.filter(r => r.ok).length, 1); assert.equal(parallelResults.find(r => !r.ok).error.code, 'CONFLICT'); assert.equal(moves, parallelBefore + 1);
    assert.equal(moveNodes.has('leaf'), true); assert.equal(moveNodes.has('subtree'), true);
    assert(!source.includes("browserCall('bookmarks', 'remove'")); assert(!source.includes("browserCall('bookmarks', 'removeTree'"));
    // Exercise the real gallery remote functions against a transactional in-memory IDB fixture.
    const gallerySource = fs.readFileSync(path.join(__dirname, '../scripts/wallpaper-gallery.js'), 'utf8');
    const galleryCode = gallerySource.slice(gallerySource.indexOf('    function remoteItemMetadata('), gallerySource.indexOf('    window.myntWallpaper ='));
    const galleryRecords = new Map([['custom', { id: 'custom', name: 'Fixture', source: 'custom', type: 'image', added: 1, blob: { size: 33, fixture: 'must survive removal' } }], ['bundled', { id: 'bundled', source: 'bundled', type: 'image' }]]);
    const gallerySettings = new Map([['current', 'none'], ['mode', 'fixed']]);
    let galleryWrites = 0, galleryPauses=0, abortNext = false;
    const galleryContext = { Date, JSON, Error, Number, String, Boolean, Promise,window:{myntDashboard:{pauseBackground(){galleryPauses++;}}},
        withGalleryWrite: fn => fn(), notifyGalleryChange() {},
        localStorage: { getItem: key => gallerySettings.get(key) ?? null, setItem: (key, value) => gallerySettings.set(key, value) },
        KEY_CURRENT: 'current', KEY_MODE: 'mode', KEY_HIDDEN: 'hidden', STORE: 'items', hiddenIds: () => new Set(JSON.parse(gallerySettings.get('hidden') || '[]')), saveHidden: set => gallerySettings.set('hidden', JSON.stringify([...set])),
        document: { body: { dataset: {} } }, $: () => null, scheduleRotate() {}, renderGallery: async () => {},
        getItem: async id => galleryRecords.get(id), clearGalleryBackground: () => { delete galleryContext.document.body.dataset.wallpaperId; },
        db: async () => ({ transaction() {
            let aborted = false, pending;
            const transaction = { abort() { aborted = true; queueMicrotask(() => transaction.onabort?.()); }, objectStore: () => ({
                get(id) { const request = {}; queueMicrotask(() => { request.result = galleryRecords.get(id); request.onsuccess(); if (!aborted) queueMicrotask(() => { if (abortNext) { abortNext = false; transaction.abort(); return; } if (pending) { galleryRecords.set(pending.id, pending); galleryWrites++; } transaction.oncomplete?.(); }); }); return request; },
                put(record) { pending = record; }
            }) }; return transaction;
        } }) };
    galleryContext.applyItemUnlocked = async (item, options) => { options.beforeMutation(); gallerySettings.set('current', item.id); galleryContext.document.body.dataset.wallpaperId = item.id; return true; };
    vm.createContext(galleryContext); vm.runInContext(galleryCode, galleryContext);
    const getG = () => galleryContext.remoteGet('custom');
    let galleryState = await getG();
    await galleryContext.remoteEdit('rename', 'custom', 'Renamed', galleryState.itemRevision, () => {});
    assert.equal(galleryRecords.get('custom').name, 'Renamed'); assert.equal(galleryWrites, 1);
    await assert.rejects(galleryContext.remoteEdit('rename', 'custom', 'Stale', galleryState.itemRevision, () => {}), /changed/);
    galleryState = await getG();
    await assert.rejects(galleryContext.remoteEdit('remove', 'custom', undefined, galleryState.itemRevision, revoked), /Disconnected/);
    assert.equal(galleryWrites, 1);
    abortNext = true;
    await assert.rejects(galleryContext.remoteEdit('remove', 'custom', undefined, galleryState.itemRevision, () => {}), /transaction/);
    assert.equal(galleryRecords.get('custom').removedAt, undefined);
    await galleryContext.remoteEdit('remove', 'custom', undefined, galleryState.itemRevision, () => {});
    assert(galleryRecords.get('custom').removedAt); assert.equal(galleryRecords.get('custom').blob.fixture, 'must survive removal');
    galleryState = await getG(); assert.equal(galleryState.item.removed, true);
    await galleryContext.remoteEdit('undo', 'custom', undefined, galleryState.itemRevision, () => {});
    assert.equal(galleryRecords.get('custom').removedAt, undefined);
    galleryState = await getG();
    await galleryContext.remoteEdit('select', 'custom', undefined, galleryState.itemRevision, () => {});
    assert.equal(gallerySettings.get('current'), 'custom');
    galleryState = await getG();
    await assert.rejects(galleryContext.remoteEdit('remove', 'custom', undefined, galleryState.itemRevision, () => {}), /Cancel/);
    const cancelVersion = galleryContext.remoteCancelRevision();
    await galleryContext.remoteCancel(cancelVersion, () => {});
    assert.equal(gallerySettings.get('current'), 'none'); assert(galleryRecords.has('custom'));assert.equal(galleryPauses,1,'Cancellation pauses the decorative video through its controller');
    const bundled = await galleryContext.remoteGet('bundled');
    await galleryContext.remoteEdit('remove', 'bundled', undefined, bundled.itemRevision, () => {});
    const hiddenBundled = await galleryContext.remoteGet('bundled'); assert.equal(hiddenBundled.item.hidden, true); assert.equal(galleryRecords.get('bundled').removedAt, undefined);
    await galleryContext.remoteEdit('restore', 'bundled', undefined, hiddenBundled.itemRevision, () => {});
    assert.equal((await galleryContext.remoteGet('bundled')).item.hidden, false);
    const galleryAdapter = setup({ myntWallpaper: { list: async () => [...galleryRecords.values()], all: async () => [...galleryRecords.values()], remoteGet: galleryContext.remoteGet, remoteEdit: galleryContext.remoteEdit, remoteCancel: galleryContext.remoteCancel, remoteCancelRevision: galleryContext.remoteCancelRevision } });
    const adapterItem = await galleryAdapter.execute('mynt_wallpaper_item_get', { id: 'custom' });
    assert.equal(adapterItem.ok, true); assert(!JSON.stringify(adapterItem).includes('must survive'));
    assert.equal((await galleryAdapter.execute('mynt_wallpaper_edit', { action: 'rename', id: 'custom', name: 'Adapter name', expectedRevision: adapterItem.data.itemRevision })).ok, true);
    let purgeEffects=0;
    const purgeAdapter=setup({myntWallpaper:{list:async()=>[],remoteEdit(){purgeEffects++;}},myntDialog:{confirm(){purgeEffects++;}},confirm(){purgeEffects++;}});
    const purgeContext={assertAccess(){},operationMayHaveExecuted:false};
    const purgeResult=await purgeAdapter.execute('mynt_wallpaper_edit',{action:'purge',id:'custom',expectedRevision:'synthetic-revision'},purgeContext);
    assert.equal(purgeResult.error.code,'ACTION_REQUIRED');assert.equal(purgeEffects,0);assert.equal(purgeContext.operationMayHaveExecuted,false);
    assert.equal((await purgeAdapter.execute('mynt_wallpaper_edit',{action:'purge',id:'custom',confirmed:true,expectedRevision:'synthetic-revision'})).error.code,'INVALID_ARGUMENT');
    const listingAll = await galleryAdapter.execute('mynt_wallpaper_list', { includeRemoved: true });
    assert.equal(listingAll.ok, true); assert.equal(typeof listingAll.data.cancelRevision, 'string');
    // Reuse the existing isolated music-browser fixture, without running its separate test suite.
    const musicHarnessSource = fs.readFileSync(path.join(__dirname, 'check-pomodoro-music.cjs'), 'utf8');
    const fixtureContext = { require, console: { log() {}, error: console.error }, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask };
    vm.createContext(fixtureContext);
    vm.runInContext("const fs = require('node:fs'), vm = require('node:vm'); const file = (overrides = {}) => ({ name: 'song.mp3', type: 'audio/mpeg', size: 1024, ...overrides });\n" + musicHarnessSource.slice(musicHarnessSource.indexOf('const source = fs.readFileSync'), musicHarnessSource.indexOf('(async () => {')) + '\n;globalThis.makeMusicFixture = browserFixture; globalThis.makeMusicLibrary = sharedLibrary; globalThis.waitMusic = until; globalThis.musicFile = file;', fixtureContext);
    const musicFixture = await fixtureContext.makeMusicFixture();
    musicFixture.api.applyRemoteSettings({ ...musicFixture.api.getSettings(), order: ['b', 'a'], selectedId: 'a' });
    const retainedBefore = await musicFixture.api.remoteLibrary(), trackA = retainedBefore.find(t => t.id === 'a');
    const originalBlob = musicFixture.shared.records.get('a').blob;
    await musicFixture.api.remoteTrackEdit('remove', 'a', trackA.itemRevision, () => {});
    assert(musicFixture.shared.records.get('a').removedAt); assert.equal(musicFixture.shared.records.get('a').blob, originalBlob);
    assert.deepEqual(plain(musicFixture.api.getSettings().order), ['b', 'a']); assert.equal(musicFixture.api.getSettings().selectedId, 'b');
    assert.equal(musicFixture.api.getTracks().some(t => t.id === 'a'), false); assert.equal(musicFixture.audios.length, 0);
    const retainedAfter = await musicFixture.api.remoteLibrary(); assert.equal(retainedAfter.length, 2); assert(retainedAfter.find(t => t.id === 'a').removed);
    await assert.rejects(musicFixture.api.remoteTrackEdit('restore', 'a', trackA.itemRevision, () => {}), /changed/);
    await assert.rejects(musicFixture.api.remoteTrackEdit('restore', 'a', retainedAfter.find(t => t.id === 'a').itemRevision, revoked), /Disconnected/);
    assert(musicFixture.shared.records.get('a').removedAt);
    const reloadedMusic = await fixtureContext.makeMusicFixture({ shared: musicFixture.shared });
    await fixtureContext.waitMusic(() => reloadedMusic.buttons.some(b => b.textContent === 'Restore track'));
    assert(reloadedMusic.buttons.some(b => b.textContent === 'Restore track'), 'Retained tracks have a normal UI restore after reload');
    reloadedMusic.buttons.find(b => b.textContent === 'Restore track').emit('click');
    await fixtureContext.waitMusic(() => !reloadedMusic.shared.records.get('a').removedAt);
    assert.equal(reloadedMusic.shared.records.get('a').blob, originalBlob); assert.equal(reloadedMusic.audios.length, 0);
    assert.deepEqual(plain(reloadedMusic.api.getSettings().order), ['b', 'a']);
    const blockedMusic = await fixtureContext.makeMusicFixture({ locked: true });
    const blockedTrack = (await blockedMusic.api.remoteLibrary())[0];
    await assert.rejects(blockedMusic.api.remoteTrackEdit('remove', blockedTrack.id, blockedTrack.itemRevision, () => {}), /Pause music/);
    const noLocksMusic = await fixtureContext.makeMusicFixture({ noLocks: true });
    const noLocksTrack = (await noLocksMusic.api.remoteLibrary())[0];
    await assert.rejects(noLocksMusic.api.remoteTrackEdit('remove', noLocksTrack.id, noLocksTrack.itemRevision, () => {}), /Web Locks/);
    const brokenMusic = await fixtureContext.makeMusicFixture();
    const brokenTrack = (await brokenMusic.api.remoteLibrary())[0];
    brokenMusic.shared.records.get(brokenTrack.id).removedAt = 'malformed';
    await assert.rejects(brokenMusic.api.remoteTrackEdit('remove', brokenTrack.id, brokenTrack.itemRevision, () => {}), /Malformed/);
    assert.equal(brokenMusic.shared.records.get(brokenTrack.id).removedAt, 'malformed');
    const originalBrokenRecord = { ...brokenMusic.shared.records.get(brokenTrack.id) }; delete originalBrokenRecord.removedAt;
    for (const change of [{ removedAt: 0 }, { removedAt: Infinity }, { name: 'x'.repeat(161) }, { blob: { type: 'audio/mpeg', size: Infinity } }, { unexpected: 'field' }]) {
        brokenMusic.shared.records.set(brokenTrack.id, { ...originalBrokenRecord, ...change });
        await assert.rejects(brokenMusic.api.remoteTrackEdit('remove', brokenTrack.id, brokenTrack.itemRevision, () => {}), /Malformed/);
    }
    const tombstonePlayback = await fixtureContext.makeMusicFixture();
    tombstonePlayback.shared.records.get('a').removedAt = 1;
    await tombstonePlayback.api.playRemote(() => {});
    assert.equal(tombstonePlayback.audios.length, 0); assert.equal(tombstonePlayback.api.getTracks().some(t => t.id === 'a'), false);
    const collisionBlob = fixtureContext.musicFile();
    const collisionMusic = await fixtureContext.makeMusicFixture({ shared: fixtureContext.makeMusicLibrary([{ id: 'track-1', name: 'retained.mp3', blob: collisionBlob, removedAt: 1 }]) });
    collisionMusic.shared.nextId = 0; // Force an isolated UUID collision with the retained fixture record.
    collisionMusic.input.files = [fixtureContext.musicFile({ name: 'new.mp3', size: 4096 })]; collisionMusic.input.emit('change');
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(collisionMusic.shared.records.size, 1); assert.equal(collisionMusic.shared.records.get('track-1').blob, collisionBlob); assert.equal(collisionMusic.shared.records.get('track-1').removedAt, 1);
    const failedReadMusic = await fixtureContext.makeMusicFixture();
    const originalTransaction = failedReadMusic.shared.db.transaction;
    failedReadMusic.shared.db.transaction = () => { throw Error('Injected music read failure'); };
    await assert.rejects(failedReadMusic.api.playRemote(() => {}), /Injected/);
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(failedReadMusic.lockReleased, 1); assert.equal(failedReadMusic.audios.length, 0);
    failedReadMusic.shared.db.transaction = originalTransaction;
    await failedReadMusic.api.playRemote(() => {}); assert.equal(failedReadMusic.lockRequests, 2); failedReadMusic.api.pauseImmediate();
    const fullRecords = Array.from({ length: 30 }, (_, i) => ({ id: 'full-' + i, name: 'track.mp3', blob: fixtureContext.musicFile(), ...(i === 0 ? { removedAt: 1 } : {}) }));
    const fullMusic = await fixtureContext.makeMusicFixture({ shared: fixtureContext.makeMusicLibrary(fullRecords) });
    fullMusic.input.files = [fixtureContext.musicFile()]; fullMusic.input.emit('change');
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(fullMusic.shared.records.size, 30); assert.equal(fullMusic.shared.records.get('full-0').removedAt, 1);
    const malformedHidden = '{ broken'; gallerySettings.set('hidden', malformedHidden);
    await assert.rejects(galleryContext.remoteGet('bundled'), /Invalid stored wallpaper visibility/);
    assert.equal(gallerySettings.get('hidden'), malformedHidden); gallerySettings.set('hidden', '[]');
    for (const invalidHidden of ['{}', '[1]', '["duplicate","duplicate"]', JSON.stringify(['x'.repeat(201)])]) {
        gallerySettings.set('hidden', invalidHidden); await assert.rejects(galleryContext.remoteGet('bundled'), /Invalid stored wallpaper visibility/); assert.equal(gallerySettings.get('hidden'), invalidHidden);
    }
    gallerySettings.set('hidden', '[]');
    const recoveredAdapter = setup({ myntPomoMusic: reloadedMusic.api });
    const recoverableListing = await recoveredAdapter.execute('mynt_music_library', {});
    assert.equal(recoverableListing.ok, true); assert.equal(recoverableListing.data.quotaIncludesRemoved, true); assert(!JSON.stringify(recoverableListing).includes('audio/mpeg;base64'));
    const adapterTrack = recoverableListing.data.items.find(t => t.id === 'b');
    assert.equal((await recoveredAdapter.execute('mynt_music_edit', { action: 'remove', id: 'b', expectedRevision: adapterTrack.itemRevision })).ok, true);
    console.log('MEDIA_RECOVERY_OK: persistent music restore UI, original blob/order retention, cross-tab playback lock, stale/revoked/malformed rejection, retained quota/collision protection, play-read failure release, stale playback exclusion, bundled hide/restore and malformed preferences preservation.');
    assert.deepEqual(plain(api.tools), JSON.parse(fs.readFileSync(path.join(__dirname, '../local-mcp/media-tools.json'), 'utf8')));
    console.log('Local MCP media: isolated validation, revision, permission, guarded bookmark writes, recoverable gallery transactions and metadata tests passed. No real user data touched.');
})().catch(error => { console.error(error); process.exitCode = 1; });

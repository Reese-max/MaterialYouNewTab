/* Local MCP media adapter. Only existing page APIs; no file import, permission request or raw media export. */
(function (root) {
    'use strict';
    const object = properties => ({ type: 'object', properties, additionalProperties: false });
    const str = maxLength => ({ type: 'string', maxLength });
    const choice = values => ({ type: 'string', enum: values });
    const number = (minimum, maximum) => ({ type: 'number', minimum, maximum });
    const integer = (minimum, maximum) => ({ type: 'integer', minimum, maximum });
    const durationSchema = object({ workMinutes: integer(1, 120), shortBreakMinutes: integer(1, 60), longBreakMinutes: integer(1, 60), roundsBeforeLong: integer(1, 12) });
    const define = (name, description, inputSchema, readOnlyHint = true) => ({ name, description, inputSchema, annotations: { readOnlyHint, destructiveHint: !readOnlyHint, openWorldHint: false } });
    const tools = [
        define('mynt_pomodoro_get', 'Read the active page timer state.', object({})),
        define('mynt_pomodoro_control', 'Start, pause or extend the timer. Reset returns action-required and must be performed in the browser UI.', { ...object({ action: choice(['start', 'pause', 'extend', 'reset']), minutes: integer(1, 120) }), required: ['action'] }, false),
        define('mynt_pomodoro_configure', 'Set task label or future phase durations without resetting an active timer.', object({ task: str(200), durations: durationSchema }), false),
        define('mynt_music_get', 'Read local music names, IDs and settings only; never exports audio.', object({})),
        define('mynt_music_configure', 'Update local playlist settings; the existing API pauses playback when settings change.', object({ selectedId: str(100), volume: number(0, 1), mode: choice(['off', 'one', 'all']), shuffle: { type: 'boolean' }, restPolicy: choice(['pause', 'continue']), order: { type: 'array', maxItems: 30, uniqueItems: true, items: str(100) } }), false),
        define('mynt_music_library', 'List active and recoverably removed local-track metadata and per-track itemRevision. Retained audio still counts toward storage limits; never exports blobs.', object({})),
        define('mynt_music_edit', 'Recoverably remove or restore a local track by stable ID and itemRevision. Removal requires music paused in all tabs and Web Locks. Audio and playlist ordering are retained; restore never autoplays or restores prior selected playback.', { ...object({ action: choice(['remove', 'restore']), id: str(100) }), required: ['action', 'id'] }, false),
        define('mynt_music_control', 'Pause music; play and seek require the real browser player until a verified API is available.', { ...object({ action: choice(['pause', 'play', 'seek']), seconds: number(0, 86400) }), required: ['action'] }, false),
        define('mynt_wallpaper_list', 'List gallery metadata without blobs, source URLs, thumbnails or filesystem paths. includeRemoved lists recoverable records.', object({ includeRemoved: { type: 'boolean' } })),
        define('mynt_wallpaper_control', 'Cycle existing gallery wallpapers or open its panel. Imports and removal stay in the browser UI.', { ...object({ action: choice(['next', 'previous', 'random', 'open']) }), required: ['action'] }, false),
        define('mynt_bookmarks_list', 'Read a bounded bookmark tree only when bookmark permission is already granted. Never requests permission.', object({ limit: integer(1, 500) })),
        define('mynt_bookmarks_preview', 'Validate and preview a bookmark edit only. Apply manually through the browser bookmark editor; this tool never mutates bookmarks.', { ...object({ action: choice(['create', 'update', 'remove']), id: str(200), parentId: str(200), title: str(500), url: str(2048) }), required: ['action'] }),
        define('mynt_bookmarks_get', 'Read one stable bookmark/folder ID and fresh optimistic revision tokens. Does not request permissions.', { ...object({ id: str(200) }), required: ['id'] }),
        define('mynt_bookmarks_create', 'Create a bookmark or folder under an explicit parent with its childrenRevision. Existing permission only; browser edits are optimistic, not atomic with other editors.', { ...object({ parentId: str(200), title: str(500), url: str(2048) }), required: ['parentId', 'title'] }, false),
        define('mynt_bookmarks_update', 'Update an existing bookmark title or HTTP(S) URL using its revision. Does not delete or move bookmarks. Browser edits are optimistic, not atomic with other editors.', { ...object({ id: str(200), title: str(500), url: str(2048) }), required: ['id'] }, false),
        define('mynt_bookmarks_move', 'Move an existing bookmark/folder without changing IDs. Requires source revision and destination childrenRevision. Protected roots, managed folders and cycles are rejected; concurrency is optimistic.', { ...object({ id: str(200), parentId: str(200), index: integer(0, 1000000), targetRevision: str(64) }), required: ['id', 'parentId', 'targetRevision'] }, false),
        define('mynt_bookmarks_trash', 'Recoverably remove a bookmark/folder by moving it intact into an explicitly selected folder named MYNT MCP Trash. Create that folder separately if needed. Never permanently deletes anything; returns a restoration receipt.', { ...object({ id: str(200), trashFolderId: str(200), targetRevision: str(64) }), required: ['id', 'trashFolderId', 'targetRevision'] }, false),
        define('mynt_bookmarks_restore', 'Undo trash by moving the same stable ID from MYNT MCP Trash to the explicit original parent/index from its receipt. Without a receipt, use move with a reviewed destination. Requires fresh source and destination revisions.', { ...object({ id: str(200), trashFolderId: str(200), originalParentId: str(200), originalIndex: integer(0, 1000000), targetRevision: str(64) }), required: ['id', 'trashFolderId', 'originalParentId', 'originalIndex', 'targetRevision'] }, false),
        define('mynt_wallpaper_item_get', 'Read gallery item metadata including recoverably removed records, plus its itemRevision.', { ...object({ id: str(200) }), required: ['id'] }),
        define('mynt_wallpaper_edit', 'Select, rename, recoverably remove, restore or undo removal by stable ID. Cancel the applied wallpaper before removing it. Never deletes blobs; purge returns ACTION_REQUIRED for the browser Recovery confirmation. Bundled removal hides the packaged asset and restore unhides it.', { ...object({ action: choice(['select', 'rename', 'remove', 'restore', 'undo', 'purge']), id: str(200), name: str(60) }), required: ['action', 'id'] }, false),
        define('mynt_wallpaper_cancel', 'Stop applying the gallery wallpaper and rotation without deleting any media. Use cancelRevision from wallpaper_list.', object({}), false),
        define('mynt_ui_features', 'Inventory features that need browser UI, a gesture, or permission. Does not trigger clicks, navigation, dialogs or permissions.', object({}))
    ];
    for (const tool of tools) {
        if (tool.annotations.readOnlyHint === false) {
            tool.inputSchema.properties.expectedRevision = str(16000);
            tool.inputSchema.properties.requestId = { type: 'string', pattern: '^[a-zA-Z0-9_-]{8,128}$', minLength: 8, maxLength: 128 };
            tool.inputSchema.required = [...(tool.inputSchema.required || []), 'expectedRevision'];
        }
    }
    const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
    function invalid(message) { const error = Error(message); error.code = 'INVALID_ARGUMENT'; return error; }
    function validate(value, schema, path = 'arguments') {
        if (schema.type === 'object') {
            if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(`${path}: expected object`);
            for (const key of Object.keys(value)) {
                if (!own(schema.properties, key)) throw invalid(`${path}: unknown field ${key}`);
                validate(value[key], schema.properties[key], `${path}.${key}`);
            }
            for (const key of schema.required || []) if (!own(value, key)) throw invalid(`${path}.${key}: required`);
        } else if (schema.type === 'array') {
            if (!Array.isArray(value) || value.length > schema.maxItems || (schema.uniqueItems && new Set(value).size !== value.length)) throw invalid(`${path}: invalid list`);
            value.forEach(v => validate(v, schema.items, path));
        } else {
            if (schema.type === 'integer' ? !Number.isInteger(value) : typeof value !== schema.type) throw invalid(`${path}: invalid type`);
            if (typeof value === 'number' && (!Number.isFinite(value) || value < schema.minimum || value > schema.maximum)) throw invalid(`${path}: out of range`);
            if (typeof value === 'string' && value.length > (schema.maxLength ?? Infinity)) throw invalid(`${path}: too long`);
            if (schema.pattern && !new RegExp(schema.pattern).test(value)) throw invalid(`${path}: invalid format`);
            if (schema.enum && !schema.enum.includes(value)) throw invalid(`${path}: invalid choice`);
        }
    }
    const unavailable = feature => ({ status: 'unavailable', feature, reason: 'The feature API is not ready in this page.' });
    const actionRequired = (feature, reason) => ({ status: 'action_required', feature, reason });
    const ok = data => ({ status: 'ok', ...data });
    function musicData(api) {
        const s = api.getSettings();
        return { tracks: api.getTracks().slice(0, 30).map(t => ({ id: String(t.id).slice(0, 100), name: String(t.name).slice(0, 160) })), settings: { selectedId: s.selectedId, order: [...s.order].slice(0, 30), volume: s.volume, mode: s.mode, shuffle: s.shuffle, restPolicy: s.restPolicy } };
    }
    function browserCall(namespace, method, ...args) {
        const b = root.browser || root.chrome;
        if (typeof b?.[namespace]?.[method] !== 'function') throw Error('Browser capability is unavailable');
        if (root.browser) return Promise.resolve(b[namespace][method](...args)).catch(() => { throw Error('Browser operation failed; inspect the browser before retrying.'); });
        return new Promise((resolve, reject) => b[namespace][method](...args, result => {
            if (b.runtime?.lastError) reject(Error('Browser operation failed; inspect the browser before retrying.'));
            else resolve(result);
        }));
    }
    function bookmarkMetadata(node) {
        let url = typeof node.url === 'string' ? node.url : null, urlRedacted = false;
        if (url !== null) {
            try { const u = new URL(url); if (url.length > 2048 || !['http:', 'https:'].includes(u.protocol) || u.username || u.password) { url = null; urlRedacted = true; } }
            catch (_) { url = null; urlRedacted = true; }
        }
        return { id: String(node.id).slice(0, 200), parentId: node.parentId == null ? null : String(node.parentId).slice(0, 200), title: String(node.title || '').slice(0, 500), url, urlRedacted, index: Number.isInteger(node.index) ? node.index : null };
    }
    function bookmarkRawRevision(node) {
        return { id: node.id, parentId: node.parentId ?? null, index: node.index ?? null, title: node.title || '', url: node.url ?? null, dateAdded: node.dateAdded ?? null, dateGroupModified: node.dateGroupModified ?? null, unmodifiable: node.unmodifiable ?? null, folderType: node.folderType ?? null };
    }
    async function digest(value) {
        if (!root.crypto?.subtle) throw Error('Secure revision hashing is unavailable');
        const bytes = await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
        return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
    }
    async function bookmarkSnapshot(id, check, children = false) {
        if (!id) throw invalid('A nonempty stable bookmark ID is required');
        const found = await browserCall('bookmarks', 'get', id); check();
        const node = found?.[0]; if (!node || node.id !== id) throw invalid('Unknown bookmark ID');
        const snapshot = bookmarkRawRevision(node);
        if (children) {
            if (node.url !== undefined) throw invalid('Parent must be a bookmark folder');
            const list = await browserCall('bookmarks', 'getChildren', id); check();
            snapshot.children = list.map(bookmarkRawRevision);
        }
        const revision = await digest(snapshot); check();
        return { node, revision, childCount: snapshot.children?.length };
    }
    function bookmarkConflict(message) { const error = Error(message); error.code = 'CONFLICT'; return error; }
    async function checkBookmarkMove(source, target, check) {
        if (!source.parentId || source.unmodifiable || source.folderType) throw invalid('Protected or managed bookmark roots cannot be moved');
        const parent = (await bookmarkSnapshot(source.parentId, check)).node;
        if (!parent.parentId || parent.unmodifiable) throw invalid('Protected browser root folders cannot be moved');
        if (target.url !== undefined || !target.parentId || target.unmodifiable) throw invalid('Destination must be a writable, non-root folder');
        const seen = new Set(); let cursor = target;
        for (let depth = 0; depth < 100; depth++) {
            if (cursor.id === source.id) throw invalid('Cannot move a folder into itself or its descendants');
            if (seen.has(cursor.id)) throw invalid('Invalid bookmark ancestry');
            seen.add(cursor.id);
            if (cursor.unmodifiable) throw invalid('Managed bookmark folders cannot be changed');
            if (!cursor.parentId) return;
            cursor = (await bookmarkSnapshot(cursor.parentId, check)).node;
        }
        throw invalid('Bookmark ancestry exceeds the safe depth limit');
    }
    function validBookmarkURL(url) {
        let parsed; try { parsed = new URL(url); } catch (_) { throw invalid('Invalid bookmark URL'); }
        if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) throw invalid('Only HTTP(S) URLs without credentials are supported');
    }
    async function bookmarksAvailable(check) {
        const b = root.browser || root.chrome;
        if (!b?.permissions?.contains) return unavailable('bookmarks');
        const granted = await browserCall('permissions', 'contains', { permissions: ['bookmarks'] });
        check();
        if (!granted) return actionRequired('bookmarks', 'Grant bookmark permission yourself in the extension UI first. No permission was requested.');
        if (!b.bookmarks?.getTree) return unavailable('bookmarks');
        return null;
    }
    function revision(name, api) {
        if (name.startsWith('mynt_music_')) return JSON.stringify(musicData(api));
        if (name.startsWith('mynt_pomodoro_')) {
            const s = api.getState();
            return JSON.stringify({ sessionId: s.sessionId, phase: s.phase, isRunning: s.isRunning, endAt: s.endAt, totalTime: s.totalTime, task: s.task, durations: s.durations });
        }
        return String(root.document?.body?.dataset?.wallpaperId || '');
    }
    function guard(name, api, expected) {
        if (expected !== revision(name, api)) { const e = Error('State changed. Read the current state and review the change again.'); e.code = 'CONFLICT'; throw e; }
    }
    async function run(name, args = {}, context = {}) {
        // Only the bridge-supplied access check is trusted, never tool arguments or gesture claims.
        const check = () => context.assertAccess?.();
        const mutate = async operation => {
            check(); context.operationMayHaveExecuted = true;
            const result = await operation(); check(); return result;
        };
        check();
        const tool = tools.find(t => t.name === name);
        if (!tool) throw invalid('Unknown media tool');
        validate(args, tool.inputSchema);
        const expected = args.expectedRevision;
        args = { ...args };
        delete args.expectedRevision;
        delete args.requestId;
        if (name.startsWith('mynt_pomodoro_')) {
            const p = root.myntPomodoro;
            if (!p?.getState) return unavailable('pomodoro');
            if (name === 'mynt_pomodoro_get') return ok({ state: p.getState(), revision: revision(name, p) });
            guard(name, p, expected);
            if (name === 'mynt_pomodoro_control' && args.action === 'reset') return actionRequired('pomodoro', 'Reset discards timer progress. Use Reset in the browser and review its confirmation there. No reset was performed.');
            if (!p.runRemote) return actionRequired('pomodoro', 'Use the browser timer controls; the guarded remote timer API is unavailable.');
            let timerRevision = expected;
            const remote = async (method, value) => {
                check();
                const result = await p.runRemote(method, value, () => {
                    check(); guard(name, p, timerRevision); context.operationMayHaveExecuted = true;
                });
                check(); timerRevision = revision(name, p); return result;
            };
            if (name === 'mynt_pomodoro_configure') {
                if (!Object.keys(args).length || (args.durations && !Object.keys(args.durations).length)) throw invalid('Specify task or nonempty durations');
                if (args.durations && await remote('setDurations', args.durations) === false) throw invalid('Timer rejected durations');
                if (own(args, 'task') && await remote('setTask', args.task) === false) throw Error('Timer rejected task update');
                const applied = p.getState();
                if (own(args, 'task') && applied.task !== args.task) throw Error('Timer task was not applied');
                if (args.durations && Object.entries(args.durations).some(([k, v]) => applied.durations?.[k] !== v)) throw Error('Timer durations were not applied');
            } else {
                if (args.action !== 'extend' && own(args, 'minutes')) throw invalid('minutes is only valid for extend');
                if (args.action === 'reset') return actionRequired('pomodoro', 'Reset discards timer progress. Use Reset in the browser and review its confirmation there. No reset was performed.');
                guard(name, p, expected);
                if (await remote(args.action, args.action === 'extend' ? args.minutes ?? 5 : undefined) === false) throw Error('Timer operation was rejected');
            }
            if (p.getState().safetyStatus === 'storage-unavailable') throw Error('Timer storage is unavailable; in-memory state may have changed but was not durably saved. Read state before retrying.');
            return ok({ state: p.getState(), revision: revision(name, p) });
        }
        if (name.startsWith('mynt_music_')) {
            const m = root.myntPomoMusic;
            if (!m?.getSettings || !m?.getTracks) return unavailable('music');
            if (name === 'mynt_music_library') {
                if (!m.remoteLibrary) return unavailable('music');
                const items = await m.remoteLibrary(); check();
                return ok({ items: items.slice(0, 30), truncated: items.length > 30, quotaIncludesRemoved: true });
            }
            if (name === 'mynt_music_edit') {
                if (!args.id) throw invalid('A nonempty track ID is required');
                if (!m.remoteTrackEdit) return unavailable('music');
                const item = await m.remoteTrackEdit(args.action, args.id, expected, () => { check(); context.operationMayHaveExecuted = true; });
                check(); return ok({ item, playbackStarted: false, playlist: 'Existing order IDs are retained. Removed tracks are skipped; restore returns the same ID to its retained order. Previous selection/playback is not resumed.' });
            }
            if (name !== 'mynt_music_get') guard(name, m, expected);
            if (name === 'mynt_music_configure') {
                if (!Object.keys(args).length) throw invalid('Specify at least one setting');
                const ids = new Set(m.getTracks().map(t => t.id));
                if (own(args, 'selectedId') && !ids.has(args.selectedId)) throw invalid('Unknown track ID');
                if (args.order && args.order.some(id => !ids.has(id))) throw invalid('Unknown track ID in order');
                if (!m.applyRemoteSettings) return actionRequired('music', 'Update music settings in the browser UI; the durable remote-settings API is not available.');
                await mutate(() => { guard(name, m, expected); return m.applyRemoteSettings({ ...m.getSettings(), ...args }); });
                const after = m.getSettings();
                for (const key of Object.keys(args)) if (JSON.stringify(after[key]) !== JSON.stringify(args[key])) throw invalid(`Music setting was not applied: ${key}`);
            }
            if (name === 'mynt_music_control') {
                if (args.action !== 'seek' && own(args, 'seconds')) throw invalid('seconds is only valid for seek');
                if (args.action === 'seek' && !own(args, 'seconds')) throw invalid('seconds is required for seek');
                if (args.action === 'play') {
                    if (!m.playRemote || !m.getPlayback) return actionRequired('music', 'Press Play in the local music player. No synthetic gesture or autoplay permission was used.');
                    await mutate(() => m.playRemote(() => { check(); guard(name, m, expected); }));
                    const playback = m.getPlayback();
                    if (!playback.playing) return actionRequired('music', `Playback did not start (${playback.status || 'unavailable'}). Use the browser player; no permission was requested.`);
                } else if (args.action === 'seek') {
                    if (!m.seek || !m.getPlayback) return actionRequired('music', 'Use the local music player seek slider. The existing public API does not expose seeking.');
                    const before = m.getPlayback();
                    if (before.disabled || args.seconds > before.duration) throw invalid('Playback is not seekable at this position');
                    await mutate(() => { guard(name, m, expected); return m.seek(args.seconds); });
                    if (Math.abs(m.getPlayback().current - args.seconds) > 1) throw invalid('Seek was not applied');
                } else {
                    if (!m.pauseImmediate || !m.getPlayback) return actionRequired('music', 'Pause music in the browser player; a verifiable immediate-pause API is not available.');
                    await mutate(() => { guard(name, m, expected); return m.pauseImmediate(); });
                    if (m.getPlayback().playing) throw Error('Music did not pause; inspect the player before retrying.');
                }
            }
            return ok({ ...musicData(m), playback: m.getPlayback ? m.getPlayback() : null, revision: revision(name, m) });
        }
        if (name.startsWith('mynt_wallpaper_')) {
            const w = root.myntWallpaper;
            if (!w?.list) return unavailable('wallpaper');
            if (name === 'mynt_wallpaper_item_get') {
                if (!args.id) throw invalid('A nonempty wallpaper ID is required');
                if (!w.remoteGet) return unavailable('wallpaper');
                const data = await w.remoteGet(args.id); check(); return ok(data);
            }
            if (name === 'mynt_wallpaper_edit') {
                if (args.action === 'purge') return actionRequired('wallpaper', 'Permanently delete only from browser Gallery Recovery with the named irreversible confirmation. MCP write access cannot authorize deletion.');
                if (!args.id) throw invalid('A nonempty wallpaper ID is required');
                if (args.action === 'rename' ? !args.name?.trim() : own(args, 'name')) throw invalid('name is required only for rename');
                if (!w.remoteEdit) return unavailable('wallpaper');
                const data = await w.remoteEdit(args.action, args.id, args.name, expected, () => { check(); context.operationMayHaveExecuted = true; });
                check(); return ok(data);
            }
            if (name === 'mynt_wallpaper_cancel') {
                if (!w.remoteCancel) return unavailable('wallpaper');
                const data = await w.remoteCancel(expected, () => { check(); context.operationMayHaveExecuted = true; });
                check(); return ok(data);
            }
            if (name === 'mynt_wallpaper_control') {
                guard(name, w, expected);
                if (args.action !== 'open' && !w.runRemote) return actionRequired('wallpaper', 'Use the gallery controls in the browser. A guarded remote wallpaper selection API is not available.');
                if (args.action === 'open' && typeof w.open !== 'function') return unavailable('wallpaper');
                if (args.action !== 'open' && !(await w.list()).length) return { status: 'unavailable', feature: 'wallpaper', reason: 'Gallery is empty.' };
                guard(name, w, expected);
                check();
                if (await mutate(() => args.action === 'open' ? w.open() : w.runRemote(args.action, () => { check(); guard(name, w, expected); })) === false) return { status: 'unavailable', feature: 'wallpaper', reason: 'Wallpaper was not applied.' };
                if (args.action !== 'open') {
                    const current = root.document?.body?.dataset?.wallpaperId;
                    if (!current || root.localStorage?.getItem('myntWallpaperCurrent') !== current) throw Error('Wallpaper selection could not be verified in persistent storage. Inspect the browser before retrying.');
                }
                return ok({ action: args.action, currentId: root.document?.body?.dataset?.wallpaperId || null, revision: revision(name, w) });
            }
            const records = args.includeRemoved ? await w.all(true) : await w.list();
            check();
            const items = []; let bytes = 0;
            for (const i of records.slice(0, 500)) {
                const item = { id: String(i.id).slice(0, 200), name: String(i.name || '').slice(0, 160), type: i.type === 'video' ? 'video' : 'image', removed: Boolean(i.removedAt), source: i.source === 'bundled' ? 'bundled' : 'custom', bytes: Number.isFinite(i.blob?.size) ? i.blob.size : null };
                bytes += new TextEncoder().encode(JSON.stringify(item)).length; if (bytes > 200000) break; items.push(item);
            }
            return ok({ items, truncated: items.length < records.length, revision: revision(name, w), cancelRevision: w.remoteCancelRevision ? w.remoteCancelRevision() : null });
        }
        if (name.startsWith('mynt_bookmarks_')) {
            const blocked = await bookmarksAvailable(check);
            check();
            if (blocked) return blocked;
            if (name === 'mynt_bookmarks_get') {
                const snapshot = await bookmarkSnapshot(args.id, check);
                const childrenRevision = snapshot.node.url === undefined ? (await bookmarkSnapshot(args.id, check, true)).revision : null;
                check(); return ok({ item: bookmarkMetadata(snapshot.node), revision: snapshot.revision, childrenRevision });
            }
            if (['mynt_bookmarks_move', 'mynt_bookmarks_trash', 'mynt_bookmarks_restore'].includes(name)) {
                const trash = name === 'mynt_bookmarks_trash', restore = name === 'mynt_bookmarks_restore';
                const targetId = trash ? args.trashFolderId : restore ? args.originalParentId : args.parentId;
                let source = await bookmarkSnapshot(args.id, check), target = await bookmarkSnapshot(targetId, check, true);
                if (source.revision !== expected || target.revision !== args.targetRevision) throw bookmarkConflict('Bookmark source or destination changed; read fresh revisions');
                await checkBookmarkMove(source.node, target.node, check);
                if (trash) {
                    if (target.node.title !== 'MYNT MCP Trash') throw invalid('Choose an explicit folder named MYNT MCP Trash');
                    if (source.node.parentId === targetId) throw bookmarkConflict('Bookmark is already in that trash folder');
                    if (!Number.isInteger(source.node.index) || source.node.index < 0) throw invalid('Original position is unavailable; use an explicit move instead');
                }
                if (restore) {
                    const trashFolder = (await bookmarkSnapshot(args.trashFolderId, check)).node;
                    if (trashFolder.title !== 'MYNT MCP Trash' || trashFolder.url !== undefined || source.node.parentId !== trashFolder.id || targetId === trashFolder.id) throw invalid('Restore requires the item to be inside the specified MYNT MCP Trash folder and a different original parent');
                }
                // Re-read after ancestry checks. The browser has no cross-editor compare-and-set primitive.
                source = await bookmarkSnapshot(args.id, check); target = await bookmarkSnapshot(targetId, check, true);
                if (source.revision !== expected || target.revision !== args.targetRevision) throw bookmarkConflict('Bookmark source or destination changed during validation');
                const requestedIndex = restore ? args.originalIndex : args.index;
                const maximumIndex = target.childCount - (source.node.parentId === targetId ? 1 : 0);
                if (requestedIndex !== undefined && requestedIndex > maximumIndex) throw invalid('Destination index no longer exists; inspect the folder and choose a valid index');
                const receipt = trash ? { id: args.id, trashFolderId: targetId, originalParentId: source.node.parentId, originalIndex: source.node.index, idsPreserved: true } : null;
                check();
                const moved = await mutate(() => browserCall('bookmarks', 'move', args.id, { parentId: targetId, ...(requestedIndex !== undefined ? { index: requestedIndex } : {}) }));
                if (!moved || moved.id !== args.id) throw Error('Bookmark move result is uncertain; inspect bookmarks before retrying');
                const verified = await bookmarkSnapshot(args.id, check);
                if (verified.node.parentId !== targetId || (requestedIndex !== undefined && verified.node.index !== requestedIndex)) throw Error('Bookmark move readback differs; inspect bookmarks before retrying');
                return ok({ item: bookmarkMetadata(verified.node), revision: verified.revision, ...(receipt ? { restorationReceipt: receipt } : {}),
                    recovery: trash ? 'The item and any descendants remain intact in MYNT MCP Trash. Restore with this receipt or manually move them using the browser bookmark manager.' : 'Stable bookmark IDs are preserved. No bookmark data was deleted.',
                    concurrency: 'Optimistic revision checks; the browser API cannot atomically exclude another editor.' });
            }
            if (name === 'mynt_bookmarks_create' || name === 'mynt_bookmarks_update') {
                const create = name === 'mynt_bookmarks_create', id = create ? args.parentId : args.id;
                if (create && !args.title.trim()) throw invalid('A nonempty title is required');
                if (!create && !own(args, 'title') && !own(args, 'url')) throw invalid('Specify title or URL');
                if (own(args, 'url')) validBookmarkURL(args.url);
                const snapshot = await bookmarkSnapshot(id, check, create);
                if (snapshot.revision !== expected) { const e = Error('Bookmark changed. Read a fresh revision before editing.'); e.code = 'CONFLICT'; throw e; }
                if (!create && own(args, 'url') && snapshot.node.url === undefined) throw invalid('Cannot convert a folder into a bookmark');
                check(); // No await between the final observed revision/access check and browser mutation invocation.
                const result = await mutate(() => create
                    ? browserCall('bookmarks', 'create', { parentId: id, title: args.title, ...(own(args, 'url') ? { url: args.url } : {}) })
                    : browserCall('bookmarks', 'update', id, { ...(own(args, 'title') ? { title: args.title } : {}), ...(own(args, 'url') ? { url: args.url } : {}) }));
                check();
                if (!result?.id) throw Error('Browser mutation result is uncertain; inspect bookmarks before retrying');
                const verified = await bookmarkSnapshot(result.id, check);
                if (create && verified.node.parentId !== id) throw Error('Created bookmark parent differs; inspect bookmarks before retrying');
                if ((own(args, 'title') && verified.node.title !== args.title) || (own(args, 'url') && new URL(verified.node.url).href !== new URL(args.url).href)) throw Error('Bookmark readback differs; inspect bookmarks before retrying');
                return ok({ item: bookmarkMetadata(verified.node), revision: verified.revision, concurrency: 'Optimistic revision check; the browser API cannot atomically exclude changes from another editor.' });
            }
            if (name === 'mynt_bookmarks_preview') {
                if (args.action === 'create' && !args.title) throw invalid('title is required for create');
                if (args.action === 'update' && !own(args, 'title') && !own(args, 'url')) throw invalid('Specify a title or URL to update');
                if (args.action !== 'create' && !args.id) throw invalid('id required for update/remove');
                if (args.action === 'remove' && ['title', 'url', 'parentId'].some(k => own(args, k))) throw invalid('remove accepts only id');
                if (args.action === 'create' && own(args, 'id')) throw invalid('create cannot specify id');
                if (args.action === 'update' && own(args, 'parentId')) throw invalid('Moving bookmarks requires the browser UI');
                if (own(args, 'url')) {
                    let url; try { url = new URL(args.url); } catch (_) { throw invalid('Invalid bookmark URL'); }
                    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw invalid('Only HTTP(S) URLs without credentials are supported');
                }
                return { ...actionRequired('bookmarks', 'Preview only; review and apply this change in the browser bookmark editor. No bookmark was changed.'), preview: { ...args } };
            }
            const tree = await browserCall('bookmarks', 'getTree');
            check();
            const limit = args.limit ?? 200, items = [], stack = [...tree].reverse();
            let encodedBytes=0, sizeTruncated=false;
            while (stack.length && items.length < limit) {
                const n = stack.pop();
                let url = n.url ?? null, urlRedacted = false;
                if (url !== null) {
                    try { const parsed = new URL(url); if (url.length>2048 || !['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) { url = null; urlRedacted = true; } }
                    catch (_) { url = null; urlRedacted = true; }
                }
                const item={ id: String(n.id).slice(0,200), parentId: n.parentId == null ? null : String(n.parentId).slice(0,200), title: String(n.title || '').slice(0,500), url, urlRedacted, index: Number.isInteger(n.index) ? n.index : null };
                encodedBytes+=new TextEncoder().encode(JSON.stringify(item)).length;
                if(encodedBytes>200000){sizeTruncated=true;break;}
                items.push(item);
                if (Array.isArray(n.children)) for (let i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]);
            }
            return ok({ items, truncated: sizeTruncated || stack.length > 0 });
        }
        return ok({ features: [
            ['search', 'browser_ui', 'Search engines, suggestions, bangs, voice search and navigation require the search UI; microphone permission is never requested by MCP.'],
            ['shortcuts', 'implemented_with_limits', 'Read/create/update/recoverable trash/undo are supported through the data adapter. Icon file selection and Alt+1–9 navigation remain browser UI.'],
            ['weather', 'browser_ui', 'Location, provider keys and refresh remain in weather settings; no keys are exported.'],
            ['ai_tools_google_apps', 'partial', 'Built-in AI tool order and visibility are supported through preferences. Links and Google Apps remain in the UI; no automatic navigation.'],
            ['quotes_clock', 'implemented_with_limits', 'Bundled study quotes and clock preferences have tools. Clock hidden at startup may need ordinary UI initialization; network quote and locale reload workflows stay in the UI.'],
            ['ambient_audio', 'implemented_with_limits', 'Local ambient play/stop/volume are supported, subject to the real browser autoplay policy; no activation spoofing.'],
            ['pomodoro_float_appearance', 'partial', 'Studio appearance and scenarios have guarded tools. Opening Picture-in-Picture/windows and selecting files require browser interaction; no activation spoofing.'],
            ['local_media', 'partial', 'Gallery selection, rename, recoverable removal, restore, bundled hiding and cancel are supported. Music has recoverable remove/restore with retained order and no autoplay. Imports remain browser-only. No filesystem paths or raw media export.'],
            ['bookmarks', 'implemented_with_limits', 'Existing-permission reads, create, update, move, trash and restore use explicit IDs and optimistic revisions. Trash is an intact move into MYNT MCP Trash with manual recovery available. No permission grants or permanent deletion.']
        ].map(([feature, status, reason]) => ({ feature, status, reason })) });
    }
    let bookmarkMutationQueue = Promise.resolve();
    async function execute(name, args, context = {}) {
        const execution = { assertAccess: context.assertAccess, operationMayHaveExecuted: false };
        try {
            const operation = () => run(name, args, execution);
            const bookmarkWrite = ['mynt_bookmarks_create', 'mynt_bookmarks_update', 'mynt_bookmarks_move', 'mynt_bookmarks_trash', 'mynt_bookmarks_restore'].includes(name);
            const pending = bookmarkWrite ? bookmarkMutationQueue.catch(() => {}).then(operation) : operation();
            if (bookmarkWrite) bookmarkMutationQueue = pending.then(() => undefined, () => undefined);
            const result = await pending;
            execution.assertAccess?.();
            const { status, ...data } = result;
            if (status === 'ok') return { ok: true, data };
            return { ok: false, error: { code: status.toUpperCase(), message: data.reason || 'Operation cancelled', ...data } };
        } catch (error) {
            return { ok: false, error: { code: error.code || (error.name === 'NotAllowedError' ? 'ACTION_REQUIRED' : 'OPERATION_FAILED'), message: error.message || 'Media operation failed', operationMayHaveExecuted: execution.operationMayHaveExecuted } };
        }
    }
    root.MyntMcpMedia = Object.freeze({ tools, execute });
})(typeof window !== 'undefined' ? window : globalThis);

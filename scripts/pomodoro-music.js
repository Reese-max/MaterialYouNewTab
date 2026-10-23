/* Local-only Pomodoro audio library. No network requests; full local backups may include media within the backup size limit. */
(function (root) {
    'use strict';
    const MAX_FILE = 100 * 1024 * 1024;
    const MAX_TOTAL = 300 * 1024 * 1024;
    const MAX_TRACKS = 30;
    const SETTINGS_KEY = 'myntPomoMusicSettingsV1';
    const OWNER_KEY = 'myntPomoMusicOwnerV1';
    const DB_NAME = 'myntPomodoroMusicV1';
    const defaults = { version: 1, selectedId: '', order: [], volume: 0.5, mode: 'off', shuffle: false, restPolicy: 'pause' };
    function normalize(value) {
        const v = value && typeof value === 'object' ? value : {};
        return { version: 1, selectedId: typeof v.selectedId === 'string' ? v.selectedId.slice(0, 100) : '',
            order: Array.isArray(v.order) ? [...new Set(v.order.filter(x => typeof x === 'string' && x.length <= 100))].slice(0, MAX_TRACKS) : [],
            volume: typeof v.volume === 'number' && Number.isFinite(v.volume) ? Math.min(1, Math.max(0, v.volume)) : defaults.volume,
            mode: ['off', 'one', 'all'].includes(v.mode) ? v.mode : 'off', shuffle: v.shuffle === true,
            restPolicy: v.restPolicy === 'continue' ? 'continue' : 'pause' };
    }
    function validate(file, total, count) {
        if (!file || !Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_FILE) return 'fileSize';
        if (!/\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i.test(file.name || '') ||
            (file.type && !/^audio\/(mpeg|mp3|mp4|x-m4a|aac|ogg|opus|wav|wave|x-wav|flac|x-flac|webm)$/i.test(file.type))) return 'format';
        if (count >= MAX_TRACKS || total + file.size > MAX_TOTAL) return 'libraryFull';
        return '';
    }
    function ordered(tracks, order) {
        const positions = new Map(order.map((id, index) => [id, index]));
        return [...tracks].sort((a, b) => (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity));
    }
    function nextId(ids, current, mode, shuffle, random = Math.random) {
        if (!ids.length) return null;
        if (mode === 'one') return current;
        const i = ids.indexOf(current);
        if (shuffle) {
            // One shuffled pass is maintained by the player; this helper chooses a non-current candidate.
            const candidates = ids.filter(id => id !== current);
            return candidates.length ? candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))] : mode === 'all' ? current : null;
        }
        return i + 1 < ids.length ? ids[i + 1] : mode === 'all' ? ids[0] : null;
    }
    function errorKey(error) { return error?.issue || (error?.name === 'QuotaExceededError' ? 'quota' : 'storageError'); }
    function fadeVolume(start, elapsed, duration = 250) { return Math.max(0, start * (1 - Math.min(1, elapsed / duration))); }
    function formatTime(value) {
        const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
        const minutes = Math.floor(seconds / 60), tail = String(seconds % 60).padStart(2, '0');
        return minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${tail}` : `${minutes}:${tail}`;
    }
    function seekTarget(value, duration) {
        if (!Number.isFinite(duration) || duration <= 0 || value == null || (typeof value === 'string' && !value.trim())) return null;
        const target = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
        return Number.isFinite(target) ? Math.min(duration, Math.max(0, target)) : null;
    }
    function timeline(media, selectedId, ownsPlayback) {
        const matches = Boolean(media && media.dataset.track === selectedId);
        const duration = matches && media.readyState >= 1 && Number.isFinite(media.duration) && media.duration > 0 ? media.duration : 0;
        const current = duration ? seekTarget(media.currentTime, duration) ?? 0 : 0;
        return { duration, current, disabled: !matches || !duration || Boolean(media.error) || (!media.paused && !ownsPlayback) };
    }
    const core = { normalize, validate, ordered, nextId, errorKey, fadeVolume, formatTime, seekTarget, timeline, MAX_FILE, MAX_TOTAL, MAX_TRACKS };
    if (typeof module !== 'undefined' && module.exports) module.exports = core;
    if (!root?.document) return;
    const words = {
        title: ['My focus music', '我的專注音樂'], local: ['Audio stays on this device. Up to 30 tracks, 100 MiB each, 300 MiB total. Full backups include music when the complete backup fits the 32 MiB limit.', '音樂只儲存在本機。最多 30 首，每首 100 MiB，合計 300 MiB；完整備份未超過 32 MiB 上限時會包含音樂。'],
        import: ['Import audio', '匯入音樂'], play: ['Play', '播放'], pause: ['Pause', '暫停'], up: ['Move up', '上移'], down: ['Move down', '下移'], remove: ['Delete track', '刪除曲目'], undo: ['Undo deletion', '復原刪除'],
        volume: ['Volume', '音量'], mode: ['Repeat', '重複播放'], off: ['Off', '關閉'], one: ['One track', '單曲'], all: ['All tracks', '全部曲目'], shuffle: ['Shuffle', '隨機播放'], rest: ['During breaks', '休息時'], continue: ['Keep playing', '繼續播放'], restPause: ['Pause (resume manually)', '暫停（手動恢復）'],
        library: ['Playlist & settings', '播放清單與設定'], noTrack: ['No track selected', '尚未選擇曲目'], seek: ['Playback position', '播放進度'], select: ['Select track', '選擇曲目'],
        empty: ['Import a song to start.', '匯入歌曲即可開始。'], ready: ['Ready. Press Play to listen.', '已就緒，按播放開始聆聽。'], playing: ['Playing', '播放中'], paused: ['Paused', '已暫停'], importing: ['Importing audio…', '正在匯入音樂…'],
        fileSize: ['Each file must be nonempty and at most 100 MB.', '檔案不可為空且不得超過 100 MB。'], format: ['Choose MP3, M4A, AAC, Ogg, Opus, WAV, FLAC or WebM audio.', '請選擇 MP3、M4A、AAC、Ogg、Opus、WAV、FLAC 或 WebM 音訊。'], libraryFull: ['Library limit reached (30 tracks / 300 MB). Delete a track first.', '已達音樂庫上限（30 首／300 MB），請先刪除曲目。'], quota: ['Device storage is full. Free space or delete a track, then retry.', '本機儲存空間不足，請釋放空間或刪除曲目後重試。'], storageError: ['Local storage is unavailable. Check browser storage permissions and retry.', '無法存取本機儲存空間，請檢查瀏覽器儲存權限後重試。'], decode: ['This browser cannot play this file. Try another audio format.', '瀏覽器無法播放此檔案，請改用其他音訊格式。'], gesture: ['Playback was blocked. Press Play again to allow audio.', '播放被瀏覽器阻擋，請再次按播放。'], busy: ['Music is playing in another tab. Pause it there first.', '另一個分頁正在播放音樂，請先在該分頁暫停。'], fallback: ['Playing. Tab coordination is best-effort in this browser.', '播放中；此瀏覽器的跨分頁協調無法保證完全互斥。'], deleted: ['Track deleted. You can undo until the next deletion or reload.', '曲目已刪除；可在下一次刪除或重新載入前復原。'], confirm: ['Delete this local track?', '要刪除此本機曲目嗎？']
    };
    function t(key) {
        const lang = typeof currentLanguage !== 'undefined' ? currentLanguage : 'zh_TW';
        const name = 'pomoMusic' + key[0].toUpperCase() + key.slice(1);
        const dictionary = typeof translations !== 'undefined' ? translations : {};
        return dictionary[lang]?.[name] || dictionary.en?.[name] || words[key]?.[lang === 'zh_TW' ? 1 : 0] || key;
    }
    let settings = normalize(defaults);
    try { settings = normalize(JSON.parse(localStorage.getItem(SETTINGS_KEY))); } catch (_) { /* safe defaults */ }
    let dbPromise, tracks = [], audio, objectUrl, releaseLock, fadeTimer, generation = 0, undoRecord, mounted = false, importBusy = false;
    let played = new Set(), lastState, ui = {}, libraryRevision = 0, libraryChannel, transportFocus;
    const owner = root.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    let ownsFallback = false;
    function status(key) { if (ui.status) { ui.status.textContent = t(key); ui.status.dataset.state = key; } updateNowPlaying(); }
    function updatePlaybackVolume() {
        if (!audio || fadeTimer) return;
        const remaining = audio.duration - audio.currentTime;
        // Metadata can grow after a partial decode, and seeking/returning from the
        // background can move away from the tail. Always restore normal volume.
        audio.volume = settings.volume * (Number.isFinite(remaining) && remaining < 0.3 ? Math.max(0, remaining / 0.3) : 1);
    }
    function updateTimeline() {
        if (!ui.seek) return;
        const state = timeline(audio, settings.selectedId, Boolean(releaseLock || ownsFallback));
        ui.seek.disabled = state.disabled; ui.seek.max = String(state.duration || 1); ui.seek.value = String(state.current);
        ui.seek.setAttribute('aria-valuetext', `${formatTime(state.current)} / ${formatTime(state.duration)}`);
        ui.seek.style.setProperty('--music-progress', `${state.duration ? state.current / state.duration * 100 : 0}%`);
        ui.elapsed.textContent = formatTime(state.current); ui.duration.textContent = formatTime(state.duration);
    }
    function updateNowPlaying() {
        if (!ui.trackName) return;
        const track = tracks.find(item => item.id === settings.selectedId);
        const active = Boolean(track && audio?.dataset.track === track.id && !audio.paused);
        // Disabling the focused button can send focus to body. Only an explicit
        // transport action may hand it to its counterpart, never a background event.
        const focusRequest = transportFocus;
        const retainFocus = focusRequest && document.activeElement === focusRequest.from;
        ui.trackName.textContent = track?.name || t('noTrack'); ui.trackName.title = track?.name || '';
        ui.play.disabled = !track || active; ui.pause.disabled = !active;
        if (focusRequest && (!retainFocus || focusRequest.from.disabled)) {
            transportFocus = null;
            if (retainFocus && !focusRequest.to.disabled) focusRequest.to.focus({ preventScroll: true });
        }
        ui.play.setAttribute('aria-label', track ? `${t('play')}: ${track.name}` : t('play'));
        ui.pause.setAttribute('aria-label', track ? `${t('pause')}: ${track.name}` : t('pause'));
        ui.root.dataset.playing = String(active);
        ui.count.textContent = String(tracks.length);
        updateTimeline();
    }
    function requestTransportFocus(from, to) {
        transportFocus = document.activeElement === from ? { from, to } : null;
        return transportFocus;
    }
    function save() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { status(errorKey(e)); } }
    function database() {
        if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = () => request.result.createObjectStore('tracks', { keyPath: 'id' });
            request.onerror = () => reject(request.error);
            request.onblocked = () => { status('storageError'); reject(new Error('Database upgrade blocked')); };
            request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); dbPromise = null; }; resolve(request.result); };
        }).catch(e => { dbPromise = null; throw e; });
        return dbPromise;
    }
    async function transact(operation, value) {
        const db = await database();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('tracks', operation === 'getAll' ? 'readonly' : 'readwrite');
            const store = tx.objectStore('tracks');
            let req, result, failure;
            tx.oncomplete = () => resolve(operation === 'put' ? result : req.result);
            tx.onerror = tx.onabort = () => reject(failure || tx.error || req?.error || new Error('Storage failed'));
            if (operation === 'put') {
                // IDB serializes readwrite transactions across tabs. Validate and write
                // in the same transaction, never against a tab's cached library.
                req = store.getAll();
                req.onsuccess = () => {
                    const others = req.result.filter(track => track.id !== value.id);
                    const issue = validate(value.blob, others.reduce((sum, track) => sum + track.blob.size, 0), others.length);
                    if (issue) { failure = Object.assign(new Error(issue), { issue }); tx.abort(); return; }
                    store.put(value); result = [...others, value];
                };
            } else {
                if (operation === 'delete') store.delete(value);
                req = store.getAll();
            }
        });
    }
    function syncControls() {
        if (!ui.volume) return;
        ui.volume.value = settings.volume; ui.mode.value = settings.mode;
        ui.restPolicy.value = settings.restPolicy; ui.shuffle.checked = settings.shuffle;
        updateVolume();
        if (audio && !fadeTimer) audio.volume = settings.volume;
    }
    function updateVolume() {
        ui.volume.style.setProperty('--music-progress', `${settings.volume * 100}%`);
        ui.volume.setAttribute('aria-valuetext', `${Math.round(settings.volume * 100)}%`);
    }
    async function refreshShared() {
        const revision = ++libraryRevision;
        try {
            const latest = await transact('getAll');
            if (revision !== libraryRevision) return;
            tracks = latest;
            try { settings = normalize(JSON.parse(localStorage.getItem(SETTINGS_KEY))); } catch (_) { /* keep usable preferences */ }
            if (!tracks.some(track => track.id === settings.selectedId)) settings.selectedId = tracks[0]?.id || '';
            const removed = audio && !tracks.some(track => track.id === audio.dataset.track);
            if (removed || (audio && audio.dataset.track !== settings.selectedId)) { pause(true); unloadAudio(); }
            syncControls(); renderList();
            if (removed) status('deleted');
        } catch (e) { status(errorKey(e)); }
    }
    function publishLibraryChange() {
        libraryRevision++;
        try { libraryChannel?.postMessage('changed'); } catch (_) { /* storage/visibility listeners remain available */ }
    }
    function connectLibraryChannel() {
        if (libraryChannel || !root.BroadcastChannel) return;
        try { libraryChannel = new root.BroadcastChannel('mynt-pomodoro-music-library'); libraryChannel.onmessage = () => void refreshShared(); } catch (_) { /* optional coordination */ }
    }
    connectLibraryChannel();
    function release() {
        if (releaseLock) { releaseLock(); releaseLock = null; }
        if (ownsFallback) { try { if (localStorage.getItem(OWNER_KEY) === owner) localStorage.removeItem(OWNER_KEY); } catch (_) { /* unavailable storage */ } ownsFallback = false; }
    }
    function cancelFade() { if (fadeTimer) clearInterval(fadeTimer); fadeTimer = null; }
    function pause(immediate = false) {
        if (fadeTimer && !immediate) return;
        generation++;
        cancelFade();
        const finish = () => { audio?.pause(); if (audio) audio.volume = settings.volume; release(); status('paused'); };
        if (!audio || audio.paused || immediate) { finish(); return; }
        const start = audio.volume, began = Date.now();
        fadeTimer = setInterval(() => {
            audio.volume = fadeVolume(start, Date.now() - began);
            if (Date.now() - began >= 250) { cancelFade(); finish(); }
        }, 20);
    }
    async function claim(token) {
        if (releaseLock || ownsFallback) return true;
        if (navigator.locks?.request) return new Promise(resolve => {
            navigator.locks.request('mynt-pomodoro-music', { ifAvailable: true }, lock => {
                if (!lock || token !== generation) { resolve(false); return; }
                return new Promise(done => { releaseLock = done; resolve(true); });
            }).catch(() => resolve(false));
        });
        try {
            localStorage.setItem(OWNER_KEY, owner);
            ownsFallback = true;
            return localStorage.getItem(OWNER_KEY) === owner;
        } catch (_) { status('storageError'); return false; }
    }
    function unloadAudio() {
        const previous = audio; audio = null;
        if (previous) { previous.pause(); previous.removeAttribute('src'); previous.load(); }
        if (objectUrl) URL.revokeObjectURL(objectUrl); objectUrl = null;
        updateNowPlaying();
    }
    async function play(id = settings.selectedId, continuation = false) {
        const track = tracks.find(x => x.id === id);
        if (!track) { status('empty'); return; }
        cancelFade();
        const token = ++generation;
        if (!await claim(token)) { if (token === generation) status('busy'); return; }
        if (token !== generation) return;
        if (!audio || audio.dataset.track !== id) {
            unloadAudio();
            audio = new Audio(); audio.dataset.track = id;
            objectUrl = URL.createObjectURL(track.blob); audio.src = objectUrl;
            audio.addEventListener('ended', event => {
                // A queued end event must not cancel a manual pause or reclaim
                // playback after this tab has released its ownership.
                if (event.currentTarget === audio && !fadeTimer && (releaseLock || ownsFallback)) advance();
            });
            audio.addEventListener('error', event => { if (event.currentTarget === audio) { pause(true); status('decode'); } });
            for (const eventName of ['loadedmetadata', 'durationchange', 'seeked', 'emptied']) {
                audio.addEventListener(eventName, event => { if (event.currentTarget === audio) { updatePlaybackVolume(); updateNowPlaying(); } });
            }
            audio.addEventListener('playing', event => { if (event.currentTarget === audio) status(navigator.locks?.request ? 'playing' : 'fallback'); });
            audio.addEventListener('pause', event => { if (event.currentTarget === audio) status('paused'); });
            audio.addEventListener('timeupdate', event => {
                if (!audio || event.currentTarget !== audio) return;
                updatePlaybackVolume();
                updateTimeline();
            });
        }
        settings.selectedId = id; played.add(id); if (!continuation) played = new Set([id]); save(); renderList();
        audio.volume = settings.volume;
        try {
            await audio.play();
            if (token !== generation) return;
            status(navigator.locks?.request ? 'playing' : 'fallback');
        } catch (e) { if (token === generation) { pause(true); status(e.name === 'NotAllowedError' ? 'gesture' : 'decode'); } }
    }
    function advance() {
        const ids = ordered(tracks, settings.order).map(x => x.id);
        let next;
        if (settings.shuffle && settings.mode !== 'one') {
            let remaining = ids.filter(id => !played.has(id));
            if (!remaining.length && settings.mode === 'all') { played = new Set([settings.selectedId]); remaining = ids.filter(id => !played.has(id)); if (!remaining.length) remaining = ids; }
            next = remaining.length ? remaining[Math.floor(Math.random() * remaining.length)] : null;
        } else next = nextId(ids, settings.selectedId, settings.mode, false);
        if (next) void play(next, true); else pause(true);
    }
    async function playable(file) {
        const url = URL.createObjectURL(file);
        const probe = new Audio(); probe.preload = 'metadata';
        try { await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('decode')), 10000);
            // Some local long-form files report Infinity/NaN before their final
            // duration. Wait for a valid metadata update within the same bound.
            probe.onloadedmetadata = probe.ondurationchange = () => {
                if (probe.readyState >= 1 && Number.isFinite(probe.duration) && probe.duration > 0) { clearTimeout(timer); resolve(); }
            };
            probe.onerror = () => { clearTimeout(timer); reject(new Error('decode')); };
            probe.src = url;
        }); } finally { probe.onloadedmetadata = probe.ondurationchange = probe.onerror = null; probe.removeAttribute('src'); probe.load(); URL.revokeObjectURL(url); }
    }
    async function importFiles(files) {
        if (importBusy) return;
        importBusy = true; ui.input.disabled = true; status('importing');
        let failed = false;
        try {
            for (const file of [...files].slice(0, MAX_TRACKS + 1)) {
                const issue = validate(file, 0, 0); // Shared capacity is checked atomically with the write below.
                if (issue) { status(issue); failed = true; break; }
                try { await playable(file); } catch (_) { status('decode'); failed = true; break; }
                const record = { id: root.crypto.randomUUID(), name: file.name.slice(0, 160), blob: file };
                tracks = await transact('put', record); settings.order.push(record.id);
                if (!settings.selectedId) settings.selectedId = record.id;
                save(); publishLibraryChange(); renderList();
            }
            if (!failed) status('ready');
        } catch (e) { status(errorKey(e)); }
        finally { importBusy = false; ui.input.disabled = false; ui.input.value = ''; }
    }
    function node(tag, text, parent) { const element = document.createElement(tag); if (text) element.textContent = text; parent?.append(element); return element; }
    function button(key, parent, action) { const b = node('button', t(key), parent); b.type = 'button'; b.addEventListener('click', action); return b; }
    function renderList() {
        if (!ui.list) return;
        ui.list.replaceChildren();
        const list = ordered(tracks, settings.order);
        list.forEach((track, index) => {
            const item = node('li', '', ui.list);
            const select = button('select', item, () => { pause(true); if (audio?.dataset.track !== track.id) unloadAudio(); settings.selectedId = track.id; save(); renderList(); status('ready'); });
            select.textContent = track.name; select.title = track.name; select.className = 'mynt-music-track'; select.setAttribute('aria-pressed', String(settings.selectedId === track.id)); select.setAttribute('aria-label', `${t('select')}: ${track.name}`);
            for (const [key, delta] of [['up', -1], ['down', 1]]) {
                const b = button(key, item, () => { const ids = list.map(x => x.id); [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]]; settings.order = ids; save(); renderList(); });
                b.textContent = delta < 0 ? '↑' : '↓'; b.className = 'mynt-music-order'; b.title = t(key);
                b.disabled = index + delta < 0 || index + delta >= list.length; b.setAttribute('aria-label', `${t(key)}: ${track.name}`);
            }
            const remove = button('remove', item, async () => {
                if (importBusy || !root.confirm(`${t('confirm')}\n${track.name}`)) return;
                try {
                    tracks = await transact('delete', track.id); undoRecord = { track, index };
                    if (audio?.dataset.track === track.id) { pause(true); unloadAudio(); }
                    settings.order = settings.order.filter(id => id !== track.id);
                    if (settings.selectedId === track.id) settings.selectedId = tracks[0]?.id || '';
                    save(); publishLibraryChange(); renderList(); ui.undo.hidden = false; status('deleted');
                } catch (e) { status(errorKey(e)); }
            });
            remove.className = 'mynt-music-delete'; remove.title = t('remove'); remove.setAttribute('aria-label', `${t('remove')}: ${track.name}`);
        });
        updateNowPlaying();
    }
    async function mount() {
        const host = document.getElementById('myntPomoMusicMount');
        if (!host || mounted) return; mounted = true;
        ui.root = node('section', '', host); ui.root.className = 'mynt-pomo-music'; ui.root.setAttribute('aria-label', t('title'));
        node('div', t('title'), ui.root).className = 'mynt-music-heading';
        const now = node('div', '', ui.root); now.className = 'mynt-music-now';
        const artwork = node('span', '♪', now); artwork.className = 'mynt-music-artwork'; artwork.setAttribute('aria-hidden', 'true');
        const information = node('div', '', now); information.className = 'mynt-music-information';
        ui.trackName = node('div', '', information); ui.trackName.className = 'mynt-music-current';
        ui.status = node('p', '', information); ui.status.className = 'mynt-music-status'; ui.status.setAttribute('role', 'status'); ui.status.setAttribute('aria-live', 'polite'); ui.status.setAttribute('aria-atomic', 'true');
        const progress = node('div', '', ui.root); progress.className = 'mynt-music-progress';
        ui.seek = node('input', '', progress); Object.assign(ui.seek, { type: 'range', min: '0', max: '1', step: '0.1', value: '0', disabled: true }); ui.seek.setAttribute('aria-label', t('seek'));
        ui.seek.addEventListener('input', () => {
            const state = timeline(audio, settings.selectedId, Boolean(releaseLock || ownsFallback));
            const target = seekTarget(ui.seek.value, state.duration);
            if (state.disabled || target === null) { updateTimeline(); return; }
            try { audio.currentTime = target; if (!fadeTimer) audio.volume = settings.volume; } catch (_) { /* Metadata may have become unavailable. Never start playback to seek. */ }
            updateTimeline();
        });
        const time = node('div', '', progress); time.className = 'mynt-music-time'; time.setAttribute('aria-hidden', 'true');
        ui.elapsed = node('span', '0:00', time); ui.duration = node('span', '0:00', time);
        const controls = node('div', '', ui.root); controls.className = 'mynt-music-controls';
        ui.play = button('play', controls, () => {
            const request = requestTransportFocus(ui.play, ui.pause);
            void play().finally(() => { if (transportFocus === request) transportFocus = null; });
        }); ui.play.className = 'mynt-music-play';
        ui.pause = button('pause', controls, () => { requestTransportFocus(ui.pause, ui.play); pause(); });
        document.addEventListener('focusin', event => { if (transportFocus && event.target !== transportFocus.from) transportFocus = null; });
        const volume = node('label', '', controls); volume.className = 'mynt-music-volume';
        node('span', t('volume'), volume);
        ui.volume = node('input', '', volume); Object.assign(ui.volume, { type: 'range', min: '0', max: '1', step: '0.05', value: String(settings.volume) });
        ui.volume.setAttribute('aria-label', t('volume'));
        ui.volume.addEventListener('input', () => { settings.volume = Number(ui.volume.value); if (audio && !fadeTimer) audio.volume = settings.volume; updateVolume(); save(); });
        updateVolume();
        const details = node('details', '', ui.root); details.className = 'mynt-music-library';
        const summary = node('summary', '', details); node('span', t('library'), summary); ui.count = node('span', '0', summary); ui.count.className = 'mynt-music-count';
        const privacy = node('p', t('local'), details); privacy.className = 'mynt-music-local'; privacy.id = 'myntMusicLocalNotice';
        const label = node('label', t('import'), details); label.className = 'mynt-music-import';
        ui.input = node('input', '', label); ui.input.type = 'file'; ui.input.multiple = true; ui.input.accept = '.mp3,.m4a,.aac,.ogg,.oga,.opus,.wav,.flac,.webm'; ui.input.setAttribute('aria-describedby', privacy.id);
        ui.input.addEventListener('change', () => void importFiles(ui.input.files));
        ui.list = node('ol', '', details); ui.list.setAttribute('aria-label', t('library'));
        ui.undo = button('undo', ui.root, async () => {
            if (!undoRecord || importBusy) return;
            const { track, index } = undoRecord;
            const issue = validate(track.blob, 0, 0);
            if (issue) { status(issue); return; }
            try { tracks = await transact('put', track); settings.order = settings.order.filter(id => id !== track.id); settings.order.splice(index, 0, track.id); if (!settings.selectedId) settings.selectedId = track.id; undoRecord = null; ui.undo.hidden = true; save(); publishLibraryChange(); renderList(); status('ready'); } catch (e) { status(errorKey(e)); }
        }); ui.undo.hidden = true;
        const preferences = node('div', '', details); preferences.className = 'mynt-music-preferences';
        function select(key, field, choices) {
            const label = node('label', t(key), preferences), input = node('select', '', label);
            for (const [value, title] of choices) { const option = node('option', t(title), input); option.value = value; }
            input.value = settings[field]; input.addEventListener('change', () => { settings[field] = input.value; played = new Set([settings.selectedId]); save(); }); ui[field] = input;
        }
        select('mode', 'mode', [['off', 'off'], ['one', 'one'], ['all', 'all']]);
        select('rest', 'restPolicy', [['pause', 'restPause'], ['continue', 'continue']]);
        const shuffle = node('label', t('shuffle'), preferences); shuffle.className = 'mynt-music-shuffle'; ui.shuffle = node('input', '', shuffle); ui.shuffle.type = 'checkbox'; ui.shuffle.checked = settings.shuffle;
        ui.shuffle.addEventListener('change', () => { settings.shuffle = ui.shuffle.checked; played = new Set([settings.selectedId]); save(); });
        updateNowPlaying();
        try { tracks = await transact('getAll'); if (!tracks.some(track => track.id === settings.selectedId)) settings.selectedId = tracks[0]?.id || ''; renderList(); status(tracks.length ? 'ready' : 'empty'); } catch (e) { status(errorKey(e)); }
    }
    root.myntPomoMusic = {
        getSettings: () => normalize(settings),
        applySettings(value) { pause(true); settings = normalize(value); if (!tracks.some(track => track.id === settings.selectedId)) settings.selectedId = tracks[0]?.id || ''; save(); syncControls(); renderList(); },
        pause: () => pause(),
        // Track IDs/settings only. The full-backup module reads audio blobs separately; scenarios only use settings.
        getTracks: () => ordered(tracks, settings.order).map(({ id, name }) => ({ id, name }))
    };
    root.addEventListener('storage', event => {
        if (event.key === OWNER_KEY && ownsFallback && event.newValue !== owner) { pause(true); status('busy'); }
        if (event.key === SETTINGS_KEY || event.key === null) void refreshShared();
    });
    document.addEventListener('mynt:pomodoro-state', event => {
        const state = event.detail?.sharedstate || event.detail?.state || event.detail;
        if (!state) return;
        if ((settings.restPolicy === 'pause' && state.phase !== 'work' && lastState?.phase !== state.phase) || (lastState?.isRunning && !state.isRunning && lastState.phase === state.phase)) pause();
        lastState = state;
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void refreshShared(); });
    root.addEventListener('pagehide', () => { transportFocus = null; pause(true); unloadAudio(); libraryChannel?.close(); libraryChannel = null; });
    root.addEventListener('pageshow', event => { if (event.persisted) { connectLibraryChannel(); void refreshShared(); } });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(mount, 0), { once: true }); else setTimeout(mount, 0);
})(typeof window !== 'undefined' ? window : null);

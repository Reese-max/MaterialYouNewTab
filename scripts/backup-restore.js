/*
 * Material You NewTab
 * Copyright (c) 2023-2025 XengShi
 * Licensed under the GNU General Public License v3.0 (GPL-3.0)
 * If not, see <https://www.gnu.org/licenses/>.
 */

// Full local backups. Keep the old wallpaper field for v1/v2 compatibility.
const BACKUP_FORMAT = "material-you-newtab";
const BACKUP_VERSION = 3;
const MAX_BACKUP_FILE_SIZE = 32 * 1024 * 1024;
const SENSITIVE_LOCAL_STORAGE_KEYS = new Set(["weatherApiKey"]);
const TRANSIENT_LOCAL_STORAGE_KEYS = new Set(["myntPomoMusicOwnerV1"]);
const INDEXED_DB_KEYS = new Set(["backgroundImage", "lastUpdateTime", "imageType"]);
const MEDIA_DATABASES = {
    gallery: { name: "MYNTWallpaperGallery", store: "items", keyPath: "id", maxRecords: 1000 },
    timerImage: { name: "MyntPomodoroAppearance", store: "images", maxRecords: 1 },
    music: { name: "myntPomodoroMusicV1", store: "tracks", keyPath: "id", maxRecords: 30 }
};
const BACKUP_WORDS = {
    backupScopeText: ["Full local backup: settings, layouts, tasks, notes, wallpaper gallery, timer image and music. Limit: 32 MiB including encoded media; larger exports fail without omitting files. WeatherAPI keys, browser bookmarks/permissions and DaiDai pairing are excluded. URL-only wallpaper entries remain links, not offline copies.", "完整本機備份：設定、版面、待辦、便籤、桌布圖庫、番茄鐘圖片及音樂。含編碼媒體上限 32 MiB；超過時會停止，不會省略檔案。排除 WeatherAPI 金鑰、瀏覽器書籤／權限及呆呆配對。網址型桌布僅保存連結，非離線副本。"],
    backupWorking: ["Preparing the complete local backup…", "正在準備完整本機備份…"],
    backupReady: ["Complete backup prepared; download requested. Check that the file was saved.", "完整備份已準備好並要求下載，請確認檔案已儲存。"],
    backupTooLarge: ["The complete backup exceeds 32 MiB. Nothing was exported or changed. Keep the original media files separately; this backup format cannot export this library in full.", "完整備份超過 32 MiB，未匯出或更動任何資料。請另行保留原始媒體檔；此備份格式目前無法完整匯出這個媒體庫。"],
    backupRestorePreview: ["Restore this backup? This replaces settings, layouts, tasks, notes and the saved wallpaper. Close other MYNT tabs and pause active timers/music first. The current WeatherAPI key is kept; browser bookmarks and permissions are not changed. Restored timers stay paused and music requires manual playback. A reload follows success.", "要還原此備份嗎？將取代設定、版面、待辦、便籤及已儲存桌布。請先關閉其他 MYNT 分頁並暫停計時／音樂。目前的 WeatherAPI 金鑰會保留，不會變更瀏覽器書籤及權限。還原的計時器會保持暫停，音樂須手動播放。成功後會重新載入。"],
    backupRestoreFullMedia: ["This v3 backup also replaces the wallpaper gallery, timer image and music library, including empty libraries. Files not present in the backup will be removed from these libraries. Export your current data first if you need to keep it.", "此 v3 備份也會取代桌布圖庫、番茄鐘圖片及音樂庫，包括空的媒體庫。備份未包含的現有媒體將從這些媒體庫移除；如需保留，請先匯出目前資料。"],
    backupRestoreLegacyMedia: ["This older backup contains no complete media libraries. Existing gallery, timer image and music files will be kept; missing media cannot be recovered from this file.", "此舊版備份不含完整媒體庫。現有圖庫、番茄鐘圖片及音樂檔會保留；無法從此檔案還原未包含的媒體。"],
    backupScopeCounts: ["Setting entries: {settings}; saved wallpaper: {wallpaper}; gallery entries: {gallery}; timer images: {timerImage}; music tracks: {music}.", "設定項目：{settings}；已儲存桌布：{wallpaper}；圖庫項目：{gallery}；番茄鐘圖片：{timerImage}；音樂曲目：{music}。"],
    backupRestoreWorking: ["Restoring local data. Keep this tab open until it finishes.", "正在還原本機資料，完成前請勿關閉此分頁。"],
    backupRestoreCancelled: ["Restore cancelled. No data changed.", "已取消還原，未變更任何資料。"],
    backupRestoreRolledBack: ["Restore failed. The previous local data was restored.", "還原失敗，已恢復原有本機資料。"],
    backupRollbackFailed: ["Restore and recovery could not finish. Keep this tab open and retain your backup file. Details: ", "還原及回復未能完成。請保留此分頁及備份檔。詳細資訊："]
};

const backupButton = document.getElementById("backupBtn");
const restoreButton = document.getElementById("restoreBtn");
const backupFileInput = document.getElementById("fileInput");
const resetButton = document.getElementById("resetsettings");
let backupOperationBusy = false;
backupButton.addEventListener("click", backupData);
restoreButton.addEventListener("click", () => { if (!backupOperationBusy) backupFileInput.click(); });
backupFileInput.addEventListener("change", validateAndRestoreData);

function getTranslatedText(key) {
    const lang = typeof currentLanguage !== "undefined" ? currentLanguage : "en";
    const dictionary = typeof translations !== "undefined" ? translations : {};
    return dictionary[lang]?.[key] || dictionary.en?.[key] || BACKUP_WORDS[key]?.[lang === "zh_TW" ? 1 : 0] || key;
}

function refreshBackupScope() {
    const scope = document.getElementById("backupScopeText");
    if (scope) scope.textContent = getTranslatedText("backupScopeText");
}
function setBackupStatus(text) {
    const status = document.getElementById("backupStatus");
    if (status) status.textContent = text;
}
function setBackupBusy(value) {
    backupOperationBusy = value;
    backupButton.disabled = restoreButton.disabled = resetButton.disabled = value;
}
refreshBackupScope();
function getErrorMessage(error) { return error instanceof Error ? error.message : String(error); }
function isPlainRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
function snapshotLocalStorage({ includeSensitive = true } = {}) {
    const snapshot = Object.create(null);
    Object.keys(localStorage).forEach((key) => {
        if (includeSensitive || (!SENSITIVE_LOCAL_STORAGE_KEYS.has(key) && !TRANSIENT_LOCAL_STORAGE_KEYS.has(key))) {
            snapshot[key] = localStorage.getItem(key);
        }
    });
    return snapshot;
}
function transactionCompleted(transaction) {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction failed."));
    });
}
function requestResult(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
    });
}
function openMediaDatabase(config) {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(config.name, 1);
        let settled = false;
        request.onupgradeneeded = () => {
            const store = request.result.createObjectStore(config.store, config.keyPath ? { keyPath: config.keyPath } : undefined);
            if (config === MEDIA_DATABASES.gallery) store.createIndex("added", "added");
        };
        request.onsuccess = () => { if (settled) request.result.close(); else { settled = true; resolve(request.result); } };
        request.onerror = request.onblocked = () => { settled = true; reject(request.error || new Error("Media database is blocked. Close other MYNT tabs and retry.")); };
    });
}
async function readDatabaseEntries(open, store) {
    const db = await open();
    try {
        const transaction = db.transaction(store, "readonly");
        const completion = transactionCompleted(transaction);
        // Observe both errors immediately, including an aborted transaction.
        const result = await Promise.all([
            requestResult(transaction.objectStore(store).getAllKeys()),
            requestResult(transaction.objectStore(store).getAll()), completion
        ]);
        return result[0].map((key, index) => [key, result[1][index]]);
    } finally { db.close(); }
}
function readIndexedDBEntries() { return readDatabaseEntries(openDatabase, storeName); }
function readMediaEntries(key) {
    const config = MEDIA_DATABASES[key];
    return readDatabaseEntries(() => openMediaDatabase(config), config.store);
}
function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error("Unable to read local media."));
        reader.readAsDataURL(blob);
    });
}
async function encodeBackupValue(value, budget) {
    if (value instanceof Blob) {
        // Check the base64 expansion before allocating it. Never make a partial export.
        budget.bytes += 4 * Math.ceil(value.size / 3) + value.type.length + 64;
        if (budget.bytes > MAX_BACKUP_FILE_SIZE) throw new Error(getTranslatedText("backupTooLarge"));
        return { blob: await blobToDataUrl(value), isBlob: true };
    }
    if (Array.isArray(value)) return Promise.all(value.map(item => encodeBackupValue(item, budget)));
    if (isPlainRecord(value)) {
        const output = Object.create(null);
        for (const [key, item] of Object.entries(value)) output[key] = await encodeBackupValue(item, budget);
        return output;
    }
    return value;
}
async function backupIndexedDB(budget = { bytes: 0 }) {
    const data = Object.create(null);
    for (const [key, value] of await readIndexedDBEntries()) {
        if (INDEXED_DB_KEYS.has(String(key))) data[key] = await encodeBackupValue(value, budget);
    }
    return data;
}
async function createBackup() {
    const budget = { bytes: 0 };
    const backup = {
        format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: new Date().toISOString(),
        excludedLocalStorageKeys: [...SENSITIVE_LOCAL_STORAGE_KEYS, ...TRANSIENT_LOCAL_STORAGE_KEYS],
        localStorage: snapshotLocalStorage({ includeSensitive: false }),
        indexedDB: await backupIndexedDB(budget), media: { version: 1 }
    };
    for (const key of Object.keys(MEDIA_DATABASES)) backup.media[key] = await encodeBackupValue(await readMediaEntries(key), budget);
    const serialized = JSON.stringify(backup);
    if (new Blob([serialized]).size > MAX_BACKUP_FILE_SIZE) throw new Error(getTranslatedText("backupTooLarge"));
    if (!isValidBackupFile(backup)) throw new Error("The stored data cannot be represented safely in this backup format. Nothing was exported.");
    return { backup, serialized };
}
async function backupData() {
    if (backupOperationBusy) return;
    let objectUrl;
    setBackupBusy(true);
    setBackupStatus(getTranslatedText("backupWorking"));
    try {
        const { serialized } = await createBackup();
        const date = new Date();
        const formattedDate = `${String(date.getDate()).padStart(2, "0")}${String(date.getMonth() + 1).padStart(2, "0")}${date.getFullYear()}`;
        const link = document.createElement("a");
        objectUrl = URL.createObjectURL(new Blob([serialized], { type: "application/json" }));
        link.href = objectUrl; link.download = `MYNT_Backup_${formattedDate}.json`;
        document.body.appendChild(link); link.click(); link.remove();
        setBackupStatus(getTranslatedText("backupReady"));
    } catch (error) {
        const message = getTranslatedText("failedbackup") + getErrorMessage(error);
        setBackupStatus(message); await alertPrompt(message);
    } finally {
        // Let the browser start consuming the download before releasing its URL.
        if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        setBackupBusy(false);
    }
}

function blobDescriptorInfo(value) {
    if (!isPlainRecord(value) || value.isBlob !== true || typeof value.blob !== "string" || value.blob.length > MAX_BACKUP_FILE_SIZE ||
        Object.keys(value).some(key => key !== "blob" && key !== "isBlob")) return null;
    const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+)?;base64,([A-Za-z0-9+/]*={0,2})$/iu.exec(value.blob);
    if (!match || match[2].length % 4 !== 0) return null;
    const bytes = match[2].length / 4 * 3 - (match[2].endsWith("==") ? 2 : match[2].endsWith("=") ? 1 : 0);
    return { type: (match[1] || "application/octet-stream").toLowerCase(), bytes };
}
function isValidBlobDescriptor(value, kind) {
    const info = blobDescriptorInfo(value);
    return !!info && info.bytes > 0 && (!kind || new RegExp(`^${kind}/`, "u").test(info.type));
}
function isValidIndexedDBValue(key, value) {
    if (key === "backgroundImage") return isValidBlobDescriptor(value) && /^(image\/|application\/octet-stream$)/u.test(blobDescriptorInfo(value).type);
    if (key === "lastUpdateTime") return typeof value === "string" && !Number.isNaN(Date.parse(value));
    if (key === "imageType") return value === "random" || value === "upload";
    return false;
}
function safeMediaUrl(value, source) {
    if (typeof value !== "string" || value.length > 8192) return false;
    if (source === "bundled") return value === "./videos/bg.mp4?v=2";
    try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password; } catch (_) { return false; }
}
function validMediaRecord(kind, key, value) {
    if (typeof key !== "string" || !key || key.length > 512) return false;
    if (kind === "timerImage") return key === "background" && isValidBlobDescriptor(value, "image") &&
        ["image/png", "image/jpeg", "image/webp"].includes(blobDescriptorInfo(value).type) && blobDescriptorInfo(value).bytes <= 8 * 1024 * 1024;
    if (!isPlainRecord(value) || value.id !== key || typeof value.name !== "string") return false;
    if (kind === "music") return key.length <= 100 && value.name.length <= 160 &&
        Object.keys(value).every(field => ["id", "name", "blob"].includes(field)) && isValidBlobDescriptor(value.blob) &&
        (/^audio\/(mpeg|mp3|mp4|x-m4a|aac|ogg|opus|wav|wave|x-wav|flac|x-flac|webm)$/u.test(blobDescriptorInfo(value.blob).type) ||
            (blobDescriptorInfo(value.blob).type === "application/octet-stream" && /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/iu.test(value.name)));
    if (value.name.length > 8192 || !["image", "video"].includes(value.type) || !["upload", "url", "bundled", "custom"].includes(value.source) ||
        !Number.isFinite(value.added) || value.added < 0 || Object.keys(value).some(field => !["id", "name", "type", "source", "added", "blob", "thumb", "src", "removedAt"].includes(field))) return false;
    if (value.removedAt !== undefined && (!Number.isFinite(value.removedAt) || value.removedAt <= 0)) return false;
    if (value.thumb != null && !isValidBlobDescriptor(value.thumb, "image")) return false;
    if (value.src !== undefined && !safeMediaUrl(value.src, value.source)) return false;
    return value.blob !== undefined ? (isValidBlobDescriptor(value.blob, value.type) || (value.type === "video" && /\.(mp4|webm)$/iu.test(value.name) && isValidBlobDescriptor(value.blob) && blobDescriptorInfo(value.blob).type === "application/octet-stream")) : safeMediaUrl(value.src, value.source);
}
function isValidMedia(media) {
    if (!isPlainRecord(media) || media.version !== 1 || Object.keys(media).length !== 4) return false;
    return Object.entries(MEDIA_DATABASES).every(([kind, config]) => {
        const entries = media[kind];
        return Array.isArray(entries) && entries.length <= config.maxRecords && new Set(entries.map(entry => Array.isArray(entry) ? entry[0] : null)).size === entries.length &&
            entries.every(entry => Array.isArray(entry) && entry.length === 2 && validMediaRecord(kind, entry[0], entry[1]));
    });
}
function isValidBackupFile(backup) {
    if (!isPlainRecord(backup) || !isPlainRecord(backup.localStorage) || !isPlainRecord(backup.indexedDB)) return false;
    if ("format" in backup && backup.format !== BACKUP_FORMAT) return false;
    if ("version" in backup && (!Number.isInteger(backup.version) || backup.version < 1 || backup.version > BACKUP_VERSION)) return false;
    if (backup.version === 3 && (backup.format !== BACKUP_FORMAT || !isValidMedia(backup.media))) return false;
    if (backup.version !== 3 && "media" in backup) return false;
    if ("createdAt" in backup && (typeof backup.createdAt !== "string" || Number.isNaN(Date.parse(backup.createdAt)))) return false;
    const settings = Object.entries(backup.localStorage);
    if (settings.length > 1000 || settings.some(([key, value]) => key.length > 512 || typeof value !== "string")) return false;
    const wallpaper = Object.entries(backup.indexedDB);
    if (wallpaper.length > INDEXED_DB_KEYS.size || !wallpaper.every(([key, value]) => INDEXED_DB_KEYS.has(key) && isValidIndexedDBValue(key, value))) return false;
    try { return new Blob([JSON.stringify(backup)]).size <= MAX_BACKUP_FILE_SIZE; } catch (_) { return false; }
}
function base64ToBlob(base64) {
    const info = blobDescriptorInfo({ isBlob: true, blob: base64 });
    if (!info) throw new Error("Invalid media data in backup.");
    const binary = atob(base64.slice(base64.indexOf(",") + 1));
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
    return new Blob([array], { type: info.type });
}
function decodeBackupValue(value) {
    if (value?.isBlob === true) return base64ToBlob(value.blob);
    if (Array.isArray(value)) return value.map(decodeBackupValue);
    if (isPlainRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeBackupValue(item)]));
    return value;
}
function restoredSettingValue(key, value, createdAt) {
    if (key !== "pomodoroState") return value;
    try {
        const state = JSON.parse(value);
        if (!isPlainRecord(state) || state.isRunning !== true) return value;
        const capturedAt = Date.parse(createdAt);
        const endAt = state.version === 2 ? state.endAt : state.lastTick + state.timeRemaining * 1000;
        if (Number.isFinite(capturedAt) && Number.isFinite(endAt) && Number.isFinite(state.totalTime) && state.totalTime > 0) {
            state.timeRemaining = Math.min(state.totalTime, Math.max(0, Math.ceil((endAt - capturedAt) / 1000)));
        }
        state.isRunning = false;
        state.endAt = null;
        return JSON.stringify(state);
    } catch (_) { return value; } // The timer's own normalizer handles corrupt old settings.
}
function prepareBackupForRestore(backup) {
    if (!isValidBackupFile(backup)) throw new Error("Invalid backup structure, media or size.");
    return {
        localStorageEntries: Object.entries(backup.localStorage).filter(([key]) => !SENSITIVE_LOCAL_STORAGE_KEYS.has(key) && !TRANSIENT_LOCAL_STORAGE_KEYS.has(key)).map(([key, value]) => [key, restoredSettingValue(key, value, backup.createdAt)]),
        indexedDBEntries: decodeBackupValue(Object.entries(backup.indexedDB)),
        media: backup.version === 3 ? Object.fromEntries(Object.keys(MEDIA_DATABASES).map(key => [key, decodeBackupValue(backup.media[key])])) : null
    };
}
function replaceLocalStorage(entries) {
    const next = new Map(entries);
    // Do not clear the storage area: preserve unchanged values and minimize writes.
    Object.keys(localStorage).forEach(key => { if (!next.has(key)) localStorage.removeItem(key); });
    entries.forEach(([key, value]) => { if (localStorage.getItem(key) !== value) localStorage.setItem(key, value); });
}
async function replaceDatabaseEntries(open, storeName, entries, keyPath) {
    const db = await open();
    try {
        const transaction = db.transaction(storeName, "readwrite");
        const completion = transactionCompleted(transaction);
        try {
            const store = transaction.objectStore(storeName);
            store.clear();
            entries.forEach(([key, value]) => keyPath ? store.put(value) : store.put(value, key));
        } catch (error) {
            // A synchronous DataCloneError must not commit an earlier clear().
            try { transaction.abort(); } catch (_) { /* already finished */ }
            await completion.catch(() => {});
            throw error;
        }
        await completion;
    } finally { db.close(); }
}
function replaceIndexedDB(entries) { return replaceDatabaseEntries(openDatabase, storeName, entries); }
function replaceMediaEntries(key, entries) {
    const config = MEDIA_DATABASES[key];
    return replaceDatabaseEntries(() => openMediaDatabase(config), config.store, entries, config.keyPath);
}

// Separate IndexedDB databases cannot share an atomic transaction. Snapshot all
// stores before writing, use atomic per-store transactions, and undo every
// committed store after an ordinary failure. Closing the tab mid-restore is unsafe.
async function restoreData(backup) {
    const prepared = prepareBackupForRestore(backup);
    const previousLocalStorage = Object.entries(snapshotLocalStorage());
    const previousIndexedDB = await readIndexedDBEntries();
    const previousMedia = Object.create(null);
    if (prepared.media) for (const key of Object.keys(MEDIA_DATABASES)) previousMedia[key] = await readMediaEntries(key);
    const preservedEntries = previousLocalStorage.filter(([key]) => SENSITIVE_LOCAL_STORAGE_KEYS.has(key) || TRANSIENT_LOCAL_STORAGE_KEYS.has(key));
    const unownedWallpaper = previousIndexedDB.filter(([key]) => !INDEXED_DB_KEYS.has(key));
    let wallpaperWritten = false;
    const mediaWritten = [];
    try {
        replaceLocalStorage([...prepared.localStorageEntries, ...preservedEntries]);
        await replaceIndexedDB([...prepared.indexedDBEntries, ...unownedWallpaper]);
        wallpaperWritten = true;
        if (prepared.media) for (const key of Object.keys(MEDIA_DATABASES)) {
            await replaceMediaEntries(key, prepared.media[key]);
            mediaWritten.push(key);
        }
    } catch (restoreError) {
        const rollbackErrors = [];
        // Independent recovery attempts: one failed store must not skip the others.
        try { replaceLocalStorage(previousLocalStorage); } catch (error) { rollbackErrors.push(error); }
        if (wallpaperWritten) {
            try { await replaceIndexedDB(previousIndexedDB); } catch (error) { rollbackErrors.push(error); }
        }
        for (const key of mediaWritten.reverse()) {
            try { await replaceMediaEntries(key, previousMedia[key]); } catch (error) { rollbackErrors.push(error); }
        }
        if (rollbackErrors.length) throw new Error(getTranslatedText("backupRollbackFailed") + [restoreError, ...rollbackErrors].map(getErrorMessage).join("; "));
        throw new Error(getTranslatedText("backupRestoreRolledBack") + " " + getErrorMessage(restoreError));
    }
}
function backupScopePreview(backup) {
    const counts = { settings: Object.keys(backup.localStorage).filter(key => !SENSITIVE_LOCAL_STORAGE_KEYS.has(key) && !TRANSIENT_LOCAL_STORAGE_KEYS.has(key)).length,
        wallpaper: backup.indexedDB.backgroundImage ? 1 : 0, gallery: backup.media?.gallery.length ?? "—", timerImage: backup.media?.timerImage.length ?? "—", music: backup.media?.music.length ?? "—" };
    return [getTranslatedText("backupRestorePreview"), getTranslatedText(backup.version === 3 ? "backupRestoreFullMedia" : "backupRestoreLegacyMedia"),
        getTranslatedText("backupScopeCounts").replace(/\{(\w+)\}/gu, (_, key) => String(counts[key]))].join("\n\n");
}
async function validateAndRestoreData(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file || backupOperationBusy) return;
    setBackupBusy(true);
    try {
        if (file.size > MAX_BACKUP_FILE_SIZE) throw new Error(getTranslatedText("backupTooLarge"));
        const backup = JSON.parse(await file.text());
        // Decode everything before confirmation and before the first storage write.
        prepareBackupForRestore(backup);
        if (!(await confirmPrompt(backupScopePreview(backup)))) { setBackupStatus(getTranslatedText("backupRestoreCancelled")); return; }
        setBackupStatus(getTranslatedText("backupRestoreWorking"));
        await restoreData(backup);
        setBackupStatus(getTranslatedText("restorecompleted"));
        await alertPrompt(getTranslatedText("restorecompleted"));
        location.reload();
    } catch (error) {
        const message = getTranslatedText("restorefailed") + getErrorMessage(error);
        setBackupStatus(message); await alertPrompt(message);
    } finally { setBackupBusy(false); input.value = ""; }
}

// Existing reset remains distinct from full restore: timer/gallery media is kept.
resetButton.addEventListener("click", async () => {
    if (backupOperationBusy || !(await confirmPrompt(getTranslatedText("confirmRestore") + "\n\n" + getTranslatedText("resetKeepsPomodoroMedia")))) return;
    setBackupBusy(true);
    try {
        await globalThis.myntDaidaiDisconnect?.({ removePermission: true });
        await replaceIndexedDB([]);
        localStorage.clear();
        location.reload();
    } catch (error) {
        setBackupBusy(false);
        await alertPrompt(getTranslatedText("restorefailed") + getErrorMessage(error));
    }
});

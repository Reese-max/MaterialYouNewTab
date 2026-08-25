/*
 * Material You NewTab
 * Copyright (c) 2023-2025 XengShi
 * Licensed under the GNU General Public License v3.0 (GPL-3.0)
 * You should have received a copy of the GNU General Public License along with this program.
 * If not, see <https://www.gnu.org/licenses/>.
 */

// -------------------- Backup-Restore Settings ----------------------
const BACKUP_FORMAT = "material-you-newtab";
const BACKUP_VERSION = 2;
const MAX_BACKUP_FILE_SIZE = 32 * 1024 * 1024;
const SENSITIVE_LOCAL_STORAGE_KEYS = new Set(["weatherApiKey"]);
const INDEXED_DB_KEYS = new Set(["backgroundImage", "lastUpdateTime", "imageType"]);

const backupButton = document.getElementById("backupBtn");
const restoreButton = document.getElementById("restoreBtn");
const backupFileInput = document.getElementById("fileInput");

backupButton.addEventListener("click", backupData);
restoreButton.addEventListener("click", () => backupFileInput.click());
backupFileInput.addEventListener("change", validateAndRestoreData);

function getTranslatedText(key) {
    return translations[currentLanguage]?.[key] || translations.en[key];
}

function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

function isPlainRecord(value) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function snapshotLocalStorage({ includeSensitive = true } = {}) {
    const snapshot = {};
    Object.keys(localStorage).forEach((key) => {
        if (includeSensitive || !SENSITIVE_LOCAL_STORAGE_KEYS.has(key)) {
            snapshot[key] = localStorage.getItem(key);
        }
    });
    return snapshot;
}

function transactionCompleted(transaction) {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed."));
        transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction was aborted."));
    });
}

function requestResult(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
    });
}

async function readIndexedDBEntries() {
    const db = await openDatabase();
    try {
        const transaction = db.transaction(storeName, "readonly");
        const completion = transactionCompleted(transaction);
        const store = transaction.objectStore(storeName);
        const [keys, values] = await Promise.all([
            requestResult(store.getAllKeys()),
            requestResult(store.getAll())
        ]);
        await completion;
        return keys.map((key, index) => [key, values[index]]);
    } finally {
        db.close();
    }
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error("Unable to read wallpaper data."));
        reader.readAsDataURL(blob);
    });
}

// Backup IndexedDB: Extract data from ImageDB -> backgroundImages
async function backupIndexedDB() {
    const data = {};
    const entries = await readIndexedDBEntries();

    for (const [key, value] of entries) {
        if (!INDEXED_DB_KEYS.has(String(key))) continue;
        data[key] = value instanceof Blob
            ? { blob: await blobToDataUrl(value), isBlob: true }
            : value;
    }

    return data;
}

// Backup data from localStorage and IndexedDB. API keys are intentionally excluded.
async function backupData() {
    let objectUrl;
    try {
        const backup = {
            format: BACKUP_FORMAT,
            version: BACKUP_VERSION,
            createdAt: new Date().toISOString(),
            excludedLocalStorageKeys: [...SENSITIVE_LOCAL_STORAGE_KEYS],
            localStorage: snapshotLocalStorage({ includeSensitive: false }),
            indexedDB: await backupIndexedDB()
        };

        const date = new Date();
        const formattedDate = `${String(date.getDate()).padStart(2, "0")}${String(date.getMonth() + 1).padStart(2, "0")}${date.getFullYear()}`;
        const fileName = `MYNT_Backup_${formattedDate}.json`;
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
        const link = document.createElement("a");

        objectUrl = URL.createObjectURL(blob);
        link.href = objectUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
    } catch (error) {
        await alertPrompt(getTranslatedText("failedbackup") + getErrorMessage(error));
    } finally {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
}

function isValidBlobDescriptor(value) {
    return isPlainRecord(value)
        && value.isBlob === true
        && typeof value.blob === "string"
        && value.blob.length <= MAX_BACKUP_FILE_SIZE
        && /^data:[^;,]*;base64,[A-Za-z0-9+/]*={0,2}$/u.test(value.blob);
}

function isValidIndexedDBValue(key, value) {
    if (key === "backgroundImage") return isValidBlobDescriptor(value);
    if (key === "lastUpdateTime") return typeof value === "string" && !Number.isNaN(Date.parse(value));
    if (key === "imageType") return value === "random" || value === "upload";
    return false;
}

// Accept versioned backups and structurally valid legacy backups from earlier releases.
function isValidBackupFile(backup) {
    if (!isPlainRecord(backup) || !isPlainRecord(backup.localStorage) || !isPlainRecord(backup.indexedDB)) {
        return false;
    }

    if ("format" in backup && backup.format !== BACKUP_FORMAT) return false;
    if ("version" in backup && (!Number.isInteger(backup.version) || backup.version < 1 || backup.version > BACKUP_VERSION)) {
        return false;
    }
    if ("createdAt" in backup && (typeof backup.createdAt !== "string" || Number.isNaN(Date.parse(backup.createdAt)))) {
        return false;
    }

    const localStorageEntries = Object.entries(backup.localStorage);
    if (localStorageEntries.length > 1000) return false;
    if (localStorageEntries.some(([key, value]) => key.length > 512 || typeof value !== "string")) return false;

    const indexedDBEntries = Object.entries(backup.indexedDB);
    return indexedDBEntries.length <= INDEXED_DB_KEYS.size
        && indexedDBEntries.every(([key, value]) => INDEXED_DB_KEYS.has(key) && isValidIndexedDBValue(key, value));
}

// Helper: Convert a validated Base64 data URL back to a Blob.
function base64ToBlob(base64) {
    const match = /^data:([^;,]*);base64,([A-Za-z0-9+/]*={0,2})$/u.exec(base64);
    if (!match) throw new Error("Invalid wallpaper data in backup.");

    const binary = atob(match[2]);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        array[i] = binary.charCodeAt(i);
    }
    return new Blob([array], { type: match[1] || "application/octet-stream" });
}

function prepareBackupForRestore(backup) {
    if (!isValidBackupFile(backup)) throw new Error("Invalid backup structure.");

    const localStorageEntries = Object.entries(backup.localStorage)
        .filter(([key]) => !SENSITIVE_LOCAL_STORAGE_KEYS.has(key));
    const indexedDBEntries = Object.entries(backup.indexedDB).map(([key, value]) => [
        key,
        value?.isBlob === true ? base64ToBlob(value.blob) : value
    ]);

    return { localStorageEntries, indexedDBEntries };
}

function replaceLocalStorage(entries) {
    localStorage.clear();
    entries.forEach(([key, value]) => localStorage.setItem(key, value));
}

async function replaceIndexedDB(entries) {
    const db = await openDatabase();
    try {
        const transaction = db.transaction(storeName, "readwrite");
        const completion = transactionCompleted(transaction);
        const store = transaction.objectStore(storeName);

        store.clear();
        entries.forEach(([key, value]) => store.put(value, key));
        await completion;
    } finally {
        db.close();
    }
}

// Restore both stores transactionally, rolling back the current state on failure.
async function restoreData(backup) {
    const prepared = prepareBackupForRestore(backup);
    const previousLocalStorage = Object.entries(snapshotLocalStorage());
    const previousIndexedDB = await readIndexedDBEntries();
    const preservedSensitiveEntries = previousLocalStorage
        .filter(([key]) => SENSITIVE_LOCAL_STORAGE_KEYS.has(key));

    try {
        replaceLocalStorage([...prepared.localStorageEntries, ...preservedSensitiveEntries]);
        await replaceIndexedDB(prepared.indexedDBEntries);
    } catch (restoreError) {
        try {
            replaceLocalStorage(previousLocalStorage);
            await replaceIndexedDB(previousIndexedDB);
        } catch (rollbackError) {
            console.error("Backup restore rollback failed:", rollbackError);
            throw new Error(`${getErrorMessage(restoreError)} Rollback also failed: ${getErrorMessage(rollbackError)}`);
        }
        throw restoreError;
    }
}

// Validate and restore data from a backup file.
async function validateAndRestoreData(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    restoreButton.disabled = true;
    try {
        if (file.size > MAX_BACKUP_FILE_SIZE) throw new Error("Backup file is too large.");
        const backup = JSON.parse(await file.text());

        if (!isValidBackupFile(backup)) {
            await alertPrompt(getTranslatedText("invalidBackup"));
            return;
        }

        await restoreData(backup);
        await alertPrompt(getTranslatedText("restorecompleted"));
        location.reload();
    } catch (error) {
        await alertPrompt(getTranslatedText("restorefailed") + getErrorMessage(error));
    } finally {
        restoreButton.disabled = false;
        input.value = "";
    }
}

// ------------------- Reset Settings ----------------------------
const resetButton = document.getElementById("resetsettings");

resetButton.addEventListener("click", async () => {
    if (!(await confirmPrompt(getTranslatedText("confirmRestore")))) return;

    resetButton.disabled = true;
    try {
        await replaceIndexedDB([]);
        localStorage.clear();
        location.reload();
    } catch (error) {
        resetButton.disabled = false;
        await alertPrompt(getTranslatedText("restorefailed") + getErrorMessage(error));
    }
});

/*
 * Material You New Tab
 * Copyright (c) 2024-2026 Prem, 2023-2025 XengShi
 * Licensed under the GNU General Public License v3.0 (GPL-3.0)
 * You should have received a copy of the GNU General Public License along with this program.
 * If not, see <https://www.gnu.org/licenses/>.
 */


// -------------------------- Wallpaper -----------------------------
const dbName = "ImageDB";
const storeName = "backgroundImages";
const timestampKey = "lastUpdateTime"; // Key to store last update time
const galleryOwnerKey = "myntGalleryCacheOwnerV1";
const imageTypeKey = "imageType"; // Key to store the type of image ("random" or "upload")
let activeBackgroundObjectUrl = null;

function activateBackgroundObjectUrl(objectUrl) {
    const previousObjectUrl = activeBackgroundObjectUrl;
    activeBackgroundObjectUrl = objectUrl;
    document.body.style.setProperty("--bg-image", `url(${objectUrl})`);

    if (previousObjectUrl && previousObjectUrl !== objectUrl) {
        requestAnimationFrame(() => URL.revokeObjectURL(previousObjectUrl));
    }
}

function applyBlobBackground(blob) {
    const objectUrl = URL.createObjectURL(blob);
    activateBackgroundObjectUrl(objectUrl);
    return objectUrl;
}

function releaseBackgroundObjectUrl() {
    if (!activeBackgroundObjectUrl) return;
    URL.revokeObjectURL(activeBackgroundObjectUrl);
    activeBackgroundObjectUrl = null;
}

let currentBgUrl = null;

// To set background image using a Blob
function setBackground(blob) {
    const previousUrl = currentBgUrl;
    const newUrl = URL.createObjectURL(blob);
    currentBgUrl = newUrl;
    document.body.style.setProperty("--bg-image", `url(${newUrl})`);
    toggleBackgroundType(true);
    if (previousUrl) {
        URL.revokeObjectURL(previousUrl);
    }
}

// Open IndexedDB database
function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = function (event) {
            const db = event.target.result;
            db.createObjectStore(storeName);
        };
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject("Database error: " + event.target.errorCode);
    });
}

// Save image Blob, timestamp, and type to IndexedDB
async function saveImageToIndexedDB(imageBlob, isRandom, galleryOwnerId = null) {
    if (galleryOwnerId !== null && (typeof galleryOwnerId !== "string" || !galleryOwnerId || galleryOwnerId.length > 512)) throw Error("Invalid gallery owner");
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);

        store.put(imageBlob, "backgroundImage");
        store.put(new Date().toISOString(), timestampKey);
        store.put(isRandom ? "random" : "upload", imageTypeKey);
        if (galleryOwnerId) store.put(galleryOwnerId, galleryOwnerKey);
        else store.delete(galleryOwnerKey);

        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => reject("Transaction error: " + event.target.errorCode);
        transaction.onabort = () => reject(transaction.error || Error("Image cache transaction aborted"));
    });
}

// Load image Blob, timestamp, and type from IndexedDB
async function loadImageAndDetails() {
    const db = await openDatabase();
    return Promise.all([
        getFromStore(db, "backgroundImage"),
        getFromStore(db, timestampKey),
        getFromStore(db, imageTypeKey)
    ]);
}

function getFromStore(db, key) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => reject("Request error: " + event.target.errorCode);
    });
}

// Clear image data from IndexedDB
async function clearImageFromIndexedDB() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, "readwrite");
        const store = transaction.objectStore(storeName);
        store.delete("backgroundImage");
        store.delete(timestampKey);
        store.delete(imageTypeKey);
        store.delete(galleryOwnerKey);

        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => reject("Delete error: " + event.target.errorCode);
    });
}

// The ownership marker is written atomically with the cached image. Unmarked legacy
// copies and copies owned by another feature/item are never guessed or erased.
window.myntGalleryCache = Object.freeze({
    async purgeOwned(id) {
        if (typeof id !== "string" || !id || id.length > 512) throw Error("Invalid gallery owner");
        const database = await openDatabase();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(storeName, "readwrite");
            const store = transaction.objectStore(storeName);
            let result = { deleted: false, retainedUnowned: false };
            const request = store.get(galleryOwnerKey);
            request.onsuccess = () => {
                if (request.result === id) {
                    for (const key of ["backgroundImage", timestampKey, imageTypeKey, galleryOwnerKey]) store.delete(key);
                    result.deleted = true;
                } else if (request.result == null) {
                    const image = store.get("backgroundImage");
                    image.onsuccess = () => { result.retainedUnowned = !!image.result; };
                }
            };
            transaction.oncomplete = () => resolve(result);
            transaction.onerror = () => reject(transaction.error || Error("Image cache cleanup failed"));
            transaction.onabort = () => reject(transaction.error || Error("Image cache cleanup aborted"));
        });
    }
});

// Handle file input and save image as upload
document.getElementById("imageUpload").addEventListener("change", function (event) {
    if (window.myntWallpaper?.addFiles) {
        window.myntWallpaper.addFiles(event.target.files).finally(() => { event.target.value = ""; });
        return;
    }
    const file = event.target.files[0];
    if (file) {
        const imageUrl = URL.createObjectURL(file); // Create temporary Blob URL
        const image = new Image();

        image.onload = function () {
            activateBackgroundObjectUrl(imageUrl);
            saveImageToIndexedDB(file, false)
                .then(() => {
                    toggleBackgroundType(true);
                })
                .catch(error => console.error(error));
        };
        image.onerror = function () {
            URL.revokeObjectURL(imageUrl);
            console.error("The selected wallpaper could not be decoded.");
        };

        image.src = imageUrl;
    }
});

// Fetch and apply random image as background
const RANDOM_IMAGE_URL = "https://picsum.photos/1920/1080";

async function applyRandomImage(showConfirmation = true) {
    if (showConfirmation && !(await confirmPrompt(
        translations[currentLanguage]?.confirmWallpaper || translations["en"].confirmWallpaper
    ))) {
        return;
    }
    try {
        const response = await fetch(RANDOM_IMAGE_URL);
        if (!response.ok) throw new Error(`Wallpaper request failed (${response.status}).`);
        const blob = await response.blob(); // Get Blob from response

        if (window.myntWallpaper?.useLegacy) await window.myntWallpaper.useLegacy(blob);
        else { applyBlobBackground(blob); await saveImageToIndexedDB(blob, true); }
        toggleBackgroundType(true);
    } catch (error) {
        console.error("Error fetching random image:", error);
    }
}

// Function to update the background type attribute
function toggleBackgroundType(hasWallpaper) {
    document.body.setAttribute("data-bg", hasWallpaper ? "wallpaper" : "color");
}

// Check and update image on page load
function checkAndUpdateImage() {
    if (localStorage.getItem("myntWallpaperCurrent")) return;
    loadImageAndDetails()
        .then(([blob, savedTimestamp, imageType]) => {
            const now = new Date();
            const lastUpdate = new Date(savedTimestamp);

            if (!blob || !savedTimestamp || isNaN(lastUpdate)) {
                toggleBackgroundType(false);
                return;
            }

            if (imageType === "upload") {
                applyBlobBackground(blob);
                toggleBackgroundType(true);
                return;
            }

            if (lastUpdate.toDateString() !== now.toDateString()) {
                applyRandomImage(false);
            } else {
                // Reapply the saved random image
                applyBlobBackground(blob);
                toggleBackgroundType(true);
            }
        })
        .catch((error) => {
            console.error("Error loading image details:", error);
            toggleBackgroundType(false);
        });
}

// Event listeners for buttons
document.getElementById("uploadTrigger").addEventListener("click", () =>
    document.getElementById("imageUpload").click()
);

document.getElementById("clearImage").addEventListener("click", async function () {
    if (window.myntWallpaper?.cancelApply) await window.myntWallpaper.cancelApply();
});

document.getElementById("randomImageTrigger").addEventListener("click", applyRandomImage);

// Start image check on page load
checkAndUpdateImage();
window.addEventListener("pagehide", releaseBackgroundObjectUrl, { once: true });
// ------------------------ End of BG Image --------------------------

/*
 * MYNT wallpaper gallery: images + videos stored in IndexedDB.
 * Next (button / Alt+W / command palette), gallery management,
 * modes: fixed / random on each new tab / auto-rotate every N minutes.
 */
(function () {
    "use strict";
    const DB_NAME = "MYNTWallpaperGallery";
    const STORE = "items";
    const KEY_CURRENT = "myntWallpaperCurrent";
    const KEY_MODE = "myntWallpaperMode";
    const KEY_MINUTES = "myntWallpaperMinutes";
    const KEY_LAST = "myntWallpaperLastSwitch";
    const KEY_SEEDED = "myntWallpaperSeeded";
    const KEY_HIDDEN = "myntWallpaperHiddenBuiltins";
    const KEY_SHOW_HIDDEN = "myntWallpaperShowHidden";
    const BUNDLED_VIDEO_ID = "bundled-video-bg";
    const BUNDLED_VIDEO_SRC = "./videos/bg.mp4?v=2";
    const VIDEO_WARN_BYTES = 200 * 1024 * 1024;
    const WRITE_LOCK = "mynt-wallpaper-gallery-write";
    const lang = localStorage.getItem("selectedLanguage") || "zh_TW";

    function t(key, fallback) {
        if (typeof translations === "undefined") return fallback || key;
        return translations[lang]?.[key] || translations.en?.[key] || fallback || key;
    }

    // ---------- IndexedDB ----------
    let dbPromise = null;
    function db() {
        if (!dbPromise) {
            dbPromise = new Promise((resolve, reject) => {
                const req = indexedDB.open(DB_NAME, 1);
                req.onupgradeneeded = () => {
                    const store = req.result.createObjectStore(STORE, { keyPath: "id" });
                    store.createIndex("added", "added");
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }
        return dbPromise;
    }
    async function tx(mode, fn) {
        const d = await db();
        return new Promise((resolve, reject) => {
            const transaction = d.transaction(STORE, mode);
            const store = transaction.objectStore(STORE);
            let result, failure;
            Promise.resolve().then(() => fn(store)).then(r => { result = r; }, error => {
                failure = error;
                try { transaction.abort(); } catch (_) { reject(error); }
            });
            transaction.oncomplete = () => resolve(result);
            transaction.onerror = transaction.onabort = () => reject(failure || transaction.error || Error("Gallery transaction failed"));
        });
    }
    const reqP = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    const hiddenIds = () => { try { return new Set(JSON.parse(localStorage.getItem(KEY_HIDDEN) || "[]")); } catch (e) { return new Set(); } };
    const saveHidden = set => localStorage.setItem(KEY_HIDDEN, JSON.stringify([...set]));
    async function allItems(includeRemoved = false) {
        const items = await tx("readonly", store => reqP(store.getAll()));
        return (items || []).filter(item => includeRemoved || !item.removedAt).sort((a, b) => a.added - b.added);
    }
    // Items that take part in next/random/rotate (hidden built-ins excluded).
    async function listItems() {
        const hidden = hiddenIds();
        return (await allItems()).filter(i => !hidden.has(i.id));
    }
    const getItem = id => tx("readonly", store => reqP(store.get(id)));
    let localWriteQueue = Promise.resolve();
    function withGalleryWrite(operation, requireCrossTab = false) {
        if (navigator.locks?.request) return navigator.locks.request(WRITE_LOCK, operation);
        if (requireCrossTab) return Promise.reject(Error("PURGE_UNAVAILABLE"));
        const pending = localWriteQueue.catch(() => {}).then(operation);
        localWriteQueue = pending.catch(() => {});
        return pending;
    }
    const putItem = item => withGalleryWrite(() => tx("readwrite", store => { store.put(item); }));

    // Every update re-reads its target in the same transaction. A stale card,
    // rename prompt or Undo must never recreate a permanently deleted record.
    async function updateItems(ids, update) {
        const database = await db();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(STORE, "readwrite");
            const store = transaction.objectStore(STORE), changed = [];
            let failure;
            transaction.oncomplete = () => resolve(changed);
            transaction.onerror = transaction.onabort = () => reject(failure || transaction.error || Error("Gallery transaction failed"));
            for (const id of new Set(ids)) {
                const request = store.get(id);
                request.onsuccess = () => {
                    try {
                        const current = request.result;
                        if (!current) return;
                        const nextItem = update(current);
                        if (nextItem) { store.put(nextItem); changed.push(nextItem); }
                    } catch (error) { failure = error; transaction.abort(); }
                };
            }
        });
    }

    const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

    // ---------- Bundled defaults ----------
    function gradientBlob(colors) {
        return new Promise(resolve => {
            const canvas = document.createElement("canvas");
            canvas.width = 1920; canvas.height = 1080;
            const ctx = canvas.getContext("2d");
            const g = ctx.createLinearGradient(0, 0, 1920, 1080);
            colors.forEach((c, i) => g.addColorStop(i / (colors.length - 1), c));
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, 1920, 1080);
            canvas.toBlob(blob => resolve(blob), "image/jpeg", 0.9);
        });
    }
    async function seedDefaults() {
        if (localStorage.getItem(KEY_SEEDED) === "1") return;
        const now = Date.now();
        await putItem({ id: BUNDLED_VIDEO_ID, type: "video", source: "bundled", src: BUNDLED_VIDEO_SRC, name: "MYNT motion", added: now });
        const a = await gradientBlob(["#3d5a80", "#98c1d9", "#e0fbfc"]);
        const b = await gradientBlob(["#2b2d42", "#5c4d7d", "#f2a65a"]);
        if (a) await putItem({ id: "bundled-gradient-sky", type: "image", source: "bundled", blob: a, name: "Sky", added: now + 1 });
        if (b) await putItem({ id: "bundled-gradient-dusk", type: "image", source: "bundled", blob: b, name: "Dusk", added: now + 2 });
        localStorage.setItem(KEY_SEEDED, "1");
    }

    // ---------- Video element ----------
    let videoEl = null;
    let startGalleryWhenVisible = false;
    let videoUrl = null;
    let imageUrl = null;
    let imageOwnerId = null;
    const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        || document.documentElement.classList.contains("reduced-motion")
        || document.body.classList.contains("reduced-motion");

    function ensureVideo() {
        if (videoEl) return videoEl;
        videoEl = document.createElement("video");
        videoEl.id = "myntGalleryVideo";
        videoEl.className = "myntGalleryVideo";
        videoEl.muted = true; videoEl.loop = true; videoEl.playsInline = true;
        videoEl.setAttribute("muted", ""); videoEl.setAttribute("playsinline", "");
        videoEl.setAttribute("aria-hidden", "true");
        videoEl.preload = "metadata";
        document.body.prepend(videoEl);
        return videoEl;
    }
    function syncVideoPlayback() {
        if (!videoEl || document.body.dataset.galleryVideo !== "on") return;
        if (document.visibilityState !== "visible") { startGalleryWhenVisible=true;videoEl.pause(); return; }
        startGalleryWhenVisible=false;
        if (reducedMotion() || document.documentElement.classList.contains("myntReducedMotion") || document.documentElement.classList.contains("myntHighContrast") || navigator.connection?.saveData) {
            videoEl.pause();
            if (videoEl.readyState >= 1 && videoEl.currentTime < 0.05) { try { videoEl.currentTime = 0.1; } catch (e) { /* ignore */ } }
            return;
        }
        videoEl.play().catch(() => { /* autoplay blocked: first frame stays as poster */ });
    }
    let resumeGalleryAfterHidden=false;
    document.addEventListener("visibilitychange",()=>{
        if(document.hidden){resumeGalleryAfterHidden=Boolean(videoEl&&!videoEl.paused);videoEl?.pause();}
        else {
            const resume = resumeGalleryAfterHidden || startGalleryWhenVisible;
            resumeGalleryAfterHidden=false;startGalleryWhenVisible=false;
            refreshSharedGallery(resume);
        }
    });

    function stopGalleryVideo() {
        startGalleryWhenVisible=false;resumeGalleryAfterHidden=false;
        document.body.dataset.galleryVideo = "off";
        if (videoEl) { videoEl.pause(); videoEl.removeAttribute("src"); videoEl.load(); }
        if (videoUrl) { URL.revokeObjectURL(videoUrl); videoUrl = null; }
    }

    // ---------- Apply ----------
    function releaseGalleryImage() {
        if (imageUrl) URL.revokeObjectURL(imageUrl);
        imageUrl = null; imageOwnerId = null;
    }
    function clearGalleryBackground() {
        stopGalleryVideo();
        releaseGalleryImage();
        document.body.style.removeProperty("--bg-image");
        document.body.dataset.workspaceBackground = "color";
        document.body.dataset.bg = "color";
        delete document.body.dataset.wallpaperId;
    }
    async function cancelApply() {
        try {
            await withGalleryWrite(async () => {
                localStorage.setItem(KEY_CURRENT, "none");
                localStorage.setItem(KEY_MODE, "fixed");
                scheduleRotate();
                clearGalleryBackground();
                $("videoBg")?.pause();
                const modeSelect = $("wallpaperModeSelect");
                if (modeSelect) modeSelect.value = "fixed";
                const interval = $("wallpaperIntervalGroup"); if (interval) interval.hidden = true;
                const minutesSelect = $("wallpaperMinutesSelect"); if (minutesSelect) minutesSelect.disabled = true;
            });
            notifyGalleryChange();
            await renderGallery();
            setStatus(t("wallpaperUnapplied", "Background removed from the home page. Gallery files are kept; rotation is stopped."));
        } catch (error) { setStatus(t("wallpaperActionError", "Could not save this change. Your media are unchanged.")); }
    }
    function useLegacy(blob = null) {
        if (blob !== null && !(blob instanceof Blob)) return Promise.reject(TypeError("A wallpaper Blob is required"));
        return withGalleryWrite(async () => {
            if (blob) {
                if (typeof saveImageToIndexedDB !== "function" || typeof applyBlobBackground !== "function") throw Error("Legacy wallpaper is unavailable");
                await saveImageToIndexedDB(blob, true);
            }
            localStorage.removeItem(KEY_CURRENT);
            localStorage.setItem(KEY_MODE, "fixed");
            scheduleRotate(); stopGalleryVideo(); releaseGalleryImage();
            document.body.dataset.workspaceBackground = "wallpaper";
            document.body.dataset.bg = "wallpaper";
            delete document.body.dataset.wallpaperId;
            if (blob) applyBlobBackground(blob);
            renderSelection();
            notifyGalleryChange();
        });
    }
    async function applyItem(item, { persist = true, beforeMutation } = {}) {
        return withGalleryWrite(() => applyItemUnlocked(item, { persist, beforeMutation }));
    }
    async function applyItemUnlocked(item, { persist = true, beforeMutation } = {}) {
        // Revalidate after waiting for the shared lock; item may be a stale DOM snapshot.
        item = item?.id ? await getItem(item.id) : null;
        if (beforeMutation) beforeMutation();
        if (!item || item.removedAt || hiddenIds().has(item.id)) return false;
        // Await this owned cache write while holding the same lock as purge.
        // A delayed cache write must not bring a deleted image back afterwards.
        if (persist && item.type === "image" && item.blob && typeof saveImageToIndexedDB === "function") {
            await saveImageToIndexedDB(item.blob, false, item.id);
            if (beforeMutation) beforeMutation();
        }
        if (item.type === "video") {
            releaseGalleryImage();
            document.body.style.removeProperty("--bg-image");
            const v = ensureVideo();
            const src = item.blob ? URL.createObjectURL(item.blob) : item.src;
            if (videoUrl) URL.revokeObjectURL(videoUrl);
            videoUrl = item.blob ? src : null;
            v.src = src;
            document.body.dataset.workspaceBackground = "video";
            document.body.dataset.galleryVideo = "on";
            const deco = document.getElementById("videoBg");
            if (deco) deco.pause();
            syncVideoPlayback();
        } else {
            stopGalleryVideo();
            if (item.blob) {
                const url = URL.createObjectURL(item.blob);
                document.body.style.setProperty("--bg-image", `url(${url})`);
                releaseGalleryImage();
                imageUrl = url;
                imageOwnerId = item.id;
            } else if (item.src) {
                releaseGalleryImage();
                document.body.style.setProperty("--bg-image", `url("${item.src.replace(/"/g, "%22")}")`);
            }
            document.body.dataset.workspaceBackground = "wallpaper";
            document.body.dataset.bg = "wallpaper";
        }
        document.body.dataset.wallpaperId = item.id;
        if (persist) {
            localStorage.setItem(KEY_CURRENT, item.id);
            localStorage.setItem(KEY_LAST, String(Date.now()));
        }
        renderSelection();
        if (persist) notifyGalleryChange();
        return true;
    }

    async function next(direction = 1, beforeMutation) {
        return withGalleryWrite(() => nextUnlocked(direction, beforeMutation));
    }
    async function nextUnlocked(direction = 1, beforeMutation) {
        const items = await listItems();
        if (!items.length) return false;
        const currentId = localStorage.getItem(KEY_CURRENT);
        const idx = items.findIndex(i => i.id === currentId);
        const target = items[(idx + direction + items.length) % items.length];
        return await applyItemUnlocked(target, { beforeMutation });
    }
    async function random(beforeMutation) {
        return withGalleryWrite(async () => {
            const items = await listItems();
            if (!items.length) return;
            const currentId = localStorage.getItem(KEY_CURRENT);
            const pool = items.length > 1 ? items.filter(i => i.id !== currentId) : items;
            return await applyItemUnlocked(pool[Math.floor(Math.random() * pool.length)], { beforeMutation });
        });
    }

    // ---------- Add items ----------
    function videoThumb(blobOrSrc) {
        return new Promise(resolve => {
            const v = document.createElement("video");
            v.muted = true; v.playsInline = true; v.preload = "auto";
            const url = typeof blobOrSrc === "string" ? blobOrSrc : URL.createObjectURL(blobOrSrc);
            let done = false;
            const finish = blob => { if (done) return; done = true; if (typeof blobOrSrc !== "string") URL.revokeObjectURL(url); resolve(blob || null); };
            v.addEventListener("loadeddata", () => { try { v.currentTime = Math.min(0.5, (v.duration || 1) / 2); } catch (e) { finish(null); } });
            v.addEventListener("seeked", () => {
                try {
                    const c = document.createElement("canvas");
                    c.width = 320; c.height = Math.round(320 * ((v.videoHeight || 9) / (v.videoWidth || 16)));
                    c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
                    c.toBlob(b => finish(b), "image/jpeg", 0.8);
                } catch (e) { finish(null); }
            });
            v.addEventListener("error", () => finish(null));
            setTimeout(() => finish(null), 8000);
            v.src = url;
        });
    }

    async function addBlob(blob, name) {
        const isVideo = /^video\//.test(blob.type) || /\.(mp4|webm)$/i.test(name || "");
        const isImage = /^image\//.test(blob.type);
        if (!isVideo && !isImage) { setStatus(t("wallpaperUnsupported", "Unsupported file type")); return null; }
        if (isVideo && blob.size > VIDEO_WARN_BYTES) {
            const message = t("wallpaperVideoTooLarge", "This video is larger than 200 MB and may slow down the new tab. Add anyway?");
            const ok = window.myntDialog ? await window.myntDialog.confirm(message) : window.confirm(message);
            if (!ok) return null;
        }
        const item = { id: newId(), type: isVideo ? "video" : "image", source: "upload", blob, name: name || "", added: Date.now() };
        if (isVideo) item.thumb = await videoThumb(blob);
        await putItem(item);
        return item;
    }

    async function addFiles(fileList) {
        const files = Array.from(fileList || []);
        let last = null;
        for (const file of files) {
            try { last = (await addBlob(file, file.name)) || last; } catch (e) { console.warn("MYNT wallpaper add failed", e); }
        }
        await renderGallery();
        if (last) await applyItem(last);
        setStatus(t("wallpaperAdded", "Added") + " " + files.length);
    }

    async function addUrl(url) {
        url = (url || "").trim();
        if (!/^https?:\/\//i.test(url)) { setStatus(t("wallpaperInvalidUrl", "Enter an http(s) URL")); return; }
        const looksVideo = /\.(mp4|webm)(\?|#|$)/i.test(url);
        let item = null;
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(String(res.status));
            const blob = await res.blob();
            item = await addBlob(blob, url.split("/").pop());
        } catch (e) {
            // CORS or network failure: keep a URL reference instead of a stored copy.
            item = { id: newId(), type: looksVideo ? "video" : "image", source: "url", src: url, name: url, added: Date.now() };
            if (looksVideo) item.thumb = await videoThumb(url);
            await putItem(item);
        }
        await renderGallery();
        if (item) await applyItem(item);
    }

    // ---------- Gallery UI ----------
    const $ = id => document.getElementById(id);
    function setStatus(text) { const s = $("wallpaperGalleryStatus"); if (s) s.textContent = text || ""; }
    const thumbUrls = [];
    function releaseThumbs() { while (thumbUrls.length) URL.revokeObjectURL(thumbUrls.pop()); }

    const selected = new Set();
    let selectMode = false;
    let removing = false;
    let purging = false;
    let undoItems = [];

    function displayName(item) {
        if (item.name) return item.name;
        return item.type === "video" ? t("wallpaperVideoBadge", "Video") : t("wallpaperImage", "Image");
    }

    async function removeItems(items) {
        if (removing || !items.length) return;
        removing = true;
        try {
            const custom = items.filter(item => item.source !== "bundled");
            if (custom.length) {
                const message = t("wallpaperDeleteConfirm", 'Remove {name} from the gallery? You can restore removed items, including after reload. Your original files are unchanged.')
                    .replace("{name}", custom.length === 1 ? displayName(custom[0]) : String(custom.length));
                const ok = window.myntDialog ? await window.myntDialog.confirm(message) : window.confirm(message);
                if (!ok) return;
            }
            await withGalleryWrite(async () => {
                // Update only records that still exist. Stale cards cannot resurrect a purge.
                await updateItems(custom.map(item => item.id), item => item.source !== "bundled" && !item.removedAt ? { ...item, removedAt: Date.now() } : null);
                const bundled = items.filter(item => item.source === "bundled");
                if (bundled.length) {
                    const hidden = hiddenIds();
                    for (const item of bundled) hidden.add(item.id);
                    saveHidden(hidden);
                    undoItems = [...new Map([...undoItems, ...bundled].map(item => [item.id, item])).values()];
                }
                const wasCurrent = items.some(item => item.id === localStorage.getItem(KEY_CURRENT));
                if (wasCurrent) {
                    localStorage.removeItem(KEY_CURRENT);
                    if (!(await nextUnlocked(1))) {
                        localStorage.setItem(KEY_CURRENT, "none");
                        clearGalleryBackground();
                    }
                    scheduleRotate();
                }
            });
            notifyGalleryChange();
            await renderGallery();
            if (!$("wallpaperUndoBar")?.hidden) $("wallpaperUndoBtn")?.focus();
        } catch (error) {
            setStatus(t("wallpaperActionError", "The change could not be completed. Your stored media have not been permanently deleted. Please try again."));
        } finally { removing = false; }
    }

    function showUndo(removed) {
        const bar = $("wallpaperUndoBar");
        if (!bar) return;
        undoItems = undoItems.filter(item => hiddenIds().has(item.id));
        const count = removed.length + undoItems.length;
        bar.hidden = count === 0;
        $("wallpaperUndoText").textContent = t("wallpaperRecoverableCount", "{count} removed; recoverable media still use local storage.").replace("{count}", count);
    }

    async function undoRemove(onlyId = null) {
        try {
            let restoredIds;
            await withGalleryWrite(async () => {
                const removed = (await allItems(true)).filter(item => item.removedAt && (!onlyId || item.id === onlyId));
                const changed = await updateItems(removed.map(item => item.id), item => {
                    if (!item.removedAt) return null;
                    const restored = { ...item }; delete restored.removedAt; return restored;
                });
                restoredIds = new Set([...changed, ...undoItems].map(item => item.id));
                if (!onlyId && undoItems.length) {
                    const hidden = hiddenIds();
                    for (const item of undoItems) hidden.delete(item.id);
                    saveHidden(hidden);
                    undoItems = [];
                }
            });
            notifyGalleryChange();
            await renderGallery();
            const card = [...($("wallpaperGalleryGrid")?.children || [])].find(node => restoredIds.has(node.dataset.id));
            const target = card?.querySelector(".wallpaperCardPick") || $("closeWallpaperGalleryBtn");
            target?.focus();
        } catch (error) {
            setStatus(t("wallpaperActionError", "The change could not be completed. Your stored media have not been permanently deleted. Please try again."));
        }
    }

    async function renameItem(item) {
        const message = t("wallpaperRenamePrompt", "Wallpaper name");
        const name = window.myntDialog ? await window.myntDialog.prompt(message, item.name || "", { maxLength: 60 }) : window.prompt(message, item.name || "");
        if (name === null) return;
        try {
            await withGalleryWrite(() => updateItems([item.id], current => current.source !== "bundled" && !current.removedAt ? { ...current, name: name.trim().slice(0, 60) } : null));
            notifyGalleryChange();
            await renderGallery();
        } catch (_) { setStatus(t("wallpaperActionError", "The change could not be completed. Your stored media have not been permanently deleted. Please try again.")); }
    }

    function purgeRevision(item) {
        return JSON.stringify([item.id, item.name, item.source, item.type, item.added, item.removedAt,
            item.src || null, item.blob?.size || 0, item.blob?.type || null, item.thumb?.size || 0, item.thumb?.type || null]);
    }
    async function purgeBlobFingerprint(blob) {
        if (!blob) return null;
        // A chained SHA-256 fingerprint processes bounded 1 MiB chunks,
        // including for large videos. No raw media leave this browser.
        let digest = new Uint8Array(32);
        for (let offset = 0; offset < blob.size; offset += 1048576) {
            const chunk = new Uint8Array(await blob.slice(offset, offset + 1048576).arrayBuffer());
            const input = new Uint8Array(digest.length + chunk.length);
            input.set(digest); input.set(chunk, digest.length);
            digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
        }
        return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
    }
    async function purgeFingerprint(item) {
        return JSON.stringify([purgeRevision(item), await purgeBlobFingerprint(item.blob), await purgeBlobFingerprint(item.thumb)]);
    }
    function assertPurgeTarget(item, expected) {
        if (!item || item.source === "bundled" || !item.removedAt || purgeRevision(item) !== expected) throw Error("PURGE_CHANGED");
        if (localStorage.getItem(KEY_CURRENT) === item.id) throw Error("PURGE_CHANGED");
    }
    // This function is deliberately not exposed by the remote API. The only
    // ordinary entry is a named, irreversible confirmation in the Recovery UI.
    async function purgeItem(id) {
        if (purging) return false;
        purging = true;
        let committed = false;
        try {
            if (!navigator.locks?.request || !crypto.subtle?.digest || typeof window.myntGalleryCache?.purgeOwned !== "function" || typeof window.myntDialog?.confirm !== "function") throw Error("PURGE_UNAVAILABLE");
            const item = await getItem(id);
            if (!item || item.source === "bundled" || !item.removedAt) throw Error("PURGE_CHANGED");
            const expected = purgeRevision(item);
            const fingerprint = await purgeFingerprint(item);
            const message = t("wallpaperPurgeConfirm", 'Permanently delete “{name}” from this gallery? Its saved original and thumbnail will be deleted and cannot be restored here. Original files, other features’ saved copies and exported backups are not deleted.').replace("{name}", displayName(item));
            const accepted = await window.myntDialog.confirm(message, { danger: true, focusCancel: true, okText: t("wallpaperPurge", "Permanently delete") });
            if (!accepted) return false;
            await withGalleryWrite(async () => {
                const current = await getItem(id);
                assertPurgeTarget(current, expected);
                if (await purgeFingerprint(current) !== fingerprint) throw Error("PURGE_CHANGED");
                // The cache helper compares its atomic ownership marker, never
                // filenames or bytes. Unowned / other features' copies survive.
                await window.myntGalleryCache.purgeOwned(id);
                const database = await db();
                await new Promise((resolve, reject) => {
                    const transaction = database.transaction(STORE, "readwrite");
                    const store = transaction.objectStore(STORE);
                    let failure;
                    transaction.oncomplete = () => { committed = true; resolve(); };
                    transaction.onerror = transaction.onabort = () => reject(failure || transaction.error || Error("Gallery transaction failed"));
                    const request = store.get(id);
                    request.onsuccess = () => {
                        try { assertPurgeTarget(request.result, expected); store.delete(id); }
                        catch (error) { failure = error; transaction.abort(); }
                    };
                });
                selected.delete(id);
                undoItems = undoItems.filter(item => item.id !== id);
                if (document.body.dataset.wallpaperId === id) clearGalleryBackground();
                else if (imageOwnerId === id) releaseGalleryImage();
            }, true);
            notifyGalleryChange();
            await renderGallery();
            $("wallpaperRecoveryTitle")?.focus();
            setStatus(t("wallpaperPurged", "This gallery item and its thumbnail were permanently deleted. Other saved copies and exported backups were not deleted."));
            return true;
        } catch (error) {
            const key = committed ? "wallpaperPurgeRefresh" : error.message === "PURGE_UNAVAILABLE" ? "wallpaperPurgeUnavailable" : error.message === "PURGE_CHANGED" ? "wallpaperPurgeChanged" : "wallpaperPurgeFailed";
            const fallback = committed ? "The gallery item was permanently deleted. Reopen the gallery to refresh its display." : error.message === "PURGE_UNAVAILABLE" ? "Permanent deletion is unavailable in this browser. Your gallery item is kept." : error.message === "PURGE_CHANGED" ? "This wallpaper changed or is still in use. Refresh the gallery and review it again; no gallery item was permanently deleted." : "The gallery item was not permanently deleted. A related cache copy may have been cleared; the original remains in Recovery. Please try again.";
            setStatus(t(key, fallback));
            if (committed) notifyGalleryChange();
            return committed;
        } finally { purging = false; }
    }

    function updateSelectUi() {
        const del = $("wallpaperDeleteSelectedBtn");
        if (del) {
            del.hidden = !selectMode;
            del.disabled = selected.size === 0;
            del.textContent = t("wallpaperDeleteSelected", "Delete selected") + (selected.size ? ` (${selected.size})` : "");
        }
        const toggle = $("wallpaperSelectModeBtn");
        if (toggle) toggle.textContent = selectMode ? t("wallpaperSelectDone", "Done") : t("wallpaperSelect", "Select");
        $("wallpaperGalleryGrid")?.classList.toggle("selecting", selectMode);
    }

    function mediaBytes(item) { return (item.blob?.size || 0) + (item.thumb?.size || 0); }
    function sizeLabel(bytes) { return bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KiB` : `${(bytes / 1048576).toFixed(2)} MiB`; }
    function renderRecovery(records) {
        const usage = $("wallpaperStorageUsage");
        const removed = records.filter(item => item.removedAt);
        if (usage) usage.textContent = t("wallpaperStorageUsage", "Gallery media: {used}; recoverable: {removed}. Remote URL media are not counted.")
            .replace("{used}", sizeLabel(records.reduce((n,item) => n + mediaBytes(item), 0)))
            .replace("{removed}", sizeLabel(removed.reduce((n,item) => n + mediaBytes(item), 0)));
        const list = $("wallpaperRecoveryList"), title = $("wallpaperRecoveryTitle");
        if (title) title.textContent = t("wallpaperRecoveryTitle", "Recovery") + ` (${removed.length})`;
        if (!list) return;
        list.replaceChildren();
        for (const item of removed) {
            const row = document.createElement("div"); row.className = "wallpaperRecoveryRow";
            const name = document.createElement("span"); name.textContent = displayName(item); name.title = name.textContent;
            const size = document.createElement("small"); size.textContent = sizeLabel(mediaBytes(item));
            const restore = document.createElement("button"); restore.type = "button";
            restore.textContent = t("wallpaperUndo", "Restore"); restore.setAttribute("aria-label", `${restore.textContent} ${displayName(item)}`);
            restore.addEventListener("click", () => undoRemove(item.id));
            row.appendChild(name); row.appendChild(size); row.appendChild(restore);
            if (item.source !== "bundled") {
                const purge = document.createElement("button"); purge.type = "button"; purge.className = "wallpaperPurge";
                purge.textContent = t("wallpaperPurge", "Permanently delete"); purge.setAttribute("aria-label", `${purge.textContent} ${displayName(item)}`);
                purge.addEventListener("click", async () => { purge.disabled = true; try { await purgeItem(item.id); } finally { purge.disabled = false; } });
                row.appendChild(purge);
            }
            list.appendChild(row);
        }
        const empty = $("wallpaperRecoveryEmpty"); if (empty) empty.hidden = removed.length > 0;
    }
    let galleryRenderRevision = 0;
    async function renderGallery() {
        const revision = ++galleryRenderRevision;
        const grid = $("wallpaperGalleryGrid");
        if (!grid) return;
        const hidden = hiddenIds();
        const showHidden = localStorage.getItem(KEY_SHOW_HIDDEN) === "1";
        const records = await allItems(true);
        const items = records.filter(i => !i.removedAt && (showHidden || !hidden.has(i.id)));
        if (revision !== galleryRenderRevision) return;
        showUndo(records.filter(item => item.removedAt));
        renderRecovery(records);
        releaseThumbs();
        grid.replaceChildren();
        const currentId = localStorage.getItem(KEY_CURRENT);
        for (const id of [...selected]) if (!items.some(i => i.id === id)) selected.delete(id);
        for (const item of items) {
            const isHidden = hidden.has(item.id);
            const card = document.createElement("div");
            card.className = "wallpaperCard";
            card.dataset.id = item.id;
            card.dataset.type = item.type;
            if (item.id === currentId) card.classList.add("active");
            if (isHidden) card.classList.add("isHidden");
            if (selected.has(item.id)) card.classList.add("selected");

            const pick = document.createElement("button");
            pick.type = "button";
            pick.className = "wallpaperCardPick";
            pick.title = displayName(item);
            pick.setAttribute("aria-label", displayName(item));
            let thumbSrc = null;
            if (item.type === "image") thumbSrc = item.blob ? URL.createObjectURL(item.blob) : item.src;
            else if (item.thumb) thumbSrc = URL.createObjectURL(item.thumb);
            if (thumbSrc && thumbSrc.startsWith("blob:")) thumbUrls.push(thumbSrc);
            if (thumbSrc) {
                const img = document.createElement("img");
                img.alt = ""; img.loading = "lazy"; img.src = thumbSrc;
                pick.appendChild(img);
            } else if (item.type === "video") {
                const v = document.createElement("video");
                v.muted = true; v.preload = "metadata"; v.src = item.src || "";
                pick.appendChild(v);
            }
            const badges = document.createElement("span");
            badges.className = "wallpaperBadges";
            if (item.type === "video") {
                const b = document.createElement("span");
                b.className = "wallpaperBadge"; b.textContent = "▶ " + t("wallpaperVideoBadge", "Video");
                badges.appendChild(b);
            }
            if (item.source === "bundled") {
                const b = document.createElement("span");
                b.className = "wallpaperBadge"; b.textContent = t("wallpaperBuiltin", "Built-in");
                badges.appendChild(b);
            }
            const currentBadge = document.createElement("span");
            currentBadge.className = "wallpaperBadge wallpaperCurrentBadge";
            currentBadge.textContent = t("wallpaperCurrent", "In use"); currentBadge.hidden = item.id !== currentId;
            badges.appendChild(currentBadge);
            pick.appendChild(badges);
            pick.addEventListener("click", async () => {
                if (selectMode) {
                    selected.has(item.id) ? selected.delete(item.id) : selected.add(item.id);
                    card.classList.toggle("selected", selected.has(item.id));
                    updateSelectUi();
                    return;
                }
                if (isHidden) {
                    await withGalleryWrite(() => { const h = hiddenIds(); h.delete(item.id); saveHidden(h); });
                    notifyGalleryChange();
                    await renderGallery();
                }
                await applyItem(item);
            });
            card.appendChild(pick);

            const footer = document.createElement("div");
            footer.className = "wallpaperCardFooter";
            const name = document.createElement("span");
            name.className = "wallpaperCardName";
            name.textContent = displayName(item);
            footer.appendChild(name);
            if (item.source !== "bundled") {
                const ren = document.createElement("button");
                ren.type = "button"; ren.className = "wallpaperCardIcon"; ren.textContent = "✎";
                ren.title = t("wallpaperRename", "Rename"); ren.setAttribute("aria-label", t("wallpaperRename", "Rename"));
                ren.addEventListener("click", () => renameItem(item));
                footer.appendChild(ren);
            }
            const del = document.createElement("button");
            del.type = "button"; del.className = "wallpaperCardIcon wallpaperCardDelete";
            const delLabel = item.source === "bundled" ? (isHidden ? t("wallpaperShowBuiltin", "Show again") : t("wallpaperHide", "Hide")) : t("wallpaperDelete", "Delete");
            del.textContent = delLabel;
            del.title = delLabel; del.setAttribute("aria-label", `${delLabel} ${displayName(item)}`);
            del.addEventListener("click", async () => {
                if (isHidden) { await withGalleryWrite(() => { const h = hiddenIds(); h.delete(item.id); saveHidden(h); }); notifyGalleryChange(); await renderGallery(); return; }
                await removeItems([item]);
            });
            footer.appendChild(del);
            card.appendChild(footer);
            grid.appendChild(card);
        }
        const empty = $("wallpaperGalleryEmpty");
        if (empty) empty.hidden = items.length > 0;
        updateSelectUi();
    }
    function renderSelection() {
        const currentId = localStorage.getItem(KEY_CURRENT);
        document.querySelectorAll("#wallpaperGalleryGrid .wallpaperCard").forEach(card => {
            const active = card.dataset.id === currentId;
            card.classList.toggle("active", active);
            const badge = card.querySelector(".wallpaperCurrentBadge"); if (badge) badge.hidden = !active;
        });
    }

    function openGallery() {
        const dialog = $("wallpaperGalleryDialog");
        if (!dialog) return;
        renderGallery();
        if (!dialog.open) dialog.showModal();
    }

    // ---------- Modes ----------
    let rotateTimer = null;
    function mode() { return localStorage.getItem(KEY_MODE) || "fixed"; }
    function minutes() { return Math.max(1, Number(localStorage.getItem(KEY_MINUTES)) || 15); }
    function scheduleRotate() {
        clearInterval(rotateTimer);
        rotateTimer = null;
        if (mode() !== "rotate" || localStorage.getItem(KEY_CURRENT) === "none") return;
        rotateTimer = setInterval(() => {
            if (document.visibilityState === "visible") next(1);
        }, minutes() * 60 * 1000);
    }

    function translateUi() {
        const map = {
            wallpaperGalleryTitle: ["wallpaperGalleryTitle", "Wallpapers"],
            wallpaperGalleryEyebrow: ["wallpaperGalleryEyebrow", "Background"],
            wallpaperAddFilesLabel: ["wallpaperAddFiles", "Add images / videos"],
            wallpaperClearLabel: ["wallpaperUnapply", "Stop using background"],
            wallpaperUnapplyBtn: ["wallpaperUnapply", "Stop using background"],
            wallpaperRecoveryEmpty: ["wallpaperRecoveryEmpty", "No removed wallpapers."],
            wallpaperAddUrlBtn: ["wallpaperAddUrl", "Add URL"],
            wallpaperModeLabel: ["wallpaperModeLabel", "Mode"],
            wallpaperModeFixed: ["wallpaperModeFixed", "Fixed"],
            wallpaperModeRandom: ["wallpaperModeRandom", "Random on each new tab"],
            wallpaperModeRotate: ["wallpaperModeRotate", "Auto-rotate"],
            wallpaperMinutesLabel: ["wallpaperMinutesLabel", "Every (minutes)"],
            wallpaperGalleryEmpty: ["wallpaperGalleryEmpty", "No wallpapers yet"],
            wallpaperPrevBtn: ["wallpaperPrev", "Previous"],
            wallpaperNextInnerBtn: ["wallpaperNextShort", "Next"],
            wallpaperShowHiddenLabel: ["wallpaperShowHidden", "Show hidden built-ins"],
            wallpaperUndoBtn: ["wallpaperRestoreAll", "Restore all"],
            wallpaperGalleryHint: ["wallpaperGalleryOpen", "Wallpaper gallery"],
            shortcutWallpaperHelp: ["wallpaperNext", "Next wallpaper"]
        };
        for (const [id, [key, fb]] of Object.entries(map)) { const el = $(id); if (el) el.textContent = t(key, fb); }
        const url = $("wallpaperUrlInput"); if (url) url.placeholder = t("wallpaperUrlPlaceholder", "https://… image or .mp4/.webm");

        const gb = $("wallpaperGalleryBtn"); if (gb) gb.setAttribute("aria-label", t("wallpaperGalleryOpen", "Wallpaper gallery"));
        const close = $("closeWallpaperGalleryBtn"); if (close) close.setAttribute("aria-label", t("wallpaperClose", "Close"));
    }

    function bindUi() {
        $("wallpaperPrevBtn")?.addEventListener("click", () => next(-1));
        $("wallpaperNextInnerBtn")?.addEventListener("click", () => next(1));
        $("wallpaperUndoBtn")?.addEventListener("click", () => undoRemove());
        $("wallpaperUnapplyBtn")?.addEventListener("click", cancelApply);
        $("wallpaperSelectModeBtn")?.addEventListener("click", () => { selectMode = !selectMode; if (!selectMode) selected.clear(); renderGallery(); });
        $("wallpaperDeleteSelectedBtn")?.addEventListener("click", async () => {
            const items = (await allItems()).filter(i => selected.has(i.id));
            selected.clear(); selectMode = false;
            if (items.length) await removeItems(items);
        });
        const showHidden = $("wallpaperShowHiddenCheckbox");
        if (showHidden) {
            showHidden.checked = localStorage.getItem(KEY_SHOW_HIDDEN) === "1";
            showHidden.addEventListener("change", () => { localStorage.setItem(KEY_SHOW_HIDDEN, showHidden.checked ? "1" : "0"); renderGallery(); });
        }
        $("wallpaperGalleryBtn")?.addEventListener("click", openGallery);
        $("closeWallpaperGalleryBtn")?.addEventListener("click", () => $("wallpaperGalleryDialog").close());
        $("wallpaperGalleryDialog")?.addEventListener("click", e => { if (e.target === e.currentTarget) e.currentTarget.close(); });
        $("wallpaperAddFilesBtn")?.addEventListener("click", () => $("wallpaperFileInput")?.click());
        $("wallpaperFileInput")?.addEventListener("change", async e => { await addFiles(e.target.files); e.target.value = ""; });
        $("wallpaperAddUrlBtn")?.addEventListener("click", async () => { const i = $("wallpaperUrlInput"); await addUrl(i.value); i.value = ""; });
        $("wallpaperUrlInput")?.addEventListener("keydown", async e => { if (e.key === "Enter") { e.preventDefault(); await addUrl(e.target.value); e.target.value = ""; } });
        const modeSel = $("wallpaperModeSelect");
        const minSel = $("wallpaperMinutesSelect");
        const updateRotationControls = () => {
            const rotating = modeSel?.value === "rotate";
            if (minSel) minSel.disabled = !rotating;
            const interval = $("wallpaperIntervalGroup");
            if (interval) interval.hidden = !rotating;
        };
        if (modeSel) {
            modeSel.value = mode();
            modeSel.addEventListener("change", () => { localStorage.setItem(KEY_MODE, modeSel.value); updateRotationControls(); scheduleRotate(); });
        }
        if (minSel) {
            minSel.value = String(minutes());
            updateRotationControls();
            minSel.addEventListener("change", () => { localStorage.setItem(KEY_MINUTES, minSel.value); scheduleRotate(); });
        }
        document.addEventListener("keydown", e => {
            if (!e.altKey || e.ctrlKey || e.metaKey) return;
            if (e.key !== "w" && e.key !== "W" && e.code !== "KeyW") return;
            const tag = document.activeElement?.tagName;
            if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || document.activeElement?.isContentEditable) return;
            e.preventDefault();
            next(e.shiftKey ? -1 : 1);
        });
    }

    async function init() {
        translateUi();
        bindUi();
        try {
            await seedDefaults();
            const currentId = localStorage.getItem(KEY_CURRENT);
            const m = mode();
            if (currentId === "none") { clearGalleryBackground(); }
            else if (m === "random" && currentId) {
                await random();
            } else if (m === "rotate" && currentId && Date.now() - Number(localStorage.getItem(KEY_LAST) || 0) > minutes() * 60000) {
                await next(1);
            } else if (currentId) {
                // Only take over when the user has chosen something from the gallery.
                if (!(await applyItem(await getItem(currentId), { persist: false }))) clearGalleryBackground();
            }
            scheduleRotate();
        } catch (e) {
            console.warn("MYNT wallpaper gallery init failed", e);
        }
    }

    // Cross-tab messages are invalidation only, never deletion instructions.
    // Re-read IndexedDB under the shared lock before changing a displayed image.
    let galleryChannel = null;
    try { if (typeof BroadcastChannel === "function") galleryChannel = new BroadcastChannel("mynt-wallpaper-gallery"); } catch (_) { /* Focus and storage events still refresh. */ }
    function notifyGalleryChange() { try { galleryChannel?.postMessage({ type: "changed" }); } catch (_) { /* Closed page. */ } }
    async function refreshSharedGallery(resumeVideo = false) {
        try {
            await withGalleryWrite(async () => {
                const current = localStorage.getItem(KEY_CURRENT);
                const applied = document.body.dataset.wallpaperId;
                if (applied) {
                    const item = await getItem(applied);
                    if (!item || item.removedAt || hiddenIds().has(applied) || current !== applied) clearGalleryBackground();
                }
                // Release a stale image even if another feature changed the body marker.
                if (imageOwnerId) {
                    const image = await getItem(imageOwnerId);
                    if (!image || image.removedAt) releaseGalleryImage();
                }
                if (current && current !== "none" && current !== document.body.dataset.wallpaperId) {
                    await applyItemUnlocked(await getItem(current), { persist: false });
                }
                if (resumeVideo === true && current && current === document.body.dataset.wallpaperId) syncVideoPlayback();
                scheduleRotate();
            });
            await renderGallery();
        } catch (_) { /* A failed read must not recreate data or delete another item. */ }
    }
    if (galleryChannel) galleryChannel.onmessage = event => { if (event.data?.type === "changed") refreshSharedGallery(); };
    window.addEventListener("storage", event => { if ([KEY_CURRENT, KEY_MODE, KEY_HIDDEN].includes(event.key)) refreshSharedGallery(); });
    window.addEventListener("focus", refreshSharedGallery);
    window.addEventListener("pagehide", event => {
        if (event.persisted) { resumeGalleryAfterHidden = resumeGalleryAfterHidden || Boolean(videoEl && !videoEl.paused); videoEl?.pause(); return; }
        releaseThumbs(); releaseGalleryImage(); stopGalleryVideo(); galleryChannel?.close();
    });
    window.addEventListener("pageshow", event => {
        if (event.persisted) {
            const resume = resumeGalleryAfterHidden || startGalleryWhenVisible;
            resumeGalleryAfterHidden = false; startGalleryWhenVisible = false;
            refreshSharedGallery(resume);
        }
    });


    // Narrow MCP operations: metadata only, optimistic revisions, and recoverable records.
    function remoteItemMetadata(item) {
        if (!item) return null;
        return { id: String(item.id), name: String(item.name || "").slice(0, 160), type: item.type === "video" ? "video" : "image",
            source: item.source === "bundled" ? "bundled" : "custom", removed: Boolean(item.removedAt), hidden: remoteHiddenIds().has(item.id),
            bytes: Number.isFinite(item.blob?.size) ? item.blob.size : null };
    }
    function remoteHiddenIds() {
        const raw = localStorage.getItem(KEY_HIDDEN);
        if (raw === null) return new Set();
        if (typeof raw !== "string" || raw.length > 4096) throw Error("Invalid stored wallpaper visibility; repair it in the browser before editing");
        let values; try { values = JSON.parse(raw); } catch (_) { throw Error("Invalid stored wallpaper visibility; no preferences were changed"); }
        if (!Array.isArray(values) || values.length > 100 || values.some(id => typeof id !== "string" || !id || id.length > 200) || new Set(values).size !== values.length) throw Error("Invalid stored wallpaper visibility; no preferences were changed");
        return new Set(values);
    }
    function remoteItemRevision(item) {
        return JSON.stringify({ item: item ? { id: item.id, name: item.name || "", type: item.type, source: item.source,
            added: item.added, removedAt: item.removedAt || null, bytes: item.blob?.size || 0, thumbBytes: item.thumb?.size || 0 } : null,
            current: localStorage.getItem(KEY_CURRENT), hidden: item ? remoteHiddenIds().has(item.id) : false, hiddenState: JSON.stringify([...remoteHiddenIds()].sort()) });
    }
    function remoteConflict(message) { const error = Error(message); error.code = "CONFLICT"; return error; }
    async function remoteGet(id) {
        const item = await getItem(id);
        if (!item) throw Error("Unknown wallpaper ID");
        return { item: remoteItemMetadata(item), itemRevision: remoteItemRevision(item) };
    }
    function remoteCancelRevision() {
        return JSON.stringify({ current: localStorage.getItem(KEY_CURRENT), mode: localStorage.getItem(KEY_MODE), applied: document.body.dataset.wallpaperId || null });
    }
    async function remoteCancel(expected, beforeMutation) {
        return withGalleryWrite(async () => {
            if (typeof beforeMutation !== "function") throw Error("Guard required");
            beforeMutation();
            if (remoteCancelRevision() !== expected) throw remoteConflict("Wallpaper selection changed");
            // Both local settings are verified; partial storage failures are reported, never hidden.
            localStorage.setItem(KEY_CURRENT, "none"); localStorage.setItem(KEY_MODE, "fixed");
            if (localStorage.getItem(KEY_CURRENT) !== "none" || localStorage.getItem(KEY_MODE) !== "fixed") throw Error("Wallpaper cancellation was not saved");
            scheduleRotate(); clearGalleryBackground(); $("videoBg")?.pause();
            const modeSelect = $("wallpaperModeSelect"); if (modeSelect) modeSelect.value = "fixed";
            const interval = $("wallpaperIntervalGroup"); if (interval) interval.hidden = true;
            const minutesSelect = $("wallpaperMinutesSelect"); if (minutesSelect) minutesSelect.disabled = true;
            notifyGalleryChange();
            await renderGallery();
            return { cancelled: true, cancelRevision: remoteCancelRevision() };
        });
    }
    async function remoteEdit(action, id, name, expected, beforeMutation) {
        return withGalleryWrite(async () => {
            if (typeof beforeMutation !== "function" || !["select", "rename", "remove", "restore", "undo"].includes(action)) throw Error("Invalid guarded gallery action");
            if (typeof id !== "string" || !id || id.length > 200) throw Error("Invalid wallpaper ID");
            if (action === "rename" && (typeof name !== "string" || !name.trim() || name.length > 60)) throw Error("Wallpaper name must contain 1–60 characters");
            if (action === "select") {
                const item = await getItem(id);
                if (!item || item.removedAt || hiddenIds().has(id)) throw Error("Restore this wallpaper before selecting it");
                const applied = await applyItemUnlocked(item, { beforeMutation: () => { beforeMutation(); if (remoteItemRevision(item) !== expected) throw remoteConflict("Wallpaper changed"); } });
                if (!applied || localStorage.getItem(KEY_CURRENT) !== id || document.body.dataset.wallpaperId !== id) throw Error("Wallpaper selection was not saved");
                return remoteGet(id);
            }
            const record = await getItem(id);
            if (record?.source === "bundled" && ["remove", "restore", "undo"].includes(action)) {
                if (remoteItemRevision(record) !== expected) throw remoteConflict("Wallpaper changed");
                if (action === "remove" && localStorage.getItem(KEY_CURRENT) === id) throw remoteConflict("Cancel or change the applied wallpaper before hiding it");
                const hidden = remoteHiddenIds(), hide = action === "remove";
                if (hidden.has(id) === hide) throw remoteConflict(hide ? "Wallpaper is already hidden" : "Wallpaper is not hidden");
                beforeMutation();
                if (remoteItemRevision(record) !== expected) throw remoteConflict("Wallpaper changed");
                if (hide) hidden.add(id); else hidden.delete(id);
                saveHidden(hidden);
                if (hiddenIds().has(id) !== hide) throw Error("Wallpaper visibility was not saved");
                notifyGalleryChange();
                await renderGallery();
                return remoteGet(id);
            }
            const database = await db();
            await new Promise((resolve, reject) => {
                const transaction = database.transaction(STORE, "readwrite"), store = transaction.objectStore(STORE);
                let failure;
                transaction.oncomplete = () => resolve();
                transaction.onerror = transaction.onabort = () => reject(failure || transaction.error || Error("Gallery transaction failed"));
                const request = store.get(id);
                request.onerror = () => { failure = request.error; transaction.abort(); };
                request.onsuccess = () => {
                    try {
                        const item = request.result;
                        if (!item) throw Error("Unknown wallpaper ID");
                        if (remoteItemRevision(item) !== expected) throw remoteConflict("Wallpaper changed");
                        if (["remove", "restore", "undo"].includes(action) && item.source === "bundled") throw remoteConflict("Wallpaper type changed");
                        if (action === "remove" && localStorage.getItem(KEY_CURRENT) === id) throw remoteConflict("Cancel or change the applied wallpaper before removing it");
                        const nextItem = { ...item };
                        if (action === "rename") nextItem.name = name.trim();
                        if (action === "remove") { if (item.removedAt) throw remoteConflict("Wallpaper is already removed"); nextItem.removedAt = Date.now(); }
                        if (action === "restore" || action === "undo") { if (!item.removedAt) throw remoteConflict("Wallpaper is not removed"); delete nextItem.removedAt; }
                        beforeMutation();
                        // No asynchronous gap between the gate/revision check and the IDB write.
                        if (remoteItemRevision(item) !== expected) throw remoteConflict("Wallpaper changed");
                        store.put(nextItem);
                    } catch (error) { failure = error; transaction.abort(); }
                };
            });
            beforeMutation(); // If access was revoked during commit, report it before further UI work.
            notifyGalleryChange();
            await renderGallery();
            return remoteGet(id);
        });
    }

    window.myntWallpaper = { remoteGet, remoteEdit, remoteCancel, remoteCancelRevision, runRemote(action, beforeMutation) { if(typeof beforeMutation!=="function")throw Error("Guard required"); if(action==="next")return next(1,beforeMutation);if(action==="previous")return next(-1,beforeMutation);if(action==="random")return random(beforeMutation);throw Error("Unsupported action"); }, cancelApply, useLegacy, restore: undoRemove, remove: removeItems, undo: undoRemove, all: allItems, next: () => next(1), previous: () => next(-1), random, open: openGallery, addFiles, addUrl, list: listItems };

    // Run after workspace restore (dashboard-tools) so our choice wins.
    if (document.readyState === "complete") setTimeout(init, 0);
    else window.addEventListener("load", () => setTimeout(init, 0), { once: true });
})();

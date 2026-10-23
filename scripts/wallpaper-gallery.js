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
            let result;
            Promise.resolve(fn(store)).then(r => { result = r; });
            transaction.oncomplete = () => resolve(result);
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
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
    const putItem = item => tx("readwrite", store => { store.put(item); });

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
        else if(resumeGalleryAfterHidden||startGalleryWhenVisible){resumeGalleryAfterHidden=false;startGalleryWhenVisible=false;syncVideoPlayback();}
    });

    function stopGalleryVideo() {
        startGalleryWhenVisible=false;resumeGalleryAfterHidden=false;
        document.body.dataset.galleryVideo = "off";
        if (videoEl) { videoEl.pause(); videoEl.removeAttribute("src"); videoEl.load(); }
        if (videoUrl) { URL.revokeObjectURL(videoUrl); videoUrl = null; }
    }

    // ---------- Apply ----------
    function clearGalleryBackground() {
        stopGalleryVideo();
        document.body.style.removeProperty("--bg-image");
        document.body.dataset.workspaceBackground = "color";
        document.body.dataset.bg = "color";
        delete document.body.dataset.wallpaperId;
    }
    async function cancelApply() {
        try {
            localStorage.setItem(KEY_CURRENT, "none");
            localStorage.setItem(KEY_MODE, "fixed");
            scheduleRotate();
            clearGalleryBackground();
            $("videoBg")?.pause();
            const modeSelect = $("wallpaperModeSelect");
            if (modeSelect) modeSelect.value = "fixed";
            const interval = $("wallpaperIntervalGroup"); if (interval) interval.hidden = true;
            const minutesSelect = $("wallpaperMinutesSelect"); if (minutesSelect) minutesSelect.disabled = true;
            await renderGallery();
            setStatus(t("wallpaperUnapplied", "Background removed from the home page. Gallery files are kept; rotation is stopped."));
        } catch (error) { setStatus(t("wallpaperActionError", "Could not save this change. Your media are unchanged.")); }
    }
    function useLegacy() {
        localStorage.removeItem(KEY_CURRENT);
        localStorage.setItem(KEY_MODE, "fixed");
        scheduleRotate(); stopGalleryVideo();
        document.body.dataset.workspaceBackground = "wallpaper";
        document.body.dataset.bg = "wallpaper";
        delete document.body.dataset.wallpaperId;
        renderSelection();
    }
    async function applyItem(item, { persist = true } = {}) {
        if (!item || item.removedAt) return false;
        if (item.type === "video") {
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
                if (imageUrl) { const old = imageUrl; requestAnimationFrame(() => URL.revokeObjectURL(old)); }
                imageUrl = url;
                if (persist && typeof saveImageToIndexedDB === "function") {
                    saveImageToIndexedDB(item.blob, false).catch(() => {});
                }
            } else if (item.src) {
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
        return true;
    }

    async function next(direction = 1) {
        const items = await listItems();
        if (!items.length) return false;
        const currentId = localStorage.getItem(KEY_CURRENT);
        const idx = items.findIndex(i => i.id === currentId);
        const target = items[(idx + direction + items.length) % items.length];
        return await applyItem(target);
    }
    async function random() {
        const items = await listItems();
        if (!items.length) return;
        const currentId = localStorage.getItem(KEY_CURRENT);
        const pool = items.length > 1 ? items.filter(i => i.id !== currentId) : items;
        await applyItem(pool[Math.floor(Math.random() * pool.length)]);
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
                // Keep the original blobs in the same local database. No permanent
                // deletion or time-limited recovery; no schema upgrade is needed.
                await tx("readwrite", store => {
                    for (const item of custom) store.put({ ...item, removedAt: Date.now() });
                });
            }
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
                if (!(await next(1))) {
                    localStorage.setItem(KEY_CURRENT, "none");
                    clearGalleryBackground();
                }
            }
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
            const removed = (await allItems(true)).filter(item => item.removedAt && (!onlyId || item.id === onlyId));
            const restoredIds = new Set([...removed, ...undoItems].map(item => item.id));
            await tx("readwrite", store => {
                for (const item of removed) {
                    const restored = { ...item }; delete restored.removedAt; store.put(restored);
                }
            });
            if (!onlyId && undoItems.length) {
                const hidden = hiddenIds();
                for (const item of undoItems) hidden.delete(item.id);
                saveHidden(hidden);
                undoItems = [];
            }
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
        item.name = name.trim().slice(0, 60);
        await putItem(item);
        await renderGallery();
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
            row.appendChild(name); row.appendChild(size); row.appendChild(restore); list.appendChild(row);
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
                    const h = hiddenIds(); h.delete(item.id); saveHidden(h);
                    await renderGallery();
                }
                applyItem(item);
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
                if (isHidden) { const h = hiddenIds(); h.delete(item.id); saveHidden(h); await renderGallery(); return; }
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

    window.myntWallpaper = { cancelApply, useLegacy, restore: undoRemove, remove: removeItems, undo: undoRemove, all: allItems, next: () => next(1), previous: () => next(-1), random, open: openGallery, addFiles, addUrl, list: listItems };

    // Run after workspace restore (dashboard-tools) so our choice wins.
    if (document.readyState === "complete") setTimeout(init, 0);
    else window.addEventListener("load", () => setTimeout(init, 0), { once: true });
})();

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
    async function allItems() {
        const items = await tx("readonly", store => reqP(store.getAll()));
        return (items || []).sort((a, b) => a.added - b.added);
    }
    // Items that take part in next/random/rotate (hidden built-ins excluded).
    async function listItems() {
        const hidden = hiddenIds();
        return (await allItems()).filter(i => !hidden.has(i.id));
    }
    const getItem = id => tx("readonly", store => reqP(store.get(id)));
    const putItem = item => tx("readwrite", store => { store.put(item); });
    const deleteItem = id => tx("readwrite", store => { store.delete(id); });

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
    async function applyItem(item, { persist = true } = {}) {
        if (!item) return false;
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
        if (!items.length) return;
        const currentId = localStorage.getItem(KEY_CURRENT);
        const idx = items.findIndex(i => i.id === currentId);
        const target = items[(idx + direction + items.length) % items.length];
        await applyItem(target);
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
    let undoTimer = null;
    let undoItems = [];

    function displayName(item) {
        if (item.name) return item.name;
        return item.type === "video" ? t("wallpaperVideoBadge", "Video") : t("wallpaperImage", "Image");
    }

    async function removeItems(items) {
        const hidden = hiddenIds();
        const removed = [];
        for (const item of items) {
            if (item.source === "bundled") hidden.add(item.id);
            else { await deleteItem(item.id); removed.push(item); }
        }
        saveHidden(hidden);
        undoItems = items;
        const wasCurrent = items.some(i => i.id === localStorage.getItem(KEY_CURRENT));
        if (wasCurrent) { localStorage.removeItem(KEY_CURRENT); await next(1); }
        showUndo(items.length);
        await renderGallery();
    }

    function showUndo(count) {
        const bar = $("wallpaperUndoBar");
        if (!bar) return;
        $("wallpaperUndoText").textContent = t("wallpaperDeletedCount", "Removed {count}").replace("{count}", count);
        bar.hidden = false;
        clearTimeout(undoTimer);
        undoTimer = setTimeout(() => { bar.hidden = true; undoItems = []; }, 8000);
    }

    async function undoRemove() {
        const hidden = hiddenIds();
        for (const item of undoItems) {
            if (item.source === "bundled") hidden.delete(item.id);
            else await putItem(item);
        }
        saveHidden(hidden);
        undoItems = [];
        $("wallpaperUndoBar").hidden = true;
        await renderGallery();
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

    async function renderGallery() {
        const grid = $("wallpaperGalleryGrid");
        if (!grid) return;
        releaseThumbs();
        grid.replaceChildren();
        const hidden = hiddenIds();
        const showHidden = localStorage.getItem(KEY_SHOW_HIDDEN) === "1";
        const items = (await allItems()).filter(i => showHidden || !hidden.has(i.id));
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
            del.textContent = item.source === "bundled" ? (isHidden ? "↺" : "⊘") : "🗑";
            del.title = delLabel; del.setAttribute("aria-label", delLabel);
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
            card.classList.toggle("active", card.dataset.id === currentId);
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
        if (mode() !== "rotate") return;
        rotateTimer = setInterval(() => {
            if (document.visibilityState === "visible") next(1);
        }, minutes() * 60 * 1000);
    }

    function translateUi() {
        const map = {
            wallpaperGalleryTitle: ["wallpaperGalleryTitle", "Wallpapers"],
            wallpaperGalleryEyebrow: ["wallpaperGalleryEyebrow", "Background"],
            wallpaperAddFilesLabel: ["wallpaperAddFiles", "Add images / videos"],
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
            wallpaperUndoBtn: ["wallpaperUndo", "Undo"],
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
        $("wallpaperUndoBtn")?.addEventListener("click", undoRemove);
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
        $("wallpaperFileInput")?.addEventListener("change", async e => { await addFiles(e.target.files); e.target.value = ""; });
        $("wallpaperAddUrlBtn")?.addEventListener("click", async () => { const i = $("wallpaperUrlInput"); await addUrl(i.value); i.value = ""; });
        $("wallpaperUrlInput")?.addEventListener("keydown", async e => { if (e.key === "Enter") { e.preventDefault(); await addUrl(e.target.value); e.target.value = ""; } });
        const modeSel = $("wallpaperModeSelect");
        const minSel = $("wallpaperMinutesSelect");
        if (modeSel) {
            modeSel.value = mode();
            modeSel.addEventListener("change", () => { localStorage.setItem(KEY_MODE, modeSel.value); minSel.disabled = modeSel.value !== "rotate"; scheduleRotate(); });
        }
        if (minSel) {
            minSel.value = String(minutes());
            minSel.disabled = mode() !== "rotate";
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
            if (m === "random" && currentId) {
                await random();
            } else if (m === "rotate" && currentId && Date.now() - Number(localStorage.getItem(KEY_LAST) || 0) > minutes() * 60000) {
                await next(1);
            } else if (currentId) {
                // Only take over when the user has chosen something from the gallery.
                await applyItem(await getItem(currentId), { persist: false });
            }
            scheduleRotate();
        } catch (e) {
            console.warn("MYNT wallpaper gallery init failed", e);
        }
    }

    window.myntWallpaper = { remove: removeItems, undo: undoRemove, all: allItems, next: () => next(1), previous: () => next(-1), random, open: openGallery, addFiles, addUrl, list: listItems };

    // Run after workspace restore (dashboard-tools) so our choice wins.
    if (document.readyState === "complete") setTimeout(init, 0);
    else window.addEventListener("load", () => setTimeout(init, 0), { once: true });
})();

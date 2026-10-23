/* Local-only Pomodoro miniwindow and appearance. GPL-3.0. */
(() => {
    'use strict';
    const KEY = 'myntPomodoroAppearance.v1';
    const MAX_IMAGE = 8 * 1024 * 1024;
    const defaults = { version: 1, mode: 'original', color: '#243247', color2: '#765b91', fit: 'cover', position: '50% 50%' };
    const labels = {
        float: ['Open floating timer', '開啟懸浮番茄鐘'], popup: ['Open ordinary timer window', '開啟一般計時視窗'],
        appearance: ['Timer background', '番茄鐘背景'], original: ['Original background', '原版背景'], home: ['Follow homepage', '跟隨首頁'], image: ['Local image', '本機圖片'],
        color: ['Solid color', '單色'], gradient: ['Gradient', '漸層'], color2: ['Second color', '第二個顏色'],
        previewUnavailable: ['Preview unavailable', '尚無預覽'],
        compact: ['Compact window', '縮小視窗'], compactPending: ['Requesting a compact window…', '正在要求縮小視窗…'],
        compactDone: ['Compact window size applied.', '已套用小視窗尺寸。'],
        compactLimited: ['This browser did not apply the compact size. Drag the window edges to resize it.', '此瀏覽器未套用小視窗尺寸，請拖曳視窗邊緣調整。'],
        adjustImage: ['Image framing', '圖片構圖'], localOnly: ['Images stay on this device. Nothing is uploaded.', '圖片僅儲存在此裝置，不會上傳。'],
        fit: ['Image fit', '圖片縮放'], cover: ['Crop to fill', '裁切填滿'], contain: ['Show whole image', '顯示完整圖片'],
        position: ['Crop position', '裁切位置'], center: ['Center', '中央'], top: ['Top', '頂端'], bottom: ['Bottom', '底端'],
        upload: ['Choose local image (PNG, JPEG, WebP; max 8 MiB)', '選擇本機圖片（PNG、JPEG、WebP；上限 8 MiB）'],
        resetConfirm: ['Reset this timer and discard its progress?', '要重設此計時器並捨棄目前進度嗎？'],
        confirm: ['Confirm', '確認'], cancel: ['Cancel', '取消'],
        deleteConfirm: ['Delete the saved timer image? You can undo this while this tab stays open.', '要刪除已儲存的番茄鐘圖片嗎？只要此分頁仍開啟，就可以復原。'],
        undo: ['Undo image deletion', '復原圖片刪除'], deleted: ['Image deleted. Undo is available until this tab closes or another image is saved.', '圖片已刪除。在關閉此分頁或儲存另一張圖片前，您可以復原。'],
        remove: ['Delete saved image', '刪除已儲存圖片'], error: ['Could not save image/settings. Check format, size, and storage space.', '無法儲存圖片或設定，請檢查格式、大小及儲存空間。'],
        blocked: ['Window blocked. Allow this popup and try again.', '視窗遭封鎖，請允許此彈出視窗後再試一次。'],
        unsupported: ['Floating mode unavailable. Use the ordinary window button (not always on top).', '無法使用置頂模式，請改用一般視窗按鈕（不會保持置頂）。'],
        note: ['Keep the original tab open. Ordinary windows are not always on top.', '請保持原分頁開啟。一般視窗不會保持置頂。'],
        disconnected: ['Original tab closed. Reopen the new tab to continue; this window no longer controls the timer.', '原分頁已關閉。請重新開啟新分頁繼續，此視窗已無法控制計時器。'],
        options: ['Timer options', '計時選項'], task: ['Focus task', '專注任務'], start: ['Start', '開始'], pause: ['Pause', '暫停'], reset: ['Reset', '重設'],
        extend: ['+5 minutes', '加 5 分鐘'], close: ['Close window', '關閉視窗'], work: ['Focus', '專注'], shortBreak: ['Short break', '短休息'], longBreak: ['Long break', '長休息'],
        round: ['Round', '回合'], ready: ['Saved on this device only.', '僅儲存在此裝置。'], missing: ['Choose a local image first.', '請先選擇本機圖片。']
    };
    function t(key) {
        const lang = typeof currentLanguage !== 'undefined' ? currentLanguage : document.documentElement.lang;
        const fallback = labels[key]?.[/^zh([_-]TW|[-]Hant)?$/i.test(lang || '') ? 1 : 0] || key;
        return typeof translations !== 'undefined' && translations[lang]?.['pomoFloat_' + key] || fallback;
    }
    function validate(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid settings');
        const out = { ...defaults };
        for (const key of ['mode', 'color', 'color2', 'fit', 'position']) if (value[key] !== undefined) out[key] = value[key];
        if (!['original', 'home', 'image', 'color', 'gradient'].includes(out.mode) || !['cover', 'contain'].includes(out.fit) ||
            !['50% 50%', '50% 0%', '50% 100%'].includes(out.position) || !/^#[0-9a-f]{6}$/i.test(out.color) || !/^#[0-9a-f]{6}$/i.test(out.color2)) throw new Error('Invalid settings');
        return out;
    }
    function validImage(file) { return !!file && ['image/png', 'image/jpeg', 'image/webp'].includes(file.type) && file.size > 0 && file.size <= MAX_IMAGE; }
    const RING_CIRCUMFERENCE = 2 * Math.PI * 70;
    function progressOffset(remaining, total) {
        const progress = Number.isFinite(remaining) && Number.isFinite(total) && total > 0 ? Math.min(1, Math.max(0, remaining / total)) : 0;
        return RING_CIRCUMFERENCE * (1 - progress);
    }
    function rgb(value) {
        if (typeof value !== 'string') return null;
        const color = value.trim();
        if (/^#[0-9a-f]{3}$/i.test(color)) return color.slice(1).split('').map(channel => parseInt(channel + channel, 16));
        if (/^#[0-9a-f]{6}$/i.test(color)) return [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16));
        const match = color.match(/^rgb\(\s*(\d{1,3})[, ]+\s*(\d{1,3})[, ]+\s*(\d{1,3})\s*\)$/i);
        return match && match.slice(1).every(channel => Number(channel) <= 255) ? match.slice(1).map(Number) : null;
    }
    function luminance(color) {
        return color.reduce((sum, value, index) => {
            const channel = value / 255;
            return sum + (channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][index];
        }, 0);
    }
    function contrast(first, second) { const a = luminance(first), b = luminance(second); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); }
    function paletteFor(colors = [], imagery = false, themeColors = []) {
        const darkInk = [23, 36, 59], lightInk = [246, 248, 255];
        const samples = colors.filter(color => Array.isArray(color) && color.length === 3 && color.every(value => Number.isFinite(value) && value >= 0 && value <= 255));
        const darkContrast = samples.length ? Math.min(...samples.map(color => contrast(darkInk, color))) : 0;
        const lightContrast = samples.length ? Math.min(...samples.map(color => contrast(lightInk, color))) : 0;
        const light = samples.length > 0 && (darkContrast >= 4.5 || (lightContrast < 4.5 && samples.reduce((sum, color) => sum + luminance(color), 0) / samples.length > .42));
        const textured = imagery || Math.max(darkContrast, lightContrast) < 4.5;
        const surface = light ? [250, 252, 255] : [13, 24, 42];
        const worstSurface = surface.map(channel => channel * .94 + (light ? 0 : 255) * .06);
        const candidates = themeColors.map(rgb).filter(Boolean);
        let accent = candidates.find(color => contrast(color, worstSurface) >= 4.5);
        if (!accent) {
            // Retain the selected Material hue, adjusting only as much as readability needs.
            const base = candidates[0] || (light ? darkInk : lightInk), endpoint = light ? 0 : 255;
            accent = base;
            for (let step = 1; contrast(accent, worstSurface) < 4.5 && step <= 20; step++) accent = base.map(channel => Math.round(channel + (endpoint - channel) * step / 20));
        }
        const hex = color => '#' + color.map(channel => Math.round(channel).toString(16).padStart(2, '0')).join('');
        const onAccent = contrast(accent, darkInk) >= contrast(accent, [255, 255, 255]) ? darkInk : [255, 255, 255];
        return {
            '--pomo-fg': light ? '#17243b' : '#f6f8ff',
            '--pomo-accent': hex(accent),
            '--pomo-on-accent': hex(onAccent),
            '--pomo-muted': light ? '#35465e' : '#d5deeb',
            '--pomo-surface': light ? 'rgba(250, 252, 255, .94)' : 'rgba(13, 24, 42, .94)',
            '--pomo-border': light ? 'rgba(23, 36, 59, .26)' : 'rgba(222, 234, 255, .3)',
            '--pomo-overlay': !textured ? 'none' : light
                ? 'linear-gradient(180deg, rgba(250, 252, 255, .06), rgba(250, 252, 255, .16) 45%, rgba(250, 252, 255, .28))'
                : 'linear-gradient(180deg, rgba(9, 18, 32, .06), rgba(9, 18, 32, .2) 45%, rgba(9, 18, 32, .34))',
            '--pomo-float-scrim': !textured ? 'none' : light ? 'linear-gradient(180deg, rgba(250,252,255,.48), rgba(250,252,255,.32) 40%, rgba(250,252,255,.64))' : 'linear-gradient(180deg, rgba(9,18,32,.36), rgba(9,18,32,.28) 40%, rgba(9,18,32,.58))',
            '--pomo-scheme': light ? 'light' : 'dark',
            '--pomo-text-shadow': 'none'
        };
    }
    function pipOptions() { return { width: 320, height: 420, preferInitialWindowPlacement: true }; }
    function compactWindowSize(win) {
        const chrome = (outer, inner) => Number.isFinite(outer) && Number.isFinite(inner) && inner > 0 ? Math.min(160, Math.max(0, outer - inner)) : 0;
        return { width: 320 + chrome(win.outerWidth, win.innerWidth), height: 420 + chrome(win.outerHeight, win.innerHeight) };
    }
    function isCompactWindow(win) { return win.innerWidth > 0 && win.innerWidth <= 336 && win.innerHeight > 0 && win.innerHeight <= 436; }
    // Pure helpers are exported for dependency-free regression checks, not persisted.
    if (typeof module !== 'undefined' && module.exports) { module.exports = { validate, validImage, progressOffset, paletteFor, contrast, rgb, pipOptions, compactWindowSize, isCompactWindow }; return; }
    let settings = { ...defaults }, imageUrl = '', floating = null, opening = false, unsubscribe = null;
    let status, appearanceForm, floatVideo;
    const imageSamples = new Map(), modeChoices = new Map(), settingGroups = new Map(), thumbnailCache = new WeakMap();
    try { settings = validate(JSON.parse(localStorage.getItem(KEY)) || defaults); } catch (_) { /* safe defaults */ }
    function el(doc, tag, text, className) { const node = doc.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node; }
    function button(doc, label, action) { const node = el(doc, 'button', t(label)); node.type = 'button'; node.addEventListener('click', action); return node; }
    async function imageStore(mode, file) {
        const db = await new Promise((resolve, reject) => {
            const req = indexedDB.open('MyntPomodoroAppearance', 1);
            req.onupgradeneeded = () => req.result.createObjectStore('images');
            req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); req.onblocked = () => reject(new Error('Database blocked'));
        });
        try { return await new Promise((resolve, reject) => {
            const tx = db.transaction('images', mode === 'get' ? 'readonly' : 'readwrite');
            const store = tx.objectStore('images');
            const req = mode === 'get' ? store.get('background') : mode === 'delete' ? store.delete('background') : store.put(file, 'background');
            tx.oncomplete = () => resolve(req.result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
        }); } finally { db.close(); }
    }
    async function decodeImage(file) {
        if (!validImage(file)) throw new Error('Unsupported image');
        const url = URL.createObjectURL(file);
        try {
            const img = new Image(); img.src = url; await img.decode();
            if (!img.naturalWidth || img.naturalWidth * img.naturalHeight > 32000000) throw new Error('Image dimensions too large');
            // Sample only the validated local Blob. No remote image fetches or persisted metadata.
            try {
                const canvas = document.createElement('canvas'); canvas.width = 12; canvas.height = 12;
                const context = canvas.getContext('2d', { willReadFrequently: true });
                context.fillStyle = defaults.color; context.fillRect(0, 0, 12, 12); context.drawImage(img, 0, 0, 12, 12);
                const pixels = context.getImageData(0, 0, 12, 12).data, samples = [];
                for (let index = 0; index < pixels.length; index += 4) samples.push([pixels[index], pixels[index + 1], pixels[index + 2]]);
                imageSamples.set(url, samples);
            } catch (_) { /* A neutral readable surface is safe when pixel sampling is unavailable. */ }
        } catch (error) { URL.revokeObjectURL(url); throw error; }
        return url;
    }
    function setImage(url) { const previous = imageUrl; imageUrl = url; renderAppearance(); syncForm(); if (previous) { imageSamples.delete(previous); URL.revokeObjectURL(previous); } }
    function paint(target) {
        if (!target) return;
        // Preserve saved home-following choices. Without a homepage image, use the
        // original timer video/theme rather than the independent color preference.
        const theme = getComputedStyle(document.body);
        const home = settings.mode === 'home' ? theme.getPropertyValue('--bg-image').trim() : '';
        const original = settings.mode === 'original' || (settings.mode === 'home' && (!home || home === 'none'));
        const samples = settings.mode === 'color' ? [rgb(settings.color)] : settings.mode === 'gradient'
            ? Array.from({ length: 9 }, (_, index) => rgb(settings.color).map((value, channel) => value + (rgb(settings.color2)[channel] - value) * index / 8))
            : settings.mode === 'image' ? imageSamples.get(imageUrl) || [] : [];
        const palette = paletteFor(samples, original || settings.mode === 'home' || settings.mode === 'image',
            ['--bg-color-blue', '--darkColor-blue', '--accentLightTint-blue', '--darkerColor-blue'].map(key => theme.getPropertyValue(key).trim()));
        for (const [key, value] of Object.entries(palette)) target.style.setProperty(key, value);
        target.classList.toggle('mynt-pomo-static', !original);
        if (original) {
            for (const property of ['--pomo-background', '--pomo-color', '--pomo-fit', '--pomo-position']) target.style.removeProperty(property);
            return;
        }
        const bg = settings.mode === 'home' ? home : settings.mode === 'gradient' ? `linear-gradient(135deg, ${settings.color}, ${settings.color2})` : settings.mode === 'image' && imageUrl ? `url("${imageUrl}")` : 'none';
        target.style.setProperty('--pomo-background', bg);
        target.style.setProperty('--pomo-color', settings.mode === 'home' ? theme.getPropertyValue('--bg-color-blue').trim() || '#bbd6fd' : settings.color);
        target.style.setProperty('--pomo-fit', settings.fit);
        target.style.setProperty('--pomo-position', settings.position);
    }
    function syncFloatVideo() {
        if (!floatVideo || !floating || floating.closed) return;
        const root = floating.document.documentElement;
        const reduceMotion = root.classList.contains('myntReducedMotion') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const highContrast = root.classList.contains('myntHighContrast') || window.matchMedia?.('(forced-colors: active)').matches;
        if (floating.document.getElementById('myntPomoFloatCard').classList.contains('mynt-pomo-static') || reduceMotion || highContrast || floating.document.hidden) floatVideo.pause();
        else floatVideo.play().catch(() => { /* The theme-colored card remains usable if video playback is unavailable. */ });
    }
    function renderAppearance() {
        paint(document.getElementById('pomodoroPanel'));
        syncForm();
        if (!floating || floating.closed) return;
        const doc = floating.document;
        // Copy only the existing design tokens and accessibility preferences, not arbitrary styles.
        const theme = getComputedStyle(document.body), root = getComputedStyle(document.documentElement);
        for (const key of ['--main-font-family', '--bg-color-blue', '--accentLightTint-blue', '--textColorDark-blue', '--darkColor-blue', '--darkerColor-blue', '--whitishColor-blue', '--onActionColor-blue']) {
            const value = theme.getPropertyValue(key).trim();
            if (value) doc.documentElement.style.setProperty(key, value);
            else doc.documentElement.style.removeProperty(key);
        }
        doc.documentElement.style.setProperty('--mynt-font-scale', root.getPropertyValue('--mynt-font-scale').trim() || '1');
        doc.documentElement.style.fontSize = root.fontSize || 'calc(16px * var(--mynt-font-scale, 1))';
        for (const name of ['myntReducedMotion', 'myntHighContrast']) doc.documentElement.classList.toggle(name, document.documentElement.classList.contains(name));
        doc.body.classList.toggle('black-theme', document.body.classList.contains('black-theme'));
        paint(doc.getElementById('myntPomoFloatCard'));
        syncFloatVideo();
    }
    function applySettings(value) {
        const next = validate(value);
        localStorage.setItem(KEY, JSON.stringify(next));
        settings = next; renderAppearance(); syncForm();
        return { ...settings };
    }
    window.myntPomoAppearance = { getSettings: () => ({ ...settings }), applySettings };
    function videoThumbnail(video) {
        if (!video || video.readyState < 2 || !video.videoWidth) return '';
        const source = video.currentSrc || video.src;
        const cached = thumbnailCache.get(video);
        if (cached && cached.source === source) return cached.url;
        let url = '';
        try {
            // One small snapshot of the already-decoded local video, never another player or per-frame work.
            const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 80;
            canvas.getContext('2d').drawImage(video, 0, 0, 128, 80);
            url = `url("${canvas.toDataURL('image/jpeg', .65)}")`;
        } catch (_) { /* Keep the visibly labelled placeholder when a snapshot is unavailable. */ }
        thumbnailCache.set(video, { source, url }); return url;
    }
    function syncForm() {
        if (!appearanceForm) return;
        for (const key of ['color', 'color2', 'fit', 'position']) appearanceForm.elements.namedItem(key).value = settings[key];
        const home = getComputedStyle(document.body).getPropertyValue('--bg-image').trim();
        const originalPreview = videoThumbnail(document.getElementById('pomodoroPanel')?.querySelector('.pomodoro-bg-video'));
        const previews = {
            original: originalPreview || 'radial-gradient(ellipse at 25% 20%, #c7d6b5 0, transparent 54%), linear-gradient(135deg, #33584f, #1f314d 60%, #916d6a)',
            home: home && home !== 'none' ? home : originalPreview || 'linear-gradient(135deg, #e1ebfa, #7f9bbd)',
            image: imageUrl ? `url("${imageUrl}")` : 'linear-gradient(135deg, #b5c5dc, #edf2fa)',
            color: `linear-gradient(${settings.color}, ${settings.color})`,
            gradient: `linear-gradient(135deg, ${settings.color}, ${settings.color2})`
        };
        for (const [mode, { input, tile, preview, fallback }] of modeChoices) {
            input.checked = mode === settings.mode; tile.classList.toggle('is-selected', input.checked);
            preview.style.setProperty('background-image', previews[mode]);
            fallback.hidden = mode === 'original' ? !!originalPreview : mode === 'home' ? !!originalPreview || !!home && home !== 'none' : true;
            if (mode === 'image') {
                preview.style.setProperty('background-size', settings.fit);
                preview.style.setProperty('background-position', settings.position);
            }
        }
        for (const [name, group] of settingGroups) {
            group.hidden = name === 'image' ? settings.mode !== 'image' : name === 'color' ? !['color', 'gradient'].includes(settings.mode)
                : name === 'color2' ? settings.mode !== 'gradient' : !['image', 'home'].includes(settings.mode);
        }
    }
    function buildSettings(mount) {
        const details = el(document, 'details', '', 'mynt-pomo-appearance'); details.append(el(document, 'summary', t('appearance')));
        const form = el(document, 'form'); appearanceForm = form; form.addEventListener('submit', event => event.preventDefault());
        const row = (key, node, parent = form) => { const label = el(document, 'label', t(key)); label.append(node); parent.append(label); return label; };
        const select = (key, choices) => { const node = el(document, 'select'); node.name = key; for (const [value, label] of choices) { const option = el(document, 'option', t(label)); option.value = value; node.append(option); } return node; };
        const choices = el(document, 'fieldset', '', 'mynt-pomo-background-choices');
        choices.append(el(document, 'legend', t('appearance'), 'mynt-pomo-sr-only'));
        for (const mode of ['original', 'home', 'image', 'color', 'gradient']) {
            const tile = el(document, 'label', '', 'mynt-pomo-background-choice');
            const input = el(document, 'input', '', 'mynt-pomo-sr-only'); input.type = 'radio'; input.name = 'mode'; input.value = mode;
            const preview = el(document, 'span', '', 'mynt-pomo-background-preview'); preview.setAttribute('aria-hidden', 'true');
            if (mode === 'image') preview.append(el(document, 'span', '▧', 'mynt-pomo-image-symbol'));
            const fallback = el(document, 'span', t('previewUnavailable'), 'mynt-pomo-preview-fallback'); fallback.hidden = true; preview.append(fallback);
            tile.append(input, preview, el(document, 'span', t(mode), 'mynt-pomo-background-label'));
            choices.append(tile); modeChoices.set(mode, { input, tile, preview, fallback });
        }
        form.append(choices);
        for (const key of ['color', 'color2']) { const input = el(document, 'input'); input.type = 'color'; input.name = key; settingGroups.set(key, row(key, input)); }
        const imageControls = el(document, 'div', '', 'mynt-pomo-image-controls'); form.append(imageControls); settingGroups.set('image', imageControls);
        imageControls.append(el(document, 'p', t('localOnly'), 'mynt-pomo-note'));
        const framing = el(document, 'details', '', 'mynt-pomo-image-framing'); framing.append(el(document, 'summary', t('adjustImage')));
        row('fit', select('fit', [['cover', 'cover'], ['contain', 'contain']]), framing);
        row('position', select('position', [['50% 50%', 'center'], ['50% 0%', 'top'], ['50% 100%', 'bottom']]), framing);
        settingGroups.set('framing', framing);
        form.addEventListener('change', event => {
            if (!['mode', 'color', 'color2', 'fit', 'position'].includes(event.target.name)) return;
            try { applySettings({ ...settings, [event.target.name]: event.target.value }); status.textContent = settings.mode === 'image' && !imageUrl ? t('missing') : t('ready'); }
            catch (_) { status.textContent = t('error'); syncForm(); }
        });
        details.addEventListener('keydown', event => { if (event.key === 'Escape' && details.open) { event.preventDefault(); event.stopPropagation(); details.open = false; details.querySelector('summary').focus(); } });
        let deletedImage = null;
        const undo = button(document, 'undo', async () => {
            if (!deletedImage) return;
            undo.disabled = true; input.disabled = true; remove.disabled = true; let url = '';
            try {
                url = await decodeImage(deletedImage.blob);
                await imageStore('put', deletedImage.blob);
                setImage(url); url = ''; applySettings(deletedImage.settings);
                deletedImage = null; undo.hidden = true; status.textContent = t('ready');
            } catch (_) { if (url) URL.revokeObjectURL(url); status.textContent = t('error'); }
            finally { undo.disabled = false; input.disabled = false; remove.disabled = false; }
        });
        undo.hidden = true;
        const input = el(document, 'input'); input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp';
        row('upload', input, imageControls);
        input.addEventListener('change', async () => {
            const file = input.files[0]; if (!file) return; input.disabled = true; remove.disabled = true; undo.disabled = true; let url = '';
            try {
                url = await decodeImage(file);
                await imageStore('put', file);
                setImage(url); url = ''; applySettings({ ...settings, mode: 'image' }); deletedImage = null; undo.hidden = true; status.textContent = t('ready');
            } catch (_) { if (url) URL.revokeObjectURL(url); status.textContent = t('error'); }
            finally { input.value = ''; input.disabled = false; remove.disabled = false; undo.disabled = false; }
        });
        const remove = button(document, 'remove', async () => {
            if (!window.confirm(t('deleteConfirm'))) return;
            remove.disabled = true; input.disabled = true; undo.disabled = true;
            try {
                const blob = await imageStore('get');
                if (!blob) { status.textContent = t('missing'); return; }
                const previous = { blob, settings: { ...settings } };
                await imageStore('delete'); deletedImage = previous; undo.hidden = false;
                setImage(''); if (settings.mode === 'image') applySettings({ ...settings, mode: 'home' }); status.textContent = t('deleted');
            } catch (_) { status.textContent = t('error'); }
            finally { remove.disabled = false; input.disabled = false; undo.disabled = false; }
        });
        imageControls.append(remove); form.append(framing, undo);
        details.append(form); mount.append(details); syncForm();
    }
    function clearFloat(win) {
        if (floating !== win) return;
        if (unsubscribe) unsubscribe(); unsubscribe = null;
        if (floatVideo) floatVideo.pause(); floatVideo = null; floating = null;
    }
    function constructFloat(win, ordinary) {
        const doc = win.document; doc.title = t('float'); doc.documentElement.lang = document.documentElement.lang;
        // Copy only this packaged stylesheet, never arbitrary page styles or remote scripts.
        const css = doc.createElement('link'); css.rel = 'stylesheet'; css.href = new URL('styles/pomodoro-float.css', document.baseURI).href; doc.head.append(css);
        doc.body.replaceChildren(); doc.body.className = 'mynt-pomo-float';
        const main = el(doc, 'main', '', 'mynt-pomo-card'); main.id = 'myntPomoFloatCard';
        const heading = el(doc, 'h1', t('float'), 'mynt-pomo-sr-only'); main.append(heading);
        floatVideo = el(doc, 'video', '', 'pomodoro-bg-video');
        floatVideo.src = new URL('videos/pomodoro-bg.mp4', document.baseURI).href;
        floatVideo.loop = true; floatVideo.muted = true; floatVideo.playsInline = true; floatVideo.preload = 'none';
        floatVideo.setAttribute('aria-hidden', 'true');
        main.append(floatVideo, el(doc, 'div', '', 'pomodoro-bg-overlay'));
        const phase = el(doc, 'p', '', 'pomodoroPhaseLabel');
        const circle = el(doc, 'div', '', 'pomodoroCircleWrap');
        const svgNode = (tag, attributes) => {
            const node = doc.createElementNS('http://www.w3.org/2000/svg', tag);
            for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
            return node;
        };
        const ring = svgNode('svg', { class: 'pomodoroProgressRing', viewBox: '0 0 160 160', 'aria-hidden': 'true', focusable: 'false' });
        const track = svgNode('circle', { class: 'pomodoroRingBg', cx: 80, cy: 80, r: 70 });
        const progress = svgNode('circle', { class: 'pomodoroRingFg', cx: 80, cy: 80, r: 70 });
        progress.style.strokeDasharray = String(RING_CIRCUMFERENCE); ring.append(track, progress);
        const timer = el(doc, 'div', '', 'pomodoroTimeDisplay'); timer.setAttribute('role', 'timer'); timer.setAttribute('aria-live', 'off');
        circle.append(ring, timer);
        const round = el(doc, 'p', '', 'pomodoroRoundDisplay');
        const taskPreview = el(doc, 'p', '', 'mynt-pomo-task-preview'); taskPreview.hidden = true;
        const context = el(doc, 'div', '', 'mynt-pomo-context'); context.append(taskPreview, round);
        main.append(phase, circle, context);
        const controls = el(doc, 'div', '', 'mynt-pomo-controls');
        const note = el(doc, 'p', '', 'mynt-pomo-note'); note.setAttribute('role', 'status');
        const setNote = (key, quiet = false) => { note.textContent = t(key); note.classList.toggle('mynt-pomo-sr-only', quiet); };
        const run = (method, ...args) => Promise.resolve().then(() => window.myntPomodoro[method](...args)).catch(() => { setNote('error'); });
        const icon = (path) => {
            const svg = svgNode('svg', { viewBox: '0 0 24 24', width: 24, height: 24, 'aria-hidden': 'true', focusable: 'false' });
            svg.append(svgNode('path', { d: path })); return svg;
        };
        const playPath = 'M8 5v14l11-7z', pausePath = 'M6 19h4V5H6zm8-14v14h4V5z';
        const toggle = button(doc, 'start', () => run(window.myntPomodoro.getState().isRunning ? 'pause' : 'start'));
        toggle.className = 'mynt-pomo-primary';
        const toggleIcon = icon(playPath), toggleLabel = el(doc, 'span', t('start'));
        toggle.replaceChildren(toggleIcon, toggleLabel);
        const reset = button(doc, 'reset', confirmReset); reset.className = 'mynt-pomo-reset';
        reset.title = t('reset'); reset.setAttribute('aria-label', t('reset'));
        reset.replaceChildren(icon('M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 16.22 7.78L13 11h7V4z'));
        controls.append(toggle, reset); main.append(controls);
        let resetPrompt = null;
        function confirmReset() {
            if (resetPrompt) return;
            const state = window.myntPomodoro.getState();
            if (!(state.isRunning || state.timeRemaining !== state.totalTime || state.phase !== 'work' || state.currentRound !== 1)) return run('reset');
            resetPrompt = el(doc, 'section', '', 'mynt-pomo-confirm');
            resetPrompt.setAttribute('role', 'group'); resetPrompt.setAttribute('aria-label', t('resetConfirm'));
            const message = el(doc, 'p', t('resetConfirm')); message.setAttribute('role', 'alert');
            const dismiss = () => { resetPrompt.remove(); resetPrompt = null; reset.focus(); };
            const cancel = button(doc, 'cancel', dismiss);
            resetPrompt.append(message, button(doc, 'confirm', () => { dismiss(); return run('reset'); }), cancel);
            resetPrompt.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); } });
            controls.after(resetPrompt); cancel.focus();
        }
        const options = el(doc, 'details', '', 'mynt-pomo-options');
        const summary = el(doc, 'summary', t('options')); options.append(summary);
        const taskLabel = el(doc, 'label', t('task')); const task = el(doc, 'input'); task.type = 'text'; task.maxLength = 300; task.placeholder = t('task');
        taskLabel.append(task); task.addEventListener('change', () => run('setTask', task.value));
        const secondary = el(doc, 'div', '', 'mynt-pomo-secondary');
        const close = button(doc, 'close', () => win.close());
        secondary.append(button(doc, 'extend', () => run('extend', 5)), close);
        if (!ordinary) {
            const compact = button(doc, 'compact', () => {
                if (compact.disabled) return;
                compact.disabled = true;
                try {
                    // Document PiP resizeTo is supported from a direct user gesture (Chrome 121+).
                    // It uses outer-window pixels, unlike requestWindow's viewport size hints.
                    // https://developer.chrome.com/docs/web-platform/document-picture-in-picture#resize_the_pip_window
                    const size = compactWindowSize(win);
                    win.resizeTo(size.width, size.height);
                    setNote('compactPending', true);
                    win.setTimeout(() => {
                        if (win.closed) return;
                        const applied = isCompactWindow(win);
                        setNote(applied ? 'compactDone' : 'compactLimited', applied);
                        compact.disabled = false;
                        if (applied) {
                            options.open = false;
                            summary.focus({ preventScroll: true });
                            win.scrollTo(0, 0);
                        }
                    }, 400);
                } catch (_) { compact.disabled = false; setNote('compactLimited'); }
            });
            compact.className = 'mynt-pomo-compact'; secondary.append(compact);
        }
        options.append(taskLabel, secondary, el(doc, 'p', t('note'), 'mynt-pomo-note'));
        main.append(options, note); doc.body.append(main);
        const render = state => {
            if (!state || win.closed) return;
            const seconds = Math.max(0, Math.ceil(state.timeRemaining));
            timer.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
            phase.textContent = t(state.phase);
            phase.classList.toggle('break-phase', state.phase !== 'work');
            progress.classList.toggle('break-ring', state.phase !== 'work');
            progress.classList.toggle('running', !!state.isRunning);
            progress.style.strokeDashoffset = String(progressOffset(state.timeRemaining, state.totalTime));
            const rounds = state.durations?.roundsBeforeLong;
            round.textContent = `${t('round')} ${state.currentRound}${rounds ? ` / ${rounds}` : ''}`;
            if (doc.activeElement !== task) task.value = state.task || '';
            taskPreview.textContent = state.task || ''; taskPreview.hidden = !state.task; taskPreview.title = state.task || '';
            const label = t(state.isRunning ? 'pause' : 'start');
            toggleLabel.textContent = label; toggle.setAttribute('aria-label', label); toggle.title = label;
            toggleIcon.firstChild.setAttribute('d', state.isRunning ? pausePath : playPath);
        };
        render(window.myntPomodoro.getState()); unsubscribe = window.myntPomodoro.subscribe(render);
        win.addEventListener('pagehide', () => clearFloat(win), { once: true });
        doc.addEventListener('keydown', event => {
            if (event.key !== 'Escape' || event.defaultPrevented) return;
            if (options.open) { event.preventDefault(); options.open = false; summary.focus(); }
            else win.close();
        });
        doc.addEventListener('visibilitychange', syncFloatVideo);
        const disconnect = () => {
            if (!win.closed && ordinary) {
                setNote('disconnected');
                for (const field of main.querySelectorAll('button,input')) if (field !== close) field.disabled = true;
                if (floatVideo) floatVideo.pause();
            }
        };
        window.addEventListener('pagehide', disconnect, { once: true });
        win.addEventListener('pagehide', () => window.removeEventListener('pagehide', disconnect), { once: true });
        renderAppearance();
    }
    async function openFloat(ordinary) {
        if (opening) return;
        if (floating && !floating.closed) { floating.focus(); return; }
        if (!window.myntPomodoro) { status.textContent = t('unsupported'); return; }
        if (!ordinary && !window.documentPictureInPicture?.requestWindow) { status.textContent = t('unsupported'); return; }
        if (unsubscribe) { unsubscribe(); unsubscribe = null; }
        opening = true;
        try {
            // Initial placement is a supported hint, not a guarantee: browsers may clamp size.
            // https://developer.chrome.com/docs/web-platform/document-picture-in-picture
            const win = ordinary ? window.open('', 'myntPomodoroFloat', 'popup,width=320,height=420') : await window.documentPictureInPicture.requestWindow(pipOptions());
            if (!win) { status.textContent = t('blocked'); return; }
            floating = win; constructFloat(win, ordinary); status.textContent = ordinary ? t('note') : '';
        } catch (_) { if (floating) { floating.close(); clearFloat(floating); } status.textContent = t('unsupported'); }
        finally { opening = false; }
    }
    function init() {
        const mount = document.getElementById('myntPomoFloatMount'); if (!mount) return;
        mount.classList.add('mynt-pomo-settings');
        const floatingButton = button(document, 'float', () => openFloat(false)); floatingButton.className = 'mynt-pomo-open-float';
        const popupButton = button(document, 'popup', () => openFloat(true)); popupButton.className = 'mynt-pomo-open-popup';
        mount.append(floatingButton, popupButton);
        status = el(document, 'p', '', 'mynt-pomo-note'); status.setAttribute('role', 'status'); mount.append(status);
        buildSettings(mount); renderAppearance();
        const originalVideo = document.getElementById('pomodoroPanel')?.querySelector('.pomodoro-bg-video');
        originalVideo?.addEventListener('loadeddata', () => { thumbnailCache.delete(originalVideo); syncForm(); });
        const observer = new MutationObserver(renderAppearance);
        for (const target of [document.body, document.documentElement]) observer.observe(target, { attributes: true, attributeFilter: ['style', 'class'] });
        for (const query of ['(prefers-reduced-motion: reduce)', '(forced-colors: active)']) window.matchMedia?.(query).addEventListener('change', renderAppearance);
        imageStore('get').then(async blob => { if (blob) setImage(await decodeImage(blob)); }).catch(() => { if (settings.mode === 'image') status.textContent = t('missing'); });
        window.addEventListener('storage', event => { if (event.key === KEY) { try { settings = validate(JSON.parse(event.newValue) || defaults); renderAppearance(); syncForm(); } catch (_) { /* ignore corrupt input */ } } });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();

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
    // Pure helpers are exported for dependency-free regression checks, not persisted.
    if (typeof module !== 'undefined' && module.exports) { module.exports = { validate, validImage, progressOffset }; return; }
    let settings = { ...defaults }, imageUrl = '', floating = null, opening = false, unsubscribe = null;
    let status, appearanceForm, floatVideo;
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
        } catch (error) { URL.revokeObjectURL(url); throw error; }
        return url;
    }
    function setImage(url) { const previous = imageUrl; imageUrl = url; renderAppearance(); if (previous) URL.revokeObjectURL(previous); }
    function paint(target) {
        if (!target) return;
        // Preserve saved home-following choices. Without a homepage image, use the
        // original timer video/theme rather than the independent color preference.
        const theme = getComputedStyle(document.body);
        const home = settings.mode === 'home' ? theme.getPropertyValue('--bg-image').trim() : '';
        const original = settings.mode === 'original' || (settings.mode === 'home' && (!home || home === 'none'));
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
    function syncForm() {
        if (!appearanceForm) return;
        for (const key of ['mode', 'color', 'color2', 'fit', 'position']) appearanceForm.elements.namedItem(key).value = settings[key];
    }
    function buildSettings(mount) {
        const details = el(document, 'details', '', 'mynt-pomo-appearance'); details.append(el(document, 'summary', t('appearance')));
        const form = el(document, 'form'); appearanceForm = form; form.addEventListener('submit', event => event.preventDefault());
        const row = (key, node) => { const label = el(document, 'label', t(key)); label.append(node); form.append(label); };
        const select = (key, choices) => { const node = el(document, 'select'); node.name = key; for (const [value, label] of choices) { const option = el(document, 'option', t(label)); option.value = value; node.append(option); } return node; };
        row('appearance', select('mode', ['original', 'home', 'image', 'color', 'gradient'].map(key => [key, key])));
        for (const key of ['color', 'color2']) { const input = el(document, 'input'); input.type = 'color'; input.name = key; row(key, input); }
        row('fit', select('fit', [['cover', 'cover'], ['contain', 'contain']]));
        row('position', select('position', [['50% 50%', 'center'], ['50% 0%', 'top'], ['50% 100%', 'bottom']]));
        form.addEventListener('change', event => {
            if (!['mode', 'color', 'color2', 'fit', 'position'].includes(event.target.name)) return;
            try { applySettings({ ...settings, [event.target.name]: event.target.value }); status.textContent = settings.mode === 'image' && !imageUrl ? t('missing') : t('ready'); }
            catch (_) { status.textContent = t('error'); syncForm(); }
        });
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
        row('upload', input);
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
        form.append(remove, undo);
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
        main.append(phase, circle, round, taskPreview);
        const controls = el(doc, 'div', '', 'mynt-pomo-controls');
        const note = el(doc, 'p', '', 'mynt-pomo-note'); note.setAttribute('role', 'status');
        const run = (method, ...args) => Promise.resolve().then(() => window.myntPomodoro[method](...args)).catch(() => { note.textContent = t('error'); });
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
        const taskLabel = el(doc, 'label', t('task')); const task = el(doc, 'input'); task.type = 'text'; task.maxLength = 300;
        taskLabel.append(task); task.addEventListener('change', () => run('setTask', task.value));
        const secondary = el(doc, 'div', '', 'mynt-pomo-secondary');
        const close = button(doc, 'close', () => win.close());
        secondary.append(button(doc, 'extend', () => run('extend', 5)), close);
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
                note.textContent = t('disconnected');
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
            const win = ordinary ? window.open('', 'myntPomodoroFloat', 'popup,width=320,height=380') : await window.documentPictureInPicture.requestWindow({ width: 320, height: 380 });
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
        const observer = new MutationObserver(renderAppearance);
        for (const target of [document.body, document.documentElement]) observer.observe(target, { attributes: true, attributeFilter: ['style', 'class'] });
        for (const query of ['(prefers-reduced-motion: reduce)', '(forced-colors: active)']) window.matchMedia?.(query).addEventListener('change', renderAppearance);
        imageStore('get').then(async blob => { if (blob) setImage(await decodeImage(blob)); }).catch(() => { if (settings.mode === 'image') status.textContent = t('missing'); });
        window.addEventListener('storage', event => { if (event.key === KEY) { try { settings = validate(JSON.parse(event.newValue) || defaults); renderAppearance(); syncForm(); } catch (_) { /* ignore corrupt input */ } } });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();

/* Local-only Pomodoro miniwindow and appearance. GPL-3.0. */
(() => {
    'use strict';
    const KEY = 'myntPomodoroAppearance.v1';
    const MAX_IMAGE = 8 * 1024 * 1024;
    const defaults = { version: 1, mode: 'home', color: '#243247', color2: '#765b91', fit: 'cover', position: '50% 50%' };
    const labels = {
        float: ['Open floating timer', '開啟懸浮番茄鐘'], popup: ['Open ordinary timer window', '開啟一般計時視窗'],
        appearance: ['Timer background', '番茄鐘背景'], home: ['Follow homepage', '跟隨首頁'], image: ['Local image', '本機圖片'],
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
        task: ['Focus task', '專注任務'], start: ['Start', '開始'], pause: ['Pause', '暫停'], reset: ['Reset', '重設'],
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
        if (!['home', 'image', 'color', 'gradient'].includes(out.mode) || !['cover', 'contain'].includes(out.fit) ||
            !['50% 50%', '50% 0%', '50% 100%'].includes(out.position) || !/^#[0-9a-f]{6}$/i.test(out.color) || !/^#[0-9a-f]{6}$/i.test(out.color2)) throw new Error('Invalid settings');
        return out;
    }
    function validImage(file) { return !!file && ['image/png', 'image/jpeg', 'image/webp'].includes(file.type) && file.size > 0 && file.size <= MAX_IMAGE; }
    // Pure helpers are exported for dependency-free regression checks, not persisted.
    if (typeof module !== 'undefined' && module.exports) { module.exports = { validate, validImage }; return; }
    let settings = { ...defaults }, imageUrl = '', floating = null, opening = false, unsubscribe = null;
    let status, appearanceForm;
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
        const home = getComputedStyle(document.body).getPropertyValue('--bg-image').trim();
        const bg = settings.mode === 'home' ? (home || 'none') : settings.mode === 'gradient' ? `linear-gradient(135deg, ${settings.color}, ${settings.color2})` : settings.mode === 'image' && imageUrl ? `url("${imageUrl}")` : 'none';
        target.classList.add('mynt-pomo-static');
        target.style.setProperty('--pomo-background', bg);
        target.style.setProperty('--pomo-color', settings.color);
        target.style.setProperty('--pomo-fit', settings.fit);
        target.style.setProperty('--pomo-position', settings.position);
    }
    function renderAppearance() { paint(document.getElementById('pomodoroPanel')); if (floating && !floating.closed) paint(floating.document.body); }
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
        const details = el(document, 'details'); details.append(el(document, 'summary', t('appearance')));
        const form = el(document, 'form'); appearanceForm = form; form.addEventListener('submit', event => event.preventDefault());
        const row = (key, node) => { const label = el(document, 'label', t(key)); label.append(node); form.append(label); };
        const select = (key, choices) => { const node = el(document, 'select'); node.name = key; for (const [value, label] of choices) { const option = el(document, 'option', t(label)); option.value = value; node.append(option); } return node; };
        row('appearance', select('mode', ['home', 'image', 'color', 'gradient'].map(key => [key, key])));
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
        if (unsubscribe) unsubscribe(); unsubscribe = null; floating = null;
    }
    function constructFloat(win, ordinary) {
        const doc = win.document; doc.title = t('float'); doc.documentElement.lang = document.documentElement.lang;
        // Copy only this packaged stylesheet, never arbitrary page styles or remote scripts.
        const css = doc.createElement('link'); css.rel = 'stylesheet'; css.href = new URL('styles/pomodoro-float.css', document.baseURI).href; doc.head.append(css);
        doc.body.replaceChildren(); doc.body.className = 'mynt-pomo-float';
        const main = el(doc, 'main', '', 'mynt-pomo-card'); main.append(el(doc, 'h1', t('float')));
        const phase = el(doc, 'p'); const timer = el(doc, 'div', '', 'mynt-pomo-time'); timer.setAttribute('role', 'timer'); timer.setAttribute('aria-live', 'off');
        const round = el(doc, 'p'); main.append(phase, timer, round);
        const taskLabel = el(doc, 'label', t('task')); const task = el(doc, 'input'); task.type = 'text'; task.maxLength = 300; taskLabel.append(task); main.append(taskLabel);
        const controls = el(doc, 'div', '', 'mynt-pomo-controls');
        let resetPrompt = null;
        function confirmReset() {
            if (resetPrompt) return;
            const state = window.myntPomodoro.getState();
            const execute = () => Promise.resolve(window.myntPomodoro.reset()).catch(() => { note.textContent = t('error'); });
            if (!(state.isRunning || state.timeRemaining !== state.totalTime || state.phase !== 'work' || state.currentRound !== 1)) return execute();
            resetPrompt = el(doc, 'section', '', 'mynt-pomo-confirm');
            resetPrompt.setAttribute('role', 'group'); resetPrompt.setAttribute('aria-label', t('resetConfirm'));
            const message = el(doc, 'p', t('resetConfirm')); message.setAttribute('role', 'alert');
            const dismiss = () => { resetPrompt.remove(); resetPrompt = null; controls.children[2].focus(); };
            const cancel = button(doc, 'cancel', dismiss);
            resetPrompt.append(message, button(doc, 'confirm', () => { dismiss(); execute(); }), cancel);
            resetPrompt.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); dismiss(); } });
            controls.after(resetPrompt); cancel.focus();
        }
        for (const [label, method, args] of [['start', 'start', []], ['pause', 'pause', []], ['reset', 'reset', []], ['extend', 'extend', [5]]]) controls.append(button(doc, label, () => method === 'reset' ? confirmReset() : Promise.resolve(window.myntPomodoro?.[method](...args)).catch(() => { note.textContent = t('error'); })));
        task.addEventListener('change', () => Promise.resolve(window.myntPomodoro?.setTask(task.value)).catch(() => { note.textContent = t('error'); }));
        main.append(controls, button(doc, 'close', () => win.close()));
        const note = el(doc, 'p', t('note'), 'mynt-pomo-note'); note.setAttribute('role', 'status'); main.append(note); doc.body.append(main);
        const render = state => {
            if (!state || win.closed) return;
            const seconds = Math.max(0, Math.ceil(state.timeRemaining));
            timer.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
            phase.textContent = t(state.phase); round.textContent = `${t('round')} ${state.currentRound}`;
            if (doc.activeElement !== task) task.value = state.task || '';
            controls.children[0].disabled = !!state.isRunning; controls.children[1].disabled = !state.isRunning;
        };
        render(window.myntPomodoro.getState()); unsubscribe = window.myntPomodoro.subscribe(render);
        win.addEventListener('pagehide', () => clearFloat(win), { once: true });
        doc.addEventListener('keydown', event => { if (event.key === 'Escape') win.close(); });
        const disconnect = () => { if (!win.closed && ordinary) { note.textContent = t('disconnected'); for (const field of main.querySelectorAll('button,input')) field.disabled = true; } };
        window.addEventListener('pagehide', disconnect, { once: true });
        win.addEventListener('pagehide', () => window.removeEventListener('pagehide', disconnect), { once: true });
        paint(doc.body);
    }
    async function openFloat(ordinary) {
        if (opening) return;
        if (floating && !floating.closed) { floating.focus(); return; }
        if (!window.myntPomodoro) { status.textContent = t('unsupported'); return; }
        if (!ordinary && !window.documentPictureInPicture?.requestWindow) { status.textContent = t('unsupported'); return; }
        if (unsubscribe) { unsubscribe(); unsubscribe = null; }
        opening = true;
        try {
            const win = ordinary ? window.open('', 'myntPomodoroFloat', 'popup,width=360,height=460') : await window.documentPictureInPicture.requestWindow({ width: 360, height: 460 });
            if (!win) { status.textContent = t('blocked'); return; }
            floating = win; constructFloat(win, ordinary); status.textContent = ordinary ? t('note') : '';
        } catch (_) { if (floating) { floating.close(); clearFloat(floating); } status.textContent = t('unsupported'); }
        finally { opening = false; }
    }
    function init() {
        const mount = document.getElementById('myntPomoFloatMount'); if (!mount) return;
        mount.classList.add('mynt-pomo-settings');
        mount.append(button(document, 'float', () => openFloat(false)), button(document, 'popup', () => openFloat(true)));
        status = el(document, 'p', '', 'mynt-pomo-note'); status.setAttribute('role', 'status'); mount.append(status);
        buildSettings(mount); renderAppearance();
        new MutationObserver(renderAppearance).observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] });
        imageStore('get').then(async blob => { if (blob) setImage(await decodeImage(blob)); }).catch(() => { if (settings.mode === 'image') status.textContent = t('missing'); });
        window.addEventListener('storage', event => { if (event.key === KEY) { try { settings = validate(JSON.parse(event.newValue) || defaults); renderAppearance(); syncForm(); } catch (_) { /* ignore corrupt input */ } } });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();

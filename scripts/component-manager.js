/* Unified visibility controls: hide views, never delete content or move saved layouts. */
(function (root) {
    'use strict';
    const core = root.MYNTComponentVisibilityCore;
    if (!core || typeof document === 'undefined') return;
    const text = (zh, en) => { try { return (localStorage.getItem('selectedLanguage') || 'zh_TW') === 'zh_TW' ? zh : en; } catch (_) { return zh; } };
    const translated = (key, zh, en) => { try { return (typeof translations !== 'undefined' && translations[localStorage.getItem('selectedLanguage') || 'zh_TW']?.[key]) || text(zh, en); } catch (_) { return text(zh, en); } };
    let panel, status, queued = false;
    const controls = new Map();
    const clockRefreshKeys = ['clocktype', 'hideClockVisible', 'hourformat', 'greetingEnabled'];
    function refresh() {
        let items;
        try { items = core.read(localStorage); } catch (_) { if (status) status.textContent = text('無法讀取設定，未變更任何資料。', 'Settings unavailable. No data was changed.'); return; }
        for (const item of items) {
            const input = controls.get(item.id);
            if (input) { input.disabled = !item.valid; input.checked = item.visible === true; input.setAttribute('aria-invalid', String(!item.valid)); }
            if (!item.valid) continue;
            const original = item.checkboxId && document.getElementById(item.checkboxId);
            if (original) original.checked = item.kind === 'inverse' && item.id !== 'clock' ? !item.visible : item.visible;
            // Keep dependent settings usable without dispatching legacy handlers,
            // which persist caches or reinitialize content during a pure refresh.
            const settingsRows = item.id === 'shortcuts' ? ['shortcutEditField', 'adaptiveIconField']
                : item.id === 'aiTools' ? ['aiToolsEditField'] : [];
            for (const id of settingsRows) document.getElementById(id)?.classList.toggle('inactive', !item.visible);
            for (const selector of item.selectors) for (const node of document.querySelectorAll(selector)) {
                node.toggleAttribute('data-mynt-component-hidden', !item.visible);
                if (item.display) { node.setAttribute('data-mynt-component-display', item.display); node.style.setProperty('--mynt-component-display', item.display); }
            }
            for (const selector of item.panelSelectors) for (const node of document.querySelectorAll(selector)) node.toggleAttribute('data-mynt-component-hidden', !item.visible);
            if (item.id === 'clock') {
                // Hide only the clock, not the sibling focus card; never rewrite layout coordinates.
                document.getElementById('leftDiv')?.classList.remove('clock-hidden-left');
                const digital = localStorage.getItem('clocktype') === 'digital';
                for (const [id, show] of [['analogClock', !digital], ['digitalClock', digital]]) {
                    const node = document.getElementById(id);
                    if (node) { node.setAttribute('data-mynt-component-display', show ? 'block' : 'none'); node.style.setProperty('--mynt-component-display', show ? 'block' : 'none'); }
                }
            }
            if (item.id === 'weather') {
                const node = document.getElementById('hideWeather');
                if (node) { node.classList.toggle('weather-hidden', !item.visible); node.setAttribute('data-mynt-component-display', 'flex'); node.style.setProperty('--mynt-component-display', 'flex'); }
            }
            if (item.id === 'motivationalQuotes') {
                const node = document.getElementById('motivationalQuotesCont');
                if (node) node.toggleAttribute('data-mynt-component-hidden', !item.visible || localStorage.getItem('showShortcutSwitch') !== 'true');
            }
            if (item.id === 'focus' && item.visible) {
                const heading = document.getElementById('userText'), actions = document.getElementById('dailyFocusActions');
                if (heading) heading.style.display = 'block';
                if (actions) actions.style.display = 'flex';
            }
            if (item.id === 'exam') { const node = document.getElementById('examDaily'); if (node) node.hidden = !item.visible; }
        }
        // A previously CSS-hidden, never-positioned clock can start above the viewport.
        // Apply the editor's existing bounds clamp only to that newly visible clock;
        // never save coordinates or reposition any other component.
        if (root.myntLayout?.get && !root.myntLayout.isEditing?.() && !root.myntLayout.get().blocks.clock && typeof myntClampOffset === 'function') {
            const node = document.getElementById(localStorage.getItem('clocktype') === 'digital' ? 'digitalClock' : 'analogClock');
            if (node && !node.hasAttribute('data-mynt-component-hidden')) {
                node.style.transformOrigin = '0 0';
                node.style.scale = String(Math.max(.1, Math.min(1, (innerWidth - 32) / Math.max(1, node.offsetWidth), (innerHeight - 120) / Math.max(1, node.offsetHeight))));
                const rect = node.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    const [dx = 0, dy = 0] = (node.style.translate || '0 0').split(/\s+/).map(parseFloat);
                    const fixed = myntClampOffset(rect, dx, dy, innerWidth, innerHeight);
                    if (fixed.x !== dx || fixed.y !== dy) node.style.translate = `${fixed.x}px ${fixed.y}px`;
                }
            }
        }
    }
    function schedule() { if (!queued) { queued = true; queueMicrotask(() => { queued = false; refresh(); }); } }
    function refreshClock() {
        const hidden = localStorage.getItem('hideClockVisible'), mode = localStorage.getItem('clocktype');
        // Invalid preferences remain untouched; do not initialize from corrupt state.
        if (![null, 'true', 'false'].includes(hidden) || ![null, 'analog', 'digital'].includes(mode)) return;
        if (typeof root.myntClockPreferences?.refreshVisibility === 'function') root.myntClockPreferences.refreshVisibility();
        else if (!root.myntClockPreferences && hidden !== 'true' && typeof initializeClock === 'function') initializeClock();
    }
    function commitPlan(plan) {
        const changed = [];
        try {
            for (const item of plan.expected) if (localStorage.getItem(item.key) !== item.value) throw Error('STALE');
            for (const item of plan.writes) {
                changed.push({ key: item.key, value: localStorage.getItem(item.key) });
                if (item.value === null) localStorage.removeItem(item.key); else localStorage.setItem(item.key, item.value);
                if (localStorage.getItem(item.key) !== item.value) throw Error('STORAGE');
            }
        } catch (error) {
            for (const item of changed.reverse()) { try { if (item.value === null) localStorage.removeItem(item.key); else localStorage.setItem(item.key, item.value); if (localStorage.getItem(item.key) !== item.value) error.rollbackFailed = true; } catch (_) { error.rollbackFailed = true; } }
            throw error;
        }
    }
    function change(id, visible) {
        commitPlan(core.plan(localStorage, id, visible));
        // Pure local render hooks. Never run legacy hide handlers that pause music/timers,
        // reload the page or clear content. Network-backed widgets initialize in their settings.
        if (id === 'countdowns') root.myntCountdowns?.render();
        if (id === 'studyQuote') root.myntStudy?.render();
        if (id === 'clock') refreshClock();
        refresh();
        const hint = visible && ['weather', 'motivationalQuotes'].includes(id)
            ? text('已顯示；如尚無內容，請到該功能設定完成啟用。', 'Shown. If empty, finish setup in that feature’s settings.')
            : text('已儲存。隱藏不會刪除資料或改變已儲存位置。', 'Saved. Hiding preserves data and saved positions.');
        status.textContent = hint;
        document.dispatchEvent(new CustomEvent('mynt:components-changed', { detail: { id, visible } }));
    }
    function init() {
        const host = document.querySelector('#overviewPage > .toggleTextsCont');
        if (!host) return;
        panel = document.createElement('details'); panel.id = 'myntComponentManager'; panel.dataset.settingsGroup = 'personal';
        const summary = document.createElement('summary'); summary.textContent = translated('componentsTitle', '元件管理', 'Manage components'); panel.append(summary);
        const note = document.createElement('p'); note.textContent = text('勾選加入首頁，取消即可隱藏。資料、計時與排版會保留；設定入口永遠可用。', 'Check to show on your home page. Hiding keeps data, timers and layouts. Settings always remains available.'); panel.append(note);
        const list = document.createElement('div'); list.className = 'mynt-component-list';
        for (const item of core.definitions) {
            const label = document.createElement('label'), input = document.createElement('input'), name = document.createElement('span');
            input.type = 'checkbox'; input.id = `myntComponent-${item.id}`; name.textContent = text(item.labelZh, item.labelEn);
            input.addEventListener('change', () => { try { change(item.id, input.checked); } catch (error) { status.textContent = error.rollbackFailed ? text('瀏覽器儲存空間無法使用，部分顯示設定可能尚未回復。請勿清除資料，重新開啟後檢查。', 'Storage is unavailable; some visibility settings may not have rolled back. Do not clear data. Reopen and check.') : text('儲存失敗或資料格式異常，原有資料已保留。請重試或檢查備份。', 'Could not save, or stored data is invalid. Existing data was preserved. Retry or check your backup.'); refresh(); } });
            label.append(name, input); list.append(label); controls.set(item.id, input);
        }
        panel.append(list);
        status = document.createElement('p'); status.className = 'mynt-component-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); panel.append(status);
        host.prepend(panel);
        try {
            const hiddenByLegacyStyles = [];
            if (document.body.matches('[data-workspace-background="video"],.mynt-manual-workspace')) {
                const digital = localStorage.getItem('clocktype') === 'digital';
                const clock = document.getElementById(digital ? 'digitalClock' : 'analogClock');
                const weather = document.getElementById('hideWeather');
                if (clock && getComputedStyle(clock).display === 'none') hiddenByLegacyStyles.push('clock');
                if (weather && getComputedStyle(weather).display === 'none') hiddenByLegacyStyles.push('weather');
            }
            commitPlan(core.planMigration(localStorage, { hiddenByLegacyStyles }));
        } catch (_) { status.textContent = text('原有顯示偏好未遷移；請檢查儲存空間或備份。其他內容未變更。', 'Existing visibility preferences were not migrated. Check storage or backup; other content is unchanged.'); }
        document.addEventListener('change', event => { if (!panel.contains(event.target)) schedule(); });
        document.addEventListener('mynt:mcp-settings-refresh', schedule);
        document.addEventListener('mynt:layout-applied', schedule);
        root.addEventListener('resize', schedule);
        root.addEventListener('storage', event => {
            if (event.key !== null && !core.storageKeys.includes(event.key) && !clockRefreshKeys.includes(event.key) && event.key !== 'showShortcutSwitch') return;
            try {
                if (event.key === null || event.key === 'myntEventCountdownsV1') root.myntCountdowns?.render();
                if (event.key === null || event.key === 'myntStudyQuoteEnabled') root.myntStudy?.render();
                if (event.key === null || clockRefreshKeys.includes(event.key)) refreshClock();
            } finally { schedule(); }
        });
        // Only newly added known widget roots matter; clock text updates do not rescan.
        const ids = new Set(core.definitions.flatMap(item => [...item.selectors, ...item.panelSelectors]).map(selector => selector.slice(1)));
        new MutationObserver(records => { if (records.some(record => [...record.addedNodes].some(node => node.nodeType === 1 && (ids.has(node.id) || [...ids].some(id => node.querySelector?.(`#${id}`)))))) schedule(); }).observe(document.body, { childList: true, subtree: true });
        refresh();
    }
    root.myntComponents = { refresh };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);

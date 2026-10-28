/* 首頁今日卡：只呈現既有模組，不另存待辦或計時資料。 */
(function () {
    'use strict';
    function init() {
        const host = document.getElementById('myntHomeWidgets');
        if (!host) return;
        const t = key => {
            let language = 'zh_TW';
            try { language = localStorage.getItem('selectedLanguage') || language; } catch (_) { /* 使用預設語言。 */ }
            return typeof translations === 'undefined' ? key : translations[language]?.[key] || translations.en?.[key] || key;
        };
        const el = (tag, text, className) => {
            const node = document.createElement(tag);
            if (text) node.textContent = text;
            if (className) node.className = className;
            return node;
        };
        const button = (key, handler) => {
            const node = el('button', t(key)); node.type = 'button';
            node.addEventListener('click', handler);
            return node;
        };
        const title = el('h2', t('homeWidgetsTitle')); title.id = 'homeWidgetsTitle';
        const todoCard = el('section', '', 'home-widget-card');
        const todoTitle = el('h3', t('homeWidgetsTodo')); todoTitle.id = 'homeWidgetsTodoTitle';
        todoCard.setAttribute('aria-labelledby', todoTitle.id);
        const list = el('ul', '', 'home-widget-todos');
        const empty = el('p', t('homeWidgetsEmpty'), 'home-widget-note');
        const form = el('form', '', 'home-widget-add');
        const input = el('input'); input.type = 'text'; input.maxLength = 120; input.required = true;
        input.placeholder = t('homeWidgetsAdd'); input.setAttribute('aria-label', t('homeWidgetsAdd'));
        input.autocomplete = 'off';
        const add = el('button', '+'); add.type = 'submit'; add.setAttribute('aria-label', t('homeWidgetsAdd'));
        form.append(input, add);
        const status = el('p', '', 'home-widget-note'); status.setAttribute('role', 'status');
        const reportError = () => { status.textContent = t('homeWidgetsError'); };
        let panelHighlightTimeout;
        const openPanel = kind => {
            // 透過既有元件設定開啟入口，避免面板仍被元件管理隱藏。
            const control = document.getElementById(`myntComponent-${kind}`);
            if (control && !control.checked && !control.disabled) control.click();
            if (kind === 'pomodoro') {
                window.myntPomodoro?.open({ anchorRect: host.getBoundingClientRect() });
                const running = window.myntPomodoro?.getState().isRunning;
                document.getElementById(running ? 'pomodoroPauseBtn' : 'pomodoroStartBtn')?.focus({ preventScroll: true });
                const panel = document.getElementById('pomodoroPanel');
                if (panel) {
                    // 獨立屬性不觸發既有樣式／類別的版面觀察器；靜態外框不移動面板。
                    panel.setAttribute('data-home-widget-highlight', '');
                    window.clearTimeout(panelHighlightTimeout);
                    panelHighlightTimeout = window.setTimeout(() => panel.removeAttribute('data-home-widget-highlight'), 1200);
                }
                renderPomodoro();
            } else {
                const trigger = document.getElementById('todoListCont');
                if (trigger?.getAttribute('aria-expanded') !== 'true') trigger?.click();
                document.getElementById('todoInput')?.focus();
            }
        };
        const openTodo = button('homeWidgetsOpenTodo', event => { event.stopPropagation(); openPanel('todo'); });
        openTodo.setAttribute('aria-controls', 'todoContainer');
        todoCard.append(todoTitle, list, empty, form, openTodo, status);

        const focusCard = el('section', '', 'home-widget-card');
        const focusTitle = el('h3', t('homeWidgetsFocus')); focusTitle.id = 'homeWidgetsFocusTitle';
        focusCard.setAttribute('aria-labelledby', focusTitle.id);
        const phase = el('p', '', 'home-widget-note'); phase.setAttribute('aria-live', 'polite');
        const time = el('p', '--:--', 'home-widget-time'); time.setAttribute('role', 'timer'); time.setAttribute('aria-live', 'off');
        const toggle = button('homeWidgetsStart', async () => {
            toggle.disabled = true;
            try {
                const api = window.myntPomodoro;
                await (api.getState().isRunning ? api.pause() : api.startInline());
                status.textContent = '';
            } catch (_) { reportError(); }
            finally { renderPomodoro(); }
        });
        const openPomodoro = button('homeWidgetsOpenPomodoro', event => { event.stopPropagation(); openPanel('pomodoro'); });
        openPomodoro.setAttribute('aria-controls', 'pomodoroPanel');
        focusCard.append(focusTitle, phase, time, toggle, openPomodoro);
        host.append(title, todoCard, focusCard);
        let active = false, unsubscribeTodo = null, unsubscribePomodoro = null;
        // 開關面板不會發出計時更新；只觀察既有入口的開關屬性。
        const panelTrigger = document.getElementById('pomodoroCont');
        if (panelTrigger) new MutationObserver(renderPomodoro).observe(panelTrigger, { attributes: true, attributeFilter: ['aria-expanded'] });

        function renderTodos() {
            if (!active) return;
            try {
                const api = window.myntTodoApi;
                const items = api.list().filter(item => item.status !== 'completed')
                    .sort((a, b) => Number(b.pinned === true) - Number(a.pinned === true)).slice(0, 5);
                const focusedId = list.contains(document.activeElement) ? document.activeElement?.dataset.todoId : null;
                const oldIds = [...list.children].map(row => row.firstChild?.firstChild?.dataset.todoId);
                const rows = items.map(item => {
                    const row = el('li'), label = el('label'), check = el('input'); check.type = 'checkbox';
                    check.dataset.todoId = item.id;
                    check.setAttribute('aria-label', t('homeWidgetsComplete').replace('{title}', item.title));
                    check.addEventListener('change', () => {
                        try { if (!api.toggle(item.id)) reportError(); } catch (_) { reportError(); }
                        renderTodos();
                    });
                    const name = el('span', item.title);
                    if (item.pinned) name.title = t('homeWidgetsPinned').replace('{title}', item.title);
                    label.append(check, name); row.append(label); return row;
                });
                list.replaceChildren(...rows);
                // 完成一筆後將鍵盤焦點交給相鄰任務，清單空時交給新增欄。
                if (focusedId) {
                    const checks = rows.map(row => row.firstChild.firstChild);
                    (checks.find(node => node.dataset.todoId === focusedId) || checks[Math.min(oldIds.indexOf(focusedId), checks.length - 1)] || input).focus();
                }
                empty.hidden = items.length !== 0;
                empty.textContent = t('homeWidgetsEmpty');
                input.disabled = false; add.disabled = false;
            } catch (_) {
                list.replaceChildren(); empty.hidden = false; empty.textContent = t('homeWidgetsUnavailable');
                input.disabled = true; add.disabled = true;
            }
        }
        function renderPomodoro() {
            if (!active) return;
            const panelOpen = window.myntPomodoro?.isOpen() === true;
            time.hidden = panelOpen;
            toggle.hidden = panelOpen;
            openPomodoro.textContent = t(panelOpen ? 'homeWidgetsFocusPanel' : 'homeWidgetsOpenPomodoro');
            const state = window.myntPomodoro?.getState();
            toggle.disabled = !state;
            if (!state) { phase.textContent = t('homeWidgetsUnavailable'); return; }
            const seconds = Math.max(0, Math.ceil(state.timeRemaining));
            const nextTime = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
            if (time.textContent !== nextTime) time.textContent = nextTime;
            const nextPhase = t(panelOpen ? 'homeWidgetsPomodoroOpen' : state.phase === 'work' ? 'pomodoroWork' : state.phase === 'shortBreak' ? 'pomodoroShortBreak' : 'pomodoroLongBreak');
            if (phase.textContent !== nextPhase) phase.textContent = nextPhase;
            toggle.textContent = t(state.isRunning ? 'homeWidgetsPause' : 'homeWidgetsStart');
        }
        form.addEventListener('submit', event => {
            event.preventDefault();
            if (event.isComposing || !input.value.trim()) return;
            try {
                if (!window.myntTodoApi?.add(input.value)) { reportError(); return; }
                input.value = ''; status.textContent = ''; renderTodos();
            } catch (_) { reportError(); }
        });
        function refresh() {
            let enabled = false;
            try { const saved = localStorage.getItem('myntHomeWidgetsVisible'); enabled = saved === null || saved === 'true'; } catch (_) { /* 儲存不可用時維持隱藏。 */ }
            const visible = enabled && window.innerWidth >= 1500;
            const wasHidden = host.hidden;
            host.hidden = !visible;
            // 延後初始化／重新顯示後才有尺寸，讓既有版面引擎重新套用儲存縮放與邊界限制。
            if (visible && wasHidden) window.myntLayout?.applyAll();
            active = visible && !document.hidden;
            if (!active) {
                unsubscribeTodo?.(); unsubscribeTodo = null;
                unsubscribePomodoro?.(); unsubscribePomodoro = null;
                return;
            }
            if (!unsubscribeTodo && window.myntTodoApi) unsubscribeTodo = window.myntTodoApi.subscribe(renderTodos);
            if (!unsubscribePomodoro && window.myntPomodoro) unsubscribePomodoro = window.myntPomodoro.subscribe(renderPomodoro);
            renderTodos(); renderPomodoro();
        }
        window.addEventListener('resize', refresh);
        window.addEventListener('storage', event => { if (event.key === null || event.key === 'myntHomeWidgetsVisible') refresh(); });
        document.addEventListener('visibilitychange', refresh);
        for (const name of ['mynt:components-changed', 'mynt:layout-applied', 'mynt:pomodoro-ready', 'mynt:mcp-settings-refresh']) document.addEventListener(name, refresh);
        refresh();
    }
    const defer = () => {
        if (window.requestIdleCallback) window.requestIdleCallback(init, { timeout: 1500 });
        else window.setTimeout(init, 0);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', defer, { once: true }); else defer();
})();

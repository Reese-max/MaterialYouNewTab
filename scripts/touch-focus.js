/* 觸控專注舞台（方向 B：專注工具 App）
   只在 (hover:none) and (pointer:coarse) 生效：電腦版完全不啟用。
   資料一律沿用既有 window.myntPomodoro / window.myntTodoApi，
   不新增 storage 鍵、不改 pomodoroCheckboxState 語意。 */
(function () {
    "use strict";

    const TOUCH_QUERY = "(hover: none) and (pointer: coarse)";
    // 寬版（iPad 級）才顯示旁側待辦卡；iPhone 橫放高度不足，仍維持單欄
    const WIDE_QUERY = "(min-width: 700px) and (min-height: 500px)";
    const touchMq = window.matchMedia(TOUCH_QUERY);
    const wideMq = window.matchMedia(WIDE_QUERY);

    let els = {};
    let active = false;
    let moved = [];        // 還原用：{el, parent, next}
    let cleanups = [];     // deactivate 時依序執行
    let lastSessionId = "";
    let scrimHideTimer = null;
    let swipeHandled = false;

    /* ---------- 語系 ---------- */
    function tr(key, fallback) {
        try {
            const lang = typeof currentLanguage === "string" ? currentLanguage : "en";
            const table = typeof translations === "object" && translations ? translations : {};
            return table[lang]?.[key] ?? table.en?.[key] ?? fallback;
        } catch { return fallback; }
    }

    function fmt(key, fallback, map) {
        let s = tr(key, fallback);
        for (const k in map) s = s.split("{" + k + "}").join(String(map[k]));
        return s;
    }

    function onCleanup(fn) { cleanups.push(fn); }

    function on(target, event, handler, opts) {
        target.addEventListener(event, handler, opts);
        onCleanup(() => target.removeEventListener(event, handler, opts));
    }

    /* ---------- 節點收集 ---------- */
    function collect() {
        const $ = id => document.getElementById(id);
        els = {
            stage: $("myntTouchFocus"), date: $("tfDate"), phase: $("tfPhase"),
            time: $("tfTime"), round: $("tfRound"), sessions: $("tfSessions"),
            toggleBtn: $("tfToggleBtn"), resetBtn: $("tfResetBtn"),
            todoCard: $("tfTodoCard"), todoTitle: $("tfTodoTitle"), todoList: $("tfTodoList"),
            scrim: $("tfScrim"), sheet: $("tfSheet"), handle: $("tfSheetHandle"),
            handleLabel: $("tfSheetLabel"), sheetBody: $("tfSheetBody"),
            srcDate: $("date"), searchbar: $("searchbar"), quickLinks: $("quickLinksRow"),
            todoTrigger: $("todoListCont"), todoContainer: $("todoContainer"),
            quote: $("studyQuote"), countdown: $("eventCountdownCard"),
            video: $("videoBg"), themeMeta: document.querySelector('meta[name="theme-color"]')
        };
        return Boolean(els.stage && els.sheetBody);
    }

    function moveInto(parent, el) {
        moved.push({ el, parent: el.parentNode, next: el.nextSibling });
        parent.appendChild(el);
    }

    /* ---------- 抽屜 ---------- */
    function setSheetOpen(open, refocus = true) {
        els.sheet.classList.toggle("tfOpen", open);
        els.handle.setAttribute("aria-expanded", String(open));
        els.handle.setAttribute("aria-label", tr(open ? "tfHandleCollapse" : "tfHandleExpand",
            open ? "Collapse drawer" : "Expand search, shortcuts and to-do"));
        clearTimeout(scrimHideTimer);
        if (open) {
            els.scrim.hidden = false;
            requestAnimationFrame(() => els.scrim.classList.add("tfOn"));
            els.sheetBody.focus({ preventScroll: true });
        } else {
            els.scrim.classList.remove("tfOn");
            scrimHideTimer = setTimeout(() => { els.scrim.hidden = true; }, 260);
            if (refocus) els.handle.focus();
        }
    }

    function bindSheet() {
        on(els.handle, "click", () => {
            if (swipeHandled) { swipeHandled = false; return; }
            setSheetOpen(!els.sheet.classList.contains("tfOpen"));
        });
        on(els.scrim, "click", () => setSheetOpen(false));
        on(document, "keydown", e => {
            if (e.key !== "Escape" || !els.sheet.classList.contains("tfOpen")) return;
            // 讓開啟中的設定面板或原生 dialog 先處理 Esc
            if (document.getElementById("menuBar")?.style.display === "block") return;
            if (document.querySelector("dialog[open]")) return;
            setSheetOpen(false);
        }, true);

        // 把手上的垂直滑動：往上展開、往下收合
        let startY = null;
        on(els.handle, "pointerdown", e => {
            startY = e.clientY;
            try { els.handle.setPointerCapture(e.pointerId); } catch { /* 舊版 Safari 無 capture 時略過 */ }
        });
        on(els.handle, "pointercancel", () => { startY = null; });
        on(els.handle, "pointerup", e => {
            if (startY === null) return;
            const dy = e.clientY - startY;
            startY = null;
            if (dy <= -40 && !els.sheet.classList.contains("tfOpen")) {
                swipeHandled = true;
                setSheetOpen(true);
            } else if (dy >= 40 && els.sheet.classList.contains("tfOpen")) {
                swipeHandled = true;
                setSheetOpen(false);
            }
        });
    }

    /* ---------- 番茄鐘：只讀共用狀態，不寫 pomodoroCheckboxState ---------- */
    function phaseLabel(phase) {
        return phase === "shortBreak" ? tr("pomoFloat_shortBreak", "Short Break")
            : phase === "longBreak" ? tr("pomoFloat_longBreak", "Long Break")
            : tr("pomoFloat_work", "Work");
    }

    function renderPomodoro(state) {
        if (!state) return;
        const remain = Math.max(0, Math.ceil(state.timeRemaining));
        els.time.textContent = Math.floor(remain / 60) + ":" + String(remain % 60).padStart(2, "0");
        els.phase.textContent = phaseLabel(state.phase);
        els.round.textContent = fmt("tfRoundFmt", "Round {n} of {t}",
            { n: state.currentRound, t: state.settings?.roundsBeforeLong ?? 4 });

        if (state.sessionId !== lastSessionId) {
            lastSessionId = state.sessionId;
            let count = 0;
            try { count = window.myntPomodoro?.getContext?.().sessionsToday ?? 0; } catch { /* 讀取失敗僅少顯示次數 */ }
            els.sessions.textContent = fmt("tfSessionsFmt", "{n} focus sessions today", { n: count });
        }

        els.toggleBtn.textContent = state.isRunning
            ? tr("pomoFloat_pause", "Pause")
            : (remain > 0 && remain < state.totalTime ? tr("tfResume", "Resume") : tr("pomoFloat_start", "Start"));
    }

    function bindPomodoro() {
        const api = window.myntPomodoro;
        if (!api?.subscribe) {
            on(document, "mynt:pomodoro-ready", bindPomodoro, { once: true });
            return;
        }
        els.resetBtn.textContent = tr("pomoFloat_reset", "Reset");
        els.toggleBtn.textContent = tr("pomoFloat_start", "Start");
        const unsub = api.subscribe(renderPomodoro);
        if (typeof unsub === "function") onCleanup(unsub);
        on(els.toggleBtn, "click", () => {
            try {
                const st = api.getState?.();
                if (st?.isRunning) api.pause(); else api.startInline();
            } catch { /* API 失敗不影響其他功能 */ }
        });
        on(els.resetBtn, "click", () => { try { api.reset(); } catch { /* 同上 */ } });
    }

    /* ---------- iPad 旁側精簡待辦（唯讀清單＋完成切換） ---------- */
    function renderTodoCard() {
        const api = window.myntTodoApi;
        if (!api || !wideMq.matches) { els.todoCard.hidden = true; return; }
        els.todoCard.hidden = false;
        els.todoTitle.textContent = tr("homeWidgetsTodo", "To-do");
        els.todoList.textContent = "";
        let items = null;
        try {
            items = api.list()
                .filter(it => it.status !== "completed")
                .sort((a, b) => (b.pinned === true) - (a.pinned === true))
                .slice(0, 8);
        } catch { items = null; }
        if (!items || !items.length) {
            const li = document.createElement("li");
            li.className = "tfTodoEmpty";
            li.textContent = items === null
                ? tr("homeWidgetsUnavailable", "Open the full panel to check this feature.")
                : tr("homeWidgetsEmpty", "All caught up.");
            els.todoList.appendChild(li);
            return;
        }
        items.forEach(item => {
            const li = document.createElement("li");
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "tfTodoItem";
            btn.setAttribute("aria-label", fmt("homeWidgetsComplete", "Complete: {title}", { title: item.title }));
            const check = document.createElement("span");
            check.className = "tfTodoCheck";
            check.setAttribute("aria-hidden", "true");
            const text = document.createElement("span");
            text.className = "tfTodoText";
            text.textContent = item.title;
            btn.append(check, text);
            btn.addEventListener("click", () => { try { api.toggle(item.id); } catch { /* 失敗時清單不變 */ } });
            li.appendChild(btn);
            els.todoList.appendChild(li);
        });
    }

    function bindTodoCard() {
        renderTodoCard();
        if (window.myntTodoApi?.subscribe) {
            const unsub = window.myntTodoApi.subscribe(renderTodoCard);
            if (typeof unsub === "function") onCleanup(unsub);
        }
        on(wideMq, "change", renderTodoCard);
    }

    /* ---------- 日期：沿用 #date 的既有格式輸出 ---------- */
    function bindDate() {
        const update = () => {
            const txt = els.srcDate?.textContent?.trim() || "";
            els.date.textContent = txt;
            els.date.hidden = !txt;
        };
        update();
        if (els.srcDate) {
            const mo = new MutationObserver(update);
            mo.observe(els.srcDate, { childList: true, characterData: true, subtree: true });
            onCleanup(() => mo.disconnect());
        }
    }

    /* ---------- theme-color：跟著 --bg-color-blue（深淺色與主題色都會反映） ---------- */
    function bindThemeColor() {
        const update = () => {
            const c = getComputedStyle(document.documentElement).getPropertyValue("--bg-color-blue").trim();
            if (/^#[0-9a-fA-F]{3,8}$/.test(c)) els.themeMeta.setAttribute("content", c);
        };
        update();
        const mo = new MutationObserver(update);
        mo.observe(document.documentElement, { attributes: true });
        onCleanup(() => mo.disconnect());
    }

    /* ---------- 背景影片：觸控不播放，保留第一格當靜態桌布 ---------- */
    function suppressVideo() {
        const video = els.video;
        if (video && typeof video.play === "function") {
            // 既有 lazy loader 會照舊 load()，讓第一格成為靜態桌布；play 則靜默放行但實際不播。
            video.play = function () { return Promise.resolve(); };
            try { video.pause(); } catch { /* 尚未載入時略過 */ }
            onCleanup(() => { delete video.play; });
        }
        // 圖庫影片與番茄鐘面板影片為動態建立：攔截播放事件即時暫停
        const onPlay = e => {
            const v = e.target;
            if (v instanceof HTMLVideoElement && v.matches(".myntGalleryVideo, .pomodoro-bg-video")) {
                try { v.pause(); } catch { /* 忽略 */ }
            }
        };
        document.addEventListener("play", onPlay, true);
        onCleanup(() => document.removeEventListener("play", onPlay, true));
        document.querySelectorAll(".myntGalleryVideo").forEach(v => { try { v.pause(); } catch { /* 忽略 */ } });
    }

    /* ---------- 靜態標籤 ---------- */
    function applyStrings() {
        els.handleLabel.textContent = tr("tfSheetLabel", "Search · Shortcuts · To-do");
        els.sheet.setAttribute("aria-label", tr("tfSheetName", "Search, shortcuts and to-do"));
        els.handle.setAttribute("aria-label", tr("tfHandleExpand", "Expand search, shortcuts and to-do"));
        document.querySelector(".tfHero")?.setAttribute("aria-label", tr("tfFocusLabel", "Focus timer"));
    }

    /* ---------- 啟停 ---------- */
    function activate() {
        if (active || !els.stage) return;
        active = true;
        const body = els.sheetBody;
        [els.searchbar, els.quickLinks, els.todoTrigger, els.todoContainer, els.countdown, els.quote]
            .filter(Boolean).forEach(el => moveInto(body, el));
        document.body.classList.add("myntTouchFocus");
        els.stage.hidden = false;
        applyStrings();
        bindSheet();
        bindPomodoro();
        bindTodoCard();
        bindDate();
        bindThemeColor();
        suppressVideo();
        on(document, "mynt:language-changed", () => { applyStrings(); renderTodoCard(); });
    }

    function deactivate() {
        if (!active) return;
        active = false;
        cleanups.splice(0).forEach(fn => { try { fn(); } catch { /* 單一清理失敗不影響其他 */ } });
        for (let i = moved.length - 1; i >= 0; i--) {
            const m = moved[i];
            try { m.parent.insertBefore(m.el, m.next); } catch { /* 原父層已消失時略過 */ }
        }
        moved = [];
        lastSessionId = "";
        setSheetOpen(false, false);
        els.stage.hidden = true;
        document.body.classList.remove("myntTouchFocus");
    }

    function boot() {
        if (!collect()) return;
        if (touchMq.matches) activate();
        touchMq.addEventListener("change", e => { e.matches ? activate() : deactivate(); });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();

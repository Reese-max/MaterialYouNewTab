/*
 * MYNT study companion: gentle encouragement line, optional exam countdown,
 * and Alt+P to open the Pomodoro timer. Quotes come from scripts/study-quotes.js
 * plus the user's own lines (myntStudyQuotesV1, via scripts/study-quotes-core.js),
 * drawn from a persisted shuffle-bag of quote ids so none repeats until all are shown.
 */
(function () {
    "use strict";
    const KEY_ON = "myntStudyQuoteEnabled";
    const KEY_EXAM = "myntExamDate";
    const lang = localStorage.getItem("selectedLanguage") || "zh_TW";
    const isZh = lang === "zh_TW" || lang === "zh";
    const ALL = (typeof MYNT_STUDY_QUOTES !== "undefined" ? MYNT_STUDY_QUOTES : []);
    const CORE = typeof MyntStudyQuotesCore !== "undefined" ? MyntStudyQuotesCore : null;
    const KEY_BAG = "myntQuoteBag";
    const $ = id => document.getElementById(id);
    function t(key, fallback) {
        if (typeof translations === "undefined") return fallback;
        return translations[lang]?.[key] || translations.en?.[key] || fallback;
    }
    const enabled = () => localStorage.getItem(KEY_ON) !== "0";
    const todayKey = () => new Date().toDateString();

    // Eligible quotes for this language. Without the core (or with unreadable data) the
    // built-in list is used as before; stored data is only read here, never rewritten.
    function pool() {
        if (CORE) {
            const { state } = CORE.read(localStorage.getItem(CORE.KEY));
            return CORE.pool(state, ALL, { isZh }).quotes;
        }
        return ALL.filter(q => isZh || q.en).map((q, i) => isZh
            ? { id: "i" + i, text: q.zh, author: q.author || "", work: q.work || "", orig: q.orig || "", builtin: true }
            : { id: "i" + i, text: q.en, author: q.authorEn || q.author || "", work: q.workEn || "", orig: "", builtin: true });
    }
    let list = pool();
    const byId = () => new Map(list.map(q => [q.id, q]));
    const sig = () => {
        let hash = 0;
        for (const q of list) for (const char of q.id) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
        return (isZh ? "zh:" : "en:") + list.length + ":" + hash.toString(36);
    };

    function shuffled(ids, avoidFirst) {
        const order = [...ids];
        for (let i = order.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
        }
        if (order.length > 1 && order[0] === avoidFirst) {
            const k = 1 + Math.floor(Math.random() * (order.length - 1));
            [order[0], order[k]] = [order[k], order[0]];
        }
        return order;
    }
    // When the pool changes (edits, imports, categories), keep today's quote if it is still
    // eligible and start a fresh rotation with it already shown.
    function loadBag() {
        let bag = null;
        try { bag = JSON.parse(localStorage.getItem(KEY_BAG) || "null"); } catch (e) { bag = null; }
        if (!bag || bag.v !== 2 || !Array.isArray(bag.order)) bag = null;
        if (!bag || bag.sig !== sig()) {
            const ids = list.map(q => q.id), keep = bag && ids.includes(bag.current) ? bag.current : null;
            const order = shuffled(keep ? ids.filter(id => id !== keep) : ids, null);
            bag = { v: 2, sig: sig(), order: keep ? [keep, ...order] : order, pos: keep ? 1 : 0, last: keep, day: keep ? bag.day : "", current: keep };
        }
        return bag;
    }
    const saveBag = bag => { try { localStorage.setItem(KEY_BAG, JSON.stringify(bag)); } catch (e) { /* rotation is a convenience */ } };
    // Draw the next id; reshuffle only after every quote has been shown.
    function draw(bag) {
        if (bag.pos >= bag.order.length) {
            bag.order = shuffled(list.map(q => q.id), bag.last);
            bag.pos = 0;
        }
        const id = bag.order[bag.pos++];
        bag.last = id;
        return id;
    }
    function currentQuote() {
        if (!list.length) return null;
        const bag = loadBag();
        if (bag.day !== todayKey() || !byId().has(bag.current)) {
            bag.current = draw(bag);
            bag.day = todayKey();
            saveBag(bag);
        }
        return byId().get(bag.current) || null;
    }
    function format(q) {
        if (!q) return { text: "", source: "" };
        const source = isZh
            ? (q.author || "") + (q.work ? "《" + q.work + "》" : "")
            : [q.author, q.work].filter(Boolean).join(", ");
        return { text: q.text, source };
    }
    const wrap = text => isZh ? "「" + text + "」" : "\u201c" + text + "\u201d";
    function fillQuote(q) {
        const { text, source } = format(q);
        $("studyQuoteBody").textContent = text ? wrap(text) : "";
        const sourceNode = $("studyQuoteSource");
        sourceNode.textContent = source ? "— " + source : "";
        sourceNode.hidden = !source;
        const btn = $("studyQuoteText");
        const full = (text ? wrap(text) : "") + (source ? " — " + source : "") + (q && q.orig && isZh ? "\n" + q.orig : "");
        btn.title = full + "\n\n" + t("studyQuoteNext", "Another line");
        btn.setAttribute("aria-label", full);
        btn.dataset.quote = text;
    }
    function examText() {
        // The dedicated countdown card owns migrated dates. Keep legacy data intact.
        if (window.myntCountdowns) return "";
        const v = localStorage.getItem(KEY_EXAM);
        if (!v) return "";
        const exam = new Date(v + "T00:00:00");
        if (isNaN(exam)) return "";
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const days = Math.round((exam - today) / 86400000);
        if (days < 0) return "";
        if (days === 0) return t("examCountdownToday", "Exam day — you've got this");
        return t("examCountdownDays", "{count} days to the exam").replace("{count}", days);
    }
    function render() {
        const el = $("studyQuote");
        if (!el) return;
        if (!enabled()) { el.hidden = true; return; }
        fillQuote(currentQuote());
        const exam = examText();
        const ex = $("studyQuoteExam");
        ex.textContent = exam;
        ex.hidden = !exam;
        el.hidden = false;
        // Up to two lines: skip quotes that would still be cut off at the current width.
        for (let tries = 1; !fitsTwoLines() && tries < list.length; tries++) {
            const bag = loadBag();
            bag.current = draw(bag);
            bag.day = todayKey();
            saveBag(bag);
            fillQuote(byId().get(bag.current));
        }
        markLines();
    }
    function fitsTwoLines() {
        const body = $("studyQuoteBody");
        // An unmeasurable (hidden) line counts as fitting.
        return !body || !body.clientHeight || body.scrollHeight <= body.clientHeight + 1;
    }
    // Lets the pill round its corners less once the line wraps.
    function markLines() {
        const el = $("studyQuote"), body = $("studyQuoteBody");
        if (!el || !body?.clientHeight || typeof getComputedStyle !== "function") return;
        const size = parseFloat(getComputedStyle(body).fontSize) || 13;
        el.dataset.lines = body.clientHeight > size * 1.9 ? "2" : "1";
    }
    function nextQuote() {
        if (!list.length) return;
        const bag = loadBag();
        bag.current = draw(bag);
        bag.day = todayKey();
        saveBag(bag);
        render();
    }
    // The manager and other tabs change the pool; the next render uses it.
    function refresh() {
        list = pool();
        render();
    }
    let toastTimer = null;
    function showAfterPomodoro() {
        if (!enabled()) return;
        const toast = $("studyQuoteToast");
        if (!toast) return;
        const bag = loadBag();
        const q = list.length ? byId().get(draw(bag)) : null;
        saveBag(bag);
        const f = format(q);
        $("studyQuoteToastText").textContent = t("studyQuoteAfterFocus", "Nice focus session.") + (q ? " " + wrap(f.text) + (f.source ? " — " + f.source : "") : "");
        toast.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { toast.hidden = true; }, 7000);
    }
    function openPomodoro() {
        if (window.myntPomodoro) return window.myntPomodoro.open();
        const cb = $("pomodoroCheckbox");
        if (cb && !cb.checked) cb.click();
        const panel = $("pomodoroPanel");
        const cont = $("pomodoroCont");
        if (cont && (!panel || getComputedStyle(panel).display === "none")) cont.click();
    }
    function init() {
        const map = {
            studyQuoteSettingText: ["studyQuoteSetting", "Study encouragement"],
            studyQuoteSettingInfo: ["studyQuoteSettingInfo", "Show a gentle line at the bottom; click it for another"],
            examDateText: ["examDateSetting", "Exam date"],
            examDateInfo: ["examDateSettingInfo", "Optional: show days left next to the encouragement line"],
            shortcutPomodoroHelp: ["shortcutPomodoroHelp", "Open Pomodoro timer"]
        };
        for (const [id, [key, fb]] of Object.entries(map)) { const e = $(id); if (e) e.textContent = t(key, fb); }
        const btn = $("studyQuoteText");
        if (btn) btn.addEventListener("click", nextQuote);
        $("studyQuoteToastClose")?.addEventListener("click", () => { $("studyQuoteToast").hidden = true; });
        const cb = $("studyQuoteCheckbox");
        if (cb) {
            cb.checked = enabled();
            cb.addEventListener("change", () => { localStorage.setItem(KEY_ON, cb.checked ? "1" : "0"); render(); });
        }
        const date = $("examDateInput");
        if (date) {
            date.value = localStorage.getItem(KEY_EXAM) || "";
            date.addEventListener("change", () => {
                if (date.value) localStorage.setItem(KEY_EXAM, date.value); else localStorage.removeItem(KEY_EXAM);
                render();
            });
        }
        document.addEventListener("mynt:pomodoro-complete", showAfterPomodoro);
        document.addEventListener("keydown", e => {
            if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
            if (e.code !== "KeyP" && e.key.toLowerCase() !== "p") return;
            const tag = document.activeElement?.tagName;
            if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || document.activeElement?.isContentEditable) return;
            e.preventDefault();
            openPomodoro();
        });
        render();
        // Web fonts can widen the line after first paint; re-check once they are ready.
        document.fonts?.ready.then(() => { if (!fitsTwoLines()) render(); else markLines(); });
    }
    document.addEventListener('mynt:mcp-settings-refresh', render);
    document.addEventListener("mynt:study-quotes-changed", refresh);
    if (CORE) {
        if (window.MyntStorageSync?.watch) window.MyntStorageSync.watch([CORE.KEY], refresh);
        else window.addEventListener?.("storage", event => { if (event.key === CORE.KEY || event.key === null) refresh(); });
    }
    window.myntStudy = { count: () => list.length, bag: loadBag, current: () => format(currentQuote()), next: nextQuote, render, refresh, openPomodoro, showAfterPomodoro };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
})();

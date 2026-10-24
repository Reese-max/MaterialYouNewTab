/*
 * MYNT study companion: gentle encouragement line, optional exam countdown,
 * and Alt+P to open the Pomodoro timer. Quotes come from scripts/study-quotes.js
 * and are drawn from a persisted shuffle-bag so none repeats until all are shown.
 */
(function () {
    "use strict";
    const KEY_ON = "myntStudyQuoteEnabled";
    const KEY_EXAM = "myntExamDate";
    const lang = localStorage.getItem("selectedLanguage") || "zh_TW";
    const isZh = lang === "zh_TW" || lang === "zh";
    const ALL = (typeof MYNT_STUDY_QUOTES !== "undefined" ? MYNT_STUDY_QUOTES : []);
    const list = isZh ? ALL : ALL.filter(q => q.en);
    const KEY_BAG = "myntQuoteBag";
    const $ = id => document.getElementById(id);
    function t(key, fallback) {
        if (typeof translations === "undefined") return fallback;
        return translations[lang]?.[key] || translations.en?.[key] || fallback;
    }
    const enabled = () => localStorage.getItem(KEY_ON) !== "0";
    const todayKey = () => new Date().toDateString();
    const sig = () => (isZh ? "zh:" : "en:") + list.length + ":" + (list[0]?.zh || "") + ":" + (list[list.length - 1]?.zh || "");

    function shuffled(n, avoidFirst) {
        const order = Array.from({ length: n }, (_, i) => i);
        for (let i = n - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
        }
        if (n > 1 && order[0] === avoidFirst) {
            const k = 1 + Math.floor(Math.random() * (n - 1));
            [order[0], order[k]] = [order[k], order[0]];
        }
        return order;
    }
    function loadBag() {
        let bag = null;
        try { bag = JSON.parse(localStorage.getItem(KEY_BAG) || "null"); } catch (e) { bag = null; }
        if (!bag || bag.sig !== sig() || !Array.isArray(bag.order) || bag.order.length !== list.length) {
            bag = { sig: sig(), order: shuffled(list.length, -1), pos: 0, last: -1, day: "", current: -1 };
        }
        return bag;
    }
    const saveBag = bag => localStorage.setItem(KEY_BAG, JSON.stringify(bag));
    // Draw the next index; reshuffle only after every quote has been shown.
    function draw(bag) {
        if (bag.pos >= bag.order.length) {
            bag.order = shuffled(list.length, bag.last);
            bag.pos = 0;
        }
        const idx = bag.order[bag.pos++];
        bag.last = idx;
        return idx;
    }
    function currentQuote() {
        if (!list.length) return null;
        const bag = loadBag();
        if (bag.day !== todayKey() || bag.current < 0) {
            bag.current = draw(bag);
            bag.day = todayKey();
            saveBag(bag);
        }
        return list[bag.current];
    }
    function format(q) {
        if (!q) return { text: "", source: "" };
        const text = isZh ? q.zh : q.en;
        const source = isZh ? q.author + (q.work ? "《" + q.work + "》" : "") : (q.authorEn || q.author) + (q.workEn ? ", " + q.workEn : "");
        return { text, source };
    }
    function fillQuote(q) {
        const { text, source } = format(q);
        $("studyQuoteBody").textContent = isZh ? "「" + text + "」" : "“" + text + "”";
        $("studyQuoteSource").textContent = "— " + source;
        const btn = $("studyQuoteText");
        const full = (isZh ? "「" + text + "」" : "“" + text + "”") + " — " + source + (q && q.orig && isZh ? "\n" + q.orig : "");
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
    }
    function nextQuote() {
        if (!list.length) return;
        const bag = loadBag();
        bag.current = draw(bag);
        bag.day = todayKey();
        saveBag(bag);
        render();
    }
    let toastTimer = null;
    function showAfterPomodoro() {
        if (!enabled()) return;
        const toast = $("studyQuoteToast");
        if (!toast) return;
        const bag = loadBag();
        const q = list.length ? list[draw(bag)] : null;
        saveBag(bag);
        const f = format(q);
        $("studyQuoteToastText").textContent = t("studyQuoteAfterFocus", "Nice focus session.") + (q ? " " + (isZh ? "「" + f.text + "」" : "“" + f.text + "”") + " — " + f.source : "");
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
    }
    window.myntStudy = { count: () => list.length, bag: loadBag, current: () => format(currentQuote()), next: nextQuote, render, openPomodoro, showAfterPomodoro };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
})();

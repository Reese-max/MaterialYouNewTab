/*
 * MYNT study companion: gentle encouragement line, optional exam countdown,
 * and Alt+P to open the Pomodoro timer. Lines are original and unattributed.
 */
(function () {
    "use strict";
    const QUOTES_ZH = [
        "今天讀的每一頁，都是考場上多出來的一分把握。",
        "慢慢來沒關係，只要不停下來。",
        "你不需要一次讀完全部，只需要把眼前這一節讀懂。",
        "累了就休息，休息完再出發，這也是計畫的一部分。",
        "每一次訂正錯題，都是在替未來的自己擋下一題陷阱。",
        "考古題寫熟了，考場就不再陌生。",
        "今天的專注，會在放榜那天回來找你。",
        "進度落後不代表失敗，只代表你還在路上。",
        "把手機放遠一點，把夢想拉近一點。",
        "穿上制服的那一天，會感謝現在沒有放棄的你。",
        "一個番茄鐘也好，先開始，就贏了一半。",
        "不必和別人比進度，只要比昨天的自己更熟一點。",
        "法條背不起來很正常，多看幾次，它就會變成你的。",
        "資料庫、資安、程式，一題一題拆開，就沒有那麼可怕。",
        "今天卡住的觀念，明天也許就突然想通了。",
        "讀書像跑馬拉松，配速比衝刺重要。",
        "你已經比剛開始的時候進步很多了。",
        "認真的人不一定最快，但通常走得最遠。",
        "允許自己有低潮的日子，但別讓它變成習慣。",
        "每天前進一點點，累積起來就是很大一步。",
        "不會的題目，正是最值得花時間的地方。",
        "專心二十五分鐘，再好好喘口氣。",
        "你的努力也許沒人看見，但成績會看見。",
        "把今天該做的事做好，就是對未來最好的準備。",
        "寫錯不可怕，可怕的是不知道自己錯在哪裡。",
        "有計畫的努力，比焦慮更有力量。",
        "深呼吸，把注意力拉回眼前這一題。",
        "今天比昨天多懂一個觀念，就值得肯定。",
        "別急著否定自己，你只是還在學。",
        "考試考的是準備，也考你堅持到最後的耐心。",
        "目標很遠，但每一步都算數。",
        "現在吃的苦，會變成將來守護別人的底氣。",
        "不要等狀態好才開始，開始了狀態就會來。",
        "複習是把知識留住，不是浪費時間。",
        "讀不下去的時候，先整理筆記也是一種前進。",
        "你選擇了一條不容易的路，也選擇了一個值得的未來。",
        "睡飽、吃好、讀穩，身體也是備考的一部分。",
        "一題一題寫，一天一天過，終點自然會到。",
        "今天的你，已經在為明天的自己鋪路。",
        "不必完美，只要比放棄多走一步。",
        "情境實務多想一層，答案就清楚一點。",
        "英文單字每天幾個，半年後就是一整本。",
        "專注不是天生的，是一次次練出來的。",
        "當你想放棄時，想想當初為什麼開始。",
        "努力不會說謊，它只是需要一點時間發酵。",
        "把大目標拆小，把小目標做完。",
        "讀書累了，看看窗外，再回來繼續。",
        "你正在成為那個能保護別人的人。",
        "每一個安靜讀書的夜晚，都在默默累積力量。",
        "今天不完美也沒關係，明天再補上。",
        "相信過程，也相信自己。",
        "進考場前的每一天，都是加分的機會。",
        "別讓一次模考的分數，定義你的全部。",
        "把會的題目寫穩，把不會的題目搞懂。",
        "堅持不是不累，而是累了還願意再試一次。",
        "你比自己以為的還要能撐。",
        "讀書的路有點孤單，但你並不是一個人。",
        "休息不是偷懶，是為了走更長的路。",
        "今天也辛苦了，記得對自己說聲謝謝。",
        "一步一腳印，榜單上會有你的名字。",
        "小小的進步，也值得被好好記住。",
        "現在的堅持，是給未來的自己最好的禮物。",
        "清楚的頭腦，比熬夜的疲憊更有用。",
        "專心讀完這一段，再獎勵自己一杯水。"
    ];
    const QUOTES_EN = [
        "Every page you read today is one more point of confidence on exam day.",
        "Slow is fine. Just don't stop.",
        "You don't need to finish everything\u2014just understand this section.",
        "Rest is part of the plan, too.",
        "Each corrected mistake blocks a future trap.",
        "Start one Pomodoro. Starting is half the work.",
        "Compare yourself only with yesterday's you.",
        "Progress you can't see today will show up on results day.",
        "Break the big goal into small steps, then finish them.",
        "Consistency beats intensity.",
        "Breathe, and bring your focus back to this one question.",
        "You have already come a long way."
    ];
    const KEY_ON = "myntStudyQuoteEnabled";
    const KEY_OFFSET = "myntStudyQuoteOffset";
    const KEY_EXAM = "myntExamDate";
    const lang = localStorage.getItem("selectedLanguage") || "zh_TW";
    const list = (lang === "zh_TW" || lang === "zh") ? QUOTES_ZH : QUOTES_EN;
    const $ = id => document.getElementById(id);
    function t(key, fallback) {
        if (typeof translations === "undefined") return fallback;
        return translations[lang]?.[key] || translations.en?.[key] || fallback;
    }
    const enabled = () => localStorage.getItem(KEY_ON) !== "0";
    function dayIndex() {
        const d = new Date();
        return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000);
    }
    function quoteAt(offset) {
        const n = list.length;
        return list[(((dayIndex() * 7) + offset) % n + n) % n];
    }
    function examText() {
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
        const offset = Number(localStorage.getItem(KEY_OFFSET + ":" + dayIndex())) || 0;
        $("studyQuoteText").textContent = quoteAt(offset);
        const exam = examText();
        const ex = $("studyQuoteExam");
        ex.textContent = exam;
        ex.hidden = !exam;
        el.hidden = false;
    }
    function nextQuote() {
        const key = KEY_OFFSET + ":" + dayIndex();
        localStorage.setItem(key, String((Number(localStorage.getItem(key)) || 0) + 1));
        render();
    }
    let toastTimer = null;
    function showAfterPomodoro() {
        if (!enabled()) return;
        const toast = $("studyQuoteToast");
        if (!toast) return;
        $("studyQuoteToastText").textContent = t("studyQuoteAfterFocus", "Nice focus session.") + " " + quoteAt(Math.floor(Math.random() * list.length));
        toast.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { toast.hidden = true; }, 7000);
    }
    function openPomodoro() {
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
        if (btn) { btn.title = t("studyQuoteNext", "Another line"); btn.addEventListener("click", nextQuote); }
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
    window.myntStudy = { next: nextQuote, render, openPomodoro, showAfterPomodoro };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
})();

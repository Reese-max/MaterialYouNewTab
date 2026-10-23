/*
 * MYNT daily focus helpers: sub-steps, subject, GPT breakdown, paste parsing, history.
 * No network access and no API keys; ChatGPT is opened as a normal tab.
 */

const MYNT_FOCUS_SUBJECTS = [
    ["db", "資料庫", "Database"],
    ["sec", "資安", "Security"],
    ["im", "資管", "Info Mgmt"],
    ["prog", "程式", "Programming"],
    ["chi", "國文", "Chinese"],
    ["law", "憲法英文", "Const./English"],
    ["police", "法規", "Police law"],
    ["case", "情境", "Scenarios"]
];

function myntParseFocusSteps(raw) {
    const lines = String(raw || "").replace(/\r/g, "").split("\n");
    const steps = [];
    const pattern = /^\s*(?:(?:\d{1,2}|[一二三四五六七八九十])\s*[.)、．:：）]|[-*•‧]\s|步驟\s*\d+\s*[:：.、]?|step\s*\d+\s*[:：.]?)\s*(.+)$/i;
    for (const line of lines) {
        const match = line.match(pattern);
        if (!match) continue;
        const text = match[1].replace(/\*\*|__|`/g, "").replace(/\s+/g, " ").trim();
        if (text) steps.push(text.slice(0, 80));
        if (steps.length === 3) break;
    }
    return steps;
}

function myntDaysUntil(dateText, today = new Date()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateText || ""))) return null;
    const [y, m, d] = dateText.split("-").map(Number);
    const target = Date.UTC(y, m - 1, d);
    const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const days = Math.round((target - now) / 86400000);
    return days >= 0 ? days : null;
}

function myntBuildFocusPrompt({ text, subject, days }) {
    const lines = [
        "請幫我把「今天最重要的事」拆成 2–4 個具體步驟，每步都能在一個番茄鐘（25 分鐘）內完成，並標上預估時間。",
        "請只用編號清單回覆，例如：「1. 讀完第 3 章正規化重點（25 分鐘）」，不要額外說明。",
        "",
        `今日焦點：${String(text || "").slice(0, 160)}`
    ];
    if (subject) lines.push(`科目：${subject}`);
    if (Number.isInteger(days)) lines.push(`距離考試：${days} 天`);
    lines.push("背景：我正在準備警察特考三等資訊管理組。");
    return lines.join("\n");
}

function myntChatGptUrl(prompt) {
    return `https://chatgpt.com/?q=${encodeURIComponent(String(prompt).slice(0, 1500))}`;
}

function myntRecordFocusLog(log, focus, keep = 14) {
    const next = log && typeof log === "object" && !Array.isArray(log) ? { ...log } : {};
    if (focus?.date && focus.text) {
        const steps = Array.isArray(focus.steps) ? focus.steps : [];
        next[focus.date] = {
            t: focus.text.slice(0, 160),
            ...(focus.subject ? { s: focus.subject } : {}),
            c: focus.completed ? 1 : 0,
            ...(focus.rounds ? { r: focus.rounds } : {}),
            ...(steps.length ? { st: `${steps.filter(step => step.done).length}/${steps.length}` } : {})
        };
    }
    for (const key of Object.keys(next).sort().reverse().slice(keep)) delete next[key];
    return next;
}

const MYNT_EXAM_ARCHIVE_URL = "https://reese-max.github.io/police-exam-archive/";

function myntExamArchiveUrl(saved) {
    return /^https:\/\/[^\s"'<>]+$/.test(String(saved || "")) ? saved : MYNT_EXAM_ARCHIVE_URL;
}

// Minutes per subject over the last 7 days (today included), from focus-log rounds.
function myntWeeklySubjectMinutes(log, workMinutes = 25, now = new Date()) {
    const per = Math.max(1, Number(workMinutes) || 25);
    const totals = {};
    for (let i = 0; i < 7; i++) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const entry = log?.[key];
        const rounds = Number(entry?.r) || 0;
        if (!entry || !rounds) continue;
        const subject = entry.s || "other";
        totals[subject] = (totals[subject] || 0) + rounds * per;
    }
    return Object.entries(totals).sort((a, b) => (a[0] === "other") - (b[0] === "other") || b[1] - a[1]);
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { myntParseFocusSteps, myntBuildFocusPrompt, myntChatGptUrl, myntRecordFocusLog, myntDaysUntil, MYNT_FOCUS_SUBJECTS, myntWeeklySubjectMinutes, myntExamArchiveUrl };
}

if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", () => {
    const LOG_KEY = "myntFocusLog";
    const $ = id => document.getElementById(id);
    const language = () => localStorage.getItem("selectedLanguage") || "zh_TW";
    const isZh = () => language().startsWith("zh");
    const t = (key, fallback) => translations[language()]?.[key] || translations.en?.[key] || fallback;
    const api = window.myntFocus;
    const more = $("dailyFocusMoreBtn");
    const panel = $("dailyFocusPanel");
    if (!api || !more || !panel) return;

    const subjectRow = $("dailyFocusSubjects");
    const stepList = $("dailyFocusSteps");
    const stepInput = $("dailyFocusStepInput");
    const pasteBox = $("dailyFocusPaste");
    const pasteWrap = $("dailyFocusPasteWrap");
    const daidaiBtn = $("dailyFocusDaidaiBtn");
    const note = $("dailyFocusNote");
    let lastHistoryWrite = "";

    function subjectLabel(id) {
        const entry = MYNT_FOCUS_SUBJECTS.find(item => item[0] === id);
        return entry ? (isZh() ? entry[1] : entry[2]) : "";
    }

    function flash(message) {
        note.textContent = message;
        note.hidden = !message;
        clearTimeout(flash.timer);
        if (message) flash.timer = setTimeout(() => { note.hidden = true; }, 4000);
    }

    function writeLog(focus) {
        let log = {};
        try { log = JSON.parse(localStorage.getItem(LOG_KEY) || "{}"); } catch {}
        const next = JSON.stringify(myntRecordFocusLog(log, focus));
        if (next !== lastHistoryWrite) {
            localStorage.setItem(LOG_KEY, next);
            lastHistoryWrite = next;
        }
    }

    function renderSubjects(focus) {
        subjectRow.replaceChildren(...MYNT_FOCUS_SUBJECTS.map(([id]) => {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "dailyFocusChip";
            chip.textContent = subjectLabel(id);
            chip.setAttribute("aria-pressed", String(focus.subject === id));
            chip.addEventListener("click", () => api.update({ subject: focus.subject === id ? "" : id }));
            return chip;
        }));
        $("dailyFocusSubjectBadge").textContent = focus.subject ? subjectLabel(focus.subject) : "";
        $("dailyFocusSubjectBadge").hidden = !focus.subject;
    }

    function renderSteps(focus) {
        const steps = focus.steps || [];
        stepList.replaceChildren(...steps.map((step, index) => {
            const row = document.createElement("li");
            const label = document.createElement("label");
            const box = document.createElement("input");
            box.type = "checkbox";
            box.checked = step.done;
            box.addEventListener("change", () => {
                const next = api.get().steps || [];
                if (next[index]) next[index].done = box.checked;
                api.update({ steps: next });
            });
            const span = document.createElement("span");
            span.textContent = step.text;
            label.append(box, span);
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "dailyFocusStepRemove";
            remove.textContent = "×";
            remove.setAttribute("aria-label", t("dailyFocusStepRemove", "Remove step"));
            remove.addEventListener("click", () => {
                const next = api.get().steps || [];
                next.splice(index, 1);
                api.update({ steps: next });
            });
            row.append(label, remove);
            return row;
        }));
        stepInput.disabled = steps.length >= 3;
        stepInput.placeholder = steps.length >= 3 ? t("dailyFocusStepsFull", "Up to 3 steps") : t("dailyFocusStepPlaceholder", "Add a small step, press Enter");
        const done = steps.filter(step => step.done).length;
        more.textContent = steps.length ? `${done}/${steps.length}` : "⋯";
    }

    function localize() {
        document.querySelectorAll("[data-focus-i18n]").forEach(el => {
            const [key, fallback] = el.dataset.focusI18n.split("|");
            const value = t(key, fallback);
            if (el.dataset.focusAttr) el.setAttribute(el.dataset.focusAttr, value);
            else el.textContent = value;
            if (el.dataset.focusTitle !== undefined) { el.title = value; el.setAttribute("aria-label", value); }
        });
    }

    function render() {
        const focus = api.get();
        localize();
        renderSubjects(focus);
        renderSteps(focus);
        daidaiBtn.hidden = !window.myntDaidai?.paired?.();
        writeLog(focus);
    }

    function addSteps(texts) {
        const steps = api.get().steps || [];
        const room = 3 - steps.length;
        const added = texts.map(text => String(text || "").trim()).filter(Boolean).slice(0, Math.max(0, room));
        if (!added.length) return 0;
        api.update({ steps: [...steps, ...added.map(text => ({ text: text.slice(0, 80), done: false }))] });
        return added.length;
    }

    function prompt() {
        const focus = api.get();
        return myntBuildFocusPrompt({
            text: focus.text,
            subject: focus.subject ? MYNT_FOCUS_SUBJECTS.find(item => item[0] === focus.subject)?.[1] : "",
            days: myntDaysUntil(localStorage.getItem("myntExamDate"))
        });
    }

    function openGpt() {
        const focus = api.get();
        if (!focus.text) return flash(t("dailyFocusNeedText", "Write today’s focus first."));
        window.open(myntChatGptUrl(prompt()), "_blank", "noopener");
        setPanel(true);
        pasteWrap.hidden = false;
        flash(t("dailyFocusGptHint", "Paste ChatGPT’s numbered list here to turn it into steps."));
    }

    function setPanel(open) {
        panel.hidden = !open;
        daidaiBtn.hidden = !window.myntDaidai?.paired?.();
        more.setAttribute("aria-expanded", String(open));
    }

    more.addEventListener("click", () => setPanel(panel.hidden));
    const dismissPanel = event => {
        if (event.key !== "Escape" || event.isComposing || panel.hidden) return;
        event.preventDefault();
        event.stopPropagation();
        setPanel(false);
        more.focus({ preventScroll: true });
    };
    panel.addEventListener("keydown", dismissPanel);
    more.addEventListener("keydown", dismissPanel);
    $("dailyFocusGptBtn").addEventListener("click", openGpt);
    $("dailyFocusPlayBtn").addEventListener("click", event => {
        // Stop the document-level "click outside closes Pomodoro" handler from closing the panel we open.
        event.stopPropagation();
        const focus = api.get();
        if (!focus.text) return flash(t("dailyFocusNeedText", "Write today’s focus first."));
        api.update({ linked: true });
        if (window.myntPomodoro) window.myntPomodoro.start();
        else window.myntStudy?.openPomodoro?.();
    });
    stepInput.addEventListener("keydown", event => {
        if (event.key !== "Enter" || event.isComposing) return;
        event.preventDefault();
        if (addSteps([stepInput.value])) stepInput.value = "";
    });
    $("dailyFocusPasteToggle").addEventListener("click", () => {
        pasteWrap.hidden = !pasteWrap.hidden;
        if (!pasteWrap.hidden) pasteBox.focus();
    });
    $("dailyFocusPasteApply").addEventListener("click", () => {
        const parsed = myntParseFocusSteps(pasteBox.value);
        if (!parsed.length) return flash(t("dailyFocusPasteNone", "No numbered list found."));
        const count = addSteps(parsed);
        flash(count ? t("dailyFocusPasteAdded", "Added {count} steps.").replace("{count}", count) : t("dailyFocusStepsFull", "Up to 3 steps"));
        if (count) { pasteBox.value = ""; pasteWrap.hidden = true; }
    });
    daidaiBtn.addEventListener("click", () => {
        const focus = api.get();
        if (!focus.text) return flash(t("dailyFocusNeedText", "Write today’s focus first."));
        flash(t("dailyFocusDaidaiSending", "Asking DaiDai… confirm the steps in the dialog."));
        document.dispatchEvent(new CustomEvent("mynt:daidai-prompt", { detail: { kind: "focus-breakdown", text: prompt() } }));
    });

    document.addEventListener("mynt:focus-steps-add", event => {
        const titles = Array.isArray(event.detail?.titles) ? event.detail.titles : [];
        addSteps(titles);
    });
    document.addEventListener("mynt:focus-breakdown-status", event => {
        if (!event.detail?.ok) flash(t("dailyFocusDaidaiFailed", "DaiDai is unavailable. Use ChatGPT and paste the answer."));
    });
    document.addEventListener("mynt:pomodoro-complete", () => {
        const focus = api.get();
        if (focus.linked && focus.text && !focus.completed) api.update({ rounds: (focus.rounds || 0) + 1 });
    });
    document.addEventListener("mynt:focus-completed", () => {
        // Reuse the shared shuffle bag so the bottom quote line advances; no extra toast.
        window.myntStudy?.next?.();
    });
    document.addEventListener("mynt:focus-changed", render);
    document.addEventListener("mynt:focus-visible", event => {
        $("dailyFocusTools").hidden = !event.detail?.visible;
        if (!event.detail?.visible) setPanel(false);
    });

    // History dialog (Ctrl+K → 焦點紀錄)
    const dialog = $("focusHistoryDialog");
    function openHistory() {
        writeLog(api.get());
        let log = {};
        try { log = JSON.parse(localStorage.getItem(LOG_KEY) || "{}"); } catch {}
        const list = $("focusHistoryList");
        const days = Object.keys(log).sort().reverse().slice(0, 7);
        if (!days.length) {
            const empty = document.createElement("li");
            empty.className = "focusHistoryEmpty";
            empty.textContent = t("focusHistoryEmpty", "No focus recorded yet.");
            list.replaceChildren(empty);
        } else {
            list.replaceChildren(...days.map(day => {
                const entry = log[day];
                const row = document.createElement("li");
                const date = document.createElement("span");
                date.className = "focusHistoryDate";
                date.textContent = day.slice(5);
                const text = document.createElement("span");
                text.className = "focusHistoryText";
                text.textContent = `${entry.c ? "✓ " : ""}${entry.t}`;
                const meta = document.createElement("span");
                meta.className = "focusHistoryMeta";
                meta.textContent = [
                    entry.s ? subjectLabel(entry.s) : "",
                    entry.r ? t("dailyFocusRounds", "{count} focus rounds").replace("{count}", entry.r) : "",
                    entry.st || ""
                ].filter(Boolean).join(" · ");
                row.append(date, text, meta);
                return row;
            }));
        }
        if (!dialog.open) dialog.showModal();
    }
    function renderStats() {
        let log = {};
        try { log = JSON.parse(localStorage.getItem(LOG_KEY) || "{}"); } catch {}
        const rows = myntWeeklySubjectMinutes(log, localStorage.getItem("pomodoroWorkMinutes"));
        const list = $("focusStatsList");
        if (!rows.length) {
            const empty = document.createElement("li");
            empty.className = "focusHistoryEmpty";
            empty.textContent = t("focusStatsEmpty", "No focus rounds with a subject this week.");
            list.replaceChildren(empty);
            return;
        }
        const max = rows[0][1];
        list.replaceChildren(...rows.map(([id, minutes]) => {
            const row = document.createElement("li");
            const name = document.createElement("span");
            name.className = "focusStatsName";
            name.textContent = id === "other" ? t("focusStatsOther", "No subject") : subjectLabel(id);
            const bar = document.createElement("span");
            bar.className = "focusStatsBar";
            bar.style.setProperty("--w", `${Math.max(4, Math.round(minutes / max * 100))}%`);
            const value = document.createElement("span");
            value.className = "focusStatsValue";
            value.textContent = `${(minutes / 60).toFixed(1)} h`;
            row.append(name, bar, value);
            row.setAttribute("aria-label", `${name.textContent} ${value.textContent}`);
            return row;
        }));
    }
    const examUrl = () => myntExamArchiveUrl(localStorage.getItem("myntExamArchiveUrl"));
    const openExam = () => window.open(examUrl(), "_blank", "noopener");
    $("focusStatsDetails").addEventListener("toggle", event => { if (event.target.open) renderStats(); });
    $("focusExamLink").addEventListener("click", event => { event.preventDefault(); openExam(); });
    $("focusHistoryClose").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });

    window.myntFocusCommands = query => [
        {
            id: "focus-history",
            labelText: t("commandFocusHistory", "Focus history"),
            infoText: t("commandFocusHistoryInfo", "Last 7 days of today’s focus"),
            group: "commandGroupTask",
            run: openHistory
        },
        {
            id: "focus-gpt",
            labelText: t("commandFocusGpt", "Break down focus with ChatGPT"),
            infoText: t("commandFocusGptInfo", "Opens chatgpt.com with a prepared prompt"),
            group: "commandGroupTask",
            run: openGpt
        },
        {
            id: "exam-today",
            labelText: t("commandExamToday", "One past exam question today"),
            infoText: t("commandExamTodayInfo", "Opens your police exam archive"),
            group: "commandGroupTask",
            run: openExam
        }
    ].filter(command => !query || `${command.labelText} ${command.infoText} focus 焦點 exam 考古題`.toLocaleLowerCase().includes(query));
    window.myntFocusCard = { openHistory, openGpt, addSteps, prompt, renderStats, examUrl };

    render();
});

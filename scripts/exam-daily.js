/*
 * MYNT daily past-exam question (今日考古題).
 * Data: public JSON in Reese-max/police-exam-archive (raw.githubusercontent.com, CORS *).
 * Only MYNT_EXAM_BASE is ever fetched; no keys, no other origins. Today's question is cached
 * in localStorage so it still shows offline; on failure the card falls back to a link.
 */

const MYNT_EXAM_BASE = "https://raw.githubusercontent.com/Reese-max/police-exam-archive/master/%E8%80%83%E5%8F%A4%E9%A1%8C%E5%BA%AB/%E8%B3%87%E8%A8%8A%E7%AE%A1%E7%90%86/";
const MYNT_EXAM_SITE = "https://reese-max.github.io/police-exam-archive/";
// [path under 考古題庫/資訊管理, number of multiple-choice questions]; generated from the repo tree.
const MYNT_EXAM_INDEX = [["106年/中華民國憲法與警察專業英文", 60], ["106年/國文（作文、公文與測驗）", 10], ["106年/警察情境實務（包括警察法規、實務操作標準作業程序、人權保障與正當法律程序）", 20], ["106年/警察法規（包括警察法、行政執行法、社會秩序維護法、警械使用條例、集會遊行法、警察職權行使法、公務人員行政中立法）", 25], ["107年/中華民國憲法與警察專業英文", 60], ["107年/國文（作文、公文與測驗）", 10], ["107年/警察情境實務(包括警察法規、實務操作標準作業程序、人權保障與正當法律程序)", 20], ["107年/警察法規(包括警察法、行政執行法、社會秩序維護法、警械使用條例、集會遊行法、警察職權行使法、公務人員行政中立法)", 25], ["108年/中華民國憲法與警察專業英文", 60], ["108年/國文（作文、公文與測驗）", 10], ["108年/警察情境實務(包括警察法規、實務操作標準作業程序、人權保障與正當法律程序)", 20], ["108年/警察法規(包括警察法、行政執行法、社會秩序維護法、警械使用條例、集會遊行法、警察職權行使法、公務人員行政中立法)", 25], ["109年/中華民國憲法與警察專業英文", 60], ["109年/國文（作文、公文與測驗）", 10], ["109年/警察情境實務(包括警察法規、實務操作標準作業程序、人權保障與正當法律程序)", 20], ["109年/警察法規(包括警察法、行政執行法、社會秩序維護法、警械使用條例、集會遊行法、警察職權行使法、公務人員行政中立法)", 25], ["110年/中華民國憲法與警察專業英文", 60], ["110年/國文(作文、公文與測驗)", 10], ["110年/警察情境實務(包括警察法規、實務操作標準作業程序、人權保障與正當法律程序)", 20], ["110年/警察法規(包括警察法、行政執行法、社會秩序維護法、警械使用條例、集會遊行法、警察職權行使法、公務人員行政中立法)", 25], ["111年/中華民國憲法與警察專業英文", 60], ["111年/國文（作文、公文與測驗）", 10], ["111年/警察情境實務(包括警察法規、實務操作標準作業程序、人權保障與正當法律程序)", 20], ["111年/警察法規(包括警察法、行政執行法、社會秩序維護法、警械使用條例、集會遊行法、警察職權行使法、公務人員行政中立法)", 25], ["112年/中華民國憲法與警察專業英文", 60], ["112年/國文(作文與測驗)", 10], ["112年/警察情境實務(包括警察法規、實務操作標準作業程序、人權保障與正當法律程序)", 20], ["112年/警察法規(包括警察法、行政執行法、社會秩序維護法、警械使用條例、集會遊行法、警察職權行使法、公務人員行政中立法)", 25], ["113年/中華民國憲法與警察專業英文", 60], ["113年/國文(作文與測驗)", 10], ["113年/警察情境實務(包括警察法規、實務操作標準作業程序、人權保障與正當法律程序)", 20], ["113年/警察法規(包括警察法、行政執行法、社會秩序維護法、警械使用條例、集會遊行法、警察職權行使法、公務人員行政中立法)", 25], ["114年/中華民國憲法與警察專業英文", 60], ["114年/國文(作文與測驗)", 10], ["114年/警察情境實務(包括警察法規、實務操作標準作業程序、人權保障與正當法律程序)", 20], ["114年/警察法規(包括警察法、行政執行法、社會秩序維護法、警械使用條例、集會遊行法、警察職權行使法、公務人員行政中立法)", 25]];

function myntExamIds(index = MYNT_EXAM_INDEX) {
    return index.flatMap(([, count], f) => Array.from({ length: count }, (_, k) => `${f}.${k}`));
}

function myntExamShuffle(list, random = Math.random) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

// Same id all day; a shuffle bag so nothing repeats until every question has been shown.
function myntExamPick(state, today, index = MYNT_EXAM_INDEX, random = Math.random) {
    const valid = new Set(myntExamIds(index));
    const s = state && typeof state === "object" ? state : {};
    if (s.date === today && valid.has(s.id)) return { date: s.date, id: s.id, bag: (s.bag || []).filter(id => valid.has(id)) };
    let bag = Array.isArray(s.bag) ? s.bag.filter(id => valid.has(id)) : [];
    if (!bag.length) bag = myntExamShuffle([...valid], random);
    const id = bag.shift();
    return { date: today, id, bag };
}

function myntExamUrl(id, index = MYNT_EXAM_INDEX) {
    const entry = index[Number(String(id).split(".")[0])];
    return entry ? `${MYNT_EXAM_BASE}${entry[0].split("/").map(encodeURIComponent).join("/")}/${encodeURIComponent("試題.json")}` : "";
}

function myntExamExtract(data, id, index = MYNT_EXAM_INDEX) {
    const [f, k] = String(id).split(".").map(Number);
    const choices = (data?.questions || []).filter(q => q?.type === "choice" && q.options && typeof q.options === "object" && q.stem);
    const q = choices[k];
    if (!q) return null;
    const subject = String(data.subject || index[f]?.[0]?.split("/")[1] || "").split(/[（(]/)[0].slice(0, 30);
    const options = Object.entries(q.options).slice(0, 6).map(([key, text]) => [String(key).slice(0, 2), String(text).slice(0, 300)]);
    return {
        id, year: Number(data.year) || Number(String(index[f]?.[0]).slice(0, 3)) || null, subject,
        number: q.number, stem: String(q.stem).replace(/\s*\n\s*/g, "").slice(0, 600), options,
        answer: typeof q.answer === "string" ? q.answer.slice(0, 8) : ""
    };
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { MYNT_EXAM_BASE, MYNT_EXAM_INDEX, myntExamIds, myntExamShuffle, myntExamPick, myntExamUrl, myntExamExtract };
}

if (typeof document !== "undefined") (function () {
    const STATE_KEY = "myntExamState";
    const CACHE_KEY = "myntExamToday";
    const VISIBLE_KEY = "myntExamDailyVisible";
    const $ = id => document.getElementById(id);
    const zh = () => (localStorage.getItem("selectedLanguage") || "zh_TW").startsWith("zh");
    const L = (z, e) => (zh() ? z : e);
    const read = key => { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } };
    const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

    function init() {
        const root = $("examDaily");
        if (!root) return;
        const chip = $("examDailyChip");
        const panel = $("examDailyPanel");
        const toggle = $("examDailyCheckbox");
        let loading = null;

        function texts() {
            $("examDailyChipText").textContent = L("今日考古題", "Daily exam question");
            $("examDailyReveal").textContent = L("看答案", "Show answer");
            $("examDailySource").textContent = L("出處：警察特考考古題 ↗", "Source: police exam archive ↗");
            const s = $("examDailySettingText"); if (s) s.textContent = L("今日考古題", "Daily exam question");
            const i = $("examDailySettingInfo"); if (i) i.textContent = L("新分頁左下角每天一題資管組考古題，點開作答", "One past exam question per day, collapsed until clicked");
        }

        function render(q, failed) {
            const opts = $("examDailyOptions");
            $("examDailyAnswer").hidden = true;
            $("examDailyReveal").hidden = !q?.answer;
            if (!q) {
                $("examDailyMeta").textContent = "";
                $("examDailyStem").textContent = failed ? L("目前無法載入題目（可能離線），可直接開啟考古題網站。", "Couldn’t load today’s question (offline?). Open the archive instead.") : L("載入中…", "Loading…");
                opts.replaceChildren();
                return;
            }
            $("examDailyMeta").textContent = [q.year ? `${q.year} 年` : "", q.subject, q.number ? `第 ${q.number} 題` : ""].filter(Boolean).join(" · ");
            $("examDailyStem").textContent = q.stem;
            opts.replaceChildren(...q.options.map(([key, text]) => {
                const li = document.createElement("li");
                const b = document.createElement("button");
                b.type = "button";
                b.dataset.key = key;
                b.textContent = `(${key}) ${text}`;
                b.addEventListener("click", () => reveal(key));
                li.append(b);
                return li;
            }));
        }

        function reveal(chosen) {
            const q = read(CACHE_KEY);
            if (!q?.answer) return;
            for (const b of $("examDailyOptions").querySelectorAll("button")) {
                b.classList.toggle("is-correct", q.answer.includes(b.dataset.key));
                b.classList.toggle("is-wrong", b.dataset.key === chosen && !q.answer.includes(chosen));
                b.disabled = true;
            }
            const right = chosen && q.answer.includes(chosen);
            $("examDailyAnswer").textContent = `${chosen ? (right ? L("答對了！", "Correct! ") : L("再接再厲。", "Not quite. ")) : ""}${L("答案", "Answer")}：${q.answer}`;
            $("examDailyAnswer").hidden = false;
            $("examDailyReveal").hidden = true;
        }

        async function load() {
            const today = todayKey();
            const cached = read(CACHE_KEY);
            if (cached?.date === today && cached.stem) return cached;
            const state = myntExamPick(read(STATE_KEY), today);
            localStorage.setItem(STATE_KEY, JSON.stringify(state));
            const url = myntExamUrl(state.id);
            if (!url.startsWith(MYNT_EXAM_BASE)) throw new Error("bad url");
            const res = await fetch(url, { credentials: "omit", cache: "force-cache" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const q = myntExamExtract(await res.json(), state.id);
            if (!q) throw new Error("no question");
            const value = { ...q, date: today };
            localStorage.setItem(CACHE_KEY, JSON.stringify(value));
            return value;
        }

        function ensure() {
            if (!loading) loading = load().then(q => { render(q); return q; }, () => {
                const old = read(CACHE_KEY);
                render(old?.stem ? old : null, !old?.stem);
                loading = null;
                return null;
            });
            return loading;
        }

        function setOpen(open) {
            panel.hidden = !open;
            chip.setAttribute("aria-expanded", String(open));
            root.classList.toggle("is-open", open);
            if (open) { render(read(CACHE_KEY)?.date === todayKey() ? read(CACHE_KEY) : null); ensure(); }
        }

        function applyVisible() {
            const visible = localStorage.getItem(VISIBLE_KEY) !== "false";
            root.hidden = !visible;
            if (toggle) toggle.checked = visible;
            if (!visible) setOpen(false);
        }

        chip.addEventListener("click", () => {
            if (document.body.classList.contains("mynt-layout-editing")) return;
            setOpen(panel.hidden);
        });
        $("examDailyReveal").addEventListener("click", () => reveal(""));
        $("examDailySource").href = MYNT_EXAM_SITE;
        document.addEventListener("keydown", e => { if (e.key === "Escape" && !panel.hidden && !document.querySelector("dialog[open]")) setOpen(false); });
        toggle?.addEventListener("change", () => { localStorage.setItem(VISIBLE_KEY, String(toggle.checked)); applyVisible(); });
        texts();
        applyVisible();
        // Warm today's cache once the page is idle so the question is ready offline later.
        const warm = () => { if (!root.hidden) ensure(); };
        if ("requestIdleCallback" in window) requestIdleCallback(warm, { timeout: 4000 }); else setTimeout(warm, 1500);
        window.myntExam = { open: () => setOpen(true), close: () => setOpen(false), ensure, reveal };
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();

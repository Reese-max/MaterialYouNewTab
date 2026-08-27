/*
 * MYNT AI Assist
 * Reese-max customized edition
 * Licensed under the GNU General Public License v3.0 (GPL-3.0)
 */

(() => {
    "use strict";

    const SETTINGS_KEY = "myntAiAssistSettings";
    const TODO_KEY = "todoList";
    const TODAY_KEY = "myntTodayPlan";
    const FOCUS_HISTORY_KEY = "myntFocusHistory";
    const SCRATCHPAD_KEY = "myntScratchpadContent";
    const PROVIDERS = new Set(["auto", "chrome", "local", "off"]);

    const copy = {
        en: {
            assist: "AI Assist",
            planToday: "AI plan today",
            organize: "AI organize",
            plannerTitle: "Plan today",
            scratchpadTitle: "Organize scratchpad",
            settingsTitle: "AI Assist",
            settingsInfo: "Use Chrome built-in AI when available, otherwise fall back to local smart rules. No MYNT cloud service or API key is used.",
            provider: "Provider",
            auto: "Auto (Chrome AI → local)",
            chrome: "Chrome built-in AI",
            local: "Local smart assist",
            off: "Off",
            status: "Status",
            ready: "Ready",
            unavailable: "Unavailable",
            checking: "Checking…",
            downloading: "Downloading on-device model…",
            analyzing: "Analyzing…",
            noTasks: "Add at least one pending task first.",
            noNote: "Write something in Scratchpad first.",
            priorities: "Suggested Top 3",
            next: "Next action",
            focus: "Suggested focus",
            reason: "Why",
            apply: "Apply suggestion",
            addTasks: "Add tasks",
            replaceNote: "Replace scratchpad",
            summary: "Summary",
            tasks: "Extracted tasks",
            organized: "Organized note",
            applied: "Applied. Reloading MYNT…",
            added: "Tasks added",
            replaced: "Scratchpad updated",
            fallback: "Chrome AI is unavailable, so MYNT used local smart assist.",
            chromeError: "Chrome built-in AI is unavailable on this device. Choose Auto or Local smart assist.",
            close: "Close",
            localReason: "Prioritized pending tasks using your current Top 3, pinned tasks, goal keywords, and recent focus pattern.",
            privacy: "Only the context needed for the action is used. Auto/Chrome runs on-device when Chrome supports it; the local fallback is deterministic JavaScript. Nothing is sent to an MYNT server.",
        },
        zh_TW: {
            assist: "AI 輔助",
            planToday: "AI 幫我安排今天",
            organize: "AI 整理",
            plannerTitle: "安排今天",
            scratchpadTitle: "整理便箋",
            settingsTitle: "AI 輔助",
            settingsInfo: "優先使用 Chrome 內建 AI；不可用時自動退回本機智慧規則。不使用 MYNT 雲端服務，也不需要 API Key。",
            provider: "提供者",
            auto: "自動（Chrome AI → 本機）",
            chrome: "Chrome 內建 AI",
            local: "本機智慧輔助",
            off: "關閉",
            status: "狀態",
            ready: "可使用",
            unavailable: "不可使用",
            checking: "檢查中…",
            downloading: "正在下載裝置端模型…",
            analyzing: "分析中…",
            noTasks: "請先新增至少一個未完成待辦。",
            noNote: "請先在便箋輸入內容。",
            priorities: "建議 Top 3",
            next: "建議下一步",
            focus: "建議專注",
            reason: "原因",
            apply: "套用建議",
            addTasks: "加入 Todo",
            replaceNote: "取代便箋",
            summary: "摘要",
            tasks: "擷取出的待辦",
            organized: "整理後便箋",
            applied: "已套用，正在重新載入 MYNT…",
            added: "已加入待辦",
            replaced: "便箋已更新",
            fallback: "Chrome AI 目前不可用，已改用本機智慧輔助。",
            chromeError: "這台裝置目前無法使用 Chrome 內建 AI，請選擇「自動」或「本機智慧輔助」。",
            close: "關閉",
            localReason: "依照目前 Top 3、釘選任務、今日目標關鍵字與近期專注狀況排列未完成工作。",
            privacy: "只使用完成這次操作所需的內容。Auto／Chrome 模式在支援時於裝置端執行；本機備援是固定 JavaScript 規則。資料不會傳送到 MYNT 伺服器。",
        },
    };

    function language() {
        return (localStorage.getItem("selectedLanguage") || "zh_TW") === "zh_TW" ? "zh_TW" : "en";
    }

    function t(key) {
        const lang = language();
        return copy[lang]?.[key] || copy.en[key] || key;
    }

    function localDateKey(date = new Date()) {
        return [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, "0"),
            String(date.getDate()).padStart(2, "0"),
        ].join("-");
    }

    function safeJson(key, fallback) {
        try {
            const value = JSON.parse(localStorage.getItem(key) || "null");
            return value ?? fallback;
        } catch {
            return fallback;
        }
    }

    function getSettings() {
        const raw = safeJson(SETTINGS_KEY, {});
        const provider = PROVIDERS.has(raw?.provider) ? raw.provider : "auto";
        return { provider };
    }

    function setSettings(next) {
        const provider = PROVIDERS.has(next?.provider) ? next.provider : "auto";
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ provider }));
        refreshVisibility();
        refreshProviderStatus();
    }

    function pendingTodos() {
        const raw = safeJson(TODO_KEY, {});
        return Object.entries(raw && typeof raw === "object" ? raw : {})
            .filter(([, todo]) => todo && todo.status !== "completed" && String(todo.title || "").trim())
            .map(([id, todo], index) => ({
                id,
                title: String(todo.title).trim().slice(0, 120),
                pinned: todo.pinned === true,
                index,
            }));
    }

    function todayContext() {
        const todos = pendingTodos();
        const plan = safeJson(TODAY_KEY, {});
        const history = safeJson(FOCUS_HISTORY_KEY, {});
        const recent = Object.values(history && typeof history === "object" ? history : {})
            .slice(-7)
            .reduce((sum, day) => sum + Math.max(0, Number(day?.minutes) || 0), 0);
        return {
            date: localDateKey(),
            goal: String(plan?.goal || "").trim().slice(0, 120),
            existingPriorityIds: Array.isArray(plan?.priorityIds) ? plan.priorityIds.filter(Boolean).slice(0, 3) : [],
            existingNextTaskId: String(plan?.nextTaskId || ""),
            recentFocusMinutes: recent,
            todos,
        };
    }

    function tokenizeGoal(goal) {
        return String(goal || "")
            .toLowerCase()
            .split(/[\s,，。.!！?？、:：;；()[\]{}]+/u)
            .map(token => token.trim())
            .filter(token => token.length >= 2)
            .slice(0, 12);
    }

    function localPlan(context) {
        const goalTokens = tokenizeGoal(context.goal);
        const existing = new Map(context.existingPriorityIds.map((id, index) => [id, 6 - index]));
        const scored = context.todos.map(todo => {
            let score = existing.get(todo.id) || 0;
            if (todo.pinned) score += 4;
            const lower = todo.title.toLowerCase();
            goalTokens.forEach(token => {
                if (lower.includes(token)) score += 2;
            });
            score += Math.max(0, 1.5 - todo.index * 0.05);
            return { ...todo, score };
        }).sort((a, b) => b.score - a.score || a.index - b.index);

        const priorityIds = scored.slice(0, 3).map(item => item.id);
        const nextTaskId = priorityIds.includes(context.existingNextTaskId)
            ? context.existingNextTaskId
            : (priorityIds[0] || "");
        const focusMinutes = context.recentFocusMinutes >= 180 ? 35 : 25;
        return { priorityIds, nextTaskId, focusMinutes, reason: t("localReason"), provider: "local" };
    }

    function cleanTaskText(text) {
        return String(text || "")
            .replace(/^\s*(?:[-*+]\s*)?(?:\[[ xX]\]\s*)?/u, "")
            .replace(/^\s*\d+[.)、]\s*/u, "")
            .trim()
            .slice(0, 120);
    }

    function localOrganize(text) {
        const source = String(text || "").trim();
        let pieces = source.split(/\n+/u).map(cleanTaskText).filter(Boolean);
        if (pieces.length < 2) {
            pieces = source.split(/[。！？!?;；]+/u).map(cleanTaskText).filter(Boolean);
        }
        const seen = new Set();
        const tasks = pieces.filter(item => {
            const key = item.toLowerCase();
            if (!item || seen.has(key)) return false;
            seen.add(key);
            return true;
        }).slice(0, 5);
        const summary = pieces.slice(0, 2).join(language() === "zh_TW" ? "；" : "; ").slice(0, 220);
        const heading = language() === "zh_TW" ? "## 重點" : "## Key points";
        const organized = `${heading}\n${tasks.map(item => `- [ ] ${item}`).join("\n")}`.trim();
        return { summary, tasks, organized, provider: "local" };
    }

    function extractJson(text) {
        const raw = String(text || "").trim();
        try {
            return JSON.parse(raw);
        } catch {
            const start = raw.indexOf("{");
            const end = raw.lastIndexOf("}");
            if (start === -1 || end <= start) throw new Error("AI response was not JSON");
            return JSON.parse(raw.slice(start, end + 1));
        }
    }

    async function chromeAvailability() {
        if (!globalThis.LanguageModel?.availability || !globalThis.LanguageModel?.create) return "unavailable";
        try {
            return await globalThis.LanguageModel.availability();
        } catch {
            return "unavailable";
        }
    }

    async function chromePrompt(prompt, onProgress) {
        const availability = await chromeAvailability();
        if (availability === "unavailable") throw new Error(t("chromeError"));
        if ((availability === "downloadable" || availability === "downloading") && !navigator.userActivation?.isActive) {
            throw new Error(t("chromeError"));
        }
        const session = await globalThis.LanguageModel.create({
            monitor(monitor) {
                monitor.addEventListener("downloadprogress", event => {
                    const percent = Math.round((Number(event.loaded) || 0) * 100);
                    onProgress?.(`${t("downloading")} ${percent}%`);
                });
            },
        });
        try {
            return await session.prompt(prompt);
        } finally {
            session.destroy?.();
        }
    }

    async function chromePlan(context, onProgress) {
        const allowedIds = new Set(context.todos.map(todo => todo.id));
        const prompt = [
            "You are MYNT AI Assist, a concise productivity planner.",
            "Return ONLY valid JSON with keys priorityIds, nextTaskId, focusMinutes, reason.",
            "priorityIds must contain up to 3 IDs from the provided pending tasks. nextTaskId must be one of them.",
            "focusMinutes must be an integer from 10 to 60. Keep reason under 120 characters and answer in the user's language.",
            JSON.stringify(context),
        ].join("\n");
        const parsed = extractJson(await chromePrompt(prompt, onProgress));
        const priorityIds = Array.isArray(parsed.priorityIds)
            ? parsed.priorityIds.map(String).filter(id => allowedIds.has(id)).filter((id, index, arr) => arr.indexOf(id) === index).slice(0, 3)
            : [];
        if (!priorityIds.length) throw new Error("AI returned no valid task IDs");
        const nextTaskId = priorityIds.includes(String(parsed.nextTaskId)) ? String(parsed.nextTaskId) : priorityIds[0];
        const focusMinutes = Math.max(10, Math.min(60, Math.round(Number(parsed.focusMinutes) || 25)));
        const reason = String(parsed.reason || "").trim().slice(0, 160);
        return { priorityIds, nextTaskId, focusMinutes, reason, provider: "chrome" };
    }

    async function chromeOrganize(text, onProgress) {
        const prompt = [
            "You are MYNT AI Assist. Organize a short scratchpad note.",
            "Return ONLY valid JSON with keys summary, tasks, organized.",
            "tasks must be an array of at most 5 concise actionable items. organized must be short Markdown. Answer in the user's language.",
            JSON.stringify({ note: String(text).slice(0, 5000) }),
        ].join("\n");
        const parsed = extractJson(await chromePrompt(prompt, onProgress));
        const tasks = Array.isArray(parsed.tasks) ? parsed.tasks.map(cleanTaskText).filter(Boolean).slice(0, 5) : [];
        return {
            summary: String(parsed.summary || "").trim().slice(0, 400),
            tasks,
            organized: String(parsed.organized || "").trim().slice(0, 5000),
            provider: "chrome",
        };
    }

    async function runWithProvider(kind, payload, onProgress) {
        const selected = getSettings().provider;
        if (selected === "off") throw new Error(t("unavailable"));
        if (selected === "local") return kind === "plan" ? localPlan(payload) : localOrganize(payload);
        if (selected === "chrome") return kind === "plan"
            ? chromePlan(payload, onProgress)
            : chromeOrganize(payload, onProgress);
        try {
            return kind === "plan"
                ? await chromePlan(payload, onProgress)
                : await chromeOrganize(payload, onProgress);
        } catch (error) {
            console.info("MYNT AI Assist: Chrome built-in AI unavailable; using local fallback.", error);
            const result = kind === "plan" ? localPlan(payload) : localOrganize(payload);
            result.fallback = true;
            return result;
        }
    }

    function injectStyles() {
        if (document.getElementById("myntAiAssistStyles")) return;
        const style = document.createElement("style");
        style.id = "myntAiAssistStyles";
        style.textContent = `
            .myntAiButton { border: 0; border-radius: 999px; padding: .48rem .72rem; cursor: pointer; font: inherit; background: var(--container-color, rgba(255,255,255,.12)); color: inherit; box-shadow: inset 0 0 0 1px color-mix(in srgb, currentColor 16%, transparent); }
            .myntAiButton:hover { transform: translateY(-1px); }
            .myntAiButton[hidden] { display: none !important; }
            .myntAiTodayButton { margin-inline-start: .55rem; white-space: nowrap; }
            .myntAiScratchButton { min-width: max-content; }
            .myntAiSettingsRow { display: grid; gap: .55rem; margin-top: .7rem; }
            .myntAiSettingsRow select { width: 100%; min-height: 2.5rem; border-radius: .8rem; padding: .45rem .65rem; background: transparent; color: inherit; border: 1px solid color-mix(in srgb, currentColor 22%, transparent); }
            .myntAiPrivacy { opacity: .75; font-size: .86rem; line-height: 1.45; margin: .4rem 0 0; }
            #myntAiAssistDialog { width: min(620px, calc(100vw - 28px)); max-height: min(78vh, 720px); border: 0; border-radius: 24px; padding: 0; color: inherit; background: var(--bg-color, Canvas); box-shadow: 0 20px 70px rgba(0,0,0,.32); }
            #myntAiAssistDialog::backdrop { background: rgba(0,0,0,.42); backdrop-filter: blur(5px); }
            .myntAiDialogInner { padding: 1.1rem 1.15rem 1.2rem; display: grid; gap: .9rem; }
            .myntAiDialogHeader { display: flex; align-items: center; justify-content: space-between; gap: .75rem; }
            .myntAiDialogHeader h2 { margin: 0; font-size: 1.25rem; }
            .myntAiClose { border: 0; background: transparent; color: inherit; font-size: 1.5rem; cursor: pointer; }
            .myntAiStatus { opacity: .72; font-size: .9rem; min-height: 1.2em; }
            .myntAiResult { display: grid; gap: .85rem; overflow: auto; }
            .myntAiBlock { padding: .8rem .9rem; border-radius: 16px; background: color-mix(in srgb, currentColor 7%, transparent); }
            .myntAiBlock strong { display: block; margin-bottom: .35rem; }
            .myntAiBlock ol, .myntAiBlock ul { margin: .3rem 0 0; padding-inline-start: 1.35rem; }
            .myntAiActions { display: flex; flex-wrap: wrap; gap: .55rem; }
            .myntAiPrimary { background: var(--accent-color, currentColor); color: var(--on-accent-color, Canvas); }
            .myntAiProviderTag { font-size: .78rem; opacity: .65; }
            @media (max-width: 600px) { .myntAiTodayButton { margin-inline-start: 0; margin-top: .45rem; } #myntAiAssistDialog { border-radius: 20px; } }
        `;
        document.head.appendChild(style);
    }

    function ensureDialog() {
        let dialog = document.getElementById("myntAiAssistDialog");
        if (dialog) return dialog;
        dialog = document.createElement("dialog");
        dialog.id = "myntAiAssistDialog";
        dialog.innerHTML = `
            <div class="myntAiDialogInner">
                <div class="myntAiDialogHeader">
                    <h2 id="myntAiDialogTitle"></h2>
                    <button class="myntAiClose" id="myntAiCloseBtn" type="button" aria-label="${t("close")}">×</button>
                </div>
                <div class="myntAiStatus" id="myntAiDialogStatus"></div>
                <div class="myntAiResult" id="myntAiDialogResult"></div>
            </div>`;
        document.body.appendChild(dialog);
        dialog.querySelector("#myntAiCloseBtn")?.addEventListener("click", () => dialog.close());
        dialog.addEventListener("click", event => {
            if (event.target === dialog) dialog.close();
        });
        return dialog;
    }

    function showDialog(title) {
        const dialog = ensureDialog();
        dialog.querySelector("#myntAiDialogTitle").textContent = title;
        dialog.querySelector("#myntAiDialogStatus").textContent = "";
        dialog.querySelector("#myntAiDialogResult").replaceChildren();
        if (typeof dialog.showModal === "function") dialog.showModal();
        else dialog.setAttribute("open", "");
        return dialog;
    }

    function status(dialog, message) {
        const node = dialog.querySelector("#myntAiDialogStatus");
        if (node) node.textContent = message;
    }

    function block(label, value) {
        const node = document.createElement("div");
        node.className = "myntAiBlock";
        const strong = document.createElement("strong");
        strong.textContent = label;
        const body = document.createElement("div");
        body.textContent = value;
        node.append(strong, body);
        return node;
    }

    async function planToday() {
        const context = todayContext();
        const dialog = showDialog(t("plannerTitle"));
        if (!context.todos.length) {
            status(dialog, t("noTasks"));
            return;
        }
        status(dialog, t("analyzing"));
        try {
            const result = await runWithProvider("plan", context, message => status(dialog, message));
            const map = new Map(context.todos.map(todo => [todo.id, todo]));
            const resultNode = dialog.querySelector("#myntAiDialogResult");
            const priorities = document.createElement("div");
            priorities.className = "myntAiBlock";
            const heading = document.createElement("strong");
            heading.textContent = t("priorities");
            const list = document.createElement("ol");
            result.priorityIds.forEach(id => {
                const li = document.createElement("li");
                li.textContent = map.get(id)?.title || id;
                list.appendChild(li);
            });
            priorities.append(heading, list);
            resultNode.append(
                priorities,
                block(t("next"), map.get(result.nextTaskId)?.title || "—"),
                block(t("focus"), `${result.focusMinutes} min`),
                block(t("reason"), result.reason || "—")
            );
            if (result.fallback) resultNode.append(block(t("assist"), t("fallback")));
            const tag = document.createElement("div");
            tag.className = "myntAiProviderTag";
            tag.textContent = result.provider === "chrome" ? t("chrome") : t("local");
            const actions = document.createElement("div");
            actions.className = "myntAiActions";
            const apply = document.createElement("button");
            apply.type = "button";
            apply.className = "myntAiButton myntAiPrimary";
            apply.textContent = t("apply");
            apply.addEventListener("click", () => {
                const current = safeJson(TODAY_KEY, {});
                localStorage.setItem(TODAY_KEY, JSON.stringify({
                    ...(current && typeof current === "object" ? current : {}),
                    date: localDateKey(),
                    priorityIds: [...result.priorityIds, "", ""].slice(0, 3),
                    nextTaskId: result.nextTaskId,
                }));
                status(dialog, t("applied"));
                setTimeout(() => location.reload(), 550);
            });
            actions.append(apply);
            resultNode.append(tag, actions);
            status(dialog, "");
        } catch (error) {
            console.error("MYNT AI Assist planner failed:", error);
            status(dialog, error instanceof Error ? error.message : String(error));
        }
    }

    async function organizeScratchpad() {
        const input = document.getElementById("scratchpadInput");
        const text = input?.value || localStorage.getItem(SCRATCHPAD_KEY) || "";
        const dialog = showDialog(t("scratchpadTitle"));
        if (!String(text).trim()) {
            status(dialog, t("noNote"));
            return;
        }
        status(dialog, t("analyzing"));
        try {
            const result = await runWithProvider("organize", text, message => status(dialog, message));
            const resultNode = dialog.querySelector("#myntAiDialogResult");
            resultNode.append(block(t("summary"), result.summary || "—"));
            const tasksBlock = document.createElement("div");
            tasksBlock.className = "myntAiBlock";
            const taskHeading = document.createElement("strong");
            taskHeading.textContent = t("tasks");
            const taskList = document.createElement("ul");
            result.tasks.forEach(task => {
                const li = document.createElement("li");
                li.textContent = task;
                taskList.appendChild(li);
            });
            tasksBlock.append(taskHeading, taskList);
            resultNode.append(tasksBlock, block(t("organized"), result.organized || "—"));
            if (result.fallback) resultNode.append(block(t("assist"), t("fallback")));
            const actions = document.createElement("div");
            actions.className = "myntAiActions";
            const add = document.createElement("button");
            add.type = "button";
            add.className = "myntAiButton myntAiPrimary";
            add.textContent = t("addTasks");
            add.disabled = result.tasks.length === 0;
            add.addEventListener("click", () => {
                result.tasks.forEach(title => document.dispatchEvent(new CustomEvent("mynt:todo-create", { detail: { title } })));
                status(dialog, t("added"));
            });
            const replace = document.createElement("button");
            replace.type = "button";
            replace.className = "myntAiButton";
            replace.textContent = t("replaceNote");
            replace.disabled = !result.organized;
            replace.addEventListener("click", () => {
                if (!input || !result.organized) return;
                input.value = result.organized;
                localStorage.setItem(SCRATCHPAD_KEY, result.organized);
                input.dispatchEvent(new Event("input", { bubbles: true }));
                status(dialog, t("replaced"));
            });
            actions.append(add, replace);
            resultNode.append(actions);
            status(dialog, "");
        } catch (error) {
            console.error("MYNT AI Assist scratchpad failed:", error);
            status(dialog, error instanceof Error ? error.message : String(error));
        }
    }

    function mountActionButtons() {
        const todayTitle = document.getElementById("todayWorkTitle");
        if (todayTitle && !document.getElementById("myntAiPlanBtn")) {
            const button = document.createElement("button");
            button.id = "myntAiPlanBtn";
            button.type = "button";
            button.className = "myntAiButton myntAiTodayButton";
            button.textContent = `✨ ${t("planToday")}`;
            button.addEventListener("click", planToday);
            todayTitle.insertAdjacentElement("afterend", button);
        }
        const scratchActions = document.querySelector(".scratchpadHeaderActions");
        if (scratchActions && !document.getElementById("myntAiScratchBtn")) {
            const button = document.createElement("button");
            button.id = "myntAiScratchBtn";
            button.type = "button";
            button.className = "scratchpadActionBtn myntAiScratchButton";
            button.textContent = `✨ ${t("organize")}`;
            button.addEventListener("click", organizeScratchpad);
            scratchActions.prepend(button);
        }
    }

    async function refreshProviderStatus() {
        const node = document.getElementById("myntAiProviderStatus");
        if (!node) return;
        const provider = getSettings().provider;
        if (provider === "off") {
            node.textContent = `${t("status")}: ${t("off")}`;
            return;
        }
        if (provider === "local") {
            node.textContent = `${t("status")}: ${t("ready")} · ${t("local")}`;
            return;
        }
        node.textContent = `${t("status")}: ${t("checking")}`;
        const available = await chromeAvailability();
        const state = available === "available"
            ? t("ready")
            : available === "downloadable" || available === "downloading"
                ? t("downloading")
                : t("unavailable");
        node.textContent = `${t("status")}: ${state}${provider === "auto" && available === "unavailable" ? ` · ${t("local")}` : ""}`;
    }

    function mountSettings() {
        const content = document.querySelector("#controlCenterDialog .controlCenterContent");
        if (!content || document.getElementById("myntAiAssistSettingsSection")) return;
        const section = document.createElement("section");
        section.className = "controlSection";
        section.id = "myntAiAssistSettingsSection";
        const headingWrap = document.createElement("div");
        headingWrap.className = "controlSectionHeading";
        const headingText = document.createElement("div");
        const title = document.createElement("h3");
        title.textContent = t("settingsTitle");
        const info = document.createElement("p");
        info.textContent = t("settingsInfo");
        headingText.append(title, info);
        headingWrap.append(headingText);

        const row = document.createElement("div");
        row.className = "myntAiSettingsRow";
        const label = document.createElement("label");
        label.htmlFor = "myntAiProviderSelect";
        label.textContent = t("provider");
        const select = document.createElement("select");
        select.id = "myntAiProviderSelect";
        [["auto", t("auto")], ["chrome", t("chrome")], ["local", t("local")], ["off", t("off")]].forEach(([value, labelText]) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = labelText;
            select.appendChild(option);
        });
        select.value = getSettings().provider;
        select.addEventListener("change", () => setSettings({ provider: select.value }));
        const providerStatus = document.createElement("div");
        providerStatus.id = "myntAiProviderStatus";
        providerStatus.className = "myntAiStatus";
        const privacy = document.createElement("p");
        privacy.className = "myntAiPrivacy";
        privacy.textContent = t("privacy");
        row.append(label, select, providerStatus, privacy);
        section.append(headingWrap, row);
        content.appendChild(section);
        refreshProviderStatus();
    }

    function refreshVisibility() {
        const hidden = getSettings().provider === "off";
        document.getElementById("myntAiPlanBtn")?.toggleAttribute("hidden", hidden);
        document.getElementById("myntAiScratchBtn")?.toggleAttribute("hidden", hidden);
    }

    function init() {
        injectStyles();
        mountActionButtons();
        mountSettings();
        refreshVisibility();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();

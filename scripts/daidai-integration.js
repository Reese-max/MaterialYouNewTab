/* MYNT ↔ DaiDai: local summary sharing and confirmation-gated writes. */

function myntPlanDaidaiAction(action, state) {
    if (!action || typeof action !== "object" || !state || typeof state !== "object") {
        return { valid: false, reason: "invalid" };
    }
    // todo.create only appends, so a batch stays valid after earlier items bump the revision.
    if (action.expectedSessionId !== state.sessionId || (action.type !== "todo.create" && action.expectedRevision !== state.revision)) {
        return { valid: false, reason: "stale" };
    }
    const text = (value, max, allowEmpty = false) =>
        typeof value === "string" && value.length <= max && (allowEmpty || value.trim()) ? value.trim() : null;
    const todos = Array.isArray(state.todos) ? state.todos : [];

    if (action.type === "todo.create") {
        const title = text(action.title, 120);
        return title ? { valid: true, before: "", after: title } : { valid: false, reason: "invalid" };
    }
    if (["todo.update", "todo.complete"].includes(action.type)) {
        const todo = todos.find(item => item.id === action.todoId);
        if (!todo) return { valid: false, reason: "invalid" };
        if (action.type === "todo.update") {
            const title = text(action.title, 120);
            return title ? { valid: true, before: todo.title, after: title } : { valid: false, reason: "invalid" };
        }
        if (typeof action.completed !== "boolean") return { valid: false, reason: "invalid" };
        return {
            valid: true,
            before: `${todo.title}\n[${todo.status}]`,
            after: `${todo.title}\n[${action.completed ? "completed" : "pending"}]`
        };
    }
    if (action.type === "scratchpad.append") {
        const append = text(action.text, 2000);
        if (!append) return { valid: false, reason: "invalid" };
        const before = String(state.scratchpad || "");
        return { valid: true, before, after: before ? `${before}\n${append}` : append };
    }
    if (action.type === "scratchpad.replace") {
        const before = text(action.before, 2000);
        const replacement = text(action.text, 2000, true);
        if (!before || replacement === null) return { valid: false, reason: "invalid" };
        const source = String(state.scratchpad || "");
        if (source.split(before).length !== 2) return { valid: false, reason: "invalid" };
        return { valid: true, before, after: replacement };
    }
    return { valid: false, reason: "invalid" };
}

if (typeof module !== "undefined" && module.exports) module.exports = { myntPlanDaidaiAction };

if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", () => {
    const ENDPOINT = "http://127.0.0.1:17373";
    const ORIGIN_PERMISSION = "http://127.0.0.1/*";
    const TOKEN_KEY = "myntDaidaiScopedToken";
    const DECISIONS_KEY = "myntDaidaiActionDecisions";
    const api = globalThis.browser || globalThis.chrome;
    const clientId = api?.runtime?.id;
    const sessionId = globalThis.crypto?.randomUUID?.() || `mynt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const status = document.getElementById("daidaiConnectionStatus");
    const connectButton = document.getElementById("daidaiConnectBtn");
    const actionDialog = document.getElementById("daidaiActionDialog");
    const actionSummary = document.getElementById("daidaiActionSummary");
    const actionBefore = document.getElementById("daidaiActionBefore");
    const actionAfter = document.getElementById("daidaiActionAfter");
    const actionStale = document.getElementById("daidaiActionStale");
    const rejectButton = document.getElementById("daidaiActionRejectBtn");
    const confirmButton = document.getElementById("daidaiActionConfirmBtn");
    const actionToast = document.getElementById("daidaiActionToast");
    const actionToastText = document.getElementById("daidaiActionToastText");
    const undoButton = document.getElementById("daidaiActionUndoBtn");
    const scratchpad = document.getElementById("scratchpadInput");
    let token = null;
    let focusBreakdownUntil = 0;
    window.myntDaidai = { paired: () => Boolean(token) };
    let connected = false;
    let revision = 1;
    let syncTimer = null;
    let polling = false;
    let pendingAction = null;
    let pendingPlan = null;
    let pendingUndo = null;
    let feedbackTimer = null;
    const decisions = new Map();

    function t(key, fallback = key) {
        const language = localStorage.getItem("selectedLanguage") || "zh_TW";
        if (typeof translations === "undefined") return fallback;
        return translations[language]?.[key] || translations.en?.[key] || fallback;
    }

    function format(key, fallback, values) {
        let output = t(key, fallback);
        for (const [name, value] of Object.entries(values)) output = output.replaceAll(`{${name}}`, value);
        return output;
    }

    function storageCall(method, value) {
        const storage = api?.storage?.local;
        if (!storage) return Promise.reject(new Error("extension_storage_unavailable"));
        if (globalThis.browser?.storage?.local) return storage[method](value);
        return new Promise((resolve, reject) => storage[method](value, result => {
            const error = globalThis.chrome?.runtime?.lastError;
            if (error) reject(new Error(error.message));
            else resolve(result);
        }));
    }

    function permissionCall(method) {
        const permissions = api?.permissions;
        if (!permissions) return Promise.resolve(false);
        const request = { origins: [ORIGIN_PERMISSION] };
        if (globalThis.browser?.permissions) return permissions[method](request);
        return new Promise(resolve => permissions[method](request, result => {
            if (globalThis.chrome?.runtime?.lastError) resolve(false);
            else resolve(Boolean(result));
        }));
    }

    function setStatus(state) {
        const keys = {
            disconnected: "daidaiStatusDisconnected",
            connecting: "daidaiStatusConnecting",
            connected: "daidaiStatusConnected",
            unavailable: "daidaiStatusUnavailable",
            error: "daidaiStatusError"
        };
        status.dataset.state = state;
        status.textContent = t(keys[state], state);
        connectButton.textContent = t(connected ? "daidaiDisconnectBtn" : "daidaiConnectBtn", connected ? "Disconnect" : "Connect DaiDai");
        connectButton.disabled = ["connecting", "unavailable"].includes(state);
    }

    const notify = message => (window.myntDialog ? window.myntDialog.alert(message) : alert(message));

    async function bridge(path, { method = "GET", body, authorized = true } = {}) {
        const headers = { "x-mynt-client": clientId };
        if (authorized) headers.authorization = `Bearer ${token}`;
        if (body !== undefined) headers["content-type"] = "application/json";
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
            const response = await fetch(`${ENDPOINT}${path}`, {
                method,
                headers,
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: controller.signal
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                const error = new Error(payload.error || `HTTP ${response.status}`);
                error.status = response.status;
                throw error;
            }
            return payload;
        } finally {
            clearTimeout(timeout);
        }
    }

    function readJson(key, fallback) {
        try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
        catch { return fallback; }
    }

    function dateKey() {
        return typeof myntDateKey === "function" ? myntDateKey() : new Date().toLocaleDateString("en-CA");
    }

    function localState() {
        const rawTodos = readJson("todoList", {});
        const todos = Object.entries(rawTodos).flatMap(([id, item]) =>
            item && typeof item === "object" && typeof item.title === "string"
                ? [{ id, title: item.title, status: item.status === "completed" ? "completed" : "pending", pinned: item.pinned === true }]
                : []
        ).slice(0, 100);
        return { sessionId, revision, todos, scratchpad: scratchpad?.value || "" };
    }

    function context() {
        const state = localState();
        const today = dateKey();
        const focusHistory = readJson("myntFocusHistory", {});
        const focus = focusHistory[today] || {};
        const habits = readJson("myntHabits", []).flatMap(item => {
            if (!item || typeof item !== "object" || typeof item.id !== "string") return [];
            const name = item.source === "pomodoro"
                ? t("habitPomodoroAuto", "Complete one focus session")
                : item.source === "todo"
                    ? t("habitTodoAuto", "Complete one task")
                    : String(item.name || "").trim();
            if (!name) return [];
            return [{
                id: item.id,
                name: name.slice(0, 60),
                doneToday: Array.isArray(item.doneDates) && item.doneDates.includes(today),
                source: ["pomodoro", "todo"].includes(item.source) ? item.source : null
            }];
        }).slice(0, 30);
        return {
            version: 1,
            sessionId,
            revision,
            date: today,
            todos: state.todos,
            focus: {
                minutes: Math.max(0, Math.floor(Number(focus.minutes) || 0)),
                sessions: Math.max(0, Math.floor(Number(focus.sessions) || 0)),
                streak: typeof myntFocusStreak === "function" ? myntFocusStreak(focusHistory) : 0
            },
            habits
        };
    }

    async function forgetToken() {
        token = null;
        connected = false;
        try { await storageCall("remove", TOKEN_KEY); } catch {}
    }

    async function syncContext() {
        if (!token || document.visibilityState === "hidden") return false;
        try {
            await bridge("/v1/mynt/context", { method: "PUT", body: context() });
            connected = true;
            setStatus("connected");
            return true;
        } catch (error) {
            if (error.status === 401) await forgetToken();
            setStatus("error");
            return false;
        }
    }

    function scheduleSync(delay = 120) {
        clearTimeout(syncTimer);
        syncTimer = setTimeout(() => { void syncContext(); }, delay);
    }

    function dataChanged(delay = 120) {
        revision++;
        scheduleSync(delay);
    }

    async function connect() {
        if (!clientId || !api?.storage?.local || !api?.permissions) return setStatus("unavailable");
        setStatus("connecting");
        if (!(await permissionCall("request"))) return setStatus("disconnected");
        try {
            const request = await bridge("/v1/mynt/pair/request", { method: "POST", body: {}, authorized: false });
            const pairMessage = t("daidaiPairPrompt", "Enter the 6-digit code shown by DaiDai:");
            const code = window.myntDialog ? await window.myntDialog.prompt(pairMessage, "", { maxLength: 6 }) : prompt(pairMessage);
            if (code === null) return setStatus("disconnected");
            const paired = await bridge("/v1/mynt/pair/confirm", {
                method: "POST",
                body: { challengeId: request.challengeId, code: code.trim() },
                authorized: false
            });
            token = paired.token;
            await storageCall("set", { [TOKEN_KEY]: token });
            await syncContext();
        } catch (error) {
            await forgetToken();
            setStatus("error");
            notify(t("daidaiPairFailed", "Pairing failed."));
        }
    }

    async function disconnect({ removePermission = true } = {}) {
        const currentToken = token;
        if (currentToken) {
            try { await bridge("/v1/mynt/unpair", { method: "POST", body: {} }); } catch {}
        }
        await forgetToken();
        if (removePermission) await permissionCall("remove");
        setStatus("disconnected");
    }

    globalThis.myntDaidaiDisconnect = disconnect;
    connectButton.addEventListener("click", () => void (connected ? disconnect() : connect()));

    function scratchpadTarget() {
        if (!scratchpad) return "";
        const start = scratchpad.selectionStart;
        const end = scratchpad.selectionEnd;
        if (start !== end) return scratchpad.value.slice(start, end).trim();
        const lineStart = scratchpad.value.lastIndexOf("\n", start - 1) + 1;
        const lineEnd = scratchpad.value.indexOf("\n", start);
        return scratchpad.value.slice(lineStart, lineEnd < 0 ? scratchpad.value.length : lineEnd).trim();
    }

    async function sendPrompt(body, sourceButton) {
        if (!connected) await connect();
        if (!connected) return;
        clearTimeout(syncTimer);
        if (!(await syncContext())) return;
        try {
            await bridge("/v1/mynt/prompt", { method: "POST", body });
            const previous = sourceButton?.textContent;
            if (sourceButton) {
                sourceButton.textContent = "✓";
                setTimeout(() => { sourceButton.textContent = previous; }, 1200);
            }
        } catch {
            setStatus("error");
            notify(t("daidaiPromptFailed", "DaiDai did not receive the request."));
        }
    }

    for (const [id, kind] of [
        ["scratchpadAskDaidaiBtn", "scratchpad-ask"],
        ["scratchpadOrganizeDaidaiBtn", "scratchpad-organize"]
    ]) {
        const button = document.getElementById(id);
        button?.addEventListener("click", () => {
            const text = scratchpadTarget();
            if (!text) return notify(t("daidaiNoScratchpadText", "Select scratchpad text first."));
            void sendPrompt({ kind, text }, button);
        });
    }
    // Focus breakdown: try the dedicated kind, fall back to scratchpad-ask on older companions.
    async function sendFocusBreakdown(text) {
        const report = (ok, mode) => document.dispatchEvent(new CustomEvent("mynt:focus-breakdown-status", { detail: { ok, mode } }));
        const prompt = String(text || "").slice(0, 3000);
        if (!prompt.trim()) return report(false, "empty");
        if (!connected) await connect();
        if (!connected) return report(false, "offline");
        clearTimeout(syncTimer);
        if (!(await syncContext())) return report(false, "offline");
        focusBreakdownUntil = Date.now() + 5 * 60 * 1000;
        try {
            await bridge("/v1/mynt/prompt", { method: "POST", body: { kind: "focus-breakdown", text: prompt } });
            return report(true, "focus-breakdown");
        } catch (error) {
            if (error?.status !== 400) { focusBreakdownUntil = 0; return report(false, "error"); }
        }
        try {
            await bridge("/v1/mynt/prompt", {
                method: "POST",
                body: {
                    kind: "scratchpad-ask",
                    text: `【MYNT 今日焦點拆解】請呼叫 mynt_action 提出 2–4 個 todo.create 操作（每個 title 不超過 40 字，含預估時間），等我在 MYNT 預覽並確認；不要聲稱已經修改。\n\n${prompt}`
                }
            });
            report(true, "scratchpad-ask");
        } catch {
            focusBreakdownUntil = 0;
            report(false, "error");
        }
    }

    document.addEventListener("mynt:daidai-prompt", event => {
        if (event.detail?.kind === "todo") void sendPrompt(event.detail, null);
        else if (event.detail?.kind === "focus-breakdown") void sendFocusBreakdown(event.detail.text);
    });

    document.addEventListener("mynt:todo-updated", () => dataChanged());
    document.addEventListener("mynt:habits-updated", () => dataChanged());
    scratchpad?.addEventListener("input", () => dataChanged(1200));
    document.addEventListener("mynt:pomodoro-complete", event => {
        dataChanged();
        void (async () => {
            if (!(await syncContext())) return;
            try {
                await bridge("/v1/mynt/event", {
                    method: "POST",
                    body: {
                        type: "pomodoro-complete",
                        minutes: Math.max(1, Math.min(120, Math.floor(Number(event.detail?.minutes) || 25))),
                        sessionsToday: Math.max(1, Math.floor(Number(event.detail?.sessionsToday) || 1))
                    }
                });
            } catch {}
        })();
    });

    function clip(value) {
        const text = String(value || "");
        return text.length > 1200 ? `${text.slice(0, 1200)}\n…` : text || t("daidaiActionEmpty", "—");
    }

    function actionTitle(action) {
        const keys = {
            "todo.create": "daidaiActionTodoCreate",
            "todo.update": "daidaiActionTodoUpdate",
            "todo.complete": action.completed ? "daidaiActionTodoComplete" : "daidaiActionTodoReopen",
            "scratchpad.append": "daidaiActionScratchAppend",
            "scratchpad.replace": "daidaiActionScratchReplace"
        };
        return t(keys[action.type] || "daidaiActionInvalid", action.type);
    }

    function showAction(action) {
        pendingAction = action;
        pendingPlan = myntPlanDaidaiAction(action, localState());
        actionSummary.textContent = actionTitle(action);
        actionBefore.textContent = clip(pendingPlan.before);
        actionAfter.textContent = clip(pendingPlan.after);
        actionStale.hidden = pendingPlan.valid;
        actionStale.textContent = t(
            pendingPlan.reason === "stale" ? "daidaiActionStale" : "daidaiActionInvalid",
            "This proposal cannot be applied."
        );
        confirmButton.disabled = !pendingPlan.valid;
        actionDialog.showModal();
    }

    async function rememberDecision(id, decision) {
        decisions.set(id, decision);
        const saved = [...decisions.entries()].slice(-32).map(([actionId, value]) => ({ id: actionId, decision: value }));
        try { await storageCall("set", { [DECISIONS_KEY]: saved }); } catch {}
    }

    async function acknowledge(action, decision) {
        await bridge("/v1/mynt/actions/ack", { method: "POST", body: { id: action.id, decision } });
    }

    function showActionFeedback(undo) {
        clearTimeout(feedbackTimer);
        pendingUndo = typeof undo === "function" ? undo : null;
        actionToastText.textContent = t("daidaiActionApplied", "Change applied.");
        undoButton.textContent = t("daidaiActionUndoBtn", "Undo");
        undoButton.hidden = !pendingUndo;
        actionToast.hidden = false;
        feedbackTimer = setTimeout(() => {
            actionToast.hidden = true;
            pendingUndo = null;
        }, 6000);
    }

    undoButton.addEventListener("click", () => {
        const undone = pendingUndo?.() === true;
        pendingUndo = null;
        undoButton.hidden = true;
        actionToastText.textContent = t(
            undone ? "daidaiActionUndone" : "daidaiActionUndoUnavailable",
            undone ? "Change undone." : "This change can no longer be undone."
        );
        clearTimeout(feedbackTimer);
        feedbackTimer = setTimeout(() => { actionToast.hidden = true; }, 2600);
    });

    async function finishAction(decision, apply = false) {
        const action = pendingAction;
        if (!action) return;
        let finalDecision = decision;
        let undo = null;
        if (apply) {
            const currentPlan = myntPlanDaidaiAction(action, localState());
            if (!currentPlan.valid) finalDecision = currentPlan.reason === "stale" ? "stale" : "invalid";
            else {
                const detail = { action, applied: false };
                document.dispatchEvent(new CustomEvent(
                    action.type.startsWith("todo.") ? "mynt:todo-action" : "mynt:scratchpad-action",
                    { detail }
                ));
                if (!detail.applied) finalDecision = "invalid";
                else undo = detail.undo;
            }
        }
        await rememberDecision(action.id, finalDecision);
        try { await acknowledge(action, finalDecision); } catch {}
        pendingAction = null;
        pendingPlan = null;
        actionDialog.close();
        if (finalDecision === "confirmed") showActionFeedback(undo);
        if (finalDecision === "confirmed" && action.type === "todo.create" && Date.now() < focusBreakdownUntil) {
            document.dispatchEvent(new CustomEvent("mynt:focus-steps-add", { detail: { titles: [action.title] } }));
        }
        else if (apply) notify(t("daidaiActionFailed", "The change could not be applied."));
        setTimeout(() => void pollActions(), 0);
    }

    rejectButton.addEventListener("click", () => void finishAction(
        pendingPlan?.valid ? "rejected" : pendingPlan?.reason === "stale" ? "stale" : "invalid"
    ));
    confirmButton.addEventListener("click", () => void finishAction("confirmed", true));
    actionDialog.addEventListener("cancel", event => {
        event.preventDefault();
        rejectButton.click();
    });

    async function pollActions() {
        if (!connected || polling || actionDialog.open || document.visibilityState === "hidden") return;
        polling = true;
        try {
            const result = await bridge("/v1/mynt/actions/next");
            if (!result.action) return;
            const knownDecision = decisions.get(result.action.id);
            if (knownDecision) await acknowledge(result.action, knownDecision);
            else showAction(result.action);
        } catch (error) {
            if (error.status === 401) await forgetToken();
        } finally {
            polling = false;
        }
    }

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            void syncContext();
            void pollActions();
        }
    });
    setInterval(() => void pollActions(), 1500);

    void (async () => {
        if (!clientId || !api?.storage?.local || !api?.permissions) return setStatus("unavailable");
        try {
            const saved = await storageCall("get", [TOKEN_KEY, DECISIONS_KEY]);
            token = saved?.[TOKEN_KEY] || null;
            for (const entry of saved?.[DECISIONS_KEY] || []) {
                if (typeof entry?.id === "string" && typeof entry?.decision === "string") decisions.set(entry.id, entry.decision);
            }
            if (token && await permissionCall("contains")) await syncContext();
            else setStatus("disconnected");
        } catch {
            setStatus("unavailable");
        }
    })();
});

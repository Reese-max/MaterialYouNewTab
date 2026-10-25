/* Browser-local undo controls. These never connect or enable an MCP session. */
(function (root) {
    "use strict";
    const WORDS = {
        en: {
            todos: "Undo task deletion", shortcuts: "Undo shortcut deletion", habits: "Undo habit deletion", busy: "Restoring…",
            restored: "Restored.", invalid: "Saved or recovery data is invalid. The original data has been kept.",
            unavailable: "Undo is unavailable here. Reload this page and try again.",
            conflict: "The saved data changed. Check the current list before trying again.",
            limit: "The list is full. The deleted item is still kept for recovery.",
            failed: "Undo could not finish. The recovery item has been kept.",
            rollback: "Undo and recovery could not finish. Keep this page open and check your saved data."
        },
        zh_TW: {
            todos: "復原待辦刪除", shortcuts: "復原捷徑刪除", habits: "復原習慣刪除", busy: "正在復原…",
            restored: "已復原。", invalid: "已儲存或復原資料格式有誤，原始資料已保留。",
            unavailable: "目前無法復原，請重新載入此頁後再試。",
            conflict: "已儲存的資料有變更，請先確認目前清單再試。",
            limit: "清單已滿，刪除項目仍保留供復原。",
            failed: "無法完成復原，刪除項目仍保留。",
            rollback: "復原及回復未能完成，請保留此分頁並檢查已儲存資料。"
        }
    };
    const SETTINGS = {
        todos: { key: "myntTodoRecoveryV1", validator: "validateTodoRecovery" },
        shortcuts: { key: "myntShortcutRecoveryV1", validator: "validateShortcutRecovery" },
        habits: { key: "myntHabitRecoveryV1", currentKey: "myntHabits", validator: "validateHabitRecovery" }
    };

    function create({ domain, container, before = null, focusTarget = null, validateCurrent = null }) {
        const config = SETTINGS[domain];
        if (!config || !container) return null;
        const document = root.document;
        const row = document.createElement("div");
        row.className = "myntRecoveryControl";
        row.hidden = true;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "myntRecoveryUndo";
        const status = document.createElement("span");
        status.className = "myntRecoveryStatus";
        status.setAttribute("role", "status");
        status.setAttribute("aria-live", "polite");
        row.append(button, status);
        container.insertBefore(row, before);
        let busy = false, message = "", clearMessageTimer;
        function text(key) {
            let language = "zh_TW";
            try { language = root.localStorage.getItem("selectedLanguage") || language; } catch (_) { /* Use default labels. */ }
            const dictionaries = typeof translations === "undefined" ? {} : translations;
            return dictionaries[language]?.[`recovery_${key}`] || dictionaries.en?.[`recovery_${key}`] ||
                (WORDS[language] || WORDS.en)[key] || WORDS.en[key];
        }
        function refresh() {
            let recovery = null, invalid = false;
            try {
                validateCurrent?.();
                const raw = root.localStorage.getItem(config.key);
                if (raw !== null) {
                    const validate = root.MyntMcpData?.[config.validator];
                    if (typeof validate !== "function") throw new Error("Validator unavailable");
                    recovery = validate(raw);
                }
            } catch (_) { invalid = true; }
            button.textContent = text(busy ? "busy" : domain);
            button.setAttribute("aria-label", text(domain));
            button.hidden = !recovery || invalid;
            button.disabled = busy;
            status.textContent = text(invalid ? "invalid" : message) || "";
            row.hidden = !recovery && !invalid && !message;
        }
        function resultMessage(result) {
            const code = String(result?.error?.code || result?.code || "").toUpperCase();
            if (code === "ROLLBACK_FAILED") return "rollback";
            if (["CONFLICT", "NOT_FOUND", "EDITOR_BUSY"].includes(code)) return "conflict";
            if (code === "INVALID_STORAGE") return "invalid";
            if (code === "LIMIT_REACHED") return "limit";
            if (["UNAVAILABLE", "UNSUPPORTED", "ACTION_REQUIRED"].includes(code)) return "unavailable";
            return "failed";
        }
        button.addEventListener("click", async () => {
            if (busy || button.hidden) return;
            clearTimeout(clearMessageTimer);
            busy = true;
            message = "";
            refresh();
            try {
                const undo = root.myntLocalRecovery?.undo;
                const result = typeof undo === "function" ? await undo(domain) : { code: "UNAVAILABLE" };
                message = result?.ok ? "restored" : resultMessage(result);
                if (result?.ok && document.activeElement === button) focusTarget?.focus();
            } catch (_) {
                // An unexpected outcome may include a failed rollback; never claim no changes.
                message = "rollback";
            } finally {
                busy = false;
                refresh();
                if (message === "restored") clearMessageTimer = setTimeout(() => { message = ""; refresh(); }, 4000);
            }
        });
        root.addEventListener("storage", event => {
            if (event.key === null || event.key === config.key || event.key === config.currentKey || event.key === "selectedLanguage") {
                if (!busy) message = "";
                refresh();
            }
        });
        document.addEventListener("change", event => {
            if (event.target?.id === "languageSelector") refresh();
        });
        refresh();
        return Object.freeze({ refresh });
    }
    root.MyntRecoveryControls = Object.freeze({ create });
})(typeof globalThis !== "undefined" ? globalThis : this);

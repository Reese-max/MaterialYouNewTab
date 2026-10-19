/*
 * Material You NewTab
 * Copyright (c) 2023-2025 XengShi
 * Licensed under the GNU General Public License v3.0 (GPL-3.0)
 * You should have received a copy of the GNU General Public License along with this program.
 * If not, see <https://www.gnu.org/licenses/>.
 */

function myntReconcileDailyFocus(saved, legacyText, today) {
    const valid = saved && typeof saved === "object" && typeof saved.date === "string" && typeof saved.text === "string";
    const focus = valid
        ? {
            version: 1,
            date: saved.date,
            text: saved.text.trim().slice(0, 160),
            completed: saved.completed === true,
            carriedFrom: typeof saved.carriedFrom === "string" ? saved.carriedFrom : null
        }
        : { version: 1, date: today, text: String(legacyText || "").trim().slice(0, 160), completed: false, carriedFrom: null };
    if (focus.date === today) return focus;
    return focus.text && !focus.completed
        ? { ...focus, date: today, completed: false, carriedFrom: focus.date }
        : { version: 1, date: today, text: "", completed: false, carriedFrom: null };
}

if (typeof module !== "undefined" && module.exports) module.exports = { myntReconcileDailyFocus };

// Daily focus keeps the legacy userText key synchronized for backup compatibility.
if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", () => {
    const STORAGE_KEY = "myntDailyFocus";
    const MAX_LENGTH = 160;
    const userTextDiv = document.getElementById("userText");
    const userTextCheckbox = document.getElementById("userTextCheckbox");
    const actions = document.getElementById("dailyFocusActions");
    const status = document.getElementById("dailyFocusStatus");
    const toggle = document.getElementById("dailyFocusToggle");
    const language = () => localStorage.getItem("selectedLanguage") || "zh_TW";
    const t = (key, fallback) => translations[language()]?.[key] || translations.en?.[key] || fallback;
    const dateKey = (date = new Date()) => [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");

    function readState() {
        let saved = null;
        try {
            saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
        } catch {
            // Fall through to the legacy value.
        }
        return myntReconcileDailyFocus(saved, localStorage.getItem("userText"), dateKey());
    }

    let focus = readState();

    function save() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(focus));
        if (focus.text) localStorage.setItem("userText", focus.text);
        else localStorage.removeItem("userText");
    }

    function render(syncText = true) {
        const placeholder = userTextDiv.dataset.placeholder || translations.en.userText;
        if (syncText) userTextDiv.textContent = focus.text || placeholder;
        userTextDiv.classList.toggle("is-complete", focus.completed);
        toggle.disabled = !focus.text;
        toggle.setAttribute("aria-pressed", String(focus.completed));
        toggle.textContent = t(focus.completed ? "dailyFocusReopen" : "dailyFocusDone", focus.completed ? "Reopen" : "Done");
        status.textContent = focus.completed
            ? t("dailyFocusCompleted", "Completed today")
            : focus.carriedFrom
                ? t("dailyFocusCarried", "Carried over from yesterday")
                : focus.text
                    ? t("dailyFocusToday", "Today’s focus")
                    : t("dailyFocusEmpty", "Write one focus for today");
    }

    function setVisible(visible) {
        userTextDiv.style.display = visible ? "block" : "none";
        actions.style.display = visible ? "flex" : "none";
    }

    const isVisible = localStorage.getItem("userTextVisible") !== "false";
    userTextCheckbox.checked = isVisible;
    setVisible(isVisible);
    applyLanguage(language());
    save();
    render();

    userTextCheckbox.addEventListener("change", () => {
        setVisible(userTextCheckbox.checked);
        localStorage.setItem("userTextVisible", userTextCheckbox.checked);
    });

    userTextDiv.addEventListener("click", () => {
        if (!focus.text && userTextDiv.textContent === userTextDiv.dataset.placeholder) userTextDiv.textContent = "";
    });

    userTextDiv.addEventListener("input", () => {
        const text = userTextDiv.textContent.slice(0, MAX_LENGTH);
        if (text !== userTextDiv.textContent) userTextDiv.textContent = text;
        focus = { ...focus, date: dateKey(), text, completed: false, carriedFrom: null };
        save();
        render(false);
    });

    userTextDiv.addEventListener("blur", () => {
        focus.text = userTextDiv.textContent.trim().slice(0, MAX_LENGTH);
        save();
        render();
    });

    toggle.addEventListener("click", () => {
        if (!focus.text) return;
        focus.completed = !focus.completed;
        save();
        render();
    });

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "visible" || focus.date === dateKey()) return;
        focus = myntReconcileDailyFocus(focus, "", dateKey());
        save();
        render();
    });
});

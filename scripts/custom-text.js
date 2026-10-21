/*
 * Material You NewTab
 * Copyright (c) 2023-2025 XengShi
 * Licensed under the GNU General Public License v3.0 (GPL-3.0)
 * You should have received a copy of the GNU General Public License along with this program.
 * If not, see <https://www.gnu.org/licenses/>.
 */

function myntNormalizeFocusSteps(steps) {
    if (!Array.isArray(steps)) return [];
    return steps
        .filter(step => step && typeof step.text === "string" && step.text.trim())
        .slice(0, 3)
        .map(step => ({ text: step.text.trim().slice(0, 80), done: step.done === true }));
}

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
    // Optional extras are only present when used, so older shapes stay identical.
    if (valid && typeof saved.subject === "string" && saved.subject) focus.subject = saved.subject.slice(0, 20);
    const steps = valid ? myntNormalizeFocusSteps(saved.steps) : [];
    if (steps.length) focus.steps = steps;
    if (valid && saved.date === today) {
        if (Number.isInteger(saved.rounds) && saved.rounds > 0) focus.rounds = Math.min(saved.rounds, 99);
        if (saved.linked === true) focus.linked = true;
    }
    if (focus.date === today) return focus;
    if (focus.text && !focus.completed) {
        const carried = { ...focus, date: today, completed: false, carriedFrom: focus.date };
        delete carried.rounds;
        delete carried.linked;
        return carried;
    }
    return { version: 1, date: today, text: "", completed: false, carriedFrom: null };
}

if (typeof module !== "undefined" && module.exports) module.exports = { myntReconcileDailyFocus, myntNormalizeFocusSteps };

// Daily focus keeps the legacy userText key synchronized for backup compatibility.
if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", () => {
    const STORAGE_KEY = "myntDailyFocus";
    const MAX_LENGTH = 160;
    const userTextDiv = document.getElementById("userText");
    const userTextCheckbox = document.getElementById("userTextCheckbox");
    const actions = document.getElementById("dailyFocusActions");
    const status = document.getElementById("dailyFocusStatus");
    const toggle = document.getElementById("dailyFocusToggle");
    const counter = document.getElementById("dailyFocusCounter");
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
    let overwriteConfirmed = false;

    function save() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(focus));
        if (focus.text) localStorage.setItem("userText", focus.text);
        else localStorage.removeItem("userText");
        document.dispatchEvent(new CustomEvent("mynt:focus-changed", { detail: { focus: { ...focus } } }));
    }

    function updateCounter(length) {
        if (!counter) return;
        const near = length >= MAX_LENGTH - 30;
        counter.hidden = !near;
        counter.textContent = `${length}/${MAX_LENGTH}`;
        counter.classList.toggle("is-full", length >= MAX_LENGTH);
    }

    function render(syncText = true) {
        const placeholder = userTextDiv.dataset.placeholder || translations.en.userText;
        if (syncText) userTextDiv.textContent = focus.text || placeholder;
        userTextDiv.classList.toggle("is-complete", focus.completed);
        toggle.disabled = !focus.text;
        toggle.setAttribute("aria-pressed", String(focus.completed));
        toggle.textContent = t(focus.completed ? "dailyFocusReopen" : "dailyFocusDone", focus.completed ? "Reopen" : "Done");
        let label = focus.completed
            ? t("dailyFocusCompleted", "Completed today")
            : focus.carriedFrom
                ? t("dailyFocusCarried", "Carried over from yesterday")
                : focus.text
                    ? t("dailyFocusToday", "Today’s focus")
                    : t("dailyFocusEmpty", "Write one focus for today");
        if (focus.rounds) label += ` · ${t("dailyFocusRounds", "{count} focus rounds").replace("{count}", focus.rounds)}`;
        status.textContent = label;
        updateCounter(focus.text.length);
    }

    function setVisible(visible) {
        userTextDiv.style.display = visible ? "block" : "none";
        actions.style.display = visible ? "flex" : "none";
        document.dispatchEvent(new CustomEvent("mynt:focus-visible", { detail: { visible } }));
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

    userTextDiv.addEventListener("focus", async () => {
        if (!focus.carriedFrom || !focus.text || focus.completed || overwriteConfirmed) return;
        userTextDiv.blur();
        const message = t("dailyFocusOverwriteConfirm", "Yesterday’s unfinished focus was carried over. Edit or replace it?");
        const accepted = window.myntDialog ? await window.myntDialog.confirm(message) : window.confirm(message);
        if (!accepted) return;
        overwriteConfirmed = true;
        userTextDiv.focus();
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
        if (userTextDiv.textContent === (userTextDiv.dataset.placeholder || "")) return render();
        focus.text = userTextDiv.textContent.trim().slice(0, MAX_LENGTH);
        save();
        render();
    });

    toggle.addEventListener("click", () => {
        if (!focus.text) return;
        focus.completed = !focus.completed;
        if (focus.completed) delete focus.linked;
        save();
        render();
        if (focus.completed) document.dispatchEvent(new CustomEvent("mynt:focus-completed"));
    });

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "visible" || focus.date === dateKey()) return;
        focus = myntReconcileDailyFocus(focus, "", dateKey());
        overwriteConfirmed = false;
        save();
        render();
    });

    window.myntFocus = {
        get: () => ({ ...focus, steps: (focus.steps || []).map(step => ({ ...step })) }),
        update(patch) {
            focus = { ...focus, ...patch };
            for (const key of ["subject", "steps", "rounds", "linked"]) {
                const value = focus[key];
                if (value === undefined || value === null || value === "" || value === false || value === 0 || (Array.isArray(value) && !value.length)) delete focus[key];
            }
            if (focus.steps) focus.steps = myntNormalizeFocusSteps(focus.steps);
            save();
            render();
        },
        render
    };
});

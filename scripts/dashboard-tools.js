/*
 * Material You NewTab
 * Copyright (c) 2024-2026 Prem, 2023-2025 XengShi
 * Licensed under the GNU General Public License v3.0 (GPL-3.0)
 */

function myntDateKey(date = new Date()) {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");
}

function myntShiftDate(date, days) {
    const shifted = new Date(date);
    shifted.setHours(12, 0, 0, 0);
    shifted.setDate(shifted.getDate() + days);
    return shifted;
}

function myntFocusStreak(history, now = new Date()) {
    let cursor = new Date(now);
    const sessionsFor = date => Number(history?.[myntDateKey(date)]?.sessions) || 0;

    if (sessionsFor(cursor) === 0) cursor = myntShiftDate(cursor, -1);

    let streak = 0;
    while (sessionsFor(cursor) > 0) {
        streak += 1;
        cursor = myntShiftDate(cursor, -1);
    }
    return streak;
}

function myntSevenDayStats(history, now = new Date()) {
    return Array.from({ length: 7 }, (_, index) => {
        const date = myntShiftDate(now, index - 6);
        const saved = history?.[myntDateKey(date)] || {};
        return {
            date,
            key: myntDateKey(date),
            sessions: Math.max(0, Number(saved.sessions) || 0),
            minutes: Math.max(0, Number(saved.minutes) || 0)
        };
    });
}

const MYNT_WORKSPACE_WIDGETS = [
    "shortcutsCheckbox", "bookmarksCheckbox", "todoListCheckbox", "pomodoroCheckbox",
    "aiToolsCheckbox", "googleAppsCheckbox", "motivationalQuotesCheckbox", "bongoCatCheckbox", "scratchpadCheckbox"
];

function myntNormalizeWorkspaces(raw, defaults = []) {
    const source = Array.isArray(raw) ? raw : defaults;
    const clean = [];
    const seen = new Set();
    for (const item of source) {
        if (!item || typeof item !== "object" || clean.length === 8) continue;
        const id = String(item.id || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
        const name = String(item.name || "").trim().slice(0, 30);
        if (!id || !name || seen.has(id)) continue;
        const widgets = Object.fromEntries(MYNT_WORKSPACE_WIDGETS.map(key => [key, item.widgets?.[key] === true]));
        const background = ["video", "wallpaper", "color"].includes(item.background) ? item.background : "video";
        const focusMinutes = Math.max(1, Math.min(120, Math.floor(Number(item.focusMinutes) || 25)));
        const urls = Array.isArray(item.urls)
            ? item.urls.map(u => String(u || "").trim()).filter(u => /^https?:\/\//i.test(u)).slice(0, 10)
            : [];
        clean.push({ id, name, widgets, background, focusMinutes, urls });
        seen.add(id);
    }
    return clean;
}

if (typeof module !== "undefined") {
    module.exports = {
        myntDateKey, myntFocusStreak, myntSevenDayStats, myntNormalizeWorkspaces
    };
}

if (typeof document !== "undefined") {
    (() => {
        const KEYS = {
            accessibility: "myntAccessibility",
            focusHistory: "myntFocusHistory",
            habits: "myntHabits",
            serviceStatus: "myntServiceStatus",
            workspace: "myntWorkspacePreset",
            workspaces: "myntWorkspacePresets"
        };
        const MAX_CUSTOM_HABITS = 12;
        const GOOGLE_ORIGIN = "https://www.google.com/*";
        const lang = localStorage.getItem("selectedLanguage") || "zh_TW";

        function t(key, fallback = key) {
            if (typeof translations === "undefined") return fallback;
            return translations[lang]?.[key] || translations.en?.[key] || fallback;
        }

        function format(key, fallback, values) {
            let output = t(key, fallback);
            for (const [name, value] of Object.entries(values)) {
                output = output.replaceAll(`{${name}}`, value);
            }
            return output;
        }

        function readJSON(key, fallback) {
            try {
                const parsed = JSON.parse(localStorage.getItem(key));
                return parsed ?? fallback;
            } catch {
                return fallback;
            }
        }

        function localizeStaticUI() {
            const sameKeyIds = [
                "controlCenterText", "controlCenterInfo", "controlCenterEyebrow",
                "focusStatsTitle", "focusStatsInfo", "focusMinutesLabel",
                "focusSessionsValueLabel", "focusStreakLabel", "workspaceTitle", "workspaceInfo", "workspaceAddBtn",
                "workspaceNameLabel", "workspaceWidgetsLegend", "workspaceWidgetShortcuts",
                "workspaceWidgetBookmarks", "workspaceWidgetTodo", "workspaceWidgetPomodoro",
                "workspaceWidgetAi", "workspaceWidgetGoogle", "workspaceWidgetQuotes",
                "workspaceWidgetBongo", "workspaceBackgroundLabel", "workspaceBackgroundVideo",
                "workspaceBackgroundWallpaper", "workspaceBackgroundColor", "workspaceFocusMinutesLabel",
                "workspaceDeleteBtn", "workspaceCancelBtn", "workspaceSaveBtn", "habitsTitle",
                "habitsInfo", "habitInputLabel", "habitAddBtn", "accessibilityTitle",
                "accessibilityInfo", "reduceMotionText", "reduceMotionInfo", "highContrastText",
                "highContrastInfo", "fontScaleText", "fontScaleInfo", "privacyCenterTitle",
                "privacyCenterInfo", "privacyPolicyLink", "permissionBookmarksTitle",
                "permissionBookmarksInfo", "permissionSuggestionsTitle", "permissionSuggestionsInfo",
                "permissionNotificationsTitle", "permissionNotificationsInfo", "permissionLocationTitle",
                "permissionLocationInfo", "privacyDisclosureWeather", "privacyDisclosureIp",
                "privacyDisclosureSearch", "privacyDisclosureLocal", "serviceStatusTitle",
                "serviceStatusInfo", "commandPaletteTitle", "commandPaletteEmpty"
            ];
            sameKeyIds.forEach(id => {
                const element = document.getElementById(id);
                if (element) element.textContent = t(id, element.textContent);
            });

            document.getElementById("controlCenterTitle").textContent = t("controlCenterText", "Control Center");
            document.getElementById("openControlCenterBtn").textContent = t("openText", "Open");
            document.getElementById("pomodoroStatsBtn").textContent = t("focusStatsButton", "Stats");
            document.getElementById("habitInput").placeholder = t("habitPlaceholder", "Add a daily habit...");
            document.getElementById("commandPaletteInput").placeholder = t("commandPalettePlaceholder", "Search commands...");
            document.getElementById("commandPaletteDialog").setAttribute("aria-label", t("commandPaletteTitle", "Command palette"));
            document.getElementById("closeControlCenterBtn").setAttribute("aria-label", t("menuCloseText", "Close"));
        }

        // Service status records only a service identifier, result, and timestamp.
        const serviceDefinitions = [
            ["network", "serviceNetwork"],
            ["weather", "serviceWeather"],
            ["location", "serviceLocation"],
            ["suggestions", "serviceSuggestions"],
            ["wallpaper", "serviceWallpaper"],
            ["quotes", "serviceQuotes"]
        ];
        let serviceState = readJSON(KEYS.serviceStatus, {});

        function serviceFromRequest(input) {
            try {
                const raw = input instanceof Request ? input.url : String(input);
                const url = new URL(raw, location.href);
                if (url.hostname === "api.weatherapi.com") return "weather";
                if (url.hostname === "ipinfo.io") return "location";
                if (url.hostname === "picsum.photos") return "wallpaper";
                if (url.hostname === "prem-k-r.github.io" && url.pathname.includes("multilingual-quotes-api")) return "quotes";
                if (url.hostname === "www.google.com" && url.pathname.includes("complete/search")) return "suggestions";

                const customProxy = localStorage.getItem("proxy");
                const proxyHost = customProxy ? new URL(customProxy).hostname : "mynt-proxy.rhythmcorehq.com";
                if (url.hostname === proxyHost) return "suggestions";
            } catch {
                return null;
            }
            return null;
        }

        function recordService(id, status, code) {
            if (!id) return;
            serviceState[id] = { status, code: Number(code) || 0, at: Date.now() };
            localStorage.setItem(KEYS.serviceStatus, JSON.stringify(serviceState));
            renderServiceStatus();
        }

        if (!window.fetch.__myntTracked) {
            const nativeFetch = window.fetch.bind(window);
            const trackedFetch = async (...args) => {
                const service = serviceFromRequest(args[0]);
                if (service) {
                    serviceState[service] = { status: "checking", at: Date.now(), code: 0 };
                    renderServiceStatus();
                }
                try {
                    const response = await nativeFetch(...args);
                    if (service) recordService(service, response.ok ? "ok" : "error", response.status);
                    return response;
                } catch (error) {
                    if (service) recordService(service, navigator.onLine ? "error" : "offline", 0);
                    throw error;
                }
            };
            trackedFetch.__myntTracked = true;
            window.fetch = trackedFetch;
        }

        function serviceStatusText(saved) {
            if (!navigator.onLine) return t("serviceOffline", "Unavailable offline");
            if (!saved) return t("serviceNotChecked", "Not checked");
            if (saved.status === "checking") return t("serviceChecking", "Checking...");

            const time = new Intl.DateTimeFormat(lang === "zh_TW" ? "zh-TW" : "en", {
                hour: "2-digit",
                minute: "2-digit"
            }).format(new Date(saved.at));
            const result = saved.status === "ok"
                ? t("serviceAvailable", "Available")
                : saved.code
                    ? format("serviceHttpError", "HTTP {code}", { code: saved.code })
                    : t("serviceError", "Request failed");
            return `${result} · ${time}`;
        }

        function renderServiceStatus() {
            const list = document.getElementById("serviceStatusList");
            if (!list) return;
            list.replaceChildren();

            serviceDefinitions.forEach(([id, labelKey]) => {
                const row = document.createElement("div");
                row.className = "serviceRow";
                const label = document.createElement("span");
                label.textContent = t(labelKey, id);
                const state = document.createElement("span");
                const saved = id === "network"
                    ? { status: navigator.onLine ? "ok" : "offline", at: Date.now() }
                    : serviceState[id];
                state.className = `serviceState ${navigator.onLine ? saved?.status || "unknown" : "offline"}`;
                state.textContent = id === "network"
                    ? (navigator.onLine ? t("serviceOnline", "Online") : t("serviceOfflineMode", "Offline mode"))
                    : serviceStatusText(saved);
                row.append(label, state);
                list.appendChild(row);
            });

            const pill = document.getElementById("serviceStatusPill");
            const pillText = document.getElementById("serviceStatusPillText");
            const recentError = Object.values(serviceState).some(saved =>
                ["error", "offline"].includes(saved?.status) && Date.now() - saved.at < 15 * 60 * 1000
            );

            pill.hidden = navigator.onLine && !recentError;
            pill.classList.toggle("serviceWarning", navigator.onLine && recentError);
            pillText.textContent = navigator.onLine
                ? t("serviceIssuePill", "Service issue")
                : t("serviceOfflineMode", "Offline mode");
        }

        window.addEventListener("online", renderServiceStatus);
        window.addEventListener("offline", renderServiceStatus);

        // Focus history and seven-day summary.
        function normalizeFocusHistory(raw) {
            if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
            const clean = {};
            for (const [key, value] of Object.entries(raw)) {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !value || typeof value !== "object") continue;
                clean[key] = {
                    sessions: Math.max(0, Math.floor(Number(value.sessions) || 0)),
                    minutes: Math.max(0, Math.floor(Number(value.minutes) || 0))
                };
            }
            return clean;
        }

        let focusHistory = normalizeFocusHistory(readJSON(KEYS.focusHistory, {}));

        function migratePomodoroToday() {
            const sessions = Math.max(0, Number(localStorage.getItem("pomodoroSessionsToday")) || 0);
            if (!sessions || localStorage.getItem("pomodoroSessionsDate") !== new Date().toDateString()) return;
            const today = myntDateKey();
            if (focusHistory[today]) return;
            const workMinutes = Math.max(1, Number(localStorage.getItem("pomodoroWorkMinutes")) || 25);
            focusHistory[today] = { sessions, minutes: sessions * workMinutes };
            saveFocusHistory();
        }

        function saveFocusHistory() {
            localStorage.setItem(KEYS.focusHistory, JSON.stringify(focusHistory));
        }

        function renderFocusStats() {
            const today = myntDateKey();
            const current = focusHistory[today] || { sessions: 0, minutes: 0 };
            const streak = myntFocusStreak(focusHistory);
            document.getElementById("focusMinutesValue").textContent = current.minutes;
            document.getElementById("focusSessionsValue").textContent = current.sessions;
            document.getElementById("focusStreakValue").textContent = streak;
            document.getElementById("pomodoroFocusMinutes").textContent = format("focusMinutesShort", "{count} min", { count: current.minutes });
            document.getElementById("pomodoroFocusStreak").textContent = format("focusStreakShort", "{count} day streak", { count: streak });

            const chart = document.getElementById("focusWeekChart");
            const stats = myntSevenDayStats(focusHistory);
            const maximum = Math.max(1, ...stats.map(day => day.minutes));
            const dayFormatter = new Intl.DateTimeFormat(lang === "zh_TW" ? "zh-TW" : "en", { weekday: "narrow" });
            chart.replaceChildren();
            stats.forEach(day => {
                const column = document.createElement("div");
                column.className = "focusDay";
                const bar = document.createElement("div");
                bar.className = "focusDayBar";
                bar.style.height = `${Math.max(4, Math.round(day.minutes / maximum * 86))}px`;
                const label = dayFormatter.format(day.date);
                const detail = format("focusDayAria", "{day}: {minutes} minutes, {sessions} sessions", {
                    day: label,
                    minutes: day.minutes,
                    sessions: day.sessions
                });
                bar.title = detail;
                column.setAttribute("role", "img");
                column.setAttribute("aria-label", detail);
                const dayLabel = document.createElement("span");
                dayLabel.textContent = label;
                column.append(bar, dayLabel);
                chart.appendChild(column);
            });

        }

        // Habits. Two built-in habits are completed by Pomodoro and To-do events.
        function normalizeHabits(raw) {
            const source = Array.isArray(raw) ? raw : [];
            const seen = new Set();
            const clean = [];
            for (const item of source) {
                if (!item || typeof item !== "object" || typeof item.id !== "string" || seen.has(item.id)) continue;
                const habitSource = ["pomodoro", "todo"].includes(item.source) ? item.source : null;
                const name = String(item.name || "").trim().slice(0, 60);
                if (!habitSource && !name) continue;
                const doneDates = Array.isArray(item.doneDates)
                    ? [...new Set(item.doneDates.filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)))].slice(-400)
                    : [];
                clean.push({ id: item.id, source: habitSource, name, doneDates });
                seen.add(item.id);
            }

            for (const system of [
                { id: "system-pomodoro", source: "pomodoro", name: "" },
                { id: "system-todo", source: "todo", name: "" }
            ]) {
                if (!seen.has(system.id)) clean.unshift({ ...system, doneDates: [] });
            }
            return clean.filter((habit, index, all) => habit.source ||
                all.filter(item => !item.source).indexOf(habit) < MAX_CUSTOM_HABITS);
        }

        let habits = normalizeHabits(readJSON(KEYS.habits, []));

        function saveHabits() {
            localStorage.setItem(KEYS.habits, JSON.stringify(habits));
        }

        function markSystemHabit(source) {
            const habit = habits.find(item => item.source === source);
            const today = myntDateKey();
            if (!habit || habit.doneDates.includes(today)) return;
            habit.doneDates.push(today);
            habit.doneDates = habit.doneDates.slice(-400);
            saveHabits();
            renderHabits();
        }

        function renderHabits() {
            const list = document.getElementById("habitList");
            const today = myntDateKey();
            list.replaceChildren();

            habits.forEach(habit => {
                const done = habit.doneDates.includes(today);
                const row = document.createElement("li");
                row.className = `habitRow${done ? " done" : ""}`;
                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.id = `habit-${habit.id}`;
                checkbox.checked = done;
                checkbox.disabled = Boolean(habit.source);

                const label = document.createElement("label");
                label.htmlFor = checkbox.id;
                label.textContent = habit.source === "pomodoro"
                    ? t("habitPomodoroAuto", "Complete one focus session")
                    : habit.source === "todo"
                        ? t("habitTodoAuto", "Complete one task")
                        : habit.name;

                row.append(checkbox, label);
                if (habit.source) {
                    const badge = document.createElement("span");
                    badge.className = "habitAutoBadge";
                    badge.textContent = t("habitAutoBadge", "Auto");
                    row.appendChild(badge);
                } else {
                    checkbox.addEventListener("change", () => {
                        habit.doneDates = checkbox.checked
                            ? [...new Set([...habit.doneDates, today])].slice(-400)
                            : habit.doneDates.filter(date => date !== today);
                        saveHabits();
                        renderHabits();
                    });
                    const remove = document.createElement("button");
                    remove.type = "button";
                    remove.className = "habitDeleteBtn";
                    remove.setAttribute("aria-label", format("habitDeleteAria", "Delete {name}", { name: habit.name }));
                    remove.textContent = "×";
                    remove.addEventListener("click", () => {
                        if (!confirm(format("habitDeleteConfirm", "Delete habit ‘{name}’?", { name: habit.name }))) return;
                        habits = habits.filter(item => item.id !== habit.id);
                        saveHabits();
                        renderHabits();
                    });
                    row.appendChild(remove);
                }
                list.appendChild(row);
            });
        }

        document.getElementById("habitForm").addEventListener("submit", event => {
            event.preventDefault();
            const input = document.getElementById("habitInput");
            const name = input.value.trim();
            const customHabits = habits.filter(habit => !habit.source);
            input.setCustomValidity("");
            if (!name) return input.reportValidity();
            if (customHabits.length >= MAX_CUSTOM_HABITS) {
                input.setCustomValidity(t("habitLimitError", "You can add up to 12 custom habits."));
                return input.reportValidity();
            }
            if (customHabits.some(habit => habit.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
                input.setCustomValidity(t("habitDuplicateError", "This habit already exists."));
                return input.reportValidity();
            }
            const id = globalThis.crypto?.randomUUID?.() || `custom-${Date.now()}`;
            habits.push({ id, source: null, name: name.slice(0, 60), doneDates: [] });
            saveHabits();
            input.value = "";
            renderHabits();
        });
        document.getElementById("habitInput").addEventListener("input", event => event.target.setCustomValidity(""));

        document.addEventListener("mynt:pomodoro-complete", event => {
            const minutes = Math.max(1, Math.min(120, Math.floor(Number(event.detail?.minutes) || 25)));
            const today = myntDateKey();
            const saved = focusHistory[today] || { sessions: 0, minutes: 0 };
            focusHistory[today] = { sessions: saved.sessions + 1, minutes: saved.minutes + minutes };
            saveFocusHistory();
            markSystemHabit("pomodoro");
            renderFocusStats();
        });
        document.addEventListener("mynt:todo-updated", event => {
            if (Number(event.detail?.completed) > 0) markSystemHabit("todo");
        });
        document.addEventListener("DOMContentLoaded", () => {
            try {
                const todos = JSON.parse(localStorage.getItem("todoList") || "{}");
                if (Object.values(todos).some(todo => todo?.status === "completed")) markSystemHabit("todo");
            } catch {
                // The To-do module owns recovery of invalid stored data.
            }
        }, { once: true });

        // Accessibility settings use native media preferences by default.
        const reducedMotionQuery = matchMedia("(prefers-reduced-motion: reduce)");
        const savedAccessibility = readJSON(KEYS.accessibility, {});
        let accessibility = {
            reduceMotion: typeof savedAccessibility.reduceMotion === "boolean" ? savedAccessibility.reduceMotion : null,
            highContrast: savedAccessibility.highContrast === true,
            fontScale: [0.9, 1, 1.1, 1.2].includes(Number(savedAccessibility.fontScale))
                ? Number(savedAccessibility.fontScale)
                : 1
        };

        function effectiveReducedMotion() {
            return accessibility.reduceMotion === null ? reducedMotionQuery.matches : accessibility.reduceMotion;
        }

        const decorativeVideo = document.getElementById("videoBg");
        const networkConnection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        let decorativeVideoStarted = false;
        let decorativeVideoStartHandle = null;
        let decorativeVideoUsesIdleCallback = false;

        function canPlayDecorativeVideo() {
            return Boolean(decorativeVideo)
                && document.visibilityState === "visible"
                && document.body.dataset.workspaceBackground === "video"
                && !effectiveReducedMotion()
                && !accessibility.highContrast
                && networkConnection?.saveData !== true;
        }

        function cancelDecorativeVideoStart() {
            if (decorativeVideoStartHandle === null) return;
            if (decorativeVideoUsesIdleCallback && typeof cancelIdleCallback === "function") {
                cancelIdleCallback(decorativeVideoStartHandle);
            }
            else clearTimeout(decorativeVideoStartHandle);
            decorativeVideoStartHandle = null;
        }

        function syncDecorativeVideo() {
            if (!decorativeVideo) return;

            if (!canPlayDecorativeVideo()) {
                cancelDecorativeVideoStart();
                decorativeVideo.pause();
                return;
            }

            if (decorativeVideoStarted) {
                decorativeVideo.play().catch(() => {});
                return;
            }
            if (decorativeVideoStartHandle !== null) return;

            const startVideo = () => {
                decorativeVideoStartHandle = null;
                if (!canPlayDecorativeVideo()) return;
                decorativeVideoStarted = true;
                decorativeVideo.play().catch(() => {
                    decorativeVideoStarted = false;
                });
            };

            decorativeVideoUsesIdleCallback = typeof requestIdleCallback === "function";
            decorativeVideoStartHandle = decorativeVideoUsesIdleCallback
                ? requestIdleCallback(startVideo, { timeout: 1500 })
                : setTimeout(startVideo, 500);
        }

        function applyAccessibility() {
            const reduceMotion = effectiveReducedMotion();
            document.documentElement.classList.toggle("myntReducedMotion", reduceMotion);
            document.documentElement.classList.toggle("myntHighContrast", accessibility.highContrast);
            document.documentElement.style.setProperty("--mynt-font-scale", accessibility.fontScale);
            document.getElementById("reduceMotionCheckbox").checked = reduceMotion;
            document.getElementById("highContrastCheckbox").checked = accessibility.highContrast;
            document.getElementById("fontScaleSelect").value = String(accessibility.fontScale);

            document.querySelectorAll("video:not(#videoBg)").forEach(video => {
                if (reduceMotion && !video.paused) {
                    video.dataset.myntWasPlaying = "true";
                    video.pause();
                } else if (!reduceMotion && video.dataset.myntWasPlaying === "true") {
                    delete video.dataset.myntWasPlaying;
                    video.play().catch(() => {});
                }
            });
            syncDecorativeVideo();
        }

        function saveAccessibility() {
            localStorage.setItem(KEYS.accessibility, JSON.stringify(accessibility));
            applyAccessibility();
        }

        document.getElementById("reduceMotionCheckbox").addEventListener("change", event => {
            accessibility.reduceMotion = event.target.checked;
            saveAccessibility();
        });
        document.getElementById("highContrastCheckbox").addEventListener("change", event => {
            accessibility.highContrast = event.target.checked;
            saveAccessibility();
        });
        document.getElementById("fontScaleSelect").addEventListener("change", event => {
            accessibility.fontScale = [0.9, 1, 1.1, 1.2].includes(Number(event.target.value))
                ? Number(event.target.value)
                : 1;
            saveAccessibility();
        });
        document.addEventListener("play", event => {
            if (!(event.target instanceof HTMLMediaElement)) return;
            if (effectiveReducedMotion() || (event.target === decorativeVideo && !canPlayDecorativeVideo())) {
                event.target.pause();
            }
        }, true);
        reducedMotionQuery.addEventListener?.("change", () => {
            if (accessibility.reduceMotion === null) applyAccessibility();
        });
        networkConnection?.addEventListener?.("change", syncDecorativeVideo);

        // Existing widget toggles remain the source of truth for editable work modes.
        const workspaceDefaults = [
            {
                id: "work", name: t("workspaceWork", "Work"), background: "video", focusMinutes: 25, urls: ["https://github.com", "https://mail.google.com"],
                widgets: {
                    shortcutsCheckbox: true, bookmarksCheckbox: false, todoListCheckbox: true,
                    pomodoroCheckbox: true, motivationalQuotesCheckbox: false, bongoCatCheckbox: false,
                    aiToolsCheckbox: false, googleAppsCheckbox: false
                }
            },
            {
                id: "study", name: t("workspaceStudy", "Study"), background: "wallpaper", focusMinutes: 45, urls: ["https://scholar.google.com"],
                widgets: {
                    shortcutsCheckbox: false, bookmarksCheckbox: false, todoListCheckbox: true,
                    pomodoroCheckbox: true, motivationalQuotesCheckbox: true, bongoCatCheckbox: false,
                    aiToolsCheckbox: true, googleAppsCheckbox: false
                }
            },
            {
                id: "relax", name: t("workspaceRelax", "Relax"), background: "color", focusMinutes: 15, urls: [],
                widgets: {
                    shortcutsCheckbox: true, bookmarksCheckbox: false, todoListCheckbox: false,
                    pomodoroCheckbox: false, motivationalQuotesCheckbox: true, bongoCatCheckbox: true,
                    aiToolsCheckbox: false, googleAppsCheckbox: true
                }
            }
        ];
        let workspaces = myntNormalizeWorkspaces(readJSON(KEYS.workspaces, null), workspaceDefaults);
        let applyingWorkspace = false;
        const restoredWorkspace = workspaces.find(item => item.id === localStorage.getItem(KEYS.workspace));
        if (restoredWorkspace) {
            document.body.dataset.workspaceBackground = restoredWorkspace.background;
            if (restoredWorkspace.background !== "video") document.body.dataset.bg = restoredWorkspace.background;
        }

        function saveWorkspaces() {
            localStorage.setItem(KEYS.workspaces, JSON.stringify(workspaces));
        }

        function workspaceBackgroundName(background) {
            return t(`workspaceBackground${background[0].toUpperCase()}${background.slice(1)}`, background);
        }

        function renderWorkspace() {
            const active = localStorage.getItem(KEYS.workspace);
            const grid = document.getElementById("workspacePresetGrid");
            grid.replaceChildren();
            workspaces.forEach(preset => {
                const card = document.createElement("div");
                card.className = `workspacePresetCard${preset.id === active ? " active" : ""}`;
                const apply = document.createElement("button");
                apply.type = "button";
                apply.className = "workspaceApplyBtn";
                apply.dataset.workspace = preset.id;
                const name = document.createElement("strong");
                name.textContent = preset.name;
                const info = document.createElement("span");
                info.textContent = format("workspaceSummary", "{count} tools · {minutes} min · {background}", {
                    count: Object.values(preset.widgets).filter(Boolean).length,
                    minutes: preset.focusMinutes,
                    background: workspaceBackgroundName(preset.background)
                });
                apply.append(name, info);
                apply.addEventListener("click", () => applyWorkspace(preset.id));
                const edit = document.createElement("button");
                edit.type = "button";
                edit.className = "workspaceEditBtn";
                edit.textContent = t("workspaceEditBtn", "Edit");
                edit.setAttribute("aria-label", format("workspaceEditAria", "Edit {name}", { name: preset.name }));
                edit.addEventListener("click", () => openWorkspaceEditor(preset));
                card.append(apply, edit);
                if (preset.urls && preset.urls.length > 0) {
                    const launch = document.createElement("button");
                    launch.type = "button";
                    launch.className = "workspaceLaunchBtn";
                    launch.textContent = `🚀 ${preset.urls.length}`;
                    launch.setAttribute("aria-label", format("workspaceLaunchTitle", "Open {count} sites in new tabs", { count: preset.urls.length }));
                    launch.title = format("workspaceLaunchTitle", "Open {count} sites in new tabs", { count: preset.urls.length });
                    launch.addEventListener("click", (e) => {
                        e.stopPropagation();
                        preset.urls.forEach(url => window.open(url, "_blank"));
                    });
                    card.appendChild(launch);
                }
                grid.appendChild(card);
            });
            const activePreset = workspaces.find(preset => preset.id === active);
            document.getElementById("workspaceStatus").textContent = active
                ? activePreset ? format("workspaceActive", "{name} active", { name: activePreset.name }) : ""
                : "";
            document.getElementById("workspaceAddBtn").disabled = workspaces.length >= 8;
        }

        function applyWorkspace(id) {
            const preset = workspaces.find(item => item.id === id);
            if (!preset) return;
            applyingWorkspace = true;
            for (const [widgetId, enabled] of Object.entries(preset.widgets)) {
                const checkbox = document.getElementById(widgetId);
                if (checkbox && checkbox.checked !== enabled) checkbox.click();
            }
            const minutesInput = document.getElementById("pomodoroWorkInput");
            if (minutesInput && Number(minutesInput.value) !== preset.focusMinutes) {
                minutesInput.value = preset.focusMinutes;
                minutesInput.dispatchEvent(new Event("change", { bubbles: true }));
            }
            document.body.dataset.workspaceBackground = preset.background;
            if (preset.background !== "video") document.body.dataset.bg = preset.background;
            syncDecorativeVideo();
            applyingWorkspace = false;
            localStorage.setItem(KEYS.workspace, id);
            renderWorkspace();
        }

        function openWorkspaceEditor(preset = null) {
            const editor = document.getElementById("workspaceEditorForm");
            const current = preset || {
                id: "",
                name: "",
                background: document.body.dataset.workspaceBackground || "video",
                focusMinutes: Math.max(1, Number(localStorage.getItem("pomodoroWorkMinutes")) || 25),
                widgets: Object.fromEntries(MYNT_WORKSPACE_WIDGETS.map(id => [id, document.getElementById(id)?.checked === true]))
            };
            document.getElementById("workspaceEditorId").value = current.id;
            document.getElementById("workspaceNameInput").value = current.name;
            document.getElementById("workspaceNameInput").setCustomValidity("");
            document.querySelectorAll("[data-workspace-widget]").forEach(input => {
                input.checked = current.widgets[input.dataset.workspaceWidget] === true;
            });
            document.getElementById("workspaceBackgroundSelect").value = current.background;
            document.getElementById("workspaceFocusMinutesInput").value = current.focusMinutes;
            const urlsInput = document.getElementById("workspaceUrlsInput");
            if (urlsInput) urlsInput.value = Array.isArray(current.urls) ? current.urls.join("\n") : "";
            document.getElementById("workspaceDeleteBtn").hidden = !current.id;
            editor.hidden = false;
            requestAnimationFrame(() => {
                editor.scrollIntoView({ block: "nearest" });
                document.getElementById("workspaceNameInput").focus();
            });
        }

        function closeWorkspaceEditor() {
            document.getElementById("workspaceEditorForm").hidden = true;
        }

        document.getElementById("workspaceAddBtn").addEventListener("click", () => openWorkspaceEditor());
        document.getElementById("workspaceCancelBtn").addEventListener("click", closeWorkspaceEditor);
        document.getElementById("workspaceNameInput").addEventListener("input", event => event.target.setCustomValidity(""));
        document.getElementById("workspaceEditorForm").addEventListener("submit", event => {
            event.preventDefault();
            const idInput = document.getElementById("workspaceEditorId");
            const nameInput = document.getElementById("workspaceNameInput");
            const oldId = idInput.value;
            const name = nameInput.value.trim();
            if (workspaces.some(item => item.id !== oldId && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
                nameInput.setCustomValidity(t("workspaceDuplicateError", "A mode with this name already exists."));
                return nameInput.reportValidity();
            }
            const id = oldId || `mode-${globalThis.crypto?.randomUUID?.() || Date.now()}`;
            const draft = {
                id,
                name,
                widgets: Object.fromEntries([...document.querySelectorAll("[data-workspace-widget]")]
                    .map(input => [input.dataset.workspaceWidget, input.checked])),
                background: document.getElementById("workspaceBackgroundSelect").value,
                focusMinutes: Number(document.getElementById("workspaceFocusMinutesInput").value),
                urls: (document.getElementById("workspaceUrlsInput")?.value || "").split("\n").map(u => u.trim()).filter(u => /^https?:\/\//i.test(u))
            };
            const preset = myntNormalizeWorkspaces([draft])[0];
            if (!preset) return nameInput.reportValidity();
            const index = workspaces.findIndex(item => item.id === oldId);
            if (index === -1) workspaces.push(preset);
            else workspaces[index] = preset;
            saveWorkspaces();
            closeWorkspaceEditor();
            applyWorkspace(preset.id);
        });
        document.getElementById("workspaceDeleteBtn").addEventListener("click", () => {
            const id = document.getElementById("workspaceEditorId").value;
            const preset = workspaces.find(item => item.id === id);
            if (!preset || !confirm(format("workspaceDeleteConfirm", "Delete mode ‘{name}’?", { name: preset.name }))) return;
            workspaces = workspaces.filter(item => item.id !== id);
            saveWorkspaces();
            if (localStorage.getItem(KEYS.workspace) === id) localStorage.removeItem(KEYS.workspace);
            closeWorkspaceEditor();
            renderWorkspace();
        });

        for (const id of [...MYNT_WORKSPACE_WIDGETS, "pomodoroWorkInput"]) {
            document.getElementById(id)?.addEventListener("change", () => {
                if (!applyingWorkspace) {
                    localStorage.removeItem(KEYS.workspace);
                    renderWorkspace();
                }
            });
        }

        // Optional extension and browser permissions.
        const permissionApi = globalThis.browser?.permissions || globalThis.chrome?.permissions;
        const isFirefoxPermissionApi = Boolean(globalThis.browser?.permissions);

        function callPermission(method, spec) {
            if (!permissionApi?.[method]) return Promise.resolve(null);
            if (isFirefoxPermissionApi) return permissionApi[method](spec).catch(() => false);
            return new Promise(resolve => {
                permissionApi[method](spec, result => {
                    const failed = Boolean(globalThis.chrome?.runtime?.lastError);
                    resolve(failed ? false : result);
                });
            });
        }

        function setPermissionRow(name, state, actionable = true) {
            const status = document.getElementById(`permission${name}Status`);
            const button = document.querySelector(`[data-permission-action="${name.toLowerCase()}"]`);
            const labels = {
                granted: t("permissionGranted", "Granted"),
                prompt: t("permissionNotGranted", "Not granted"),
                denied: t("permissionDenied", "Denied"),
                unsupported: t("permissionUnsupported", "Unavailable")
            };
            status.textContent = labels[state] || labels.prompt;
            status.className = state;
            button.disabled = !actionable;
            button.dataset.permissionState = state;
            button.textContent = state === "granted" && ["Bookmarks", "Suggestions"].includes(name)
                ? t("permissionRemove", "Remove")
                : state === "prompt"
                    ? t("permissionGrant", "Grant")
                    : labels[state] || t("permissionManage", "Manage");
        }

        async function renderPermissions() {
            if (permissionApi) {
                const bookmarkPermissions = isFirefoxPermissionApi ? ["bookmarks"] : ["bookmarks", "favicon"];
                const [bookmarksGranted, suggestionsGranted] = await Promise.all([
                    callPermission("contains", { permissions: bookmarkPermissions }),
                    callPermission("contains", { origins: [GOOGLE_ORIGIN] })
                ]);
                setPermissionRow("Bookmarks", bookmarksGranted ? "granted" : "prompt");
                setPermissionRow("Suggestions", suggestionsGranted ? "granted" : "prompt");
            } else {
                setPermissionRow("Bookmarks", "unsupported", false);
                setPermissionRow("Suggestions", "unsupported", false);
            }

            if ("Notification" in window) {
                const state = Notification.permission === "default" ? "prompt" : Notification.permission;
                setPermissionRow("Notifications", state, state === "prompt");
            } else {
                setPermissionRow("Notifications", "unsupported", false);
            }

            if (!navigator.geolocation) {
                setPermissionRow("Location", "unsupported", false);
            } else {
                try {
                    const result = await navigator.permissions.query({ name: "geolocation" });
                    setPermissionRow("Location", result.state, result.state === "prompt");
                } catch {
                    setPermissionRow("Location", "prompt", true);
                }
            }
        }

        document.querySelectorAll("[data-permission-action]").forEach(button => {
            button.addEventListener("click", async () => {
                button.disabled = true;
                const action = button.dataset.permissionAction;
                const state = button.dataset.permissionState;
                if (action === "bookmarks") {
                    const permissions = isFirefoxPermissionApi ? ["bookmarks"] : ["bookmarks", "favicon"];
                    await callPermission(state === "granted" ? "remove" : "request", { permissions });
                    if (state === "granted") {
                        const checkbox = document.getElementById("bookmarksCheckbox");
                        if (checkbox.checked) checkbox.click();
                    }
                } else if (action === "suggestions") {
                    await callPermission(state === "granted" ? "remove" : "request", { origins: [GOOGLE_ORIGIN] });
                    if (state === "granted") {
                        const checkbox = document.getElementById("searchsuggestionscheckbox");
                        if (checkbox.checked) checkbox.click();
                    }
                } else if (action === "notifications" && Notification.permission === "default") {
                    await Notification.requestPermission();
                } else if (action === "location") {
                    await new Promise(resolve => navigator.geolocation.getCurrentPosition(resolve, resolve, {
                        enableHighAccuracy: false,
                        timeout: 6000,
                        maximumAge: 300000
                    }));
                }
                await renderPermissions();
            });
        });
        permissionApi?.onAdded?.addListener(renderPermissions);
        permissionApi?.onRemoved?.addListener(renderPermissions);
        document.addEventListener("visibilitychange", () => {
            syncDecorativeVideo();
            if (document.visibilityState === "visible") renderPermissions();
        });

        // Native dialogs provide focus trapping, Escape handling, and keyboard semantics.
        const controlDialog = document.getElementById("controlCenterDialog");
        const commandDialog = document.getElementById("commandPaletteDialog");

        function openControlCenter(sectionId) {
            if (commandDialog.open) commandDialog.close();
            if (!controlDialog.open) controlDialog.showModal();
            renderFocusStats();
            renderHabits();
            renderWorkspace();
            renderServiceStatus();
            renderPermissions();
            requestAnimationFrame(() => {
                const target = sectionId && document.getElementById(sectionId);
                if (target) target.scrollIntoView({ block: "start" });
                else document.querySelector(".controlCenterContent").scrollTop = 0;
            });
        }

        document.getElementById("openControlCenterBtn").addEventListener("click", () => openControlCenter());
        
        const shortcutsHelpDialog = document.getElementById("shortcutsHelpDialog");
        function openShortcutsHelp() {
            if (shortcutsHelpDialog && !shortcutsHelpDialog.open) shortcutsHelpDialog.showModal();
        }
        document.getElementById("closeShortcutsHelpBtn")?.addEventListener("click", () => shortcutsHelpDialog?.close());
        shortcutsHelpDialog?.addEventListener("click", event => {
            if (event.target === shortcutsHelpDialog) shortcutsHelpDialog.close();
        });
        document.addEventListener("keydown", event => {
            if (event.key === "?" && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
                event.preventDefault();
                openShortcutsHelp();
            }
        });
        document.getElementById("closeControlCenterBtn").addEventListener("click", () => controlDialog.close());
        document.getElementById("pomodoroStatsBtn").addEventListener("click", event => {
            event.stopPropagation();
            openControlCenter("focusStatsSection");
        });
        document.getElementById("serviceStatusPill").addEventListener("click", () => openControlCenter("serviceSection"));
        controlDialog.addEventListener("click", event => {
            if (event.target === controlDialog) controlDialog.close();
        });

        function ensureWidget(checkboxId, triggerId, visibleSelector) {
            const checkbox = document.getElementById(checkboxId);
            if (checkbox && !checkbox.checked) checkbox.click();
            const trigger = document.getElementById(triggerId);
            const visible = document.querySelector(visibleSelector);
            if (trigger && (!visible || getComputedStyle(visible).display === "none")) trigger.click();
        }

        const commandDefinitions = [
            { id: "shortcutsHelp", label: "commandShortcutsHelp", info: "commandShortcutsHelpInfo", run: () => openShortcutsHelp() },
            { id: "control", label: "commandOpenControl", info: "commandOpenControlInfo", run: () => openControlCenter() },
            { id: "focus", label: "commandFocusStats", info: "commandFocusStatsInfo", run: () => openControlCenter("focusStatsSection") },
            { id: "workspaces", label: "commandWorkspaces", info: "commandWorkspacesInfo", run: () => openControlCenter("workspaceSection") },
            { id: "habits", label: "commandHabits", info: "commandHabitsInfo", run: () => openControlCenter("habitsSection") },
            { id: "privacy", label: "commandPrivacy", info: "commandPrivacyInfo", run: () => openControlCenter("privacySection") },
            { id: "accessibility", label: "commandAccessibility", info: "commandAccessibilityInfo", run: () => openControlCenter("accessibilitySection") },
            { id: "settings", label: "commandSettings", info: "commandSettingsInfo", run: () => {
                const menu = document.getElementById("menuBar");
                if (!menu || getComputedStyle(menu).display === "none") document.getElementById("menuButton").click();
            } },
            { id: "search", label: "commandSearch", info: "commandSearchInfo", run: () => document.getElementById("searchQ").focus() },
            { id: "todo", label: "commandTodo", info: "commandTodoInfo", run: () => ensureWidget("todoListCheckbox", "todoListCont", "#todoContainer") },
            { id: "pomodoro", label: "commandPomodoro", info: "commandPomodoroInfo", run: () => ensureWidget("pomodoroCheckbox", "pomodoroCont", "#pomodoroPanel") },
            { id: "bookmarks", label: "commandBookmarks", info: "commandBookmarksInfo", run: () => document.getElementById("bookmarkButton").click() },
            { id: "bongoCat", label: "commandBongoCat", info: "commandBongoCatInfo", run: () => {
                const cb = document.getElementById("bongoCatCheckbox");
                if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event("change")); }
            } },
            { id: "aiTools", label: "commandAiTools", info: "commandAiToolsInfo", run: () => ensureWidget("aiToolsCheckbox", "aiToolsIcon", "#toolsCont") },
            { id: "scratchpad", label: "commandScratchpad", info: "commandScratchpadInfo", run: () => ensureWidget("scratchpadCheckbox", "scratchpadCont", "#scratchpadContainer") },
                        { id: "ambientAudio", label: "commandAmbientAudio", info: "commandAmbientAudioInfo", run: () => globalThis.myntAmbientAudio?.toggle() },
            { id: "ambientRain", label: "commandAmbientRain", info: "commandAmbientRainInfo", run: () => globalThis.myntAmbientAudio?.play("rain") },
            { id: "ambientOcean", label: "commandAmbientOcean", info: "commandAmbientOceanInfo", run: () => globalThis.myntAmbientAudio?.play("ocean") },
            { id: "ambientWhite", label: "commandAmbientWhite", info: "commandAmbientWhiteInfo", run: () => globalThis.myntAmbientAudio?.play("whitenoise") },
            { id: "ambientFire", label: "commandAmbientFire", info: "commandAmbientFireInfo", run: () => globalThis.myntAmbientAudio?.play("campfire") },
            { id: "scratchpadCopy", label: "commandScratchpadCopy", info: "commandScratchpadCopyInfo", run: () => document.getElementById("scratchpadCopyBtn")?.click() },
            { id: "toggleTheme", label: "commandToggleTheme", info: "commandToggleThemeInfo", run: () => {
                const darkRadio = document.getElementById("darkTheme");
                const defaultRadio = document.getElementById("dfChecked");
                if (document.documentElement.classList.contains("black-theme")) {
                    if (defaultRadio) { defaultRadio.checked = true; defaultRadio.dispatchEvent(new Event("change")); }
                } else {
                    if (darkRadio) { darkRadio.checked = true; darkRadio.dispatchEvent(new Event("change")); }
                }
            } }
        ];
        let filteredCommands = [];
        let activeCommandIndex = 0;
        let commandRenderToken = 0;

        function commandLabel(command) {
            return command.labelText || t(command.label, command.id);
        }

        function commandInfo(command) {
            return command.infoText || t(command.info, "");
        }

        function matchesCommand(command, query) {
            return `${commandLabel(command)} ${commandInfo(command)} ${command.searchText || ""} ${command.id}`
                .toLocaleLowerCase().includes(query);
        }

        function collectLinkCommands(selector, groupKey, query) {
            if (!query) return [];
            return [...document.querySelectorAll(selector)].map((anchor, index) => {
                const label = (anchor.querySelector(".tLabel, .label.short, .label")?.textContent || anchor.textContent)
                    .replace(/\s+/g, " ").trim();
                return {
                    id: `${groupKey}-${index}`,
                    labelText: label,
                    infoText: anchor.hostname || anchor.href,
                    group: groupKey,
                    searchText: anchor.href,
                    run: () => anchor.click()
                };
            }).filter(command => command.labelText && matchesCommand(command, query));
        }

        function bookmarkCommands(query) {
            if (!query) return Promise.resolve([]);
            const found = new Map();
            const add = (title, url) => {
                if (!url || found.has(url) || found.size >= 8) return;
                found.set(url, {
                    id: `bookmark-${found.size}`,
                    labelText: String(title || url).trim(),
                    infoText: url,
                    group: "commandGroupBookmark",
                    searchText: url,
                    run: () => { window.location.href = url; }
                });
            };
            document.querySelectorAll("#bookmarkList li[data-url]").forEach(item => {
                const anchor = item.querySelector(":scope > a");
                const title = anchor?.querySelector("span")?.textContent || anchor?.textContent;
                if (`${title} ${item.dataset.url}`.toLocaleLowerCase().includes(query)) add(title, item.dataset.url);
            });
            const api = globalThis.browser?.bookmarks || globalThis.chrome?.bookmarks;
            if (!api?.search) return Promise.resolve([...found.values()]);
            const finish = nodes => {
                for (const node of Array.isArray(nodes) ? nodes : []) add(node.title, node.url);
                return [...found.values()].filter(command => matchesCommand(command, query));
            };
            if (globalThis.browser?.bookmarks) return api.search(query).then(finish).catch(() => finish([]));
            return new Promise(resolve => {
                try {
                    api.search(query, nodes => resolve(globalThis.chrome?.runtime?.lastError ? finish([]) : finish(nodes)));
                } catch {
                    resolve(finish([]));
                }
            });
        }

        async function renderCommands(query = "") {
            const token = ++commandRenderToken;
            const normalized = query.trim().toLocaleLowerCase();
            const workspaceLaunchCommands = workspaces.filter(p => p.urls && p.urls.length > 0).map(preset => ({
                id: `launch-workspace-${preset.id}`,
                labelText: format("commandLaunchWorkspace", "Launch {name} sites ({count})", { name: preset.name, count: preset.urls.length }),
                infoText: preset.urls.join(", "),
                group: "commandGroupWorkspace",
                run: () => preset.urls.forEach(u => window.open(u, "_blank"))
            })).filter(command => matchesCommand(command, normalized));
            const workspaceCommands = workspaces.map(preset => ({
                id: `workspace-${preset.id}`,
                labelText: format("commandApplyWorkspace", "Apply {name} mode", { name: preset.name }),
                infoText: format("workspaceSummary", "{count} tools · {minutes} min · {background}", {
                    count: Object.values(preset.widgets).filter(Boolean).length,
                    minutes: preset.focusMinutes,
                    background: workspaceBackgroundName(preset.background)
                }),
                group: "commandGroupWorkspace",
                run: () => applyWorkspace(preset.id)
            })).filter(command => matchesCommand(command, normalized));
            const createCommand = normalized ? [{
                id: "quick-create-task",
                labelText: format("commandCreateTask", "Create task: {title}", { title: query.trim() }),
                infoText: t("commandCreateTaskInfo", "Add to To Do list"),
                group: "commandGroupTask",
                run: () => {
                    document.dispatchEvent(new CustomEvent("mynt:todo-create", { detail: { title: query.trim() } }));
                }
            }] : [];
            const base = [
                ...commandDefinitions.filter(command => matchesCommand(command, normalized)),
                ...createCommand,
                ...workspaceCommands,
                ...workspaceLaunchCommands,
                ...collectLinkCommands("#toolsCont a", "commandGroupAi", normalized),
                ...collectLinkCommands("#iconContainer a", "commandGroupGoogle", normalized)
            ];
            const bookmarks = await bookmarkCommands(normalized);
            if (token !== commandRenderToken) return;
            filteredCommands = [...base, ...bookmarks].slice(0, 40);
            activeCommandIndex = Math.min(activeCommandIndex, Math.max(0, filteredCommands.length - 1));
            const list = document.getElementById("commandPaletteList");
            list.replaceChildren();
            filteredCommands.forEach((command, index) => {
                const button = document.createElement("button");
                button.type = "button";
                button.id = `command-option-${index}`;
                button.className = "commandPaletteItem";
                button.setAttribute("role", "option");
                button.setAttribute("aria-selected", String(index === activeCommandIndex));
                const copy = document.createElement("span");
                copy.className = "commandPaletteCopy";
                const label = document.createElement("strong");
                label.textContent = commandLabel(command);
                const info = document.createElement("small");
                info.textContent = commandInfo(command);
                copy.append(label, info);
                const group = document.createElement("span");
                group.className = "commandPaletteGroup";
                group.textContent = t(command.group || "commandGroupAction", "Action");
                button.append(copy, group);
                button.addEventListener("mouseenter", () => {
                    activeCommandIndex = index;
                    updateCommandSelection();
                });
                button.addEventListener("click", () => runCommand(command));
                list.appendChild(button);
            });
            document.getElementById("commandPaletteEmpty").hidden = filteredCommands.length > 0;
            updateCommandSelection();
        }

        function updateCommandSelection() {
            const input = document.getElementById("commandPaletteInput");
            let activeOption = null;
            document.querySelectorAll(".commandPaletteItem").forEach((button, index) => {
                button.setAttribute("aria-selected", String(index === activeCommandIndex));
                if (index === activeCommandIndex) activeOption = button;
            });
            if (activeOption) input.setAttribute("aria-activedescendant", activeOption.id);
            else input.removeAttribute("aria-activedescendant");
        }

        function runCommand(command) {
            commandDialog.close();
            command.run();
        }

        function openCommandPalette() {
            if (controlDialog.open) controlDialog.close();
            if (!commandDialog.open) commandDialog.showModal();
            const input = document.getElementById("commandPaletteInput");
            input.setAttribute("aria-expanded", "true");
            input.value = "";
            activeCommandIndex = 0;
            renderCommands();
            requestAnimationFrame(() => input.focus());
        }

        document.addEventListener("keydown", event => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
                event.preventDefault();
                commandDialog.open ? commandDialog.close() : openCommandPalette();
            }
        });
        document.getElementById("commandPaletteInput").addEventListener("input", event => {
            activeCommandIndex = 0;
            renderCommands(event.target.value);
        });
        document.getElementById("commandPaletteInput").addEventListener("keydown", event => {
            if (event.key === "ArrowDown" && filteredCommands.length) {
                event.preventDefault();
                activeCommandIndex = (activeCommandIndex + 1) % filteredCommands.length;
                updateCommandSelection();
            } else if (event.key === "ArrowUp" && filteredCommands.length) {
                event.preventDefault();
                activeCommandIndex = (activeCommandIndex - 1 + filteredCommands.length) % filteredCommands.length;
                updateCommandSelection();
            } else if (event.key === "Enter" && filteredCommands[activeCommandIndex]) {
                event.preventDefault();
                runCommand(filteredCommands[activeCommandIndex]);
            }
        });
        commandDialog.addEventListener("click", event => {
            if (event.target === commandDialog) commandDialog.close();
        });
        commandDialog.addEventListener("close", () => {
            const input = document.getElementById("commandPaletteInput");
            input.setAttribute("aria-expanded", "false");
            input.removeAttribute("aria-activedescendant");
        });

        localizeStaticUI();
        migratePomodoroToday();
        saveHabits();
        saveWorkspaces();
        applyAccessibility();
        renderFocusStats();
        renderHabits();
        renderWorkspace();
        renderServiceStatus();
        renderPermissions();
    })();
}

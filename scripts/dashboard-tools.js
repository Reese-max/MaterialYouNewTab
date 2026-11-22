/*
 * Material You NewTab
 * Copyright (c) 2024-2026 Prem, 2023-2025 XengShi
 * Licensed under the GNU General Public License v3.0 (GPL-3.0)
 */

const MYNT_WORKSPACE_WIDGETS = [
    "shortcutsCheckbox", "bookmarksCheckbox", "todoListCheckbox", "pomodoroCheckbox",
    "aiToolsCheckbox", "googleAppsCheckbox"
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
        myntNormalizeWorkspaces
    };
}

if (typeof document !== "undefined") {
    (() => {
        const KEYS = {
            accessibility: "myntAccessibility",
            serviceStatus: "myntServiceStatus",
            serviceAlert: "myntServiceStatusPillVisible",
            workspace: "myntWorkspacePreset",
            workspaces: "myntWorkspacePresets"
        };
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
                "workspaceTitle", "workspaceInfo", "workspaceAddBtn",
                "workspaceNameLabel", "workspaceWidgetsLegend", "workspaceWidgetShortcuts",
                "workspaceWidgetBookmarks", "workspaceWidgetTodo", "workspaceWidgetPomodoro",
                "workspaceWidgetAi", "workspaceWidgetGoogle",
                "workspaceBackgroundLabel", "workspaceBackgroundVideo",
                "workspaceBackgroundWallpaper", "workspaceBackgroundColor", "workspaceFocusMinutesLabel",
                "workspaceDeleteBtn", "workspaceCancelBtn", "workspaceSaveBtn", "accessibilityTitle",
                "accessibilityInfo", "reduceMotionText", "reduceMotionInfo", "highContrastText",
                "highContrastInfo", "fontScaleText", "fontScaleInfo", "privacyCenterTitle",
                "privacyCenterInfo", "privacyPolicyLink", "permissionBookmarksTitle",
                "permissionBookmarksInfo",
                "permissionNotificationsTitle", "permissionNotificationsInfo", "permissionLocationTitle",
                "permissionLocationInfo", "privacyDisclosureWeather", "privacyDisclosureIp",
                "privacyDisclosureLocal", "serviceStatusTitle",
                "serviceStatusInfo", "serviceAlertToggleText", "serviceAlertToggleInfo",
                "commandPaletteTitle", "commandPaletteEmpty"
            ];
            sameKeyIds.forEach(id => {
                const element = document.getElementById(id);
                if (element) element.textContent = t(id, element.textContent);
            });

            document.getElementById("controlCenterTitle").textContent = t("controlCenterText", "Control Center");
            document.getElementById("commandPaletteInput").placeholder = t("commandPalettePlaceholder", "Search commands...");
            document.getElementById("commandPaletteDialog").setAttribute("aria-label", t("commandPaletteTitle", "Command palette"));
            document.getElementById("closeControlCenterBtn").setAttribute("aria-label", t("menuCloseText", "Close"));
        }

        const weatherRemoved = (window.MYNT_REMOVED_COMPONENT_IDS || []).includes("weather");
        // Service status records only a service identifier, result, and timestamp.
        const serviceDefinitions = [
            ["network", "serviceNetwork"],
            ["weather", "serviceWeather"],
            ["location", "serviceLocation"],
            ["wallpaper", "serviceWallpaper"]
        ].filter(([id]) => !weatherRemoved || !["weather", "location"].includes(id));
        let serviceState = readJSON(KEYS.serviceStatus, {});

        function serviceFromRequest(input) {
            try {
                const raw = input instanceof Request ? input.url : String(input);
                const url = new URL(raw, location.href);
                if (url.hostname === "api.weatherapi.com") return "weather";
                if (url.hostname === "ipinfo.io") return "location";
                if (url.hostname === "picsum.photos") return "wallpaper";
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

            updateServiceAlert();
        }

        function serviceAlertEnabled() {
            // 只有明確的 "false" 會關閉；缺值或格式異常時維持預設顯示，且不改寫資料。
            try { return localStorage.getItem(KEYS.serviceAlert) !== "false"; } catch { return true; }
        }

        // 首頁提示只讀取既有狀態，不重建控制中心清單（避免 aria-live 重複朗讀）。
        function updateServiceAlert() {
            const pill = document.getElementById("serviceStatusPill");
            const pillText = document.getElementById("serviceStatusPillText");
            if (!pill || !pillText) return;
            const recentError = serviceDefinitions.some(([id]) =>
                ["error", "offline"].includes(serviceState[id]?.status) && Date.now() - serviceState[id].at < 15 * 60 * 1000
            );

            // 使用者可在元件管理或控制中心關閉首頁提示；狀態清單與本機紀錄照常更新。
            pill.hidden = !serviceAlertEnabled() || (navigator.onLine && !recentError);
            pill.classList.toggle("serviceWarning", navigator.onLine && recentError);
            pillText.textContent = navigator.onLine
                ? t("serviceIssuePill", "Service issue")
                : t("serviceOfflineMode", "Offline mode");
        }

        const serviceAlertCheckbox = document.getElementById("serviceStatusPillCheckbox");
        if (serviceAlertCheckbox) {
            serviceAlertCheckbox.checked = serviceAlertEnabled();
            // 元件管理會監聽 document change 事件並同步首頁與設定中的勾選狀態。
            serviceAlertCheckbox.addEventListener("change", () => {
                localStorage.setItem(KEYS.serviceAlert, String(serviceAlertCheckbox.checked));
                updateServiceAlert();
            });
        }

        window.addEventListener("online", renderServiceStatus);
        window.addEventListener("offline", renderServiceStatus);

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
        const decorativeVideoSource = decorativeVideo?.querySelector("source[data-src]");
        const networkConnection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        let decorativeVideoStarted = false;
        let resumeDecorativeAfterHidden = false;
        let startDecorativeWhenVisible = false;
        let decorativeVideoStartHandle = null;
        let decorativeVideoUsesIdleCallback = false;

        // Once the built-in motion video is deleted in the wallpaper gallery, a workspace asking for it shows
        // the gallery wallpaper, or the theme colour, instead of bringing the deleted video back.
        function workspaceBackgroundFor(background) {
            if (background !== "video" || document.body.dataset.galleryVideo === "on") return background;
            let deleted = false;
            try {
                const hidden = JSON.parse(localStorage.getItem("myntWallpaperHiddenBuiltins") || "[]");
                deleted = Array.isArray(hidden) && hidden.includes("bundled-video-bg");
            } catch (_) { /* unreadable list: keep the workspace choice */ }
            if (!deleted) return background;
            return document.body.dataset.wallpaperId ? "wallpaper" : "color";
        }

        function canPlayDecorativeVideo() {
            return Boolean(decorativeVideo)
                && document.visibilityState === "visible"
                && document.body.dataset.workspaceBackground === "video"
                && document.body.dataset.galleryVideo !== "on"
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

        function loadDecorativeVideo() {
            if (!decorativeVideoSource || decorativeVideoSource.hasAttribute("src")) return;
            decorativeVideoSource.src = decorativeVideoSource.dataset.src;
            decorativeVideo.load();
        }

        function syncDecorativeVideo() {
            if (!decorativeVideo) return;

            startDecorativeWhenVisible = document.hidden && document.body.dataset.workspaceBackground === "video";
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
                loadDecorativeVideo();
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

        function applyAccessibility(allowResume = true) {
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
                } else if (allowResume && !reduceMotion && !document.hidden && video.dataset.myntWasPlaying === "true") {
                    delete video.dataset.myntWasPlaying;
                    video.play().catch(() => {});
                }
            });
            if (allowResume) syncDecorativeVideo();
            else if (reduceMotion) decorativeVideo?.pause();
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
                    pomodoroCheckbox: true,
                    aiToolsCheckbox: false, googleAppsCheckbox: false
                }
            },
            {
                id: "study", name: t("workspaceStudy", "Study"), background: "wallpaper", focusMinutes: 45, urls: ["https://scholar.google.com"],
                widgets: {
                    shortcutsCheckbox: false, bookmarksCheckbox: false, todoListCheckbox: true,
                    pomodoroCheckbox: true,
                    aiToolsCheckbox: true, googleAppsCheckbox: false
                }
            },
            {
                id: "relax", name: t("workspaceRelax", "Relax"), background: "color", focusMinutes: 15, urls: [],
                widgets: {
                    shortcutsCheckbox: true, bookmarksCheckbox: false, todoListCheckbox: false,
                    pomodoroCheckbox: false,
                    aiToolsCheckbox: false, googleAppsCheckbox: true
                }
            }
        ];
        let workspaces = myntNormalizeWorkspaces(readJSON(KEYS.workspaces, null), workspaceDefaults);
        let workspaceBaseline = localStorage.getItem(KEYS.workspaces);
        let workspaceEditorBaseline = workspaceBaseline;
        let applyingWorkspace = false;
        const restoredWorkspace = workspaces.find(item => item.id === localStorage.getItem(KEYS.workspace));
        const startBackground = workspaceBackgroundFor(restoredWorkspace?.background || document.body.dataset.workspaceBackground || "video");
        if (restoredWorkspace || startBackground !== document.body.dataset.workspaceBackground) {
            document.body.dataset.workspaceBackground = startBackground;
            if (startBackground !== "video") document.body.dataset.bg = startBackground;
        }

        function saveWorkspaces() {
            if (localStorage.getItem(KEYS.workspaces) !== workspaceBaseline) {
                window.MyntStorageSync.preserve(JSON.stringify(workspaces, null, 2));
                window.myntDashboard.reloadWorkspaces();
                return false;
            }
            localStorage.setItem(KEYS.workspaces, JSON.stringify(workspaces));
            workspaceBaseline = localStorage.getItem(KEYS.workspaces);
            return true;
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
                    // A line icon from styles/ui-icons.css, not an emoji; the count is the visible label.
                    const launchIcon = document.createElement("span"); launchIcon.className = "mynt-icon"; launchIcon.dataset.icon = "launch"; launchIcon.setAttribute("aria-hidden", "true");
                    const launchCount = document.createElement("span"); launchCount.textContent = String(preset.urls.length);
                    launch.append(launchIcon, launchCount);
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
            const background = workspaceBackgroundFor(preset.background);
            document.body.dataset.workspaceBackground = background;
            if (background !== "video") document.body.dataset.bg = background;
            syncDecorativeVideo();
            applyingWorkspace = false;
            localStorage.setItem(KEYS.workspace, id);
            renderWorkspace();
        }

        function openWorkspaceEditor(preset = null) {
            workspaceEditorBaseline = localStorage.getItem(KEYS.workspaces);
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
            if (localStorage.getItem(KEYS.workspaces) !== workspaceEditorBaseline) {
                window.MyntStorageSync.preserve(JSON.stringify(draft, null, 2));
                window.myntDashboard.reloadWorkspaces();
                return;
            }
            const index = workspaces.findIndex(item => item.id === oldId);
            if (index === -1) workspaces.push(preset);
            else workspaces[index] = preset;
            if (!saveWorkspaces()) return;
            closeWorkspaceEditor();
            applyWorkspace(preset.id);
        });
        document.getElementById("workspaceDeleteBtn").addEventListener("click", async () => {
            const id = document.getElementById("workspaceEditorId").value;
            const preset = workspaces.find(item => item.id === id);
            if (!preset) return;
            const message = format("workspaceDeleteConfirm", "Delete mode ‘{name}’?", { name: preset.name });
            if (!(window.myntDialog ? await window.myntDialog.confirm(message, { danger: true }) : confirm(message))) return;
            if (localStorage.getItem(KEYS.workspaces) !== workspaceEditorBaseline) {
                window.myntDashboard.reloadWorkspaces();
                return;
            }
            workspaces = workspaces.filter(item => item.id !== id);
            if (!saveWorkspaces()) return;
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
            button.textContent = state === "granted" && name === "Bookmarks"
                ? t("permissionRemove", "Remove")
                : state === "prompt"
                    ? t("permissionGrant", "Grant")
                    : labels[state] || t("permissionManage", "Manage");
        }

        async function renderPermissions() {
            if (permissionApi) {
                const bookmarkPermissions = isFirefoxPermissionApi ? ["bookmarks"] : ["bookmarks", "favicon"];
                const bookmarksGranted = await callPermission("contains", { permissions: bookmarkPermissions });
                setPermissionRow("Bookmarks", bookmarksGranted ? "granted" : "prompt");
            } else {
                setPermissionRow("Bookmarks", "unsupported", false);
            }

            if ("Notification" in window) {
                const state = Notification.permission === "default" ? "prompt" : Notification.permission;
                setPermissionRow("Notifications", state, state === "prompt");
            } else {
                setPermissionRow("Notifications", "unsupported", false);
            }

            if (weatherRemoved) return;
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
                } else if (action === "notifications" && Notification.permission === "default") {
                    await Notification.requestPermission();
                } else if (action === "location" && !weatherRemoved) {
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
            if(document.hidden){
                resumeDecorativeAfterHidden=Boolean(decorativeVideo&&!decorativeVideo.paused);
                cancelDecorativeVideoStart();decorativeVideo?.pause();
            }else if(resumeDecorativeAfterHidden||startDecorativeWhenVisible){
                resumeDecorativeAfterHidden=false;startDecorativeWhenVisible=false;syncDecorativeVideo();
            }
            if (document.visibilityState === "visible") renderPermissions();
        });

        // Native dialogs provide focus trapping, Escape handling, and keyboard semantics.
        const controlDialog = document.getElementById("controlCenterDialog");
        const commandDialog = document.getElementById("commandPaletteDialog");

        function openControlCenter(sectionId) {
            if (commandDialog.open) commandDialog.close();
            renderWorkspace();
            renderServiceStatus();
            renderPermissions();
            window.myntSettings.open(sectionId || "accessibilitySection");
        }

        // Legacy clients (including the contrast smoke test) may call showModal directly.
        // Move the same controls temporarily; never create a second state/input source.
        const legacyShowControlCenter = controlDialog.showModal.bind(controlDialog);
        let controlCenterPlacements = [];
        controlDialog.showModal = () => {
            if (controlDialog.open) return;
            const content = controlDialog.querySelector('.controlCenterContent');
            controlCenterPlacements = ['workspaceSection', 'accessibilitySection', 'privacySection', 'serviceSection'].map(id => {
                const section = document.getElementById(id), marker = document.createComment(id);
                section.before(marker); content.append(section);
                section.hidden = false; section.removeAttribute('inert');
                return { section, marker };
            });
            controlDialog.hidden = false; controlDialog.inert = false;
            renderWorkspace(); renderServiceStatus(); renderPermissions();
            legacyShowControlCenter();
        };
        controlDialog.addEventListener('close', () => {
            for (const { section, marker } of controlCenterPlacements) marker.replaceWith(section);
            controlCenterPlacements = [];
            controlDialog.hidden = true; controlDialog.inert = true;
            window.myntComponents?.refresh();
        });

        
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
        document.getElementById("serviceStatusPill").addEventListener("click", () => openControlCenter("serviceSection"));
        controlDialog.addEventListener("click", event => {
            if (event.target === controlDialog) controlDialog.close();
        });

        // Commands that would reopen or write into features removed from the homepage (scripts/removed-features.js).
        const REMOVED_COMMANDS = { todo: ["todo", "quick-create-task"], exam: ["exam-today"], weather: ["weather"] };
        const hiddenCommandIds = new Set((window.MYNT_REMOVED_COMPONENT_IDS || []).flatMap(id => REMOVED_COMMANDS[id] || []));

        function ensureWidget(checkboxId, triggerId, visibleSelector) {
            const checkbox = document.getElementById(checkboxId);
            if (checkbox && !checkbox.checked) checkbox.click();
            const trigger = document.getElementById(triggerId);
            const visible = document.querySelector(visibleSelector);
            if (trigger && (!visible || getComputedStyle(visible).display === "none")) trigger.click();
        }

        const commandDefinitions = [
            { id: "shortcutsHelp", label: "commandShortcutsHelp", info: "commandShortcutsHelpInfo", run: () => openShortcutsHelp() },
            { id: "wallpaperNext", label: "commandWallpaperNext", info: "commandWallpaperNextInfo", run: () => window.myntWallpaper?.next() },
            { id: "wallpaperGallery", label: "commandWallpaperGallery", info: "commandWallpaperGalleryInfo", run: () => window.myntWallpaper?.open() },
            { id: "wallpaperRandom", label: "commandWallpaperRandom", info: "commandWallpaperRandomInfo", run: () => window.myntWallpaper?.random() },
            { id: "control", label: "commandSystemSettings", info: "commandSystemSettingsInfo", run: () => openControlCenter() },
            { id: "workspaces", label: "commandWorkspaces", info: "commandWorkspacesInfo", run: () => openControlCenter("workspaceSection") },
            { id: "privacy", label: "commandPrivacy", info: "commandPrivacyInfo", run: () => openControlCenter("privacySection") },
            { id: "accessibility", label: "commandAccessibility", info: "commandAccessibilityInfo", run: () => openControlCenter("accessibilitySection") },
            { id: "settings", label: "commandSettings", info: "commandSettingsInfo", run: () => {
                const menu = document.getElementById("menuBar");
                if (!menu || getComputedStyle(menu).display === "none") document.getElementById("menuButton").click();
            } },
            { id: "search", label: "commandSearch", info: "commandSearchInfo", run: () => document.getElementById("searchQ").focus() },
            { id: "todo", label: "commandTodo", info: "commandTodoInfo", run: () => ensureWidget("todoListCheckbox", "todoListCont", "#todoContainer") },
            { id: "exam-today", label: "commandExamToday", info: "commandExamTodayInfo", searchText: "exam 考古題", run: () => window.open(myntExamArchiveUrl(localStorage.getItem("myntExamArchiveUrl")), "_blank", "noopener") },
            { id: "pomodoro", label: "commandPomodoro", info: "commandPomodoroInfo", run: () => ensureWidget("pomodoroCheckbox", "pomodoroCont", "#pomodoroPanel") },
            { id: "study-quotes", label: "commandStudyQuotes", info: "commandStudyQuotesInfo", searchText: "quotes 鼓勵語 語錄 匯入 標籤", run: () => window.myntStudyQuotesManager?.open() },
            { id: "bookmarks", label: "commandBookmarks", info: "commandBookmarksInfo", run: () => document.getElementById("bookmarkButton").click() },
            { id: "aiTools", label: "commandAiTools", info: "commandAiToolsInfo", run: () => ensureWidget("aiToolsCheckbox", "aiToolsIcon", "#toolsCont") },
                        { id: "ambientAudio", label: "commandAmbientAudio", info: "commandAmbientAudioInfo", run: () => globalThis.myntAmbientAudio?.toggle() },
            { id: "ambientRain", label: "commandAmbientRain", info: "commandAmbientRainInfo", run: () => globalThis.myntAmbientAudio?.play("rain") },
            { id: "ambientOcean", label: "commandAmbientOcean", info: "commandAmbientOceanInfo", run: () => globalThis.myntAmbientAudio?.play("ocean") },
            { id: "ambientWhite", label: "commandAmbientWhite", info: "commandAmbientWhiteInfo", run: () => globalThis.myntAmbientAudio?.play("whitenoise") },
            { id: "ambientFire", label: "commandAmbientFire", info: "commandAmbientFireInfo", run: () => globalThis.myntAmbientAudio?.play("campfire") },
            { id: "ambientThunder", label: "commandAmbientThunder", info: "commandAmbientThunderInfo", run: () => globalThis.myntAmbientAudio?.play("thunder") },
            { id: "ambientStream", label: "commandAmbientStream", info: "commandAmbientStreamInfo", run: () => globalThis.myntAmbientAudio?.play("stream") },
            { id: "ambientWind", label: "commandAmbientWind", info: "commandAmbientWindInfo", run: () => globalThis.myntAmbientAudio?.play("wind") },
            { id: "ambientForest", label: "commandAmbientForest", info: "commandAmbientForestInfo", run: () => globalThis.myntAmbientAudio?.play("forest") },
            { id: "ambientNight", label: "commandAmbientNight", info: "commandAmbientNightInfo", run: () => globalThis.myntAmbientAudio?.play("night") },
            { id: "ambientPink", label: "commandAmbientPink", info: "commandAmbientPinkInfo", run: () => globalThis.myntAmbientAudio?.play("pink") },
            { id: "ambientBrown", label: "commandAmbientBrown", info: "commandAmbientBrownInfo", run: () => globalThis.myntAmbientAudio?.play("brown") },
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
        let commandReadyToken = -1;

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

        async function bookmarkCommands(query) {
            if (!query) return Promise.resolve([]);
            if (typeof safeBookmarkLink !== "function") {
                try { await window.myntLazy?.load("bookmarks"); } catch { return []; }
                if (typeof safeBookmarkLink !== "function") return [];
            }
            const found = new Map();
            const add = (title, url) => {
                url = safeBookmarkLink(url);
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

        async function shortcutCommands(query) {
            if (!query) return [];
            if (typeof safeBookmarkLink !== "function") {
                try { await window.myntLazy?.load("bookmarks"); } catch { return []; }
                if (typeof safeBookmarkLink !== "function") return [];
            }
            return (window.myntShortcuts?.getItems() || []).flatMap((item, index) => {
                const url = safeBookmarkLink(item.url);
                if (!url) return [];
                const command = {
                    id: `shortcut-${index}`, labelText: item.name || url, infoText: url,
                    group: "commandGroupShortcut", searchText: url,
                    run: () => { window.location.href = url; }
                };
                return matchesCommand(command, query) ? [command] : [];
            });
        }

        async function renderCommands(query = "") {
            const token = ++commandRenderToken;
            filteredCommands = [];
            document.getElementById("commandPaletteList").replaceChildren();
            updateCommandSelection();
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
            ].filter(command => !hiddenCommandIds.has(command.id));
            const [shortcuts, bookmarks] = await Promise.all([shortcutCommands(normalized), bookmarkCommands(normalized)]);
            if (token !== commandRenderToken) return;
            filteredCommands = [...base, ...shortcuts, ...bookmarks].slice(0, 40);
            commandReadyToken = token;
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
                button.addEventListener("click", () => { if (token === commandRenderToken) runCommand(command); });
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
            if (event.isComposing || event.keyCode === 229 || commandReadyToken !== commandRenderToken) return;
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

        function remoteWorkspaceState() {
            return { presets: workspaces.map(({urls,...preset})=>JSON.parse(JSON.stringify(preset))),
                active: localStorage.getItem(KEYS.workspace),
                widgets: Object.fromEntries(MYNT_WORKSPACE_WIDGETS.map(id=>[id,document.getElementById(id)?.checked===true])),
                background: document.body.dataset.workspaceBackground || 'video',
                durations: window.myntPomodoro?.getState()?.durations || null, safetyStatus: window.myntPomodoro?.getState()?.safetyStatus || 'unavailable' };
        }
        async function applyWorkspaceRemote(id, gate, assertAccess) {
            const preset=workspaces.find(item=>item.id===id);
            if(!preset || typeof gate!=='function' || typeof assertAccess!=='function')throw Error('INVALID_ARGUMENT');
            if(MYNT_WORKSPACE_WIDGETS.some(key=>!document.getElementById(key)))throw Error('UNAVAILABLE');
            const timer=window.myntPomodoro;
            if(!timer?.runRemote)throw Error('UNAVAILABLE');
            if(timer.getState().safetyStatus!=='ready'||!timer.getState().coordinationAvailable)throw Error('ACTION_REQUIRED');
            gate();
            const timerResult=await timer.runRemote('setDurations',{...timer.getState().durations,workMinutes:preset.focusMinutes},gate);
            if(timerResult===false || timer.getState().safetyStatus!=='ready' || !timer.getState().coordinationAvailable || timer.getState().durations.workMinutes!==preset.focusMinutes || localStorage.getItem('pomodoroWorkMinutes')!==String(preset.focusMinutes))throw Error('OPERATION_FAILED');
            assertAccess();
            applyingWorkspace=true;
            try {
                for(const [widgetId,enabled] of Object.entries(preset.widgets)) {
                    assertAccess();const checkbox=document.getElementById(widgetId);
                    if(checkbox.checked!==enabled){
                        checkbox.click();
                        const key=widgetId+'State';
                        if(checkbox.checked!==enabled || localStorage.getItem(key)!==(enabled?'checked':'unchecked'))throw Error('OPERATION_FAILED');
                    }
                }
                assertAccess();
                localStorage.setItem(KEYS.workspace,id);
                const background=workspaceBackgroundFor(preset.background);
                document.body.dataset.workspaceBackground=background;
                if(background!=='video')document.body.dataset.bg=background;
                cancelDecorativeVideoStart(); startDecorativeWhenVisible=false; resumeDecorativeAfterHidden=false;
                decorativeVideo?.pause();
                renderWorkspace();
                return {applied:true,playbackDeferred:true,openedUrls:0};
            } finally {applyingWorkspace=false;}
        }

        window.myntDashboard = {
            getRemoteWorkspaceState: remoteWorkspaceState, applyWorkspaceRemote,
            getWorkspacePresets: () => JSON.parse(JSON.stringify(workspaces)),
            reloadWorkspaces: () => { workspaces=myntNormalizeWorkspaces(readJSON(KEYS.workspaces, null),workspaceDefaults); workspaceBaseline=localStorage.getItem(KEYS.workspaces); renderWorkspace(); },
            reloadAccessibility: () => { const saved=JSON.parse(localStorage.getItem(KEYS.accessibility)); if(!saved || typeof saved!=='object')throw Error('Invalid accessibility'); accessibility={...saved};applyAccessibility(false); },
            refreshServiceAlert: updateServiceAlert
        };
        window.MyntStorageSync?.watch([KEYS.workspaces, KEYS.workspace], () => {
            window.myntDashboard.reloadWorkspaces();
        });
        localizeStaticUI();
        saveWorkspaces();
        applyAccessibility();
        renderWorkspace();
        renderServiceStatus();
        renderPermissions();
    })();
}

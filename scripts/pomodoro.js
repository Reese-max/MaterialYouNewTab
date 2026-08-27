/*
 * Material You NewTab
 * Copyright (c) 2023-2025 XengShi
 * Licensed under the GNU General Public License v3.0 (GPL-3.0)
 * You should have received a copy of the GNU General Public License along with this program.
 * If not, see <https://www.gnu.org/licenses/>.
 */

// ----------------------------------- Pomodoro Timer ----------------------------------------

document.addEventListener("DOMContentLoaded", function () {
    // --- DOM Elements ---
    const pomodoroCheckbox = document.getElementById("pomodoroCheckbox");
    const pomodoroCont = document.getElementById("pomodoroCont");
    const pomodoroIcon = document.getElementById("pomodoroIcon");
    const pomodoroPanel = document.getElementById("pomodoroPanel");
    const pomodoroBgVideo = document.querySelector(".pomodoro-bg-video");
    const pomodoroPhaseLabel = document.getElementById("pomodoroPhaseLabel");
    const pomodoroTimeDisplay = document.getElementById("pomodoroTimeDisplay");
    const pomodoroRingFg = document.getElementById("pomodoroRingFg");
    const pomodoroRoundDisplay = document.getElementById("pomodoroRoundDisplay");
    const pomodoroStartBtn = document.getElementById("pomodoroStartBtn");
    const pomodoroPauseBtn = document.getElementById("pomodoroPauseBtn");
    const pomodoroResetBtn = document.getElementById("pomodoroResetBtn");
    const pomodoroSessionsCount = document.getElementById("pomodoroSessionsCount");
    const pomodoroFocusTask = document.getElementById("pomodoroFocusTask");
    const pomodoroFocusTaskName = document.getElementById("pomodoroFocusTaskName");
    const pomodoroAutoStartCheckbox = document.getElementById("pomodoroAutoStartCheckbox");
    const pomodoroSoundCheckbox = document.getElementById("pomodoroSoundCheckbox");
    const pomodoroNotifCheckbox = document.getElementById("pomodoroNotifCheckbox");
    const pomodoroWorkInput = document.getElementById("pomodoroWorkInput");
    const pomodoroShortBreakInput = document.getElementById("pomodoroShortBreakInput");
    const pomodoroLongBreakInput = document.getElementById("pomodoroLongBreakInput");
    const pomodoroRoundsInput = document.getElementById("pomodoroRoundsInput");
    const pomodoroDragHandle = document.getElementById("pomodoroDragHandle");
    const PANEL_POS_KEY = "pomodoroPanelPosition";
    const pomodoroClockHour = document.getElementById("pomodoroClockHour");
    const pomodoroClockMinute = document.getElementById("pomodoroClockMinute");
    const pomodoroClockSecond = document.getElementById("pomodoroClockSecond");
    const pomodoroIconSizeInput = document.getElementById("pomodoroIconSizeInput");
    const pomodoroPanelScaleInput = document.getElementById("pomodoroPanelScaleInput");
    const pomodoroAmbientToggleBtn = document.getElementById("pomodoroAmbientToggleBtn");
    const pomodoroAmbientSelect = document.getElementById("pomodoroAmbientSelect");
    const pomodoroAmbientVol = document.getElementById("pomodoroAmbientVol");
    const pomodoroAmbientAutoCheckbox = document.getElementById("pomodoroAmbientAutoCheckbox");

    // --- Settings rows ---
    const settingsRows = [
        document.getElementById("pomodoroWorkRow"),
        document.getElementById("pomodoroShortBreakRow"),
        document.getElementById("pomodoroLongBreakRow"),
        document.getElementById("pomodoroRoundsRow"),
        document.getElementById("pomodoroIconSizeRow"),
        document.getElementById("pomodoroPanelScaleRow"),
        document.getElementById("pomodoroResetPosRow"),
        document.getElementById("pomodoroAutoStartRow"),
        document.getElementById("pomodoroSoundRow"),
        document.getElementById("pomodoroNotifRow"),
        document.getElementById("pomodoroAmbientAutoRow"),
    ];

    // --- Constants ---
    const RING_CIRCUMFERENCE = 2 * Math.PI * 70; // ~439.82
    const TICK_INTERVAL = 250; // ms

    const DEFAULTS = {
        workMinutes: 25,
        shortBreakMinutes: 5,
        longBreakMinutes: 15,
        roundsBeforeLong: 4,
    };

    // --- localStorage keys ---
    const KEYS = {
        checkbox: "pomodoroCheckboxState",
        display: "pomodoroDisplayStatus",
        work: "pomodoroWorkMinutes",
        shortBreak: "pomodoroShortBreakMinutes",
        longBreak: "pomodoroLongBreakMinutes",
        rounds: "pomodoroRoundsBeforeLong",
        autoStart: "pomodoroAutoStart",
        sound: "pomodoroSoundEnabled",
        notif: "pomodoroNotifEnabled",
        ambientAuto: "pomodoroAmbientAuto",
        state: "pomodoroState",
        sessionsToday: "pomodoroSessionsToday",
        sessionsDate: "pomodoroSessionsDate",
        focusTask: "myntFocusTask",
        iconSize: "pomodoroIconSize",
        panelScale: "pomodoroPanelScale",
    };

    function getPomodoroText(key, fallback) {
        return translations[currentLanguage]?.[key] || translations["en"]?.[key] || fallback;
    }

    // --- State ---
    let pomodoroState = {
        phase: "work", // "work" | "shortBreak" | "longBreak"
        timeRemaining: DEFAULTS.workMinutes * 60,
        totalTime: DEFAULTS.workMinutes * 60,
        currentRound: 1,
        isRunning: false,
        lastTick: null,
        task: null,
    };
    let timerInterval = null;

    // --- Helpers ---
    function getPomodoroSetting(key, defaultVal) {
        const val = localStorage.getItem(key);
        if (val === null) return defaultVal;
        const num = parseInt(val, 10);
        return isNaN(num) ? defaultVal : num;
    }

    function getPomodoroBool(key, defaultVal) {
        const val = localStorage.getItem(key);
        if (val === null) return defaultVal;
        return val === "true";
    }

    function getWorkMinutes() {
        return getPomodoroSetting(KEYS.work, DEFAULTS.workMinutes);
    }
    function getShortBreakMinutes() {
        return getPomodoroSetting(KEYS.shortBreak, DEFAULTS.shortBreakMinutes);
    }
    function getLongBreakMinutes() {
        return getPomodoroSetting(KEYS.longBreak, DEFAULTS.longBreakMinutes);
    }
    function getRoundsBeforeLong() {
        return getPomodoroSetting(KEYS.rounds, DEFAULTS.roundsBeforeLong);
    }

    // --- State persistence ---
    function savePomodoroState() {
        localStorage.setItem(KEYS.state, JSON.stringify(pomodoroState));
    }

    function loadPomodoroState() {
        const raw = localStorage.getItem(KEYS.state);
        if (!raw) return false;
        try {
            const saved = JSON.parse(raw);
            pomodoroState.phase = saved.phase || "work";
            pomodoroState.timeRemaining = saved.timeRemaining ?? DEFAULTS.workMinutes * 60;
            pomodoroState.totalTime = saved.totalTime ?? DEFAULTS.workMinutes * 60;
            pomodoroState.currentRound = saved.currentRound ?? 1;
            pomodoroState.isRunning = saved.isRunning ?? false;
            pomodoroState.lastTick = saved.lastTick ?? null;
            pomodoroState.task = saved.task?.id && saved.task?.title
                ? { id: String(saved.task.id), title: String(saved.task.title).slice(0, 120) }
                : null;
            return true;
        } catch {
            return false;
        }
    }

    // --- Sessions today ---
    function getTodayStr() {
        return new Date().toDateString();
    }

    function getSessionsToday() {
        const savedDate = localStorage.getItem(KEYS.sessionsDate);
        if (savedDate !== getTodayStr()) {
            localStorage.setItem(KEYS.sessionsToday, "0");
            localStorage.setItem(KEYS.sessionsDate, getTodayStr());
            return 0;
        }
        return getPomodoroSetting(KEYS.sessionsToday, 0);
    }

    function incrementSessionsToday() {
        const count = getSessionsToday() + 1;
        localStorage.setItem(KEYS.sessionsToday, String(count));
        localStorage.setItem(KEYS.sessionsDate, getTodayStr());
        pomodoroSessionsCount.textContent = count;
        document.dispatchEvent(new CustomEvent("mynt:pomodoro-complete", {
            detail: { minutes: getWorkMinutes(), sessionsToday: count, task: pomodoroState.task }
        }));
    }

    // --- UI update ---
    function updatePomodoroUI() {
        // Time display
        const mins = Math.floor(pomodoroState.timeRemaining / 60);
        const secs = pomodoroState.timeRemaining % 60;
        pomodoroTimeDisplay.textContent =
            String(mins).padStart(2, "0") + ":" + String(secs).padStart(2, "0");

        // Progress ring
        const progress = pomodoroState.totalTime > 0
            ? pomodoroState.timeRemaining / pomodoroState.totalTime
            : 0;
        const offset = RING_CIRCUMFERENCE * (1 - progress);
        pomodoroRingFg.style.strokeDasharray = RING_CIRCUMFERENCE;
        pomodoroRingFg.style.strokeDashoffset = offset;

        // Phase label
        if (pomodoroState.phase === "work") {
            pomodoroPhaseLabel.textContent = getPomodoroText("pomodoroWork", "Work");
            pomodoroPhaseLabel.classList.remove("break-phase");
            pomodoroRingFg.classList.remove("break-ring");
        } else if (pomodoroState.phase === "shortBreak") {
            pomodoroPhaseLabel.textContent = getPomodoroText("pomodoroShortBreak", "Short Break");
            pomodoroPhaseLabel.classList.add("break-phase");
            pomodoroRingFg.classList.add("break-ring");
        } else {
            pomodoroPhaseLabel.textContent = getPomodoroText("pomodoroLongBreak", "Long Break");
            pomodoroPhaseLabel.classList.add("break-phase");
            pomodoroRingFg.classList.add("break-ring");
        }

        // Round display
        pomodoroRoundDisplay.textContent =
            pomodoroState.currentRound + " / " + getRoundsBeforeLong();

        // Buttons
        if (pomodoroState.isRunning) {
            pomodoroStartBtn.style.display = "none";
            pomodoroPauseBtn.style.display = "";
        } else {
            pomodoroStartBtn.style.display = "";
            pomodoroPauseBtn.style.display = "none";
        }

        // Sessions today
        pomodoroSessionsCount.textContent = getSessionsToday();
    }

    // --- Timer controls ---
    function startPomodoro() {
        if (pomodoroState.isRunning) return;
        if (pomodoroState.phase === "work") {
            const task = getSelectedFocusTask();
            if (!task) {
                document.dispatchEvent(new CustomEvent("mynt:focus-task-required"));
                return;
            }
            pomodoroState.task = task;
            updatePomodoroFocusTask();
        }
        pomodoroState.isRunning = true;
        pomodoroRingFg.classList.add("running");
        pomodoroState.lastTick = Date.now();
        savePomodoroState();
        updatePomodoroUI();

        timerInterval = setInterval(function () {
            const now = Date.now();
            const elapsed = Math.floor((now - pomodoroState.lastTick) / 1000);
            if (elapsed < 1) return;

            pomodoroState.lastTick = now;
            pomodoroState.timeRemaining -= elapsed;

            if (pomodoroState.timeRemaining <= 0) {
                pomodoroState.timeRemaining = 0;
                onPhaseComplete();
            }

            savePomodoroState();
            updatePomodoroUI();
        }, TICK_INTERVAL);
    }

    function pausePomodoro() {
        if (globalThis.myntAmbientAudio && globalThis.myntAmbientAudio.isPlaying()) {
            globalThis.myntAmbientAudio.stop();
        }
        pomodoroState.isRunning = false;
        pomodoroRingFg.classList.remove("running");
        pomodoroState.lastTick = null;
        clearInterval(timerInterval);
        timerInterval = null;
        savePomodoroState();
        updatePomodoroUI();
    }

    function resetPomodoro() {
        if (globalThis.myntAmbientAudio && globalThis.myntAmbientAudio.isPlaying()) {
            globalThis.myntAmbientAudio.stop();
        }
        clearInterval(timerInterval);
        timerInterval = null;
        const workSec = getWorkMinutes() * 60;
        pomodoroState = {
            phase: "work",
            timeRemaining: workSec,
            totalTime: workSec,
            currentRound: 1,
            isRunning: false,
            lastTick: null,
            task: null,
        };
        pomodoroRingFg.classList.remove("running");
        savePomodoroState();
        updatePomodoroUI();
    }

    // --- Phase completion ---
    function onPhaseComplete() {
        if (globalThis.myntAmbientAudio && globalThis.myntAmbientAudio.isPlaying()) {
            globalThis.myntAmbientAudio.stop();
        }
        clearInterval(timerInterval);
        timerInterval = null;
        pomodoroState.isRunning = false;
        pomodoroRingFg.classList.remove("running");
        pomodoroState.lastTick = null;

        const autoStart = getPomodoroBool(KEYS.autoStart, false);

        if (pomodoroState.phase === "work") {
            // Completed a work session
            incrementSessionsToday();

            if (pomodoroState.currentRound >= getRoundsBeforeLong()) {
                // Switch to long break
                const longSec = getLongBreakMinutes() * 60;
                pomodoroState.phase = "longBreak";
                pomodoroState.timeRemaining = longSec;
                pomodoroState.totalTime = longSec;
            } else {
                // Switch to short break
                const shortSec = getShortBreakMinutes() * 60;
                pomodoroState.phase = "shortBreak";
                pomodoroState.timeRemaining = shortSec;
                pomodoroState.totalTime = shortSec;
            }
        } else {
            // Break completed, switch to work
            if (pomodoroState.phase === "longBreak") {
                pomodoroState.currentRound = 1;
            } else {
                pomodoroState.currentRound += 1;
            }
            const workSec = getWorkMinutes() * 60;
            pomodoroState.phase = "work";
            pomodoroState.timeRemaining = workSec;
            pomodoroState.totalTime = workSec;
        }

        // Sound
        if (getPomodoroBool(KEYS.sound, true)) {
            playPomodoroSound();
        }

        // Notification
        if (getPomodoroBool(KEYS.notif, true)) {
            sendPomodoroNotification();
        }

        savePomodoroState();
        updatePomodoroUI();

        // Auto start
        if (autoStart) {
            startPomodoro();
        }
    }

    // --- Sound (Web Audio API) ---
    function playPomodoroSound() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const notes = [523.25, 622.25, 739.99]; // C5, D#5, F#5
            notes.forEach(function (freq, i) {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = "sine";
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.2);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.2 + 0.3);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(ctx.currentTime + i * 0.2);
                osc.stop(ctx.currentTime + i * 0.2 + 0.3);
            });
        } catch {
            // Audio not supported
        }
    }

    // --- Notification ---
    function sendPomodoroNotification() {
        if (!("Notification" in window)) return;
        const title = getPomodoroText("pomodoroNotifTitle", "Pomodoro Timer");
        let phaseText;
        if (pomodoroState.phase === "work") {
            phaseText = getPomodoroText("pomodoroWork", "Work");
        } else if (pomodoroState.phase === "shortBreak") {
            phaseText = getPomodoroText("pomodoroShortBreak", "Short Break");
        } else {
            phaseText = getPomodoroText("pomodoroLongBreak", "Long Break");
        }
        const bodyTemplate = getPomodoroText("pomodoroNotifBody", "Time for: {phase}");
        const body = bodyTemplate.replace("{phase}", phaseText);

        if (Notification.permission === "granted") {
            new Notification(title, { body: body });
        } else if (Notification.permission !== "denied") {
            Notification.requestPermission().then(function (perm) {
                if (perm === "granted") {
                    new Notification(title, { body: body });
                }
            });
        }
    }

    // --- Focus task (integration with ToDo list) ---
    function getSelectedFocusTask() {
        try {
            const selected = JSON.parse(localStorage.getItem(KEYS.focusTask) || "null");
            const todos = JSON.parse(localStorage.getItem("todoList") || "{}");
            const todo = selected?.id ? todos[selected.id] : null;
            if (!todo || todo.status === "completed" || !String(todo.title || "").trim()) return null;
            return { id: String(selected.id), title: String(todo.title).trim().slice(0, 120) };
        } catch {
            return null;
        }
    }

    function updatePomodoroFocusTask() {
        const task = getSelectedFocusTask() || (pomodoroState.isRunning ? pomodoroState.task : null);
        if (!task) {
            pomodoroFocusTask.style.display = "none";
            return;
        }
        pomodoroFocusTaskName.textContent = task.title;
        pomodoroFocusTask.style.display = "";
    }

    // --- Panel drag functionality ---
    let pomoDragging = false;
    let pomoDragOffsetX = 0;
    let pomoDragOffsetY = 0;
    let pomoDragJustEnded = false;

    function clampPanelPosition(top, left) {
        const maxTop = window.innerHeight - pomodoroPanel.offsetHeight;
        const maxLeft = window.innerWidth - pomodoroPanel.offsetWidth;
        return {
            top: Math.max(0, Math.min(top, maxTop)),
            left: Math.max(0, Math.min(left, maxLeft))
        };
    }

    function savePanelPosition() {
        const rect = pomodoroPanel.getBoundingClientRect();
        localStorage.setItem(PANEL_POS_KEY, JSON.stringify({
            top: rect.top,
            left: rect.left
        }));
    }

    function restorePanelPosition() {
        const saved = localStorage.getItem(PANEL_POS_KEY);
        if (saved) {
            try {
                const { top, left } = JSON.parse(saved);
                const pos = clampPanelPosition(top, left);
                pomodoroPanel.style.top = pos.top + "px";
                pomodoroPanel.style.left = pos.left + "px";
                pomodoroPanel.classList.add("pomodoro-dragged");
                return true;
            } catch {
                localStorage.removeItem(PANEL_POS_KEY);
            }
        }
        return false;
    }

    pomodoroDragHandle.addEventListener("pointerdown", function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        pomoDragging = true;

        const rect = pomodoroPanel.getBoundingClientRect();
        pomodoroPanel.style.top = rect.top + "px";
        pomodoroPanel.style.left = rect.left + "px";
        pomodoroPanel.classList.add("pomodoro-dragged");

        pomoDragOffsetX = e.clientX - rect.left;
        pomoDragOffsetY = e.clientY - rect.top;
    });

    document.addEventListener("pointermove", function (e) {
        if (pomoDragging) {
            const pos = clampPanelPosition(
                e.clientY - pomoDragOffsetY,
                e.clientX - pomoDragOffsetX
            );
            pomodoroPanel.style.top = pos.top + "px";
            pomodoroPanel.style.left = pos.left + "px";
        }

        // Proximity detection for drag handle visibility
        if (panelOpen) {
            const rect = pomodoroPanel.getBoundingClientRect();
            const margin = 40;
            const near = e.clientX >= rect.left - margin &&
                         e.clientX <= rect.right + margin &&
                         e.clientY >= rect.top - margin &&
                         e.clientY <= rect.bottom + margin;
            pomodoroDragHandle.classList.toggle("pomodoro-drag-near", near);
        }
    });

    function finishPanelDrag() {
        if (pomoDragging) {
            pomoDragging = false;
            savePanelPosition();
            pomoDragJustEnded = true;
            setTimeout(function () { pomoDragJustEnded = false; }, 0);
        }
    }

    document.addEventListener("pointerup", finishPanelDrag);
    document.addEventListener("pointercancel", finishPanelDrag);

    window.addEventListener("resize", function () {
        if (panelOpen && localStorage.getItem(PANEL_POS_KEY)) {
            const rect = pomodoroPanel.getBoundingClientRect();
            const pos = clampPanelPosition(rect.top, rect.left);
            pomodoroPanel.style.top = pos.top + "px";
            pomodoroPanel.style.left = pos.left + "px";
        }
    });

    // --- Icon drag functionality ---
    const ICON_POS_KEY = "pomodoroIconPosition";
    const ICON_DRAG_THRESHOLD = 5;
    let iconDragging = false;
    let iconDragStarted = false;
    let iconDragOffsetX = 0;
    let iconDragOffsetY = 0;
    let iconDragStartX = 0;
    let iconDragStartY = 0;

    function clampIconPosition(top, left) {
        const maxTop = window.innerHeight - pomodoroCont.offsetHeight;
        const maxLeft = window.innerWidth - pomodoroCont.offsetWidth;
        return {
            top: Math.max(0, Math.min(top, maxTop)),
            left: Math.max(0, Math.min(left, maxLeft))
        };
    }

    function saveIconPosition() {
        const rect = pomodoroCont.getBoundingClientRect();
        localStorage.setItem(ICON_POS_KEY, JSON.stringify({
            top: rect.top,
            left: rect.left
        }));
    }

    function restoreIconPosition() {
        const saved = localStorage.getItem(ICON_POS_KEY);
        if (saved) {
            try {
                const { top, left } = JSON.parse(saved);
                const pos = clampIconPosition(top, left);
                pomodoroCont.style.top = pos.top + "px";
                pomodoroCont.style.left = pos.left + "px";
                pomodoroCont.classList.add("pomodoro-icon-dragged");
                return true;
            } catch {
                localStorage.removeItem(ICON_POS_KEY);
            }
        }
        return false;
    }

    pomodoroCont.addEventListener("pointerdown", function (e) {
        if (e.button !== 0) return;
        iconDragging = true;
        iconDragStarted = false;

        const rect = pomodoroCont.getBoundingClientRect();
        iconDragOffsetX = e.clientX - rect.left;
        iconDragOffsetY = e.clientY - rect.top;
        iconDragStartX = e.clientX;
        iconDragStartY = e.clientY;
    });

    document.addEventListener("pointermove", function (e) {
        if (!iconDragging) return;

        const dx = e.clientX - iconDragStartX;
        const dy = e.clientY - iconDragStartY;

        if (!iconDragStarted) {
            if (Math.abs(dx) < ICON_DRAG_THRESHOLD && Math.abs(dy) < ICON_DRAG_THRESHOLD) return;
            iconDragStarted = true;

            const rect = pomodoroCont.getBoundingClientRect();
            pomodoroCont.style.top = rect.top + "px";
            pomodoroCont.style.left = rect.left + "px";
            pomodoroCont.classList.add("pomodoro-icon-dragged");
        }

        const pos = clampIconPosition(
            e.clientY - iconDragOffsetY,
            e.clientX - iconDragOffsetX
        );
        pomodoroCont.style.top = pos.top + "px";
        pomodoroCont.style.left = pos.left + "px";
    });

    let iconDragJustEnded = false;

    function finishIconDrag() {
        if (iconDragging) {
            iconDragging = false;
            if (iconDragStarted) {
                saveIconPosition();
                iconDragStarted = false;
                iconDragJustEnded = true;
                setTimeout(function () { iconDragJustEnded = false; }, 0);
            }
        }
    }

    document.addEventListener("pointerup", finishIconDrag);
    document.addEventListener("pointercancel", finishIconDrag);

    window.addEventListener("resize", function () {
        if (localStorage.getItem(ICON_POS_KEY)) {
            const rect = pomodoroCont.getBoundingClientRect();
            const pos = clampIconPosition(rect.top, rect.left);
            pomodoroCont.style.top = pos.top + "px";
            pomodoroCont.style.left = pos.left + "px";
        }
    });

    // --- Panel toggle ---
    let panelOpen = false;

    function openPanel() {
        pomodoroPanel.style.display = "block";
        pomodoroCont.setAttribute("aria-expanded", "true");
        if (!document.documentElement.classList.contains("myntReducedMotion")) {
            pomodoroBgVideo.play().catch(function () {});
        }
        const hasPosition = restorePanelPosition();
        if (!hasPosition) {
            pomodoroPanel.style.animation = "none";
            void pomodoroPanel.offsetHeight; // force reflow
            pomodoroPanel.style.animation = "";
        }
        panelOpen = true;
        updatePomodoroFocusTask();
    }

    function getCurrentPanelScale() {
        return getPomodoroSetting(KEYS.panelScale, 100) / 100;
    }

    function closePanel() {
        var s = getCurrentPanelScale();
        pomodoroCont.setAttribute("aria-expanded", "false");
        pomodoroBgVideo.pause();
        pomodoroPanel.style.opacity = "0";
        pomodoroPanel.style.transform = "scale(" + (s * 0.9) + ") translateY(-6px)";
        pomodoroPanel.style.transition = "opacity 0.15s ease, transform 0.15s ease";
        setTimeout(function () {
            pomodoroPanel.style.display = "none";
            pomodoroPanel.style.opacity = "";
            pomodoroPanel.style.transition = "";
            applyPanelScale(getPomodoroSetting(KEYS.panelScale, 100));
        }, 150);
        panelOpen = false;
    }

    pomodoroCont.addEventListener("click", function (e) {
        e.stopPropagation();
        if (iconDragJustEnded) return;
        if (panelOpen) {
            closePanel();
        } else {
            openPanel();
        }
    });

    document.addEventListener("click", function (e) {
        if (pomoDragJustEnded) return;
        if (panelOpen && !pomodoroPanel.contains(e.target) && !pomodoroCont.contains(e.target)) {
            closePanel();
        }
    });

    // --- Button events ---
    pomodoroStartBtn.addEventListener("click", function () {
        startPomodoro();
    });

    pomodoroPauseBtn.addEventListener("click", function () {
        pausePomodoro();
    });

    pomodoroResetBtn.addEventListener("click", function () {
        resetPomodoro();
    });

    document.addEventListener("mynt:focus-task-selected", updatePomodoroFocusTask);
    document.addEventListener("mynt:pomodoro-start-task", function (event) {
        const id = String(event.detail?.id || "").trim();
        const title = String(event.detail?.title || "").trim().slice(0, 120);
        if (!id || !title) {
            document.dispatchEvent(new CustomEvent("mynt:focus-task-required"));
            return;
        }
        localStorage.setItem(KEYS.focusTask, JSON.stringify({ id, title }));
        updatePomodoroFocusTask();
        setTimeout(function () {
            if (!pomodoroCheckbox.checked) pomodoroCheckbox.click();
            if (!panelOpen) openPanel();
            startPomodoro();
        }, 0);
    });

    // --- Visibility change (compensate offline time) ---
    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible" && pomodoroState.isRunning && pomodoroState.lastTick) {
            const now = Date.now();
            const elapsed = Math.floor((now - pomodoroState.lastTick) / 1000);
            if (elapsed > 0) {
                pomodoroState.lastTick = now;
                pomodoroState.timeRemaining -= elapsed;

                // Process multiple phase completions if away for a long time
                while (pomodoroState.timeRemaining <= 0 && pomodoroState.isRunning) {
                    pomodoroState.timeRemaining = 0;
                    onPhaseComplete();
                    // After onPhaseComplete, if autoStart is off, isRunning becomes false
                    // If autoStart is on, we need to subtract remaining overflow from next phase
                }

                savePomodoroState();
                updatePomodoroUI();
            }
        }
    });

    // --- Main toggle (checkbox) ---
    function showPomodoroSettings() {
        settingsRows.forEach(function (row) {
            if (row) row.classList.remove("pomodoroSettingsHidden");
        });
    }

    function hidePomodoroSettings() {
        settingsRows.forEach(function (row) {
            if (row) row.classList.add("pomodoroSettingsHidden");
        });
    }

    pomodoroCheckbox.addEventListener("change", function () {
        if (pomodoroCheckbox.checked) {
            pomodoroCont.style.display = "flex";
            localStorage.setItem(KEYS.checkbox, "checked");
            localStorage.setItem(KEYS.display, "flex");
            showPomodoroSettings();
            startClock();
        } else {
            pomodoroCont.style.display = "none";
            closePanel();
            if (pomodoroState.isRunning) pausePomodoro();
            localStorage.setItem(KEYS.checkbox, "unchecked");
            localStorage.setItem(KEYS.display, "none");
            hidePomodoroSettings();
            stopClock();
        }
    });

    // --- Number input +/- buttons and direct input ---
    const SETTING_MAP = {
        pomodoroWorkInput: { key: KEYS.work, min: 1, max: 120 },
        pomodoroShortBreakInput: { key: KEYS.shortBreak, min: 1, max: 60 },
        pomodoroLongBreakInput: { key: KEYS.longBreak, min: 1, max: 60 },
        pomodoroRoundsInput: { key: KEYS.rounds, min: 1, max: 12 },
        pomodoroIconSizeInput: { key: KEYS.iconSize, min: 20, max: 72 },
        pomodoroPanelScaleInput: { key: KEYS.panelScale, min: 50, max: 150 },
    };

    function applyIconSize(size) {
        pomodoroIcon.setAttribute("width", size);
        pomodoroIcon.setAttribute("height", size);
    }

    function applyPanelScale(pct) {
        pomodoroPanel.style.transform = pct === 100 ? "" : "scale(" + (pct / 100) + ")";
    }

    function applySettingValue(targetId, val) {
        const cfg = SETTING_MAP[targetId];
        if (!cfg) return;
        val = Math.max(cfg.min, Math.min(cfg.max, val));
        document.getElementById(targetId).value = val;
        localStorage.setItem(cfg.key, String(val));

        // Icon size
        if (targetId === "pomodoroIconSizeInput") {
            applyIconSize(val);
            return;
        }

        // Panel scale
        if (targetId === "pomodoroPanelScaleInput") {
            applyPanelScale(val);
            return;
        }

        // If timer is not running, update time display
        if (!pomodoroState.isRunning && pomodoroState.timeRemaining === pomodoroState.totalTime) {
            if (pomodoroState.phase === "work" && targetId === "pomodoroWorkInput") {
                pomodoroState.timeRemaining = val * 60;
                pomodoroState.totalTime = val * 60;
            } else if (pomodoroState.phase === "shortBreak" && targetId === "pomodoroShortBreakInput") {
                pomodoroState.timeRemaining = val * 60;
                pomodoroState.totalTime = val * 60;
            } else if (pomodoroState.phase === "longBreak" && targetId === "pomodoroLongBreakInput") {
                pomodoroState.timeRemaining = val * 60;
                pomodoroState.totalTime = val * 60;
            }
            savePomodoroState();
            updatePomodoroUI();
        }
    }

    // +/- buttons
    document.querySelectorAll(".pomodoroNumBtn").forEach(function (btn) {
        btn.addEventListener("click", function () {
            const targetId = btn.getAttribute("data-target");
            const dir = parseInt(btn.getAttribute("data-dir"), 10);
            const targetEl = document.getElementById(targetId);
            if (!targetEl) return;
            const current = parseInt(targetEl.value, 10) || 0;
            applySettingValue(targetId, current + dir);
        });
    });

    // Direct input
    Object.keys(SETTING_MAP).forEach(function (inputId) {
        const el = document.getElementById(inputId);
        if (!el) return;
        el.addEventListener("change", function () {
            const val = parseInt(el.value, 10);
            if (isNaN(val)) {
                el.value = getPomodoroSetting(SETTING_MAP[inputId].key,
                    inputId === "pomodoroWorkInput" ? DEFAULTS.workMinutes :
                    inputId === "pomodoroShortBreakInput" ? DEFAULTS.shortBreakMinutes :
                    inputId === "pomodoroLongBreakInput" ? DEFAULTS.longBreakMinutes :
                    DEFAULTS.roundsBeforeLong);
                return;
            }
            applySettingValue(inputId, val);
        });
    });

    // --- Reset position button ---
    document.getElementById("pomodoroResetPosBtn").addEventListener("click", function () {
        localStorage.removeItem(ICON_POS_KEY);
        localStorage.removeItem(PANEL_POS_KEY);
        pomodoroCont.classList.remove("pomodoro-icon-dragged");
        pomodoroCont.style.top = "";
        pomodoroCont.style.left = "";
        pomodoroPanel.classList.remove("pomodoro-dragged");
        pomodoroPanel.style.top = "";
        pomodoroPanel.style.left = "";
    });

    // --- Sub-toggles ---
    pomodoroAutoStartCheckbox.addEventListener("change", function () {
        localStorage.setItem(KEYS.autoStart, String(pomodoroAutoStartCheckbox.checked));
    });

    pomodoroSoundCheckbox.addEventListener("change", function () {
        localStorage.setItem(KEYS.sound, String(pomodoroSoundCheckbox.checked));
    });

    pomodoroNotifCheckbox.addEventListener("change", function () {
        localStorage.setItem(KEYS.notif, String(pomodoroNotifCheckbox.checked));
        if (pomodoroNotifCheckbox.checked && "Notification" in window && Notification.permission === "default") {
            Notification.requestPermission();
        }
    });

    // --- Real-time clock icon ---
    let clockInterval = null;

    function updateClockHands() {
        const now = new Date();
        const h = now.getHours() % 12, m = now.getMinutes(), s = now.getSeconds();
        pomodoroClockHour.style.transform = "rotate(" + (h * 30 + m * 0.5) + "deg)";
        pomodoroClockMinute.style.transform = "rotate(" + (m * 6 + s * 0.1) + "deg)";
        pomodoroClockSecond.style.transform = "rotate(" + (s * 6) + "deg)";
    }

    function startClock() {
        updateClockHands();
        clockInterval = setInterval(updateClockHands, 1000);
    }

    function stopClock() {
        if (clockInterval) {
            clearInterval(clockInterval);
            clockInterval = null;
        }
    }

    // --- Initialization ---
    function initPomodoro() {
        // Restore main toggle
        const savedCheckbox = localStorage.getItem(KEYS.checkbox);
        if (savedCheckbox === "checked") {
            pomodoroCheckbox.checked = true;
            pomodoroCont.style.display = "flex";
            showPomodoroSettings();
        } else {
            pomodoroCheckbox.checked = false;
            pomodoroCont.style.display = "none";
            hidePomodoroSettings();
        }

        // Restore icon position
        restoreIconPosition();

        // Restore settings inputs
        pomodoroWorkInput.value = getWorkMinutes();
        pomodoroShortBreakInput.value = getShortBreakMinutes();
        pomodoroLongBreakInput.value = getLongBreakMinutes();
        pomodoroRoundsInput.value = getRoundsBeforeLong();

        // Restore icon size
        const savedIconSize = getPomodoroSetting(KEYS.iconSize, 36);
        pomodoroIconSizeInput.value = savedIconSize;
        applyIconSize(savedIconSize);

        // Restore panel scale
        const savedPanelScale = getPomodoroSetting(KEYS.panelScale, 100);
        pomodoroPanelScaleInput.value = savedPanelScale;
        applyPanelScale(savedPanelScale);

        // Restore sub-toggles
        pomodoroAutoStartCheckbox.checked = getPomodoroBool(KEYS.autoStart, false);
        pomodoroSoundCheckbox.checked = getPomodoroBool(KEYS.sound, true);
        pomodoroNotifCheckbox.checked = getPomodoroBool(KEYS.notif, true);

        // Restore timer state
        const hasState = loadPomodoroState();
        if (hasState && pomodoroState.isRunning && pomodoroState.lastTick) {
            // Compensate for time elapsed while page was closed
            const now = Date.now();
            const elapsed = Math.floor((now - pomodoroState.lastTick) / 1000);
            pomodoroState.timeRemaining -= elapsed;
            pomodoroState.lastTick = now;

            if (pomodoroState.timeRemaining <= 0) {
                pomodoroState.timeRemaining = 0;
                pomodoroState.isRunning = false;
                savePomodoroState();
                updatePomodoroUI();
                onPhaseComplete();
            } else {
                savePomodoroState();
                updatePomodoroUI();
                pomodoroState.isRunning = false;
                startPomodoro();
            }
        } else {
            if (!hasState) {
                // Set defaults
                const workSec = getWorkMinutes() * 60;
                pomodoroState.timeRemaining = workSec;
                pomodoroState.totalTime = workSec;
            }
            updatePomodoroUI();
        }

        // Start clock if pomodoro is enabled
        if (pomodoroCheckbox.checked) {
            startClock();
        }
    }

    if (pomodoroAmbientAutoCheckbox) {
            pomodoroAmbientAutoCheckbox.checked = getPomodoroBool(KEYS.ambientAuto, true);
            pomodoroAmbientAutoCheckbox.addEventListener("change", function () {
                localStorage.setItem(KEYS.ambientAuto, String(pomodoroAmbientAutoCheckbox.checked));
            });
        }
        if (pomodoroAmbientSelect) {
            pomodoroAmbientSelect.value = localStorage.getItem("myntAmbientType") || "rain";
            pomodoroAmbientSelect.addEventListener("change", function (e) {
                if (globalThis.myntAmbientAudio) {
                    if (globalThis.myntAmbientAudio.isPlaying()) globalThis.myntAmbientAudio.play(e.target.value);
                    else localStorage.setItem("myntAmbientType", e.target.value);
                }
            });
        }
        if (pomodoroAmbientVol) {
            pomodoroAmbientVol.value = localStorage.getItem("myntAmbientVolume") || "0.5";
            pomodoroAmbientVol.addEventListener("input", function (e) {
                if (globalThis.myntAmbientAudio) {
                    globalThis.myntAmbientAudio.setVolume(e.target.value);
                }
            });
        }
        if (pomodoroAmbientToggleBtn) {
            pomodoroAmbientToggleBtn.addEventListener("click", function () {
                if (globalThis.myntAmbientAudio) {
                    globalThis.myntAmbientAudio.toggle(pomodoroAmbientSelect?.value || "rain");
                }
            });
        }
        document.addEventListener("mynt:ambient-state", function (e) {
            if (pomodoroAmbientToggleBtn) {
                pomodoroAmbientToggleBtn.classList.toggle("active", e.detail?.isPlaying === true);
            }
        });

        initPomodoro();
});

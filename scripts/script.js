/*
 * Material You New Tab
 * Copyright (c) 2024-2026 Prem, 2023-2025 XengShi
 * Licensed under the GNU General Public License v3.0 (GPL-3.0)
 * You should have received a copy of the GNU General Public License along with this program.
 * If not, see <https://www.gnu.org/licenses/>.
 */

// ------------------------------- Waypoint shell -------------------------------
document.addEventListener("DOMContentLoaded", function () {
    const app = document.getElementById("waypointApp");
    if (!app) return;

    const searchSlot = document.getElementById("waypointSearchSlot");
    const shortcutSlot = document.getElementById("waypointShortcutSlot");
    const pomodoroSlot = document.getElementById("waypointPomodoroSlot");
    const searchbar = document.getElementById("searchbar");
    const resultBox = document.getElementById("resultBox");
    const shortcutsSection = document.getElementById("shortcuts-section");
    const pomodoroPanel = document.getElementById("pomodoroPanel");

    searchSlot.append(searchbar, resultBox);
    shortcutSlot.append(shortcutsSection);
    pomodoroSlot.append(pomodoroPanel);

    const bookmarkProxy = document.getElementById("waypointBookmarksButton");
    const bookmarkButton = document.getElementById("bookmarkButton");
    bookmarkProxy.addEventListener("click", function (event) {
        event.stopPropagation();
        bookmarkButton.click();
    });
    new MutationObserver(function () {
        bookmarkProxy.setAttribute("aria-expanded", bookmarkButton.getAttribute("aria-expanded") || "false");
    }).observe(bookmarkButton, { attributes: true, attributeFilter: ["aria-expanded"] });

    const settingsProxy = document.getElementById("waypointSettingsButton");
    const menuButton = document.getElementById("menuButton");
    settingsProxy.addEventListener("click", function (event) {
        event.stopPropagation();
        menuButton.click();
    });

    const timeElement = document.getElementById("waypointTime");
    const dateElement = document.getElementById("waypointDate");
    function updateWaypointClock() {
        const now = new Date();
        const language = localStorage.getItem("selectedLanguage") || "zh_TW";
        const locale = language === "zh_TW" ? "zh-TW" : language.replace("_", "-");
        timeElement.textContent = new Intl.DateTimeFormat(locale, {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        }).format(now);
        dateElement.textContent = language === "zh_TW"
            ? `${now.getMonth() + 1} 月 ${now.getDate()} 日 · ${new Intl.DateTimeFormat("zh-TW", { weekday: "long" }).format(now)}`
            : new Intl.DateTimeFormat(locale, { month: "long", day: "numeric", weekday: "long" }).format(now);
        timeElement.dateTime = now.toISOString();
    }
    updateWaypointClock();
    const waypointClockTimer = setInterval(updateWaypointClock, 30 * 1000);
    document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") updateWaypointClock();
    });
    window.addEventListener("pagehide", function () {
        clearInterval(waypointClockTimer);
    }, { once: true });

    const startButton = document.getElementById("pomodoroStartBtn");
    const pauseButton = document.getElementById("pomodoroPauseBtn");
    const stateLabel = document.getElementById("waypointPomodoroState");
    function syncPomodoroState() {
        const language = localStorage.getItem("selectedLanguage") || "zh_TW";
        const strings = translations[language] || translations.en;
        const running = getComputedStyle(pauseButton).display !== "none";
        stateLabel.textContent = running ? strings.waypointPomodoroRunning : strings.waypointPomodoroReady;
    }
    [startButton, pauseButton].forEach(function (button) {
        button.addEventListener("click", function () {
            queueMicrotask(syncPomodoroState);
        });
        new MutationObserver(syncPomodoroState).observe(button, {
            attributes: true,
            attributeFilter: ["style"],
        });
    });
    setTimeout(syncPomodoroState);

    app.classList.add("is-ready");
}, { once: true });

// ------------------------------------ Tips ------------------------------------
document.addEventListener("DOMContentLoaded", function () {
    // Hide tips that are not relevant to mobile
    if (!isDesktop) {
        //document.querySelectorAll('.hideOnMobile').forEach(el => el.style.display = 'none');
        localStorage.setItem("hideTips", "true");
    }

    // Determine the correct key for adjustZoomInfo based on OS
    const adjustZoomInfo = document.getElementById("adjustZoomInfo");
    let adjustZoomInfoText = translations[currentLanguage]?.adjustZoomInfo || translations["en"].adjustZoomInfo;
    if (isMac) {
        adjustZoomInfoText = adjustZoomInfoText.replace(/Ctrl/g, "⌘");
    }
    adjustZoomInfo.textContent = adjustZoomInfoText;

    // Change browser theme info based on the user's browser
    const changeBrowserThemeInfo = document.getElementById("changeBrowserThemeInfo");
    if (isFirefoxAll) {
        changeBrowserThemeInfo.innerHTML = translations[currentLanguage]?.firefoxThemeInfo || translations["en"].firefoxThemeInfo;
    } else if (isEdge) {
        changeBrowserThemeInfo.innerHTML = translations[currentLanguage]?.edgeThemeInfo || translations["en"].edgeThemeInfo;
    } else if (isBrave) {
        changeBrowserThemeInfo.innerHTML = translations[currentLanguage]?.braveThemeInfo || translations["en"].braveThemeInfo;
    } else {
        changeBrowserThemeInfo.innerHTML = translations[currentLanguage]?.chromeThemeInfo || translations["en"].chromeThemeInfo;
    }

    const firefoxHomepage = document.getElementById("firefoxHomepage");
    const updateFirefoxHomepageInfo = document.getElementById("updateFirefoxHomepageInfo");
    if (isFirefox) {
        firefoxHomepage.style.display = "block";
        updateFirefoxHomepageInfo.innerHTML = translations[currentLanguage]?.updateFirefoxHomepageInfo || translations["en"].updateFirefoxHomepageInfo;
    }

    // Hide tips
    const tips = document.getElementById("tips");
    const dontShowButton = document.getElementById("dontShowTips");

    // Check if the user has previously disabled tips
    if (localStorage.getItem("hideTips") === "true") {
        tips.classList.add("tips-hidden");
    }

    // Hide tips and save preference when button is clicked
    dontShowButton.addEventListener("click", function () {
        tips.classList.add("tips-hidden");
        localStorage.setItem("hideTips", "true"); // Save preference
    });
});


// ------------------------------- Footer Toast -------------------------------
(function () {
    if (isFirefoxAll || !isDesktop) return; // Don't show on Firefox or mobile

    const TOAST_DURATION = 30 * 1000; // 30 seconds
    const STORAGE_KEY = 'chrome-footer-toast-shown';

    const toast = document.getElementById('chromeFooterToast');
    const progressBar = document.getElementById('toastProgressBar');
    const closeBtn = document.getElementById('toastClose');

    if (!toast || !progressBar || !closeBtn || getComputedStyle(toast).display === 'none') return;
    if (document.documentElement.classList.contains('myntReducedMotion')) return;

    let progressAnimation;

    function showToast() {
        // Check if toast has been shown before
        const hasShown = localStorage.getItem(STORAGE_KEY);
        if (hasShown) return;

        // Show toast after brief delay
        setTimeout(() => {
            if (getComputedStyle(toast).display === 'none') return;
            localStorage.setItem(STORAGE_KEY, 'true');
            toast.classList.add('show');
            startProgress();
        }, 1500);
    }

    function hideToast() {
        toast.classList.remove('show');
        progressAnimation?.cancel();
        progressAnimation = null;
    }

    function startProgress() {
        progressBar.style.transformOrigin = getComputedStyle(toast).direction === 'rtl' ? 'right' : 'left';
        progressAnimation = progressBar.animate(
            [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }],
            { duration: TOAST_DURATION, easing: 'linear', fill: 'forwards' }
        );
        progressAnimation.finished.then(hideToast).catch(() => {});
    }

    // Hover pause
    toast.addEventListener('mouseenter', () => {
        progressAnimation?.pause();
    });

    toast.addEventListener('mouseleave', () => {
        progressAnimation?.play();
    });

    closeBtn.addEventListener('click', hideToast);

    showToast();
})();

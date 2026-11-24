/*
 * Material You New Tab
 * Copyright (c) 2024-2026 Prem, 2023-2025 XengShi
 * Licensed under the GNU General Public License v3.0 (GPL-3.0)
 */

const themeStorageKey = "selectedTheme";
const customThemeStorageKey = "customThemeColor";
const darkModeCheckboxKey = "enableDarkModeCheckboxState";
const themeHelpers = window.ThemeHelpers; // scripts/preload.js: palettes, migration, storage validation
const radioButtons = document.querySelectorAll("input.colorPlate[name=color]");
const colorPickerLabel = document.getElementById("rangColor");

// MediaQuery for system theme detection
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');

const syncThemeChange = (MediaQuery) => {
    document.body.setAttribute("sysTheme", MediaQuery.matches ? "systemDark" : "systemLight");
}

// Initialize system theme attribute immediately
syncThemeChange(systemTheme);

// ===== Segmented Control for Dark Mode =====
(function () {
    const preferredThemeKey = "preferredTheme";
    const segment = document.getElementById("themeSegment");
    const indicator = segment.querySelector(".themeIndicator");
    const buttons = segment.querySelectorAll(".themeSegBtn");

    // Move indicator to correct position
    function moveIndicator(theme) {
        const ltrIndex = theme === "light" ? 0 : theme === "dark" ? 1 : 2;
        // If RTL, reverse the index
        const index = isRTL ? 2 - ltrIndex : ltrIndex;
        indicator.style.transform = `translateX(${index * 100}%)`;
    }

    // Apply theme mode (light/dark/system)
    function applyThemeMode(theme) {
        localStorage.setItem(preferredThemeKey, theme);
        segment.dataset.active = theme;
        moveIndicator(theme);

        // Update sysTheme attribute when system mode is selected
        if (theme === "system") {
            syncThemeChange(systemTheme);
        }
        // Surface overrides apply in light mode only; re-evaluate them (no-op before the page has loaded).
        window.myntThemePreferences?.reload();
    }

    document.addEventListener('mynt:mcp-settings-refresh', () => {
        const theme = localStorage.getItem(preferredThemeKey) || 'light';
        segment.dataset.active = theme; moveIndicator(theme); if(theme==='system') syncThemeChange(systemTheme);
        window.myntThemePreferences?.reload();
    });

    // Button click handlers
    buttons.forEach(btn => {
        btn.addEventListener("click", () => {
            applyThemeMode(btn.dataset.theme);
        });
    });

    // System theme change listener
    systemTheme.addEventListener('change', syncThemeChange);
    systemTheme.addEventListener('change', () => window.myntThemePreferences?.reload());

    function initializeThemeMode() {
        const darkModeCheckboxState = localStorage.getItem(darkModeCheckboxKey);
        const savedPreferredTheme = localStorage.getItem(preferredThemeKey);

        let initialTheme;

        if (darkModeCheckboxState === "checked") {
            // Migrate old checkbox users to "dark" mode
            initialTheme = "dark";
            localStorage.removeItem(darkModeCheckboxKey);
            localStorage.setItem(preferredThemeKey, "dark");
        } else if (savedPreferredTheme) {
            initialTheme = savedPreferredTheme; // Use saved preference
        } else {
            initialTheme = "light"; // First time user
        }

        applyThemeMode(initialTheme);
    }

    // Initialize
    initializeThemeMode();
})();

document.addEventListener("DOMContentLoaded", () => {
    // Apply the saved palette or custom colour (preload.js already painted it and migrated retired ids).
    refreshTheme(true);

    // Remove Loading Screen when the DOM and the theme has loaded
    document.getElementById("LoadingScreen").style.display = "none";

    // Clean up preload data attributes
    document.documentElement.removeAttribute("data-preferred-theme");
    document.documentElement.removeAttribute("data-system-dark");

    // Stop blinking of some elements when the page is reloaded
    setTimeout(() => {
        document.documentElement.classList.add("theme-transition");
    }, 25);
});

// Function to load background color
function ApplyLoadingColor(persist = true) {
    let LoadingScreenColor = getComputedStyle(document.body).getPropertyValue("background-color");
    if (persist) localStorage.setItem("LoadingScreenColor", LoadingScreenColor);
}

const resetDarkTheme = () => {
    // The black preset was retired in 2026-11; clear a class left over from it.
    document.documentElement.classList.remove("black-theme");
};

// Dark mode inverts the whole page; surface overrides are light-mode only.
function isDarkMode() {
    const mode = localStorage.getItem("preferredTheme") || "light";
    return mode === "dark" || (mode === "system" && systemTheme.matches);
}

// Function to apply the selected theme (unknown ids fall back to haze)
const applySelectedTheme = (colorValue, persist = true) => {
    resetDarkTheme();
    colorPickerLabel.style.borderColor = "";
    themeHelpers.applyPalette(document.documentElement, colorValue);
    finishThemeApply(persist);
};

const applyCustomTheme = (color, persist = true) => {
    resetDarkTheme();
    themeHelpers.applyCustom(document.documentElement, color);
    colorPickerLabel.style.borderColor = themeHelpers.normalizeHex(color) || "";
    radioButtons.forEach(radio => { radio.checked = false; });
    finishThemeApply(persist);
};

function finishThemeApply(persist) {
    themeHelpers.applySurfaces(document.documentElement, isDarkMode());
    updateAccessibleActionColor();
    changeFaviconColor(persist);
    ApplyLoadingColor(persist);
    renderThemeStatus();
}

// Re-reads storage and applies it without writing anything (local MCP, mode changes). persist=true also
// refreshes the favicon and loading-screen caches.
function refreshTheme(persist = false) {
    const custom = themeHelpers.normalizeHex(localStorage.getItem(customThemeStorageKey));
    const palette = themeHelpers.resolvePalette();
    if (custom) applyCustomTheme(custom, false);
    else applySelectedTheme(palette, false);
    radioButtons.forEach(radio => { radio.checked = !custom && radio.value === palette; });
    if (persist) {
        changeFaviconColor(true);
        ApplyLoadingColor(true);
    }
}

function changeFaviconColor(persist = true) {
    // Fetch colors from CSS variables
    const rootStyles = getComputedStyle(document.documentElement);
    const darkColor = rootStyles.getPropertyValue("--darkColor-blue");
    //const bgColor = rootStyles.getPropertyValue("--bg-color-blue");
    let accentLightTintColor = rootStyles.getPropertyValue("--accentLightTint-blue");
    if (persist) localStorage.setItem("accentLightTintColor", accentLightTintColor);

    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
        <path fill="${darkColor}" style="transform: scale(1.2); transform-origin: center;"
            d="M10 19v-5h4v5c0 .55.45 1 1 1h3c.55 0 1-.45 1-1v-7h1.7c.46 0 .68-.57.33-.87L12.67 3.6c-.38-.34-.96-.34-1.34 0l-8.36 7.53c-.34.3-.13.87.33.87H5v7c0 .55.45 1 1 1h3c.55 0 1-.45 1-1" />
    </svg>
    `;
    const encodedSvg = 'data:image/svg+xml,' + encodeURIComponent(svg);
    const favicon = document.getElementById("favicon");
    favicon.href = encodedSvg;
    favicon.setAttribute('type', 'image/svg+xml');
}

// --------------------- Contrast helpers ---------------------
function parseCssColor(value) {
    const hexMatch = /^#([\da-f]{6})$/iu.exec(value.trim());
    if (hexMatch) {
        return [0, 2, 4].map(offset => parseInt(hexMatch[1].slice(offset, offset + 2), 16));
    }

    const rgbMatch = /^rgba?\(\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)/iu.exec(value.trim());
    return rgbMatch ? rgbMatch.slice(1, 4).map(Number) : null;
}

function relativeLuminance(rgb) {
    const channels = rgb.map(channel => {
        const normalized = channel / 255;
        return normalized <= 0.04045
            ? normalized / 12.92
            : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(first, second) {
    const firstLuminance = relativeLuminance(first);
    const secondLuminance = relativeLuminance(second);
    return (Math.max(firstLuminance, secondLuminance) + 0.05)
        / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

function resolveCssColor(value) {
    const probe = document.createElement("span");
    probe.style.color = value;
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return parseCssColor(resolved);
}

function updateAccessibleActionColor() {
    if (!document.body) return;

    const rootStyles = getComputedStyle(document.documentElement);
    const background = resolveCssColor(rootStyles.getPropertyValue("--darkerColor-blue"));
    if (!background) return;

    const candidates = [
        { value: "var(--textColorDark-blue)", rgb: resolveCssColor("var(--textColorDark-blue)") },
        { value: "#ffffff", rgb: [255, 255, 255] },
        { value: "#000000", rgb: [0, 0, 0] }
    ].filter(candidate => candidate.rgb);
    const best = candidates.reduce((winner, candidate) => (
        contrastRatio(background, candidate.rgb) > contrastRatio(background, winner.rgb)
            ? candidate
            : winner
    ));

    document.documentElement.style.setProperty("--onActionColor-blue", best.value);
}

// --------------------- Name, surfaces and contrast status ---------------------
const themeColorName = document.getElementById("themeColorName");
const themeContrastWarning = document.getElementById("themeContrastWarning");
const themePanel = document.getElementById("themeCustomPanel");
const themePanelTitle = document.getElementById("themeCustomPanelTitle");
const themePanelContrast = document.getElementById("themePanelContrast");
const themeSliders = ["themeHue", "themeSaturation", "themeLightness"].map(id => document.getElementById(id));
const themeHexInput = document.getElementById("themeHexInput");
const themeHexError = document.getElementById("themeHexError");
const themeHexPreview = document.getElementById("themeHexPreview");
const themeRecent = document.getElementById("themeRecent");
const themeRecentColors = document.getElementById("themeRecentColors");
const surfaceLabels = { page: "themeSurfacePage", side: "themeSurfaceSide", card: "themeSurfaceCard", text: "themeSurfaceText" };
let panelTarget = null;
let panelTrigger = null;

function themeText(key, values = {}) {
    const lang = localStorage.getItem("selectedLanguage") || "zh_TW";
    const text = (typeof translations !== "undefined" && (translations[lang]?.[key] || translations.en?.[key])) || key;
    return text.replace(/\{(\w+)\}/g, (match, name) => (name in values ? values[name] : match));
}

const toHex = rgb => "#" + rgb.map(channel => Math.round(channel).toString(16).padStart(2, "0")).join("").toUpperCase();
const tokenHex = token => {
    const rgb = resolveCssColor(`var(${token})`);
    return rgb ? toHex(rgb) : "#000000";
};

// Every text/background pair the page paints with these tokens, plus labels on the accent.
function themeContrastFailures() {
    const text = resolveCssColor("var(--textColorDark-blue)");
    const pairs = Object.entries({ page: "--bg-color-blue", side: "--accentLightTint-blue", card: "--whitishColor-blue" })
        .map(([name, token]) => [themeText("themeSurfaceText"), themeText(surfaceLabels[name]), contrastRatio(text, resolveCssColor(`var(${token})`))]);
    pairs.push([themeText("themeAccentLabels"), themeText("themeAccentName"),
        contrastRatio(resolveCssColor("var(--onActionColor-blue)"), resolveCssColor("var(--darkerColor-blue)"))]);
    return pairs.filter(([, , ratio]) => ratio < 4.5)
        .map(([textName, surface, ratio]) => themeText("themeContrastPair", { text: textName, surface, ratio: (Math.floor(ratio * 10) / 10).toFixed(1) }));
}

function renderThemeStatus() {
    if (!document.body || !themeColorName) return;
    const custom = themeHelpers.normalizeHex(localStorage.getItem(customThemeStorageKey));
    const palette = themeHelpers.resolvePalette();
    themeColorName.textContent = custom
        ? `${themeText("themeCustomColor")} · ${custom}`
        : `${themeText("themeColor" + palette.charAt(0).toUpperCase() + palette.slice(1))} · ${themeHelpers.PALETTES[palette]}`;

    // Dark mode inverts the page and skips surface overrides, so their rows are read-only until light mode returns.
    const surfaces = themeHelpers.readSurfaces(), dark = isDarkMode();
    document.querySelectorAll(".themeSurfaceSwatch").forEach(button => {
        const name = button.dataset.surface, value = surfaces[name] || tokenHex(themeHelpers.SURFACES[name]);
        button.disabled = dark;
        const chip = document.createElement("span"), label = document.createElement("span");
        chip.className = "themeColorChip";
        chip.style.backgroundColor = value;
        label.textContent = value;
        button.replaceChildren(chip, label);
        button.setAttribute("aria-label", themeText(surfaces[name] ? "themeSurfaceCustom" : "themeSurfaceFollowing", { name: themeText(surfaceLabels[name]), value }));
    });
    document.querySelectorAll(".themeSurfaceReset").forEach(button => {
        button.textContent = themeText("themeFollowTheme");
        button.disabled = dark || !surfaces[button.dataset.surface];
    });

    const failures = themeContrastFailures();
    const message = failures.length ? themeText("themeContrastLow", { pairs: failures.join("; ") }) : "";
    for (const element of [themeContrastWarning, themePanelContrast]) {
        element.textContent = message;
        element.hidden = !message;
    }
}

document.addEventListener("mynt:language-changed", () => {
    renderThemeStatus();
    if (panelTarget) themePanelTitle.textContent = panelTitleText(panelTarget);
});

// --------------------- Custom colour panel ---------------------
// Throttle for performance optimization
const throttle = (func, limit) => {
    let lastFunc;
    let lastRan;
    const throttled = (...args) => {
        if (!lastRan) {
            func(...args);
            lastRan = Date.now();
        } else {
            clearTimeout(lastFunc);
            lastFunc = setTimeout(() => {
                if (Date.now() - lastRan >= limit) {
                    func(...args);
                    lastRan = Date.now();
                }
            }, limit - (Date.now() - lastRan));
        }
    };
    // Drops a pending trailing call so it cannot overwrite a colour chosen after it was scheduled.
    throttled.cancel = () => clearTimeout(lastFunc);
    return throttled;
};

function panelTitleText(target) {
    return themeText(target === "accent" ? "themeCustomPanelTitle" : surfaceLabels[target]);
}

function currentTargetColor(target) {
    if (target === "accent") {
        return themeHelpers.normalizeHex(localStorage.getItem(customThemeStorageKey))
            || themeHelpers.PALETTES[themeHelpers.resolvePalette()];
    }
    return themeHelpers.readSurfaces()[target] || tokenHex(themeHelpers.SURFACES[target]);
}

function rememberRecentColor(hex) {
    const colors = [hex, ...themeHelpers.readRecentColors().filter(color => color !== hex)].slice(0, themeHelpers.RECENT_LIMIT);
    localStorage.setItem(themeHelpers.RECENT_STORE, JSON.stringify(colors));
    renderRecentColors();
}

function renderRecentColors() {
    const colors = themeHelpers.readRecentColors();
    themeRecentColors.replaceChildren(...colors.map(color => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.color = color;
        button.style.backgroundColor = color;
        button.title = color;
        button.setAttribute("aria-label", color);
        return button;
    }));
    themeRecent.hidden = !colors.length;
}

// Writes and applies a colour for the panel's target. commit=true also records a recent custom colour.
function setTargetColor(target, hex, commit) {
    if (commit) applyLiveColor.cancel();
    if (target === "accent") {
        localStorage.setItem(customThemeStorageKey, hex);
        localStorage.removeItem(themeStorageKey);
        applyCustomTheme(hex);
        if (commit) rememberRecentColor(hex);
        return;
    }
    themeHelpers.writeSurfaces({ ...themeHelpers.readSurfaces(), [target]: hex });
    refreshTheme(true);
}

function syncPanel(hex) {
    const [hue, saturation, lightness] = themeHelpers.hexToHsl(hex);
    themeSliders[0].value = Math.round(hue);
    themeSliders[1].value = Math.round(saturation);
    themeSliders[2].value = Math.round(lightness);
    updateSliderOutputs();
    themeHexInput.value = hex;
    themeHexPreview.style.backgroundColor = hex;
    showHexError(false);
}

function updateSliderOutputs() {
    const [hue, saturation, lightness] = themeSliders.map(slider => slider.value);
    document.getElementById("themeHueValue").textContent = `${hue}°`;
    document.getElementById("themeSaturationValue").textContent = `${saturation}%`;
    document.getElementById("themeLightnessValue").textContent = `${lightness}%`;
}

function showHexError(visible) {
    themeHexError.textContent = visible ? themeText("themeHexInvalid") : "";
    themeHexError.hidden = !visible;
    if (visible) themeHexInput.setAttribute("aria-invalid", "true");
    else themeHexInput.removeAttribute("aria-invalid");
}

function openThemePanel(target, trigger) {
    applyLiveColor.cancel();
    panelTarget = target;
    panelTrigger = trigger;
    (target === "accent" ? themeContrastWarning : trigger.closest(".themeSurfaceRow")).after(themePanel);
    document.querySelectorAll('[aria-controls="themeCustomPanel"]').forEach(button => {
        button.setAttribute("aria-expanded", String(button === trigger));
    });
    themePanelTitle.textContent = panelTitleText(target);
    syncPanel(currentTargetColor(target));
    renderRecentColors();
    themePanel.hidden = false;
    themeSliders[0].focus();
}

function closeThemePanel(returnFocus = true) {
    applyLiveColor.cancel();
    themePanel.hidden = true;
    document.querySelectorAll('[aria-controls="themeCustomPanel"]').forEach(button => button.setAttribute("aria-expanded", "false"));
    if (returnFocus) panelTrigger?.focus();
    panelTarget = null;
}

function togglePanel(target, trigger) {
    if (!themePanel.hidden && panelTrigger === trigger) closeThemePanel();
    else openThemePanel(target, trigger);
}

const sliderHex = () => themeHelpers.hslToHex(...themeSliders.map(slider => Number(slider.value)));
const applyLiveColor = throttle((target, hex) => { if (target) setTargetColor(target, hex, false); }, 30);

themeSliders.forEach(slider => {
    slider.addEventListener("input", () => {
        const hex = sliderHex();
        updateSliderOutputs();
        themeHexInput.value = hex;
        themeHexPreview.style.backgroundColor = hex;
        showHexError(false);
        applyLiveColor(panelTarget, hex);
    });
    // Releasing a slider commits the colour (and records it as recent).
    slider.addEventListener("change", () => { if (panelTarget) setTargetColor(panelTarget, sliderHex(), true); });
});

// Enter commits (and records a recent colour). Leaving the field only applies the colour: rebuilding the recent row
// on that blur would move the chip the pointer is about to click.
function commitHexInput(commit) {
    const hex = themeHelpers.normalizeHex(themeHexInput.value);
    if (!hex) {
        showHexError(true);
        return;
    }
    const unchanged = !panelTarget || hex === currentTargetColor(panelTarget);
    syncPanel(hex);
    if (!unchanged) setTargetColor(panelTarget, hex, commit);
}

themeHexInput.addEventListener("change", () => commitHexInput(false));
themeHexInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
        event.preventDefault();
        commitHexInput(true);
    }
});

themeRecentColors.addEventListener("click", event => {
    const hex = themeHelpers.normalizeHex(event.target.closest("button")?.dataset.color);
    if (!hex || !panelTarget) return;
    syncPanel(hex);
    setTargetColor(panelTarget, hex, true);
    // The row was rebuilt with this colour first; keep keyboard focus on it.
    themeRecentColors.querySelector(`[data-color="${hex}"]`)?.focus();
});

themePanel.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeThemePanel();
    }
});
document.getElementById("themeCustomDone").addEventListener("click", () => closeThemePanel());

colorPickerLabel.addEventListener("click", () => togglePanel("accent", colorPickerLabel));

document.querySelectorAll(".themeSurfaceSwatch").forEach(button => {
    button.addEventListener("click", () => togglePanel(button.dataset.surface, button));
});

document.querySelectorAll(".themeSurfaceReset").forEach(button => {
    button.addEventListener("click", () => {
        applyLiveColor.cancel();
        const surfaces = themeHelpers.readSurfaces();
        delete surfaces[button.dataset.surface];
        themeHelpers.writeSurfaces(surfaces);
        refreshTheme(true);
        if (panelTarget === button.dataset.surface) syncPanel(currentTargetColor(panelTarget));
        // The button disables itself; keep keyboard focus on the row's colour button.
        button.parentElement.querySelector(".themeSurfaceSwatch").focus();
    });
});

// Handle radio button changes
const handleThemeChange = function () {
    if (this.checked) {
        const colorValue = this.value;
        applyLiveColor.cancel();
        localStorage.setItem(themeStorageKey, colorValue);
        localStorage.removeItem(customThemeStorageKey); // Clear custom theme
        applySelectedTheme(colorValue);
        if (panelTarget) syncPanel(currentTargetColor(panelTarget));
    }
};

// Remove any previously attached listeners and add only one
radioButtons.forEach(radioButton => {
    radioButton.removeEventListener("change", handleThemeChange); // Remove if already attached
    radioButton.addEventListener("change", handleThemeChange);    // Add fresh listener
});

// Local palette refresh without cache writes, network fetches or external navigation.
// An open editor follows the reload; a surface editor closes when dark mode takes over.
window.myntThemePreferences = { reload() {
    refreshTheme(false);
    if (!panelTarget) return;
    if (panelTarget !== "accent" && isDarkMode()) closeThemePanel(false);
    else syncPanel(currentTargetColor(panelTarget));
} };

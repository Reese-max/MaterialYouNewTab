/*
 * Material You New Tab
 * Copyright (c) 2024-2026 Prem, 2023-2025 XengShi
 * Licensed under the GNU General Public License v3.0 (GPL-3.0)
 * You should have received a copy of the GNU General Public License along with this program.
 * If not, see <https://www.gnu.org/licenses/>.
 */

// ===============================================================
// Preload: Apply saved theme BEFORE first paint to prevent flash
// This script runs synchronously in <head>, before <body> exists.
// ===============================================================

(function () {
    const root = document.documentElement;


    // --- Widget transparency ---
    const savedOpacity = localStorage.getItem('bgOpacity');
    if (savedOpacity) {
        root.style.setProperty('--transparency', `${Math.round(Number(savedOpacity))}%`);
    }

    // Watch for the <body> to be created and instantly set it to "wallpaper" before the screen paints
    // if (localStorage.getItem('hasWallpaper') === 'true') {
    //     const observer = new MutationObserver(function () {
    //         if (document.body) {
    //             document.body.setAttribute('data-bg', 'wallpaper');
    //             observer.disconnect(); // Stop watching once the job is done
    //         }
    //     });
    //     observer.observe(document.documentElement, { childList: true });
    // }

    // --- Light/Dark/System mode preference ---
    const preferredTheme = localStorage.getItem('preferredTheme');
    // Migrate legacy dark mode checkbox
    const legacyDarkCheckbox = localStorage.getItem('enableDarkModeCheckboxState');
    let resolvedPreference = preferredTheme || 'light';

    if (legacyDarkCheckbox === 'checked' && !preferredTheme) {
        resolvedPreference = 'dark';
    }

    // Set data attribute on <html> for CSS early-paint dark mode selectors
    root.setAttribute('data-preferred-theme', resolvedPreference);

    // For system theme: detect if OS is in dark mode
    if (resolvedPreference === 'system') {
        const systemIsDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.setAttribute('data-system-dark', systemIsDark ? 'true' : 'false');
    }

    // --- Color theme application ---
    // Every stylesheet reads the --*-blue tokens: they are the active slot that a palette or custom colour is copied into.
    var PALETTES = {
        haze: '#526B85', mauve: '#8B7C9F', midnight: '#344760', sage: '#7B927F', forest: '#3E6655', ocean: '#508D91',
        latte: '#A68B76', caramel: '#A47652', rose: '#AF7885', graphite: '#555C66', pearl: '#9298A3', ink: '#25272B'
    };
    var DEFAULT_PALETTE = 'haze';
    // Swatches retired in 2026-11, mapped to the nearest new palette by hue and lightness.
    var LEGACY_PALETTES = {
        blue: 'haze', slate: 'haze', indigo: 'midnight', cyan: 'ocean', teal: 'ocean', green: 'sage', lime: 'sage',
        brown: 'latte', orange: 'caramel', amber: 'caramel', yellow: 'caramel', red: 'rose', pink: 'rose', wine: 'rose',
        magenta: 'rose', peach: 'rose', purple: 'mauve', silver: 'pearl', dark: 'ink'
    };
    var TOKENS = ['bg-color', 'accentLightTint', 'darkerColor', 'darkColor', 'textColorDark', 'whitishColor'];
    // Light-mode surface overrides and the active-slot token that paints each one (body, settings and bookmark
    // panels, settings cards, body text). Cards and text also recolour the home glass via --mynt-surface-*.
    var SURFACES = { page: '--bg-color-blue', side: '--accentLightTint-blue', card: '--whitishColor-blue', text: '--textColorDark-blue' };
    var SURFACES_STORE = 'myntThemeSurfaces', RECENT_STORE = 'myntRecentThemeColors', RECENT_LIMIT = 6;
    var hasOwn = function (object, name) { return Object.prototype.hasOwnProperty.call(object, name); };

    function normalizeHex(value) {
        var match = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(typeof value === 'string' ? value.trim() : '');
        if (!match) return null;
        return '#' + (match[1].length === 3 ? match[1].replace(/./g, '$&$&') : match[1]).toUpperCase();
    }
    function hexToHsl(hex) {
        var rgb = [1, 3, 5].map(function (i) { return parseInt(hex.slice(i, i + 2), 16) / 255; });
        var max = Math.max.apply(null, rgb), min = Math.min.apply(null, rgb), l = (max + min) / 2, h = 0, s = 0, d = max - min;
        if (d) {
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            h = max === rgb[0] ? (rgb[1] - rgb[2]) / d + (rgb[1] < rgb[2] ? 6 : 0) : max === rgb[1] ? (rgb[2] - rgb[0]) / d + 2 : (rgb[0] - rgb[1]) / d + 4;
        }
        return [h * 60, s * 100, l * 100];
    }
    function hslToHex(h, s, l) {
        s = Math.min(Math.max(s, 0), 100) / 100; l = Math.min(Math.max(l, 0), 100) / 100;
        var a = s * Math.min(l, 1 - l);
        return '#' + [0, 8, 4].map(function (n) {
            var k = (n + h / 30) % 12;
            return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255).toString(16).padStart(2, '0');
        }).join('').toUpperCase();
    }
    function contrastRatio(first, second) {
        var lum = function (hex) {
            return [1, 3, 5].map(function (i) {
                var v = parseInt(hex.slice(i, i + 2), 16) / 255;
                return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
            }).reduce(function (sum, v, i) { return sum + v * [0.2126, 0.7152, 0.0722][i]; }, 0);
        };
        var a = lum(first), b = lum(second);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    }
    // Calm near-white surfaces with a faint tint of the hue, near-black text, and a darker accent that keeps white
    // labels at 5.5:1 or more. The 12 palettes in style.css were generated with this same recipe.
    function deriveTokens(accent) {
        var hsl = hexToHsl(accent), h = hsl[0], s = hsl[1], darkerL = hsl[2] - 8;
        while (darkerL > 0 && contrastRatio(hslToHex(h, s, darkerL), '#FFFFFF') < 5.5) darkerL -= 1;
        return {
            'bg-color': hslToHex(h, Math.min(20, s * 0.55), 96.5),
            accentLightTint: hslToHex(h, Math.min(30, s * 0.9), 93),
            darkerColor: hslToHex(h, s, Math.max(darkerL, 0)),
            darkColor: accent,
            textColorDark: hslToHex(h, Math.min(14, s * 0.45), 20),
            whitishColor: '#FFFFFF'
        };
    }
    function readJson(name) {
        try { return JSON.parse(localStorage.getItem(name)); } catch (error) { return null; }
    }
    // Stored data is validated on every read; invalid entries are dropped, never applied.
    function readSurfaces() {
        var raw = readJson(SURFACES_STORE), surfaces = {};
        if (!raw || typeof raw !== 'object' || raw.version !== 1) return surfaces;
        Object.keys(SURFACES).forEach(function (name) {
            var hex = normalizeHex(raw[name]);
            if (hex) surfaces[name] = hex;
        });
        return surfaces;
    }
    function writeSurfaces(surfaces) {
        if (Object.keys(surfaces).length) localStorage.setItem(SURFACES_STORE, JSON.stringify(Object.assign({ version: 1 }, surfaces)));
        else localStorage.removeItem(SURFACES_STORE);
    }
    function readRecentColors() {
        var raw = readJson(RECENT_STORE), colors = [];
        (Array.isArray(raw) ? raw : []).forEach(function (value) {
            var hex = normalizeHex(value);
            if (hex && colors.indexOf(hex) < 0 && colors.length < RECENT_LIMIT) colors.push(hex);
        });
        return colors;
    }
    // Returns a valid palette id. A retired or unknown stored value is migrated once and written back.
    function resolvePalette() {
        var stored = localStorage.getItem('selectedTheme');
        if (stored === null) return DEFAULT_PALETTE;
        if (hasOwn(PALETTES, stored)) return stored;
        var next = hasOwn(LEGACY_PALETTES, stored) ? LEGACY_PALETTES[stored] : DEFAULT_PALETTE;
        localStorage.setItem('selectedTheme', next);
        return next;
    }
    function isNearWhite(hex, threshold) {
        var limit = threshold === undefined ? 240 : threshold, value = normalizeHex(hex);
        return Boolean(value) && [1, 3, 5].every(function (i) { return parseInt(value.slice(i, i + 2), 16) > limit; });
    }
    function applyPalette(target, id) {
        var palette = hasOwn(PALETTES, id) ? id : DEFAULT_PALETTE;
        TOKENS.forEach(function (token) { target.style.setProperty('--' + token + '-blue', 'var(--' + token + '-' + palette + ')'); });
    }
    function applyCustom(target, color) {
        var hex = normalizeHex(color) || PALETTES[DEFAULT_PALETTE];
        var tokens = deriveTokens(isNearWhite(hex) ? '#696969' : hex);
        TOKENS.forEach(function (token) { target.style.setProperty('--' + token + '-blue', tokens[token]); });
    }
    // Apply after the palette so switching palettes keeps the overrides. Dark mode inverts the page, so it skips them.
    function applySurfaces(target, dark) {
        var surfaces = dark ? {} : readSurfaces();
        Object.keys(SURFACES).forEach(function (name) {
            var hex = surfaces[name];
            if (hex) {
                target.style.setProperty(SURFACES[name], hex);
                target.style.setProperty('--mynt-surface-' + name, hex);
            } else {
                target.style.removeProperty('--mynt-surface-' + name);
            }
            target.toggleAttribute('data-mynt-surface-' + name, Boolean(hex));
        });
    }

    window.ThemeHelpers = {
        PALETTES: PALETTES, LEGACY_PALETTES: LEGACY_PALETTES, DEFAULT_PALETTE: DEFAULT_PALETTE, SURFACES: SURFACES,
        SURFACES_STORE: SURFACES_STORE, RECENT_STORE: RECENT_STORE, RECENT_LIMIT: RECENT_LIMIT,
        normalizeHex: normalizeHex, hexToHsl: hexToHsl, hslToHex: hslToHex, contrastRatio: contrastRatio, deriveTokens: deriveTokens,
        readSurfaces: readSurfaces, writeSurfaces: writeSurfaces, readRecentColors: readRecentColors, resolvePalette: resolvePalette,
        isNearWhite: isNearWhite, applyPalette: applyPalette, applyCustom: applyCustom, applySurfaces: applySurfaces
    };

    // Paint the saved (migrated) palette and light-mode surfaces before first paint so nothing flashes.
    var storedCustomColor = normalizeHex(localStorage.getItem('customThemeColor'));
    var paletteId = resolvePalette();
    var startsDark = resolvedPreference === 'dark'
        || (resolvedPreference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (storedCustomColor) applyCustom(root, storedCustomColor);
    else applyPalette(root, paletteId);
    applySurfaces(root, startsDark);

    // --- Loading Screen Color ---
    // Paint the current (already migrated) page colour rather than the cached one, which can still hold a retired
    // palette after an upgrade. Only a transparent cache (motion-video background) is kept as is.
    var cachedLoading = localStorage.getItem('LoadingScreenColor') || '';
    var accentForPage = storedCustomColor ? (isNearWhite(storedCustomColor) ? '#696969' : storedCustomColor) : PALETTES[paletteId];
    root.style.setProperty('--Loading-Screen-Color', /^transparent$|^rgba\(.*,\s*0\)$/.test(cachedLoading)
        ? cachedLoading
        : (!startsDark && readSurfaces().page) || deriveTokens(accentForPage)['bg-color']);
})();

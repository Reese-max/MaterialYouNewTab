/*
 * Material You New Tab
 * Copyright (c) 2024-2026 Prem, 2023-2025 XengShi
 * Licensed under the GNU General Public License v3.0 (GPL-3.0)
 * You should have received a copy of the GNU General Public License along with this program.
 * If not, see <https://www.gnu.org/licenses/>.
 */

// Translation data
const DEFAULT_LANGUAGE = "zh_TW";

const localeSources = {
    en: en,
    pt: pt,
    ne: ne,
    es: es,
    hi: hi,
    hu: hu,
    zh: zh,
    zh_TW: zh_TW,
    cs: cs,
    it: it,
    tr: tr,
    bn: bn,
    vi: vi,
    ru: ru,
    uz: uz,
    ja: ja,
    ko: ko,
    idn: idn,
    mr: mr,
    fr: fr,
    az: az,
    sl: sl,
    ur: ur,
    de: de,
    fa: fa,
    ar_SA: ar_SA,
    el: el,
    ta: ta,
    th: th,
    pl: pl,
    uk: uk,
    sv: sv,
};

const translations = Object.fromEntries(
    Object.entries(localeSources).map(([code, strings]) => [
        code,
        code === "en" ? strings : { ...en, ...strings }
    ])
);

const savedLanguage = localStorage.getItem("selectedLanguage");
if (!savedLanguage || !translations[savedLanguage]) {
    localStorage.setItem("selectedLanguage", DEFAULT_LANGUAGE);
}

// Define the width of the menu container for each language
const menuWidths = {
    "en": "443px",
    "pt": "512px",
    "ne": "472px",
    "es": "488px",
    "hi": "450px",
    "hu": "487px",
    "zh": "443px",
    "zh_TW": "443px",
    "cs": "494px",
    "it": "479px",
    "tr": "472px",
    "bn": "458px",
    "vi": "487px",
    "ru": "442px",
    "uz": "497px",
    "ja": "486px",
    "ko": "443px",
    "idn": "477px",
    "mr": "460px",
    "fr": "517px",
    "az": "460px",
    "sl": "512px",
    "ur": "482px",
    "de": "502px",
    "fa": "502px",
    "ar_SA": "482px",
    "el": "497px",
    "ta": "522px",
    "th": "497px",
    "pl": "497px",
    "uk": "497px",
    "sv": "472px",
};

const numberMappings = {
    "bn": { "0": "০", "1": "১", "2": "২", "3": "৩", "4": "৪", "5": "৫", "6": "৬", "7": "৭", "8": "৮", "9": "৯" },
    "ta": { "0": "௦", "1": "௧", "2": "௨", "3": "௩", "4": "௪", "5": "௫", "6": "௬", "7": "௭", "8": "௮", "9": "௯" },
    "mr": { "0": "०", "1": "१", "2": "२", "3": "३", "4": "४", "5": "५", "6": "६", "7": "७", "8": "८", "9": "९" },
    "ne": { "0": "०", "1": "१", "2": "२", "3": "३", "4": "४", "5": "५", "6": "६", "7": "७", "8": "८", "9": "९" },
    "fa": { "0": "۰", "1": "۱", "2": "۲", "3": "۳", "4": "۴", "5": "۵", "6": "۶", "7": "۷", "8": "۸", "9": "۹" },
    "ar_SA": { "0": "۰", "1": "۱", "2": "۲", "3": "۳", "4": "٤", "5": "٥", "6": "٦", "7": "۷", "8": "۸", "9": "۹" }
};

const LRM = "\u200E";

function localizeNumbers(text, language) {
    const map = numberMappings[language];
    const specialDecimalLanguages = ["cs", "it", "pt", "ru", "tr", "vi", "uz", "es", "ko", "idn", "fr", "az", "sl", "hu", "de", "fa", "el", "uk", "sv"];
    if (specialDecimalLanguages.includes(language)) text = text.replace(".", ",");
    if (map) text = text.replace(/\d/g, (digit) => map[digit] || digit);
    if (language === "ar_SA") text = LRM + text + LRM;
    return text;
}

// Right-to-left languages
const rtlLanguages = ["ur", "fa", "ar_SA"];

// Function to apply the language to the page
function applyLanguage(lang) {
    document.title = translations[lang]?.newTabTitle || translations["en"].newTabTitle;

    // Mapping of text elements and their translation keys
    const translationMap = [
        "feedback",
        "resetsettings",
        "shortcutsText",
        "enableShortcutsText",
        "editShortcutsText",
        "shortcutsInfoText",
        "editShortcutsList",
        "editShortcutsListInfo",
        "adaptiveIconText",
        "adaptiveIconInfoText",
        "ai_tools_button",
        "enable_ai_tools",
        "aiToolsSettingsText",
        "aiToolsSettingsInfo",
        "googleAppsMenuText",
        "googleAppsMenuInfo",
        "todoListText",
        "todoListInfo",
        "pomodoroText",
        "pomodoroInfo",
        "pomodoroHover",
        "pomodoroWorkText",
        "pomodoroWorkInfo",
        "pomodoroShortBreakText",
        "pomodoroShortBreakInfo",
        "pomodoroLongBreakText",
        "pomodoroLongBreakInfo",
        "pomodoroRoundsText",
        "pomodoroRoundsInfo",
        "pomodoroAutoStartText",
        "pomodoroAutoStartInfo",
        "pomodoroSoundText",
        "pomodoroSoundInfo",
        "pomodoroNotifText",
        "pomodoroNotifInfo",
        "scratchpadHover",
        "scratchpadHeading",
        "scratchpadText",
        "scratchpadInfo",
        "scratchpadCopyBtn",
        "scratchpadToTaskBtn",
        "scratchpadClearBtn",
        "scratchpadDownloadBtn",
        "shortcutsHelpEyebrow",
        "shortcutsHelpTitle",
        "shortcutSearchHelp",
        "shortcutCmdHelp",
        "shortcutScratchpadHelp",
        "shortcutHelpHelp",
        "shortcutEscHelp",
        "shortcutBangHelp",
        "workspaceWidgetScratchpad",
        "workspaceUrlsLabel",
        "pomodoroAmbientAutoText",
        "pomodoroAmbientAutoInfo",
        "pomodoroIconSizeText",
        "pomodoroIconSizeInfo",
        "pomodoroPanelScaleText",
        "pomodoroPanelScaleInfo",
        "pomodoroResetPosText",
        "pomodoroResetPosInfo",
        "pomodoroSessionsLabel",
        "pomodoroFocusLabel",
        "bongoCatText",
        "bongoCatInfo",
        "bongoCatCostumeText",
        "bongoCatOutfitDefault",
        "bongoCatOutfitDark",
        "bongoCatOutfitSakura",
        "bongoCatOutfitOcean",
        "bongoCatOutfitSunset",
        "bongoCatOutfitForest",
        "bongoCatOutfitLavender",
        "bongoCatStyleText",
        "bongoCatStyleSimple",
        "bongoCatStyleCute",
        "bongoCatResetPositionText",
        "fahrenheitCelsiusCheckbox",
        "fahrenheitCelsiusText",
        "minMaxTempText",
        "minMaxTempSubText",
        "hideWeatherTitle",
        "hideWeatherInfo",
        "hideWeatherBox",
        "hideWeatherBoxInfo",
        "micIconTitle",
        "micIconInfo",
        "hideSearchWith",
        "hideSearchWithInfo",
        "searchWithHint",
        "motivationalQuotesText",
        "motivationalQuotesInfo",
        "newQuoteOnRefreshText",
        "newQuoteOnRefreshInfo",
        "search_suggestions_button",
        "search_suggestions_text",
        "hideClockBox",
        "hideClockBoxInfo",
        "digitalclocktitle",
        "digitalclockinfo",
        "timeformattitle",
        "timeformatinfo",
        "greetingtitle",
        "greetinginfo",
        "userTextTitle",
        "userTextInfo",
        "useproxytitletext",
        "useproxyText",
        "ProxyText",
        "ProxySubtext",
        "HostproxyButton",
        "UserLocText",
        "UserLocSubtext",
        "useGPS",
        "useGPSInfo",
        "PrivacyPolicy",
        "WeatherApiText",
        "WeatherApiSubtext",
        "LearnMoreButton",
        "saveAPI",
        "enterBtn",
        "ai_tools",
        "googleEngine",
        "chatGPT",
        "gemini",
        "copilot",
        "claude",
        "grok",
        "qwen",
        "perplexity",
        "deepseek",
        "metaAI",
        'firefly',
        "github",
        "googleAppsHover",
        "todoListHover",
        "uploadWallpaperText",
        "backupText",
        "restoreText",
        "rangColor",
        "bookmarksText",
        "bookmarksInfo",
        "bookmarksHeading",
        "bookmarkSortBy",
        "sortAlphabetical",
        "sortTimeAdded",
        "bookmarkViewAs",
        "bookmarkViewGrid",
        "bookmarkViewList",
        "editBookmarkHeading",
        "lightThemed",
        "darkThemed",
        "systemThemed",
        "switchSearchModes",
        "switchSearchModesInfo",
        "adjustZoom",
        "changeBrowserTheme",
        "updateFirefoxHomepage",
        "dontShowTips",
        "aiSettingsIntro",
        "resetAISettingsBtn",
        "opacityTitle",
        "adjustOpacityDesc",
        "footerToastTitle",
        "footerToastMessage",
        "personalizationSectionTitle",
        "clockSectionTitle",
        "searchSectionTitle",
        "weatherSectionTitle",
        "appearanceSectionTitle",
        "settingsSectionTitle",
        "iconFileTooLargeMessage",
        "iconStorageQuotaMessage"
    ];

    // Specific mapping for placeholders
    const placeholderMap = [
        { id: "userLoc", key: "userLoc" },
        { id: "userAPI", key: "userAPI" },
        { id: "searchQ", key: "searchPlaceholder" },
        { id: "todoInput", key: "todoPlaceholder" },
        { id: "bookmarkSearch", key: "bookmarkSearch" },
        { id: "editBookmarkName", key: "editBookmarkName" },
        { id: "editBookmarkURL", key: "editBookmarkURL" }
    ];

    // Mapping of elements and their different translation keys
    const elementsMap = [
        { id: "todoListHeading", key: "todoListText" },
        { id: "pomodoroPhaseLabel", key: "pomodoroWork" },
        { id: "googleEngineDD", key: "googleEngine" },
        { id: "bookmarksHover", key: "bookmarksHeading" },
        { id: "saveproxy", key: "saveAPI" },
        { id: "saveLoc", key: "saveAPI" },
        { id: "saveBookmarkChanges", key: "saveAPI" },
        { id: "cancelBookmarkEdit", key: "cancelText" },
        { id: "aiSettingsHeader", key: "aiToolsSettingsText" },
        { id: "saveAISettingsBtn", key: "saveAPI" },
        { id: "editBookmarkNameLabel", key: "editBookmarkName" },
        { id: "editBookmarkURLLabel", key: "editBookmarkURL" },
        { id: "shortcutsSectionTitle", key: "shortcutsText" },
    ];

    // Function to apply translations
    function applyTranslations(items, isPlaceholder) {
        items.forEach(item => {
            // Get the element by its ID
            const element = document.getElementById(item.id || item);
            if (element) {
                // Use "key" if defined, otherwise use "id" as the translation key
                const key = item.key || item;
                // Get the translation, fallback to English if not found in the current language
                const translation = translations[lang]?.[key] || translations["en"]?.[key];

                // Apply the translation to either placeholder or innerText
                if (isPlaceholder) {
                    element.placeholder = translation;
                } else {
                    element.innerText = translation;
                }
            }
        });
    }

    // Apply the translations
    applyTranslations(placeholderMap, true);   // For placeholders
    applyTranslations(elementsMap, false);     // For innerTexts with different IDs and keys
    applyTranslations(translationMap, false);  // For innerTexts with same ID and keys

    const accessibleLabelMap = [
        { id: "todoListCont", key: "todoListText" },
        { id: "pomodoroCont", key: "pomodoroText" },
        { id: "bookmarkButton", key: "bookmarksText" },
        { id: "googleAppsCont", key: "googleAppsMenuText" },
        { id: "aiToolsIcon", key: "ai_tools_button" },
        { id: "micIcon", key: "voiceSearchLabel" },
        { id: "menuButton", key: "openSettingsLabel" }
    ];
    accessibleLabelMap.forEach(({ id, key }) => {
        const element = document.getElementById(id);
        const label = translations[lang]?.[key] || translations.en?.[key];
        if (element && label) element.setAttribute("aria-label", label);
    });

    // For userText
    const userTextDiv = document.getElementById("userText");
    if (translations[lang]) {
        const placeholder = translations[lang]?.userText || translations["en"].userText;
        userTextDiv.dataset.placeholder = placeholder; // Update the placeholder in data attribute
        // Only set the text content if there's nothing in localStorage
        if (!localStorage.getItem("userText")) {
            userTextDiv.innerText = placeholder;
        }
    }

    // Update placeholders on already-rendered shortcut inputs
    document.querySelectorAll(".shortcutSettingsEntry .shortcutName")
        .forEach(el => el.placeholder = translations[lang]?.shortcutInputName  || translations["en"].shortcutInputName);
    document.querySelectorAll(".shortcutSettingsEntry .URL")
        .forEach(el => el.placeholder = translations[lang]?.shortcutInputUrl   || translations["en"].shortcutInputUrl);
    document.querySelectorAll(".shortcutSettingsEntry .iconURL")
        .forEach(el => el.placeholder = translations[lang]?.shortcutInputIcon  || translations["en"].shortcutInputIcon);

    // Update hover text for #menuCloseButton
    const menuCloseButton = document.getElementById("menuCloseButton");
    if (menuCloseButton) {
        const hoverText = translations[lang]?.menuCloseText || translations["en"].menuCloseText;
        menuCloseButton.setAttribute("data-lang", hoverText);
    }

    // Update the width of the menu container based on the language
    const menuCont = document.querySelector(".menuBar .menuCont");
    if (menuCont) {
        menuCont.style.width = menuWidths[lang] || menuWidths["en"];
        let widthh = window.innerWidth / parseInt(menuWidths[lang] || menuWidths["en"]);
        if (window.innerWidth < 522) {
            let menuStyle = document.getElementById("menuStyle") || document.createElement("style");
            menuStyle.id = "menuStyle";
            menuStyle.textContent = `
                .menuCont {
                    scale: ${widthh} !important;
                    height: ${(100 / widthh).toString()}dvh !important;
                    transform-origin: top right !important;
                }
            `;
            document.head.append(menuStyle);
        }
    }

    // Dynamically update the font family based on the language
    const root = document.documentElement;
    const commonFontStack = "'poppins', 'Poppins', sans-serif";
    root.style.setProperty("--main-font-family", commonFontStack);

    // Apply the direction attribute to specific selectors for RTL languages
    const isRTL = rtlLanguages.includes(lang);
    const rtlSelectors = [".topDiv", ".searchbar", ".searchWithCont", ".resultBox", ".quotesCont",
        ".leftDiv", ".shortcutsContainer", ".page", "#prompt-modal-box", ".todo-container",
        ".bookmark-search-container", ".bookmark-controls-container", "#editBookmarkModal", ".liquidGlass-toast"];

    rtlSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
            el.setAttribute("dir", isRTL ? "rtl" : "ltr");
        });
    });

    // Update feelsLike element styles for RTL languages
    const feelsLikeElement = document.getElementById("feelsLike");
    feelsLikeElement.style.left = isRTL ? "12px" : "";
    feelsLikeElement.style.paddingRight = isRTL ? "43px" : "";
    feelsLikeElement.style.width = isRTL ? "calc(100% - 12px)" : "";
    feelsLikeElement.style.textAlign = isRTL ? "right" : "left";

    const quotesText = document.querySelector(".quotesContainer");
    // quotesText.style.textAlign = isRTL ? "right" : "left";
    quotesText.style.fontFamily = commonFontStack;

    // Save the selected language in localStorage
    document.documentElement.lang = lang === "zh_TW" ? "zh-TW" : lang.replace("_", "-");
    saveLanguageStatus("selectedLanguage", lang);
}

// Detect language from navigator.language
document.getElementById("languageSelector").addEventListener("change", (event) => {
    applyLanguage(event.target.value);
    location.reload();
});

// Function to apply the language when the page loads
window.onload = function () {
    const savedLanguage = getLanguageStatus("selectedLanguage") || DEFAULT_LANGUAGE;
    document.getElementById("languageSelector").value = savedLanguage;
    applyLanguage(savedLanguage);
};

// Function to save the language status in localStorage
function saveLanguageStatus(key, languageStatus) {
    localStorage.setItem(key, languageStatus);
}

// Function to get the language status from localStorage
function getLanguageStatus(key) {
    return localStorage.getItem(key);
}

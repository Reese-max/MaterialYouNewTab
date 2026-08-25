/*
 * Material You NewTab
 * Copyright (c) 2023-2025 XengShi
 * Licensed under the GNU General Public License v3.0 (GPL-3.0)
 * You should have received a copy of the GNU General Public License along with this program.
 * If not, see <https://www.gnu.org/licenses/>.
 */

// Translation data
const DEFAULT_LANGUAGE = "zh_TW";

if (!localStorage.getItem("selectedLanguage")) {
    localStorage.setItem("selectedLanguage", DEFAULT_LANGUAGE);
}

const translations = {
    en: en, // English
    zh_TW: zh_TW, // Chinese (Traditional)
};

// Define the width of the menu container for each language
const menuWidths = {
    en: "443px",
    zh_TW: "443px",
};

const numberMappings = {
    // en and zh_TW use standard Arabic numerals, no mapping needed
};

const LRM = "\u200E"; // Left-to-Right Mark

function localizeNumbers(text, language) {
    const map = numberMappings[language]; // Get the numeral map for the current language

    // Define languages that use a comma as the decimal separator instead of a dot
    const specialDecimalLanguages = []; // en and zh_TW both use dot decimal separator

    if (specialDecimalLanguages.includes(language)) {
        // Replace decimal point with a comma for specific languages
        text = text.replace(".", ",");
    }
    // Apply digit localization if the numeral map exists
    if (map) {
        text = text.replace(/\d/g, (digit) => map[digit] || digit);
    }

    // LRM marks, for RTL languages to ensure correct display
    const rtlFlipLanguages = ["ar_SA"];
    if (rtlFlipLanguages.includes(language)) {
        text = `${LRM}${text}${LRM}`;
    }

    return text; // Return the localized text
}

// Right-to-left languages
const rtlLanguages = [];

// Function to apply the language to the page
function applyLanguage(lang) {
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
        "settingsSectionTitle"
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

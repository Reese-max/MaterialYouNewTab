/*
 * Material You New Tab
 * Copyright (c) 2024-2026 Prem, 2023-2025 XengShi
 * Licensed under the GNU General Public License v3.0 (GPL-3.0)
 * You should have received a copy of the GNU General Public License along with this program.
 * If not, see <https://www.gnu.org/licenses/>.
 */

const searchbar = document.getElementById("searchbar");
const searchInput = document.getElementById("searchQ");
const enterBTN = document.getElementById("enterBtn");
const hideSearchWith = document.getElementById("shortcut_switchcheckbox");
const searchIcons = document.querySelectorAll(".searchIcon");
const searchProviderRow = document.getElementById("search-with-container");

searchbar.addEventListener("click", function (event) {
    event.stopPropagation();
    searchbar.classList.add("active");
    searchInput.focus();
});

document.addEventListener("click", function (event) {
    if (!searchbar.contains(event.target)) {
        searchbar.classList.remove("active");
    }
});

document.querySelector(".dropdown-btn")?.addEventListener("click", function (event) {
    event.preventDefault();
    searchInput.focus();
});

const SEARCH_BANGS = {
    "!yt": { name: "YouTube", url: "https://www.youtube.com/results?search_query=", home: "https://www.youtube.com" },
    "!youtube": { name: "YouTube", url: "https://www.youtube.com/results?search_query=", home: "https://www.youtube.com" },
    "!gh": { name: "GitHub", url: "https://github.com/search?q=", home: "https://github.com" },
    "!github": { name: "GitHub", url: "https://github.com/search?q=", home: "https://github.com" },
    "!gpt": { name: "ChatGPT", url: "https://chatgpt.com/?q=", home: "https://chatgpt.com" },
    "!chat": { name: "ChatGPT", url: "https://chatgpt.com/?q=", home: "https://chatgpt.com" },
    "!claude": { name: "Claude", url: "https://claude.ai/new?q=", home: "https://claude.ai" },
    "!maps": { name: "Google Maps", url: "https://www.google.com/maps/search/", home: "https://maps.google.com" },
    "!npm": { name: "npm", url: "https://www.npmjs.com/search?q=", home: "https://www.npmjs.com" },
    "!b": { name: "Bing", url: "https://www.bing.com/search?q=", home: "https://www.bing.com" },
    "!trans": { name: "Google Translate", url: "https://translate.google.com/?text=", home: "https://translate.google.com" },
    "!mail": { name: "Gmail", url: "https://mail.google.com/mail/u/0/#search/", home: "https://mail.google.com" },
    "!drive": { name: "Google Drive", url: "https://drive.google.com/drive/search?q=", home: "https://drive.google.com" }
};

function parseSearchBang(rawQuery) {
    const text = (rawQuery || "").trim();
    if (!text.startsWith("!")) return null;
    const spaceIndex = text.indexOf(" ");
    const bang = spaceIndex === -1 ? text.toLowerCase() : text.slice(0, spaceIndex).toLowerCase();
    const query = spaceIndex === -1 ? "" : text.slice(spaceIndex + 1).trim();
    const target = SEARCH_BANGS[bang];
    if (!target) return null;
    return query ? target.url + encodeURIComponent(query) : target.home;
}

function performSearch(query) {
    const searchTerm = (query || searchInput.value).trim();
    if (!searchTerm) return;

    const bangUrl = parseSearchBang(searchTerm);
    if (bangUrl) {
        window.location.href = bangUrl;
        return;
    }

    const language = localStorage.getItem("selectedLanguage") === "zh_TW" ? "zh-TW" : "en";
    const searchURL = new URL("https://www.google.com/search");
    searchURL.searchParams.set("hl", language);
    searchURL.searchParams.set("q", searchTerm);
    window.location.href = searchURL.toString();
}

enterBTN.addEventListener("click", () => performSearch());

function applySearchProviderVisibility(hidden) {
    searchIcons[0].style.display = hidden ? "none" : "block";
    searchIcons[1].style.display = hidden ? "block" : "none";
    searchProviderRow.style.visibility = hidden ? "hidden" : "visible";
    localStorage.setItem("showShortcutSwitch", hidden);
}

hideSearchWith.addEventListener("change", function () {
    applySearchProviderVisibility(hideSearchWith.checked);
});

hideSearchWith.checked = localStorage.getItem("showShortcutSwitch") === "true";
applySearchProviderVisibility(hideSearchWith.checked);

document.addEventListener("keydown", function (event) {
    const modalContainer = document.getElementById("prompt-modal-container");
    const menu = document.querySelector(".menuBar");
    const bookmarkPanel = document.getElementById("bookmarkSidebar");
    const interfaceIsOpen =
        modalContainer?.style.display === "flex" ||
        (menu && getComputedStyle(menu).display !== "none") ||
        bookmarkPanel?.classList.contains("open");

    if (
        !interfaceIsOpen &&
        event.key === "/" &&
        event.target.tagName !== "INPUT" &&
        event.target.tagName !== "TEXTAREA" &&
        !event.target.isContentEditable
    ) {
        event.preventDefault();
        searchInput.focus();
        searchbar.classList.add("active");
    }
});

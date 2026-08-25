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

function performSearch(query) {
    const searchTerm = (query || searchInput.value).trim();
    if (!searchTerm) return;

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

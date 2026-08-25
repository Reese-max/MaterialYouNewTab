/*
 * Material You NewTab
 * Copyright (c) 2023-2025 XengShi
 * Licensed under the GNU General Public License v3.0 (GPL-3.0)
 * You should have received a copy of the GNU General Public License along with this program.
 * If not, see <https://www.gnu.org/licenses/>.
 */

// --------------------------------- Proxy ---------------------------------
let proxyurl;
const GOOGLE_SUGGESTION_ORIGIN = "https://www.google.com/*";
document.addEventListener("DOMContentLoaded", () => {
    const userProxyInput = document.getElementById("userproxy");
    const saveProxyButton = document.getElementById("saveproxy");
    const savedProxy = localStorage.getItem("proxy");

    const defaultProxyURL = "https://mynt-proxy.rhythmcorehq.com/proxy?url="; //Default proxy url

    if (savedProxy && savedProxy !== defaultProxyURL) {
        userProxyInput.value = savedProxy;
    }

    // Allow pressing Enter to save the proxy
    userProxyInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            saveProxyButton.click();
        }
    });

    // Save the proxy to localStorage
    saveProxyButton.addEventListener("click", () => {
        proxyurl = userProxyInput.value.trim();

        // If the input is empty, use the default proxy.
        if (proxyurl === "") {
            proxyurl = defaultProxyURL;
        } else {
            // Validate if input starts with "http://" or "https://"
            if (!(proxyurl.startsWith("http://") || proxyurl.startsWith("https://"))) {
                proxyurl = "https://" + proxyurl;
            }
        }
        // Set the proxy in localStorage, clear the input, and reload the page
        localStorage.setItem("proxy", proxyurl);
        userProxyInput.value = "";
        location.reload();
    });

    // Determine which proxy URL to use
    proxyurl = savedProxy || defaultProxyURL;
});

// ---------------------------- Search Suggestions ----------------------------

let lastInteractionBy = null;
let originalSearchText = ""; // Store the original search text
const resultBox = document.getElementById("resultBox");

// Show the result box
function showResultBox() {
    resultBox.classList.add("show");
    resultBox.style.display = "block";
}

// Hide the result box
function hideResultBox() {
    resultBox.classList.remove("show");
    //resultBox.style.display = "none";
}

hideResultBox();

function getBangSuggestions(query) {
    if (typeof SEARCH_BANGS === "undefined") return [];
    const raw = query.toLowerCase().trim();
    const matches = Object.entries(SEARCH_BANGS)
        .filter(([key, bang]) => key.startsWith(raw) || bang.name.toLowerCase().includes(raw.slice(1)))
        .map(([key, bang]) => ({
            query: `${key} `,
            display: `${key} · ${bang.name}`
        }));
    const unique = [];
    const seen = new Set();
    for (const item of matches) {
        if (!seen.has(item.display)) {
            seen.add(item.display);
            unique.push(item);
        }
    }
    return unique.slice(0, 7);
}

searchInput.addEventListener("input", async function () {
    const searchsuggestionscheckbox = document.getElementById("searchsuggestionscheckbox");
    if (searchsuggestionscheckbox.checked) {
        const query = this.value;

        // Store original text when user starts typing
        originalSearchText = query;

        if (query.startsWith("!")) {
            const bangSuggestions = getBangSuggestions(query);
            resultBox.replaceChildren();
            if (bangSuggestions.length === 0) {
                hideResultBox();
                return;
            }
            bangSuggestions.forEach((item, index) => {
                const resultItem = document.createElement("div");
                resultItem.classList.add("resultItem");
                resultItem.textContent = item.display;
                resultItem.setAttribute("data-index", index);
                resultItem.setAttribute("data-query", item.query);

                resultItem.onclick = () => {
                    searchInput.value = item.query;
                    searchInput.focus();
                    hideResultBox();
                };
                resultItem.addEventListener("mouseenter", () => {
                    const currentlyActive = resultBox.querySelector(".active");
                    if (currentlyActive) currentlyActive.classList.remove("active");
                    resultItem.classList.add("active");
                    lastInteractionBy = "mouse";
                });
                resultBox.appendChild(resultItem);
            });
            showResultBox();
            return;
        }

        if (query.length > 0) {
            const suggestions = await getAutocompleteSuggestions(query);
            resultBox.replaceChildren();

            if (suggestions.length === 0) {
                hideResultBox();
                return;
            }

            suggestions.forEach((suggestion, index) => {
                const resultItem = document.createElement("div");
                resultItem.classList.add("resultItem");
                resultItem.textContent = suggestion;
                resultItem.setAttribute("data-index", index);

                resultItem.onclick = () => performSearch(suggestion);
                resultItem.addEventListener("mouseenter", () => {
                    const currentlyActive = resultBox.querySelector(".active");
                    if (currentlyActive) currentlyActive.classList.remove("active");
                    resultItem.classList.add("active");
                    lastInteractionBy = "mouse";
                });

                resultBox.appendChild(resultItem);
            });

            showResultBox();
        } else {
            hideResultBox();
        }
    }
});

searchInput.addEventListener("keydown", function (e) {
    const activeItem = resultBox.querySelector(".active");
    let currentIndex = activeItem ? parseInt(activeItem.getAttribute("data-index")) : -1;

    if (resultBox.children.length > 0 && resultBox.classList.contains("show")) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            lastInteractionBy = "keyboard";

            if (activeItem) {
                activeItem.classList.remove("active");
            }

            // Calculate new index based on direction
            if (e.key === "ArrowDown") {
                currentIndex = (currentIndex + 1) % resultBox.children.length;
            } else { // ArrowUp
                currentIndex = (currentIndex - 1 + resultBox.children.length) % resultBox.children.length;
            }

            resultBox.children[currentIndex].classList.add("active");

            // Ensure the active item is visible within the result box
            const activeElement = resultBox.children[currentIndex];
            activeElement.scrollIntoView({ behavior: "smooth", block: "nearest" });

            // Auto-complete the search input with selected suggestion
            const suggestionText = activeElement.getAttribute("data-query") || activeElement.textContent;
            this.value = suggestionText;

        } else if ((e.key === "ArrowRight" || e.key === "Tab") && activeItem && lastInteractionBy === "mouse") {
            // Check if cursor is at end
            const cursorAtEnd = this.selectionStart === this.value.length;

            if (cursorAtEnd) {
                e.preventDefault();
                const suggestionText = activeItem.textContent;
                this.value = suggestionText;
            }

        } else if (e.key === "Enter") {
            e.preventDefault();
            if (activeItem) {
                // Selected suggestion + Enter = search
                activeItem.click();

            } else {
                // No selection, search with current input value
                performSearch(this.value);
            }

        } else if (e.key === "Escape") {
            e.preventDefault();
            // Restore original search text
            this.value = originalSearchText;
            // Remove any active highlights
            if (activeItem) {
                activeItem.classList.remove("active");
            }
        }
    } else if (e.key === "Enter") {
        // No suggestions available, search with current input
        e.preventDefault();
        performSearch(this.value);
    }
});

// Check for different browsers and return the corresponding client parameter
function getClientParam() {
    if (isFirefox) return "firefox";
    if (isOpera) return "opera";
    if (isChromiumBased) return "chrome";
    if (isSafari) return "safari";
    return "firefox"; // Default to Firefox if the browser is not recognized
}

async function getAutocompleteSuggestions(query) {
    const useproxyCheckbox = document.getElementById("useproxyCheckbox");
    let apiUrl = `https://www.google.com/complete/search?client=${getClientParam()}&q=${encodeURIComponent(query)}`;
    if (useproxyCheckbox.checked) {
        apiUrl = proxyurl + encodeURIComponent(apiUrl);
    }

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`Suggestion request failed: ${response.status}`);
        const data = await response.json();
        return Array.isArray(data?.[1]) ? data[1] : [];
    } catch (error) {
        console.error("Error fetching autocomplete suggestions:", error);
        return [];
    }
}

// Hide results when clicking outside
document.addEventListener("click", function (event) {
    if (!searchbar.contains(event.target)) {
        hideResultBox();
    }
});

// ------------------------- Toggles --------------------------
document.addEventListener("DOMContentLoaded", async function () {
    const searchsuggestionscheckbox = document.getElementById("searchsuggestionscheckbox");
    const proxybypassField = document.getElementById("proxybypassField");
    const proxyinputField = document.getElementById("proxyField");
    const useproxyCheckbox = document.getElementById("useproxyCheckbox");
    const searchSuggestionsHeader = document.getElementById("searchSuggestionsHeader");
    const proxyOptions = document.querySelector(".proxyOptions");

    // This function shows the proxy disclaimer.
    async function showProxyDisclaimer() {
        const message = translations[currentLanguage]?.ProxyDisclaimer || translations["en"].ProxyDisclaimer;
        return await confirmPrompt(message, agreeText, cancelText);
    }

    // Requests optional host permissions for suggestion APIs
    async function requestHostPermissions() {
        if (!chrome?.permissions?.request)
            return false;

        return new Promise((resolve) => {
            chrome.permissions.request({
                origins: [GOOGLE_SUGGESTION_ORIGIN]
            }, (granted) => {
                resolve(granted);
            });
        });
    }

    async function hasHostPermissions() {
        if (!chrome?.permissions?.contains) return false;
        return new Promise(resolve => {
            chrome.permissions.contains({ origins: [GOOGLE_SUGGESTION_ORIGIN] }, resolve);
        });
    }

    function applySearchSuggestionsState(enabled) {
        proxyOptions.classList.toggle("not-applicable", !enabled);
        proxybypassField.classList.toggle("inactive", !enabled);

        if (!enabled) {
            useproxyCheckbox.checked = false;
            saveCheckboxState("useproxyCheckboxState", useproxyCheckbox);
            proxyinputField.classList.add("inactive");
            saveActiveStatus("proxyinputField", "inactive");
            setTimeout(() => searchSuggestionsHeader.style.borderBottom = "none", 80);
        } else
            searchSuggestionsHeader.style.borderBottom = "";
    }

    // Add change event listeners for the checkboxes
    searchsuggestionscheckbox.addEventListener("change", async function () {
        if (searchsuggestionscheckbox.checked && !isFirefoxAll) {
            const granted = await requestHostPermissions();
            if (!granted) searchsuggestionscheckbox.checked = false;
        }

        saveCheckboxState("searchsuggestionscheckboxState", searchsuggestionscheckbox);
        applySearchSuggestionsState(searchsuggestionscheckbox.checked);
    });

    useproxyCheckbox.addEventListener("change", async function () {
        if (useproxyCheckbox.checked) {
            // Show the disclaimer and check the user's choice
            const userConfirmed = await showProxyDisclaimer();
            if (userConfirmed) {
                // Only enable the proxy if the user confirmed
                saveCheckboxState("useproxyCheckboxState", useproxyCheckbox);
                proxyinputField.classList.remove("inactive");
                saveActiveStatus("proxyinputField", "active");
            } else {
                // Revert the checkbox state if the user did not confirm
                useproxyCheckbox.checked = false;
            }
        } else {
            // If the checkbox is unchecked, disable the proxy
            saveCheckboxState("useproxyCheckboxState", useproxyCheckbox);
            proxyinputField.classList.add("inactive");
            saveActiveStatus("proxyinputField", "inactive");
        }
    });

    // Load and apply the saved checkbox states and display statuses
    loadCheckboxState("searchsuggestionscheckboxState", searchsuggestionscheckbox);
    loadCheckboxState("useproxyCheckboxState", useproxyCheckbox);
    loadActiveStatus("proxyinputField", proxyinputField);
    loadActiveStatus("proxybypassField", proxybypassField);
    if (searchsuggestionscheckbox.checked && !isFirefoxAll && !(await hasHostPermissions())) {
        searchsuggestionscheckbox.checked = false;
        saveCheckboxState("searchsuggestionscheckboxState", searchsuggestionscheckbox);
    }
    applySearchSuggestionsState(searchsuggestionscheckbox.checked);
});

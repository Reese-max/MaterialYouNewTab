/* 
 * Material You NewTab
 * Copyright (c) 2023-2025 XengShi
 * Licensed under the GNU General Public License v3.0 (GPL-3.0)
 * You should have received a copy of the GNU General Public License along with this program. 
 * If not, see <https://www.gnu.org/licenses/>.
 */

// ------------------------ Bookmark System -----------------------------------
// DOM Variables
const bookmarkButton = document.getElementById("bookmarkButton");
const bookmarkSidebar = document.getElementById("bookmarkSidebar");
const bookmarkList = document.getElementById("bookmarkList");
const bookmarkSearch = document.getElementById("bookmarkSearch");
const bookmarkSearchClearButton = document.getElementById("clearSearchButton");
const bookmarkViewGrid = document.getElementById("bookmarkViewGrid");
const bookmarkViewList = document.getElementById("bookmarkViewList");
const bookmarksCheckbox = document.getElementById("bookmarksCheckbox");

const editBookmarkModal = document.getElementById("editBookmarkModal");
const editBookmarkName = document.getElementById("editBookmarkName");
const editBookmarkURL = document.getElementById("editBookmarkURL");
const editBookmarkFavicon = document.getElementById("editBookmarkFavicon");
const saveBookmarkChanges = document.getElementById("saveBookmarkChanges");
const cancelBookmarkEdit = document.getElementById("cancelBookmarkEdit");
let currentBookmarkId = null;

const sortAlphabetical = document.getElementById("sortAlphabetical");
const sortTimeAdded = document.getElementById("sortTimeAdded");
let currentSortMethod = localStorage.getItem("bookmarkSortMethod") || 'title';

var bookmarksAPI;
if (isFirefox) {
    bookmarksAPI = browser.bookmarks;
} else if (isChromiumBased) {
    bookmarksAPI = chrome.bookmarks;
}

// Initialize sort buttons
updateSortButtons();

bookmarkButton.addEventListener("click", function () {
    toggleBookmarkSidebar();
    bookmarkSearchClearButton.click();
    bookmarkSearch.focus();
});

bookmarkViewGrid.addEventListener("click", function () {
    if (!bookmarkGridCheckbox.checked) bookmarkGridCheckbox.click();
});

bookmarkViewList.addEventListener("click", function () {
    if (bookmarkGridCheckbox.checked) bookmarkGridCheckbox.click();
});

document.addEventListener("click", function (event) {
    const modalContainer = document.getElementById("prompt-modal-container");
    // If modal is open, don't close the sidebar
    if (modalContainer && modalContainer.style.display === "flex") {
        return;
    }

    if (
        !bookmarkSidebar.contains(event.target) &&
        !bookmarkButton.contains(event.target) &&
        !editBookmarkModal.contains(event.target) &&
        bookmarkSidebar.classList.contains("open")
    ) {
        toggleBookmarkSidebar();

        if (editBookmarkModal.style.display !== "none") {
            editBookmarkModal.style.display = "none";
        }
    }
});

// Search Functionality

// Search index: built once after bookmarks load, avoids repeated DOM queries & .toLowerCase()
let bookmarkSearchIndex = [];

function buildSearchIndex() {
    bookmarkSearchIndex = [];
    const items = bookmarkList.querySelectorAll("li[data-url]");
    for (let i = 0; i < items.length; i++) {
        const el = items[i];
        bookmarkSearchIndex.push({
            el,
            text: (el.textContent || "").toLowerCase(),
            url: (el.dataset.url || "").toLowerCase(),
            folder: el.closest("li.folder"),
        });
    }
}

// Debounce helper: delays execution until user stops typing
let searchTimer = null;

function filterBookmarks() {
    const searchTerm = bookmarkSearch.value.toLowerCase();

    // Show or hide the clear button
    bookmarkSearchClearButton.style.display = searchTerm ? "inline" : "none";

    // Fast path: empty search — reset everything via class toggle
    if (!searchTerm) {
        bookmarkList.classList.remove("searching");
        // Reset all inline styles and folder states set by previous search
        for (let i = 0; i < bookmarkSearchIndex.length; i++) {
            bookmarkSearchIndex[i].el.style.display = "";
        }
        const folders = bookmarkList.querySelectorAll("li.folder");
        for (let i = 0; i < folders.length; i++) {
            folders[i].style.display = "";
            folders[i].classList.remove("open");
            const sub = folders[i].querySelector("ul");
            if (sub) sub.classList.add("hidden");
        }
        return;
    }

    bookmarkList.classList.add("searching");

    // Single O(n) pass over the flat index
    const visibleFolders = new Set();

    for (let i = 0; i < bookmarkSearchIndex.length; i++) {
        const entry = bookmarkSearchIndex[i];
        const match = entry.text.includes(searchTerm) || entry.url.includes(searchTerm);
        entry.el.style.display = match ? "" : "none";
        if (match && entry.folder) {
            visibleFolders.add(entry.folder);
        }
    }

    // Update folder visibility in one pass
    const allFolders = bookmarkList.querySelectorAll("li.folder");
    for (let i = 0; i < allFolders.length; i++) {
        const folder = allFolders[i];
        if (visibleFolders.has(folder)) {
            folder.style.display = "";
            folder.classList.add("open");
            const sub = folder.querySelector("ul");
            if (sub) sub.classList.remove("hidden");
        } else {
            folder.style.display = "none";
            folder.classList.remove("open");
        }
    }
}

bookmarkSearch.addEventListener("input", function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(filterBookmarks, 150);
});

// Sorting functionality
sortAlphabetical.addEventListener("click", function () {
    if (!this.classList.contains("active")) {
        currentSortMethod = 'title';
        localStorage.setItem("bookmarkSortMethod", "title");
        updateSortButtons();
        loadBookmarks();
    }
});

sortTimeAdded.addEventListener("click", function () {
    if (!this.classList.contains("active")) {
        currentSortMethod = 'date';
        localStorage.setItem("bookmarkSortMethod", "date");
        updateSortButtons();
        loadBookmarks();
    }
});

function updateSortButtons() {
    sortAlphabetical.classList.toggle("active", currentSortMethod === 'title');
    sortTimeAdded.classList.toggle("active", currentSortMethod === 'date');
}


bookmarkSearchClearButton.addEventListener("click", function () {
    bookmarkSearch.value = "";
    bookmarkSearch.dispatchEvent(new Event("input")); // Trigger input event to clear search results
});

function updateBookmarkUI(enabled) {
    bookmarksCheckbox.checked = enabled;
    bookmarkButton.style.display = enabled ? "flex" : "none";
    saveDisplayStatus("bookmarksDisplayStatus", enabled ? "flex" : "none");
    saveCheckboxState("bookmarksCheckboxState", bookmarksCheckbox);
}

async function verifyBookmarkPermission() {
    // Early exit for unsupported browsers
    let bookmarksPermission;
    if (isFirefox) bookmarksPermission = browser.permissions;
    else if (isChromiumBased) bookmarksPermission = chrome.permissions;

    if (!bookmarksPermission) {
        await alertPrompt(translations[currentLanguage]?.UnsupportedBrowser ||
            translations['en'].UnsupportedBrowser);
        updateBookmarkUI(false);
        return false;
    }

    // Firefox and Opera don't expose Chromium's favicon permission.
    const requiredPermissions = (isFirefox || isOpera) ? ["bookmarks"] : ["bookmarks", "favicon"];
    const hasPermission = isFirefox
        ? await browser.permissions.contains({ permissions: requiredPermissions })
        : await new Promise(resolve => chrome.permissions.contains({ permissions: requiredPermissions }, resolve));

    if (!hasPermission) {
        const granted = isFirefox
            ? await browser.permissions.request({ permissions: requiredPermissions })
            : await new Promise(resolve => chrome.permissions.request({ permissions: requiredPermissions }, resolve));

        if (!granted) {
            updateBookmarkUI(false);
            return false;
        }
        bookmarksAPI = isFirefox ? browser.bookmarks : chrome.bookmarks;
    }

    // Success case
    updateBookmarkUI(true);
    return true;
}

async function toggleBookmarkSidebar() {
    const hasPermission = await verifyBookmarkPermission();
    if (hasPermission) {
        const isOpen = bookmarkSidebar.classList.toggle("open");
        bookmarkButton.classList.toggle("rotate", isOpen);
        bookmarkButton.setAttribute("aria-expanded", String(isOpen));

        if (isOpen) {
            loadBookmarks();
            requestAnimationFrame(() => bookmarkSearch.focus());
        }
    } else {
        bookmarkButton.setAttribute("aria-expanded", "false");
    }
}

// Function to load bookmarks
function loadBookmarks() {
    if (!bookmarksAPI?.getTree) {
        console.error("Bookmarks API is unavailable. Please check permissions or context.");
        return;
    }

    bookmarksAPI.getTree().then(async (bookmarkTreeNodes) => {
        // Clear the current list
        while (bookmarkList.firstChild) bookmarkList.removeChild(bookmarkList.firstChild);

        // Display the "Recently Added" folder
        if (bookmarksAPI.getRecent) {
            try {
                const recentBookmarks = await bookmarksAPI.getRecent(8);
                if (recentBookmarks.length > 0) {
                    const recentAddedFolder = {
                        title: "最近新增",
                        children: recentBookmarks
                    };
                    bookmarkList.appendChild(displayBookmarks([recentAddedFolder]));
                }
            } catch (e) {
                console.error("Error loading recent bookmarks:", e);
            }
        }

        // For Firefox: "Bookmarks Menu" and "Other Bookmarks" are distinct nodes
        if (isFirefox) {
            const toolbarNode = bookmarkTreeNodes[0]?.children?.find(node => node.title === "Bookmarks Toolbar");
            const menuNode = bookmarkTreeNodes[0]?.children?.find(node => node.title === "Bookmarks Menu");
            const otherNode = bookmarkTreeNodes[0]?.children?.find(node => node.title === "Other Bookmarks");

            if (toolbarNode?.children) bookmarkList.appendChild(displayBookmarks(toolbarNode.children));
            if (menuNode?.children) bookmarkList.appendChild(displayBookmarks(menuNode.children));
            if (otherNode?.children) bookmarkList.appendChild(displayBookmarks(otherNode.children));
        }
        else {
            let default_folder = "Bookmarks bar";
            if (isEdge) default_folder = "Favorites bar";
            if (isBrave) default_folder = "Bookmarks";

            // Get the children of the root bookmark folder
            const rootChildren = bookmarkTreeNodes[0]?.children || [];

            // Find and process the default bookmarks folder
            const mainBookmarks = rootChildren.find(node =>
                node.title === default_folder ||
                node.folderType === "bookmarks-bar"
            );

            // If the default folder has children, display its bookmarks
            if (mainBookmarks?.children) {
                bookmarkList.appendChild(displayBookmarks(mainBookmarks.children));
            }

            // Process all other root-level folders
            rootChildren.forEach(node => {
                if (node !== mainBookmarks && node.id !== "1" && node.children) {
                    bookmarkList.appendChild(displayBookmarks([node]));
                }
            });
        }

        // Build search index after all bookmarks are in the DOM
        buildSearchIndex();
    }).catch(err => {
        console.error("Error loading bookmarks:", err);
    });
}

// Function to set the favicon for a bookmark
function setBookmarkFavicon(faviconElement, pageUrl) {
    // Final fallback to local offline icon
    const offlineFallback = () => faviconElement.src = "./svgs/offline.svg";

    // Google favicon api fallback
    const googleFallback = () => {
        faviconElement.src = `https://www.google.com/s2/favicons?domain=${new URL(pageUrl).hostname}&sz=32`;
        faviconElement.onerror = offlineFallback;
    };

    // Try browser-specific favicon first (Chromium only)
    if (!isFirefox && !isOpera) {
        faviconElement.src = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=32`;
        faviconElement.onerror = googleFallback;
    } else {
        googleFallback();
    }
}

function displayBookmarks(bookmarkNodes) {
    let list = document.createElement("ul");

    // Separate folders and bookmarks
    const folders = bookmarkNodes.filter(node => node.children && node.children.length > 0);
    const bookmarks = bookmarkNodes.filter(node => node.url);

    // Sorting folders and bookmarks separately by title or dateAdded
    if (currentSortMethod === 'title') {
        folders.sort((a, b) => a.title.localeCompare(b.title));
        bookmarks.sort((a, b) => a.title.localeCompare(b.title));
    } else {
        folders.sort((a, b) => (a.dateAdded || 0) - (b.dateAdded || 0));
        bookmarks.sort((a, b) => (a.dateAdded || 0) - (b.dateAdded || 0));
    }

    // Combine folders and bookmarks
    const sortedNodes = [...bookmarks, ...folders];

    for (let node of sortedNodes) {
        if (node.id === "1") continue;

        if (node.children && node.children.length > 0) {
            let folderItem = document.createElement("li");

            folderItem.dataset.id = node.id; // Add ID as dataset for context menu

            // Use the SVG icon from HTML
            const folderIcon = document.getElementById("folderIconTemplate").cloneNode(true);
            folderIcon.removeAttribute("id"); // Remove the id to prevent duplicates
            folderItem.appendChild(folderIcon);

            folderItem.appendChild(document.createTextNode(node.title));
            folderItem.classList.add("folder", "open");

            // Add event listener for unfolding/folding
            folderItem.addEventListener("click", function (event) {
                event.stopPropagation();
                folderItem.classList.toggle("open");
                const subList = folderItem.querySelector("ul");
                if (subList) {
                    subList.classList.toggle("hidden");
                }
            });

            let subList = displayBookmarks(node.children);
            folderItem.appendChild(subList);

            list.appendChild(folderItem);
        } else if (node.url) {
            let item = document.createElement("li");
            item.dataset.id = node.id; // Add ID as dataset for context menu
            item.dataset.url = node.url; // Add URL as dataset for search functionality
            let link = document.createElement("a");
            link.href = node.url;
            let span = document.createElement("span");
            span.textContent = node.title;

            const favicon = document.createElement("img");
            setBookmarkFavicon(favicon, node.url);
            favicon.classList.add("favicon");

            // Create the delete button
            let deleteButton = document.createElement("button");
            deleteButton.textContent = "✖";
            deleteButton.classList.add("bookmark-delete-button");

            deleteButton.addEventListener("click", async function (event) {
                event.preventDefault();
                event.stopPropagation();

                const confirmMessage = (translations[currentLanguage]?.deleteBookmark || translations["en"].deleteBookmark)
                    .replace("{title}", node.title || node.url);

                if (await confirmPrompt(confirmMessage)) {
                    if (isFirefox) {
                        // Firefox API (Promise-based)
                        bookmarksAPI.remove(node.id).then(() => {
                            item.remove(); // Remove the item from the DOM
                        }).catch(err => {
                            console.error("Error removing bookmark:", err);
                        });
                    } else {
                        // Chrome API (Callback-based)
                        bookmarksAPI.remove(node.id, function () {
                            item.remove(); // Remove the item from the DOM
                        });
                    }
                }
            });

            link.appendChild(favicon);
            link.appendChild(span);
            item.appendChild(link);
            item.appendChild(deleteButton); // Add delete button to the item

            // Open links in the current tab or new tab if ctrl pressed
            link.addEventListener("click", function (event) {
                if (event.ctrlKey || event.metaKey) {
                    // Open in a new tab
                    event.preventDefault();
                    if (isFirefox) {
                        browser.tabs.create({ url: node.url, active: false });
                    } else if (isChromiumBased) {
                        chrome.tabs.create({ url: node.url, active: false });
                    } else {
                        window.open(node.url, "_blank");
                    }
                } else {
                    // Open in the current tab
                    event.preventDefault();
                    if (isFirefox) {
                        browser.tabs.update({ url: node.url });
                    } else if (isChromiumBased) {
                        chrome.tabs.update({ url: node.url }, function () {
                        });
                    } else {
                        window.location.href = node.url;
                    }
                }
            });
            list.appendChild(item);
        }
    }

    list.addEventListener("click", function (event) {
        event.stopPropagation();
    });

    return list;
}

// Right-click (context menu) event
bookmarkList.addEventListener("contextmenu", function (event) {
    event.preventDefault(); // Prevent default right-click menu

    const bookmarkItem = event.target.closest("li[data-id]");
    if (!bookmarkItem) return;

    currentBookmarkId = bookmarkItem.dataset.id;
    const bookmarkTitle = bookmarkItem.querySelector("a").textContent.trim();
    const bookmarkURL = bookmarkItem.dataset.url;

    // Populate modal fields
    editBookmarkName.value = bookmarkTitle;
    editBookmarkURL.value = bookmarkURL;
    setBookmarkFavicon(editBookmarkFavicon, bookmarkURL);

    // Show modal
    editBookmarkModal.style.display = "block";
    saveBookmarkChanges.disabled = false;
});

// Disable save button if URL is empty
editBookmarkURL.addEventListener("input", () => {
    saveBookmarkChanges.disabled = editBookmarkURL.value.trim() === "";
});

// Save button action
saveBookmarkChanges.onclick = function () {
    if (!currentBookmarkId) return;

    const updatedTitle = editBookmarkName.value.trim();
    const updatedURL = encodeURI(editBookmarkURL.value.trim());

    const updatedData = { title: updatedTitle, url: updatedURL };

    if (isFirefox) {
        bookmarksAPI.update(currentBookmarkId, updatedData).then(() => {
            updateBookmark(currentBookmarkId, updatedTitle, updatedURL);
            editBookmarkModal.style.display = "none";
        }).catch(err => {
            console.error("Error updating bookmark:", err);
        });
    } else {
        bookmarksAPI.update(currentBookmarkId, updatedData, function () {
            if (chrome.runtime.lastError) {
                console.error("Error updating bookmark:", chrome.runtime.lastError);
                return;
            }
            updateBookmark(currentBookmarkId, updatedTitle, updatedURL);
            editBookmarkModal.style.display = "none";
        });
    }

    loadBookmarks();
};

// Cancel button action
cancelBookmarkEdit.onclick = function () {
    editBookmarkModal.style.display = "none";
};

// Function to update after edit
function updateBookmark(bookmarkId, title, url) {
    const bookmarkItem = document.querySelector(`li[data-id="${bookmarkId}"]`);
    if (bookmarkItem) {
        const link = bookmarkItem.querySelector("a");
        link.textContent = title;
        link.href = url;
        bookmarkItem.dataset.url = url;
    }
}

// Move focus to URL field when Enter is pressed in Name field
editBookmarkName.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        editBookmarkURL.focus();
    }
});

// Trigger Save button when Enter is pressed in URL field
editBookmarkURL.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        event.preventDefault();
        if (!saveBookmarkChanges.disabled) {
            saveBookmarkChanges.click();
        }
    }
});

// ------------------------ End of Bookmark System -----------------------------------

// Save and load the state of the bookmarks toggle
document.addEventListener("DOMContentLoaded", function () {
    bookmarksCheckbox.addEventListener("change", async function () {
        if (!bookmarksCheckbox.checked) {
            updateBookmarkUI(false);
            return;
        }
        await verifyBookmarkPermission();
    });

    bookmarkGridCheckbox.addEventListener("change", function () {
        saveCheckboxState("bookmarkGridCheckboxState", bookmarkGridCheckbox);
        if (bookmarkGridCheckbox.checked) {
            bookmarkList.classList.add("grid-view");
        } else {
            bookmarkList.classList.remove("grid-view");
        }
    });

    loadCheckboxState("bookmarksCheckboxState", bookmarksCheckbox);
    loadDisplayStatus("bookmarksDisplayStatus", bookmarkButton);
    loadCheckboxState("bookmarkGridCheckboxState", bookmarkGridCheckbox);
});

// Keyboard shortcut for bookmarks
document.addEventListener("keydown", function (event) {
    // Prevent shortcut if modal or menu is open
    const modalContainer = document.getElementById("prompt-modal-container");
    if (modalContainer?.style.display === "flex" || menuBar.style.display !== "none") {
        return;
    }

    if (bookmarksCheckbox.checked &&
        event.key === "ArrowRight" &&
        !event.repeat &&
        event.target.tagName !== "INPUT" &&
        event.target.tagName !== "TEXTAREA" &&
        event.target.isContentEditable !== true
    ) {
        bookmarkButton.click();
    }
});

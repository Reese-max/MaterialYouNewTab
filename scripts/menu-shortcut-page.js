/*
 * Material You NewTab
 * Copyright (c) 2023-2025 XengShi
 * Licensed under the GNU General Public License v3.0 (GPL-3.0)
 * You should have received a copy of the GNU General Public License along with this program.
 * If not, see <https://www.gnu.org/licenses/>.
 */


// Get the current language from localStorage
const currentLanguage = localStorage.getItem("selectedLanguage") || "en";
const isRTL = rtlLanguages.includes(currentLanguage);

// ------------Showing & Hiding Menu-bar ---------------
const menuButton = document.getElementById("menuButton");
const menuBar = document.getElementById("menuBar");
const menuCont = document.getElementById("menuCont");
const optCont = document.getElementById("optCont");
const overviewPage = document.getElementById("overviewPage");
const shortcutEditPage = document.getElementById("shortcutEditPage");
const shortcutEditButton = document.getElementById("shortcutEditButton");
const backButton = document.getElementById("backButton");

function pageReset() {
    optCont.scrollTop = 0;
    overviewPage.style.transform = "translateX(0)";
    overviewPage.style.opacity = "1";
    overviewPage.style.display = "block";
    shortcutEditPage.style.transform = "translateX(120%)";
    shortcutEditPage.style.opacity = "0";
    shortcutEditPage.style.display = "none";
}

// Invalidate delayed animation callbacks when the user quickly changes direction.
let menuRevision = 0;
const queueMenu = (callback, delay = 0) => {
    const revision = menuRevision;
    setTimeout(() => { if (revision === menuRevision) callback(); }, delay);
};
const frameMenu = callback => {
    const revision = menuRevision;
    requestAnimationFrame(() => { if (revision === menuRevision) callback(); });
};

const closeMenuBar = () => {
    ++menuRevision;
    if (menuCont.contains(document.activeElement)) menuButton.focus({ preventScroll: true });
    menuButton.setAttribute("aria-expanded", "false");
    frameMenu(() => {
        optCont.style.opacity = "0"
        optCont.style.transform = "translateX(100%)"
    });
    queueMenu(() => {
        frameMenu(() => {
            menuBar.style.opacity = "0"
            menuCont.style.transform = "translateX(100%)"
        });
    }, 14);
    queueMenu(() => {
        // Disable smooth scroll temporarily
        menuCont.style.scrollBehavior = "auto";
        menuCont.scrollTop = 0;

        // Restore smooth scroll
        frameMenu(() => {
            menuCont.style.scrollBehavior = "smooth";
        });

        menuBar.style.display = "none";
    }, 555);
}

const openMenuBar = () => {
    ++menuRevision;
    menuButton.setAttribute("aria-expanded", "true");
    queueMenu(() => {
        menuBar.style.display = "block";
        pageReset();
    });
    queueMenu(() => {
        frameMenu(() => {
            menuBar.style.opacity = "1"
            menuCont.style.transform = "translateX(0px)"
        });
    }, 7);
    queueMenu(() => {
        frameMenu(() => {
            optCont.style.opacity = "1"
            optCont.style.transform = "translateX(0px)"
            document.getElementById("menuCloseButton").focus({ preventScroll: true });
        });
    }, 11);
}

menuButton.addEventListener("click", () => {
    if (menuButton.getAttribute("aria-expanded") !== "true") {
        openMenuBar();
    } else {
        closeMenuBar();
    }
});

//   ----------Hiding Menu Bar--------
menuBar.addEventListener("click", (event) => {
    if (event.target === menuBar) {
        closeMenuBar()
    }
});

// Hiding Menu Bar when user click on close button
document.getElementById("menuCloseButton").onclick = () => {
    closeMenuBar()
}


// Escape is scoped to this panel, so editing and other dialogs keep their own shortcuts.
menuCont.addEventListener("keydown", event => {
    if (event.defaultPrevented || document.querySelector("dialog[open]")) return;
    if (event.key === "Tab") {
        const items = [...menuCont.querySelectorAll('button, input, select, textarea, a[href], summary, [tabindex]')]
            .filter(el => {
                const closedDetails = el.closest('details:not([open])');
                return el.tabIndex >= 0 && !el.disabled && !el.closest('[inert], [hidden]') &&
                    (!closedDetails || closedDetails.querySelector('summary') === el) &&
                    el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
            });
        const first = items[0], last = items[items.length - 1];
        if (first && ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last))) {
            event.preventDefault(); (event.shiftKey ? last : first).focus();
        }
        return;
    }
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    if (shortcutEditPage.style.display === "block") backButton.click();
    else closeMenuBar();
});

// Toggle expand/collapse sections
document.querySelectorAll(".sectionHeader").forEach(header => {
    const section = header.closest(".section");
    const content = section.querySelector(".sectionInner");

    function setExpanded(expanded) {
        section.classList.toggle("expanded", expanded);
        header.setAttribute("aria-expanded", String(expanded));
        content.toggleAttribute("inert", !expanded);
        content.setAttribute("aria-hidden", String(!expanded));
    }

    setExpanded(section.classList.contains("expanded"));
    header.addEventListener("click", () => {
        setExpanded(!section.classList.contains("expanded"));
    });
});

// Keep the large settings menu scannable without moving its existing controls.
const settingsGroupButtons = [...document.querySelectorAll("[data-settings-group-button]")];
const settingsGroupSections = [...document.querySelectorAll("#overviewPage .section[data-settings-group]")];

function selectSettingsGroup(group) {
    settingsGroupButtons.forEach(button => {
        const selected = button.dataset.settingsGroupButton === group;
        button.setAttribute("aria-selected", String(selected));
        button.tabIndex = selected ? 0 : -1;
    });
    settingsGroupSections.forEach(section => {
        const hidden = section.dataset.settingsGroup !== group;
        section.hidden = hidden;
        section.toggleAttribute("inert", hidden);
    });
    optCont.scrollTop = 0;
}

settingsGroupButtons.forEach((button, index) => {
    button.addEventListener("click", () => selectSettingsGroup(button.dataset.settingsGroupButton));
    button.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
        event.preventDefault();
        const direction = event.key === "ArrowRight" ? 1 : -1;
        const next = settingsGroupButtons[(index + direction + settingsGroupButtons.length) % settingsGroupButtons.length];
        next.focus();
        selectSettingsGroup(next.dataset.settingsGroupButton);
    });
});
selectSettingsGroup("personal");

// Explain the two unlabeled floating actions on the first three visits, then simplify them.
const HOME_HINT_KEY = "myntHomeActionHintViews";
const hintViews = Math.max(0, Number(localStorage.getItem(HOME_HINT_KEY)) || 0);
if (hintViews < 3) {
    document.documentElement.classList.add("showHomeActionHints");
    localStorage.setItem(HOME_HINT_KEY, String(hintViews + 1));
}

document.addEventListener("click", event => {
    if (!event.target.closest("#menuButton, #bookmarkButton")) return;
    document.documentElement.classList.remove("showHomeActionHints");
    localStorage.setItem(HOME_HINT_KEY, "3");
}, true);


/* ------ Shortcut Page Transitions & Animations ------ */

// When clicked, open new page by sliding it in from the right.
shortcutEditButton.onclick = () => {
    menuRevision++;
    queueMenu(() => {
        shortcutEditPage.style.display = "block"
    });
    frameMenu(() => {
        overviewPage.style.transform = "translateX(-120%)"
        overviewPage.style.opacity = "0"
    });
    queueMenu(() => {
        frameMenu(() => {
            shortcutEditPage.style.transform = "translateX(0)"
            shortcutEditPage.style.opacity = "1"
        });
    }, 50);
    queueMenu(() => {
        overviewPage.style.display = "none";
        backButton.focus({ preventScroll: true });
    }, 650);
}

// Close page by sliding it away to the right.
backButton.onclick = () => {
    menuRevision++;
    queueMenu(() => {
        overviewPage.style.display = "block"
    });
    frameMenu(() => {
        shortcutEditPage.style.transform = "translateX(120%)";
        shortcutEditPage.style.opacity = "0";
    });
    queueMenu(() => {
        frameMenu(() => {
            overviewPage.style.transform = "translateX(0)";
            overviewPage.style.opacity = "1";
        });
    }, 50);
    queueMenu(() => {
        shortcutEditPage.style.display = "none";
        shortcutEditButton.focus({ preventScroll: true });
    }, 650);
}

/*
 * Material You NewTab
 * Copyright (c) 2024-2026 Prem, 2023-2025 XengShi
 * Licensed under the GNU General Public License v3.0 (GPL-3.0)
 * You should have received a copy of the GNU General Public License along with this program.
 * If not, see <https://www.gnu.org/licenses/>.
 */

/* ------ BongoCat Widget ------ */
/* Cat sprites from Gamma-Software/BongoCat-mac (MIT License) */

document.addEventListener("DOMContentLoaded", function () {
    const bongoCatCheckbox = document.getElementById("bongoCatCheckbox");
    const bongoCatWidget = document.getElementById("bongoCatWidget");
    const bongoCatContainer = document.getElementById("bongoCatContainer");
    const costumeRow = document.getElementById("bongoCatCostumeRow");
    const costumeGrid = document.getElementById("bongoCostumeGrid");
    const styleRow = document.getElementById("bongoCatStyleRow");
    const styleGrid = document.getElementById("bongoStyleGrid");
    const dragHandle = document.getElementById("bongoCatDragHandle");
    const posRow = document.getElementById("bongoCatPositionRow");
    const resetPosBtn = document.getElementById("bongoCatResetPositionBtn");
    const pawLeft = document.getElementById("bongoCatPawLeft");
    const pawRight = document.getElementById("bongoCatPawRight");

    let nextPawIsLeft = true;

    const OUTFIT_STORAGE_KEY = "bongoCatOutfit";
    const STYLE_STORAGE_KEY = "bongoCatStyle";
    const POS_STORAGE_KEY = "bongoCatPosition";
    // --- Outfit definitions (CSS color filters) ---
    const BONGO_OUTFITS = [
        { id: "default",  labelKey: "bongoCatOutfitDefault",  cssClass: "" },
        { id: "dark",     labelKey: "bongoCatOutfitDark",     cssClass: "bongo-outfit-dark" },
        { id: "sakura",   labelKey: "bongoCatOutfitSakura",   cssClass: "bongo-outfit-sakura" },
        { id: "ocean",    labelKey: "bongoCatOutfitOcean",    cssClass: "bongo-outfit-ocean" },
        { id: "sunset",   labelKey: "bongoCatOutfitSunset",   cssClass: "bongo-outfit-sunset" },
        { id: "forest",   labelKey: "bongoCatOutfitForest",   cssClass: "bongo-outfit-forest" },
        { id: "lavender", labelKey: "bongoCatOutfitLavender", cssClass: "bongo-outfit-lavender" }
    ];

    // --- Style definitions (sprite sets) ---
    // Simple: base.png (397x201) + 4 paw images (same size), layer-based animation
    // Cute:   cat.png (800x900), CSS bounce animation on keypress (paw images not used at runtime)
    const BONGO_STYLES = [
        {
            id: "simple",
            labelKey: "bongoCatStyleSimple",
            containerClass: "",
            useBounce: false,
            pawLeftUp:    "url(./images/bongocat/left-up.png)",
            pawLeftDown:  "url(./images/bongocat/left-down.png)",
            pawRightUp:   "url(./images/bongocat/right-up.png)",
            pawRightDown: "url(./images/bongocat/right-down.png)"
        },
        {
            id: "cute",
            labelKey: "bongoCatStyleCute",
            containerClass: "bongo-style-cute",
            useBounce: true,
            pawLeftUp:    "none",
            pawLeftDown:  "none",
            pawRightUp:   "none",
            pawRightDown: "none"
        }
    ];

    let currentStyleConfig = BONGO_STYLES[0];

    // --- Apply functions ---

    function applyOutfit(outfitId) {
        const outfit = BONGO_OUTFITS.find(o => o.id === outfitId) || BONGO_OUTFITS[0];
        BONGO_OUTFITS.forEach(o => {
            if (o.cssClass) bongoCatContainer.classList.remove(o.cssClass);
        });
        if (outfit.cssClass) bongoCatContainer.classList.add(outfit.cssClass);
        costumeGrid.querySelectorAll(".bongoCostumeThumb").forEach(btn => {
            btn.classList.toggle("active", btn.dataset.outfit === outfit.id);
        });
        localStorage.setItem(OUTFIT_STORAGE_KEY, outfit.id);
    }

    function applyStyle(styleId) {
        const style = BONGO_STYLES.find(s => s.id === styleId) || BONGO_STYLES[0];
        currentStyleConfig = style;
        // Toggle container class (CSS handles head image + sprite sizing)
        BONGO_STYLES.forEach(s => {
            if (s.containerClass) bongoCatContainer.classList.remove(s.containerClass);
        });
        if (style.containerClass) bongoCatContainer.classList.add(style.containerClass);
        // Reset paws to idle
        pawLeft.style.backgroundImage = style.pawLeftUp;
        pawRight.style.backgroundImage = style.pawRightUp;
        // Update grid
        styleGrid.querySelectorAll(".bongoCostumeThumb").forEach(btn => {
            btn.classList.toggle("active", btn.dataset.outfit === style.id);
        });
        localStorage.setItem(STYLE_STORAGE_KEY, style.id);
    }

    // --- Build grids ---

    function buildCostumeGrid() {
        while (costumeGrid.firstChild) costumeGrid.removeChild(costumeGrid.firstChild);
        BONGO_OUTFITS.forEach(outfit => {
            const btn = document.createElement("button");
            btn.className = "bongoCostumeThumb";
            btn.dataset.outfit = outfit.id;
            const preview = document.createElement("div");
            preview.className = "bongoCostumePreview";
            if (outfit.id !== "default") preview.classList.add("preview-" + outfit.id);
            const label = document.createElement("span");
            label.className = "bongoCostumeLabel";
            label.id = outfit.labelKey;
            label.textContent = outfit.id.charAt(0).toUpperCase() + outfit.id.slice(1);
            btn.appendChild(preview);
            btn.appendChild(label);
            btn.addEventListener("click", () => applyOutfit(outfit.id));
            costumeGrid.appendChild(btn);
        });
    }

    function buildStyleGrid() {
        while (styleGrid.firstChild) styleGrid.removeChild(styleGrid.firstChild);
        BONGO_STYLES.forEach(style => {
            const btn = document.createElement("button");
            btn.className = "bongoCostumeThumb";
            btn.dataset.outfit = style.id;
            const preview = document.createElement("div");
            preview.className = "bongoCostumePreview";
            if (style.id !== "simple") preview.classList.add("preview-style-" + style.id);
            const label = document.createElement("span");
            label.className = "bongoCostumeLabel";
            label.id = style.labelKey;
            label.textContent = style.id.charAt(0).toUpperCase() + style.id.slice(1);
            btn.appendChild(preview);
            btn.appendChild(label);
            btn.addEventListener("click", () => applyStyle(style.id));
            styleGrid.appendChild(btn);
        });
    }

    // --- Show/hide all settings rows ---

    function showSettingsRows() {
        costumeRow.classList.remove("bongoCostumeHidden");
        styleRow.classList.remove("bongoCostumeHidden");
        posRow.classList.remove("bongoCostumeHidden");
    }

    function hideSettingsRows() {
        costumeRow.classList.add("bongoCostumeHidden");
        styleRow.classList.add("bongoCostumeHidden");
        posRow.classList.add("bongoCostumeHidden");
    }

    // --- Toggle visibility ---

    bongoCatCheckbox.addEventListener("change", function () {
        saveCheckboxState("bongoCatCheckboxState", bongoCatCheckbox);
        if (bongoCatCheckbox.checked) {
            bongoCatWidget.style.display = "block";
            saveDisplayStatus("bongoCatDisplayStatus", "block");
            showSettingsRows();
        } else {
            bongoCatWidget.style.display = "none";
            saveDisplayStatus("bongoCatDisplayStatus", "none");
            hideSettingsRows();
        }
    });

    // --- Load saved state ---

    loadCheckboxState("bongoCatCheckboxState", bongoCatCheckbox);
    const savedStatus = localStorage.getItem("bongoCatDisplayStatus");
    if (savedStatus === "block") {
        bongoCatWidget.style.display = "block";
    } else {
        bongoCatWidget.style.display = "none";
    }

    // --- Initialize all grids ---

    buildCostumeGrid();
    buildStyleGrid();

    applyOutfit(localStorage.getItem(OUTFIT_STORAGE_KEY) || "default");
    applyStyle(localStorage.getItem(STYLE_STORAGE_KEY) || "simple");

    if (bongoCatCheckbox.checked) {
        showSettingsRows();
    } else {
        hideSettingsRows();
    }

    // --- Drag functionality ---

    function initPosition() {
        const saved = localStorage.getItem(POS_STORAGE_KEY);
        if (saved) {
            try {
                const savedPosition = JSON.parse(saved);
                const top = Number(savedPosition.top);
                const left = Number(savedPosition.left);
                if (!Number.isFinite(top) || !Number.isFinite(left)) throw new Error("Invalid position");
                const pos = clampPosition(top, left);
                bongoCatWidget.style.bottom = "auto";
                bongoCatWidget.style.top = pos.top + "px";
                bongoCatWidget.style.left = pos.left + "px";
            } catch {
                localStorage.removeItem(POS_STORAGE_KEY);
            }
        }
    }

    function clampPosition(top, left) {
        const maxTop = window.innerHeight - bongoCatWidget.offsetHeight;
        const maxLeft = window.innerWidth - bongoCatWidget.offsetWidth;
        return {
            top: Math.max(0, Math.min(top, maxTop)),
            left: Math.max(0, Math.min(left, maxLeft))
        };
    }

    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    dragHandle.addEventListener("pointerdown", function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        isDragging = true;
        dragHandle.setPointerCapture(e.pointerId);

        const rect = bongoCatWidget.getBoundingClientRect();
        bongoCatWidget.style.bottom = "auto";
        bongoCatWidget.style.top = rect.top + "px";
        bongoCatWidget.style.left = rect.left + "px";

        dragOffsetX = e.clientX - rect.left;
        dragOffsetY = e.clientY - rect.top;
    });

    document.addEventListener("pointermove", function (e) {
        if (isDragging) {
            const pos = clampPosition(
                e.clientY - dragOffsetY,
                e.clientX - dragOffsetX
            );
            bongoCatWidget.style.top = pos.top + "px";
            bongoCatWidget.style.left = pos.left + "px";
        }

        // Proximity detection for drag handle visibility
        if (bongoCatWidget.style.display !== "none") {
            const rect = bongoCatWidget.getBoundingClientRect();
            const margin = 40;
            const near = e.clientX >= rect.left - margin &&
                         e.clientX <= rect.right + margin &&
                         e.clientY >= rect.top - margin &&
                         e.clientY <= rect.bottom + margin;
            dragHandle.classList.toggle("bongo-drag-near", near);
        }
    });

    function finishDrag() {
        if (isDragging) {
            isDragging = false;
            const rect = bongoCatWidget.getBoundingClientRect();
            localStorage.setItem(POS_STORAGE_KEY, JSON.stringify({
                top: rect.top,
                left: rect.left
            }));
        }
    }

    document.addEventListener("pointerup", finishDrag);
    document.addEventListener("pointercancel", finishDrag);

    window.addEventListener("resize", function () {
        if (localStorage.getItem(POS_STORAGE_KEY)) {
            const rect = bongoCatWidget.getBoundingClientRect();
            const pos = clampPosition(rect.top, rect.left);
            bongoCatWidget.style.top = pos.top + "px";
            bongoCatWidget.style.left = pos.left + "px";
        }
    });

    resetPosBtn.addEventListener("click", function () {
        localStorage.removeItem(POS_STORAGE_KEY);
        bongoCatWidget.style.top = "";
        bongoCatWidget.style.bottom = "10px";
        bongoCatWidget.style.left = "10px";
    });

    initPosition();

    // --- Keyboard animation ---

    const pressedKeys = new Set();
    const bongoCatHead = document.getElementById("bongoCatHead");

    document.addEventListener("keydown", function (e) {
        if (pressedKeys.has(e.code)) return;
        pressedKeys.add(e.code);

        if (bongoCatWidget.style.display === "none") return;

        if (currentStyleConfig.useBounce) {
            // Cute style: CSS bounce animation
            bongoCatHead.classList.remove("bongo-bounce-left", "bongo-bounce-right");
            // Force reflow so animation replays
            void bongoCatHead.offsetWidth;
            bongoCatHead.classList.add(nextPawIsLeft ? "bongo-bounce-left" : "bongo-bounce-right");
        } else {
            // Simple style: swap paw images
            if (nextPawIsLeft) {
                pawLeft.style.backgroundImage = currentStyleConfig.pawLeftDown;
                pawRight.style.backgroundImage = currentStyleConfig.pawRightUp;
            } else {
                pawRight.style.backgroundImage = currentStyleConfig.pawRightDown;
                pawLeft.style.backgroundImage = currentStyleConfig.pawLeftUp;
            }
        }
        nextPawIsLeft = !nextPawIsLeft;
    });

    document.addEventListener("keyup", function (e) {
        pressedKeys.delete(e.code);

        if (bongoCatWidget.style.display === "none") return;

        if (pressedKeys.size === 0) {
            if (currentStyleConfig.useBounce) {
                // Remove bounce classes when all keys released
                bongoCatHead.classList.remove("bongo-bounce-left", "bongo-bounce-right");
            } else {
                // Reset paws to idle
                pawLeft.style.backgroundImage = currentStyleConfig.pawLeftUp;
                pawRight.style.backgroundImage = currentStyleConfig.pawRightUp;
            }
        }
    });
});

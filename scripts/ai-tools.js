/*
 * Material You NewTab
 * Copyright (c) 2023-2025 XengShi
 * Licensed under the GNU General Public License v3.0 (GPL-3.0)
 * You should have received a copy of the GNU General Public License along with this program.
 * If not, see <https://www.gnu.org/licenses/>.
 */

// Define the list of available AI tools and their default visibility
const aiToolsRaw = [
    { id: "chatGPT", visible: true, order: 0 },
    { id: "claude", visible: true, order: 1 },
    { id: "youtube", visible: true, order: 2 },
];
// Translations for AI tools
const aiTools = aiToolsRaw.map(tool => ({
    ...tool,
    label: translations[currentLanguage]?.[tool.id] || translations["en"][tool.id]
}));

function getDefaultAIToolsSettings() {
    return aiTools.map(tool => tool.visible ? tool.id : { [tool.id]: false });
}

function getAIToolId(setting) {
    if (typeof setting === "string") return setting;
    if (!setting || typeof setting !== "object") return null;
    return Object.keys(setting)[0] || null;
}

function loadAIToolsSettings() {
    let savedSettings;
    try {
        savedSettings = JSON.parse(localStorage.getItem("aiToolsSettings") || "null");
    } catch {
        savedSettings = null;
    }

    const validIds = new Set(aiTools.map(tool => tool.id));
    const seen = new Set();
    const settings = [];

    if (Array.isArray(savedSettings)) {
        savedSettings.forEach(setting => {
            const toolId = getAIToolId(setting);
            if (!validIds.has(toolId) || seen.has(toolId)) return;
            seen.add(toolId);
            settings.push(typeof setting === "string" ? toolId : { [toolId]: false });
        });
    }

    getDefaultAIToolsSettings().forEach(setting => {
        const toolId = getAIToolId(setting);
        if (!seen.has(toolId)) settings.push(setting);
    });

    localStorage.setItem("aiToolsSettings", JSON.stringify(settings));
    return settings;
}

function loadAIToolsCustom() {
    try { return MyntQuicklinkIcons.customOverrides(JSON.parse(localStorage.getItem("aiToolsCustom") || "{}")); }
    catch { return {}; }
}

function resetAIToolsCustom() {
    localStorage.removeItem("aiToolsCustom");
    applyAIToolsSettings(getDefaultAIToolsSettings());
}

// DOM Elements
const aiToolName = document.getElementById("toolsCont");
const shortcuts = document.getElementById("shortcutsContainer");
const aiToolsIcon = document.getElementById("aiToolsIcon");
const aiToolsSettingsModal = document.getElementById("aiToolsSettingsModal");
const aiToolsForm = document.getElementById("aiToolsForm");
const closeAISettingsBtn = document.getElementById("closeAISettingsBtn");
const resetAISettingsBtn = document.getElementById("resetAISettingsBtn");
const saveAISettingsBtn = document.getElementById("saveAISettingsBtn");
const aiToolsEditButton = document.getElementById("aiToolsEditButton");
const aiToolsCont = document.getElementById("aiToolsCont");
const aiToolsEditField = document.getElementById("aiToolsEditField");
const mobileAIToolsQuery = matchMedia("(max-width: 500px)");
let aiSettingsReturnFocus = null;
let aiToolsEditorBaseline = null;
const aiToolsMoreButton = document.createElement("button");
const aiToolsOverflowMenu = document.createElement("div");

aiToolsMoreButton.id = "aiToolsMoreButton";
aiToolsMoreButton.type = "button";
aiToolsMoreButton.hidden = true;
aiToolsMoreButton.setAttribute("aria-expanded", "false");
aiToolsMoreButton.setAttribute("aria-controls", "aiToolsOverflowMenu");
aiToolsMoreButton.innerHTML = `
    <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="5" cy="12" r="2"></circle><circle cx="12" cy="12" r="2"></circle><circle cx="19" cy="12" r="2"></circle></svg>
    <span>${translations[currentLanguage]?.aiToolsMore || translations.en.aiToolsMore}</span>
`;
aiToolsOverflowMenu.id = "aiToolsOverflowMenu";
aiToolsOverflowMenu.className = "aiToolsOverflowMenu";
aiToolsOverflowMenu.hidden = true;
aiToolsOverflowMenu.setAttribute("aria-hidden", "true");
aiToolsCont.appendChild(aiToolsOverflowMenu);

function closeMobileAIToolsOverflow() {
    aiToolsOverflowMenu.hidden = true;
    aiToolsOverflowMenu.setAttribute("aria-hidden", "true");
    aiToolsMoreButton.setAttribute("aria-expanded", "false");
}

function layoutAIToolsForViewport() {
    [...aiToolsOverflowMenu.querySelectorAll("a")].forEach(link => aiToolName.appendChild(link));
    aiToolsMoreButton.remove();
    aiToolName.classList.remove("mobilePinnedTools");
    aiToolName.classList.toggle("mobileToolsLayout", mobileAIToolsQuery.matches);
    closeMobileAIToolsOverflow();

    const visibleLinks = [...aiToolName.querySelectorAll("a")].filter(link => link.style.display !== "none");
    aiToolName.style.setProperty("--mobile-tool-columns", String(Math.max(1, Math.min(4, visibleLinks.length))));
    if (!mobileAIToolsQuery.matches || visibleLinks.length <= 3) {
        aiToolsMoreButton.hidden = true;
        return;
    }

    visibleLinks.slice(3).forEach(link => aiToolsOverflowMenu.appendChild(link));
    aiToolsMoreButton.hidden = false;
    aiToolName.appendChild(aiToolsMoreButton);
    aiToolName.classList.add("mobilePinnedTools");
    aiToolName.style.setProperty("--mobile-tool-columns", "4");
}

// Animation helper function
function animateReorder(element1, element2, direction) {
    return new Promise((resolve) => {
        // Get the current positions
        const rect1 = element1.getBoundingClientRect();
        const rect2 = element2.getBoundingClientRect();

        // Calculate the distance to move
        const distance = Math.abs(rect1.top - rect2.top);

        // Set CSS custom properties for the distance
        element1.style.setProperty("--move-distance", `${distance}px`);
        element2.style.setProperty("--move-distance", `${distance}px`);

        // Get button references
        const element1UpBtn = element1.querySelector(".reorder-up");
        const element1DownBtn = element1.querySelector(".reorder-down");
        const element2UpBtn = element2.querySelector(".reorder-up");
        const element2DownBtn = element2.querySelector(".reorder-down");

        // Disable interactions
        element1.style.pointerEvents = "none";
        element2.style.pointerEvents = "none";

        // Add animation classes
        if (direction === "up") {
            element1.classList.add("reorder-animate-up");
            element2.classList.add("reorder-animate-down");
        } else {
            element1.classList.add("reorder-animate-down");
            element2.classList.add("reorder-animate-up");
        }

        // Update button states at halfway point
        setTimeout(() => {
            [element1UpBtn.disabled, element2UpBtn.disabled] = [element2UpBtn.disabled, element1UpBtn.disabled];
            [element1DownBtn.disabled, element2DownBtn.disabled] = [element2DownBtn.disabled, element1DownBtn.disabled];
        }, 150);

        // Complete animation
        setTimeout(() => {
            // Perform DOM swap
            if (direction === "up") {
                aiToolsForm.insertBefore(element1, element2);
            } else {
                aiToolsForm.insertBefore(element2, element1);
            }

            // Clean up
            [element1, element2].forEach(el => {
                el.classList.remove("reorder-animate-up", "reorder-animate-down");
                el.style.removeProperty("--move-distance");
                el.style.pointerEvents = "";
            });

            updateReorderButtonStates();
            resolve();
        }, 300);
    });
}

// Function to apply saved settings (visibility and order)
function applyAIToolsSettings(settingsOverride) {
    const settingsToApply = settingsOverride || loadAIToolsSettings();
    const custom = loadAIToolsCustom();

    // Create a map of current tool elements for quick lookup
    const toolElements = new Map();
    const allToolLinks = aiToolsCont.querySelectorAll("a");
    allToolLinks.forEach(link => {
        const toolId = [...link.children].find(el => aiToolsRaw.some(t => t.id === el.id))?.id;
        if (toolId) {
            toolElements.set(toolId, link);
            const icon = link.querySelector(".tIcon");
            if (!link._myntDefault) link._myntDefault = { url: link.href, icon: [...icon.children] };
            const overrides = custom[toolId] || {};
            link.href = overrides.url || link._myntDefault.url;
            link.querySelector(".tLabel").textContent = overrides.label || translations[currentLanguage]?.[toolId] || translations.en[toolId];
            MyntQuicklinkIcons.render(icon, overrides.icon || "", { automatic: target => target.replaceChildren(...link._myntDefault.icon) });
        }
    });

    // Clear container
    aiToolName.innerHTML = "";

    // Append tools in order based on settings
    settingsToApply.forEach(item => {
        const toolId = getAIToolId(item);
        const isVisible = typeof item === "string";

        const toolElement = toolElements.get(toolId);
        if (toolElement) {
            toolElement.style.display = isVisible ? "flex" : "none";
            aiToolName.appendChild(toolElement);
        }
    });
    layoutAIToolsForViewport();
}

// Function to generate the AI Tools settings form elements
function generateAIToolsForm(settings) {
    aiToolsForm.innerHTML = "";
    aiToolsEditorBaseline = ["aiToolsSettings", "aiToolsCustom"].map(key => localStorage.getItem(key));

    const custom = loadAIToolsCustom();
    // Create form elements
    settings.forEach((settingItem, index) => {
        const toolId = getAIToolId(settingItem);
        const isVisible = typeof settingItem === "string";

        const originalTool = aiTools.find(t => t.id === toolId);
        const toolLabel = translations[currentLanguage]?.[toolId] || originalTool?.label || toolId;

        const toolOption = document.createElement("div");
        toolOption.className = "ai-tool-option";
        toolOption.dataset.toolId = toolId;
        const controls = document.createElement("div"); controls.className = "ai-tool-controls";
        const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.id = `setting_${toolId}`; checkbox.checked = isVisible;
        const label = document.createElement("label"); label.setAttribute("for", checkbox.id); label.textContent = custom[toolId]?.label || toolLabel;
        controls.append(checkbox, label);
        const reorder = document.createElement("div"); reorder.className = "ai-tool-reorder";
        for (const [direction, symbol, disabled] of [["up", "↑", index === 0], ["down", "↓", index === settings.length - 1]]) {
            const button = document.createElement("button"); button.type = "button"; button.className = `reorder-${direction}`; button.textContent = symbol; button.disabled = disabled;
            button.setAttribute("aria-label", MyntQuicklinkIcons.t(direction === "up" ? "shortcutMoveUp" : "shortcutMoveDown").replace("{name}", toolLabel));
            reorder.appendChild(button);
        }
        toolOption.append(controls, reorder);
        const fields = document.createElement("div");
        fields.className = "aiToolCustomFields"; fields.id = `aiToolFields_${toolId}`; fields.hidden = true;
        const edit = document.createElement("button"); edit.type = "button"; edit.className = "aiToolEdit";
        edit.textContent = MyntQuicklinkIcons.t("quicklinkEdit");
        edit.setAttribute("aria-expanded", "false"); edit.setAttribute("aria-controls", fields.id);
        edit.setAttribute("aria-label", MyntQuicklinkIcons.t("quicklinkEdit") + "：" + label.textContent);
        edit.addEventListener("click", () => {
            fields.hidden = !fields.hidden; edit.setAttribute("aria-expanded", String(!fields.hidden));
        });
        const currentIcon = document.createElement("span"); currentIcon.className = "aiToolCurrentIcon";
        currentIcon.setAttribute("aria-hidden", "true");
        controls.appendChild(currentIcon); toolOption.appendChild(edit);
        const overrides = custom[toolId] || {};
        const toolLink = document.getElementById(toolId)?.parentElement;
        function field(key, className, value, placeholder) {
            const label = document.createElement("label");
            label.textContent = MyntQuicklinkIcons.t(key);
            const input = document.createElement("input");
            input.type = "text"; input.className = className; input.value = value || ""; input.placeholder = placeholder || "";
            if (className === "aiToolName") input.maxLength = 80; // Code-point validation also handles supplementary characters.
            label.appendChild(input); fields.appendChild(label); return input;
        }
        const nameInput = field("quicklinkName", "aiToolName", overrides.label, toolLabel);
        const urlInput = field("quicklinkUrl", "aiToolUrl", overrides.url, toolLink?._myntDefault?.url || toolLink?.href);
        const iconInput = document.createElement("input"); iconInput.type = "hidden"; iconInput.className = "aiToolIcon"; iconInput.value = overrides.icon || ""; fields.appendChild(iconInput);
        const automatic = target => {
            // Preview clones only bundled default artwork; never serialized user content.
            const artwork = toolLink?._myntDefault?.icon || [];
            target.replaceChildren(...artwork.map(node => node.cloneNode(true)));
        };
        const refreshCurrentIcon = () => MyntQuicklinkIcons.render(currentIcon, iconInput.value, { automatic });
        refreshCurrentIcon();
        fields.appendChild(MyntQuicklinkIcons.chooseButton({
            getValue: () => iconInput.value,
            getLabel: () => nameInput.value || toolLabel,
            getUrl: () => urlInput.value || toolLink?._myntDefault?.url,
            automatic,
            onSelect(value) { iconInput.value = value; refreshCurrentIcon(); }
        }));
        const error = document.createElement("p"); error.className = "aiToolCustomError"; error.setAttribute("role", "status"); fields.appendChild(error);
        toolOption.appendChild(fields);
        aiToolsForm.appendChild(toolOption);
    });

    updateReorderButtonStates();
}

// One delegated listener survives form re-renders without being duplicated.
aiToolsForm.addEventListener("click", async (event) => {
    const upButton = event.target.closest(".reorder-up");
    const downButton = event.target.closest(".reorder-down");

    if (!upButton && !downButton) return;

    const toolOption = event.target.closest(".ai-tool-option");
    if (!toolOption) return;

    if (event.target.disabled || event.target.dataset.animating === "true") return;
    event.target.dataset.animating = "true";

    if (upButton) {
        const prevToolOption = toolOption.previousElementSibling;
        if (prevToolOption) await animateReorder(toolOption, prevToolOption, "up");
    } else {
        const nextToolOption = toolOption.nextElementSibling;
        if (nextToolOption) await animateReorder(toolOption, nextToolOption, "down");
    }

    event.target.dataset.animating = "false";
});

// Function to show AI Tools settings modal
function showAIToolsSettings() {
    if (aiToolsSettingsModal.open) return;
    aiSettingsReturnFocus = document.activeElement;
    // Clear previous form content
    aiToolsForm.innerHTML = "";

    const savedSettings = loadAIToolsSettings();

    // Generate the form with the saved settings
    generateAIToolsForm(savedSettings);

    closeAISettingsBtn.setAttribute("aria-label", translations[currentLanguage]?.aiSettingsClose || translations.en.aiSettingsClose);
    aiToolsSettingsModal.showModal();
    closeAISettingsBtn.focus();
}

// Function to update the enabled/disabled state of reorder buttons
function updateReorderButtonStates() {
    const toolOptions = document.querySelectorAll(".ai-tool-option");

    toolOptions.forEach((option, index) => {
        const upButton = option.querySelector(".reorder-up");
        const downButton = option.querySelector(".reorder-down");

        if (upButton) {
            // Disable the first up button
            upButton.disabled = index === 0;
        }

        if (downButton) {
            // Disable the last down button
            downButton.disabled = index === toolOptions.length - 1;
        }
    });
}

function aiToolsEditorIsFresh() {
    const current = ["aiToolsSettings", "aiToolsCustom"].map(key => localStorage.getItem(key));
    if (!aiToolsEditorBaseline || current.every((value, index) => value === aiToolsEditorBaseline[index])) return true;
    const error = aiToolsForm.querySelector(".aiToolCustomError");
    if (error) { const option = error.closest(".ai-tool-option"); if (option.querySelector(".aiToolCustomFields").hidden) option.querySelector(".aiToolEdit").click(); error.textContent = MyntQuicklinkIcons.t("quicklinkConflict"); }
    return false;
}

// Function to close settings modal
function closeAIToolsSettings() {
    aiToolsSettingsModal.close();
}

aiToolsSettingsModal.addEventListener("close", () => {
    if (aiSettingsReturnFocus?.isConnected) aiSettingsReturnFocus.focus();
    aiSettingsReturnFocus = null;
});

// Function to toggle AI Tools panel
let isAIToolsTransitioning = false;

function toggleAITools(event) {
    if (isAIToolsTransitioning) return;
    isAIToolsTransitioning = true;

    const shortcutsCheckbox = document.getElementById("shortcutsCheckbox");
    const isAIToolVisible = aiToolName.style.display === "flex";

    // Prevent outside click handler from triggering
    if (event) event.stopPropagation();

    if (isAIToolVisible) {
        // Hide AI Tool panel
        aiToolsIcon.setAttribute("aria-expanded", "false");
        if (shortcutsCheckbox.checked) {
            shortcuts.style.display = "flex";
        } else {
            shortcuts.style.display = "none";
        }

        aiToolName.style.opacity = "0";
        aiToolName.style.gap = "0";
        aiToolName.style.transform = "translateX(-100%)";

        setTimeout(() => {
            aiToolName.style.display = "none";
            isAIToolsTransitioning = false;
        }, 500);
    } else {
        // Show AI Tool panel
        aiToolsIcon.setAttribute("aria-expanded", "true");
        shortcuts.style.display = "none";
        aiToolName.style.display = "flex";

        requestAnimationFrame(() => {
            aiToolName.style.opacity = "1";
            aiToolName.style.transform = "translateX(0)";
        });

        setTimeout(() => {
            aiToolName.style.gap = "12px";
            isAIToolsTransitioning = false;
        }, 300);
    }
}

// Event Listeners
document.addEventListener("DOMContentLoaded", function () {
    // Apply saved settings
    applyAIToolsSettings();

    // Allow horizontal scrolling with the mouse wheel
    aiToolsCont.addEventListener("wheel", (event) => {
        // Check if the container is scrollable in x-axis
        if (aiToolsCont.scrollWidth > aiToolsCont.clientWidth) {
            if (event.deltaY !== 0) {
                event.preventDefault(); // Prevent vertical scrolling
                // Apply the deltaY from the wheel event to horizontal scroll
                aiToolsCont.scrollLeft += event.deltaY;
            }
        }
    }, { passive: false });

    // AI Tools icon click handler
    aiToolsIcon.addEventListener("click", toggleAITools);

    aiToolsMoreButton.addEventListener("click", event => {
        event.stopPropagation();
        const open = aiToolsOverflowMenu.hidden;
        aiToolsOverflowMenu.hidden = !open;
        aiToolsOverflowMenu.setAttribute("aria-hidden", String(!open));
        aiToolsMoreButton.setAttribute("aria-expanded", String(open));
    });
    mobileAIToolsQuery.addEventListener?.("change", layoutAIToolsForViewport);

    // AI Tools icon right-click handler
    aiToolsIcon.addEventListener("contextmenu", function (e) {
        e.preventDefault();
        e.stopPropagation();
        showAIToolsSettings();
    });

    // AI Tools edit button click handler
    aiToolsEditButton.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        showAIToolsSettings();
    });

    // Close button in settings modal
    closeAISettingsBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        closeAIToolsSettings();
    });

    // Reset button in settings modal
    resetAISettingsBtn.addEventListener("click", function () {
        if (!aiToolsEditorIsFresh()) return;
        resetAIToolsCustom();
        // Create default settings
        const defaultSettings = getDefaultAIToolsSettings();

        // Generate the form with default settings
        generateAIToolsForm(defaultSettings);

        // Animate the list reset
        const toolsList = document.querySelector(".ai-tools-list");
        const toolOptions = document.querySelectorAll(".ai-tool-option");

        // Add shake animation to the entire list
        toolsList.style.animation = "resetShake 0.6s ease-in-out";

        // Staggered fade effect for each option
        toolOptions.forEach((option, index) => {
            setTimeout(() => {
                option.style.animation = "resetFlash 0.4s ease-in-out";

                // Update checkbox during animation
                const toolId = option.dataset.toolId;
                const checkbox = document.getElementById(`setting_${toolId}`);
                const defaultTool = aiTools.find(t => t.id === toolId);

                if (defaultTool && checkbox) {
                    checkbox.checked = defaultTool.visible;
                }
            }, index * 50); // Stagger by 50ms
        });

        // Briefly disable the reset button to prevent multiple clicks
        resetAISettingsBtn.disabled = true;

        // Clean up all animation properties and restore button
        setTimeout(() => {
            toolsList.style.animation = "";
            toolOptions.forEach(option => {
                option.style.animation = "";
                option.style.transform = "";
                option.style.backgroundColor = "";
            });
            resetAISettingsBtn.disabled = false;
        }, 700);
    });

    // Save button in settings modal
    saveAISettingsBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!aiToolsEditorIsFresh()) return;

        const custom = {};
        for (const option of document.querySelectorAll(".ai-tool-option")) {
            const name = option.querySelector(".aiToolName"), url = option.querySelector(".aiToolUrl"), icon = option.querySelector(".aiToolIcon");
            const fields = { label: name.value.trim(), url: url.value.trim(), icon: icon.value.trim() };
            try {
                const clean = MyntQuicklinkIcons.customOverrides({ [option.dataset.toolId]: fields }, true);
                const toolId = option.dataset.toolId, overrides = clean[toolId];
                if (overrides) {
                    const defaultLabel = translations[currentLanguage]?.[toolId] || translations.en[toolId];
                    if (overrides.label === defaultLabel) delete overrides.label;
                    if (overrides.url === document.getElementById(toolId)?.parentElement?._myntDefault?.url) delete overrides.url;
                    if (!Object.keys(overrides).length) delete clean[toolId];
                }
                Object.assign(custom, clean);
                option.querySelector(".aiToolCustomError").textContent = "";
                [name, url, icon].forEach(input => input.removeAttribute("aria-invalid"));
            } catch {
                option.querySelector(".aiToolCustomError").textContent = MyntQuicklinkIcons.t("quicklinkInvalidFields");
                const editor = option.querySelector(".aiToolCustomFields");
                if (editor.hidden) option.querySelector(".aiToolEdit").click();
                const invalid = Array.from(fields.label).length > 40 ? name : fields.url && !MyntQuicklinkIcons.normalizeWebsiteUrl(fields.url) ? url : icon;
                invalid.setAttribute("aria-invalid", "true"); (invalid === icon ? option.querySelector(".quicklinkChooseIcon") : invalid).focus(); return;
            }
        }
        const newSettings = [];
        const toolOptions = document.querySelectorAll(".ai-tool-option");

        // Save each tool's visibility based on current order in the form
        toolOptions.forEach((option) => {
            const toolId = option.dataset.toolId;
            const isVisible = document.getElementById(`setting_${toolId}`).checked;

            // Add to array based on visibility
            if (isVisible) {
                // For visible tools, just add the ID string
                newSettings.push(toolId);
            } else {
                // For hidden tools, add an object with the ID as key and false as value
                const hiddenTool = {};
                hiddenTool[toolId] = false;
                newSettings.push(hiddenTool);
            }
        });

        // Save settings to localStorage
        // Roll back both keys if storage fails partway through saving.
        const previousSettings = localStorage.getItem("aiToolsSettings");
        const previousCustom = localStorage.getItem("aiToolsCustom");
        try {
            localStorage.setItem("aiToolsSettings", JSON.stringify(newSettings));
            if (Object.keys(custom).length) localStorage.setItem("aiToolsCustom", JSON.stringify(custom));
            else localStorage.removeItem("aiToolsCustom");
        } catch {
            try {
                if (previousSettings === null) localStorage.removeItem("aiToolsSettings"); else localStorage.setItem("aiToolsSettings", previousSettings);
                if (previousCustom === null) localStorage.removeItem("aiToolsCustom"); else localStorage.setItem("aiToolsCustom", previousCustom);
            } catch { /* Keep the modal and its draft available for recovery. */ }
            const error = aiToolsForm.querySelector(".aiToolCustomError");
            if (error) { const option = error.closest(".ai-tool-option"); if (option.querySelector(".aiToolCustomFields").hidden) option.querySelector(".aiToolEdit").click(); error.textContent = MyntQuicklinkIcons.t("quicklinkSaveFailed"); }
            return;
        }

        // Apply new settings
        applyAIToolsSettings();

        // Close modal
        closeAIToolsSettings();
    });

    // The native dialog handles Escape, focus containment and modal semantics.
    aiToolsSettingsModal.addEventListener("click", event => {
        if (event.target !== aiToolsSettingsModal) return;
        const rect = aiToolsSettingsModal.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeAIToolsSettings();
    });

    // Handle checkbox state for AI Tools visibility
    const aiToolsCheckbox = document.getElementById("aiToolsCheckbox");

    aiToolsCheckbox.addEventListener("change", function () {
        saveCheckboxState("aiToolsCheckboxState", aiToolsCheckbox);
        if (aiToolsCheckbox.checked) {
            aiToolsCont.style.display = "flex";
            saveDisplayStatus("aiToolsDisplayStatus", "flex");
            aiToolsEditField.classList.remove("inactive");
        } else {
            aiToolName.style.display = "none";
            aiToolsIcon.setAttribute("aria-expanded", "false");
            aiToolsCont.style.display = "none";
            saveDisplayStatus("aiToolsDisplayStatus", "none");
            aiToolsEditField.classList.add("inactive");
        }
    });

    // Load saved state
    loadCheckboxState("aiToolsCheckboxState", aiToolsCheckbox);
    loadDisplayStatus("aiToolsDisplayStatus", aiToolsCont);
    if (aiToolsCheckbox.checked) {
        aiToolsEditField.classList.remove("inactive");
    } else {
        aiToolsEditField.classList.add("inactive");
    }

    // Collapse when clicking outside toolsCont (but not if settings modal is open)
    document.addEventListener("click", (event) => {
        const isSettingsModalOpen = aiToolsSettingsModal.open;
        if (!aiToolsCont.contains(event.target)) closeMobileAIToolsOverflow();
        if (!aiToolsCont.contains(event.target) && aiToolName.style.display === "flex" && !isSettingsModalOpen) {
            toggleAITools();
        }
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape") closeMobileAIToolsOverflow();
    });
});

// Preserve an open editor's draft while applying remote saved values to the chips.
window.MyntStorageSync?.watch(["aiToolsSettings", "aiToolsCustom"], () => applyAIToolsSettings());
document.addEventListener("mynt:language-changed", () => {
    applyAIToolsSettings();
    if (!aiToolsSettingsModal.open) generateAIToolsForm(loadAIToolsSettings());
});

// The adapter validates this array before committing. Avoid the ordinary loader's writes.
window.myntAiPreferences = { reload() {
    const settings = JSON.parse(localStorage.getItem('aiToolsSettings') || 'null') || getDefaultAIToolsSettings();
    applyAIToolsSettings(settings);
    const visible = localStorage.getItem('aiToolsCheckboxState') === 'checked';
    const checkbox = document.getElementById('aiToolsCheckbox');
    if (checkbox) checkbox.checked = visible;
    aiToolsCont.style.display = visible ? 'flex' : 'none';
    aiToolsEditField.classList.toggle('inactive', !visible);
    if (!visible) { aiToolName.style.display = 'none'; aiToolsIcon.setAttribute('aria-expanded', 'false'); }
} };

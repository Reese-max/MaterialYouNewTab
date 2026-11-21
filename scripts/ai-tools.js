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

// User-added AI tools live in their own key so aiToolsSettings keeps exactly the three built-ins.
const AI_USER_TOOLS_KEY = "aiToolsUserTools";
const AI_EDITOR_KEYS = ["aiToolsSettings", "aiToolsCustom", AI_USER_TOOLS_KEY];
const SVG_NS = "http://www.w3.org/2000/svg";
const aiUserIconKeys = new WeakMap();

function aiText(key, fallback) {
    return translations[currentLanguage]?.[key] || translations.en?.[key] || fallback;
}

// A malformed or newer record is shown without its tools and never overwritten by this editor.
function loadAIUserTools() {
    const empty = intact => ({ version: 1, tools: [], order: [], intact });
    let raw;
    try { raw = localStorage.getItem(AI_USER_TOOLS_KEY); } catch { return empty(false); }
    if (raw === null) return empty(true);
    let parsed;
    try { parsed = JSON.parse(raw); } catch { return empty(false); }
    let intact = true;
    try { MyntQuicklinkIcons.userAITools(parsed, true); } catch { intact = false; }
    return { ...MyntQuicklinkIcons.userAITools(parsed), intact };
}

// Local-only fallback icon: the favicon only when its optional permission is already granted,
// otherwise the first character of the name. No network request is made for user tools.
function renderAILetterIcon(target, label) {
    const svg = document.createElementNS(SVG_NS, "svg");
    for (const [key, value] of [["viewBox", "0 0 24 24"], ["width", "100%"], ["height", "100%"], ["aria-hidden", "true"]]) svg.setAttribute(key, value);
    const disc = document.createElementNS(SVG_NS, "rect");
    for (const [key, value] of [["class", "accentColor aiDarkIcons"], ["width", "100%"], ["height", "100%"], ["rx", "50%"]]) disc.setAttribute(key, value);
    const letter = document.createElementNS(SVG_NS, "text");
    for (const [key, value] of [["class", "bgLightTint notTargeted"], ["x", "12"], ["y", "12"], ["text-anchor", "middle"], ["dominant-baseline", "central"], ["font-size", "14"], ["font-weight", "700"]]) letter.setAttribute(key, value);
    letter.textContent = (MyntQuicklinkIcons.graphemes(String(label || "").trim())[0] || "?").toLocaleUpperCase();
    svg.append(disc, letter);
    target.replaceChildren(svg);
}

function renderAIAutomaticIcon(target, label, url) {
    const normalized = MyntQuicklinkIcons.normalizeWebsiteUrl(url);
    if (!normalized) { renderAILetterIcon(target, label); return; }
    const image = document.createElement("img");
    image.alt = ""; image.draggable = false;
    const fallback = () => { if (image.parentElement === target) renderAILetterIcon(target, label); };
    image.addEventListener("error", fallback, { once: true });
    target.replaceChildren(image);
    MyntQuicklinkIcons.websiteIcon(image, normalized, fallback);
}

function createAIUserToolLink(tool) {
    const link = document.createElement("a");
    link.dataset.aiUserTool = tool.id;
    const icon = document.createElement("div"); icon.className = "tIcon";
    const label = document.createElement("div"); label.className = "tLabel";
    link.append(icon, label);
    return link;
}

function updateAIUserToolLink(link, tool) {
    link.href = tool.url;
    link.querySelector(".tLabel").textContent = tool.label;
    const key = JSON.stringify([tool.label, tool.url, tool.icon || ""]);
    if (aiUserIconKeys.get(link) === key) return;
    aiUserIconKeys.set(link, key);
    MyntQuicklinkIcons.render(link.querySelector(".tIcon"), tool.icon || "", { automatic: target => renderAIAutomaticIcon(target, tool.label, tool.url) });
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
    const user = loadAIUserTools();

    // Create a map of current tool elements for quick lookup
    const toolElements = new Map();
    const allToolLinks = aiToolsCont.querySelectorAll("a");
    allToolLinks.forEach(link => {
        if (link.dataset.aiUserTool) { toolElements.set(link.dataset.aiUserTool, link); return; }
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

    // User tools: drop deleted links (including ones parked in the phone overflow menu), then create or refresh.
    const userIds = new Set(user.tools.map(tool => tool.id));
    for (const [toolId, link] of toolElements) {
        if (link.dataset.aiUserTool && !userIds.has(toolId)) { link.remove(); toolElements.delete(toolId); }
    }
    for (const tool of user.tools) {
        if (!toolElements.has(tool.id)) toolElements.set(tool.id, createAIUserToolLink(tool));
        updateAIUserToolLink(toolElements.get(tool.id), tool);
    }

    // Clear container
    aiToolName.innerHTML = "";

    // Append tools in order: built-ins follow aiToolsSettings, user tools keep their saved slots.
    const builtins = settingsToApply.map(item => ({ id: getAIToolId(item), visible: typeof item === "string" }))
        .filter(entry => MyntQuicklinkIcons.BUILTIN_AI_TOOL_IDS.includes(entry.id));
    MyntQuicklinkIcons.aiToolOrder(builtins, user).forEach(entry => {
        const toolElement = toolElements.get(entry.id);
        if (toolElement) {
            toolElement.style.display = entry.visible ? "flex" : "none";
            aiToolName.appendChild(toolElement);
        }
    });
    layoutAIToolsForViewport();
}

// Add/delete controls for user tools sit under the list; status messages are announced politely.
let aiToolsEditorUserIntact = true;
const aiToolsAddButton = document.createElement("button");
aiToolsAddButton.type = "button";
aiToolsAddButton.id = "aiToolsAddButton";
aiToolsAddButton.className = "ai-add-button";
const aiToolsStatus = document.createElement("p");
aiToolsStatus.id = "aiToolsStatus";
aiToolsStatus.className = "ai-tools-status";
aiToolsStatus.setAttribute("role", "status");
aiToolsForm.parentElement?.append(aiToolsAddButton, aiToolsStatus);

function setAIToolsStatus(message) {
    aiToolsStatus.textContent = message || "";
}

function aiUserToolOptions() {
    return aiToolsForm.querySelectorAll(".ai-tool-user");
}

function updateAIToolsAddButton() {
    const full = aiUserToolOptions().length >= MyntQuicklinkIcons.AI_USER_TOOLS_MAX;
    aiToolsAddButton.disabled = !aiToolsEditorUserIntact || full;
    aiToolsAddButton.title = full ? aiText("aiToolsLimit", "You can add up to {max} AI tools.").replace("{max}", MyntQuicklinkIcons.AI_USER_TOOLS_MAX) : "";
}

function newAIUserToolId() {
    const existing = new Set([...aiToolsForm.querySelectorAll(".ai-tool-option")].map(option => option.dataset.toolId));
    for (;;) {
        const bytes = globalThis.crypto?.getRandomValues ? globalThis.crypto.getRandomValues(new Uint8Array(10)) : Array.from({ length: 10 }, () => Math.floor(Math.random() * 256));
        const id = "u" + Array.from(bytes, byte => (byte % 36).toString(36)).join("");
        if (!existing.has(id)) return id;
    }
}

// One row of the editor. Built-in rows edit optional overrides; user rows hold the tool itself.
function buildAIToolOption({ toolId, label, visible, custom, nameValue, namePlaceholder, urlValue, urlPlaceholder, iconValue, automaticIcon, open = false }) {
    const toolOption = document.createElement("div");
    toolOption.className = custom ? "ai-tool-option ai-tool-user" : "ai-tool-option";
    toolOption.dataset.toolId = toolId;
    if (custom) toolOption.dataset.custom = "true";
    const controls = document.createElement("div"); controls.className = "ai-tool-controls";
    const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.id = `setting_${toolId}`; checkbox.checked = visible;
    const labelElement = document.createElement("label"); labelElement.setAttribute("for", checkbox.id); labelElement.textContent = label;
    controls.append(checkbox, labelElement);
    const reorder = document.createElement("div"); reorder.className = "ai-tool-reorder";
    const moveButtons = ["up", "down"].map(direction => {
        const button = document.createElement("button"); button.type = "button"; button.className = `reorder-${direction}`; button.textContent = direction === "up" ? "↑" : "↓";
        reorder.appendChild(button);
        return button;
    });
    toolOption.append(controls, reorder);
    const fields = document.createElement("div");
    fields.className = "aiToolCustomFields"; fields.id = `aiToolFields_${toolId}`; fields.hidden = !open;
    const edit = document.createElement("button"); edit.type = "button"; edit.className = "aiToolEdit";
    edit.textContent = MyntQuicklinkIcons.t("quicklinkEdit");
    edit.setAttribute("aria-expanded", String(open)); edit.setAttribute("aria-controls", fields.id);
    edit.addEventListener("click", () => {
        fields.hidden = !fields.hidden; edit.setAttribute("aria-expanded", String(!fields.hidden));
    });
    const currentIcon = document.createElement("span"); currentIcon.className = "aiToolCurrentIcon";
    currentIcon.setAttribute("aria-hidden", "true");
    controls.appendChild(currentIcon); toolOption.appendChild(edit);
    const deleteButton = custom ? document.createElement("button") : null;
    if (deleteButton) {
        deleteButton.type = "button"; deleteButton.className = "aiToolDelete";
        deleteButton.textContent = aiText("aiToolsDelete", "Delete");
        toolOption.appendChild(deleteButton);
    }
    function field(key, className, value, placeholder) {
        const label = document.createElement("label");
        // User tools have no default to fall back to, so their labels drop the "leave empty" hint.
        label.textContent = custom
            ? aiText(key === "quicklinkName" ? "aiToolsNameField" : "aiToolsUrlField", key === "quicklinkName" ? "Name (up to 40 characters)" : "Website URL")
            : MyntQuicklinkIcons.t(key);
        const input = document.createElement("input");
        input.type = "text"; input.className = className; input.value = value || ""; input.placeholder = placeholder || "";
        if (className === "aiToolName") input.maxLength = 80; // Code-point validation also handles supplementary characters.
        label.appendChild(input); fields.appendChild(label); return input;
    }
    const nameInput = field("quicklinkName", "aiToolName", nameValue, namePlaceholder);
    const urlInput = field("quicklinkUrl", "aiToolUrl", urlValue, urlPlaceholder);
    if (custom) { nameInput.required = true; urlInput.required = true; urlInput.setAttribute("inputmode", "url"); }
    const iconInput = document.createElement("input"); iconInput.type = "hidden"; iconInput.className = "aiToolIcon"; iconInput.value = iconValue || ""; fields.appendChild(iconInput);
    const automatic = custom
        ? target => renderAIAutomaticIcon(target, nameInput.value.trim() || "?", urlInput.value)
        : automaticIcon;
    const refreshCurrentIcon = () => MyntQuicklinkIcons.render(currentIcon, iconInput.value, { automatic });
    refreshCurrentIcon();
    const chooser = fields.appendChild(MyntQuicklinkIcons.chooseButton({
        getValue: () => iconInput.value,
        getLabel: () => nameInput.value || namePlaceholder,
        getUrl: () => urlInput.value || urlPlaceholder,
        automatic,
        onSelect(value) { iconInput.value = value; refreshCurrentIcon(); }
    }));
    const error = document.createElement("p"); error.className = "aiToolCustomError"; error.setAttribute("role", "status"); fields.appendChild(error);
    toolOption.appendChild(fields);

    const describe = () => {
        const name = labelElement.textContent;
        moveButtons[0].setAttribute("aria-label", MyntQuicklinkIcons.t("shortcutMoveUp").replace("{name}", name));
        moveButtons[1].setAttribute("aria-label", MyntQuicklinkIcons.t("shortcutMoveDown").replace("{name}", name));
        edit.setAttribute("aria-label", MyntQuicklinkIcons.t("quicklinkEdit") + "：" + name);
        deleteButton?.setAttribute("aria-label", aiText("aiToolsDeleteLabel", "Delete {name}").replace("{name}", name));
    };
    describe();
    // The automatic icon of a user tool follows its name and website while they are typed.
    const refreshAutomaticPreviews = () => { if (!iconInput.value) { refreshCurrentIcon(); chooser.refreshIcon?.(); } };
    if (custom) {
        nameInput.addEventListener("input", () => {
            labelElement.textContent = nameInput.value.trim() || aiText("aiToolsNewName", "New AI tool");
            describe();
            refreshAutomaticPreviews();
        });
        urlInput.addEventListener("change", refreshAutomaticPreviews);
        for (const input of [nameInput, urlInput]) input.addEventListener("input", () => { if (error.textContent) { error.textContent = ""; input.removeAttribute("aria-invalid"); } });
        deleteButton.addEventListener("click", () => {
            const name = labelElement.textContent;
            const siblings = [...aiToolsForm.children];
            const index = siblings.indexOf(toolOption);
            const next = siblings[index + 1] || siblings[index - 1] || null;
            toolOption.remove();
            updateReorderButtonStates();
            updateAIToolsAddButton();
            setAIToolsStatus(aiText("aiToolsDeletedDraft", "Removed “{name}”. Select Save to apply.").replace("{name}", name));
            (next ? document.getElementById(`setting_${next.dataset.toolId}`) : aiToolsAddButton)?.focus();
        });
    }
    return toolOption;
}

function buildBuiltinAIToolOption(toolId, visible, custom) {
    const originalTool = aiTools.find(t => t.id === toolId);
    const toolLabel = translations[currentLanguage]?.[toolId] || originalTool?.label || toolId;
    const overrides = custom[toolId] || {};
    const toolLink = document.getElementById(toolId)?.parentElement;
    return buildAIToolOption({
        toolId, visible, custom: false,
        label: overrides.label || toolLabel,
        nameValue: overrides.label, namePlaceholder: toolLabel,
        urlValue: overrides.url, urlPlaceholder: toolLink?._myntDefault?.url || toolLink?.href,
        iconValue: overrides.icon,
        // Preview clones only bundled default artwork; never serialized user content.
        automaticIcon: target => target.replaceChildren(...(toolLink?._myntDefault?.icon || []).map(node => node.cloneNode(true)))
    });
}

function buildUserAIToolOption(tool, visible, open = false) {
    return buildAIToolOption({
        toolId: tool.id, visible, custom: true, open,
        label: tool.label || aiText("aiToolsNewName", "New AI tool"),
        nameValue: tool.label, namePlaceholder: aiText("aiToolsNewName", "New AI tool"),
        urlValue: tool.url, urlPlaceholder: "https://",
        iconValue: tool.icon
    });
}

// Function to generate the AI Tools settings form elements
function generateAIToolsForm(settings, user = loadAIUserTools()) {
    aiToolsForm.innerHTML = "";
    aiToolsEditorBaseline = AI_EDITOR_KEYS.map(key => localStorage.getItem(key));
    aiToolsEditorUserIntact = user.intact !== false;

    const custom = loadAIToolsCustom();
    const builtins = settings.map(item => ({ id: getAIToolId(item), visible: typeof item === "string" }));
    const userById = new Map(user.tools.map(tool => [tool.id, tool]));
    // An unreadable record keeps its saved user tools untouched; only built-ins are editable then.
    const editableUser = aiToolsEditorUserIntact ? user : { tools: [], order: user.order };
    MyntQuicklinkIcons.aiToolOrder(builtins, editableUser).forEach(entry => {
        aiToolsForm.appendChild(entry.custom
            ? buildUserAIToolOption(userById.get(entry.id), entry.visible)
            : buildBuiltinAIToolOption(entry.id, entry.visible, custom));
    });

    aiToolsAddButton.textContent = "＋ " + aiText("aiToolsAdd", "Add AI tool");
    const hidden = document.getElementById("aiToolsCheckbox")?.checked === false;
    setAIToolsStatus(!aiToolsEditorUserIntact
        ? aiText("aiToolsUnreadable", "Saved custom AI tools could not be read and were left unchanged. Built-in tools can still be edited.")
        : hidden ? aiText("aiToolsHiddenNote", "AI tools are hidden on the home page. Turn them on in Settings → Manage components.") : "");
    updateAIToolsAddButton();
    updateReorderButtonStates();
}

aiToolsAddButton.addEventListener("click", () => {
    if (!aiToolsEditorUserIntact || aiUserToolOptions().length >= MyntQuicklinkIcons.AI_USER_TOOLS_MAX) { updateAIToolsAddButton(); return; }
    const option = buildUserAIToolOption({ id: newAIUserToolId(), label: "", url: "" }, true, true);
    aiToolsForm.appendChild(option);
    updateReorderButtonStates();
    updateAIToolsAddButton();
    option.scrollIntoView?.({ block: "nearest" });
    option.querySelector(".aiToolName").focus();
    setAIToolsStatus(aiUserToolOptions().length >= MyntQuicklinkIcons.AI_USER_TOOLS_MAX
        ? aiText("aiToolsLimit", "You can add up to {max} AI tools.").replace("{max}", MyntQuicklinkIcons.AI_USER_TOOLS_MAX)
        : aiText("aiToolsAddedDraft", "A new row was added. Enter a name and website, then select Save."));
});

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

// The shortcut editor lists only ordinary shortcuts, but AI tools share the same homepage row.
// Point people from there to the AI tools editor instead of leaving the AI pills unmanageable.
function localizeAIToolsShortcutCard() {
    const card = document.getElementById("aiToolsShortcutCard");
    if (!card) return;
    card.querySelector(".aiToolsShortcutCardTitle").textContent = aiText("aiToolsShortcutCardTitle", "AI tools");
    card.querySelector(".aiToolsShortcutCardInfo").textContent = aiText("aiToolsShortcutCardInfo", "ChatGPT, Claude and other AI tools also appear in the shortcut row. Add, hide, reorder or delete them here.");
    card.querySelector("button").textContent = aiText("aiToolsManage", "Manage AI tools");
}

function mountAIToolsShortcutCard() {
    const list = document.getElementById("shortcutList");
    if (!list?.parentElement || document.getElementById("aiToolsShortcutCard")) return;
    const card = document.createElement("section");
    card.id = "aiToolsShortcutCard"; card.className = "aiToolsShortcutCard";
    card.setAttribute("aria-labelledby", "aiToolsShortcutCardTitle");
    const title = document.createElement("h3"); title.id = "aiToolsShortcutCardTitle"; title.className = "aiToolsShortcutCardTitle";
    const info = document.createElement("p"); info.className = "aiToolsShortcutCardInfo";
    const manage = document.createElement("button"); manage.type = "button"; manage.id = "aiToolsShortcutManage";
    manage.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        showAIToolsSettings();
    });
    card.append(title, info, manage);
    list.parentElement.insertBefore(card, list.nextSibling);
    localizeAIToolsShortcutCard();
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
    const current = AI_EDITOR_KEYS.map(key => localStorage.getItem(key));
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

    mountAIToolsShortcutCard();

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

        const custom = {}, userTools = [], order = [], newSettings = [];
        for (const option of aiToolsForm.querySelectorAll(".ai-tool-option")) {
            const toolId = option.dataset.toolId, isUserTool = option.dataset.custom === "true";
            const name = option.querySelector(".aiToolName"), url = option.querySelector(".aiToolUrl"), icon = option.querySelector(".aiToolIcon");
            const isVisible = document.getElementById(`setting_${toolId}`).checked;
            const fields = { label: name.value.trim(), url: url.value.trim(), icon: icon.value.trim() };
            const error = option.querySelector(".aiToolCustomError");
            [name, url, icon].forEach(input => input.removeAttribute("aria-invalid"));
            const reject = (message, invalid) => {
                error.textContent = message;
                const editor = option.querySelector(".aiToolCustomFields");
                if (editor.hidden) option.querySelector(".aiToolEdit").click();
                invalid.setAttribute("aria-invalid", "true"); (invalid === icon ? option.querySelector(".quicklinkChooseIcon") : invalid).focus();
            };
            const invalidField = () => Array.from(fields.label).length > 40 ? name : fields.url && !MyntQuicklinkIcons.normalizeWebsiteUrl(fields.url) ? url : icon;
            if (isUserTool) {
                // A user tool is its name and website; both are required.
                if (!fields.label || !fields.url) { reject(aiText("aiToolsRequired", "Enter a name and a website URL."), fields.label ? url : name); return; }
                try {
                    const [tool] = MyntQuicklinkIcons.userAITools({ version: 1, tools: [{ id: toolId, label: fields.label, url: fields.url, ...(fields.icon ? { icon: fields.icon } : {}), visible: isVisible }] }, true).tools;
                    userTools.push(tool);
                } catch {
                    reject(MyntQuicklinkIcons.t("quicklinkInvalidFields"), invalidField()); return;
                }
            } else {
                try {
                    const clean = MyntQuicklinkIcons.customOverrides({ [toolId]: fields }, true);
                    const overrides = clean[toolId];
                    if (overrides) {
                        const defaultLabel = translations[currentLanguage]?.[toolId] || translations.en[toolId];
                        if (overrides.label === defaultLabel) delete overrides.label;
                        if (overrides.url === document.getElementById(toolId)?.parentElement?._myntDefault?.url) delete overrides.url;
                        if (!Object.keys(overrides).length) delete clean[toolId];
                    }
                    Object.assign(custom, clean);
                } catch {
                    reject(MyntQuicklinkIcons.t("quicklinkInvalidFields"), invalidField()); return;
                }
                // For hidden tools, add an object with the ID as key and false as value
                newSettings.push(isVisible ? toolId : { [toolId]: false });
            }
            error.textContent = "";
            order.push(toolId);
        }

        // Roll back every key if storage fails partway through saving.
        const writes = [
            ["aiToolsSettings", JSON.stringify(newSettings)],
            ["aiToolsCustom", Object.keys(custom).length ? JSON.stringify(custom) : null]
        ];
        // An unreadable user-tools record is preserved exactly as stored.
        if (aiToolsEditorUserIntact) writes.push([AI_USER_TOOLS_KEY, userTools.length ? JSON.stringify({ version: 1, tools: userTools, order }) : null]);
        const previous = writes.map(([key]) => [key, localStorage.getItem(key)]);
        const put = ([key, value]) => { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); };
        try {
            writes.forEach(put);
        } catch {
            try { previous.forEach(put); } catch { /* Keep the modal and its draft available for recovery. */ }
            const message = MyntQuicklinkIcons.t("quicklinkSaveFailed");
            setAIToolsStatus(message);
            const error = aiToolsForm.querySelector(".aiToolCustomError");
            if (error) { const option = error.closest(".ai-tool-option"); if (option.querySelector(".aiToolCustomFields").hidden) option.querySelector(".aiToolEdit").click(); error.textContent = message; }
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
window.MyntStorageSync?.watch(AI_EDITOR_KEYS, () => applyAIToolsSettings());
document.addEventListener("mynt:language-changed", () => {
    applyAIToolsSettings();
    localizeAIToolsShortcutCard();
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

from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise RuntimeError(f"Expected repair pattern not found: {label}")
    return text.replace(old, new, 1)


shortcuts_path = Path("scripts/shortcuts.js")
shortcuts = shortcuts_path.read_text(encoding="utf-8")

shortcuts = replace_once(
    shortcuts,
    '''    const MAX_SHORTCUTS = 50;
    const PLACEHOLDER = {''',
    '''    const MAX_SHORTCUTS = 50;
    const MAX_ICON_BYTES = 100 * 1024;
    const SUPPORTED_ICON_MIME_TYPES = new Set([
        "image/png",
        "image/jpeg",
        "image/gif",
        "image/webp",
        "image/avif",
        "image/bmp",
        "image/x-icon",
        "image/vnd.microsoft.icon",
        "image/svg+xml",
    ]);
    const PLACEHOLDER = {''',
    "shortcut icon constants",
)

shortcuts = replace_once(
    shortcuts,
    '''                <input type="file" class="iconFileInput" accept="image/*" hidden>''',
    '''                <input type="file" class="iconFileInput" accept="image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp,image/x-icon,image/vnd.microsoft.icon,image/svg+xml" hidden>''',
    "file picker MIME allowlist",
)

shortcuts = replace_once(
    shortcuts,
    '''            if (!selectedFile.type.startsWith("image/")) {
                const invalidFileTypeMessage = translations[currentLanguage]?.invalidFileTypeMessage || translations["en"]?.invalidFileTypeMessage;
                alertPrompt(invalidFileTypeMessage);
                fileInput.value = "";
                return;
            }

            const maxIconBytes = 100 * 1024;
            if (selectedFile.size > maxIconBytes) {''',
    '''            const selectedMimeType = String(selectedFile.type || "").toLowerCase();
            if (!SUPPORTED_ICON_MIME_TYPES.has(selectedMimeType)) {
                const invalidFileTypeMessage = translations[currentLanguage]?.invalidFileTypeMessage || translations["en"]?.invalidFileTypeMessage;
                alertPrompt(invalidFileTypeMessage);
                fileInput.value = "";
                return;
            }

            if (selectedFile.size > MAX_ICON_BYTES) {''',
    "uploaded MIME validation",
)

shortcuts = replace_once(
    shortcuts,
    '''                const maxSizeKB = localizeNumbers((maxIconBytes / 1024).toFixed(0), currentLanguage);''',
    '''                const maxSizeKB = localizeNumbers((MAX_ICON_BYTES / 1024).toFixed(0), currentLanguage);''',
    "shared maximum icon size",
)

shortcuts = replace_once(
    shortcuts,
    '''            const rawSvg = metadata.includes(";base64")
                ? atob(payload)
                : decodeURIComponent(payload);
            return sanitizeSvg(rawSvg);''',
    '''            const rawSvg = metadata.includes(";base64")
                ? new TextDecoder("utf-8", { fatal: true }).decode(
                    Uint8Array.from(atob(payload), character => character.charCodeAt(0))
                )
                : decodeURIComponent(payload);
            return sanitizeSvg(rawSvg);''',
    "UTF-8 base64 SVG decoding",
)

shortcuts = replace_once(
    shortcuts,
    '''        let pendingReorder = false;
        let isDragging = false;''',
    '''        let pendingReorder = false;
        let isDragging = false;
        let originalOrder = null;''',
    "reorder rollback state",
)

shortcuts = replace_once(
    shortcuts,
    '''            if (pendingReorder) {
                updateShortcutIndices();
                saveShortcutOrder();
                pendingReorder = false;
            }

            // Reset state
            dom.shortcutSettingsContainer.classList.remove("dragging-ongoing");
            isReordering = false;
            isDragging = false;
            draggedElement = null;''',
    '''            if (pendingReorder) {
                updateShortcutIndices();
                saveShortcutOrder(originalOrder);
                pendingReorder = false;
            }

            // Reset state
            dom.shortcutSettingsContainer.classList.remove("dragging-ongoing");
            isReordering = false;
            isDragging = false;
            draggedElement = null;
            originalOrder = null;''',
    "reorder cleanup rollback",
)

shortcuts = replace_once(
    shortcuts,
    '''            if (item) {
                isReordering = true;
                draggedElement = item;''',
    '''            if (item) {
                isReordering = true;
                draggedElement = item;
                originalOrder = readShortcutOrder();''',
    "capture original shortcut order",
)

shortcuts = replace_once(
    shortcuts,
    '''    // Saves the new shortcut order to localStorage
    function saveShortcutOrder() {
        const entries = dom.shortcutSettingsContainer.querySelectorAll(".shortcutSettingsEntry");
        const newOrder = Array.from(entries).map(entry => ({
            name: entry.querySelector(".shortcutName").value,
            url: entry.querySelector(".URL").value,
            icon: entry.querySelector(".iconURL").value
        }));

        // Only save if order has changed
        if (hasOrderChanged(newOrder)) {
            localStorage.setItem("shortcutAmount", newOrder.length.toString());
            newOrder.forEach((item, index) => {
                localStorage.setItem(`shortcutName${index}`, item.name);
                localStorage.setItem(`shortcutURL${index}`, item.url);

                // Try to save icon, skip/clear if quota exceeded
                try {
                    localStorage.setItem(`shortcutIcon${index}`, item.icon || "");
                } catch (iconError) {
                    if (iconError.name === "QuotaExceededError" || iconError.code === 22) {
                        // Remove icon due to quota
                        localStorage.removeItem(`shortcutIcon${index}`);
                        const entry = entries[index];
                        if (entry) entry.querySelector(".iconURL").value = "";
                        item.icon = "";
                    } else {
                        throw iconError;
                    }
                }
            });

            shortcutsCache = newOrder;
            renderAllShortcuts(newOrder);
        }
    }
''',
    '''    function readShortcutOrder(entries = dom.shortcutSettingsContainer.querySelectorAll(".shortcutSettingsEntry")) {
        return Array.from(entries).map(entry => ({
            name: entry.querySelector(".shortcutName").value,
            url: entry.querySelector(".URL").value,
            icon: entry.querySelector(".iconURL").value
        }));
    }

    function isQuotaExceededError(error) {
        return error?.name === "QuotaExceededError" || error?.code === 22;
    }

    function snapshotShortcutStorage() {
        const snapshot = new Map();
        const amount = localStorage.getItem("shortcutAmount");
        if (amount !== null) snapshot.set("shortcutAmount", amount);

        for (let index = 0; index < MAX_SHORTCUTS; index++) {
            for (const prefix of ["shortcutName", "shortcutURL", "shortcutIcon"]) {
                const key = `${prefix}${index}`;
                const value = localStorage.getItem(key);
                if (value !== null) snapshot.set(key, value);
            }
        }
        return snapshot;
    }

    function clearShortcutStorage() {
        localStorage.removeItem("shortcutAmount");
        for (let index = 0; index < MAX_SHORTCUTS; index++) {
            localStorage.removeItem(`shortcutName${index}`);
            localStorage.removeItem(`shortcutURL${index}`);
            localStorage.removeItem(`shortcutIcon${index}`);
        }
    }

    function writeShortcutStorage(order) {
        // Clearing first prevents a quota-neutral move from temporarily
        // duplicating a large icon under both its old and new keys.
        clearShortcutStorage();
        localStorage.setItem("shortcutAmount", order.length.toString());
        order.forEach((item, index) => {
            localStorage.setItem(`shortcutName${index}`, item.name);
            localStorage.setItem(`shortcutURL${index}`, item.url);
            localStorage.setItem(`shortcutIcon${index}`, item.icon || "");
        });
    }

    function restoreShortcutStorage(snapshot) {
        clearShortcutStorage();
        snapshot.forEach((value, key) => localStorage.setItem(key, value));
    }

    function rebuildShortcutEditor(order) {
        dom.shortcutSettingsContainer.innerHTML = "";
        dom.shortcutsContainer.innerHTML = "";
        const deleteInactive = order.length <= 1;

        order.forEach((item, index) => {
            dom.shortcutSettingsContainer.appendChild(
                createShortcutEntry(item.name, item.url, item.icon || "", deleteInactive, index)
            );
            renderShortcut(item.name, item.url, item.icon || "", index);
        });

        dom.newShortcutButton.classList.toggle("inactive", order.length >= MAX_SHORTCUTS);
        updateShortcutIndices();
    }

    // Saves the new shortcut order without temporarily duplicating icon data.
    function saveShortcutOrder(originalOrder) {
        const newOrder = readShortcutOrder();
        if (!hasOrderChanged(newOrder)) return;

        const rollbackOrder = Array.isArray(originalOrder)
            ? originalOrder.map(item => ({ ...item }))
            : shortcutsCache.map(item => ({ ...item }));
        const previousStorage = snapshotShortcutStorage();

        try {
            writeShortcutStorage(newOrder);
        } catch (storageError) {
            try {
                restoreShortcutStorage(previousStorage);
            } catch (rollbackError) {
                console.error("Shortcut reorder rollback failed:", rollbackError);
            }

            shortcutsCache = rollbackOrder;
            rebuildShortcutEditor(rollbackOrder);

            if (isQuotaExceededError(storageError)) {
                const iconStorageQuotaMessage = translations[currentLanguage]?.iconStorageQuotaMessage || translations["en"].iconStorageQuotaMessage;
                alertPrompt(iconStorageQuotaMessage);
                return;
            }
            throw storageError;
        }

        shortcutsCache = newOrder;
        renderAllShortcuts(newOrder);
    }
''',
    "quota-neutral shortcut reordering",
)

shortcuts = replace_once(
    shortcuts,
    '''        localStorage.removeItem(`shortcutIcon${currentAmount - 1}`);

        if (currentAmount - 1 === 1) {''',
    '''        localStorage.removeItem(`shortcutIcon${currentAmount - 1}`);
        shortcutsCache.length = currentAmount - 1;

        if (currentAmount - 1 === 1) {''',
    "shortcut cache truncation",
)

shortcuts = replace_once(
    shortcuts,
    '''        } catch (iconError) {
            if (iconError.name === "QuotaExceededError" || iconError.code === 22) {
                // Icon is too large, clear it from input and localStorage
                iconInput.value = "";
                localStorage.removeItem(`shortcutIcon${index}`);

                const iconStorageQuotaMessage = translations[currentLanguage]?.iconStorageQuotaMessage || translations["en"].iconStorageQuotaMessage;
                alertPrompt(iconStorageQuotaMessage);
            } else {
                throw iconError;
            }
        }
    }
''',
    '''        } catch (iconError) {
            if (isQuotaExceededError(iconError)) {
                // Icon is too large, clear it from input and localStorage
                iconInput.value = "";
                localStorage.removeItem(`shortcutIcon${index}`);

                const iconStorageQuotaMessage = translations[currentLanguage]?.iconStorageQuotaMessage || translations["en"].iconStorageQuotaMessage;
                alertPrompt(iconStorageQuotaMessage);
            } else {
                throw iconError;
            }
        }

        shortcutsCache[index] = { name, url, icon: iconInput.value || "" };
    }
''',
    "shortcut cache update",
)

shortcuts_path.write_text(shortcuts, encoding="utf-8")

fr_path = Path("locales/fr.js")
fr = fr_path.read_text(encoding="utf-8")
fr = replace_once(
    fr,
    '''    // Tips
    "switchSearchModes": "Changer de mode de recherche",
    "switchSearchModesInfo": "Cliquer sur ‘Rechercher avec’ pour changer de mode.",
    "adjustZoom": "Ajuster le zoom",''',
    '''    // Tips
    "adjustZoom": "Ajuster le zoom",''',
    "duplicate French locale keys",
)
fr_path.write_text(fr, encoding="utf-8")

check_path = Path("tools/check-upstream-integration.mjs")
check = check_path.read_text(encoding="utf-8")
check = replace_once(
    check,
    '''assert.doesNotMatch(shortcuts, /^\\s*hostname\\s*=/m);
for (const key of ["invalidIconMessage", "invalidSvgMessage", "invalidFileTypeMessage", "iconFileTooLargeMessage", "iconStorageQuotaMessage"]) {''',
    '''assert.doesNotMatch(shortcuts, /^\\s*hostname\\s*=/m);
const shortcutHardeningPatterns = [
    /SUPPORTED_ICON_MIME_TYPES/,
    /SUPPORTED_ICON_MIME_TYPES\\.has\\(selectedMimeType\\)/,
    /new TextDecoder\\("utf-8", \\{ fatal: true \\}\\)/,
    /originalOrder = readShortcutOrder\\(\\)/,
    /saveShortcutOrder\\(originalOrder\\)/,
    /function snapshotShortcutStorage\\(\\)/,
    /function clearShortcutStorage\\(\\)/,
    /function writeShortcutStorage\\(order\\)/,
    /function restoreShortcutStorage\\(snapshot\\)/,
    /function rebuildShortcutEditor\\(order\\)/,
    /shortcutsCache\\[index\\] = \\{ name, url, icon:/,
];
for (const pattern of shortcutHardeningPatterns) assert.match(shortcuts, pattern);

const saveShortcutOrderBlock = shortcuts.match(
    /function saveShortcutOrder\\(originalOrder\\)[\\s\\S]+?\\/\\/ Checks if the shortcut order has changed/
)?.[0];
assert.ok(saveShortcutOrderBlock, "Unable to inspect saveShortcutOrder implementation");
assert.doesNotMatch(
    saveShortcutOrderBlock,
    /removeItem\\(`shortcutIcon\\$\\{index\\}`\\)/,
    "Reordering must not permanently remove an icon when storage is temporarily constrained"
);

const utf8SvgSample = '<svg xmlns="http://www.w3.org/2000/svg"><text>繁體中文</text></svg>';
const utf8SvgBase64 = Buffer.from(utf8SvgSample, "utf8").toString("base64");
const utf8SvgDecoded = new TextDecoder("utf-8", { fatal: true }).decode(
    Uint8Array.from(atob(utf8SvgBase64), character => character.charCodeAt(0))
);
assert.equal(utf8SvgDecoded, utf8SvgSample, "Base64 SVG text must round-trip as UTF-8");

for (const key of ["invalidIconMessage", "invalidSvgMessage", "invalidFileTypeMessage", "iconFileTooLargeMessage", "iconStorageQuotaMessage"]) {''',
    "shortcut hardening assertions",
)

check = replace_once(
    check,
    '''    const value = vm.runInNewContext(read(path) + "\\n;" + code, {});
    assert.equal(typeof value, "object", "Locale did not evaluate: " + code);''',
    '''    const localeSource = read(path);
    const declaredLocaleKeys = [...localeSource.matchAll(/^\\s*"([^"]+)"\\s*:/gm)].map(match => match[1]);
    const duplicateLocaleKeys = [...new Set(
        declaredLocaleKeys.filter((key, index) => declaredLocaleKeys.indexOf(key) !== index)
    )];
    assert.deepEqual(duplicateLocaleKeys, [], "Duplicate locale keys in " + path + ": " + duplicateLocaleKeys.join(", "));

    const value = vm.runInNewContext(localeSource + "\\n;" + code, {});
    assert.equal(typeof value, "object", "Locale did not evaluate: " + code);''',
    "duplicate locale key assertions",
)
check_path.write_text(check, encoding="utf-8")

print("SHORTCUT_HARDENING_REPAIR_OK")

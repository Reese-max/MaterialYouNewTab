import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(source, search, replacement, label) {
    if (!source.includes(search)) {
        throw new Error(`Expected pattern not found: ${label}`);
    }
    return source.replace(search, replacement);
}

const shortcutsPath = "scripts/shortcuts.js";
let shortcuts = readFileSync(shortcutsPath, "utf8");

shortcuts = replaceOnce(
    shortcuts,
    '        url: "https://github.com/prem-k-r/MaterialYouNewTab",',
    '        url: "https://github.com/Reese-max/MaterialYouNewTab",',
    "fork-specific placeholder URL"
);

shortcuts = replaceOnce(
    shortcuts,
    '        inputUrl: "捷徑網址"\n    };',
    '        inputUrl: "捷徑網址",\n        inputIcon: "自訂圖示：網址或 SVG（選填）"\n    };',
    "custom icon placeholder"
);

shortcuts = replaceOnce(
    shortcuts,
    '    function renderShortcut(name, url, index) {\n        const shortcut = createRenderedShortcut(name, url, index);',
    '    function renderShortcut(name, url, customIcon, index) {\n        const shortcut = createRenderedShortcut(name, url, customIcon, index);',
    "renderShortcut custom icon argument"
);

shortcuts = replaceOnce(
    shortcuts,
    `    // Normalizes icon input: converts raw SVG code → data URL, passes URLs through
    function processIconInput(raw) {
        const trimmed = raw.trim();
        if (!trimmed) return { value: "", error: null };

        if (/<svg[\\s>]/i.test(trimmed)) {
            const dataUrl = sanitizeSvg(trimmed);
            return { value: dataUrl ?? "", error: null };
        }

        return { value: trimmed, error: null };
    }
`,
    `    function sanitizeSvgDataUrl(dataUrl) {
        const separatorIndex = dataUrl.indexOf(",");
        if (separatorIndex < 0) return null;

        const metadata = dataUrl.slice(0, separatorIndex).toLowerCase();
        if (!metadata.startsWith("data:image/svg+xml")) return null;

        try {
            const payload = dataUrl.slice(separatorIndex + 1);
            const rawSvg = metadata.includes(";base64")
                ? atob(payload)
                : decodeURIComponent(payload);
            return sanitizeSvg(rawSvg);
        } catch {
            return null;
        }
    }

    // Normalizes icon input and rejects unsupported or unsafe values.
    function processIconInput(raw) {
        const trimmed = String(raw || "").trim();
        if (!trimmed) return { value: "", error: null };

        if (/<svg[\\s>]/i.test(trimmed)) {
            const dataUrl = sanitizeSvg(trimmed);
            return dataUrl
                ? { value: dataUrl, error: null }
                : { value: "", error: "invalidSvg" };
        }

        if (/^data:image\\/svg\\+xml/i.test(trimmed)) {
            const dataUrl = sanitizeSvgDataUrl(trimmed);
            return dataUrl
                ? { value: dataUrl, error: null }
                : { value: "", error: "invalidSvg" };
        }

        if (!isValidCustomIconUrl(trimmed)) {
            return { value: "", error: "invalidIcon" };
        }

        return { value: trimmed, error: null };
    }

    function validateIconInput(input) {
        const result = processIconInput(input.value);
        input.value = result.value;
        if (!result.error) return true;

        const isSvgError = result.error === "invalidSvg";
        const messageKey = isSvgError ? "invalidSvgMessage" : "invalidIconMessage";
        const fallbackMessage = isSvgError
            ? "The SVG is invalid or contains unsafe content."
            : "Use an HTTPS/HTTP image URL, an image data URL, or valid SVG markup.";
        const message = translations[currentLanguage]?.[messageKey]
            || translations.en?.[messageKey]
            || fallbackMessage;
        alertPrompt(message);
        return false;
    }
`,
    "icon input validation"
);

shortcuts = replaceOnce(
    shortcuts,
    `    function isValidCustomIconUrl(url) {
        if (typeof url !== "string") return false;
        const trimmedUrl = url.trim();
        if (trimmedUrl.includes(" ")) return false;
        const lowercaseUrl = trimmedUrl.toLowerCase();
        return (
            lowercaseUrl.startsWith("data:image/") ||
            lowercaseUrl.startsWith("https://") ||
            lowercaseUrl.startsWith("http://")
        );
    }
`,
    `    function isValidCustomIconUrl(url) {
        if (typeof url !== "string") return false;
        const trimmedUrl = url.trim();
        if (!trimmedUrl || /\\s/.test(trimmedUrl)) return false;

        if (/^https?:\\/\\//i.test(trimmedUrl)) {
            try {
                const parsed = new URL(trimmedUrl);
                return parsed.protocol === "https:" || parsed.protocol === "http:";
            } catch {
                return false;
            }
        }

        return /^data:image\\/(?:png|jpe?g|gif|webp|avif|bmp|x-icon|vnd\\.microsoft\\.icon|svg\\+xml)(?:[;,])/i.test(trimmedUrl);
    }
`,
    "custom icon URL validation"
);

shortcuts = replaceOnce(
    shortcuts,
    '    function appendShortcutLogo(container, url) {',
    '    function appendShortcutLogo(container, name, url, customIcon) {',
    "appendShortcutLogo arguments"
);

shortcuts = replaceOnce(
    shortcuts,
    `            if (name.trim()) {
                letter = name.trim().charAt(0).toUpperCase();
            } else {
                try {
                    hostname = new URL(normalizeUrl(url)).hostname.replace(/^www\\./, "");
                    letter = hostname.charAt(0).toUpperCase() || "?";
                } catch {
                    letter = (url.trim()?.charAt(0) || "?").toUpperCase();
                }
            }
`,
    `            const shortcutName = String(name || "").trim();
            if (shortcutName) {
                letter = shortcutName.charAt(0).toUpperCase();
            } else {
                letter = hostname.charAt(0).toUpperCase() || "?";
            }

            const safeLetter = letter.replace(/[&<>"']/g, character => ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&apos;",
            }[character]));
`,
    "letter fallback without const reassignment"
);

shortcuts = replaceOnce(
    shortcuts,
    '                        ${letter}\n',
    '                        ${safeLetter}\n',
    "escaped shortcut fallback letter"
);

shortcuts = replaceOnce(
    shortcuts,
    `            customIconImg.alt = "";
            customIconImg.referrerPolicy = "no-referrer";
            setIconType(customIconImg, "custom");`,
    `            customIconImg.alt = "";
            customIconImg.referrerPolicy = "no-referrer";
            customIconImg.draggable = false;
            setIconType(customIconImg, "custom");`,
    "custom icon drag behavior"
);

shortcuts = replaceOnce(
    shortcuts,
    `            }, { once: true });

            return customIconImg;
        }

        try {
            hostname = new URL(normalizeUrl(url)).hostname.replace(/^www\\./, "");
        } catch (error) {
            return createLetterFallback();
        }
`,
    `            }, { once: true });

            container.appendChild(customIconImg);
            return customIconImg;
        }
`,
    "append custom icon and remove hostname reassignment"
);

shortcuts = replaceOnce(
    shortcuts,
    `        image.addEventListener("error", () => {
            if (!image.src.endsWith("/svgs/offline.svg")) image.src = "./svgs/offline.svg";
        }, { once: true });`,
    `        image.addEventListener("error", () => {
            image.src = createLetterFallback().src;
            setIconType(image, "letter");
        }, { once: true });`,
    "favicon first-letter fallback"
);

shortcuts = replaceOnce(
    shortcuts,
    '    function createRenderedShortcut(name, url, index) {',
    '    function createRenderedShortcut(name, url, customIcon, index) {',
    "createRenderedShortcut custom icon argument"
);

shortcuts = replaceOnce(
    shortcuts,
    '        appendShortcutLogo(logo, url);',
    '        appendShortcutLogo(logo, name, url, customIcon);',
    "pass icon state to logo renderer"
);

shortcuts = replaceOnce(
    shortcuts,
    '            fragment.appendChild(createRenderedShortcut(item.name, item.url, index));',
    '            fragment.appendChild(createRenderedShortcut(item.name, item.url, item.icon || "", index));',
    "preserve custom icons after reorder"
);

writeFileSync(shortcutsPath, shortcuts);

function addLocaleMessages(path, anchor, lines) {
    let locale = readFileSync(path, "utf8");
    if (locale.includes('"invalidIconMessage"')) return;
    locale = replaceOnce(locale, anchor, `${anchor}${lines}`, `${path} icon validation messages`);
    writeFileSync(path, locale);
}

addLocaleMessages(
    "locales/en.js",
    '    "shortcutInputIcon": "Custom Icon: URL or SVG (optional)",\n',
    '    "invalidIconMessage": "Use an HTTPS/HTTP image URL, an image data URL, or valid SVG markup.",\n    "invalidSvgMessage": "The SVG is invalid or contains unsafe content.",\n    "invalidFileTypeMessage": "Choose a supported image file.",\n    "iconFileTooLargeMessage": "Icon file is {size} KB. Maximum is {max} KB.",\n    "iconStorageQuotaMessage": "The icon could not be saved because browser storage is full.",\n'
);

addLocaleMessages(
    "locales/zh_TW.js",
    '    "shortcutInputIcon": "自訂圖示：網址或 SVG（選填）",\n',
    '    "invalidIconMessage": "請輸入 HTTPS／HTTP 圖片網址、圖片資料網址，或有效的 SVG 內容。",\n    "invalidSvgMessage": "SVG 無效或包含不安全的內容。",\n    "invalidFileTypeMessage": "請選擇支援的圖片檔案。",\n    "iconFileTooLargeMessage": "圖示檔案為 {size} KB，大小上限為 {max} KB。",\n    "iconStorageQuotaMessage": "瀏覽器儲存空間不足，無法儲存此圖示。",\n'
);

const integrationCheckPath = "tools/check-upstream-integration.mjs";
let integrationCheck = readFileSync(integrationCheckPath, "utf8");
const testAnchor = 'assert.doesNotMatch(shortcuts, /<[^>]*\\bonerror\\s*=/i);\n';
const testBlock = `const shortcutRuntimePatterns = [
    /function renderShortcut\\(name, url, customIcon, index\\)/,
    /function createRenderedShortcut\\(name, url, customIcon, index\\)/,
    /function appendShortcutLogo\\(container, name, url, customIcon\\)/,
    /appendShortcutLogo\\(logo, name, url, customIcon\\)/,
    /createRenderedShortcut\\(item\\.name, item\\.url, item\\.icon \\|\\| "", index\\)/,
    /container\\.appendChild\\(customIconImg\\)/,
    /function validateIconInput\\(input\\)/,
    /function sanitizeSvgDataUrl\\(dataUrl\\)/,
    /inputIcon:/,
];
for (const pattern of shortcutRuntimePatterns) assert.match(shortcuts, pattern);
assert.doesNotMatch(shortcuts, /^\\s*hostname\\s*=/m);
for (const key of ["invalidIconMessage", "invalidSvgMessage", "invalidFileTypeMessage", "iconFileTooLargeMessage", "iconStorageQuotaMessage"]) {
    assert.match(read("locales/en.js"), new RegExp(key));
    assert.match(read("locales/zh_TW.js"), new RegExp(key));
}
`;

if (!integrationCheck.includes("shortcutRuntimePatterns")) {
    integrationCheck = replaceOnce(
        integrationCheck,
        testAnchor,
        `${testAnchor}${testBlock}`,
        "shortcut runtime regression checks"
    );
    writeFileSync(integrationCheckPath, integrationCheck);
}

console.log("SHORTCUT_RUNTIME_REPAIR_OK");

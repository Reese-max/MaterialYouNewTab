import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const manifest = JSON.parse(read("manifest.json"));
const html = read("index.html");
const languages = read("scripts/languages.js");
const shortcuts = read("scripts/shortcuts.js");
const quotes = read("scripts/quotes.js");
const aiTools = read("scripts/ai-tools.js");
const background = read("scripts/background.js");
const whatsNew = read("docs/whats-new.html");
const privacy = read("privacy-policy.html");

assert.equal(manifest.background.service_worker, "scripts/background.js");
assert.ok(existsSync(resolve(root, manifest.background.service_worker)));
assert.match(background, /runtime\.onInstalled/);
assert.match(background, /docs\/whats-new\.html/);
assert.match(background, /Reese-max\/MaterialYouNewTab/);
assert.doesNotMatch(background, /forms\.gle|prem-k-r/);
assert.match(whatsNew, /3\.4\.0/);
assert.match(whatsNew, /e279bb9/);

for (const pattern of [/shortcutIcon/, /uploadCustomIconButton/, /sanitizeSvg/, /setupKeyboardShortcuts/, /show-shortcut-numbers/]) {
    assert.match(shortcuts, pattern);
}
assert.doesNotMatch(shortcuts, /<[^>]*\bonerror\s*=/i);
const shortcutRuntimePatterns = [
    /function renderShortcut\(name, url, customIcon, index\)/,
    /function createRenderedShortcut\(name, url, customIcon, index\)/,
    /function appendShortcutLogo\(container, name, url, customIcon\)/,
    /appendShortcutLogo\(logo, name, url, customIcon\)/,
    /createRenderedShortcut\(item\.name, item\.url, item\.icon \|\| "", index\)/,
    /container\.appendChild\(customIconImg\)/,
    /function validateIconInput\(input\)/,
    /function sanitizeSvgDataUrl\(dataUrl\)/,
    /inputIcon:/,
];
for (const pattern of shortcutRuntimePatterns) assert.match(shortcuts, pattern);
assert.doesNotMatch(shortcuts, /^\s*hostname\s*=/m);
const shortcutHardeningPatterns = [
    /SUPPORTED_ICON_MIME_TYPES/,
    /SUPPORTED_ICON_MIME_TYPES\.has\(selectedMimeType\)/,
    /new TextDecoder\("utf-8", \{ fatal: true \}\)/,
    /originalOrder = readShortcutOrder\(\)/,
    /saveShortcutOrder\(originalOrder\)/,
    /function snapshotShortcutStorage\(\)/,
    /function clearShortcutStorage\(\)/,
    /function writeShortcutStorage\(order\)/,
    /function restoreShortcutStorage\(snapshot\)/,
    /function rebuildShortcutEditor\(order\)/,
    /shortcutsCache\[index\] = \{ name, url, icon:/,
];
for (const pattern of shortcutHardeningPatterns) assert.match(shortcuts, pattern);

const saveShortcutOrderBlock = shortcuts.match(
    /function saveShortcutOrder\(originalOrder\)[\s\S]+?\/\/ Checks if the shortcut order has changed/
)?.[0];
assert.ok(saveShortcutOrderBlock, "Unable to inspect saveShortcutOrder implementation");
assert.doesNotMatch(
    saveShortcutOrderBlock,
    /removeItem\(`shortcutIcon\$\{index\}`\)/,
    "Reordering must not permanently remove an icon when storage is temporarily constrained"
);

const utf8SvgSample = '<svg xmlns="http://www.w3.org/2000/svg"><text>繁體中文</text></svg>';
const utf8SvgBase64 = Buffer.from(utf8SvgSample, "utf8").toString("base64");
const utf8SvgDecoded = new TextDecoder("utf-8", { fatal: true }).decode(
    Uint8Array.from(atob(utf8SvgBase64), character => character.charCodeAt(0))
);
assert.equal(utf8SvgDecoded, utf8SvgSample, "Base64 SVG text must round-trip as UTF-8");

for (const key of ["invalidIconMessage", "invalidSvgMessage", "invalidFileTypeMessage", "iconFileTooLargeMessage", "iconStorageQuotaMessage"]) {
    assert.match(read("locales/en.js"), new RegExp(key));
    assert.match(read("locales/zh_TW.js"), new RegExp(key));
}
for (const pattern of [/dailyQuoteEnabled/, /getDailyQuote/, /clearOldDailyQuotes/]) {
    assert.match(quotes, pattern);
}
assert.match(aiTools, /contextmenu/);
assert.match(aiTools, /showAIToolsSettings/);

const localeCodes = ["en","pt","ne","es","hi","hu","zh","zh_TW","cs","it","tr","bn","vi","ru","uz","ja","ko","idn","mr","fr","az","sl","ur","de","fa","ar_SA","el","ta","th","pl","uk","sv"];
for (const code of localeCodes) {
    const path = "locales/" + code + ".js";
    assert.ok(existsSync(resolve(root, path)), "Missing locale file: " + path);
    assert.match(html, new RegExp("src=[\"']locales/" + code + "\\.js[\"']"));
    assert.match(html, new RegExp("<option value=[\"']" + code + "[\"']"));
    const localeSource = read(path);
    const declaredLocaleKeys = [...localeSource.matchAll(/^\s*"([^"]+)"\s*:/gm)].map(match => match[1]);
    const duplicateLocaleKeys = [...new Set(
        declaredLocaleKeys.filter((key, index) => declaredLocaleKeys.indexOf(key) !== index)
    )];
    assert.deepEqual(duplicateLocaleKeys, [], "Duplicate locale keys in " + path + ": " + duplicateLocaleKeys.join(", "));

    const value = vm.runInNewContext(localeSource + "\n;" + code, {});
    assert.equal(typeof value, "object", "Locale did not evaluate: " + code);
}
assert.match(languages, /const DEFAULT_LANGUAGE = "zh_TW"/);
assert.match(languages, /\{\s*\.\.\.en,\s*\.\.\.strings\s*\}/);
assert.match(languages, /sv:\s*sv/);
assert.match(privacy, /自訂捷徑圖示/);
assert.match(privacy, /更新與解除安裝頁面/);

console.log("UPSTREAM_INTEGRATION_OK upstream=e279bb9 locales=" + localeCodes.length + " version=" + manifest.version);

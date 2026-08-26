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
    const value = vm.runInNewContext(read(path) + "\n;" + code, {});
    assert.equal(typeof value, "object", "Locale did not evaluate: " + code);
}
assert.match(languages, /const DEFAULT_LANGUAGE = "zh_TW"/);
assert.match(languages, /\{\s*\.\.\.en,\s*\.\.\.strings\s*\}/);
assert.match(languages, /sv:\s*sv/);
assert.match(privacy, /自訂捷徑圖示/);
assert.match(privacy, /更新與解除安裝頁面/);

console.log("UPSTREAM_INTEGRATION_OK upstream=e279bb9 locales=" + localeCodes.length + " version=" + manifest.version);

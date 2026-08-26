import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const write = (path, content) => {
    const normalized = content.endsWith("\n") ? content : content + "\n";
    if (existsSync(path) && read(path) === normalized) return false;
    writeFileSync(path, normalized);
    console.log("WROTE " + path);
    return true;
};

function replaceExact(path, from, to) {
    const source = read(path);
    if (source.includes(to)) return false;
    assert.ok(source.includes(from), "Expected integration pattern not found in " + path);
    write(path, source.replace(from, to));
    return true;
}

function replaceRegex(path, pattern, replacement) {
    const source = read(path);
    const next = source.replace(pattern, replacement);
    assert.notEqual(next, source, "Expected regex integration pattern not found in " + path);
    write(path, next);
    return true;
}

function upstream(path) {
    return execFileSync("git", ["show", "upstream/main:" + path], { encoding: "utf8" });
}

const localeMeta = [
    ["en", "English", "443px"],
    ["pt", "Português (Brasil)", "512px"],
    ["ne", "नेपाली", "472px"],
    ["es", "Español", "488px"],
    ["hi", "हिन्दी", "450px"],
    ["hu", "Magyar", "487px"],
    ["zh", "简体中文", "443px"],
    ["zh_TW", "繁體中文", "443px"],
    ["cs", "Čeština", "494px"],
    ["it", "Italiano", "479px"],
    ["tr", "Türkçe", "472px"],
    ["bn", "বাংলা", "458px"],
    ["vi", "Tiếng Việt", "487px"],
    ["ru", "Русский", "442px"],
    ["uz", "O‘zbekcha", "497px"],
    ["ja", "日本語", "486px"],
    ["ko", "한국어", "443px"],
    ["idn", "Bahasa Indonesia", "477px"],
    ["mr", "मराठी", "460px"],
    ["fr", "Français", "517px"],
    ["az", "Azərbaycanca", "460px"],
    ["sl", "Slovenščina", "512px"],
    ["ur", "اردو", "482px"],
    ["de", "Deutsch", "502px"],
    ["fa", "فارسی", "502px"],
    ["ar_SA", "العربية", "482px"],
    ["el", "Ελληνικά", "497px"],
    ["ta", "தமிழ்", "522px"],
    ["th", "ไทย", "497px"],
    ["pl", "Polski", "497px"],
    ["uk", "Українська", "497px"],
    ["sv", "Svenska", "472px"],
];

const localeCodes = localeMeta.map(([code]) => code);
for (const code of localeCodes) {
    if (code === "en" || code === "zh_TW") continue;
    write("locales/" + code + ".js", upstream("locales/" + code + ".js"));
}

const localeScriptBlock = [
    "    <!-- LANGUAGES SCRIPTS -->",
    ...localeCodes.map((code) => '    <script src="locales/' + code + '.js"></script>'),
].join("\n");

replaceRegex(
    "index.html",
    /    <!-- LANGUAGES SCRIPTS -->[\s\S]*?<script src="locales\/zh_TW\.js"><\/script>/,
    localeScriptBlock
);

const languageOptions = localeMeta
    .map(([code, label]) => '                                        <option value="' + code + '">' + label + "</option>")
    .join("\n");
replaceRegex(
    "index.html",
    /                                        <option value="en">English<\/option>\s*<option value="zh_TW">繁體中文<\/option>/,
    languageOptions
);

const localeSourceEntries = localeCodes
    .map((code) => "    " + code + ": " + code + ",")
    .join("\n");
const widthEntries = localeMeta
    .map(([code, , width]) => '    ' + JSON.stringify(code) + ': ' + JSON.stringify(width) + ',')
    .join("\n");

const languagePreamble = `// Translation data
const DEFAULT_LANGUAGE = "zh_TW";

const localeSources = {
${localeSourceEntries}
};

const translations = Object.fromEntries(
    Object.entries(localeSources).map(([code, strings]) => [
        code,
        code === "en" ? strings : { ...en, ...strings }
    ])
);

const savedLanguage = localStorage.getItem("selectedLanguage");
if (!savedLanguage || !translations[savedLanguage]) {
    localStorage.setItem("selectedLanguage", DEFAULT_LANGUAGE);
}

// Define the width of the menu container for each language
const menuWidths = {
${widthEntries}
};

const numberMappings = {
    "bn": { "0": "০", "1": "১", "2": "২", "3": "৩", "4": "৪", "5": "৫", "6": "৬", "7": "৭", "8": "৮", "9": "৯" },
    "ta": { "0": "௦", "1": "௧", "2": "௨", "3": "௩", "4": "௪", "5": "௫", "6": "௬", "7": "௭", "8": "௮", "9": "௯" },
    "mr": { "0": "०", "1": "१", "2": "२", "3": "३", "4": "४", "5": "५", "6": "६", "7": "७", "8": "८", "9": "९" },
    "ne": { "0": "०", "1": "१", "2": "२", "3": "३", "4": "४", "5": "५", "6": "६", "7": "७", "8": "८", "9": "९" },
    "fa": { "0": "۰", "1": "۱", "2": "۲", "3": "۳", "4": "۴", "5": "۵", "6": "۶", "7": "۷", "8": "۸", "9": "۹" },
    "ar_SA": { "0": "۰", "1": "۱", "2": "۲", "3": "۳", "4": "٤", "5": "٥", "6": "٦", "7": "۷", "8": "۸", "9": "۹" }
};

const LRM = "\\u200E";

function localizeNumbers(text, language) {
    const map = numberMappings[language];
    const specialDecimalLanguages = ["cs", "it", "pt", "ru", "tr", "vi", "uz", "es", "ko", "idn", "fr", "az", "sl", "hu", "de", "fa", "el", "uk", "sv"];
    if (specialDecimalLanguages.includes(language)) text = text.replace(".", ",");
    if (map) text = text.replace(/\\d/g, (digit) => map[digit] || digit);
    if (language === "ar_SA") text = LRM + text + LRM;
    return text;
}

// Right-to-left languages
const rtlLanguages = ["ur", "fa", "ar_SA"];

`;

replaceRegex(
    "scripts/languages.js",
    /\/\/ Translation data[\s\S]*?\/\/ Function to apply the language to the page\n/,
    languagePreamble + "// Function to apply the language to the page\n"
);

write("tools/languagesAnalysis.html", upstream("tools/languagesAnalysis.html"));

const background = `/*
 * MYNT lifecycle integration for the Reese-max customized edition.
 * Upstream update notes are retained; uninstall feedback is routed to this fork.
 */

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason !== "update") return;
    chrome.tabs.create({
        url: chrome.runtime.getURL("docs/whats-new.html")
    });
});

chrome.runtime.setUninstallURL(
    "https://github.com/Reese-max/MaterialYouNewTab#feedback"
);
`;
write("scripts/background.js", background);

const whatsNew = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MYNT 3.4.0 更新內容</title>
    <link rel="icon" href="../favicon/icon128.png">
    <style>
        :root { color-scheme: light dark; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        body { margin: 0; background: Canvas; color: CanvasText; }
        main { width: min(780px, calc(100% - 32px)); margin: 0 auto; padding: 32px 0 56px; }
        header { display: flex; align-items: center; gap: 14px; margin-bottom: 22px; }
        header img { width: 48px; height: 48px; }
        h1 { margin: 0; font-size: clamp(1.6rem, 4vw, 2.2rem); }
        section { border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); border-radius: 24px; padding: 22px 24px; margin-top: 16px; }
        h2 { margin: 0 0 12px; font-size: 1.2rem; }
        li { margin: 8px 0; line-height: 1.55; }
        code { background: color-mix(in srgb, CanvasText 10%, transparent); border-radius: 6px; padding: 2px 6px; }
        a { color: LinkText; }
        .meta { opacity: .72; line-height: 1.5; }
    </style>
</head>
<body>
<main>
    <header>
        <img src="../favicon/icon128.png" alt="MYNT">
        <div>
            <h1>MYNT 3.4.0</h1>
            <div class="meta">Reese-max 客製整合版 · 上游同步至 <code>e279bb9</code></div>
        </div>
    </header>

    <section>
        <h2>原版完整更新</h2>
        <ul>
            <li>捷徑支援本機圖片、圖片網址及貼上 SVG 的自訂圖示，並保留離線 fallback。</li>
            <li>新增每日語錄模式，可讓同一則語錄固定顯示一天。</li>
            <li>使用 <code>Alt + 1</code> 至 <code>Alt + 9</code> 快速開啟前九個捷徑。</li>
            <li>AI Tools 圖示可用右鍵直接開啟設定。</li>
            <li>整合主題預載、桌布、透明度、圖示及多語系修正。</li>
            <li>恢復 32 種語言；繁體中文仍為預設語言，缺少的客製字串會回退英文。</li>
        </ul>
    </section>

    <section>
        <h2>客製功能保留並融合</h2>
        <ul>
            <li>Today Top 3、下一步行動、專注統計及工作區模式。</li>
            <li>Scratchpad、Markdown 匯出、智慧清單及轉換待辦。</li>
            <li>Search Bang、Command Palette、快捷鍵指南及無障礙控制。</li>
            <li>Pomodoro、任務連動、雨聲／海浪／白噪音／營火環境音。</li>
        </ul>
    </section>

    <p class="meta">完整原始碼與變更紀錄請見 <a href="https://github.com/Reese-max/MaterialYouNewTab" target="_blank" rel="noopener noreferrer">Reese-max/MaterialYouNewTab</a>。</p>
</main>
</body>
</html>
`;
write("docs/whats-new.html", whatsNew);

const feedback = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MYNT Reese-max 客製版回饋</title>
    <link rel="icon" href="../favicon/icon128.png">
    <style>
        :root { color-scheme: light dark; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: Canvas; color: CanvasText; }
        main { width: min(620px, calc(100% - 32px)); border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); border-radius: 28px; padding: 30px; box-sizing: border-box; }
        h1 { margin-top: 0; }
        p { line-height: 1.65; }
        nav { display: grid; gap: 12px; margin-top: 22px; }
        a { display: block; border-radius: 16px; padding: 14px 16px; background: color-mix(in srgb, LinkText 12%, transparent); color: LinkText; text-decoration: none; font-weight: 650; }
        small { opacity: .72; }
    </style>
</head>
<body>
<main>
    <h1>MYNT Reese-max 客製版回饋</h1>
    <p>此版本融合原版 MYNT 與 Reese-max 生產力功能。若問題只出現在本客製版，請先查看本 Fork 的程式碼與 Pull Requests；原版功能的一般問題則可參考上游專案。</p>
    <nav>
        <a href="https://github.com/Reese-max/MaterialYouNewTab" target="_blank" rel="noopener noreferrer">查看 Reese-max 客製版專案</a>
        <a href="https://github.com/Reese-max/MaterialYouNewTab/pulls" target="_blank" rel="noopener noreferrer">查看整合與修正紀錄</a>
        <a href="https://github.com/prem-k-r/MaterialYouNewTab" target="_blank" rel="noopener noreferrer">查看 MYNT 上游專案</a>
    </nav>
    <p><small>解除安裝時只會開啟本 Fork 的公開 GitHub 頁面；擴充功能不會自動傳送設定、搜尋內容或其他本機資料。</small></p>
</main>
</body>
</html>
`;
write("docs/feedback.html", feedback);

const prTemplate = `## 變更摘要

<!-- 說明修改內容、原因，以及是否來自上游同步。 -->

## 影響範圍

- [ ] 上游 MYNT 功能
- [ ] Reese-max 客製功能
- [ ] Chromium Manifest V3
- [ ] Firefox / Zen Manifest V2
- [ ] 多語系或繁體中文
- [ ] 權限、隱私或外部服務

## 驗證

- [ ] \`node tools/check-customizations.mjs\`
- [ ] \`node tools/check-release-metadata.mjs\`
- [ ] \`node tools/check-upstream-integration.mjs\`
- [ ] 已在新瀏覽器設定檔載入 unpacked extension
- [ ] 已測試新分頁、設定、搜尋、捷徑、待辦與專注功能

## 相容性檢查

- [ ] 沒有覆蓋 Today、Workspace、Scratchpad、Search Bang、Command Palette 或環境音功能
- [ ] 上游自訂圖示、每日語錄、Alt + 1–9、AI Tools 右鍵設定仍可使用
- [ ] 新增翻譯缺鍵時能安全回退英文
- [ ] 未加入不必要的權限、祕密或第三方追蹤
`;
write(".github/pull_request_template.md", prTemplate);

let privacy = read("privacy-policy.html");
privacy = privacy.replace("最後更新：2026 年 7 月 28 日", "最後更新：2026 年 8 月 26 日");
privacy = privacy.replace(
    "MYNT 使用 localStorage 與 IndexedDB 儲存介面設定、待辦事項、書籤顯示偏好、天氣位置與快取、語錄快取、番茄鐘狀態、專注紀錄、每日習慣、工作區預設、無障礙偏好及上傳的桌布。",
    "MYNT 使用 localStorage 與 IndexedDB 儲存介面設定、待辦事項、書籤顯示偏好、自訂捷徑圖示、天氣位置與快取、語錄快取與每日語錄、番茄鐘狀態、專注紀錄、便籤、每日習慣、工作區預設、無障礙偏好及上傳的桌布。"
);
const lifecycleSection = `
        <h3>更新與解除安裝頁面</h3>
        <p>Chromium 版本更新後會在本機開啟擴充功能內的 <code>docs/whats-new.html</code>，說明本次整合內容。解除安裝後，瀏覽器可能開啟 Reese-max Fork 的公開 GitHub 頁面供您自行查看；此動作不會自動上傳擴充功能設定、便籤、待辦、搜尋文字、位置、API 金鑰或其他本機資料。</p>

`;
if (!privacy.includes("更新與解除安裝頁面")) {
    privacy = privacy.replace("        <h2>透明度與安全性</h2>", lifecycleSection + "        <h2>透明度與安全性</h2>");
}
write("privacy-policy.html", privacy);

let readme = read("README.md");
readme = readme.replace(
    "- **Traditional Chinese first** — `zh-TW` is the default interface language, with English also included.",
    "- **Traditional Chinese first** — `zh-TW` remains the default while all 32 upstream locales are restored; missing custom strings fall back to English."
);
readme = readme.replace(
    "- **Keyboard help** — press `?` outside text fields to open the shortcut guide.",
    "- **Keyboard help** — press `?` outside text fields to open the shortcut guide; use `Alt+1`–`Alt+9` to launch the first nine shortcuts."
);
readme = readme.replace(
    "- Quick shortcuts and configurable AI tool launchers",
    "- Quick shortcuts with uploaded/URL/SVG custom icons and `Alt+1`–`Alt+9` launching\n- Configurable AI tool launchers with right-click settings access"
);
readme = readme.replace(
    "- Command Palette and keyboard shortcuts",
    "- Command Palette, keyboard shortcuts, Daily Quote mode, and an in-extension What's New page"
);
readme = readme.replace(
    "- Traditional Chinese default language\n- referenced background videos",
    "- Traditional Chinese default language and 32-locale fallback wiring\n- upstream/custom fused feature invariants\n- referenced background videos"
);
readme = readme.replace(
    "For changes intended for `main`, both checks should pass before merge.",
    "Upstream/custom fusion is additionally checked with:\n\n```bash\nnode tools/check-upstream-integration.mjs\n```\n\nFor changes intended for `main`, all three checks should pass before merge."
);
if (!readme.includes("## Integrated upstream baseline")) {
    readme = readme.replace(
        "## Upstream attribution",
        "## Integrated upstream baseline\n\nThis edition contains a real Git merge of `prem-k-r/MaterialYouNewTab` through commit `e279bb9` (2026-08-24), plus conflict reconciliation that preserves the Reese-max productivity layer. Upstream custom shortcut icons, Daily Quote, `Alt+1`–`Alt+9`, AI Tools context-menu settings, update notes, UI fixes, and all 32 locales are included.\n\n## Feedback\n\n- [Fork repository](https://github.com/Reese-max/MaterialYouNewTab)\n- [Integration and repair Pull Requests](https://github.com/Reese-max/MaterialYouNewTab/pulls)\n- [In-project feedback page](./docs/feedback.html)\n\n## Upstream attribution"
    );
}
write("README.md", readme);

const integrationCheck = `import assert from "node:assert/strict";
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
assert.match(background, /runtime\\.onInstalled/);
assert.match(background, /docs\\/whats-new\\.html/);
assert.match(background, /Reese-max\\/MaterialYouNewTab/);
assert.doesNotMatch(background, /forms\\.gle|prem-k-r/);
assert.match(whatsNew, /3\\.4\\.0/);
assert.match(whatsNew, /e279bb9/);

for (const pattern of [/shortcutIcon/, /uploadCustomIconButton/, /sanitizeSvg/, /setupKeyboardShortcuts/, /show-shortcut-numbers/]) {
    assert.match(shortcuts, pattern);
}
assert.doesNotMatch(shortcuts, /<[^>]*\\bonerror\\s*=/i);
for (const pattern of [/dailyQuoteEnabled/, /getDailyQuote/, /clearOldDailyQuotes/]) {
    assert.match(quotes, pattern);
}
assert.match(aiTools, /contextmenu/);
assert.match(aiTools, /showAIToolsSettings/);

const localeCodes = ${JSON.stringify(localeCodes)};
for (const code of localeCodes) {
    const path = "locales/" + code + ".js";
    assert.ok(existsSync(resolve(root, path)), "Missing locale file: " + path);
    assert.match(html, new RegExp("src=[\\\"']locales/" + code + "\\\\.js[\\\"']"));
    assert.match(html, new RegExp("<option value=[\\\"']" + code + "[\\\"']"));
    const value = vm.runInNewContext(read(path) + "\\n;" + code, {});
    assert.equal(typeof value, "object", "Locale did not evaluate: " + code);
}
assert.match(languages, /const DEFAULT_LANGUAGE = "zh_TW"/);
assert.match(languages, /\\{\\s*\\.\\.\\.en,\\s*\\.\\.\\.strings\\s*\\}/);
assert.match(languages, /sv:\\s*sv/);
assert.match(privacy, /自訂捷徑圖示/);
assert.match(privacy, /更新與解除安裝頁面/);

console.log("UPSTREAM_INTEGRATION_OK upstream=e279bb9 locales=" + localeCodes.length + " version=" + manifest.version);
`;
write("tools/check-upstream-integration.mjs", integrationCheck);

let customCheck = read("tools/check-customizations.mjs");
customCheck = customCheck.replace(
    'assert.doesNotMatch(shortcutsCode, /\\bonerror\\s*=/i, "Shortcut icons must not use inline handlers");',
    'assert.doesNotMatch(shortcutsCode, /(?:<[^>]*\\bonerror\\s*=|setAttribute\\(\\s*["\\\']onerror["\\\'])/i, "Shortcut icons must not inject inline error handlers");'
);
customCheck = customCheck.replace(
    `assert.doesNotMatch(languageTool, /locales\\/(?!en\\.js|zh_TW\\.js)[^"']+\\.js/);\nassert.match(languageTool, /const languages = \\{ en, zh_TW \\};/);`,
    `for (const code of ${JSON.stringify(localeCodes)}) {\n    assert.match(languageTool, new RegExp("locales/" + code + "\\\\.js"));\n}\nassert.match(read("scripts/languages.js"), /sv:\\s*sv/);`
);
write("tools/check-customizations.mjs", customCheck);

let qa = read(".github/workflows/qa.yml");
if (!qa.includes("Run upstream integration checks")) {
    qa = qa.replace(
        "      - name: Run release metadata checks\n        run: node tools/check-release-metadata.mjs",
        "      - name: Run release metadata checks\n        run: node tools/check-release-metadata.mjs\n\n      - name: Run upstream integration checks\n        run: node tools/check-upstream-integration.mjs"
    );
}
write(".github/workflows/qa.yml", qa);

console.log("INTEGRATION_REPAIR_OK locales=" + localeCodes.length);

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = path => readFileSync(resolve(root, path), "utf8");

const javascriptFiles = ["scripts", "locales"].flatMap(directory =>
    readdirSync(resolve(root, directory))
        .filter(file => file.endsWith(".js"))
        .map(file => `${directory}/${file}`)
);
for (const file of javascriptFiles) {
    execFileSync(process.execPath, ["--check", resolve(root, file)], { stdio: "pipe" });
}

const chromeManifest = JSON.parse(read("manifest.json"));
const firefoxManifest = JSON.parse(read("manifest(firefox).json"));
assert.ok(!chromeManifest.permissions?.includes("search"), "Chrome manifest still requests the unused search permission");
assert.deepEqual(chromeManifest.permissions, ["storage"]);
assert.deepEqual(chromeManifest.optional_host_permissions, ["https://www.google.com/*", "http://127.0.0.1/*"]);
assert.deepEqual(firefoxManifest.permissions, ["storage"]);
assert.deepEqual(firefoxManifest.optional_permissions.sort(), ["bookmarks", "https://www.google.com/*", "http://127.0.0.1/*"].sort());

const html = read("index.html");
const searchCode = read("scripts/search.js") + read("scripts/search-suggestions.js");
const dashboardCode = read("scripts/dashboard-tools.js");
const clockCode = read("scripts/clock.js");
const backupCode = read("scripts/backup-restore.js");
const daidaiCode = read("scripts/daidai-integration.js");
const customTextCode = read("scripts/custom-text.js");
const weatherCode = read("scripts/weather.js");
const shortcutsCode = read("scripts/shortcuts.js");
const bookmarksCode = read("scripts/bookmarks.js");
const sources = [html, read("privacy-policy.html"), read("style.css"), read("scripts/bongocat.js"), dashboardCode];
const htmlIds = Array.from(html.matchAll(/\bid=["']([^"']+)["']/g), match => match[1]);
const duplicateIds = htmlIds.filter((id, index) => htmlIds.indexOf(id) !== index);
assert.deepEqual([...new Set(duplicateIds)], [], "Duplicate HTML ids found");
assert.doesNotMatch(html.match(/<video\b[^>]*\bid=["']videoBg["'][^>]*>/i)?.[0] || "", /\bautoplay\b/i);
assert.match(html, /id=["']videoBg["'][^>]*preload=["']none["']/i);
assert.match(html, /<source\b[^>]*data-src=["']\.\/videos\/bg\.mp4\?v=2["']/i);
assert.doesNotMatch(html, /<source\b[^>]*\ssrc=["']\.\/videos\/bg\.mp4\?v=2["']/i);
assert.doesNotMatch(html, /\bonerror\s*=/i, "Inline error handlers violate the extension CSP");
assert.equal((html.match(/<button\b[^>]*\bclass=["'][^"']*\bsectionHeader\b[^"']*["']/gi) || []).length, 7);
assert.doesNotMatch(html, /<(?:div|span)\b[^>]*\bclass=["'][^"']*\bsectionHeader\b/i);
assert.match(html, /<h1\s+id=["']menuTitle["']>My New Tab<\/h1>/i);
assert.doesNotMatch(html, />\s*Material You New Tab\s*</i, "Legacy product name remains visible in the new-tab UI");
for (const id of ["todoListCont", "pomodoroCont", "bookmarkButton", "googleAppsCont", "micIcon", "aiToolsIcon", "menuButton"]) {
    assert.match(html, new RegExp(`<button\\b[^>]*\\bid=["']${id}["']`, "i"), `${id} must remain keyboard-operable`);
}
assert.match(html, /id=["']commandPaletteInput["'][^>]*role=["']combobox["'][^>]*aria-controls=["']commandPaletteList["']/i);
const localRefs = sources.flatMap(source => [
    ...Array.from(source.matchAll(/\b(?:src|href)=["']([^"'#?]+)|url\(["']?([^\)"'#?]+)/g), match => match[1] || match[2])
]).filter(ref => ref && !/^(?:https?:|data:|\/\/)/.test(ref));

for (const ref of new Set(localRefs)) {
    assert.ok(existsSync(resolve(root, ref.replace(/^\.\//, ""))), `Missing local asset: ${ref}`);
}

for (const script of ["scripts/pomodoro.js", "scripts/bongocat.js", "scripts/dashboard-tools.js", "scripts/scratchpad.js", "scripts/ambient-sound.js", "scripts/daidai-integration.js"]) {
    assert.ok(html.includes(`src="${script}"`) || read("scripts/lazy-loader.js").includes(`"${script}"`), `Custom script is not loaded: ${script}`);
}

for (const id of [
    "commandPaletteDialog", "controlCenterDialog", "habitList", "serviceStatusList", "focusWeekChart",
    "workspacePresetGrid", "workspaceEditorForm",
    "scratchpadCont", "scratchpadContainer", "scratchpadInput", "pomodoroAmbientRow",
    "shortcutsHelpDialog", "scratchpadDownloadBtn", "bookmarksSubtitle", "bookmarkShortcutStatus",
    "scratchpadAskDaidaiBtn", "scratchpadOrganizeDaidaiBtn", "daidaiIntegrationSection", "daidaiConnectBtn",
    "daidaiActionDialog", "daidaiActionConfirmBtn", "daidaiActionRejectBtn",
    "daidaiActionToast", "daidaiActionUndoBtn", "greetingNameField", "greetingNameInput",
    "dailyFocusActions", "dailyFocusStatus", "dailyFocusToggle", "settingsGroupTabs",
    "settingsGroupPersonal", "settingsGroupWork", "settingsGroupAdvanced", "settingsHintText"
]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `Missing custom UI: ${id}`);
}
for (const id of [
    "todayWorkPanel", "todayGoalInput", "todayPriorityList", "todayStartFocusBtn",
    "todayCommandButton", "todayQuickAddForm", "todayProgressBar", "pomodoroFocusTask", "focusTaskResults"
]) {
    assert.ok(!htmlIds.includes(id), `Removed Today UI returned: ${id}`);
}
const pomodoroCode = read("scripts/pomodoro.js");
const todoCode = read("scripts/todo-list.js");
assert.match(pomodoroCode, /mynt:pomodoro-complete/);
assert.match(
    pomodoroCode,
    /function startPomodoro\(\) \{\s*if \(pomodoroState\.isRunning\) return;\s*pomodoroState\.isRunning = true;/,
    "Pomodoro must start without a Today task"
);
assert.doesNotMatch(pomodoroCode, /myntFocusTask|mynt:focus-task-required|mynt:pomodoro-start-task/);
assert.doesNotMatch(dashboardCode, /myntTodayPlan|myntTaskFocusHistory|myntFocusTask|myntNormalizeTodayPlan|myntRecordTaskFocus|myntTaskFocusStats/);
assert.match(todoCode, /mynt:todo-updated/);
assert.match(todoCode, /mynt:todo-create/);
assert.match(todoCode, /mynt:todo-action/);
assert.doesNotMatch(todoCode, /mynt:todo-complete/);
assert.match(read("scripts/scratchpad.js"), /mynt:scratchpad-action/);
assert.match(read("scripts/scratchpad.js"), /event\.detail\.undo/);
assert.match(todoCode, /event\.detail\.undo/);
assert.match(daidaiCode, /http:\/\/127\.0\.0\.1:17373/);
assert.match(daidaiCode, /expectedSessionId/);
assert.match(daidaiCode, /showActionFeedback/);
assert.doesNotMatch(daidaiCode, /localStorage\.(?:setItem|getItem)\([^\n]*myntDaidaiScopedToken/);
assert.match(html, /data-workspace-background=["']video["']/);
assert.match(read("privacy-policy.html"), /服務狀態只會在 localStorage 記錄/);
assert.match(read("privacy-policy.html"), /呆呆提出的新增、修改、完成待辦或便籤操作只會排入本機預覽/);

const daidaiContext = { module: { exports: {} } };
vm.runInNewContext(daidaiCode, daidaiContext);
const { myntPlanDaidaiAction } = daidaiContext.module.exports;
const daidaiState = {
    sessionId: "session-1", revision: 4,
    todos: [{ id: "t1", title: "舊待辦", status: "pending" }],
    scratchpad: "唯一舊文字"
};
assert.equal(myntPlanDaidaiAction({
    type: "todo.update", todoId: "t1", title: "新待辦", expectedSessionId: "session-1", expectedRevision: 4
}, daidaiState).after, "新待辦");
assert.equal(myntPlanDaidaiAction({
    type: "todo.complete", todoId: "t1", completed: true, expectedSessionId: "session-1", expectedRevision: 3
}, daidaiState).reason, "stale");
assert.equal(myntPlanDaidaiAction({
    type: "scratchpad.replace", before: "找不到", text: "新文字", expectedSessionId: "session-1", expectedRevision: 4
}, daidaiState).valid, false);

const dashboardContext = { module: { exports: {} } };
vm.runInNewContext(dashboardCode, dashboardContext);
const dashboard = dashboardContext.module.exports;
assert.equal(dashboard.myntNormalizeGreetingName("  Reese \n Max  "), "Reese Max");
assert.equal(dashboard.myntFormatGreeting("早安！", "Reese", "{greeting}，{name}"), "早安，Reese");
assert.equal(dashboard.myntFormatGreeting("Good Morning!", "", "{greeting}, {name}"), "Good Morning!");
assert.equal(dashboard.myntFormatGreeting("Hello!", "$&", "{greeting}, {name}"), "Hello, $&");
assert.match(clockCode, /localStorage\.getItem\(["']myntGreetingName["']\)/);
assert.match(read("privacy-policy.html"), /首頁稱呼只會顯示在本機問候語中/);
assert.match(read("privacy-policy.html"), /每日焦點文字／完成狀態／延續日期/);
const dailyFocusContext = { module: { exports: {} } };
vm.runInNewContext(customTextCode, dailyFocusContext);
const { myntReconcileDailyFocus } = dailyFocusContext.module.exports;
assert.equal(myntReconcileDailyFocus({
    date: "2026-08-30", text: "延續工作", completed: false
}, "", "2026-08-31").carriedFrom, "2026-08-30");
assert.equal(myntReconcileDailyFocus({
    date: "2026-08-30", text: "已完成", completed: true
}, "", "2026-08-31").text, "");
assert.equal(myntReconcileDailyFocus(null, "舊版焦點", "2026-08-31").text, "舊版焦點");
const now = new Date(2026, 6, 28, 12);
const yesterday = new Date(2026, 6, 27, 12);
const twoDaysAgo = new Date(2026, 6, 26, 12);
const focusFixture = {
    [dashboard.myntDateKey(now)]: { sessions: 2, minutes: 50 },
    [dashboard.myntDateKey(yesterday)]: { sessions: 1, minutes: 25 },
    [dashboard.myntDateKey(twoDaysAgo)]: { sessions: 3, minutes: 75 }
};
assert.equal(dashboard.myntFocusStreak(focusFixture, now), 3);
delete focusFixture[dashboard.myntDateKey(now)];
assert.equal(dashboard.myntFocusStreak(focusFixture, now), 2, "Streak should continue from yesterday before today's first session");
const sevenDays = dashboard.myntSevenDayStats(focusFixture, now);
assert.equal(sevenDays.length, 7);
assert.equal(sevenDays.at(-1).key, dashboard.myntDateKey(now));

const workspaces = dashboard.myntNormalizeWorkspaces([{
    id: "research", name: "Research", background: "wallpaper", focusMinutes: 999,
    widgets: { todoListCheckbox: true, aiToolsCheckbox: true }
}]);
assert.equal(workspaces.length, 1);
assert.equal(workspaces[0].focusMinutes, 120);
assert.equal(workspaces[0].widgets.todoListCheckbox, true);
assert.equal(workspaces[0].widgets.shortcutsCheckbox, false);

assert.doesNotMatch(searchCode, /duckduckgo|brave\.com|wikipedia\.org|reddit\.com|engine\d/i);
assert.doesNotMatch(searchCode, /dropdown-content/);
assert.match(searchCode, /https:\/\/www\.google\.com\/complete\/search/);
assert.doesNotMatch(html, /id="searchsuggestionscheckbox"[^>]*checked/);
assert.match(html, /id="userAPI"[^>]*type="password"/);
assert.match(read("privacy-policy.html"), /src="scripts\/privacy-policy\.js"/);
assert.match(backupCode, /BACKUP_FORMAT\s*=\s*["']material-you-newtab["']/);
assert.match(customTextCode, /myntDailyFocus/);
assert.match(read("scripts/ai-tools.js"), /mobileAIToolsQuery/);
assert.match(read("scripts/ai-tools.js"), /aiToolsMoreButton/);
assert.match(dashboardCode, /source\[data-src\]/);
assert.match(dashboardCode, /loadDecorativeVideo/);
assert.match(backupCode, /SENSITIVE_LOCAL_STORAGE_KEYS\s*=\s*new Set\(\[["']weatherApiKey["']\]\)/);
assert.match(
    backupCode,
    /catch \(restoreError\) \{[\s\S]*replaceLocalStorage\(previousLocalStorage\);[\s\S]*await replaceIndexedDB\(previousIndexedDB\);/,
    "Restore must retain both rollback paths"
);
assert.match(weatherCode, /initializeWeather\(\{ allowNetwork: !isHidden && isWeatherWidgetRendered\(\) \}\)/);
assert.match(weatherCode, /if \(!allowNetwork\) return;/);
assert.doesNotMatch(shortcutsCode, /(?:<[^>]*\bonerror\s*=|setAttribute\(\s*["\']onerror["\'])/i, "Shortcut icons must not inject inline error handlers");
assert.match(shortcutsCode, /mynt:add-shortcut/);
assert.match(shortcutsCode, /mynt:shortcut-feedback/);
assert.match(bookmarksCode, /mynt:add-shortcut/);
assert.match(bookmarksCode, /mynt:shortcut-feedback/);

const shortcutsContext = { module: { exports: {} }, document: { addEventListener() {} }, URL };
vm.runInNewContext(shortcutsCode, shortcutsContext);
const { myntPlanShortcutPin } = shortcutsContext.module.exports;
const plannedShortcut = myntPlanShortcutPin([], { name: "GitHub", url: "github.com" });
assert.equal(plannedShortcut.status, "added");
assert.equal(plannedShortcut.item.url, "https://github.com/");
assert.equal(
    myntPlanShortcutPin([{ name: "GitHub", url: "https://github.com/" }], { name: "GitHub", url: "github.com" }).status,
    "duplicate"
);
assert.equal(myntPlanShortcutPin([{ name: "One", url: "one.example" }], { name: "Two", url: "two.example" }, 1).status, "full");
assert.equal(myntPlanShortcutPin([], { name: "Unsafe", url: "javascript:alert(1)" }).status, "invalid");

const languageTool = read("tools/languagesAnalysis.html");
for (const code of ["en","pt","ne","es","hi","hu","zh","zh_TW","cs","it","tr","bn","vi","ru","uz","ja","ko","idn","mr","fr","az","sl","ur","de","fa","ar_SA","el","ta","th","pl","uk","sv"]) {
    assert.match(languageTool, new RegExp("locales/" + code + "\\.js"));
}
assert.match(read("scripts/languages.js"), /sv:\s*typeof sv/);

const referencedSource = [...sources, searchCode].join("\n");
const videos = readdirSync(resolve(root, "videos"));
for (const video of videos) {
    assert.ok(referencedSource.includes(video), `Unreferenced video: videos/${video}`);
}

const loadLocale = (path, name) => vm.runInNewContext(`${read(path)}\n;${name}`, {});
const en = loadLocale("locales/en.js", "en");
const zhTW = loadLocale("locales/zh_TW.js", "zh_TW");
assert.deepEqual(Object.keys(zhTW).sort(), Object.keys(en).sort(), "Locale keys differ");
assert.match(read("scripts/languages.js"), /const DEFAULT_LANGUAGE = "zh_TW";/);

// Study quotes: unique texts, attributed, enough to rotate without repeats.
{
    const studyQuotes = vm.runInNewContext(read("scripts/study-quotes.js") + "\n;MYNT_STUDY_QUOTES", {});
    assert.ok(studyQuotes.length >= 100, "Expected at least 100 study quotes");
    const zhTexts = studyQuotes.map(q => q.zh.trim());
    assert.equal(new Set(zhTexts).size, zhTexts.length, "Duplicate study quote text");
    const enTexts = studyQuotes.filter(q => q.en).map(q => q.en.trim());
    assert.equal(new Set(enTexts).size, enTexts.length, "Duplicate English study quote text");
    for (const q of studyQuotes) assert.ok(q.zh && q.author && q.work, "Study quote missing text/author/work: " + q.zh);
    assert.match(read("scripts/study-companion.js"), /shuffled\(/);
}
const focusCardCode = read("scripts/focus-card.js");
const focusCardContext = { module: { exports: {} } };
vm.runInNewContext(focusCardCode, focusCardContext);
const focusCard = focusCardContext.module.exports;
assert.equal(JSON.stringify(focusCard.myntParseFocusSteps("好\n1. **讀第三章**（25 分鐘）\n2、做 10 題\n- 複習錯題\n4. 多的")), JSON.stringify(["讀第三章（25 分鐘）", "做 10 題", "複習錯題"]));
assert.ok(focusCard.myntChatGptUrl(focusCard.myntBuildFocusPrompt({ text: "測".repeat(160), subject: "資料庫", days: 3 })).startsWith("https://chatgpt.com/?q="));
assert.ok(focusCard.myntChatGptUrl("x".repeat(5000)).length < 1600);
assert.equal(Object.keys(focusCard.myntRecordFocusLog(Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`2026-01-${String(i + 1).padStart(2, "0")}`, { t: "a", c: 0 }])), { date: "2026-02-01", text: "b" })).length, 14);
assert.equal(myntReconcileDailyFocus({ date: "2026-08-30", text: "x", completed: false, steps: [{ text: "s", done: true }], rounds: 3, linked: true }, "", "2026-08-31").rounds, undefined);
assert.equal(myntReconcileDailyFocus({ date: "2026-08-30", text: "x", completed: false, steps: [{ text: "s", done: true }] }, "", "2026-08-31").steps.length, 1);
assert.match(read("index.html"), /scripts\/focus-card\.js/);
assert.doesNotMatch(focusCardCode, /api[_-]?key|fetch\(/i);
const layoutCode = read("scripts/layout-editor.js");
const layoutContext = { module: { exports: {} } };
vm.runInNewContext(layoutCode, layoutContext);
const layoutApi = layoutContext.module.exports;
const normLayout = layoutApi.myntNormalizeLayout({ snap: true, blocks: { search: { x: 0.1, y: -0.2, s: 9 }, bogus: { x: 1 }, focus: { x: 0, y: 0, s: 1 } } });
assert.equal(normLayout.snap, true);
assert.equal(normLayout.blocks.search.s, 2);
assert.equal(normLayout.blocks.bogus, undefined);
assert.equal(normLayout.blocks.focus, undefined);
assert.equal(JSON.stringify(layoutApi.myntClampOffset({ left: 1200, right: 1400, top: -20, bottom: 30 }, 0, 0, 1280, 800)), JSON.stringify({ x: -124, y: 24 }));
assert.match(read("index.html"), /id="layoutEditCheckbox"/);
assert.match(read("index.html"), /scripts\/layout-editor\.js/);
assert.match(layoutCode, /e\.code === "KeyL"/);
assert.match(read("scripts/pomodoro.js"), /window\.myntPomodoro = \{[\s\S]*if \(!panelOpen\) openPanel\(\)/);
assert.match(read("scripts/focus-card.js"), /dailyFocusPlayBtn"\)\.addEventListener\("click", event => \{[\s\S]{0,160}event\.stopPropagation\(\)/);
const contrastContext = { module: { exports: {} } };
vm.runInNewContext(read("scripts/quote-contrast.js"), contrastContext);
assert.ok(contrastContext.module.exports.myntLuminance(new Uint8ClampedArray([255, 255, 255, 255])) > 0.99);
assert.ok(contrastContext.module.exports.myntLuminance(new Uint8ClampedArray([0, 0, 0, 255])) < 0.01);
assert.match(read("scripts/quotes.js"), /getItem\("motivationalQuotesVisible"\) === "true"/);
assert.match(read("styles/quote-contrast.css"), /\.studyQuote\.has-wallpaper\.is-on-bright/);
for (const file of ["custom-text.js", "daidai-integration.js", "dashboard-tools.js", "layout-editor.js", "scratchpad.js", "wallpaper-gallery.js"]) {
    const code = read(`scripts/${file}`);
    const bare = code.replace(/window\.myntDialog[^\n]*/g, "");
    assert.doesNotMatch(bare, /(^|[^\w.])(alert|confirm|prompt)\(/m, `${file} still calls a native dialog without the in-app fallback`);
}
assert.match(read("scripts/mynt-dialog.js"), /showModal\(\)/);
assert.ok(read("index.html").indexOf("scripts/mynt-dialog.js") < read("index.html").indexOf("scripts/custom-text.js"));
const lazyCode = read("scripts/lazy-loader.js");
for (const lazy of ["scripts/daidai-integration.js", "scripts/bookmarks.js"]) {
    assert.ok(!html.includes(`src="${lazy}"`), `${lazy} should be lazy-loaded, not eager`);
    assert.ok(lazyCode.includes(`"${lazy}"`));
}
assert.match(read("scripts/daidai-integration.js"), /document\.readyState === "loading"/);
console.log(`CUSTOM_CHECK_OK js=${javascriptFiles.length} refs=${new Set(localRefs).size} localeKeys=${Object.keys(en).length} videos=${videos.length}`);

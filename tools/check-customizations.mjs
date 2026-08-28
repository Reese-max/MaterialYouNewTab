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
assert.deepEqual(chromeManifest.optional_host_permissions, ["https://www.google.com/*"]);
assert.equal(firefoxManifest.permissions, undefined);
assert.deepEqual(firefoxManifest.optional_permissions.sort(), ["bookmarks", "https://www.google.com/*"].sort());

const html = read("index.html");
const searchCode = read("scripts/search.js") + read("scripts/search-suggestions.js");
const dashboardCode = read("scripts/dashboard-tools.js");
const backupCode = read("scripts/backup-restore.js");
const weatherCode = read("scripts/weather.js");
const shortcutsCode = read("scripts/shortcuts.js");
const bookmarksCode = read("scripts/bookmarks.js");
const sources = [html, read("privacy-policy.html"), read("style.css"), read("scripts/bongocat.js"), dashboardCode];
const htmlIds = Array.from(html.matchAll(/\bid=["']([^"']+)["']/g), match => match[1]);
const duplicateIds = htmlIds.filter((id, index) => htmlIds.indexOf(id) !== index);
assert.deepEqual([...new Set(duplicateIds)], [], "Duplicate HTML ids found");
assert.doesNotMatch(html.match(/<video\b[^>]*\bid=["']videoBg["'][^>]*>/i)?.[0] || "", /\bautoplay\b/i);
assert.doesNotMatch(html, /\bonerror\s*=/i, "Inline error handlers violate the extension CSP");
assert.equal((html.match(/<button\b[^>]*\bclass=["'][^"']*\bsectionHeader\b[^"']*["']/gi) || []).length, 7);
assert.doesNotMatch(html, /<(?:div|span)\b[^>]*\bclass=["'][^"']*\bsectionHeader\b/i);
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

for (const script of ["scripts/pomodoro.js", "scripts/bongocat.js", "scripts/dashboard-tools.js", "scripts/scratchpad.js", "scripts/ambient-sound.js"]) {
    assert.ok(html.includes(`src="${script}"`), `Custom script is not loaded: ${script}`);
}

for (const id of [
    "commandPaletteDialog", "controlCenterDialog", "habitList", "serviceStatusList", "focusWeekChart",
    "workspacePresetGrid", "workspaceEditorForm",
    "scratchpadCont", "scratchpadContainer", "scratchpadInput", "pomodoroAmbientRow",
    "shortcutsHelpDialog", "scratchpadDownloadBtn", "bookmarksSubtitle", "bookmarkShortcutStatus"
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
assert.doesNotMatch(todoCode, /mynt:todo-complete/);
assert.match(html, /data-workspace-background=["']video["']/);
assert.match(read("privacy-policy.html"), /服務狀態只會在 localStorage 記錄/);

const dashboardContext = { module: { exports: {} } };
vm.runInNewContext(dashboardCode, dashboardContext);
const dashboard = dashboardContext.module.exports;
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
assert.match(read("scripts/languages.js"), /sv:\s*sv/);

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

console.log(`CUSTOM_CHECK_OK js=${javascriptFiles.length} refs=${new Set(localRefs).size} localeKeys=${Object.keys(en).length} videos=${videos.length}`);

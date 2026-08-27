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
    "todayWorkPanel", "todayGoalInput", "todayPriorityList", "todayStartFocusBtn",
    "workspacePresetGrid", "workspaceEditorForm", "focusTaskResults",
    "scratchpadCont", "scratchpadContainer", "scratchpadInput", "pomodoroAmbientRow",
    "todayProgressBar", "shortcutsHelpDialog", "scratchpadDownloadBtn"
]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `Missing custom UI: ${id}`);
}
const pomodoroCode = read("scripts/pomodoro.js");
const todoCode = read("scripts/todo-list.js");
assert.match(pomodoroCode, /mynt:pomodoro-complete/);
assert.match(pomodoroCode, /mynt:pomodoro-start-task/);
assert.match(pomodoroCode, /task: pomodoroState\.task/);
assert.match(todoCode, /mynt:todo-updated/);
assert.match(todoCode, /mynt:todo-create/);
assert.match(todoCode, /mynt:todo-complete/);
assert.match(html, /data-workspace-background=["']video["']/);
assert.ok(
    html.indexOf('class="todayNextAction"') < html.indexOf('class="todayGoalField"'),
    "The next action must remain above planning fields"
);
assert.match(
    dashboardCode,
    /Boolean\(selectedId\)\s*&&\s*selectedId === todayPlan\.nextTaskId/,
    "Empty priority slots must not look selected"
);
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

const todos = {
    t1: { title: "Ship the brief", status: "pending" },
    t2: { title: "Old task", status: "completed" },
    t3: { title: "Review sources", status: "pending" }
};
const plan = dashboard.myntNormalizeTodayPlan({
    date: dashboard.myntDateKey(now), goal: "  Publish today  ",
    priorityIds: ["t1", "t1", "t2", "t3"], nextTaskId: "t2"
}, todos, now);
assert.equal(plan.goal, "Publish today");
assert.equal(JSON.stringify(plan.priorityIds), JSON.stringify(["t1", "t3", ""]));
assert.equal(plan.nextTaskId, "");

let taskHistory = dashboard.myntRecordTaskFocus({}, { id: "t1", title: "Ship the brief" }, 25, yesterday);
taskHistory = dashboard.myntRecordTaskFocus(taskHistory, { id: "t1", title: "Ship the brief" }, 50, now);
assert.equal(dashboard.myntTaskFocusStats(taskHistory, "t1", now).today, 50);
assert.equal(dashboard.myntTaskFocusStats(taskHistory, "t1", now).week, 75);

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

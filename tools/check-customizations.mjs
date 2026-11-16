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
assert.deepEqual(chromeManifest.permissions, []);
assert.deepEqual(chromeManifest.optional_permissions.sort(), ["bookmarks", "favicon", "nativeMessaging"].sort());
assert.equal(chromeManifest.optional_host_permissions, undefined);
assert.deepEqual(firefoxManifest.permissions, []);
assert.deepEqual(firefoxManifest.optional_permissions.sort(), ["bookmarks", "nativeMessaging"].sort());

const html = read("index.html");
const searchCode = read("scripts/search.js");
const dashboardCode = read("scripts/dashboard-tools.js");
const clockCode = read("scripts/clock.js");
const backupCode = read("scripts/backup-restore.js");
const weatherCode = read("scripts/weather.js");
const shortcutsCode = read("scripts/shortcuts.js");
const bookmarksCode = read("scripts/bookmarks.js");
const sources = [html, read("privacy-policy.html"), read("style.css"), dashboardCode];
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

for (const script of ["scripts/pomodoro.js", "scripts/dashboard-tools.js", "scripts/scratchpad.js", "scripts/ambient-sound.js"]) {
    assert.ok(html.includes(`src="${script}"`) || read("scripts/lazy-loader.js").includes(`"${script}"`), `Custom script is not loaded: ${script}`);
}

for (const id of [
    "commandPaletteDialog", "controlCenterDialog", "serviceStatusList",
    "workspacePresetGrid", "workspaceEditorForm",
    "scratchpadCont", "scratchpadContainer", "scratchpadInput", "pomodoroAmbientRow",
    "shortcutsHelpDialog", "scratchpadDownloadBtn", "bookmarksSubtitle", "bookmarkShortcutStatus",
    "settingsGroupTabs",
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
    /function startPomodoro\(\) \{ return timer\.start\(\); \}/,
    "Pomodoro must start without a Today task"
);
assert.doesNotMatch(pomodoroCode, /myntFocusTask|mynt:focus-task-required|mynt:pomodoro-start-task/);
assert.doesNotMatch(dashboardCode, /myntTodayPlan|myntTaskFocusHistory|myntFocusTask|myntNormalizeTodayPlan|myntRecordTaskFocus|myntTaskFocusStats/);
assert.match(todoCode, /mynt:todo-updated/);
assert.match(todoCode, /mynt:todo-create/);
assert.match(todoCode, /mynt:todo-action/);
assert.doesNotMatch(todoCode, /mynt:todo-complete/);
assert.match(todoCode, /event\.detail\.undo/);
assert.match(html, /data-workspace-background=["']video["']/);
assert.match(read("privacy-policy.html"), /服務狀態只會在 localStorage 記錄/);


const dashboardContext = { module: { exports: {} } };
vm.runInNewContext(dashboardCode, dashboardContext);
const dashboard = dashboardContext.module.exports;
// DaiDai integration was removed (owner decision 2026-11-17).
assert.ok(!existsSync(resolve(root, "scripts/daidai-integration.js")) && !existsSync(resolve(root, "patches")));
assert.doesNotMatch(html + read("style.css") + read("scripts/lazy-loader.js") + todoCode, /daidai/i);
// Bongo Cat was removed (owner decision 2026-11-17).
assert.ok(!existsSync(resolve(root, "scripts/bongocat.js")) && !existsSync(resolve(root, "images/bongocat")));
assert.doesNotMatch(html + read("style.css") + dashboardCode, /bongo/i);
// Habits, focus statistics and the daily focus card were removed (owner decision 2026-11-17).
for (const file of ["scripts/custom-text.js", "scripts/focus-card.js", "styles/focus-card.css"]) assert.ok(!existsSync(resolve(root, file)), file);
assert.equal(dashboard.myntValidateHabits, undefined);
assert.doesNotMatch(html + dashboardCode + read("style.css"), /habitList|focusStatsSection|dailyFocus|userTextCheckbox|myntFocusHistory|pomodoroStatsBtn/);
// Greeting and greeting name were removed (owner decision 2026-11-17).
assert.equal(dashboard.myntNormalizeGreetingName, undefined);
assert.doesNotMatch(clockCode + html, /greetingEnabled|myntGreetingName|greetingcheckbox|greetingNameInput/);

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
// Search suggestions and the CORS proxy were removed (owner decision 2026-11-17).
assert.ok(!existsSync(resolve(root, "scripts/search-suggestions.js")));
assert.doesNotMatch(searchCode + html + dashboardCode, /complete\/search|searchsuggestionscheckbox|useproxyCheckbox|userproxy|resultBox/);
assert.match(html, /id="userAPI"[^>]*type="password"/);
assert.match(read("privacy-policy.html"), /src="scripts\/privacy-policy\.js"/);
assert.match(backupCode, /BACKUP_FORMAT\s*=\s*["']material-you-newtab["']/);
assert.match(read("scripts/ai-tools.js"), /mobileAIToolsQuery/);
assert.match(read("scripts/ai-tools.js"), /aiToolsMoreButton/);
assert.match(dashboardCode, /source\[data-src\]/);
assert.match(dashboardCode, /loadDecorativeVideo/);
assert.match(backupCode, /SENSITIVE_LOCAL_STORAGE_KEYS\s*=\s*new Set\(\[["']weatherApiKey["']\]\)/);
// Restore now rolls back through its persisted journal, including interrupted restores.
assert.match(backupCode, /catch \(restoreError\) \{[\s\S]*await recoverInterruptedRestore\(\)/, "Restore failures must invoke recovery");
assert.match(backupCode, /localBefore = previousLocalStorage\.filter[\s\S]*const journal = \{[^\n]*localBefore/, "Journal must retain the localStorage preimage");
assert.match(backupCode, /key: 'wallpaper', before: await encodedRestoreValue\(previousIndexedDB\)/, "Journal must retain the IndexedDB preimage");
const rollbackCode = backupCode.slice(backupCode.indexOf("async function recoverInterruptedRestore()"), backupCode.indexOf("async function applyRestore("));
assert.match(
    rollbackCode,
    /new Map\(journal\.localBefore\)[\s\S]*old = before\.get\(key\)[\s\S]*localStorage\.setItem\(key, old\)/,
    "Restore must retain the localStorage rollback path"
);
assert.match(
    rollbackCode,
    /const entries = decodeBackupValue\(item\.before\);[\s\S]*await replaceIndexedDB\(entries\);/,
    "Restore must retain the IndexedDB rollback path"
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
{
    const exam = vm.runInNewContext(read("scripts/exam-daily.js") + "\n;({ myntExamArchiveUrl })", {});
    assert.equal(exam.myntExamArchiveUrl(""), "https://reese-max.github.io/police-exam-archive/");
    assert.equal(exam.myntExamArchiveUrl("javascript:alert(1)"), "https://reese-max.github.io/police-exam-archive/");
    assert.match(dashboardCode, /id: "exam-today"/);
}
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
const contrastContext = { module: { exports: {} } };
vm.runInNewContext(read("scripts/quote-contrast.js"), contrastContext);
assert.ok(contrastContext.module.exports.myntLuminance(new Uint8ClampedArray([255, 255, 255, 255])) > 0.99);
assert.ok(contrastContext.module.exports.myntLuminance(new Uint8ClampedArray([0, 0, 0, 255])) < 0.01);
assert.ok(!existsSync(resolve(root, "scripts/quotes.js")));
assert.doesNotMatch(html + read("style.css") + dashboardCode, /motivationalQuotes|quotesOptions|newQuoteOnRefresh|multilingual-quotes/);
assert.match(read("styles/quote-contrast.css"), /\.studyQuote\.has-wallpaper\.is-on-bright/);
for (const file of ["dashboard-tools.js", "layout-editor.js", "scratchpad.js", "wallpaper-gallery.js"]) {
    const code = read(`scripts/${file}`);
    const bare = code.replace(/window\.myntDialog[^\n]*/g, "");
    assert.doesNotMatch(bare, /(^|[^\w.])(alert|confirm|prompt)\(/m, `${file} still calls a native dialog without the in-app fallback`);
}
assert.match(read("scripts/mynt-dialog.js"), /showModal\(\)/);
assert.ok(read("index.html").indexOf("scripts/mynt-dialog.js") < read("index.html").indexOf("scripts/dashboard-tools.js"));
{
    const examCode = read("scripts/exam-daily.js");
    const examContext = { module: { exports: {} } };
    vm.runInNewContext(examCode, examContext);
    const exam = examContext.module.exports;
    const ids = exam.myntExamIds();
    assert.ok(ids.length > 500, "exam pool unexpectedly small");
    let state = null;
    const seen = new Set();
    for (let d = 0; d < ids.length; d++) { state = exam.myntExamPick(state, `day${d}`); seen.add(state.id); }
    assert.equal(seen.size, ids.length, "exam bag must not repeat before the pool is exhausted");
    assert.equal(exam.myntExamPick(state, `day${ids.length - 1}`).id, state.id, "same question all day");
    assert.ok(exam.myntExamUrl(ids[0]).startsWith("https://raw.githubusercontent.com/Reese-max/police-exam-archive/"));
    const q = exam.myntExamExtract({ year: 110, subject: "警察法規(包括…)", questions: [{ type: "essay", stem: "x" }, { type: "choice", number: 1, stem: "a\nb", options: { A: "1", B: "2" }, answer: "B" }] }, "0.0");
    assert.equal(q.subject, "警察法規");
    assert.equal(q.stem, "ab");
    assert.equal(q.answer, "B");
    assert.equal((examCode.match(/fetch\(/g) || []).length, 1, "exam-daily must fetch from exactly one place");
    assert.doesNotMatch(examCode, /api[_-]?key|token/i);
    assert.match(read("index.html"), /id="examDailyCheckbox"/);
    assert.match(layoutCode, /\["exam", "#examDaily"/);
    assert.ok(exam.MYNT_EXAM_INDEX.every(([path, ks]) => typeof path === "string" && Array.isArray(ks) && ks.length), "exam index lists usable question indices");
    const needs = q => exam.myntExamNeedsContext({ stem: q, options: { A: "x", B: "y" } });
    for (const q of ["According to the passage, which is true?", "What is the main idea of this paragraph?", "如圖所示，下列何者正確？", "承上題，下列敘述何者正確？", "依上文，作者的意思是："]) assert.ok(needs(q), `should exclude: ${q}`);
    for (const q of ["依憲法本文規定，下列何者正確？", "「君子之事上也。」下列選項最合乎上文意旨的是：", "下列何者為警察職權行使法之規定？"]) assert.ok(!needs(q), `should keep: ${q}`);
    assert.equal(exam.myntExamExtract({ questions: [{ type: "choice", stem: "According to the passage, what?", options: { A: "1", B: "2" }, answer: "A" }] }, "0.0"), null);
    const stale = exam.myntExamPick({ date: "old", id: "999.0", bag: ["999.1", ids[3]] }, "new");
    assert.equal(stale.id, ids[3], "ids no longer in the filtered pool are skipped");
}
const lazyCode = read("scripts/lazy-loader.js");
for (const lazy of ["scripts/bookmarks.js"]) {
    assert.ok(!html.includes(`src="${lazy}"`), `${lazy} should be lazy-loaded, not eager`);
    assert.ok(lazyCode.includes(`"${lazy}"`));
}
console.log(`CUSTOM_CHECK_OK js=${javascriptFiles.length} refs=${new Set(localRefs).size} localeKeys=${Object.keys(en).length} videos=${videos.length}`);

// Settings cleanup: keep every setting while removing non-setting project links.
const menuSource = read('scripts/menu-shortcut-page.js');
assert.doesNotMatch(html.slice(html.indexOf('id="menuBar"'), html.indexOf('<!-- ------end of Menu-bar')), /id="(?:github|feedback)"/);
assert.match(html, /<button id="menuCloseButton" type="button" aria-label=/);
assert.ok(html.indexOf('id="menuCloseButton"') < html.indexOf('id="optCont"'));
assert.doesNotMatch(html, /id="settingsHelp"/); // quick help removed 2026-11-17 at the owner's request
assert.doesNotMatch(html, /id="(?:tips|dontShowTips)"/);
assert.match(menuSource, /closedDetails\.querySelector\('summary'\) === el/);
{
 const nodes = new Map(), timers = [], document = { activeElement: null, querySelector: () => null };
 const get = id => { if (!nodes.has(id)) nodes.set(id, { id, style:{}, attributes:{}, listeners:{}, tabIndex:0,
  setAttribute(k,v){this.attributes[k]=v;},getAttribute(k){return this.attributes[k];},
  addEventListener(k,v){this.listeners[k]=v;},focus(){document.activeElement=this;},
  contains(el){return el && el.id!=='menuButton';},closest(){return null;},getClientRects(){return [{}];},
  querySelectorAll(){return [get('menuCloseButton'),get('settingsHelpTitle')];},click(){this.clicked=true;this.onclick?.();}
 }); return nodes.get(id); };
 document.getElementById=get;
 const context={document, localStorage:{getItem:()=> 'en'},rtlLanguages:[],getComputedStyle:()=>({visibility:'visible'}),
  setTimeout(fn,delay=0){timers.push({fn,delay});},requestAnimationFrame:fn=>fn()};
 vm.createContext(context);
 vm.runInContext(menuSource.split('// Toggle expand/collapse sections')[0],context);
 const run=code=>vm.runInContext(code,context),flush=()=>{while(timers.length)timers.splice(0).sort((a,b)=>a.delay-b.delay).forEach(t=>t.fn());};
 run('openMenuBar()');flush();assert.equal(get('menuBar').style.display,'block');assert.equal(document.activeElement.id,'menuCloseButton');
 run('closeMenuBar(); openMenuBar()');flush();assert.equal(get('menuBar').style.display,'block','stale close callback cannot hide reopened settings');
 const event={key:'Escape',preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};
 get('menuCont').listeners.keydown(event);flush();assert.equal(event.stopped,true);assert.equal(get('menuBar').style.display,'none');assert.equal(document.activeElement.id,'menuButton');
 run('openMenuBar()');flush();document.querySelector=()=>({open:true});get('menuCont').listeners.keydown({...event,stopped:false});flush();assert.equal(get('menuBar').style.display,'block','native dialogs own Escape');document.querySelector=()=>null;
 get('shortcutEditPage').style.display='block';get('menuCont').listeners.keydown({...event});assert.equal(get('backButton').clicked,true,'Escape returns from shortcut editing');get('shortcutEditPage').style.display='none';
 document.activeElement=get('menuCloseButton');get('menuCont').listeners.keydown({...event,key:'Tab',shiftKey:true});assert.equal(document.activeElement.id,'settingsHelpTitle');
 get('menuCont').listeners.keydown({...event,key:'Tab',shiftKey:false});assert.equal(document.activeElement.id,'menuCloseButton');
 vm.runInContext(menuSource.slice(menuSource.indexOf('/* ------ Shortcut Page Transitions')),context);
 get('shortcutEditButton').onclick();run('closeMenuBar(); openMenuBar()');flush();
 assert.equal(get('overviewPage').style.display,'block','stale shortcut animation cannot blank reopened settings');assert.equal(document.activeElement.id,'menuCloseButton');
 get('shortcutEditButton').onclick();timers.filter(t=>t.delay===0).forEach(t=>t.fn());
 get('menuCont').listeners.keydown({...event});flush();
 assert.equal(get('overviewPage').style.display,'block');assert.equal(get('shortcutEditPage').style.display,'none','immediate Escape cancels outgoing shortcut transition');assert.equal(document.activeElement.id,'shortcutEditButton');

}
console.log('SETTINGS_PANEL_OK: links and quick help removed, header close, rapid reopen, dialog-aware Escape/back and keyboard focus wrapping');
assert.doesNotMatch(read('scripts/languages.js'), /scale:\s*\$\{widthh\}/, 'Settings text must reflow rather than shrink at narrow widths');
assert.match(read('style.css'), /#menuBar #menuCont \{ max-width:100%; \}/);

execFileSync(process.execPath, [resolve(root, "tools/regress-panel-interactions.cjs"), root], {stdio:"inherit"});

execFileSync(process.execPath, [resolve(root, "tools/regress-gallery-delete.cjs"), root], {stdio:"inherit"});

execFileSync(process.execPath, [resolve(root, "tools/regress-backup-completion.cjs"), root], {stdio:"inherit"});

execFileSync(process.execPath, [resolve(root, "tools/regress-bookmark-completion.cjs"), root], {stdio:"inherit"});

execFileSync(process.execPath, [resolve(root, "tools/regress-focus-completion.cjs"), root], {stdio:"inherit"});

// Daily reliability: scoped backups, safe editor entry, and local music import feedback.
execFileSync(process.execPath, [resolve(root, "tools/regress-backup-scope.cjs"), root], {stdio:"inherit"});
execFileSync(process.execPath, [resolve(root, "tools/regress-layout-daily.cjs"), root], {stdio:"inherit"});
execFileSync(process.execPath, [resolve(root, "tools/regress-music-daily.cjs"), root], {stdio:"inherit"});

// Local calendar countdowns: calendar arithmetic, safe storage and backup integration.
execFileSync(process.execPath, [resolve(root, "tools/regress-event-countdown-core.cjs")], {stdio:"inherit"});
execFileSync(process.execPath, [resolve(root, "tools/regress-event-countdown-integration.cjs")], {stdio:"inherit"});
execFileSync(process.execPath, [resolve(root, "tools/regress-local-mcp-data.cjs")], {stdio:"inherit"});
execFileSync(process.execPath, [resolve(root, "tools/regress-local-mcp-media.cjs")], {stdio:"inherit"});
execFileSync(process.execPath, [resolve(root, "tools/regress-local-mcp-bridge.cjs")], {stdio:"inherit"});

execFileSync(process.execPath, [resolve(root, "tools/regress-local-mcp-ui.cjs")], {stdio:"inherit"});
execFileSync(process.execPath, [resolve(root, "tools/regress-local-recovery-controls.cjs")], {stdio:"inherit"});
execFileSync(process.execPath, [resolve(root, "tools/regress-local-mcp-studio.cjs")], {stdio:"inherit"});
execFileSync(process.execPath, [resolve(root, "tools/check-component-manager.cjs")], {stdio:"inherit"});
execFileSync(process.execPath, [resolve(root, "tools/check-clock-lifecycle.cjs")], {stdio:"inherit"});
execFileSync(process.execPath, [resolve(root, "tools/check-manual-editor.cjs")], {stdio:"inherit"});
execFileSync(process.execPath, [resolve(root, "tools/check-adaptive-settings.cjs")], {stdio:"inherit"});
execFileSync(process.execPath, [resolve(root, "tools/check-component-visibility.cjs")], {stdio:"inherit"});
execFileSync(process.execPath, [resolve(root, "tools/regress-local-mcp-components.cjs")], {stdio:"inherit"});
execFileSync(process.execPath, [resolve(root, "tools/regress-local-mcp-preferences.cjs")], {stdio:"inherit"});
execFileSync(process.execPath, [resolve(root, "tools/regress-component-manager.cjs")], {stdio:"inherit"});

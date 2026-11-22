/* Run outside the Codex sandbox (Chromium spawn is blocked there).
 * node tools/regress-settings-ia.cjs [extension-directory]
 * MYNT_EXTENSION selects a baseline checkout without copying this test into it.
 * MYNT_BASE_EXTENSION enables identical-fixture rendering/storage comparison with the baseline.
 * MYNT_FIXTURE overrides the de-identified localStorage fixture; --static needs no browser.
 * Browser profiles are disposable and retained for diagnostics, never a real Chrome profile.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const EXT = path.resolve(process.env.MYNT_EXTENSION || process.argv.find((arg, i) => i > 1 && !arg.startsWith('--')) || path.join(__dirname, '..'));
const BASE = process.env.MYNT_BASE_EXTENSION && path.resolve(process.env.MYNT_BASE_EXTENSION);
const CHROME = process.env.CHROME_BIN || 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const fixturePath = process.env.MYNT_FIXTURE || [
    path.resolve(__dirname, '../../fixtures/user-localstorage.json'),
    path.join(EXT, 'tools/fixtures/ui-seed.json')
].find(file => fs.existsSync(file));
const read = name => fs.readFileSync(path.join(EXT, name), 'utf8');
const words = language => vm.runInNewContext(read(`locales/${language}.js`) + `\n;${language}`);
const dictionaries = { en: words('en'), zh_TW: words('zh_TW') };
const tabs = { zh_TW: ['首頁', '外觀', '工具', '系統'], en: ['Home', 'Appearance', 'Tools', 'System'] };
const components = [
    ['clock', 'hideClockVisible', 'inverse', true], ['search', 'myntSearchVisible', 'boolean', true],
    ['searchProvider', 'showShortcutSwitch', 'inverse', true], ['shortcuts', 'shortcutsCheckboxState', 'checked', false],
    ['aiTools', 'aiToolsCheckboxState', 'checked', false], ['googleApps', 'googleAppsCheckboxState', 'checked', false],
    ['bookmarks', 'bookmarksCheckboxState', 'checked', false], ['pomodoro', 'pomodoroCheckboxState', 'checked', false],
    ['homeWidgets', 'myntHomeWidgetsVisible', 'boolean', true], ['studyQuote', 'myntStudyQuoteEnabled', 'string01', true],
    ['countdowns', 'myntEventCountdownsV1', 'events', true], ['weather', 'hideWeatherVisible', 'inverse', true],
    ['galleryEntry', 'myntGalleryEntryVisible', 'boolean', true], ['serviceStatus', 'myntServiceStatusPillVisible', 'boolean', true]
];
const compatibilityInputs = ['hideClock', 'hideWeatherCheckbox', 'shortcut_switchcheckbox', 'shortcutsCheckbox',
    'bookmarksCheckbox', 'aiToolsCheckbox', 'googleAppsCheckbox', 'pomodoroCheckbox', 'studyQuoteCheckbox', 'serviceStatusPillCheckbox'];

function storedVisibility(data, [, key, kind, fallback]) {
    const value = data[key];
    if (value === undefined) return fallback;
    return kind === 'events' ? JSON.parse(value).enabled : kind === 'inverse' ? value !== 'true' :
        kind === 'checked' ? value === 'checked' : kind === 'string01' ? value === '1' : value === 'true';
}
function staticChecks() {
    assert.deepEqual(Object.keys(dictionaries.en).sort(), Object.keys(dictionaries.zh_TW).sort(), 'en/zh_TW locale keys');
    const html = read('index.html');
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(ids).size, ids.length, 'Unique DOM IDs');
    assert.equal((html.match(/data-settings-group-button=/g) || []).length, 4, 'Exactly four tabs');
    const sectionIds = ['shortcutsSectionContent', 'aiToolSectionContent', 'pomodoroSectionContent', 'pomodoroDurationsContent',
        'pomodoroAdvancedContent', 'studySectionContent', 'countdownSectionContent', 'clockSectionContent', 'searchSectionContent',
        'weatherSectionContent', 'weatherAdvancedContent', 'layoutSectionContent', 'workspaceSectionContent', 'settingsSectionContent',
        'accessibilitySectionContent', 'privacySectionContent', 'serviceSectionContent', 'appearanceSectionContent'];
    assert.deepEqual([...html.matchAll(/<button\b[^>]*class="sectionHeader"[^>]*aria-controls="([^"]+)"/g)].map(match => match[1]).sort(), sectionIds.sort(), 'All 18 sections use a keyboard-operable disclosure with its own content ID');
    for (const lang of ['en', 'zh_TW']) assert.deepEqual(
        ['settingsGroupPersonal', 'settingsGroupAppearance', 'settingsGroupWork', 'settingsGroupAdvanced'].map(key => dictionaries[lang][key]), tabs[lang]);
    for (const lang of ['en', 'zh_TW']) for (const key of ['hideWeatherTitle', 'hideWeatherBox', 'hideSearchWith', 'micIconTitle', 'aiModeIconTitle']) {
        assert(!/^(?:隱藏|Hide\b)/i.test(dictionaries[lang][key]), `${lang}:${key} is positive`);
    }
    for (const name of ['index.html', 'locales/en.js', 'locales/zh_TW.js', 'scripts/menu-shortcut-page.js',
        'scripts/component-manager.js', 'scripts/widgets-transparency.js', 'scripts/adaptive-background.js',
        'scripts/dashboard-tools.js', 'scripts/weather.js', 'scripts/search.js', 'scripts/voice-search.js',
        'scripts/languages.js', 'styles/component-manager.css', 'style.css']) assert(!read(name).includes('\r'), `${name}: LF`);
    // pomodoro.js is -text with intentional mixed line endings; never normalize it.
    assert(!/<details\b[^>]*class="settingsTool"/.test(html), 'Moved tools use the shared section component');
    console.log(`SETTINGS_IA_STATIC_OK localeKeys=${Object.keys(dictionaries.en).length} tabs=4 LF=ok (pomodoro mixed preserved)`);
}

async function poll(fn, expected, label) {
    const deadline = Date.now() + 5000;
    let value;
    do {
        value = await fn();
        if (JSON.stringify(value) === JSON.stringify(expected)) return;
        await new Promise(resolve => setTimeout(resolve, 50));
    } while (Date.now() < deadline);
    assert.deepEqual(value, expected, label);
}
async function expand(page, id) {
    const section = page.locator(`#${id}`);
    const parents = section.locator('xpath=ancestor-or-self::*[contains(concat(" ", normalize-space(@class), " "), " section ")]');
    for (const parent of await parents.all()) {
        const header = parent.locator(':scope > .sectionOuter > .sectionHeader');
        if (await header.getAttribute('aria-expanded') === 'false') await header.click();
    }
}
async function select(page, index) { await page.locator('[data-settings-group-button]').nth(index).click(); }
async function openMenu(page) {
    if (await page.locator('#menuButton').getAttribute('aria-expanded') !== 'true') await page.locator('#menuButton').click();
    await page.locator('#menuCloseButton').waitFor({ state: 'visible' });
    await page.waitForTimeout(650);
}
async function noDuplicateSwitches(page) {
    for (let tab = 0; tab < 4; tab++) {
        await select(page, tab);
        for (const id of compatibilityInputs) {
            assert.equal(await page.locator(`#${id}`).count(), 1, `${id}: compatibility DOM retained`);
            assert.equal(await page.locator(`#${id}`).isVisible(), false, `${id}: duplicate row hidden on tab ${tab}`);
        }
        const negatives = await page.locator('#overviewPage .bigText').evaluateAll(nodes => nodes
            .filter(node => node.checkVisibility()).map(node => node.textContent.trim()).filter(text => /^(?:隱藏|Hide\b)/i.test(text)));
        assert.deepEqual(negatives, [], 'No negative switch labels');
    }
}
async function fixtureCompatibility(page, fixture) {
    for (const item of components) {
        const [id] = item, expected = storedVisibility(fixture, item);
        assert.equal(await page.locator(`#myntComponent-${id}`).isChecked(), expected, `Old fixture visibility: ${id}`);
        const actual = await page.evaluate(id => MYNTComponentVisibilityCore.read(localStorage).find(item => item.id === id), id);
        assert(actual.valid, `${id}: valid old data`);
        assert.equal(actual.visible, expected, `${id}: canonical state`);
    }
    for (const key of ['selectedLanguage', 'selectedTheme', 'preferredTheme', 'hideClockVisible', 'hideWeatherVisible', 'micIconVisible', 'aiModeIconVisible', 'hideWeatherCardState']) {
        if (Object.hasOwn(fixture, key)) assert.equal(await page.evaluate(key => localStorage.getItem(key), key), fixture[key], `Fixture preference preserved: ${key}`);
    }
    assert.equal(await page.locator('#languageSelector').inputValue(), fixture.selectedLanguage);
    if (fixture.preferredTheme) assert.equal(await page.locator('#themeSegment').getAttribute('data-active'), fixture.preferredTheme);
    if (fixture.selectedTheme) assert.equal(await page.locator(`input[name="color"][value="${fixture.selectedTheme}"]`).isChecked(), true, 'Fixture theme colour');
    if (fixture.micIconVisible) assert.equal(await page.locator('#micIcon').isVisible(), fixture.micIconVisible === 'true');
    if (fixture.aiModeIconVisible) assert.equal(await page.locator('#aiModeIcon').isVisible(), fixture.aiModeIconVisible !== 'false');
    if (fixture.hideWeatherCardState) assert.equal(await page.locator('#hideWeatherCard').isChecked(), fixture.hideWeatherCardState !== 'checked');
}
async function componentToggles(page, context) {
    // Supply actual countdown content through the shipped manage dialog; a direct
    // storage write bypasses the product's revision tracking and fails validation
    // (event ids must match /^e[A-Za-z0-9_-]{1,79}$/), leaving the row disabled.
    await page.evaluate(() => window.myntCountdowns.open());
    await page.locator('#eventCountdownAdd').click();
    await page.locator('#eventCountdown-name').fill('IA event');
    await page.locator('#eventCountdown-date').fill('2099-12-31');
    await page.locator('#eventCountdownDialog form button[type="submit"]').click();
    await page.locator('#eventCountdownDialog .event-countdown-head button').click();
    await page.evaluate(() => window.myntComponents.refresh());
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await select(page, 0);
    await poll(() => page.locator('#myntComponentManager input[type="checkbox"]').count(), 14, '14 manager switches');
    assert.equal(await page.locator('#myntComponentManager fieldset').count(), 4, 'Four component groups');
    // Enable the search parent before checking its provider row.
    await page.locator('#myntComponent-search').check();
    for (const [id, key, kind] of components) {
        // centered-home.css hides some manager rows (homeWidgets) on the base build as well; nothing to toggle there.
        if (!await page.locator(`#myntComponent-${id}`).isVisible()) { console.log(`SETTINGS_IA_SKIP ${id}: row hidden by product CSS`); continue; }
        // Every step must be a real change: setting an already-matching state fires no change event and writes nothing.
        const initiallyOn = await page.locator(`#myntComponent-${id}`).isChecked();
        for (const visible of initiallyOn ? [false, true, false, true] : [true, false, true]) {
            await page.locator(`#myntComponent-${id}`).setChecked(visible);
            const expected = kind === 'inverse' ? String(!visible) : kind === 'checked' ? visible ? 'checked' : 'unchecked' : kind === 'string01' ? visible ? '1' : '0' : String(visible);
            await poll(() => page.evaluate(({ key, kind }) => {
                const value = localStorage.getItem(key);
                return kind === 'events' ? String(JSON.parse(value).enabled) : value;
            }, { key, kind }), expected, `${id}: original storage key`);
            const rendered = await page.evaluate(id => {
                const item = MYNTComponentVisibilityCore.definitions.find(item => item.id === id);
                if (id === 'searchProvider') return getComputedStyle(document.getElementById('search-with-container')).visibility !== 'hidden';
                // Clock nodes stay display:none on the base build too (removed-features, centered layout and video CSS own them),
                // so assert the manager's hidden marker instead of computed CSS.
                if (id === 'clock') return item.selectors.every(selector => [...document.querySelectorAll(selector)].every(node => !node.hasAttribute('data-mynt-component-hidden')));
                // #search-with-container is owned by the separate searchProvider switch (off by default).
                const selectors = id === 'search' ? item.selectors.filter(selector => selector !== '#search-with-container') : item.selectors;
                // Empty widgets still have renderable roots; visibility never fabricates user content.
                return selectors.every(selector => {
                    const node = document.querySelector(selector), css = getComputedStyle(node);
                    return css.display !== 'none' && css.visibility !== 'hidden';
                });
            }, id);
            assert.equal(rendered, visible, `${id}: actual homepage CSS visibility`);
        }
    }
    // Tool details follow their canonical component state, including manager and refresh paths.
    for (const [id] of components.filter(([id]) => ['shortcuts', 'aiTools', 'pomodoro', 'studyQuote', 'countdowns', 'search', 'weather'].includes(id))) {
        await select(page, 0); await page.locator(`#myntComponent-${id}`).uncheck(); await select(page, 2);
        assert.equal(await page.locator(`[data-settings-component="${id}"]`).isVisible(), false, `${id}: disabled tool absent`);
        await select(page, 0); await page.locator(`#myntComponent-${id}`).check(); await select(page, 2);
        assert.equal(await page.locator(`[data-settings-component="${id}"]`).isVisible(), true, `${id}: enabled tool available`);
    }
    // No network is needed by visibility changes. Keep this context offline for the rest of the checks.
}
async function detailsAndPositiveControls(page) {
    await select(page, 1);
    // Exercise the shipped upload/gallery path: the localStorage fixture has no IndexedDB media.
    await page.locator('#imageUpload').setInputFiles({ name: 'ia-wallpaper.png', mimeType: 'image/png',
        buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6RkAAAAASUVORK5CYII=', 'base64') });
    await page.locator('#opacityTextContainer').waitFor({ state: 'visible' });
    const auto = page.locator('#myntAdaptive-opacity'), slider = page.locator('.opacityBar');
    assert.equal(await page.locator('#opacityTextContainer .opacityBar').count(), 1, 'Opacity is one row');
    await auto.check();
    assert.equal(await slider.getAttribute('aria-disabled'), 'true');
    assert.equal(await slider.getAttribute('inert'), '');
    const before = await page.evaluate(() => localStorage.getItem('bgOpacity'));
    await slider.dispatchEvent('keydown', { key: 'End' });
    await slider.dispatchEvent('mousedown', { clientX: 0 });
    assert.equal(await page.evaluate(() => localStorage.getItem('bgOpacity')), before, 'Auto blocks slider writes');
    await auto.uncheck();
    assert.equal(await slider.getAttribute('aria-disabled'), 'false');
    assert.equal(await slider.getAttribute('inert'), null);
    await slider.scrollIntoViewIfNeeded();
    const rect = await slider.boundingBox();
    await page.mouse.move(rect.x + rect.width * .4, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width * .7, rect.y + rect.height / 2, { steps: 4 });
    await page.mouse.up();
    const dragged = await page.evaluate(() => Number(localStorage.getItem('bgOpacity')));
    assert(Math.abs(dragged - 70) < 2, `Manual opacity drag persists bgOpacity: ${dragged}`);
    await slider.focus(); await page.keyboard.press('End');
    assert.equal(await page.evaluate(() => Number(localStorage.getItem('bgOpacity'))), 100, 'Manual slider keyboard');
    await select(page, 2);
    await expand(page, 'searchSectionContent');
    for (const [input, key, icon] of [['micIconCheckbox', 'micIconVisible', 'micIcon'], ['aiModeIconCheckbox', 'aiModeIconVisible', 'aiModeIcon']]) {
        for (const checked of [false, true]) {
            await page.locator(`#${input}`).setChecked(checked);
            assert.equal(await page.evaluate(key => localStorage.getItem(key), key), String(checked));
            // micIcon hides via inline display:none; aiModeIcon collapses through its .hidden
            // class (width/opacity/transform transition keeps a non-empty box on both builds),
            // so assert the product's own hidden marker for the latter.
            const shown = await page.locator(`#${icon}`).evaluate(node =>
                node.id === 'aiModeIcon' ? !node.classList.contains('hidden') : node.checkVisibility());
            assert.equal(shown, checked, `${key}: checked means show`);
        }
    }
    await expand(page, 'pomodoroSectionContent');
    assert.equal(await page.locator('[aria-controls="pomodoroDurationsContent"]').getAttribute('aria-expanded'), 'false', 'Durations initially collapsed');
    assert.equal(await page.locator('#pomodoroDurationsContent').getAttribute('inert'), '', 'Collapsed durations cannot receive focus');
    const closedChevron = await page.locator('#pomodoroDurations .sectionChevron').evaluate(node => getComputedStyle(node).transform);
    await expand(page, 'pomodoroDurations');
    assert.notEqual(await page.locator('#pomodoroDurations .sectionChevron').evaluate(node => getComputedStyle(node).transform), closedChevron, 'Nested chevron follows its own disclosure state');
    await page.locator('#pomodoroWorkInput').fill('31'); await page.locator('#pomodoroWorkInput').press('Tab');
    await poll(() => page.evaluate(() => localStorage.getItem('pomodoroWorkMinutes')), '31', 'Duration persists');
    await poll(() => page.locator('#pomodoroDurationSummary').textContent().then(value => /31/.test(value)), true, 'Summary follows duration');
    await expand(page, 'pomodoroAdvanced');
    for (const id of ['pomodoroIconSizeInput', 'pomodoroPanelScaleInput', 'pomodoroResetPosBtn']) assert.equal(await page.locator(`#${id}`).isVisible(), true, id);
    await expand(page, 'weatherSectionContent');
    assert.equal(await page.locator('[aria-controls="weatherAdvancedContent"]').getAttribute('aria-expanded'), 'false', 'Weather advanced initially collapsed');
    assert.equal(await page.locator('#weatherAdvancedContent').getAttribute('inert'), '', 'Collapsed weather settings cannot receive focus');
    await expand(page, 'weatherAdvanced');
    for (const id of ['fahrenheitCheckbox', 'minMaxTempCheckbox', 'userLoc', 'useGPScheckbox', 'userAPI']) assert.equal(await page.locator(`#${id}`).isVisible(), true, id);
    if (page.viewportSize().width === 390) for (const checked of [false, true]) {
        await page.locator('#hideWeatherCard').setChecked(checked);
        assert.equal(await page.evaluate(() => localStorage.getItem('hideWeatherCardState')), checked ? 'unchecked' : 'checked');
        assert.equal(await page.locator('#hideWeather .lrectangle').isVisible(), checked, 'Mobile card positive state');
    }
}

async function controlCenterFunctions(page, language) {
    const t = dictionaries[language];
    assert.equal(await page.locator('#openControlCenterBtn').count(), 0, 'Old launch button removed');
    await select(page, 0);
    assert.equal(await page.locator('#workspaceSection').isVisible(), true);
    await page.locator('#workspaceAddBtn').click();
    await page.locator('#workspaceNameInput').fill('IA mode');
    await page.locator('#workspaceBackgroundSelect').selectOption('color');
    await page.locator('#workspaceFocusMinutesInput').fill('32');
    await page.locator('#workspaceUrlsInput').fill('https://example.org/');
    await page.locator('#workspaceSaveBtn').click();
    await poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('myntWorkspacePresets')).some(item => item.name === 'IA mode' && item.focusMinutes === 32 && item.urls[0] === 'https://example.org/')), true, 'Create/apply workspace');
    const card = page.locator('.workspacePresetCard').filter({ hasText: 'IA mode' });
    await card.locator('.workspaceEditBtn').click();
    await page.locator('#workspaceNameInput').fill('IA edited'); await page.locator('#workspaceSaveBtn').click();
    await poll(() => page.locator('.workspacePresetCard').filter({ hasText: 'IA edited' }).count(), 1, 'Edit workspace');
    await page.locator('.workspacePresetCard').filter({ hasText: 'IA edited' }).locator('.workspaceEditBtn').click();
    await page.locator('#workspaceCancelBtn').click();
    assert.equal(await page.locator('#workspaceEditorForm').isVisible(), false, 'Cancel editor');
    // Only the isolated profile's test mode is removed; no real user data is loaded in this profile.
    await page.evaluate(() => { window.myntDialog.confirm = async () => true; window.__iaLaunches = []; window.open = url => window.__iaLaunches.push(url); });
    await page.locator('.workspacePresetCard').filter({ hasText: 'IA edited' }).locator('.workspaceLaunchBtn').click();
    assert.deepEqual(await page.evaluate(() => window.__iaLaunches), ['https://example.org/'], 'Workspace launcher');
    await page.locator('.workspacePresetCard').filter({ hasText: 'IA edited' }).locator('.workspaceEditBtn').click();
    await page.locator('#workspaceDeleteBtn').click();
    await poll(() => page.locator('.workspacePresetCard').filter({ hasText: 'IA edited' }).count(), 0, 'Delete test mode');
    await select(page, 3);
    for (const id of ['accessibilitySection', 'privacySection', 'serviceSection']) assert.equal(await page.locator(`#${id}`).isVisible(), true, `${id}: system`);
    for (const [id, field] of [['reduceMotionCheckbox', 'reduceMotion'], ['highContrastCheckbox', 'highContrast']]) {
        // reduceMotion defaults to following the media query (already checked under
        // reducedMotion:'reduce'); a same-value setChecked fires no change and writes nothing.
        const initiallyOn = await page.locator(`#${id}`).isChecked();
        for (const checked of initiallyOn ? [false, true] : [true, false]) {
            await page.locator(`#${id}`).setChecked(checked);
            assert.equal(await page.evaluate(field => JSON.parse(localStorage.getItem('myntAccessibility'))[field], field), checked);
        }
    }
    await page.locator('#fontScaleSelect').selectOption('1.2');
    assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--mynt-font-scale')), '1.2');
    assert.equal(await page.locator('#privacyPolicyLink').getAttribute('href'), 'privacy-policy.html');
    assert.equal(await page.locator('.privacyDisclosureList li').count(), 3);
    assert(await page.locator('#serviceStatusList .serviceRow').count() >= 3);
    // Stub only permission boundaries; real handlers and status refresh still execute.
    await page.evaluate(() => {
        window.__iaPermissions = [];
        // Modern Chromium aliases browser to chrome, so the page prefers
        // browser.permissions and calls it Promise-style. A callback-only stub throws.
        for (const api of new Set([globalThis.chrome?.permissions, globalThis.browser?.permissions].filter(Boolean))) {
            api.contains = (spec, callback) => typeof callback === 'function' ? (callback(false), undefined) : Promise.resolve(false);
            api.request = (spec, callback) => {
                window.__iaPermissions.push('bookmarks');
                return typeof callback === 'function' ? (callback(false), undefined) : Promise.resolve(false);
            };
        }
        Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'default' });
        Notification.requestPermission = async () => { window.__iaPermissions.push('notifications'); return 'denied'; };
        navigator.permissions.query = async () => ({ state: 'prompt' });
        navigator.geolocation.getCurrentPosition = (_, error) => { window.__iaPermissions.push('location'); error({ code: 1 }); };
        window.dispatchEvent(new Event('offline'));
        document.dispatchEvent(new Event('visibilitychange'));
    });
    for (const permission of ['bookmarks', 'notifications', 'location']) {
        const button = page.locator(`[data-permission-action="${permission}"]`);
        await poll(() => button.isEnabled(), true, `${permission}: request available`);
        await button.click();
    }
    assert.deepEqual(await page.evaluate(() => window.__iaPermissions), ['bookmarks', 'notifications', 'location']);
    // Exercise the actual command entry points that formerly opened the dialog.
    for (const [key, section, group] of [['commandWorkspaces', 'workspaceSection', 0], ['commandPrivacy', 'privacySection', 3], ['commandAccessibility', 'accessibilitySection', 3], ['commandOpenControl', 'accessibilitySection', 3]]) {
        await page.keyboard.press('Control+k');
        await page.locator('#commandPaletteInput').fill(t[key]);
        await page.locator('.commandPaletteItem').filter({ has: page.locator('strong', { hasText: t[key] }) }).first().click();
        await poll(() => page.locator('[data-settings-group-button]').nth(group).getAttribute('aria-selected'), 'true', key);
        assert.equal(await page.locator(`#${section}`).isVisible(), true, key);
        assert.equal(await page.locator('#controlCenterDialog').getAttribute('open'), null);
    }
    await page.evaluate(() => document.getElementById('controlCenterDialog').showModal());
    assert.equal(await page.locator('#controlCenterDialog #workspaceSection').count(), 1, 'Legacy direct open reuses controls');
    await page.locator('#closeControlCenterBtn').click();
    await poll(() => page.locator('#overviewPage #workspaceSection').count(), 1, 'Legacy close returns controls to settings');
    await page.locator('#menuCloseButton').click(); await page.waitForTimeout(650);
    await page.locator('#serviceStatusPill').click();
    await poll(() => page.locator('[data-settings-group-button]').nth(3).getAttribute('aria-selected'), 'true', 'Service pill opens system');
}

async function backupRoundTrip(page) {
    await select(page, 3); await expand(page, 'settingsSectionContent');
    for (const id of ['backupBtn', 'restoreBtn', 'resetsettings', 'backupScopeSelect']) {
        assert.equal(await page.locator(`#${id}`).isVisible(), true, `${id}: system backup controls`);
    }
    // Exercise the shipped backup and atomic restore functions used by the UI, not a copied serializer.
    const result = await page.evaluate(async () => {
        await window.myntPomodoro.pause();
        localStorage.setItem('weatherApiKey', 'ia-test-secret');
        const { backup } = await createBackup('settings');
        const expected = backup.localStorage;
        localStorage.setItem('micIconVisible', 'false');
        localStorage.setItem('myntSearchVisible', 'false');
        localStorage.setItem('selectedTheme', 'red');
        await restoreData(backup);
        const after = (await createBackup('settings')).backup.localStorage;
        return { expected, after, key: localStorage.getItem('weatherApiKey'), leaks: Object.hasOwn(backup.localStorage, 'weatherApiKey') };
    });
    assert.equal(result.leaks, false, 'WeatherAPI secret excluded');
    assert.equal(result.key, 'ia-test-secret', 'Restore preserves destination secret');
    assert.deepEqual(result.after, result.expected, 'Every backed-up setting round-trips exactly');
}
async function layoutAndKeyboard(page, touch) {
    await openMenu(page); await select(page, 0);
    await page.locator('[data-settings-group-button]').first().focus();
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('[data-settings-group-button]').nth(3).getAttribute('aria-selected'), 'true', 'Left wraps');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('[data-settings-group-button]').first().getAttribute('aria-selected'), 'true', 'Right wraps');
    for (let index = 0; index < 4; index++) {
        const button = page.locator('[data-settings-group-button]').nth(index);
        if (touch) await button.tap(); else await button.click();
        assert.equal(await button.getAttribute('aria-selected'), 'true');
        // Expand visible settings using their real controls before checking scroll widths.
        for (const header of await page.locator('#overviewPage .sectionHeader:visible').all()) {
            if (await header.getAttribute('aria-expanded') === 'false') await header.click();
        }
        for (const summary of await page.locator('#overviewPage details:visible > summary').all()) {
            if (!await summary.evaluate(node => node.parentElement.open)) await summary.click();
        }
        const overflow = await page.evaluate(() => {
            const panel = document.getElementById('optCont');
            return document.documentElement.scrollWidth > innerWidth + 1 || panel.scrollWidth > panel.clientWidth + 1;
        });
        assert.equal(overflow, false, `No horizontal overflow at ${page.viewportSize().width}, tab ${index}`);
        const bad = await page.locator('[data-settings-group-button]').evaluateAll(nodes => nodes.some(node => node.clientHeight < 44 || node.scrollWidth > node.clientWidth + 1));
        assert.equal(bad, false, 'Tab touch targets and long labels');
        if (index === 0) {
            const buttons = await page.locator('#workspacePresetGrid .workspacePresetCard').evaluateAll(cards => cards.map(card => {
                const edit = card.querySelector('.workspaceEditBtn').getBoundingClientRect();
                const launch = card.querySelector('.workspaceLaunchBtn')?.getBoundingClientRect();
                return { editSize: edit.width >= 44 && edit.height >= 44,
                    launchSize: !launch || launch.width >= 44 && launch.height >= 44,
                    overlap: Boolean(launch && edit.left < launch.right && edit.right > launch.left && edit.top < launch.bottom && edit.bottom > launch.top) };
            }));
            assert(buttons.length >= 3 && buttons.every(item => item.editSize && item.launchSize && !item.overlap), 'Workspace actions: 44px and no overlap');
        }
        if (index === 1) {
            assert.equal(await page.locator('#appearanceSectionContent .innerSurface #adaptiveIconField .switch').count(), 1, 'Adaptive icon switch inside surface');
            const inline = await page.locator('#adaptiveIconField').evaluate(row => {
                const text = row.querySelector('.texts').getBoundingClientRect(), control = row.querySelector('.switch').getBoundingClientRect();
                return text.right <= control.left && text.top < control.bottom && text.bottom > control.top;
            });
            assert(inline, 'Adaptive icon label and switch share a row');
        }
        if (index === 2) {
            const border = await page.locator('#aiModeIconCheckbox').evaluate(input => getComputedStyle(input.closest('.ttcont')).borderBottomWidth);
            assert.equal(border, '0px', 'Search has no trailing divider before hidden compatibility row');
        }
        if (index === 3) {
            assert.deepEqual(await page.locator('[data-settings-group="system"] > .sectionOuter > .sectionHeader').evaluateAll(headers => headers.map(h => h.getAttribute('aria-controls'))),
                ['settingsSectionContent', 'accessibilitySectionContent', 'privacySectionContent', 'serviceSectionContent'], 'System section order');
            for (const id of ['reduceMotionCheckbox', 'highContrastCheckbox']) assert.equal(await page.locator(`#${id}`).evaluate(input => Boolean(input.closest('.ttcont') && input.closest('.switch'))), true, `${id}: shared switch row`);
        }
        // Each shared disclosure updates ARIA and makes its own content inert; nested sections keep their state.
        for (const header of await page.locator('#overviewPage [data-settings-group]:not([hidden]) > .sectionOuter > .sectionHeader').all()) {
            const content = page.locator(`#${await header.getAttribute('aria-controls')}`);
            await header.click();
            assert.equal(await header.getAttribute('aria-expanded'), 'false');
            assert.equal(await content.getAttribute('inert'), '');
            await header.focus(); await page.keyboard.press('Enter');
            assert.equal(await header.getAttribute('aria-expanded'), 'true');
            assert.equal(await content.getAttribute('inert'), null);
        }
    }
    await page.locator('#menuCloseButton').focus(); await page.keyboard.press('Escape');
    assert.equal(await page.locator('#menuButton').getAttribute('aria-expanded'), 'false', 'Keyboard closes settings');
}

async function launch(extension, seed, mobile) {
    const { chromium } = require('C:/Users/Administrator/node_modules/playwright');
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mynt-settings-ia-'));
    const context = await chromium.launchPersistentContext(profile, {
        executablePath: CHROME, headless: true, acceptDownloads: true,
        viewport: mobile ? { width: 390, height: 844 } : { width: 1400, height: 900 },
        deviceScaleFactor: mobile ? 2 : 1, hasTouch: mobile, reducedMotion: 'reduce',
        args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
    });
    try {
        await context.addInitScript(fixture => {
            if (location.protocol !== 'chrome-extension:' || sessionStorage.getItem('mynt-ia-seeded')) return;
            // The quote bag may reshuffle on load; compare both builds with the same draws.
            let randomSeed = 1;
            Math.random = () => ((randomSeed = Math.imul(randomSeed, 1664525) + 1013904223 >>> 0) / 4294967296);
            localStorage.clear();
            for (const [key, value] of Object.entries(fixture)) localStorage.setItem(key, value);
            sessionStorage.setItem('mynt-ia-seeded', '1');
        }, seed);
        let [worker] = context.serviceWorkers();
        if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
        const page = context.pages()[0] || await context.newPage();
        // Keep date-derived preferences and service timestamps identical across separate profiles.
        // setFixedTime leaves timers/animations running, unlike a paused browser clock.
        await page.clock.setFixedTime(new Date('2026-11-23T04:00:00Z'));
        const errors = [];
        page.on('pageerror', error => errors.push(error.stack || error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(`${message.text()} @${message.location().url}:${message.location().lineNumber}`); });
        await page.goto(`chrome-extension://${new URL(worker.url()).host}/index.html`);
        await page.waitForFunction(() => window.myntComponents && window.myntPomodoro && window.myntDashboard);
        await page.waitForTimeout(1000);
        return { context, page, errors };
    } catch (error) { await context.close(); throw error; }
}
async function fixtureSnapshot(page, fixture) {
    return page.evaluate(({ ids, keys }) => {
        const roots = Object.fromEntries(ids.map(id => {
            const item = MYNTComponentVisibilityCore.definitions.find(item => item.id === id);
            const selectors = id === 'searchProvider' ? ['#search-with-container'] : item.selectors;
            return [id, selectors.map(selector => {
                const node = document.querySelector(selector);
                if (!node) throw Error(`Missing fixture root: ${selector}`);
                const css = getComputedStyle(node);
                return { selector, display: css.display, visibility: css.visibility };
            })];
        }));
        return { roots, language: document.getElementById('languageSelector').value,
            theme: { mode: document.getElementById('themeSegment').dataset.active,
                color: document.querySelector('input[name="color"]:checked')?.value,
                background: document.body.dataset.bg,
                classes: [...document.documentElement.classList].filter(name => name.endsWith('-theme')).sort(),
                surface: getComputedStyle(document.documentElement).getPropertyValue('--bg-color-blue'),
                text: getComputedStyle(document.documentElement).getPropertyValue('--textColorDark-blue') },
            storage: Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])) };
    }, { ids: components.map(([id]) => id), keys: [...new Set([...Object.keys(fixture), ...components.map(([, key]) => key)])].sort() });
}
async function run(language, mobile) {
    assert(fixturePath, 'A fixture must exist');
    const data = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const fixture = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]));
    fixture.selectedLanguage = language;
    const saved = await launch(EXT, fixture, mobile);
    try {
        const snapshot = await fixtureSnapshot(saved.page, fixture);
        await openMenu(saved.page);
        assert.deepEqual(await saved.page.locator('[data-settings-group-button]').allTextContents().then(values => values.map(value => value.trim())), tabs[language]);
        await fixtureCompatibility(saved.page, fixture);
        assert.deepEqual(saved.errors, [], 'Fixture has no console/page errors');
        if (BASE) {
            const base = await launch(BASE, fixture, mobile);
            try {
                assert.deepEqual(snapshot, await fixtureSnapshot(base.page, fixture), 'Identical fixture: 14 component roots, theme, language and stored values match baseline');
                assert.deepEqual(base.errors, [], 'Baseline fixture has no console/page errors');
                console.log(`SETTINGS_IA_BASE_COMPARISON_OK ${language} ${mobile ? 'mobile' : 'desktop'} roots=14 storage=exact`);
            } finally { await base.context.close(); }
        } else console.log('SKIP base comparison (set MYNT_BASE_EXTENSION)');
        console.log(`SETTINGS_IA_FIXTURE_OK ${language} ${mobile ? 'mobile' : 'desktop'}`);
    } finally { await saved.context.close(); }
    // Component visibility belongs to the default layout, independent of the user's saved layout/profile.
    const { context, page, errors } = await launch(EXT, { selectedLanguage: language }, mobile);
    try {
        await openMenu(page);
        assert.deepEqual(await page.locator('[data-settings-group-button]').allTextContents().then(values => values.map(value => value.trim())), tabs[language]);
        await select(page, 3);
        assert.equal(await page.locator('[aria-controls="settingsSectionContent"]').getAttribute('aria-expanded'), 'true', 'Language and backup initially expanded');
        assert.equal(await page.locator('#settingsSectionTitle').textContent(), dictionaries[language].settingsLanguageBackupTitle);
        await noDuplicateSwitches(page);
        await componentToggles(page, context);
        await detailsAndPositiveControls(page);
        await controlCenterFunctions(page, language);
        await backupRoundTrip(page);
        await layoutAndKeyboard(page, mobile);
        assert.deepEqual(errors, [], 'No console/page errors during settings interactions');
        console.log(`SETTINGS_IA_BROWSER_OK ${language} ${mobile ? '390x844@2 touch' : '1400x900'} components=14 backup=exact keyboard=ok`);
    } finally { await context.close(); }
}
(async () => {
    if (process.argv.includes('--static')) { staticChecks(); return; }
    for (const language of ['zh_TW', 'en']) for (const mobile of [false, true]) await run(language, mobile);
    staticChecks();
    console.log('SETTINGS_IA_OK');
})().catch(error => { console.error('SETTINGS_IA_FAIL', error); process.exitCode = 1; });

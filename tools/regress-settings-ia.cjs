/* Run outside the Codex sandbox (Chromium spawn is blocked there).
 * node tools/regress-settings-ia.cjs [extension-directory]
 * MYNT_EXTENSION selects a baseline checkout without copying this test into it.
 * MYNT_BASE_EXTENSION enables identical-fixture rendering/storage comparison with the baseline.
 * MYNT_FIXTURE overrides the de-identified localStorage fixture; --static needs no browser.
 * --review-case=M1|M3|M4|L1|DARK isolates one review regression for pre-fix/post-fix browser evidence.
 * Browser profiles are disposable and retained for diagnostics, never a real Chrome profile.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const EXT = path.resolve(process.env.MYNT_EXTENSION || process.argv.find((arg, i) => i > 1 && !arg.startsWith('--')) || path.join(__dirname, '..'));
const BASE = process.env.MYNT_BASE_EXTENSION && path.resolve(process.env.MYNT_BASE_EXTENSION);
const REVIEW_CASE = process.argv.find(arg => arg.startsWith('--review-case='))?.split('=')[1];
const CHROME = process.env.CHROME_BIN || 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const fixturePath = process.env.MYNT_FIXTURE || [
    path.resolve(__dirname, '../../fixtures/user-localstorage.json'),
    path.join(EXT, 'tools/fixtures/ui-seed.json')
].find(file => fs.existsSync(file));
const read = name => fs.readFileSync(path.join(EXT, name), 'utf8');
const words = language => vm.runInNewContext(read(`locales/${language}.js`) + `\n;${language}`);
const dictionaries = { en: words('en'), zh_TW: words('zh_TW') };
// The System tab (language, backup, accessibility, permissions, service status) was removed (owner decision 2026-11-24).
const tabs = { zh_TW: ['首頁', '外觀', '工具'], en: ['Home', 'Appearance', 'Tools'] };
const removedSystemIds = ['settingsGroupAdvanced', 'settingsSectionTitle', 'languageSelector', 'backupScopeSelect', 'backupBtn', 'restoreBtn',
    'fileInput', 'resetsettings', 'accessibilitySection', 'reduceMotionCheckbox', 'highContrastCheckbox', 'fontScaleSelect',
    'privacySection', 'privacyPolicyLink', 'serviceSection', 'serviceStatusPillCheckbox', 'serviceStatusList'];
const components = [
    ['clock', 'hideClockVisible', 'inverse', true], ['search', 'myntSearchVisible', 'boolean', true],
    ['searchProvider', 'showShortcutSwitch', 'inverse', true], ['shortcuts', 'shortcutsCheckboxState', 'checked', false],
    ['aiTools', 'aiToolsCheckboxState', 'checked', false], ['googleApps', 'googleAppsCheckboxState', 'checked', false],
    ['bookmarks', 'bookmarksCheckboxState', 'checked', false], ['pomodoro', 'pomodoroCheckboxState', 'checked', false],
    ['homeWidgets', 'myntHomeWidgetsVisible', 'boolean', true], ['studyQuote', 'myntStudyQuoteEnabled', 'string01', true],
    ['countdowns', 'myntEventCountdownsV1', 'events', true],
    ['galleryEntry', 'myntGalleryEntryVisible', 'boolean', true]
];
const compatibilityInputs = ['hideClock', 'hideWeatherCheckbox', 'shortcut_switchcheckbox', 'shortcutsCheckbox',
    'bookmarksCheckbox', 'aiToolsCheckbox', 'googleAppsCheckbox', 'pomodoroCheckbox', 'studyQuoteCheckbox'];

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
    assert.equal((html.match(/data-settings-group-button=/g) || []).length, 3, 'Exactly three tabs');
    assert(!/data-settings-group(?:-button)?="system"/.test(html), 'No System tab or System section remains');
    for (const id of removedSystemIds) assert(!ids.includes(id), `${id}: removed with the System tab`);
    const sectionIds = ['shortcutsSectionContent', 'aiToolSectionContent', 'pomodoroSectionContent', 'pomodoroDurationsContent',
        'pomodoroAdvancedContent', 'studySectionContent', 'countdownSectionContent', 'clockSectionContent', 'searchSectionContent',
        'weatherSectionContent', 'weatherAdvancedContent', 'layoutSectionContent', 'workspaceSectionContent', 'appearanceSectionContent'];
    assert.deepEqual([...html.matchAll(/<button\b[^>]*class="sectionHeader"[^>]*aria-controls="([^"]+)"/g)].map(match => match[1]).sort(), sectionIds.sort(), 'All 14 sections use a keyboard-operable disclosure with its own content ID');
    for (const lang of ['en', 'zh_TW']) assert.deepEqual(
        ['settingsGroupPersonal', 'settingsGroupAppearance', 'settingsGroupWork'].map(key => dictionaries[lang][key]), tabs[lang]);
    for (const lang of ['en', 'zh_TW']) for (const key of ['hideWeatherTitle', 'hideWeatherBox', 'hideSearchWith', 'micIconTitle', 'aiModeIconTitle']) {
        assert(!/^(?:隱藏|Hide\b)/i.test(dictionaries[lang][key]), `${lang}:${key} is positive`);
    }
    assert.equal(dictionaries.en.showMicInfo, 'Show the voice typing button in the search bar');
    assert.equal(dictionaries.zh_TW.showMicInfo, '在搜尋列顯示語音輸入按鈕');
    assert.match(read('scripts/languages.js'), /\{ id: "micIconInfo", key: "showMicInfo" \}/, 'Other locales use the positive English fallback');
    for (const name of ['index.html', 'locales/en.js', 'locales/zh_TW.js', 'scripts/menu-shortcut-page.js',
        'scripts/component-manager.js', 'scripts/widgets-transparency.js', 'scripts/adaptive-background.js',
        'scripts/dashboard-tools.js', 'scripts/weather.js', 'scripts/search.js', 'scripts/voice-search.js',
        'scripts/languages.js', 'styles/component-manager.css', 'style.css']) assert(!read(name).includes('\r'), `${name}: LF`);
    // pomodoro.js is -text with intentional mixed line endings; never normalize it.
    assert(!/<details\b[^>]*class="settingsTool"/.test(html), 'Moved tools use the shared section component');
    console.log(`SETTINGS_IA_STATIC_OK localeKeys=${Object.keys(dictionaries.en).length} tabs=3 LF=ok (pomodoro mixed preserved)`);
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
    for (let tab = 0; tab < tabs.en.length; tab++) {
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
        // A palette retired in 2026-11 is migrated once to its nearest current palette.
        const expected = key === 'selectedTheme' ? await page.evaluate(value => window.ThemeHelpers.LEGACY_PALETTES[value] || value, fixture[key]) : fixture[key];
        if (Object.hasOwn(fixture, key)) assert.equal(await page.evaluate(key => localStorage.getItem(key), key), expected, `Fixture preference preserved: ${key}`);
    }
    // No selector remains; the stored language still drives the page.
    assert.equal(await page.locator('#languageSelector').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.lang), fixture.selectedLanguage === 'zh_TW' ? 'zh-TW' : fixture.selectedLanguage.replace('_', '-'));
    if (fixture.preferredTheme) assert.equal(await page.locator('#themeSegment').getAttribute('data-active'), fixture.preferredTheme);
    if (fixture.selectedTheme) assert.equal(await page.locator('input[name="color"]:checked').getAttribute('value'),
        await page.evaluate(() => localStorage.getItem('selectedTheme')), 'Fixture theme colour');
    if (fixture.micIconVisible) assert.equal(await page.locator('#micIcon').isVisible(), fixture.micIconVisible === 'true');
    if (fixture.aiModeIconVisible) assert.equal(await page.locator('#aiModeIcon').isVisible(), fixture.aiModeIconVisible !== 'false');
    if (fixture.hideWeatherCardState) assert.equal(await page.locator('#hideWeatherCard').isChecked(), fixture.hideWeatherCardState !== 'checked');
}
async function clockOptionsAfterManager(page) {
    // Reproduce a saved hidden clock on load, rather than only toggling an initialized clock.
    await page.evaluate(() => { localStorage.setItem('hideClockVisible', 'true'); localStorage.setItem('clocktype', 'analog'); localStorage.setItem('hourformat', 'false'); });
    await page.reload();
    await page.waitForFunction(() => window.myntComponents && window.myntSettings);
    await openMenu(page); await select(page, 0);
    assert.equal(await page.locator('.clockOptions').evaluate(node => node.classList.contains('not-applicable')), page.viewportSize().width > 500, 'Hidden clock keeps the existing narrow-screen exception');
    await page.locator('#myntComponent-clock').check();
    assert.equal(await page.evaluate(() => localStorage.getItem('hideClockVisible')), 'false');
    await select(page, 1); await expand(page, 'clockSectionContent');
    assert.equal(await page.locator('.clockOptions').evaluate(node => node.classList.contains('not-applicable')), false, 'M1: manager restores clock options');
    assert.notEqual(await page.locator('.clockOptions').evaluate(node => getComputedStyle(node).pointerEvents), 'none', 'M1: clock options accept clicks');
    for (const [id, key, expected] of [['digitalCheckbox', 'clocktype', 'digital'], ['12hourcheckbox', 'hourformat', 'true']]) {
        // '12hourcheckbox' starts with a digit, so '#id' is not a valid CSS selector.
        await page.locator(`[id="${id}"]`).locator('..').click();
        assert.equal(await page.locator(`[id="${id}"]`).isChecked(), true, `M1: ${id} is clickable`);
        await poll(() => page.evaluate(key => localStorage.getItem(key), key), expected, `M1: ${key} persists`);
    }
}
async function touchTargets(page, selector, expectedCount) {
    const sizes = await page.locator(selector).evaluateAll(nodes => nodes.map(node => {
        const rect = node.getBoundingClientRect();
        return { id: node.id || node.dataset.target, width: rect.width, height: rect.height };
    }));
    if (expectedCount !== undefined) assert.equal(sizes.length, expectedCount, `M3: ${selector} count`);
    assert(sizes.length > 0, `M3: ${selector} exercised`);
    for (const size of sizes) assert(size.height >= 44 && (!selector.includes('pomodoroNumBtn') || size.width >= 44), `M3: ${size.id} target ${size.width}x${size.height}`);
}
async function settingsTouchTargets(page) {
    await select(page, 0);
    for (const id of ['pomodoro', 'studyQuote']) await page.locator(`#myntComponent-${id}`).check();
    await select(page, 2);
    for (const id of ['pomodoroSectionContent', 'pomodoroDurations', 'pomodoroAdvanced', 'studySectionContent']) await expand(page, id);
    await touchTargets(page, '#menuCont .pomodoroNumBtn:visible', 13);
    const inline = await page.locator('#menuCont .pomodoroNumberInput:visible').evaluateAll(nodes => nodes.every(node => {
        const boxes = [...node.children].map(child => child.getBoundingClientRect());
        return node.scrollWidth <= node.clientWidth + 1 && boxes.every(box => Math.abs(box.top + box.height / 2 - boxes[0].top - boxes[0].height / 2) < 1) && boxes.every((box, i) => i === 0 || boxes[i - 1].right <= box.left);
    }));
    assert(inline, 'M3: minus/input/plus stay on one line without overlap or overflow');
    await touchTargets(page, '#menuCont .settingsActionBtn:visible');
    assert.equal(await page.locator('#studyQuotesManageButton').isVisible(), true, 'M3: tool action exercised');
    await select(page, 0); await expand(page, 'workspaceSectionContent');
    await page.locator('#workspacePresetGrid .workspaceEditBtn').first().click();
    await touchTargets(page, '#menuCont .workspaceEditorActions button:visible', 3);
    await touchTargets(page, '#menuCont .settingsActionBtn:visible', 2);
    await page.locator('#workspaceCancelBtn').click();
}
async function openSettingsFromShortcutEditor(page) {
    await select(page, 0); await page.locator('#myntComponent-shortcuts').check();
    // Exercise both an editor transition in progress and a fully settled subpage.
    for (const delay of [0, 700]) {
        await select(page, 2); await expand(page, 'shortcutsSectionContent');
        await page.locator('#shortcutEditButton').click();
        await poll(() => page.locator('#shortcutEditPage').evaluate(node => node.style.display), 'block', 'L1: editor opens');
        if (delay) await page.waitForTimeout(delay);
        await page.evaluate(() => window.myntSettings.open('workspaceSection'));
        await poll(() => page.locator('#overviewPage').isVisible(), true, 'L1: overview restored');
        await poll(() => page.evaluate(() => document.activeElement.id), 'workspaceSection', 'L1: target focused');
        await page.waitForTimeout(700);
        assert.equal(await page.locator('#shortcutEditPage').isVisible(), false, 'L1: editor stays hidden after pending animations');
        assert.equal(await page.locator('#workspaceSection').isVisible(), true, 'L1: target stays visible');
        assert.equal(await page.locator('[data-settings-group-button]').nth(0).getAttribute('aria-selected'), 'true');
        assert.equal(await page.locator('#workspaceSection').evaluate(node => {
            const target = node.getBoundingClientRect(), panel = document.getElementById('optCont').getBoundingClientRect();
            return target.top < panel.bottom && target.bottom > panel.top;
        }), true, 'L1: target scrolled into the panel');
    }
}
async function movedSettingsContrast(page) {
    const results = [];
    // The high-contrast setting was removed; a stale saved preference must no longer apply.
    // The black swatch was retired in 2026-11: a stored 'dark' migrates to the ink palette and dark mode inverts it.
    for (const [theme, stored, mode, highContrast, color] of [
        ['light', 'haze', 'light', false, 'haze'], ['dark', 'haze', 'dark', false, 'haze'],
        ['legacy-black', 'dark', 'dark', false, 'ink'], ['stale-high-contrast', 'ink', 'dark', false, 'ink']
    ]) {
        // Reload through the real theme initializers.
        await page.evaluate(({ stored, mode, theme }) => {
            localStorage.setItem('selectedTheme', stored);
            localStorage.setItem('preferredTheme', mode);
            localStorage.setItem('myntAccessibility', JSON.stringify(theme === 'stale-high-contrast' ? { highContrast: true, fontScale: 1.2 } : {}));
        }, { stored, mode, theme });
        await page.reload();
        await page.waitForFunction(() => window.myntComponents && window.myntDashboard);
        await openMenu(page);
        assert.deepEqual(await page.evaluate(() => ({
            color: document.querySelector('input[name="color"]:checked').value,
            mode: document.getElementById('themeSegment').dataset.active,
            highContrast: document.documentElement.classList.contains('myntHighContrast'),
            black: document.documentElement.classList.contains('black-theme')
        })), { color, mode, highContrast, black: false }, `DARK: ${theme} initialized`);
        assert.equal(await page.evaluate(() => localStorage.getItem('selectedTheme')), color, `DARK: ${theme} stored palette migrated`);
        assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--mynt-font-scale')), '', `${theme}: no saved font scale applied`);
        const measure = async selector => page.locator(selector).evaluateAll(nodes => {
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            const pixel = (color, filter = 'none') => {
                ctx.filter = 'none'; ctx.clearRect(0, 0, 1, 1);
                ctx.filter = filter; ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1);
                return [...ctx.getImageData(0, 0, 1, 1).data];
            };
            if (pixel('#fff', 'invert(1) hue-rotate(180deg)').slice(0, 3).some(value => value !== 0)) throw Error('Canvas CSS filters unavailable');
            const over = (fg, bg) => {
                const alpha = fg[3] + bg[3] * (1 - fg[3]);
                if (!alpha) return [0, 0, 0, 0];
                return [...fg.slice(0, 3).map((value, i) => (value * fg[3] + bg[i] * bg[3] * (1 - fg[3])) / alpha), alpha];
            };
            const rgba = color => { const values = pixel(color); values[3] /= 255; return values; };
            const surface = node => {
                let color = [0, 0, 0, 0];
                for (; node && color[3] < 1; node = node.parentElement) {
                    const css = getComputedStyle(node);
                    if (css.backgroundImage !== 'none') throw Error('Contrast surface has an unmodelled image');
                    color = over(color, rgba(css.backgroundColor));
                }
                if (color[3] !== 1) throw Error('Contrast surface needs an opaque ancestor');
                return color;
            };
            const filters = node => {
                const values = [];
                for (; node; node = node.parentElement) {
                    const css = getComputedStyle(node);
                    if (Number(css.opacity) !== 1) throw Error('Contrast target has unmodelled group opacity');
                    if (css.filter !== 'none') {
                        if (css.filter !== 'invert(1) hue-rotate(180deg)') throw Error(`Unexpected contrast filter: ${css.filter}`);
                        values.push(css.filter);
                    }
                }
                return values;
            };
            const effective = (rgb, values) => values.reduce((rgb, filter) => pixel(`rgb(${rgb.slice(0, 3).join(' ')})`, filter), rgb);
            const luminance = rgb => rgb.slice(0, 3).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
            return nodes.flatMap(node => {
                const original = node.className;
                try {
                    return [null].map(state => {
                        const values = filters(node), background = surface(node);
                        const fg = effective(over(rgba(getComputedStyle(node).color), background), values);
                        const bg = effective(background, values), a = luminance(fg), b = luminance(bg);
                        const card = node.closest('.workspacePresetCard');
                        return { label: `${node.textContent.trim()}${state ? ` (${state})` : ''}`, fg, bg,
                            filters: values.length, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05),
                            ...(card ? { cardLuminance: luminance(effective(surface(card), values)),
                                panelLuminance: luminance(effective(surface(card.closest('.sectionInner')), values)) } : {}) };
                    });
                } finally { node.className = original; }
            });
        });
        await select(page, 0); await expand(page, 'workspaceSectionContent');
        const cards = await measure('#workspacePresetGrid .workspaceApplyBtn strong');
        assert(cards.length >= 3, `DARK: ${theme} workspace titles exercised`);
        results.push({ theme, mode, samples: cards });
        console.log(`SETTINGS_IA_DARK_MEASURE ${theme} ${JSON.stringify({
            ratios: { cards: cards.map(x => x.ratio) },
            cards: cards.map(({ cardLuminance, panelLuminance }) => ({ cardLuminance, panelLuminance }))
        })}`);
    }
    for (const { theme, mode, samples } of results) for (const sample of samples) {
        assert.equal(sample.filters, mode === 'dark' ? 1 : 0, `DARK: ${theme} actual inversion pipeline`);
        assert(sample.ratio >= 4.5, `DARK: ${theme} ${sample.label}: ${sample.fg} on ${sample.bg} = ${sample.ratio.toFixed(2)}:1`);
        if (mode === 'dark' && 'cardLuminance' in sample) assert(sample.cardLuminance < .2, `DARK: inverted workspace card must stay dark: ${sample.cardLuminance} (panel ${sample.panelLuminance})`);
    }
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
    await poll(() => page.locator('#myntComponentManager input[type="checkbox"]').count(), 12, '12 manager switches (weather and service alert removed)');
    assert.equal(await page.locator('#myntComponent-serviceStatus').count(), 0, 'Service alert switch removed with the System tab');
    assert.equal(await page.locator('#myntComponentManager fieldset').count(), 4, 'Four component groups');
    // Enable the search parent before checking its provider row.
    await page.locator('#myntComponent-search').check();
    const tested = [];
    // Only homeWidgets is intentionally hidden by centered-home.css; every other row must be operable.
    assert.equal(await page.locator('#myntComponent-homeWidgets').isVisible(), false, 'homeWidgets: centered-home.css exception');
    for (const [id, key, kind] of components.filter(([id]) => id !== 'homeWidgets')) {
        assert.equal(await page.locator(`#myntComponent-${id}`).isVisible(), true, `${id}: required manager row visible`);
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
        tested.push(id);
    }
    // Tool details follow their canonical component state, including manager and refresh paths.
    for (const [id] of components.filter(([id]) => ['shortcuts', 'aiTools', 'pomodoro', 'studyQuote', 'countdowns', 'search'].includes(id))) {
        await select(page, 0); await page.locator(`#myntComponent-${id}`).uncheck(); await select(page, 2);
        assert.equal(await page.locator(`[data-settings-component="${id}"]`).isVisible(), false, `${id}: disabled tool absent`);
        await select(page, 0); await page.locator(`#myntComponent-${id}`).check(); await select(page, 2);
        assert.equal(await page.locator(`[data-settings-component="${id}"]`).isVisible(), true, `${id}: enabled tool available`);
    }
    // No network is needed by visibility changes. Keep this context offline for the rest of the checks.
    return tested.length;
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
    for (const selector of ['[data-settings-component="weather"]', '#weatherAdvanced', '#hideWeatherCard',
        '#fahrenheitCheckbox', '#minMaxTempCheckbox', '#userLoc', '#useGPScheckbox', '#userAPI']) {
        assert.equal(await page.locator(selector).isVisible(), false, `${selector}: removed weather settings hidden`);
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
    // Removed System commands no longer appear in the command palette.
    await page.keyboard.press('Control+k');
    for (const key of ['commandPrivacy', 'commandAccessibility', 'commandSystemSettings']) {
        await page.locator('#commandPaletteInput').fill(t[key]);
        await poll(() => page.locator('.commandPaletteItem').filter({ has: page.locator('strong', { hasText: t[key] }) }).count(), 0, `${key}: command removed`);
    }
    await page.evaluate(() => document.getElementById('commandPaletteDialog').close());
    // Exercise the actual command entry points that formerly opened the dialog.
    for (const [key, section, group] of [['commandWorkspaces', 'workspaceSection', 0]]) {
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
    // A stored service failure no longer raises the home-page alert (behaves as if the alert toggle were off).
    await page.evaluate(() => { localStorage.setItem('myntServiceStatus', JSON.stringify({ wallpaper: { status: 'error', code: 503, at: Date.now() } })); window.dispatchEvent(new Event('online')); });
    assert.equal(await page.locator('#serviceStatusPill').isVisible(), false, 'Service alert stays hidden');
}

async function backupRoundTrip(page) {
    for (const id of ['backupBtn', 'restoreBtn', 'resetsettings', 'backupScopeSelect']) {
        assert.equal(await page.locator(`#${id}`).count(), 0, `${id}: backup controls removed`);
    }
    // The retained engine (kept for interrupted-restore recovery) still round-trips exactly.
    const result = await page.evaluate(async () => {
        await window.myntPomodoro.pause();
        localStorage.setItem('weatherApiKey', 'ia-test-secret');
        const { backup } = await createBackup('settings');
        const expected = backup.localStorage;
        localStorage.setItem('micIconVisible', 'false');
        localStorage.setItem('myntSearchVisible', 'false');
        localStorage.setItem('selectedTheme', 'rose');
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
    assert.equal(await page.locator('[data-settings-group-button]').nth(tabs.en.length - 1).getAttribute('aria-selected'), 'true', 'Left wraps');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('[data-settings-group-button]').first().getAttribute('aria-selected'), 'true', 'Right wraps');
    for (let index = 0; index < tabs.en.length; index++) {
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
            assert.equal(await page.locator('#adaptiveIconField, #adaptiveIconToggle').count(), 0, 'Adaptive icon setting is removed');
        }
        if (index === 2) {
            const border = await page.locator('#aiModeIconCheckbox').evaluate(input => getComputedStyle(input.closest('.ttcont')).borderBottomWidth);
            assert.equal(border, '0px', 'Search has no trailing divider before hidden compatibility row');
        }
        // Each shared disclosure updates ARIA and makes its own content inert; nested sections keep their state.
        for (const header of await page.locator('#overviewPage [data-settings-group]:not([hidden]) > .sectionOuter > .sectionHeader:visible').all()) {
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
    const { chromium } = require('playwright');
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
        return { roots, language: document.documentElement.lang,
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
    if (REVIEW_CASE) {
        const cases = { M1: clockOptionsAfterManager, M3: settingsTouchTargets, L1: openSettingsFromShortcutEditor, DARK: movedSettingsContrast };
        assert(cases[REVIEW_CASE], `Unknown review case: ${REVIEW_CASE}`);
        const { context, page, errors } = await launch(EXT, { selectedLanguage: language }, mobile);
        try {
            await openMenu(page); await cases[REVIEW_CASE](page);
            assert.deepEqual(errors, [], 'No console/page errors in review regression');
            console.log(`SETTINGS_IA_REVIEW_OK ${REVIEW_CASE} ${language} ${mobile ? 'mobile' : 'desktop'}`);
        } finally { await context.close(); }
        return;
    }
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
                assert.deepEqual(snapshot, await fixtureSnapshot(base.page, fixture), 'Identical fixture: 13 component roots, theme, language and stored values match baseline');
                assert.deepEqual(base.errors, [], 'Baseline fixture has no console/page errors');
                console.log(`SETTINGS_IA_BASE_COMPARISON_OK ${language} ${mobile ? 'mobile' : 'desktop'} roots=13 storage=exact`);
            } finally { await base.context.close(); }
        } else console.log('SKIP base comparison (set MYNT_BASE_EXTENSION)');
        console.log(`SETTINGS_IA_FIXTURE_OK ${language} ${mobile ? 'mobile' : 'desktop'}`);
    } finally { await saved.context.close(); }
    // Component visibility belongs to the default layout, independent of the user's saved layout/profile.
    const { context, page, errors } = await launch(EXT, { selectedLanguage: language }, mobile);
    try {
        await openMenu(page);
        assert.deepEqual(await page.locator('[data-settings-group-button]').allTextContents().then(values => values.map(value => value.trim())), tabs[language]);
        // Tabs above are translated from the stored language without any language selector.
        assert.equal(await page.locator('[data-settings-group-button="system"]').count(), 0, 'System tab removed');
        // A stale "advanced"/"system" group request falls back to an existing tab without errors.
        await page.evaluate(() => { window.myntSettings.selectGroup('advanced'); window.myntSettings.selectGroup('system'); });
        assert.equal(await page.locator('[data-settings-group-button="home"]').getAttribute('aria-selected'), 'true', 'Unknown group falls back to Home');
        await noDuplicateSwitches(page);
        await clockOptionsAfterManager(page);
        const testedComponents = await componentToggles(page, context);
        await detailsAndPositiveControls(page);
        await settingsTouchTargets(page);
        await openSettingsFromShortcutEditor(page);
        await controlCenterFunctions(page, language);
        await backupRoundTrip(page);
        await layoutAndKeyboard(page, mobile);
        // componentToggles left the context offline; DARK reloads online to measure settings surfaces.
        await context.setOffline(false);
        await page.evaluate(() => window.dispatchEvent(new Event('online')));
        await movedSettingsContrast(page);
        assert.deepEqual(errors, [], 'No console/page errors during settings interactions');
        console.log(`SETTINGS_IA_BROWSER_OK ${language} ${mobile ? '390x844@2 touch' : '1400x900'} components=${testedComponents} backup=exact keyboard=ok`);
    } finally { await context.close(); }
}
(async () => {
    if (process.argv.includes('--static')) { staticChecks(); return; }
    for (const language of ['zh_TW', 'en']) for (const mobile of [false, true]) await run(language, mobile);
    if (REVIEW_CASE) { console.log(`SETTINGS_IA_REVIEW_CASE_OK ${REVIEW_CASE}`); return; }
    staticChecks();
    console.log('SETTINGS_IA_OK');
})().catch(error => { console.error('SETTINGS_IA_FAIL', error); process.exitCode = 1; });

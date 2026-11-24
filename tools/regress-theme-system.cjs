/* Run outside the sandbox: node tools/regress-theme-system.cjs
 * MYNT_EXTENSION selects an unpacked checkout. Covers the 2026-11 theme system in the installed extension: the 12
 * named palettes, one-time migration of every retired id (painted by preload.js before first paint), the haze default,
 * the built-in custom colour panel (HEX validation, recent colours, sliders, Escape), light-mode surface overrides
 * (apply, reset, kept across palette switches, ignored in dark mode) and the text contrast warning.
 * Browser profiles are disposable temp directories, never a real profile.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { chromium } = require('playwright');
const EXT = path.resolve(process.env.MYNT_EXTENSION || path.join(__dirname, '..'));
const CHROME = process.env.CHROME_BIN || 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';

const PALETTES = { haze: '#526B85', mauve: '#8B7C9F', midnight: '#344760', sage: '#7B927F', forest: '#3E6655', ocean: '#508D91',
    latte: '#A68B76', caramel: '#A47652', rose: '#AF7885', graphite: '#555C66', pearl: '#9298A3', ink: '#25272B' };
const NAMES = {
    zh_TW: ['霧霾藍', '莫蘭迪紫', '午夜藍', '鼠尾草綠', '森林綠', '海洋青', '奶茶棕', '焦糖棕', '乾燥玫瑰', '石墨灰', '珍珠灰', '極簡黑'],
    en: ['Haze blue', 'Mauve', 'Midnight', 'Sage', 'Forest', 'Ocean teal', 'Latte', 'Caramel', 'Dusty rose', 'Graphite', 'Pearl grey', 'Ink']
};
const MIGRATION = { blue: 'haze', slate: 'haze', indigo: 'midnight', cyan: 'ocean', teal: 'ocean', green: 'sage', lime: 'sage',
    brown: 'latte', orange: 'caramel', amber: 'caramel', yellow: 'caramel', red: 'rose', pink: 'rose', wine: 'rose',
    magenta: 'rose', peach: 'rose', purple: 'mauve', silver: 'pearl', dark: 'ink' };
// The de-identified UI fixture paints the plain colour background (a fresh profile starts on the motion video).
const SEED = Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(path.join(EXT, 'tools/fixtures/ui-seed.json'), 'utf8')))
    .filter(([key]) => !['selectedTheme', 'customThemeColor'].includes(key))
    .map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]));
const luminance = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const hex = rgb => '#' + rgb.match(/\d+/g).slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join('').toUpperCase();

async function launch(viewport) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mynt-theme-system-'));
    const context = await chromium.launchPersistentContext(dir, {
        executablePath: CHROME, headless: true, viewport, deviceScaleFactor: viewport.width < 500 ? 2 : 1,
        hasTouch: viewport.width < 500, reducedMotion: 'reduce',
        args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
    });
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
    const page = context.pages()[0] || await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    // Record what preload.js painted when <body> is first inserted, i.e. before the first frame.
    await page.addInitScript(() => {
        new MutationObserver((records, observer) => {
            if (!document.body) return;
            observer.disconnect();
            window.__firstPaintAccent = document.documentElement.style.getPropertyValue('--darkColor-blue');
            window.__firstPaintStored = localStorage.getItem('selectedTheme');
            window.__firstPaintLoading = document.documentElement.style.getPropertyValue('--Loading-Screen-Color');
        }).observe(document, { childList: true, subtree: true });
    });
    await page.goto(`chrome-extension://${new URL(worker.url()).host}/index.html`);
    return { context, page, errors, close: async () => { await context.close(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

const ready = page => page.waitForFunction(() => window.myntComponents && window.myntThemePreferences && document.querySelector('input.colorPlate[aria-label]'));
async function reset(page, language, storage = {}) {
    await page.evaluate(({ language, storage }) => {
        localStorage.clear();
        for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, value);
        localStorage.setItem('selectedLanguage', language);
    }, { language, storage: { ...SEED, ...storage } });
    await page.reload();
    await ready(page);
}
async function openAppearance(page) {
    if (!await page.locator('#menuCont').isVisible()) await page.evaluate(() => document.getElementById('menuButton').click());
    await page.click('[data-settings-group-button="appearance"]');
    await page.locator('#colorsContainer').scrollIntoViewIfNeeded();
}
const token = (page, name) => page.evaluate(name => {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
}, name).then(hex);
// The body colour may animate (theme transition); wait for it to settle on the expected value.
async function bodyBackground(page, expected) {
    const deadline = Date.now() + 3000;
    let value;
    do {
        value = hex(await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
        if (value === expected) return value;
        await page.waitForTimeout(50);
    } while (Date.now() < deadline);
    return value;
}
const store = (page, key) => page.evaluate(key => localStorage.getItem(key), key);
async function enterHex(page, value) {
    await page.fill('#themeHexInput', value);
    await page.press('#themeHexInput', 'Enter');
}

async function run(language, viewport) {
    const tag = `${language} ${viewport.width}x${viewport.height}`;
    const { page, errors, close } = await launch(viewport);
    try {
        // 1. Default haze, 12 named swatches.
        await reset(page, language);
        await openAppearance(page);
        const swatches = await page.$$eval('input.colorPlate[name=color]', nodes => nodes.map(n => [n.value, n.getAttribute('aria-label'), n.title, n.checked]));
        assert.deepEqual(swatches.map(s => s[0]), Object.keys(PALETTES), `${tag}: 12 palettes in order`);
        assert.deepEqual(swatches.map(s => s[1]), NAMES[language], `${tag}: localized accessible names`);
        assert.deepEqual(swatches.map(s => s[2]), NAMES[language], `${tag}: localized titles`);
        assert.deepEqual(swatches.filter(s => s[3]).map(s => s[0]), ['haze'], `${tag}: haze selected by default`);
        assert.equal(await token(page, '--darkColor-blue'), PALETTES.haze, `${tag}: haze accent applied by default`);
        assert.equal(await page.textContent('#themeColorName'), `${NAMES[language][0]} · ${PALETTES.haze}`, `${tag}: name and hex shown`);
        await page.locator('input.colorPlate[value="forest"]').click();
        assert.equal(await page.textContent('#themeColorName'), `${NAMES[language][4]} · ${PALETTES.forest}`, `${tag}: name updates live`);
        assert.equal(await token(page, '--darkColor-blue'), PALETTES.forest, `${tag}: forest applied`);

        if (language === 'zh_TW') {
            // 2. Every retired id migrates once, is written back and is painted by preload.js before first paint.
            for (const [old, next] of Object.entries(MIGRATION)) {
                await reset(page, language, { selectedTheme: old });
                assert.equal(await store(page, 'selectedTheme'), next, `${old} migrates to ${next}`);
                assert.equal(await page.evaluate(() => window.__firstPaintStored), next, `${old}: migrated before first paint`);
                assert.equal(await page.evaluate(() => window.__firstPaintAccent), `var(--darkColor-${next})`, `${old}: ${next} painted before first paint`);
                assert.equal(await page.locator(`input.colorPlate[value="${next}"]`).isChecked(), true, `${old}: ${next} swatch checked`);
                assert.equal(await token(page, '--darkColor-blue'), PALETTES[next], `${old}: ${next} accent`);
                assert.equal(await page.evaluate(() => document.documentElement.classList.contains('black-theme')), false, `${old}: no black theme`);
            }
            // Custom colour stays untouched while a legacy palette id is migrated; unknown ids fall back to haze.
            await reset(page, language, { selectedTheme: 'blue', customThemeColor: '#123456' });
            assert.equal(await store(page, 'customThemeColor'), '#123456', 'Custom colour untouched by migration');
            assert.equal(await store(page, 'selectedTheme'), 'haze', 'Legacy id beside a custom colour still migrates');
            assert.equal(await token(page, '--darkColor-blue'), '#123456', 'Custom colour still applied');
            // Review r1 #4: the loading screen of the first post-upgrade load shows the migrated palette, not the cached
            // colour of the retired one; a transparent cache (motion video) is kept.
            for (const [old, cache, expected] of [['blue', '#bbd6fd', '#f5f6f7'], ['dark', '#171615', '#f6f6f6'], ['blue', 'rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)']]) {
                await reset(page, language, { selectedTheme: old, LoadingScreenColor: cache });
                assert.equal((await page.evaluate(() => window.__firstPaintLoading)).toLowerCase(), expected, `${old}: first-paint loading colour ${expected}, not ${cache}`);
            }
            await reset(page, language, { selectedTheme: 'not-a-theme' });
            assert.equal(await store(page, 'selectedTheme'), 'haze', 'Unknown id falls back to haze');
            assert.equal(await token(page, '--darkColor-blue'), PALETTES.haze, 'Unknown id paints haze');
        }

        // 3. Custom colour panel: inline disclosure, focus, HEX validation, Escape.
        await reset(page, language);
        await openAppearance(page);
        await page.click('#rangColor');
        assert.equal(await page.locator('#themeCustomPanel').isVisible(), true, `${tag}: panel opens inline`);
        assert.equal(await page.getAttribute('#rangColor', 'aria-expanded'), 'true', `${tag}: trigger expanded`);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'themeHue', `${tag}: focus moves into the panel`);
        assert.equal(await page.inputValue('#themeHexInput'), PALETTES.haze, `${tag}: panel starts from the current colour`);
        for (const bad of ['abc', '#12345', 'red', '#GGGGGG', '#12345G', '1234567', 'rgb(1,2,3)', '']) {
            await enterHex(page, bad);
            assert.equal(await page.locator('#themeHexError').isVisible(), true, `${tag}: "${bad}" rejected with a visible message`);
            assert.match(await page.textContent('#themeHexError'), /#RRGGBB/, `${tag}: message names the format`);
            assert.equal(await page.getAttribute('#themeHexInput', 'aria-invalid'), 'true', `${tag}: field marked invalid`);
            assert.equal(await store(page, 'customThemeColor'), null, `${tag}: "${bad}" not stored`);
        }
        await enterHex(page, '#abc');
        assert.equal(await page.locator('#themeHexError').isVisible(), false, `${tag}: error clears`);
        assert.equal(await store(page, 'customThemeColor'), '#AABBCC', `${tag}: #RGB expands and is stored`);
        assert.equal(await store(page, 'selectedTheme'), null, `${tag}: preset cleared`);
        assert.equal(await page.locator('input.colorPlate[name=color]:checked').count(), 0, `${tag}: no swatch checked for a custom colour`);
        assert.match(await page.textContent('#themeColorName'), /#AABBCC$/, `${tag}: custom name shows the hex`);
        // Slider: keyboard step applies live and commits.
        await page.focus('#themeLightness');
        await page.keyboard.press('ArrowLeft');
        assert.notEqual(await store(page, 'customThemeColor'), '#AABBCC', `${tag}: slider applies live`);
        assert.equal(await token(page, '--darkColor-blue'), await store(page, 'customThemeColor'), `${tag}: slider colour painted`);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#themeCustomPanel').isVisible(), false, `${tag}: Escape closes`);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'rangColor', `${tag}: focus returns to the trigger`);
        assert.equal(await page.getAttribute('#rangColor', 'aria-expanded'), 'false', `${tag}: trigger collapsed`);

        // 4. Recent colours: last 6 distinct, newest first, validated on read.
        await page.click('#rangColor');
        const added = ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666', '#777777', '#222222'];
        for (const color of added) await enterHex(page, color);
        const recent = JSON.parse(await store(page, 'myntRecentThemeColors'));
        assert.deepEqual(recent, ['#222222', '#777777', '#666666', '#555555', '#444444', '#333333'], `${tag}: capped at 6, distinct, newest first`);
        assert.equal(await page.locator('#themeRecentColors button').count(), 6, `${tag}: six recent buttons`);
        assert.equal(await page.getAttribute('#themeRecentColors button >> nth=1', 'aria-label'), '#777777', `${tag}: recent buttons are named`);
        await page.click('#themeRecentColors button >> nth=2');
        assert.equal(await store(page, 'customThemeColor'), '#666666', `${tag}: a recent colour applies`);
        await page.keyboard.press('Escape');
        await page.evaluate(() => localStorage.setItem('myntRecentThemeColors', JSON.stringify(['#ABCDEF', 'javascript:alert(1)', '#abcdef', 7, '#FFF', '#000', '#111', '#222', '#333', '#444', '#555'])));
        await page.click('#rangColor');
        assert.deepEqual(await page.$$eval('#themeRecentColors button', nodes => nodes.map(n => n.dataset.color)),
            ['#ABCDEF', '#FFFFFF', '#000000', '#111111', '#222222', '#333333'], `${tag}: invalid and duplicate recents dropped, list capped`);
        await page.evaluate(() => localStorage.setItem('myntRecentThemeColors', '{broken'));
        await page.keyboard.press('Escape');
        await page.click('#rangColor');
        assert.equal(await page.locator('#themeRecent').isVisible(), false, `${tag}: malformed recents hide the row`);
        await page.keyboard.press('Escape');

        // 5. Surface overrides: apply, survive a palette switch, reset; text contrast warning.
        await reset(page, language, { selectedTheme: 'haze' });
        await openAppearance(page);
        const pageRow = page.locator('.themeSurfaceSwatch[data-surface="page"]');
        assert.match(await pageRow.getAttribute('aria-label'), new RegExp(language === 'en' ? 'Page background.*following the theme' : '頁面背景.*跟隨主題'), `${tag}: row names its state`);
        assert.equal(await page.locator('.themeSurfaceReset[data-surface="page"]').isDisabled(), true, `${tag}: reset disabled while following`);
        await pageRow.click();
        assert.equal(await page.evaluate(() => document.getElementById('themeCustomPanel').previousElementSibling.querySelector('[data-surface="page"]') !== null), true, `${tag}: panel opens under its row`);
        await enterHex(page, '#FFFDF5');
        await page.locator('.themeSurfaceSwatch[data-surface="card"]').click();
        await enterHex(page, '#FAFAFA');
        assert.deepEqual(JSON.parse(await store(page, 'myntThemeSurfaces')), { version: 1, page: '#FFFDF5', card: '#FAFAFA' }, `${tag}: one versioned key`);
        assert.equal(await bodyBackground(page, '#FFFDF5'), '#FFFDF5', `${tag}: page background painted`);
        assert.equal(await token(page, '--whitishColor-blue'), '#FAFAFA', `${tag}: cards painted`);
        assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-mynt-surface-card')), true, `${tag}: home cards follow`);
        assert.equal(await store(page, 'myntRecentThemeColors'), null, `${tag}: surface colours are not recent theme colours`);
        await page.keyboard.press('Escape');
        await page.locator('input.colorPlate[value="sage"]').click();
        assert.equal(await token(page, '--darkColor-blue'), PALETTES.sage, `${tag}: palette switched`);
        assert.equal(await bodyBackground(page, '#FFFDF5'), '#FFFDF5', `${tag}: override survives a palette switch`);
        await page.reload();
        await ready(page);
        assert.equal(await bodyBackground(page, '#FFFDF5'), '#FFFDF5', `${tag}: override survives reload`);
        await openAppearance(page);
        await page.locator('.themeSurfaceReset[data-surface="page"]').click();
        assert.equal(await bodyBackground(page, '#F6F7F6'), '#F6F7F6', `${tag}: reset follows the sage page colour`);
        assert.deepEqual(JSON.parse(await store(page, 'myntThemeSurfaces')), { version: 1, card: '#FAFAFA' }, `${tag}: reset removes only that entry`);
        assert.equal(await page.evaluate(() => document.activeElement.dataset.surface), 'page', `${tag}: focus stays on the row`);

        // Dark mode ignores the overrides and restores them on return to light.
        await page.click('#darkThemed');
        assert.equal(await token(page, '--whitishColor-blue'), '#FFFFFF', `${tag}: card override not applied in dark mode`);
        assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-mynt-surface-card')), false, `${tag}: home cards ignore it in dark mode`);
        assert.equal(await page.locator('#themeSurfacesNote').isVisible(), true, `${tag}: light-mode-only note shown`);
        await page.click('#lightThemed');
        assert.equal(await token(page, '--whitishColor-blue'), '#FAFAFA', `${tag}: card override back in light mode`);

        // Contrast warning in text for a bad pair, gone after reset.
        assert.equal(await page.locator('#themeContrastWarning').isVisible(), false, `${tag}: no warning for a good pair`);
        await page.locator('.themeSurfaceSwatch[data-surface="text"]').click();
        await enterHex(page, '#CCCCCC');
        const warning = await page.textContent('#themeContrastWarning');
        assert.equal(await page.locator('#themeContrastWarning').isVisible(), true, `${tag}: warning shown`);
        assert.match(warning, /4\.5:1/, `${tag}: warning states the requirement in text`);
        assert.match(warning, new RegExp(language === 'en' ? 'Text on Page background' : '文字在頁面背景上'), `${tag}: warning names the pair`);
        assert.equal(await page.locator('#themePanelContrast').isVisible(), true, `${tag}: warning repeated beside the editor`);
        await page.keyboard.press('Escape');
        await page.locator('.themeSurfaceReset[data-surface="text"]').click();
        assert.equal(await page.locator('#themeContrastWarning').isVisible(), false, `${tag}: warning clears after reset`);

        // Invalid stored overrides are dropped entry by entry.
        await page.evaluate(() => localStorage.setItem('myntThemeSurfaces', JSON.stringify({ version: 1, page: 'red', side: 'url(x)', text: '#123' })));
        await page.reload();
        await ready(page);
        assert.equal(await token(page, '--textColorDark-blue'), '#112233', `${tag}: valid entry applied`);
        assert.equal(await token(page, '--bg-color-blue'), '#F6F7F6', `${tag}: invalid entries ignored`);
        await page.evaluate(() => localStorage.setItem('myntThemeSurfaces', JSON.stringify({ version: 2, page: '#000000' })));
        await page.reload();
        await ready(page);
        assert.equal(await token(page, '--bg-color-blue'), '#F6F7F6', `${tag}: unknown version ignored`);

        // 7. Review round 1 regressions.
        // #1: a pending throttled live apply never overrides a preset picked, or a colour committed, after it.
        await reset(page, language, { selectedTheme: 'haze', myntRecentThemeColors: JSON.stringify(['#111111', '#222222', '#333333']) });
        await openAppearance(page);
        await page.click('#rangColor');
        await page.evaluate(() => {
            const hue = document.getElementById('themeHue');
            for (const value of [10, 20]) { hue.value = value; hue.dispatchEvent(new Event('input')); }
            document.querySelector('input.colorPlate[value="forest"]').click();
        });
        await page.waitForTimeout(150);
        assert.deepEqual([await store(page, 'selectedTheme'), await store(page, 'customThemeColor')], ['forest', null], `${tag}: stale live apply cannot replace a picked preset`);
        // Round 2: the open accent editor follows the newly picked preset.
        assert.equal(await page.evaluate(() => document.getElementById('themeHexInput').value.toUpperCase()), '#3E6655', `${tag}: open accent editor resyncs to a picked preset`);
        const committed = await page.evaluate(() => {
            const hue = document.getElementById('themeHue');
            for (const value of [100, 200]) { hue.value = value; hue.dispatchEvent(new Event('input')); }
            hue.value = 300; hue.dispatchEvent(new Event('change'));
            return localStorage.getItem('customThemeColor');
        });
        await page.waitForTimeout(150);
        assert.equal(await store(page, 'customThemeColor'), committed, `${tag}: stale live apply cannot replace a committed colour`);
        // #2: a typed HEX left without Enter, then a click on a recent chip, applies the chip.
        await page.fill('#themeHexInput', '#ABCDEF');
        await page.click('#themeRecentColors button[data-color="#333333"]');
        assert.equal(await store(page, 'customThemeColor'), '#333333', `${tag}: recent chip wins over a typed, uncommitted HEX`);
        await page.keyboard.press('Escape');
        // #3: surface rows in dark mode are read-only, an open surface editor closes, and editors resync on reload.
        await reset(page, language, { selectedTheme: 'haze', myntThemeSurfaces: JSON.stringify({ version: 1, page: '#FFFDF5' }) });
        await openAppearance(page);
        await page.locator('.themeSurfaceSwatch[data-surface="page"]').click();
        assert.equal(await page.inputValue('#themeHexInput'), '#FFFDF5', `${tag}: surface editor starts from the stored override`);
        await page.click('#darkThemed');
        assert.equal(await page.locator('#themeCustomPanel').isVisible(), false, `${tag}: surface editor closes in dark mode`);
        assert.equal(await page.locator('.themeSurfaceSwatch[data-surface="page"]').isDisabled(), true, `${tag}: surface colour disabled in dark mode`);
        assert.equal(await page.locator('.themeSurfaceReset[data-surface="page"]').isDisabled(), true, `${tag}: reset disabled in dark mode`);
        assert.match(await page.getAttribute('.themeSurfaceSwatch[data-surface="page"]', 'aria-label'), /#FFFDF5/, `${tag}: row still names the stored colour`);
        await page.click('#lightThemed');
        assert.equal(await page.locator('.themeSurfaceSwatch[data-surface="page"]').isDisabled(), false, `${tag}: surface colour editable again in light mode`);
        assert.equal(await page.locator('.themeSurfaceReset[data-surface="page"]').isDisabled(), false, `${tag}: reset available again`);
        await page.click('#rangColor');
        await page.evaluate(() => { localStorage.setItem('customThemeColor', '#345678'); window.myntThemePreferences.reload(); });
        assert.equal(await page.inputValue('#themeHexInput'), '#345678', `${tag}: open editor resyncs on reload`);
        await page.keyboard.press('Escape');
        // #6: the reset link uses the text colour, so the contrast warning covers it on a dark side panel.
        await reset(page, language, { selectedTheme: 'haze', myntThemeSurfaces: JSON.stringify({ version: 1, side: '#1A1A1A', text: '#FFFFFF' }) });
        await openAppearance(page);
        assert.equal(hex(await page.$eval('.themeSurfaceReset[data-surface="side"]', el => getComputedStyle(el).color)), '#FFFFFF', `${tag}: reset link follows the text colour`);
        assert.equal(await page.locator('#themeContrastWarning').isVisible(), true, `${tag}: warning shown for that text colour`);
        // #7: the selected-state check on every swatch reaches 3:1 against the swatch.
        for (const [id, accent] of Object.entries(PALETTES)) {
            await page.locator(`input.colorPlate[value="${id}"]`).click();
            const check = hex(await page.$eval(`input.colorPlate[value="${id}"]`, el => getComputedStyle(el, '::after').backgroundColor));
            assert(ratio(check, accent) >= 3, `${tag}: ${id} check ${check} on ${accent} = ${ratio(check, accent).toFixed(2)}:1`);
        }

        // 6. Layout at this width: no horizontal scroll with the panel open; touch targets.
        await openAppearance(page);
        await page.click('#rangColor');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${tag}: no horizontal scroll`);
        const small = await page.$$eval('#colorsContainer input, #rangColor, .themeSurfaceSwatch, .themeSurfaceReset, #themeCustomPanel input, #themeCustomDone', nodes =>
            nodes.map(n => [n.id || n.className || n.value, n.getBoundingClientRect().height]).filter(([, h]) => h < 44));
        assert.deepEqual(small, [], `${tag}: 44px touch targets`);
        await page.click('#themeCustomDone');
        assert.equal(await page.locator('#themeCustomPanel').isVisible(), false, `${tag}: Done closes`);

        assert.deepEqual(errors, [], `${tag}: no console or page errors`);
        console.log(`THEME_SYSTEM_OK ${tag}`);
    } finally {
        await close();
    }
}

(async () => {
    await run('zh_TW', { width: 390, height: 844 });
    await run('en', { width: 1400, height: 900 });
})().catch(error => { console.error(error); process.exit(1); });

/* Run outside the sandbox: node tools/regress-theme-colors.cjs
 * MYNT_EXTENSION selects an unpacked checkout. Clicks each of the 12 2026-11 palettes, checks the accent applies and persists,
 * that every swatch is named, and that the taller swatch grid no longer covers the wallpaper controls below it.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { chromium } = require('playwright');
const EXT = path.resolve(process.env.MYNT_EXTENSION || path.join(__dirname, '..'));
const CHROME = process.env.CHROME_BIN || 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const PALETTES = { haze: '#526b85', mauve: '#8b7c9f', midnight: '#344760', sage: '#7b927f', forest: '#3e6655', ocean: '#508d91',
    latte: '#a68b76', caramel: '#a47652', rose: '#af7885', graphite: '#555c66', pearl: '#9298a3', ink: '#25272b' };
const hex = rgb => '#' + rgb.match(/\d+/g).slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join('');

async function run(language, viewport) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mynt-theme-colors-'));
    const context = await chromium.launchPersistentContext(dir, {
        executablePath: CHROME, headless: true, viewport, hasTouch: viewport.width < 500, reducedMotion: 'reduce',
        args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
    });
    const tag = `${language} ${viewport.width}x${viewport.height}`;
    try {
        let [worker] = context.serviceWorkers();
        if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
        const page = context.pages()[0] || await context.newPage(), errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        await page.goto(`chrome-extension://${new URL(worker.url()).host}/index.html`);
        await page.evaluate(lang => { localStorage.clear(); localStorage.setItem('selectedLanguage', lang); }, language);
        await page.reload();
        await page.waitForFunction(() => window.myntComponents && typeof applySelectedTheme === 'function');
        await page.evaluate(() => document.getElementById('menuButton').click());
        const group = await page.evaluate(() => document.getElementById('colorsContainer').closest('[data-settings-group]').dataset.settingsGroup);
        await page.click(`[data-settings-group-button="${group}"]`);
        await page.locator('#colorsContainer').scrollIntoViewIfNeeded();

        const palette = await page.locator('#colorsContainer').boundingBox(), upload = await page.locator('#uploadTrigger').boundingBox();
        assert(palette.y + palette.height <= upload.y, `${tag}: swatch grid ends above the wallpaper upload button`);

        const names = await page.$$eval('.colorPlate[name=color]', nodes => nodes.map(node => node.getAttribute('aria-label')));
        assert(names.length === 12 && names.every(Boolean), `${tag}: every swatch has an accessible name`);
        for (const [color, swatch] of Object.entries(PALETTES)) {
            await page.locator(`.colorPlate[value="${color}"]`).click();
            const accent = await page.evaluate(() => {
                const probe = document.createElement('span');
                probe.style.color = 'var(--darkColor-blue)';
                document.body.append(probe);
                const value = getComputedStyle(probe).color;
                probe.remove();
                return value;
            });
            assert.equal(hex(accent), swatch, `${tag}: ${color} applies its accent`);
        }
        await page.reload();
        await page.waitForFunction(() => window.myntComponents);
        assert.equal(await page.evaluate(() => localStorage.getItem('selectedTheme')), 'ink', `${tag}: last preset persisted`);
        assert.equal(await page.locator('.colorPlate[value="ink"]').isChecked(), true, `${tag}: preset checked after reload`);
        assert.deepEqual(errors, [], `${tag}: no console or page errors`);
        console.log(`THEME_COLORS_OK ${tag}`);
    } finally {
        await context.close();
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

(async () => {
    for (const language of ['zh_TW', 'en']) for (const viewport of [{ width: 1400, height: 900 }, { width: 390, height: 844 }]) await run(language, viewport);
})().catch(error => { console.error(error); process.exit(1); });

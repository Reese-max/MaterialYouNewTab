/* Run outside the sandbox: node tools/regress-weather-removed.cjs
 * MYNT_EXTENSION selects an unpacked checkout (use ../shadow for the required negative control).
 * Disposable profiles only; intercepted weather requests still count and never reach a real service.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { chromium } = require('C:/Users/Administrator/node_modules/playwright');
const EXT = path.resolve(process.env.MYNT_EXTENSION || path.join(__dirname, '..'));
const CHROME = process.env.CHROME_BIN || 'C:/Users/Administrator/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe';
const weather = {
    location: { name: 'Fixture city' },
    current: { condition: { text: 'Cloudy', icon: '//cdn.weatherapi.com/weather/64x64/day/116.png' },
        temp_c: 20, temp_f: 68, humidity: 50, feelslike_c: 20, feelslike_f: 68 },
    forecast: { forecastday: [{ day: { mintemp_c: 10, maxtemp_c: 22, mintemp_f: 50, maxtemp_f: 72 } }] }
};
const isWeatherHost = hostname => /(^|\.)weatherapi\.com$/.test(hostname) || /(^|\.)ipinfo\.io$/.test(hostname);
async function hidden(page, selector) {
    for (const node of await page.locator(selector).all()) assert.equal(await node.isVisible(), false, `${selector}: hidden`);
}
async function run(language, viewport) {
    const context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'mynt-no-weather-')), {
        executablePath: CHROME, headless: true, viewport, hasTouch: viewport.width < 500, reducedMotion: 'reduce',
        args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
    });
    const requests = [], errors = [];
    context.on('request', request => {
        const url = new URL(request.url());
        if (isWeatherHost(url.hostname)) requests.push(url.hostname + url.pathname); // Never log query-string keys.
    });
    await context.route(url => isWeatherHost(url.hostname), route => {
        const url = new URL(route.request().url());
        const body = url.hostname === 'ipinfo.io' ? { loc: '0,0' } : url.pathname.includes('search.json') ? [] : weather;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    try {
        const seed = { selectedLanguage: language, hideWeatherVisible: 'false', weatherApiKey: 'weather-removal-test-key',
            useGPS: 'true', hideWeatherCardState: 'unchecked', weatherLocation: '',
            weatherParsedData: JSON.stringify(weather), weatherParsedTime: '1', weatherParsedLocation: '', weatherParsedLang: language,
            myntServiceStatus: JSON.stringify({ weather: { status: 'error', at: Date.now(), code: 503 },
                location: { status: 'error', at: Date.now(), code: 503 } }) };
        await context.addInitScript(seed => {
            if (location.protocol !== 'chrome-extension:') return;
            if (!sessionStorage.getItem('mynt-weather-seeded')) {
                localStorage.clear();
                for (const [key, value] of Object.entries(seed)) localStorage.setItem(key, value);
                sessionStorage.setItem('mynt-weather-seeded', '1');
            }
            window.__weatherGPSCalls = 0;
            navigator.geolocation.getCurrentPosition = success => {
                window.__weatherGPSCalls++;
                success({ coords: { latitude: 0, longitude: 0 } });
            };
            window.__weatherPermissionQueries = 0;
            const query = navigator.permissions.query.bind(navigator.permissions);
            navigator.permissions.query = spec => {
                if (spec.name !== 'geolocation') return query(spec);
                window.__weatherPermissionQueries++;
                return Promise.resolve({ state: 'prompt' });
            };
        }, seed);
        let [worker] = context.serviceWorkers();
        if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
        const page = context.pages()[0] || await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        await page.goto(`chrome-extension://${new URL(worker.url()).host}/index.html`);
        for (const mode of ['GPS', 'manual', 'IP']) {
            if (mode !== 'GPS') {
                seed.useGPS = 'false'; seed.weatherLocation = mode === 'manual' ? 'Fixture city' : '';
                await page.evaluate(seed => {
                    localStorage.setItem('useGPS', seed.useGPS);
                    localStorage.setItem('weatherLocation', seed.weatherLocation);
                }, seed);
                await page.reload();
            }
            await page.waitForFunction(() => window.myntComponents && window.myntSettings && window.myntDashboard);
            await page.waitForTimeout(5100);
            // weather.js is no longer loaded; its in-file zero-network guard stays covered by check-removed-features.cjs.
            assert.deepEqual(await page.evaluate(() => {
                document.dispatchEvent(new Event('visibilitychange'));
                window.dispatchEvent(new Event('online'));
                return [typeof window.getWeatherData, typeof window.initializeWeather, !!document.querySelector('script[src*="weather.js"]')];
            }), ['undefined', 'undefined', false], `${mode}: weather.js is not loaded`);
            await page.waitForTimeout(250);
            assert.deepEqual(requests, [], `${mode}: zero WeatherAPI/IPinfo requests`);
            assert.equal(await page.evaluate(() => window.__weatherGPSCalls), 0, `${mode}: no geolocation request`);
            assert.equal(await page.evaluate(() => window.__weatherPermissionQueries), 0, `${mode}: no location permission query`);
            for (const selector of ['#hideWeather', '#hideWeather .lrectangle', '#hideWeather .rAndakar', '#temp', '#wIcon']) {
                assert.equal(await page.locator(selector).count(), 1, `${selector}: reversible DOM retained`);
                await hidden(page, selector);
            }
            await hidden(page, '#serviceStatusPill'); // Only the saved weather/IP failures exist.
            assert.deepEqual(await page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), Object.keys(seed)), seed,
                `${mode}: old weather settings, key, cache and failure records preserved`);
        }
        await page.locator('#menuButton').click();
        await page.locator('#menuCloseButton').waitFor({ state: 'visible' });
        // The System tab (permissions, privacy and service status) was removed (owner decision 2026-11-24).
        assert.equal(await page.locator('[data-settings-group-button]').count(), 3);
        for (let tab = 0; tab < 3; tab++) {
            await page.locator('[data-settings-group-button]').nth(tab).click();
            // Exercise open sections so hidden assertions cannot pass just because an ancestor is collapsed.
            const sections = await page.locator('#overviewPage .sectionHeader:visible').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-controls')));
            for (const section of sections) {
                const header = page.locator(`[aria-controls="${section}"]`);
                if (await header.getAttribute('aria-expanded') === 'false') await header.click();
            }
            for (const selector of ['#myntComponent-weather', '#hideWeatherCheckbox', '[data-settings-component="weather"]',
                '#weatherAdvanced', '#weatherAdvancedContent', '#useGPScheckbox', '#userAPI',
                'a[href*="Get_WeatherAPI_Key.html"]', '[data-workspace-widget="hideWeatherCheckbox"]']) await hidden(page, selector);
            assert.equal(await page.locator('#myntComponent-weather').count(), 0, 'Weather absent from manager');
        }
        assert.equal(await page.locator('#serviceStatusList, [data-permission-action]').count(), 0, 'Service list and permission rows removed');
        const other = page.locator('#myntComponentManager fieldset').filter({ has: page.locator('#myntComponent-galleryEntry') });
        assert.equal(await other.locator('input').count(), 1, 'Other group keeps the gallery entry; the service alert was removed');
        await page.locator('[data-settings-group-button]').first().click();
        await page.locator('#workspaceAddBtn').click();
        await hidden(page, '[data-workspace-widget="hideWeatherCheckbox"]');
        await page.locator('#workspaceCancelBtn').click();
        await page.locator('#menuCloseButton').click();
        await page.keyboard.press('Control+k');
        await page.locator('#commandPaletteInput').waitFor({ state: 'visible' });
        for (const query of ['天氣', 'weather']) {
            await page.locator('#commandPaletteInput').fill(query);
            await page.locator('#commandPaletteEmpty').waitFor({ state: 'visible' });
            assert.equal(await page.locator('.commandPaletteItem').count(), 0, `${query}: no commands`);
        }
        assert.deepEqual(requests, [], 'Settings and command interactions also make zero weather requests');
        assert.deepEqual(errors, [], 'No console/page errors');
        console.log(`WEATHER_REMOVED_OK ${language} ${viewport.width}x${viewport.height} modes=GPS,manual,IP requests=0 errors=0`);
    } finally { await context.close(); }
}
(async () => {
    for (const language of ['zh_TW', 'en']) for (const viewport of [{ width: 1400, height: 900 }, { width: 390, height: 844 }]) await run(language, viewport);
})().catch(error => { console.error('WEATHER_REMOVED_FAIL', error); process.exitCode = 1; });

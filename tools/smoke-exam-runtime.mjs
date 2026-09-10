import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
const root = fileURLToPath(new URL('../', import.meta.url));
const profile = mkdtempSync(resolve(tmpdir(), 'mynt-runtime-'));
const evidence = resolve(process.env.MYNT_EXAM_EVIDENCE || tmpdir(), 'runtime');
mkdirSync(evidence, { recursive: true });
const passed = [], failed = [], exceptions = [], clients = [], requests = [];
let chrome, client, origin, bootstrap, generation = 0, hold = '', pendingFixtures = [];
const fixture = { location: { name: 'Fixture' }, current: { condition: { text: 'Sunny', icon: '//cdn.weatherapi.com/weather/64x64/day/113.png' }, temp_c: 25, temp_f: 77, humidity: 50, feelslike_c: 26, feelslike_f: 78 }, forecast: { forecastday: [{ day: { mintemp_c: 20, maxtemp_c: 30, mintemp_f: 68, maxtemp_f: 86 } }] } };
function kindOf(url) {
    const u = new URL(url);
    if (u.hostname === 'ipinfo.io') return 'ip';
    if (u.hostname === 'api.weatherapi.com') return u.pathname.endsWith('search.json') ? 'suggestions' : 'forecast';
    if (u.hostname === 'cdn.weatherapi.com') return 'icon';
    return '';
}
class CDP {
    constructor(url) {
        this.ws = new WebSocket(url); this.id = 0; this.pending = new Map(); this.listeners = new Map();
        this.ready = new Promise((yes, no) => { this.ws.addEventListener('open', yes, { once: true }); this.ws.addEventListener('error', no, { once: true }); });
        this.ws.addEventListener('message', e => {
            const msg = JSON.parse(String(e.data));
            if (msg.id) {
                const p = this.pending.get(msg.id);
                if (p) { clearTimeout(p.timer); this.pending.delete(msg.id); msg.error ? p.no(new Error(JSON.stringify(msg.error))) : p.yes(msg.result); }
            } else for (const listener of this.listeners.get(msg.method) || []) listener(msg.params);
        }); clients.push(this);
    }
    on(method, listener) { if (!this.listeners.has(method)) this.listeners.set(method, []); this.listeners.get(method).push(listener); }
    async send(method, params = {}) {
        await this.ready;
        return new Promise((yes, no) => {
            const id = ++this.id, timer = setTimeout(() => { this.pending.delete(id); no(new Error(`CDP timeout: ${method}`)); }, 15000);
            this.pending.set(id, { yes, no, timer }); this.ws.send(JSON.stringify({ id, method, params }));
        });
    }
    close() { for (const p of this.pending.values()) clearTimeout(p.timer); this.ws.close(); }
}
async function poll(fn, ms = 20000) {
    const end = Date.now() + ms;
    while (Date.now() < end) { const value = await fn(); if (value) return value; await delay(50); }
    throw new Error('Timed out waiting for browser state');
}
async function evaluate(expression) {
    const r = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result?.value;
}
async function test(name, run) {
    try { await run(); passed.push(name); console.log('PASS ' + name); }
    catch (error) { failed.push({ name, error: String(error) }); console.error('FAIL ' + name + ': ' + error); }
}
async function fulfill(params, kind) {
    const body = kind === 'ip' ? { loc: '25,121' } : kind === 'suggestions' ? [{ name: 'Fixture City', region: '', country: 'Fixture' }] : fixture;
    await client.send('Fetch.fulfillRequest', {
        requestId: params.requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: kind === 'icon' ? 'image/png' : 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' }],
        body: kind === 'icon' ? 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=' : Buffer.from(JSON.stringify(body)).toString('base64')
    });
}
async function fresh(options = {}) {
    hold = ''; pendingFixtures = [];
    await client.send('Page.navigate', { url: 'about:blank' });
    if (bootstrap) await client.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: bootstrap });
    const source = `(() => {
        if (location.protocol !== 'chrome-extension:') return;
        const opts = ${JSON.stringify(options)};
        localStorage.clear();
        localStorage.setItem('myntWorkspacePreset', opts.video ? 'work' : 'relax');
        localStorage.setItem('hideWeatherVisible', String(!!opts.hidden));
        localStorage.setItem('selectedLanguage', 'zh_TW');
        localStorage.setItem('weatherApiKey', 'fixture-not-a-real-key');
        localStorage.setItem('myntAccessibility', JSON.stringify({reduceMotion:false, highContrast:false, fontScale:1}));
        if (opts.raw !== undefined) localStorage.setItem('myntExamDashboard', opts.raw);
        if (opts.manual) localStorage.setItem('weatherLocation', 'Fixture');
        localStorage.setItem('useGPS', String(!!opts.gps));
        window.__weatherAttempts = []; window.__gpsCalls = 0; window.__playCalls = 0;
        const realFetch = window.fetch.bind(window);
        window.fetch = (input, init) => {
            const url = new URL(typeof input === 'string' ? input : input.url, location.href);
            if (['ipinfo.io','api.weatherapi.com'].includes(url.hostname)) {
                window.__weatherAttempts.push({ kind: url.hostname === 'ipinfo.io' ? 'ip' : url.pathname.endsWith('search.json') ? 'suggestions' : 'forecast', signal: init?.signal });
            }
            return realFetch(input, init);
        };
        const realPlay = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function(...args) { if (this.id === 'videoBg') window.__playCalls++; return realPlay.apply(this,args); };
        Object.defineProperty(navigator.geolocation, 'getCurrentPosition', { configurable:true, value: success => {
            window.__gpsCalls++;
            const reply = () => success({coords:{latitude:25,longitude:121}});
            if (opts.holdGPS) window.__resolveGPS = reply; else queueMicrotask(reply);
        }});
        window.__connection = new EventTarget(); window.__connection.saveData = false;
        Object.defineProperty(navigator,'connection',{configurable:true,get:()=>window.__connection});
        document.addEventListener('DOMContentLoaded', () => {
            const weather = document.getElementById('hideWeather');
            window.__weatherInitiallyVisible = !!weather?.getClientRects().length && getComputedStyle(weather).display !== 'none';
        }, {once:true});
    })();`;
    bootstrap = (await client.send('Page.addScriptToEvaluateOnNewDocument', { source })).identifier;
    requests.length = 0;
    await client.send('Page.navigate', { url: origin + '/index.html?runtime=' + (++generation) });
    await poll(async () => { try { return await evaluate('!!window.MyntExamCore && !!document.getElementById("examReturnButton") && !!document.querySelector("#examDashboardStyles")?.sheet'); } catch { return false; } });
    await delay(150);
}
const attempts = () => evaluate('window.__weatherAttempts.map(x=>({kind:x.kind,aborted:x.signal?.aborted===true}))');
const switchStudy = () => evaluate(`document.getElementById('examReturnButton').click()`);
const switchClassic = () => evaluate(`document.querySelector('.exam-nav button').click()`);
const setPreferences = (reduce, contrast, data) => evaluate(`(() => {
    const r=document.getElementById('reduceMotionCheckbox'),h=document.getElementById('highContrastCheckbox');
    r.checked=${reduce}; r.dispatchEvent(new Event('change',{bubbles:true}));
    h.checked=${contrast}; h.dispatchEvent(new Event('change',{bubbles:true}));
    window.__connection.saveData=${data}; window.__connection.dispatchEvent(new Event('change'));
})()`);
try {
    chrome = spawn(process.env.CHROME_BIN || 'chromium', ['--no-sandbox','--no-first-run','--no-default-browser-check','--disable-dev-shm-usage',`--user-data-dir=${profile}`,'--remote-debugging-port=0',`--disable-extensions-except=${root}`,`--load-extension=${root}`,'about:blank'], { stdio:['ignore','ignore','pipe'] });
    let launchError; chrome.on('error', error => launchError = error); chrome.stderr.on('data', () => {});
    const port = await poll(() => { if (launchError) throw launchError; const p=resolve(profile,'DevToolsActivePort'); return existsSync(p) ? Number(readFileSync(p,'utf8').split('\n')[0]) : 0; });
    const targets = async () => (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const worker = await poll(async () => (await targets()).find(t=>t.type==='service_worker'&&t.url.endsWith('/scripts/background.js')));
    origin = worker.url.split('/').slice(0,3).join('/');
    const page = await poll(async () => (await targets()).find(t=>t.type==='page'&&t.webSocketDebuggerUrl));
    client = new CDP(page.webSocketDebuggerUrl);
    client.on('Runtime.exceptionThrown', p => exceptions.push(p.exceptionDetails.exception?.description || p.exceptionDetails.text));
    client.on('Fetch.requestPaused', p => {
        const kind = kindOf(p.request.url);
        if (kind) requests.push({kind}); // Never record query strings, keys or coordinates.
        if (kind && kind === hold) { pendingFixtures.push({p,kind}); return; }
        const response = kind ? fulfill(p,kind) : client.send('Fetch.failRequest',{requestId:p.requestId,errorReason:'Aborted'});
        response.catch(() => {}); // Navigating/aborting invalidates in-flight interception IDs.
    });
    await client.send('Page.enable'); await client.send('Runtime.enable');
    await client.send('Emulation.setTimezoneOverride',{timezoneId:'Asia/Taipei'});
    await client.send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
    // Requests are counted before being served fixtures. This is NOT a zero-count
    // assertion derived from blanket HTTP blocking: Classic must request the fixtures.
    await client.send('Fetch.enable',{patterns:[{urlPattern:'http://*'},{urlPattern:'https://*'}]});
    await fresh(); const defaults = await evaluate('window.MyntExamCore.DEFAULTS');
    await test('Cold default Study blocks IP/forecast/GPS/icon before layout CSS', async () => {
        assert.equal(await evaluate('window.__weatherInitiallyVisible'),true,'fixture must expose the pre-Study weather race');
        assert.deepEqual(await attempts(),[]); assert.equal(await evaluate('window.__gpsCalls'),0); assert.deepEqual(requests,[]);
    });
    for (const raw of ['{',JSON.stringify({...defaults,enabled:false}),JSON.stringify({...defaults,useWallpaper:true})]) {
        await test('Persisted Study/corrupt state denies all weather attempts: '+raw.slice(0,24), async()=>{
            await fresh({raw,gps:true}); assert.deepEqual(await attempts(),[]);assert.equal(await evaluate('__gpsCalls'),0);assert.deepEqual(requests,[]);
        });
    }
    await test('Classic positive control requests IP, forecast and icon', async()=>{
        await fresh({raw:JSON.stringify({...defaults,layout:false})});
        await poll(async()=>requests.some(x=>x.kind==='icon'));
        assert.deepEqual((await attempts()).map(x=>x.kind),['ip','forecast']);
    });
    await test('Hidden Classic weather still makes zero requests', async()=>{
        await fresh({hidden:true,raw:JSON.stringify({...defaults,layout:false})});assert.deepEqual(await attempts(),[]);assert.deepEqual(requests,[]);
    });
    await test('Study to Classic requests weather once without a page reload', async()=>{
        await fresh();await switchClassic();await poll(async()=>requests.some(x=>x.kind==='icon'));
        await evaluate(`document.dispatchEvent(new Event('mynt:exam-layout-change'))`);await delay(100);
        assert.deepEqual((await attempts()).map(x=>x.kind),['ip','forecast']);
    });
    await test('Switching to Study aborts pending IP and does not invoke fallback forecast', async()=>{
        await fresh();hold='ip';await switchClassic();await poll(()=>pendingFixtures.length===1);
        await switchStudy();hold='';for(const {p,kind} of pendingFixtures)await fulfill(p,kind).catch(()=>{});
        await delay(150);assert.deepEqual(await attempts(),[{kind:'ip',aborted:true}]);
        assert.equal(await evaluate(`localStorage.getItem('weatherParsedData')`),null);
    });
    await test('GPS lookup cancelled by Study never forwards the late coordinates', async()=>{
        await fresh({gps:true,holdGPS:true});await switchClassic();await poll(async()=>await evaluate('__gpsCalls')===1);
        await switchStudy();await evaluate('__resolveGPS()');await delay(100);assert.deepEqual(await attempts(),[]);
    });
    await test('Autocomplete has a Classic positive control and is cancelled by Study', async()=>{
        await fresh({manual:true,raw:JSON.stringify({...defaults,layout:false})});hold='suggestions';
        await evaluate(`const q=document.getElementById('userLoc');q.value='Taipei';q.dispatchEvent(new Event('input'))`);
        await poll(()=>pendingFixtures.length===1);await switchStudy();hold='';
        for(const {p,kind} of pendingFixtures)await fulfill(p,kind).catch(()=>{});
        await delay(100);assert.equal((await attempts()).find(x=>x.kind==='suggestions').aborted,true);
        const before=(await attempts()).length;
        await evaluate(`document.getElementById('userLoc').dispatchEvent(new Event('input'))`);await delay(50);
        assert.equal((await attempts()).length,before);
    });
    for (const destination of ['Classic','Wallpaper']) for(let mask=0;mask<8;mask++) {
        await test(`${destination} restores video only when all playback gates permit (mask ${mask})`,async()=>{
            await fresh({video:true,raw:JSON.stringify({...defaults,layout:false})});
            await poll(async()=>await evaluate(`!document.getElementById('videoBg').paused`));
            await switchStudy();await poll(async()=>await evaluate(`document.getElementById('videoBg').paused`));
            await setPreferences(!!(mask&1),!!(mask&2),!!(mask&4));const before=await evaluate('__playCalls');
            if(destination==='Classic')await switchClassic();else await evaluate(`document.getElementById('examOpenSettings').click();document.getElementById('examField-useWallpaper').checked=true;document.querySelector('#examSettingsDialog form').requestSubmit()`);
            if(mask){await delay(100);assert.equal(await evaluate('__playCalls'),before);assert.equal(await evaluate(`document.getElementById('videoBg').paused`),true);}
            else await poll(async()=>await evaluate(`!document.getElementById('videoBg').paused`));
            // Releasing preferences must allow playback again through the same owner.
            await setPreferences(false,false,false);
            await poll(async()=>await evaluate(`!document.getElementById('videoBg').paused`));
        });
    }
    await test('Background visibility denies restoration until the tab becomes visible',async()=>{
        await fresh({video:true,raw:JSON.stringify({...defaults,layout:false})});await poll(async()=>await evaluate(`!document.getElementById('videoBg').paused`));await switchStudy();
        await evaluate(`Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'hidden'});document.dispatchEvent(new Event('visibilitychange'))`);
        const before=await evaluate('__playCalls');await switchClassic();await delay(100);assert.equal(await evaluate('__playCalls'),before);
        await evaluate(`delete document.hidden;delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'))`);
        await poll(async()=>await evaluate(`!document.getElementById('videoBg').paused`));
    });
    await test('No runtime exceptions in instrumented lifecycle cases',async()=>assert.deepEqual(exceptions,[]));
    assert.equal(failed.length,0,JSON.stringify(failed));
    console.log(`EXAM_RUNTIME_SMOKE_OK checks=${passed.length}`);
} catch(error) {
    failed.push({name:'suite',error:String(error)});throw error;
} finally {
    writeFileSync(resolve(evidence,'results.json'),JSON.stringify({passed,failed,exceptions,method:'real unpacked Chromium; fetch invocation counters + intercepted fixtures; no live weather service requests'},null,2));
    for(const c of clients)c.close();if(chrome){chrome.kill('SIGTERM');await delay(500);if(chrome.exitCode===null)chrome.kill('SIGKILL');}
    rmSync(profile,{recursive:true,force:true});
}

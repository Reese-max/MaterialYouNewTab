import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const profileDir = mkdtempSync(resolve(tmpdir(), "mynt-chromium-smoke-"));
const chromeOutput = [];
let chrome;
let pageClient;
let browserClient;

function findChrome() {
    const candidates = [
        process.env.CHROME_BIN,
        "chromium",
        "chromium-browser",
        "google-chrome-for-testing",
        "google-chrome-stable",
        "google-chrome",
    ].filter(Boolean);

    for (const candidate of candidates) {
        if (candidate.includes("/") && existsSync(candidate)) return candidate;
        try {
            const resolved = execFileSync("bash", ["-lc", `command -v ${JSON.stringify(candidate)}`], {
                encoding: "utf8",
                stdio: ["ignore", "pipe", "ignore"],
            }).trim();
            if (resolved) return resolved;
        } catch {
            // Try the next browser candidate.
        }
    }

    throw new Error("No Chromium-compatible browser was found. Set CHROME_BIN to Chrome for Testing or Chromium.");
}

class CdpClient {
    constructor(url) {
        assert.equal(typeof WebSocket, "function", "Node.js WebSocket support is required");
        this.socket = new WebSocket(url);
        this.nextId = 1;
        this.pending = new Map();
        this.eventWaiters = new Map();
        this.listeners = new Map();
        this.ready = new Promise((resolveReady, rejectReady) => {
            this.socket.addEventListener("open", resolveReady, { once: true });
            this.socket.addEventListener("error", () => rejectReady(new Error(`Unable to connect to ${url}`)), { once: true });
        });
        this.socket.addEventListener("message", async (event) => {
            const raw = typeof event.data === "string"
                ? event.data
                : Buffer.from(await event.data.arrayBuffer()).toString("utf8");
            const message = JSON.parse(raw);
            if (message.id) {
                const pending = this.pending.get(message.id);
                if (!pending) return;
                this.pending.delete(message.id);
                if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
                else pending.resolve(message.result || {});
                return;
            }

            if (!message.method) return;
            for (const listener of this.listeners.get(message.method) || []) listener(message.params || {});
            const waiters = this.eventWaiters.get(message.method);
            if (waiters?.length) {
                this.eventWaiters.delete(message.method);
                waiters.forEach(({ resolveEvent, timer }) => {
                    clearTimeout(timer);
                    resolveEvent(message.params || {});
                });
            }
        });
    }

    on(method, listener) {
        const listeners = this.listeners.get(method) || [];
        listeners.push(listener);
        this.listeners.set(method, listeners);
    }

    async send(method, params = {}) {
        await this.ready;
        const id = this.nextId++;
        return new Promise((resolveRequest, rejectRequest) => {
            this.pending.set(id, { resolve: resolveRequest, reject: rejectRequest, method });
            this.socket.send(JSON.stringify({ id, method, params }));
        });
    }

    waitForEvent(method, timeoutMs = 15_000) {
        return new Promise((resolveEvent, rejectEvent) => {
            const timer = setTimeout(() => rejectEvent(new Error(`Timed out waiting for ${method}`)), timeoutMs);
            const waiters = this.eventWaiters.get(method) || [];
            waiters.push({ resolveEvent, timer });
            this.eventWaiters.set(method, waiters);
        });
    }

    close() {
        this.socket.close();
    }
}

async function waitForDevToolsPort(timeoutMs = 20_000) {
    const portFile = resolve(profileDir, "DevToolsActivePort");
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (existsSync(portFile)) {
            const [port, browserPath] = readFileSync(portFile, "utf8").trim().split(/\r?\n/u);
            if (port && browserPath) return { port: Number(port), browserPath };
        }
        if (chrome.exitCode !== null) throw new Error(`Chrome exited before DevTools became available (code ${chrome.exitCode}).`);
        await delay(100);
    }
    throw new Error("Timed out waiting for Chromium DevTools.");
}

async function fetchTargets(port) {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    assert.equal(response.ok, true, `DevTools target listing failed with HTTP ${response.status}`);
    return response.json();
}

function summarizeTargets(targets) {
    return targets
        .slice(0, 24)
        .map((target) => `${target.type || "unknown"}: ${target.url || "(empty URL)"}`)
        .join("\n");
}

async function waitForMyntServiceWorker(port, timeoutMs = 20_000) {
    const deadline = Date.now() + timeoutMs;
    let recentTargets = [];
    while (Date.now() < deadline) {
        recentTargets = await fetchTargets(port);
        const worker = recentTargets.find((target) => target.type === "service_worker"
            && /\/scripts\/background\.js(?:$|[?#])/u.test(target.url || ""));
        if (worker) {
            const match = /^chrome-extension:\/\/([^/]+)/u.exec(worker.url);
            if (match) return { extensionId: match[1], worker, recentTargets };
        }
        await delay(150);
    }
    throw new Error(`MYNT background service worker was not observed.\nRecent targets:\n${summarizeTargets(recentTargets)}`);
}

async function evaluateWith(client, expression) {
    const result = await client.send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
    });
    if (result.exceptionDetails) {
        const description = result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Evaluation failed";
        throw new Error(description);
    }
    return result.result?.value;
}

async function waitForPageTarget(port, targetId, timeoutMs = 5_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const targets = await fetchTargets(port);
        const target = targets.find((item) => item.id === targetId && item.type === "page" && item.webSocketDebuggerUrl);
        if (target) return target;
        await delay(100);
    }
    return null;
}

async function inspectNewTabCandidate(port, targetId, extensionId, timeoutMs = 4_000) {
    const target = await waitForPageTarget(port, targetId);
    if (!target) return { matched: false, target: null, client: null, state: null, runtimeExceptions: [], consoleErrors: [] };

    const client = new CdpClient(target.webSocketDebuggerUrl);
    const runtimeExceptions = [];
    const consoleErrors = [];
    client.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
        runtimeExceptions.push(exceptionDetails.exception?.description || exceptionDetails.text || "Unknown runtime exception");
    });
    client.on("Runtime.consoleAPICalled", ({ type, args = [] }) => {
        if (type === "error") consoleErrors.push(args.map((arg) => arg.value || arg.description || "").join(" "));
    });

    await Promise.all([
        client.send("Page.enable"),
        client.send("Runtime.enable"),
        client.send("Log.enable"),
    ]);

    const deadline = Date.now() + timeoutMs;
    let state = null;
    while (Date.now() < deadline) {
        try {
            state = await evaluateWith(client, `(() => ({
                href: location.href,
                protocol: location.protocol,
                readyState: document.readyState,
                extensionId: globalThis.chrome?.runtime?.id || "",
                hasRoot: Boolean(document.querySelector("#shortcutsContainer")),
                title: document.title,
            }))()`);
            if (state.extensionId === extensionId && state.hasRoot) {
                return { matched: true, target, client, state, runtimeExceptions, consoleErrors };
            }
        } catch {
            // The execution context may be replaced while the virtual NTP redirects.
        }
        await delay(120);
    }

    client.close();
    return { matched: false, target, client: null, state, runtimeExceptions, consoleErrors };
}

async function waitForExtensionNewTab(port, extensionId, timeoutMs = 30_000) {
    const deadline = Date.now() + timeoutMs;
    const diagnostics = [];
    let attempt = 0;
    let recentTargets = [];

    while (Date.now() < deadline) {
        attempt += 1;
        const { targetId } = await browserClient.send("Target.createTarget", { url: "chrome://newtab/" });
        const inspected = await inspectNewTabCandidate(port, targetId, extensionId, Math.min(4_000, deadline - Date.now()));
        if (inspected.matched) return { ...inspected, attempt };

        diagnostics.push({
            attempt,
            targetListUrl: inspected.target?.url || "target unavailable",
            document: inspected.state,
            runtimeExceptions: inspected.runtimeExceptions,
        });
        try {
            await browserClient.send("Target.closeTarget", { targetId });
        } catch {
            // The target may have closed itself while Chrome was initializing.
        }
        await delay(Math.min(800, 150 + attempt * 75));
    }

    recentTargets = await fetchTargets(port);
    throw new Error(
        `The Chromium New Tab page did not expose the MYNT extension document after ${attempt} attempts.\n`
        + `Expected extension id: ${extensionId}\n`
        + `Candidate diagnostics:\n${JSON.stringify(diagnostics.slice(-4), null, 2)}\n`
        + `Recent targets:\n${summarizeTargets(recentTargets)}`,
    );
}

async function evaluate(expression) {
    return evaluateWith(pageClient, expression);
}

async function reloadAndWait() {
    const loaded = pageClient.waitForEvent("Page.loadEventFired", 20_000);
    await pageClient.send("Page.reload", { ignoreCache: true });
    await loaded;

    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
        try {
            const ready = await evaluate(`document.readyState === "complete"
                && Boolean(globalThis.chrome?.runtime?.id)
                && Boolean(document.querySelector("#shortcutsContainer"))`);
            if (ready) return;
        } catch {
            // Execution contexts are briefly unavailable during reload.
        }
        await delay(100);
    }
    throw new Error("Extension page did not finish initializing after reload.");
}

async function main() {
    const chromeBinary = findChrome();
    chrome = spawn(chromeBinary, [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-default-apps",
        "--disable-sync",
        "--metrics-recording-only",
        "--no-first-run",
        "--no-default-browser-check",
        `--user-data-dir=${profileDir}`,
        `--disable-extensions-except=${root}`,
        `--load-extension=${root}`,
        "--remote-debugging-port=0",
        "about:blank",
    ], { stdio: ["ignore", "pipe", "pipe"] });

    for (const stream of [chrome.stdout, chrome.stderr]) {
        stream.setEncoding("utf8");
        stream.on("data", (chunk) => {
            chromeOutput.push(...chunk.split(/\r?\n/u).filter(Boolean));
            if (chromeOutput.length > 120) chromeOutput.splice(0, chromeOutput.length - 120);
        });
    }

    const { port, browserPath } = await waitForDevToolsPort();
    browserClient = new CdpClient(`ws://127.0.0.1:${port}${browserPath}`);
    const { extensionId } = await waitForMyntServiceWorker(port);
    const newTab = await waitForExtensionNewTab(port, extensionId);
    pageClient = newTab.client;
    const runtimeExceptions = newTab.runtimeExceptions;
    const consoleErrors = newTab.consoleErrors;

    await reloadAndWait();

    // Review regressions execute in the real disposable extension document.
    await evaluate(`localStorage.setItem('myntLayout','{malformed-review-fixture');localStorage.removeItem('myntLayoutProfiles')`);
    await reloadAndWait();
    const review = await evaluate(`(() => {
        document.querySelector('#myntLayoutEdit').click();
        const h=document.querySelector('[data-block="search"] .myntLayoutMove');
        h.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
        const panel=document.querySelector('#myntAdaptivePanel');panel.open=true;
        panel.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
        const escapeKeptDraft=window.myntLayout.isEditing()&&!panel.open;
        h.focus();document.querySelector('#myntLayoutPrecise-s').value='150';
        document.querySelector('#myntLayoutAlignCenter').click();
        const rect=document.querySelector('.searchbar').getBoundingClientRect();
        const centered=Math.abs(rect.left+rect.width/2-innerWidth/2)<1;
        document.querySelector('#myntLayoutSave').click();
        const first=JSON.parse(localStorage.getItem('myntLayoutProfiles'));
        document.querySelector('#myntLayoutEdit').click();document.querySelector('#myntLayoutSave').click();
        const second=JSON.parse(localStorage.getItem('myntLayoutProfiles'));
        return {escapeKeptDraft,centered,legacyPreserved:localStorage.getItem('myntLayout')==='{malformed-review-fixture',saved:!!first,previousPreserved:JSON.stringify(first.profiles[0].previous)===JSON.stringify(second.profiles[0].previous)};
    })()`);
    for(const [key,value] of Object.entries(review))assert.equal(value,true,'Review regression: '+key);
    const manualCss = await evaluate(`(async () => {
        const ids=['pomodoroCont','bookmarkButton'];
        const components=['pomodoro','bookmarks'];
        const blocks={pomodoro:{x:.1,y:.15,s:1.5},bookmarks:{x:-.1,y:.15,s:1.5}};
        const previous=MYNTComponentVisibilityCore.definitions.filter(item=>components.includes(item.id))
            .flatMap(item=>item.keys).map(key=>[key,localStorage.getItem(key)]);
        const settled=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        const rect=id=>{
            const el=document.getElementById(id),r=el.getBoundingClientRect(),style=getComputedStyle(el);
            return {x:r.x,y:r.y,w:r.width,h:r.height,display:style.display,visibility:style.visibility,translate:style.translate,scale:style.scale};
        };
        try {
            // Use the settings UI's validated visibility writes, not inline display overrides.
            for(const id of components){
                const toggle=document.getElementById('myntComponent-'+id);
                if(!toggle.checked)toggle.click();
            }
            window.myntLayout.replaceSaved({version:2,blocks:{}});
            await settled();
            const defaults=ids.map(rect);
            window.myntLayout.replaceSaved({version:2,blocks});
            await settled();
            const moved=ids.map(rect);
            window.myntLayout.replaceSaved({version:2,blocks:{}});
            await settled();
            return {defaults,moved,reset:ids.map(rect),blocks:components.map(id=>blocks[id]),viewport:[innerWidth,innerHeight]};
        } finally {
            for(const [key,value] of previous){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}
            window.myntComponents.refresh();
        }
    })()`);
    const {defaults,moved,reset,blocks,viewport:[vw,vh]}=manualCss;
    const cssDiagnostics=JSON.stringify(manualCss);
    assert.ok([...defaults,...moved,...reset].every(r=>r.w>0&&r.h>0&&r.display!=='none'&&r.visibility==='visible'),
        'B5 layout measurements require visible pomodoro/bookmarks: '+cssDiagnostics);
    assert.ok(moved.every((r,i)=>{
        const xy=r.translate.split(/\s+/u).map(parseFloat);
        return xy.length===2&&Math.abs(xy[0]-blocks[i].x*vw)<.001&&Math.abs(xy[1]-blocks[i].y*vh)<.001&&Number(r.scale)===blocks[i].s;
    }),
        'B5 visible computed translate/scale must equal saved values: '+cssDiagnostics);
    assert.ok(moved.every((r,i)=>Math.abs(r.w-defaults[i].w*blocks[i].s)<1&&Math.abs(r.h-defaults[i].h*blocks[i].s)<1
        &&Math.abs(r.y-defaults[i].y-blocks[i].y*vh)<1&&Math.abs(r.x-defaults[i].x-blocks[i].x*vw)<1)
        &&reset.every((r,i)=>['x','y','w','h'].every(key=>Math.abs(r[key]-defaults[i][key])<1)
            &&r.translate===defaults[i].translate&&r.scale===defaults[i].scale),
        'B5 manual positions and scale must win over centered CSS; reset restores defaults: '+cssDiagnostics);
    console.log('B5_CSS_LAYOUT_OK');
    // Reset only this disposable test's layout fixture; no user's browser data is used.
    await evaluate(`localStorage.removeItem('myntLayout');localStorage.removeItem('myntLayoutProfiles')`);
    await reloadAndWait();

    // Actual local wallpaper media in the installed extension, not mocked visibility events.
    await browserClient.send("Target.activateTarget", { targetId: newTab.target.id });
    const mediaDeadline = Date.now() + 20_000;
    let mediaReady = false;
    while (Date.now() < mediaDeadline) {
        mediaReady = await evaluate(`(() => { const v=document.querySelector('#videoBg'); return !document.hidden && !!v && v.readyState>=2 && !v.paused; })()`);
        if (mediaReady) break;
        await delay(150);
    }
    assert.equal(mediaReady, true, "Local wallpaper video did not start in visible extension tab");
    const { targetId: otherTabId } = await browserClient.send("Target.createTarget", { url: "about:blank" });
    async function switchAndObserve(targetId, hidden) {
        await browserClient.send("Target.activateTarget", { targetId });
        const deadline=Date.now()+5000;
        while(Date.now()<deadline){
            const state=await evaluate(`({hidden:document.hidden,paused:document.querySelector('#videoBg').paused,time:document.querySelector('#videoBg').currentTime})`);
            if(state.hidden===hidden && (!hidden || state.paused))return state;
            await delay(100);
        }
        throw Error("Wallpaper visibility/paused state did not follow actual tab activation");
    }
    await switchAndObserve(otherTabId,true);
    await reloadAndWait();
    assert.equal(await evaluate('document.hidden'),true,'Test must initialize in a truly hidden tab');
    await switchAndObserve(newTab.target.id,false);
    const pendingDeadline=Date.now()+10000;
    while(Date.now()<pendingDeadline&&await evaluate("document.querySelector('#videoBg').paused"))await delay(100);
    assert.equal(await evaluate("document.querySelector('#videoBg').paused"),false,'Hidden-initialized wallpaper did not start when visible');
    for(let cycle=0;cycle<3;cycle++){
        const hidden=await switchAndObserve(otherTabId,true);
        await delay(350);
        const stopped=await evaluate(`document.querySelector('#videoBg').currentTime`);
        assert.ok(Math.abs(stopped-hidden.time)<0.05,"Hidden video continued advancing");
        await switchAndObserve(newTab.target.id,false);
        await delay(150);
        assert.equal(await evaluate(`document.querySelector('#videoBg').paused`),false,"Previously playing video did not resume");
    }
    await evaluate(`document.querySelector('#videoBg').pause()`);
    await switchAndObserve(otherTabId,true);await switchAndObserve(newTab.target.id,false);
    assert.equal(await evaluate(`document.querySelector('#videoBg').paused`),true,"Previously paused video unexpectedly resumed");
    await browserClient.send("Target.closeTarget", { targetId: otherTabId });

    // Pomodoro behavior requires its component to be enabled in a fresh profile.
    const previousPomodoroVisibility = await evaluate(`(() => {
        const previous=MYNTComponentVisibilityCore.definitions.find(item=>item.id==='pomodoro')
            .keys.map(key=>[key,localStorage.getItem(key)]);
        const toggle=document.getElementById('myntComponent-pomodoro');
        if(!toggle.checked)toggle.click();
        return previous;
    })()`);
    let pomoGeometry;
    try {
        // Pomodoro behavior in the actual disposable extension profile, not a DOM mock.
        const pomoStarted = await evaluate(`(async () => {
            await myntPomodoro.setTask('CI focus task');
            await myntPomodoro.start();
            return myntPomodoro.getState().isRunning;
        })()`);
        assert.equal(pomoStarted, true, 'Pomodoro did not start in extension');
        await delay(1100);
        const pomoPaused = await evaluate(`(async () => { await myntPomodoro.pause(); return myntPomodoro.getState(); })()`);
        assert.equal(pomoPaused.isRunning, false);
        assert.equal(pomoPaused.task, 'CI focus task');
        assert.ok(pomoPaused.timeRemaining < pomoPaused.totalTime, 'Wall clock did not advance');
        await reloadAndWait();
        const pomoReload = await evaluate('myntPomodoro.getState()');
        assert.equal(pomoReload.timeRemaining, pomoPaused.timeRemaining, 'Paused duration changed on reload');
        assert.equal(pomoReload.task, 'CI focus task');
        await evaluate(`localStorage.setItem('myntPomoStudioMode','full');localStorage.setItem('pomodoroPanelScale','150');localStorage.removeItem('pomodoroPanelPosition')`);
        await reloadAndWait();
        await evaluate('myntPomodoro.open()');
        await delay(600);
        assert.equal(await evaluate(`(() => {const p=document.querySelector('#pomodoroPanel'),r=p.getBoundingClientRect();return r.bottom<=innerHeight+1&&r.right<=innerWidth+1&&Math.abs(r.width/p.offsetWidth-1.5)<.02;})()`),true,'Animated full panel at saved 150% scale must fit');
        await evaluate(`(() => {
            myntPomodoro.open();
            const p=document.querySelector('#pomodoroPanel');
            p.style.animation='none';p.style.transform='scale(1.5)';p.style.top=(innerHeight-180)+'px';
            localStorage.setItem('pomodoroPanelPosition',JSON.stringify({top:innerHeight-180,left:15}));
            const b=document.querySelector('[aria-controls="myntPomoExtras"]');
            if(b.getAttribute('aria-expanded')!=='true')b.click();
        })()`);
        await delay(200);
        pomoGeometry = await evaluate(`(() => {
            const p=document.querySelector('#pomodoroPanel'),r=p.getBoundingClientRect();
            const inBounds=r.top>=-1&&r.bottom<=innerHeight+1&&r.left>=-1&&r.right<=innerWidth+1;
            const savedUnchanged=JSON.parse(localStorage.getItem('pomodoroPanelPosition')).top===innerHeight-180;
            const scalePreserved=p.style.transform==='scale(1.5)';
            document.querySelector('#myntPomoExtras').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
            const collapsed=document.querySelector('#myntPomoExtras').hidden;
            return {inBounds,savedUnchanged,collapsed,scalePreserved};
        })()`);
        for(const [key,value] of Object.entries(pomoGeometry))assert.equal(value,true,'Pomodoro panel: '+key);
    } finally {
        await evaluate(`(() => {
            for(const [key,value] of ${JSON.stringify(previousPomodoroVisibility)}){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}
            window.myntComponents.refresh();
        })()`);
    }

    // Encouragement-line manager in the installed extension: the real dialog, extension CSP, storage, home-page pool,
    // file import, export, keyboard close and backup validation. Only this disposable profile's data is touched.
    async function waitForValue(expression, message, timeoutMs = 3_000) {
        const deadline = Date.now() + timeoutMs;
        let value;
        while (Date.now() < deadline) {
            value = await evaluate(expression);
            if (value) return value;
            await delay(50);
        }
        throw new Error(`${message}: ${JSON.stringify(value)}`);
    }
    const quoteKey = "myntStudyQuotesV1";
    const sqDialog = `document.getElementById('studyQuotesDialog')`;
    const sqStored = `JSON.parse(localStorage.getItem('${quoteKey}'))`;
    const sqOpenBulk = `${sqDialog}.querySelector('.sqActions > button:nth-of-type(2)').click()`;
    const sqBulkReady = `(() => { const f=${sqDialog}.querySelector('.sqBulk'); return !f.hidden && !!f.querySelector('.sqPreviewSummary') && !f.querySelector('button[type=submit]').disabled; })()`;
    const sqKeyEvent = async (key, code, keyCode) => {
        // Keys without text are sent as rawKeyDown, as Chrome's own automation does.
        for (const type of ["rawKeyDown", "keyUp"]) await pageClient.send("Input.dispatchKeyEvent", { type, key, code, windowsVirtualKeyCode: keyCode });
    };
    let studyQuotes;
    const previousPomodoroForQuotes = await evaluate(`MYNTComponentVisibilityCore.definitions.find(item=>item.id==='pomodoro').keys.map(key=>[key,localStorage.getItem(key)])`);
    try {
        assert.equal(await evaluate(`localStorage.getItem('${quoteKey}')`), null, "Fresh profile must start without saved encouragement lines");
        const builtinPool = await evaluate("myntStudy.count()");
        assert.ok(builtinPool > 0, "Built-in encouragement lines did not load");
        await evaluate(`document.getElementById('studyQuotesManageButton').click()`);
        await waitForValue(`${sqDialog}?.open`, "Quote manager did not open from its settings button");

        // Add through the editor, then reject a near-duplicate (spacing and punctuation differ).
        await evaluate(`(() => {
            const d=${sqDialog}; d.querySelector('.sqActions > .sqPrimary').click();
            const form=d.querySelector('.sqEditor'), [text,author,,tags]=form.querySelectorAll('.sqInput');
            text.value='每天進步一點點，就是很大的進步。'; author.value='我自己'; tags.value='考試, 早起';
            form.dispatchEvent(new Event('input',{bubbles:true})); form.querySelector('button[type=submit]').click();
        })()`);
        let saved = await evaluate(sqStored);
        assert.equal(saved?.quotes?.length, 1, "Editor did not save the new line");
        assert.deepEqual(saved.quotes[0].tags, ["考試", "早起"], "Comma-separated tags were not split");
        assert.equal(saved.quotes[0].author, "我自己");
        const duplicate = await evaluate(`(() => {
            const d=${sqDialog}; d.querySelector('.sqActions > .sqPrimary').click();
            const form=d.querySelector('.sqEditor'); form.querySelector('textarea').value='每天 進步一點點！就是很大的進步';
            form.dispatchEvent(new Event('input',{bubbles:true})); form.querySelector('button[type=submit]').click();
            const error=form.querySelector('.sqError').textContent; form.querySelector('.sqEditorButtons .sqSecondary').click();
            return {error, count:${sqStored}.quotes.length, editorHidden:form.hidden};
        })()`);
        assert.ok(duplicate.error, "Near-duplicate line was not reported");
        assert.equal(duplicate.count, 1, "Near-duplicate line was saved");
        assert.equal(duplicate.editorHidden, true);

        // Bulk paste: one valid tagged line, one duplicate, one over the length limit, one plain line.
        await evaluate(`(() => {
            ${sqOpenBulk};
            const form=${sqDialog}.querySelector('.sqBulk'), [text,tags]=form.querySelectorAll('.sqInput');
            tags.value='匯入';
            text.value=['人恆過，然後能改。— 孟子《孟子·告子下》 #自省','每天 進步一點點！就是很大的進步','x'.repeat(201),'慢慢來比較快。'].join('\\n');
            text.dispatchEvent(new Event('input',{bubbles:true}));
        })()`);
        await waitForValue(sqBulkReady, "Bulk paste preview did not become ready");
        const pasteErrors = await evaluate(`${sqDialog}.querySelectorAll('.sqPreviewErrors li').length`);
        assert.equal(pasteErrors, 1, "The over-long pasted line should be listed as an error");
        await evaluate(`${sqDialog}.querySelector('.sqBulk button[type=submit]').click()`);
        saved = await evaluate(sqStored);
        assert.equal(saved.quotes.length, 3, "Bulk paste should add exactly the two new valid lines");
        const mencius = saved.quotes.find(quote => quote.author === "孟子");
        assert.equal(mencius?.work, "孟子·告子下", "Inline 《source》 was not parsed");
        assert.deepEqual(mencius.tags, ["自省", "匯入"], "Inline #tag and the shared import tag were not combined");

        // Real File through the file input (CSV with a header row), read under the extension CSP.
        await evaluate(`(() => {
            ${sqOpenBulk};
            const input=${sqDialog}.querySelector('.sqBulk input[type=file]'), files=new DataTransfer();
            files.items.add(new File(['句子,作者,出處,標籤\\n"天下難事，必作於易",老子,道德經,"考試,自省"\\n,,,\\n'],'quotes.csv',{type:'text/csv'}));
            input.files=files.files; input.dispatchEvent(new Event('change',{bubbles:true}));
        })()`);
        await waitForValue(sqBulkReady, "CSV import preview did not become ready");
        await evaluate(`${sqDialog}.querySelector('.sqBulk button[type=submit]').click()`);
        saved = await evaluate(sqStored);
        assert.equal(saved.quotes.length, 4, "CSV import did not add its one row");
        assert.deepEqual(saved.quotes.find(quote => quote.author === "老子")?.tags, ["考試", "自省"], "CSV tags column was not split");

        // Home-page categories: none selected falls back with a warning; only #考試 narrows the live pool.
        await evaluate(`${sqDialog}.querySelector('.sqChip[data-key="*"] input').click()`);
        assert.deepEqual((await evaluate(sqStored)).show, [], "Clearing All did not save an empty selection");
        assert.equal(await evaluate(`!${sqDialog}.querySelector('.sqWarning').hidden`), true, "Empty selection did not warn about the fallback");
        await evaluate(`${sqDialog}.querySelector('.sqChip[data-key="考試"] input').click()`);
        assert.deepEqual((await evaluate(sqStored)).show, ["考試"]);
        await waitForValue("myntStudy.count() === 2", "Home page pool did not narrow to the two #考試 lines");

        // Delete with undo, and hide/show a built-in line (built-ins cannot be deleted).
        await evaluate(`[...${sqDialog}.querySelectorAll('.sqList .sqRow')].find(row => row.querySelector('.sqText').textContent === '慢慢來比較快。').querySelector('.sqDanger').click()`);
        assert.equal((await evaluate(sqStored)).quotes.length, 3, "Delete did not remove the line");
        await evaluate(`${sqDialog}.querySelector('.sqUndo').click()`);
        assert.equal((await evaluate(sqStored)).quotes.length, 4, "Undo did not restore the deleted line");
        const builtinToggle = await evaluate(`(() => {
            const d=${sqDialog}; d.querySelector('#studyQuotesTab-builtin').click();
            const row=d.querySelector('.sqList .sqRow'), hide=row.querySelector('.sqSwitch input');
            const deletable=Boolean(row.querySelector('.sqDanger'));
            hide.click(); const hidden=${sqStored}.hiddenBuiltins.length;
            d.querySelector('.sqList .sqRow .sqSwitch input').click(); const shown=${sqStored}.hiddenBuiltins.length;
            d.querySelector('#studyQuotesTab-mine').click();
            return {deletable, hidden, shown};
        })()`);
        assert.deepEqual(builtinToggle, { deletable: false, hidden: 1, shown: 0 }, "Built-in lines must be hide-only");

        // Export JSON (blob captured instead of downloaded), then re-import it: every line is a duplicate.
        const exported = await evaluate(`(async () => {
            const original=HTMLAnchorElement.prototype.click; let href='', name='';
            HTMLAnchorElement.prototype.click=function(){ href=this.href; name=this.download; };
            try { ${sqDialog}.querySelector('.sqMenu > button:nth-child(1)').click(); }
            finally { HTMLAnchorElement.prototype.click=original; }
            return {name, text: href ? await (await fetch(href)).text() : ''};
        })()`);
        assert.match(exported.name, /^mynt-study-quotes-\d{4}-\d{2}-\d{2}\.json$/u);
        const exportedData = JSON.parse(exported.text);
        assert.equal(exportedData.format, "mynt-study-quotes");
        assert.equal(exportedData.quotes.length, 4, "Export did not include every line");
        await evaluate(`(() => {
            ${sqOpenBulk};
            const input=${sqDialog}.querySelector('.sqBulk input[type=file]'), files=new DataTransfer();
            files.items.add(new File([${JSON.stringify(exported.text)}],'export.json',{type:'application/json'}));
            input.files=files.files; input.dispatchEvent(new Event('change',{bubbles:true}));
        })()`);
        await waitForValue(`${sqDialog}.querySelector('.sqFileName').textContent.includes('export.json') && !!${sqDialog}.querySelector('.sqBulk .sqPreviewSummary')`, "Re-import preview did not render");
        assert.equal(await evaluate(`${sqDialog}.querySelector('.sqBulk button[type=submit]').disabled`), true, "Re-importing an export must add nothing");

        // Replace asks for confirmation and can be undone.
        await evaluate(`(() => {
            const form=${sqDialog}.querySelector('.sqBulk'), text=form.querySelector('.sqBulkText');
            text.value='只剩這一句。'; form.querySelector('.sqMode input[value=replace]').click();
            text.dispatchEvent(new Event('input',{bubbles:true}));
        })()`);
        // Pasting over a loaded export.json must stop parsing the new text as JSON.
        await waitForValue(sqBulkReady, "Replace preview did not become ready after pasting over a loaded file");
        assert.equal(await evaluate(`${sqDialog}.querySelector('.sqFileName').textContent`), "", "Replaced text still claimed to be the loaded file");
        await evaluate(`${sqDialog}.querySelector('.sqBulk button[type=submit]').click()`);
        await waitForValue(`document.querySelector('dialog.myntAppDialog')?.open`, "Replace did not ask for confirmation");
        assert.equal((await evaluate(sqStored)).quotes.length, 4, "Replace changed data before confirmation");
        await evaluate(`document.querySelector('dialog.myntAppDialog .myntAppDialogOk').click()`);
        await waitForValue(`${sqStored}.quotes.length === 1`, "Confirmed replace did not apply");
        await evaluate(`${sqDialog}.querySelector('.sqUndo').click()`);
        assert.equal((await evaluate(sqStored)).quotes.length, 4, "Undo did not restore the replaced lines");

        // Real Escape keys with the Pomodoro panel open underneath: the first closes a dirty editor and keeps the
        // dialog, the second closes the dialog, and only the third reaches the Pomodoro panel.
        const pomodoroExpanded = `document.getElementById('pomodoroCont').getAttribute('aria-expanded')==='true'`;
        await evaluate(`(() => {
            myntPomodoro.open();
            const d=${sqDialog}; d.querySelector('.sqActions > .sqPrimary').click();
            const text=d.querySelector('.sqEditor textarea'); text.value='草稿'; text.dispatchEvent(new Event('input',{bubbles:true})); text.focus();
        })()`);
        await sqKeyEvent("Escape", "Escape", 27);
        await waitForValue(`${sqDialog}.querySelector('.sqEditor').hidden`, "Escape did not close the dirty editor first");
        assert.equal(await evaluate(`${sqDialog}.open`), true, "Escape on a dirty editor closed the whole dialog");
        await sqKeyEvent("Escape", "Escape", 27);
        await waitForValue(`!${sqDialog}.open`, "Second Escape did not close the dialog");
        assert.equal(await evaluate(pomodoroExpanded), true, "Escape inside a modal dialog closed the Pomodoro panel underneath");
        await sqKeyEvent("Escape", "Escape", 27);
        await waitForValue(`!(${pomodoroExpanded})`, "Escape with no dialog open did not close the Pomodoro panel");

        // Backups carry the lines; a tampered entry is rejected by restore validation.
        const backup = await evaluate(`(async () => {
            const packed=await createBackup('settings'), data=JSON.parse(packed.serialized);
            const tampered=JSON.parse(packed.serialized);
            tampered.localStorage['${quoteKey}']=JSON.stringify({version:1,revision:0,quotes:[{id:'bad',text:'x',enabled:true}],hiddenBuiltins:[],show:null});
            return {included:data.localStorage['${quoteKey}']===localStorage.getItem('${quoteKey}'), valid:isValidBackupFile(data), tamperedValid:isValidBackupFile(tampered)};
        })()`);
        assert.deepEqual(backup, { included: true, valid: true, tamperedValid: false }, "Backup did not include or validate encouragement lines");

        await reloadAndWait();
        assert.equal((await evaluate(sqStored)).quotes.length, 4, "Encouragement lines did not persist across reload");
        await waitForValue("myntStudy.count() === 2", "Category choice did not persist across reload");
        studyQuotes = { builtinPool, added: 4, duplicateRejected: true, csvImported: true, categoryPool: 2, undo: true, exportRoundTrip: true, pasteOverFileDropsFormat: true, replaceConfirmed: true, escapeOrderOverPomodoro: true, backupValidated: true };
    } finally {
        await evaluate(`(() => {
            ${sqDialog}?.close();
            for (const key of ['${quoteKey}','myntQuoteBag']) localStorage.removeItem(key);
            document.dispatchEvent(new CustomEvent('mynt:study-quotes-changed'));
            for (const [key,value] of ${JSON.stringify(previousPomodoroForQuotes)}){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}
            window.myntComponents.refresh();
        })()`);
    }

    // Dialog text in the installed extension, in light mode, dark mode and the black theme: every visible text in
    // the settings workspace section (editor open), wallpaper gallery, encouragement lines, AI tools, bookmark editor,
    // keyboard help and command palette meets WCAG AA. Colours are painted on a canvas first, so any CSS colour syntax
    // is measured as rendered; disabled controls are exempt. The original theme mode and colour are restored.
    const previousThemeMode = await evaluate(`localStorage.getItem('preferredTheme')`);
    const previousColour = await evaluate(`document.querySelector('.colorPlate:checked')?.value || 'blue'`);
    const dialogContrast = {};
    const auditDialogs = `(async () => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
        const paint = canvas.getContext('2d', { willReadFrequently: true });
        const rgba = colour => { paint.clearRect(0, 0, 1, 1); paint.fillStyle = '#000'; paint.fillStyle = colour; paint.fillRect(0, 0, 1, 1); const d = paint.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
        const lum = c => { const a = c.slice(0, 3).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return a[0] * .2126 + a[1] * .7152 + a[2] * .0722; };
        const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
        const behind = el => { const layers = []; for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const c = rgba(getComputedStyle(e).backgroundColor); if (c[3] > 0) layers.push(c); if (c[3] >= 0.99) break; } return layers.reverse().reduce((out, c) => out.map((v, i) => v * (1 - c[3]) + c[i] * c[3]), [0, 0, 0]); };
        const wait = ms => new Promise(r => setTimeout(r, ms));
        const audit = dialog => { const failures = []; let count = 0;
            for (const el of dialog.querySelectorAll('*')) {
                const box = el.getBoundingClientRect(), style = getComputedStyle(el);
                if (box.width < 1 || box.height < 1 || style.visibility === 'hidden' || Number(style.opacity) === 0 || el.closest(':disabled')) continue;
                const ownText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
                const field = /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && !['checkbox', 'radio', 'range', 'color', 'file', 'hidden'].includes(el.type);
                if (!ownText && !field) continue;
                count++;
                const size = parseFloat(style.fontSize), need = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700) ? 3 : 4.5;
                const r = ratio(rgba(style.color), behind(el));
                if (r < need) failures.push((el.id || el.className || el.tagName) + ' ' + r.toFixed(2));
            }
            return { count, failures }; };
        const out = {};
        // Workspaces are edited in the settings panel; the legacy control-center dialog is never opened by the UI.
        window.myntSettings.open('workspaceSection'); await wait(400);
        const workspace = document.getElementById('workspaceSection');
        workspace.querySelector('.workspaceEditBtn')?.click(); workspace.querySelectorAll('details').forEach(d => { d.open = true; });
        await wait(300); out.workspaceSettings = audit(workspace);
        document.getElementById('workspaceCancelBtn')?.click(); document.getElementById('menuCloseButton')?.click(); await wait(300);
        window.myntWallpaper.open(); const gallery = document.getElementById('wallpaperGalleryDialog');
        gallery.querySelectorAll('details').forEach(d => { d.open = true; });
        await wait(500); out.wallpaperGallery = audit(gallery); gallery.close();
        window.myntStudyQuotesManager.open(); await wait(300);
        out.studyQuotes = audit(document.getElementById('studyQuotesDialog')); window.myntStudyQuotesManager.close();
        showAIToolsSettings(); await wait(300); const ai = document.getElementById('aiToolsSettingsModal');
        out.aiTools = audit(ai); ai.close();
        const bookmark = document.getElementById('editBookmarkModal');
        document.getElementById('editBookmarkName').value = 'Example'; document.getElementById('editBookmarkURL').value = 'https://example.com/';
        bookmark.showModal(); await wait(200); out.bookmarkEditor = audit(bookmark); bookmark.close();
        const help = document.getElementById('shortcutsHelpDialog'); help.showModal(); await wait(200); out.keyboardHelp = audit(help); help.close();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true }));
        await wait(300); const palette = document.getElementById('commandPaletteDialog'); out.commandPalette = audit(palette); palette.close();
        return out;
    })()`;
    try {
        for (const [mode, setup] of [
            ['light', `document.getElementById('lightThemed').click()`],
            ['dark', `document.getElementById('darkThemed').click()`],
            ['black', `(() => { document.getElementById('lightThemed').click(); document.querySelector('.colorPlate[value="dark"]').click(); })()`],
        ]) {
            await evaluate(setup);
            await waitForValue(mode === 'black'
                ? `document.documentElement.classList.contains('black-theme')`
                : `document.getElementById('themeSegment').dataset.active === '${mode}' && !document.documentElement.classList.contains('black-theme')`, `${mode} theme did not turn on`);
            dialogContrast[mode] = await evaluate(auditDialogs);
            for (const [name, result] of Object.entries(dialogContrast[mode])) {
                assert.ok(result.count >= 5, `${name} rendered too little text to audit in ${mode} (${result.count})`);
                assert.deepEqual(result.failures, [], `${name} text below WCAG AA in ${mode}`);
            }
        }
    } finally {
        await evaluate(`(() => {
            document.querySelectorAll('dialog[open]').forEach(d => d.close());
            document.querySelector('.colorPlate[value="${previousColour}"]')?.click();
            const mode = ${JSON.stringify(previousThemeMode)} || 'light';
            document.querySelector('#themeSegment [data-theme="' + mode + '"]')?.click();
            if (${JSON.stringify(previousThemeMode)} === null) localStorage.removeItem('preferredTheme');
        })()`);
    }

    const initial = await evaluate(`(() => ({
        url: location.href,
        extensionId: globalThis.chrome?.runtime?.id || "",
        title: document.title,
        lang: document.documentElement.lang,
        shortcutCount: document.querySelectorAll("#shortcutsContainer .shortcuts").length,
        settingsEntryCount: document.querySelectorAll("#shortcutList .shortcutSettingsEntry").length,
        hasControlCenter: Boolean(document.querySelector("#controlCenterDialog")),
        hasTodo: Boolean(document.querySelector("#todoListCont")),
    }))()`);

    assert.equal(initial.extensionId, extensionId, "New Tab loaded a different extension document");
    assert.match(initial.url, /^chrome-extension:\/\//u, "New Tab document did not use the extension origin");
    assert.ok(initial.title, "Localized New Tab title is empty");
    assert.equal(initial.lang, "zh-TW", "Traditional Chinese should remain the default document language");
    assert.ok(initial.shortcutCount > 0, "Default shortcuts did not render");
    assert.equal(initial.shortcutCount, initial.settingsEntryCount, "Shortcut view and settings entry counts diverged");
    assert.equal(initial.hasControlCenter, true, "Control Center is missing");
    assert.equal(initial.hasTodo, true, "To-do widget trigger is missing");

    await evaluate(`(() => {
        localStorage.setItem("shortcutAmount", "1");
        localStorage.setItem("shortcutName0", "Smoke Test");
        localStorage.setItem("shortcutURL0", "https://example.com/");
        localStorage.setItem("shortcutIcon0", "");
    })()`);
    await reloadAndWait();

    const safeSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="currentColor"/></svg>`;
    await evaluate(`(() => {
        const input = document.querySelector("#shortcutList .iconURL");
        if (!input) throw new Error("Custom icon input was not rendered");
        input.value = ${JSON.stringify(safeSvg)};
        input.dispatchEvent(new Event("blur"));
    })()`);
    await delay(300);

    const customIconState = await evaluate(`(() => {
        const icon = document.querySelector("#shortcutsContainer .shortcutLogoContainer img[data-icon-type='custom']");
        return {
            shortcutCount: document.querySelectorAll("#shortcutsContainer .shortcuts").length,
            iconFound: Boolean(icon),
            iconSource: icon?.getAttribute("src") || "",
            storedIcon: localStorage.getItem("shortcutIcon0") || "",
            inputValue: document.querySelector("#shortcutList .iconURL")?.value || "",
            label: document.querySelector("#shortcutsContainer .shortcut-name")?.textContent || "",
        };
    })()`);
    assert.equal(customIconState.shortcutCount, 1, "Custom shortcut count is incorrect");
    assert.equal(customIconState.iconFound, true, "Valid raw SVG icon was not appended to its container");
    assert.match(customIconState.iconSource, /^data:image\/svg\+xml/u, "Custom SVG icon source was lost");
    assert.equal(customIconState.storedIcon, customIconState.iconSource, "Custom icon state was not preserved");
    assert.equal(customIconState.inputValue, customIconState.storedIcon, "Validated icon input and storage diverged");
    assert.equal(customIconState.label, "Smoke Test", "Custom shortcut label did not render");

    await evaluate(`(() => {
        const input = document.querySelector("#shortcutList .iconURL");
        if (!input) throw new Error("Custom icon input was not rendered");
        input.value = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><circle r="4"/></svg>';
        input.dispatchEvent(new Event("blur"));
    })()`);
    await delay(300);
    const invalidIconState = await evaluate(`(() => ({
        inputValue: document.querySelector("#shortcutList .iconURL")?.value ?? null,
        storedIcon: localStorage.getItem("shortcutIcon0"),
        renderedCustomIcon: Boolean(document.querySelector("#shortcutsContainer img[data-icon-type='custom']")),
    }))()`);
    assert.equal(invalidIconState.inputValue, "", "Unsafe SVG input was not cleared");
    assert.equal(invalidIconState.storedIcon, "", "Unsafe SVG input was persisted");
    assert.equal(invalidIconState.renderedCustomIcon, false, "Unsafe SVG remained rendered as a custom icon");

    const fatalConsoleErrors = consoleErrors.filter((message) => /\b(?:ReferenceError|TypeError|SyntaxError|Uncaught)\b/iu.test(message));
    assert.deepEqual(runtimeExceptions, [], `Runtime exceptions were observed:\n${runtimeExceptions.join("\n\n")}`);
    assert.deepEqual(fatalConsoleErrors, [], `Fatal console errors were observed:\n${fatalConsoleErrors.join("\n\n")}`);

    console.log(JSON.stringify({
        status: "CHROMIUM_SMOKE_OK",
        browser: chromeBinary,
        browserVersion: process.env.CHROME_FOR_TESTING_VERSION || "unknown",
        extensionId,
        newTabAttempt: newTab.attempt,
        targetListUrl: newTab.target.url,
        documentUrl: initial.url,
        title: initial.title,
        defaultShortcuts: initial.shortcutCount,
        pomodoroTimerReload: true,
        pomodoroPanelGeometry: pomoGeometry,
        studyQuotesManager: studyQuotes,
        dialogTextAA: Object.fromEntries(Object.entries(dialogContrast).map(([mode, dialogs]) => [mode, Object.values(dialogs).reduce((n, r) => n + r.count, 0)])),
        wallpaperVisibilityCycles: 3,
        hiddenInitializedWallpaperStarts: true,
        reviewRegressions: review,
        hiddenWallpaperTimeFrozen: true,
        previouslyPausedWallpaperStaysPaused: true,
        safeRawSvgAccepted: true,
        unsafeSvgRejected: true,
        consoleErrors: consoleErrors.filter(Boolean).slice(0, 5),
    }));
}

try {
    await main();
} catch (error) {
    const output = chromeOutput.slice(-40).join("\n");
    console.error(error instanceof Error ? error.stack : error);
    if (output) console.error(`\nRecent Chromium output:\n${output}`);
    process.exitCode = 1;
} finally {
    pageClient?.close();
    browserClient?.close();
    if (chrome && chrome.exitCode === null) {
        chrome.kill("SIGTERM");
        await delay(500);
        if (chrome.exitCode === null) chrome.kill("SIGKILL");
    }
    // Windows releases the profile a moment after Chrome exits; rmSync's own retry did not cover it here.
    for (let attempt = 0; ; attempt++) {
        try { rmSync(profileDir, { recursive: true, force: true }); break; }
        catch (error) { if (attempt >= 20) throw error; await delay(500); }
    }
}

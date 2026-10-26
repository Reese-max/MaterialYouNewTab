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
        if (existsSync(candidate)) return candidate;
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
            const timer=setTimeout(()=>{rejectReady(new Error('CDP handshake timed out'));this.socket.close();},15000);
            this.socket.addEventListener("open", () => {clearTimeout(timer);resolveReady();}, { once: true });
            const failed=()=>{clearTimeout(timer);rejectReady(new Error(`Unable to connect to ${url}`));};
            this.socket.addEventListener("error",failed,{once:true});this.socket.addEventListener('close',failed,{once:true});
        });
        this.ready.catch(()=>{});
        const rejectPending=()=>{for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error(p.method+': CDP disconnected'));}this.pending.clear();};
        this.socket.addEventListener('close',rejectPending);this.socket.addEventListener('error',rejectPending);
        this.socket.addEventListener("message", async (event) => {
            const raw = typeof event.data === "string"
                ? event.data
                : Buffer.from(await event.data.arrayBuffer()).toString("utf8");
            const message = JSON.parse(raw);
            if (message.id) {
                const pending = this.pending.get(message.id);
                if (!pending) return;
                this.pending.delete(message.id);clearTimeout(pending.timer);
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
            const timer=setTimeout(()=>{this.pending.delete(id);rejectRequest(new Error(method+': timed out'));},15000);
            this.pending.set(id, { resolve: resolveRequest, reject: rejectRequest, method, timer });
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
        client.send("Emulation.setFocusEmulationEnabled", {enabled:false}),
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
        const target = await waitForPageTarget(port, targetId);
        assert.ok(target, 'Tab activation target is available');
        const targetClient = new CdpClient(target.webSocketDebuggerUrl);
        try { await targetClient.send('Page.bringToFront'); } finally { targetClient.close(); }
        const deadline=Date.now()+5000;
        while(Date.now()<deadline){
            const state=await evaluate(`({hidden:document.hidden,paused:document.querySelector('#videoBg').paused,time:document.querySelector('#videoBg').currentTime})`);
            if(state.hidden===hidden && (!hidden || state.paused))return state;
            await delay(100);
        }
        throw Error("Wallpaper visibility/paused state did not follow actual tab activation: " + JSON.stringify({ expectedHidden: hidden, state: await evaluate(`({hidden:document.hidden,paused:document.querySelector('#videoBg').paused})`), targetWindow: await browserClient.send('Browser.getWindowForTarget', {targetId}), extensionWindow: await browserClient.send('Browser.getWindowForTarget', {targetId:newTab.target.id}) }));
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
    const pomoGeometry = await evaluate(`(() => {
        const p=document.querySelector('#pomodoroPanel'),r=p.getBoundingClientRect();
        const inBounds=r.top>=-1&&r.bottom<=innerHeight+1&&r.left>=-1&&r.right<=innerWidth+1;
        const savedUnchanged=JSON.parse(localStorage.getItem('pomodoroPanelPosition')).top===innerHeight-180;
        const scalePreserved=p.style.transform==='scale(1.5)';
        document.querySelector('#myntPomoExtras').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
        const collapsed=document.querySelector('#myntPomoExtras').hidden;
        return {inBounds,savedUnchanged,collapsed,scalePreserved};
    })()`);
    for(const [key,value] of Object.entries(pomoGeometry))assert.equal(value,true,'Pomodoro panel: '+key);

    const initial = await evaluate(`(() => ({
        url: location.href,
        extensionId: globalThis.chrome?.runtime?.id || "",
        title: document.title,
        lang: document.documentElement.lang,
        shortcutCount: document.querySelectorAll("#shortcutsContainer .shortcuts").length,
        settingsEntryCount: document.querySelectorAll("#shortcutList .shortcutSettingsEntry").length,
        hasControlCenter: Boolean(document.querySelector("#controlCenterDialog")),
        hasTodo: Boolean(document.querySelector("#todoListCont")),
        hasScratchpad: Boolean(document.querySelector("#scratchpadContainer")),
    }))()`);

    assert.equal(initial.extensionId, extensionId, "New Tab loaded a different extension document");
    assert.match(initial.url, /^chrome-extension:\/\//u, "New Tab document did not use the extension origin");
    assert.ok(initial.title, "Localized New Tab title is empty");
    assert.equal(initial.lang, "zh-TW", "Traditional Chinese should remain the default document language");
    assert.ok(initial.shortcutCount > 0, "Default shortcuts did not render");
    assert.equal(initial.shortcutCount, initial.settingsEntryCount, "Shortcut view and settings entry counts diverged");
    assert.equal(initial.hasControlCenter, true, "Control Center is missing");
    assert.equal(initial.hasTodo, true, "To-do widget trigger is missing");
    assert.equal(initial.hasScratchpad, true, "Scratchpad trigger is missing");

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
    // Graceful browser shutdown also closes Windows child-process file handles.
    try { await browserClient?.send('Browser.close'); } catch { /* Browser may already have exited. */ }
    pageClient?.close();
    browserClient?.close();
    if (chrome && chrome.exitCode === null && chrome.signalCode === null) {
        chrome.kill("SIGTERM");
        await delay(500);
        if (chrome.exitCode === null && chrome.signalCode === null) chrome.kill("SIGKILL");
    }
    if(chrome&&chrome.exitCode===null&&chrome.signalCode===null)await Promise.race([new Promise(resolve=>chrome.once('close',resolve)),delay(5000)]);
    try {rmSync(profileDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });}
    catch(error){console.error('Test profile cleanup failed; retained '+profileDir+': '+error.message);process.exitCode=1;}
}

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { contrastRatio, freezeWallpaper, isLargeText, parseArgs, shotName, summarize, wallpaperSeed } from "./capture-ui-core.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const profileDir = mkdtempSync(resolve(tmpdir(), "mynt-ui-capture-"));
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
            const resolved = execFileSync("bash", ["-lc", 'command -v -- "$1"', "mynt-capture", candidate], {
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
            const timer = setTimeout(() => rejectReady(new Error(`Timed out connecting to ${url}`)), 10_000);
            this.socket.addEventListener("open", () => { clearTimeout(timer); resolveReady(); }, { once: true });
            this.socket.addEventListener("error", () => {
                clearTimeout(timer);
                rejectReady(new Error(`Unable to connect to ${url}`));
            }, { once: true });
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
                clearTimeout(pending.timer);
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
        this.socket.addEventListener("close", () => {
            for (const pending of this.pending.values()) {
                clearTimeout(pending.timer);
                pending.reject(new Error(`CDP closed during ${pending.method}`));
            }
            this.pending.clear();
            for (const waiters of this.eventWaiters.values()) {
                for (const waiter of waiters) {
                    clearTimeout(waiter.timer);
                    waiter.rejectEvent(new Error("CDP closed while waiting for an event"));
                }
            }
            this.eventWaiters.clear();
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
            const timer = setTimeout(() => {
                this.pending.delete(id);
                rejectRequest(new Error(`Timed out waiting for ${method}`));
            }, 60_000);
            this.pending.set(id, { resolve: resolveRequest, reject: rejectRequest, method, timer });
            if (this.socket.readyState !== WebSocket.OPEN) {
                clearTimeout(timer); this.pending.delete(id);
                rejectRequest(new Error(`CDP is not open: ${method}`));
                return;
            }
            this.socket.send(JSON.stringify({ id, method, params }));
        });
    }

    waitForEvent(method, timeoutMs = 15_000) {
        return new Promise((resolveEvent, rejectEvent) => {
            const waiters = this.eventWaiters.get(method) || [];
            const waiter = { resolveEvent, rejectEvent, timer: null };
            waiter.timer = setTimeout(() => {
                const current = this.eventWaiters.get(method) || [];
                this.eventWaiters.set(method, current.filter(item => item !== waiter));
                rejectEvent(new Error(`Timed out waiting for ${method}`));
            }, timeoutMs);
            waiters.push(waiter);
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

const FIXED_TIME = "2026-10-28T09:30:00+08:00";
const STILL_CSS = `*, *::before, *::after {
    animation: none !important; transition: none !important;
    scroll-behavior: auto !important; caret-color: transparent !important;
}`;

// 只在本工具建立的暫存 profile 中重設資料，不連接使用者的瀏覽器。
function seedDocument(seed, theme, fixedTime, css) {
    if (location.protocol !== "chrome-extension:") return;
    const NativeDate = globalThis.Date;
    const fixed = NativeDate.parse(fixedTime);
    function Date(...args) {
        if (!new.target) return new NativeDate(fixed).toString();
        return Reflect.construct(NativeDate, args.length ? args : [fixed], new.target);
    }
    Object.setPrototypeOf(Date, NativeDate);
    Date.prototype = NativeDate.prototype;
    Date.now = () => fixed;
    globalThis.Date = Date;
    // 固定洗牌袋等畫面內容；不改 crypto 或應用程式原始碼。
    let randomState = 20261028;
    Math.random = () => ((randomState = (1664525 * randomState + 1013904223) >>> 0) / 4294967296);
    localStorage.clear();
    for (const [key, value] of Object.entries(seed)) {
        localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
    }
    localStorage.setItem("preferredTheme", theme);
    localStorage.setItem("todoLastUpdateDate", new Date().toLocaleDateString());
    const installStyle = () => {
        if (!document.documentElement) return;
        const style = document.createElement("style");
        style.id = "myntCaptureStill";
        style.textContent = css;
        document.documentElement.appendChild(style);
    };
    if (document.documentElement) installStyle();
    else {
        const observer = new MutationObserver(() => {
            if (document.documentElement) { installStyle(); observer.disconnect(); }
        });
        observer.observe(document, { childList: true });
    }
}

async function waitForUi(expression, description, timeoutMs = 15_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (await evaluate(expression)) return;
        await delay(100);
    }
    throw new Error(`Timed out waiting for ${description}`);
}

// 保留真正的 UI 入口與斷言，避免用強制 display 偽造已開啟狀態。
const stateSelectors = {
    home: "#shortcutsContainer .shortcuts",
    menu: '#menuBar #menuCont',
    todo: '#todoContainer #todoullist .todolistitem',
    pomodoro: '#pomodoroPanel',
    layout: 'body.mynt-layout-editing #myntLayoutToolbar',
    dialog: 'dialog.myntAppDialog[open]',
};

async function enterState(state) {
    const actions = {
        home: "void 0",
        menu: "document.querySelector('#menuButton').click()",
        todo: "document.querySelector('#todoListCont').click()",
        pomodoro: "window.myntPomodoro.open()",
        layout: "document.querySelector('#myntLayoutEdit').click()",
        // 清空便籤會開啟既有非同步確認框；不等待那個 Promise，也不按確認。
        dialog: "document.querySelector('#scratchpadCont').click(); document.querySelector('#scratchpadClearBtn').click()",
    };
    await evaluate(actions[state]);
    const selector = JSON.stringify(stateSelectors[state]);
    await waitForUi(`(() => {
        const element = document.querySelector(${selector});
        if (!element || !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
        const box = element.getBoundingClientRect();
        if (box.width <= 0 || box.height <= 0 || box.bottom <= 0 || box.right <= 0 || box.top >= innerHeight || box.left >= innerWidth) return false;
        return ${state === "home" ? "document.querySelectorAll('#shortcutsContainer .shortcuts').length === 6"
        : state === "menu" ? "document.querySelector('#menuButton').getAttribute('aria-expanded') === 'true' && getComputedStyle(document.querySelector('#menuBar')).opacity === '1'"
        : state === "todo" ? "document.querySelector('#todoListCont').getAttribute('aria-expanded') === 'true' && document.querySelectorAll('#todoullist .todolistitem').length === 4"
        : state === "pomodoro" ? "document.querySelector('#pomodoroCont').getAttribute('aria-expanded') === 'true'"
        : state === "layout" ? "window.myntLayout.isEditing()"
        : "element.matches(':modal') && Boolean(element.querySelector('.myntAppDialogCancel'))"};
    })()`, `${state}: ${stateSelectors[state]}`);
}

// 取直接文字節點與原生表單欄位；避免把每個父容器重複當成文字。
function collectTextColors() {
    const elements = new Map();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!node.textContent.trim() || node.parentElement.closest("script, style, noscript, template")) continue;
        const entry = elements.get(node.parentElement) || { text: "", nodes: [] };
        entry.text += node.textContent;
        entry.nodes.push(node);
        elements.set(node.parentElement, entry);
    }
    for (const element of document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea, select')) {
        const placeholder = !element.value && Boolean(element.placeholder);
        const text = element.tagName === "SELECT" ? element.selectedOptions[0]?.textContent : element.value || element.placeholder;
        if (text) elements.set(element, { text, nodes: [], placeholder });
    }
    const selectorFor = element => {
        const parts = [];
        for (let current = element; current && current !== document.documentElement; current = current.parentElement) {
            if (current.id) { parts.unshift(`#${CSS.escape(current.id)}`); break; }
            const index = [...current.parentElement.children].indexOf(current) + 1;
            parts.unshift(`${current.localName}:nth-child(${index})`);
        }
        return parts.join(" > ");
    };
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true, colorSpace: "srgb" });
    const parse = value => {
        const match = /^rgba?\((.+)\)$/u.exec(value);
        if (match) {
            const channels = match[1].split(/[\s,/]+/u).map(Number);
            if (channels.length < 3 || channels.some(value => !Number.isFinite(value))) return null;
            return [...channels.slice(0, 3), channels[3] ?? 1];
        }
        // color-mix() 可能回傳 color(srgb ...)；交給原生畫布轉成 sRGB。
        if (!context || !CSS.supports("color", value)) return null;
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = value;
        context.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
        return [r, g, b, a / 255];
    };
    const samples = [];
    for (const [element, entry] of elements) {
        if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
        let rects;
        if (entry.nodes.length) {
            rects = entry.nodes.flatMap(node => {
                const range = document.createRange(); range.selectNodeContents(node);
                return [...range.getClientRects()];
            });
        } else rects = [...element.getClientRects()];
        const visible = rects.some(box => {
            const left = Math.max(0, box.left), right = Math.min(innerWidth, box.right);
            const top = Math.max(0, box.top), bottom = Math.min(innerHeight, box.bottom);
            if (right <= left || bottom <= top) return false;
            const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
            return hit && (element.contains(hit) || hit.contains(element));
        });
        if (!visible) continue;
        const style = getComputedStyle(element, entry.placeholder ? "::placeholder" : null);
        const foreground = parse(style.color);
        const sample = {
            selector: selectorFor(element), text: Array.from(entry.text.replace(/\s+/gu, " ").trim()).slice(0, 20).join(""),
            fg: foreground ? `rgba(${foreground.join(", ")})` : style.color,
            fontSize: Number.parseFloat(style.fontSize), fontWeight: style.fontWeight,
        };
        const layers = [];
        let opaqueBackground = false;
        for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
            const ancestorStyle = getComputedStyle(ancestor);
            const color = parse(ancestorStyle.backgroundColor);
            if (!opaqueBackground) {
                if (!color) sample.unmeasured = "unsupported background color";
                if (ancestorStyle.backgroundImage !== "none") sample.unmeasured = "background image or gradient";
                if (color) layers.unshift(color);
                opaqueBackground = color?.[3] === 1;
            }
            if (Number(ancestorStyle.opacity) !== 1 || ancestorStyle.filter !== "none" || ancestorStyle.mixBlendMode !== "normal") sample.unmeasured = "opacity, filter or blend";
        }
        if (entry.placeholder && Number(style.opacity) !== 1) sample.unmeasured = "placeholder opacity";
        let background = [255, 255, 255];
        for (const layer of layers) background = layer.slice(0, 3).map((value, index) => value * layer[3] + background[index] * (1 - layer[3]));
        sample.bg = `rgb(${background.join(", ")})`;
        samples.push(sample);
    }
    return samples;
}

async function inspectContrast() {
    const samples = await evaluate(`(${collectTextColors.toString()})()`);
    const failures = [], unmeasured = [];
    let checked = 0;
    for (const sample of samples) {
        const { selector, text } = sample;
        if (sample.unmeasured) {
            unmeasured.push({ selector, text, reason: sample.unmeasured });
            continue;
        }
        try {
            const ratio = contrastRatio(sample.fg, sample.bg);
            const threshold = isLargeText(sample.fontSize, sample.fontWeight) ? 3 : 4.5;
            checked += 1;
            if (ratio < threshold) failures.push({ selector, text, ratio, threshold, foreground: sample.fg, background: sample.bg });
        } catch (error) {
            unmeasured.push({ selector, text, reason: error.message });
        }
    }
    return {
        contrastChecked: checked,
        contrastFailureCount: failures.length,
        contrastFailures: failures.slice(0, 20),
        contrastUnmeasuredCount: unmeasured.length,
        contrastUnmeasured: unmeasured.slice(0, 20),
    };
}

async function captureShot(result, seed, axeSource, wallpaperMode) {
    let scriptId;
    const consoleStart = consoleMessages.length, exceptionStart = runtimeExceptions.length;
    try {
        await pageClient.send("Emulation.setDeviceMetricsOverride", { ...result.viewport, deviceScaleFactor: 1, mobile: false });
        await pageClient.send("Emulation.setTimezoneOverride", { timezoneId: "Asia/Taipei" });
        await pageClient.send("Emulation.setEmulatedMedia", { features: [
            { name: "prefers-color-scheme", value: result.theme },
            { name: "prefers-reduced-motion", value: "reduce" },
        ] });
        const source = `(${seedDocument.toString()})(${JSON.stringify(seed)}, ${JSON.stringify(result.theme)}, ${JSON.stringify(FIXED_TIME)}, ${JSON.stringify(STILL_CSS)})`;
        ({ identifier: scriptId } = await pageClient.send("Page.addScriptToEvaluateOnNewDocument", { source }));
        const loaded = pageClient.waitForEvent("Page.loadEventFired", 25_000);
        // 即使 reload 送出失敗，事件等待也已有 rejection handler。
        loaded.catch(() => {});
        await pageClient.send("Page.reload", { ignoreCache: true });
        await loaded;
        await waitForUi(`document.readyState === 'complete' && Boolean(window.myntPomodoro)
            && Boolean(window.myntLayout) && Boolean(window.myntWallpaper)
            && document.querySelectorAll('#shortcutsContainer .shortcuts').length === 6
            && document.querySelector('#themeSegment').dataset.active === ${JSON.stringify(result.theme)}
            && getComputedStyle(document.querySelector('#LoadingScreen')).display === 'none'`, "seeded MYNT page");
        // none 保留原本的種子與取消入口；default 讓新安裝的背景自行初始化。
        if (wallpaperMode === "none") await evaluate("window.myntWallpaper.cancelApply()");
        await evaluate("document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))");
        await delay(700);
        if (result.state === "home") {
            result.metrics = await evaluate(`(() => {
                const navigation = performance.getEntriesByType('navigation')[0];
                const fcp = performance.getEntriesByName('first-contentful-paint')[0];
                return {
                    domContentLoaded: navigation?.domContentLoadedEventEnd ?? null,
                    load: navigation?.loadEventEnd ?? null,
                    firstContentfulPaint: fcp?.startTime ?? null,
                    unit: 'ms', source: 'performance',
                };
            })()`);
        }
        await enterState(result.state);
        // 設定選單等入口另有 setTimeout；CSS 關閉動畫不會取消這些回呼。
        await delay(700);
        result.stateOpened = true;
    } catch (error) {
        result.error = error.message;
    }
    if (wallpaperMode === "default") {
        try {
            result.wallpaper = await evaluate(`(${freezeWallpaper.toString()})()`);
            // Use MYNT's existing reanalysis entry after seeking so cards match the fixed frame.
            await evaluate("document.querySelector('#myntAdaptiveAnalyze')?.click()");
            await delay(300);
        } catch (error) { result.wallpaper = { error: error.message }; }
    }
    if (result.stateOpened) {
        try {
            Object.assign(result, await inspectContrast());
            if (axeSource !== null) {
                await evaluate(`${axeSource}\n; Boolean(globalThis.axe?.run)`);
                result.axe = await evaluate(`(async () => {
                    if (!globalThis.axe?.run) throw Error('The --axe file did not expose axe.run');
                    const report = await axe.run(document, { resultTypes: ['violations'] });
                    return { version: axe.version, violations: report.violations.filter(item => ['serious', 'critical'].includes(item.impact)) };
                })()`);
            }
        } catch (error) {
            result.error = error.message;
        }
    }
    try {
        const { data } = await pageClient.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
        writeFileSync(resolve(outputDir, result.filename), Buffer.from(data, "base64"));
        result.screenshotSaved = true;
    } catch (error) {
        result.error = [result.error, `Screenshot: ${error.message}`].filter(Boolean).join("; ");
    }
    if (scriptId) {
        try { await pageClient.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: scriptId }); }
        catch (error) { result.error = [result.error, `Remove seed script: ${error.message}`].filter(Boolean).join("; "); }
    }
    result.consoleErrors = consoleMessages.slice(consoleStart);
    if (wallpaperMode === "default") result.wallpaperLog = wallpaperMessages.splice(0);
    result.exceptions = runtimeExceptions.slice(exceptionStart);
    result.success = result.stateOpened && result.screenshotSaved && !result.error && !result.consoleErrors.length && !result.exceptions.length;
    console.log(`${result.success ? "OK" : "FAIL"} ${result.filename}${result.error ? `: ${result.error}` : ""}`);
}

const consoleMessages = [], runtimeExceptions = [], wallpaperMessages = [];
let outputDir;
let report;

async function main() {
    const options = parseArgs(process.argv.slice(2));
    outputDir = resolve(options.out);
    const seed = wallpaperSeed(JSON.parse(readFileSync(new URL("./fixtures/ui-seed.json", import.meta.url), "utf8")), options.wallpaper);
    const axeSource = options.axe ? readFileSync(resolve(options.axe), "utf8") : null;
    mkdirSync(outputDir, { recursive: true });
    const results = options.themes.flatMap(theme => options.viewports.flatMap(viewport => options.states.map(state => ({
        state, theme, viewport, width: viewport.width, height: viewport.height,
        filename: shotName(state, theme, viewport), selector: stateSelectors[state],
        success: false, stateOpened: false, screenshotSaved: false,
        consoleErrors: [], exceptions: [], metrics: null, contrastFailures: [], axe: null,
    }))));
    try {
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
        let spawnError;
        chrome.on("error", error => { spawnError = error; });
        for (const stream of [chrome.stdout, chrome.stderr]) {
            stream.setEncoding("utf8");
            stream.on("data", chunk => {
                chromeOutput.push(...chunk.split(/\r?\n/u).filter(Boolean));
                if (chromeOutput.length > 120) chromeOutput.splice(0, chromeOutput.length - 120);
            });
        }
        const { port, browserPath } = await waitForDevToolsPort();
        if (spawnError) throw spawnError;
        browserClient = new CdpClient(`ws://127.0.0.1:${port}${browserPath}`);
        await browserClient.ready;
        const { extensionId } = await waitForMyntServiceWorker(port);
        const newTab = await waitForExtensionNewTab(port, extensionId);
        pageClient = newTab.client;
        pageClient.on("Runtime.consoleAPICalled", ({ type, args = [] }) => {
            if (type === "error") consoleMessages.push(args.map(arg => String(arg.value ?? arg.description ?? "")).join(" "));
        });
        pageClient.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
            runtimeExceptions.push(exceptionDetails.exception?.description || exceptionDetails.text || "Unknown exception");
        });
        pageClient.on("Log.entryAdded", ({ entry }) => {
            if (entry.level !== "error" || entry.source === "console-api") return;
            const message = `${entry.source}: ${entry.text}`;
            if (options.wallpaper === "default" && (entry.source === "media" || /\/videos\/bg\.mp4(?:[?#]|$)/u.test(entry.url || ""))) {
                wallpaperMessages.push(message);
            } else consoleMessages.push(message);
        });
        // 新分頁初次註冊只供辨識 extension；每張圖都另行注入、重載及量測。
        for (const result of results) await captureShot(result, seed, axeSource, options.wallpaper);
        report = { ...summarize(results), browser: chromeBinary, extensionId, fixedTime: FIXED_TIME };
    } catch (error) {
        for (const result of results) {
            if (!result.screenshotSaved) result.error = result.error || error.message;
        }
        report = { ...summarize(results), success: false, error: error.message, chromeOutput: chromeOutput.slice(-40), fixedTime: FIXED_TIME };
    }
    report.wallpaperMode = options.wallpaper;
    report.metricsNote = "Home only; first seeded reload per theme/viewport, navigation-relative milliseconds. Other states have metrics=null.";
    report.contrastNote = "Computed RGB foreground and composited ancestor background colors. Images, gradients, opacity and blending are listed as unmeasured; pseudo-elements and overlapping/backdrop layers require visual review.";
    writeFileSync(resolve(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report.totals));
    if (!report.success) process.exitCode = 1;
}

try {
    await main();
} catch (error) {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
} finally {
    pageClient?.close();
    browserClient?.close();
    if (chrome && chrome.exitCode === null) {
        chrome.kill("SIGTERM");
        await delay(500);
        if (chrome.exitCode === null) chrome.kill("SIGKILL");
    }
    rmSync(profileDir, { recursive: true, force: true });
}



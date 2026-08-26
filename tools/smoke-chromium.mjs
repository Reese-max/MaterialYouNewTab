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

async function waitForExtensionPage(port, targetId, timeoutMs = 20_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const targets = await fetchTargets(port);
        const target = targets.find((item) => item.id === targetId)
            || targets.find((item) => item.type === "page" && item.url.startsWith("chrome-extension://"));
        if (target?.url.startsWith("chrome-extension://") && target.webSocketDebuggerUrl) return target;
        await delay(150);
    }
    throw new Error("The Chromium New Tab override did not resolve to the extension page.");
}

async function evaluate(expression) {
    const result = await pageClient.send("Runtime.evaluate", {
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

async function reloadAndWait() {
    const loaded = pageClient.waitForEvent("Page.loadEventFired", 20_000);
    await pageClient.send("Page.reload", { ignoreCache: true });
    await loaded;

    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
        try {
            const ready = await evaluate(`document.readyState === "complete" && Boolean(document.querySelector("#shortcutsContainer"))`);
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
    const { targetId } = await browserClient.send("Target.createTarget", { url: "chrome://newtab/" });
    const pageTarget = await waitForExtensionPage(port, targetId);
    pageClient = new CdpClient(pageTarget.webSocketDebuggerUrl);

    const runtimeExceptions = [];
    const consoleErrors = [];
    pageClient.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
        runtimeExceptions.push(exceptionDetails.exception?.description || exceptionDetails.text || "Unknown runtime exception");
    });
    pageClient.on("Runtime.consoleAPICalled", ({ type, args = [] }) => {
        if (type === "error") consoleErrors.push(args.map((arg) => arg.value || arg.description || "").join(" "));
    });

    await Promise.all([
        pageClient.send("Page.enable"),
        pageClient.send("Runtime.enable"),
        pageClient.send("Log.enable"),
    ]);
    await reloadAndWait();

    const initial = await evaluate(`(() => ({
        url: location.href,
        title: document.title,
        lang: document.documentElement.lang,
        shortcutCount: document.querySelectorAll("#shortcutsContainer .shortcuts").length,
        settingsEntryCount: document.querySelectorAll("#shortcutList .shortcutSettingsEntry").length,
        hasControlCenter: Boolean(document.querySelector("#controlCenterModal")),
        hasTodo: Boolean(document.querySelector("#todoListCont")),
    }))()`);

    assert.match(initial.url, /^chrome-extension:\/\//u, "New Tab did not load from the extension origin");
    assert.ok(initial.title, "Localized New Tab title is empty");
    assert.equal(initial.lang, "zh-TW", "Traditional Chinese should remain the default document language");
    assert.ok(initial.shortcutCount > 0, "Default shortcuts did not render");
    assert.equal(initial.shortcutCount, initial.settingsEntryCount, "Shortcut view and settings entry counts diverged");
    assert.equal(initial.hasTodo, true, "To-do widget trigger is missing");

    const customSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="currentColor"/></svg>`;
    const customIcon = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(customSvg)}`;
    await evaluate(`(() => {
        localStorage.setItem("shortcutAmount", "1");
        localStorage.setItem("shortcutName0", "Smoke Test");
        localStorage.setItem("shortcutURL0", "https://example.com/");
        localStorage.setItem("shortcutIcon0", ${JSON.stringify(customIcon)});
    })()`);
    runtimeExceptions.length = 0;
    await reloadAndWait();

    const customIconState = await evaluate(`(() => {
        const icon = document.querySelector("#shortcutsContainer .shortcutLogoContainer img[data-icon-type='custom']");
        return {
            shortcutCount: document.querySelectorAll("#shortcutsContainer .shortcuts").length,
            iconFound: Boolean(icon),
            iconSource: icon?.getAttribute("src") || "",
            storedIcon: localStorage.getItem("shortcutIcon0") || "",
            label: document.querySelector("#shortcutsContainer .shortcut-name")?.textContent || "",
        };
    })()`);
    assert.equal(customIconState.shortcutCount, 1, "Custom shortcut count is incorrect");
    assert.equal(customIconState.iconFound, true, "Valid custom SVG icon was not appended to its container");
    assert.match(customIconState.iconSource, /^data:image\/svg\+xml/u, "Custom SVG icon source was lost");
    assert.equal(customIconState.storedIcon, customIcon, "Custom icon state was not preserved");
    assert.equal(customIconState.label, "Smoke Test", "Custom shortcut label did not render");

    await evaluate(`(() => {
        const input = document.querySelector("#shortcutList .iconURL");
        if (!input) throw new Error("Custom icon input was not rendered");
        input.value = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><circle r="4"/></svg>';
        input.dispatchEvent(new Event("blur"));
    })()`);
    await delay(250);
    const invalidIconState = await evaluate(`(() => ({
        inputValue: document.querySelector("#shortcutList .iconURL")?.value ?? null,
        storedIcon: localStorage.getItem("shortcutIcon0"),
        renderedCustomIcon: Boolean(document.querySelector("#shortcutsContainer img[data-icon-type='custom']")),
    }))()`);
    assert.equal(invalidIconState.inputValue, "", "Unsafe SVG input was not cleared");
    assert.equal(invalidIconState.storedIcon, "", "Unsafe SVG input was persisted");
    assert.equal(invalidIconState.renderedCustomIcon, false, "Unsafe SVG remained rendered as a custom icon");

    assert.deepEqual(runtimeExceptions, [], `Runtime exceptions were observed:\n${runtimeExceptions.join("\n\n")}`);

    console.log(JSON.stringify({
        status: "CHROMIUM_SMOKE_OK",
        browser: chromeBinary,
        page: initial.url,
        title: initial.title,
        defaultShortcuts: initial.shortcutCount,
        customSvg: true,
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
    rmSync(profileDir, { recursive: true, force: true });
}

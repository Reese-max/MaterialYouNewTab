import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { contrastRatio, freezeWallpaper, inspectStateVisibility, isLargeText, parseArgs, shotName, summarize, wallpaperSeed } from "./capture-ui-core.mjs";

const defaults = parseArgs(["--out", "dist/ui-shots/base"]);
assert.equal(defaults.states.length, 6);
assert.deepEqual(defaults.themes, ["light", "dark"]);
assert.deepEqual(defaults.viewports, [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }]);
assert.equal(defaults.wallpaper, "none");
for (const mode of ["none", "default"]) assert.equal(parseArgs(["--out", "shots", "--wallpaper", mode]).wallpaper, mode);
assert.deepEqual(parseArgs(["--out", "shots", "--states", "todo,dialog", "--themes", "dark", "--viewports", "320x640", "--axe", "axe.min.js", "--only-changed"]), {
    out: "shots", states: ["todo", "dialog"], themes: ["dark"], viewports: [{ width: 320, height: 640 }], axe: "axe.min.js", wallpaper: "none",
});
for (const args of [[], ["--out"], ["--out", ""], ["--out", "--themes"], ["--unknown"],
    ["--out", "a", "--out", "b"], ["--out", "a", "--states", "bogus"], ["--out", "a", "--states", "home,"],
    ["--out", "a", "--themes", "system"], ["--out", "a", "--themes", "dark,dark"],
    ["--out", "a", "--viewports", "0x768"], ["--out", "a", "--viewports", "1920"],
    ["--out", "a", "--viewports", "1.5x768"], ["--out", "a", "--viewports", "999999999999999999x768"],
    ["--out", "a", "--axe"], ["--out", "a", "--only-changed", "yes"],
    ["--out", "a", "--wallpaper"], ["--out", "a", "--wallpaper", ""], ["--out", "a", "--wallpaper", "--themes"],
    ["--out", "a", "--wallpaper", "random"], ["--out", "a", "--wallpaper", "none,default"],
    ["--out", "a", "--wallpaper", "DEFAULT"], ["--out", "a", "--wallpaper", "none", "--wallpaper", "default"]]) {
    assert.throws(() => parseArgs(args), Error, JSON.stringify(args));
}
assert.equal(shotName("home", "dark", { width: 1366, height: 768 }), "home--dark--1366x768.png");
assert.equal(contrastRatio("rgb(0, 0, 0)", "rgb(255, 255, 255)"), 21);
assert.equal(contrastRatio("rgb(255, 255, 255)", "rgb(0, 0, 0)"), 21);
assert.equal(contrastRatio("rgb(80, 80, 80)", "rgb(80, 80, 80)"), 1);
assert.equal(contrastRatio("rgba(0, 0, 0, 0)", "rgb(255, 255, 255)"), 1);
assert.ok(Math.abs(contrastRatio("rgba(0, 0, 0, 0.5)", "rgb(255, 255, 255)") - 3.976653024912438) < 1e-10);
assert.equal(contrastRatio("rgb(0 0 0 / 50%)", "rgb(100% 100% 100%)"), contrastRatio("rgba(0,0,0,0.5)", "rgb(255,255,255)"));
assert.equal(contrastRatio("rgb(0,0,0)", "rgba(0,0,0,0)"), 21);
for (const color of ["red", "rgb(256,0,0)", "rgba(0,0,0,2)", "rgb(no,0,0)", "rgb(0,0)", "rgb(-1,0,0)"]) {
    assert.throws(() => contrastRatio(color, "rgb(255,255,255)"), /color|Color/u);
}
assert.equal(isLargeText(24, 400), true);
assert.equal(isLargeText(23.99, 400), false);
assert.equal(isLargeText(18.66, 700), true);
assert.equal(isLargeText(18.659, 700), false);
assert.equal(isLargeText(18.66, 699), false);
assert.equal(isLargeText("18.66", "bold"), true);
assert.equal(isLargeText(16, "900"), false);
const input = [{ state: "home", theme: "light", viewport: { width: 1920, height: 1080 }, filename: "home.png", success: true },
    { state: "menu", success: false, consoleErrors: ["error"], exceptions: ["exception"], metrics: null,
        contrastFailures: [{ ratio: 2 }], contrastFailureCount: 25, axe: { violations: [{ impact: "critical" }] } }];
const report = summarize(input);
assert.deepEqual(report.totals, { shots: 2, successful: 1, failed: 1, consoleErrors: 1, exceptions: 1, contrastFailures: 25, axeViolations: 1 });
assert.equal(report.success, false);
assert.equal(report.shots[0].width, 1920);
assert.deepEqual(report.shots[0].consoleErrors, []);
assert.equal(input[0].metrics, undefined);
assert.equal(summarize([input[0]]).success, true);
assert.equal(summarize([{ ...input[0], consoleErrors: ["error"] }]).success, false);
assert.equal(summarize([{ ...input[0], exceptions: ["exception"] }]).success, false);
assert.equal(summarize([]).totals.shots, 0);

const seed = JSON.parse(readFileSync(new URL("./fixtures/ui-seed.json", import.meta.url), "utf8"));
const originalSeed = JSON.stringify(seed);
assert.deepEqual(wallpaperSeed(seed, "none"), seed);
const freshSeed = wallpaperSeed(seed, "default");
for (const key of ["myntWallpaperCurrent", "myntWallpaperMode", "myntWallpaperSeeded"]) {
    assert.equal(Object.hasOwn(freshSeed, key), false);
}
assert.deepEqual({ ...freshSeed, myntWallpaperCurrent: "none", myntWallpaperMode: "fixed", myntWallpaperSeeded: "1" }, seed);
assert.equal(JSON.stringify(seed), originalSeed);

// Exercise the exact serialized page function using media doubles; no browser or dependencies.
class Video extends EventTarget {
    constructor({ lazy = false, duration = 5, fail = false, neverLoad = false, neverSeek = false, empty = false, ready = 0 } = {}) {
        super();
        Object.assign(this, { id: "videoBg", duration, fail, neverLoad, neverSeek, readyState: ready, paused: false, seeking: false, error: null, time: 0, loads: 0 });
        this.source = { dataset: { src: "./videos/bg.mp4?v=2" }, src: lazy ? "" : "./videos/bg.mp4?v=2", getAttribute: () => this.source.src };
        this.empty = empty;
    }
    pause() { this.paused = true; }
    getAttribute() { return ""; }
    querySelectorAll() { return this.empty ? [] : [this.source]; }
    querySelector() { return !this.empty && this.source.src ? this.source : null; }
    load() {
        this.loads += 1;
        if (this.neverLoad) return;
        setTimeout(() => {
            if (this.fail) this.error = { code: 4, message: "unsupported" };
            else this.readyState = 2;
        }, 1);
    }
    get currentTime() { return this.time; }
    set currentTime(value) {
        this.time = value; this.seeking = true; this.readyState = 1;
        if (!this.neverSeek) setTimeout(() => { this.seeking = false; this.readyState = 2; }, 1);
    }
}
class WallpaperImage {
    set src(value) {
        this.complete = false; this.naturalWidth = 0;
        if (value === "pending.jpg") return;
        setTimeout(() => { this.complete = true; this.naturalWidth = value === "bad.jpg" ? 0 : 1920; }, 1);
    }
}
const freeze = (videos, backgroundImage = "none") => runInNewContext(`(${freezeWallpaper.toString()})({timeoutMs: 150})`, {
    document: { querySelectorAll: () => videos, body: {} },
    getComputedStyle: () => ({ backgroundImage }), Image: WallpaperImage, setTimeout, clearTimeout,
    // The actual capture page freezes Date.now(); timeout handling must not depend on it.
    Date: { now: () => 1793151000000 },
});
const lazyVideo = new Video({ lazy: true });
const shortVideo = new Video({ duration: 0.5, ready: 2 });
const noSource = new Video({ empty: true });
const media = await freeze([lazyVideo, shortVideo, noSource], 'url("good.jpg")');
assert.equal(lazyVideo.source.src, "./videos/bg.mp4?v=2");
assert.equal(lazyVideo.preload, "auto");
assert.equal(lazyVideo.loads, 1);
assert.equal(media.videos[0].currentTime, 1);
assert.equal(media.videos[0].paused, true);
assert.equal(media.videos[0].readyState, 2);
assert.equal(shortVideo.loads, 0);
assert.equal(media.videos[1].currentTime, 0.49);
assert.equal(media.videos[2].skipped, true);
assert.equal(noSource.paused, true);
assert.equal(media.images[0].loaded, true);
lazyVideo.paused = false;
lazyVideo.dispatchEvent(new Event("play"));
assert.equal(lazyVideo.paused, true);
const broken = await freeze([new Video({ fail: true }), new Video({ neverLoad: true }), new Video({ neverSeek: true })], 'url("bad.jpg"), url("pending.jpg")');
assert.match(broken.videos[0].error, /Video error 4/u);
assert.match(broken.videos[1].error, /timed out/u);
assert.match(broken.videos[2].error, /timed out/u);
assert.match(broken.images[0].error, /failed to load/u);
assert.match(broken.images[1].error, /timed out/u);

function visibilityEnvironment({ missing = false, width = 200, height = 100, display = "grid", visibility = "visible", opacity = "1", ancestorOpacity = "1", ancestorDisplay = "block", hit = "self" } = {}) {
    const ancestor = { parentElement: null, style: { display: ancestorDisplay, visibility: "visible", opacity: ancestorOpacity } };
    const child = {};
    const element = { parentElement: ancestor, style: { display, visibility, opacity },
        getBoundingClientRect: () => ({ left: 10, top: 20, width, height }),
        contains: node => node === element || node === child };
    return {
        getComputedStyle: node => node.style,
        document: {
            querySelector: () => missing ? null : element,
            elementFromPoint: (x, y) => {
                assert.equal(x, 10 + width / 2);
                assert.equal(y, 20 + height / 2);
                return hit === "self" ? element : hit === "child" ? child : hit === "outside" ? null : { id: "videoBg" };
            },
        },
    };
}
const inspect = options => runInNewContext(`(${inspectStateVisibility.toString()})("#todoContainer")`, visibilityEnvironment(options));
for (const hit of ["self", "child"]) assert.equal(inspect({ hit }).visible, true);
assert.equal(inspect({ opacity: "0.051" }).visible, true);
for (const [options, reason] of [
    [{ missing: true }, /missing/u], [{ width: 0 }, /width\/height/u], [{ height: -1 }, /width\/height/u],
    [{ display: "none" }, /display: none/u], [{ ancestorDisplay: "none" }, /display: none/u],
    [{ visibility: "hidden" }, /visibility: hidden/u], [{ visibility: "collapse" }, /visibility: collapse/u],
    [{ opacity: "0.05" }, /opacity/u], [{ opacity: "0" }, /opacity/u],
    [{ opacity: "0.2", ancestorOpacity: "0.2" }, /opacity/u],
    [{ hit: "covered" }, /covered by #videoBg/u], [{ hit: "outside" }, /outside the viewport/u],
]) {
    const result = inspect(options);
    assert.equal(result.visible, false, JSON.stringify(options));
    assert.match(result.reason, reason);
}

// Execute the real capture pipeline with CDP doubles; never import its browser-launching main().
const captureSource = readFileSync(new URL("./capture-ui.mjs", import.meta.url), "utf8");
const captureFunction = captureSource.slice(captureSource.indexOf("async function captureShot("), captureSource.indexOf("\nconst consoleMessages ="));
async function capture(mode, state, closeDuringInspection = false) {
    const events = [];
    let open = false;
    const result = { state, theme: "light", viewport: { width: 1920, height: 1080 },
        selector: state === "todo" ? "#todoContainer" : "#pomodoroPanel", filename: "test.png", stateOpened: false };
    const context = {
        result, mode, freezeWallpaper, inspectStateVisibility, FIXED_TIME: "fixed", STILL_CSS: "", seedDocument() {},
        consoleMessages: [], runtimeExceptions: [], wallpaperMessages: [], outputDir: ".", Buffer,
        resolve: (...parts) => parts.join("/"), console: { log() {} },
        writeFileSync: (_path, data) => assert.equal(data.toString(), "screenshot"),
        pageClient: { waitForEvent: async () => ({}), send: async method => {
            if (method === "Page.captureScreenshot") { events.push("screenshot"); return { data: Buffer.from("screenshot").toString("base64") }; }
            return { identifier: "seed" };
        } },
        waitForUi: async () => {}, delay: async () => {},
        enterState: async () => { events.push("open"); open = true; },
        inspectContrast: async () => { events.push("contrast"); if (closeDuringInspection) open = false; return {}; },
        evaluate: async expression => {
            if (expression.includes("cancelApply()")) events.push("cancel");
            if (expression.startsWith(`(${freezeWallpaper.toString()})`)) { events.push("freeze"); return { videos: [], images: [] }; }
            if (expression.includes("#myntAdaptiveAnalyze")) { events.push("analyze"); open = false; }
            if (expression.startsWith(`(${inspectStateVisibility.toString()})`)) {
                events.push("visibility");
                return runInNewContext(expression, visibilityEnvironment({ display: open ? "grid" : "none" }));
            }
        },
    };
    await runInNewContext(`${captureFunction}\ncaptureShot(result, {}, null, mode)`, context);
    return { result, events };
}
for (const state of ["todo", "pomodoro"]) {
    const normal = await capture("none", state);
    assert.deepEqual(normal.events, ["cancel", "open", "contrast", "visibility", "screenshot"]);
    assert.equal(normal.result.success, true);
    const wallpaper = await capture("default", state);
    assert.deepEqual(wallpaper.events, ["freeze", "analyze", "open", "contrast", "visibility", "screenshot"]);
    assert.equal(wallpaper.result.stateOpened, true);
    assert.equal(wallpaper.result.success, true);
    const hidden = await capture("default", state, true);
    assert.equal(hidden.result.stateOpened, false);
    assert.equal(hidden.result.success, false);
    assert.equal(hidden.result.screenshotSaved, true);
    assert.match(hidden.result.error, /State visibility:.*display: none/u);
    const failedReport = summarize([hidden.result]);
    assert.equal(failedReport.success, false);
    assert.match(failedReport.shots[0].stateVisibility.reason, /display: none/u);
}
console.log("CAPTURE_UI_CORE_OK");

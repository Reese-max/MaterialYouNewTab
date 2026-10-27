import assert from "node:assert/strict";
import { contrastRatio, isLargeText, parseArgs, shotName, summarize } from "./capture-ui-core.mjs";

const defaults = parseArgs(["--out", "dist/ui-shots/base"]);
assert.equal(defaults.states.length, 6);
assert.deepEqual(defaults.themes, ["light", "dark"]);
assert.deepEqual(defaults.viewports, [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }]);
assert.deepEqual(parseArgs(["--out", "shots", "--states", "todo,dialog", "--themes", "dark", "--viewports", "320x640", "--axe", "axe.min.js", "--only-changed"]), {
    out: "shots", states: ["todo", "dialog"], themes: ["dark"], viewports: [{ width: 320, height: 640 }], axe: "axe.min.js",
});
for (const args of [[], ["--out"], ["--out", ""], ["--out", "--themes"], ["--unknown"],
    ["--out", "a", "--out", "b"], ["--out", "a", "--states", "bogus"], ["--out", "a", "--states", "home,"],
    ["--out", "a", "--themes", "system"], ["--out", "a", "--themes", "dark,dark"],
    ["--out", "a", "--viewports", "0x768"], ["--out", "a", "--viewports", "1920"],
    ["--out", "a", "--viewports", "1.5x768"], ["--out", "a", "--viewports", "999999999999999999x768"],
    ["--out", "a", "--axe"], ["--out", "a", "--only-changed", "yes"]]) {
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
console.log("CAPTURE_UI_CORE_OK");

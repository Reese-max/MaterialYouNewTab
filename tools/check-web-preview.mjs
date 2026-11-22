import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "dist/web-preview");
const read = (relativePath) => readFileSync(resolve(output, relativePath), "utf8");
const sourceManifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));

for (const path of [
    "index.html",
    "verify.html",
    "style.css",
    "preview/preview.css",
    "preview/preview-banner.js",
    "preview/install-prompt.js",
    "preview/verify.js",
    "preview/meta.json",
    "manifest.webmanifest",
    "preview/icons/apple-touch-icon.png",
    ".nojekyll",
]) {
    assert.ok(existsSync(resolve(output, path)), `Missing preview path: ${path}`);
}

for (const forbiddenPath of [
    ".git",
    ".github",
    "tools",
    "manifest.json",
    "manifest(firefox).json",
    "scripts/background.js",
]) {
    assert.equal(existsSync(resolve(output, forbiddenPath)), false, `Development or extension-only path leaked: ${forbiddenPath}`);
}

const index = read("index.html");
const verify = read("verify.html");
const banner = read("preview/preview-banner.js");
const verifyScript = read("preview/verify.js");
const meta = JSON.parse(read("preview/meta.json"));

assert.equal((index.match(/MYNT_WEB_PREVIEW/gu) || []).length, 1, "Preview injection count is incorrect");
assert.match(index, /preview\/preview-banner\.js/u);
assert.match(index, /preview\/preview\.css/u);
assert.doesNotMatch(index, /<[^>]+\bon\w+\s*=/iu, "Inline event handler found in preview index");
assert.doesNotMatch(verify, /<[^>]+\bon\w+\s*=/iu, "Inline event handler found in verification page");
assert.match(banner, /myntPreviewLastSnapshot/u);
assert.match(banner, /RuntimeError|ReferenceError|TypeError|SyntaxError|Uncaught/iu);
assert.match(banner, /Reese 新分頁預覽/u);
assert.match(banner, /max-width: 640px/u);
assert.match(verify, /Reese 新分頁驗證中心/u);
assert.match(verifyScript, /myntPreviewManualChecks/u);
assert.equal(meta.version, sourceManifest.version, "Preview metadata version does not match manifest");
assert.equal(typeof meta.commit, "string");
assert.equal(typeof meta.branch, "string");

// Everyday visitors do not see the developer badge unless the page finds a problem or ?preview is used.
assert.match(banner, /setBadgeVisible\(badge, forceBadge\(\)\)/u, "Preview badge must start hidden unless forced");
assert.match(banner, /status !== "ok"\) setBadgeVisible\(badge, true\)/u, "Preview badge must reappear on warnings and errors");
assert.match(read("preview/preview.css"), /#mynt-web-preview-badge\[hidden\]\s*\{\s*display:\s*none;/u, "Hidden preview badge must not render");

// Installable web app: manifest, icons and the one-time install card.
const headEnd = index.indexOf("</head>");
const charsetAt = index.indexOf('<meta charset="UTF-8">');
const markerAt = index.indexOf("MYNT_WEB_PREVIEW");
assert.ok(charsetAt !== -1 && charsetAt < markerAt && markerAt < headEnd, "Web app tags must follow the charset declaration inside <head>");
for (const tag of [
    '<link rel="manifest" href="manifest.webmanifest">',
    '<link rel="apple-touch-icon" href="preview/icons/apple-touch-icon.png">',
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-title" content="新分頁">',
]) {
    const at = index.indexOf(tag);
    assert.ok(at !== -1 && at < headEnd, `Missing web app tag in <head>: ${tag}`);
}
assert.match(index, /<script src="preview\/install-prompt\.js\?v=[^"]+"><\/script>/u);

const webManifest = JSON.parse(read("manifest.webmanifest"));
assert.equal(webManifest.start_url, "./", "Web app must start at the site root");
assert.equal(webManifest.scope, "./", "Web app scope must cover the site");
assert.equal(webManifest.display, "standalone");
assert.ok(webManifest.name && webManifest.short_name, "Web app needs a name and short name");
function pngSize(relativePath) {
    const bytes = readFileSync(resolve(output, relativePath));
    assert.equal(bytes.toString("latin1", 1, 4), "PNG", `${relativePath} is not a PNG`);
    return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}
const iconPurposes = new Set();
for (const icon of webManifest.icons) {
    assert.ok(existsSync(resolve(output, icon.src)), `Web app icon missing: ${icon.src}`);
    assert.equal(pngSize(icon.src), icon.sizes, `Web app icon size mismatch: ${icon.src}`);
    iconPurposes.add(`${icon.purpose}:${icon.sizes}`);
}
for (const needed of ["any:192x192", "any:512x512", "maskable:512x512"]) {
    assert.ok(iconPurposes.has(needed), `Web app manifest lacks a ${needed} icon`);
}
assert.equal(pngSize("preview/icons/apple-touch-icon.png"), "180x180", "Apple touch icon must be 180x180");

const installPrompt = read("preview/install-prompt.js");
assert.match(installPrompt, /beforeinstallprompt/u, "Chromium install prompt must be offered");
assert.match(installPrompt, /加入主畫面/u, "iOS steps need Traditional Chinese text");
assert.match(installPrompt, /Add to Home Screen/u, "iOS steps need English fallback text");
assert.match(installPrompt, /event\.key !== "Escape"/u, "Install card must close with Escape");
assert.match(installPrompt, /myntWebInstallHintDismissed/u, "Install card dismissal must be remembered");
assert.doesNotMatch(installPrompt, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket/u, "Install card must not send data anywhere");
const previewCss = read("preview/preview.css");
assert.match(previewCss, /prefers-reduced-motion: reduce\)\s*\{\s*#mynt-install-card\s*\{\s*animation: none;/u, "Install card must honour reduced motion");
assert.match(previewCss, /html\.myntReducedMotion #mynt-install-card\s*\{\s*animation: none;/u, "Install card must honour the in-app reduced motion setting");
assert.match(previewCss, /html\.myntHighContrast #mynt-install-card\s*\{/u, "Install card needs a high-contrast style");

const htmlFiles = ["index.html", "verify.html"];
for (const htmlFile of htmlFiles) {
    const html = read(htmlFile);
    const baseDirectory = dirname(resolve(output, htmlFile));
    const references = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/giu)].map((match) => match[1]);
    for (const reference of references) {
        if (/^(?:[a-z]+:|#|\/\/)/iu.test(reference)) continue;
        const cleanReference = reference.split(/[?#]/u)[0];
        if (!cleanReference) continue;
        const target = resolve(baseDirectory, cleanReference);
        assert.ok(existsSync(target), `${htmlFile}: missing referenced path ${reference}`);
    }
}

function walk(directory) {
    return readdirSync(directory).flatMap((entry) => {
        const fullPath = resolve(directory, entry);
        return statSync(fullPath).isDirectory() ? walk(fullPath) : [fullPath];
    });
}

const executableTextFiles = walk(output).filter((path) => [".html", ".js"].includes(extname(path)));
for (const path of executableTextFiles) {
    const content = readFileSync(path, "utf8");
    assert.doesNotMatch(content, /\beval\s*\(|new\s+Function\s*\(/u, `Dynamic code execution found: ${path}`);
}

console.log(`WEB_PREVIEW_OK version=${meta.version} files=${walk(output).length}`);

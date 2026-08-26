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
    "preview/verify.js",
    "preview/meta.json",
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
assert.match(verifyScript, /myntPreviewManualChecks/u);
assert.equal(meta.version, sourceManifest.version, "Preview metadata version does not match manifest");
assert.equal(typeof meta.commit, "string");
assert.equal(typeof meta.branch, "string");

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

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(root, "dist/web-preview");
const sourcePreview = resolve(root, "web-preview");
const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));

const runtimePaths = [
    "favicon",
    "fonts",
    "images",
    "locales",
    "scripts",
    "svgs",
    "videos",
    "docs",
    "index.html",
    "style.css",
    "privacy-policy.html",
    "LICENSE",
];

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

for (const relativePath of runtimePaths) {
    const source = resolve(root, relativePath);
    if (!existsSync(source)) throw new Error(`Preview source is missing: ${relativePath}`);
    cpSync(source, resolve(output, relativePath), { recursive: true });
}

// The website never executes the extension background service worker.
rmSync(resolve(output, "scripts/background.js"), { force: true });

mkdirSync(resolve(output, "preview"), { recursive: true });
for (const fileName of ["preview.css", "preview-banner.js", "verify.js"]) {
    cpSync(resolve(sourcePreview, fileName), resolve(output, "preview", fileName));
}
cpSync(resolve(sourcePreview, "verify.html"), resolve(output, "verify.html"));

const indexPath = resolve(output, "index.html");
let index = readFileSync(indexPath, "utf8");
const injectionMarker = "<!-- MYNT_WEB_PREVIEW -->";
if (index.includes(injectionMarker)) throw new Error("Web preview assets were already injected into index.html");
if (!index.includes("<head>")) throw new Error("index.html does not contain a <head> element");

index = index.replace(
    "<head>",
    `<head>\n    ${injectionMarker}\n    <meta name="robots" content="noindex,nofollow">\n    <link rel="stylesheet" href="preview/preview.css">\n    <script src="preview/preview-banner.js"></script>`,
);
writeFileSync(indexPath, index);

const repository = process.env.GITHUB_REPOSITORY || "Reese-max/MaterialYouNewTab";
const commit = process.env.GITHUB_SHA || "local";
const branch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || "local";
const runId = process.env.GITHUB_RUN_ID || "";
const runNumber = process.env.GITHUB_RUN_NUMBER || "";
const serverUrl = process.env.GITHUB_SERVER_URL || "https://github.com";

const meta = {
    product: manifest.name,
    version: manifest.version,
    branch,
    commit,
    builtAt: new Date().toISOString(),
    repository,
    repositoryUrl: `${serverUrl}/${repository}`,
    commitUrl: commit === "local" ? "" : `${serverUrl}/${repository}/commit/${commit}`,
    runId,
    runNumber,
    runUrl: runId ? `${serverUrl}/${repository}/actions/runs/${runId}` : "",
    previewLimitations: [
        "browser extension permissions",
        "new tab override",
        "background service worker lifecycle",
        "incognito behavior",
    ],
};

writeFileSync(resolve(output, "preview/meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
writeFileSync(resolve(output, ".nojekyll"), "");
console.log(`WEB_PREVIEW_BUILT version=${manifest.version} branch=${branch} commit=${commit}`);

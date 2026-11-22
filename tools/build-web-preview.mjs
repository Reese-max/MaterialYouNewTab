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
    "styles",
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
for (const fileName of ["preview.css", "preview-banner.js", "install-prompt.js", "verify.js"]) {
    cpSync(resolve(sourcePreview, fileName), resolve(output, "preview", fileName));
}
cpSync(resolve(sourcePreview, "icons"), resolve(output, "preview/icons"), { recursive: true });
cpSync(resolve(sourcePreview, "verify.html"), resolve(output, "verify.html"));
// The web app manifest sits at the site root so its start_url and scope cover the whole page.
cpSync(resolve(sourcePreview, "manifest.webmanifest"), resolve(output, "manifest.webmanifest"));

const indexPath = resolve(output, "index.html");
let index = readFileSync(indexPath, "utf8");
const injectionMarker = "<!-- MYNT_WEB_PREVIEW -->";
if (index.includes(injectionMarker)) throw new Error("Web preview assets were already injected into index.html");
if (!index.includes("<head>")) throw new Error("index.html does not contain a <head> element");

// Inject after the charset declaration so the Chinese app title is decoded correctly.
const charsetTag = '<meta charset="UTF-8">';
const injectionAnchor = index.includes(charsetTag) ? charsetTag : "<head>";
index = index.replace(
    injectionAnchor,
    [
        injectionAnchor,
        `    ${injectionMarker}`,
        '    <meta name="robots" content="noindex,nofollow">',
        // Installable web app: Chromium reads the manifest; iOS and iPadOS read the apple-* tags.
        '    <link rel="manifest" href="manifest.webmanifest">',
        '    <meta name="theme-color" content="#95c0ff">',
        '    <meta name="mobile-web-app-capable" content="yes">',
        '    <meta name="apple-mobile-web-app-capable" content="yes">',
        '    <meta name="apple-mobile-web-app-title" content="新分頁">',
        '    <meta name="apple-mobile-web-app-status-bar-style" content="default">',
        '    <link rel="apple-touch-icon" href="preview/icons/apple-touch-icon.png">',
        `    <link rel="stylesheet" href="preview/preview.css?v=${manifest.version}">`,
        `    <script src="preview/preview-banner.js?v=${manifest.version}"></script>`,
        `    <script src="preview/install-prompt.js?v=${manifest.version}"></script>`,
    ].join("\n"),
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

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = path => readFileSync(resolve(root, path), "utf8");

const chromeManifest = JSON.parse(read("manifest.json"));
const firefoxManifest = JSON.parse(read("manifest(firefox).json"));
const readme = read("README.md");

const repo = "Reese-max/MaterialYouNewTab";
const productName = "MYNT: Material You New Tab";

assert.equal(
    chromeManifest.version,
    firefoxManifest.version,
    "Chrome and Firefox manifest versions must match"
);

assert.equal(chromeManifest.name, productName, "Unexpected Chrome product name");
assert.equal(firefoxManifest.name, productName, "Unexpected Firefox product name");
assert.equal(
    chromeManifest.description,
    firefoxManifest.description,
    "Chrome and Firefox descriptions must match"
);

assert.match(
    readme,
    new RegExp(`version-${chromeManifest.version.replaceAll(".", "\\.")}`),
    "README version badge must match manifest version"
);
assert.match(
    readme,
    new RegExp(`\\| \\`${chromeManifest.version.replaceAll(".", "\\.")}\\` \\|`),
    "README version table must include the manifest version"
);

assert.match(
    readme,
    new RegExp(`git clone https://github\\.com/${repo.replace("/", "\\/")}\\.git`),
    "README clone command must point to the Reese-max fork"
);
assert.match(
    readme,
    new RegExp(`https://github\\.com/${repo.replace("/", "\\/")}\\/archive\\/refs\\/heads\\/main\\.zip`),
    "README ZIP download must point to the Reese-max fork"
);

assert.doesNotMatch(
    readme,
    /git clone https:\/\/github\.com\/prem-k-r\/MaterialYouNewTab\.git/,
    "README must not tell custom-edition users to clone upstream"
);
assert.doesNotMatch(
    readme,
    /prem-k-r\.github\.io\/MaterialYouNewTab[^\n]*Test live/i,
    "README must not present the upstream Pages site as this fork's live demo"
);

assert.match(
    readme,
    /customized fork of \[prem-k-r\/MaterialYouNewTab\]/,
    "README must preserve clear upstream attribution"
);
assert.match(
    readme,
    /Upstream Chrome Web Store build/,
    "README must clearly label the Chrome Web Store listing as upstream"
);
assert.match(
    readme,
    /Upstream Mozilla Add-ons build/,
    "README must clearly label the Mozilla listing as upstream"
);
assert.match(
    readme,
    /GNU General Public License v3\.0 \(GPL-3\.0\)/,
    "README must retain GPL-3.0 licensing disclosure"
);

console.log(
    `RELEASE_METADATA_OK version=${chromeManifest.version} name=${JSON.stringify(productName)} repo=${repo}`
);

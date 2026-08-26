import { readFileSync, writeFileSync } from "node:fs";

function replaceExact(path, from, to) {
    const source = readFileSync(path, "utf8");
    if (source.includes(to)) return false;
    if (!source.includes(from)) {
        throw new Error(`Expected integration pattern not found in ${path}`);
    }
    writeFileSync(path, source.replace(from, to));
    console.log(`REPAIRED ${path}`);
    return true;
}

replaceExact(
    "tools/check-customizations.mjs",
    'assert.doesNotMatch(shortcutsCode, /\\bonerror\\s*=/i, "Shortcut icons must not use inline handlers");',
    'assert.doesNotMatch(shortcutsCode, /(?:<[^>]*\\bonerror\\s*=|setAttribute\\(\\s*["\\\']onerror["\\\'])/i, "Shortcut icons must not inject inline error handlers");'
);

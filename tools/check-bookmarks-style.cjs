const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const source = read('scripts/bookmarks.js');
const sheets = [...html.matchAll(/<link\b[^>]*>/giu)]
    .filter(([tag]) => /\brel\s*=\s*["']stylesheet["']/iu.test(tag))
    .map(([tag]) => /\bhref\s*=\s*["']([^"']+)["']/iu.exec(tag)?.[1]);
const errors = [];
const panel = sheets.indexOf('styles/bookmarks-panel.css');
const centered = sheets.indexOf('styles/centered-home.css');
if (centered < 0 || panel < 0 || panel <= centered || panel !== sheets.length - 1) {
    errors.push('bookmarks-panel.css must be the last stylesheet, after centered-home.css');
}
const classes = new Set();
for (const [, value] of source.matchAll(/\.className\s*=\s*([^;]+);/gu)) {
    const literal = /^(["'])(.*?)\1$/u.exec(value.trim());
    if (literal) literal[2].split(/\s+/u).filter(Boolean).forEach(name => classes.add(name));
    else {
        // createActionButton assigns its className parameter; include every call-site class.
        assert.equal(value.trim(), 'className', 'Resolve new dynamic className assignments in this check');
        const calls = [...source.matchAll(/createActionButton\(\s*bookmarkText\([\s\S]*?\),\s*["']([^"']+)["']/gu)];
        assert.equal(calls.length, [...source.matchAll(/\bcreateActionButton\(/gu)].length - 1, 'Every action class must be checked');
        calls.forEach(([, name]) => classes.add(name));
    }
}
assert.ok(classes.size > 0, 'No bookmark classes found');
const selectors = sheets.map(file => read(file).replace(/\/\*[\s\S]*?\*\//gu, ''))
    .flatMap(css => [...css.matchAll(/([^{}]+)\{/gu)].map(([, selector]) => selector)).join('\n');
const styled = new Set([...selectors.matchAll(/\.([\w-]+)/gu)].map(([, name]) => name));
for (const name of classes) if (!styled.has(name)) errors.push(`Missing linked CSS selector: .${name}`);
assert.deepEqual(errors, [], errors.join('\n'));
console.log(`BOOKMARKS_STYLE_CHECK_OK (${classes.size} rendered classes, ${sheets.length} linked stylesheets)`);

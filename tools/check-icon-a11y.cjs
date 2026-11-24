'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const en = fs.readFileSync(path.join(root, 'locales/en.js'), 'utf8');
const zh = fs.readFileSync(path.join(root, 'locales/zh_TW.js'), 'utf8');
for (const match of html.matchAll(/<svg\b[^>]*>/giu)) {
    // SVGs with <text> (the digital clock) carry content and must stay readable.
    const body = html.slice(match.index, html.indexOf('</svg>', match.index));
    if (/<text\b/iu.test(body)) { assert(!/\baria-hidden="true"/iu.test(match[0]), `Text SVG hidden from assistive tech: ${match[0]}`); continue; }
    assert(/\baria-hidden="true"/iu.test(match[0]) || (/\brole="img"/iu.test(match[0]) && /\baria-label=/iu.test(match[0])), `SVG missing accessible treatment: ${match[0]}`);
}
for (const match of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/giu)) {
    const content = match[2].trim();
    if (/^<svg\b[\s\S]*<\/svg>$/iu.test(content)) assert(/\b(?:aria-label|aria-labelledby|title)=/iu.test(match[1]), `SVG-only button lacks a name: ${match[1]}`);
}
for (const [id, key] of [['micIcon', 'voiceSearchLabel'], ['toastClose', 'toastCloseLabel'], ['shortcutEditButton', 'shortcutEditLabel'], ['aiToolsEditButton', 'aiToolsEditLabel']]) {
    assert.match(html, new RegExp(`<button\\b[^>]*\\bid="${id}"[^>]*\\baria-label=`, 'u'), `${id} needs a static English label`);
    for (const locale of [en, zh]) assert(locale.includes(`"${key}"`), `${id} missing ${key}`);
}
console.log('ICON_A11Y_OK');

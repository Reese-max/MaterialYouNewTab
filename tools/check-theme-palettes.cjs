'use strict';
// Every preset swatch must ship a complete token set, a swatch colour, an accessible name, a local-mcp enum
// entry, and the contrast pairs the light theme relies on (see --mynt-accent-ink in style.css).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html'), css = read('style.css');
const presets = [...html.matchAll(/<input\b[^>]*>/g)].map(m => m[0])
    .filter(tag => /\bclass="colorPlate"/.test(tag) && /\bname="color"/.test(tag) && /\btype="radio"/.test(tag))
    .map(tag => /\bvalue="([a-z]+)"/.exec(tag)[1]);

for (const added of ['indigo', 'teal', 'lime', 'amber', 'wine', 'magenta', 'slate']) assert(presets.includes(added), `Preset ${added} is offered`);
assert.equal(new Set(presets).size, presets.length, 'Preset values are unique');
assert.equal(presets.at(-1), 'dark', 'Black theme stays the last preset, next to the custom picker');

const token = (name, color) => {
    const match = new RegExp(`--${name}-${color}:\\s*(#[0-9a-f]{6})\\s*;`, 'i').exec(css);
    assert(match, `style.css defines --${name}-${color}`);
    return match[1].toLowerCase();
};
const luminance = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const mixBlack = (hex, keep) => '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * keep).toString(16).padStart(2, '0')).join('');

const locales = { en: read('locales/en.js'), zh_TW: read('locales/zh_TW.js') };
const mcpRuntime = /const PALETTES=\[([^\]]+)\]/.exec(read('scripts/local-mcp-preferences.js'))[1].split(',').map(v => v.replace(/'/g, ''));
const mcpTool = JSON.parse(read('local-mcp/preferences-tools.json')).find(tool => tool.name === 'mynt_theme_update').inputSchema.properties.palette.enum;
assert.deepEqual([...mcpRuntime].sort(), [...presets].sort(), 'local-mcp runtime palettes match the swatches');
assert.deepEqual([...mcpTool].sort(), [...presets].sort(), 'Published local-mcp palette enum matches the swatches');

for (const color of presets) {
    assert(new RegExp(`\\.colorsContainer input\\[value="${color}"\\]\\s*\\{`).test(css), `Swatch colour for ${color}`);
    const key = 'themeColor' + color[0].toUpperCase() + color.slice(1);
    for (const [lang, source] of Object.entries(locales)) assert(source.includes(`"${key}":`), `${lang} names the ${color} swatch`);
    const t = Object.fromEntries(['bg-color', 'accentLightTint', 'darkerColor', 'darkColor', 'textColorDark', 'whitishColor'].map(n => [n, token(n, color)]));
    if (color === 'dark') continue;
    const ink = mixBlack(t.darkerColor, 0.7);
    const action = Math.max(...[t.textColorDark, '#ffffff', '#000000'].map(fg => ratio(t.darkerColor, fg)));
    for (const [label, value] of [['text on background', ratio(t.textColorDark, t['bg-color'])], ['text on tint', ratio(t.textColorDark, t.accentLightTint)],
        ['accent ink on tint', ratio(ink, t.accentLightTint)], ['white on accent ink', ratio(ink, '#ffffff')], ['action label', action]]) {
        assert(value >= 4.5, `${color}: ${label} ${value.toFixed(2)}:1`);
    }
}
console.log(`THEME_PALETTES_OK presets=${presets.length}`);

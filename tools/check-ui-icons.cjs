// UI icons come from one line-icon set (styles/ui-icons.css), never from emoji or text glyphs.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..'), read = file => fs.readFileSync(path.join(root, file), 'utf8');
const tracked = execFileSync('git', ['ls-files', 'scripts', 'styles', 'index.html', 'style.css', 'locales/en.js', 'locales/zh_TW.js'], { cwd: root, encoding: 'utf8' })
    .split('\n').filter(file => /\.(js|css|html)$/.test(file) && file !== 'styles/award.css');
const files = [...new Set([...tracked, 'styles/ui-icons.css'])].filter(file => fs.existsSync(path.join(root, file)));
// Pictographic emoji, dingbats, arrows, braille, geometric shapes, ellipses and music/pencil/check marks used as icons.
const glyph = /[\u{1F300}-\u{1FAFF}☀-⛿✀-➿⠀-⣿←-⇿■-◿⋮⋯⬀-⯿]|\\28[0-9a-f]{2}/giu;
// Prose, not icons: a path arrow in sentences, and locale text naming a browser menu by its shape.
const allowed = (file, char, line) => char === '→'
    || (file.startsWith('locales/') && (char === '⋯' || char === '⋮'))
    // The emoji shortcut icon is a user-chosen feature; this is only its starting value.
    || (file === 'scripts/quicklink-icons.js' && /quicklinkEmoji/.test(line));
const strip = text => text.replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, ' ')).replace(/<!--[\s\S]*?-->/g, match => match.replace(/[^\n]/g, ' '));
const found = [];
for (const file of files) {
    strip(read(file)).split('\n').forEach((line, index) => {
        const code = line.replace(/(^|\s)\/\/.*$/, '');
        for (const [char] of code.matchAll(glyph)) if (!allowed(file, char, code)) found.push(`${file}:${index + 1} ${char}`);
    });
}
assert.deepEqual(found, [], 'Emoji or text glyphs used as UI icons; use a .mynt-icon from styles/ui-icons.css instead');

// Every icon name used in markup or scripts has a definition, and the stylesheet is loaded.
const icons = read('styles/ui-icons.css'), html = read('index.html');
assert.match(html, /<link href="styles\/ui-icons\.css" rel="stylesheet">/);
const used = new Set();
for (const file of files.filter(file => /\.(js|html)$/.test(file))) {
    for (const [, name] of read(file).matchAll(/dataset\.icon\s*=\s*["'`]([a-z-]+)["'`]/g)) used.add(name);
    for (const [, name] of read(file).matchAll(/data-icon="([a-z-]+)"/g)) used.add(name);
}
// Names built at runtime: AI tool arrows (`arrow-${direction}`) and the layout toolbar minimise toggle.
['arrow-up', 'arrow-down', 'expand', 'minimize'].forEach(name => used.add(name));
for (const name of used) {
    assert.ok(icons.includes(`--mynt-icon-${name}: url("data:image/svg+xml,`), `Icon ${name} has an SVG`);
    assert.ok(icons.includes(`.mynt-icon[data-icon="${name}"] { --mynt-icon: var(--mynt-icon-${name}); }`), `Icon ${name} has a class`);
}
// CSS-drawn icons reference defined masks.
for (const file of files.filter(file => file.endsWith('.css'))) for (const [, name] of strip(read(file)).matchAll(/var\(--mynt-icon-([a-z-]+)\)/g))
    assert.ok(icons.includes(`--mynt-icon-${name}:`), `${file} uses an undefined icon ${name}`);
assert.ok(/@media \(forced-colors: active\) \{\s*\.mynt-icon \{ background-color: CanvasText; forced-color-adjust: none; \}/.test(icons), 'Icons survive forced colours');
console.log(`UI_ICONS_OK: ${files.length} UI files free of emoji/glyph icons; ${used.size} icon names defined in styles/ui-icons.css`);

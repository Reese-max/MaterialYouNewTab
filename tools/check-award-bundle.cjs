'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
    const { awardFiles } = await import('./build-award-css.mjs');
    const root = path.join(__dirname, '..');
    assert.equal(awardFiles.length, 21);
    assert.equal(new Set(awardFiles).size, awardFiles.length);
    let expected = '';
    for (const file of awardFiles) {
        const sourcePath = path.join(root, 'styles', file);
        assert(fs.existsSync(sourcePath), `Missing award stylesheet: ${file}`);
        const source = fs.readFileSync(sourcePath, 'utf8').replace(/\r\n?/g, '\n');
        expected += `/* ==== ${file} ==== */\n${source}${source.endsWith('\n') ? '' : '\n'}`;
    }
    const actual = fs.readFileSync(path.join(root, 'styles/award.css'));
    assert(actual.equals(Buffer.from(expected)), 'Rebuild styles/award.css with node tools/build-award-css.mjs');
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const links = [...html.matchAll(/<link\b[^>]*\bhref\s*=\s*["'](?:\.\/)?styles\/award[^"']*["'][^>]*>/gi)].map(match => match[0]);
    assert.deepEqual(links, ['<link href="styles/award.css" rel="stylesheet">']);
    console.log('AWARD_BUNDLE_OK');
}

main().catch(error => { console.error(error); process.exitCode = 1; });

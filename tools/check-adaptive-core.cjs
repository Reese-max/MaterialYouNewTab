'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../scripts/adaptive-core.js');
let count = 0;
function test(name, callback) {
    callback();
    count++;
    console.log(`✓ ${name}`);
}
function fixture(width, height, painter) {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(painter(x, y), (y * width + x) * 4);
    return { data, width, height };
}
const solid = rgba => fixture(64, 48, () => rgba);
function rgb(hex) { return [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16)); }
function luma(hex) {
    const components = rgb(hex).map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return components[0] * 0.2126 + components[1] * 0.7152 + components[2] * 0.0722;
}
function contrast(first, second) { const a = luma(first), b = luma(second); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }
function checkTheme(theme) {
    assert.equal(typeof theme.valid, 'boolean');
    assert.ok(['light', 'dark'].includes(theme.mode));
    for (const key of ['accent', 'accentText', 'surface', 'text', 'dominant']) assert.match(theme[key], /^#[0-9A-F]{6}$/);
    for (const key of ['opacity', 'luminance', 'texture', 'colorfulness']) assert.ok(Number.isFinite(theme[key]) && theme[key] >= 0 && theme[key] <= 1, key);
    for (const [key, first, second] of [['surfaceText', 'surface', 'text'], ['accentText', 'accent', 'accentText'], ['accentSurface', 'accent', 'surface']]) {
        const actual = contrast(theme[first], theme[second]);
        assert.ok(actual >= 4.5, `${key}: ${actual}`);
        assert.ok(Math.abs(actual - theme.contrast[key]) < 1e-10);
    }
    assert.ok(theme.palette.length >= 2 && theme.palette.length <= 6);
    assert.equal(new Set(theme.palette).size, theme.palette.length);
}
test('CommonJS and browser global expose the same pure API', () => {
    assert.equal(globalThis.MyntAdaptiveCore, core);
    const context = {};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../scripts/adaptive-core.js'), 'utf8'), context);
    assert.equal(typeof context.MyntAdaptiveCore.analyze, 'function');
    assert.deepEqual(Object.keys(core), ['analyze']);
    assert.deepEqual(Object.keys(context.MyntAdaptiveCore), ['analyze']);
    assert.equal('bestPlacement' in core, false);
    assert.equal('bestPlacement' in context.MyntAdaptiveCore, false);
    assert.ok(Object.isFrozen(core));
});

test('light fixture yields a readable light surface', () => {
    const result = core.analyze(solid([245, 245, 245, 255]));
    checkTheme(result);
    assert.equal(result.valid, true);
    assert.equal(result.mode, 'light');
    assert.ok(result.luminance > 0.9);
    assert.ok(result.texture < 0.001);
});

test('dark fixture yields a readable dark surface', () => {
    const result = core.analyze(solid([12, 18, 27, 255]));
    checkTheme(result);
    assert.equal(result.mode, 'dark');
    assert.ok(result.luminance < 0.01);
});

test('colorful fixture extracts the strongest chromatic family', () => {
    const result = core.analyze(fixture(120, 80, x => x < 90 ? [20, 120, 220, 255] : [220, 80, 30, 255]));
    checkTheme(result);
    const dominant = rgb(result.dominant);
    assert.ok(dominant[2] > dominant[0] + 100 && dominant[2] > dominant[1]);
    assert.ok(result.colorfulness > 0.5);
});

test('a gray majority does not wash out a representative colorful accent', () => {
    const result = core.analyze(fixture(120, 80, x => x < 108 ? [170, 170, 170, 255] : [220, 35, 80, 255]));
    checkTheme(result);
    const dominant = rgb(result.dominant);
    assert.ok(dominant[0] > dominant[1] + 100 && dominant[0] > dominant[2] + 100);
});

test('gray-only wallpaper gets a deterministic non-gray fallback accent', () => {
    const result = core.analyze(solid([150, 150, 150, 255]));
    checkTheme(result);
    assert.ok(Math.max(...rgb(result.accent)) - Math.min(...rgb(result.accent)) > 20);
});

test('light, dark, extreme and midtone colors all meet independent 4.5:1 checks', () => {
    for (const rgba of [[0, 0, 0, 255], [255, 255, 255, 255], [255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255], [255, 255, 0, 255], [255, 0, 255, 255], [0, 255, 255, 255], [127, 127, 127, 255], [250, 230, 240, 255]]) checkTheme(core.analyze(solid(rgba)));
});

test('busy wallpaper raises texture and recommended opacity', () => {
    const quiet = core.analyze(solid([128, 128, 128, 255]));
    const busy = core.analyze(fixture(96, 72, (x, y) => (x + y) % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255]));
    checkTheme(quiet);
    checkTheme(busy);
    assert.ok(busy.texture > quiet.texture + 0.4);
    assert.ok(busy.opacity > quiet.opacity);
    assert.ok(busy.opacity <= 0.97 && quiet.opacity >= 0.86);
});

test('recommended opacity retains readable colors over opposite wallpaper extremes', () => {
    for (const rgba of [[240, 240, 240, 255], [0, 0, 0, 255], [200, 20, 120, 255], [0, 150, 255, 255]]) {
        const result = core.analyze(solid(rgba));
        const opposite = result.mode === 'light' ? 0 : 255;
        const effectiveSurface = '#' + rgb(result.surface).map(value => Math.round(value * result.opacity + opposite * (1 - result.opacity)).toString(16).padStart(2, '0')).join('');
        assert.ok(contrast(effectiveSurface, result.text) >= 4.5);
        assert.ok(contrast(effectiveSurface, result.accent) >= 4.5);
    }
});

test('a sub-one-percent colored artifact does not replace the neutral fallback', () => {
    const result = core.analyze(fixture(96, 72, (x, y) => x === 48 && y === 36 ? [255, 0, 0, 255] : [150, 150, 150, 255]));
    checkTheme(result);
    const dominant = rgb(result.dominant);
    assert.ok(Math.max(...dominant) - Math.min(...dominant) <= 1);
});

test('transparent hidden RGB does not contaminate palette', () => {
    const result = core.analyze(fixture(120, 80, x => x < 100 ? [255, 0, 0, 0] : [10, 130, 235, 255]));
    checkTheme(result);
    assert.ok(rgb(result.dominant)[2] > 200);
    assert.equal(result.valid, true);
});

test('fully transparent pixels return an invalid safe theme', () => {
    const transparent = solid([255, 0, 0, 0]);
    const result = core.analyze(transparent);
    checkTheme(result);
    assert.equal(result.valid, false);
});

test('raw typed arrays, ordinary arrays and ArrayBuffer have equal results', () => {
    const image = solid([40, 125, 220, 255]);
    const expected = core.analyze(image);
    assert.deepEqual(core.analyze(image.data, image.width, image.height), expected);
    assert.deepEqual(core.analyze(Array.from(image.data), image.width, image.height), expected);
    assert.deepEqual(core.analyze(image.data.buffer, image.width, image.height), expected);
});

test('malformed image inputs return finite, contrast-safe defaults', () => {
    const inputs = [[null, 3, 4], [undefined], [{}, 3, 4], [[], 3, 4], [new Uint8Array(4), 2, 2], [new Uint8Array(4), 0, 1], [new Uint8Array(4), -1, 1], [new Uint8Array(4), Infinity, 1], [new Uint8Array(4), 1.5, 1], [new Uint8Array(4), '1', 1], [{ data: 'aaaa', width: 1, height: 1 }], [new DataView(new ArrayBuffer(4)), 1, 1], [new Uint8Array(4), 2 ** 32, 2 ** 32]];
    for (const args of inputs) {
        const result = core.analyze(...args);
        checkTheme(result);
        assert.equal(result.valid, false);
    }
});

test('non-finite and out-of-range channel values remain bounded', () => {
    for (const data of [[NaN, Infinity, -50, 255], [1000, -1000, 20, 1000], [NaN, NaN, NaN, NaN]]) checkTheme(core.analyze(data, 1, 1));
});

test('single-pixel input works without edge out-of-bounds errors', () => {
    const image = fixture(1, 1, () => [0, 130, 210, 255]);
    checkTheme(core.analyze(image));
});

test('analysis does not mutate supplied pixels', () => {
    const image = solid([40, 80, 180, 255]);
    const data = image.data.slice();
    core.analyze(image);
    assert.deepEqual(image.data, data);
});

test('seeded varied fixtures maintain finite outputs and contrast', () => {
    let seed = 4321;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed >>> 24; };
    for (let run = 0; run < 20; run++) {
        const image = fixture(15 + run, 12 + run, () => [random(), random(), random(), random()]);
        checkTheme(core.analyze(image));
    }
});

console.log(`\n${count} adaptive-core checks passed.`);

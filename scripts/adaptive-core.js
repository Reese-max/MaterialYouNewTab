/*
 * MYNT offline wallpaper heuristics. No DOM, network, storage, or semantic model.
 *
 * analyze(rgba, width, height) accepts a packed RGBA array/ArrayBuffer or an
 * ImageData-like { data, width, height }. Dimensions may be omitted for the latter.
 * Palette colors are opaque sRGB hex strings. contrast describes the nominal
 * opaque color pairs. Accent selection also guards against the worst wallpaper
 * showing through at the recommended opacity. Keep foreground text/accent opaque.
 */
(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.MyntAdaptiveCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const FALLBACK_ACCENT = [103, 80, 164];
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const finite = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    const byte = value => Math.round(clamp(finite(value, 0), 0, 255));
    const mix = (a, b, fraction) => a.map((value, i) => value * (1 - fraction) + b[i] * fraction);
    const hex = rgb => '#' + rgb.map(value => byte(value).toString(16).padStart(2, '0')).join('').toUpperCase();
    const linear = value => value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    const luminance = rgb => 0.2126 * linear(byte(rgb[0]) / 255) + 0.7152 * linear(byte(rgb[1]) / 255) + 0.0722 * linear(byte(rgb[2]) / 255);
    const contrast = (a, b) => {
        const first = luminance(a), second = luminance(b);
        return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    };
    const readableText = color => contrast(color, [0, 0, 0]) >= contrast(color, [255, 255, 255]) ? [0, 0, 0] : [255, 255, 255];

    function source(input, width, height) {
        let data = input;
        if (input && typeof input === 'object' && 'data' in input) {
            data = input.data;
            if (width === undefined) width = input.width;
            if (height === undefined) height = input.height;
        }
        if (typeof ArrayBuffer !== 'undefined' && data instanceof ArrayBuffer) data = new Uint8Array(data);
        if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width > 65536 || height > 65536) return null;
        const required = width * height * 4;
        if (!data || !Number.isSafeInteger(required) || typeof data.length !== 'number' || data.length < required) return null;
        // DataView, strings, and arbitrary array-like objects are not RGBA buffers.
        if (!Array.isArray(data) && !(typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(data) && typeof data.BYTES_PER_ELEMENT === 'number')) return null;
        return { data, width, height };
    }

    function pixel(image, x, y) {
        const offset = (clamp(Math.floor(y), 0, image.height - 1) * image.width + clamp(Math.floor(x), 0, image.width - 1)) * 4;
        const alpha = byte(image.data[offset + 3]) / 255;
        const rgb = [byte(image.data[offset]), byte(image.data[offset + 1]), byte(image.data[offset + 2])];
        return { rgb, alpha, luma: luminance(rgb) };
    }

    function difference(a, b) {
        // Color transitions count too, including roughly isoluminant red/green.
        const color = (Math.abs(a.rgb[0] - b.rgb[0]) + Math.abs(a.rgb[1] - b.rgb[1]) + Math.abs(a.rgb[2] - b.rgb[2])) / 765;
        return (Math.abs(a.luma - b.luma) * 0.65 + color * 0.35) * Math.min(a.alpha, b.alpha);
    }

    function localEdge(image, x, y, center, stepX, stepY) {
        // Both one-pixel and tile-scale differences avoid downsample aliasing.
        return (
            difference(center, pixel(image, x + 1, y)) +
            difference(center, pixel(image, x, y + 1)) +
            difference(center, pixel(image, x + stepX, y)) +
            difference(center, pixel(image, x, y + stepY))
        ) / 4;
    }

    function hueInfo(rgb) {
        const values = rgb.map(value => value / 255);
        const max = Math.max(...values), min = Math.min(...values), delta = max - min;
        const lightness = (max + min) / 2;
        const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0;
        let hue = 0;
        if (delta) {
            if (max === values[0]) hue = ((values[1] - values[2]) / delta) % 6;
            else if (max === values[1]) hue = (values[2] - values[0]) / delta + 2;
            else hue = (values[0] - values[1]) / delta + 4;
            hue = ((hue * 60) + 360) % 360;
        }
        return { hue, saturation, lightness, chroma: delta };
    }

    function ensureAccentContrast(accent, surface) {
        if (contrast(accent, surface) >= 4.6) return accent.map(byte);
        const target = luminance(surface) > 0.4 ? [0, 0, 0] : [255, 255, 255];
        let low = 0, high = 1;
        for (let iteration = 0; iteration < 22; iteration++) {
            const midpoint = (low + high) / 2;
            if (contrast(mix(accent, target, midpoint), surface) >= 4.6) high = midpoint;
            else low = midpoint;
        }
        return mix(accent, target, high).map(byte);
    }

    function theme(stats) {
        const mode = stats.luminance >= 0.4 ? 'light' : 'dark';
        const base = stats.dominant || FALLBACK_ACCENT;
        const surface = mix(base, mode === 'light' ? [250, 249, 252] : [20, 21, 25], 0.95).map(byte);
        const opacity = clamp(0.86 + stats.texture * 0.09 + (stats.variance || 0) * 0.12, 0.86, 0.97);
        // Guard the accent/surface pair even when the suggested translucent
        // surface overlays the opposite extreme (black or white) wallpaper.
        const worstSurface = mix(surface, mode === 'light' ? [0, 0, 0] : [255, 255, 255], 1 - opacity);
        const accent = ensureAccentContrast(stats.color || FALLBACK_ACCENT, worstSurface);
        const text = readableText(surface), accentText = readableText(accent);
        const palette = [accent, stats.color || FALLBACK_ACCENT, ...(stats.colors || []), surface].map(hex).filter((value, i, values) => values.indexOf(value) === i).slice(0, 6);
        return {
            valid: stats.valid,
            mode,
            accent: hex(accent),
            accentText: hex(accentText),
            surface: hex(surface),
            text: hex(text),
            opacity,
            luminance: clamp(stats.luminance, 0, 1),
            texture: clamp(stats.texture, 0, 1),
            contrast: { surfaceText: contrast(surface, text), accentText: contrast(accent, accentText), accentSurface: contrast(accent, surface) },
            palette,
            dominant: hex(base),
            colorfulness: clamp(stats.colorfulness || 0, 0, 1),
            sampleCount: stats.sampleCount || 0
        };
    }

    function analyze(input, width, height) {
        const image = source(input, width, height);
        const fallback = () => theme({ valid: false, luminance: 0.18, texture: 0, variance: 0, sampleCount: 0 });
        if (!image) return fallback();
        const cols = Math.min(96, image.width), rows = Math.min(72, image.height);
        const bins = Array.from({ length: 24 }, () => ({ weight: 0, rgb: [0, 0, 0] }));
        const sums = [0, 0, 0];
        let weight = 0, lumaSum = 0, lumaSquared = 0, edgeSum = 0, saturationSum = 0, colorfulWeight = 0, samples = 0;
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const x = Math.floor((col + 0.5) * image.width / cols), y = Math.floor((row + 0.5) * image.height / rows);
                const current = pixel(image, x, y), alpha = current.alpha;
                if (alpha < 0.05) continue;
                samples++;
                weight += alpha;
                current.rgb.forEach((value, i) => { sums[i] += value * alpha; });
                lumaSum += current.luma * alpha;
                lumaSquared += current.luma * current.luma * alpha;
                edgeSum += localEdge(image, x, y, current, Math.max(1, image.width / cols * 0.45), Math.max(1, image.height / rows * 0.45));
                const info = hueInfo(current.rgb);
                saturationSum += info.chroma * alpha;
                if (info.saturation >= 0.2 && info.chroma >= 0.08 && info.lightness >= 0.06 && info.lightness <= 0.95) {
                    const colorWeight = alpha * Math.pow(info.saturation, 1.25) * (0.55 + info.chroma * 0.45);
                    const bin = bins[Math.floor(info.hue / 15) % bins.length];
                    bin.weight += colorWeight;
                    current.rgb.forEach((value, i) => { bin.rgb[i] += value * colorWeight; });
                    colorfulWeight += alpha;
                }
            }
        }
        if (!weight) return fallback();
        // Cluster neighboring hue bins so a smooth colored sky is not penalized
        // relative to an unnaturally flat patch of exactly one RGB value.
        const clusters = bins.map((bin, index) => {
            const neighbors = [bins[(index + 23) % 24], bin, bins[(index + 1) % 24]];
            const total = neighbors.reduce((sum, value) => sum + value.weight, 0);
            return { weight: total, rgb: [0, 1, 2].map(i => total ? neighbors.reduce((sum, value) => sum + value.rgb[i], 0) / total : 0) };
        }).sort((a, b) => b.weight - a.weight);
        const colorful = colorfulWeight >= Math.min(weight, Math.max(1, weight * 0.01)) && clusters[0].weight > 0;
        const averageLuma = lumaSum / weight;
        const variance = Math.sqrt(Math.max(0, lumaSquared / weight - averageLuma * averageLuma));
        const colors = [];
        clusters.forEach(cluster => {
            if (cluster.weight && !colors.some(color => Math.abs(hueInfo(color).hue - hueInfo(cluster.rgb).hue) < 25)) colors.push(cluster.rgb);
        });
        return theme({
            valid: true,
            color: colorful ? clusters[0].rgb : FALLBACK_ACCENT,
            dominant: colorful ? clusters[0].rgb : sums.map(value => value / weight),
            colors: colorful ? colors.slice(0, 4) : [],
            luminance: averageLuma,
            variance,
            texture: clamp(edgeSum / weight * 2.8 + variance * 0.3, 0, 1),
            colorfulness: saturationSum / weight,
            sampleCount: samples
        });
    }

    return Object.freeze({ analyze });
}));

export const STATES = Object.freeze(["home", "menu", "todo", "pomodoro", "layout", "dialog"]);
export const THEMES = Object.freeze(["light", "dark"]);

export function parseArgs(argv) {
    const options = {
        out: null,
        states: [...STATES],
        themes: [...THEMES],
        viewports: [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }],
        axe: null,
        wallpaper: "none",
    };
    const seen = new Set();
    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index];
        if (flag === "--only-changed") continue; // 保留相容參數；固定矩陣不略過任何圖。
        if (!["--out", "--states", "--themes", "--viewports", "--axe", "--wallpaper"].includes(flag)) {
            throw new Error(`Unknown argument: ${flag}`);
        }
        if (seen.has(flag)) throw new Error(`Duplicate argument: ${flag}`);
        seen.add(flag);
        const value = argv[++index];
        if (!value?.trim() || value.startsWith("--")) throw new Error(`${flag} requires a value`);
        const key = flag.slice(2);
        if (key === "wallpaper") {
            if (!["none", "default"].includes(value)) throw new Error(`Invalid wallpaper: ${value}; expected none,default`);
            options.wallpaper = value;
            continue;
        }
        if (key === "out" || key === "axe") {
            options[key] = value;
            continue;
        }
        const items = value.split(",").map(item => item.trim());
        if (new Set(items).size !== items.length) throw new Error(`${flag} contains duplicates`);
        if (key === "viewports") {
            options.viewports = items.map(item => {
                const match = /^([1-9]\d*)x([1-9]\d*)$/u.exec(item);
                if (!match) throw new Error(`Invalid viewport: ${item}; expected WIDTHxHEIGHT`);
                const [width, height] = match.slice(1).map(Number);
                if (![width, height].every(Number.isSafeInteger)) throw new Error(`Invalid viewport: ${item}`);
                return { width, height };
            });
        } else {
            const allowed = key === "states" ? STATES : THEMES;
            for (const item of items) {
                if (!allowed.includes(item)) throw new Error(`Invalid ${key}: ${item}; expected ${allowed.join(",")}`);
            }
            options[key] = items;
        }
    }
    if (!options.out) throw new Error("--out <dir> is required");
    return options;
}

export function wallpaperSeed(seed, mode) {
    const result = { ...seed };
    // Missing preferences preserve index.html's video workspace and let the gallery seed itself.
    if (mode === "default") {
        delete result.myntWallpaperCurrent;
        delete result.myntWallpaperMode;
        delete result.myntWallpaperSeeded;
    }
    return result;
}

// Self-contained: serialized into the capture page; also checked without launching a browser.
export async function freezeWallpaper({ time = 1, timeoutMs = 10_000 } = {}) {
    const waitFor = (ready, failure) => new Promise((resolve, reject) => {
        let poll;
        const timer = setTimeout(() => { clearTimeout(poll); reject(new Error("Media timed out")); }, timeoutMs);
        const check = () => {
            const error = failure();
            if (error || ready()) {
                clearTimeout(timer);
                if (error) reject(new Error(error));
                else resolve();
            } else poll = setTimeout(check, 25);
        };
        check();
    });
    const videos = await Promise.all([...document.querySelectorAll("video")].map(async video => {
        const pause = () => video.pause();
        pause();
        video.addEventListener("play", pause);
        const result = { id: video.id, source: video.currentSrc || video.getAttribute("src") || "" };
        try {
            let hydrated = false;
            for (const source of video.querySelectorAll("source[data-src]")) {
                if (!source.getAttribute("src")) { source.src = source.dataset.src; hydrated = true; }
            }
            result.source ||= video.querySelector("source[src]")?.src || "";
            if (!result.source) return { ...result, skipped: true };
            // reduced-motion prevents MYNT's lazy loader from running; load its existing source here.
            video.preload = "auto";
            if (hydrated || video.readyState === 0) video.load();
            const failure = () => video.error ? `Video error ${video.error.code}: ${video.error.message || "decode/load failed"}` : "";
            await waitFor(() => video.readyState >= 1, failure);
            const target = Number.isFinite(video.duration) ? Math.min(time, Math.max(0, video.duration - 0.01)) : time;
            video.currentTime = target;
            await waitFor(() => video.readyState >= 2 && !video.seeking && Math.abs(video.currentTime - target) < 0.01, failure);
            return { ...result, currentTime: video.currentTime, readyState: video.readyState, paused: video.paused };
        } catch (error) {
            return { ...result, error: error.message };
        } finally { pause(); }
    }));
    // Gallery/legacy image wallpapers are applied as CSS backgrounds, not <img> elements.
    const urls = [...getComputedStyle(document.body).backgroundImage.matchAll(/url\(["']?(.*?)["']?\)/gu)].map(match => match[1]);
    const images = await Promise.all(urls.map(async source => {
        const image = new Image();
        image.src = source;
        try {
            await waitFor(() => image.complete && image.naturalWidth > 0,
                () => image.complete && !image.naturalWidth ? "Image failed to load" : "");
            return { source, loaded: true };
        } catch (error) { return { source, error: error.message }; }
    }));
    return { videos, images };
}

export function shotName(state, theme, viewport) {
    return `${state}--${theme}--${viewport.width}x${viewport.height}.png`;
}

function parseColor(value) {
    const match = /^rgba?\(\s*(.*?)\s*\)$/iu.exec(String(value));
    if (!match) throw new Error(`Invalid rgb()/rgba() color: ${value}`);
    const parts = match[1].split(/[\s,/]+/u);
    if (parts.length < 3 || parts.length > 4 || parts.some(part => !/^(?:\d+(?:\.\d*)?|\.\d+)%?$/u.test(part))) {
        throw new Error(`Invalid rgb()/rgba() color: ${value}`);
    }
    const channels = parts.map((part, index) => part.endsWith("%")
        ? Number.parseFloat(part) / 100 * (index === 3 ? 1 : 255)
        : Number(part));
    if (channels.some((channel, index) => channel < 0 || channel > (index === 3 ? 1 : 255))) {
        throw new Error(`Color channel out of range: ${value}`);
    }
    return [...channels.slice(0, 3), channels[3] ?? 1];
}

function composite(foreground, background) {
    return foreground.slice(0, 3).map((channel, index) => channel * foreground[3] + background[index] * (1 - foreground[3]));
}

function luminance(channels) {
    const linear = channels.map(channel => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

export function contrastRatio(fg, bg) {
    // 沒有更底層畫布的純函式介面，以白色合成半透明背景。
    const background = composite(parseColor(bg), [255, 255, 255]);
    const foreground = composite(parseColor(fg), background);
    const first = luminance(foreground);
    const second = luminance(background);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

export function isLargeText(fontSizePx, fontWeight) {
    const size = Number(fontSizePx);
    const weight = fontWeight === "bold" ? 700 : Number(fontWeight);
    return size >= 24 || (size >= 18.66 && weight >= 700);
}

export function summarize(results) {
    const shots = results.map(result => ({
        ...result,
        width: result.width ?? result.viewport?.width,
        height: result.height ?? result.viewport?.height,
        consoleErrors: [...(result.consoleErrors || [])],
        exceptions: [...(result.exceptions || [])],
        metrics: result.metrics ?? null,
        contrastFailures: [...(result.contrastFailures || [])],
        axe: result.axe ?? null,
    }));
    const totals = {
        shots: shots.length,
        successful: shots.filter(shot => shot.success).length,
        failed: shots.filter(shot => !shot.success).length,
        consoleErrors: shots.reduce((sum, shot) => sum + shot.consoleErrors.length, 0),
        exceptions: shots.reduce((sum, shot) => sum + shot.exceptions.length, 0),
        contrastFailures: shots.reduce((sum, shot) => sum + (shot.contrastFailureCount ?? shot.contrastFailures.length), 0),
        axeViolations: shots.reduce((sum, shot) => sum + (shot.axe?.violations?.length || 0), 0),
    };
    return { shots, totals, success: totals.failed === 0 && totals.consoleErrors === 0 && totals.exceptions === 0 };
}

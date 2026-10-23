/*
 * Keeps the bottom quote line readable: samples the wallpaper (image or video frame)
 * behind the quote and switches to a stronger backdrop on bright areas.
 */
function myntLuminance(data) {
    let sum = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
        const [r, g, b] = [data[i], data[i + 1], data[i + 2]].map(v => {
            v /= 255;
            return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        });
        sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
        n++;
    }
    return n ? sum / n : 0;
}
if (typeof module !== "undefined" && module.exports) module.exports = { myntLuminance };

if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", () => {
    const quote = document.getElementById("studyQuote");
    if (!quote) return;
    const canvas = document.createElement("canvas");
    canvas.width = 48;
    canvas.height = 12;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    function sampleRect(source, sw, sh) {
        // Map the quote's screen rect onto the source assuming background-size: cover.
        const r = quote.getBoundingClientRect();
        const scale = Math.max(innerWidth / sw, innerHeight / sh);
        const ox = (sw * scale - innerWidth) / 2, oy = (sh * scale - innerHeight) / 2;
        const x = (r.left + ox) / scale, y = (r.top - 6 + oy) / scale;
        const w = Math.max(1, (r.width) / scale), h = Math.max(1, (r.height + 12) / scale);
        ctx.drawImage(source, x, y, w, h, 0, 0, canvas.width, canvas.height);
        return myntLuminance(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
    }

    function setLevel(lum) {
        quote.classList.toggle("is-on-bright", lum > 0.45);
        quote.dataset.bgLuminance = lum.toFixed(2);
    }

    function measure() {
        if (window.myntAdaptive?.measureQuote()) return;
        const video = document.getElementById("videoBg");
        const videoOn = !!video && getComputedStyle(video).display !== "none" && getComputedStyle(video).visibility !== "hidden" && !!video.currentSrc;
        const match = /url\(["']?(.*?)["']?\)/.exec(getComputedStyle(document.body).backgroundImage || "");
        quote.classList.toggle("has-wallpaper", videoOn || !!match);
        if (quote.hidden || (!videoOn && !match)) return quote.classList.remove("is-on-bright");
        try {
            if (videoOn) {
                if (video.readyState >= 2 && video.videoWidth) setLevel(sampleRect(video, video.videoWidth, video.videoHeight));
                return;
            }
            const img = new Image();
            img.onload = () => { try { setLevel(sampleRect(img, img.naturalWidth, img.naturalHeight)); } catch {} };
            img.src = match[1];
        } catch {
            // Cross-origin or decode issues: keep the default backdrop.
        }
    }

    let timer;
    const schedule = (delay = 300) => { clearTimeout(timer); timer = setTimeout(measure, delay); };
    addEventListener("resize", () => schedule(400));
    document.getElementById("videoBg")?.addEventListener("loadeddata", () => schedule(200));
    new MutationObserver(() => schedule()).observe(document.body, { attributes: true, attributeFilter: ["style", "data-bg"] });
    (window.requestIdleCallback || (cb => setTimeout(cb, 600)))(() => measure());
    window.myntQuoteContrast = { measure };
});

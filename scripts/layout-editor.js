/*
 * MYNT layout edit mode: move and resize top-level blocks.
 * Offsets are stored as viewport fractions plus a scale factor in localStorage "myntLayout".
 * Outside edit mode only the saved translate/scale is applied; no handlers touch the page.
 */

const MYNT_LAYOUT_BLOCKS = [
    ["clock", "#analogClock, #digitalClock", "時鐘", "Clock"],
    ["focus", ".ttteexxtt", "今天最重要的事", "Today’s focus"],
    ["search", "#rightDiv", "搜尋列", "Search bar"],
    ["aiTools", "#aiToolsCont", "AI 工具", "AI tools"],
    ["shortcuts", "#shortcutsContainer", "捷徑", "Shortcuts"],
    ["quote", "#studyQuote", "鼓勵語", "Quote"],
    ["pomodoro", "#pomodoroCont", "番茄鐘", "Pomodoro"],
    ["scratchpad", "#scratchpadCont", "便籤", "Scratchpad"],
    ["bookmarks", "#bookmarkButton", "書籤", "Bookmarks"],
    ["wallpaper", "#wallpaperQuickActions", "桌布", "Wallpaper"],
    ["menu", "#menuButton", "設定", "Settings"]
];
const MYNT_LAYOUT_LIMITS = { minScale: 0.5, maxScale: 2, grid: 16 };

function myntNormalizeLayout(raw) {
    const out = { version: 1, snap: false, blocks: {} };
    if (!raw || typeof raw !== "object") return out;
    out.snap = raw.snap === true;
    const ids = new Set(MYNT_LAYOUT_BLOCKS.map(item => item[0]));
    for (const [id, value] of Object.entries(raw.blocks || {})) {
        if (!ids.has(id) || !value || typeof value !== "object") continue;
        const num = (v, lo, hi, d) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
        const block = {
            x: num(value.x, -1, 1, 0),
            y: num(value.y, -1, 1, 0),
            s: num(value.s, MYNT_LAYOUT_LIMITS.minScale, MYNT_LAYOUT_LIMITS.maxScale, 1)
        };
        if (block.x || block.y || block.s !== 1) out.blocks[id] = block;
    }
    return out;
}

// Keep a rect (after offset) inside the viewport; returns the corrected pixel offset.
function myntClampOffset(rect, dx, dy, vw, vh, margin = 4) {
    let x = dx, y = dy;
    if (rect.right > vw - margin) x -= rect.right - (vw - margin);
    if (rect.left < margin) x += margin - rect.left;
    if (rect.bottom > vh - margin) y -= rect.bottom - (vh - margin);
    if (rect.top < margin) y += margin - rect.top;
    return { x, y };
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { MYNT_LAYOUT_BLOCKS, MYNT_LAYOUT_LIMITS, myntNormalizeLayout, myntClampOffset };
}

if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", () => {
    const KEY = "myntLayout";
    const language = () => localStorage.getItem("selectedLanguage") || "zh_TW";
    const isZh = () => language().startsWith("zh");
    const t = (key, fallback) => translations[language()]?.[key] || translations.en?.[key] || fallback;
    let layout = load();
    let editing = false;
    let toolbar = null;
    const overlays = new Map();

    function load() {
        try { return myntNormalizeLayout(JSON.parse(localStorage.getItem(KEY) || "null")); }
        catch { return myntNormalizeLayout(null); }
    }
    function save() {
        layout = myntNormalizeLayout(layout);
        if (!Object.keys(layout.blocks).length && !layout.snap) localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, JSON.stringify(layout));
    }
    const elementsFor = selector => [...document.querySelectorAll(selector)];
    const visible = el => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };

    function applyBlock(id) {
        const entry = MYNT_LAYOUT_BLOCKS.find(item => item[0] === id);
        const block = layout.blocks[id];
        for (const el of elementsFor(entry[1])) {
            if (!block) {
                el.style.removeProperty("translate");
                el.style.removeProperty("scale");
                el.style.removeProperty("transform-origin");
                delete el.dataset.myntLayout;
                continue;
            }
            el.dataset.myntLayout = id;
            el.style.transformOrigin = "0 0";
            el.style.scale = String(block.s);
            let dx = block.x * innerWidth, dy = block.y * innerHeight;
            el.style.translate = `${dx}px ${dy}px`;
            if (visible(el)) {
                const fixed = myntClampOffset(el.getBoundingClientRect(), dx, dy, innerWidth, innerHeight);
                if (fixed.x !== dx || fixed.y !== dy) el.style.translate = `${fixed.x}px ${fixed.y}px`;
            }
        }
    }
    const applyAll = () => MYNT_LAYOUT_BLOCKS.forEach(([id]) => applyBlock(id));

    function snap(value) {
        return layout.snap ? Math.round(value / MYNT_LAYOUT_LIMITS.grid) * MYNT_LAYOUT_LIMITS.grid : value;
    }

    function placeOverlays() {
        for (const [id, overlay] of overlays) {
            const entry = MYNT_LAYOUT_BLOCKS.find(item => item[0] === id);
            const el = elementsFor(entry[1]).find(visible);
            overlay.hidden = !el;
            if (!el) continue;
            const r = el.getBoundingClientRect();
            Object.assign(overlay.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
        }
    }

    function startDrag(event, id, mode) {
        event.preventDefault();
        event.stopPropagation();
        const entry = MYNT_LAYOUT_BLOCKS.find(item => item[0] === id);
        const el = elementsFor(entry[1]).find(visible);
        if (!el) return;
        const base = { ...(layout.blocks[id] || { x: 0, y: 0, s: 1 }) };
        const rect = el.getBoundingClientRect();
        const sx = event.clientX, sy = event.clientY;
        const target = event.currentTarget;
        target.setPointerCapture?.(event.pointerId);
        const move = e => {
            const dx = e.clientX - sx, dy = e.clientY - sy;
            if (mode === "move") {
                layout.blocks[id] = { ...base, x: snap(base.x * innerWidth + dx) / innerWidth, y: snap(base.y * innerHeight + dy) / innerHeight };
            } else {
                const ratio = Math.max((rect.width + dx) / rect.width, (rect.height + dy) / rect.height);
                const s = Math.min(MYNT_LAYOUT_LIMITS.maxScale, Math.max(MYNT_LAYOUT_LIMITS.minScale, base.s * ratio));
                layout.blocks[id] = { ...base, s: Math.round(s * 100) / 100 };
            }
            applyBlock(id);
            placeOverlays();
        };
        const up = () => {
            target.removeEventListener("pointermove", move);
            target.removeEventListener("pointerup", up);
            target.removeEventListener("pointercancel", up);
            save();
        };
        target.addEventListener("pointermove", move);
        target.addEventListener("pointerup", up);
        target.addEventListener("pointercancel", up);
    }

    function buildOverlays() {
        for (const [id, , zh, en] of MYNT_LAYOUT_BLOCKS) {
            if (!document.querySelector(MYNT_LAYOUT_BLOCKS.find(item => item[0] === id)[1])) continue;
            const overlay = document.createElement("div");
            overlay.className = "myntLayoutOverlay";
            overlay.dataset.block = id;
            const label = document.createElement("span");
            label.className = "myntLayoutLabel";
            label.textContent = isZh() ? zh : en;
            const handle = document.createElement("span");
            handle.className = "myntLayoutResize";
            handle.title = t("layoutResizeHint", "Drag to resize · double-click to reset this block");
            overlay.append(label, handle);
            overlay.addEventListener("pointerdown", e => { if (e.target !== handle) startDrag(e, id, "move"); });
            const reset = e => { e.preventDefault(); delete layout.blocks[id]; save(); applyBlock(id); placeOverlays(); };
            let lastDown = 0;
            handle.addEventListener("pointerdown", e => {
                const now = Date.now();
                if (now - lastDown < 400) { lastDown = 0; return reset(e); }
                lastDown = now;
                startDrag(e, id, "resize");
            });
            handle.addEventListener("dblclick", reset);
            label.addEventListener("dblclick", reset);
            document.body.append(overlay);
            overlays.set(id, overlay);
        }
    }

    function buildToolbar() {
        toolbar = document.createElement("div");
        toolbar.id = "myntLayoutToolbar";
        toolbar.setAttribute("role", "toolbar");
        const title = document.createElement("span");
        title.textContent = t("layoutEditing", "Editing layout");
        const snapLabel = document.createElement("label");
        const snapBox = document.createElement("input");
        snapBox.type = "checkbox";
        snapBox.id = "myntLayoutSnap";
        snapBox.checked = layout.snap;
        snapBox.addEventListener("change", () => { layout.snap = snapBox.checked; save(); });
        snapLabel.append(snapBox, document.createTextNode(t("layoutSnap", "Snap to grid")));
        const reset = document.createElement("button");
        reset.type = "button";
        reset.id = "myntLayoutReset";
        reset.textContent = t("layoutReset", "Reset layout");
        reset.addEventListener("click", async () => {
            const message = t("layoutResetConfirm", "Restore the default layout?");
            if (!(window.myntDialog ? await window.myntDialog.confirm(message) : window.confirm(message))) return;
            layout = { ...layout, blocks: {} };
            save();
            applyAll();
            placeOverlays();
        });
        const done = document.createElement("button");
        done.type = "button";
        done.id = "myntLayoutDone";
        done.className = "primary";
        done.textContent = t("layoutDone", "Done");
        done.addEventListener("click", () => setEditing(false));
        toolbar.append(title, snapLabel, reset, done);
        document.body.append(toolbar);
    }

    function setEditing(on) {
        if (on === editing) return;
        editing = on;
        document.body.classList.toggle("mynt-layout-editing", on);
        const box = document.getElementById("layoutEditCheckbox");
        if (box) box.checked = on;
        if (on) {
            document.getElementById("menuCloseButton")?.click();
            buildOverlays();
            buildToolbar();
            placeOverlays();
            addEventListener("resize", placeOverlays);
        } else {
            overlays.forEach(overlay => overlay.remove());
            overlays.clear();
            toolbar?.remove();
            toolbar = null;
            removeEventListener("resize", placeOverlays);
        }
    }

    const settingBox = document.getElementById("layoutEditCheckbox");
    settingBox?.addEventListener("change", () => setEditing(settingBox.checked));
    const titleEl = document.getElementById("layoutEditTitle");
    const infoEl = document.getElementById("layoutEditInfo");
    if (titleEl) titleEl.textContent = t("layoutEditSetting", "Edit layout");
    if (infoEl) infoEl.textContent = t("layoutEditSettingInfo", "Move and resize blocks (Alt+L)");

    document.addEventListener("keydown", e => {
        if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === "KeyL") {
            e.preventDefault();
            setEditing(!editing);
        } else if (editing && e.key === "Escape" && !document.querySelector("dialog[open]")) {
            setEditing(false);
        }
    });

    let resizeTimer;
    addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(applyAll, 100); });
    applyAll();
    // Some blocks appear later (clock type, pomodoro toggle); re-apply once things settle.
    setTimeout(applyAll, 800);

    window.myntLayout = { setEditing, isEditing: () => editing, get: () => myntNormalizeLayout(layout), applyAll };
});

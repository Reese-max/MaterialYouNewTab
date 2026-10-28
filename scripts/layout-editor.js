/*
 * Manual layout editor. myntLayout remains a version-2 map of viewport-relative
 * offsets and scales. Editing is a local draft; only Save and lock writes it.
 * Normal page content never becomes a drag surface, even while editing.
 */
const MYNT_LAYOUT_BLOCKS = [
    ["clock", "#analogClock, #digitalClock", "layoutBlockClock", "Clock"],
    ["focus", ".ttteexxtt", "layoutBlockFocus", "Today’s focus"],
    ["search", "#rightDiv", "layoutBlockSearch", "Search bar"],
    ["aiTools", "#aiToolsCont", "layoutBlockAiTools", "AI tools"],
    ["shortcuts", "#shortcutsContainer", "layoutBlockShortcuts", "Shortcuts"],
    ["quote", "#studyQuote", "layoutBlockQuote", "Quote"],
    ["countdowns", "#eventCountdownCard", "layoutBlockCountdowns", "Countdowns"],
    ["exam", "#examDaily", "layoutBlockExam", "Daily exam"],
    ["pomodoro", "#pomodoroCont", "layoutBlockPomodoro", "Pomodoro"],
    ["scratchpad", "#scratchpadCont", "layoutBlockScratchpad", "Scratchpad"],
    ["homeWidgets", "#myntHomeWidgets", "layoutBlockHomeWidgets", "Today widgets"],
    ["bookmarks", "#bookmarkButton", "layoutBlockBookmarks", "Bookmarks"],
    ["wallpaper", "#wallpaperQuickActions", "layoutBlockWallpaper", "Wallpaper"],
    ["menu", "#menuButton", "layoutBlockMenu", "Settings"]
];
const MYNT_LAYOUT_LIMITS = { minScale: 0.5, maxScale: 2, grid: 16, snapDistance: 8 };

function myntNormalizeLayout(raw) {
    const out = { version: 2, snap: false, locked: true, blocks: {} };
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || ![undefined, 1, 2].includes(raw.version)) return out;
    out.locked = raw.locked !== false;
    out.snap = raw.snap === true;
    const ids = new Set(MYNT_LAYOUT_BLOCKS.map(item => item[0]));
    for (const [id, value] of Object.entries(raw.blocks && typeof raw.blocks === "object" && !Array.isArray(raw.blocks) ? raw.blocks : {})) {
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

function myntClampOffset(rect, dx, dy, vw, vh, margin = 4) {
    let x = dx, y = dy;
    if (rect.right > vw - margin) x -= rect.right - (vw - margin);
    if (rect.left < margin) x += margin - rect.left;
    if (rect.bottom > vh - margin) y -= rect.bottom - (vh - margin);
    if (rect.top < margin) y += margin - rect.top;
    return { x, y };
}

// Snap the visible rectangle, not its offset from an unrelated natural origin.
// Nearby object/viewport alignment takes precedence over the optional 16px grid.
function myntSnapMove(rect, dx, dy, peers, vw, vh, enabled) {
    if (!enabled) return { dx, dy, guides: [] };
    const guides = [];
    function axis(start, size, delta, targets, limit, name) {
        const proposed = start + delta;
        const source = [proposed, proposed + size / 2, proposed + size];
        let nearest = null;
        const values = [4, limit / 2, limit - 4, ...targets];
        for (const value of values) for (const edge of source) {
            const correction = value - edge;
            if (Math.abs(correction) <= MYNT_LAYOUT_LIMITS.snapDistance && (!nearest || Math.abs(correction) < Math.abs(nearest.correction))) {
                nearest = { correction, value };
            }
        }
        if (nearest) {
            guides.push({ axis: name, value: nearest.value, kind: "alignment" });
            return delta + nearest.correction;
        }
        const grid = Math.round(proposed / MYNT_LAYOUT_LIMITS.grid) * MYNT_LAYOUT_LIMITS.grid;
        guides.push({ axis: name, value: grid, kind: "grid" });
        return grid - start;
    }
    const xs = peers.flatMap(r => [r.left, r.left + r.width / 2, r.right]);
    const ys = peers.flatMap(r => [r.top, r.top + r.height / 2, r.bottom]);
    return { dx: axis(rect.left, rect.width, dx, xs, vw, "x"), dy: axis(rect.top, rect.height, dy, ys, vh, "y"), guides };
}

function myntLayoutHistory(initial, limit = 100) {
    const copy = value => JSON.parse(JSON.stringify(value));
    let states = [copy(initial)], index = 0;
    return {
        record(value) {
            if (JSON.stringify(states[index]) === JSON.stringify(value)) return false;
            states = states.slice(0, index + 1);
            states.push(copy(value));
            if (states.length > limit + 1) states.shift();
            index = states.length - 1;
            return true;
        },
        undo() { if (index > 0) index--; return copy(states[index]); },
        redo() { if (index < states.length - 1) index++; return copy(states[index]); },
        canUndo: () => index > 0,
        canRedo: () => index < states.length - 1
    };
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { MYNT_LAYOUT_BLOCKS, MYNT_LAYOUT_LIMITS, myntNormalizeLayout, myntClampOffset, myntSnapMove, myntLayoutHistory };
}

if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", () => {
    const KEY = "myntLayout";
    const copy = value => JSON.parse(JSON.stringify(value));
    const language = () => { try { return localStorage.getItem("selectedLanguage") || "zh_TW"; } catch { return "zh_TW"; } };
    const t = (key, fallback, values = {}) => {
        const strings = typeof translations === "undefined" ? {} : translations;
        const text = strings[language()]?.[key] || strings.en?.[key] || fallback;
        return text.replace(/\{(\w+)\}/g, (token, name) => Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : token);
    };
    const blockName = entry => t(entry[2], entry[3]);
    let profiles=null;
    try { if(typeof MyntLayoutProfiles!=="undefined")profiles=MyntLayoutProfiles.create(localStorage,myntNormalizeLayout,t); } catch {}
    let layout = profiles ? profiles.load() : load();
    let editing = false, dirty = false, beforeEdit = null, history = null;
    let toolbar = null, dock, status, lockStatus, selected = null, activeDrag = null;
    let undoButton, redoButton, snapBox, selectedLabel, resetSelectedButton, editButton;
    let guideLayer = null, resizeObserver = null, frame = null;
    let preciseFields = null, warnings = null;
    const overlays = new Map();
    let draft=null,editScope=null;
    try { if(typeof MyntLayoutDraft!=='undefined')draft=MyntLayoutDraft.create(sessionStorage,myntNormalizeLayout); } catch {}
    function checkpoint(){
        if(!editing||!dirty)return;
        if(!draft?.save(editScope,layout))announce(t('layoutDraftUnavailable','Draft recovery is unavailable; keep this tab open until saved.'));
    }
    function clearDraft(){draft?.clear();document.getElementById('myntDraftRecovery')?.remove();if(dock)dock.hidden=true;}
    addEventListener('beforeunload',event=>{activeDrag?.finish();if(editing&&dirty){checkpoint();event.preventDefault();event.returnValue='';}});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)checkpoint();});

    function load() {
        try { return myntNormalizeLayout(JSON.parse(localStorage.getItem(KEY) || "null")); }
        catch { return myntNormalizeLayout(null); }
    }
    function announce(message) { if (status) status.textContent = message; }
    function save() {
        const committed = myntNormalizeLayout({ ...layout, locked: true });
        try {
            if (typeof profiles !== "undefined" && profiles) profiles.save(committed);
            else localStorage.setItem(KEY, JSON.stringify(committed));
        } catch (error) {
            if (error.message === "conflict") { announce(t("profilesConflict", "Another tab changed layouts. Cancel and reload saved layouts.")); return false; }
            const fallback = "儲存失敗：儲存空間不可用。變更仍保留，請重試或取消。 / Could not save. Changes are still available; retry or cancel.";
            announce(typeof t === "function" ? t("layoutSaveError", fallback) : fallback);
            return false;
        }
        layout = committed;
        clearDraft();
        dirty = false;
        closeEditor();
        announce(t("layoutSavedLocked", "Saved and locked · Stored in this browser only"));
        return true;
    }
    function updateControls() {
        if (!editing) return;
        undoButton.disabled = !history.canUndo();
        redoButton.disabled = !history.canRedo();
        snapBox.checked = layout.snap;
        document.body.classList.toggle("mynt-layout-snap", layout.snap);
        const entry = MYNT_LAYOUT_BLOCKS.find(item => item[0] === selected);
        selectedLabel.textContent = entry ? t("layoutSelected", "Selected: {name}", { name: blockName(entry) }) : t("layoutSelectHandle", "Select a drag handle");
        resetSelectedButton.disabled = !selected || !layout.blocks[selected];
        if (preciseFields) {
            const el = selected && elementFor(selected), r = el?.getBoundingClientRect();
            for (const input of Object.values(preciseFields)) input.disabled = !el;
            if (r && !Object.values(preciseFields).includes(document.activeElement)) {
                preciseFields.x.value = Math.round(r.left); preciseFields.y.value = Math.round(r.top);
                preciseFields.s.value = Math.round((layout.blocks[selected]?.s || 1) * 100);
            }
        }
        updateWarnings();
    }
    function markDirty() {
        dirty = JSON.stringify({ ...layout, locked: beforeEdit?.locked }) !== JSON.stringify(beforeEdit);
        announce(dirty ? t("layoutUnsaved", "Unsaved changes · Save and lock when finished") : t("layoutEditingCancel", "Editing · Cancel restores your previous layout"));
        updateControls();
        if(dirty)checkpoint();else draft?.clear();
    }
    function recordChange() { layout = myntNormalizeLayout(layout); history.record(layout); markDirty(); }
    function button(id, label, onClick) {
        const el = document.createElement("button");
        el.type = "button"; el.id = id; el.textContent = label;
        if (onClick) el.addEventListener("click", onClick);
        return el;
    }
    function buildDock() {
        dock = document.createElement("section");
        dock.id = "myntLayoutSaveDock";
        dock.hidden = true;
        dock.setAttribute("aria-label", t("layoutManualLabel", "Manual layout"));
        const buttons = document.createElement("div");
        editButton = button("myntLayoutEdit", t("layoutEditEntry", "✥ Edit layout"), () => setEditing(true));
        editButton.setAttribute("aria-keyshortcuts", "Alt+L");
        editButton.setAttribute("aria-expanded", "false");
        const lock = document.createElement("span");
        lock.id = "myntLayoutLock"; lockStatus = lock;
        lock.textContent = layout.locked ? t("layoutPositionsLocked", "Positions locked") : t("layoutEditOff", "Edit mode off");
        status = document.createElement("span");
        status.id = "myntLayoutSaveStatus";
        status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
        buttons.append(editButton, lock); buttons.hidden = true; buttons.style.display = "none";
        dock.append(buttons); document.body.append(dock);
        // Idle feedback belongs beside the settings entry, not in a floating toolbar.
        (document.getElementById("layoutEditInfo")?.parentElement || dock).append(status);
        const setting = document.getElementById("layoutEditCheckbox");
        setting?.setAttribute("aria-labelledby", "layoutEditTitle");
        setting?.setAttribute("aria-describedby", "layoutEditInfo myntLayoutSaveStatus");
        announce(t("layoutDragGuard", "Drag handles are available only in edit mode"));
    }
    const elementsFor = selector => [...document.querySelectorAll(selector)];
    const visible = el => {
        const style = getComputedStyle(el), rect = el.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const elementFor = id => elementsFor(MYNT_LAYOUT_BLOCKS.find(item => item[0] === id)[1]).find(visible);
    function currentBlock(id, el) {
        const saved = layout.blocks[id] || { x: 0, y: 0, s: 1 };
        const pixels = (el.style.translate || "0 0").split(/\s+/).map(parseFloat);
        return { ...saved, x: (Number.isFinite(pixels[0]) ? pixels[0] : 0) / innerWidth, y: (Number.isFinite(pixels[1]) ? pixels[1] : 0) / innerHeight };
    }
    function applyBlock(id) {
        const entry = MYNT_LAYOUT_BLOCKS.find(item => item[0] === id), block = layout.blocks[id];
        for (const el of elementsFor(entry[1])) {
            if (!block) {
                el.style.removeProperty("translate"); el.style.removeProperty("scale"); el.style.removeProperty("transform-origin");
                delete el.dataset.myntLayout; delete el.dataset.myntLayoutConstrained;
                continue;
            }
            el.dataset.myntLayout = id;
            el.style.transformOrigin = "0 0";
            el.style.scale = "1";
            const natural = el.getBoundingClientRect();
            const fit = Math.min(block.s, (innerWidth - 32) / Math.max(1, natural.width), (innerHeight - 120) / Math.max(1, natural.height));
            el.style.scale = String(Math.max(0.1, fit));
            el.dataset.myntLayoutConstrained = fit < block.s ? "true" : "false";
            const dx = block.x * innerWidth, dy = block.y * innerHeight;
            el.style.translate = `${dx}px ${dy}px`;
            if (visible(el)) {
                const fixed = myntClampOffset(el.getBoundingClientRect(), dx, dy, innerWidth, innerHeight);
                if (fixed.x !== dx || fixed.y !== dy) { el.style.translate = `${fixed.x}px ${fixed.y}px`; el.dataset.myntLayoutConstrained = "true"; }
            }
        }
    }
    function applyAll() { MYNT_LAYOUT_BLOCKS.forEach(([id]) => applyBlock(id)); if (editing) placeOverlays(); document.dispatchEvent(new CustomEvent("mynt:layout-applied")); }
    function placeOverlays() {
        for (const [id, overlay] of overlays) {
            const el = elementFor(id);
            overlay.hidden = !el;
            if (!el) continue;
            const r = el.getBoundingClientRect();
            Object.assign(overlay.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
            overlay.style.setProperty("--mynt-handle-top", r.top < 48 ? "0px" : "-24px");
            overlay.style.setProperty("--mynt-resize-right", r.right > innerWidth - 24 ? "0px" : "-20px");
            overlay.style.setProperty("--mynt-resize-bottom", r.bottom > innerHeight - 24 ? "0px" : "-20px");
        }
    }
    function scheduleOverlays() {
        if (frame !== null || !editing) return;
        frame = requestAnimationFrame(() => { frame = null; if (editing) placeOverlays(); });
    }
    function select(id) {
        selected = id;
        for (const [blockId, overlay] of overlays) overlay.classList.toggle("is-selected", blockId === id);
        updateControls();
    }
    function hideGuides() { guideLayer?.replaceChildren(); }
    function showGuides(guides) {
        hideGuides();
        for (const guide of guides) {
            const line = document.createElement("div");
            line.className = `myntLayoutGuide is-${guide.axis} is-${guide.kind}`;
            line.style[guide.axis === "x" ? "left" : "top"] = `${guide.value}px`;
            const label = document.createElement("span");
            label.textContent = guide.kind === "alignment" ? t("layoutAligned", "Aligned") : "16px";
            line.append(label); guideLayer.append(line);
        }
    }
    function startDrag(event, id, mode) {
        if (!editing || layout.locked || activeDrag || (event.button !== undefined && event.button !== 0) || event.isPrimary === false) return;
        const el = elementFor(id);
        if (!el) return;
        event.preventDefault(); event.stopPropagation();
        select(id);
        const target = event.currentTarget;
        target.focus({ preventScroll: true });
        const initial = copy(layout), base = currentBlock(id, el), rect = el.getBoundingClientRect();
        const sx = event.clientX, sy = event.clientY, pointerId = event.pointerId;
        const peers = MYNT_LAYOUT_BLOCKS.filter(item => item[0] !== id).map(item => elementFor(item[0])).filter(Boolean).map(item => item.getBoundingClientRect());
        let moved = false;
        const move = e => {
            if (e.pointerId !== pointerId) return;
            const dx = e.clientX - sx, dy = e.clientY - sy;
            if (!moved && Math.hypot(dx, dy) < 3) return;
            moved = true;
            if (mode === "move") {
                const result = myntSnapMove(rect, dx, dy, peers, innerWidth, innerHeight, layout.snap && !e.altKey);
                const shifted = { left: rect.left + result.dx, right: rect.right + result.dx, top: rect.top + result.dy, bottom: rect.bottom + result.dy };
                const clamped = myntClampOffset(shifted, result.dx, result.dy, innerWidth, innerHeight);
                layout.blocks[id] = { ...base, x: (base.x * innerWidth + clamped.x) / innerWidth, y: (base.y * innerHeight + clamped.y) / innerHeight };
                showGuides(result.guides.filter(g => g.axis === "x" ? Math.abs(clamped.x - result.dx) < 0.5 : Math.abs(clamped.y - result.dy) < 0.5));
            } else {
                const ratio = Math.max((rect.width + dx) / rect.width, (rect.height + dy) / rect.height);
                const scale = Math.min(MYNT_LAYOUT_LIMITS.maxScale, Math.max(MYNT_LAYOUT_LIMITS.minScale, base.s * ratio));
                layout.blocks[id] = { ...base, s: Math.round(scale * 100) / 100 };
            }
            applyBlock(id); placeOverlays();
        };
        const finish = (cancelled, e) => {
            if (e && e.pointerId !== pointerId) return;
            target.removeEventListener("pointermove", move); target.removeEventListener("pointerup", up);
            target.removeEventListener("pointercancel", cancel); target.removeEventListener("lostpointercapture", cancel);
            activeDrag = null;
            if (target.hasPointerCapture?.(pointerId)) target.releasePointerCapture(pointerId);
            overlays.get(id)?.classList.remove("is-dragging"); hideGuides();
            if (cancelled) { layout = initial; applyAll(); }
            else if (moved) recordChange();
        };
        const up = e => finish(false, e), cancel = e => finish(true, e);
        activeDrag = { cancel: () => finish(true), finish: () => finish(false) };
        overlays.get(id)?.classList.add("is-dragging");
        target.addEventListener("pointermove", move); target.addEventListener("pointerup", up);
        target.addEventListener("pointercancel", cancel); target.addEventListener("lostpointercapture", cancel);
        target.setPointerCapture?.(pointerId);
    }
    function nudge(e, id) {
        if (!editing || layout.locked || activeDrag || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
        const el = elementFor(id); if (!el) return;
        e.preventDefault(); e.stopPropagation(); select(id); hideGuides();
        const b = currentBlock(id, el), step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0;
        const dy = e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0;
        const r = el.getBoundingClientRect();
        const correction = myntClampOffset({ left: r.left + dx, right: r.right + dx, top: r.top + dy, bottom: r.bottom + dy }, dx, dy, innerWidth, innerHeight);
        layout.blocks[id] = { ...b, x: b.x + correction.x / innerWidth, y: b.y + correction.y / innerHeight };
        applyBlock(id); placeOverlays(); recordChange();
    }
    function buildOverlays() {
        for (const entry of MYNT_LAYOUT_BLOCKS) {
            const [id] = entry, name = blockName(entry), overlay = document.createElement("div");
            overlay.className = "myntLayoutOverlay"; overlay.dataset.block = id;
            overlay.setAttribute("role", "group"); overlay.setAttribute("aria-label", name);
            const handle = button("", `⠿ ${name}`);
            handle.removeAttribute("id"); handle.className = "myntLayoutMove myntLayoutLabel";
            handle.setAttribute("aria-label", t("layoutMoveAria", "Move {name}; arrows 1px, Shift + arrows 10px", { name }));
            handle.title = t("layoutMoveHint", "Drag to move · Arrow keys to nudge · Hold Alt to bypass snapping");
            handle.addEventListener("pointerdown", e => startDrag(e, id, "move"));
            handle.addEventListener("focus", () => select(id));
            const resize = button("", "↘");
            resize.removeAttribute("id"); resize.className = "myntLayoutResize";
            resize.setAttribute("aria-label", t("layoutResizeAria", "Resize {name}", { name }));
            resize.title = t("layoutResizeManualHint", "Drag to resize; + / − to adjust size");
            resize.addEventListener("pointerdown", e => startDrag(e, id, "resize"));
            resize.addEventListener("focus", () => select(id));
            overlay.addEventListener("keydown", e => {
                if (editing && !layout.locked && !activeDrag && ["+", "=", "-", "_"].includes(e.key)) {
                    e.preventDefault(); e.stopPropagation(); select(id);
                    const b = { ...(layout.blocks[id] || { x: 0, y: 0, s: 1 }) };
                    b.s = Math.round(Math.min(2, Math.max(0.5, b.s + (["-", "_"].includes(e.key) ? -0.05 : 0.05))) * 100) / 100;
                    layout.blocks[id] = b; applyBlock(id); placeOverlays(); recordChange();
                } else nudge(e, id);
            });
            overlay.append(handle, resize); document.body.append(overlay); overlays.set(id, overlay);
        }
    }
    function changeHistory(direction) {
        if (!editing || activeDrag || !history[direction === "undo" ? "canUndo" : "canRedo"]()) return;
        layout = history[direction](); hideGuides(); applyAll(); markDirty();
        announce(direction === "undo" ? t("layoutUndone", "Undone · Editing") : t("layoutRedone", "Redone · Editing"));
    }
    function updateWarnings() {
        if (!warnings) return;
        const items = MYNT_LAYOUT_BLOCKS.map(entry => ({entry, el:elementFor(entry[0])})).filter(x=>x.el).map(x=>({...x,r:x.el.getBoundingClientRect()}));
        const problems = [];
        for (let i=0;i<items.length;i++) {
            const a=items[i], r=a.r;
            if(a.el.dataset.myntLayoutConstrained === "true" || r.left<0||r.top<0||r.right>innerWidth||r.bottom>innerHeight) problems.push(blockName(a.entry)+': '+t('layoutOutside','outside viewport'));
            for(let j=i+1;j<items.length;j++) {
                const b=items[j];
                if(Math.min(r.right,b.r.right)-Math.max(r.left,b.r.left)>8 && Math.min(r.bottom,b.r.bottom)-Math.max(r.top,b.r.top)>8) problems.push(blockName(a.entry)+' / '+blockName(b.entry));
            }
        }
        warnings.textContent = problems.length ? t('layoutOverlapWarning','Possible overlap/outside viewport. You decide whether to keep it: ')+problems.join('; ') : t('layoutNoOverlap','No block overlaps detected.');
    }
    function preciseChange(mode) {
        if (!editing || layout.locked || !selected || activeDrag) return;
        const el=elementFor(selected); if(!el)return;
        let r=el.getBoundingClientRect(),b=currentBlock(selected,el);
        let x=Number(preciseFields.x.value), y=Number(preciseFields.y.value), scale=Number(preciseFields.s.value)/100;
        if(![x,y,scale].every(Number.isFinite)||scale<.5||scale>2)return announce(t('layoutInvalidNumbers','Use finite positions and a scale from 50 to 200%.'));
        if(mode==='left')x=16;
        if(mode==='center'){
            layout.blocks[selected]={...b,s:scale};applyBlock(selected);
            r=el.getBoundingClientRect();b=currentBlock(selected,el);x=(innerWidth-r.width)/2;
        }
        layout.blocks[selected]={x:Math.max(-1,Math.min(1,b.x+(x-r.left)/innerWidth)),y:Math.max(-1,Math.min(1,b.y+(y-r.top)/innerHeight)),s:scale};
        applyBlock(selected);placeOverlays();recordChange();
    }
    function buildToolbar() {
        toolbar = document.createElement("section"); toolbar.id = "myntLayoutToolbar";
        toolbar.setAttribute("aria-label", t("layoutToolbarLabel", "Layout editing tools"));
        toolbar.dataset.dock = "bottom";
        const top = document.createElement("div"); top.className = "myntLayoutToolbarRow";
        const title = document.createElement("strong"); title.textContent = t("layoutEditSetting", "Edit layout");
        const dockToggle = button("myntLayoutDockToggle", t("layoutDockTop", "Dock at top"), () => {
            const atTop = toolbar.dataset.dock !== "top";
            toolbar.dataset.dock = atTop ? "top" : "bottom";
            dockToggle.textContent = atTop ? t("layoutDockBottom", "Dock at bottom") : t("layoutDockTop", "Dock at top");
            dockToggle.setAttribute("aria-pressed", String(atTop));
        });
        dockToggle.setAttribute("aria-pressed", "false");
        dockToggle.title = t("layoutDockHint", "Move the toolbar to reveal covered handles; workspace blocks stay in place.");
        undoButton = button("myntLayoutUndo", t("layoutUndo", "↶ Undo"), () => changeHistory("undo"));
        redoButton = button("myntLayoutRedo", t("layoutRedo", "↷ Redo"), () => changeHistory("redo"));
        undoButton.setAttribute("aria-keyshortcuts", "Control+z Meta+z"); redoButton.setAttribute("aria-keyshortcuts", "Control+Shift+z Meta+Shift+z Control+y");
        const snapLabel = document.createElement("label");
        snapBox = document.createElement("input"); snapBox.type = "checkbox"; snapBox.id = "myntLayoutSnap";
        snapBox.addEventListener("change", () => { layout.snap = snapBox.checked; recordChange(); hideGuides(); });
        snapLabel.append(snapBox, document.createTextNode(t("layoutSnapAlignment", "Align / 16px grid")));
        const cancel = button("myntLayoutCancel", t("dialogCancel", "Cancel"), cancelEditing);
        const done = button("myntLayoutSave", t("layoutSaveLock", "Save and lock"), () => { activeDrag?.finish(); save(); }); done.className = "primary";
        top.append(title, dockToggle, undoButton, redoButton, snapLabel, cancel, done);
        const bottom = document.createElement("div"); bottom.className = "myntLayoutToolbarRow myntLayoutHelp";
        selectedLabel = document.createElement("span");
        resetSelectedButton = button("myntLayoutResetSelected", t("layoutResetSelected", "Reset selected"), () => {
            if (!selected || !layout.blocks[selected]) return;
            delete layout.blocks[selected]; applyBlock(selected); placeOverlays(); recordChange();
        });
        const reset = button("myntLayoutReset", t("layoutResetAll", "Reset all"), async () => {
            const message = t("layoutResetDraftConfirm", "Reset all block positions? You can undo or cancel before saving. Notes and tasks will not be deleted.");
            if (!(window.myntDialog ? await window.myntDialog.confirm(message) : window.confirm(message))) return;
            if (!editing) return;
            layout.blocks = {}; applyAll(); recordChange();
        });
        const hint = document.createElement("span"); hint.className = "myntLayoutInstructions";
        hint.textContent = t("layoutInstructions", "Drag ⠿ handles · Arrows 1px · Shift 10px · Esc cancels");
        bottom.append(selectedLabel, resetSelectedButton, reset, hint);
        const precise=document.createElement('details');precise.className='myntLayoutPrecision';
        const summary=document.createElement('summary');summary.textContent=t('layoutPrecision','Position, size and alignment');precise.append(summary);
        const row=document.createElement('div');row.className='myntLayoutToolbarRow';preciseFields={};
        for(const [key,label] of [['x','X (px)'],['y','Y (px)'],['s',t('layoutScale','Size (%)')]]) {
            const wrap=document.createElement('label');wrap.textContent=label;const input=document.createElement('input');input.type='number';input.id='myntLayoutPrecise-'+key;input.step='1';
            if(key==='s'){input.min='50';input.max='200';}input.setAttribute('aria-label',label);preciseFields[key]=input;wrap.append(input);row.append(wrap);
        }
        row.append(button('myntLayoutPreciseApply',t('layoutApplyNumbers','Apply values'),()=>preciseChange()),button('myntLayoutAlignLeft',t('layoutAlignLeft','Align left'),()=>preciseChange('left')),button('myntLayoutAlignCenter',t('layoutAlignCenter','Center horizontally'),()=>preciseChange('center')));
        warnings=document.createElement('p');warnings.id='myntLayoutWarnings';warnings.setAttribute('role','status');precise.append(row,warnings);
        toolbar.append(top, bottom, precise, status); document.body.append(toolbar);
    }
    function closeEditor() {
        activeDrag?.cancel();
        editing = false; beforeEdit = null; history = null; selected = null;
        document.body.classList.remove("mynt-layout-editing", "mynt-layout-snap");
        const box = document.getElementById("layoutEditCheckbox"); if (box) box.checked = false;
        overlays.forEach(overlay => overlay.remove()); overlays.clear();
        preciseFields = null; warnings = null;
        toolbar?.remove(); toolbar = null; guideLayer?.remove(); guideLayer = null;
        resizeObserver?.disconnect(); resizeObserver = null;
        if (frame !== null) cancelAnimationFrame(frame); frame = null;
        removeEventListener("scroll", scheduleOverlays, true); removeEventListener("resize", scheduleOverlays);
        editButton.setAttribute("aria-expanded", "false"); dock.hidden = true;
        (document.getElementById("layoutEditInfo")?.parentElement || dock).append(status);
        lockStatus.textContent = layout.locked ? t("layoutPositionsLocked", "Positions locked") : t("layoutEditOff", "Edit mode off");
        applyAll(); document.getElementById("menuButton")?.focus({ preventScroll: true });
        profiles?.finish();
    }
    function cancelEditing() {
        if (!editing) return;
        activeDrag?.cancel(); layout = copy(beforeEdit); clearDraft(); dirty = false; closeEditor();
        announce(t("layoutCancelled", "Cancelled · Previous layout and lock state restored"));
    }
    function setEditing(on, recovering=false) {
        if(on&&!recovering&&document.getElementById("myntDraftRecovery")){announce(t("layoutDraftFound","Restore or discard the existing draft first."));return false;}
        if (Boolean(on) === editing) return true;
        if (!on) { cancelEditing(); return true; }
        if (profiles) { if (!profiles.reload()) return false; layout = profiles.load(); }
        // Reload can select a newer saved profile or viewport variant. Render it
        // before handles read pixel coordinates; never nudge stale screen offsets.
        applyAll();
        editScope=profiles?.context()||{profile:"legacy",size:innerWidth<=900?"narrow":"wide",revision:0,base:null};
        beforeEdit = copy(layout); layout = copy(layout); layout.locked = false;
        history = myntLayoutHistory(layout); editing = true; dirty = false;
        document.getElementById("menuCloseButton")?.click();
        document.body.classList.add("mynt-layout-editing");
        const box = document.getElementById("layoutEditCheckbox"); if (box) box.checked = true;
        editButton.setAttribute("aria-expanded", "true"); dock.hidden = true;
        guideLayer = document.createElement("div"); guideLayer.id = "myntLayoutGuides"; guideLayer.setAttribute("aria-hidden", "true"); document.body.append(guideLayer);
        buildOverlays(); buildToolbar(); placeOverlays(); updateControls();
        const guide=document.createElement('details');guide.id='myntEditorGuide';
        const heading=document.createElement('summary');heading.textContent=t('layoutGuideTitle','Quick editing guide');
        const help=document.createElement('p');help.textContent=t('layoutGuideText','Drag the handles, use arrows for 1px steps (Shift: 10px), or hold Alt while dragging to bypass snapping. Undo and Cancel are safe; Save and lock commits your layout.');
        let seen=false;try{seen=localStorage.getItem('myntLayoutGuideSeen')==='1';}catch{}guide.open=!seen;
        const dismiss=button('myntGuideDismiss',t('layoutGuideDismiss','Got it'),()=>{guide.open=false;try{localStorage.setItem('myntLayoutGuideSeen','1');}catch{}});
        guide.append(heading,help,dismiss);toolbar.append(guide);
        addEventListener("scroll", scheduleOverlays, true); addEventListener("resize", scheduleOverlays);
        if (typeof ResizeObserver !== "undefined") {
            resizeObserver = new ResizeObserver(scheduleOverlays);
            MYNT_LAYOUT_BLOCKS.forEach(([, selector]) => elementsFor(selector).forEach(el => resizeObserver.observe(el)));
        }
        announce(t("layoutEditingDraft", "Editing · Your saved layout is unchanged"));
        toolbar.querySelector("button:not(:disabled)")?.focus({ preventScroll: true });
        return true;
    }
    const settingBox = document.getElementById("layoutEditCheckbox");
    settingBox?.addEventListener("change", () => setEditing(settingBox.checked));
    const titleEl = document.getElementById("layoutEditTitle"), infoEl = document.getElementById("layoutEditInfo");
    if (titleEl) titleEl.textContent = t("layoutEditSetting", "Edit layout");
    if (infoEl) infoEl.textContent = t("layoutEditSettingInfo", "Drag handles, snapping and undo; save and lock when finished (Alt+L)");
    document.addEventListener("keydown", e => {
        const typing = e.target?.closest?.("input, textarea, select, [contenteditable='true'], [contenteditable='']");
        if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === "KeyL") {
            if (typing) return;
            e.preventDefault(); setEditing(!editing);
        } else if (editing && e.key === "Escape" && !document.querySelector("dialog[open]")) {
            e.preventDefault(); cancelEditing();
        } else if (editing && !typing && (e.ctrlKey || e.metaKey) && !e.altKey) {
            const key = e.key.toLowerCase();
            if (key === "z" || key === "y") {
                e.preventDefault(); changeHistory(key === "y" || e.shiftKey ? "redo" : "undo");
            }
        }
    });
    let resizeTimer;
    addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(applyAll, 100); });
    buildDock(); applyAll();
    // Legacy unlocked data stays intact, but dragging still requires an explicit edit session.
    setTimeout(applyAll, 800);
    addEventListener("beforeunload", e => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
    window.myntLayout = { reloadProfiles: () => { if(editing) throw Error("Layout draft active"); if(profiles && profiles.reload()){ layout=profiles.load(); applyAll(); } }, setEditing, isEditing: () => editing, get: () => myntNormalizeLayout(layout), applyAll, undo: () => changeHistory("undo"), redo: () => changeHistory("redo"), cancel: cancelEditing, replaceSaved: value => { if(editing)return; layout=myntNormalizeLayout(value); applyAll(); }, preview: value => {
        // A recovery prompt or failed reload can refuse editor entry. Do not
        // replace either the saved view or a draft already being edited.
        if(editing||!setEditing(true))return false;
        layout=myntNormalizeLayout({...value,locked:false});applyAll();recordChange();return true;
    } };
    profiles?.mount(window.myntLayout);
    if(draft?.read()){
        const box=document.createElement('section');box.id='myntDraftRecovery';box.setAttribute('role','status');
        const text=document.createElement('p');text.textContent=t('layoutDraftFound','An unsaved draft is available in this tab. Restore only if its saved profile and revision still match.');
        const restore=button('myntDraftRestore',t('layoutDraftRestore','Restore draft'),()=>{
            if(editing)return;if(profiles&&!profiles.reload())return;
            const scope=profiles?.context()||{profile:'legacy',size:innerWidth<=900?'narrow':'wide',revision:0,base:null};
            const saved=draft.matching(scope);
            if(!saved){text.textContent=t('layoutDraftStale','This draft belongs to another size/profile or an older saved revision. It cannot replace the current layout.');return;}
            if(!setEditing(true,true))return;
            layout=myntNormalizeLayout({...saved.layout,locked:false});applyAll();recordChange();box.remove();
        });
        box.append(text,restore,button('myntDraftDiscard',t('layoutDraftDiscard','Discard draft'),()=>clearDraft()));dock.append(box);dock.hidden=false;
    }
});

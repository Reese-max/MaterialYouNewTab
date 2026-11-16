'use strict';
// Read-only production-source probes. No browser, network, storage or repo writes.
// Usage: node tools/regress-panel-interactions.cjs .
// Original audited source fails all three groups. Exit 0 means expected behavior.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = process.argv[2] || process.cwd();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function between(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `Source boundary changed: ${start}`);
  return source.slice(a, b);
}
function classes() {
  const set = new Set();
  return {add: x => set.add(x), remove: x => set.delete(x), contains: x => set.has(x),
    toggle(x, force) { const on = force === undefined ? !set.has(x) : force; on ? set.add(x) : set.delete(x); return on; }};
}
function element(tag = 'div') {
  const listeners = {}, attributes = {};
  return { tagName: tag.toUpperCase(), classList: classes(), dataset: {}, style: {}, children: [],
    textContent: '', value: '', attributes, listeners, disabled: false,
    setAttribute(k, v) { attributes[k] = String(v); if (k.startsWith('data-')) this.dataset[k.slice(5)] = String(v); },
    getAttribute(k) { return attributes[k] ?? null; },
    addEventListener(k, fn) { (listeners[k] ||= []).push(fn); },
    removeEventListener(k, fn) { listeners[k] = (listeners[k] || []).filter(x => x !== fn); },
    appendChild(child) { this.children.push(child); return child; },
    replaceChildren(...children) { this.children = children; },
    querySelector(selector) { return selector === '.active' ? this.children.find(x => x.classList.contains('active')) || null : null; },
    contains(target) { return target === this || this.children.includes(target); },
    scrollIntoView() {}, focus() {}, click() { this.onclick?.(); for (const fn of listeners.click || []) fn({ target: this }); }
  };
}
async function runTodoProbe() {
  const source = read('scripts/todo-list.js');
  // This executes the exact production saveEdit body.
  const saveEdit = between(source, '            function saveEdit()', '            // Cancel function');
  const button = element('button'), input = element('input'); input.value = 'Renamed task';
  const row = element('li'); row.children = [input, button];
  row.insertBefore = (node, before) => row.children.splice(row.children.indexOf(before), 0, node);
  row.removeChild = node => row.children.splice(row.children.indexOf(node), 1);
  row.classList.add('edit');
  const todo = { title: 'Original task' };
  let saved = 0;
  const context = {
    input, li: row, todo, previousTitle: todo.title,
    document: { createTextNode: text => ({ nodeType: 3, textContent: text }) },
    SaveToDoData() { saved++; }, suppressTimeout: null, suppressNextClick: true,
    setTimeout(fn) { fn(); return 1; }, clearTimeout() {}
  };
  vm.createContext(context); vm.runInContext(saveEdit + '\nsaveEdit();', context);
  assert.equal(saved, 1, 'Rename must persist exactly once');
  assert.equal(todo.title, 'Renamed task');
  assert.equal(row.children.includes(input), false, 'Editor must be removed');
  assert.equal(row.classList.contains('edit'), false, 'Editing state must clear');
  assert.equal(context.suppressNextClick, false, 'Click suppression must eventually clear');
}
async function runGalleryProbe() {
  const source = read('scripts/wallpaper-gallery.js');
  // Includes gallery-local state and helpers so a nearby render revision counter
  // is retained. IndexedDB is replaced by two explicitly resolved promises.
  const gallerySource = between(source, '    // ---------- Gallery UI ----------', '    function renderSelection()');
  const grid = element(), pending = [];
  const context = {
    KEY_SHOW_HIDDEN: 'hidden', KEY_CURRENT: 'current',
    document: { getElementById: id => id === 'wallpaperGalleryGrid' ? grid : null, createElement: element },
    localStorage: { getItem: () => null },
    hiddenIds: () => new Set(),
    allItems: () => new Promise(resolve => pending.push(resolve)),
    t: (key, fallback) => fallback,
    URL: { createObjectURL() { throw Error('No blob expected in this fixture'); }, revokeObjectURL() {} },
    setTimeout, clearTimeout
  };
  vm.createContext(context); vm.runInContext(gallerySource, context);
  const first = context.renderGallery(), second = context.renderGallery();
  const items = [{ id: 'one', type: 'video', source: 'bundled', name: 'One' }];
  pending[0](items); await first;
  pending[1](items); await second;
  assert.equal(grid.children.length, 1, 'Two pending renders must not duplicate gallery cards');
  assert.equal(grid.children[0].dataset.id, 'one');
  const old = context.renderGallery(), newest = context.renderGallery();
  pending[3]([{...items[0],id:'latest'}]); await newest;
  pending[2](items); await old;
  assert.equal(grid.children[0].dataset.id,'latest','An older render cannot replace the latest cards');

}
async function runBookmarkFocusProbe() {
 const source=read('scripts/bookmarks.js'), pending=[], sidebar=element('div');
 const focusNode=()=>({hidden:false,focused:false,focus(){this.focused=true;}});
 const button=focusNode(); button.classList=classes(); button.setAttribute=()=>{};
 const close=focusNode(),primary={...focusNode(),hidden:true},search={...focusNode(),disabled:true};
 sidebar.removeAttribute=()=>{};
 const context={bookmarkSidebar:sidebar,bookmarkButton:button,bookmarkCloseButton:close,bookmarkStatePrimary:primary,bookmarkSearch:search,
  refreshBookmarkAvailability:()=>new Promise(resolve=>pending.push(resolve))};
 vm.createContext(context);
 vm.runInContext(between(source,'function openBookmarkSidebar() {','function closeBookmarkSidebar() {'),context);
 context.openBookmarkSidebar();sidebar.classList.remove('open');pending.shift()();await Promise.resolve();assert.equal(close.focused,false,'Closed panels must not steal focus after async availability checks');
 context.openBookmarkSidebar();pending.shift()();await Promise.resolve();assert.equal(close.focused,true,'Preview fallback focuses the usable close button');
 let closed=false;context.editBookmarkModal={open:false};context.closeBookmarkSidebar=()=>{closed=true;};
 vm.runInContext(between(source,'bookmarkSidebar.addEventListener("keydown", event => {','document.addEventListener("keydown", event => {\n    trapBookmarkFocus(event);'),context);
 const event={key:'Escape',preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};
 sidebar.listeners.keydown.forEach(fn=>fn(event));assert.ok(closed&&event.prevented&&event.stopped,'Sidebar Escape must not reach layout draft cancellation');
}
function runGalleryModeProbe() {
  const source = read('scripts/wallpaper-gallery.js');
  const controls = {wallpaperModeSelect:element('select'), wallpaperMinutesSelect:element('select'), wallpaperIntervalGroup:element()};
  const saved = new Map([['mode','fixed'],['minutes','30']]); let schedules = 0;
  const context = {$:id=>controls[id], mode:()=>saved.get('mode'), minutes:()=>Number(saved.get('minutes')),
    KEY_MODE:'mode', KEY_MINUTES:'minutes', localStorage:{setItem:(k,v)=>saved.set(k,v)}, scheduleRotate:()=>schedules++};
  vm.createContext(context);
  vm.runInContext(between(source, '        const modeSel = $("wallpaperModeSelect");', '        document.addEventListener("keydown", e => {'), context);
  const select=controls.wallpaperModeSelect, interval=controls.wallpaperIntervalGroup, minutes=controls.wallpaperMinutesSelect;
  assert.ok(interval.hidden && minutes.disabled, 'Fixed mode does not show inactive rotation settings');
  assert.equal(minutes.value,'30');
  for (const value of ['rotate','fixed','random','rotate']) {
    select.value=value; select.listeners.change[0]();
    assert.equal(interval.hidden,value!=='rotate'); assert.equal(minutes.disabled,value!=='rotate');
    assert.equal(minutes.value,'30', 'Changing mode never resets the saved interval');
    assert.equal(saved.get('mode'),value);
  }
  minutes.value='60'; minutes.listeners.change[0](); assert.equal(saved.get('minutes'),'60'); assert.equal(schedules,5);
  const upload=element('button'), fileInput=element('input'); let fileClicks=0; fileInput.click=()=>fileClicks++;
  vm.runInNewContext(between(source, '        $("wallpaperAddFilesBtn")?.addEventListener', '        $("wallpaperFileInput")?.addEventListener'), {$:id=>id==='wallpaperAddFilesBtn'?upload:fileInput});
  upload.click(); assert.equal(fileClicks,1,'Native upload button opens the existing file input once');
  const html=read('index.html');
  assert.match(html,/<button type="button" id="wallpaperAddFilesBtn"/,'Upload is a native keyboard-operable button');
  for(const id of Object.keys(controls)) assert.equal(html.split(`id="${id}"`).length-1,1,`Exactly one ${id}`);
}
(async () => {
  let failed = 0;
  for (const [name, test] of [['GALLERY_MODE_CONTROLS', runGalleryModeProbe], ['BOOKMARK_FOCUS_AND_ESCAPE', runBookmarkFocusProbe], ['TASK_RENAME', runTodoProbe], ['GALLERY_RENDER_RACE', runGalleryProbe]]) {
    try { await test(); console.log(`PASS ${name}`); }
    catch (error) { failed++; console.error(`FAIL ${name}: ${error.name}: ${error.message}`); }
  }
  process.exitCode = failed ? 1 : 0;
})();

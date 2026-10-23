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
  // This executes the exact production saveEdit body, including a potential fix
  // that resolves the DaiDai button from the row rather than an out-of-scope name.
  const saveEdit = between(source, '            function saveEdit()', '            // Cancel function');
  const button = element('button'), input = element('input'); input.value = 'Renamed task';
  const row = element('li'); row.children = [input, button];
  row.querySelector = selector => selector === '.todoDaidaiBtn' ? button : null;
  row.insertBefore = (node, before) => row.children.splice(row.children.indexOf(before), 0, node);
  row.removeChild = node => row.children.splice(row.children.indexOf(node), 1);
  row.classList.add('edit');
  const todo = { title: 'Original task' };
  let saved = 0, labelled = 0;
  const context = {
    input, li: row, todo, previousTitle: todo.title,
    document: { createTextNode: text => ({ nodeType: 3, textContent: text }) },
    setTodoDaidaiLabel(node, title) { assert.equal(node, button); assert.equal(title, 'Renamed task'); labelled++; },
    SaveToDoData() { saved++; }, suppressTimeout: null, suppressNextClick: true,
    setTimeout(fn) { fn(); return 1; }, clearTimeout() {}
  };
  vm.createContext(context); vm.runInContext(saveEdit + '\nsaveEdit();', context);
  assert.equal(saved, 1, 'Rename must persist exactly once');
  assert.equal(labelled, 1, 'DaiDai label must update on the edited row');
  assert.equal(todo.title, 'Renamed task');
  assert.equal(row.children.includes(input), false, 'Editor must be removed');
  assert.equal(row.classList.contains('edit'), false, 'Editing state must clear');
  assert.equal(context.suppressNextClick, false, 'Click suppression must eventually clear');
}
function makeSearchFixture() {
  const source = read('scripts/search-suggestions.js');
  // Include state, helpers, input/keyboard handlers, fetch implementation and
  // outside-click dismissal; omit permission/setup listeners completely.
  const searchSource = between(source, '// ---------------------------- Search Suggestions', '// ------------------------- Toggles');
  const searchInput = element('input'), resultBox = element(), searchbar = element();
  searchbar.children = [searchInput, resultBox];
  const checkbox = { checked: true }, pending = [], documentListeners = {};
  const document = {
    activeElement: searchInput,
    getElementById(id) { return id === 'resultBox' ? resultBox : id === 'searchsuggestionscheckbox' ? checkbox : { checked: false }; },
    createElement: element,
    addEventListener(type, fn) { (documentListeners[type] ||= []).push(fn); }
  };
  const context = { searchInput, searchbar, document, SEARCH_BANGS: {},
    isFirefox: true, isOpera: false, isChromiumBased: false, isSafari: false,
    console, AbortController, setTimeout, clearTimeout, performSearch() {},
    fetch(url) { return new Promise(resolve => pending.push({ url, resolve })); }
  };
  vm.createContext(context); vm.runInContext(searchSource, context);
  return {
    searchInput, resultBox, document,
    type(value) { searchInput.value = value; return searchInput.listeners.input[0].call(searchInput); },
    async resolve(index, suggestions) { pending[index].resolve({ ok: true, json: async () => ['', suggestions] }); },
    outside() { const target = element('button'); document.activeElement = target; for (const fn of documentListeners.click || []) fn({ target }); },
    escape() { for (const fn of searchInput.listeners.keydown || []) fn.call(searchInput, { key: 'Escape', preventDefault() {}, stopPropagation() {} }); }
  };
}
async function runSearchProbe() {
  const results = [];
  {
    const f = makeSearchFixture();
    const old = f.type('old'), recent = f.type('new');
    await f.resolve(1, ['NEW']); await recent;
    await f.resolve(0, ['OLD']); await old;
    results.push(['Latest query wins', f.resultBox.children.map(x => x.textContent).join('|') === 'NEW']);
  }
  {
    const f = makeSearchFixture();
    const pending = f.type('typing'); f.outside();
    await f.resolve(0, ['LATE']); await pending;
    results.push(['Outside dismissal survives late response', !f.resultBox.classList.contains('show')]);
  }
  {
    const f = makeSearchFixture();
    const pending = f.type('typing'); await f.resolve(0, ['MATCH']); await pending;
    f.escape();
    results.push(['Escape dismisses suggestions', !f.resultBox.classList.contains('show')]);
  }
  assert.ok(results.every(([, ok]) => ok), results.map(([name, ok]) => `${ok ? 'PASS' : 'FAIL'}: ${name}`).join('; '));
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
function runFocusEscapeProbe() {
 const source=read('scripts/focus-card.js'), panel={hidden:false}, more={focused:false,focus(){this.focused=true;}};
 const context={panel,more,setPanel(open){panel.hidden=!open;}}; vm.createContext(context);
 vm.runInContext(between(source,'    const dismissPanel = event => {','    panel.addEventListener("keydown", dismissPanel);')+'\nthis.dismiss=dismissPanel;',context);
 const event={key:'Escape',preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};
 context.dismiss({...event,isComposing:true}); assert.equal(panel.hidden,false);
 context.dismiss(event); assert.equal(panel.hidden,true); assert.ok(more.focused&&event.prevented&&event.stopped);
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
  for (const [name, test] of [['GALLERY_MODE_CONTROLS', runGalleryModeProbe], ['BOOKMARK_FOCUS_AND_ESCAPE', runBookmarkFocusProbe], ['FOCUS_PANEL_ESCAPE', runFocusEscapeProbe], ['TASK_RENAME', runTodoProbe], ['SEARCH_DISMISSAL_AND_ORDER', runSearchProbe], ['GALLERY_RENDER_RACE', runGalleryProbe]]) {
    try { await test(); console.log(`PASS ${name}`); }
    catch (error) { failed++; console.error(`FAIL ${name}: ${error.name}: ${error.message}`); }
  }
  process.exitCode = failed ? 1 : 0;
})();

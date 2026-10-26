/* Focused, dependency-free editor regression tests. Browser pointer QA is separate. */
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../scripts/layout-editor.js'), 'utf8');
const { myntNormalizeLayout, myntSnapMove, myntLayoutHistory } = require('../scripts/layout-editor.js');
const clone = value => JSON.parse(JSON.stringify(value));

// Rectangle-based grid snapping, alignment priority, exact opt-out.
const rect = { left: 103, top: 117, right: 203, bottom: 167, width: 100, height: 50 };
assert.deepEqual(myntSnapMove(rect, 11, 9, [], 1000, 800, false), { dx: 11, dy: 9, guides: [] });
const grid = myntSnapMove(rect, 24, 40, [], 1000, 800, true);
assert.equal((rect.left + grid.dx) % 16, 0);
assert.equal((rect.top + grid.dy) % 16, 0);
const alignment = myntSnapMove(rect, 94, 0, [{ left: 200, right: 300, top: 310, bottom: 350, width: 100, height: 40 }], 1000, 800, true);
assert.equal(rect.left + alignment.dx, 200);
assert.ok(alignment.guides.some(g => g.kind === 'alignment' && g.value === 200));
const history = myntLayoutHistory({ n: 0 });
history.record({ n: 1 }); history.record({ n: 2 });
assert.deepEqual(history.undo(), { n: 1 });
assert.deepEqual(history.redo(), { n: 2 });
history.undo(); history.record({ n: 3 }); assert.equal(history.canRedo(), false);
const snapshot = history.undo(); snapshot.n = 99; assert.deepEqual(history.redo(), { n: 3 });

class FakeElement {
    constructor(tag, owner) {
        this.tagName = tag.toUpperCase(); this.ownerDocument = owner; this.children = []; this.parentNode = null;
        this.listeners = new Map(); this.attributes = {}; this.dataset = {}; this.hidden = false; this.disabled = false;
        const classes = new Set();
        this.classList = { add: (...xs) => xs.forEach(x => classes.add(x)), remove: (...xs) => xs.forEach(x => classes.delete(x)), contains: x => classes.has(x), toggle: (x, on) => { if (on === undefined) on = !classes.has(x); on ? classes.add(x) : classes.delete(x); return on; } };
        Object.defineProperty(this, 'className', { get: () => [...classes].join(' '), set: value => { classes.clear(); value.split(/\s+/).filter(Boolean).forEach(x => classes.add(x)); } });
        this.style = { setProperty(key, value) { this[key] = value; }, removeProperty(key) { delete this[key]; delete this[key.replace(/-([a-z])/g, (_, x) => x.toUpperCase())]; } };
    }
    append(...nodes) { for (const node of nodes) { node.remove?.(); this.children.push(node); node.parentNode = this; } }
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(x => x !== this); this.parentNode = null; }
    replaceChildren(...nodes) { this.children.forEach(n => { n.parentNode = null; }); this.children = []; this.append(...nodes); }
    setAttribute(key, value) { this.attributes[key] = value; }
    removeAttribute(key) { delete this.attributes[key]; if (key === 'id') this.id = ''; }
    addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
    removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
    dispatchEvent(event) { this.lastDispatched = event; return this.emit(event.type, event); }
    emit(type, data = {}) {
        const event = { target: this, currentTarget: this, key: '', button: 0, isPrimary: true, pointerId: 1, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...data };
        let node = this;
        while (node) { event.currentTarget = node; [...(node.listeners.get(type) || [])].forEach(fn => fn(event)); if (event.stopped) break; node = node.parentNode; }
        return event;
    }
    click() { if (!this.disabled) return this.emit('click'); }
    focus() { this.ownerDocument.activeElement = this; this.emit('focus'); }
    setPointerCapture(id) { this.pointerCapture = id; }
    hasPointerCapture(id) { return this.pointerCapture === id; }
    releasePointerCapture() { this.pointerCapture = null; }
    all() { return this.children.flatMap(c => [c, ...(c.all?.() || [])]); }
    querySelector(selector) { return this.all().find(x => selector === 'button:not(:disabled)' ? x.tagName === 'BUTTON' && !x.disabled : selector[0] === '#' ? x.id === selector.slice(1) : selector[0] === '.' ? x.classList.contains(selector.slice(1)) : false) || null; }
    closest(selector) { return /input|textarea/.test(selector) && ['INPUT', 'TEXTAREA', 'SELECT'].includes(this.tagName) ? this : null; }
    getBoundingClientRect() {
        const r = this.rect || { left: 0, top: 0, width: 0, height: 0 };
        const [x, y] = (this.style.translate || '0 0').split(/\s+/).map(parseFloat), scale = Number(this.style.scale || 1);
        const left = r.left + (x || 0), top = r.top + (y || 0), width = r.width * scale, height = r.height * scale;
        return { left, top, width, height, right: left + width, bottom: top + height };
    }
}
function editor(raw) {
    const storage = new Map([['myntLayout', raw]]); let writes = 0, blocked = false;
    const document = new FakeElement('document'); document.ownerDocument = document;
    document.body = new FakeElement('body', document); document.append(document.body);
    document.createElement = tag => new FakeElement(tag, document);
    document.createTextNode = text => Object.assign(new FakeElement('#text', document), { textContent: text });
    document.getElementById = id => document.all().find(x => x.id === id) || null;
    document.querySelectorAll = selector => {
        const selectors = selector.split(',').map(x => x.trim());
        return document.all().filter(el => selectors.some(s => s[0] === '#' ? el.id === s.slice(1) : s[0] === '.' ? el.classList.contains(s.slice(1)) : false));
    };
    const search = document.createElement('section'); search.id = 'rightDiv'; search.rect = { left: 100, top: 180, width: 300, height: 60 }; document.body.append(search);
    const focus = document.createElement('section'); focus.className = 'ttteexxtt'; focus.rect = { left: 600, top: 110, width: 250, height: 80 }; document.body.append(focus);
    const bookmark = document.createElement('button'); bookmark.id = 'bookmarkButton'; bookmark.rect = { left: 20, top: 30, width: 64, height: 64 }; document.body.append(bookmark);
    const setting = document.createElement('input'); setting.id = 'layoutEditCheckbox'; document.body.append(setting);
    const globalEvents = new Map();
    const ctx = {
        confirm:()=>true,document, CustomEvent: class { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } }, innerWidth: 1200, innerHeight: 800, setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
        localStorage: { getItem: key => storage.get(key) || null, setItem(key, value) { if (blocked) throw Error('Storage full'); writes++; storage.set(key, value); } },
        getComputedStyle: el => ({ display: el.hidden ? 'none' : 'block', visibility: 'visible' }),
        addEventListener(type, fn) { if (!globalEvents.has(type)) globalEvents.set(type, new Set()); globalEvents.get(type).add(fn); },
        removeEventListener(type, fn) { globalEvents.get(type)?.delete(fn); }
    };
    ctx.window = ctx; vm.runInNewContext(source, ctx); document.emit('DOMContentLoaded');
    const id = value => document.getElementById(value);
    const overlay = () => document.all().find(x => x.dataset?.block === 'search');
    const handle = () => overlay().querySelector('.myntLayoutMove');
    return { ctx, document, storage, search, bookmark, id, handle, overlay, globalEvents, writes: () => writes, blockSave: value => { blocked = value; } };
}
const raw = '{ "version": 2, "snap": false, "locked": true, "blocks": { "search": { "x": 0.05, "y": 0.02, "s": 1 } } }';
const app = editor(raw), original = clone(app.ctx.myntLayout.get());
assert.equal(app.ctx.myntLayout.isEditing(), false);
assert.equal(app.document.lastDispatched.type, 'mynt:layout-applied', 'Initial layout broadcasts the production refresh event');
assert.equal(app.search.listeners.size, 0, 'Underlying content is not a drag surface');
app.id('myntLayoutEdit').click();
assert.equal(app.ctx.myntLayout.isEditing(), true);
assert.equal(app.writes(), 0);
assert.equal(app.ctx.myntLayout.get().locked, false);
assert.equal(app.id('myntLayoutSave').disabled,true);app.id('myntLayoutSave').click();assert.equal(app.writes(),0);
assert.match(app.id('myntLayoutState').textContent,/Saved/);
const beforeDockChange = clone(app.ctx.myntLayout.get());
app.id('myntLayoutDockToggle').click(); assert.equal(app.id('myntLayoutToolbar').dataset.dock, 'top');
app.id('myntLayoutDockToggle').click(); assert.equal(app.id('myntLayoutToolbar').dataset.dock, 'bottom');
assert.deepEqual(clone(app.ctx.myntLayout.get()), beforeDockChange); assert.equal(app.writes(), 0);
app.id('myntLayoutSnap').checked = true; app.id('myntLayoutSnap').emit('change');
const beforeDrag = clone(app.ctx.myntLayout.get());
let handle = app.handle();
handle.emit('pointerdown', { clientX: 170, clientY: 190 });
handle.emit('pointermove', { clientX: 266, clientY: 238 });
assert.ok(app.id('myntLayoutGuides').children.length > 0, 'Snapping guides are visible while dragging');
handle.emit('pointerup');
const afterDrag = clone(app.ctx.myntLayout.get());
assert.notDeepEqual(afterDrag.blocks.search, beforeDrag.blocks.search);
assert.equal(app.writes(), 0);
app.id('myntLayoutUndo').click(); assert.deepEqual(clone(app.ctx.myntLayout.get()), beforeDrag);
app.id('myntLayoutRedo').click(); assert.deepEqual(clone(app.ctx.myntLayout.get()), afterDrag);
app.id('myntLayoutCancel').click();
assert.deepEqual(clone(app.ctx.myntLayout.get()), original);
assert.equal(app.storage.get('myntLayout'), raw, 'Cancel preserves saved bytes exactly');
assert.equal(app.writes(), 0); assert.equal(app.ctx.myntLayout.isEditing(), false);

// Pointer cancellation is not an edit, and a single drag is one history step.
app.id('myntLayoutEdit').click(); handle = app.handle();
const beforeCancel = clone(app.ctx.myntLayout.get());
handle.emit('pointerdown', { clientX: 100, clientY: 200 });
handle.emit('pointermove', { clientX: 190, clientY: 240 });
handle.emit('pointercancel');
assert.deepEqual(clone(app.ctx.myntLayout.get()), beforeCancel);
assert.equal(app.id('myntLayoutUndo').disabled, true);
handle.emit('pointerdown', { clientX: 100, clientY: 200 }); handle.emit('pointerup');
assert.equal(app.id('myntLayoutUndo').disabled, true, 'Tap does not create an edit');

// Nudges are exactly 1/10px and are never rounded to the snap grid.
const startX = app.search.getBoundingClientRect().left;
handle.emit('keydown', { key: 'ArrowRight' });
assert.equal(app.search.getBoundingClientRect().left, startX + 1);
handle.emit('keydown', { key: 'ArrowRight', shiftKey: true });
assert.equal(app.search.getBoundingClientRect().left, startX + 11);
app.id('myntLayoutUndo').click(); assert.equal(app.search.getBoundingClientRect().left, startX + 1);
app.blockSave(true); app.id('myntLayoutSave').click();
assert.equal(app.ctx.myntLayout.isEditing(), true, 'Failed save leaves the edit draft usable');
assert.equal(app.ctx.myntLayout.get().locked, false); assert.equal(app.writes(), 0);
assert.match(app.id('myntLayoutSaveStatus').textContent, /儲存失敗/);
app.blockSave(false); app.id('myntLayoutSave').click();
assert.equal(app.writes(), 1); assert.equal(app.ctx.myntLayout.isEditing(), false);
assert.equal(JSON.parse(app.storage.get('myntLayout')).locked, true);
assert.equal(app.document.all().filter(x => x.classList.contains('myntLayoutOverlay')).length, 0);
const reloaded = editor(app.storage.get('myntLayout'));
assert.equal(reloaded.search.getBoundingClientRect().left, startX + 1);
assert.equal(reloaded.ctx.myntLayout.isEditing(), false);

// Legacy unlocked state is restored by Cancel, without automatically enabling dragging.
const unlockedRaw = JSON.stringify({ ...JSON.parse(raw), locked: false });
const unlocked = editor(unlockedRaw);
assert.equal(unlocked.ctx.myntLayout.isEditing(), false);
unlocked.id('myntLayoutEdit').click(); unlocked.handle().emit('keydown', { key: 'ArrowDown' }); unlocked.ctx.myntLayout.cancel();
assert.equal(unlocked.ctx.myntLayout.get().locked, false); assert.equal(unlocked.storage.get('myntLayout'), unlockedRaw);
assert.equal(unlocked.writes(), 0);
assert.equal(myntNormalizeLayout({ version: 1, blocks: {} }).version, 2);
console.log('MANUAL_EDITOR_CHECK_OK: snapping, history, pointer cancel, exact Cancel, 1/10px keys, failed save, save/lock/reload, legacy data, and non-hijacked content');

// Browser may suppress the native dialog; the handler must still checkpoint and request it.
const warning=editor(raw);warning.id('myntLayoutEdit').click();warning.handle().emit('keydown',{key:'ArrowRight'});
const event={preventDefault(){this.prevented=true}};for(const fn of warning.globalEvents.get('beforeunload'))fn(event);assert.equal(event.prevented,true);assert.equal(event.returnValue,'');
warning.id('myntLayoutCancel').click();const clean={preventDefault(){this.prevented=true}};for(const fn of warning.globalEvents.get('beforeunload'))fn(clean);assert.equal(clean.prevented,undefined);
// Center computes the post-scale, viewport-fitted rectangle, not the old width.
const precise=source.slice(source.indexOf('    function preciseChange(mode)'),source.indexOf('    function buildToolbar()'));
for(const scale of [0.5,1.5,2]){
 const layout={locked:false,blocks:{search:{x:0,y:0,s:1}}};let records=0;
 const element={getBoundingClientRect(){return {left:100+layout.blocks.search.x*1000,top:100+layout.blocks.search.y*800,width:200*layout.blocks.search.s,height:50*layout.blocks.search.s}}};
 const c={editing:true,layout,selected:'search',activeDrag:null,innerWidth:1000,innerHeight:800,preciseFields:{x:{value:'100'},y:{value:'100'},s:{value:String(scale*100)}},elementFor:()=>element,currentBlock:()=>({...layout.blocks.search}),applyBlock(){},placeOverlays(){},recordChange(){records++},announce(){throw Error('invalid')},t:(_,v)=>v};
 vm.createContext(c);vm.runInContext(precise,c);c.preciseChange('center');const r=element.getBoundingClientRect();assert.equal(r.left+r.width/2,500);assert.equal(records,1);
}
console.log('PRECISE_CENTER_OK: resizing and centering in one action uses the new rendered width');


// Compact controls preserve the icon, capture only their own editing surface,
// and expose size controls in the existing toolbar instead of an oversized corner.
const compact = editor(raw); let opened = 0;
compact.bookmark.addEventListener('click', () => opened++);
compact.ctx.myntLayout.setEditing(true);
const small = compact.document.all().find(x => x.dataset.block === 'bookmarks');
const smallHandle = small.querySelector('.myntLayoutMove');
assert.equal(smallHandle.textContent, '');
assert(smallHandle.attributes['aria-label'].includes('Bookmarks'));
assert.equal(small.querySelector('.myntLayoutResize'), null);
assert.equal(compact.bookmark.inert, true, 'Underlying entry cannot receive keyboard activation while editing');
assert.equal(small.style.width, '64px'); assert.equal(small.style.height, '64px');
assert.equal(compact.handle().hidden, true, 'Unselected card handles are hidden');
assert.equal(compact.overlay().tabIndex, 0, 'Unselected card remains keyboard selectable');
for (const kind of ['click','auxclick','dblclick','contextmenu']) {
 const e=smallHandle.emit(kind); assert(e.defaultPrevented && e.stopped, kind+' never activates the entry');
}
assert.equal(opened,0); assert.equal(compact.id('myntLayoutSizePresets').hidden,false);
assert.equal(compact.id('myntLayoutTarget').value,'bookmarks');
assert.equal(compact.id('myntLayoutTarget').children[0].disabled,true,'Placeholder cannot clear the displayed selection while old handles remain active');
const beforeSmall=clone(compact.ctx.myntLayout.get());
smallHandle.emit('pointerdown',{clientX:30,clientY:40,pointerType:'touch'});
smallHandle.emit('pointermove',{clientX:65,clientY:58,pointerType:'touch'});
smallHandle.emit('pointercancel');
assert.deepEqual(clone(compact.ctx.myntLayout.get()),beforeSmall);
assert.equal(compact.id('myntLayoutUndo').disabled,true);
const largePreset=compact.id('myntLayoutSizePresets').children.find(x=>x.dataset.scale==='1.25');
largePreset.click();assert.equal(compact.ctx.myntLayout.get().blocks.bookmarks.s,1.25);
assert.equal(largePreset.attributes['aria-pressed'],'true');
compact.ctx.myntLayout.undo();assert.deepEqual(clone(compact.ctx.myntLayout.get()),beforeSmall);
compact.ctx.myntLayout.redo();assert.equal(compact.ctx.myntLayout.get().blocks.bookmarks.s,1.25);
compact.overlay().focus();assert.equal(compact.handle().hidden,false);
assert.equal(compact.id('myntLayoutSizePresets').hidden,true);
compact.search.rect.width=64;compact.search.rect.height=64;compact.ctx.myntLayout.applyAll();
assert.equal(compact.overlay().querySelector('.myntLayoutResize').hidden,true,'Two 44px controls never overlap in a small card');
compact.search.rect.width=300;compact.search.rect.height=60;compact.ctx.myntLayout.applyAll();
assert.equal(compact.overlay().querySelector('.myntLayoutResize').hidden,false);
assert.equal(compact.document.all().filter(x=>x.classList.contains('myntLayoutOverlay')&&x.classList.contains('is-selected')).length,1);
compact.id('myntLayoutTarget').value='bookmarks';compact.id('myntLayoutTarget').emit('change');
assert.equal(compact.handle().hidden,true);assert.equal(compact.id('myntLayoutSizePresets').hidden,false);
smallHandle.emit('keydown',{key:'-'});assert.equal(compact.ctx.myntLayout.get().blocks.bookmarks.s,1.2);
compact.ctx.innerWidth=393;compact.ctx.innerHeight=600;compact.ctx.myntLayout.applyAll();
assert.equal(small.style.width,String(compact.bookmark.getBoundingClientRect().width)+'px','Overlay stays inside rendered small entry');
compact.ctx.myntLayout.cancel();assert.equal(compact.bookmark.inert,false);assert.equal(compact.storage.get('myntLayout'),raw);
assert.equal(compact.document.all().filter(x=>x.classList.contains('myntLayoutOverlay')).length,0);
compact.bookmark.click();assert.equal(opened,1,'Original entry behavior returns after cancel');
compact.bookmark.inert=true;compact.ctx.myntLayout.setEditing(true);compact.ctx.myntLayout.cancel();assert.equal(compact.bookmark.inert,true,'Existing inert state is preserved');
const compactSave=editor(raw);compactSave.ctx.myntLayout.setEditing(true);compactSave.id('myntLayoutTarget').value='bookmarks';compactSave.id('myntLayoutTarget').emit('change');compactSave.id('myntLayoutSizePresets').children.find(x=>x.dataset.scale==='.75'||x.dataset.scale==='0.75').click();compactSave.id('myntLayoutSave').click();assert.equal(compactSave.bookmark.inert,false);assert.equal(editor(compactSave.storage.get('myntLayout')).ctx.myntLayout.get().blocks.bookmarks.s,.75);
const controlsCss=fs.readFileSync(path.join(__dirname,'../styles/manual-editor-controls.css'),'utf8');
assert(controlsCss.includes('width: 44px; height: 44px;'));
assert(controlsCss.includes('inset: 0; width: 100%; height: 100%;'));
assert(!controlsCss.includes('--mynt-resize-right'));
assert(!controlsCss.includes('--mynt-handle-top'));
console.log('COMPACT_EDITOR_OK: transparent small entry, inert restoration, activation guards, selected-only handles, toolbar sizes, touch pointercancel, history, narrow bounds and save/reload. DOM/pointer simulation, not real browser hit testing.');

// Editing must not consume IME cancellation, handled events, or browser shortcuts.
const ignoredKeys = [{ isComposing: true }, { keyCode: 229 }, { defaultPrevented: true }];
for (const flags of [...ignoredKeys, { ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '_']) {
        const guarded = editor(raw); guarded.ctx.myntLayout.setEditing(true);
        const before = clone(guarded.ctx.myntLayout.get());
        const event = guarded.handle().emit('keydown', { key, ...flags });
        assert.deepEqual(clone(guarded.ctx.myntLayout.get()), before, `${key} with ${JSON.stringify(flags)} preserves layout`);
        assert.equal(Boolean(event.defaultPrevented), Boolean(flags.defaultPrevented), 'Native key behavior remains available');
        assert.equal(guarded.id('myntLayoutUndo').disabled, true, 'Ignored keys do not record history');
    }
}
for (const flags of ignoredKeys) {
    for (const keys of [{ key: 'Escape' }, { key: 'l', code: 'KeyL', altKey: true }, { key: 'z', ctrlKey: true }, { key: 'y', ctrlKey: true }]) {
        const guarded = editor(raw); guarded.ctx.myntLayout.setEditing(true);
        guarded.handle().emit('keydown', { key: 'ArrowRight' });
        const before = clone(guarded.ctx.myntLayout.get());
        guarded.document.emit('keydown', { ...keys, ...flags });
        assert.equal(guarded.ctx.myntLayout.isEditing(), true, 'IME/handled keys cannot discard the draft');
        assert.deepEqual(clone(guarded.ctx.myntLayout.get()), before, 'IME/handled keys cannot change history');
        assert.equal(guarded.writes(), 0);
    }
}
const shortcuts = editor(raw); shortcuts.ctx.myntLayout.setEditing(true);
shortcuts.handle().emit('keydown', { key: '+', shiftKey: true });
assert.equal(shortcuts.ctx.myntLayout.get().blocks.search.s, 1.05);
shortcuts.document.emit('keydown', { key: 'z', ctrlKey: true });
assert.equal(shortcuts.ctx.myntLayout.get().blocks.search.s, 1);
shortcuts.document.emit('keydown', { key: 'z', metaKey: true, shiftKey: true });
assert.equal(shortcuts.ctx.myntLayout.get().blocks.search.s, 1.05);
shortcuts.document.emit('keydown', { key: 'Escape' });
assert.equal(shortcuts.ctx.myntLayout.isEditing(), false);
assert.equal(shortcuts.storage.get('myntLayout'), raw);
const bypass = editor(raw); bypass.ctx.myntLayout.setEditing(true);
bypass.id('myntLayoutSnap').checked = true; bypass.id('myntLayoutSnap').emit('change');
const bypassStart = bypass.search.getBoundingClientRect().left;
bypass.handle().emit('pointerdown', { clientX: 200, clientY: 200 });
bypass.handle().emit('pointermove', { clientX: 207, clientY: 200, altKey: true });
bypass.handle().emit('pointerup');
assert.equal(bypass.search.getBoundingClientRect().left, bypassStart + 7, 'Alt-drag still bypasses snapping');
console.log('EDITOR_KEY_GUARDS_OK: IME/handled events preserve drafts, modified arrows/size keys remain native, plain/Shift editing and undo/redo/Escape work, Alt-drag bypass is preserved. Mock-only coverage.');

const gaps=[{left:100,right:200,top:100,bottom:150,width:100,height:50},{left:500,right:600,top:100,bottom:150,width:100,height:50}];
const gapRect={left:310,right:410,top:100,bottom:150,width:100,height:50};const originalPeers=JSON.stringify(gaps);
const equal=myntSnapMove(gapRect,-7,0,gaps,1200,800,true);assert.equal(gapRect.left+equal.dx,300);assert(equal.guides.some(g=>g.kind==='spacing'&&g.gap===100));assert.equal(JSON.stringify(gaps),originalPeers);
const into=myntSnapMove({...gapRect,top:0,bottom:50},-7,100,gaps,1200,800,true);assert.equal(gapRect.left+into.dx,300);assert(into.guides.some(g=>g.kind==='spacing'));
const away=myntSnapMove(gapRect,-7,200,gaps,1200,800,true);assert(!away.guides.some(g=>g.kind==='spacing'));
const cleanSave=editor(raw);cleanSave.ctx.myntLayout.setEditing(true);cleanSave.handle().emit('keydown',{key:'ArrowRight'});assert.equal(cleanSave.id('myntLayoutSave').disabled,false);cleanSave.ctx.myntLayout.undo();assert.equal(cleanSave.id('myntLayoutSave').disabled,true);cleanSave.id('myntLayoutSave').click();assert.equal(cleanSave.writes(),0);
const refuse=editor(raw);let asked=0;refuse.ctx.confirm=()=>{asked++;return false;};refuse.ctx.myntLayout.setEditing(true);refuse.document.emit('keydown',{key:'Escape'});assert.equal(asked,0);assert.equal(refuse.ctx.myntLayout.isEditing(),false);refuse.ctx.myntLayout.setEditing(true);refuse.handle().emit('keydown',{key:'ArrowRight'});const pending=JSON.stringify(refuse.ctx.myntLayout.get());refuse.document.emit('keydown',{key:'Escape'});assert.equal(asked,1);assert.equal(refuse.ctx.myntLayout.isEditing(),true);assert.equal(JSON.stringify(refuse.ctx.myntLayout.get()),pending);
console.log('EDITOR_STATES_OK: clean saves are disabled/zero-write, undo clears dirty, leave confirmation is dirty-only, equal spacing moves no peers');
(async()=>{
 const asyncApp=editor(raw);let resolve,calls=0;asyncApp.ctx.myntDialog={confirm(){calls++;return new Promise(r=>resolve=r);}};
 asyncApp.ctx.myntLayout.setEditing(true);asyncApp.handle().emit('keydown',{key:'ArrowRight'});const pending=JSON.stringify(asyncApp.ctx.myntLayout.get());
 asyncApp.id('layoutEditCheckbox').checked=false;asyncApp.id('layoutEditCheckbox').emit('change');asyncApp.document.emit('keydown',{key:'Escape'});assert.equal(calls,1);assert(asyncApp.ctx.myntLayout.isEditing());
 resolve(false);await new Promise(setImmediate);assert.equal(asyncApp.id('layoutEditCheckbox').checked,true);assert.equal(JSON.stringify(asyncApp.ctx.myntLayout.get()),pending);
 asyncApp.id('myntLayoutCancel').click();assert.equal(calls,2);resolve(true);await new Promise(setImmediate);assert.equal(asyncApp.ctx.myntLayout.isEditing(),false);assert.equal(asyncApp.storage.get('myntLayout'),raw);assert.equal(asyncApp.writes(),0);
 console.log('ASYNC_LEAVE_OK: pending confirmation blocks repeated exits, declined toggle restores checkbox/draft, confirmed Cancel preserves saved bytes');
})().catch(error=>{console.error(error);process.exitCode=1;});

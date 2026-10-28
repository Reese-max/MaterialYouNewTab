/* Dependency-free integration coverage for profile/editor entry boundaries.
 * Pass a source-tree path to run the same tests against a pre-fix checkout.
 * All storage is in-memory; this never accesses a browser profile.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const sources = ['layout-profiles.js', 'layout-draft.js', 'layout-editor.js'].map(name =>
    [name, fs.readFileSync(path.join(root, 'scripts', name), 'utf8')]);
const clone = value => JSON.parse(JSON.stringify(value));

class Element {
    constructor(tag, document) {
        this.tagName = tag.toUpperCase(); this.ownerDocument = document;
        this.children = []; this.parentNode = null; this.listeners = new Map();
        this.attributes = {}; this.dataset = {}; this.hidden = false; this.disabled = false;
        this.textContent = ''; this.value = '';
        const classes = new Set();
        this.classList = {
            add: (...names) => names.forEach(name => classes.add(name)),
            remove: (...names) => names.forEach(name => classes.delete(name)),
            contains: name => classes.has(name),
            toggle(name, on = !classes.has(name)) { on ? classes.add(name) : classes.delete(name); return on; }
        };
        Object.defineProperty(this, 'className', {
            get: () => [...classes].join(' '),
            set(value) { classes.clear(); value.split(/\s+/).filter(Boolean).forEach(name => classes.add(name)); }
        });
        this.style = {
            setProperty(name, value) { this[name] = value; },
            removeProperty(name) { delete this[name]; delete this[name.replace(/-([a-z])/g, (_, char) => char.toUpperCase())]; }
        };
    }
    append(...nodes) { for (const node of nodes) { node.remove(); node.parentNode = this; this.children.push(node); } }
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(node => node !== this); this.parentNode = null; }
    replaceChildren(...nodes) { [...this.children].forEach(node => node.remove()); this.append(...nodes); }
    setAttribute(name, value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; if (name === 'id') this.id = ''; }
    addEventListener(type, listener) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(listener); }
    removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
    emit(type, data = {}) {
        const event = { target: this, currentTarget: this, key: '', button: 0, isPrimary: true, pointerId: 1,
            preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...data };
        for (let node = this; node; node = node.parentNode) {
            event.currentTarget = node;
            for (const listener of [...(node.listeners.get(type) || [])]) listener(event);
            if (event.stopped) break;
        }
        return event;
    }
    click() { if (!this.disabled) return this.emit('click'); }
    focus() { this.ownerDocument.activeElement = this; this.emit('focus'); }
    all() { return this.children.flatMap(node => [node, ...node.all()]); }
    matches(selector) {
        if (selector === 'button:not(:disabled)') return this.tagName === 'BUTTON' && !this.disabled;
        if (selector === 'dialog[open]') return this.tagName === 'DIALOG' && this.open;
        if (selector.startsWith('#')) return this.id === selector.slice(1);
        if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
        return this.tagName === selector.toUpperCase();
    }
    querySelectorAll(selector) { const selectors = selector.split(',').map(part => part.trim()); return this.all().filter(node => selectors.some(part => node.matches(part))); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    closest() { return ['INPUT', 'TEXTAREA', 'SELECT'].includes(this.tagName) ? this : null; }
    setPointerCapture(id) { this.pointerCapture = id; }
    hasPointerCapture(id) { return this.pointerCapture === id; }
    releasePointerCapture() { this.pointerCapture = null; }
    getBoundingClientRect() {
        const rect = this.rect || { left: 0, top: 0, width: 0, height: 0 };
        const [x, y] = (this.style.translate || '0 0').split(/\s+/).map(parseFloat);
        const scale = Number(this.style.scale || 1), left = rect.left + (x || 0), top = rect.top + (y || 0);
        const width = rect.width * scale, height = rect.height * scale;
        return { left, top, width, height, right: left + width, bottom: top + height };
    }
}
const layout = (x = .05, y = .02, s = 1) => ({ version: 2, snap: false, locked: true, blocks: { search: { x, y, s } } });
function profileData() {
    return { version: 1, revision: 3, active: 'pdefault', profiles: [{ id: 'pdefault', name: 'Manual',
        layouts: { wide: layout(), narrow: layout(.1, .04, .8) }, previous: { wide: layout(.15, .08, 1.1) } }] };
}
function fixture(options = {}) {
    const data = options.data || profileData();
    const storage = new Map([['myntLayoutProfiles', JSON.stringify(data)], ['myntLayout', 'legacy remains byte-for-byte']]);
    const session = new Map();
    if (options.draft) session.set('myntLayoutDraft', JSON.stringify({ version: 1, time: 1,
        scope: { profile: data.active, size: 'wide', revision: data.revision, base: storage.get('myntLayoutProfiles') },
        layout: { ...layout(.2, .12, 1), locked: false } }));
    const document = new Element('document'); document.ownerDocument = document;
    document.body = new Element('body', document); document.append(document.body);
    document.createElement = tag => new Element(tag, document);
    document.createTextNode = text => Object.assign(document.createElement('#text'), { textContent: text });
    document.getElementById = id => document.all().find(node => node.id === id) || null;
    document.dispatchEvent = event => document.emit(event.type, event);
    const search = document.createElement('section'); search.id = 'rightDiv';
    search.rect = { left: 100, top: 180, width: 300, height: 60 }; document.body.append(search);
    if (options.widgets) {
        const widgets = document.createElement('aside'); widgets.id = 'myntHomeWidgets';
        widgets.rect = { left: 680, top: 180, width: 320, height: 400 }; document.body.append(widgets);
    }
    const setting = document.createElement('input'); setting.id = 'layoutEditCheckbox'; document.body.append(setting);
    const events = new Map(); let writes = 0, blocked = false, readBlocked = false, profileReadsLeft = Infinity;
    const context = {
        document, CustomEvent: class { constructor(type, detail = {}) { this.type = type; Object.assign(this, detail); } }, innerWidth: options.width || 1200, innerHeight: 800,
        translations: { en: { profilesWide: 'profilesWide', profilesNarrow: 'profilesNarrow' } },
        setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: () => 1, cancelAnimationFrame() {},
        localStorage: { getItem(key) {
            if (readBlocked || (key === 'myntLayoutProfiles' && profileReadsLeft-- <= 0)) throw Error('Read denied');
            return storage.has(key) ? storage.get(key) : null;
        },
            setItem(key, value) { if (blocked) throw Error('Quota exceeded'); writes++; storage.set(key, value); } },
        sessionStorage: { getItem: key => session.get(key) || null, setItem: (key, value) => session.set(key, value), removeItem: key => session.delete(key) },
        getComputedStyle: node => ({ display: node.hidden ? 'none' : 'block', visibility: 'visible' }),
        addEventListener(type, listener) { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(listener); },
        removeEventListener(type, listener) { events.get(type)?.delete(listener); }
    };
    context.window = context; vm.createContext(context);
    for (const [filename, source] of sources) vm.runInContext(source, context, { filename });
    document.emit('DOMContentLoaded');
    const id = value => document.getElementById(value);
    return { context, api: context.myntLayout, document, storage, session, search, id, events,
        handle: () => document.all().find(node => node.dataset.block === 'search')?.querySelector('.myntLayoutMove'),
        writes: () => writes, blockWrites: value => { blocked = value; }, blockReads: value => { readBlocked = value; },
        allowProfileReads: count => { profileReadsLeft = count; } };
}
const tests = [];
const test = (name, run) => tests.push({ name, run });
const saved = app => app.storage.get('myntLayoutProfiles');
const rectangle = app => clone(app.search.getBoundingClientRect());

test('Clock fallback uses the strict 20% threshold, preserves scale and never mutates saved data', () => {
    const { myntClockFallback: fallback, myntOverlapRatio: overlap, myntClockDatePosition: datePosition } = require(path.join(root, 'scripts/layout-editor.js'));
    const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
    const block = Object.freeze({ x: .233, y: .358, s: .5 }), bytes = JSON.stringify(block);
    const clock = rect(450, 145, 150, 150), focus = rect(79, 198, 566, 158);
    const partial = rect(450, 265, 150, 100);
    assert.equal(overlap(clock, partial), .2);
    for (const height of [0, 29, 30]) {
        assert.deepEqual(fallback(block, clock, focus, [rect(450, 295 - height, 150, height)], [], 1536, 740), block, '<=20% retains saved offsets');
    }
    for (const obstacle of [focus, rect(450, 264, 150, 31)]) {
        const next = fallback(block, clock, focus, [obstacle], [], 1536, 740);
        assert.equal(next.s, .5);
        assert.equal(clock.left + (next.x - block.x) * 1536, 287);
        assert.equal(clock.top + (next.y - block.y) * 740, 32);
    }
    const high = rect(79, 150, 566, 158), right = fallback(block, clock, high, [clock], [], 1536, 740);
    assert.equal(clock.left + (right.x - block.x) * 1536, 661);
    assert.equal(clock.top + (right.y - block.y) * 740, 154);
    for (const control of [rect(287, 32, 46, 46), rect(320, 40, 57, 57), rect(400, 100, 119, 42)]) {
        const next = fallback(block, clock, focus, [focus], [control], 1536, 740);
        assert.equal(clock.left + (next.x - block.x) * 1536, 661, 'Any visible upper control forces the right-hand position');
    }
    for (const [vw, vh, old, card] of [[1536, 740, clock, focus], [1920, 1080, rect(544,447,150,150), rect(79,386,566,158)]]) {
        const next = fallback(block, old, card, [card], [], vw, vh);
        const display = rect(old.left + (next.x-block.x)*vw, old.top + (next.y-block.y)*vh,150,150);
        const date = datePosition(display, 108, 21, [card]);
        assert.equal(display.left, 287); assert.equal(display.top, vh === 740 ? 32 : 220);
        assert.equal(date.left, 445); assert.equal(date.top, vh === 740 ? 96.5 : 284.5);
        assert.equal(overlap(rect(date.left,date.top,108,21), card), 0);
        console.log(`CLOCK_FALLBACK_GEOMETRY ${vw}x${vh}: clock=${display.left},${display.top},150,150 date~=${date.left},${date.top},108,21`);
    }
    const side = rect(661,202,150,150), search = rect(92,360,560,64);
    const date = datePosition(side,108,21,[focus,search]);
    assert.deepEqual(date,{left:682,top:360});
    for (const obstacle of [focus,search]) assert.equal(overlap(rect(date.left,date.top,108,21),obstacle),0);
    assert.equal(JSON.stringify(block), bytes);
    const css = fs.readFileSync(path.join(root, 'styles/award-fix-clock.css'), 'utf8');
    assert.match(css, /\[data-mynt-layout-date\][^{]*\{[^}]*font-size: max\(calc\(14px \* var\(--mynt-font-scale, 1\)\), calc\(12px \/ var\(--mynt-clock-scale, 1\)\)\)/);
    for (const scale of [.1,.5,.75,1,2]) assert(Math.max(14,12/scale)*scale >= 12);
});

test('Rendered clock fallback is editable, saves only on Save, and respects the newly saved position', () => {
    const data = profileData();
    data.profiles[0].layouts.wide = { version:2,snap:false,locked:true,blocks:{clock:{x:.233,y:.358,s:.5}} };
    const app = fixture({ data }), bytes = saved(app), old = clone(app.api.get());
    const clock = app.document.createElement('section'); clock.id = 'analogClock';
    clock.rect = {left:450-.233*1200,top:145-.358*800,width:300,height:300};
    Object.defineProperty(clock,'offsetWidth',{value:300});
    const date = app.document.createElement('div'); date.className='mynt-clock-date';
    // 日期尺寸以 CSS px 提供；此 VM 只驗證引擎和 DOM 的座標交接，不模擬字型排版。
    date.rect={left:0,top:0,width:108,height:21}; clock.append(date);
    const focus = app.document.createElement('section'); focus.className = 'ttteexxtt';
    focus.rect = {left:79,top:198,width:566,height:158};
    app.document.body.append(clock,focus); app.api.applyAll();
    assert.equal(clock.getBoundingClientRect().left,287); assert(Math.abs(clock.getBoundingClientRect().top-32)<1e-9);
    assert.equal(date.style['--mynt-clock-scale'],'0.5');
    assert.equal(Number.parseFloat(date.style['--mynt-date-x']),316);
    assert.equal(Number.parseFloat(date.style['--mynt-date-y']),129);
    assert.deepEqual(clone(app.api.get()),old); assert.equal(saved(app),bytes); assert.equal(app.writes(),0);
    app.api.setEditing(true);
    const handle = () => app.document.all().find(node=>node.dataset.block==='clock').querySelector('.myntLayoutMove');
    assert.equal(clock.getBoundingClientRect().left,287);
    handle().emit('pointerdown',{clientX:287,clientY:32});
    handle().emit('pointermove',{clientX:387,clientY:32}); handle().emit('pointerup');
    assert.equal(clock.getBoundingClientRect().left,387);
    assert.equal(saved(app),bytes); assert.equal(app.writes(),0);
    app.id('myntLayoutSave').click();
    assert.equal(app.writes(),1); assert.equal(clock.getBoundingClientRect().left,387);
    app.api.applyAll(); assert.equal(clock.getBoundingClientRect().left,387);
    app.api.setEditing(true); handle().emit('keydown',{key:'ArrowRight'});
    assert.equal(clock.getBoundingClientRect().left,388);
    const stored = saved(app); app.api.cancel(); assert.equal(saved(app),stored);
    assert.equal(clock.getBoundingClientRect().left,387); assert.equal(app.writes(),1);
    // 搜尋列、AI 工具列同樣觸發；隱藏區塊不得觸發。
    focus.rect.top=400; app.search.rect={left:450,top:145,width:150,height:150};
    app.api.replaceSaved(old); assert.equal(clock.getBoundingClientRect().left,287);
    app.search.hidden=true; app.api.applyAll(); assert.equal(clock.getBoundingClientRect().left,450);
    const ai=app.document.createElement('section'); ai.id='aiToolsCont'; ai.rect={...app.search.rect}; app.document.body.append(ai);
    app.api.applyAll(); assert.equal(clock.getBoundingClientRect().left,287);
    ai.hidden=true; app.api.applyAll(); assert.equal(clock.getBoundingClientRect().left,450);
    focus.hidden=true; app.search.hidden=false; app.api.applyAll();
    assert.equal(clock.getBoundingClientRect().left,450, 'No visible focus card means no fallback anchor');
    assert.equal(saved(app),stored); assert.equal(app.writes(),1);
    clock.hidden=true; app.api.replaceSaved({version:2,blocks:{}});
    assert.equal(date.dataset.myntLayoutDate,undefined, 'Removing custom layout also clears a hidden clock date override');
    for(const key of ['--mynt-clock-scale','--mynt-date-x','--mynt-date-y']) assert.equal(date.style[key],undefined);
});

test('Today widgets keep defaults until moved, save in the existing profile and restore without extra storage keys', () => {
    const app = fixture({ widgets: true }), bytes = saved(app), keys = [...app.storage.keys()];
    const widgets = app.id('myntHomeWidgets');
    assert.equal(widgets.style.translate, undefined); assert.equal(widgets.dataset.myntLayout, undefined);
    app.api.setEditing(true);
    const handle = app.document.all().find(node => node.dataset.block === 'homeWidgets')?.querySelector('.myntLayoutMove');
    assert(handle, 'The enabled widget has a drag handle in editing mode');
    handle.emit('keydown', { key: 'ArrowLeft', shiftKey: true });
    assert.equal(widgets.style.translate, '-10px 0px'); assert.equal(saved(app), bytes);
    app.id('myntLayoutSave').click();
    const stored = JSON.parse(saved(app));
    assert.equal(stored.profiles[0].layouts.wide.blocks.homeWidgets.x, -10 / 1200);
    assert.equal(stored.profiles[0].layouts.wide.locked, true);
    assert.deepEqual([...app.storage.keys()], keys);
    const restored = fixture({ widgets: true, data: stored });
    assert.equal(restored.id('myntHomeWidgets').style.translate, '-10px 0px');
    restored.api.setEditing(true);
    restored.document.all().find(node => node.dataset.block === 'homeWidgets').querySelector('.myntLayoutMove').emit('keydown', { key: 'ArrowDown', shiftKey: true });
    restored.api.cancel();
    assert.equal(restored.id('myntHomeWidgets').style.translate, '-10px 0px');
    assert.equal(restored.writes(), 0);
});

test('A recoverable draft blocks previous-version preview without changing any layout', () => {
    const app = fixture({ draft: true }), before = clone(app.api.get()), rect = rectangle(app);
    const bytes = saved(app), draft = app.session.get('myntLayoutDraft');
    assert.doesNotThrow(() => app.id('myntProfileRestore').click());
    assert.equal(app.api.isEditing(), false);
    assert.deepEqual(clone(app.api.get()), before); assert.deepEqual(rectangle(app), rect);
    assert.equal(saved(app), bytes); assert.equal(app.session.get('myntLayoutDraft'), draft);
    assert.ok(app.id('myntDraftRecovery')); assert.equal(app.id('myntProfileStatus').textContent, '');
    assert.equal(app.writes(), 0);
});

test('Invalid or unavailable saved storage refuses preview without touching the screen', () => {
    for (const fault of ['malformed', 'denied']) {
        const app = fixture(), before = clone(app.api.get()), rect = rectangle(app);
        if (fault === 'malformed') app.storage.set('myntLayoutProfiles', '{invalid'); else app.blockReads(true);
        const bytes = saved(app);
        assert.doesNotThrow(() => app.id('myntProfileRestore').click());
        assert.equal(app.api.isEditing(), false); assert.deepEqual(clone(app.api.get()), before);
        assert.deepEqual(rectangle(app), rect); assert.equal(saved(app), bytes); assert.equal(app.writes(), 0);
        assert.equal(app.id('myntProfileStatus').textContent, 'profilesFailure');
    }
});

test('A preview cannot replace a draft that is already being edited', () => {
    const app = fixture(); app.id('myntLayoutEdit').click();
    app.handle().emit('keydown', { key: 'ArrowRight', shiftKey: true });
    const before = clone(app.api.get()), rect = rectangle(app), draft = app.session.get('myntLayoutDraft');
    const result = app.api.preview(layout(.3));
    assert.deepEqual(clone(app.api.get()), before); assert.deepEqual(rectangle(app), rect);
    assert.equal(app.session.get('myntLayoutDraft'), draft); assert.equal(app.writes(), 0);
    assert.equal(result, false);
});

test('Recovery remains available if the second storage read refuses editor entry', () => {
    const app = fixture({ draft: true }), before = clone(app.api.get()), rect = rectangle(app);
    const bytes = saved(app), draft = app.session.get('myntLayoutDraft');
    app.allowProfileReads(1);
    assert.doesNotThrow(() => app.id('myntDraftRestore').click());
    assert.equal(app.api.isEditing(), false); assert.deepEqual(clone(app.api.get()), before);
    assert.deepEqual(rectangle(app), rect); assert.equal(saved(app), bytes);
    assert.equal(app.session.get('myntLayoutDraft'), draft); assert.ok(app.id('myntDraftRecovery'));
    assert.equal(app.writes(), 0);
});

test('Normal draft recovery still warns on accidental close and cancel restores the saved layout', () => {
    const app = fixture({ draft: true }), before = clone(app.api.get()), bytes = saved(app);
    app.id('myntDraftRestore').click();
    assert.equal(app.api.isEditing(), true); assert.equal(app.api.get().blocks.search.x, .2);
    assert.equal(app.id('myntDraftRecovery'), null); assert.equal(saved(app), bytes);
    const event = { preventDefault() { this.prevented = true; } };
    for (const listener of app.events.get('beforeunload')) listener(event);
    assert.equal(event.prevented, true); assert.equal(event.returnValue, '');
    assert.ok(app.session.has('myntLayoutDraft')); app.api.cancel();
    assert.deepEqual(clone(app.api.get()), before); assert.equal(saved(app), bytes);
    assert.equal(app.session.has('myntLayoutDraft'), false); assert.equal(app.writes(), 0);
});

test('An allowed previous-version preview remains undoable and cancel preserves saved bytes', () => {
    const app = fixture(), bytes = saved(app), original = clone(app.api.get());
    app.id('myntProfileRestore').click();
    assert.equal(app.api.isEditing(), true); assert.equal(app.api.get().blocks.search.x, .15);
    assert.equal(app.api.get().locked, false); assert.equal(app.writes(), 0);
    app.api.undo(); assert.deepEqual(clone(app.api.get()), { ...original, locked: false });
    app.api.redo(); assert.equal(app.api.get().blocks.search.x, .15);
    app.api.cancel(); assert.deepEqual(clone(app.api.get()), original); assert.equal(saved(app), bytes);
    assert.equal(app.session.has('myntLayoutDraft'), false); assert.equal(app.writes(), 0);
});

test('Failed preview save retains recovery, undo, and retry without damaging saved data', () => {
    const app = fixture(), bytes = saved(app); app.id('myntProfileRestore').click();
    const draft = clone(app.api.get()); app.blockWrites(true); app.id('myntLayoutSave').click();
    assert.equal(app.api.isEditing(), true); assert.deepEqual(clone(app.api.get()), draft);
    assert.equal(saved(app), bytes); assert.ok(app.session.has('myntLayoutDraft'));
    assert.equal(app.writes(), 0); assert.equal(app.id('myntLayoutUndo').disabled, false);
    app.blockWrites(false); app.id('myntLayoutSave').click();
    assert.equal(app.api.isEditing(), false); assert.equal(app.writes(), 1);
    assert.deepEqual(JSON.parse(saved(app)).profiles[0].layouts.wide, { ...draft, locked: true });
    assert.deepEqual(JSON.parse(saved(app)).profiles[0].previous.wide, JSON.parse(bytes).profiles[0].layouts.wide);
    assert.equal(app.session.has('myntLayoutDraft'), false);
});

test('Entering edit renders the latest saved profile before the first 1px keyboard nudge', () => {
    const app = fixture(); const updated = profileData(); updated.revision++;
    updated.profiles[0].layouts.wide = layout(.22, .09, 1.3);
    const bytes = JSON.stringify(updated); app.storage.set('myntLayoutProfiles', bytes);
    app.id('myntLayoutEdit').click();
    assert.equal(app.search.getBoundingClientRect().left, 100 + .22 * 1200);
    assert.equal(app.search.getBoundingClientRect().width, 390);
    app.handle().emit('keydown', { key: 'ArrowRight' });
    assert.equal(app.search.getBoundingClientRect().left, 100 + .22 * 1200 + 1);
    assert.equal(app.api.get().blocks.search.y, .09); assert.equal(app.api.get().blocks.search.s, 1.3);
    assert.equal(saved(app), bytes); assert.equal(app.writes(), 0);
    app.api.cancel(); assert.deepEqual(clone(app.api.get()), updated.profiles[0].layouts.wide);
    assert.equal(saved(app), bytes); assert.equal(app.storage.get('myntLayout'), 'legacy remains byte-for-byte');
});

test('Entering edit immediately after resize uses the saved narrow coordinates, not stale wide pixels', () => {
    const app = fixture(), bytes = saved(app); app.context.innerWidth = 600;
    app.id('myntLayoutEdit').click();
    assert.equal(app.search.getBoundingClientRect().left, 160);
    assert.equal(app.search.getBoundingClientRect().top, 212);
    assert.equal(app.search.getBoundingClientRect().width, 240);
    app.handle().emit('keydown', { key: 'ArrowDown', shiftKey: true });
    assert.equal(app.search.getBoundingClientRect().top, 222);
    assert.equal(app.api.get().blocks.search.x, .1);
    app.api.cancel(); assert.equal(saved(app), bytes); assert.equal(app.writes(), 0);
});

test('Unchanged manual layout stays byte-for-byte through opening and cancelling edit', () => {
    const app = fixture(), bytes = saved(app), before = clone(app.api.get()), rect = rectangle(app);
    app.id('myntLayoutEdit').click(); app.api.cancel();
    assert.deepEqual(clone(app.api.get()), before); assert.deepEqual(rectangle(app), rect);
    assert.equal(saved(app), bytes); assert.equal(app.writes(), 0);
});

test('Narrow editor entry keeps a 44px second-row control and yields to open utility panels', () => {
    const css = fs.readFileSync(path.join(root, 'styles/manual-editor-controls.css'), 'utf8');
    assert.match(css, /@media \(max-width: 480px\)\s*\{\s*#myntLayoutSaveDock\s*\{[^}]*top: 84px;[^}]*left: 16px;[^}]*transform: none;/);
    assert.match(css, /#myntLayoutSaveDock #myntLayoutSaveStatus\s*\{[^}]*clip-path: inset\(50%\)/);
    assert.match(css, /body:has\(#pomodoroCont\[aria-expanded="true"\], #scratchpadCont\[aria-expanded="true"\]\) #myntLayoutSaveDock\s*\{ visibility: hidden; pointer-events: none;/);
    assert.match(css, /#myntLayoutSaveDock:has\(#myntDraftRecovery\)\s*\{[^}]*background: rgba\(246,249,255,.98\);[^}]*overflow-y: auto/);
    assert.match(css, /#myntLayoutSaveDock #myntLayoutEdit\s*\{\s*min-height: 44px/);
});

test('Idle layout dock stays hidden; edit, save and cancel preserve the hidden idle state', () => {
    const app = fixture(), bytes = saved(app), rect = rectangle(app);
    assert.equal(app.id('myntLayoutSaveDock').hidden, true);
    app.api.setEditing(true);
    assert.ok(app.id('myntLayoutToolbar'));
    app.api.cancel();
    assert.equal(app.id('myntLayoutToolbar'), null);
    assert.equal(app.id('myntLayoutSaveDock').hidden, true);
    assert.deepEqual(rectangle(app), rect); assert.equal(saved(app), bytes);
    app.api.setEditing(true); app.id('myntLayoutSave').click();
    assert.equal(app.id('myntLayoutSaveDock').hidden, true);
    assert.equal(app.id('myntLayoutToolbar'), null);
});
test('Pending draft remains visible and discard hides the recovery-only dock without writes', () => {
    const app = fixture({ draft: true }), bytes = saved(app);
    assert.equal(app.id('myntLayoutSaveDock').hidden, false);
    app.api.setEditing(true); assert.equal(app.api.isEditing(), false);
    app.id('myntDraftDiscard').click();
    assert.equal(app.id('myntLayoutSaveDock').hidden, true);
    assert.equal(saved(app), bytes); assert.equal(app.writes(), 0);
});

let failures = 0;
for (const { name, run } of tests) {
    try { run(); console.log(`PASS: ${name}`); }
    catch (error) { failures++; console.error(`FAIL: ${name}\n${error.stack}`); }
}
if (failures) { console.error(`LAYOUT_DAILY_FAILED: ${failures}/${tests.length}`); process.exitCode = 1; }
else console.log(`LAYOUT_DAILY_OK: ${tests.length} integration regressions passed; storage was in-memory only`);

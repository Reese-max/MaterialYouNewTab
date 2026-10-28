'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
class Target {
    constructor() { this.events = new Map(); }
    addEventListener(type, fn) { if (!this.events.has(type)) this.events.set(type, new Set()); this.events.get(type).add(fn); }
    removeEventListener(type, fn) { this.events.get(type)?.delete(fn); }
    dispatchEvent(event) { event.target ||= this; for (const fn of [...(this.events.get(event.type) || [])]) fn(event); return true; }
    async emit(type, values = {}) {
        const event = { type, target: this, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...values };
        for (const fn of [...(this.events.get(type) || [])]) await fn(event);
        return event;
    }
}
class Element extends Target {
    constructor(tag = 'div', doc) {
        super(); this.tagName = tag.toUpperCase(); this.doc = doc; this.children = []; this.attrs = new Map(); this.dataset = {}; this.style = {};
        this.textContent = ''; this.value = ''; this.checked = false; this.hidden = false;
        const classes = new Set();
        this.classList = { contains: value => classes.has(value), add: (...values) => values.forEach(value => classes.add(value)), remove: (...values) => values.forEach(value => classes.delete(value)), toggle(value, on = !classes.has(value)) { if (on) classes.add(value); else classes.delete(value); return on; } };
    }
    append(...nodes) { for (const node of nodes) { if (node.isFragment) this.append(...node.children); else { this.children.push(node); node.parentElement = this; } } }
    appendChild(node) { this.append(node); return node; }
    replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
    get firstChild() { return this.children[0]; }
    get childNodes() { return this.children; }
    setAttribute(key, value) { this.attrs.set(key, String(value)); if (key === 'class') this.className = value; }
    getAttribute(key) { return this.attrs.get(key) ?? null; }
    hasAttribute(key) { return this.attrs.has(key); }
    removeAttribute(key) { this.attrs.delete(key); }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    focus() { this.doc.activeElement = this; }
    click() { if (this.type === 'checkbox') this.checked = !this.checked; this.dispatchEvent({ type: 'click', stopPropagation() {} }); }
    querySelector() { return null; }
}
function locale(code) { return vm.runInNewContext(`${read(`locales/${code}.js`)}; ${code}`); }
const en = locale('en'), zh = locale('zh_TW');
const keys = Object.keys(en).filter(key => key.startsWith('homeWidgets'));
assert.deepEqual(keys, Object.keys(zh).filter(key => key.startsWith('homeWidgets')), 'New English and Traditional Chinese keys match');
assert.ok(keys.every(key => typeof en[key] === 'string' && typeof zh[key] === 'string'));
function environment(seed = {}) {
    const values = new Map(Object.entries(seed));
    const localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
    const document = new Target(); document.readyState = 'complete'; document.hidden = false;
    document.createElement = tag => new Element(tag, document);
    document.createDocumentFragment = () => { const fragment = document.createElement('fragment'); fragment.isFragment = true; return fragment; };
    const nodes = new Map();
    document.body = document.createElement('body'); document.documentElement = document.createElement('html');
    document.getElementById = id => nodes.get(id) || null;
    document.querySelector = selector => selector === '[data-mynt-layout]' && document.customLayout ? {} : null;
    const node = (id, tag = 'div') => { const element = document.createElement(tag); element.id = id; nodes.set(id, element); return element; };
    const observers = [];
    class MutationObserver {
        constructor(callback) { this.callback = callback; this.connected = true; observers.push(this); }
        observe(target, options) { this.target = target; this.options = options; }
        disconnect() { this.connected = false; }
    }
    const window = new Target(); window.innerWidth = 1920; window.localStorage = localStorage;
    const idle = []; window.requestIdleCallback = fn => idle.push(fn); window.setTimeout = fn => idle.push(fn);
    const CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options?.detail; } };
    const context = { document, window, localStorage, MutationObserver, CustomEvent, console, translations: { en, zh_TW: zh, ja: {} }, setTimeout: window.setTimeout, clearTimeout() {} };
    return { document, window, values, context, idle, node, observers, localStorage };
}
function setup(options = {}) {
    const app = environment({ selectedLanguage: options.language || 'en', ...options.storage });
    const { document, window, context, node } = app;
    const host = node('myntHomeWidgets', 'aside'); host.hidden = true;
    node('todoInput', 'input'); node('pomodoroStartBtn', 'button');
    const trigger = node('todoListCont', 'button'); trigger.setAttribute('aria-expanded', 'false');
    let todoOpens = 0, pomoOpens = 0, started = 0, paused = 0, added = [], toggled = [];
    trigger.addEventListener('click', () => { todoOpens++; trigger.setAttribute('aria-expanded', 'true'); });
    for (const kind of ['todo', 'pomodoro']) {
        const control = node(`myntComponent-${kind}`, 'input'); control.type = 'checkbox';
        control.addEventListener('click', () => { app.values.set(`${kind}Enabled`, String(control.checked)); });
    }
    let items = Array.from({ length: 8 }, (_, index) => ({ id: `t${index}`, title: index === 1 ? '<img src=x onerror=alert(1)>' : `Task ${index}`, status: index === 0 ? 'completed' : 'pending', pinned: index === 6 || index === 7 }));
    const todoListeners = new Set(), pomoListeners = new Set();
    let state = { phase: 'work', timeRemaining: 1500, isRunning: false };
    let layoutApplications = 0;
    window.myntLayout = { applyAll() {
        assert.equal(host.hidden, false, 'Measure the widget only after revealing it');
        layoutApplications++; document.dispatchEvent({ type: 'mynt:layout-applied' });
    } };
    window.myntTodoApi = {
        list: () => items.map(item => ({ ...item })),
        add(title) { added.push(title); if (app.failAdd) return null; items.push({ id: 'new', title, status: 'pending' }); for (const fn of [...todoListeners]) fn(); return 'new'; },
        toggle(id) { toggled.push(id); items = items.map(item => item.id === id ? { ...item, status: 'completed' } : item); for (const fn of [...todoListeners]) fn(); return true; },
        subscribe(fn) { todoListeners.add(fn); return () => todoListeners.delete(fn); }
    };
    window.myntPomodoro = {
        getState: () => ({ ...state }), subscribe(fn) { pomoListeners.add(fn); fn(state); return () => pomoListeners.delete(fn); },
        async startInline() { started++; state.isRunning = true; for (const fn of [...pomoListeners]) fn(state); },
        async pause() { paused++; state.isRunning = false; for (const fn of [...pomoListeners]) fn(state); },
        open() { pomoOpens++; }
    };
    if (options.width) window.innerWidth = options.width;
    if (options.hidden) document.hidden = true;
    if (options.layout) document.customLayout = true;
    if (options.editing) document.body.classList.add('mynt-layout-editing');
    if (options.noIdle) delete window.requestIdleCallback;
    vm.runInNewContext(read('scripts/home-widgets.js'), context);
    assert.equal(host.children.length, 0, 'Initialization must wait for idle/fallback callback');
    app.idle.shift()();
    const descendants = node => [node, ...node.children.flatMap(descendants)];
    const find = predicate => descendants(host).find(predicate);
    const button = title => find(node => node.tagName === 'BUTTON' && node.textContent === title);
    const list = () => find(node => node.className === 'home-widget-todos');
    return Object.assign(app, { host, find, button, list, todoListeners, pomoListeners, added, toggled,
        counters: () => ({ todoOpens, pomoOpens, started, paused, layoutApplications }),
        setState(next) { state = { ...state, ...next }; for (const fn of [...pomoListeners]) fn(state); },
        setItems(next) { items = next; for (const fn of [...todoListeners]) fn(); }
    });
}
async function main() {
    for (const width of [320, 900, 1499, 1500, 1920]) {
        const app = setup({ width }); assert.equal(app.host.hidden, width < 1500, `Width ${width}`);
        assert.equal(app.pomoListeners.size, width < 1500 ? 0 : 1);
    }
    for (const options of [{ layout: true }, { editing: true }, { layout: true, editing: true }]) {
        assert.equal(setup(options).host.hidden, false, 'Custom and editing layouts show enabled widgets');
        assert.equal(setup({ ...options, width: 1499 }).host.hidden, true, 'Layout editing respects the width gate');
        assert.equal(setup({ ...options, storage: { myntHomeWidgetsVisible: 'false' } }).host.hidden, true, 'Layout editing respects the component switch');
    }
    for (const value of ['false', 'broken']) assert.equal(setup({ storage: { myntHomeWidgetsVisible: value } }).host.hidden, true);
    const app = setup();
    assert.equal(app.counters().layoutApplications, 1, 'Initial deferred reveal reapplies the saved layout once without event recursion');
    const ids = () => app.list().children.map(row => row.firstChild.firstChild.dataset.todoId);
    assert.deepEqual(ids(), ['t6', 't7', 't1', 't2', 't3'], 'Five unfinished tasks, stable pin-first order');
    assert.equal(app.list().children[2].firstChild.children[1].textContent, '<img src=x onerror=alert(1)>', 'Task titles stay inert text');
    const first = app.list().firstChild.firstChild.firstChild; first.focus(); await first.emit('change');
    assert.deepEqual(app.toggled, ['t6']); assert(!ids().includes('t6'));
    assert.equal(app.document.activeElement.dataset.todoId, 't7', 'Completion keeps keyboard focus in the list');
    const form = app.find(node => node.tagName === 'FORM'), input = form.firstChild;
    input.value = 'New task'; await form.emit('submit'); assert.deepEqual(app.added, ['New task']); assert.equal(input.value, '');
    input.value = '   '; await form.emit('submit'); assert.equal(app.added.length, 1);
    input.value = 'Keep failed draft'; app.failAdd = true; await form.emit('submit'); assert.equal(input.value, 'Keep failed draft');
    assert.equal(app.find(node => node.getAttribute('role') === 'status').textContent, en.homeWidgetsError);
    await app.button('Start').emit('click'); assert.equal(app.counters().started, 1); assert.equal(app.counters().pomoOpens, 0);
    await app.button('Pause').emit('click'); assert.equal(app.counters().paused, 1);
    app.setState({ phase: 'shortBreak', timeRemaining: 61 });
    assert.equal(app.find(node => node.className === 'home-widget-time').textContent, '01:01');
    assert.equal(app.find(node => node.getAttribute('aria-live') === 'polite').textContent, en.pomodoroShortBreak);
    const event = await app.button('Open full list').emit('click'); assert(event.stopped); assert.equal(app.counters().todoOpens, 1);
    await app.button('Open full list').emit('click'); assert.equal(app.counters().todoOpens, 1, 'An open list stays open');
    assert.equal(app.document.activeElement, app.document.getElementById('todoInput'));
    await app.button('Open Pomodoro').emit('click'); assert.equal(app.counters().pomoOpens, 1);
    assert.equal(app.values.get('todoEnabled'), 'true'); assert.equal(app.values.get('pomodoroEnabled'), 'true');
    app.document.hidden = true; await app.document.emit('visibilitychange');
    assert.equal(app.pomoListeners.size, 0, 'Hidden tab detaches the widget countdown subscription'); assert.equal(app.todoListeners.size, 0);
    app.setState({ timeRemaining: 7 }); assert.equal(app.find(node => node.className === 'home-widget-time').textContent, '01:01', 'No hidden-tab countdown rendering');
    app.document.hidden = false; await app.document.emit('visibilitychange'); assert.equal(app.pomoListeners.size, 1);
    assert.equal(app.find(node => node.className === 'home-widget-time').textContent, '00:07', 'Resume reads current shared state');
    await app.document.emit('visibilitychange'); assert.equal(app.pomoListeners.size, 1, 'No duplicate subscriptions');
    app.window.innerWidth = 1499; await app.window.emit('resize'); assert(app.host.hidden); assert.equal(app.pomoListeners.size, 0);
    app.window.innerWidth = 1500; await app.window.emit('resize'); assert(!app.host.hidden);
    assert.equal(app.counters().layoutApplications, 2, 'Returning to a wide viewport reapplies saved geometry');
    app.values.set('myntHomeWidgetsVisible', 'false'); await app.document.emit('mynt:components-changed'); assert(app.host.hidden); assert.equal(app.pomoListeners.size, 0);
    app.values.delete('myntHomeWidgetsVisible'); await app.window.emit('storage', { key: null }); assert(!app.host.hidden);
    app.document.customLayout = true; await app.document.emit('mynt:layout-applied'); assert(!app.host.hidden);
    app.document.customLayout = false; await app.document.emit('mynt:layout-applied'); assert(!app.host.hidden);
    app.document.body.classList.add('mynt-layout-editing');
    await app.document.emit('mynt:layout-applied'); assert(!app.host.hidden, 'Editing keeps the block available to drag');
    app.document.body.classList.remove('mynt-layout-editing');
    await app.document.emit('mynt:layout-applied'); assert(!app.host.hidden);
    const zhApp = setup({ language: 'zh_TW' }); assert(zhApp.button('開啟完整清單')); assert(zhApp.button('開始'));
    const fallback = setup({ language: 'ja', noIdle: true }); assert(fallback.button('Open full list')); assert.equal(fallback.host.hidden, false);
    assert.equal(setup({ hidden: true }).pomoListeners.size, 0, 'Initially hidden tabs never subscribe');
    const unavailable = setup(); unavailable.window.myntTodoApi.list = () => { throw Error('corrupt'); };
    await unavailable.document.emit('mynt:components-changed'); assert(unavailable.find(node => node.tagName === 'FORM').firstChild.disabled);
    unavailable.window.myntTodoApi.list = () => []; await unavailable.document.emit('mynt:components-changed');
    assert.equal(unavailable.find(node => node.className === 'home-widget-note').textContent, en.homeWidgetsEmpty);

    // 執行真實待辦模組，驗證 API 沿用儲存、事件與清單 DOM。
    const real = environment({ todoLastUpdateDate: new Date().toLocaleDateString(), todoList: JSON.stringify({ p: { title: 'Pinned', status: 'pending', pinned: true } }) });
    for (const id of ['todoContainer', 'todoListCont', 'todoullist', 'todoAdd', 'todoInput']) real.node(id);
    vm.runInNewContext(read('scripts/todo-list.js'), real.context);
    const api = real.window.myntTodoApi;
    const copy = api.list(); copy[0].title = 'changed'; assert.equal(api.list()[0].title, 'Pinned', 'Read API returns detached values');
    let updates = 0; const stop = api.subscribe(() => updates++);
    const created = api.add('  新任務  '); assert(created); assert.equal(updates, 1);
    assert.equal(JSON.parse(real.values.get('todoList'))[created].title, '新任務');
    assert.equal(api.toggle(created), true); assert.equal(updates, 2);
    assert.equal(JSON.parse(real.values.get('todoList'))[created].status, 'completed');
    assert.equal(api.toggle('missing'), false);
    real.values.set('todoList', JSON.stringify({ external: { title: 'Other tab', status: 'pending', pinned: false } }));
    await real.window.emit('storage', { key: 'todoList' }); assert.equal(api.list()[0].title, 'Other tab'); assert.equal(updates, 3);
    real.observers[0].callback([]); assert.equal(updates, 4, 'Full-panel/recovery DOM reload notifies subscribers');
    stop(); assert.equal(real.observers[0].connected, false);
    await real.window.emit('storage', { key: 'todoList' }); assert.equal(updates, 4, 'Unsubscribe removes storage listener');
    real.values.set('todoList', JSON.stringify({ resumed: { title: 'Changed while hidden', status: 'pending', pinned: true } }));
    const stopResumed = api.subscribe(() => {});
    assert.equal(api.list()[0].title, 'Changed while hidden', 'Resubscribe reloads changes missed while hidden'); stopResumed();

    const core = require('../scripts/component-visibility-core.js');
    const setting = core.read(real.localStorage).find(item => item.id === 'homeWidgets'); assert(setting.valid); assert.equal(setting.visible, true);
    assert.equal(core.plan(real.localStorage, 'homeWidgets', false).writes[0].key, 'myntHomeWidgetsVisible');
    const manager = require('./check-component-manager.cjs').setup();
    manager.change('homeWidgets', false); assert.equal(manager.values.get('myntHomeWidgetsVisible'), 'false');
    assert(manager.node('myntHomeWidgets').hasAttribute('data-mynt-component-hidden'));
    manager.change('homeWidgets', true); assert(!manager.node('myntHomeWidgets').hasAttribute('data-mynt-component-hidden'));
    const css = read('styles/award-home-widgets.css'), html = read('index.html');
    assert.match(css, /#myntHomeWidgets\s*\{ display: none;/);
    assert.match(css, /@media \(min-width: 1500px\)/); assert.match(css, /body #myntHomeWidgets:not/);
    assert.doesNotMatch(css, /:not\(\.mynt-layout-editing\)|:not\(:has\(\[data-mynt-layout\]\)\)/);
    assert.match(css, /:not\(\[hidden\]\):not\(\[data-mynt-component-hidden\]\)/);
    assert.match(css, /top: 180px/); assert.match(css, /max-height: max\(0px, calc\(100dvh - 196px\)\)/);
    assert.match(css, /max-height: max\(0px, calc\(100dvh - 308px - var\(--shortcut-size, 50px\) - var\(--gap, 30px\) \* 2\)\)/, 'The default layout keeps its existing shortcut clearance');
    assert.match(css, /overflow: auto/);
    const { MYNT_LAYOUT_BLOCKS, myntNormalizeLayout } = require('../scripts/layout-editor.js');
    assert.deepEqual(MYNT_LAYOUT_BLOCKS.find(([id]) => id === 'homeWidgets'), ['homeWidgets', '#myntHomeWidgets', 'layoutBlockHomeWidgets', 'Today widgets']);
    assert.equal(en.layoutBlockHomeWidgets, 'Today widgets'); assert.equal(zh.layoutBlockHomeWidgets, '今日小工具');
    assert.deepEqual(myntNormalizeLayout({ version: 2, blocks: { homeWidgets: { x: -.1, y: .2, s: .8 } } }).blocks.homeWidgets, { x: -.1, y: .2, s: .8 });
    assert.doesNotMatch(read('scripts/home-widgets.js'), /!document\.querySelector\('\[data-mynt-layout\]'\)|!document\.body\.classList\.contains\('mynt-layout-editing'\)/);
    // CSS 推算值與使用者提供的 real-seed 矩形至少保持 16px 間距（不等同瀏覽器截圖驗收）。
    const customCss = css.match(/body:is\(:has\(\[data-mynt-layout\]\), \.mynt-layout-editing\) #myntHomeWidgets[^{}]*\{([^}]+)\}/)[1];
    const rightSpace = Number(customCss.match(/left: calc\(100vw - (\d+)px\)/)[1]);
    const top = Number(customCss.match(/top: (\d+)px/)[1]);
    const width = Number(customCss.match(/width: (\d+)px;/)[1]);
    const [, cap, reserve] = customCss.match(/height: min\((\d+)px, calc\(100dvh - (\d+)px\)\)/).map(Number);
    const cases = [
        [1536, 740, [[80,200,643,355],[95,360,650,425],[95,445,530,485],[70,5,290,70],[25,100,118,150],[1240,20,1330,110],[1460,40,1500,75],[1416,100,1512,150],[1420,545,1470,595],[1415,675,1460,720],[555,672,980,712],[25,672,145,712]]],
        [1920, 1080, [[80,388,643,540],[95,540,655,605],[95,625,535,665],[1575,12,1665,103],[1800,100,1895,150],[1795,830,1845,880],[1800,1015,1840,1060],[748,1012,1172,1052]]]
    ];
    for (const [vw, vh, obstacles] of cases) {
        const left = vw - rightSpace, height = Math.min(cap, vh - reserve), right = left + width, bottom = top + height;
        assert(left >= 0 && top >= 0 && right <= vw && bottom <= vh);
        assert(bottom <= vh - 16, 'The custom right column can reach 16px above the viewport bottom; quote clearance is checked by rectangles below');
        for (const [x1,y1,x2,y2] of obstacles) assert(right + 16 <= x1 || left >= x2 + 16 || bottom + 16 <= y1 || top >= y2 + 16, `Widget overlaps the 16px clearance at ${vw}x${vh}: ${[x1,y1,x2,y2]}`);
        console.log(`HOME_WIDGETS_GEOMETRY ${vw}x${vh}: x=${left} y=${top} width=${width} height=${height}`);
    }
    assert.match(css, /:focus-visible/); assert.match(css, /prefers-reduced-motion/); assert.match(css, /forced-colors/);
    assert.doesNotMatch(css, /prefers-color-scheme|black-theme|backdrop-filter/);
    assert.match(html, /<script defer src="scripts\/home-widgets.js"><\/script>/); assert.match(html, /<link href="styles\/award-home-widgets.css" rel="stylesheet">/);
    assert.match(html, /<aside id="myntHomeWidgets"[^>]+hidden>/);
    assert.match(read('scripts/pomodoro.js'), /startInline: startPomodoro/);
    assert.doesNotMatch(read('scripts/home-widgets.js'), /setInterval|localStorage\.setItem|innerHTML|eval\(/, 'No additional clock, storage copy, HTML parsing or evaluation');
    console.log('HOME_WIDGETS_OK');
}
main().catch(error => { console.error(error); process.exitCode = 1; });

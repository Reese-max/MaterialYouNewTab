const assert = require('node:assert/strict');
const { validate, validImage, progressOffset } = require('../scripts/pomodoro-float.js');
const settings = validate({ mode: 'gradient', color: '#abcdef' });
assert.equal(settings.version, 1); assert.equal(settings.color, '#abcdef');
assert.deepEqual(Object.keys(settings).sort(), ['version','mode','color','color2','fit','position'].sort());
assert.equal(validate({}).mode, 'original', 'fresh settings preserve original timer styling');
assert.equal(validate({ mode: 'home' }).mode, 'home', 'saved home-following choice stays compatible');
for (const value of [null, [], { mode: 'url(https://bad)' }, { color: 'red; background: url(x)' }, { position: 'calc(1px)' }, { fit: 'invalid' }]) assert.throws(() => validate(value));
assert.equal(validImage({ type: 'image/png', size: 8 * 1024 * 1024 }), true);
for (const file of [null, { type: 'image/svg+xml', size: 12 }, { type: 'image/png', size: 0 }, { type: 'image/png', size: 8 * 1024 * 1024 + 1 }]) assert.equal(validImage(file), false);
assert.equal(validate({ mode: 'image', blob: 'secret' }).blob, undefined);
const circumference = 2 * Math.PI * 70;
assert.equal(progressOffset(1500, 1500), 0);
assert.equal(progressOffset(750, 1500), circumference / 2);
for (const [remaining, total, expected] of [[-5, 1500, circumference], [2000, 1500, 0], [0, 0, circumference], [NaN, 100, circumference]]) assert.equal(progressOffset(remaining, total), expected);
console.log('Pomodoro appearance and progress validators passed');

// Dependency-free DOM harness checks real module interactions, without browser geometry claims.
const vm = require('node:vm');
const fs = require('node:fs');
class Node {
    constructor(tag = '', ownerDocument = null) {
        this.tagName = tag; this.ownerDocument = ownerDocument; this.children = []; this.listeners = {}; this.attributes = {};
        this.className = ''; this.value = ''; this._text = ''; this.paused = true; this.playCalls = 0; this.pauseCalls = 0;
        this.classList = {
            contains: name => this.className.split(/\s+/).includes(name),
            add: name => { this.classList.toggle(name, true); },
            remove: name => { this.classList.toggle(name, false); },
            toggle: (name, force) => {
                const enabled = force === undefined ? !this.classList.contains(name) : force;
                const names = new Set(this.className.split(/\s+/).filter(Boolean));
                if (enabled) names.add(name); else names.delete(name); this.className = [...names].join(' '); return enabled;
            }
        };
        const properties = {};
        this.style = { setProperty: (key, value) => { properties[key] = String(value); }, getPropertyValue: key => properties[key] || '', removeProperty: key => { delete properties[key]; } };
    }
    get textContent() { return this._text + this.children.map(node => node.textContent).join(''); }
    set textContent(value) { this._text = value; this.children = []; }
    get firstChild() { return this.children[0]; }
    append(...nodes) { for (const node of nodes) node.parent = this; this.children.push(...nodes); }
    after(node) { node.parent = this.parent; this.parent.children.splice(this.parent.children.indexOf(this) + 1, 0, node); }
    remove() { this.parent.children = this.parent.children.filter(node => node !== this); }
    focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; }
    replaceChildren(...nodes) { this._text = ''; this.children = []; this.append(...nodes); }
    addEventListener(name, fn, options) { (this.listeners[name] ||= []).push({ fn, once: options?.once }); }
    removeEventListener(name, fn) { this.listeners[name] = (this.listeners[name] || []).filter(entry => entry.fn !== fn); }
    setAttribute(name, value) { this.attributes[name] = String(value); if (name === 'class') this.className = value; }
    getAttribute(name) { return this.attributes[name] ?? null; }
    matches(selector) { return selector.split(',').some(raw => { const part = raw.trim(); return part.startsWith('.') ? this.classList.contains(part.slice(1)) : part.startsWith('#') ? this.id === part.slice(1) : this.tagName === part; }); }
    querySelectorAll(selector = '*') { return this.children.flatMap(node => [...(selector === '*' || node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    get elements() { return { namedItem: name => this.querySelectorAll().find(node => node.name === name) }; }
    play() { this.playCalls++; this.paused = false; return Promise.resolve(); }
    pause() { this.pauseCalls++; this.paused = true; }
    async emit(name, details = {}) {
        const event = { key: '', target: this, defaultPrevented: false, stopped: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...details };
        for (const { fn, once } of [...(this.listeners[name] || [])]) { await fn(event); if (once) this.removeEventListener(name, fn); }
        return event;
    }
}
function doc() {
    const document = new Node('#document');
    document.title = ''; document.baseURI = 'https://example.test/'; document.readyState = 'complete';
    document.documentElement = new Node('html', document); document.documentElement.lang = 'en';
    document.head = new Node('head', document); document.body = new Node('body', document);
    document.documentElement.append(document.head, document.body); document.append(document.documentElement);
    document.createElement = tag => new Node(tag, document); document.createElementNS = (_, tag) => document.createElement(tag);
    document.getElementById = id => document.querySelector('#' + id);
    return document;
}
function win() { const window = new Node(); window.document = doc(); window.focus = () => {}; window.close = () => { window.closed = true; return window.emit('pagehide'); }; return window; }
(async () => {
    const document = doc(), mount = document.createElement('div'), panel = document.createElement('div');
    mount.id = 'myntPomoFloatMount'; panel.id = 'pomodoroPanel'; document.body.append(mount, panel);
    const originalVideo = document.createElement('video'); originalVideo.className = 'pomodoro-bg-video'; panel.append(originalVideo);
    document.body.style.setProperty('--accentLightTint-blue', '#ffe7e7'); document.documentElement.style.setProperty('--mynt-font-scale', '1.2');
    let opened = 0, subscribed = 0, unsubscribed = 0, reset = 0, started = 0, paused = 0, extended = 0, last, renderState;
    const window = new Node();
    let state = { phase: 'work', timeRemaining: 1500, totalTime: 1500, currentRound: 1, durations: { roundsBeforeLong: 4 }, isRunning: false, task: '' };
    window.myntPomodoro = {
        getState: () => state,
        subscribe: render => { subscribed++; renderState = render; return () => { unsubscribed++; }; },
        reset: () => { reset++; }, start: () => { started++; }, pause: () => { paused++; }, extend: minutes => { extended += minutes; }, setTask: task => { state = { ...state, task }; renderState(state); }
    };
    let popupFeatures;
    window.open = (_, __, features) => { opened++; popupFeatures = features; last = win(); return last; };
    const media = {};
    window.matchMedia = query => media[query] ||= Object.assign(new Node(), { matches: false });
    let savedBlob = null;
    const indexedDB = { open() {
        const req = { result: { close() {}, transaction() {
            const tx = { objectStore() { return {
                get: () => ({ result: savedBlob }),
                put: blob => { savedBlob = blob; return {}; },
                delete: () => { savedBlob = null; return {}; }
            }; } };
            queueMicrotask(() => tx.oncomplete?.()); return tx;
        } } };
        queueMicrotask(() => req.onsuccess?.()); return req;
    } };
    const observers = [];
    const context = { document, window, localStorage: { getItem: () => null, setItem() {} }, MutationObserver: class { constructor(fn) { observers.push(fn); } observe() {} }, getComputedStyle: node => node.style, URL, indexedDB, Image: class { constructor() { this.naturalWidth = 20; this.naturalHeight = 20; } decode() { return Promise.resolve(); } }, console };
    vm.runInNewContext(fs.readFileSync(require.resolve('../scripts/pomodoro-float.js'), 'utf8'), context);
    assert.equal(panel.classList.contains('mynt-pomo-static'), false, 'default leaves original video and overlay alone');
    assert.equal(originalVideo.pauseCalls, 0, 'appearance module never controls original video lifecycle');
    const find = (root, label) => root.querySelectorAll('button').find(node => node.textContent === label || node.getAttribute('aria-label') === label);
    const ordinaryButton = mount.querySelector('.mynt-pomo-open-popup'), floatButton = mount.querySelector('.mynt-pomo-open-float');
    const status = mount.querySelector('.mynt-pomo-note');
    await ordinaryButton.emit('click');
    assert.equal(opened, 1); assert.equal(subscribed, 1); assert.equal(popupFeatures, 'popup,width=320,height=380');
    assert.equal(last.document.documentElement.style.getPropertyValue('--accentLightTint-blue'), '#ffe7e7');
    assert.equal(last.document.documentElement.style.getPropertyValue('--mynt-font-scale'), '1.2');
    assert.equal(last.document.querySelector('.pomodoroCircleWrap').children.length, 2, 'circle has decorative SVG and readable timer');
    assert.equal(last.document.querySelector('.pomodoroProgressRing').getAttribute('aria-hidden'), 'true');
    assert.equal(last.document.querySelector('.pomodoroTimeDisplay').textContent, '25:00');
    assert.equal(last.document.querySelector('.pomodoroRoundDisplay').textContent, 'Round 1 / 4');
    assert.ok(!last.document.querySelector('.mynt-pomo-options').open, 'advanced controls start collapsed');
    assert.ok(last.document.querySelector('video').playCalls > 0, 'original mode plays packaged background in the miniwindow');
    assert.match(last.document.querySelector('video').src, /^https:\/\/example\.test\/videos\/pomodoro-bg\.mp4$/);
    await ordinaryButton.emit('click'); assert.equal(opened, 1, 'reuse existing window');
    await last.close(); assert.equal(unsubscribed, 1); assert.equal(reset, 0, 'closing float must not reset shared timer');
    assert.equal(last.document.querySelector('video').paused, true, 'closing miniwindow pauses its video');
    await ordinaryButton.emit('click'); assert.equal(opened, 2); assert.equal(subscribed, 2);
    await window.emit('pagehide');
    assert.ok(last.document.body.querySelectorAll().some(node => node.textContent.includes('Original tab closed')));
    assert.equal(find(last.document, 'Start').disabled, true);
    assert.ok(!find(last.document, 'Close window').disabled, 'disconnected window can still be closed');
    assert.equal(last.document.querySelector('video').paused, true);
    await last.close();
    window.open = () => null; await ordinaryButton.emit('click'); assert.match(status.textContent, /blocked/i);
    let resolvePip, pipCalls = 0, requestedSize;
    window.documentPictureInPicture = { requestWindow: size => { requestedSize = size; pipCalls++; return new Promise(resolve => { resolvePip = resolve; }); } };
    const pending = floatButton.emit('click');
    await floatButton.emit('click'); assert.equal(pipCalls, 1, 'one pending PiP request');
    const pip = win(); resolvePip(pip); await pending;
    assert.equal(requestedSize.width, 320); assert.equal(requestedSize.height, 380);
    await find(pip.document, 'Start').emit('click'); assert.equal(started, 1);
    state = { ...state, isRunning: true, timeRemaining: 750, task: 'Read chapter three' }; renderState(state);
    assert.equal(pip.document.querySelector('.pomodoroTimeDisplay').textContent, '12:30');
    assert.equal(Number(pip.document.querySelector('.pomodoroRingFg').style.strokeDashoffset), circumference / 2);
    assert.equal(pip.document.querySelector('.mynt-pomo-task-preview').textContent, 'Read chapter three');
    await find(pip.document, 'Pause').emit('click'); assert.equal(paused, 1);
    await find(pip.document, '+5 minutes').emit('click'); assert.equal(extended, 5);
    const task = pip.document.querySelector('input'); task.focus(); task.value = 'Draft in progress';
    renderState({ ...state, task: 'Remote task' }); assert.equal(task.value, 'Draft in progress', 'live state does not erase a focused task edit');
    await task.emit('change'); assert.equal(state.task, 'Draft in progress');
    await find(pip.document, 'Reset').emit('click'); assert.equal(reset, 0, 'reset waits for explicit confirmation');
    await find(pip.document, 'Cancel').emit('click'); assert.equal(reset, 0, 'cancel preserves timer');
    assert.equal(pip.document.activeElement, find(pip.document, 'Reset'), 'cancel restores focus');
    await find(pip.document, 'Reset').emit('click');
    const escape = await pip.document.querySelector('.mynt-pomo-confirm').emit('keydown', { key: 'Escape' });
    assert.equal(escape.stopped, true); assert.ok(!pip.closed, 'reset Escape must not close the miniwindow');
    await find(pip.document, 'Reset').emit('click'); await find(pip.document, 'Confirm').emit('click'); assert.equal(reset, 1);
    state = { ...state, isRunning: false, timeRemaining: 1500 }; renderState(state);
    await find(pip.document, 'Reset').emit('click'); assert.equal(reset, 2, 'pristine reset requires no confirmation');
    state = { ...state, phase: 'shortBreak' }; renderState(state);
    assert.ok(pip.document.querySelector('.pomodoroRingFg').classList.contains('break-ring'));
    assert.equal(pip.document.querySelector('.pomodoroPhaseLabel').textContent, 'Short break');
    const appearance = window.myntPomoAppearance;
    appearance.applySettings({ mode: 'color', color: '#123456' });
    assert.equal(panel.style.getPropertyValue('--pomo-color'), '#123456');
    assert.ok(panel.classList.contains('mynt-pomo-static'));
    assert.ok(pip.document.querySelector('.mynt-pomo-card').classList.contains('mynt-pomo-static'));
    assert.ok(!pip.document.body.classList.contains('mynt-pomo-static'), 'custom appearance stays inside the compact card');
    assert.equal(pip.document.querySelector('video').paused, true);
    appearance.applySettings({ mode: 'gradient', color: '#123456', color2: '#abcdef' });
    assert.equal(panel.style.getPropertyValue('--pomo-background'), 'linear-gradient(135deg, #123456, #abcdef)');
    document.body.style.setProperty('--bg-image', 'url("homepage.jpg")');
    appearance.applySettings({ mode: 'home' });
    assert.equal(panel.style.getPropertyValue('--pomo-background'), 'url("homepage.jpg")', 'existing home mode still follows homepage imagery');
    document.body.style.removeProperty('--bg-image'); observers.forEach(fn => fn());
    assert.ok(!panel.classList.contains('mynt-pomo-static'), 'home without image falls back to the original video, not independent blue');
    assert.equal(panel.style.getPropertyValue('--pomo-color'), '');
    appearance.applySettings({ mode: 'original' });
    assert.equal(panel.style.getPropertyValue('--pomo-background'), '', 'returning to original clears only module background properties');
    assert.equal(pip.document.querySelector('video').paused, false);
    pip.document.hidden = true; await pip.document.emit('visibilitychange'); assert.equal(pip.document.querySelector('video').paused, true);
    pip.document.hidden = false; await pip.document.emit('visibilitychange'); assert.equal(pip.document.querySelector('video').paused, false);
    document.documentElement.classList.add('myntReducedMotion'); observers.forEach(fn => fn());
    assert.ok(pip.document.documentElement.classList.contains('myntReducedMotion'));
    assert.equal(pip.document.querySelector('video').paused, true);
    document.documentElement.classList.remove('myntReducedMotion');
    media['(prefers-reduced-motion: reduce)'].matches = true; await media['(prefers-reduced-motion: reduce)'].emit('change');
    assert.equal(pip.document.querySelector('video').paused, true, 'OS reduced motion pauses video too');
    media['(prefers-reduced-motion: reduce)'].matches = false;
    document.documentElement.classList.add('myntHighContrast'); observers.forEach(fn => fn());
    assert.ok(pip.document.documentElement.classList.contains('myntHighContrast')); assert.equal(pip.document.querySelector('video').paused, true);
    const options = pip.document.querySelector('.mynt-pomo-options'); options.open = true;
    await pip.document.emit('keydown', { key: 'Escape' }); assert.equal(options.open, false); assert.ok(!pip.closed);
    assert.equal(pip.document.activeElement, options.querySelector('summary'));
    await pip.document.emit('keydown', { key: 'Escape' }); assert.equal(pip.closed, true);
    window.documentPictureInPicture.requestWindow = async () => { throw new Error('Unsupported context'); };
    await floatButton.emit('click'); assert.match(status.textContent, /unavailable/i);
    const originalBlob = new Blob(['image'], { type: 'image/png' }); savedBlob = originalBlob;
    window.confirm = () => false;
    await find(mount, 'Delete saved image').emit('click'); assert.equal(savedBlob, originalBlob, 'cancel deletion preserves stored image');
    window.confirm = () => true;
    await find(mount, 'Delete saved image').emit('click'); assert.equal(savedBlob, null);
    assert.equal(find(mount, 'Undo image deletion').hidden, false);
    await find(mount, 'Undo image deletion').emit('click'); assert.equal(savedBlob, originalBlob, 'undo restores original Blob');
    assert.equal(find(mount, 'Undo image deletion').hidden, true);
    appearance.applySettings({ mode: 'image' }); assert.match(panel.style.getPropertyValue('--pomo-background'), /^url\("blob:/, 'restored image still paints');
    assert.equal(originalVideo.pauseCalls, 0, 'all appearance switches leave original panel video lifecycle untouched');
    console.log('Pomodoro float lifecycle, compact controls, appearance, accessibility, and recoverable deletion tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

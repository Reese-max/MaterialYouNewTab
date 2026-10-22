const assert = require('node:assert/strict');
const { validate, validImage } = require('../scripts/pomodoro-float.js');
const settings = validate({ mode: 'gradient', color: '#abcdef' });
assert.equal(settings.version, 1); assert.equal(settings.color, '#abcdef');
assert.deepEqual(Object.keys(settings).sort(), ['version','mode','color','color2','fit','position'].sort());
for (const value of [null, [], { mode: 'url(https://bad)' }, { color: 'red; background: url(x)' }, { position: 'calc(1px)' }, { fit: 'invalid' }]) assert.throws(() => validate(value));
assert.equal(validImage({ type: 'image/png', size: 8 * 1024 * 1024 }), true);
for (const file of [null, { type: 'image/svg+xml', size: 12 }, { type: 'image/png', size: 0 }, { type: 'image/png', size: 8 * 1024 * 1024 + 1 }]) assert.equal(validImage(file), false);
assert.equal(validate({ mode: 'image', blob: 'secret' }).blob, undefined);
console.log('Pomodoro appearance validators passed');

// Minimal DOM harness exercises window ownership and timer subscription cleanup.
const vm = require('node:vm');
const fs = require('node:fs');
class Node {
    constructor(tag = '') { this.tagName = tag; this.children = []; this.listeners = {}; this.classList = { add() {} }; this.style = { setProperty() {} }; this.value = ''; }
    append(...nodes) { for (const node of nodes) node.parent = this; this.children.push(...nodes); }
    after(node) { node.parent = this.parent; this.parent.children.splice(this.parent.children.indexOf(this) + 1, 0, node); }
    remove() { this.parent.children = this.parent.children.filter(node => node !== this); }
    focus() {}
    replaceChildren(...nodes) { this.children = nodes; }
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
    removeEventListener(name, fn) { this.listeners[name] = (this.listeners[name] || []).filter(x => x !== fn); }
    setAttribute() {}
    querySelectorAll() { return this.children.flatMap(n => [n, ...n.querySelectorAll()]); }
    get elements() { return { namedItem: name => this.querySelectorAll().find(node => node.name === name) }; }
    async emit(name) { for (const fn of this.listeners[name] || []) await fn({ key: '', target: this }); }
}
function doc() { return { title: '', baseURI: 'https://example.test/', readyState: 'complete', documentElement: { lang: 'en' }, head: new Node(), body: new Node(), createElement: tag => new Node(tag), addEventListener() {} }; }
(async () => {
    const document = doc(), mount = new Node(), panel = new Node();
    document.getElementById = id => id === 'myntPomoFloatMount' ? mount : panel;
    let opened = 0, subscribed = 0, unsubscribed = 0, reset = 0, last;
    const window = new Node();
    let state = { phase: 'work', timeRemaining: 1500, totalTime: 1500, currentRound: 1 };
    window.myntPomodoro = { getState: () => state, subscribe: () => { subscribed++; return () => { unsubscribed++; }; }, reset: () => { reset++; } };
    window.open = () => { opened++; last = new Node(); last.document = doc(); last.focus = () => {}; last.close = () => { last.closed = true; last.emit('pagehide'); }; return last; };
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
    const context = { document, window, localStorage: { getItem: () => null, setItem() {} }, MutationObserver: class { observe() {} }, getComputedStyle: () => ({ getPropertyValue: () => '' }), URL, indexedDB, Image: class { constructor() { this.naturalWidth = 20; this.naturalHeight = 20; } decode() { return Promise.resolve(); } }, console };
    vm.runInNewContext(fs.readFileSync(require.resolve('../scripts/pomodoro-float.js'), 'utf8'), context);
    await mount.children[1].emit('click');
    assert.equal(opened, 1); assert.equal(subscribed, 1);
    await mount.children[1].emit('click'); assert.equal(opened, 1, 'reuse existing window');
    last.close(); assert.equal(unsubscribed, 1); assert.equal(reset, 0, 'closing float must not reset shared timer');
    await mount.children[1].emit('click'); assert.equal(opened, 2); assert.equal(subscribed, 2);
    await window.emit('pagehide');
    assert.ok(last.document.body.querySelectorAll().some(node => node.textContent?.includes('Original tab closed')));
    last.close();
    window.open = () => null; await mount.children[1].emit('click');
    assert.match(mount.children[2].textContent, /blocked/i);
    let resolvePip, pipCalls = 0;
    window.documentPictureInPicture = { requestWindow: () => { pipCalls++; return new Promise(resolve => { resolvePip = resolve; }); } };
    const pending = mount.children[0].emit('click');
    await mount.children[0].emit('click'); assert.equal(pipCalls, 1, 'one pending PiP request');
    const pip = new Node(); pip.document = doc(); pip.focus = () => {}; pip.close = () => { pip.closed = true; pip.emit('pagehide'); };
    resolvePip(pip); await pending;
    const find = label => pip.document.body.querySelectorAll().find(node => node.tagName === 'button' && node.textContent === label);
    state = { ...state, isRunning: true, timeRemaining: 1400 };
    await find('Reset').emit('click'); assert.equal(reset, 0, 'reset waits for explicit confirmation');
    await find('Cancel').emit('click'); assert.equal(reset, 0, 'cancel preserves timer');
    await find('Reset').emit('click'); await find('Confirm').emit('click'); assert.equal(reset, 1);
    state = { ...state, isRunning: false, timeRemaining: 1500 };
    await find('Reset').emit('click'); assert.equal(reset, 2, 'pristine reset requires no confirmation');
    pip.close();
    window.documentPictureInPicture.requestWindow = async () => { throw new Error('Unsupported context'); };
    await mount.children[0].emit('click'); assert.match(mount.children[2].textContent, /unavailable/i);
    const mainButton = label => mount.querySelectorAll().find(node => node.tagName === 'button' && node.textContent === label);
    const originalBlob = new Blob(['image'], { type: 'image/png' }); savedBlob = originalBlob;
    window.confirm = () => false;
    await mainButton('Delete saved image').emit('click'); assert.equal(savedBlob, originalBlob, 'cancel deletion preserves stored image');
    window.confirm = () => true;
    await mainButton('Delete saved image').emit('click'); assert.equal(savedBlob, null);
    assert.equal(mainButton('Undo image deletion').hidden, false);
    await mainButton('Undo image deletion').emit('click'); assert.equal(savedBlob, originalBlob, 'undo restores original Blob');
    assert.equal(mainButton('Undo image deletion').hidden, true);
    console.log('Pomodoro float lifecycle and recoverable deletion tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

const assert = require('node:assert/strict');
const { validate, validImage, progressOffset, paletteFor, contrast, rgb, pipOptions, compactWindowSize, isCompactWindow } = require('../scripts/pomodoro-float.js');
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
const lightPalette = paletteFor([rgb('#ffffff')]), darkPalette = paletteFor([rgb('#000000')]);
assert.equal(lightPalette['--pomo-fg'], '#17243b'); assert.equal(darkPalette['--pomo-fg'], '#f6f8ff');
assert.equal(lightPalette['--pomo-overlay'], 'none', 'solid light color never receives a blanket dark overlay');
assert.equal(darkPalette['--pomo-overlay'], 'none', 'solid dark color needs no overlay either');
assert.match(paletteFor([rgb('#ffffff'), rgb('#000000')])['--pomo-overlay'], /linear-gradient/, 'mixed bright and dark gradients get a soft scrim');
assert.match(paletteFor([], true)['--pomo-overlay'], /linear-gradient/, 'unreadable imagery uses a subtle gradient and readable local surfaces');
assert.equal(paletteFor([rgb('#ffffff')], true)['--pomo-scheme'], 'light', 'sampled bright local images use dark text and light surfaces');
for (const palette of [lightPalette, darkPalette, paletteFor([], true), paletteFor([rgb('#ff00ff'), rgb('#00ff00')])]) {
    const surface = palette['--pomo-surface'].match(/[\d.]+/g).map(Number);
    for (const backdrop of [[0, 0, 0], [255, 255, 255], [255, 0, 255], [0, 255, 0]]) {
        const composite = backdrop.map((channel, index) => surface[index] * surface[3] + channel * (1 - surface[3]));
        for (const token of ['--pomo-fg', '--pomo-muted', '--pomo-accent']) assert.ok(contrast(rgb(palette[token]), composite) >= 4.5, `${token} remains readable on its surface over any supported background`);
    }
    assert.ok(contrast(rgb(palette['--pomo-accent']), rgb(palette['--pomo-on-accent'])) >= 4.5, 'primary controls meet text contrast');
}
for (const color of ['#abcde0', '#777777', '#cc7722', '#00ffff', '#ee44cc', '#243247']) {
    const palette = paletteFor([rgb(color)]);
    if (palette['--pomo-overlay'] === 'none') assert.ok(contrast(rgb(palette['--pomo-fg']), rgb(color)) >= 4.5, 'unfiltered solid background has readable primary text');
}
assert.equal(paletteFor([], true, ['#ddb7e8'])['--pomo-accent'], '#ddb7e8', 'readable selected Material hue is preserved, not replaced with blue');
assert.equal(paletteFor([rgb('#ffffff')], false, ['#ddb7e8', '#703b7d'])['--pomo-accent'], '#703b7d', 'light backgrounds select a readable dark token from the same theme');
const adjustedTheme = paletteFor([rgb('#ffffff')], false, ['#eeaaff']);
assert.ok(rgb(adjustedTheme['--pomo-accent'])[0] > rgb(adjustedTheme['--pomo-accent'])[1], 'contrast correction retains warm theme hue');
assert.deepEqual(rgb('#abc'), [170, 187, 204]); assert.deepEqual(rgb('rgb(170, 187, 204)'), [170, 187, 204]);
assert.equal(rgb('url(https://example.test)'), null); assert.equal(rgb('rgb(300, 0, 0)'), null);
assert.deepEqual(pipOptions(), { width: 320, height: 420, preferInitialWindowPlacement: true });
assert.deepEqual(compactWindowSize({ innerWidth: 1083, innerHeight: 781, outerWidth: 1091, outerHeight: 819 }), { width: 328, height: 458 }, 'resizeTo accounts for measured native window chrome');
assert.deepEqual(compactWindowSize({}), { width: 320, height: 420 }, 'missing geometry has a safe compact request');
assert.equal(isCompactWindow({ innerWidth: 320, innerHeight: 420 }), true);
assert.equal(isCompactWindow({ innerWidth: 1083, innerHeight: 781 }), false);
console.log('Pomodoro appearance, contrast palette, PiP request, and progress validators passed');

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
    focus(options) { this.lastFocusOptions = options; if (this.ownerDocument) this.ownerDocument.activeElement = this; }
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
let videoSnapshotDraws = 0;
function doc() {
    const document = new Node('#document');
    document.title = ''; document.baseURI = 'https://example.test/'; document.readyState = 'complete';
    document.documentElement = new Node('html', document); document.documentElement.lang = 'en';
    document.head = new Node('head', document); document.body = new Node('body', document);
    document.documentElement.append(document.head, document.body); document.append(document.documentElement);
    document.createElement = tag => {
        const node = new Node(tag, document);
        if (tag === 'canvas') {
            node.getContext = () => ({ fillRect() {}, drawImage(source) { if (source.tagName === 'video') videoSnapshotDraws++; }, getImageData: () => ({ data: new Uint8ClampedArray(12 * 12 * 4).fill(255) }) });
            node.toDataURL = () => 'data:image/jpeg;base64,dGVzdA==';
        }
        return node;
    };
    document.createElementNS = (_, tag) => document.createElement(tag);
    document.getElementById = id => document.querySelector('#' + id);
    return document;
}
const resizeChecks = [];
function win() { const window = new Node(); window.document = doc(); window.focus = () => {}; window.close = () => { window.closed = true; return window.emit('pagehide'); }; window.setTimeout = callback => { resizeChecks.push(callback); }; window.scrollTo = (x, y) => { window.lastScroll = [x, y]; }; return window; }
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
    const appearanceForm = mount.querySelector('form'), choices = mount.querySelectorAll('.mynt-pomo-background-choice');
    const modeInput = mode => choices.find(tile => tile.querySelector('input').value === mode).querySelector('input');
    assert.equal(choices.length, 5, 'five keyboard-accessible native radio thumbnail choices');
    const originalChoice = choices.find(tile => tile.querySelector('input').value === 'original');
    assert.equal(originalChoice.querySelector('.mynt-pomo-preview-fallback').hidden, false, 'unavailable video preview is honestly labelled');
    originalVideo.readyState = 2; originalVideo.videoWidth = 160; originalVideo.src = 'videos/pomodoro-bg.mp4';
    await originalVideo.emit('loadeddata');
    assert.equal(videoSnapshotDraws, 1, 'only one snapshot from the existing decoded video');
    assert.equal(originalChoice.querySelector('.mynt-pomo-preview-fallback').hidden, true);
    assert.match(originalChoice.querySelector('.mynt-pomo-background-preview').style.getPropertyValue('background-image'), /data:image\/jpeg/);
    assert.equal(originalVideo.playCalls, 0, 'thumbnail never starts original video playback');
    assert.equal(modeInput('original').checked, true);
    assert.equal(modeInput('original').type, 'radio');
    assert.equal(modeInput('original').name, 'mode');
    assert.equal(appearanceForm.elements.namedItem('color').parent.hidden, true, 'irrelevant color fields stay hidden');
    assert.equal(mount.querySelector('.mynt-pomo-image-controls').hidden, true, 'upload is revealed only in image mode');
    assert.ok(!mount.querySelector('.mynt-pomo-image-framing').open, 'advanced image framing starts collapsed');
    await appearanceForm.emit('change', { target: modeInput('gradient') });
    assert.equal(modeInput('gradient').checked, true); assert.equal(modeInput('original').checked, false);
    assert.equal(appearanceForm.elements.namedItem('color').parent.hidden, false);
    assert.equal(appearanceForm.elements.namedItem('color2').parent.hidden, false);
    await appearanceForm.emit('change', { target: modeInput('image') });
    assert.equal(mount.querySelector('.mynt-pomo-image-controls').hidden, false);
    assert.equal(mount.querySelector('.mynt-pomo-image-framing').hidden, false);
    assert.equal(appearanceForm.elements.namedItem('color').parent.hidden, true);
    assert.match(status.textContent, /Choose a local image/);
    await appearanceForm.emit('change', { target: modeInput('original') });
    const appearanceDetails = mount.querySelector('.mynt-pomo-appearance'); appearanceDetails.open = true;
    const appearanceEscape = await appearanceDetails.emit('keydown', { key: 'Escape' });
    assert.equal(appearanceDetails.open, false); assert.equal(appearanceEscape.stopped, true);
    assert.equal(document.activeElement, appearanceDetails.querySelector('summary'));
    await ordinaryButton.emit('click');
    assert.equal(opened, 1); assert.equal(subscribed, 1); assert.equal(popupFeatures, 'popup,width=320,height=420');
    assert.equal(last.document.documentElement.style.getPropertyValue('--accentLightTint-blue'), '#ffe7e7');
    assert.equal(last.document.querySelector('.mynt-pomo-card').style.getPropertyValue('--pomo-accent'), '#ffe7e7', 'PiP respects the actual selected Material hue');
    assert.equal(last.document.documentElement.style.getPropertyValue('--mynt-font-scale'), '1.2');
    assert.equal(last.document.querySelector('.pomodoroCircleWrap').children.length, 2, 'circle has decorative SVG and readable timer');
    assert.equal(last.document.querySelector('.pomodoroProgressRing').getAttribute('aria-hidden'), 'true');
    assert.equal(last.document.querySelector('.pomodoroTimeDisplay').textContent, '25:00');
    assert.equal(last.document.querySelector('.pomodoroRoundDisplay').textContent, 'Round 1 / 4');
    const cardChildren = last.document.querySelector('.mynt-pomo-context').children;
    assert.ok(cardChildren.indexOf(last.document.querySelector('.mynt-pomo-task-preview')) < cardChildren.indexOf(last.document.querySelector('.pomodoroRoundDisplay')), 'task is secondary to timer and comes before tertiary round statistics');
    assert.ok(!last.document.querySelector('.mynt-pomo-options').open, 'advanced controls start collapsed');
    assert.ok(!last.document.querySelector('.mynt-pomo-compact'), 'DocumentPiP sizing action is not shown in ordinary popup');
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
    assert.equal(requestedSize.width, 320); assert.equal(requestedSize.height, 420);
    assert.equal(requestedSize.preferInitialWindowPlacement, true, 'ask for initial compact placement rather than reusing a previously enlarged PiP');
    const compactButton = find(pip.document, 'Compact window'), pipNote = pip.document.querySelector('.mynt-pomo-card').querySelectorAll('.mynt-pomo-note').at(-1);
    const compactOptions = pip.document.querySelector('.mynt-pomo-options'); compactOptions.open = true;
    let resizedTo, resizeCalls = 0;
    Object.assign(pip, { innerWidth: 1083, innerHeight: 781, outerWidth: 1091, outerHeight: 819 });
    pip.resizeTo = (width, height) => { resizeCalls++; resizedTo = { width, height }; };
    assert.equal(resizeCalls, 0, 'never resize PiP automatically');
    await compactButton.emit('click');
    assert.deepEqual(resizedTo, { width: 328, height: 458 }); assert.equal(compactButton.disabled, true);
    assert.match(pipNote.textContent, /Requesting/);
    assert.equal(pipNote.classList.contains('mynt-pomo-sr-only'), true, 'pending announcement never adds visible card height');
    await compactButton.emit('click'); assert.equal(resizeCalls, 1, 'ignore repeated requests while the single result check is pending');
    resizeChecks.shift()(); assert.match(pipNote.textContent, /did not apply/, 'ignored requests disclose browser limit'); assert.equal(compactButton.disabled, false);
    assert.equal(pipNote.classList.contains('mynt-pomo-sr-only'), false, 'limitation stays visibly useful');
    assert.equal(compactOptions.open, true, 'unsuccessful sizing preserves the open options');
    assert.equal(resizeChecks.length, 0, 'no resize retry or polling loop');
    pip.resizeTo = () => { throw new Error('Browser refuses resizing'); };
    await compactButton.emit('click'); assert.match(pipNote.textContent, /Drag the window edges/); assert.equal(compactButton.disabled, false);
    pip.resizeTo = (width, height) => { pip.innerWidth = width - 8; pip.innerHeight = height - 38; pip.outerWidth = width; pip.outerHeight = height; };
    await compactButton.emit('click'); resizeChecks.shift()(); assert.match(pipNote.textContent, /size applied/, 'success requires verified compact viewport');
    assert.equal(pipNote.classList.contains('mynt-pomo-sr-only'), true, 'success announcement does not grow the compact card');
    assert.equal(compactOptions.open, false, 'successful compact request collapses options');
    assert.equal(pip.document.activeElement, compactOptions.querySelector('summary'), 'focus returns to the options disclosure');
    assert.equal(compactOptions.querySelector('summary').lastFocusOptions.preventScroll, true);
    assert.deepEqual(pip.lastScroll, [0, 0], 'compact window returns to the timer instead of staying scrolled down');
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
    for (const token of ['--pomo-fg', '--pomo-accent', '--pomo-surface', '--pomo-overlay', '--pomo-muted', '--pomo-border', '--pomo-on-accent', '--pomo-scheme']) {
        assert.equal(panel.style.getPropertyValue(token), pip.document.querySelector('.mynt-pomo-card').style.getPropertyValue(token), `${token} stays identical in the main panel and PiP`);
    }
    appearance.applySettings({ mode: 'color', color: '#fffafa' });
    assert.equal(panel.style.getPropertyValue('--pomo-scheme'), 'light');
    assert.equal(panel.style.getPropertyValue('--pomo-overlay'), 'none');
    assert.equal(pip.document.querySelector('.mynt-pomo-card').style.getPropertyValue('--pomo-fg'), '#17243b');
    appearance.applySettings({ mode: 'color', color: '#123456' });
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
    assert.equal(originalVideo.playCalls, 0, 'appearance and previews never start the original video');
    assert.equal(videoSnapshotDraws, 1, 'theme and mode changes reuse the thumbnail rather than doing per-frame work');
    assert.equal(panel.style.getPropertyValue('--pomo-scheme'), 'light', 'local image sampling derives a light palette from the decoded bright image');
    const css = fs.readFileSync(require.resolve('../styles/pomodoro-float.css'), 'utf8');
    assert.match(css, /font-variant-numeric: tabular-nums/);
    assert.match(css, /forced-colors: active/); assert.match(css, /prefers-reduced-motion: reduce/);
    assert.ok(!css.includes('linear-gradient(#0006, #0006)'), 'independent backgrounds no longer get a blanket dark filter');
    assert.ok(!css.includes('myntPomoPulse'), 'PiP ring does not pulse distractingly');
    assert.match(css, /\.mynt-pomo-float \.pomodoroTimeDisplay\s*\{[^}]*background:\s*transparent/, 'digits have no separate opaque pill');
    assert.match(css, /\.mynt-pomo-options\s*\{[^}]*border:\s*0[^}]*background:\s*transparent/, 'closed options are an unobtrusive text entry');
    assert.ok(css.indexOf('.mynt-pomo-float .mynt-pomo-static { background-image: var(--pomo-background') < css.indexOf('@media (forced-colors: active)'), 'single-scrim override cannot supersede forced-colors accessibility');
    console.log('Pomodoro float lifecycle, progressive thumbnail choices, synchronized palette, accessibility, and recoverable deletion tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

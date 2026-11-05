#!/usr/bin/env node
'use strict';
// Production float + music modules, reusing existing disposable DOM/media fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const sourceDir = process.argv.find(arg => arg.startsWith('--source-dir='))?.slice(13) || root;
const read = name => fs.readFileSync(path.join(sourceDir, name), 'utf8');
const floatHarness = fs.readFileSync(path.join(__dirname, 'check-pomodoro-float.cjs'), 'utf8');
const { Node, doc, win } = vm.runInNewContext(floatHarness.slice(floatHarness.indexOf('class Node'), floatHarness.indexOf('// 執行原模組')) + '\n;({Node,doc,win})', { Uint8ClampedArray });
const musicHarness = fs.readFileSync(path.join(__dirname, 'regress-music-daily.cjs'), 'utf8').split('(async () => {')[0];
const fixture = vm.runInNewContext(musicHarness.replace("const source = fs.readFileSync(require.resolve('../scripts/pomodoro-music.js'), 'utf8');", 'const source = sourceOverride;') + '\n;({clock,sharedStore,tab,seed})', { require, console, sourceOverride: read('scripts/pomodoro-music.js') });
const words = code => vm.runInNewContext(read(`locales/${code}.js`) + `\n;${code}`);

const watchdog = setTimeout(() => { console.error('FLOAT_SYNC_FAIL: unresolved asynchronous operation'); process.exitCode = 1; }, 10000);
(async () => {
    const time = fixture.clock(), shared = fixture.sharedStore(time, [fixture.seed('a'), fixture.seed('b')]);
    const player = await fixture.tab(shared, time);
    assert.equal(typeof player.api.subscribe, 'function', 'music exposes an observable existing player');
    const document = doc(), window = new Node(), mount = document.createElement('div'), panel = document.createElement('div');
    mount.id = 'myntPomoFloatMount'; panel.id = 'pomodoroPanel'; document.body.append(mount, panel);
    const saved = new Map([['selectedLanguage', 'en']]);
    let denyLanguage = false;
    const storage = { getItem: key => { if (denyLanguage && key === 'selectedLanguage') throw Error('Storage unavailable'); return saved.get(key) ?? null; }, setItem: (key, value) => saved.set(key, String(value)) };
    const timer = require('../scripts/pomodoro-timer-core.js').create({ storage });
    let today = 2, subject = 'db', popup, musicSubscriptions = 0, timerSubscriptions = 0;
    window.myntPomodoro = { ...timer, getContext: () => ({ sessionsToday: today }), subscribe(fn) { timerSubscriptions++; const off = timer.subscribe(fn); return () => { timerSubscriptions--; off(); }; } };
    window.myntPomoMusic = { ...player.api, subscribe(fn) { musicSubscriptions++; const off = player.api.subscribe(fn); return () => { musicSubscriptions--; off(); }; } };
    window.myntFocus = { get: () => ({ subject }) };
    let ambientPlaying = false;
    window.myntAmbientAudio = { getState: () => ({ playing: ambientPlaying }), async toggle() { ambientPlaying = !ambientPlaying; await document.emit('mynt:ambient-state'); } };
    window.open = () => popup = win();
    const dictionaries = { en: words('en'), zh_TW: words('zh_TW'), fr: { pomodoroWork: 'Travail' } };
    const observers = [];
    const context = { document, window, localStorage: storage, translations: dictionaries, MYNT_FOCUS_SUBJECTS: [['db','資料庫','Database'], ['sec','資安','Security']],
        MutationObserver: class { constructor(fn) { this.fn = fn; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } },
        getComputedStyle: node => node.style, URL, console, indexedDB: { open() { throw Error('No image store'); } } };
    vm.runInNewContext(read('scripts/pomodoro-float.js'), context);
    const open = async () => { await mount.querySelector('.mynt-pomo-open-popup').emit('click'); return popup.document; };
    let pd = await open();
    const q = selector => pd.querySelector(selector);
    const [musicButton, ambientButton] = q('.mynt-pomo-audio').children;
    assert.equal(musicButton.hidden, false); assert.match(musicButton.textContent, /a.mp3/);
    const musicStart = musicButton.emit('click'); await time.flush(); await musicStart;
    assert.equal(player.api.getPlayback().playing, true, 'float drives the main player');
    assert.equal(musicButton.getAttribute('aria-pressed'), 'true');
    assert.ok(player.nodes.some(node => node.dataset.playing === 'true'), 'main transport reflects float playback');
    await musicButton.emit('click'); await time.flush();
    assert.equal(player.api.getPlayback().playing, false);
    const play = player.api.play('b'); await time.flush(); await play;
    assert.match(musicButton.textContent, /Pause music: b.mp3/, 'main track/play change reaches float');
    player.api.pauseImmediate(); assert.match(musicButton.textContent, /Play music/);
    await time.flush();
    const audio = player.audios.at(-1), originalPlay = audio.play;
    audio.play = async () => { const error = Error('gesture required'); error.name = 'NotAllowedError'; throw error; };
    const failedStart = musicButton.emit('click'); await time.flush(); await failedStart;
    assert.equal(player.api.getPlayback().status, 'gesture');
    assert.ok(pd.querySelectorAll('.mynt-pomo-note').at(-1).textContent, 'Failed music playback must announce an accessible error in the floating window');
    audio.play = originalPlay;
    await ambientButton.emit('click'); assert.equal(ambientPlaying, true); assert.equal(ambientButton.getAttribute('aria-pressed'), 'true');
    const retry = musicButton.emit('click'); await time.flush(); await retry;
    assert.equal(player.api.getPlayback().playing, true); assert.equal(pd.querySelectorAll('.mynt-pomo-note').at(-1).textContent, '');
    player.api.pauseImmediate(); await time.flush();
    ambientPlaying = false; await document.emit('mynt:ambient-state'); assert.equal(ambientButton.getAttribute('aria-pressed'), 'false');
    assert.equal(q('.pomodoroPhaseLabel').textContent, dictionaries.en.pomodoroWork);
    assert.match(q('.pomodoroRoundDisplay').textContent, /Today 2 · Database/);
    today = 3; await document.emit('mynt:pomodoro-complete'); assert.match(q('.pomodoroRoundDisplay').textContent, /Today 3/);
    subject = 'sec'; await document.emit('mynt:focus-changed'); assert.match(q('.pomodoroRoundDisplay').textContent, /Security/);
    const options = q('.mynt-pomo-options'); assert.ok(!options.open);
    assert.equal(options.querySelectorAll('button').find(b => b.getAttribute('data-pomo-label') === 'extend').textContent, dictionaries.en.pomoStudioExtend);
    const fields = q('.mynt-pomo-durations').querySelectorAll('input');
    const error = q('#myntPomoDurationError'); assert.equal(error.getAttribute('role'), 'alert');
    for (const [index, max, key] of [[0,120,'workMinutes'],[1,60,'shortBreakMinutes'],[2,60,'longBreakMinutes']]) {
        const input = fields[index]; assert.equal(input.max, String(max)); assert.equal(input.min, '1');
        for (const value of ['', '0', '-1', '1.5', String(max + 1), 'NaN']) {
            const before = JSON.stringify(timer.getState()); input.focus(); input.value = value; await input.emit('change');
            assert.equal(JSON.stringify(timer.getState()), before, 'invalid duration preserves timer');
            assert.equal(input.getAttribute('aria-invalid'), 'true'); assert.ok(error.textContent);
        }
        input.value = String(max); await input.emit('change'); assert.equal(timer.getState().durations[key], max);
        assert.equal(input.getAttribute('aria-invalid'), 'false');
    }
    fields[0].value = '0'; await fields[0].emit('change');
    fields[1].value = '5'; await fields[1].emit('change');
    assert.equal(fields[0].getAttribute('aria-invalid'), 'true');
    assert.ok(error.textContent, 'An unresolved invalid field keeps its accessible message');
    fields[0].value = '25'; await fields[0].emit('change'); assert.equal(error.textContent, '');
    await timer.start(); const beforeTime = timer.getState().timeRemaining; fields[0].value = '30'; await fields[0].emit('change');
    assert.equal(timer.getState().timeRemaining, beforeTime, 'running countdown survives duration edit');
    await timer.pause();
    saved.set('selectedLanguage','zh_TW'); document.documentElement.lang = 'zh-TW'; await document.emit('mynt:language-changed');
    assert.equal(q('.pomodoroPhaseLabel').textContent, dictionaries.zh_TW.pomodoroWork);
    assert.equal(q('summary').textContent, '計時選項'); assert.match(q('.pomodoroRoundDisplay').textContent, /資安/);
    saved.set('selectedLanguage','fr'); document.documentElement.lang = 'fr'; await document.emit('mynt:language-changed');
    assert.equal(q('.pomodoroPhaseLabel').textContent,'Travail'); assert.equal(q('summary').textContent,dictionaries.en.pomoFloat_options, 'missing locale keys use English');
    {
    const s = read('scripts/pomodoro.js');
const listeners={};const phase={};
const ctx={document:{addEventListener(event,fn){listeners[event]=fn;}},translations:{en:{pomodoroWork:'Work'},zh_TW:{pomodoroWork:'工作'}},currentLanguage:'en',
 getRoundsBeforeLong:()=>4,getSessionsToday:()=>2,RING_CIRCUMFERENCE:440,pomodoroHover:null,
 pomodoroState:{phase:'work',isRunning:false,totalTime:1500,timeRemaining:1500,currentRound:1}};
for(const key of ['pomodoroRingFg','pomodoroTimeDisplay','pomodoroRoundDisplay','pomodoroStartBtn','pomodoroPauseBtn','pomodoroSessionsCount','pomodoroCont'])ctx[key]={style:{setProperty(){}},classList:{toggle(){},add(){},remove(){}},setAttribute(){}};
ctx.pomodoroPhaseLabel={...ctx.pomodoroCont,...phase};
vm.createContext(ctx);
vm.runInContext(s.slice(s.indexOf('function getPomodoroText('),s.indexOf('    let pomodoroState;'))+s.slice(s.indexOf('function updatePomodoroUI()'),s.indexOf('    // --- Timer controls:')),ctx);
const hook=s.match(/document\.addEventListener\("mynt:language-changed", updatePomodoroUI\);/);
if(hook)vm.runInContext(hook[0],ctx);
vm.runInContext('updatePomodoroUI()',ctx);assert.equal(ctx.pomodoroPhaseLabel.textContent,'Work');
ctx.currentLanguage='zh_TW';listeners['mynt:language-changed']?.();
assert.equal(ctx.pomodoroPhaseLabel.textContent,'工作','Idle main panel must relabel immediately with its floating window');
    }
    // Exercise the real language-selection handler, including loading a packaged locale.
    const languageSource = read('scripts/languages.js');
    const selector = new Node(); let applied = '', reloaded = false, floatOpen = false, savedLanguage = '';
    const lc = vm.createContext({ document: { getElementById: () => selector, createElement: () => ({}), head: { append(script) {
        vm.runInContext(read(script.src), lc); script.onload();
    } } }, currentLanguage:'en', isRTL:false, rtlLanguages:[], applyLanguage(lang) { applied = lang; }, location: { reload() { reloaded = true; } },
        window: { myntPomoFloat: { isOpen: () => floatOpen } }, saveLanguageStatus(key, value) { savedLanguage = value; } });
    vm.runInContext(read('locales/en.js'), lc);
    vm.runInContext(languageSource.slice(languageSource.indexOf('function readLocaleSources'), languageSource.indexOf('const savedLanguage')), lc);
    vm.runInContext(languageSource.slice(languageSource.indexOf('let languageRequest'), languageSource.indexOf('// Function to apply the language when')), lc);
    selector.value = 'zh_TW'; await selector.emit('change');
    assert.equal(reloaded, true, 'Without a floating window the main page reloads so every module relabels');
    assert.equal(savedLanguage, 'zh_TW'); assert.equal(applied, ''); reloaded = false; floatOpen = true;
    selector.value = 'zh_TW'; await selector.emit('change'); assert.equal(applied,'zh_TW'); assert.equal(reloaded,false, 'switching language preserves the live timer/window');
    assert.equal(lc.currentLanguage, 'zh_TW');
    const pendingLocales = [];
    lc.document.head.append = script => pendingLocales.push(script);
    selector.value = 'fr'; const stale = selector.emit('change');
    selector.value = 'pt'; const latest = selector.emit('change');
    pendingLocales[0].onerror(Error('local file unavailable')); await stale;
    assert.equal(selector.value, 'pt', 'An older failed locale request must not reset the latest selection');
    vm.runInContext(read('locales/pt.js'), lc); pendingLocales[1].onload(); await latest;
    assert.equal(applied, 'pt');
    const duplicateLoads = [];
    lc.document.head.append = script => duplicateLoads.push(script);
    selector.value = 'fr'; const firstFrench = selector.emit('change');
    selector.value = 'pt'; await selector.emit('change');
    selector.value = 'fr'; const secondFrench = selector.emit('change');
    for (const script of duplicateLoads) {
        assert.doesNotThrow(() => vm.runInContext(read(script.src), lc), 'Rapid choices must not redeclare a locale script');
        script.onload();
    }
    await firstFrench; await secondFrench; assert.equal(applied, 'fr');
    const counts = () => ['mynt:language-changed','mynt:ambient-state','mynt:focus-changed','mynt:pomodoro-complete'].reduce((n,event) => n + (document.listeners[event]?.length || 0), 0);
    assert.equal(counts(),4); assert.equal(musicSubscriptions,1); assert.equal(timerSubscriptions,1);
    await popup.close(); assert.equal(counts(),0); assert.equal(musicSubscriptions,0); assert.equal(timerSubscriptions,0);
    assert.ok(observers.some(o => o.disconnected));
    pd = await open(); await window.emit('pagehide'); assert.equal(counts(),0); assert.equal(musicSubscriptions,0); assert.equal(timerSubscriptions,0);
    assert.equal(q('.mynt-pomo-primary').disabled,true); assert.match(pd.querySelectorAll('.mynt-pomo-note').at(-1).textContent,/Original tab closed/);
    await popup.close();
    denyLanguage = true; pd = await open();
    assert.equal(q('.pomodoroPhaseLabel').textContent, 'Travail', 'storage read failure falls back to active page language');
    await popup.close(); denyLanguage = false;
    pd = await open();
    const resume = player.api.play('b'); await time.flush(); await resume;
    assert.equal(q('.mynt-pomo-audio').children[0].getAttribute('aria-pressed'), 'true');
    player.action('b','remove').emit('click'); await time.flush();
    assert.equal(player.api.getPlayback().playing, false, 'deleting a playing track stops the existing player');
    assert.match(q('.mynt-pomo-audio').children[0].textContent, /a.mp3/, 'deletion selects and reflects the surviving track');
    await popup.close();
    // No configured local tracks: hide the music transport, preserve ambient audio.
    const emptyTime = fixture.clock(), empty = await fixture.tab(fixture.sharedStore(emptyTime), emptyTime);
    window.myntPomoMusic = empty.api; pd = await open(); assert.equal(q('.mynt-pomo-audio').children[0].hidden,true);
    await popup.close();
    pd = await open();
    const beforeQueuedStart = JSON.stringify(timer.getState());
    const queuedStart = q('.mynt-pomo-primary').emit('click');
    const closedDuringStart = popup.close(); await queuedStart; await closedDuringStart;
    assert.equal(JSON.stringify(timer.getState()), beforeQueuedStart, 'close before queued invocation prevents a stale timer command');
    assert.equal(counts(),0); assert.equal(timerSubscriptions,0);
    // Exercise the same controls through the Document PiP construction path.
    let rejectPendingMusic;
    const pendingMusic = new Promise((resolve,reject) => { rejectPendingMusic = reject; });
    window.myntPomoMusic = { ...player.api, play: () => pendingMusic, subscribe(fn) {
        musicSubscriptions++; const off = player.api.subscribe(fn); return () => { musicSubscriptions--; off(); };
    } };
    window.documentPictureInPicture = { requestWindow: async () => popup = win() };
    await mount.querySelector('.mynt-pomo-open-float').emit('click'); pd = popup.document;
    assert.ok(q('.mynt-pomo-compact')); assert.equal(q('.mynt-pomo-durations').querySelectorAll('input').length,3);
    assert.equal(counts(),4); assert.equal(musicSubscriptions,1); assert.equal(timerSubscriptions,1);
    const pipFields = q('.mynt-pomo-durations').querySelectorAll('input');
    pipFields[0].focus(); pipFields[0].value = '42'; await timer.setDurations({workMinutes:35});
    assert.equal(pipFields[0].value,'42','a main-page duration update preserves a focused floating draft');
    pd.activeElement = null; await timer.setDurations({workMinutes:36});
    assert.equal(Number(pipFields[0].value),36,'main-page duration changes reach the PiP field');
    const pipNote = pd.querySelectorAll('.mynt-pomo-note').at(-1);
    const ambientToggle = window.myntAmbientAudio.toggle;
    window.myntAmbientAudio.toggle = async () => false;
    await q('.mynt-pomo-audio').children[1].emit('click'); await new Promise(setImmediate);
    assert.ok(pipNote.textContent,'ambient false result exposes an error too');
    window.myntAmbientAudio.toggle = ambientToggle;
    await q('.mynt-pomo-audio').children[1].emit('click'); await new Promise(setImmediate);
    assert.equal(pipNote.textContent,'','successful ambient retry clears the error');
    const lateMusic = q('.mynt-pomo-audio').children[0].emit('click'); await popup.close();
    rejectPendingMusic(Error('late music rejection')); await lateMusic;
    assert.equal(pipNote.textContent,'','a rejection after close cannot mutate the detached window status');
    assert.equal(counts(),0); assert.equal(musicSubscriptions,0); assert.equal(timerSubscriptions,0);
    player.close(); empty.close();
    // Real NodeList has no .at(); the synthetic DOM returns arrays, so guard the shipped source directly.
    assert.doesNotMatch(read('scripts/pomodoro-float.js'), /querySelectorAll\([^)]*\)\.(at|find|map|filter)\(/, 'NodeList has no array methods in real browsers');
    console.log('FLOAT_SYNC_OK: music/ambient both directions, shared wording, live today/subject, language relabel/loading/fallback, strict durations/countdown preservation, close/reload cleanup');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(watchdog));

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
    const longName = '雨夜讀書 Lo-fi 長版本專注音樂合輯.WAV';
    const time = fixture.clock(), shared = fixture.sharedStore(time, [fixture.seed('a'), fixture.seed('b'), { ...fixture.seed('c'), name: longName }]);
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
    const panelSelect = document.createElement('select'); panelSelect.id = 'pomodoroAmbientSelect'; panelSelect.value = 'rain'; panel.append(panelSelect);
    let ambientPlaying = false, ambientType = 'rain', ambientPlays = [];
    window.myntAmbientAudio = {
        types: ['rain', 'thunder', 'ocean', 'stream', 'wind', 'forest', 'night', 'campfire', 'whitenoise', 'pink', 'brown'],
        getState: () => ({ type: ambientType, playing: ambientPlaying }),
        async play(type) { ambientType = type; ambientPlaying = true; ambientPlays.push(type); storage.setItem('myntAmbientType', type); await document.emit('mynt:ambient-state'); return true; },
        async toggle(type) { if (!ambientPlaying) return this.play(type); ambientPlaying = false; await document.emit('mynt:ambient-state'); }
    };
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
    const musicRow = q('.mynt-pomo-music-row'), ambientRow = q('.mynt-pomo-ambient-row');
    assert.ok(musicRow && ambientRow, 'music and ambient have separate readable controls');
    const musicButton = musicRow.querySelector('button'), ambientButton = ambientRow.querySelector('button');
    const trackName = q('.mynt-pomo-track-name'), nextButton = q('.mynt-pomo-next'), ambientSelect = q('.mynt-pomo-ambient-select');
    const playPath = 'M8 5v14l11-7z', pausePath = 'M6 19h4V5H6zm8-14v14h4V5z';
    const audioState = (row, button, playing) => {
        assert.equal(button.getAttribute('aria-pressed'), String(playing));
        assert.equal(button.querySelector('path').getAttribute('d'), playing ? pausePath : playPath);
        assert.equal(row.classList.contains('is-playing'), playing);
        assert.equal(row.querySelector('.mynt-pomo-equalizer').hidden, !playing);
    };
    assert.equal(musicRow.hidden, false); assert.equal(trackName.textContent, 'a'); assert.equal(trackName.title, 'a.mp3');
    assert.equal(nextButton.hidden, false); assert.equal(nextButton.getAttribute('aria-label'), 'Next track');
    audioState(musicRow, musicButton, false); audioState(ambientRow, ambientButton, false);
    assert.equal(musicButton.getAttribute('aria-label'), 'Play music: a');
    const reordered = player.api.getTracks();
    window.myntPomoMusic.getTracks = () => [reordered[0], reordered[2], reordered[1]];
    for (const expected of ['c', 'b', 'a']) {
        const next = nextButton.emit('click'); await time.flush(); await next;
        assert.equal(player.api.getPlayback().selectedId, expected, 'next follows API order and wraps');
        assert.equal(player.api.getPlayback().playing, true, 'next starts the selected track');
        assert.equal(trackName.textContent, expected === 'c' ? longName.slice(0, -4) : expected);
        assert.equal(trackName.title, expected === 'c' ? longName : `${expected}.mp3`); audioState(musicRow, musicButton, true);
    }
    window.myntPomoMusic.getTracks = player.api.getTracks;
    player.api.pauseImmediate(); await time.flush();
    const musicStart = musicButton.emit('click'); await time.flush(); await musicStart;
    assert.equal(player.api.getPlayback().playing, true, 'float drives the main player');
    audioState(musicRow, musicButton, true);
    assert.ok(player.nodes.some(node => node.dataset.playing === 'true'), 'main transport reflects float playback');
    await musicButton.emit('click'); await time.flush();
    assert.equal(player.api.getPlayback().playing, false);
    const play = player.api.play('b'); await time.flush(); await play;
    assert.equal(trackName.textContent, 'b', 'main track change reaches the separate track label');
    assert.equal(musicButton.getAttribute('aria-label'), 'Pause music: b');
    player.api.pauseImmediate(); assert.match(musicButton.getAttribute('aria-label'), /Play music/); audioState(musicRow, musicButton, false);
    await time.flush();
    const audio = player.audios.at(-1), originalPlay = audio.play;
    audio.play = async () => { const error = Error('gesture required'); error.name = 'NotAllowedError'; throw error; };
    const failedStart = musicButton.emit('click'); await time.flush(); await failedStart;
    assert.equal(player.api.getPlayback().status, 'gesture');
    assert.ok(pd.querySelectorAll('.mynt-pomo-note').at(-1).textContent, 'Failed music playback must announce an accessible error in the floating window');
    audio.play = originalPlay;
    await ambientButton.emit('click'); assert.equal(ambientPlaying, true); assert.equal(ambientButton.getAttribute('aria-pressed'), 'true');
    audioState(ambientRow, ambientButton, true);
    ambientSelect.value = 'ocean'; await ambientSelect.emit('change');
    assert.equal(ambientType, 'ocean'); assert.equal(ambientPlays.at(-1), 'ocean', 'changing a playing sound calls the existing API');
    assert.equal(panelSelect.value, 'ocean'); assert.equal(saved.get('myntAmbientType'), 'ocean');
    await ambientButton.emit('click'); const playCount = ambientPlays.length;
    ambientSelect.value = 'campfire'; await ambientSelect.emit('change');
    assert.equal(ambientPlays.length, playCount, 'changing a stopped sound never starts audio');
    assert.equal(ambientPlaying, false); assert.equal(panelSelect.value, 'campfire'); assert.equal(saved.get('myntAmbientType'), 'campfire');
    await document.emit('mynt:ambient-state'); assert.equal(ambientSelect.value, 'campfire', 'stale stopped API type does not overwrite the choice');
    panelSelect.value = 'whitenoise'; storage.setItem('myntAmbientType', 'whitenoise'); await panelSelect.emit('change');
    assert.equal(ambientSelect.value, 'whitenoise', 'stopped panel choice reaches the float');
    await ambientButton.emit('click'); assert.equal(ambientType, 'whitenoise'); audioState(ambientRow, ambientButton, true);
    panelSelect.value = 'ocean'; await window.myntAmbientAudio.play(panelSelect.value); await panelSelect.emit('change');
    assert.equal(ambientSelect.value, 'ocean', 'playing panel choice switches and reaches the float');
    await window.myntAmbientAudio.play('rain');
    assert.equal(ambientSelect.value, 'rain'); assert.equal(panelSelect.value, 'rain', 'main API playback updates both selectors');
    ambientSelect.value = 'invalid'; await ambientSelect.emit('change');
    assert.equal(ambientType, 'rain', 'invalid sound never reaches the API');
    assert.equal(panelSelect.value, 'rain');
    const retry = musicButton.emit('click'); await time.flush(); await retry;
    assert.equal(player.api.getPlayback().playing, true); assert.equal(pd.querySelectorAll('.mynt-pomo-note').at(-1).textContent, '');
    player.api.pauseImmediate(); await time.flush();
    ambientPlaying = false; await document.emit('mynt:ambient-state'); assert.equal(ambientButton.getAttribute('aria-pressed'), 'false');
    storage.setItem('myntAmbientType', 'ocean'); await window.emit('storage', { key: 'myntAmbientType', newValue: 'ocean' });
    assert.equal(ambientSelect.value, 'ocean'); assert.equal(panelSelect.value, 'ocean', 'storage selection reaches both controls');
    panelSelect.value = 'rain'; storage.setItem('myntAmbientType', 'rain'); await panelSelect.emit('change');
    // Another tab saved a newer choice while this panel select is stale: storage wins on the next render.
    storage.setItem('myntAmbientType', 'campfire'); await document.emit('mynt:ambient-state');
    assert.equal(ambientSelect.value, 'campfire', 'stored ambient choice beats a stale panel select'); assert.equal(panelSelect.value, 'campfire');
    storage.setItem('myntAmbientType', 'rain'); await document.emit('mynt:ambient-state');
    const workingPlay = window.myntPomoMusic.play;
    window.myntPomoMusic.play = async () => ({ selectedId: 'missing', playing: true });
    await nextButton.emit('click'); assert.ok(pd.querySelectorAll('.mynt-pomo-note').at(-1).textContent, 'a missing requested track cannot be mistaken for successful playback');
    window.myntPomoMusic.play = workingPlay;
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
    assert.equal(nextButton.getAttribute('aria-label'), '下一首'); assert.ok(nextButton.querySelector('svg'), 'relabel preserves the next icon');
    assert.equal(musicButton.getAttribute('aria-label'), '播放音樂: b');
    assert.equal(ambientSelect.getAttribute('aria-label'), '環境音類型');
    assert.deepEqual(Array.from(ambientSelect.children, group => group.label), ['自然', '噪音']);
    assert.deepEqual(Array.from(ambientSelect.querySelectorAll('option'), option => option.value), window.myntAmbientAudio.types, 'floating types preserve the shared order');
    assert.deepEqual(Array.from(ambientSelect.querySelectorAll('option'), option => option.textContent), ['🌧️ 雨聲', '⛈️ 雷雨', '🌊 海浪', '🏞️ 溪流', '🍃 風聲', '🐦 森林鳥鳴', '🦗 夏夜蟲鳴', '🪵 柴火', '☕ 白噪音', '🌸 粉紅噪音', '🟤 棕色噪音']);
    assert.equal(ambientButton.getAttribute('aria-label'), '播放環境音: 🌧️ 雨聲');
    const localizedPlay = musicButton.emit('click'); await time.flush(); await localizedPlay;
    await ambientButton.emit('click'); await document.emit('mynt:language-changed');
    assert.equal(musicButton.getAttribute('aria-label'), '暫停音樂: b');
    assert.equal(ambientButton.getAttribute('aria-label'), '暫停環境音: 🌧️ 雨聲');
    audioState(musicRow, musicButton, true); audioState(ambientRow, ambientButton, true);
    await musicButton.emit('click'); await time.flush(); await ambientButton.emit('click');
    saved.set('selectedLanguage','fr'); document.documentElement.lang = 'fr'; await document.emit('mynt:language-changed');
    assert.equal(q('.pomodoroPhaseLabel').textContent,'Travail'); assert.equal(q('summary').textContent,dictionaries.en.pomoFloat_options, 'missing locale keys use English');
    assert.equal(nextButton.getAttribute('aria-label'), 'Next track'); assert.equal(ambientSelect.querySelector('option').textContent, '🌧️ Rain');
    assert.deepEqual(Array.from(ambientSelect.children, group => group.label), ['Nature', 'Noise'], 'other locales use English group labels');
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
    assert.equal(panelSelect.listeners.change.length, 1); assert.equal(window.listeners.storage.length, 2);
    await popup.close(); assert.equal(counts(),0); assert.equal(musicSubscriptions,0); assert.equal(timerSubscriptions,0);
    for (const node of [musicButton, nextButton, ambientButton, ambientSelect, panelSelect]) {
        assert.equal(Object.values(node.listeners).flat().length, 0, 'every audio listener is removed on close');
    }
    assert.equal(window.listeners.storage.length, 1, 'float storage listener is removed, original appearance listener remains');
    assert.ok(observers.some(o => o.disconnected));
    pd = await open(); await window.emit('pagehide'); assert.equal(counts(),0); assert.equal(musicSubscriptions,0); assert.equal(timerSubscriptions,0);
    assert.equal(q('.mynt-pomo-primary').disabled,true); assert.match(pd.querySelectorAll('.mynt-pomo-note').at(-1).textContent,/Original tab closed/);
    assert.equal(q('.mynt-pomo-ambient-select').disabled, true, 'disconnect disables the new selector too');
    assert.equal(panelSelect.listeners.change.length, 0);
    await popup.close();
    denyLanguage = true; pd = await open();
    assert.equal(q('.pomodoroPhaseLabel').textContent, 'Travail', 'storage read failure falls back to active page language');
    await popup.close(); denyLanguage = false;
    pd = await open();
    const resume = player.api.play('b'); await time.flush(); await resume;
    assert.equal(q('.mynt-pomo-music-row').querySelector('button').getAttribute('aria-pressed'), 'true');
    player.action('c','remove').emit('click'); await time.flush();
    player.action('b','remove').emit('click'); await time.flush();
    assert.equal(player.api.getPlayback().playing, false, 'deleting a playing track stops the existing player');
    assert.equal(q('.mynt-pomo-track-name').textContent, 'a', 'deletion selects and reflects the surviving track');
    assert.equal(q('.mynt-pomo-next').hidden, true, 'one remaining track hides next');
    await popup.close();
    // No configured local tracks: hide the music transport, preserve ambient audio.
    const emptyTime = fixture.clock(), empty = await fixture.tab(fixture.sharedStore(emptyTime), emptyTime);
    window.myntPomoMusic = empty.api; pd = await open(); assert.equal(q('.mynt-pomo-music-row').hidden,true);
    assert.equal(q('.mynt-pomo-ambient-row').hidden, false);
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
    await q('.mynt-pomo-ambient-row').querySelector('button').emit('click'); await new Promise(setImmediate);
    assert.ok(pipNote.textContent,'ambient false result exposes an error too');
    window.myntAmbientAudio.toggle = ambientToggle;
    await q('.mynt-pomo-ambient-row').querySelector('button').emit('click'); await new Promise(setImmediate);
    assert.equal(pipNote.textContent,'','successful ambient retry clears the error');
    const lateMusic = q('.mynt-pomo-music-row').querySelector('button').emit('click'); await popup.close();
    rejectPendingMusic(Error('late music rejection')); await lateMusic;
    assert.equal(pipNote.textContent,'','a rejection after close cannot mutate the detached window status');
    assert.equal(counts(),0); assert.equal(musicSubscriptions,0); assert.equal(timerSubscriptions,0);
    player.close(); empty.close();
    // Real NodeList has no .at(); the synthetic DOM returns arrays, so guard the shipped source directly.
    assert.doesNotMatch(read('scripts/pomodoro-float.js'), /querySelectorAll\([^)]*\)\.(at|find|map|filter)\(/, 'NodeList has no array methods in real browsers');
    const css = read('styles/pomodoro-float.css');
    assert.match(css, /width: max\(44px, 2\.75rem\); height: max\(44px, 2\.75rem\)/, 'audio icon targets never shrink below 44px');
    assert.match(css, /min-height: max\(44px, 2\.75rem\)/, 'native sound selector keeps its touch target');
    assert.match(css, /html\.mynt-pomo-float-root\.myntHighContrast \.mynt-pomo-equalizer i \{ animation: none; \}/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\), \(forced-colors: active\) \{ \.mynt-pomo-equalizer i \{ animation: none; \} \}/);
    console.log('FLOAT_SYNC_OK: separate extension-free title/full-name tooltip, ordered next/wrap/single-track hiding, music/ambient both directions, stopped/playing sound choice and panel/storage sync, SVG/ARIA/playing indicator, language relabel/fallback, strict durations/countdown preservation, complete audio listener cleanup');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(watchdog));

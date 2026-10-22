#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { create, normalize, durations, KEY } = require('../scripts/pomodoro-timer-core.js');
const defaults = durations();
const store = () => { const data = new Map(); return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) }; };
function lockManager() { let queue = Promise.resolve(); return { request(name, fn) { const next = queue.then(fn); queue = next.catch(() => {}); return next; } }; }
(async () => {
    let now = 1000000;
    const legacy = { phase: 'work', timeRemaining: 90, totalTime: 1500, currentRound: 2, isRunning: true, lastTick: now - 20000 };
    const migrated = normalize(JSON.stringify(legacy), defaults, now);
    assert.equal(migrated.version, 2);
    assert.equal(migrated.timeRemaining, 70);
    assert.equal(migrated.endAt, now + 70000);
    assert.equal(migrated.sessionId, normalize(legacy, defaults, now).sessionId);
    assert.equal(normalize({ ...legacy, lastTick: 'bad' }, defaults, now).isRunning, false);
    for (const raw of ['{', 'null', '[]', '{"phase":"bad"}', JSON.stringify({ ...legacy, timeRemaining: -1 }), JSON.stringify({ ...legacy, totalTime: 1e100 })]) {
        const safe = normalize(raw, defaults, now);
        assert.equal(safe.isRunning, false);
        assert.equal(safe.timeRemaining, 1500);
    }
    const storage = store(), locks = lockManager();
    let completed = 0, firstUpdates = 0;
    const opts = { storage, locks, now: () => now, onComplete: () => completed++ };
    const first = create(opts), second = create(opts);
    const unsubscribe = first.subscribe(() => firstUpdates++);
    await first.start();
    assert.equal(first.getState().task, '');
    assert.equal(first.getState().isRunning, true, 'taskless start remains supported');
    await first.reset();
    await first.setDurations({ workMinutes: 1, shortBreakMinutes: 2 });
    await first.setTask('Write the introduction');
    await Promise.all([first.tick(), second.tick(), first.setTask('測試任務：讀完第三章'), second.tick()]);
    assert.equal(JSON.parse(storage.getItem(KEY)).task, '測試任務：讀完第三章', 'task persists despite queued cross-tab ticks');
    second.sync();
    assert.equal(second.getState().task, '測試任務：讀完第三章', 'task synchronizes to another tab');
    const reloaded = create(opts);
    assert.equal(reloaded.getState().task, '測試任務：讀完第三章', 'task survives fresh core/reload');
    await reloaded.tick();
    assert.equal(reloaded.getState().task, '測試任務：讀完第三章', 'reload reconciliation preserves task');
    await first.setTask('Write the introduction');
    await first.start();
    const beforeFutureChange = first.getState();
    assert.equal(await first.setDurations({ workMinutes: 4 }), true, 'running timer accepts future workspace durations');
    for (const key of ['isRunning', 'totalTime', 'timeRemaining', 'endAt', 'sessionId', 'phase', 'currentRound']) {
        assert.equal(first.getState()[key], beforeFutureChange[key], `future duration edit preserves active ${key}`);
    }
    assert.equal(first.getState().durations.workMinutes, 4);
    assert.equal(storage.getItem('pomodoroWorkMinutes'), '4');
    second.sync();
    assert.equal(second.getState().endAt, now + 60000);
    assert.equal(second.getState().task, 'Write the introduction');
    now += 10250;
    await first.tick();
    assert.equal(first.getState().timeRemaining, 50);
    await second.pause();
    first.sync();
    now += 500000;
    assert.equal(first.getState().timeRemaining, 50, 'paused time never runs down');
    await first.extend(5);
    assert.equal(first.getState().timeRemaining, 350);
    await first.start();
    now += 351000;
    await Promise.all([first.tick(), second.tick(), first.tick(), second.tick()]);
    assert.equal(completed, 1, 'exactly one completion across tabs');
    assert.equal(first.getState().phase, 'shortBreak');
    assert.equal(second.getState().phase, 'shortBreak');
    assert.equal(first.getState().timeRemaining, 120);
    assert.equal(first.getState().isRunning, false);
    const count = firstUpdates;
    unsubscribe();
    await first.reset();
    assert.equal(firstUpdates, count);
    assert.equal(first.getState().timeRemaining, 240, 'reset adopts the future work duration');
    storage.setItem('pomodoroAutoStart', 'true');
    await first.start();
    now += 86400000;
    await Promise.all([first.tick(), second.tick()]);
    assert.equal(completed, 2, 'sleep does not fabricate many completed sessions');
    assert.equal(first.getState().endAt, now + 120000);
    assert.equal(first.getState().phase, 'shortBreak');
    const noLockStore = store();
    noLockStore.setItem(KEY, JSON.stringify({ ...legacy, lastTick: now - 100000 }));
    const noLockA = create({ storage: noLockStore, now: () => now, onComplete: () => completed++ });
    const noLockB = create({ storage: noLockStore, now: () => now, onComplete: () => completed++ });
    await Promise.all([noLockA.tick(), noLockB.tick()]);
    assert.equal(completed, 2, 'no lock means no unsafe duplicate alarms or stats');
    assert.equal(noLockA.getState().safetyStatus, 'locks-unavailable');
    const quota = create({ storage: { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } }, locks, now: () => now, onComplete: () => completed++ });
    await quota.start();
    assert.equal(quota.getState().isRunning, true);
    assert.equal(quota.getState().safetyStatus, 'storage-unavailable');
    now += 1501000;
    await quota.tick();
    assert.equal(quota.getState().phase, 'shortBreak');
    assert.equal(completed, 2, 'quota failure suppresses unsafe effects');
    const deniedLocks = create({ storage: store(), locks: { request: () => Promise.reject(new Error('SecurityError')) } });
    await deniedLocks.start();
    assert.equal(deniedLocks.getState().isRunning, true);
    assert.equal(deniedLocks.getState().safetyStatus, 'locks-unavailable');
    const denied = create({ storage: { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('SecurityError'); } }, locks });
    await denied.start(); await denied.pause(); await denied.reset();
    assert.equal(denied.getState().isRunning, false);
    const futureStorage = store();
    const future = create({ storage: futureStorage, locks: lockManager(), now: () => now });
    await future.setDurations({ workMinutes: 1 }); await future.start(); now += 12000;
    const before = future.getState();
    assert.equal(await future.setDurations({ workMinutes: 7, shortBreakMinutes: 3, longBreakMinutes: 8, roundsBeforeLong: 2 }), true);
    for (const key of ['isRunning', 'totalTime', 'timeRemaining', 'endAt', 'sessionId', 'phase', 'currentRound']) assert.equal(future.getState()[key], before[key]);
    const restoredFuture = create({ storage: futureStorage, locks: lockManager(), now: () => now });
    assert.equal(restoredFuture.getState().endAt, before.endAt);
    assert.equal(restoredFuture.getState().durations.workMinutes, 7);
    for (const bad of [null, [], undefined, { workMinutes: 9, shortBreakMinutes: 61 }, { workMinutes: 9, longBreakMinutes: 121 }, { workMinutes: 121 }, { workMinutes: 1.5 }, { roundsBeforeLong: 0 }, { workMinutes: NaN }, { workMinutes: '30' }, { workMinutes: 9, unknown: 1 }]) {
        const stateBefore = future.getState();
        const storedBefore = [KEY, 'pomodoroWorkMinutes', 'pomodoroShortBreakMinutes', 'pomodoroLongBreakMinutes', 'pomodoroRoundsBeforeLong'].map(key => futureStorage.getItem(key));
        assert.equal(await future.setDurations(bad), false);
        assert.deepEqual(future.getState(), stateBefore, 'invalid duration update must not partially modify live state');
        assert.deepEqual([KEY, 'pomodoroWorkMinutes', 'pomodoroShortBreakMinutes', 'pomodoroLongBreakMinutes', 'pomodoroRoundsBeforeLong'].map(key => futureStorage.getItem(key)), storedBefore, 'invalid duration update must not partially persist settings');
    }
    now = before.endAt + 1; await future.tick();
    assert.equal(future.getState().phase, 'shortBreak');
    assert.equal(future.getState().totalTime, 180, 'next phase adopts the changed break duration');
    await future.start(); now += 10000; await future.pause();
    const pausedBefore = future.getState();
    assert.equal(await future.setDurations({ shortBreakMinutes: 4 }), true);
    assert.equal(future.getState().timeRemaining, pausedBefore.timeRemaining);
    assert.equal(future.getState().totalTime, pausedBefore.totalTime, 'partial paused phase preserves its original duration');
    await future.reset(); assert.equal(future.getState().totalTime, 420);

    // Execute the actual alarm function against a minimal Web Audio stub.
    const alarmSource = fs.readFileSync(require.resolve('../scripts/pomodoro.js'), 'utf8').match(/function playPomodoroSound\(\) \{[\s\S]*?(?=\s*\/\/ --- Notification ---)/)[0];
    const alarmGains = raw => {
        const gains = [];
        class AudioContext {
            constructor() { this.currentTime = 0; this.destination = {}; }
            createOscillator() { return { frequency: {}, connect() {}, start() {}, stop() {} }; }
            createGain() { return { gain: { setValueAtTime: value => gains.push(value), exponentialRampToValueAtTime() {} }, connect() {} }; }
            close() { return Promise.resolve(); }
        }
        vm.runInNewContext(alarmSource + '\nplayPomodoroSound();', { localStorage: { getItem: () => raw }, window: { AudioContext }, setTimeout() {} });
        return gains;
    };
    assert.deepEqual(alarmGains(null), [.15, .15, .15], 'absent alarm preference matches the 50% slider default');
    assert.deepEqual(alarmGains('invalid'), [.15, .15, .15]);
    assert.deepEqual(alarmGains('0'), [], 'explicit mute remains silent');
    assert.deepEqual(alarmGains('1'), [.3, .3, .3], 'explicit maximum volume remains supported');
    console.log('Pomodoro timer checks passed: migration, malformed storage, quota, wall clock, pause, sync, duplicate completion, future workspace durations, atomic validation, next-phase settings, sleep, alarm defaults.');
})().catch(error => { console.error(error); process.exitCode = 1; });

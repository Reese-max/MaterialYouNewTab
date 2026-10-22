/* Shared wall-clock Pomodoro state. No background/alarm guarantee while asleep or closed. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MyntPomodoroTimer = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const KEY = 'pomodoroState';
    const DEFAULTS = { workMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, roundsBeforeLong: 4 };
    const LIMITS = { workMinutes: 120, shortBreakMinutes: 60, longBreakMinutes: 60, roundsBeforeLong: 12 };
    const SETTING_KEYS = { workMinutes: 'pomodoroWorkMinutes', shortBreakMinutes: 'pomodoroShortBreakMinutes', longBreakMinutes: 'pomodoroLongBreakMinutes', roundsBeforeLong: 'pomodoroRoundsBeforeLong' };
    const valid = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
    const id = () => globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2);
    function durations(input = {}) {
        return Object.fromEntries(Object.keys(DEFAULTS).map(k => [k, valid(input[k], 1, LIMITS[k]) ? Math.floor(input[k]) : DEFAULTS[k]]));
    }
    function fresh(settings, sessionId = id()) {
        return { version: 2, phase: 'work', timeRemaining: settings.workMinutes * 60, totalTime: settings.workMinutes * 60, currentRound: 1, isRunning: false, endAt: null, task: '', sessionId, settings };
    }
    function normalize(raw, settings, now) {
        let s;
        try { s = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return fresh(settings); }
        if (!s || typeof s !== 'object' || !['work', 'shortBreak', 'longBreak'].includes(s.phase) || !valid(s.totalTime, 1, 86400) || !valid(s.timeRemaining, 0, s.totalTime) || !Number.isInteger(s.currentRound) || !valid(s.currentRound, 1, 12) || typeof s.isRunning !== 'boolean' || (s.version !== undefined && s.version !== 2)) return fresh(settings);
        const result = fresh(s.version === 2 ? durations(s.settings || settings) : settings);
        Object.assign(result, { phase: s.phase, totalTime: Math.ceil(s.totalTime), timeRemaining: Math.ceil(s.timeRemaining), currentRound: s.currentRound, task: typeof s.task === 'string' ? s.task.slice(0, 200) : '' });
        // A deterministic legacy ID lets simultaneous tabs migrate the same session safely.
        result.sessionId = typeof s.sessionId === 'string' && /^[\w:-]{1,160}$/.test(s.sessionId) ? s.sessionId : 'legacy:' + [s.phase, s.lastTick || 0, s.totalTime, s.currentRound].join(':');
        const end = s.version === 2 ? s.endAt : (valid(s.lastTick, 1, now + 86400000) ? s.lastTick + s.timeRemaining * 1000 : null);
        if (s.isRunning && valid(end, 1, now + 86400000)) { result.isRunning = true; result.endAt = end; result.timeRemaining = Math.min(result.totalTime, Math.max(0, Math.ceil((end - now) / 1000))); }
        return result;
    }
    function create(options = {}) {
        const storage = options.storage;
        const now = options.now || Date.now;
        let locks = options.locks;
        const listeners = new Set();
        let healthy = !!storage;
        const read = key => { try { return storage?.getItem(key) ?? null; } catch { healthy = false; return null; } };
        const write = (key, value) => { try { if (!storage) return false; storage.setItem(key, value); return true; } catch { healthy = false; return false; } };
        const initialSettings = durations(Object.fromEntries(Object.entries(SETTING_KEYS).map(([k, key]) => [k, Number(read(key))])));
        let state = normalize(read(KEY), initialSettings, now());
        let queue = Promise.resolve();
        let lastSnapshot = '';
        const snapshot = () => {
            const result = { ...state, settings: { ...state.settings }, durations: { ...state.settings }, coordinationAvailable: !!locks?.request && healthy, safetyStatus: !healthy ? 'storage-unavailable' : !locks?.request ? 'locks-unavailable' : 'ready' };
            if (result.isRunning) result.timeRemaining = Math.min(result.totalTime, Math.max(0, Math.ceil((result.endAt - now()) / 1000)));
            return result;
        };
        function emit() {
            const value = snapshot();
            const serial = JSON.stringify(value);
            if (serial === lastSnapshot) return;
            lastSnapshot = serial;
            for (const fn of listeners) { try { fn(value); } catch { /* One subscriber cannot stop the timer. */ } }
        }
        function sync() {
            if (healthy) {
                const raw = read(KEY);
                if (raw) state = normalize(raw, state.settings, now());
            }
            emit();
        }
        function persist() { const saved = write(KEY, JSON.stringify(state)); emit(); return saved; }
        function run(action) {
            const perform = () => { sync(); return action(); };
            queue = queue.catch(() => {}).then(async () => {
                if (!locks?.request) return perform();
                let entered = false;
                try {
                    return await locks.request('mynt:pomodoro-state', () => { entered = true; return perform(); });
                } catch (error) {
                    if (entered) throw error; // Never replay an action with an uncertain/completed outcome.
                    locks = null; // Unsupported/denied locking: retain a usable, silent timer.
                    return perform();
                }
            });
            return queue.then(result => result === false || result === true ? result : snapshot());
        }
        function complete() {
            const current = snapshot();
            if (!current.isRunning || current.timeRemaining > 0) return;
            const completed = { ...current };
            const work = current.phase === 'work';
            const phase = work ? (current.currentRound >= current.settings.roundsBeforeLong ? 'longBreak' : 'shortBreak') : 'work';
            const setting = phase === 'work' ? 'workMinutes' : phase === 'shortBreak' ? 'shortBreakMinutes' : 'longBreakMinutes';
            const seconds = current.settings[setting] * 60;
            // Never manufacture many completed rounds after a sleeping/closed browser resumes.
            state = { ...current, phase, totalTime: seconds, timeRemaining: seconds, currentRound: work ? current.currentRound : current.phase === 'longBreak' ? 1 : Math.min(12, current.currentRound + 1), sessionId: locks?.request ? id() : 'next:' + String(current.sessionId.split('').reduce((hash, ch) => Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261)), isRunning: read('pomodoroAutoStart') === 'true', endAt: null };
            delete state.coordinationAvailable;
            delete state.safetyStatus;
            delete state.durations;
            if (state.isRunning) state.endAt = now() + seconds * 1000;
            // Commit the transition BEFORE effects. With no atomic coordination, fail silent rather than duplicate.
            if (persist() && healthy && locks?.request) options.onComplete?.(completed, snapshot());
        }
        const api = {
            getState: snapshot,
            subscribe(fn) { if (typeof fn !== 'function') return () => {}; listeners.add(fn); fn(snapshot()); return () => listeners.delete(fn); },
            start: () => run(() => { if (state.isRunning) { complete(); return; } if (state.timeRemaining <= 0) state.timeRemaining = state.totalTime; state.isRunning = true; state.endAt = now() + state.timeRemaining * 1000; persist(); }),
            pause: () => run(() => { if (snapshot().timeRemaining === 0 && state.isRunning) complete(); state.timeRemaining = snapshot().timeRemaining; state.isRunning = false; state.endAt = null; persist(); }),
            reset: () => run(() => { const task = state.task; state = fresh(state.settings); state.task = task; persist(); }),
            extend: (minutes = 5) => run(() => { if (!valid(minutes, 1, 120)) return; const seconds = Math.min(Math.floor(minutes * 60), 86400 - state.totalTime); state.timeRemaining = snapshot().timeRemaining + seconds; state.totalTime += seconds; if (state.isRunning) state.endAt = now() + state.timeRemaining * 1000; persist(); }),
            setTask: label => run(() => { state.task = String(label ?? '').slice(0, 200); persist(); }),
            setDurations: input => run(() => {
                if (state.isRunning) return false;
                const settings = { ...state.settings };
                for (const k of Object.keys(DEFAULTS)) if (valid(input?.[k], 1, LIMITS[k])) settings[k] = Math.floor(input[k]);
                if (!state.isRunning && state.timeRemaining === state.totalTime) state.timeRemaining = state.totalTime = settings[state.phase === 'work' ? 'workMinutes' : state.phase === 'shortBreak' ? 'shortBreakMinutes' : 'longBreakMinutes'] * 60;
                state.settings = settings;
                Object.entries(SETTING_KEYS).forEach(([k, key]) => write(key, String(settings[k])));
                persist();
                return true;
            }),
            tick: () => run(complete),
            sync,
        };
        return api;
    }
    return { create, normalize, durations, KEY };
});

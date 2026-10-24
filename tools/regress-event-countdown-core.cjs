'use strict';
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../scripts/event-countdown-core.js');
const item = (date = '2026-10-23', annual = false, id = 'e-test') => ({ id, name: '特考', date, category: 'exam', emoji: '📚', color: 'lavender', annual });
const state = () => ({ ...core.defaultState(), events: [item()] });
const bad = change => { const value = state(); change(value); assert.throws(() => core.validate(value), TypeError); };
assert.equal(core.KEY, 'myntEventCountdownsV1');
assert.equal(core.defaultState().enabled, true);
const source = state();
const validated = core.validate(source);
assert.deepEqual(validated, source);
assert.notEqual(validated.events[0], source.events[0]);
validated.events[0].name = 'changed';
assert.equal(source.events[0].name, '特考');
for (const date of ['2025-02-29', '2100-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '1899-12-31', '2200-01-01', '2026-1-01', '2026-10-23T00:00:00Z', '', null]) bad(s => s.events[0].date = date);
for (const date of ['1900-01-01', '2000-02-29', '2024-02-29', '2199-12-31']) assert.equal(core.validate({ ...state(), events: [item(date)] }).events[0].date, date);
for (const name of ['', '   ', '<img>', 'a\nb', 'a'.repeat(81), '\ud800', '\u202eabc']) bad(s => s.events[0].name = name);
bad(s => s.events[0].emoji = '📚'.repeat(9));
assert.equal(core.validate({ ...state(), events: [{ ...item(), emoji: '📚'.repeat(8), name: '  Hello  ' }] }).events[0].name, 'Hello');
for (const revision of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '0']) bad(s => s.revision = revision);
bad(s => s.version = 2);
bad(s => s.enabled = 1);
bad(s => s.events[0].annual = 'true');
bad(s => s.events[0].color = 'red');
bad(s => s.events[0].category = 'birthday');
for (const id of ['x-test', 'e', 'e bad', 'e<script>', 'e' + 'a'.repeat(80)]) bad(s => s.events[0].id = id);
bad(s => s.events.push(item()));
bad(s => s.events = Array.from({ length: 31 }, (_, i) => item('2026-10-23', false, 'e-' + i)));
assert.equal(core.validate({ ...state(), events: Array.from({ length: 30 }, (_, i) => item('2026-10-23', false, 'e-' + i)) }).events.length, 30);
bad(s => s.extra = true);
bad(s => Object.setPrototypeOf(s, { polluted: true }));
bad(s => Object.defineProperty(s, '__proto__', { value: {} }));
bad(s => s.events[0].extra = true);
bad(s => s.events[0] = Object.create(s.events[0]));
bad(s => delete s.events[0]);
bad(s => s.events.extra = true);
let called = false;
bad(s => Object.defineProperty(s.events[0], 'name', { get() { called = true; return 'name'; } }));
bad(s => Object.defineProperty(s.events, '0', { get() { called = true; return item(); } }));
assert.equal(called, false, 'getters must not execute');
bad(s => s.deleted = { event: item(), index: 0 });
bad(s => s.deleted = { event: item('2026-10-23', false, 'e-deleted'), index: 2 });
const undo = state(); undo.deleted = { event: item('2026-10-23', false, 'e-deleted'), index: 1 };
assert.deepEqual(core.validate(undo), undo);
assert.deepEqual(core.migrateLegacy('bad'), core.defaultState());
assert.equal(core.migrateLegacy('2026-12-31').events[0].category, 'exam');
assert.deepEqual(core.validate(core.migrateLegacy('2026-12-31')), core.migrateLegacy('2026-12-31'));
const noon = (y, m, d) => new Date(y, m - 1, d, 12);
for (const [target, now, days] of [
    ['2026-10-23', [2026, 10, 23], 0], ['2026-10-22', [2026, 10, 23], -1],
    ['2027-01-01', [2026, 12, 31], 1], ['2026-02-01', [2026, 1, 31], 1],
    ['2026-03-09', [2026, 3, 7], 2], ['2026-11-02', [2026, 10, 31], 2],
    ['2024-03-01', [2024, 2, 28], 2], ['2025-03-01', [2025, 2, 28], 1]
]) {
    assert.deepEqual(core.dayInfo(item(target), noon(...now)), { days, date: target, kind: days > 0 ? 'future' : days < 0 ? 'past' : 'today' });
}
assert.equal(core.dayInfo(item('2024-02-29', true), noon(2025, 2, 28)).days, 0);
assert.equal(core.dayInfo(item('2024-02-29', true), noon(2025, 3, 1)).date, '2026-02-28');
assert.equal(core.dayInfo(item('2024-02-29', true), noon(2024, 2, 28)).date, '2024-02-29');
assert.equal(core.dayInfo(item('2028-02-29', true), noon(2026, 2, 1)).date, '2028-02-29');
assert.equal(core.dayInfo(item('2024-12-31', true), noon(2026, 12, 31)).days, 0);
assert.equal(core.dayInfo(item('2024-12-31', true), noon(2027, 1, 1)).date, '2027-12-31');
assert.throws(() => core.dayInfo(item(), new Date(NaN)), TypeError);
const unordered = [item('2026-10-20', false, 'e-old'), item('2026-10-24', false, 'e-b'), item('2026-10-23', false, 'e-now'), item('2026-10-22', false, 'e-recent'), item('2026-10-24', false, 'e-a')];
const before = JSON.stringify(unordered);
assert.deepEqual(core.sortEvents(unordered, noon(2026, 10, 23)).map(e => e.id), ['e-now', 'e-a', 'e-b', 'e-recent', 'e-old']);
assert.equal(JSON.stringify(unordered), before);
const sandbox = {};
vm.runInNewContext(fs.readFileSync(require.resolve('../scripts/event-countdown-core.js'), 'utf8'), sandbox);
assert.equal(sandbox.MYNTCountdownCore.KEY, core.KEY);
if (!process.env.COUNTDOWN_TZ_CHILD) {
    for (const TZ of ['UTC', 'America/New_York', 'Asia/Taipei']) {
        const result = spawnSync(process.execPath, [__filename], { env: { ...process.env, TZ, COUNTDOWN_TZ_CHILD: '1' }, encoding: 'utf8' });
        assert.equal(result.status, 0, TZ + ': ' + result.stdout + result.stderr);
        process.stdout.write(result.stdout);
    }
} else console.log('Countdown core passed: ' + process.env.TZ);

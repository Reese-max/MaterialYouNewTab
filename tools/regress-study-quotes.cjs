'use strict';
// Pure checks for the encouragement-line core: no browser, storage or network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const core = require(path.join(root, 'scripts/study-quotes-core.js'));
const BUILTINS = vm.runInNewContext(fs.readFileSync(path.join(root, 'scripts/study-quotes.js'), 'utf8') + '\n;MYNT_STUDY_QUOTES', {});
// Seeded mulberry32 bytes: reproducible ids without collisions in these fixtures.
const fixed = (seed = 1) => size => Array.from({ length: size }, () => {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) % 256;
});
const throwsCode = (fn, code) => assert.throws(fn, error => error.code === code, code);

// Built-in identifiers are stable and unique, so hidden choices survive list updates.
const builtins = core.builtins(BUILTINS);
assert.equal(builtins.length, BUILTINS.length);
assert.equal(new Set(builtins.map(q => q.id)).size, builtins.length, 'Built-in ids must be unique');
assert.equal(core.builtinId(BUILTINS[0]), core.builtinId({ ...BUILTINS[0] }));
assert.notEqual(core.builtinId(BUILTINS[0]), core.builtinId({ ...BUILTINS[0], zh: BUILTINS[0].zh + '!' }));

// Line parsing: "text — author《work》 #tag".
assert.deepEqual(core.parseLine('人恆過，然後能改。— 孟子《孟子·告子下》'), { text: '人恆過，然後能改。', author: '孟子', work: '孟子·告子下', tags: [] });
assert.deepEqual(core.parseLine('「天下難事，必作於易」——老子《道德經》 #考試 #堅持'), { text: '天下難事，必作於易', author: '老子', work: '道德經', tags: ['考試', '堅持'] });
assert.deepEqual(core.parseLine('Stay hungry. - Steve Jobs, Stanford'), { text: 'Stay hungry.', author: 'Steve Jobs', work: 'Stanford', tags: [] });
assert.deepEqual(core.parseLine('e-mail 不切開'), { text: 'e-mail 不切開', author: '', work: '', tags: [] });
assert.deepEqual(core.parseLine('C# 很好玩'), { text: 'C# 很好玩', author: '', work: '', tags: [] });

// Format detection and parsing.
const csv = core.parseImport('句子,作者,出處,標籤\n"有逗號, 的句子",某人,某書,"考試,放鬆"\n"多行\n句子",,,\n', { name: 'quotes.csv' });
assert.equal(csv.format, 'csv');
assert.deepEqual(csv.items.map(item => [item.line, item.text, item.tags]), [[2, '有逗號, 的句子', ['考試', '放鬆']], [3, '多行 句子', []]]);
const tsv = core.parseImport('第一句\t作者A\t出處A\n\n第二句\t作者B');
assert.equal(tsv.format, 'tsv'); assert.deepEqual(tsv.items.map(item => item.line), [1, 3]);
const lines = core.parseImport('﻿第一句 — 作者\r\n\r\n' + 'x'.repeat(core.LIMITS.text + 1) + '\n<img src=x onerror=alert(1)> — 惡意');
assert.equal(lines.format, 'lines');
assert.deepEqual(lines.errors.map(error => [error.line, error.code]), [[3, 'tooLong']]);
assert.equal(lines.items[1].text, '<img src=x onerror=alert(1)>', 'Markup is kept as plain text, never parsed');
assert.deepEqual(core.parseImport('‮反轉').errors.map(error => error.code), ['unsafe']);
throwsCode(() => core.parseImport('{broken', { name: 'a.json' }), 'invalidJson');
throwsCode(() => core.parseImport('{"format":"other"}'), 'unsupported');
throwsCode(() => core.parseImport('x'.repeat(core.LIMITS.importBytes + 1)), 'tooLarge');
throwsCode(() => core.parseImport(Array.from({ length: core.LIMITS.importLines + 1 }, (_, i) => 'q' + i).join('\n')), 'tooManyLines');
assert.equal(core.parseImport('["一", {"zh": "二", "author": "甲"}, 3]').items.length, 2);
assert.deepEqual(core.parseImport('["一", 3]').errors, [{ line: 2, code: 'invalid' }]);

// Duplicates ignore width, case, spaces and punctuation.
assert.equal(core.dedupeKey('第 一 句！'), core.dedupeKey('第一句'));
assert.equal(core.dedupeKey('ＡＢＣ'), core.dedupeKey('abc'));

// Import planning, limits, tags and round trips.
let state = core.defaultState();
let plan = core.planImport(state, [...tsv.items, { text: '第 一 句！', author: '', work: '', tags: [] }], { tags: ['考試'], random: fixed(), now: 1 });
assert.deepEqual([plan.added, plan.duplicates, plan.overLimit], [2, 1, 0]);
assert.deepEqual(plan.state.quotes.map(q => q.tags), [['考試'], ['考試']]);
assert.equal(plan.state.revision, 1);
state = plan.state;
const replaced = core.planImport(state, csv.items, { mode: 'replace', random: fixed(), now: 2 });
assert.deepEqual([replaced.added, replaced.replaced], [2, 2]);
const json = core.parseImport(core.exportJSON(state));
assert.equal(json.format, 'json');
assert.deepEqual(json.items.map(item => [item.text, item.author, item.work, item.tags]), state.quotes.map(q => [q.text, q.author, q.work, q.tags]));
assert.deepEqual(core.parseImport(core.exportText(state)).items.map(item => [item.text, item.author, item.work, item.tags]), state.quotes.map(q => [q.text, q.author, q.work, q.tags]), 'TXT export round-trips attributed quotes');
const many = Array.from({ length: core.LIMITS.quotes + 5 }, (_, i) => ({ text: 'quote ' + i, author: '', work: '', tags: [] }));
const capped = core.planImport(core.defaultState(), many, { random: fixed(), now: 3 });
assert.deepEqual([capped.added, capped.overLimit], [core.LIMITS.quotes, 5]);
assert.ok(core.serialize(capped.state).length <= core.LIMITS.bytes);
throwsCode(() => core.addQuote(core.defaultState(), { text: 'x' }, { random: () => new Array(10).fill(0) }) && core.addQuote(core.addQuote(core.defaultState(), { text: 'x' }, { random: () => new Array(10).fill(0) }).state, { text: 'y' }, { random: () => new Array(10).fill(0) }), 'idUnavailable');

// Edits.
let added = core.addQuote(state, { text: '新句子', author: '我', work: '', tags: '考試, 放鬆、#早起' }, { random: fixed(), now: 4 });
assert.deepEqual(added.quote.tags, ['考試', '放鬆', '早起']);
state = added.state;
throwsCode(() => core.addQuote(state, { text: '新 句 子!' }), 'duplicate');
throwsCode(() => core.addQuote(state, { text: '   ' }), 'empty');
throwsCode(() => core.addQuote(state, { text: 'x', tags: ['@builtin'] }), 'tagInvalid');
throwsCode(() => core.addQuote(state, { text: 'x', tags: ['a', 'b', 'c', 'd', 'e', 'f'] }), 'tooManyTags');
throwsCode(() => core.addQuote(state, { text: 'x', author: 'a'.repeat(core.LIMITS.author + 1) }), 'authorTooLong');
const id = added.quote.id;
state = core.updateQuote(state, id, { text: '改過的句子', author: '我', work: '日記', tags: ['考試'] }, { now: 5 });
assert.equal(state.quotes.find(q => q.id === id).work, '日記');
throwsCode(() => core.updateQuote(state, id, { text: state.quotes[0].text }), 'duplicate');
const removal = core.removeQuotes(state, [state.quotes[0].id, id]);
assert.equal(removal.state.quotes.length, state.quotes.length - 2);
const restored = core.restoreQuotes(removal.state, removal.removed);
assert.deepEqual(restored.quotes.map(q => q.id), state.quotes.map(q => q.id), 'Undo restores original positions');
state = core.setEnabled(state, [id], false);
assert.equal(state.quotes.find(q => q.id === id).enabled, false);
state = core.addTags(state, [state.quotes[0].id], ['晨讀']);
assert.ok(state.quotes[0].tags.includes('晨讀'));
state = core.removeTags(state, [state.quotes[0].id], ['考試']);
assert.ok(!state.quotes[0].tags.includes('考試'));
const copy = core.copyBuiltin(state, builtins[0], { random: fixed(), now: 6 });
assert.equal(copy.quote.text, builtins[0].zh);
throwsCode(() => core.copyBuiltin(copy.state, builtins[0]), 'duplicate');

// Homepage pool: categories, hidden built-ins, locale and fallbacks.
state = core.setBuiltinHidden(state, [builtins[0].id, builtins[1].id], true);
let pool = core.pool(state, BUILTINS);
assert.equal(pool.quotes.filter(q => q.builtin).length, BUILTINS.length - 2);
assert.ok(!pool.quotes.some(q => q.id === id), 'Disabled quotes are not shown');
state = core.setShow(state, ['晨讀']);
pool = core.pool(state, BUILTINS);
assert.deepEqual(pool.quotes.map(q => q.text), [state.quotes[0].text]);
state = core.setShow(state, [core.UNTAGGED]);
assert.equal(core.pool(state, BUILTINS).fallback, 'selection', 'An empty selection falls back instead of showing nothing');
state = core.setShow(state, [core.BUILTIN]);
assert.ok(core.pool(state, BUILTINS).quotes.every(q => q.builtin));
const english = core.pool(core.defaultState(), BUILTINS, { isZh: false });
assert.ok(english.quotes.length > 0 && english.quotes.every(q => q.text && /[A-Za-z]/.test(q.text)), 'Other languages use English built-ins');
const mine = core.addQuote(core.setShow(core.defaultState(), [core.UNTAGGED]), { text: '我的中文句子' }, { random: fixed() }).state;
assert.deepEqual(core.pool(mine, BUILTINS, { isZh: false }).quotes.map(q => q.text), ['我的中文句子'], 'User quotes show in every language');
const allHidden = core.setBuiltinHidden(core.defaultState(), builtins.map(q => q.id), true);
assert.equal(core.pool(allHidden, BUILTINS).fallback, 'empty');
assert.equal(core.pool(allHidden, BUILTINS).quotes.length, BUILTINS.length);
assert.deepEqual(core.categories(state, 10).slice(0, 2), [{ key: core.BUILTIN, count: 10 }, { key: core.UNTAGGED, count: state.quotes.filter(q => !q.tags.length).length }]);

// Validation: strict writes and restores, lenient reads that never rewrite.
assert.deepEqual(core.validate(JSON.parse(core.serialize(state))), state);
for (const bad of [
    null, [], { version: 2 }, { ...state, extra: 1 }, { ...state, revision: -1 },
    { ...state, quotes: [{ ...state.quotes[0], id: 'bad' }] },
    { ...state, quotes: [{ ...state.quotes[0], text: '' }] },
    { ...state, quotes: [{ ...state.quotes[0], enabled: 'yes' }] },
    { ...state, quotes: [{ ...state.quotes[0], tags: ['ok', '@no'] }] },
    { ...state, quotes: [state.quotes[0], state.quotes[0]] },
    { ...state, hiddenBuiltins: ['x'] }, { ...state, show: ['@other'] }, { ...state, show: 'all' }
]) {
    assert.throws(() => core.validate(bad, true), JSON.stringify(bad)?.slice(0, 60));
    assert.doesNotThrow(() => core.validate(bad, false));
}
assert.equal(core.validate({ ...state, quotes: [state.quotes[0], { ...state.quotes[1], id: 'bad' }] }, false).quotes.length, 1, 'Lenient reads skip only bad entries');
assert.deepEqual(core.read(null), { state: core.defaultState(), intact: true });
assert.equal(core.read('{broken').intact, false);
assert.equal(core.read(JSON.stringify({ ...state, version: 2 })).intact, false);
assert.equal(core.read(core.serialize(state)).intact, true);

// Backup restore validates the record before any write.
const adapter = require(path.join(root, 'scripts/local-mcp-data.js'));
assert.doesNotThrow(() => adapter.validateBackupStorage({ [core.KEY]: core.serialize(state) }));
for (const bad of ['{broken', JSON.stringify({ version: 2 }), JSON.stringify({ ...state, quotes: [{ ...state.quotes[0], text: '‮' }] }), 'x'.repeat(core.LIMITS.bytes + 1)]) {
    assert.throws(() => adapter.validateBackupStorage({ [core.KEY]: bad }), 'Restores reject invalid study quotes');
}
console.log('STUDY_QUOTES_CORE_OK: stable built-in ids, line/CSV/TSV/JSON parsing, dedupe, import plans and limits, edits with undo, categories, locale pool and fallbacks, strict/lenient validation, backup restore validation');

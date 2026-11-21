/*
 * MYNT study quotes core: pure rules for the encouragement line.
 * Validates the user record (myntStudyQuotesV1), parses pasted and imported text,
 * removes duplicates, builds the homepage pool and exports. No DOM, storage,
 * network or timers; the homepage line, the manager and backup restore share it.
 */
(function (root, factory) {
    'use strict';
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.MyntStudyQuotesCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';
    const KEY = 'myntStudyQuotesV1';
    const EXPORT_FORMAT = 'mynt-study-quotes';
    const LIMITS = Object.freeze({
        quotes: 2000, text: 200, author: 60, work: 80, tags: 5, tag: 20,
        distinctTags: 100, hiddenBuiltins: 1000, bytes: 1024 * 1024, importBytes: 2 * 1024 * 1024, importLines: 5000
    });
    // Reserved category keys; user tags may not start with "@".
    const BUILTIN = '@builtin', UNTAGGED = '@untagged';
    const unsafe = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/u;
    const plain = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value) &&
        [Object.prototype, null].includes(Object.getPrototypeOf(value));
    const length = text => Array.from(text).length;

    function fail(code, detail) {
        const error = new Error(detail || code);
        error.code = code;
        throw error;
    }

    // Collapse whitespace (including pasted line breaks) into single spaces.
    function cleanText(value) {
        return typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : '';
    }

    function normalizeTag(value) {
        const tag = cleanText(value).replace(/^#+/u, '').trim();
        if (!tag || tag.startsWith('@') || /[,，、;；|#]/u.test(tag) || unsafe.test(tag) || length(tag) > LIMITS.tag) return null;
        return tag;
    }

    // Tags are unique case-insensitively; the first spelling is kept.
    function normalizeTags(values, strict = false) {
        const result = [], seen = new Set();
        for (const value of Array.isArray(values) ? values : []) {
            const tag = normalizeTag(value);
            if (!tag) { if (strict) fail('tagInvalid'); continue; }
            const key = tag.toLocaleLowerCase();
            if (seen.has(key)) continue;
            seen.add(key); result.push(tag);
        }
        if (result.length > LIMITS.tags) { if (strict) fail('tooManyTags'); result.length = LIMITS.tags; }
        return result;
    }

    function splitTags(value) {
        return String(value || '').split(/[,，、;；|#\n]+/u).map(part => part.trim()).filter(Boolean);
    }

    // Validate one quote's editable fields. Throws an error whose code names the problem.
    function normalizeQuote(input) {
        if (!plain(input)) fail('invalid');
        const text = cleanText(input.text), author = cleanText(input.author || ''), work = cleanText(input.work || '');
        if (!text) fail('empty');
        if (unsafe.test(text) || unsafe.test(author) || unsafe.test(work)) fail('unsafe');
        if (length(text) > LIMITS.text) fail('tooLong');
        if (length(author) > LIMITS.author) fail('authorTooLong');
        if (length(work) > LIMITS.work) fail('workTooLong');
        const tags = normalizeTags(typeof input.tags === 'string' ? splitTags(input.tags) : input.tags, true);
        return { text, author, work, tags };
    }

    // Duplicate key: width, case, spaces and punctuation do not make a quote new.
    function dedupeKey(text) {
        const base = String(text || '').normalize('NFKC').toLocaleLowerCase();
        return base.replace(/[\s\p{P}\p{S}]/gu, '') || base.trim();
    }

    // Stable built-in identifiers from content (FNV-1a), so hidden choices survive list updates.
    function builtinId(quote) {
        let hash = 0x811c9dc5;
        for (const char of `${quote.zh}\u0000${quote.author || ''}\u0000${quote.work || ''}`) {
            hash ^= char.codePointAt(0);
            hash = Math.imul(hash, 0x01000193) >>> 0;
        }
        return 'b' + hash.toString(36);
    }

    function builtins(list) {
        return (Array.isArray(list) ? list : []).filter(quote => quote && quote.zh).map(quote => ({ ...quote, id: builtinId(quote) }));
    }

    function defaultState() {
        return { version: 1, revision: 0, quotes: [], hiddenBuiltins: [], show: null };
    }

    // Strict validation for writes, imports and restores; lenient reads skip bad entries.
    function validate(value, strict = true) {
        const reject = code => { if (strict) fail(code); };
        if (!plain(value) || value.version !== 1 ||
            Object.keys(value).some(key => !['version', 'revision', 'quotes', 'hiddenBuiltins', 'show'].includes(key))) {
            reject('invalidRecord');
            return defaultState();
        }
        const state = defaultState();
        state.revision = Number.isSafeInteger(value.revision) && value.revision >= 0 ? value.revision : (reject('invalidRecord'), 0);
        const quotes = Array.isArray(value.quotes) ? value.quotes : (reject('invalidRecord'), []);
        if (quotes.length > LIMITS.quotes) reject('tooMany');
        const ids = new Set(), tagNames = new Set();
        for (const item of quotes.slice(0, LIMITS.quotes)) {
            try {
                if (!plain(item) || Object.keys(item).some(key => !['id', 'text', 'author', 'work', 'tags', 'enabled', 'created', 'updated'].includes(key))) fail('invalid');
                if (typeof item.id !== 'string' || !/^q[a-z0-9]{6,24}$/u.test(item.id) || ids.has(item.id)) fail('invalid');
                if (typeof item.text !== 'string' || (item.author !== undefined && typeof item.author !== 'string') ||
                    (item.work !== undefined && typeof item.work !== 'string') || (item.tags !== undefined && !Array.isArray(item.tags)) ||
                    typeof item.enabled !== 'boolean') fail('invalid');
                for (const key of ['created', 'updated']) if (item[key] !== undefined && !(Number.isFinite(item[key]) && item[key] >= 0)) fail('invalid');
                const clean = normalizeQuote(item);
                if ((item.tags || []).length !== clean.tags.length) fail('tagInvalid');
                ids.add(item.id);
                clean.tags.forEach(tag => tagNames.add(tag.toLocaleLowerCase()));
                state.quotes.push({ id: item.id, ...clean, enabled: item.enabled,
                    ...(item.created !== undefined ? { created: item.created } : {}), ...(item.updated !== undefined ? { updated: item.updated } : {}) });
            } catch (error) { reject(error.code || 'invalid'); }
        }
        if (tagNames.size > LIMITS.distinctTags) reject('tooManyTagsOverall');
        const hidden = Array.isArray(value.hiddenBuiltins) ? value.hiddenBuiltins : (reject('invalidRecord'), []);
        if (hidden.length > LIMITS.hiddenBuiltins) reject('invalidRecord');
        for (const id of hidden.slice(0, LIMITS.hiddenBuiltins)) {
            if (typeof id !== 'string' || !/^b[a-z0-9]{1,12}$/u.test(id) || state.hiddenBuiltins.includes(id)) { reject('invalidRecord'); continue; }
            state.hiddenBuiltins.push(id);
        }
        if (value.show !== null && value.show !== undefined) {
            if (!Array.isArray(value.show) || value.show.length > LIMITS.distinctTags + 2) reject('invalidRecord');
            else {
                state.show = [];
                for (const key of value.show) {
                    const valid = key === BUILTIN || key === UNTAGGED || (typeof key === 'string' && normalizeTag(key) === key);
                    if (!valid || state.show.includes(key)) { reject('invalidRecord'); continue; }
                    state.show.push(key);
                }
            }
        }
        return state;
    }

    // Read a stored string: never throws; "intact" is false when anything had to be skipped.
    function read(raw) {
        if (raw === null || raw === undefined) return { state: defaultState(), intact: true };
        if (typeof raw !== 'string' || raw.length > LIMITS.bytes) return { state: defaultState(), intact: false };
        let parsed;
        try { parsed = JSON.parse(raw); } catch { return { state: defaultState(), intact: false }; }
        try { return { state: validate(parsed, true), intact: true }; }
        catch { return { state: validate(parsed, false), intact: false }; }
    }

    function serialize(state) {
        const text = JSON.stringify(validate(state, true));
        if (text.length > LIMITS.bytes) fail('tooLarge');
        return text;
    }

    // A unique id not in `taken`; gives up instead of looping on a broken random source.
    function uniqueId(taken, random) {
        for (let attempt = 0; attempt < 64; attempt++) {
            const id = randomId(random);
            if (!taken.has(id)) return id;
        }
        fail('idUnavailable');
    }

    function randomId(random) {
        const bytes = typeof random === 'function' ? random(10)
            : root?.crypto?.getRandomValues ? root.crypto.getRandomValues(new Uint8Array(10))
            : Array.from({ length: 10 }, () => Math.floor(Math.random() * 256));
        return 'q' + Array.from(bytes, byte => (byte % 36).toString(36)).join('');
    }

    function nextState(state, quotes, extra = {}) {
        const next = { ...state, ...extra, quotes, revision: state.revision + 1 };
        validate(next, true);
        return next;
    }

    // ----- Edits used by the manager. Each returns a new validated state (revision + 1). -----
    function addQuote(state, input, options = {}) {
        if (state.quotes.length >= LIMITS.quotes) fail('tooMany');
        const clean = normalizeQuote(input), key = dedupeKey(clean.text);
        if (state.quotes.some(quote => dedupeKey(quote.text) === key)) fail('duplicate');
        const id = uniqueId(new Set(state.quotes.map(quote => quote.id)), options.random);
        const now = options.now ?? Date.now();
        const quote = { id, ...clean, enabled: input.enabled !== false, created: now, updated: now };
        return { state: nextState(state, [...state.quotes, quote]), quote };
    }

    function updateQuote(state, id, input, options = {}) {
        const index = state.quotes.findIndex(quote => quote.id === id);
        if (index < 0) fail('missing');
        const clean = normalizeQuote(input), key = dedupeKey(clean.text);
        if (state.quotes.some(quote => quote.id !== id && dedupeKey(quote.text) === key)) fail('duplicate');
        const quotes = [...state.quotes];
        quotes[index] = { ...quotes[index], ...clean, enabled: input.enabled === undefined ? quotes[index].enabled : input.enabled !== false, updated: options.now ?? Date.now() };
        return nextState(state, quotes);
    }

    // Returns the removed quotes with their positions so the manager can undo.
    function removeQuotes(state, ids) {
        const wanted = new Set(ids), removed = [];
        state.quotes.forEach((quote, index) => { if (wanted.has(quote.id)) removed.push({ quote, index }); });
        return { state: nextState(state, state.quotes.filter(quote => !wanted.has(quote.id))), removed };
    }

    function restoreQuotes(state, removed) {
        const quotes = [...state.quotes], ids = new Set(quotes.map(quote => quote.id)), keys = new Set(quotes.map(quote => dedupeKey(quote.text)));
        for (const { quote, index } of [...removed].sort((a, b) => a.index - b.index)) {
            if (ids.has(quote.id) || keys.has(dedupeKey(quote.text))) continue;
            quotes.splice(Math.min(index, quotes.length), 0, quote);
        }
        if (quotes.length > LIMITS.quotes) fail('tooMany');
        return nextState(state, quotes);
    }

    function mapQuotes(state, ids, change) {
        const wanted = new Set(ids);
        return nextState(state, state.quotes.map(quote => wanted.has(quote.id) ? change(quote) : quote));
    }

    const setEnabled = (state, ids, enabled) => mapQuotes(state, ids, quote => ({ ...quote, enabled: Boolean(enabled) }));
    const addTags = (state, ids, tags) => mapQuotes(state, ids, quote => ({ ...quote, tags: normalizeTags([...quote.tags, ...normalizeTags(tags, true)], true) }));
    const removeTags = (state, ids, tags) => {
        const drop = new Set(normalizeTags(tags).map(tag => tag.toLocaleLowerCase()));
        return mapQuotes(state, ids, quote => ({ ...quote, tags: quote.tags.filter(tag => !drop.has(tag.toLocaleLowerCase())) }));
    };

    function setBuiltinHidden(state, ids, hidden) {
        const set = new Set(state.hiddenBuiltins);
        for (const id of ids) { if (hidden) set.add(id); else set.delete(id); }
        return nextState(state, state.quotes, { hiddenBuiltins: [...set] });
    }

    // null shows every category; otherwise only the listed ones (BUILTIN, UNTAGGED or tag names).
    function setShow(state, show) {
        return nextState(state, state.quotes, { show: show === null ? null : [...show] });
    }

    function copyBuiltin(state, builtin, options = {}) {
        return addQuote(state, { text: builtin.zh, author: builtin.author || '', work: builtin.work || '', tags: options.tags || [] }, options);
    }

    // ----- Import parsing -----
    const SEPARATOR = /\s*(?:——|──|－－|—|–\s|\s--\s|\s-\s)\s*/gu;
    const OPEN_QUOTES = '「『“"‘\'', CLOSE_QUOTES = '」』”"’\'';

    function stripQuotes(text) {
        let value = text.trim();
        for (let pass = 0; pass < 2 && value.length > 1; pass++) {
            const open = OPEN_QUOTES.indexOf(value[0]), close = CLOSE_QUOTES.indexOf(value[value.length - 1]);
            if (open >= 0 && open === close) value = value.slice(1, -1).trim(); else break;
        }
        return value;
    }

    function parseAttribution(value) {
        const text = value.trim();
        const book = text.match(/^(.*?)\s*[《〈<]([^》〉>]+)[》〉>]\s*$/u);
        if (book) return { author: book[1].trim(), work: book[2].trim() };
        const comma = text.match(/^([^,，]+)[,，]\s*(.+)$/u);
        if (comma) return { author: comma[1].trim(), work: comma[2].trim() };
        return { author: text, work: '' };
    }

    // "句子 — 作者《出處》 #標籤 #標籤": attribution after the last dash, tags at the end.
    function parseLine(line) {
        let rest = cleanText(line), tags = [];
        const tagTail = rest.match(/(?:^|\s)((?:#[^\s#]+\s*)+)$/u);
        if (tagTail) {
            tags = tagTail[1].split('#').map(tag => tag.trim()).filter(Boolean);
            rest = rest.slice(0, tagTail.index).trim();
        }
        let last = null;
        for (const match of rest.matchAll(SEPARATOR)) if (match.index > 0) last = match;
        let text = rest, author = '', work = '';
        if (last && last.index + last[0].length < rest.length) {
            text = rest.slice(0, last.index);
            ({ author, work } = parseAttribution(rest.slice(last.index + last[0].length)));
        }
        return { text: stripQuotes(text), author, work, tags };
    }

    // RFC 4180 style rows: quoted cells may contain delimiters, doubled quotes and line breaks.
    function parseRows(text, delimiter) {
        const rows = [];
        let row = [], cell = '', quoted = false, line = 1, rowLine = 1;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (quoted) {
                if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
                else if (char === '"') quoted = false;
                else { if (char === '\n') line++; cell += char; }
            } else if (char === '"' && cell.trim() === '') { quoted = true; cell = ''; }
            else if (char === delimiter) { row.push(cell); cell = ''; }
            else if (char === '\n') { row.push(cell); rows.push({ line: rowLine, cells: row }); row = []; cell = ''; line++; rowLine = line; }
            else if (char !== '\r') cell += char;
        }
        if (cell !== '' || row.length) { row.push(cell); rows.push({ line: rowLine, cells: row }); }
        return rows;
    }

    const HEADERS = {
        text: ['text', 'quote', 'zh', '句子', '內容', '鼓勵語', '語錄', '名言'],
        author: ['author', '作者', '人物'],
        work: ['work', 'source', '出處', '來源', '作品'],
        tags: ['tags', 'tag', 'category', 'categories', '標籤', '分類']
    };

    function headerMap(cells) {
        const map = {};
        cells.forEach((cell, index) => {
            const name = cleanText(cell).replace(/^﻿/u, '').toLocaleLowerCase();
            for (const [field, names] of Object.entries(HEADERS)) if (names.includes(name) && map[field] === undefined) map[field] = index;
        });
        return map.text === undefined ? null : map;
    }

    function fromDelimited(text, delimiter) {
        const rows = parseRows(text, delimiter).filter(row => row.cells.some(cell => cell.trim()));
        if (!rows.length) return [];
        const header = headerMap(rows[0].cells);
        const map = header || { text: 0, author: 1, work: 2, tags: 3 };
        return (header ? rows.slice(1) : rows).map(row => ({
            line: row.line,
            text: stripQuotes(row.cells[map.text] || ''),
            author: row.cells[map.author] || '', work: row.cells[map.work] || '',
            tags: splitTags(row.cells[map.tags] || '')
        }));
    }

    function fromJSON(value) {
        const list = Array.isArray(value) ? value
            : plain(value) && value.format === EXPORT_FORMAT && value.version === 1 && Array.isArray(value.quotes) ? value.quotes
            : plain(value) && Array.isArray(value.quotes) ? value.quotes
            : fail('unsupported');
        return list.map((item, index) => typeof item === 'string'
            ? { line: index + 1, text: item, author: '', work: '', tags: [] }
            : plain(item) ? { line: index + 1, text: typeof item.text === 'string' ? item.text : item.zh, author: item.author || '', work: item.work || '', tags: Array.isArray(item.tags) ? item.tags : splitTags(item.tags || ''), enabled: item.enabled }
            : { line: index + 1, invalid: true });
    }

    function detectFormat(text, name = '') {
        const lower = String(name).toLocaleLowerCase();
        if (lower.endsWith('.json')) return 'json';
        if (lower.endsWith('.csv')) return 'csv';
        if (lower.endsWith('.tsv')) return 'tsv';
        const trimmed = text.trimStart();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
        const first = trimmed.split('\n', 1)[0] || '';
        if (first.includes('\t')) return 'tsv';
        if (headerMap(parseRows(first, ',')[0]?.cells || [])) return 'csv';
        return 'lines';
    }

    // Parse pasted or file text into validated candidates plus per-line errors. Never writes.
    function parseImport(raw, options = {}) {
        if (typeof raw !== 'string') fail('unsupported');
        if (raw.length > LIMITS.importBytes) fail('tooLarge');
        const text = raw.replace(/^﻿/u, '').replace(/\r\n?/gu, '\n');
        const format = options.format || detectFormat(text, options.name);
        let candidates;
        if (format === 'json') {
            let value;
            try { value = JSON.parse(text); } catch { fail('invalidJson'); }
            candidates = fromJSON(value);
        } else if (format === 'csv' || format === 'tsv') {
            candidates = fromDelimited(text, format === 'csv' ? ',' : '\t');
        } else {
            candidates = text.split('\n').map((line, index) => ({ line: index + 1, raw: line })).filter(item => item.raw.trim())
                .map(item => ({ line: item.line, ...parseLine(item.raw) }));
        }
        if (candidates.length > LIMITS.importLines) fail('tooManyLines');
        const items = [], errors = [];
        for (const candidate of candidates) {
            if (candidate.invalid) { errors.push({ line: candidate.line, code: 'invalid' }); continue; }
            try {
                items.push({ line: candidate.line, ...normalizeQuote({ text: candidate.text, author: candidate.author, work: candidate.work, tags: normalizeTags(candidate.tags) }),
                    ...(candidate.enabled === false ? { enabled: false } : {}) });
            } catch (error) { errors.push({ line: candidate.line, code: error.code || 'invalid', text: cleanText(candidate.text || '').slice(0, 40) }); }
        }
        return { format, items, errors };
    }

    // Plan an import against the current record: append or replace, extra tags, duplicates skipped.
    function planImport(state, items, options = {}) {
        const replace = options.mode === 'replace';
        const quotes = replace ? [] : [...state.quotes];
        const keys = new Set(quotes.map(quote => dedupeKey(quote.text)));
        const ids = new Set(quotes.map(quote => quote.id));
        const extraTags = normalizeTags(options.tags || [], true);
        const now = options.now ?? Date.now();
        let added = 0, duplicates = 0, overLimit = 0;
        for (const item of items) {
            const key = dedupeKey(item.text);
            if (keys.has(key)) { duplicates++; continue; }
            if (quotes.length >= LIMITS.quotes) { overLimit++; continue; }
            const id = uniqueId(ids, options.random);
            ids.add(id); keys.add(key);
            quotes.push({ id, text: item.text, author: item.author || '', work: item.work || '', tags: normalizeTags([...(item.tags || []), ...extraTags]),
                enabled: item.enabled !== false, created: now, updated: now });
            added++;
        }
        const next = nextState(state, quotes);
        return { state: next, added, duplicates, overLimit, replaced: replace ? state.quotes.length : 0 };
    }

    // ----- Export -----
    function exportJSON(state) {
        return JSON.stringify({
            format: EXPORT_FORMAT, version: 1,
            quotes: state.quotes.map(quote => ({ text: quote.text, author: quote.author, work: quote.work, tags: quote.tags, enabled: quote.enabled }))
        }, null, 2);
    }

    function formatSource(quote) {
        return (quote.author || '') + (quote.work ? '《' + quote.work + '》' : '');
    }

    // One line per quote in the same "text — author《work》 #tag" shape that pasting understands.
    function exportText(state) {
        return state.quotes.map(quote => {
            const source = formatSource(quote);
            return quote.text + (source ? ' — ' + source : '') + quote.tags.map(tag => ' #' + tag).join('');
        }).join('\n') + (state.quotes.length ? '\n' : '');
    }

    // ----- Homepage pool -----
    function categories(state, builtinCount = 0) {
        const counts = new Map();
        let untagged = 0;
        for (const quote of state.quotes) {
            if (!quote.tags.length) untagged++;
            for (const tag of quote.tags) counts.set(tag, (counts.get(tag) || 0) + 1);
        }
        return [
            { key: BUILTIN, count: builtinCount },
            { key: UNTAGGED, count: untagged },
            ...[...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([key, count]) => ({ key, count }))
        ];
    }

    function displayQuote(quote, isZh) {
        if (quote.id.startsWith('b')) {
            return isZh ? { id: quote.id, text: quote.zh, author: quote.author || '', work: quote.work || '', orig: quote.orig || '', builtin: true }
                : { id: quote.id, text: quote.en, author: quote.authorEn || quote.author || '', work: quote.workEn || '', orig: '', builtin: true };
        }
        return { id: quote.id, text: quote.text, author: quote.author, work: quote.work, orig: '', builtin: false };
    }

    // Quotes eligible for the homepage. Falls back rather than showing nothing.
    function pool(state, builtinList, options = {}) {
        const isZh = options.isZh !== false;
        const hidden = new Set(state.hiddenBuiltins);
        const allBuiltins = builtins(builtinList).filter(quote => isZh || quote.en);
        const visibleBuiltins = allBuiltins.filter(quote => !hidden.has(quote.id));
        const enabled = state.quotes.filter(quote => quote.enabled);
        const selected = state.show ? new Set(state.show) : null;
        const matches = quote => !selected || (quote.tags.length ? quote.tags.some(tag => selected.has(tag)) : selected.has(UNTAGGED));
        let list = [...(!selected || selected.has(BUILTIN) ? visibleBuiltins : []), ...enabled.filter(matches)];
        let fallback = null;
        if (!list.length) { list = [...visibleBuiltins, ...enabled]; fallback = 'selection'; }
        if (!list.length) { list = allBuiltins; fallback = 'empty'; }
        return { quotes: list.map(quote => displayQuote(quote, isZh)), fallback };
    }

    return Object.freeze({
        KEY, EXPORT_FORMAT, LIMITS, BUILTIN, UNTAGGED,
        cleanText, normalizeTag, normalizeTags, splitTags, normalizeQuote, dedupeKey, builtinId, builtins,
        defaultState, validate, read, serialize,
        addQuote, updateQuote, removeQuotes, restoreQuotes, setEnabled, addTags, removeTags, setBuiltinHidden, setShow, copyBuiltin,
        parseLine, parseRows, detectFormat, parseImport, planImport, exportJSON, exportText, formatSource,
        categories, pool
    });
}));

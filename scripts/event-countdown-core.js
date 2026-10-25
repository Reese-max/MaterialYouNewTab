/* Calendar-only countdown model. This module never reads or writes storage. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MYNTCountdownCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    const KEY = 'myntEventCountdownsV1';
    const MAX_EVENTS = 30;
    const COLORS = Object.freeze(['lavender', 'blue', 'green', 'peach', 'rose']);
    const CATEGORIES = Object.freeze(['exam', 'anniversary', 'custom']);
    const DAY = 86400000;
    const fail = message => { throw new TypeError('Invalid countdown: ' + message); };
    function record(value, keys) {
        if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('object');
        const actual = Reflect.ownKeys(value);
        if (actual.length !== keys.length || actual.some(key => typeof key !== 'string' || !keys.includes(key))) fail('fields');
        for (const key of keys) {
            const descriptor = Object.getOwnPropertyDescriptor(value, key);
            if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) fail('field descriptor');
        }
    }
    function text(value, maximum, required) {
        if (typeof value !== 'string' || Array.from(value).length > maximum || /[\u0000-\u001f\u007f-\u009f<>\u202a-\u202e\u2066-\u2069]/u.test(value) || /[\uD800-\uDFFF]/u.test(value)) fail('text');
        const result = value.trim();
        if (required && !result) fail('empty name');
        return result;
    }
    function leap(year) { return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0); }
    function parseDate(value) {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('date format');
        const [year, month, day] = value.split('-').map(Number);
        const lengths = [31, leap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        if (year < 1900 || year > 2199 || month < 1 || month > 12 || day < 1 || day > lengths[month - 1]) fail('date range');
        return { year, month, day };
    }
    function event(input) {
        record(input, ['id', 'name', 'date', 'category', 'emoji', 'color', 'annual']);
        if (typeof input.id !== 'string' || !/^e[A-Za-z0-9_-]{1,79}$/.test(input.id)) fail('id');
        parseDate(input.date);
        if (!CATEGORIES.includes(input.category) || !COLORS.includes(input.color) || typeof input.annual !== 'boolean') fail('event options');
        return { id: input.id, name: text(input.name, 80, true), date: input.date, category: input.category, emoji: text(input.emoji, 8, false), color: input.color, annual: input.annual };
    }
    function defaultState() { return { version: 1, revision: 0, enabled: true, events: [], deleted: null }; }
    function validate(input) {
        record(input, ['version', 'revision', 'enabled', 'events', 'deleted']);
        if (input.version !== 1 || !Number.isSafeInteger(input.revision) || input.revision < 0 || typeof input.enabled !== 'boolean') fail('state options');
        if (!Array.isArray(input.events) || Object.getPrototypeOf(input.events) !== Array.prototype || input.events.length > MAX_EVENTS) fail('events');
        if (Reflect.ownKeys(input.events).length !== input.events.length + 1) fail('array fields');
        const events = [];
        for (let index = 0; index < input.events.length; index++) {
            const descriptor = Object.getOwnPropertyDescriptor(input.events, String(index));
            if (!descriptor || !Object.hasOwn(descriptor, 'value')) fail('array entry');
            events.push(event(descriptor.value));
        }
        if (new Set(events.map(item => item.id)).size !== events.length) fail('duplicate id');
        let deleted = null;
        if (input.deleted !== null) {
            record(input.deleted, ['event', 'index']);
            if (!Number.isInteger(input.deleted.index) || input.deleted.index < 0 || input.deleted.index > events.length) fail('deleted index');
            deleted = { event: event(input.deleted.event), index: input.deleted.index };
            if (events.some(item => item.id === deleted.event.id)) fail('deleted id');
        }
        return { version: 1, revision: input.revision, enabled: input.enabled, events, deleted };
    }
    function migrateLegacy(date) {
        const state = defaultState();
        try { parseDate(date); } catch { return state; }
        state.enabled = true;
        state.events = [{ id: 'e-legacy', name: '考試', date, category: 'exam', emoji: '📅', color: 'lavender', annual: false }];
        return state;
    }
    // Read local date components, then map the calendar date to UTC. Never subtract
    // local midnights: DST days can have 23 or 25 hours.
    function ordinal(year, month, day) { return Date.UTC(year, month - 1, day) / DAY; }
    function iso(year, month, day) { return [String(year).padStart(4, '0'), String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-'); }
    function dayInfo(input, nowDate = new Date()) {
        const item = event(input);
        if (!(nowDate instanceof Date) || !Number.isFinite(nowDate.getTime())) fail('now date');
        const today = ordinal(nowDate.getFullYear(), nowDate.getMonth() + 1, nowDate.getDate());
        const original = parseDate(item.date);
        let { year, month, day } = original;
        if (item.annual) {
            year = Math.max(original.year, nowDate.getFullYear());
            const observedDay = y => month === 2 && original.day === 29 && !leap(y) ? 28 : original.day;
            day = observedDay(year);
            if (ordinal(year, month, day) < today) { year++; day = observedDay(year); }
        }
        const days = ordinal(year, month, day) - today;
        return { days, date: iso(year, month, day), kind: days > 0 ? 'future' : days < 0 ? 'past' : 'today' };
    }
    function sortEvents(events, nowDate = new Date()) {
        if (!Array.isArray(events)) fail('events');
        return events.map(item => ({ item, days: dayInfo(item, nowDate).days })).sort((a, b) => {
            const aPast = a.days < 0, bPast = b.days < 0;
            if (aPast !== bPast) return aPast ? 1 : -1;
            const difference = aPast ? b.days - a.days : a.days - b.days;
            return difference || (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0);
        }).map(entry => entry.item);
    }
    return Object.freeze({ KEY, MAX_EVENTS, COLORS, CATEGORIES, defaultState, validate, migrateLegacy, parseDate, dayInfo, sortEvents });
});

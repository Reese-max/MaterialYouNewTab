/* MYNT — local-only exam dates. GPL-3.0. */
(function (root) {
    'use strict';
    const DAY = 86400000;
    const OFFSET = 8 * 3600000;
    const KEY = 'myntExamDashboard';
    const DEFAULTS = Object.freeze({
        version: 1, layout: true, enabled: true, registration: true, phase: true,
        compact: false, useWallpaper: false, title: '116 年三等警察特考',
        examStart: '2027-06-12', examEnd: '2027-06-13',
        registrationStart: '2027-03-09', registrationEnd: '2027-03-18'
    });
    function day(value) {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
        const [y, m, d] = value.split('-').map(Number);
        if (y < 2000 || y > 2100) return NaN;
        const date = new Date(Date.UTC(y, m - 1, d));
        return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
            ? date.getTime() / DAY : NaN;
    }
    function validate(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1) return 'invalidSettings';
        if (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 80) return 'invalidTitle';
        for (const key of ['layout', 'enabled', 'registration', 'phase', 'compact', 'useWallpaper']) {
            if (typeof value[key] !== 'boolean') return 'invalidSettings';
        }
        for (const key of ['examStart', 'examEnd', 'registrationStart', 'registrationEnd']) {
            if (!Number.isFinite(day(value[key]))) return 'invalidDate';
        }
        if (day(value.examEnd) < day(value.examStart) || day(value.registrationEnd) < day(value.registrationStart)
            || day(value.registrationEnd) >= day(value.examStart)) return 'invalidOrder';
        return '';
    }
    function parse(raw) {
        if (!raw) return { settings: { ...DEFAULTS }, error: '' };
        try {
            const input = JSON.parse(raw);
            const error = validate(input);
            if (error) return { settings: { ...DEFAULTS }, error };
            // Only keep known fields; never copy object prototypes or arbitrary storage keys.
            const settings = Object.fromEntries(Object.keys(DEFAULTS).map(key => [key, input[key]]));
            settings.title = settings.title.trim();
            return { settings, error: '' };
        } catch { return { settings: { ...DEFAULTS }, error: 'invalidSettings' }; }
    }
    function state(settings, now = Date.now()) {
        if (validate(settings)) throw new TypeError('Invalid exam settings');
        if (!Number.isFinite(now)) throw new TypeError('Invalid current time');
        const today = Math.floor((now + OFFSET) / DAY);
        const start = day(settings.examStart), end = day(settings.examEnd);
        const regStart = day(settings.registrationStart), regEnd = day(settings.registrationEnd);
        const status = today > end ? 'finished' : today >= start ? 'exam' : 'preparing';
        const registration = today < regStart ? 'upcoming' : today <= regEnd ? 'open' : 'closed';
        let phase = 'foundation';
        if (settings.examStart !== DEFAULTS.examStart) phase = 'custom';
        else if (today >= day('2027-05-03')) phase = 'final';
        else if (today >= day('2027-04-01')) phase = 'writing';
        else if (today >= day('2027-01-01')) phase = 'allSubjects';
        return {
            today, status, remaining: Math.max(0, start - today),
            examDay: status === 'exam' ? today - start + 1 : 0,
            registration, registrationDays: Math.max(0, regStart - today), phase,
            nextMidnight: (today + 1) * DAY - OFFSET
        };
    }
    const api = Object.freeze({ KEY, DEFAULTS, DAY, day, validate, parse, state });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.MyntExamCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

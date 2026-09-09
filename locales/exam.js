/* MYNT exam UI locale bridge. Canonical copy lives in locales/en.js and locales/zh_TW.js. GPL-3.0. */
(function (root) {
    'use strict';

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Object.freeze({ bridge: true });
        return;
    }

    const catalog = typeof translations !== 'undefined' ? translations : null;
    if (!catalog?.en?.examDashboard) return;

    const english = catalog.en.examDashboard;
    const dictionaries = {};
    for (const [code, strings] of Object.entries(catalog)) {
        dictionaries[code] = Object.freeze({ ...english, ...(strings.examDashboard ?? {}) });
    }
    root.MyntExamCopy = Object.freeze(dictionaries);
})(typeof globalThis !== 'undefined' ? globalThis : this);

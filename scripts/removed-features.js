/* Reversible homepage declutter switch. No feature data or storage is changed. */
(function (root) {
    'use strict';
    const ids = Object.freeze(['todo', 'exam', 'profilesEntry', 'adaptiveEntry', 'weather']);
    root.MYNT_REMOVED_COMPONENT_IDS = ids;
    if (ids.length) root.document?.documentElement.classList.add('mynt-removed-features');
    if (ids.includes('weather')) root.document?.documentElement.classList.add('mynt-removed-weather');
})(typeof window !== 'undefined' ? window : globalThis);

/* Reversible homepage declutter switch. No feature data or storage is changed. */
(function (root) {
    'use strict';
    const ids = Object.freeze(['focus', 'todo', 'scratchpad', 'exam', 'profilesEntry', 'adaptiveEntry']);
    root.MYNT_REMOVED_COMPONENT_IDS = ids;
    if (ids.length) root.document?.documentElement.classList.add('mynt-removed-features');
})(typeof window !== 'undefined' ? window : globalThis);

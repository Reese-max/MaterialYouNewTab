/* Homepage visibility registry. Pure storage reads and write plans only.
 * Existing preferences remain canonical: no parallel component-state record.
 * Planning never writes storage, starts media, fetches, reloads or grants access.
 */
(function (root, factory) {
    'use strict';
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.MYNTComponentVisibilityCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
    'use strict';
    const cache = (key, on = 'flex', off = 'none') => ({ key, on, off });
    const entry = (id, labelZh, labelEn, key, kind, defaultVisible, checkboxId, selectors, extra = {}) => ({
        id, labelZh, labelEn, key, kind, defaultVisible, checkboxId,
        selectors, panelSelectors: [], caches: [], ...extra
    });
    const definitions = [
        entry('clock', '時鐘與問候', 'Clock and greeting', 'hideClockVisible', 'inverse', true, 'hideClock', ['#analogClock', '#digitalClock', '#date']),
        entry('weather', '天氣', 'Weather', 'hideWeatherVisible', 'inverse', true, 'hideWeatherCheckbox', ['#hideWeather']),
        entry('focus', '今日焦點', 'Today\u2019s focus', 'userTextVisible', 'boolean', true, 'userTextCheckbox', ['#userText', '#dailyFocusActions'], { panelSelectors: ['#dailyFocusPanel'] }),
        entry('search', '搜尋列', 'Search bar', 'myntSearchVisible', 'boolean', true, null, ['#searchbar', '#search-with-container'], { panelSelectors: ['#resultBox'], newPreference: true }),
        entry('shortcuts', '網站捷徑', 'Site shortcuts', 'shortcutsCheckboxState', 'checked', false, 'shortcutsCheckbox', ['#shortcuts-section'], {
            display: 'flex', caches: [cache('shortcutsDisplayStatus'), cache('shortcutEditField', 'active', 'inactive'), cache('adaptiveIconField', 'active', 'inactive')]
        }),
        entry('aiTools', 'AI 工具', 'AI tools', 'aiToolsCheckboxState', 'checked', false, 'aiToolsCheckbox', ['#aiToolsCont'], {
            display: 'flex', caches: [cache('aiToolsDisplayStatus')], panelSelectors: ['#toolsCont', '#aiToolsOverflowMenu']
        }),
        entry('googleApps', 'Google 應用程式', 'Google apps', 'googleAppsCheckboxState', 'checked', false, 'googleAppsCheckbox', ['#googleAppsCont'], {
            display: 'flex', caches: [cache('googleAppsDisplayStatus')], panelSelectors: ['#iconContainer']
        }),
        entry('bookmarks', '書籤', 'Bookmarks', 'bookmarksCheckboxState', 'checked', false, 'bookmarksCheckbox', ['#bookmarkButton'], {
            display: 'flex', caches: [cache('bookmarksDisplayStatus')], panelSelectors: ['#bookmarkSidebar']
        }),
        entry('todo', '待辦清單', 'To-do list', 'todoListCheckboxState', 'checked', false, 'todoListCheckbox', ['#todoListCont'], {
            display: 'flex', caches: [cache('todoListDisplayStatus')], panelSelectors: ['#todoContainer']
        }),
        entry('pomodoro', '番茄鐘', 'Pomodoro', 'pomodoroCheckboxState', 'checked', false, 'pomodoroCheckbox', ['#pomodoroCont'], {
            display: 'flex', caches: [cache('pomodoroDisplayStatus')], panelSelectors: ['#pomodoroPanel']
        }),
        entry('bongo', '鍵盤貓', 'Bongo cat', 'bongoCatCheckboxState', 'checked', false, 'bongoCatCheckbox', ['#bongoCatWidget'], {
            display: 'block', caches: [cache('bongoCatDisplayStatus', 'block')]
        }),
        entry('scratchpad', '隨手筆記', 'Scratchpad', 'scratchpadCheckboxState', 'checked', true, 'scratchpadCheckbox', ['#scratchpadCont'], {
            display: 'inline-flex', panelSelectors: ['#scratchpadContainer']
        }),
        entry('studyQuote', '讀書鼓勵', 'Study encouragement', 'myntStudyQuoteEnabled', 'string01', true, 'studyQuoteCheckbox', ['#studyQuote'], {
            panelSelectors: ['#studyQuoteToast']
        }),
        entry('motivationalQuotes', '每日語錄', 'Daily quotes', 'motivationalQuotesVisible', 'boolean', false, 'motivationalQuotesCheckbox', ['#motivationalQuotesCont'], { display: 'flex' }),
        entry('exam', '今日考古題', 'Daily exam question', 'myntExamDailyVisible', 'boolean', true, 'examDailyCheckbox', ['#examDaily'], { panelSelectors: ['#examDailyPanel'] }),
        entry('countdowns', '重要日期倒數', 'Event countdowns', 'myntEventCountdownsV1', 'event-enabled', true, 'eventCountdownEnabled', ['#eventCountdownCard'], {
            legacyKeys: ['myntExamDate']
        }),
        entry('galleryEntry', '桌布圖庫入口', 'Wallpaper gallery entry', 'myntGalleryEntryVisible', 'boolean', true, null, ['#wallpaperQuickActions'], { newPreference: true }),
        entry('profilesEntry', '排版設定檔入口', 'Layout profiles entry', 'myntProfilesEntryVisible', 'boolean', true, null, ['#myntProfilesPanel'], { newPreference: true }),
        entry('adaptiveEntry', '自動外觀入口', 'Adaptive appearance entry', 'myntAdaptiveEntryVisible', 'boolean', true, null, ['#myntAdaptivePanel'], { newPreference: true })
    ];
    for (const item of definitions) {
        item.keys = [item.key, ...item.caches.map(value => value.key), ...(item.legacyKeys || [])];
        for (const field of ['selectors', 'panelSelectors', 'keys', 'legacyKeys']) if (item[field]) Object.freeze(item[field]);
        item.caches.forEach(Object.freeze);
        Object.freeze(item.caches);
        Object.freeze(item);
    }
    Object.freeze(definitions);
    const storageKeys = Object.freeze([...new Set(definitions.flatMap(item => item.keys))]);
    const byId = new Map(definitions.map(item => [item.id, item]));
    const MIGRATION_KEY = 'myntComponentsMigrationV1';
    const LEGACY_DEFAULT_IDS = Object.freeze(['clock', 'weather']);

    function fail(code, message) {
        const error = new Error(message);
        error.code = code;
        throw error;
    }
    function snapshot(storage) {
        if (!storage || typeof storage.getItem !== 'function') fail('UNAVAILABLE', 'Visibility storage is unavailable.');
        return storageKeys.map(key => {
            let value;
            try { value = storage.getItem(key); }
            catch (_) { fail('STORAGE_FAILURE', 'Visibility preferences could not be read; existing data was preserved.'); }
            if (value !== null && typeof value !== 'string') fail('STORAGE_FAILURE', 'Storage returned a non-string preference.');
            return { key, value };
        });
    }
    function countdownCore() {
        const core = root?.MYNTCountdownCore || (typeof module === 'object' && module.exports ? require('./event-countdown-core.js') : null);
        if (!core?.validate || !core?.defaultState || !core?.migrateLegacy || !core?.parseDate) fail('UNAVAILABLE', 'Countdown validation is unavailable.');
        return core;
    }
    function eventState(values) {
        const core = countdownCore(), raw = values.get('myntEventCountdownsV1');
        try {
            if (raw !== null) {
                if (raw.length > 250000) throw Error('Oversized countdown');
                const state = JSON.parse(raw);
                core.validate(state);
                // Keep valid original event text and recovery content unchanged.
                return state;
            }
            const legacy = values.get('myntExamDate');
            if (legacy !== null && legacy !== '') {
                core.parseDate(legacy);
                return core.validate(core.migrateLegacy(legacy));
            }
            return core.validate(core.defaultState());
        } catch (_) { fail('INVALID_STORAGE', 'Invalid countdown data was preserved.'); }
    }
    function decode(item, values) {
        for (const saved of item.caches) {
            const value = values.get(saved.key);
            if (value !== null && value !== saved.on && value !== saved.off) fail('INVALID_STORAGE', 'Invalid visibility cache was preserved.');
        }
        if (item.kind === 'event-enabled') return eventState(values).enabled;
        const raw = values.get(item.key);
        if (raw === null) return item.defaultVisible;
        if (item.kind === 'checked') {
            if (!['checked', 'unchecked'].includes(raw)) fail('INVALID_STORAGE', 'Invalid visibility preference was preserved.');
            return raw === 'checked';
        }
        if (item.kind === 'string01') {
            if (!['0', '1'].includes(raw)) fail('INVALID_STORAGE', 'Invalid visibility preference was preserved.');
            return raw === '1';
        }
        if (!['true', 'false'].includes(raw)) fail('INVALID_STORAGE', 'Invalid visibility preference was preserved.');
        return item.kind === 'inverse' ? raw === 'false' : raw === 'true';
    }
    function read(storage) {
        const values = new Map(snapshot(storage).map(value => [value.key, value.value]));
        return definitions.map(item => {
            try { return { ...item, visible: decode(item, values), valid: true }; }
            catch (error) { return { ...item, visible: null, valid: false, error: { code: error.code || 'INVALID_STORAGE', message: error.message } }; }
        });
    }
    function plan(storage, id, visible) {
        const item = byId.get(id);
        if (!item || typeof visible !== 'boolean') fail('INVALID_ARGUMENT', 'A known component and a boolean visibility are required.');
        const expected = snapshot(storage), values = new Map(expected.map(value => [value.key, value.value]));
        const previousVisible = decode(item, values), proposed = [];
        if (item.kind === 'event-enabled') {
            if (visible !== previousVisible) {
                const current = eventState(values);
                if (!Number.isSafeInteger(current.revision + 1)) fail('INVALID_STORAGE', 'Countdown revision is exhausted; existing data was preserved.');
                const next = { ...current, enabled: visible, revision: current.revision + 1 };
                countdownCore().validate(next);
                proposed.push({ key: item.key, value: JSON.stringify(next) });
            }
        } else {
            const value = item.kind === 'checked' ? (visible ? 'checked' : 'unchecked')
                : item.kind === 'string01' ? (visible ? '1' : '0')
                : String(item.kind === 'inverse' ? !visible : visible);
            proposed.push({ key: item.key, value });
        }
        for (const saved of item.caches) proposed.push({ key: saved.key, value: visible ? saved.on : saved.off });
        const writes = proposed.filter(value => value.value !== values.get(value.key));
        return { id, visible, previousVisible, expected, writes, unchanged: writes.length === 0 };
    }
    // Compatibility metadata is never consulted to decide component visibility.
    // Only absent canonical preferences may be initialized; both explicit booleans win.
    function validateMigration(raw) {
        if (raw === null) return null;
        try {
            if (typeof raw !== 'string' || raw.length > 1024) throw Error('Invalid marker');
            const marker = JSON.parse(raw);
            const plain = value => value && typeof value === 'object' && !Array.isArray(value) &&
                [Object.prototype, null].includes(Object.getPrototypeOf(value));
            if (!plain(marker) || marker.version !== 1 || Object.keys(marker).length !== 2 ||
                !Object.hasOwn(marker, 'previous') || !plain(marker.previous)) throw Error('Invalid marker');
            const allowedKeys = LEGACY_DEFAULT_IDS.map(id => byId.get(id).key);
            if (Object.entries(marker.previous).some(([key, value]) => !allowedKeys.includes(key) || value !== null)) throw Error('Invalid preimage');
            return marker;
        } catch (_) { fail('INVALID_STORAGE', 'Invalid component compatibility metadata was preserved.'); }
    }
    function planMigration(storage, options) {
        if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).length !== 1 ||
            !Array.isArray(options.hiddenByLegacyStyles) || options.hiddenByLegacyStyles.length > LEGACY_DEFAULT_IDS.length ||
            options.hiddenByLegacyStyles.some(id => !LEGACY_DEFAULT_IDS.includes(id)) ||
            new Set(options.hiddenByLegacyStyles).size !== options.hiddenByLegacyStyles.length) {
            fail('INVALID_ARGUMENT', 'Provide only positively identified legacy-hidden clock or weather IDs.');
        }
        const expected = snapshot(storage);
        let raw;
        try { raw = storage.getItem(MIGRATION_KEY); }
        catch (_) { fail('STORAGE_FAILURE', 'Component compatibility metadata could not be read.'); }
        if (raw !== null && typeof raw !== 'string') fail('STORAGE_FAILURE', 'Storage returned invalid compatibility metadata.');
        expected.push({ key: MIGRATION_KEY, value: raw });
        if (validateMigration(raw)) return { expected, writes: [], migrated: [], unchanged: true, alreadyMigrated: true };
        const values = new Map(expected.map(value => [value.key, value.value]));
        // Validate both related legacy preferences before planning any write or marker.
        for (const id of LEGACY_DEFAULT_IDS) decode(byId.get(id), values);
        const previous = {}, writes = [], migrated = [];
        for (const id of options.hiddenByLegacyStyles) {
            const key = byId.get(id).key;
            if (values.get(key) !== null) continue;
            previous[key] = null;
            writes.push({ key, value: 'true' });
            migrated.push(id);
        }
        // Mark even an empty migration so later wallpaper changes cannot invent defaults.
        writes.push({ key: MIGRATION_KEY, value: JSON.stringify({ version: 1, previous }) });
        return { expected, writes, migrated, unchanged: false, alreadyMigrated: false };
    }
    return Object.freeze({ definitions, storageKeys, snapshot, read, plan, MIGRATION_KEY, validateMigration, planMigration });
}));

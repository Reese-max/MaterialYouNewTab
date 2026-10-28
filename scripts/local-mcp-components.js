/* Allowlisted component visibility only. Never gestures, permission requests, playback or remote initialization. */
(function (root) {
    'use strict';
    const node = typeof module === 'object' && module.exports;
    const componentCore = () => root.MYNTComponentVisibilityCore || (node && require('./component-visibility-core.js'));
    const IDS = Object.freeze(['clock', 'weather', 'focus', 'search', 'shortcuts', 'aiTools', 'googleApps', 'bookmarks', 'todo', 'pomodoro', 'homeWidgets', 'bongo', 'scratchpad', 'studyQuote', 'motivationalQuotes', 'exam', 'countdowns', 'galleryEntry', 'profilesEntry', 'adaptiveEntry']);
    const object = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
    const tools = [
        {
            name: 'mynt_components_get',
            description: 'List supported homepage component visibility and browser-only enable boundaries. Does not read component contents, credentials, bookmarks or notes.',
            readOnly: true,
            annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
            inputSchema: object({})
        },
        {
            name: 'mynt_components_update',
            description: 'Hide or re-add one allowlisted homepage component without deleting its data, opening panels, starting playback, requesting permissions or initializing network services. Weather, external quotes and exam warm-up may require browser action.',
            readOnly: false,
            annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
            inputSchema: object({
                id: { type: 'string', enum: IDS, maxLength: 40 },
                visible: { type: 'boolean' },
                expectedRevision: { type: 'string', pattern: '^[a-f0-9]{64}$', maxLength: 64 },
                requestId: { type: 'string', pattern: '^[a-zA-Z0-9_-]{8,100}$', minLength: 8, maxLength: 100 }
            }, ['id', 'visible', 'expectedRevision'])
        }
    ];
    const plain = value => value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
    function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
    function validate(args, schema) {
        if (!plain(args)) fail('INVALID_ARGUMENT', 'Arguments must be an object');
        for (const key of Object.keys(args)) {
            const rule = schema.properties[key], value = args[key];
            if (!rule || typeof value !== rule.type || rule.enum && !rule.enum.includes(value) ||
                rule.type === 'string' && (value.length < (rule.minLength || 0) || value.length > rule.maxLength || /[\u0000\u202a-\u202e\u2066-\u2069]/u.test(value) || rule.pattern && !new RegExp(rule.pattern).test(value))) {
                fail('INVALID_ARGUMENT', 'Unsupported component argument');
            }
        }
        for (const key of schema.required) if (!Object.hasOwn(args, key)) fail('INVALID_ARGUMENT', key + ' is required');
    }
    async function revision(expected, context) {
        const crypto = context.crypto || root.crypto;
        if (!crypto?.subtle) fail('UNAVAILABLE', 'Revision hashing unavailable');
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(expected)));
        return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    }
    function snapshot(core, storage) {
        const expected = core.snapshot(storage), allowed = new Set(core.storageKeys);
        if (!Array.isArray(expected) || expected.length !== allowed.size || new Set(expected.map(item => item.key)).size !== expected.length ||
            expected.some(item => !allowed.has(item.key) || !(item.value === null || typeof item.value === 'string') || (item.value?.length || 0) > 262144)) {
            fail('INVALID_STORAGE', 'Invalid or oversized visibility data preserved');
        }
        return expected;
    }
    function view(expected) {
        const values = new Map(expected.map(item => [item.key, item.value]));
        return Object.freeze({ getItem(key) { if (!values.has(key)) fail('INVALID_STORAGE', 'Unexpected visibility storage key'); return values.get(key); } });
    }
    function enableBoundary(id) {
        if (id === 'weather') return 'Weather enablement requires the ordinary browser control because initialization may reload, request location or contact a weather service.';
        if (id === 'motivationalQuotes') return 'External quote enablement requires the ordinary browser control because quote initialization may fetch remote content.';
        if (id === 'exam') return 'Exam enablement requires the ordinary browser control because pending question warm-up may fetch remote content.';
        if (id === 'clock' && root.document && typeof root.myntClockPreferences?.reload !== 'function') return 'The clock was not initialized at page startup. Enable it once using the ordinary browser clock control.';
        return null;
    }
    function data(core, storage) {
        return {
            components: core.read(storage).map(item => ({
                id: item.id, labelZh: item.labelZh, labelEn: item.labelEn, visible: item.visible, valid: item.valid,
                ...(item.valid ? {} : { error: { code: 'INVALID_STORAGE', message: 'Malformed visibility preference preserved' } }),
                ...(enableBoundary(item.id) ? { enableRequiresBrowser: true, enableReason: enableBoundary(item.id) } : {})
            })),
            visibilityOnly: true,
            contentPreserved: true,
            playbackUnchanged: true
        };
    }
    async function execute(name, args = {}, context = {}) {
        try {
            const tool = tools.find(item => item.name === name);
            if (!tool) fail('UNKNOWN_TOOL', 'Unknown components tool');
            validate(args, tool.inputSchema);
            if (args.requestId && context.requestId && args.requestId !== context.requestId) fail('INVALID_ARGUMENT', 'Conflicting request identifiers');
            context.assertAccess?.();
            const core = componentCore(), storage = context.storage || root.localStorage;
            if (!core?.snapshot || !core.read || !core.plan || !storage) fail('UNAVAILABLE', 'Component visibility unavailable');
            const expected = snapshot(core, storage), saved = view(expected), current = data(core, saved), token = await revision(expected, context);
            context.assertAccess?.();
            if (tool.readOnly) return { ok: true, revision: token, data: current };
            if (args.expectedRevision !== token) fail('CONFLICT', 'Component visibility changed; read it again');
            const plan = core.plan(saved, args.id, args.visible);
            if (!Array.isArray(plan.writes) || plan.writes.some(item => !expected.some(old => old.key === item.key))) fail('INVALID_TRANSACTION', 'Unsupported visibility write');
            if (!plan.writes.length) return { ok: true, revision: token, data: current, unchanged: true };
            const boundary = args.visible && !plan.previousVisible && enableBoundary(args.id);
            if (boundary) fail('ACTION_REQUIRED', boundary + ' No preferences were changed.');
            if (root.document && typeof root.myntComponents?.refresh !== 'function') fail('ACTION_REQUIRED', 'Component visibility refresh is not initialized. Use the ordinary browser controls; no preferences were changed.');
            if (typeof context.commit !== 'function') fail('UNAVAILABLE', 'Coordinated component commit unavailable');
            const next = new Map(plan.writes.map(item => [item.key, item.value]));
            const after = expected.map(item => ({ key: item.key, value: next.has(item.key) ? next.get(item.key) : item.value }));
            const result = { ok: true, revision: await revision(after, context), data: data(core, view(after)) };
            context.assertAccess?.();
            const committed = await context.commit({ domain: 'components', expected, writes: plan.writes, result });
            return committed?.ok ? { ...result, ...committed } : committed || { ok: false, error: { code: 'COMMIT_FAILED', message: 'Component commit not acknowledged' } };
        } catch (error) {
            const known = ['UNKNOWN_TOOL', 'INVALID_ARGUMENT', 'INVALID_STORAGE', 'STORAGE_FAILURE', 'ROLLBACK_FAILED', 'CONFLICT', 'INVALID_TRANSACTION', 'ACTION_REQUIRED', 'ACCESS_REVOKED', 'ACCESS_DISABLED', 'EDITOR_BUSY', 'UNAVAILABLE'];
            const code = known.includes(error.code) ? error.code : known.includes(error.message) ? error.message : 'INVALID_STORAGE';
            return { ok: false, error: { code, message: known.includes(error.code) || known.includes(error.message) ? error.message : 'Component validation failed; existing data preserved' } };
        }
    }
    const api = Object.freeze({ tools, execute });
    root.MyntMcpComponents = api;
    if (node) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

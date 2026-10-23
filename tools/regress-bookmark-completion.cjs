/* Dependency-free, isolated DOM and browser-API mocks. No real browser/bookmarks/network.
 * Covers both Chromium callbacks and Firefox promises. Actual extension QA is separate.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = process.argv[2] || path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'scripts/bookmarks.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const eventSource = () => { const handlers = []; return { addListener: fn => handlers.push(fn), emit: data => handlers.forEach(fn => fn(data)), handlers }; };

class Element {
    constructor(tag, document) {
        this.tagName = tag.toUpperCase(); this.ownerDocument = document; this.children = []; this.parentNode = null;
        this.attributes = {}; this.dataset = {}; this.listeners = new Map(); this.style = {}; this.hidden = false;
        this.disabled = false; this.checked = false; this.value = ''; this.textContent = ''; this.open = false;
        const classes = new Set();
        this.classList = {
            add: (...xs) => xs.forEach(x => classes.add(x)), remove: (...xs) => xs.forEach(x => classes.delete(x)),
            contains: x => classes.has(x), toggle: (x, on = !classes.has(x)) => { on ? classes.add(x) : classes.delete(x); return on; }
        };
        Object.defineProperty(this, 'className', { get: () => [...classes].join(' '), set: value => { classes.clear(); value.split(/\s+/u).filter(Boolean).forEach(x => classes.add(x)); } });
    }
    append(...nodes) { for (const node of nodes) { if (node.parentNode) node.parentNode.children = node.parentNode.children.filter(child => child !== node); node.parentNode = this; this.children.push(node); } }
    replaceChildren(...nodes) { this.children.forEach(node => { node.parentNode = null; }); this.children = []; this.append(...nodes); }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key] ?? null; }
    removeAttribute(key) { delete this.attributes[key]; if (key === 'id') delete this.id; }
    addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
    dispatchEvent(event) { this.emit(event.type, event); return !event.defaultPrevented; }
    emit(type, extra = {}) {
        const event = { type, target: this, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; }, ...extra };
        const results = [];
        for (const fn of this.listeners.get(type) || []) results.push(fn(event));
        if (type === 'click' && this.onclick) results.push(this.onclick(event));
        event.done = Promise.all(results); return event;
    }
    click() { if (!this.disabled) { if (this.type === 'checkbox') { this.checked = !this.checked; this.emit('change'); } return this.emit('click'); } }
    focus() { this.ownerDocument.activeElement = this; }
    showModal() { this.open = true; }
    close() { this.open = false; this.emit('close'); }
    all() { return this.children.flatMap(node => [node, ...node.all()]); }
    contains(node) { return node === this || this.all().includes(node); }
    matches(selector) {
        if (selector === '[hidden]') return this.hidden;
        if (selector === 'details') return this.tagName === 'DETAILS';
        if (selector === 'summary') return this.tagName === 'SUMMARY';
        if (selector === 'a[href]') return this.tagName === 'A' && !!this.href;
        if (selector.startsWith('button')) return this.tagName === 'BUTTON' && !this.disabled && !this.hidden;
        if (selector.startsWith('input')) return this.tagName === 'INPUT' && !this.disabled;
        if (selector.startsWith('.')) return this.classList.contains(selector.slice(1).replace('[open]', '')) && (!selector.endsWith('[open]') || this.open);
        return false;
    }
    closest(selector) { let node = this; while (node) { if (node.matches(selector)) return node; node = node.parentNode; } return null; }
    querySelectorAll(selector) { return this.all().filter(node => selector.split(',').some(part => node.matches(part.trim()))); }
    cloneNode(deep) { const node = new Element(this.tagName, this.ownerDocument); node.attributes = { ...this.attributes }; node.id = this.id; node.className = this.className; if (deep) node.append(...this.children.map(child => child.cloneNode(true))); return node; }
    getClientRects() { return this.closest('[hidden]') ? [] : [{}]; }
}

function fixtureTree() {
    return [{ id: '0', title: '', children: [
        { id: '1', parentId: '0', title: 'Toolbar', children: [
            { id: '10', parentId: '1', title: '工作', dateAdded: 2, children: [
                { id: '11', parentId: '10', index: 0, title: 'Alpha <script>fixture</script>', url: 'https://alpha.example/test', dateAdded: 30 },
                { id: '12', parentId: '10', index: 1, title: '繁體中文', url: 'https://beta.example/', dateAdded: 40 }
            ] },
            { id: '13', parentId: '1', index: 1, title: 'Mail', url: 'mailto:fixture@example.invalid', dateAdded: 10 }
        ] },
        { id: '2', parentId: '0', title: 'Other', children: [] }
    ] }];
}

function harness({ kind = 'chrome', granted = true, hiddenApi = false, tree = fixtureTree(), language = 'zh_TW', protocol = 'chrome-extension:', storage: initialStorage = {} } = {}) {
    const document = new Element('document'); document.ownerDocument = document;
    const elements = new Map();
    document.createElement = tag => new Element(tag, document);
    document.getElementById = id => elements.get(id) || null;
    const ids = [...source.matchAll(/document\.getElementById\("([^"]+)"\)/gu)].map(match => match[1]);
    ids.push('bookmarkGridCheckbox');
    for (const id of new Set(ids)) {
        const tag = id === 'editBookmarkModal' ? 'dialog' : /Checkbox|Name$|URL$|bookmarkSearch$/u.test(id) ? 'input' : /Button|Changes|BookmarkEdit|sort/u.test(id) ? 'button' : 'div';
        const node = document.createElement(tag); node.id = id; elements.set(id, node);
    }
    const id = value => elements.get(value);
    for (const node of elements.values()) document.append(node);
    id('bookmarkContent').append(id('bookmarkList'));
    id('bookmarkSidebar').append(id('bookmarkCloseButton'), id('bookmarkAddButton'), id('bookmarkSearch'), id('bookmarkState'), id('bookmarkContent'), id('bookmarkUndoBar'));
    id('bookmarkState').append(id('bookmarkStatePrimary'), id('bookmarkStateSecondary'));
    id('bookmarkUndoBar').hidden = true;
    id('bookmarkGridCheckbox').type = 'checkbox'; id('bookmarksCheckbox').checked = true;
    const storage = new Map(Object.entries(initialStorage)); const writes = []; let storageBlocked = false;
    const timers = new Map(); let nextTimer = 1; const calls = []; const errors = []; const failures = new Map(); const holds = new Map();
    const data = clone(tree); let nextId = 100, allow = granted, requestResult = true, confirmResult = true, confirmations = 0;
    const walk = nodes => nodes.flatMap(node => [node, ...(node.children ? walk(node.children) : [])]);
    const find = nodeId => walk(data).find(node => node.id === String(nodeId));
    const invoke = async (method, args) => {
        calls.push({ method, args: clone(args) });
        const hold = holds.get(method); if (hold) { holds.delete(method); await hold.promise; }
        const failure = failures.get(method); if (failure) { failures.delete(method); throw new Error(failure); }
        if (method === 'contains') return allow;
        if (method === 'request') { if (requestResult) { allow = true; namespace.bookmarks = api; permissions.onAdded.emit({ permissions: ['bookmarks'] }); } return requestResult; }
        if (!allow) throw new Error('Bookmark permission denied');
        if (method === 'getTree') return clone(data);
        if (method === 'getRecent') return clone(walk(data).filter(node => node.url).sort((a, b) => b.dateAdded - a.dateAdded).slice(0, args[0]));
        if (method === 'create') {
            const details = args[0], parent = find(details.parentId || '2');
            if (!parent || !parent.children) throw new Error('Parent not found');
            const index = details.index ?? parent.children.length;
            if (index > parent.children.length) throw new Error('Index out of range');
            const node = { ...details, id: String(nextId++), parentId: parent.id, index, dateAdded: 50 };
            parent.children.splice(index, 0, node); parent.children.forEach((child, i) => { child.index = i; });
            api.onCreated.emit({ id: node.id }); return clone(node);
        }
        if (method === 'update') { const node = find(args[0]); if (!node) throw new Error('Bookmark not found'); Object.assign(node, args[1]); api.onChanged.emit({ id: node.id }); return clone(node); }
        if (method === 'remove') {
            const node = find(args[0]); if (!node) throw new Error('Bookmark not found');
            if (node.children) throw new Error('Refusing folder removal');
            const parent = find(node.parentId); parent.children.splice(parent.children.indexOf(node), 1); parent.children.forEach((child, i) => { child.index = i; });
            api.onRemoved.emit({ id: node.id }); return;
        }
        throw new Error(`Unknown mock method ${method}`);
    };
    const runtime = { id: 'isolated-fixture-extension', lastError: null };
    const wrap = method => kind === 'firefox' ? (...args) => invoke(method, args) : (...args) => {
        const callback = args.pop(); invoke(method, args).then(result => callback(result), error => {
            runtime.lastError = { message: error.message }; try { callback(); } finally { runtime.lastError = null; }
        });
    };
    const api = Object.fromEntries(['getTree', 'getRecent', 'create', 'update', 'remove'].map(method => [method, wrap(method)]));
    for (const name of ['onCreated', 'onChanged', 'onRemoved', 'onMoved', 'onChildrenReordered']) api[name] = eventSource();
    const permissions = { contains: wrap('contains'), request: wrap('request'), onAdded: eventSource(), onRemoved: eventSource() };
    const namespace = { runtime, permissions }; if (!hiddenApi) namespace.bookmarks = api;
    const translationContext = { translations: {} }; vm.createContext(translationContext);
    for (const locale of ['en', 'zh_TW']) vm.runInContext(fs.readFileSync(path.join(root, `locales/${locale}.js`), 'utf8'), translationContext);
    const context = {
        document, URL, Intl, currentLanguage: language, translations: translationContext.translations,
        location: { protocol }, isFirefox: kind === 'firefox', isOpera: false, bookmarkGridCheckbox: id('bookmarkGridCheckbox'),
        console: { error: (...args) => errors.push(args.map(String).join(' ')), log() {}, warn() {} },
        localStorage: { getItem: key => storage.get(key) ?? null, setItem(key, value) { if (storageBlocked) throw new Error('Local quota exceeded'); storage.set(key, value); writes.push([key, value]); } },
        setTimeout(fn, ms) { const handle = nextTimer++; timers.set(handle, { fn, ms }); return handle; }, clearTimeout: handle => timers.delete(handle),
        CustomEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } },
        confirmPrompt: async () => { confirmations++; if (confirmResult instanceof Error) throw confirmResult; return confirmResult; },
        saveCheckboxState() {}, loadCheckboxState() {}, saveDisplayStatus() {}, loadDisplayStatus() {},
        fetch() { throw new Error('Network forbidden in isolated regression'); }
    };
    if (kind === 'chrome') context.chrome = namespace; if (kind === 'firefox') context.browser = namespace;
    vm.createContext(context); vm.runInContext(source, context, { filename: 'scripts/bookmarks.js' }); document.emit('DOMContentLoaded');
    return {
        context, id, data, find, api, namespace, permissions, calls, errors, storage, writes, timers, document,
        run: code => vm.runInContext(code, context), state: () => id('bookmarkState').hidden ? 'content' : id('bookmarkState').dataset.state,
        async ready() { await context.refreshBookmarkAvailability(); return this; },
        fail(method, message = 'Fixture API failure') { failures.set(method, message); },
        hold(method) { const pending = deferred(); holds.set(method, pending); return pending; },
        grant(value) { allow = value; }, request(value) { requestResult = value; }, confirm(value) { confirmResult = value; },
        blockStorage(value) { storageBlocked = value; }, confirmations: () => confirmations,
        count: method => calls.filter(call => call.method === method).length,
        async tick(ms) { const due = [...timers.entries()].filter(([, timer]) => timer.ms === ms); for (const [handle, timer] of due) { if (!timers.delete(handle)) continue; timer.fn(); } await flush(); }
    };
}

async function testStates(kind) {
    const unavailable = harness({ kind: 'none', protocol: 'https:' }); await unavailable.ready();
    assert.equal(unavailable.state(), 'preview'); unavailable.id('sortAlphabetical').click(); await unavailable.tick(120); assert.equal(unavailable.state(), 'preview');
    unavailable.context.location.protocol = 'chrome-extension:'; await unavailable.ready(); assert.equal(unavailable.state(), 'unsupported');

    const app = harness({ kind, granted: false, hiddenApi: true }); await app.ready();
    assert.equal(app.state(), 'permission', `${kind}: hidden optional API still offers permission`);
    assert.equal(app.count('getTree'), 0); app.context.openBookmarkEditor(); assert.equal(app.id('editBookmarkModal').open, false);
    app.request(false); assert.equal(await app.context.requestBookmarkPermission(), false); assert.equal(app.state(), 'denied');
    assert.equal(app.count('create') + app.count('remove') + app.count('update'), 0);
    app.fail('request'); await app.context.requestBookmarkPermission(); assert.equal(app.state(), 'error');
    app.request(true); assert.equal(await app.context.requestBookmarkPermission(), true); assert.equal(app.state(), 'content');
    assert.deepEqual(app.calls.find(call => call.method === 'contains').args, [{ permissions: ['bookmarks'] }]);
    assert.equal(app.api.onChanged.handlers.length, 1); await app.ready(); assert.equal(app.api.onChanged.handlers.length, 1, 'Do not duplicate API listeners');
    app.fail('contains'); await app.ready(); assert.equal(app.state(), 'error'); assert.equal(app.id('bookmarkAddButton').disabled, true);
    app.context.renderBookmarks(); assert.equal(app.state(), 'error', 'Sort/search cannot reveal stale content after an access error');
    await app.ready(); app.fail('getTree'); await app.context.loadBookmarks(); assert.equal(app.state(), 'error');
    await app.ready(); app.fail('getRecent'); await app.context.loadBookmarks(); assert.equal(app.state(), 'content', 'Optional recent failure does not hide usable tree');
    const previous = app.namespace.permissions.contains;
    app.namespace.permissions.contains = () => { throw new Error('Synchronous permissions failure'); }; await app.ready(); assert.equal(app.state(), 'error'); app.namespace.permissions.contains = previous;
    const previousTree = app.api.getTree; app.api.getTree = () => { throw new Error('Synchronous tree failure'); }; await app.ready(); assert.equal(app.state(), 'error'); app.api.getTree = previousTree;
    await app.ready(); app.context.openBookmarkSidebar(); await flush(); app.grant(false); app.permissions.onRemoved.emit({ permissions: ['bookmarks'] }); await flush(); assert.equal(app.state(), 'permission');
    app.id('sortTimeAdded').click(); assert.equal(app.state(), 'permission');

    const pending = harness({ kind, granted: false, hiddenApi: true }); await pending.ready();
    const requestHold = pending.hold('request'); const first = pending.context.requestBookmarkPermission();
    await pending.context.requestBookmarkPermission(); assert.equal(pending.count('request'), 1, 'Only one permission prompt in flight'); requestHold.resolve(); await first;
    assert.equal(pending.state(), 'content');

    const race = await harness({ kind }).ready(); const treeHold = race.hold('getTree'); const staleLoad = race.context.loadBookmarks();
    race.grant(false); await race.ready(); assert.equal(race.state(), 'permission'); treeHold.resolve(); await staleLoad;
    assert.equal(race.state(), 'permission', 'Late tree errors must not overwrite newer permission state');
    const oldLoad = await harness({ kind }).ready(); const oldTree = oldLoad.hold('getTree'); const stale = oldLoad.context.loadBookmarks();
    oldLoad.fail('getTree'); await oldLoad.context.loadBookmarks(); assert.equal(oldLoad.state(), 'error'); oldTree.resolve(); await stale;
    assert.equal(oldLoad.state(), 'error', 'Late successful tree must not overwrite the newer failed load');

    for (const rootId of ['0', 'root________']) {
        const emptyTree = [{ id: rootId, children: [{ id: '2', parentId: rootId, title: 'Other', children: [] }] }];
        const empty = await harness({ kind, tree: emptyTree }).ready(); assert.equal(empty.state(), 'empty');
        await empty.id('bookmarkStatePrimary').click().done; assert.equal(empty.id('editBookmarkModal').open, true);
        assert.equal(empty.id('editBookmarkHeading').textContent, empty.context.bookmarkText('addBookmarkHeading'), 'Add first never treats the click event as an edit node');
        empty.context.closeBookmarkEditor(); empty.id('sortTimeAdded').click(); assert.equal(empty.state(), 'empty');
        empty.find('2').children.push({ id: '15', parentId: '2', title: 'Empty folder', children: [] }); await empty.context.loadBookmarks(); assert.equal(empty.state(), 'content', 'Empty custom folders remain accessible');
    }
    return app;
}

async function testTreeAndNavigation(kind) {
    const app = await harness({ kind, storage: { shortcutAmount: '1', shortcutURL0: 'https://alpha.example/test' } }).ready();
    assert.equal(app.state(), 'content'); assert.deepEqual(clone(app.run('getFavoriteIds()')), ['11'], 'Existing shortcut seeds favorites once');
    assert.equal(app.run('bookmarkLocale()'), 'zh-TW');
    app.context.currentLanguage = 'invalid_locale_!'; assert.equal(app.run('bookmarkLocale()'), 'en'); app.context.renderBookmarks(); app.context.currentLanguage = 'zh_TW';
    assert.equal(app.id('bookmarkList').children.length, 3);
    const folder = app.id('bookmarkList').all().find(node => node.className === 'bookmark-folder' && node.dataset.id === '10');
    const disclosure = folder.children[0].children[0]; const children = folder.children[1];
    assert.equal(children.hidden, true); disclosure.click(); assert.equal(children.hidden, false); assert.equal(disclosure.getAttribute('aria-expanded'), 'true');
    assert.deepEqual(JSON.parse(app.storage.get('myntBookmarkExpandedFolders')), ['10']);
    app.context.renderBookmarks(); assert.equal(app.id('bookmarkList').all().find(node => node.className === 'bookmark-folder' && node.dataset.id === '10').children[1].hidden, false);
    app.context.toggleBookmarkFavorite('12'); app.context.moveBookmarkFavorite('12', -1); assert.deepEqual(clone(app.run('getFavoriteIds()')), ['12', '11']);
    app.context.toggleBookmarkFavorite('11'); assert.deepEqual(clone(app.run('getFavoriteIds()')), ['12']);
    app.context.renderBookmarks(); assert.deepEqual(clone(app.run('getFavoriteIds()')), ['12'], 'Do not re-seed intentionally removed favorites');

    app.id('bookmarkSearch').value = '繁體'; app.id('bookmarkSearch').emit('input'); await app.tick(120);
    assert.equal(app.state(), 'content'); assert.equal(app.id('bookmarkList').children.length, 1);
    const found = app.id('bookmarkList').all().filter(node => node.className === 'bookmark-item'); assert.equal(found.length, 1); assert.equal(found[0].dataset.id, '12');
    assert.equal(found[0].children[0].href, 'https://beta.example/', 'Open uses the verified anchor URL; no actual navigation in this mock');
    app.id('bookmarkSearch').value = 'ALPHA.EXAMPLE'; app.context.renderBookmarks(); assert.equal(app.id('bookmarkList').all().filter(node => node.className === 'bookmark-item')[0].dataset.id, '11');
    app.id('bookmarkSearch').value = 'no-fixture-matches'; app.context.renderBookmarks(); assert.equal(app.state(), 'search-empty'); assert.equal(app.id('bookmarkAddButton').disabled, false);
    app.context.clearBookmarkSearch(); assert.equal(app.state(), 'content'); assert.equal(app.id('bookmarkSearch').value, '');
    const unsafe = ['javascript:alert(1)', 'java\nscript:alert(1)', 'data:text/html,<script>1</script>', 'vbscript:msgbox(1)', 'blob:https://fixture.example/id', 'not a valid url'];
    for (const url of unsafe) {
        const node = app.context.createBookmarkItem({ id: 'untrusted', title: '<img src=x onerror=alert(1)>', url });
        assert.equal(node.children[0].href, undefined); assert.equal(node.children[0].getAttribute('aria-disabled'), 'true');
        assert.equal(node.children[0].children[1].children[0].textContent, '<img src=x onerror=alert(1)>');
    }
    for (const url of ['https://example.invalid/', 'http://localhost/', 'file:///tmp/fixture', 'mailto:fixture@example.invalid', 'about:blank']) {
        assert.equal(app.context.createBookmarkItem({ id: 'safe', title: 'Fixture', url }).children[0].href, url);
    }
    const image = app.document.createElement('img'); app.context.setBookmarkFavicon(image, 'https://private-bookmark.example/');
    assert(!String(image.src).startsWith('https://'), 'No third-party favicon request'); if (image.onerror) image.onerror(); assert.equal(image.src, './svgs/offline.svg');
    app.context.setBookmarkFavicon(image, 'javascript:alert(1)'); assert.equal(image.src, './svgs/offline.svg');
    app.id('bookmarkViewGrid').click(); assert.equal(app.id('bookmarkViewGrid').getAttribute('aria-pressed'), 'true');
    app.id('bookmarkViewList').click(); assert.equal(app.id('bookmarkViewList').getAttribute('aria-pressed'), 'true');
    app.context.openBookmarkSidebar(); await flush(); assert.equal(app.id('bookmarkSidebar').getAttribute('aria-hidden'), 'false');
    app.id('bookmarkSidebar').emit('keydown', { key: 'Escape' }); assert.equal(app.id('bookmarkSidebar').getAttribute('aria-hidden'), 'true'); assert.equal(app.document.activeElement, app.id('bookmarkButton'));
    app.context.openBookmarkSidebar(); await flush(); app.find('12').title = 'External fixture change'; app.api.onChanged.emit({ id: '12' }); await app.tick(120);
    assert.equal(app.run('bookmarkNodeMap.get("12").title'), 'External fixture change');
    app.blockStorage(true); app.context.toggleBookmarkFavorite('11'); assert.equal(app.id('bookmarkShortcutStatus').textContent, app.context.bookmarkText('bookmarkLocalSaveError'));
    await app.context.loadBookmarks(); assert.equal(app.state(), 'content', 'Preferences failure must not make usable bookmarks unavailable');
    return app;
}

async function testMutations(kind) {
    const app = await harness({ kind, storage: { myntBookmarkFavorites: '["11","12"]' } }).ready();
    const baseline = clone(app.data); const untouched = clone(app.find('12'));
    app.context.openBookmarkEditor(); app.id('editBookmarkName').value = 'Cancelled draft'; app.id('editBookmarkURL').value = 'cancelled.example'; app.context.closeBookmarkEditor();
    assert.deepEqual(app.data, baseline); assert.equal(await app.context.saveBookmarkEditor(), false); assert.equal(app.count('create'), 0);
    app.context.openBookmarkEditor(); app.id('editBookmarkURL').value = 'javascript:alert(1)'; await app.context.saveBookmarkEditor(); assert.equal(app.count('create'), 0); assert.equal(app.id('editBookmarkModal').open, true);
    app.id('editBookmarkName').value = 'Created fixture'; app.id('editBookmarkURL').value = 'created.example';
    app.fail('create'); assert.equal(await app.context.saveBookmarkEditor(), false); assert.equal(app.id('editBookmarkModal').open, true); assert.equal(app.id('editBookmarkURL').value, 'created.example'); assert.equal(app.id('saveBookmarkChanges').disabled, false);
    const held = app.hold('create'); const save = app.context.saveBookmarkEditor(); await app.context.saveBookmarkEditor(); assert.equal(app.count('create'), 2, 'One failed create plus one pending create; no double-submit');
    app.context.closeBookmarkEditor(); assert.equal(app.id('editBookmarkModal').open, true, 'Cannot claim cancellation after a write was dispatched'); assert.equal(app.id('cancelBookmarkEdit').disabled, true); assert.equal(app.id('editBookmarkModal').getAttribute('aria-busy'), 'true');
    held.resolve(); assert.equal(await save, true); assert.equal(app.id('editBookmarkModal').open, false); assert.equal(app.find('100').url, 'https://created.example/');
    app.context.openBookmarkEditor(clone(app.find('11'))); app.id('editBookmarkName').value = 'Updated fixture'; app.id('editBookmarkURL').value = 'https://updated.example/';
    app.fail('update'); assert.equal(await app.context.saveBookmarkEditor(), false); assert.equal(app.find('11').title, baseline[0].children[0].children[0].children[0].title);
    assert.equal(await app.context.saveBookmarkEditor(), true); assert.equal(app.find('11').title, 'Updated fixture'); assert.equal(app.find('11').url, 'https://updated.example/'); assert.deepEqual(app.find('12'), untouched);

    const beforeDelete = clone(app.data); app.confirm(false); assert.equal(await app.context.deleteBookmark(clone(app.find('11'))), false); assert.deepEqual(app.data, beforeDelete); assert.equal(app.count('remove'), 0);
    app.confirm(new Error('Confirmation fixture failure')); assert.equal(await app.context.deleteBookmark(clone(app.find('11'))), false); assert.equal(app.count('remove'), 0);
    app.confirm(true); app.fail('remove'); assert.equal(await app.context.deleteBookmark(clone(app.find('11'))), false); assert.deepEqual(app.data, beforeDelete); assert.equal(app.id('bookmarkUndoBar').hidden, true);
    assert.equal(await app.context.deleteBookmark(clone(app.find('10'))), false, 'Folders are never recursively deleted');
    const deleted = clone(app.find('11')); assert.equal(await app.context.deleteBookmark(deleted), true); assert.equal(app.find('11'), undefined); assert.equal(app.id('bookmarkUndoBar').hidden, false); assert.deepEqual(clone(app.run('getFavoriteIds()')), ['12']);
    const createsBefore = app.count('create'); app.fail('create'); assert.equal(await app.context.undoBookmarkDelete(), false);
    assert.equal(app.count('create'), createsBefore + 1, 'Failed undo must not blindly retry create'); assert.equal(app.id('bookmarkUndoBar').hidden, false); assert.equal(app.run('pendingBookmarkUndo.url'), deleted.url);
    await app.tick(7000); assert.equal(app.run('pendingBookmarkUndo.url'), deleted.url, 'Failed undo preserves recovery beyond the original timeout');
    const undoHold = app.hold('create'); const undo = app.context.undoBookmarkDelete(); await flush(); await app.context.undoBookmarkDelete(); assert.equal(app.count('create'), createsBefore + 2, 'Only one restore in flight');
    undoHold.resolve(); assert.equal(await undo, true); const restored = app.find('101');
    assert.equal(restored.title, deleted.title); assert.equal(restored.url, deleted.url); assert.equal(restored.parentId, deleted.parentId); assert.equal(restored.index, deleted.index); assert.deepEqual(clone(app.run('getFavoriteIds()')), ['101', '12']); assert.equal(app.id('bookmarkUndoBar').hidden, true);
    assert.equal(app.find('12').url, untouched.url); assert.equal(app.find('12').title, untouched.title);

    const deletedAgain = clone(restored); await app.context.deleteBookmark(deletedAgain);
    const parent = app.find('10'); app.find('1').children = app.find('1').children.filter(node => node !== parent);
    const beforeFallback = app.count('create'); await app.context.undoBookmarkDelete(); assert.equal(app.count('create'), beforeFallback + 1); assert.equal(app.find('102').parentId, '2', 'Missing parent is detected before the single restore to browser default');
    const lastCreate = app.calls.filter(call => call.method === 'create').at(-1).args[0]; assert.equal(lastCreate.parentId, undefined); assert.equal(lastCreate.index, undefined);

    // A failed preference write must not erase recovery after an already-successful removal.
    const quota = await harness({ kind, storage: { myntBookmarkFavorites: '["11","12"]' } }).ready(); quota.blockStorage(true);
    assert.equal(await quota.context.deleteBookmark(clone(quota.find('11'))), true); assert.equal(quota.find('11'), undefined); assert.equal(quota.id('bookmarkUndoBar').hidden, false); assert.equal(quota.run('pendingBookmarkUndo.url'), 'https://alpha.example/test');
    assert.equal(await quota.context.undoBookmarkDelete(), true); assert.equal(quota.find('100').url, 'https://alpha.example/test'); assert.equal(quota.id('bookmarkUndoBar').hidden, true); const createCount = quota.count('create'); await quota.context.undoBookmarkDelete(); assert.equal(quota.count('create'), createCount, 'Preference failure after restore cannot duplicate the browser bookmark');

    const slow = await harness({ kind }).ready(); const refreshHold = slow.hold('getTree'); const deleting = slow.context.deleteBookmark(clone(slow.find('11'))); await flush();
    assert.equal(slow.id('bookmarkUndoButton').disabled, true); await slow.tick(7000); assert.equal(slow.run('pendingBookmarkUndo.url'), 'https://alpha.example/test', 'Slow refresh cannot consume the usable undo window');
    refreshHold.resolve(); await deleting; assert.equal(slow.id('bookmarkUndoButton').disabled, false); assert.equal(await slow.context.undoBookmarkDelete(), true);

    const shrink = await harness({ kind }).ready(); await shrink.context.deleteBookmark(clone(shrink.find('12')));
    shrink.find('10').children = []; assert.equal(await shrink.context.undoBookmarkDelete(), true); assert.equal(shrink.find('100').index, 0, 'Restore clamps the old position when siblings have disappeared');
    const noAccess = await harness({ kind }).ready(); await noAccess.context.deleteBookmark(clone(noAccess.find('11'))); noAccess.fail('getTree');
    assert.equal(await noAccess.context.undoBookmarkDelete(), false); assert.equal(noAccess.count('create'), 0, 'Failed preflight never attempts a speculative create'); assert.equal(noAccess.id('bookmarkUndoBar').hidden, false);

    const expires = await harness({ kind }).ready(); await expires.context.deleteBookmark(clone(expires.find('11'))); await expires.tick(7000); assert.equal(expires.run('pendingBookmarkUndo'), null); assert.equal(expires.id('bookmarkUndoBar').hidden, true);
    return app;
}

(async () => {
    for (const kind of ['chrome', 'firefox']) {
        await testStates(kind); await testTreeAndNavigation(kind); await testMutations(kind);
        console.log(`BOOKMARK_MOCK_${kind.toUpperCase()}_OK: permission/denial/errors/races, zh_TW, tree/folders/search, safe anchor targets, local icons, create/update/cancel, delete/undo/failures, duplicate prevention and unrelated-data preservation`);
    }
    console.log('BOOKMARK_REAL_API_UNVERIFIED: this suite uses isolated mocks only; it does not install an extension, navigate a real bookmark, access user data, or prove real browser API behavior.');
})().catch(error => { console.error(error); process.exitCode = 1; });

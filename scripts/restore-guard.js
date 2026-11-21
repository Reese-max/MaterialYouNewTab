/* Loaded before all writers. Synchronous storage/IDB admission is shared by
 * ordinary UI and MCP across tabs; Web Locks serialize restore/recovery owners. */
(() => {
    const KEY = 'myntRestoreJournalV1';
    const get = Storage.prototype.getItem;
    let admitted = false, observed = false;
    const pending = () => get.call(localStorage, KEY) !== null;
    function check() {
        if (!admitted && pending()) throw Error('MYNT_RESTORE_BUSY');
    }
    for (const name of ['setItem', 'removeItem', 'clear']) {
        const original = Storage.prototype[name];
        Storage.prototype[name] = function (...args) {
            if (this === localStorage) check();
            return original.apply(this, args);
        };
    }
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args) {
        if (args[1] === 'readwrite') check();
        return transaction.apply(this, args);
    };
    function gate() {
        const busy = pending();
        document.documentElement.inert = busy;
        if (busy) observed = true;
        else if (observed) location.reload(); // Discard cached domain state.
    }
    globalThis.MyntRestoreGuard = {
        KEY,
        allow(fn) { const old = admitted; admitted = true; try { return fn(); } finally { admitted = old; } },
        lock(fn) {
            if (!navigator.locks) return Promise.reject(Error('MYNT_RESTORE_LOCK_UNAVAILABLE'));
            return navigator.locks.request('mynt-local-mcp-write', fn);
        },
        gate
    };
    addEventListener('storage', event => {
        if (event.key === KEY || event.key === null) {
            if (event.newValue !== null) observed = true;
            gate();
        }
    });
    gate();
})();

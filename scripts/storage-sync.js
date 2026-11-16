/* Shared optimistic storage checks. Existing keys and payload formats stay intact. */
(() => {
    const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    function watch(keys, refresh) {
        window.addEventListener("storage", event => {
            if (event.storageArea && event.storageArea !== localStorage) return;
            if (event.key === null || (typeof keys === "function" ? keys(event.key) : keys.includes(event.key))) refresh();
        });
    }
    // A rejected draft stays copyable in a dialog; the latest stored data is reloaded by the caller.
    function preserve(draft) {
        const lang = localStorage.getItem("selectedLanguage") || "zh_TW";
        const words = typeof translations === "undefined" ? {} : translations;
        const message = words[lang]?.storageConflictSaved || words.en?.storageConflictSaved || "Another tab changed this data and the latest data has been loaded. Copy your unsaved draft below if you still need it.";
        return window.myntDialog ? window.myntDialog.prompt(message, draft) : Promise.resolve(window.prompt(message, draft));
    }
    // Three-way entity merge: unchanged local entities follow remote deletions;
    // conflicting edits retain the remote entity and a separate local copy.
    function mergeRecords(base, draft, current) {
        const merged = Object.assign(Object.create(null), current);
        for (const id of new Set([...Object.keys(base), ...Object.keys(draft)])) {
            const before = Object.hasOwn(base, id) ? base[id] : undefined;
            const local = Object.hasOwn(draft, id) ? draft[id] : undefined;
            const remote = Object.hasOwn(current, id) ? current[id] : undefined;
            if (equal(before, local)) continue;
            if (equal(before, remote) || equal(local, remote)) {
                if (local === undefined) delete merged[id];
                else merged[id] = local;
            } else if (local !== undefined) {
                if (before && remote) {
                    const item = { ...remote };
                    let conflict = false;
                    for (const field of new Set([...Object.keys(before), ...Object.keys(local)])) {
                        if (equal(local[field], before[field])) continue;
                        if (!equal(remote[field], before[field]) && !equal(remote[field], local[field])) conflict = true;
                        item[field] = local[field];
                    }
                    if (!conflict) { merged[id] = item; continue; }
                }
                let copyId = `${id.slice(0, 70)}-copy`;
                while (Object.hasOwn(merged, copyId)) copyId += "x";
                merged[copyId] = Object.hasOwn(local, "id") ? { ...local, id: copyId } : local;
            }
        }
        return merged;
    }
    window.MyntStorageSync = { equal, watch, preserve, mergeRecords };
})();

/* Shared optimistic storage checks. Existing keys and payload formats stay intact. */
(() => {
    const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    function watch(keys, refresh) {
        window.addEventListener("storage", event => {
            if (event.storageArea && event.storageArea !== localStorage) return;
            if (event.key === null || (typeof keys === "function" ? keys(event.key) : keys.includes(event.key))) refresh();
        });
    }
    function conflictText(current, draft) {
        if (current === draft) return current;
        const lang = localStorage.getItem("selectedLanguage") || "zh_TW";
        const words = typeof translations === "undefined" ? {} : translations;
        const label = words[lang]?.storageConflictCopy || words.en?.storageConflictCopy || "Conflicting draft kept from this tab";
        return `${current}\n\n--- ${label} ---\n${draft}\n---`;
    }
    function preserve(draft) {
        const key = "myntScratchpadContent";
        localStorage.setItem(key, conflictText(localStorage.getItem(key) || "", draft));
        window.myntScratchpad?.reload();
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
    window.MyntStorageSync = { equal, watch, conflictText, preserve, mergeRecords };
})();

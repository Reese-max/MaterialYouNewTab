/*
 * Loads non-critical scripts after first paint (idle) or on first use.
 * Critical startup scripts (wallpaper, layout, focus card, Pomodoro, shortcuts) stay eager.
 */
const MYNT_LAZY_SCRIPTS = {
    daidai: "scripts/daidai-integration.js",
    bookmarks: "scripts/bookmarks.js"
};

(function () {
    if (typeof document === "undefined") return;
    const pending = new Map();

    function load(name) {
        const src = MYNT_LAZY_SCRIPTS[name];
        if (!src) return Promise.reject(new Error(`Unknown lazy script ${name}`));
        if (pending.has(name)) return pending.get(name);
        const promise = new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = src;
            script.async = false;
            script.dataset.lazy = name;
            script.onload = () => resolve(name);
            script.onerror = () => { pending.delete(name); reject(new Error(`Failed to load ${src}`)); };
            document.body.append(script);
        });
        pending.set(name, promise);
        return promise;
    }
    const loaded = name => pending.has(name);

    // Replay the first interaction once the owning script is ready.
    function gate(selector, name, events = ["click"]) {
        document.addEventListener("pointerover", e => { if (e.target.closest?.(selector)) void load(name); }, { passive: true });
        document.addEventListener("focusin", e => { if (e.target.closest?.(selector)) void load(name); });
        for (const type of events) {
            document.addEventListener(type, e => {
                const el = e.target.closest?.(selector);
                if (!el || el.dataset.myntLazyReady) return;
                const promise = load(name);
                e.preventDefault();
                e.stopImmediatePropagation();
                promise.then(() => setTimeout(() => { el.dataset.myntLazyReady = "1"; el.click(); }, 0)).catch(() => {});
            }, true);
        }
    }

    gate("#bookmarkButton", "bookmarks");
    gate("#daidaiConnectBtn", "daidai");
    // Focus card / todo prompts fired before the bridge is loaded are replayed after loading.
    document.addEventListener("mynt:daidai-prompt", e => {
        if (loaded("daidai") && !e.detail?.__queued) return;
        if (e.detail?.__queued) return;
        e.stopImmediatePropagation();
        const detail = { ...e.detail, __queued: true };
        load("daidai").then(() => setTimeout(() => document.dispatchEvent(new CustomEvent("mynt:daidai-prompt", { detail })), 0));
    }, true);

    const idle = window.requestIdleCallback || (cb => setTimeout(cb, 700));
    const start = () => idle(() => { void load("bookmarks"); void load("daidai"); }, { timeout: 2000 });
    if (document.readyState === "complete") start();
    else addEventListener("load", start, { once: true });

    window.myntLazy = { load, loaded, scripts: { ...MYNT_LAZY_SCRIPTS } };
})();

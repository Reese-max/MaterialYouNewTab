/* One-time recovery of saved offsets that conflict with the centered home layout. */
(function (root) {
    'use strict';
    const KEY = 'myntLayoutProfiles', FLAG = 'myntCenteredLayoutV1';
    function migrate(storage) {
        if (storage.getItem(FLAG) === 'true') return false;
        try {
            const data = JSON.parse(storage.getItem(KEY));
            if (!data || data.version !== 1 || !Number.isSafeInteger(data.revision) || data.revision < 0 || !Array.isArray(data.profiles) || data.profiles.length >= 20) throw Error('invalid');
            const active = data.profiles.find(profile => profile.id === data.active);
            const validLayout = layout => layout && layout.version === 2 && typeof layout.snap === 'boolean' && typeof layout.locked === 'boolean' && layout.blocks && typeof layout.blocks === 'object' && !Array.isArray(layout.blocks) && Object.values(layout.blocks).every(block => block && Number.isFinite(block.x) && Number.isFinite(block.y) && Number.isFinite(block.s) && Math.abs(block.x) <= 1 && Math.abs(block.y) <= 1 && block.s >= .5 && block.s <= 2);
            if (!active || typeof active.name !== 'string' || !active.layouts || !['wide', 'narrow'].every(size => validLayout(active.layouts[size]))) throw Error('invalid');
            if (data.profiles.some(profile => profile.id !== active.id && profile.name === '舊版面（自動備份）') && ['wide', 'narrow'].every(size => Object.keys(active.layouts[size].blocks).length === 0)) {
                storage.setItem(FLAG, 'true');
                return true;
            }
            const backup = JSON.parse(JSON.stringify(active));
            backup.id = `pcentered_${Date.now().toString(36)}`;
            while (data.profiles.some(profile => profile.id === backup.id)) backup.id += '_b';
            backup.name = '舊版面（自動備份）';
            data.profiles.push(backup);
            for (const size of ['wide', 'narrow']) active.layouts[size].blocks = {};
            data.revision++;
            storage.setItem(KEY, JSON.stringify(data));
        } catch (_) { /* Missing or malformed profiles are left untouched. */ }
        storage.setItem(FLAG, 'true');
        return true;
    }
    root.MyntCenteredLayout = { migrate, KEY, FLAG };
    if (typeof module !== 'undefined' && module.exports) module.exports = root.MyntCenteredLayout;
    try { migrate(root.localStorage); } catch (_) { /* Private browsing may deny storage. */ }
    const wireAdd = () => document.getElementById('addQuickLinkButton')?.addEventListener('click', event => {
        event.stopPropagation();
        const toggle = document.getElementById('shortcutsCheckbox');
        if (toggle && !toggle.checked) { toggle.checked = true; toggle.dispatchEvent(new Event('change', { bubbles: true })); }
        const menu = document.getElementById('menuButton');
        if (menu?.getAttribute('aria-expanded') !== 'true') setTimeout(() => menu?.click(), 0);
        // The menu animation is cancelled by any page switch, so wait until it has finished opening.
        const started = Date.now();
        const whenOpen = () => {
            const cont = document.getElementById('menuCont'), opt = document.getElementById('optCont');
            const open = cont?.style.transform === 'translateX(0px)' && opt?.style.opacity === '1';
            if (!open && Date.now() - started < 2000) return setTimeout(whenOpen, 50);
            document.querySelector('[data-settings-group-button="work"]')?.click();
            document.getElementById('shortcutEditButton')?.click();
            setTimeout(() => document.getElementById('newShortcutButton')?.click(), 400);
        };
        setTimeout(whenOpen, 50);
    });
    if (root.document?.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', wireAdd, { once: true });
    else if (root.document) wireAdd();
})(typeof window !== 'undefined' ? window : globalThis);

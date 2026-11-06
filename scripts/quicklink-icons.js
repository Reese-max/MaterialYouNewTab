/* Shared string icons for shortcuts and AI tools. No permissions are requested here. */
(function (root) {
    'use strict';
    const glyphs = Object.freeze({
        book: 'M3 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-3H3zM21 4h-6a3 3 0 0 0-3 3v14a4 4 0 0 1 4-3h5z',
        notes: 'M5 3h14v18H5zM8 7h8M8 11h8M8 15h5',
        mail: 'M3 5h18v14H3zM3 5l9 8 9-8',
        video: 'M3 5h12v14H3zM15 10l6-4v12l-6-4z',
        music: 'M9 18V5l11-2v13M9 8l11-2M9 18a3 3 0 1 1-3-3h3M20 16a3 3 0 1 1-3-3h3',
        cloud: 'M6 19a5 5 0 0 1-1-10 7 7 0 0 1 13-2 6 6 0 0 1 0 12z',
        code: 'M8 6l-6 6 6 6M16 6l6 6-6 6M14 3l-4 18',
        school: 'M2 8l10-5 10 5-10 5zM6 10v7l6 3 6-3v-7M22 8v8',
        news: 'M4 3h16v18H4zM7 7h10M7 11h4v4H7zM14 11h3M14 15h3M7 18h10',
        calendar: 'M3 5h18v16H3zM3 10h18M7 2v6M17 2v6M7 14h2M13 14h4M7 18h2',
        chat: 'M3 3h18v14H9l-6 4zM7 7h10M7 12h7',
        search: 'M15 15l7 7M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
        shop: 'M4 8h16l2 13H2zM8 8V6a4 4 0 0 1 8 0v2',
        map: 'M2 5l6-3 8 3 6-3v17l-6 3-8-3-6 3zM8 2v17M16 5v17',
        photo: 'M3 3h18v18H3zM3 18l6-7 5 5 3-3 4 5M17 7h.01',
        game: 'M7 7h10c5 0 7 14 3 14l-5-5H9l-5 5C0 21 2 7 7 7zM6 10v5M3.5 12.5h5M16 11h.01M19 14h.01',
        work: 'M3 7h18v14H3zM8 7V3h8v4M3 12l9 3 9-3M12 12v5',
        home: 'M2 11L12 2l10 9M5 9v12h14V9M9 21v-8h6v8',
        star: 'M12 2l3 6 7 1-5 5 1 8-6-4-6 4 1-8-5-5 7-1z',
        heart: 'M12 21L3 12C-3 4 7-2 12 6c5-8 15-2 9 6z',
        link: 'M10 14l4-4M8 16l-2 2a4 4 0 0 1-6-6l6-6a4 4 0 0 1 6 0M16 8l2-2a4 4 0 0 1 6 6l-6 6a4 4 0 0 1-6 0',
        folder: 'M2 5h8l2 3h10v13H2z',
        settings: 'M9 2h6l1 4 4 1 3 5-3 5-4 1-1 4H9l-1-4-4-1-3-5 3-5 4-1zM16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
        translate: 'M2 5h13M8 2v3M4 5c0 6 7 10 10 11M12 5c0 6-7 10-10 11M13 22l5-12 5 12M15 18h6'
    });
    const graphemes = value => typeof Intl.Segmenter === 'function'
        ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)].map(part => part.segment) : [];
    const unsafeText = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;
    const t = key => (typeof translations !== 'undefined'
        ? translations[typeof currentLanguage !== 'undefined' ? currentLanguage : 'en']?.[key] || translations.en?.[key] : '') || key;

    // Keep the existing image URL and SVG trust boundary for both editors.
    function isValidCustomIconUrl(url) {
        if (typeof url !== 'string' || !url.trim() || /\s/.test(url)) return false;
        if (/^https?:\/\//i.test(url)) {
            try { return ['http:', 'https:'].includes(new URL(url).protocol); } catch { return false; }
        }
        return /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon|svg\+xml)(?:[;,])/i.test(url);
    }
    function sanitizeSvg(raw) {
        const normalized = raw.trim().replace(/^<\?xml[\s\S]*?\?>\s*/i, '').replace(/^<!doctype[\s\S]*?>\s*/i, '').replace(/^<!--[\s\S]*?-->\s*/i, '');
        if (!normalized.toLowerCase().startsWith('<svg')) return null;
        for (const pattern of [/<script[\s>]/i, /\bon\w+\s*=/i, /<iframe[\s>]/i, /<foreignObject[\s>]/i, /javascript\s*:/i, /data:(?!image\/[a-z]+;base64,)[^"'\s]*/i]) {
            if (pattern.test(normalized)) return null;
        }
        const storage = root.document ? root.localStorage : null;
        const color = storage?.getItem('selectedTheme') === 'dark' ? '#bfbfbf' : storage?.getItem('accentLightTintColor') || '#e2eeff';
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(normalized.replace(/\bcurrentColor\b/g, /^#[\da-f]{6}$/i.test(color) ? color : '#e2eeff'));
    }
    function sanitizeSvgDataUrl(dataUrl) {
        const separatorIndex = dataUrl.indexOf(',');
        if (separatorIndex < 0) return null;
        const metadata = dataUrl.slice(0, separatorIndex).toLowerCase();
        if (!metadata.startsWith('data:image/svg+xml')) return null;
        try {
            const payload = dataUrl.slice(separatorIndex + 1);
            const raw = metadata.includes(';base64') ? new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(payload), char => char.charCodeAt(0))) : decodeURIComponent(payload);
            return sanitizeSvg(raw);
        } catch { return null; }
    }
    function process(raw) {
        const value = typeof raw === 'string' ? raw.trim() : '';
        const valid = value => ({ value, error: null });
        const invalid = error => ({ value: '', error });
        if (!value) return valid('');
        if (value.startsWith('mynt-icon:')) return Object.hasOwn(glyphs, value.slice(10)) ? valid(value) : invalid('invalidIcon');
        if (value.startsWith('mynt-emoji:')) {
            const text = value.slice(11);
            return graphemes(text).length === 1 && /\p{Extended_Pictographic}/u.test(text) && !unsafeText.test(text) ? valid(value) : invalid('invalidIcon');
        }
        if (value.startsWith('mynt-text:')) {
            const match = value.match(/^mynt-text:([\s\S]+):(#[\da-f]{6})$/iu);
            const length = match ? graphemes(match[1]).length : 0;
            return length >= 1 && length <= 2 && match[1].trim() && !unsafeText.test(match[1]) ? valid(value) : invalid('invalidIcon');
        }
        if (value.startsWith('mynt-')) return invalid('invalidIcon');
        if (/<svg[\s>]/i.test(value)) { const clean = sanitizeSvg(value); return clean ? valid(clean) : invalid('invalidSvg'); }
        if (/^data:image\/svg\+xml/i.test(value)) { const clean = sanitizeSvgDataUrl(value); return clean ? valid(clean) : invalid('invalidSvg'); }
        return isValidCustomIconUrl(value) ? valid(value) : invalid('invalidIcon');
    }
    function parse(raw) {
        const { value } = process(raw);
        if (!value) return { type: 'auto', value: '' };
        if (value.startsWith('mynt-icon:')) return { type: 'icon', name: value.slice(10), value };
        if (value.startsWith('mynt-emoji:')) return { type: 'emoji', text: value.slice(11), value };
        if (value.startsWith('mynt-text:')) { const [, text, color] = value.match(/^mynt-text:([\s\S]+):(#[\da-f]{6})$/iu); return { type: 'text', text, color, value }; }
        return { type: 'custom', value };
    }
    function contrast(color) {
        const channels = color.slice(1).match(/../g).map(hex => parseInt(hex, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
        return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722 > .179 ? '#000000' : '#ffffff';
    }
    function normalizeWebsiteUrl(raw) {
        const value = String(raw || '').trim();
        if (!value || (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^https?:\/\//i.test(value) && !/^[^/:]+:\d+(?:[/?#]|$)/.test(value))) return null;
        try {
            const url = new URL(/^https?:\/\//i.test(value) ? value : 'https://' + value);
            return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
        } catch { return null; }
    }
    function customOverrides(value, strict = false) {
        const result = {};
        const reject = () => { if (strict) throw Error('Invalid AI tool customization'); };
        if (!value || typeof value !== 'object' || Array.isArray(value)) { reject(); return result; }
        for (const [id, fields] of Object.entries(value)) {
            if (!['chatGPT', 'claude', 'youtube'].includes(id) || !fields || typeof fields !== 'object' || Array.isArray(fields)) { reject(); continue; }
            const clean = {};
            for (const [key, raw] of Object.entries(fields)) {
                if (!['label', 'url', 'icon'].includes(key) || typeof raw !== 'string') { reject(); continue; }
                const text = raw.trim();
                if (!text) continue;
                if (key === 'label') {
                    if (Array.from(text).length > 40 || unsafeText.test(text)) reject(); else clean.label = text;
                } else if (key === 'url') {
                    const url = normalizeWebsiteUrl(text); if (!url) reject(); else clean.url = url;
                } else {
                    const icon = process(text); if (icon.error) reject(); else clean.icon = icon.value;
                }
            }
            if (Object.keys(clean).length) result[id] = clean;
        }
        return result;
    }
    function render(container, raw, options = {}) {
        const icon = parse(raw), doc = container.ownerDocument;
        container.replaceChildren();
        if (icon.type === 'auto') { options.automatic?.(container); return false; }
        let node;
        if (icon.type === 'icon') {
            node = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
            node.setAttribute('viewBox', '0 0 24 24');
            node.setAttribute('fill', 'none'); node.setAttribute('stroke', 'currentColor'); node.setAttribute('stroke-width', '1.8');
            node.setAttribute('stroke-linecap', 'round'); node.setAttribute('stroke-linejoin', 'round');
            const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', glyphs[icon.name]); node.appendChild(path);
        } else if (icon.type === 'custom') {
            node = doc.createElement('img'); node.src = icon.value; node.alt = ''; node.referrerPolicy = 'no-referrer'; node.draggable = false;
            node.addEventListener('error', () => { if (node.parentElement !== container) return; container.replaceChildren(); options.automatic?.(container); }, { once: true });
        } else {
            node = doc.createElement('span'); node.textContent = icon.text;
            if (icon.type === 'text') { node.style.backgroundColor = icon.color; node.style.color = contrast(icon.color); node.style.fontSize = graphemes(icon.text).length === 1 ? '80cqw' : '55cqw'; }
        }
        node.setAttribute('class', 'quicklinkIcon quicklinkIcon-' + icon.type);
        node.setAttribute('data-icon-type', icon.type); node.setAttribute('aria-hidden', 'true');
        container.appendChild(node); return true;
    }
    async function websiteIcon(image, pageUrl, fallback) {
        // Check the existing optional permission; never request or cache a grant.
        const api = root.chrome;
        let local = false;
        try {
            local = Boolean(api?.runtime?.id && api?.permissions?.contains && await new Promise(resolve => {
                api.permissions.contains({ permissions: ['favicon'] }, granted => { resolve(!api.runtime.lastError && granted); });
            }));
        } catch { /* Firefox/web preview keep the existing fallback. */ }
        if (!local && typeof fallback === 'function') { fallback(); return; }
        image.src = local ? `chrome-extension://${api.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=32` : fallback;
    }
    function button(doc, text, action) {
        const node = doc.createElement('button'); node.type = 'button'; node.textContent = text; node.addEventListener('click', action); return node;
    }
    function chooseButton(options) {
        const doc = options.document || root.document;
        const node = button(doc, '', () => open({ ...options, value: options.getValue(), label: options.getLabel(), url: options.getUrl?.(),
            onSelect(value) { const result = options.onSelect(value); node.refreshIcon(); return result; }
        }));
        node.className = 'quicklinkChooseIcon';
        node.refreshIcon = () => {
            const icon = parse(options.getValue());
            const preview = doc.createElement('span'); preview.className = 'quicklinkChoosePreview';
            render(preview, icon.value, { automatic: options.automatic });
            const label = doc.createElement('span');
            label.textContent = icon.type === 'icon' ? t('quicklinkTab_icon') + '：' + t('quicklinkGlyph_' + icon.name)
                : icon.type === 'text' ? t('quicklinkTab_text') + '：' + icon.text
                : icon.type === 'custom' ? t('quicklinkCustomImage') : t('quicklinkTab_' + icon.type);
            node.setAttribute('aria-label', t('quicklinkChooseIcon') + '：' + label.textContent);
            node.setAttribute('title', t('quicklinkChooseIcon'));
            node.replaceChildren(preview, label);
        };
        node.refreshIcon(); return node;
    }
    function open(options) {
        const doc = options.document || root.document, returnFocus = doc.activeElement;
        const dialog = doc.createElement('dialog'); dialog.className = 'myntDialog quicklinkIconDialog'; dialog.setAttribute('aria-labelledby', 'quicklinkIconTitle');
        const title = doc.createElement('h3'); title.id = 'quicklinkIconTitle'; title.textContent = t('quicklinkChooseIcon');
        const preview = doc.createElement('div'); preview.className = 'quicklinkIconPreview';
        const previewIcon = doc.createElement('span'), previewLabel = doc.createElement('span'); previewLabel.textContent = options.label || t('quicklinkPreview'); preview.append(previewIcon, previewLabel);
        const tabs = doc.createElement('div'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', t('quicklinkChooseIcon')); tabs.className = 'quicklinkIconTabs';
        const panels = [], tabButtons = [], kinds = ['auto', 'icon', 'emoji', 'text', 'custom'];
        let candidate = parse(options.value).value, active = parse(candidate).type;
        const message = doc.createElement('p'); message.setAttribute('role', 'status'); message.className = 'quicklinkIconError';
        const update = value => {
            candidate = value; message.textContent = ''; render(previewIcon, value, { automatic: options.automatic });
            panels[3]?.querySelectorAll('.quicklinkIconSwatches button').forEach(swatch => {
                render(swatch.children[0], `mynt-text:${text.value}:${swatch.dataset.color}`);
            });
        };
        function activate(kind) {
            active = kind;
            kinds.forEach((value, i) => { const selected = kind === value; panels[i].hidden = !selected; tabButtons[i].setAttribute('aria-selected', String(selected)); tabButtons[i].tabIndex = selected ? 0 : -1; });
            update(readValue());
        }
        kinds.forEach((kind, i) => {
            const tab = button(doc, t('quicklinkTab_' + kind), () => activate(kind)); tab.id = 'quicklinkIconTab-' + kind; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', 'quicklinkIconPanel-' + kind);
            tab.addEventListener('keydown', event => {
                let index = i;
                if (event.key === 'ArrowRight') index = (i + 1) % kinds.length;
                else if (event.key === 'ArrowLeft') index = (i + kinds.length - 1) % kinds.length;
                else if (event.key === 'Home') index = 0;
                else if (event.key === 'End') index = kinds.length - 1;
                else return;
                event.preventDefault(); tabButtons[index].click(); tabButtons[index].focus();
            });
            const panel = doc.createElement('div'); panel.id = 'quicklinkIconPanel-' + kind; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', tab.id); panel.className = 'quicklinkIconPanel';
            tabs.appendChild(tab); panels.push(panel); tabButtons.push(tab);
        });
        panels[0].textContent = t('quicklinkAutomaticHint');
        let selectedGlyph = parse(candidate).name || 'book';
        const grid = doc.createElement('div'); grid.className = 'quicklinkIconGrid';
        for (const name of Object.keys(glyphs)) {
            const pick = button(doc, '', () => { selectedGlyph = name; update('mynt-icon:' + name); grid.querySelectorAll('button').forEach(btn => btn.setAttribute('aria-pressed', String(btn === pick))); });
            pick.setAttribute('aria-label', t('quicklinkGlyph_' + name)); pick.setAttribute('title', t('quicklinkGlyph_' + name)); pick.setAttribute('aria-pressed', String(name === selectedGlyph)); render(pick, 'mynt-icon:' + name); grid.appendChild(pick);
        }
        panels[1].appendChild(grid);
        function field(panel, key, type = 'text') {
            const label = doc.createElement('label'); label.textContent = t(key); const input = doc.createElement('input'); input.type = type; label.appendChild(input); panel.appendChild(label); input.addEventListener('input', () => update(readValue())); return input;
        }
        const parsed = parse(candidate);
        const emoji = field(panels[2], 'quicklinkEmoji'); emoji.value = parsed.type === 'emoji' ? parsed.text : '😀';
        const text = field(panels[3], 'quicklinkText'); text.value = parsed.type === 'text' ? parsed.text : (graphemes(options.label || '').slice(0, 2).join('') || 'A');
        const color = field(panels[3], 'quicklinkColor', 'color'); color.value = parsed.color || '#bbd6fd';
        const swatches = doc.createElement('div'); swatches.className = 'quicklinkIconSwatches';
        for (const theme of ['blue', 'red', 'yellow', 'green', 'cyan', 'pink', 'orange', 'purple']) {
            const fallback = { blue: '#bbd6fd', red: '#fdbdbd', yellow: '#ffed80', green: '#c7e4c7', cyan: '#9cefef', pink: '#f9c8d6', orange: '#ffd8b2', purple: '#dac2e8' }[theme];
            const computed = root.getComputedStyle?.(doc.documentElement).getPropertyValue('--bg-color-' + theme).trim();
            const value = /^#[\da-f]{6}$/i.test(computed || '') ? computed : fallback;
            const swatch = button(doc, '', () => { color.value = value; update(readValue()); }); swatch.style.backgroundColor = value; swatch.dataset.color = value;
            const sample = doc.createElement('span'); sample.className = 'quicklinkSwatchPreview'; swatch.appendChild(sample);
            swatch.setAttribute('aria-label', t('quicklinkColor') + ' ' + value); swatch.setAttribute('title', value); swatches.appendChild(swatch);
        }
        panels[3].appendChild(swatches);
        const custom = field(panels[4], 'quicklinkCustom'); custom.value = parsed.type === 'custom' ? parsed.value : '';
        const file = field(panels[4], 'quicklinkUpload', 'file'); file.accept = 'image/png,image/jpeg,image/gif,image/webp,image/avif,image/bmp,image/x-icon,image/vnd.microsoft.icon,image/svg+xml';
        file.addEventListener('change', async () => {
            const chosen = file.files?.[0]; if (!chosen) return;
            if (chosen.size > 100 * 1024 || !/^image\/(png|jpeg|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon|svg\+xml)$/i.test(chosen.type)) { message.textContent = t('quicklinkInvalid'); return; }
            const reader = new FileReader();
            reader.addEventListener('load', () => { const clean = process(reader.result); if (clean.error) { message.textContent = t('quicklinkInvalid'); return; } custom.value = clean.value; update(readValue()); });
            reader.addEventListener('error', () => { message.textContent = t('quicklinkInvalid'); });
            if (chosen.type === 'image/svg+xml') reader.readAsText(chosen); else reader.readAsDataURL(chosen);
        });
        function readValue() {
            return active === 'auto' ? '' : active === 'icon' ? 'mynt-icon:' + selectedGlyph : active === 'emoji' ? 'mynt-emoji:' + emoji.value : active === 'text' ? `mynt-text:${text.value}:${color.value}` : custom.value;
        }
        const actions = doc.createElement('div'); actions.className = 'quicklinkIconActions';
        actions.append(button(doc, t('quicklinkCancel'), () => dialog.close()), button(doc, t('quicklinkApply'), () => {
            const result = process(readValue());
            if (result.error) { message.textContent = t('quicklinkInvalid'); return; }
            if (options.onSelect(result.value) !== false) dialog.close();
        }));
        dialog.append(title, preview, tabs, ...panels, message, actions); doc.body.appendChild(dialog);
        dialog.addEventListener('close', () => { dialog.remove(); if (returnFocus?.isConnected) returnFocus.focus(); });
        activate(active); dialog.showModal(); tabButtons[kinds.indexOf(active)].focus(); return dialog;
    }
    const api = Object.freeze({ glyphs, graphemes, parse, process, render, contrast, normalizeWebsiteUrl, customOverrides, isValidCustomIconUrl, sanitizeSvg, sanitizeSvgDataUrl, websiteIcon, chooseButton, open, t });
    root.MyntQuicklinkIcons = api;
    root.document?.addEventListener('mynt:language-changed', () => {
        root.document.querySelectorAll('.quicklinkChooseIcon').forEach(node => { node.refreshIcon(); });
    });
    if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

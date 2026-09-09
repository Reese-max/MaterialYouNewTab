/* MYNT / Figma exam workspace. Reuses existing widgets, never clones their state. GPL-3.0. */
(function () {
    'use strict';
    const C = window.MyntExamCore, dictionaries = window.MyntExamCopy;
    if (!C || !dictionaries || document.getElementById('examShell')) return;
    const $ = id => document.getElementById(id);
    const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
    let { settings, error: initialError } = C.parse(read(C.KEY));
    const copy = () => dictionaries[read('selectedLanguage')] || dictionaries.en;
    const t = (key, values = {}) => {
        const localized = copy()[key] ?? dictionaries.en?.[key] ?? key;
        return Object.entries(values).reduce((s, [k, v]) => s.replaceAll(`{${k}}`, String(v)), localized);
    };
    const el = (tag, className, text) => {
        const n = document.createElement(tag);
        if (className) n.className = className;
        if (text !== undefined) n.textContent = text;
        return n;
    };
    const button = (label, action, className = 'exam-button') => {
        const n = el('button', className, label); n.type = 'button';
        n.addEventListener('click', event => { event.stopPropagation(); action(event); });
        return n;
    };
    function icon(name) {
        const n = el('span', `exam-icon exam-icon-${name}`); n.setAttribute('aria-hidden', 'true'); return n;
    }
    function trigger(id) { $(id)?.click(); }
    function tool(label, asset, sourceId) {
        const b = button('', () => trigger(sourceId), 'exam-icon-button');
        b.title = label; b.setAttribute('aria-label', label); b.append(icon(asset));
        const source = $(sourceId);
        if (source) {
            const controls = source.getAttribute('aria-controls');
            if (controls) b.setAttribute('aria-controls', controls);
            const syncDisclosure = () => b.setAttribute('aria-expanded', source.getAttribute('aria-expanded') || 'false');
            syncDisclosure();
            new MutationObserver(syncDisclosure).observe(source, { attributes: true, attributeFilter: ['aria-expanded'] });
        }
        return b;
    }
    const shell = el('div', 'exam-shell'); shell.id = 'examShell'; shell.hidden = true;
    const decor = el('div', 'exam-petals'); decor.setAttribute('aria-hidden', 'true'); shell.append(decor);
    const header = el('header', 'exam-header');
    const brand = el('div', 'exam-brand'); brand.append(el('span', 'exam-mark', 'm'), el('strong', '', 'MYNT'));
    const nav = el('nav', 'exam-nav'); nav.setAttribute('aria-label', t('study'));
    nav.append(button(t('daily'), () => setLayout(false)), button(t('study'), () => setLayout(true), 'exam-button is-active'));
    nav.children[1].setAttribute('aria-current', 'page');
    for (const id of ['work', 'relax']) nav.append(button(t(id), () => {
        const target = document.querySelector(`.workspaceApplyBtn[data-workspace="${id}"]`);
        if (!target) { trigger('openControlCenterBtn'); return; }
        if (setLayout(false)) target.click();
    }));
    const toolbar = el('div', 'exam-toolbar');
    toolbar.append(tool(t('bookmarks'), 'book', 'bookmarkButton'),
        tool(t('apps'), 'grid', 'googleAppsCont'),
        tool(t('appearance'), 'settings', 'menuButton'));
    header.append(brand, nav, toolbar); shell.append(header);
    const grid = el('main', 'exam-grid');
    const main = el('section', 'exam-main'); main.setAttribute('aria-label', t('study'));
    const date = el('p', 'exam-date');
    const clock = el('time', 'exam-clock');
    const greeting = el('div', 'exam-greeting');
    const searchSlot = el('div', 'exam-search-slot');
    const aiSlot = el('div', 'exam-ai-slot');
    const shortcutsSlot = el('div', 'exam-shortcuts-slot');
    main.append(date, clock, greeting, searchSlot, aiSlot, shortcutsSlot);
    const card = el('section', 'exam-card'); card.id = 'policeExamCountdownCard';
    const eyebrow = el('p', 'exam-eyebrow', t('milestone'));
    const title = el('h2', 'exam-title'); title.id = 'examCardTitle'; card.setAttribute('aria-labelledby', title.id);
    const subtitle = el('p', 'exam-muted', t('subtitle'));
    const numbers = el('div', 'exam-numbers');
    const number = el('strong', 'exam-number'); const unit = el('span', 'exam-unit'); numbers.append(number, unit);
    const examDates = el('p', 'exam-muted');
    const registration = el('div', 'exam-registration');
    const regRow = el('div', 'exam-registration-row');
    const regLabel = el('span', '', t('registrationIn')); const regNumber = el('strong'); const regUnit = el('span');
    regRow.append(regLabel, regNumber, regUnit);
    const regDates = el('p', 'exam-muted'); const regHint = el('p', 'exam-muted');
    registration.append(regRow, regDates, regHint);
    const phase = el('div', 'exam-phase'); phase.title = t('phaseNote');
    const phaseRow = el('div', 'exam-phase-row'); const phaseLabel = el('strong'); const phaseUntil = el('span');
    phaseRow.append(phaseLabel, phaseUntil);
    const rail = el('div', 'exam-phase-rail'); rail.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 4; i++) rail.append(el('span'));
    const phaseCaption = el('p', '', t('phaseRail')); phase.append(phaseRow, rail, phaseCaption);
    const settingsButton = button(t('openSettings'), () => openSettings(), 'exam-button exam-tonal');
    settingsButton.id = 'examOpenSettings'; settingsButton.setAttribute('aria-haspopup', 'dialog');
    const disclaimer = el('p', 'exam-disclaimer', t('disclaimer'));
    card.append(eyebrow, title, subtitle, numbers, examDates, registration, phase, settingsButton, disclaimer);
    const aside = el('aside', 'exam-aside'); aside.append(card);
    const hiddenCardButton = button(t('hidden') + ' · ' + t('openSettings'), () => openSettings()); hiddenCardButton.hidden = true;
    aside.append(hiddenCardButton); grid.append(main, aside); shell.append(grid);
    const footer = el('footer', 'exam-footer');
    const widgetDock = el('div', 'exam-widget-dock');
    const localLabel = el('p', 'exam-muted', t('local'));
    const focus = button('', () => {
        const checkbox = $('pomodoroCheckbox');
        if (checkbox && !checkbox.checked) { checkbox.checked = true; checkbox.dispatchEvent(new Event('change', { bubbles: true })); }
        trigger('pomodoroCont');
    }, 'exam-button exam-primary exam-focus');
    focus.title = t('focusHelp');
    const focusTime = el('span', 'exam-focus-time'); focus.append(focusTime, el('span', '', t('focus')));
    const footerActions = el('div', 'exam-footer-actions');
    footerActions.append(button(t('tools'), () => trigger('openControlCenterBtn')), button(t('wallpaper'), () => openSettings()),
        button(t('appearance'), () => trigger('menuButton')));
    footer.append(localLabel, widgetDock, focus, footerActions); shell.append(footer);
    const status = el('p', 'exam-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); shell.append(status);
    const returnButton = button(t('returnStudy'), () => setLayout(true), 'exam-button exam-return'); returnButton.id = 'examReturnButton';
    const dialog = el('dialog', 'exam-settings'); dialog.id = 'examSettingsDialog'; dialog.setAttribute('aria-labelledby', 'examSettingsTitle');
    settingsButton.setAttribute('aria-controls', dialog.id);
    const form = el('form', 'exam-form'); form.noValidate = true;
    const formHeader = el('div', 'exam-form-header'); const formTitle = el('h2', '', t('settings')); formTitle.id = 'examSettingsTitle';
    const closeButton = button('×', () => dialog.close(), 'exam-icon-button'); closeButton.setAttribute('aria-label', t('close'));
    formHeader.append(formTitle, closeButton); form.append(formHeader, el('p', 'exam-muted', t('intro')));
    const controls = {};
    function toggle(key, help) {
        const label = el('label', 'exam-toggle'); const text = el('span', 'exam-toggle-label');
        text.append(el('strong', '', t(key)), el('small', '', t(help)));
        const input = el('input'); input.type = 'checkbox'; input.name = key; input.id = 'examField-' + key;
        const track = el('span', 'exam-switch'); track.setAttribute('aria-hidden', 'true');
        label.append(text, input, track); controls[key] = input; return label;
    }
    function field(key, type, labelKey = key) {
        const label = el('label', 'exam-field'); label.append(el('span', '', t(labelKey)));
        const input = el('input'); input.type = type; input.name = key; input.id = 'examField-' + key; input.required = true;
        if (type === 'date') { input.min = '2000-01-01'; input.max = '2100-12-31'; }
        else input.maxLength = 80;
        label.append(input); controls[key] = input; return label;
    }
    form.append(toggle('enabled', 'enabledHelp'), field('title', 'text', 'titleLabel'));
    for (const pair of [['examStart', 'examEnd'], ['registrationStart', 'registrationEnd']]) {
        const row = el('div', 'exam-fields-row'); pair.forEach(key => row.append(field(key, 'date'))); form.append(row);
    }
    const timezone = el('div', 'exam-timezone'); timezone.append(el('strong', '', t('timezone')), el('p', '', t('timezoneHelp')));
    form.append(timezone, toggle('registration', 'registrationHelp'), toggle('phase', 'phaseHelp'),
        toggle('compact', 'compactHelp'), toggle('useWallpaper', 'wallpaperHelp'), el('p', 'exam-muted', t('presetNote')));
    const formError = el('p', 'exam-error'); formError.id = 'examFormError'; formError.setAttribute('role', 'alert'); formError.hidden = true;
    form.append(formError, el('p', 'exam-muted exam-storage-note', t('localSettings')));
    const actions = el('div', 'exam-form-actions');
    const cancel = button(t('cancel'), () => dialog.close(), 'exam-button exam-tonal');
    const save = el('button', 'exam-button exam-primary', t('save')); save.type = 'submit'; save.id = 'examSaveSettings';
    actions.append(cancel, save); form.append(actions); dialog.append(form);
    document.body.append(shell, returnButton, dialog);
    let openedRaw = null, previousFocus = null, timer = null, active = false, videoPausedByExam = false;
    // Bookmarks preserve both original node identities and event handlers on every mode switch.
    const moved = [];
    const originalGreetingPlaceholder = $('userText')?.dataset.placeholder;
    const originalSearchPlaceholder = $('searchQ')?.placeholder;
    function move(node, target) {
        if (!node) return;
        const marker = document.createComment('MYNT exam layout restore point'); node.before(marker);
        moved.push({ node, marker }); target.append(node);
    }
    function restore() {
        moved.reverse().forEach(({ node, marker }) => { marker.replaceWith(node); }); moved.length = 0;
    }
    function syncExamVideo() {
        const video = $('videoBg');
        if (!video) return;
        const shouldPause = active && !settings.useWallpaper;
        if (shouldPause) {
            if (!video.paused) { videoPausedByExam = true; video.pause(); }
            return;
        }
        if (!videoPausedByExam) return;
        if (document.body.dataset.workspaceBackground !== 'video') { videoPausedByExam = false; return; }
        if (document.hidden) return;
        videoPausedByExam = false;
        const playing = video.play();
        if (playing?.catch) playing.catch(() => {});
    }
    function applyLayout() {
        if (settings.layout !== active) {
            if (settings.layout) {
                move($('userText'), greeting); move(document.querySelector('.centerDiv'), searchSlot);
                move($('aiToolsCont'), aiSlot); move($('shortcuts-section'), shortcutsSlot);
                for (const id of ['todoListCont', 'scratchpadCont', 'pomodoroCont']) move($(id), widgetDock);
                if ($('userText') && !read('userText')) {
                    $('userText').dataset.placeholder = t('greeting'); $('userText').textContent = t('greeting');
                }
                if ($('searchQ')) $('searchQ').placeholder = t('searchPlaceholder');
            } else {
                restore();
                if ($('userText')) {
                    $('userText').dataset.placeholder = originalGreetingPlaceholder || '';
                    if (!read('userText')) $('userText').textContent = originalGreetingPlaceholder || '';
                }
                if ($('searchQ')) $('searchQ').placeholder = originalSearchPlaceholder || '';
            }
            active = settings.layout;
        }
        document.body.toggleAttribute('data-exam-layout', active);
        document.body.toggleAttribute('data-exam-shortcuts', active && read('shortcutsCheckboxState') !== 'unchecked');
        document.body.toggleAttribute('data-exam-wallpaper', active && settings.useWallpaper);
        shell.hidden = !active; returnButton.hidden = active;
        card.hidden = !settings.enabled; hiddenCardButton.hidden = settings.enabled;
        card.classList.toggle('is-compact', settings.compact);
        syncExamVideo();
    }
    $('videoBg')?.addEventListener('play', () => {
        const video = $('videoBg');
        if (video && active && !settings.useWallpaper && !video.paused) {
            videoPausedByExam = true; video.pause();
        }
    });
    function write(next) {
        const issue = C.validate(next);
        if (issue) return issue;
        try { localStorage.setItem(C.KEY, JSON.stringify(next)); } catch { return 'storageError'; }
        settings = next; applyLayout(); render(); return '';
    }
    function setLayout(value) {
        const latest = C.parse(read(C.KEY)).settings;
        const issue = write({ ...latest, layout: value });
        if (issue) { status.textContent = t(issue); return false; }
        if (value) $('searchQ')?.focus(); else returnButton.focus();
        return true;
    }
    function openSettings() {
        if (dialog.open) return;
        openedRaw = read(C.KEY); settings = C.parse(openedRaw).settings;
        for (const [key, input] of Object.entries(controls)) {
            if (input.type === 'checkbox') input.checked = settings[key]; else input.value = settings[key];
            input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby');
        }
        formError.hidden = true; formError.textContent = ''; previousFocus = document.activeElement;
        dialog.showModal(); closeButton.focus();
    }
    dialog.addEventListener('close', () => {
        if (previousFocus instanceof HTMLElement && previousFocus.isConnected && previousFocus.getClientRects().length) previousFocus.focus();
        else (active ? hiddenCardButton : returnButton).focus();
    });
    dialog.addEventListener('click', event => {
        if (event.target !== dialog) return;
        const r = dialog.getBoundingClientRect();
        if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
    });
    form.addEventListener('submit', event => {
        event.preventDefault();
        let issue = read(C.KEY) !== openedRaw ? 'stale' : '';
        const next = { ...settings };
        for (const [key, input] of Object.entries(controls)) next[key] = input.type === 'checkbox' ? input.checked : input.value.trim();
        issue ||= C.validate(next);
        if (!issue) issue = write(next);
        if (issue) {
            formError.textContent = t(issue); formError.hidden = false;
            const focusKey = issue === 'invalidTitle' ? 'title' : issue === 'invalidDate'
                ? Object.keys(controls).find(k => controls[k].type === 'date' && !Number.isFinite(C.day(next[k]))) : 'examEnd';
            if (issue.startsWith('invalid') && controls[focusKey]) {
                controls[focusKey].setAttribute('aria-invalid', 'true'); controls[focusKey].setAttribute('aria-describedby', formError.id);
                controls[focusKey].focus();
            }
            formError.scrollIntoView({ block: 'nearest' }); return;
        }
        status.textContent = t('saved'); dialog.close();
    });
    form.addEventListener('input', event => event.target.removeAttribute('aria-invalid'));
    function render() {
        const now = Date.now(), s = C.state(settings, now);
        const locale = read('selectedLanguage') === 'zh_TW' ? 'zh-TW' : 'en';
        const current = new Date(now);
        date.textContent = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(current);
        clock.textContent = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: read('hourformat') === 'true' }).format(current);
        clock.dateTime = current.toISOString(); clock.hidden = read('hideClockVisible') === 'true';
        title.textContent = settings.title === C.DEFAULTS.title ? t('examTitle') : settings.title;
        subtitle.hidden = settings.title !== C.DEFAULTS.title || settings.examStart !== C.DEFAULTS.examStart;
        number.textContent = s.status === 'finished' ? t('finished') : s.status === 'exam' ? t('dayN', { n: s.examDay }) : String(s.remaining);
        unit.textContent = s.status === 'preparing' ? t('days') : '';
        numbers.classList.toggle('is-status', s.status !== 'preparing');
        const pretty = value => value.replaceAll('-', '.');
        examDates.textContent = `${t(s.status === 'exam' ? 'examStatus' : s.status === 'finished' ? 'finishedStatus' : 'examDate')} · ${pretty(settings.examStart)} — ${pretty(settings.examEnd)}`;
        registration.hidden = !settings.registration || settings.compact;
        registration.dataset.state = s.registration;
        regLabel.textContent = t(s.registration === 'upcoming' ? 'registrationIn' : s.registration === 'open' ? 'registrationOpen' : 'registrationClosed');
        regNumber.textContent = s.registration === 'upcoming' ? String(s.registrationDays) : '';
        regUnit.textContent = s.registration === 'upcoming' ? t('days') : '';
        regDates.textContent = `${t('registrationDates')}  ${pretty(settings.registrationStart)} — ${pretty(settings.registrationEnd)}`;
        regHint.textContent = t('reminder'); regHint.hidden = s.registration !== 'open';
        phase.hidden = !settings.phase || settings.compact || s.status !== 'preparing';
        phaseLabel.textContent = t(s.phase); phaseUntil.textContent = t(s.phase + 'Until');
        const phaseIndex = ['foundation', 'allSubjects', 'writing', 'final'].indexOf(s.phase);
        [...rail.children].forEach((part, i) => part.classList.toggle('current', i === phaseIndex));
        rail.hidden = phaseIndex < 0; phaseCaption.textContent = t(phaseIndex < 0 ? 'phaseNote' : 'phaseRail');
        const min = Math.max(1, Math.min(120, Number(read('pomodoroWorkMinutes')) || 25));
        focusTime.textContent = `${String(min).padStart(2, '0')}:00`;
        const accessible = `${title.textContent} · ${number.textContent} ${unit.textContent}`;
        if (card.getAttribute('aria-label') !== accessible) card.setAttribute('aria-label', accessible);
        shell.dataset.registration = s.registration;
    }
    function schedule() {
        clearTimeout(timer); timer = null;
        if (document.hidden) return;
        render(); timer = setTimeout(schedule, 60000 - Date.now() % 60000 + 25);
    }
    window.addEventListener('storage', event => {
        if (event.key === C.KEY || event.key === null) {
            const value = C.parse(read(C.KEY)); settings = value.settings;
            if (value.error) status.textContent = t(value.error);
            applyLayout(); schedule();
        }
    });
    document.addEventListener('visibilitychange', () => { applyLayout(); schedule(); });
    window.addEventListener('pageshow', schedule); window.addEventListener('focus', schedule);
    window.addEventListener('pagehide', () => clearTimeout(timer));
    document.addEventListener('change', () => { applyLayout(); render(); });
    // Built-in shortcut SVGs historically repeated a purely stylistic ID.
    // Convert only that known preset selector to a class, including later re-renders.
    const shortcutRoot = $('shortcutsContainer');
    function normalizePresetTintIds() {
        shortcutRoot?.querySelectorAll('.shortcutLogoContainer [id="darkLightTint"]').forEach(node => {
            node.classList.add('mynt-preset-dark-tint'); node.removeAttribute('id');
        });
    }
    normalizePresetTintIds();
    if (shortcutRoot) new MutationObserver(normalizePresetTintIds).observe(shortcutRoot, { childList: true, subtree: true });
    const styleReady = $('examDashboardStyles');
    function ready() { applyLayout(); schedule(); if (initialError) status.textContent = t(initialError); }
    if (styleReady?.sheet) ready(); else styleReady?.addEventListener('load', ready, { once: true });
})();

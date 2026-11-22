// Static guard for dialog surfaces on dark themes; the Chromium smoke measures dark mode as rendered.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.join(__dirname, '..'), read = file => fs.readFileSync(path.join(root, file), 'utf8');
const dark = read('styles/award-fix-dark-surfaces.css'), bundle = read('styles/award.css'), css = read('style.css');

// Dark mode: the control center content follows the dark dialog, not the light theme variables.
const centreAt = dark.indexOf('):not(.black-theme, .myntHighContrast) #controlCenterDialog {');
assert.notEqual(centreAt, -1, 'Ordinary dark surfaces target only the top-layer dialog');
const centre = dark.slice(centreAt);
assert.ok(centre.length > 0, 'Dark-mode control center block exists and leaves the black theme and high contrast alone');
const centreBlock = centre.slice(0, centre.indexOf('\n}\n'));
for (const part of ['.controlSection', '.workspacePresetCard', '.workspaceEditBtn', '.workspaceLaunchBtn', '.workspaceWidgetChoices',
    '.workspaceEditorActions button', '.permissionControls button', '.serviceRow', '.controlSettingRow select', '.workspaceEditorField textarea'])
    assert.ok(centreBlock.includes(part), `Dark-mode control center covers ${part}`);
assert.match(centreBlock, /& \.controlSection \{\s*background: #232833;/);
assert(!centreBlock.includes('#menuCont'), 'Inverted settings keep light surfaces in ordinary dark mode');
assert(!dark.includes('):not(.black-theme, .myntHighContrast) :is(#controlCenterDialog, #menuCont)'), 'Ordinary dark surfaces never target inverted settings');

// Status words and the workspace Delete use dark-surface colours in dark mode and the black theme, not in high contrast.
const statusSelector = '):not(.myntHighContrast) #controlCenterDialog,\nhtml.black-theme:not(.myntHighContrast) #menuCont {';
const statusAt = dark.indexOf(statusSelector);
assert.notEqual(statusAt, -1, 'Dark status colours target dialogs and only non-inverted black-theme settings');
const status = dark.slice(statusAt);
const statusBlock = status.slice(0, status.indexOf('\n}\n'));
assert.ok(dark.slice(dark.lastIndexOf(':is(', statusAt), statusAt).includes('html.black-theme'), 'Status colours also apply to the black theme');
assert(!dark.includes('):not(.myntHighContrast) :is(#controlCenterDialog, #menuCont)'), 'Dark status colours never target ordinary inverted settings');
assert.match(statusBlock, /em\.granted, \.serviceState\.ok\) \{\s*color: #81c995;/);
assert.match(statusBlock, /em\.denied, \.serviceState\.error, \.serviceState\.offline\) \{\s*color: #f28b82;/);
assert.match(statusBlock, /\.workspaceEditorActions \.workspaceDangerBtn \{\s*background: transparent;\s*color: #f28b82;/, 'Workspace Delete keeps its danger colour on dark surfaces');

// Dark-mode dialog headers, and the bundle that ships these rules.
assert.match(dark, /\):not\(\.black-theme\) dialog\.myntDialog > \.controlCenterHeader \{\s*background: #232833;/);
for (const marker of ['#81c995', '#f28b82', 'background: #232833;']) assert.ok(bundle.includes(marker), `Award bundle carries ${marker}`);

// Black theme + high contrast: black-theme surfaces must not leave white fields on Canvas or black text on dark rows.
assert.match(css, /html\.myntHighContrast\.black-theme :is\(\.controlSettingRow select, \.workspaceEditorField input, \.workspaceEditorField select, \.workspaceEditorField textarea, \.serviceRow\) \{\s*background: Canvas;\s*color: CanvasText;/);
assert.match(css, /html\.myntHighContrast\.black-theme :is\(\.controlSectionHeading a, \.sectionStatus\) \{\s*color: LinkText;/);
// Black theme: the workspace URL list matches the other editor fields.
assert.match(css, /\.black-theme \.workspaceEditorField select,\n\.black-theme \.workspaceEditorField textarea \{\s*background: rgba\(255, 255, 255, 0\.08\);/);

// Light themes: one accent ink for text on tints and fills under white text (AA in every colour theme).
assert.match(css, /--mynt-accent-ink: color-mix\(in srgb, var\(--darkerColor-blue\) 70%, #000\);/, 'Shared accent ink token');
const polish = read('styles/award-fix-dialog-polish.css'), home = read('styles/award-fix-home-polish.css');
const lightDialogs = polish.slice(polish.indexOf('html:not(.black-theme, .myntHighContrast):not(:has(.menuBar'));
for (const part of ['.controlCenterEyebrow', '.workspaceLaunchBtn', '#aiToolsForm .ai-tool-reorder button:not(:disabled)', '.floating-label-field label'])
    assert.ok(lightDialogs.includes(part), `Light dialogs use the accent ink for ${part}`);
// Primary vs secondary: Save is filled, Reset/Cancel are outlined, in light, dark and black.
assert.match(lightDialogs, /:is\(#aiToolsSettingsModal \.ai-save-button, #saveBookmarkChanges\) \{\s*background: var\(--mynt-accent-ink\);\s*color: #ffffff;/);
assert.match(lightDialogs, /:is\(#aiToolsSettingsModal \.ai-reset-button, #cancelBookmarkEdit\) \{\s*background: transparent;/);
const darkRest = dark.slice(dark.indexOf('7. 深色模式其餘對話框'));
for (const part of ['#aiToolsSettingsModal, #editBookmarkModal', '.commandPaletteItem', '.shortcutItem', '.studyQuotesDialog :is(.sqSearch, .sqFilter, .sqInput)', '#cancelBookmarkEdit'])
    assert.ok(darkRest.includes(part), `Dark mode covers ${part}`);
assert.match(darkRest, /html\.black-theme:not\(\.myntHighContrast\) \{\s*& :is\(#aiToolsSettingsModal \.ai-save-button, #saveBookmarkChanges\) \{\s*background: #e3e3e3;/, 'Black theme separates primary and secondary buttons');
// Home: weather fills, the droplet (pseudo-elements cannot sit inside :is()) and the toast title.
assert.match(home, /& :is\(\.tilesContainer \.location, \.humidityBar \.slider, \.opacityBar \.opacitySlider\) \{\s*background-color: var\(--mynt-accent-ink\);/);
assert.match(home, /& \.humidityBar::after \{\s*background-color: var\(--mynt-accent-ink\);/);
assert.match(home, /& \.toast-title \{\s*color: var\(--mynt-accent-ink\);/);
assert.doesNotMatch(home + polish + dark, /:is\([^)]*::(after|before)/, 'Pseudo-elements never sit inside :is()');
// Black theme home toast: a dark glass surface with light text instead of the grey upstream glass (10:1 and 13.7:1).
const toastAt = home.indexOf('html.black-theme:not(.myntHighContrast) #chromeFooterToast {');
assert.notEqual(toastAt, -1, 'Black theme toast block exists and leaves high contrast alone');
const toast = home.slice(toastAt);
assert.match(toast, /& \.liquidGlass-tint \{\s*background: rgba\(30, 29, 28, 0\.88\);/);
assert.match(toast, /& \.toast-title \{\s*color: #a8c7fa;\s*text-shadow: none;/);
assert.match(toast, /& \.toast-message \{\s*color: #e3e3e3;\s*text-shadow: none;/);
assert.match(toast, /& :is\(\.toast-bar-vertical, \.toast-timer-bar\) \{\s*background: #a8c7fa;/, 'The countdown bar is visible on the dark toast');
// Layout: the launch button aligns with Edit; reorder arrows fill their 44px targets.
assert.match(polish, /#controlCenterDialog \.workspacePresetCard \.workspaceLaunchBtn \{\s*position: absolute;\s*inset-inline-end: 12px;\s*bottom: 12px;/);
assert.match(polish, /#aiToolsForm \.ai-tool-reorder button \{\s*font-size: 1\.15rem;/);
assert.match(polish, /:is\(#controlCenterDialog, #menuCont\) \.workspaceHeadingActions \.sectionStatus \{\s*white-space: nowrap;/, 'The applied-mode status never breaks one character per line');
for (const marker of ['--mynt-accent-ink', '.commandPaletteItem', '#e3e3e3']) assert.ok(bundle.includes(marker), `Award bundle carries ${marker}`);
console.log('DIALOG_CONTRAST_OK: dark-mode control center and dialogs, accent ink on light surfaces, primary/secondary buttons, home accent fills, status/danger colours, black-theme high contrast fields, card and reorder layout');

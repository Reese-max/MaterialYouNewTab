// Static guard for dialog surfaces on dark themes; the Chromium smoke measures dark mode as rendered.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.join(__dirname, '..'), read = file => fs.readFileSync(path.join(root, file), 'utf8');
const dark = read('styles/award-fix-dark-surfaces.css'), bundle = read('styles/award.css'), css = read('style.css');

// Dark mode: the control center content follows the dark dialog, not the light theme variables.
const centre = dark.slice(dark.indexOf('):not(.black-theme, .myntHighContrast) #controlCenterDialog {'));
assert.ok(centre.length > 0, 'Dark-mode control center block exists and leaves the black theme and high contrast alone');
const centreBlock = centre.slice(0, centre.indexOf('\n}\n'));
for (const part of ['.controlSection', '.workspacePresetCard', '.workspaceEditBtn', '.workspaceLaunchBtn', '.workspaceWidgetChoices',
    '.workspaceEditorActions button', '.permissionControls button', '.serviceRow', '.controlSettingRow select', '.workspaceEditorField textarea'])
    assert.ok(centreBlock.includes(part), `Dark-mode control center covers ${part}`);
assert.match(centreBlock, /& \.controlSection \{\s*background: #232833;/);

// Status words and the workspace Delete use dark-surface colours in dark mode and the black theme, not in high contrast.
const status = dark.slice(dark.indexOf('):not(.myntHighContrast) #controlCenterDialog {'));
const statusBlock = status.slice(0, status.indexOf('\n}\n'));
assert.ok(dark.slice(dark.lastIndexOf(':is(', dark.indexOf('):not(.myntHighContrast) #controlCenterDialog {')), dark.indexOf('):not(.myntHighContrast) #controlCenterDialog {')).includes('html.black-theme'), 'Status colours also apply to the black theme');
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
console.log('DIALOG_CONTRAST_OK: dark-mode control center surfaces, dark status/danger colours, dark dialog headers, black-theme high contrast fields and editor URL list');

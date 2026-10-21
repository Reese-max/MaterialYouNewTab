# Manual layout profiles

- Use **排版組合** to name or copy a layout. Up to 20 profiles, 40 characters per name.
- Wide (>900 CSS px) and narrow layouts are saved separately. Editing holds the size variant from when editing started. Resizing is not image-based automatic placement.
- **預覽上一個儲存版本** opens the previous save as an editable draft. Cancel keeps the current version; Save and lock accepts it.
- Layout-only export contains profile names and positions, never scratchpad or account settings. Import validates JSON (150 KB maximum) and shows names before adding copies. It does not replace existing profiles.
- **精準位置、大小與對齊** provides X/Y pixels, 50–200% scale, left alignment and horizontal centering. Changes support Undo and Cancel.
- Overlap warnings do not resolve collisions for you. Existing viewport safety bounds remain; stored offsets are not silently rewritten.
- A stale browser tab cannot silently overwrite a newer saved revision. Cancel the draft, then reload saved layouts.

## Validation

All three repository checks and layout-save/manual-editor/adaptive/core checks pass. Added strict import, legacy migration, wide/narrow isolation, previous-version, stale-tab and quota tests.

Actual cloud Chromium HTTP tests passed: profile creation, precision X/Y save/reload, previous-version preview/cancel, export/import adding copies, two-tab stale-save refusal, narrow save/reload (547 CSS px, no horizontal overflow), 125% zoom (944 CSS px, no horizontal overflow), overlap warning, center alignment and scratchpad persistence.

Limitations: not tested as an installed Chrome/Firefox extension or on a physical touch device. Browser preview tests do not establish extension API compatibility.

## Stability additions

- Arrow keys now move 1px; Shift + arrow moves 10px. Alt-drag temporarily bypasses snapping. Existing Undo, Cancel, precision controls and save-and-lock remain.
- Unsaved edits request the browser's standard leave warning. Browsers may suppress it. A separate, tab-local sessionStorage draft survives reload; users explicitly restore or discard it. The saved profile, wide/narrow variant and revision must all match. A newer saved revision always wins. This does not guarantee recovery after closing a tab or browser.
- The first editor visit includes a dismissible guide, which remains available as a collapsed disclosure.
- Profiles can be reordered. Delete retains one recoverable profile, including wide/narrow and previous layouts, across reload. Restore that profile before deleting another. The last remaining profile cannot be deleted. Existing rename and duplicate controls remain.
- Decorative and gallery videos pause when hidden and only resume after visibility change if previously playing and current motion/data-saving preferences permit. Background sampling cancels hidden timers and pending results; visible pages keep one low-frequency timer.

Validation for this round: actual browser tests cover 1px/10px nudges, reload draft restoration, Cancel preserving saved positions, dismissed guide persistence, stale-draft refusal after another tab saves, profile reorder/delete/restore across reload, draft save-and-lock cleanup, 547px editor bounds, 125% zoom and scratchpad persistence. Dependency-free tests also cover denied storage, malformed data, quota, profile/size/revision isolation and 20 repeated sampling visibility cycles, plus both video listeners with previously playing and paused simulated media. A visible native leave-warning dialog and background-tab playback state are not independently verified by browser automation. Installed Chrome/Firefox extension and physical-phone tests remain unavailable; no automatic image-based movement was added.

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

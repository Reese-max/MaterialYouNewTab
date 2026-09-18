# MYNT 備考新分頁 / Figma implementation

Original design: https://www.figma.com/design/AW6ZAgKT5oRN1MmMbP5D0M?node-id=3-66

UI v2: https://www.figma.com/design/AW6ZAgKT5oRN1MmMbP5D0M?node-id=16-87

## Scope

This feature branch implements the Figma study homepage as an alternative layout in the existing vanilla HTML/CSS/JavaScript extension, not a separate React app. It retains the classic layout and the real configured shortcuts, search, AI launchers, bookmarks, Google apps, Control Center and Pomodoro. The UI uses live dates rather than static examples in Figma. No merge or release is implied by this document.

## Source map

| Figma | Implementation |
| --- | --- |
| Original `3:66` / `3:68`; v2 `16:87` / `16:213` | Desktop light/dark: `scripts/exam-dashboard.js`, `scripts/exam-dashboard.css` |
| Original `10:15`; v2 `16:411` | Native settings dialog, grouped fields, independent scrolling body and persistent header/actions |
| Original `3:72`; v2 `16:339` | Responsive document flow with workspace navigation and AI tools; no fixed countdown covering search |
| v2 `18:190` | 1366x768 laptop-height spacing refinement |
| `3:74` date states | `scripts/exam-countdown-core.js` with explicit exam day 1/day 2/finished states |
| Original vector assets | `svgs/exam/`, exported directly from Figma; CSS masks use theme colors |

The original page remains intact. The second Figma page, `02｜UI 精修 v2` (`16:86`), records the refinements. Static September 10, 2026 examples are not a live calendar feed. Figma uses illustrative shortcuts, while the extension retains actual user configuration. Native date inputs, browser fonts and user content can differ from the illustration; this is not a pixel-identical replacement of existing widgets.

## UI v2 refinements

- The settings dialog separates a persistent heading and action area from the scrolling body. Three semantic fieldsets group exam information, display preferences and background settings. Short landscape windows use tighter outer padding, not smaller interactive targets.
- Labels remain above inputs so longer translations do not collide with borders. Invalid dates have field-specific messages and `aria-describedby`; reversed registration dates focus registration rather than the unrelated exam-end field. Stale storage and save failures remain global errors. Cancelling still writes nothing.
- The wallpaper action opens the existing appearance section and focuses its upload control. It does not open exam settings, trigger the file picker, choose an image or make a new download request. The separate `useWallpaper` switch retains its existing meaning: use the saved background instead of decorative petals.
- Focus copy says “開啟專注計時” / “Open focus timer”, matching the existing Pomodoro-panel action rather than claiming a timer has started. Visible disclosure controls mirror the original panel controls.
- At widths up to 850px, the same countdown aside moves before shortcuts in DOM order as well as visual order. This avoids a CSS-only rearrangement disagreeing with keyboard reading order. Existing moved widget nodes and restore markers are retained.
- Laptop-height spacing reduces excess decoration above the content. Main controls retain at least 44px target height, and longer exam titles can wrap without shrinking text. Secondary card copy is slightly larger; the implementation retains its existing `#716779` light-mode muted color rather than blindly adopting a lower-contrast illustrative token.
- Hiding the clock also hides its associated date. A video paused by Study will not be resumed while the current reduced-motion/high-contrast or data-saving state still requests a pause.

## Behavior and integration

- The existing `custom-text.js` loads the local countdown core, locale bridge, dashboard script and local CSS in order. There is no new build framework or network dependency.
- Study mode relocates the original DOM nodes with restore markers. Classic mode puts the same nodes back, preserving handlers and local data instead of copying or replacing widgets.
- Study mode is enabled for this feature by default. 日常 / Classic restores the previous layout. 備考首頁 / Study homepage reopens it.
- Configured shortcuts and AI tools are preserved; the sample Figma shortcut list is not written over personal settings.
- The focus button opens the existing Pomodoro panel. It does not create a second timer or falsely imply a session has started.
- Existing theme preferences control light/dark colors. Existing wallpapers remain saved and can be used instead of the abstract petals.
- If Study temporarily hides a video background, it records that it performed the pause and resumes the existing video only when Study stops hiding it and the saved workspace background is still video. An unrelated synchronizer cannot leave the hidden Study video running.
- Packaged Poppins is reused. Chinese text uses locally available Noto Sans TC, PingFang TC or Microsoft JhengHei fallbacks; no font download is added.
- English and Traditional Chinese exam strings are canonical nested entries in `locales/en.js` and `locales/zh_TW.js`. `locales/exam.js` is only a runtime bridge to the existing `translations` catalogs, with per-key English fallback and no duplicate exam copy. V2 section titles reuse existing canonical strings.
- Replacement Study toolbar buttons mirror the original bookmark, Google Apps and settings controls' `aria-controls` and `aria-expanded`.

## Dates and persistence

Preset dates come from the requested configuration: exam June 12–13, 2027; registration March 9–18, 2027. They are editable reminders, not a live official-calendar subscription. Refer to the official announcement for changes or exact registration closing time.

`myntExamDashboard` remains one versioned localStorage record. Names, dates and boolean fields are validated before saving. Invalid stored input shows defaults with a warning without automatically overwriting the original. Unknown fields are ignored. A stale dialog cannot overwrite another tab's changes. Cancelling does not write settings. Existing backup/restore includes this record; personal WeatherAPI keys remain subject to existing exclusions. V2 adds no storage keys or migration.

Countdowns compare calendar dates in Asia/Taipei and refresh on minute boundaries, page focus, visibility return and cross-tab updates. The last registration/exam dates are inclusive reminders. Exam day 2 shows day 2, not “starts today”; after the final day the countdown is finished rather than negative.

The four phases are for the June 12, 2027 preset only. A different exam date shows a custom schedule. Intentional empty locale values such as the custom schedule's absent “until” label remain empty. No percentage purports to measure actual learning completion.

## Validation

```sh
node tools/check-customizations.mjs
node tools/check-release-metadata.mjs
node tools/check-upstream-integration.mjs
node tools/test-exam-countdown.mjs
xvfb-run -a node tools/smoke-chromium.mjs
xvfb-run -a node tools/smoke-exam-dashboard.mjs
xvfb-run -a node tools/smoke-exam-ui-v2.mjs
```

The original smoke suite remains unchanged. The additional v2 suite runs an isolated, real unpacked Chromium extension and checks six viewport sizes, 44px navigation targets, DOM/visual order, persistent dialog actions, long Traditional Chinese titles with enlarged text, field-specific validation, stale/cancel preservation, keyboard Tab/Escape, wallpaper routing, hidden/compact roundtrips and dark mode. Evidence is saved under the existing CI artifact's `v2/` directory. The workflow retains read-only contents permissions and does not self-modify code.

Read the current SHA-bound GitHub Actions results before treating a build as verified. Local managed Chromium policies may prevent extension loading; do not disable such policies to obtain a pass. Automated checks do not substitute for manual Firefox, screen-reader, full keyboard/accessibility or user-profile acceptance.

## Security boundary

No remote executable code, analytics, tokens, new permissions, system notifications or cloud AI endpoints. The Figma module makes no network requests. Existing optional services retain their prior disclosures. User titles are inserted with textContent, not HTML. No self-modifying workflows or staged executable payloads are used.

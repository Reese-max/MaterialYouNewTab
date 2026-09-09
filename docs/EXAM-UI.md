# MYNT 備考新分頁 / Figma implementation

Design: https://www.figma.com/design/AW6ZAgKT5oRN1MmMbP5D0M?node-id=3-66

## Scope

This feature branch implements the Figma study homepage as an alternative layout in the existing vanilla HTML/CSS/JavaScript extension, not a separate React app. It retains the classic layout and the real configured shortcuts, search, AI launchers, bookmarks, Google apps, Control Center and Pomodoro. The UI uses live dates rather than the static 276/181 examples in Figma. No merge or release is implied by this document.

## Source map

| Figma | Implementation |
| --- | --- |
| `3:66` desktop light / `3:68` desktop dark | `scripts/exam-dashboard.js`, `scripts/exam-dashboard.css` |
| `10:15` settings drawer | Native dialog with labelled fields, cancel, validation, persistence and focus return |
| `3:72` narrow screen | Responsive document flow; no fixed countdown overlapping search |
| `3:74` date states | `scripts/exam-countdown-core.js` with explicit exam day 1/day 2/finished states |
| Original vector assets | `svgs/exam/`, exported directly from Figma; CSS masks use theme colors |

## Behavior and integration

- The existing `custom-text.js` loads the three local modules in order and the local CSS. There is no new build framework or network dependency.
- Study mode relocates the original DOM nodes with restore markers. Classic mode puts the same nodes back, preserving handlers and local data instead of copying or replacing widgets.
- Study mode is enabled for the new feature by default. The 日常 / Classic button restores the previous layout. The 備考首頁 / Study homepage chip reopens it.
- Configured shortcuts and AI tools are preserved; the sample Figma shortcut list is not written over personal settings.
- The focus button opens the existing Pomodoro panel. It does not create a second timer or falsely imply a session has started.
- Existing theme preferences control light/dark colors. Existing wallpapers remain saved and can be used instead of the abstract petals.
- The existing packaged Poppins font is reused. Chinese text uses locally available Noto Sans TC, PingFang TC or Microsoft JhengHei fallbacks; no font download is added. Consequently glyph metrics may differ from Figma on machines lacking Noto Sans TC.
- English and Traditional Chinese strings live in `exam-i18n.js`; other locales use English for this feature. Existing locale files are not removed or modified.

## Dates and persistence

The preset dates come from the requested configuration: exam June 12–13, 2027; registration March 9–18, 2027. They are editable reminders, not a live official-calendar subscription. Refer to the official announcement for any change or exact registration closing time.

`myntExamDashboard` is one versioned localStorage record. Names, dates and boolean fields are validated before saving. Invalid stored input shows defaults with a warning without automatically overwriting the original. Unknown fields are ignored. A stale settings dialog cannot overwrite another tab's changes. Cancelling does not write settings. Existing backup/restore includes the record; personal WeatherAPI keys remain subject to the existing exclusions.

Countdowns compare calendar dates in Asia/Taipei and refresh on minute boundaries, page focus, visibility return and cross-tab updates. The last registration/exam dates are inclusive date reminders. Exam day 2 shows day 2, not “starts today”; after the final day the countdown is finished rather than negative.

The four study phases are for the June 12, 2027 preset only. A different exam date shows a custom schedule rather than imposing the old phase dates. No percentage purports to measure actual learning completion.

## Validation

```sh
node tools/test-exam-countdown.mjs
node tools/check-customizations.mjs
node tools/check-release-metadata.mjs
node tools/check-upstream-integration.mjs
xvfb-run -a node tools/smoke-chromium.mjs
xvfb-run -a node tools/smoke-exam-dashboard.mjs
```

The new browser smoke test runs a real unpacked Chromium extension and covers responsive widths, duplicate IDs, modal focus, cancel, invalid dates, compact settings, preserved original nodes, dark preference and reload. CI retains screenshots and a result manifest via a read-only QA workflow. These automated checks do not substitute for manual Firefox, screen-reader or full keyboard/accessibility acceptance.

## Security boundary

No remote executable code, analytics, tokens, new permissions, system notifications or cloud AI endpoints. The Figma module does not make network requests. Existing optional services retain their prior disclosure. User titles are inserted with textContent, not HTML. No self-modifying workflows or staged executable payloads are used.

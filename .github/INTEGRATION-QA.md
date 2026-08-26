# Integration QA and packaging matrix

This document records the permanent validation gates for the fused Reese-max edition.

## Automated source validation

Every pull request to `main` runs:

```bash
node tools/check-customizations.mjs
node tools/check-release-metadata.mjs
node tools/check-upstream-integration.mjs
```

The checks cover JavaScript syntax, local asset references, duplicate HTML IDs, Chrome and Firefox manifest expectations, release metadata, all 32 locale files, duplicate locale keys, Traditional Chinese defaults, English fallback, custom shortcut icons, SVG sanitization, UTF-8 Base64 SVG decoding, Daily Quote, keyboard shortcuts, AI Tools context-menu access, local-storage rollback behavior, and the retained Reese-max productivity features.

## Installable package validation

`Build extension packages` creates two clean archives:

- `MYNT-<version>-chromium.zip`
- `MYNT-<version>-firefox.zip`

Before upload, CI verifies:

- Chromium uses Manifest V3 and includes its background service worker.
- Firefox uses Manifest V2 and includes its Gecko extension ID.
- both manifests match the source version;
- required runtime files are present;
- Git metadata, workflows, development tools, and repository-only documents are excluded;
- both ZIP archives pass an integrity test.

Artifacts are retained for 14 days on pull-request and `main` workflow runs.

## Shortcut icon hardening

The custom-icon path accepts only explicitly supported image MIME types. Raw SVG and SVG data URLs are sanitized, and Base64 SVG payloads are decoded as UTF-8 so non-ASCII text is preserved. Shortcut reordering clears and rewrites shortcut keys transactionally, restores the previous storage snapshot and UI on failure, and never silently deletes an icon when storage is near quota.

## Manual browser verification still required before release

Automated checks cannot replace final interaction testing in ordinary, unmanaged browser profiles. Before publishing a release, manually verify:

1. load the Chromium directory as an unpacked extension and open a new tab;
2. load the Firefox directory as a temporary add-on;
3. add icons from an HTTPS URL, PNG/JPEG/WebP files, raw SVG, percent-encoded SVG data URL, and UTF-8 Base64 SVG;
4. reject unsafe SVG and unsupported HEIC/TIFF uploads;
5. reorder and delete shortcuts while icons remain visible after reload;
6. exercise search, weather, bookmarks, Daily Quote, Today, workspace, scratchpad, Pomodoro, backup, and restore flows;
7. confirm the update page and uninstall URL belong to the Reese-max fork.

The automated test environment used during this integration was governed by a Chromium administrator policy that disabled unpacked extensions, so it could validate package structure and source behavior but not claim a successful real extension-context launch.

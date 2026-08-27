<h1 align="center">
  <img src="https://github.com/user-attachments/assets/48c3a9cb-06fa-4c45-92ec-194cdb7c5661" width="58" alt="MYNT icon">
  <br>
  MYNT: Material You New Tab
</h1>

<p align="center">
  <strong>Reese-max customized edition</strong><br>
  A Traditional Chinese-first, Material You-inspired browser dashboard for search, focus, tasks, notes, bookmarks, weather, workspaces, and local-first AI assistance.
</p>

<p align="center">
  <a href="https://github.com/Reese-max/MaterialYouNewTab"><img src="https://img.shields.io/github/license/Reese-max/MaterialYouNewTab" alt="License"></a>
  <a href="https://github.com/Reese-max/MaterialYouNewTab/commits/main"><img src="https://img.shields.io/github/last-commit/Reese-max/MaterialYouNewTab" alt="Last commit"></a>
  <a href="https://github.com/Reese-max/MaterialYouNewTab"><img src="https://img.shields.io/github/stars/Reese-max/MaterialYouNewTab" alt="Stars"></a>
  <img src="https://img.shields.io/badge/version-3.5.0-blue" alt="Version 3.5.0">
</p>

> [!IMPORTANT]
> This repository is a customized fork of [prem-k-r/MaterialYouNewTab](https://github.com/prem-k-r/MaterialYouNewTab). The Chrome Web Store and Mozilla Add-ons listings belong to the upstream project and **do not include Reese-max-specific customizations unless those changes are later accepted upstream**.

## Overview

MYNT replaces the browser New Tab page with a local-first productivity dashboard. This fork keeps the upstream Material You design while adding a stronger Traditional Chinese-first workflow and additional productivity features.

### Reese-max edition highlights

- **Traditional Chinese first** — `zh-TW` remains the default while all 32 upstream locales are restored; missing custom strings fall back to English.
- **Google search + search bangs** — use shortcuts such as `!yt`, `!gh`, and `!gpt` to jump directly to common services.
- **Scratchpad** — quick notes, smart list continuation, Markdown task toggling, copy, convert-to-task, and `.md` export.
- **Today dashboard** — choose three priorities, track completion progress, and surface the next action.
- **AI Assist** — plan today's Top 3 and organize Scratchpad notes with Chrome built-in AI when available, with a deterministic local fallback and a full Off mode.
- **Workspaces** — create Study, Work, Coding, Relax, or custom modes with preferred widgets, focus duration, background, and launch URLs.
- **Pomodoro + ambient sound** — configurable focus sessions with rain, ocean, white-noise, and campfire audio.
- **Command palette** — press `Ctrl+K` (`⌘K` on macOS) to launch actions quickly.
- **Keyboard help** — press `?` outside text fields to open the shortcut guide; use `Alt+1`–`Alt+9` to launch the first nine shortcuts.
- **Local-first state** — tasks, settings, habits, focus history, workspaces, and scratchpad content are stored in browser storage.

## Core features

- Google Search with optional Google autocomplete suggestions and voice typing
- Material You themes, dark/light/system mode, custom colors, wallpaper, and video background
- Clock and live weather
- Quick shortcuts with uploaded/URL/SVG custom icons and `Alt+1`–`Alt+9` launching
- Configurable AI tool launchers with right-click settings access
- Local-first AI Assist for Today planning and Scratchpad organization; no cloud AI endpoint or API key is included in v3.5.0
- To-Do List and daily habits
- Pomodoro timer, seven-day focus stats, streaks, and task-linked focus history
- Scratchpad and Markdown export
- Today Top 3 planning and progress
- Workspace presets and multi-tab launchers
- Sidebar bookmarks and Google Apps launcher
- Command Palette, keyboard shortcuts, Daily Quote mode, and an in-extension What's New page
- Accessibility controls including reduced motion, contrast, and text scaling
- Bongo Cat widget
- Backup, restore, and local reset controls

## Version

| Target | Manifest | Version |
| --- | --- | ---: |
| Chromium browsers | Manifest V3 (`manifest.json`) | `3.5.0` |
| Firefox / Zen | Manifest V2 (`manifest(firefox).json`) | `3.5.0` |

## Installation

### Recommended: install the Reese-max custom edition

This is the only installation path that guarantees you are running the custom features in this repository.

#### Option A — Clone with Git

```bash
git clone https://github.com/Reese-max/MaterialYouNewTab.git
cd MaterialYouNewTab
```

#### Option B — Download ZIP

Download the current `main` branch:

[Download Reese-max/MaterialYouNewTab ZIP](https://github.com/Reese-max/MaterialYouNewTab/archive/refs/heads/main.zip)

Extract the ZIP before loading the extension.

### Chrome / Edge / Brave / Chromium

1. Download or clone this repository.
2. Open the browser extensions page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Choose the repository folder containing `manifest.json`.
6. Open a new tab and verify that MYNT appears.

> [!NOTE]
> A manually loaded extension is a development build. Your browser may display developer-mode warnings. Keep the folder in place because the browser loads the extension directly from it.

### Opera / Opera GX

Opera may not allow an unpacked extension to replace the native New Tab page in the same way as Chrome-based browsers. You can still load the extension in developer mode and use its extension page as a startup/home page.

After loading the unpacked extension:

1. Open `opera://extensions` and find MYNT.
2. Copy the extension ID.
3. Use the following page as a startup/home page, replacing `<EXTENSION_ID>`:

```text
chrome-extension://<EXTENSION_ID>/index.html
```

### Firefox / Zen — custom edition

The Reese-max custom edition is not published as a signed Mozilla Add-on. Manual loading is therefore intended for development/testing.

1. Download or clone this repository.
2. Make a separate copy of the extension folder for Firefox testing.
3. In that copy, remove `manifest.json`.
4. Rename `manifest(firefox).json` to `manifest.json`.
5. Open `about:debugging#/runtime/this-firefox`.
6. Select **Load Temporary Add-on**.
7. Choose the renamed `manifest.json`.

Firefox temporary add-ons normally need to be loaded again after restarting the browser.

For Zen Browser, if Zen overrides the custom New Tab page, open `about:config`, search for:

```text
zen.urlbar.replace-newtab
```

and set it to `false`.

## AI Assist 3.5.0

AI Assist is intentionally smaller than a chatbot. It is attached to existing productivity flows:

- **Today → AI plan today** reads pending Todo items, the existing Top 3, pinned tasks, today's goal, and recent focus minutes, then proposes up to three priorities, one next action, and a focus duration.
- **Scratchpad → AI organize** returns a short summary, extracted tasks, and organized Markdown. Nothing is changed until you explicitly choose **Add tasks** or **Replace scratchpad**.
- **Provider modes**: `Auto`, `Chrome built-in AI`, `Local smart assist`, and `Off`.
- `Auto` first checks Chrome's built-in Prompt API. If it is unavailable or the model cannot be used, MYNT falls back to deterministic local JavaScript.
- Firefox and browsers without Chrome's built-in model therefore keep a working local fallback.

## Upstream store builds

If you prefer the upstream stable release instead of this customized fork, use the official upstream listings below:

- [Upstream Chrome Web Store build](https://chromewebstore.google.com/detail/mynt-material-you-new-tab/jjpokbgpiljgndebfoljdeihhkpcpfgl)
- [Upstream Mozilla Add-ons build](https://addons.mozilla.org/en-US/firefox/addon/mynt/)
- [Upstream GitHub releases](https://github.com/prem-k-r/MaterialYouNewTab/releases/latest)

> These upstream packages may not contain the Scratchpad, workspace launcher, ambient audio, Today progress, AI Assist, shortcut guide, or other Reese-max customizations present in this repository.

## Permissions and privacy

The Chromium build uses minimal optional permissions:

- `bookmarks` — requested only when browser bookmark integration is enabled
- `favicon` — optional Chromium favicon access
- `https://www.google.com/*` — optional host access for Google search suggestions

MYNT also uses browser storage (`localStorage` and IndexedDB) for interface settings and productivity data. Weather and other optional features may contact their documented third-party services when enabled.

AI Assist v3.5.0 does **not** add a cloud AI endpoint. In `Auto` mode it tries Chrome's browser-managed Prompt API on supported desktop Chrome installations and otherwise uses deterministic local JavaScript. Suggestions are never applied until you explicitly choose an action such as **Apply suggestion**, **Add tasks**, or **Replace scratchpad**. No OpenAI, Gemini, or other provider key is stored by this release.

Personal WeatherAPI keys are intentionally excluded from backup exports and must be re-entered after restoring on another browser profile.

See [privacy-policy.html](./privacy-policy.html) for the in-project disclosure.

## Development and QA

No package installation is required for the repository's core validation scripts.

Run:

```bash
node tools/check-customizations.mjs
node tools/check-release-metadata.mjs
node tools/check-upstream-integration.mjs
node tools/check-ai-assist.mjs
```

The checks validate, among other things:

- JavaScript syntax
- Chrome and Firefox permission expectations
- local asset references
- required custom scripts and UI IDs
- duplicate HTML IDs and CSP-sensitive patterns
- Today / focus / workspace data helpers
- backup rollback behavior
- Google-only autocomplete configuration
- locale key parity
- Traditional Chinese default language and 32-locale fallback wiring
- upstream/custom fused feature invariants
- AI Assist provider modes, local fallback, Chrome Prompt API feature detection, and absence of cloud credentials/endpoints
- referenced background videos

For changes intended for `main`, all four checks plus the Chromium runtime smoke test should pass before merge.

## Repository workflow

Suggested contribution flow for this fork:

```bash
git checkout -b feature/your-change
# edit files
git add .
git commit -m "feat: describe your change"
git push -u origin feature/your-change
```

Then open a Pull Request against `Reese-max/MaterialYouNewTab:main`.

## Integrated upstream baseline

This edition contains a real Git merge of `prem-k-r/MaterialYouNewTab` through commit `e279bb9` (2026-08-24), plus conflict reconciliation that preserves the Reese-max productivity layer. Upstream custom shortcut icons, Daily Quote, `Alt+1`–`Alt+9`, AI Tools context-menu settings, update notes, UI fixes, and all 32 locales are included. MYNT 3.5.0 adds the Reese-max local-first AI Assist layer on top of that baseline.

## Feedback

- [Fork repository](https://github.com/Reese-max/MaterialYouNewTab)
- [Integration and repair Pull Requests](https://github.com/Reese-max/MaterialYouNewTab/pulls)
- [In-project feedback page](./docs/feedback.html)

## Upstream attribution

This project is derived from [prem-k-r/MaterialYouNewTab](https://github.com/prem-k-r/MaterialYouNewTab), which itself includes work from earlier MYNT contributors. Upstream author and contributor attribution in source files and project history is intentionally retained.

The multilingual quotes service used by the project is maintained separately at [prem-k-r/multilingual-quotes-api](https://github.com/prem-k-r/multilingual-quotes-api).

## License

Licensed under the **GNU General Public License v3.0 (GPL-3.0)**. See [LICENSE](./LICENSE).

When redistributing a modified build, preserve the applicable GPL notices, provide the corresponding source as required by GPL-3.0, and retain upstream copyright/attribution notices.

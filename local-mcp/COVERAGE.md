# Local MCP prototype: coverage and limits

This is a staged implementation, not an installed or fully verified desktop integration. No native host has been registered, no client configuration installed, and neither extension manifest has gained nativeMessaging. The original homepage and manual positioning remain unchanged.

## Direct domain tools (69 total)

| Product family | Implemented MCP operations | Remaining browser-only operations |
|---|---|---|
| Dashboard | Counts and seven-day focus minutes/sessions/streak, without note/task text | Interactive history views |
| Important dates | Read, create/update stable-ID events, annual dates, visibility, recoverable trash/undo | Interactive form workflow |
| Tasks | Read, create, title/status/pin changes, recoverable single-item trash/undo with revision checks | Ordinary task UI |
| Daily focus | Read/update text, completion, subject, steps and linked-timer preference | GPT/external navigation |
| Scratchpad | Separately enabled read, append and unique exact replacement | Clipboard, Markdown download, clear |
| Manual layouts | Read wide/narrow profiles; create, rename, activate, save, reorder, recoverable trash/undo | Dragging, snap guides, file import/export and editor drafts |
| Habits | Read, create/rename custom habits, today's check-in, durable recoverable custom-habit trash/undo preserving history | Editing/deleting system habits and arbitrary past-date rewrites |
| Workspaces | Read, create/update presets; guarded application of visibility, future timer settings and background mode, without URLs or video autoplay | A preset that changes motivational-quote visibility requires UI action because its native handler fetches/clears cached quotes; opening preset URLs remains browser-only |
| Settings | Read explicit safe toggles; theme mode, focus/exam/study-quote visibility, local palette/custom hex color, clock format/greeting/name/visibility, search-control visibility, three built-in AI tools order/visibility | Language changes require browser reload/refetch; arbitrary setting keys, credentials, permissions and external navigation are excluded |
| Shortcuts | Read/create/update/recoverable trash/undo; new items use local artwork, existing icons stay private | Opening sites; last shortcut cannot be removed (existing UI minimum). Content-addressed IDs change after edits; duplicate identical items fail closed |
| Pomodoro | Read, guarded start/pause/extend, task label and future durations; studio background color/gradient/home/existing-image/crop; scenario save/update/trash/undo and guarded pristine-timer apply | Reset confirmation, PiP opening and local image import. Running/paused-partial timers require browser confirmation rather than remote reset |
| Local music | Read bounded names/IDs/settings/playback; durable playlist/order/volume/repeat/shuffle/rest policy; guarded play/pause/seek; durable track remove/restore retaining blobs and original order | File selection/import, irreversible removal and browser autoplay gesture when required. Restore does not restore prior selected track or start playback |
| Wallpaper gallery | Read bounded metadata including recoverable items; guarded next/previous/random, select specific item, cancel application, rename and recoverable single-item remove/restore; bundled wallpaper hide/restore without deleting its asset | Import and permanent removal. Removing the active item requires cancelling/changing it first |
| Bookmarks | Already-granted permission only: bounded tree/node read, create, update, move, recoverable trash and restore with revision checks and readback; credential-bearing URLs redacted | Permission grant and permanent removal. Move, recoverable trash and restore preserve IDs/subtrees in an explicitly chosen MYNT MCP Trash folder; real API mutation remains unverified |
| Backup | Format/scope/32 MiB limit and exclusion information | Export, file validation, restore/reset confirmation and application |
| Search, voice, AI tools, Google Apps | Fixed-default Google/bang metadata, search-control visibility and built-in AI ordering/visibility | Searches, external navigation and permission-dependent input. Alternative default engines are not an existing product feature. |
| Weather, DaiDai | Explicit browser-only boundary | Location/API credentials, pairing, network configuration |
| Study quotes and ambient sounds | Read/advance bundled study quotes; generated ambient sound play/stop/volume with autoplay/revocation gates | Other quote sources and network configuration |
| Accessibility and adaptive background | Reduced motion, high contrast, font scale; palette/contrast/opacity toggles | Other detailed appearance controls. Automatic repositioning remains absent. |
| Clock, daily exam, Bongo Cat, command palette | Clock settings and available visibility controls; remaining interactive capability inventory | Clock initialized hidden on a wide page requires enabling once in the ordinary UI before remote clock writes. Exam browsing and command palette remain interactive UI. |

An inventory entry is not an implementation of its operations. `ACTION_REQUIRED` is not success. There is no arbitrary JavaScript, filesystem tool, whole-storage export, raw-media export, DRM download, cloud sync or telemetry.

## Safety and concurrency

- Access is off by default, session-only, with separate write and scratchpad/bookmark opt-ins. Closing the page or disconnecting revokes it. Backups do not grant access.
- Several CLI clients may share the broker. Their browser operations are serialized through Web Locks; stable request IDs and current revision tokens are required for mutations.
- **MCP writes require exactly one open MYNT new-tab document**, no open dialog/editor or focused text input. Multiple ordinary MYNT tabs remain usable, but MCP writes are refused. This is not a claim of concurrent cross-tab atomic editing.
- Browser document enumeration requires the supported runtime.getContexts API. If unavailable, writes fail closed. The count is an admission check, not a cross-process transaction over newly opened browser documents.
- Data plans compare every expected storage value immediately before synchronous persistence and attempt rollback after a storage failure. These are not durable transactions across browser crashes or several databases.
- Timer guards run inside its real asynchronous lock. Music checks after acquiring playback ownership and stops on post-play revocation. Gallery guards run after asynchronous item selection and before application. Some media/browser effects cannot be rolled back after execution begins; failures explicitly indicate possible execution.
- Broker successful responses are not cached; retried results return through current browser access checks. Only sanitized uncertain-write tombstones are retained. Browser replay protection is bounded (256 entries) and session-local, not durable exactly-once processing. After timeout/disconnect, read state before deciding whether to retry.
- IPC is restricted to an owned mode-0700 directory and mode-0600 socket. Same-user malicious processes are not isolated from each other. Trust the local AI clients; they may send tool output to their model providers.
- Windows transport source uses a .NET helper, current-user SID-only DACL, local-session named pipes, remote-client rejection, first-instance ownership and server-owner verification. It rejects elevated/system identities. Capacity rejection retains the pipe instance; partial shared-stdout failures terminate the broker. These protections have static tests/review, not compiled Windows validation. No Windows helper binary is bundled.
- Task/shortcut/custom-habit recovery uses one durable slot each, refuses replacement until restored, and is available in the ordinary UI without enabling MCP. The two backup scopes validate those records. Music tombstones remain in IndexedDB, retain their blob and count toward the existing 30-track/300 MiB limits; full backups preserve them. Undo rechecks active text editing immediately before CAS. Scenario recovery reuses the original in-memory slot and lasts only until page reload.
- Bookmark revision checks are optimistic, not atomic against other browser bookmark editors. Gallery record mutations use a single IndexedDB transaction and retain the original media blob. Focus and completed-task mutations preserve existing derived history/habit behavior.

## Verified in this workspace

- Existing aggregate customization regressions, release metadata, upstream integration, preview build and preview verification.
- Data adapter validation, malformed-data preservation, revision/CAS conflicts, quota rollback, recovery, habits, counts and redaction.
- Browser bridge default-off, private-read gate, write gate, revocation during awaits, replay conflict, rollback and active-editor refusal.
- Media adapters with isolated API doubles; actual timer core delayed-lock revocation/conflict tests; long bookmark output bounds.
- Official MCP SDK real stdio subprocess: initialize, tools/list, schema validation and explicit offline errors.
- Eight transport tests: native framing, official SDK stdio, unsafe runtime rejection, replay retention and four Windows route/source guards, without a listening socket.
- Workspace/accessibility validation, timer persistence/readback and hidden-video deferral; task/shortcut/habit recovery and normal-UI undo; exact preference mappings and pure UI hooks; persistent music recovery/quotas/playback locks and bundled wallpaper visibility; studio appearance/scenario guards; derived focus-log and habit preservation; gallery transaction rollback, stale revisions and recoverable media retention; bookmark API doubles; ambient/appearance/study-quote adapters.
- Real dot cloud browser web preview: settings entry, disclosure expansion, keyboard focus, connect action reporting unavailable without prompting/granting permissions, Escape close and 400px viewport at 125% zoom plus latest 500px normal-zoom reload with no horizontal page overflow. Write/private checkboxes remain unchecked after reload. This is not a live MCP connection.

## Blocked or not tested

The full private-socket broker/native-host/multi-client test remains enabled but could not execute: socket listen returned EPERM. One normal escalation failed before test execution because the execution environment could not initialize a restricted path. No permission workaround was used. Consequently multi-client IPC and native-host round-trip remain unverified, even though their tests are provided.

No installed Chrome/Firefox extension-to-host round-trip, actual Claude Code/Codex/OpenCode attachment, Windows compilation/ACL enforcement/cross-user rejection, physical phone/touch, real user bookmark mutation, real restore confirmation, or sleep/resume alarm test was performed. Existing restrictions on extension-management/internal browser pages, Firefox special flags, the pending restore operation, and the user's computer remain respected.

## Activation and uninstall

See README.md for exact templates and official client documentation. Activation requires separate approval of the exact nativeMessaging-enabled extension build, host registration location and chosen client configuration. The current build intentionally cannot connect. A later approved build must declare the permission before the browser can grant it; this prototype does not request it itself.

To stop an approved installation: disconnect in MYNT, stop the foreground broker, remove only the named client entry and specifically installed host manifest/launcher. Do not clear site data or remove user music/images/layouts. Never remove a socket until its broker is confirmed stopped.

## Completion boundary

All existing product families are inventoried, but not every UI action is remotely implemented. The remaining browser-only column is an explicit gap list, not a claim that opening a panel implements those actions. This deliverable is code and isolated tests, not an activated all-features desktop service. Source and setup/uninstall templates are ready for a separately approved installation and real-machine validation.

## Remaining operation gates, not hidden successes

- Native host/client registration, nativeMessaging activation and OS permissions are not installed by this source. They require separately approved setup.
- File imports, clipboard/download/export and image/music selection remain browser file/gesture workflows; no arbitrary filesystem path tool exists. Backup restore/reset and permanent deletion remain explicit browser confirmation workflows.
- Searches, external AI/Google links, weather location/keys, DaiDai pairing and voice permissions are not silently invoked. The bridge has no general navigation or credential tool.
- Clock/appearance/search-controls/AI ordering and custom-habit recovery now have explicit remote tools. Language changes return ACTION_REQUIRED because the existing implementation reloads and may refetch quotes. Default search is fixed to Google; bang aliases are documented, not executed remotely. No generic setting write or arbitrary DOM action is offered.
- Bundled wallpaper hiding/restoration and music-library recoverable removal/restoration are implemented. Permanent deletion, arbitrary custom AI providers and cross-device sync are not offered. System-generated habits cannot be removed. Recovery and permission limitations are explicit in tool results.

## Final extension of the checkpoint

The 55-tool checkpoint was extended by ten exact preference tools and two music-library tools, for 67 descriptors at that checkpoint. Two component-management tools bring the current catalog to 69. Existing event/task/habit/gallery methods gained additional reversible actions without inflating the tool count. New isolated tests cover malformed hidden-wallpaper preferences, playback-read lock cleanup, tombstones surviving reload/full backup, quota accounting and duplicate-ID protection, and preference/UI defaults. This is functional source coverage, not a claim that all controls have passed a live client/extension test.

## Unified home component visibility

`mynt_components_get` and `mynt_components_update` share the same 19-entry visibility registry as Settings → Manage components. Read responses contain labels/status/revision only, not private widget text. Writes require request ID and exact revision, preserve data/positions and use the existing write/session/single-tab gates. Invalid preferences fail without replacement. Enabling weather, remote quotes or exam warm-up requires ordinary UI action; an uninitialized clock similarly reports ACTION_REQUIRED. Settings remains reachable and is intentionally not hideable. Hide does not pause an active timer or delete media. Existing feature subcontrols (search icons, greeting, individual AI links) retain their own preferences.

Permanent wallpaper deletion is browser-only: mynt_wallpaper_edit(action="purge") always returns ACTION_REQUIRED, never opens a dialog or deletes media. Use the per-item Recovery confirmation. Other saved copies and exported backups are outside this action.

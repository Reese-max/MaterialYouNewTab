# MaterialYouNewTab — Fixed 50-Persona Audit Round 3

Run ID: `persona-audit-20260915T020216Z-MYNT-r3`  
Date: 2026-09-15  
Method: fixed A01–J05 synthetic persona simulation; **not** 50 human participants or 50 independent validations.

## Governing rules

- Fixed-persona protocol: `Reese-max/autodev-ng/docs/portfolio-audit/2026-09-06-50-persona-audit.md`
  - blob SHA: `6e3499d6ef5be7e123050e1526946f6a40f99263`
- Issue Quality v2: `Reese-max/autodev-ng/docs/portfolio-audit/2026-09-14-issue-quality-v2.md`
  - blob SHA: `8167e10798071d2276addaff6b201c6b0e904a2a`

## Snapshot and scope

- Repository: `Reese-max/MaterialYouNewTab` (owned fork; upstream `prem-k-r/MaterialYouNewTab` is not audit write scope).
- Default branch: `main`.
- Inspected/default HEAD before this report: `196d53621f8d47e6eb712eb5e8114f1f511f4288`.
- `196d536...` and its parent `be056d5...` are audit-document-only commits. The current product-code baseline beneath them is `c9e58837534b4853395f9a06e30086d8f7bf5a3f`.
- Latest HEAD was re-read immediately before writing and remained `196d536...`; no product change invalidated this review.
- Current product scope from README: local-first browser new-tab dashboard covering search, tasks, notes, focus, workspaces, bookmarks, weather, accessibility controls, backup/restore and reset.
- Repository issue tracking is disabled (`has_issues=false`). No target-repo Issue can be created until that setting changes; this is recorded below as `ISSUE_WRITE_BLOCKED`, not as a product defect.

Open PRs were reviewed as non-default evidence. PR #5 (`feature/police-exam-countdown`) is active and changes exam/weather/dashboard paths but **does not modify `scripts/alert-modal.js`**. It is therefore neither current product evidence nor an ownership conflict for the finding below. Other unmerged feature PRs are likewise not used as current-main proof.

## Evidence reviewed

1. `README.md` at inspected HEAD: installation, supported Chromium/Firefox development paths, local-first storage, backup/restore, privacy and QA contract.
2. `manifest.json` / `manifest(firefox).json`: optional permission boundary and new-tab override.
3. `scripts/backup-restore.js`: validated backup format, excluded WeatherAPI secret, current-state snapshot, rollback on restore failure, reset confirmation.
4. `scripts/alert-modal.js`: shared alert/confirm implementation used by restore/reset flows.
5. `tools/check-customizations.mjs`: current static QA assertions, including backup rollback checks and some keyboard-operability checks; it has no modal focus-containment/dialog-semantics assertion.
6. `.github/workflows/qa.yml`: real Chromium smoke is part of QA; the current fixed-50 review did not execute a new browser run.
7. GitHub Actions at inspected HEAD: current-main deploy-preview run `33990647995` and extension-package run `33990647974` concluded `success`. Those runs are execution evidence only for their actual steps; they do not prove screen-reader behavior or the modal keyboard path below.
8. Existing Round 1/2 audit: accessibility/browser runtime evidence was already explicitly pending.

## New calibrated finding

### MYNT-R3-01 — custom confirmation modal does not contain keyboard focus or expose modal-dialog semantics

```yaml
issue_quality_version: 2
kind: BUG
severity: P2
decision_priority: HIGH
triage: NEEDS_REVIEW
auto_implementation: false
evidence: SOURCE_CONFIRMED
confidence: CONFIRMED_FOR_SOURCE_CONTRACT; RUNTIME_USER_IMPACT_NOT_EXECUTED
fingerprint: Reese-max/MaterialYouNewTab+scripts/alert-modal.js+open-custom-alert-or-confirm-and-keyboard-navigate+modal-cannot-enforce-focus-containment-or-dialog-semantics+pointer-only-background-suppression-and-no-Tab/focus-return/ARIA-dialog-boundary
```

**Who is affected:** primarily G01 keyboard-only and G02 screen-reader users; E03/F04 users who rely on clear confirmation/recovery context are also exposed. The path is reachable from supported product controls such as reset confirmation and backup/restore alerts.

**Concrete source-level failure:** `alertPrompt()` focuses the OK button and blocks pointer interaction with the background using `document.body.style.pointerEvents = "none"`, but its key handler only handles Enter, Escape and Left/Right arrows. It does not contain `Tab`/`Shift+Tab`, does not mark the container as a modal dialog (`role="dialog"`, `aria-modal="true"`, accessible label/description), and `closeModal()` does not restore the element that had focus before the dialog opened. Pointer-event suppression does not establish a keyboard-focus boundary. Therefore the shared modal cannot guarantee that keyboard focus stays within the active confirmation context or returns to the invoking control.

**Expected:** while a modal confirmation is open, keyboard focus remains within its actionable controls, assistive technology receives a clear dialog boundary/name, and closing returns focus to the invoking control.

**Actual:** the implementation has no Tab focus-containment branch, no modal-dialog semantics and no previous-focus restoration. Exact browser/screen-reader navigation symptoms were not executed in this round, so no claim is made that a particular production user activated a background control.

**Existing alternative/workaround:** pointer users can click the visible modal buttons; a keyboard user may manually recover focus. That workaround does not satisfy the product's own accessibility surface for keyboard-only use.

**Why P2, not P1:** this is a supported, repeatedly used interaction boundary that can materially reduce completion/recovery for keyboard and assistive-technology users, but there is no evidence that the whole product or a primary task is universally impossible. It is not escalated based on persona count.

**Minimum safe change:** reuse the existing custom modal. Add modal semantics and a small focus-management boundary: remember the previously focused element, keep Tab/Shift+Tab within the current modal controls, and restore focus on close. No new UI framework, state machine, service, database or generalized accessibility subsystem is required.

**Acceptance / regression criteria:**
1. In an isolated current-default Chromium test, opening alert and confirm dialogs keeps repeated Tab/Shift+Tab focus within visible modal controls; background controls cannot be keyboard-activated while the modal is active.
2. The modal exposes an accessible dialog boundary and name/description (`role="dialog"` or equivalent native semantics, modal state, and associated text).
3. Existing Enter/Escape and Left/Right behavior remains functional for alert and confirm variants.
4. Closing by confirm, cancel or Escape restores focus to the control that opened the modal.
5. A Firefox/Chromium keyboard check plus a screen-reader accessibility-tree check is recorded before this finding can support CLEAN closure.

**Non-goals:** no redesign of all dialogs, no dependency/framework migration, no browser-extension store publication work, and no unrelated exam-dashboard changes.

**Tracking state:** `ISSUE_WRITE_BLOCKED`. The repository has GitHub Issues disabled and an all-state Issue search returned no target-repo Issue object to update. This round does not create a duplicate central implementation Issue or alter repository settings merely to clear the audit gate. The finding remains actionable and blocks CLEAN until a traceable Issue/tracking decision exists and the root path is verified.

## Fixed A01–J05 scenario matrix

Legend: `SRC` = current-source/repository evidence; `CI` = actual GitHub Actions evidence only for the named path; `NRV` = needs runtime verification. `R3-01` maps to the finding above.

| Persona | Goal / precondition | Input / steps | Expected success | Observation | Evidence / severity |
|---|---|---|---|---|---|
| A01 | First-time mobile-oriented student understands product | README → install/use custom edition | Product purpose and start path clear | README distinguishes custom fork and install path; extension remains desktop-browser oriented | SRC / no new P0–P2 |
| A02 | Docs-familiar, CLI-unfamiliar user installs | Download ZIP → Load unpacked | No CLI required | README provides ZIP + browser UI route | SRC / no new P0–P2 |
| A03 | Technical student customizes safely | Inspect local-first customization and permissions | Customization without broad permission surprise | Manifest uses optional narrow permissions | SRC / no new P0–P2 |
| A04 | Time-pressured examinee reaches core new-tab task | Install → open new tab → search/task/focus | Short path available | Core entry documented; real end-to-end browser completion not rerun | SRC + NRV |
| A05 | Visual learner understands state and recovery | Use visible controls then backup/reset prompt | State/action is clear | General UI present; shared modal accessibility boundary fails for restricted-input cases | SRC / R3-01 P2 |
| B01 | Non-programmer uses productivity widgets | Browser UI only | Core task without code | Supported by README; no fresh user-browser run | SRC + NRV |
| B02 | Junior engineer diagnoses installation failure | QA/docs + manifests | Actionable setup/error path | Dev QA and manifests are explicit; browser-specific failure handling still runtime-dependent | SRC + NRV |
| B03 | Designer makes reversible settings changes | Backup → modify → restore | Reversible operation | Restore snapshots and rollback path exist statically | SRC / no new P0–P2 |
| B04 | Research assistant exports notes/settings | Scratchpad export + backup | Data can be exported with privacy boundary | Markdown/backup documented; WeatherAPI key excluded | SRC / no new P0–P2 |
| B05 | Fragmented-time user resumes dashboard | Close/reopen new tab | Local state persists | localStorage/IndexedDB architecture supports persistence; real interrupted session not rerun | SRC + NRV |
| C01 | Public-sector user needs correctness/auditability | Backup/restore before changes | Recoverable settings state | Versioned backup + rollback source path present | SRC / no new P0–P2 |
| C02 | Teacher needs low learning cost | Install + daily new-tab use | Minimal routine | README is direct; runtime usability not independently executed | SRC + NRV |
| C03 | High-risk user avoids hidden secret export | Backup settings | Secret excluded | `weatherApiKey` explicitly excluded/preserved | SRC / no new P0–P2 |
| C04 | Creator needs long workflow recovery | Backup + restore after interruption | Existing state preserved on failure | Rollback path snapshots both stores | SRC / no new P0–P2 |
| C05 | SRE expects fail-safe operation | Inspect validation/rollback/CI | Bounded, observable failures | QA/rollback exist; browser assistive path unverified | SRC + CI + NRV |
| D01 | Manager reads status quickly | README/QA status | Clear supported scope | Product/custom-fork distinction clear | SRC / no new P0–P2 |
| D02 | PM traces change ownership | Review current HEAD + PRs | Default vs proposed work distinguished | PR #5 is open and not used as current evidence | SRC / no new P0–P2 |
| D03 | IT admin inspects permissions/backup | Manifest + backup source | Minimum permissions, recoverability | Narrow optional permissions; local backup | SRC / no new P0–P2 |
| D04 | Cost-sensitive user avoids paid surprise | Core local features/weather boundary | No hidden mandatory paid API | Local-first; optional WeatherAPI key documented | SRC / no new P0–P2 |
| D05 | Auditor verifies privacy claims | Manifest + backup + policy | Traceable boundary | Secret exclusion and permission surface source-confirmed | SRC / no new P0–P2 |
| E01 | Traditional desktop user navigates controls | Use visible new-tab controls | Understandable routine | Requires real browser usability check for this persona | NRV |
| E02 | Large-text desktop user | Increase text/zoom | Core controls remain usable | Text scaling exists; 200% runtime still pending | SRC + NRV |
| E03 | Low-digital user fears destructive reset | Open reset confirmation, keyboard/pointer | Confirmation is constrained and recoverable | Pointer path visible; keyboard modal boundary incomplete | SRC / R3-01 P2 |
| E04 | Excel-familiar, cloud-unfamiliar user backs up locally | Backup/restore through UI | No deployment needed | Local file backup path | SRC / no new P0–P2 |
| E05 | Long-session user needs readable stable UI | Extended dashboard session | No fatigue/resource issue | No long-duration run in this round | NRV |
| F01 | Older first-time user needs explicit buttons | Core controls | Clear clickable actions | UI includes buttons; real target-size/usability not rerun | SRC + NRV |
| F02 | Low-vision user relies on zoom/contrast | 200% zoom/high contrast | Core layout remains operable | Controls exist; runtime visual verification pending | SRC + NRV |
| F03 | Low dexterity user needs forgiving targets | Pointer interaction | Avoid precision traps | No current runtime touch/target audit | NRV |
| F04 | Memory-sensitive user needs one-step confirmation | Open reset/restore modal, exit it | Focus/context returns predictably | `closeModal()` has no previous-focus restoration | SRC / R3-01 P2 |
| F05 | Assisted setup then independent daily use | Install once, daily new tab | Persistent local settings | Storage model supports persistence; real assisted-to-independent run pending | SRC + NRV |
| G01 | Keyboard-only user completes confirmation | Open confirm → Tab/Shift+Tab/Enter/Escape | Focus stays in modal and returns to trigger | No Tab containment or focus restoration | SRC / R3-01 P2 |
| G02 | Screen-reader user understands confirmation | Open alert/confirm | Dialog announced with name/state | Dynamically created modal has no dialog/aria-modal/name relationship | SRC / R3-01 P2 + NRV screen reader |
| G03 | Color-limited user reads state | Inspect actions/errors without color-only dependency | Text/state available | No new static color-only finding; actual perception not rerun | SRC + NRV |
| G04 | 200% zoom/narrow window | Zoom new-tab UI | Core controls reachable | Explicitly still runtime-pending from prior audit | NRV |
| G05 | Slow/high-latency network | Optional weather/suggestions fail slowly | Core local dashboard remains usable | Local-first design limits dependency; timeout UX not executed | SRC + NRV |
| H01 | Windows developer loads extension | Clone/ZIP → Chromium load | Build/load succeeds | Current CI uses Linux Chrome, not Windows | NRV |
| H02 | macOS developer loads extension | Clone/ZIP → Chromium/Firefox dev load | Build/load succeeds | No current macOS runtime evidence | NRV |
| H03 | Linux/CI noninteractive maintainer validates | Run QA | Deterministic gate executes | Current-main Actions include successful package/preview runs; QA workflow defines real Chromium smoke | CI scoped + SRC |
| H04 | Cloud-hosting user understands boundary | Review web preview vs extension | Does not confuse preview with extension proof | README separates product/install paths; deployment is not extension-runtime proof | SRC / no new P0–P2 |
| H05 | First-time maintainer follows repo | README + QA commands | Can identify truth/source and tests | README/QA structure clear; modal gap not covered by current static QA | SRC / R3-01 P2 |
| I01 | Repeated clicks/submits | Trigger modal/actions repeatedly | No duplicate destructive action | No fresh runtime double-submit test for shared modal | NRV |
| I02 | Interrupt during restore then recover | Restore with failure/interruption | Good prior state retained | Explicit rollback path exists; actual crash/interruption persistence still needs runtime | SRC + NRV |
| I03 | Corrupt/invalid backup | Import wrong file | Reject before replacing good state | Structure/type/version validation occurs before restore | SRC / no new P0–P2 |
| I04 | Remote optional API timeout/429/5xx | Weather/suggestions failure | Core local functions remain usable | Provider failure UX not executed in this round | NRV |
| I05 | Partial IndexedDB restore failure then retry | Force write failure safely in isolated test | Roll back both stores, allow retry | Source rollback exists; failure injection not rerun | SRC + NRV |
| J01 | Large backup/data set | Import near limits | Bounded validation/no runaway | 32 MiB file cap and entry limits exist | SRC / no new P0–P2 |
| J02 | Multiple profiles/concurrent usage | Separate profiles + backup/restore | Isolation preserved | Manifest incognito differs by browser; multi-profile behavior remains runtime-pending | SRC + NRV |
| J03 | Long-running dashboard | Leave open for extended period | No resource exhaustion | No long-duration runtime evidence | NRV |
| J04 | Privacy-sensitive user inspects data flow | Backup + optional permission review | No secret in export/broad mandatory host permission | Source-confirmed narrow permissions and secret exclusion | SRC / no new P0–P2 |
| J05 | Expert takes shortest/custom path | Keyboard shortcuts + custom settings | Fast path without breaking safety boundaries | Existing shortcut/QA support; modal keyboard boundary is shared gap | SRC / R3-01 P2 |

Coverage: **50/50 fixed persona IDs reviewed**. The matrix covers the protocol dimensions of first success, core task, recovery, data safety, observability, accessibility/device, performance/cost, maintainability, failure injection and trust. `NRV` rows are not runtime passes.

## Issue / duplicate / ownership check

- Target-repo GitHub Issues: disabled; all-state Issue search returned no Issue object.
- All-state PR review found no PR dedicated to `scripts/alert-modal.js`; search for `alert-modal` returned none.
- Active PR #5 does not change `scripts/alert-modal.js`, so the finding is not silently reassigned to that implementation.
- Existing Round 1/2 audits identified accessibility runtime gaps but did not record this source-level shared-modal root cause. This is a distinct fingerprint, not a restatement of “runtime evidence missing.”
- Umbrella Issue cannot be created while Issues are disabled. `ISSUE_WRITE_BLOCKED` remains a CLEAN blocker rather than a reason to invent a `not_planned` decision.

## Runtime boundary

This round did **not** execute Chromium/Firefox keyboard traversal, screen-reader output, 200% zoom, multi-profile restore, crash injection or external provider failure. Existing successful Actions are retained only for their exact build/preview/QA-covered paths. PR-head runtime evidence is not treated as default-branch evidence.

Required safe verification for R3-01: load current-default extension in an isolated Chromium and Firefox profile with synthetic settings, open the shared reset/restore alert+confirm paths, exercise Tab/Shift+Tab/Enter/Escape, inspect the accessibility tree, and verify focus return. No production data, paid provider call, destructive external write or repository setting change is needed.

## Round result / CLEAN accounting

- New calibrated actionable P0/P1/P2 findings: **1 P2 BUG** (`MYNT-R3-01`).
- Actual target Issue created: **0** because repository Issues are disabled → `ISSUE_WRITE_BLOCKED`.
- New regression against a previously verified-fixed default-branch behavior: **0**.
- Complete fixed-persona coverage: **yes, 50/50 synthetic scenarios**.
- Qualifying CLEAN round: **no**. A new P2 exists, required accessibility/browser runtime evidence is incomplete, and Issue tracking for the finding is blocked.
- Consecutive qualifying rounds: **0/2** (reset by new P2).
- Repository status: **NOT CLEAN**.

## Next step

Keep the finding narrowly scoped to the shared modal. Do not merge or deploy any feature branch from this audit. Once a traceable tracking channel is available and a minimal modal fix lands on `main`, rerun the same G01/G02/E03/F04/J05 confirmation scenarios plus neighboring restore/reset paths and obtain the bounded browser evidence listed above.

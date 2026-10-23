# MaterialYouNewTab — Product Board Audit

Run: `product-board-2026-09-18T14:03:07Z`  
Audit type: formal product round; audit/triage only  
Repository: `Reese-max/MaterialYouNewTab`  
Rules blob: `8167e10798071d2276addaff6b201c6b0e904a2a` (`2026-09-14-issue-quality-v2.md`)  
Inspected default HEAD: `71ed3072adb0db29d68830435eb8325fcc0971b3`  
Product-code baseline beneath audit-only commits: `c9e58837534b4853395f9a06e30086d8f7bf5a3f`  
Open candidate heads: PR #4 `4bef4e0d13a5139559db8781e7d966f2cb2da26a`; PR #5 `100fb51d09858351667b47cb842f446d81a25b0a`  
Status: `PARTIAL / NOT CLEAN`; no implementation authorization

## 1. Discovery and evidence boundary

- Inventory was fully paginated: 41 Reese-max-owned repositories, 40 unarchived; `obsidian-vault` is the only archived repository and is excluded from active-product rotation. The next fair-rotation cursor is `Reese-max/cf-mcp-server`.
- `main` has no product-code change after `c9e5883`; `be056d5`, `196d536` and `71ed307` are audit-only commits. They do not invalidate earlier product reproduction.
- Product truth reviewed: README, Chromium/Firefox manifests, privacy/installation boundary, `scripts/alert-modal.js`, recent commits, all-state Issues/PRs, complete review threads, exact-head workflow runs and the existing fixed A01–J05 Round 3 audit.
- Repository Issues are disabled. All-state Issue search returned no Issue objects. This is an `ISSUE_WRITE_BLOCKED` tracking constraint, not a product defect and not authority to change repository settings.
- `main` exact-head runs on 2026-09-15 were green: [QA 34920189346](https://github.com/Reese-max/MaterialYouNewTab/actions/runs/34920189346), [packages 34920189352](https://github.com/Reese-max/MaterialYouNewTab/actions/runs/34920189352), [preview 34920189426](https://github.com/Reese-max/MaterialYouNewTab/actions/runs/34920189426). These prove only the executed gates; they do not prove Firefox, screen-reader, full keyboard, mobile or real-profile behavior.
- No paid provider, real location/weather service, browser-store publication, production profile, screen reader or destructive external write was exercised.

## 2. Product scope and decision memo

**Who it serves.** Traditional-Chinese-first desktop browser users who want a fast local dashboard for search, shortcuts, tasks, notes, focus, workspaces, bookmarks and optional weather without making an account the center of the experience.

**Why users choose it.** Local-first state, narrow optional permissions, source availability, a dense but personal productivity surface, strong Traditional Chinese support and manual-install transparency. The current fork is not the upstream store build; that distinction is correctly explicit.

**Competitive choice.** Compete on a trustworthy personal workspace and reversible local state, not feature-count parity. The strongest differentiation is the combination of Material You, Traditional Chinese-first workflows, local backup/restore and no required account/subscription.

**Three priorities if only three things are done:**

1. Fix and verify the shared confirmation modal boundary on `main` (keyboard containment, accessible dialog semantics and focus return).
2. Before any AI Assist merge, resolve the current-head async ownership and duplicate-task integrity blockers and obtain a fresh review on the exact head.
3. If the exam dashboard is the chosen vertical, close its remaining visible-fallback/runtime gap and merge it independently before revisiting generic AI breadth.

**Do not do now.** No cloud account/sync platform, broad history or all-URLs permission, autonomous browser agent, generic chatbot, collaboration SaaS, mobile-native app, cross-project state framework or paid-provider commitment. Do not merge PR #4 and PR #5 as a feature bundle.

**Recommendation:** `INVEST / SIMPLIFY`. Preserve the local dashboard core, remove merge blockers, and choose one coherent extension of the product at a time. A URL-only Session Capsule remains research-only; it is not a current build request.

## 3. Competitor and substitute matrix

Public sources were rechecked on **2026-09-18**. Product claims are `CONFIRMED` as vendor/source statements, not independent outcome evidence.

| Product / substitute | Confirmed public evidence and date | Comparison | Board implication |
|---|---|---|---|
| [Momentum Plus](https://momentumdash.com/plus) | Accessed 2026-09-18. Vendor lists focus mode, timers, sounds, site blocker, Todo, calendar/integrations, Ask AI, notes and tab stash; Plus is USD 39.95/year. | Broader integrations, polish and paid distribution; account/subscription-centered. | `MUST MATCH`: first-use clarity and reliable daily focus. `SHOULD BE BETTER`: local ownership and pricing transparency. Do not copy integration sprawl. |
| [Tabliss](https://tabliss.io/) | Accessed 2026-09-18. Official site says free, open source, no ads/subscriptions/data mining, Firefox/Chrome/Edge, 40+ languages, widgets and deep customization. | Closest open-source privacy substitute; stronger customization breadth, lighter workflow depth. | `MUST MATCH`: free/private baseline and browser breadth. `DIFFERENTIATOR`: structured tasks/workspaces/backup and Traditional Chinese workflow. |
| [Bonjourr](https://bonjourr.fr/) | Accessed 2026-09-18; site records docs overhaul 2026-07-11 and Bonjourr 22 on 2025-12-15. It offers quick links, notes, Pomodoro, weather, custom CSS, no generative AI and no account/data collection. | Calmer/minimal alternative with clear privacy posture. | `SHOULD BE BETTER`: calm defaults and documentation. `DO NOT COPY`: aesthetic minimalism that hides MYNT's actual workflow value. |
| [Bonjourr browser support docs](https://bonjourr.fr/docs/) | Updated 2026-08-31. Official docs distinguish Chrome/Firefox/Edge, Safari web-homepage workaround, and mobile/browser limitations. | More explicit compatibility truth than many extensions. | `MUST MATCH`: honest browser/runtime support table; do not imply mobile support from responsive CSS alone. |
| [Chrome built-in AI](https://developer.chrome.com/docs/ai/built-in) | Accessed 2026-09-18. Chrome documents browser-managed models, API availability/origin-trial status, download UX and session management. | Platform capability and substitute for cloud AI, but availability/model lifecycle are browser-controlled. | `DO NOT COPY`: treating API presence as universal availability. Keep deterministic local fallback and explicit model-download state. |
| [Upstream MYNT v3.3](https://github.com/prem-k-r/MaterialYouNewTab/releases/tag/v3.3) | Released 2025-11-23. Upstream remains the store/distribution substitute for users who do not need fork-specific features. | Easier trusted install; lacks guaranteed Reese-max customizations. | `MUST MATCH`: release truth and install safety. Fork differentiation must justify manual-install friction. |

Cross-dimension summary: target users overlap strongly with Tabliss/Bonjourr/Momentum desktop users; MYNT is stronger on local workflow density and Traditional Chinese, weaker on signed distribution and broadly documented compatibility. Mobile is not a supported parity target. API and AI breadth are not value by themselves. Performance/reliability, reversible state, permission minimization and truthful installation remain higher priority than more widgets.

## 4. Simulated board review

This is a model-based multi-perspective exercise, not independent expert consensus or a vote.

| Perspective | Position / disagreement |
|---|---|
| CEO | Do only the three priorities above. Prefer exam-specific depth over generic AI if one feature branch must be chosen; do not fund cloud sync, mobile or broad agent automation. |
| CPO | Local workspace trust is the product. AI Assist is acceptable only as an optional action layer with explicit apply and no hidden mutation. |
| CTO | Two long-lived feature branches and self-mutating hardening workflows increase review ambiguity. Require source-visible, exact-head candidates and conventional CI before merge. |
| Staff/Principal Engineer | Fix shared primitives narrowly: the modal, request-generation guard and idempotent task action. No new framework is necessary. |
| UX Lead | Dense capability is useful, but first success and mode changes need calmer hierarchy. Exam mode must not silently hide or alter unrelated controls. |
| UX Researcher | Synthetic personas expose risks but cannot establish demand for AI or exam mode. Observe real task completion before expanding either branch. |
| Growth | Signed/store distribution could improve adoption, but is deferred until release ownership and support cost are explicit. No growth claim from repository stars or synthetic preference. |
| CFO | Local-first avoids recurring inference cost. Do not add paid APIs or a support-heavy multi-platform matrix without evidence. |
| Security/Privacy | Preserve optional permissions, no required account and fail-closed hidden-network behavior. AI context must remain bounded and user-triggered. |
| QA | Green Actions do not cover open review threads. Require exact-head delayed-provider, double-activation, Firefox keyboard and accessibility-tree cases. |
| SRE | There is no hosted service SLO to invent. Treat workflow receipts and reproducible packages as the operational surface. |
| Accessibility | The shared confirmation modal is the highest current default-branch gap; native dialog naming and visible icon fallbacks also matter. |
| Support | Installation is unusually honest, but manual Chrome/Firefox flows create ongoing support burden; compatibility claims must stay precise. |

## 5. Fifty synthetic product personas

These are **30 regression + 20 exploration** personas, separate from fixed A01–J05. They are not humans, incidence, revenue evidence or a CLEAN substitute.

| ID | Background / constraint | Goal and journey | Friction / outcome | Classification, suggestion, evidence |
|---|---|---|---|---|
| PB-R01 | Chrome user, no CLI | ZIP → load unpacked → open new tab | Documented path; developer warning remains | PASS_WITH_LIMITS; keep install truth; README/SRC |
| PB-R02 | Firefox tester | Rename Firefox manifest → temporary add-on | Reload required after restart | PASS_WITH_LIMITS; do not promise permanence; README/SRC |
| PB-R03 | Daily search-first user | New tab → search / bang | Short path present | BASELINE; protect latency; README/SRC |
| PB-R04 | Bookmark-heavy user | Enable optional bookmarks → sidebar | Permission is optional | BASELINE; retain just-in-time request; manifest/SRC |
| PB-R05 | Privacy-sensitive weather user | Disable weather → reopen tab | Network behavior not rerun on main | NEEDS_RUNTIME_VERIFICATION; privacy gate test |
| PB-R06 | Settings-heavy user | Export backup before change | Secret excluded | BASELINE; retain versioned export; README + audit/SRC |
| PB-R07 | Recovering user | Restore known-good backup | Rollback path exists | PASS_WITH_LIMITS; rerun real-profile restore |
| PB-R08 | User with corrupt file | Import invalid backup | Validation expected before replace | PASS_SOURCE; preserve fail-closed validation |
| PB-R09 | Task user | Create/complete Todo | Core feature exists | BASELINE; no new finding |
| PB-R10 | Note taker | Scratchpad → Markdown export | Explicit local output | BASELINE; preserve raw note ownership |
| PB-R11 | Student with modes | Select Study workspace | Widgets/background/focus change | BASELINE; mode must remain reversible |
| PB-R12 | Repeated-workflow user | Launch saved workspace URLs | Optional multi-tab action | NEEDS_RUNTIME_VERIFICATION; no broad history permission |
| PB-R13 | Pomodoro user | Start, pause, resume focus | Timer path documented | NEEDS_RUNTIME_VERIFICATION; interruption receipt |
| PB-R14 | Sensory-focus user | Start ambient audio | Local media feature | PASS_WITH_LIMITS; honor reduced motion/data settings |
| PB-R15 | System-theme user | Follow dark/light system | Supported upstream behavior | BASELINE; retain no-flash preload |
| PB-R16 | Motion-sensitive user | Enable reduced motion | Control exists | NEEDS_RUNTIME_VERIFICATION; test video/transition gates |
| PB-R17 | High-contrast user | Enable contrast → navigate | Control exists | NEEDS_RUNTIME_VERIFICATION; manual visual check |
| PB-R18 | Low-vision user | Increase text scale / browser zoom | Control exists; 200% path pending | NEEDS_RUNTIME_VERIFICATION; no CLEAN credit |
| PB-R19 | Power user | Ctrl/Cmd+K → action | Command palette is a differentiator | BASELINE; preserve keyboard-first path |
| PB-R20 | Shortcut user | Press ? and Alt+1–9 | Help and launch path documented | PASS_WITH_LIMITS; cross-platform keyboard test |
| PB-R21 | Traditional Chinese user | First launch in zh-TW | Default language is explicit | DIFFERENTIATOR; retain full fallback tests |
| PB-R22 | German locale user | Use custom feature lacking translation | English fallback expected | PASS_SOURCE; keep per-key fallback |
| PB-R23 | Incognito user | Open private new tab | Chromium split / Firefox spanning differ | NEEDS_REVIEW; document behavioral difference |
| PB-R24 | Offline user | Open dashboard without network | Local core should function | NEEDS_RUNTIME_VERIFICATION; optional widgets fail softly |
| PB-R25 | Slow weather provider | Open tab during timeout | Core must stay usable | NEEDS_RUNTIME_VERIFICATION; no provider call made |
| PB-R26 | Large-state user | Backup near documented limits | Bounds exist, performance not rerun | NEEDS_RUNTIME_VERIFICATION; isolated fixture |
| PB-R27 | Interrupted restore user | Failure mid-restore → retry | Source rollback exists | NEEDS_RUNTIME_VERIFICATION; crash/failure injection |
| PB-R28 | Repeated-click user | Open/close shared modal rapidly | Focus boundary is incomplete | P2 BUG; existing `MYNT-R3-01`; SOURCE_CONFIRMED |
| PB-R29 | User afraid of reset | Open reset confirm → Escape | Visual confirm exists; focus return absent | P2 BUG mapping; minimal modal fix |
| PB-R30 | Long-session user | Leave dashboard open all day | No duration evidence | NEEDS_RUNTIME_VERIFICATION; no leak claim |
| PB-X01 | Police-exam candidate | Enable exam dashboard → track date | PR #5 only, not current product | NEEDS_REVIEW; validate real need; PR/SRC |
| PB-X02 | Low-end school laptop | Exam layout + video/weather | Resource budget not measured | NEEDS_EVIDENCE; narrow performance fixture |
| PB-X03 | Screen-reader user | Open reset/restore confirmation | No dialog semantics/name on main | P2 BUG; fix shared modal first |
| PB-X04 | Keyboard-only user | Tab through confirmation, close | No Tab containment/focus return | P2 BUG; browser + accessibility-tree check |
| PB-X05 | Touch Chromebook user | Use Study toolbar | Mask failure could erase visible glyph | P3 BUG after calibration; existing PR #5 thread |
| PB-X06 | No-account privacy user | Inspect permissions/storage | Local-first and optional permissions fit | DIFFERENTIATOR; do not add account-first sync |
| PB-X07 | Multi-profile user | Export/import between profiles | Weather key intentionally not carried | PASS_WITH_LIMITS; explain re-entry |
| PB-X08 | Chrome + Firefox user | Keep same settings/behavior | Packaging exists; parity unproven | NEEDS_RUNTIME_VERIFICATION; real Firefox run |
| PB-X09 | Chrome without built-in AI | Choose Auto → local fallback | Proposed PR #4 fallback exists | NEEDS_REVIEW; exact-head E2E before merge |
| PB-X10 | Slow model-download user | Start plan, close dialog, do notes | Old async result can overwrite new task | P2 BUG; PR #4 existing thread |
| PB-X11 | Fast context-switcher | Planner → Scratchpad while pending | Shared dialog ownership is stale | P2 BUG; generation/cancellation guard |
| PB-X12 | Double-click user | Add extracted tasks twice | Duplicates are persisted | P2 BUG; single-use/idempotent action |
| PB-X13 | Study user with weather hidden | Open default Study tab | PR #5 source/tests block hidden request | PARTIALLY_VERIFIED candidate only; not main |
| PB-X14 | Reduced-motion Study user | Return to video background | PR #5 routes through shared playback gate | PARTIALLY_VERIFIED candidate only; no Firefox/manual |
| PB-X15 | Broken packaged icon user | Open Study toolbar | Labels exist for AT, visible fallback absent | P3 BUG; add local glyph/text fallback |
| PB-X16 | Store-first user | Install upstream listing expecting fork | README warns builds differ | PASS_SOURCE; keep prominent distinction |
| PB-X17 | Managed enterprise browser | Attempt unpacked install | Policy may block extension | OUT_OF_SCOPE / document constraint; do not claim support |
| PB-X18 | Android Chrome user | Expect new-tab extension | Browser lacks extension path | OUT_OF_SCOPE; responsive layout is not mobile support |
| PB-X19 | Safari user | Expect native extension | No signed Safari product | OUT_OF_SCOPE; web-homepage substitute only if authorized later |
| PB-X20 | Researcher resuming a session | Save URL set → preview → restore | Opportunity lacks demand/runtime proof | RESEARCH_BACKLOG; URL-only experiment, no history permission |

Coverage result: 50/50 scenarios assessed; `PASS` is source/declared-path scoped unless a run is named. No synthetic preference percentage is produced.

## 6. Red Team

- **Counterevidence to “main is broken broadly”:** exact-head QA, packaging and preview are green; the confirmed default-branch defect is the shared modal boundary, not general product failure.
- **Counterevidence to “AI is required to compete”:** Tabliss and Bonjourr remain credible free/open/privacy alternatives without generative AI; Bonjourr explicitly markets “No generative AI.” AI is optional differentiation, not parity debt.
- **Counterevidence to “PR #4 hardening is already applied”:** current head has no `scripts/ai-core.js`; [Apply reviewed AI hardening run 33059237903](https://github.com/Reese-max/MaterialYouNewTab/actions/runs/33059237903) failed during payload reconstruction, while [run 33054848934](https://github.com/Reese-max/MaterialYouNewTab/actions/runs/33054848934) failed its architecture/static/unit gate. Green QA/package runs exercise the still-monolithic candidate and do not close its four tracked findings.
- **Counterevidence to “PR #5 is fully approved”:** exact-head QA/package are green and two major lifecycle threads are resolved, but one current unresolved visible-fallback thread remains. Green CI is not independent review approval.
- **Smaller alternative:** fix the existing modal in place; add request generation and one-shot action guards; add visible text/glyph fallback. No framework, database, IAM platform or generic workflow engine is needed.
- **Wrong-root-cause check:** lack of a ledger/registry/session platform is not the cause of any current finding. Browser/platform limitations explain mobile/Safari gaps and should remain explicit exclusions.
- **Scale check:** account sync, full tab manager and autonomous browser agent would expand permission, privacy and support costs beyond evidence.

## 7. Findings, tracking and priority

| Fingerprint / tracking | Current calibration | State and minimum scope |
|---|---|---|
| `MaterialYouNewTab+alert-modal+open-confirmation+keyboard-focus-escapes/no-dialog-semantics+missing-Tab-containment-and-focus-return` — [Round 3 audit](https://github.com/Reese-max/MaterialYouNewTab/blob/71ed3072adb0db29d68830435eb8325fcc0971b3/docs/audits/50-persona-round-3-2026-09-15.md) | `BUG / P2 / HIGH / NEEDS_REVIEW / SOURCE_CONFIRMED` | Existing; `ISSUE_WRITE_BLOCKED`. Add semantics, Tab containment, prior-focus restore; test Chromium+Firefox+accessibility tree. |
| PR #4 stale async ownership — [thread](https://github.com/Reese-max/MaterialYouNewTab/pull/4#discussion_r3868981579) | `BUG / P2 / HIGH_PRE_MERGE / NEEDS_REVIEW` | Existing, active owner → `SKIPPED_LOCKED`. Request generation/cancel + delayed-provider regression. |
| PR #4 duplicate Add tasks — [thread](https://github.com/Reese-max/MaterialYouNewTab/pull/4#discussion_r3868981583) | `BUG / P2 / HIGH_PRE_MERGE / NEEDS_REVIEW` | Existing, active owner → `SKIPPED_LOCKED`. Single-use or idempotent action + double-activation regression. |
| PR #4 unlabeled dialog — [thread](https://github.com/Reese-max/MaterialYouNewTab/pull/4#discussion_r3868981588) | `BUG / P2 / HIGH_PRE_MERGE / NEEDS_REVIEW` | Existing, active owner → `SKIPPED_LOCKED`. Bind title and verify accessibility tree. |
| PR #4 changelog drift — [thread](https://github.com/Reese-max/MaterialYouNewTab/pull/4#discussion_r3868981592) | `MAINTENANCE / P3 / MEDIUM_PRE_MERGE / NEEDS_REVIEW` | Existing; exact 3.5.0 entry. Not a user-impact P2. |
| PR #5 toolbar visible fallback — [thread](https://github.com/Reese-max/MaterialYouNewTab/pull/5#discussion_r3975386332) | **Recalibrated** `BUG / P3 / MEDIUM_PRE_MERGE / NEEDS_REVIEW` | Existing, active owner → `SKIPPED_LOCKED`. Packaged-resource failure is not yet shown frequent enough for P2; add local glyph/text and a failed-mask fixture. |

No new fingerprint passed all four issue gates. No Issue, PR comment, review or implementation branch was created. Existing owners and unresolved review threads remain authoritative; this audit did not acquire or compete for their locks.

## 8. NOW / NEXT / LATER / DON'T

- **NOW:** main shared-modal P2; PR #4 two integrity P2s and accessibility P2 before any merge.
- **NEXT:** PR #5 visible fallback and bounded Firefox/keyboard/manual validation; decide whether exam vertical or AI Assist is the next coherent release.
- **LATER:** URL-only Session Capsule research with explicit preview, missing-only restore and no history permission; signed distribution feasibility only after ownership/support review.
- **DON'T:** account-first cloud sync, broad browsing surveillance, agentic autonomous actions, native mobile breadth, generic AI chatbot, integration marketplace or cross-repo platform.

## 9. Runtime / regression status

- `MYNT-R3-01`: `STILL_SOURCE_CONFIRMED / NEEDS_RUNTIME_VERIFICATION`; no fix exists on default branch.
- PR #4 current candidate: exact-head QA/package green, but hardening workflows failed and four source findings remain; no `VERIFIED_FIXED` claim.
- PR #5 current candidate: exact-head QA/package green; resolved weather/video claims are candidate-only and not default-branch fixes; one unresolved P3 remains.
- Fixed A01–J05 portfolio CLEAN: not claimed, consecutive qualifying rounds remain `0/2`.

## 10. Round accounting

- New actionable findings: 0
- Existing findings mapped: 6
- Duplicate Issues/comments avoided: 6
- Severity correction: 1 (`PR #5 toolbar fallback P2 → P3`)
- New / updated / reopened Issues: 0 / 0 / 0
- `SKIPPED_LOCKED`: 2 active PRs
- Verified fixed: 0
- Issue write blocked: 1 existing default-branch finding because Issues are disabled
- Report write blocked: 0 at draft time
- Portfolio CLEAN: no
- Next fair-rotation cursor: `Reese-max/cf-mcp-server`


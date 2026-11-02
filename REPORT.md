# centered minimal 實作報告

## 計畫與狀態

- [x] 盤點首頁、元件樣式、版面設定儲存格式與現有檢查腳本。
- [x] 建立首頁中央堆疊與置頂書籤工具列，保留既有行為。
- [x] 加入一次性版面遷移、捷徑新增入口，隱藏首頁 widgets。
- [x] 新增 centered layout 檢查並執行使用者指定驗收。

## 變更

- `index.html`：將單一 `#date` 移出隱藏 focus 區；新增快速連結列（AI、網站捷徑、加號）；將書籤按鈕移入 Google Apps 工具列；載入新樣式與遷移腳本。
- `scripts/centered-layout.js`：一次性備份目前作用中的 profile 為「舊版面（自動備份）」並清空其 wide/narrow blocks；略過已遷移、缺漏或格式錯誤資料；加號啟用捷徑元件並呼叫既有新增捷徑按鈕。
- `styles/centered-home.css`：時鐘、日期、搜尋、捷徑與既有引言採中央堆疊；手機/桌面分別調整時鐘與日期間距；書籤與 Google Apps 同列且各 48px；書籤空狀態及清單列加上間距和文字排版；隱藏已移除首頁 widgets 與設定面板中的 widgets 切換列。
- `scripts/home-widgets.js`：進入移除功能模式即略過 widgets 初始化，保留原腳本與資料。
- `tools/check-centered-layout.cjs`：檢查遷移備份、重設、冪等、其他 storage key 保持不變、缺漏/錯誤資料容忍、widgets 不渲染與書籤工具列位置。
- `check-home-widgets.cjs` 未更動：既有幾何/互動測試在隔離模擬環境測試 widgets 模組；首頁實際不渲染由 removed-features guard、CSS 與新增檢查覆蓋。

## 驗收輸出

- 以下指定檢查全部結束碼 `0`：

```text
node tools/check-centered-layout.cjs
CENTERED_LAYOUT_CHECK_OK

node tools/check-component-visibility.cjs
Component visibility core checks passed: 20 entries, legacy keys, cache plans, safe defaults, absent-only migration, malformed preservation, countdown revisions and browser UMD.

node tools/check-component-manager.cjs
Component manager checks passed: all-hidden/re-add/reload, untouched timer/layout/media/note data, keyed/clear storage events, owner hidden-state refresh, clock synchronization without layout reload, delayed layout clamp, malformed/quota fallback and settings/config recovery.

node tools/regress-component-manager.cjs
Component settings regression passed: shortcut/AI false-to-true-to-false controls, cross-tab/MCP refresh, canonical defaults, malformed-state preservation, unchanged content/layout/timer data and zero refresh writes.

node tools/check-layout-profiles.cjs
LAYOUT_PROFILES_OK: strict import, legacy preservation, wide/narrow isolation, previous versions, stale-tab conflict and quota rollback
PROFILE_RECOVERY_OK: malformed legacy remains recoverable, invalid current record protected, no-op save preserves previous version

node tools/check-adaptive-settings.cjs
ADAPTIVE_SETTINGS_OK: schema, all-off, malformed JSON, denied reads, quota failure, distinct storage and video scheduling
ADAPTIVE_APPEARANCE_OK: 32 palette/toggle combinations, actual-surface contrast, manual slider, smooth updates, and accessibility CSS
ADAPTIVE_INTERACTIONS_OK: Escape stays inside panel and root theme changes check the source even with adaptive opacity

node tools/check-home-widgets.cjs
HOME_WIDGETS_GEOMETRY 1536x740: x=1016 y=180 width=320 height=544
HOME_WIDGETS_GEOMETRY 1920x1080: x=1400 y=180 width=320 height=640
HOME_WIDGETS_OK

node tools/check-removed-features.cjs
Removed feature visibility, settings, manager, and layout checks passed.

node tools/check-layout-save.cjs
LAYOUT_SAVE_CHECK_OK: schema, malformed-storage and storage-failure assertions passed

node tools/check-layout-stability.cjs
LAYOUT_STABILITY_OK: reload recovery, tab isolation, profile/size/revision guards, malformed/denied storage, discard, reorder, delete undo across reload, stale-tab refusal, quota atomicity

node tools/check-manual-editor.cjs
MANUAL_EDITOR_CHECK_OK: snapping, history, pointer cancel, exact Cancel, 1/10px keys, failed save, save/lock/reload, legacy data, and non-hijacked content
PRECISE_CENTER_OK: resizing and centering in one action uses the new rendered width

node tools/regress-bookmark-completion.cjs
BOOKMARK_MOCK_CHROME_OK: permission/denial/errors/races, zh_TW, tree/folders/search, safe anchor targets, local icons, create/update/cancel, delete/undo/failures, duplicate prevention and unrelated-data preservation
BOOKMARK_MOCK_FIREFOX_OK: permission/denial/errors/races, zh_TW, tree/folders/search, safe anchor targets, local icons, create/update/cancel, delete/undo/failures, duplicate prevention and unrelated-data preservation.
BOOKMARK_REAL_API_UNVERIFIED: this suite uses isolated mocks only; it does not install an extension, navigate a real bookmark, access user data, or prove real browser API behavior.

node tools/regress-layout-daily.cjs
CLOCK_FALLBACK_GEOMETRY 1536x740: clock=287,32,150,150 date~=449,96.5,108,21
CLOCK_FALLBACK_GEOMETRY 1920x1080: clock=287,220,150,150 date~=449,284.5,108,21
PASS: Clock fallback uses the strict 20% threshold, preserves scale and never mutates saved data
PASS: Clock date uses the right-hand midpoint, then the lower midpoint when space is insufficient
PASS: Rendered clock fallback is editable, saves only on Save, and respects the newly saved position
PASS: Today widgets keep defaults until moved, save in the existing profile and restore without extra storage keys
PASS: A recoverable draft blocks previous-version preview without changing any layout
PASS: Invalid or unavailable saved storage refuses preview without touching the screen
PASS: A preview cannot replace a draft that is already being edited
PASS: Recovery remains available if the second storage read refuses editor entry
PASS: Normal draft recovery still warns on accidental close and cancel restores the saved layout
PASS: An allowed previous-version preview remains undoable and cancel preserves saved bytes
PASS: Failed preview save retains recovery, undo, and retry without damaging saved data
PASS: Entering edit renders the latest saved profile before the first 1px keyboard nudge
PASS: Entering edit immediately after resize uses the saved narrow coordinates, not stale wide pixels
PASS: Unchanged manual layout stays byte-for-byte through opening and cancelling edit
PASS: Narrow editor entry keeps a 44px second-row control and yields to open utility panels
PASS: Idle layout dock stays hidden; edit, save and cancel preserve the hidden idle state
PASS: Pending draft remains visible and discard hides the recovery-only dock without writes
LAYOUT_DAILY_OK: 17 integration regressions passed; storage was in-memory only

node tools/regress-panel-interactions.cjs
PASS GALLERY_MODE_CONTROLS
PASS BOOKMARK_FOCUS_AND_ESCAPE
PASS FOCUS_PANEL_ESCAPE
PASS TASK_RENAME
PASS SEARCH_DISMISSAL_AND_ORDER
PASS GALLERY_RENDER_RACE

node tools/check-clock-lifecycle.cjs
Clock lifecycle checks passed: late/early controls, one runtime across resize, ticking re-add, mode synchronization, no hidden-tab timers, malformed preservation and untouched saved positions.
Clock defaults checks passed: new-install visibility, positive toggle/readback, video dates, 12/24 hours, greeting, locale fallback and scoped layout styling.

git diff --check
結束碼 0（僅有既有檔案 LF/CRLF 轉換提示）
```

- 指定瀏覽器探測未能完成：原命令因 `../out-after` 位於唯讀工作區而回報 `PermissionError: [WinError 5]`。改用 repo 內暫存輸出路徑重試後，Playwright 啟動瀏覽器子程序時同樣遇到 `PermissionError: [WinError 5]`（建立 pipe 被拒），因此未產生 `LAYOUT_PROBE_OK`，也未驗證實際畫面座標/無重疊。
- `tools/regress-local-mcp-components.cjs` 未執行；依需求忽略其基線既有失敗。

## 未完成項目

- 瀏覽器視覺探測待在允許 Playwright 子程序與輸出目錄的環境執行。

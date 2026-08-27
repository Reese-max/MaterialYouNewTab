# AGENTS.md

本檔案適用於整個儲存庫，提供 Codex、Claude Code、Kiro、OpenCode 與其他自動化程式代理共同遵循的維護規則。

## 專案定位

本儲存庫是 `prem-k-r/MaterialYouNewTab` 的 Reese-max 客製版本。任何修改都必須同時維護兩條產品線：

1. 上游 Material You New Tab 的既有與後續功能。
2. Reese-max 的繁體中文優先、生產力工作區與本機優先功能。

不得用「直接覆蓋上游檔案」或「直接恢復上游版本」的方式解決衝突。必須逐一融合行為、儲存格式、語系、權限與介面。

## 不可退化的核心能力

### 上游能力

- 多搜尋引擎與搜尋建議
- 捷徑、自訂圖示、SVG 清理與失敗回退
- 每日語錄
- `Alt + 1` 至 `Alt + 9` 捷徑
- AI Tools 與右鍵設定
- 書籤、天氣、桌布、主題、透明度與 Google Apps
- 更新後的 What's New 頁面
- Chromium 與 Firefox Manifest
- 所有已納入的上游語系

### Reese-max 能力

- `zh_TW` 為首次使用的預設語言，英文為缺漏字串回退
- 習慣與專注統計
- Work、Study、Relax 與自訂 Workspace
- Scratchpad、智慧清單、轉待辦、複製與 Markdown 匯出
- Search Bangs、Command Palette 與快捷鍵指南
- Pomodoro 與環境音
- 無障礙、高對比、減少動畫與文字縮放
- 本機備份、驗證、還原與失敗回滾

## 安全與隱私底線

- 不得加入分析、遙測、追蹤、遠端記錄或自動上傳使用者資料。
- 不得提交 API 金鑰、Token、Cookie、個人資料或其他祕密。
- 權限必須維持最低化；可選功能優先使用 optional permissions。
- 不得加入遠端可執行 JavaScript、Wasm、字串 `eval`、`new Function` 或 HTML inline event handler。
- 所有使用者提供的 HTML、SVG、圖片 URL、匯入檔案與外部資料都必須先驗證或清理。
- 新增網路服務、權限、儲存欄位或資料傳輸時，必須同步更新 `privacy-policy.html`。
- 背景服務、解除安裝網址、回饋頁與文件不得指向不屬於本 Fork 的資料收集表單。

## 語系規則

- `locales/en.js` 是完整字串基準。
- `locales/zh_TW.js` 必須完整支援 Reese-max 功能。
- 其他語系缺少客製字串時，使用英文回退；不得因缺少單一鍵而使整頁初始化失敗。
- 修改介面文字時，至少同步英文與繁體中文，並執行語系鍵一致性檢查。
- 不得把現有使用者的語言偏好強制重設為繁體中文。

## 儲存與相容性

- 保留既有 localStorage 與 IndexedDB 鍵值的向後相容性。
- 變更資料格式時，提供明確 migration、版本欄位與安全回退。
- 還原流程必須先驗證，再原子式套用；任何失敗都要恢復原狀。
- 自訂 WeatherAPI 金鑰等敏感設定不得進入一般備份。
- Chromium 與 Firefox 的版本、名稱、描述與必要能力必須同步。

## UI 與可用性

- 保持 Material You 視覺語言與鍵盤、滑鼠、觸控操作。
- 新增互動元件時，提供語意化元素、焦點狀態、ARIA 標籤與鍵盤關閉方式。
- 必須尊重 `prefers-reduced-motion` 與專案內的無障礙設定。
- 不得只修桌面版；至少檢查窄螢幕、長字串與繁體中文排版。
- 圖示載入失敗時必須有安全且可辨識的本機回退。

## 必跑驗證

每次準備提交或更新 PR 前，依序執行：

```bash
node tools/check-customizations.mjs
node tools/check-release-metadata.mjs
node tools/check-upstream-integration.mjs
```

具備 Chromium／Chrome for Testing 與虛擬顯示環境時，再執行：

```bash
xvfb-run -a node tools/smoke-chromium.mjs
```

所有檢查必須通過。不得為了讓 CI 變綠而刪除、放寬或跳過既有斷言；若斷言已過時，需在 PR 中說明行為變更與替代測試。

## 打包規則

- 產物由 `.github/workflows/package-extension.yml` 建立。
- Chromium 套件只使用 `manifest.json`；Firefox 套件以 `manifest(firefox).json` 轉成套件內的 `manifest.json`。
- 產物不得包含 `.git`、`.github`、測試腳本、臨時修復工具、開發報告或其他不必要檔案。
- 不得手動提交 `dist/`、ZIP、瀏覽器 Profile 或測試產物。
- 版本更新時，同步更新兩份 Manifest、README、CHANGELOG／What's New 與發布驗證。

## 上游同步流程

1. 先記錄上游目標 commit。
2. 使用真實 Git merge 保留歷史。
3. 逐一檢查衝突檔，不得一律採用 ours 或 theirs。
4. 確認上游新增語系、權限、背景服務、文件與生命週期行為。
5. 重新融合 Reese-max 功能與英文回退。
6. 執行完整 QA、瀏覽器 smoke 與雙瀏覽器打包。
7. 在 PR 說明已納入的上游 commit、保留的客製能力、權限差異與測試結果。

## Git 與 PR 規則

- 使用功能分支與 Pull Request；不得由代理直接合併至 `main`。
- 不得強制推送、重寫共用歷史或刪除使用者分支，除非使用者明確授權。
- 一個提交處理一個可說明的目的，避免把修復、重構與格式化混在一起。
- 臨時 workflow、repair script、測試報告與 probe branch 完成後必須移除。
- 未通過 QA、存在未解決 P1／P2、或尚未完成實際瀏覽器驗證時，不得宣告可發布。

## 變更摘要

<!-- 說明修改內容、原因，以及是否來自上游同步。 -->

## 影響範圍

- [ ] 上游 MYNT 功能
- [ ] Reese-max 客製功能
- [ ] Chromium Manifest V3
- [ ] Firefox / Zen Manifest V2
- [ ] 多語系或繁體中文
- [ ] 權限、隱私或外部服務

## 驗證

- [ ] `node tools/check-customizations.mjs`
- [ ] `node tools/check-release-metadata.mjs`
- [ ] `node tools/check-upstream-integration.mjs`
- [ ] 已在新瀏覽器設定檔載入 unpacked extension
- [ ] 已測試新分頁、設定、搜尋、捷徑、待辦與專注功能

## 相容性檢查

- [ ] 沒有覆蓋 Today、Workspace、Scratchpad、Search Bang、Command Palette 或環境音功能
- [ ] 上游自訂圖示、每日語錄、`Alt + 1`–`Alt + 9`、AI Tools 右鍵設定仍可使用
- [ ] 新增翻譯缺鍵時能安全回退英文
- [ ] 未加入不必要的權限、祕密或第三方追蹤

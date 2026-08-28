# MYNT 3.4.0 自我驗證指南

本指南把驗證拆成兩部分：

1. **網頁預覽**：確認介面、一般互動、繁體中文、工作模式、待辦、Scratchpad、番茄鐘等前端功能。
2. **擴充套件安裝**：確認新分頁覆寫、權限、書籤、背景 service worker、無痕模式與更新生命週期。

網頁預覽通過不等於擴充套件已完整通過，兩部分都應執行。

## 一、啟用同步網頁預覽

預覽 workflow 已設定為每次以下分支更新時自動重新發布：

- `feature/upstream-full-integration`
- `main`

GitHub Pages 第一次使用需要由 Repository 管理者做一次設定：

1. 開啟 `https://github.com/Reese-max/MaterialYouNewTab/settings/pages`
2. 在 **Build and deployment** 的 **Source** 選擇 **GitHub Actions**
3. 前往 Actions，重新執行 **Deploy web preview** workflow
4. 發布完成後開啟：`https://reese-max.github.io/MaterialYouNewTab/`
5. 驗證中心：`https://reese-max.github.io/MaterialYouNewTab/verify.html`

之後不需要再設定；分支每次 push 都會同步更新同一個網址。

## 二、網頁預覽檢查

先開啟預覽首頁，等待右上角或右下角出現「MYNT 網頁預覽」狀態，再進入 `verify.html`。

最低通過標準：

- 頁面標題與介面預設為繁體中文
- 捷徑數量大於 0，且顯示數量與設定項目數一致
- 控制中心、待辦清單與 Scratchpad 元件存在
- Console 沒有 `ReferenceError`、`TypeError`、`SyntaxError` 或 `Uncaught`
- 搜尋、Search Bang、工作模式、待辦、Scratchpad、番茄鐘與每日語錄可操作
- `Ctrl/Command + K`、`?`、`Alt + 1`～`9` 沒有衝突

### 網頁預覽的已知限制

一般網頁無法模擬：

- `chrome://newtab` 覆寫
- `bookmarks`、`favicon` 與 optional host permissions
- Manifest V3 background service worker
- 擴充功能更新事件與解除安裝 URL
- 無痕模式 `split`

這些項目必須使用下一節的安裝包驗證。

## 三、下載並安裝 Chromium 版本

1. 開啟 `https://github.com/Reese-max/MaterialYouNewTab/actions/workflows/package-extension.yml`
2. 選擇最新且為綠色的 workflow run
3. 在 **Artifacts** 下載 `mynt-extension-packages-*`
4. 解壓外層 ZIP，再解壓 `MYNT-3.4.0-chromium.zip`
5. Chrome：開啟 `chrome://extensions`
6. Edge：開啟 `edge://extensions`
7. Brave：開啟 `brave://extensions`
8. 開啟「開發人員模式」
9. 選擇「載入未封裝項目」，指定剛解壓的 Chromium 資料夾
10. 新開一個分頁確認 MYNT 已取代預設頁面

## 四、真實擴充套件驗證清單

### 基本執行

- 新分頁載入後沒有空白畫面
- DevTools Console 沒有致命 JavaScript 錯誤
- 重新整理與重新啟動瀏覽器後設定仍存在
- 所有按鈕、Modal、拖曳元件與快捷鍵可操作

### 自訂捷徑圖示

依序測試：

1. HTTPS 圖片網址
2. 小於 100 KB 的 PNG、JPEG 或 WebP 上傳
3. 安全的原始 SVG
4. 安全的 SVG data URL
5. 重新整理後圖示仍保留
6. 捷徑重排後圖示仍跟隨正確項目
7. 圖片載入失敗時顯示首字母備援

安全測試至少包含以下內容，預期都必須被拒絕、清空且不得寫入 localStorage：

```html
<svg onload="alert(1)"></svg>
<svg><script>alert(1)</script></svg>
<svg><foreignObject><div>HTML</div></foreignObject></svg>
<svg><a href="javascript:alert(1)">x</a></svg>
```

### 權限與隱私

- 未啟用書籤前，不應主動要求書籤權限
- 拒絕書籤權限後，其他功能仍正常
- 未啟用搜尋建議前，不應要求 Google host permission
- WeatherAPI key 不應出現在匯出的備份檔
- 備份與還原只處理允許的 localStorage／IndexedDB 結構
- 不應出現分析、追蹤或自動上傳請求

### 更新與瀏覽器生命週期

- Chromium Manifest 顯示版本 `3.4.0`
- Firefox Manifest 顯示相同版本
- background service worker 可載入
- 更新頁指向此 Fork 的內容
- 解除安裝 URL 不指向上游作者的私人表單
- 無痕模式行為符合 `split`

## 五、回報問題時應附上的資料

請附：

- 瀏覽器名稱與完整版本
- 作業系統
- 使用的 commit SHA
- 重現步驟
- 預期結果與實際結果
- DevTools Console 錯誤文字
- 必要時附畫面截圖，但不要附 WeatherAPI key 或其他秘密

可直接在 PR #3 留言或建立 Issue。

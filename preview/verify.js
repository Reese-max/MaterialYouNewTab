(() => {
    "use strict";

    const manualChecks = [
        ["web-language", "首次開啟時介面與標題是繁體中文。"],
        ["web-shortcuts", "捷徑區正常顯示，名稱、網址與圖示沒有空白或錯位。"],
        ["web-search", "搜尋框可輸入，Google 搜尋與 Search Bang（例如 !yt）可觸發。"],
        ["web-control", "控制中心可以開啟，工作模式、習慣、隱私與無障礙區塊可見。"],
        ["web-todo", "待辦清單可新增、完成及刪除任務。"],
        ["web-scratchpad", "Scratchpad 可輸入、複製、轉任務並匯出 Markdown。"],
        ["web-workspace", "Work／Study／Relax 工作模式可以切換，顯示的小工具符合預期。"],
        ["web-pomodoro", "番茄鐘可以啟動、暫停與重設；環境音按鈕可操作。"],
        ["web-quote", "每日語錄選項可切換，重新整理後行為符合設定。"],
        ["web-keyboard", "Ctrl/⌘+K、? 與 Alt+1～9 等快捷鍵沒有互相衝突。"],
    ];

    const extensionChecks = [
        ["ext-install", "下載 Chromium ZIP、解壓後以「載入未封裝項目」安裝成功。"],
        ["ext-newtab", "新開分頁實際顯示航點，而不是一般網站分頁。"],
        ["ext-console", "新分頁 DevTools Console 沒有 ReferenceError、TypeError、SyntaxError 或 Uncaught。"],
        ["ext-icon", "自訂圖示可使用圖片網址、上傳圖片與安全 SVG，重載後仍保留。"],
        ["ext-icon-security", "含 script、onload、javascript: 或 foreignObject 的 SVG 會被拒絕且不會保存。"],
        ["ext-bookmarks", "書籤功能只在你主動啟用後要求權限，拒絕時不影響其他功能。"],
        ["ext-suggestions", "搜尋建議只在主動啟用後要求 Google host permission。"],
        ["ext-backup", "備份檔不含 WeatherAPI key；還原成功且錯誤檔案不會破壞目前設定。"],
        ["ext-private", "無痕模式、更新頁與解除安裝連結符合預期，沒有指向上游私人表單。"],
    ];

    function readJson(storage, key, fallback) {
        try {
            const value = storage.getItem(key);
            return value ? JSON.parse(value) : fallback;
        } catch {
            return fallback;
        }
    }

    function setText(id, value) {
        const element = document.getElementById(id);
        if (element) element.textContent = String(value ?? "—");
    }

    function stateLabel(pass, pending = false) {
        if (pending) return ["尚未取得", "pending"];
        return pass ? ["通過", "pass"] : ["需檢查", "fail"];
    }

    function addAutoCheck(list, label, pass, pending = false, detail = "") {
        const item = document.createElement("li");
        item.className = "mynt-auto-check";
        const copy = document.createElement("span");
        copy.textContent = detail ? `${label}：${detail}` : label;
        const state = document.createElement("span");
        const [text, className] = stateLabel(pass, pending);
        state.className = `mynt-check-state ${className}`;
        state.textContent = text;
        item.append(copy, state);
        list.appendChild(item);
    }

    function renderManualChecks(container, namespace, definitions) {
        const key = `myntPreviewManualChecks:${namespace}`;
        const saved = readJson(localStorage, key, {});

        for (const [id, label] of definitions) {
            const wrapper = document.createElement("label");
            wrapper.className = "mynt-manual-check";
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = Boolean(saved[id]);
            const copy = document.createElement("span");
            copy.textContent = label;
            checkbox.addEventListener("change", () => {
                saved[id] = checkbox.checked;
                localStorage.setItem(key, JSON.stringify(saved));
                updateProgress();
            });
            wrapper.append(checkbox, copy);
            container.appendChild(wrapper);
        }
    }

    function updateProgress() {
        for (const namespace of ["web", "extension"]) {
            const section = document.querySelector(`[data-check-group="${namespace}"]`);
            const output = document.querySelector(`[data-check-progress="${namespace}"]`);
            if (!section || !output) continue;
            const checkboxes = [...section.querySelectorAll("input[type='checkbox']")];
            const completed = checkboxes.filter((checkbox) => checkbox.checked).length;
            output.textContent = `${completed} / ${checkboxes.length}`;
            output.className = `mynt-check-state ${completed === checkboxes.length ? "pass" : "pending"}`;
        }
    }

    async function loadMeta() {
        const response = await fetch("preview/meta.json", { cache: "no-store" });
        if (!response.ok) throw new Error(`無法讀取建置資訊（HTTP ${response.status}）`);
        return response.json();
    }

    function renderSnapshot(snapshot) {
        const list = document.getElementById("auto-checks");
        const pending = !snapshot;
        addAutoCheck(list, "已先開啟實際預覽頁", Boolean(snapshot), pending);
        addAutoCheck(list, "文件載入完成", snapshot?.readyState === "complete", pending, snapshot?.readyState || "");
        addAutoCheck(list, "繁體中文預設", snapshot?.lang === "zh-TW", pending, snapshot?.lang || "");
        addAutoCheck(list, "頁面標題存在", Boolean(snapshot?.title), pending, snapshot?.title || "");
        addAutoCheck(list, "捷徑成功渲染", Number(snapshot?.shortcutCount) > 0, pending, snapshot ? `${snapshot.shortcutCount} 個` : "");
        addAutoCheck(
            list,
            "捷徑與設定數量一致",
            snapshot?.shortcutCount === snapshot?.settingsEntryCount && Number(snapshot?.shortcutCount) > 0,
            pending,
            snapshot ? `${snapshot.shortcutCount} / ${snapshot.settingsEntryCount}` : "",
        );
        addAutoCheck(list, "控制中心存在", Boolean(snapshot?.hasControlCenter), pending);
        addAutoCheck(list, "待辦小工具存在", Boolean(snapshot?.hasTodo), pending);
        addAutoCheck(list, "Scratchpad 存在", Boolean(snapshot?.hasScratchpad), pending);
        addAutoCheck(
            list,
            "沒有致命 JavaScript 錯誤",
            Array.isArray(snapshot?.fatalErrors) && snapshot.fatalErrors.length === 0,
            pending,
            snapshot ? `${snapshot.fatalErrors?.length || 0} 個` : "",
        );

        const errorSection = document.getElementById("runtime-errors-section");
        const errorList = document.getElementById("runtime-errors");
        const errors = snapshot?.errors || readJson(sessionStorage, "myntPreviewRuntimeErrors", []);
        if (errors.length > 0) {
            errorSection.hidden = false;
            for (const error of errors) {
                const item = document.createElement("li");
                item.textContent = `${error.kind || "error"}: ${error.message || "Unknown error"}`;
                errorList.appendChild(item);
            }
        }
    }

    document.addEventListener("DOMContentLoaded", async () => {
        const webList = document.querySelector('[data-check-group="web"]');
        const extensionList = document.querySelector('[data-check-group="extension"]');
        renderManualChecks(webList, "web", manualChecks);
        renderManualChecks(extensionList, "extension", extensionChecks);
        updateProgress();

        const snapshot = readJson(localStorage, "myntPreviewLastSnapshot", null);
        renderSnapshot(snapshot);

        try {
            const meta = await loadMeta();
            setText("meta-version", meta.version);
            setText("meta-branch", meta.branch);
            setText("meta-commit", meta.commit);
            setText("meta-built-at", meta.builtAt);
            setText("meta-run", meta.runNumber ? `#${meta.runNumber}` : "本機建置");
            const commitLink = document.getElementById("commit-link");
            if (commitLink && meta.commitUrl) commitLink.href = meta.commitUrl;
            const runLink = document.getElementById("run-link");
            if (runLink && meta.runUrl) runLink.href = meta.runUrl;
        } catch (error) {
            setText("meta-version", error instanceof Error ? error.message : String(error));
        }
    }, { once: true });
})();

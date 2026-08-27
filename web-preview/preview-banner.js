(() => {
    "use strict";

    const fatalPattern = /\b(?:ReferenceError|TypeError|SyntaxError|Uncaught)\b/iu;
    const runtimeErrors = [];

    function persistErrors() {
        try {
            sessionStorage.setItem("myntPreviewRuntimeErrors", JSON.stringify(runtimeErrors.slice(-25)));
        } catch {
            // Storage may be unavailable in strict privacy modes.
        }
    }

    function recordError(entry) {
        runtimeErrors.push({
            time: new Date().toISOString(),
            ...entry,
        });
        persistErrors();
    }

    window.addEventListener("error", (event) => {
        const target = event.target;
        if (target && target !== window && !event.message) {
            recordError({
                kind: "resource",
                message: `Resource failed: ${target.src || target.href || target.tagName || "unknown"}`,
            });
            return;
        }

        recordError({
            kind: "runtime",
            message: event.message || "Unknown window error",
            source: event.filename || "",
            line: event.lineno || 0,
            column: event.colno || 0,
        });
    }, true);

    window.addEventListener("unhandledrejection", (event) => {
        const reason = event.reason instanceof Error
            ? `${event.reason.name}: ${event.reason.message}`
            : String(event.reason || "Unknown rejected promise");
        recordError({ kind: "promise", message: reason });
    });

    async function readMeta() {
        try {
            const response = await fetch("preview/meta.json", { cache: "no-store" });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            return {
                version: "unknown",
                branch: "unknown",
                commit: "unknown",
                buildError: error instanceof Error ? error.message : String(error),
            };
        }
    }

    function createBadge(meta) {
        const badge = document.createElement("aside");
        badge.id = "mynt-web-preview-badge";
        badge.setAttribute("role", "status");
        badge.setAttribute("aria-live", "polite");

        const dot = document.createElement("span");
        dot.className = "mynt-preview-dot";
        dot.setAttribute("aria-hidden", "true");

        const copy = document.createElement("span");
        copy.className = "mynt-preview-copy";
        const title = document.createElement("strong");
        title.textContent = "MYNT 網頁預覽";
        const detail = document.createElement("small");
        const shortCommit = String(meta.commit || "unknown").slice(0, 7);
        detail.textContent = `v${meta.version || "?"} · ${meta.branch || "?"} · ${shortCommit}`;
        copy.append(title, detail);

        const verifyLink = document.createElement("a");
        verifyLink.href = "verify.html";
        verifyLink.textContent = "驗證中心";

        const collapseButton = document.createElement("button");
        collapseButton.type = "button";
        collapseButton.setAttribute("aria-label", "收合或展開預覽狀態");
        collapseButton.textContent = "—";
        collapseButton.addEventListener("click", () => {
            badge.classList.toggle("is-collapsed");
            collapseButton.textContent = badge.classList.contains("is-collapsed") ? "+" : "—";
        });

        badge.append(dot, copy, verifyLink, collapseButton);
        document.body.appendChild(badge);
        return badge;
    }

    function makeSnapshot(meta) {
        const errors = runtimeErrors.slice(-25);
        const fatalErrors = errors.filter((entry) => fatalPattern.test(entry.message || ""));
        const snapshot = {
            checkedAt: new Date().toISOString(),
            version: meta.version || "unknown",
            branch: meta.branch || "unknown",
            commit: meta.commit || "unknown",
            url: location.href,
            title: document.title,
            lang: document.documentElement.lang,
            readyState: document.readyState,
            shortcutCount: document.querySelectorAll("#shortcutsContainer .shortcuts").length,
            settingsEntryCount: document.querySelectorAll("#shortcutList .shortcutSettingsEntry").length,
            hasControlCenter: Boolean(document.querySelector("#controlCenterDialog")),
            hasTodo: Boolean(document.querySelector("#todoListCont")),
            hasScratchpad: Boolean(document.querySelector("#scratchpadContainer")),
            fatalErrors,
            errors,
        };

        try {
            localStorage.setItem("myntPreviewLastSnapshot", JSON.stringify(snapshot));
        } catch {
            // The visible badge still reports the current page state.
        }
        return snapshot;
    }

    document.addEventListener("DOMContentLoaded", async () => {
        document.documentElement.dataset.myntPreview = "web";
        const meta = await readMeta();
        const badge = createBadge(meta);

        window.setTimeout(() => {
            const snapshot = makeSnapshot(meta);
            const hasStructuralProblem = snapshot.shortcutCount < 1
                || snapshot.shortcutCount !== snapshot.settingsEntryCount
                || !snapshot.hasControlCenter
                || !snapshot.hasTodo;

            if (snapshot.fatalErrors.length > 0) {
                badge.dataset.status = "error";
                badge.querySelector("strong").textContent = "預覽偵測到執行錯誤";
            } else if (hasStructuralProblem || meta.buildError) {
                badge.dataset.status = "warning";
                badge.querySelector("strong").textContent = "預覽需要進一步檢查";
            } else {
                badge.dataset.status = "ok";
            }
        }, 1800);
    }, { once: true });
})();

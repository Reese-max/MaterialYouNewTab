// Website-only helper: offers to install the page as an app, once.
// Chromium browsers get their own install prompt behind one button. iOS and iPadOS have
// no install API, so the card shows the two Share-menu steps instead. Nothing is sent
// anywhere; the only stored value is the dismissal flag.
(() => {
    "use strict";

    const DISMISSED_KEY = "myntWebInstallHintDismissed";
    const PERSIST_KEY = "myntWebStoragePersistRequested";
    const SHOW_DELAY_MS = 1500;

    const WORDS = {
        promptTitle: ["Install as an app", "安裝成 App"],
        promptBody: ["Open it from your desktop or home screen in one tap, without typing the address.", "之後從桌面或主畫面一鍵開啟，不用再打網址。"],
        install: ["Install", "安裝"],
        notNow: ["Not now", "不用了"],
        iosTitle: ["Add to Home Screen", "加到主畫面"],
        iosStepShare: ["Tap the browser's Share button", "點瀏覽器的「分享」按鈕"],
        iosStepAdd: ["Choose “Add to Home Screen”, then “Add”", "選「加入主畫面」，再按「加入」"],
        iosNote: ["Add it first, then set things up from the Home Screen icon: the Home Screen app keeps its own data, separate from the browser.", "建議先加入，再從主畫面圖示開啟並設定：主畫面 App 的資料和瀏覽器是分開的。"],
        gotIt: ["Got it", "知道了"],
        region: ["Install this page", "安裝這個頁面"],
    };

    function useChinese() {
        return /^zh-(?:tw|hk|mo|hant)/iu.test(document.documentElement.lang || "");
    }

    function t(key) {
        return WORDS[key][useChinese() ? 1 : 0];
    }

    function readFlag(key) {
        try { return localStorage.getItem(key) === "1"; } catch { return false; }
    }

    function writeFlag(key) {
        try { localStorage.setItem(key, "1"); } catch { /* the card simply returns next visit */ }
    }

    function isInstalled() {
        return matchMedia("(display-mode: standalone)").matches
            || matchMedia("(display-mode: fullscreen)").matches
            || matchMedia("(display-mode: minimal-ui)").matches
            || navigator.standalone === true;
    }

    // iPadOS reports a Mac user agent, so touch support tells the two apart.
    function isAppleTouchDevice() {
        const ua = navigator.userAgent || "";
        return /iPad|iPhone|iPod/u.test(ua) || (/Macintosh/u.test(ua) && navigator.maxTouchPoints > 1);
    }

    let deferredPrompt = null;
    let card = null;

    function svgShareIcon() {
        const ns = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(ns, "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("class", "mynt-install-share");
        const path = document.createElementNS(ns, "path");
        path.setAttribute("d", "M12 15V3.5M8 7.5l4-4 4 4M8.5 10.5H6v10h12v-10h-2.5");
        svg.append(path);
        return svg;
    }

    function closeCard({ remember }) {
        if (!card) return;
        const hadFocus = card.contains(document.activeElement);
        card.remove();
        card = null;
        if (remember) writeFlag(DISMISSED_KEY);
        if (hadFocus) document.getElementById("searchQ")?.focus({ preventScroll: true });
    }

    function button(label, className, onClick) {
        const element = document.createElement("button");
        element.type = "button";
        element.className = className;
        element.textContent = label;
        element.addEventListener("click", onClick);
        return element;
    }

    function showCard(mode) {
        if (card || isInstalled() || readFlag(DISMISSED_KEY) || !document.body) return;

        card = document.createElement("aside");
        card.id = "mynt-install-card";
        card.dataset.mode = mode;
        card.setAttribute("aria-label", t("region"));

        const icon = document.createElement("img");
        icon.className = "mynt-install-icon";
        icon.src = "preview/icons/icon-192.png";
        icon.alt = "";
        icon.width = 44;
        icon.height = 44;

        const copy = document.createElement("div");
        copy.className = "mynt-install-copy";
        const title = document.createElement("h2");
        title.textContent = t(mode === "ios" ? "iosTitle" : "promptTitle");
        copy.append(title);

        const actions = document.createElement("div");
        actions.className = "mynt-install-actions";

        if (mode === "ios") {
            const steps = document.createElement("ol");
            const share = document.createElement("li");
            share.append(t("iosStepShare"), svgShareIcon());
            const add = document.createElement("li");
            add.textContent = t("iosStepAdd");
            steps.append(share, add);
            const note = document.createElement("p");
            note.className = "mynt-install-note";
            note.textContent = t("iosNote");
            copy.append(steps, note);
            actions.append(button(t("gotIt"), "mynt-install-primary", () => closeCard({ remember: true })));
        } else {
            const body = document.createElement("p");
            body.textContent = t("promptBody");
            copy.append(body);
            actions.append(
                button(t("install"), "mynt-install-primary", async () => {
                    const promptEvent = deferredPrompt;
                    deferredPrompt = null;
                    if (!promptEvent) { closeCard({ remember: false }); return; }
                    try {
                        promptEvent.prompt();
                        const choice = await promptEvent.userChoice;
                        closeCard({ remember: choice?.outcome === "accepted" });
                    } catch {
                        closeCard({ remember: false });
                    }
                }),
                button(t("notNow"), "mynt-install-secondary", () => closeCard({ remember: true })),
            );
        }

        card.addEventListener("keydown", (event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            closeCard({ remember: true });
        });

        card.append(icon, copy, actions);
        document.body.append(card);
    }

    // Chromium fires this when the page can be installed; keep the event for the button.
    window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        deferredPrompt = event;
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => showCard("prompt"), { once: true });
        } else {
            showCard("prompt");
        }
    });

    window.addEventListener("appinstalled", () => {
        deferredPrompt = null;
        closeCard({ remember: true });
    });

    document.addEventListener("DOMContentLoaded", () => {
        if (isInstalled()) {
            document.documentElement.dataset.myntInstalled = "true";
            // An installed app is used daily; ask the browser once to keep its data under storage pressure.
            if (!readFlag(PERSIST_KEY) && navigator.storage?.persist) {
                writeFlag(PERSIST_KEY);
                navigator.storage.persist().catch(() => {});
            }
            return;
        }
        if (isAppleTouchDevice()) window.setTimeout(() => showCard("ios"), SHOW_DELAY_MS);
    }, { once: true });
})();

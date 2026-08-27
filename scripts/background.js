/*
 * MYNT lifecycle integration for the Reese-max customized edition.
 * Upstream update notes are retained; uninstall feedback is routed to this fork.
 */

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason !== "update") return;
    chrome.tabs.create({
        url: chrome.runtime.getURL("docs/whats-new.html")
    });
});

chrome.runtime.setUninstallURL(
    "https://github.com/Reese-max/MaterialYouNewTab#feedback"
);

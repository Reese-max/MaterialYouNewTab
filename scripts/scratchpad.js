/*
 * Material You NewTab
 * Copyright (c) 2024-2026 Prem, 2023-2025 XengShi
 * Licensed under the GNU General Public License v3.0 (GPL-3.0)
 * You should have received a copy of the GNU General Public License along with this program.
 * If not, see <https://www.gnu.org/licenses/>.
 */

document.addEventListener("DOMContentLoaded", function () {
    const scratchpadCont = document.getElementById("scratchpadCont");
    const scratchpadContainer = document.getElementById("scratchpadContainer");
    const scratchpadInput = document.getElementById("scratchpadInput");
    const scratchpadCopyBtn = document.getElementById("scratchpadCopyBtn");
    const scratchpadToTaskBtn = document.getElementById("scratchpadToTaskBtn");
    const scratchpadClearBtn = document.getElementById("scratchpadClearBtn");
    const scratchpadDownloadBtn = document.getElementById("scratchpadDownloadBtn");
    const scratchpadCharCount = document.getElementById("scratchpadCharCount");
    const scratchpadCheckbox = document.getElementById("scratchpadCheckbox");

    const STORAGE_KEY = "myntScratchpadContent";

    if (!scratchpadInput) return;

    // Load saved content
    scratchpadInput.value = localStorage.getItem(STORAGE_KEY) || "";
    updateCounts();

    function updateCounts() {
        const text = scratchpadInput.value;
        const charCount = text.length;
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        if (scratchpadCharCount) {
            const readTime = Math.max(1, Math.ceil(words / 200));
        scratchpadCharCount.textContent = `${words} w · ${charCount} c · ~${readTime}m`;
        }
    }

    // Auto-save on input
    scratchpadInput.addEventListener("input", function () {
        localStorage.setItem(STORAGE_KEY, scratchpadInput.value);
        updateCounts();
    });

    document.addEventListener("mynt:scratchpad-action", event => {
        const action = event.detail?.action;
        if (!action || typeof action !== "object") return;
        const previous = scratchpadInput.value;
        if (action.type === "scratchpad.append") {
            const text = typeof action.text === "string" ? action.text.trim().slice(0, 2000) : "";
            if (!text) return;
            const separator = scratchpadInput.value && !scratchpadInput.value.endsWith("\n") ? "\n" : "";
            scratchpadInput.value += `${separator}${text}`;
        } else if (action.type === "scratchpad.replace") {
            const before = typeof action.before === "string" ? action.before.trim() : "";
            if (!before || before.length > 2000 || typeof action.text !== "string" || action.text.length > 2000) return;
            if (scratchpadInput.value.split(before).length !== 2) return;
            scratchpadInput.value = scratchpadInput.value.replace(before, action.text.trim());
        } else {
            return;
        }
        scratchpadInput.dispatchEvent(new Event("input", { bubbles: true }));
        event.detail.applied = true;
        const applied = scratchpadInput.value;
        event.detail.undo = () => {
            if (scratchpadInput.value !== applied) return false;
            scratchpadInput.value = previous;
            scratchpadInput.dispatchEvent(new Event("input", { bubbles: true }));
            return true;
        };
    });

    // Copy all content
    if (scratchpadCopyBtn) {
        scratchpadCopyBtn.addEventListener("click", async function () {
            const text = scratchpadInput.value;
            if (!text.trim()) return;
            try {
                await navigator.clipboard.writeText(text);
                const originalText = scratchpadCopyBtn.textContent;
                scratchpadCopyBtn.textContent = "✓";
                setTimeout(() => {
                    scratchpadCopyBtn.textContent = originalText;
                }, 1500);
            } catch (err) {
                console.error("Failed to copy:", err);
            }
        });
    }

    // Convert selected text or current line to task
    if (scratchpadToTaskBtn) {
        scratchpadToTaskBtn.addEventListener("click", function () {
            const start = scratchpadInput.selectionStart;
            const end = scratchpadInput.selectionEnd;
            let targetText = "";

            if (start !== end) {
                targetText = scratchpadInput.value.substring(start, end).trim();
            } else {
                const value = scratchpadInput.value;
                const lineStart = value.lastIndexOf("\n", start - 1) + 1;
                const lineEnd = value.indexOf("\n", start);
                targetText = value.substring(lineStart, lineEnd === -1 ? value.length : lineEnd).trim();
            }

            // Remove markdown bullet points (- [ ] or - or * or 1.)
            targetText = targetText.replace(/^([-*+]|\d+\.)\s*(\[[ xX]\]\s*)?/, "").trim();

            if (!targetText) {
                targetText = scratchpadInput.value.trim().split("\n")[0] || "";
            }

            if (targetText) {
                document.dispatchEvent(new CustomEvent("mynt:todo-create", { detail: { title: targetText } }));
                const originalText = scratchpadToTaskBtn.textContent;
                scratchpadToTaskBtn.textContent = "✓";
                setTimeout(() => {
                    scratchpadToTaskBtn.textContent = originalText;
                }, 1500);
            }
        });
    }

    
    // Download content as Markdown
    if (scratchpadDownloadBtn) {
        scratchpadDownloadBtn.addEventListener("click", function () {
            const text = scratchpadInput.value;
            if (!text.trim()) return;
            const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `scratchpad-${new Date().toISOString().slice(0, 10)}.md`;
            a.click();
            URL.revokeObjectURL(a);
        });
    }

    // Clear content
    if (scratchpadClearBtn) {
        scratchpadClearBtn.addEventListener("click", async function () {
            if (!scratchpadInput.value.trim()) return;
            const lang = localStorage.getItem("selectedLanguage") || "zh_TW";
            const message = (typeof translations !== "undefined" && (translations[lang]?.scratchpadClearConfirm || translations.en?.scratchpadClearConfirm)) || "Clear scratchpad?";
            if (window.myntDialog ? await window.myntDialog.confirm(message, { danger: true }) : confirm(message)) {
                scratchpadInput.value = "";
                localStorage.removeItem(STORAGE_KEY);
                updateCounts();
            }
        });
    }

    // Toggle container display
    if (scratchpadCont && scratchpadContainer) {
        scratchpadCont.addEventListener("click", function (event) {
            event.stopPropagation();
            const isVisible = scratchpadContainer.style.display !== "none" && getComputedStyle(scratchpadContainer).display !== "none";
            scratchpadContainer.style.display = isVisible ? "none" : "flex";
            scratchpadCont.setAttribute("aria-expanded", String(!isVisible));
            if (!isVisible) {
                scratchpadInput.focus();
            }
        });

        document.addEventListener("click", function (event) {
            if (
                scratchpadContainer.style.display !== "none" &&
                !scratchpadContainer.contains(event.target) &&
                !scratchpadCont.contains(event.target)
            ) {
                scratchpadContainer.style.display = "none";
                scratchpadCont.setAttribute("aria-expanded", "false");
            }
        });
    }

    // Smart list continuation and tab indentation
    scratchpadInput.addEventListener("keydown", function (e) {
        if (e.ctrlKey && e.key === "Enter") {
            e.preventDefault();
            const start = this.selectionStart;
            const text = this.value;
            const lineStart = text.lastIndexOf("\n", start - 1) + 1;
            const lineEnd = text.indexOf("\n", start);
            const currentLine = text.substring(lineStart, lineEnd === -1 ? text.length : lineEnd);

            if (currentLine.includes("- [ ]")) {
                const newLine = currentLine.replace("- [ ]", "- [x]");
                this.value = text.substring(0, lineStart) + newLine + (lineEnd === -1 ? "" : text.substring(lineEnd));
                this.selectionStart = this.selectionEnd = start + 1;
            } else if (currentLine.includes("- [x]") || currentLine.includes("- [X]")) {
                const newLine = currentLine.replace(/- [[xX]]/, "- [ ]");
                this.value = text.substring(0, lineStart) + newLine + (lineEnd === -1 ? "" : text.substring(lineEnd));
                this.selectionStart = this.selectionEnd = Math.max(lineStart, start - 1);
            }
            localStorage.setItem(STORAGE_KEY, this.value);
            updateCounts();
            return;
        } else if (e.key === "Tab") {
            e.preventDefault();
            const start = this.selectionStart;
            const end = this.selectionEnd;
            this.value = this.value.substring(0, start) + "  " + this.value.substring(end);
            this.selectionStart = this.selectionEnd = start + 2;
            localStorage.setItem(STORAGE_KEY, this.value);
            updateCounts();
        } else if (e.key === "Enter") {
            const start = this.selectionStart;
            const text = this.value;
            const lineStart = text.lastIndexOf("\n", start - 1) + 1;
            const currentLine = text.substring(lineStart, start);

            const match = currentLine.match(/^(\s*)(- \[[ xX]\]|-|\*|\d+\.)\s+/);
            if (match) {
                const fullPrefix = match[0];
                const indent = match[1];
                const marker = match[2];
                const contentAfterPrefix = currentLine.substring(fullPrefix.length);

                if (!contentAfterPrefix.trim()) {
                    e.preventDefault();
                    this.value = text.substring(0, lineStart) + text.substring(start);
                    this.selectionStart = this.selectionEnd = lineStart;
                    localStorage.setItem(STORAGE_KEY, this.value);
                    updateCounts();
                    return;
                }

                let nextPrefix = fullPrefix;
                if (/^\d+\./.test(marker)) {
                    const num = parseInt(marker, 10);
                    nextPrefix = `${indent}${num + 1}. `;
                } else if (marker.startsWith("- [")) {
                    nextPrefix = `${indent}- [ ] `;
                }

                e.preventDefault();
                const insertText = "\n" + nextPrefix;
                this.value = text.substring(0, start) + insertText + text.substring(start);
                this.selectionStart = this.selectionEnd = start + insertText.length;
                localStorage.setItem(STORAGE_KEY, this.value);
                updateCounts();
            }
        }
    });

    // Global shortcut (Alt + S) to toggle scratchpad
    document.addEventListener("keydown", function (e) {
        if (e.altKey && (e.key.toLowerCase() === "s" || e.key.toLowerCase() === "n")) {
            const isEditing = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName);
            if (!isEditing || document.activeElement === scratchpadInput) {
                e.preventDefault();
                scratchpadCont?.click();
            }
        }
    });

    // Toggle in settings
    if (scratchpadCheckbox && scratchpadCont) {
        scratchpadCheckbox.addEventListener("change", function () {
            scratchpadCont.style.display = scratchpadCheckbox.checked ? "inline-flex" : "none";
            localStorage.setItem("scratchpadCheckboxState", scratchpadCheckbox.checked ? "checked" : "unchecked");
        });
        const savedState = localStorage.getItem("scratchpadCheckboxState");
        scratchpadCheckbox.checked = savedState ? savedState === "checked" : true;
        scratchpadCont.style.display = scratchpadCheckbox.checked ? "inline-flex" : "none";
    }
});

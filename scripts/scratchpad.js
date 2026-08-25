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
            scratchpadCharCount.textContent = `${words} w · ${charCount} c`;
        }
    }

    // Auto-save on input
    scratchpadInput.addEventListener("input", function () {
        localStorage.setItem(STORAGE_KEY, scratchpadInput.value);
        updateCounts();
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

    // Clear content
    if (scratchpadClearBtn) {
        scratchpadClearBtn.addEventListener("click", function () {
            if (scratchpadInput.value.trim() && confirm("Clear scratchpad?")) {
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

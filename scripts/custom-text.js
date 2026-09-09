/*
 * Material You NewTab
 * Copyright (c) 2023-2025 XengShi
 * Licensed under the GNU General Public License v3.0 (GPL-3.0)
 * You should have received a copy of the GNU General Public License along with this program.
 * If not, see <https://www.gnu.org/licenses/>.
 */

// Custom text
document.addEventListener("DOMContentLoaded", () => {
    const userTextDiv = document.getElementById("userText");
    const userTextCheckbox = document.getElementById("userTextCheckbox");

    // Load and apply the checkbox state
    const isUserTextVisible = localStorage.getItem("userTextVisible") !== "false";
    userTextCheckbox.checked = isUserTextVisible;
    userTextDiv.style.display = isUserTextVisible ? "block" : "none";

    // Toggle userText display based on checkbox state
    userTextCheckbox.addEventListener("change", () => {
        const isVisible = userTextCheckbox.checked;
        userTextDiv.style.display = isVisible ? "block" : "none";
        localStorage.setItem("userTextVisible", isVisible);
    });

    // Set the default language to English if no language is saved
    const savedLang = localStorage.getItem("selectedLanguage") || "en";
    applyLanguage(savedLang);

    // Load the stored text if it exists
    const storedValue = localStorage.getItem("userText");
    if (storedValue) {
        userTextDiv.textContent = storedValue;
    } else {
        // Fallback to the placeholder based on the selected language
        const placeholder = userTextDiv.dataset.placeholder || translations["en"].userText; // Fallback to English
        userTextDiv.textContent = placeholder;
    }

    // Handle input event
    userTextDiv.addEventListener("input", function () {
        localStorage.setItem("userText", userTextDiv.textContent);
    });

    // Remove placeholder text when the user starts editing
    userTextDiv.addEventListener("click", function () {
        if (userTextDiv.textContent === userTextDiv.dataset.placeholder) {
            userTextDiv.textContent = "";  // Clear the placeholder when focused
        }
    });

    // Restore placeholder if the user leaves the div empty after editing
    userTextDiv.addEventListener("blur", function () {
        if (userTextDiv.textContent === "") {
            userTextDiv.textContent = userTextDiv.dataset.placeholder;  // Show the placeholder again if empty
        }
    });

    // All resources are packaged locally; scripts are ordered without remote code.
    if (!document.getElementById("examDashboardStyles")) {
        const style = document.createElement("link");
        style.id = "examDashboardStyles";
        style.rel = "stylesheet";
        style.href = "scripts/exam-dashboard.css";
        document.head.appendChild(style);
        for (const path of ["exam-countdown-core.js", "exam-i18n.js", "exam-dashboard.js"]) {
            const script = document.createElement("script");
            script.src = `scripts/${path}`;
            script.async = false;
            document.head.appendChild(script);
        }
    }
});

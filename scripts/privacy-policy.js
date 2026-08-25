const toggleBtn = document.getElementById("darkModeToggle");
const container = document.getElementById("mainContainer");
const iconPath = document.getElementById("iconPath");
const moonPath = "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z";
const sunPath = "M11 4V1h2v3zm0 19v-3h2v3zm9-10v-2h3v2zM1 13v-2h3v2zm17.7-6.3l-1.4-1.4l1.75-1.8l1.45 1.45zM4.95 20.5L3.5 19.05l1.8-1.75l1.4 1.4zm14.1 0l-1.75-1.8l1.4-1.4l1.8 1.75zM5.3 6.7L3.5 4.95L4.95 3.5L6.7 5.3zM12 18q-2.5 0-4.25-1.75T6 12t1.75-4.25T12 6t4.25 1.75T18 12t-1.75 4.25T12 18";

function setDarkMode(isDark) {
    document.body.classList.toggle("dark-mode", isDark);
    container.classList.toggle("dark-mode", isDark);
    iconPath.setAttribute("d", isDark ? sunPath : moonPath);
    localStorage.setItem("mynt-dark-mode", isDark);
}

const savedMode = localStorage.getItem("mynt-dark-mode");
setDarkMode(savedMode === null
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : savedMode === "true");

toggleBtn.addEventListener("click", () => {
    setDarkMode(!document.body.classList.contains("dark-mode"));
});

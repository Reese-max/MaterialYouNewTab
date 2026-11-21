/*
 * Material You New Tab
 * Copyright (c) 2024-2026 Prem, 2023-2025 XengShi
 * Licensed under the GNU General Public License v3.0 (GPL-3.0)
 * You should have received a copy of the GNU General Public License along with this program.
 * If not, see <https://www.gnu.org/licenses/>.
 */


// ------------------------------- Footer Toast -------------------------------
(function () {
    if (isFirefoxAll || !isDesktop) return; // Don't show on Firefox or mobile

    const TOAST_DURATION = 30 * 1000; // 30 seconds
    const STORAGE_KEY = 'chrome-footer-toast-shown';

    const toast = document.getElementById('chromeFooterToast');
    const progressBar = document.getElementById('toastProgressBar');
    const closeBtn = document.getElementById('toastClose');

    if (!toast || !progressBar || !closeBtn || getComputedStyle(toast).display === 'none') return;
    if (document.documentElement.classList.contains('myntReducedMotion')) return;

    let progressAnimation;

    function showToast() {
        // Check if toast has been shown before
        const hasShown = localStorage.getItem(STORAGE_KEY);
        if (hasShown) return;

        // Show toast after brief delay
        setTimeout(() => {
            if (getComputedStyle(toast).display === 'none') return;
            localStorage.setItem(STORAGE_KEY, 'true');
            toast.classList.add('show');
            startProgress();
        }, 1500);
    }

    function hideToast() {
        toast.classList.remove('show');
        progressAnimation?.cancel();
        progressAnimation = null;
    }

    function startProgress() {
        progressBar.style.transformOrigin = getComputedStyle(toast).direction === 'rtl' ? 'right' : 'left';
        progressAnimation = progressBar.animate(
            [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }],
            { duration: TOAST_DURATION, easing: 'linear', fill: 'forwards' }
        );
        progressAnimation.finished.then(hideToast).catch(() => {});
    }

    // Hover pause
    toast.addEventListener('mouseenter', () => {
        progressAnimation?.pause();
    });

    toast.addEventListener('mouseleave', () => {
        progressAnimation?.play();
    });

    closeBtn.addEventListener('click', hideToast);

    showToast();
})();

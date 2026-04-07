// ===== Theme Manager =====
// Supports: dark, light, auto (system preference)

(function () {
    const STORAGE_KEY = 'wf_theme';
    const html = document.documentElement;

    // Get system preference
    function getSystemTheme() {
        return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }

    // Apply actual theme to <html>
    function applyTheme(mode) {
        const actual = mode === 'auto' ? getSystemTheme() : mode;
        html.setAttribute('data-theme', actual);
    }

    // Update all toggle buttons to reflect current mode
    function updateToggles(mode) {
        document.querySelectorAll('.theme-toggle-option').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.themeValue === mode);
        });
    }

    // Set theme mode (dark / light / auto) and persist
    function setTheme(mode) {
        localStorage.setItem(STORAGE_KEY, mode);
        applyTheme(mode);
        updateToggles(mode);
    }

    // Initialize on load
    function init() {
        const saved = localStorage.getItem(STORAGE_KEY) || 'auto';
        applyTheme(saved);
        updateToggles(saved);

        // Listen for system theme changes (for auto mode)
        window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
            const current = localStorage.getItem(STORAGE_KEY) || 'auto';
            if (current === 'auto') {
                applyTheme('auto');
            }
        });

        // Delegate click events for all theme toggle buttons
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('.theme-toggle-option');
            if (!btn) return;
            const mode = btn.dataset.themeValue;
            if (mode) setTheme(mode);
        });
    }

    // Run init when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Apply saved theme immediately (before DOMContentLoaded) to prevent flash
    const saved = localStorage.getItem(STORAGE_KEY) || 'auto';
    applyTheme(saved);
})();

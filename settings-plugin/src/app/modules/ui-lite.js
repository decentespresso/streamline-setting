// PORT_PLAN.md §4-C: settings.js and api.js touch only a handful of ui.js's
// exports, but ui.js itself imports chart.js, context-menu.js and shotData.js —
// vendoring it would drag ~2,500 lines of skin UI the settings page never uses.
// So this file provides exactly that surface and nothing else.
//
// The split is not just size. Several of these functions drive elements that
// belong to the *skin's* page (#app-toast, #theme-toggle, the machine status bar,
// the steam tile). The plugin renders its own document, so those either grow a
// self-contained implementation here or become explicit no-ops until the KV
// bridge lands — see the notes on each.
import { logger } from './logger.js';

// ── Toast ─────────────────────────────────────────────────────────────────────
// The skin's showToast drives #app-toast, markup that lives in its index.html.
// The plugin has no such element, so the toast builds and owns its own.

let toastHideTimer = null;
let toastEl = null;

const TOAST_COLORS = {
    info: 'var(--mimoja-blue)',
    success: '#0ca581',
    error: '#c0392b',
    alert: '#c0392b',
};

function ensureToast() {
    if (toastEl && toastEl.isConnected) return toastEl;
    toastEl = document.createElement('div');
    toastEl.id = 'app-toast';
    // Fixed, so it is positioned against the scaled <body> the fit script sets up
    // (a transformed element is the containing block for its fixed descendants),
    // which puts it in design pixels like everything else on the page.
    toastEl.style.cssText =
        'position:fixed;left:50%;bottom:48px;transform:translateX(-50%);z-index:10000;' +
        'display:none;padding:18px 36px;border-radius:12px;color:#fff;font-size:24px;' +
        'font-weight:600;max-width:1200px;text-align:center;pointer-events:none;';
    document.body.appendChild(toastEl);
    return toastEl;
}

export function showToast(message, duration = 2400, type = 'info') {
    const el = ensureToast();
    clearTimeout(toastHideTimer);
    toastHideTimer = null;

    el.textContent = message;
    el.style.background = TOAST_COLORS[type] || TOAST_COLORS.info;
    // Errors interrupt; everything else is announced politely.
    const assertive = type === 'error' || type === 'alert';
    el.setAttribute('role', assertive ? 'alert' : 'status');
    el.setAttribute('aria-live', assertive ? 'assertive' : 'polite');
    el.style.display = 'block';

    if (duration > 0) {
        toastHideTimer = setTimeout(() => {
            toastHideTimer = null;
            hideToast();
        }, duration);
    }
}

export function hideToast() {
    clearTimeout(toastHideTimer);
    toastHideTimer = null;
    if (toastEl) toastEl.style.display = 'none';
}

// ── Verbatim from ui.js ───────────────────────────────────────────────────────

/** numpad-modal.js flashes the field it just wrote back to. */
export function flashElement(element) {
    if (element) {
        element.classList.add('flash');
        setTimeout(() => {
            element.classList.remove('flash');
        }, 300); // 300ms flash duration
    }
}

export function flashPlusMinusButton(button) {
    // Add the flash animation class
    button.classList.add('flash-animation');

    // Remove the class after the animation duration (280ms as defined in CSS)
    // This allows the button to revert to its original styling
    setTimeout(() => {
        button.classList.remove('flash-animation');
    }, 280);
}

// ── Skin-owned, stubbed ───────────────────────────────────────────────────────

/**
 * The skin's machine status bar. api.js calls this on socket connect/disconnect;
 * the plugin page has no status bar, and the settings page never reads it.
 */
export function updateMachineStatus(data) {
    logger.debug?.(`machine status: ${data?.status ?? ''}`);
}

/**
 * The skin's version drives its own #theme-toggle checkbox and re-themes the
 * chart module. Here the toggle is settings.js's own control, and there is no
 * chart — so this only has to apply the stored theme to this document and keep
 * writing `theme` to localStorage, which prefs.js mirrors into KV for the skin
 * (PORT_PLAN.md §5). shell.ts defines the dark palette under [data-theme="dark"].
 */
export function initThemeToggle() {
    const applyTheme = (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    };

    const currentTheme = localStorage.getItem('theme') || 'light';
    applyTheme(currentTheme);

    const themeToggle = document.getElementById('theme-toggle');
    if (!themeToggle) return;
    themeToggle.checked = currentTheme === 'dark';
    themeToggle.addEventListener('change', function () {
        applyTheme(this.checked ? 'dark' : 'light');
    });
}

/**
 * Clears ui.js's `milkStopLostToProbe` marker, which records that a steam stop
 * mode was displaced by the milk probe being unplugged. That state is owned by
 * the skin's steam tile and does not exist here, so there is nothing to clear.
 * (ui.js's setMilkProbePresent, which sets the marker, has no caller in settings
 * at all and is deliberately not ported.)
 */
export function clearMilkStopProbeRestore() {}

// The skin's screensaver: its own overlay, its own image cycle, driven from the
// skin's page. PORT_PLAN.md §4-C — these become KV writes plus a postMessage to
// the parent frame in phase 6. Until then a settings change is persisted by the
// caller and simply not previewed live.
export function setScreensaverImages(_images) {}
export function setScreensaverCycleSeconds(_seconds) {}
export function activateScreensaver() {}
export function hideScreensaver() {}
export function isScreensaverActive() { return false; }

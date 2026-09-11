// Skin-side integration for the standalone Settings plugin.
//
// Drop this into streamline_project/src/modules/ and wire it as described in
// skin-integration/README.md. It replaces the in-skin settings subpage
// (?page=settings + src/settings/*) with the plugin, and — the part that does
// not come for free — keeps the *running* skin in step with preferences the
// user changed inside it.
//
// Modelled on dyeStrip.js's openPluginOverlay, which solves the same problem for
// DYE2 and is the proven shape on this hardware.

import { API_BASE_URL, getKVAll } from './api.js';
import { SETTINGS_NAMESPACE, SYNCED_KEYS } from './settingsSync.js';
import { logger } from './logger.js';

const PLUGIN_ID = 'streamline-settings.reaplugin';
const PLUGIN_URL = `${API_BASE_URL}/plugins/${PLUGIN_ID}/settings`;

const synced = new Set(SYNCED_KEYS);

// ── Applying what changed ────────────────────────────────────────────────────
//
// The plugin has already written every changed preference to Decaid's KV (its
// prefs.js mirrors localStorage through settingsSync). So "apply" means: pull
// those keys back down into this origin's localStorage, then re-run whatever
// this page does with them. Keys with no live effect need only the first half —
// the skin reads them next time it looks.

async function applyChangedKeys(keys) {
    const wanted = keys.filter((key) => synced.has(key));
    if (!wanted.length) return;

    let remote;
    try {
        remote = await getKVAll(SETTINGS_NAMESPACE);
    } catch (error) {
        // The durable copy is still correct; this page just stays stale until its
        // next boot, which is the pre-plugin behaviour anyway.
        logger.info(`settings re-read failed: ${error?.message || error}`);
        return;
    }

    const applied = {};
    for (const key of wanted) {
        const value = remote?.[key];
        if (value === undefined || value === null) continue;
        const next = String(value);
        if (localStorage.getItem(key) === next) continue;
        // Through the wrapped setter on purpose: settingsSync's mirror pushing an
        // identical value back to KV is a no-op, and going around it would risk
        // this origin drifting from the record it just read.
        localStorage.setItem(key, next);
        applied[key] = next;
    }

    // Live re-application, cheapest first. Everything else is picked up on read.
    if (applied.theme) {
        document.documentElement.setAttribute('data-theme', applied.theme);
    }
    if (applied.uiZoom || applied.maxStretch) {
        await import('./scaling.js')
            .then(({ initScaling }) => initScaling())
            .catch((e) => logger.info(`rescale after settings failed: ${e.message}`));
    }
    if (applied.language) {
        await import('./i18n.js')
            .then(({ setLanguage, getCurrentLanguage }) =>
                getCurrentLanguage() === applied.language ? null : setLanguage(applied.language))
            .catch((e) => logger.info(`language change after settings failed: ${e.message}`));
    }
    if (applied.tempUnit) {
        await import('./units.js')
            .then(({ setTempUnit }) => setTempUnit(applied.tempUnit))
            .catch((e) => logger.info(`temp unit change after settings failed: ${e.message}`));
    }

    logger.info(`settings applied from plugin: ${Object.keys(applied).join(', ') || 'none'}`);
    // Let the rest of the skin react without this module having to know about it.
    window.dispatchEvent(new CustomEvent('streamline:settings-applied', { detail: { applied } }));
}

// ── The overlay ──────────────────────────────────────────────────────────────

function sentinelReturnUrl() {
    return `${window.location.origin}${window.location.pathname}?settingsReturn=1`;
}

function isSameOrigin(url) {
    try {
        return new URL(url, window.location.href).origin === window.location.origin;
    } catch {
        return false;
    }
}

let overlayListenerBound = false;

/**
 * The plugin posts {type:'streamline:settings-changed', keys:[…]} on its way out.
 * Bound once for the life of the page, not per-open: the message can arrive in
 * the same tick as the frame's navigation to the sentinel, and a listener torn
 * down with the overlay can miss it.
 */
function bindMessageListener() {
    if (overlayListenerBound) return;
    overlayListenerBound = true;
    window.addEventListener('message', (event) => {
        // Only from our own frame. The payload is a list of setting names, but a
        // page we did not open has no business steering what this one re-reads.
        const frame = document.getElementById('settings-plugin-frame');
        if (!frame || event.source !== frame.contentWindow) return;
        if (event.data?.type !== 'streamline:settings-changed') return;
        const keys = Array.isArray(event.data.keys) ? event.data.keys : [];
        applyChangedKeys(keys).catch((e) => logger.warn('settings apply failed', e));
    });
}

export function openSettings() {
    bindMessageListener();
    const ret = sentinelReturnUrl();

    // Cross-origin (dev: skin on :8000, bridge on :8080) — X-Frame-Options blocks
    // the iframe, so navigate the page instead and come back on return.
    if (!isSameOrigin(PLUGIN_URL)) {
        window.location.href = `${PLUGIN_URL}?return=${encodeURIComponent(window.location.href)}`;
        return;
    }

    let overlay = document.getElementById('settings-plugin-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'settings-plugin-overlay';
        overlay.style.cssText =
            'position:fixed;inset:0;z-index:9999;background:var(--bgmain-color,#fff);';
        const frame = document.createElement('iframe');
        frame.id = 'settings-plugin-frame';
        frame.style.cssText = 'width:100%;height:100%;border:0;display:block;';
        // The plugin renders its own header with Cancel/Save, so unlike the DYE2
        // overlay there is no close bar here — closing is the frame reaching the
        // sentinel URL.
        frame.addEventListener('load', () => {
            let href = '';
            try { href = frame.contentWindow.location.href; } catch { return; } // cross-origin
            if (href.includes('settingsReturn=1')) closeSettings();
        });
        overlay.appendChild(frame);
        document.body.appendChild(overlay);
    }
    document.getElementById('settings-plugin-frame').src =
        `${PLUGIN_URL}?return=${encodeURIComponent(ret)}`;
    overlay.style.display = 'block';
}

export function closeSettings() {
    const overlay = document.getElementById('settings-plugin-overlay');
    if (overlay) overlay.style.display = 'none';
    // Deliberately not clearing frame.src: the plugin is ~3 MB of bundle, and
    // keeping it parsed makes the second open instant. It reloads on next open.
}

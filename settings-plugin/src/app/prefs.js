// PORT_PLAN.md §5 — the skin-owned half of the settings page.
//
// Settings writes preferences the *skin* consumes (theme, uiZoom, language,
// screensaverEnabled, keyboardBindings, visualizer*, …) to localStorage. Two
// things break when that page becomes a plugin:
//
//   1. Storage is per-origin. In production the bridge serves both, so the store
//      is physically shared; in dev the skin (:8000) and the bridge (:8080) are
//      different origins and it is not shared at all.
//   2. Even where it is shared, the *running* skin never re-reads it. The user
//      changes the theme, returns, and nothing has changed until a reload.
//
// (1) is already solved upstream: modules/settingsSync.js mirrors exactly these
// keys (SYNCED_KEYS) into Decaid's KV namespace `streamlineSettings` over
// /api/v1/store/, and the skin hydrates from it on boot. It works unchanged here
// — it wraps Storage.prototype rather than touching the ~15 call sites — so this
// module installs it and adds (2).
//
// (2) is this file's own work: tell the skin, while it is still running, which
// keys changed, so it can re-read them and re-apply. See notifySkin().
import { settingsReady, SYNCED_KEYS } from './modules/settingsSync.js';
import { logger } from './modules/logger.js';

const synced = new Set(SYNCED_KEYS);

/** Keys written since the page opened. */
const touched = new Set();

/**
 * Watch what the settings page persists. settingsSync's mirror already pushes
 * these to KV; this only records *which* keys moved, so the skin can be told
 * precisely rather than being asked to re-read everything.
 *
 * Installed as a second wrapper over Storage.prototype, after settingsSync's.
 */
function trackWrites() {
    const proto = window.Storage.prototype;
    if (proto.__settingsPluginTracked) return;
    const { setItem, removeItem } = proto;
    proto.setItem = function (key, value) {
        setItem.call(this, key, value);
        if (synced.has(key)) touched.add(key);
    };
    proto.removeItem = function (key) {
        removeItem.call(this, key);
        if (synced.has(key)) touched.add(key);
    };
    proto.__settingsPluginTracked = true;
}

/**
 * Tell the host page which preferences changed.
 *
 * The skin opens this plugin in a same-origin iframe (dyeStrip.js's
 * openPluginOverlay is the model), so postMessage to the parent reaches it
 * directly. The skin side listens, re-reads those keys from KV, and re-applies
 * theme / zoom / language. That listener is the one change the skin needs —
 * PORT_PLAN.md §5 step 2 and §6 phase 7.
 *
 * Fire-and-forget: no skin listening (opened standalone in dev, or a full-page
 * navigation rather than an iframe) simply means the values are already durable
 * in KV and land on the skin's next boot.
 */
export function notifySkin() {
    const keys = [...touched];
    if (!keys.length) return keys;
    touched.clear();
    try {
        // targetOrigin '*': the payload is a list of setting names the user just
        // changed on their own machine — nothing secret — and the skin's origin
        // is not knowable from inside the frame when it is reached by ?return=.
        window.parent?.postMessage({ type: 'streamline:settings-changed', keys }, '*');
    } catch (error) {
        logger.info(`could not notify the skin: ${error?.message || error}`);
    }
    return keys;
}

/**
 * Pull the durable copy down before the page reads any preference, and start
 * mirroring writes back up.
 *
 * Resolves either way — settingsSync's own boot() never rejects, because a
 * settings page that will not open is worse than one showing stock defaults.
 */
export async function initPrefs() {
    trackWrites();
    await settingsReady;

    // shell.ts already applied the theme from this origin's localStorage before
    // first paint. The hydrate above may have replaced it with the durable copy
    // from KV — the one the skin is actually using — so re-read it here. Cheap,
    // and it is the only synced key with an effect on this document.
    try {
        const theme = localStorage.getItem('theme') || 'light';
        if (document.documentElement.getAttribute('data-theme') !== theme) {
            document.documentElement.setAttribute('data-theme', theme);
        }
    } catch (error) {
        logger.info(`theme apply failed: ${error?.message || error}`);
    }
}

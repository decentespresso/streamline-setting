// Entry point for the browser-side settings app.
//
// Phase 4 (PORT_PLAN.md §6): the chrome. The page markup arrives from
// pages/settings.ts; this mounts settings-shell.js onto it, which owns the
// navigation, the search, the category loaders and save/cancel. Categories
// themselves are phase 5 — everything but Quick Adjustments and Maintenance
// currently renders the placeholder in categories/legacy-category.js.
import { initializeSettingsShell } from "./settings-shell.js";
import { initPrefs } from "./prefs.js";
import { translatePage } from "./modules/i18n.js";
import { logger } from "./modules/logger.js";

async function boot() {
    // Before anything reads a preference: pull the durable copy out of Decaid's KV
    // and start mirroring writes back (PORT_PLAN.md §5). i18n reads `language`, so
    // this has to settle before translatePage below.
    await initPrefs();

    try {
        // Translations are fetched from the plugin's own i18n.csv route. Awaited
        // before the shell mounts so the nav paints in the user's language rather
        // than flashing English first.
        await translatePage();
    } catch (error) {
        // An unreachable or malformed sheet must not cost the user their settings
        // page — English is already in the markup.
        logger.info(`translations unavailable: ${error?.message || error}`);
    }
    await initializeSettingsShell();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
    boot();
}

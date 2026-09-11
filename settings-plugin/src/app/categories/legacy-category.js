// VENDORED from streamline_project/src/settings/categories/legacy-category.js — do not edit.
// Canon is the skin. Change it there, then run `npm run sync` here.
// The port's own edits to this file live as patches in sync-upstream.mjs.
import { getPendingReaChanges } from '../settings-data.js';

export async function mountSettingsCategory(context) {
    context.activateLegacy();
    const { cleanupSettings, initializeSettings } = await import('../settings.js');
    await initializeSettings({
        initialMainCategory: context.mainCategory,
        initialCategory: context.category,
        initialReaChanges: getPendingReaChanges()
    });
    return cleanupSettings;
}

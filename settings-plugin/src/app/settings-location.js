// VENDORED from streamline_project/src/settings/settings-location.js — do not edit.
// Canon is the skin. Change it there, then run `npm run sync` here.
// The port's own edits to this file live as patches in sync-upstream.mjs.
const STORAGE_KEY = 'streamline.settings.location';

export function readSettingsLocation() {
    try {
        const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
        return typeof value?.mainCategory === 'string' && typeof value?.category === 'string'
            ? value
            : null;
    } catch {
        return null;
    }
}

export function writeSettingsLocation(mainCategory, category) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ mainCategory, category }));
    } catch {}
}

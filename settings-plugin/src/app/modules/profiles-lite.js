// The three profile symbols settings.js needs, without the skin's main page.
//
// settings.js imports `availableProfiles`, `translateProfileTitle` and
// `loadAvailableProfiles` from profileManager.js — to fill one <select>: the
// wake profile under Miscellaneous > Presence Detection. profileManager.js is
// 1,163 lines and imports ui.js, context-menu.js, router.js, active-profile.js
// and profile-overrides.js, i.e. the skin's entire main-page tree, none of which
// the settings page has or wants (PORT_PLAN.md §4-C, same call as ui-lite.js and
// dye2-admin.js).
//
// Deliberately NOT ported: profileManager's migrateKvProfilesToRest(). That is a
// one-time migration which POSTs legacy profiles out of the `streamline` KV
// namespace and then DELETES the KV records. It is destructive, it is the skin's
// to run, and a settings page opening in parallel must not be a second actor
// racing it. Everything here is read-only.
import { getProfiles, getValueFromStore } from './api.js';
import { openDB, getSetting, setSetting } from './idb.js';
import { getTranslation } from './i18n.js';
import { loadProfileOverrides, applyOverridesToRecords } from './profile-overrides.js';
import { logger } from './logger.js';

// Same keys and namespace profileManager uses, so this reads the cache the skin
// wrote and vice versa.
const SETTINGS_NAMESPACE = 'streamline-app';
const PROFILES_CACHE_KEY = 'available-profiles-cache';
const DRAFTS_KEY = 'profile-drafts';

export let availableProfiles = {};

/** Verbatim from profileManager.js. */
export function translateProfileTitle(title) {
    if (!title) return title;
    const translatedTitle = getTranslation(title);
    // A translation identical to the key means there was none; keep the original.
    return translatedTitle === title ? title : translatedTitle;
}

/** Local-only "copy now, edit later" profiles, so a draft is selectable too. */
async function mergeDrafts() {
    try {
        const stored = await getValueFromStore(SETTINGS_NAMESPACE, DRAFTS_KEY);
        if (stored && typeof stored === 'object') Object.assign(availableProfiles, stored);
    } catch (error) {
        logger.warn('Could not load profile drafts from KV:', error);
    }
}

// The user's tile edits live in KV rather than on the record; fold them on so a
// renamed profile shows its current title.
async function applyOverrides() {
    try {
        await loadProfileOverrides();
        applyOverridesToRecords(availableProfiles);
    } catch (error) {
        logger.warn('Could not apply profile overrides:', error);
    }
}

/**
 * Populate `availableProfiles` from the bridge, falling back to the IndexedDB
 * cache the skin maintains. Mirrors profileManager's shape — same soft-delete
 * filtering, same cache key, same return value — minus the migration.
 */
export async function loadAvailableProfiles() {
    try {
        const profilesFromApi = await getProfiles();
        availableProfiles = {};
        for (const record of profilesFromApi) {
            // DELETE is a soft delete and 'hidden' is a superseded version kept
            // for the editor's revert history; includeHidden returns both, and
            // neither belongs in a picker.
            if (record.visibility === 'deleted' || record.visibility === 'hidden') continue;
            availableProfiles[record.id] = record;
        }
        await mergeDrafts();
        await applyOverrides();
        try {
            await openDB();
            await setSetting(PROFILES_CACHE_KEY, availableProfiles);
        } catch (error) {
            logger.warn('Could not cache profiles:', error);
        }
        return { profilesFrom: 'API' };
    } catch (apiError) {
        logger.warn('Profile API failed; trying the IndexedDB cache.', apiError);
        try {
            await openDB();
            const cached = await getSetting(PROFILES_CACHE_KEY);
            if (cached && Object.keys(cached).length > 0) {
                availableProfiles = cached;
                await mergeDrafts();
                await applyOverrides();
                return { profilesFrom: 'IDB_CACHE' };
            }
        } catch (idbError) {
            logger.error('Profile API failed and the cache could not be read.', idbError);
        }
        // An empty picker is recoverable; a thrown error would take the whole
        // Presence page down with it.
        availableProfiles = {};
        return { profilesFrom: 'NONE' };
    }
}

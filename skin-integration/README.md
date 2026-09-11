# Skin-side integration (PORT_PLAN.md §6 phase 7)

The plugin is self-contained and needs nothing from the skin to *run*. This
directory covers the other half: pointing the skin at it, and keeping a running
skin in step with preferences changed inside it.

**Nothing here has been applied to `streamline_project`.**

**`streamline_project/src/settings/` is canon and stays.** It is not a leftover to
be removed once the plugin ships — it is where settings code is written. The
plugin vendors from it, permanently. See "Canon" below before editing anything.

## What changes, and why

The plugin already writes every changed preference to Decaid's KV namespace
`streamlineSettings` (its `prefs.js` installs the skin's own `settingsSync.js`
mirror). The skin already hydrates from that namespace on boot. So a cold start
needs no change at all.

What the KV mirror does *not* do is tell the skin that is **currently running**
that something moved. That is the one gap, and `settings-plugin.js` closes it:
the plugin posts the changed keys to the parent frame on exit, the skin re-reads
exactly those keys and re-applies theme / zoom / language / temperature unit.

## Steps

### 1. Add the module

Copy `settings-plugin.js` to `streamline_project/src/modules/settings-plugin.js`.

### 2. Open the plugin instead of the subpage

Three call sites open settings today:

| File | Line | Today |
|---|---|---|
| `src/modules/app.js` | ~2386 | `prefetchSettingsPage().catch(() => {});` |
| `src/modules/app.js` | ~2389 | `loadPage('src/settings/settings.html');` |
| `src/modules/profile_selector.js` | ~336 | `loadPage('src/settings/settings.html');` |

Replace the two `loadPage(...)` calls with `openSettings()` from the new module,
and drop the `prefetchSettingsPage()` call — the plugin is served by the bridge
and is not the skin's to prefetch.

```js
import { openSettings } from './settings-plugin.js';
// …
openSettings();
```

### 3. Keep the router entry until you are confident

`src/modules/router.js` maps `?page=settings` → `src/settings/settings.html`.
Leaving it in place costs nothing and keeps the old page reachable by URL, which
is the cheapest possible rollback while the plugin beds in.

Suggested flag, so a bad release is a one-line revert rather than a rebuild:

```js
const USE_SETTINGS_PLUGIN = localStorage.getItem('streamline.settingsPlugin') !== 'off';
USE_SETTINGS_PLUGIN ? openSettings() : loadPage('src/settings/settings.html');
```

### 4. Keep the in-skin page

Nothing gets deleted. `src/settings/` remains the canonical source, and the
modules the settings page shares with the rest of the skin (`ui.js`, `api.js`,
`i18n.js`, `idb.js`, `numpad-modal.js`, `notes-modal.js`, and every pure-logic
module) were never the plugin's to remove anyway — the plugin has its own copies.

Leaving the router entry from step 3 in place means the in-skin page also stays
reachable, which is what makes step 3's flag a real rollback rather than a
gesture.

## Canon

`streamline_project/src/settings/` is the source of truth. The plugin's
`src/app/settings.js`, `settings-shell.js`, `settings-tree.js`, `settings-data.js`,
`settings-location.js` and `categories/*` are **copies**, regenerated on every
sync.

So:

- **A settings change is made in the skin**, under `src/settings/`. Then
  `npm run sync` in the plugin picks it up.
- **Never edit those files inside the plugin.** The next sync silently reverts
  you — that is the whole point of the mechanism.
- The plugin's *own* code is not canon-derived and is edited here: `prefs.js`,
  `return-to-skin.js`, `api-base.js`, `main.js`, `modules/ui-lite.js`,
  `modules/dye2-admin.js`, everything under `src/pages/`, `src/utils/`,
  `src/assets/`, and the patches in `sync-upstream.mjs`.
- Port edits to canon files live as patches in `sync-upstream.mjs`, never in the
  copies.

`src/styles/skin-vars.css` is also generated (from the skin's `main.css` and
`dark-mode.css`) — same rule, edit the generator.

## Keeping the vendored copies current

The plugin vendors ~7,400 lines from the skin, and will keep doing so. Pull skin
changes in with:

```
cd settings-plugin && npm run sync        # re-copy + re-apply the port's edits
npm run sync:check                        # CI/pre-commit: fail if drifted
```

`sync-upstream.mjs` re-applies every port edit as a declarative patch and fails
loudly if upstream moves a line one depends on. **Never edit a file under
`src/app/` directly** — edit the patch in `sync-upstream.mjs`, or the next sync
silently reverts you.

Releases are watched automatically: `.github/workflows/upstream-watch.yml` checks
`decentespresso/streamline-js` daily and opens a PR when a release changes any
path the sync manifest names. The manifest *is* the "settings only" filter — a
release touching nothing in it is a no-op. Locally, `npm run watch:check` answers
the same question on demand.

Because canon stays in the skin, `sync-upstream.mjs` is permanent infrastructure,
not a migration aid. Run `npm run sync` after any change under `src/settings/`,
and treat a `PATCH FAILED` as what it is: upstream moved a line the port depends
on, and the patch needs re-anchoring before the copies are trustworthy again.

The one thing to watch: the skin and the plugin are now two front-ends over one
body of code. They share `settings.js`, but not their surroundings — the plugin
supplies its own palette, its own daisyUI shim, its own `ui-lite.js`, and reaches
the bridge same-origin. A change that relies on something only the skin provides
will work in the skin and break in the plugin, and `npm test` in the plugin is
what catches it.

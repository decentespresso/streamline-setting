# Streamline Settings plugin

Streamline's settings page as a standalone Decaid plugin.

**What it is for:** running Streamline's settings with a different skin. If you
like how Streamline handles machine settings — calibration, steam, hot water,
maintenance, firmware, the lot — but want to use another skin day to day, install
this and you get that settings page on its own, served by the bridge and opened
from whatever skin you run.

It is a port, not a fork: the settings code is vendored from published releases
of [decentespresso/streamline-js](https://github.com/decentespresso/streamline-js)
and re-synced as new ones land, so it tracks upstream rather than drifting from it.
Modelled on the `dye2` plugin's structure.

See [PORT_PLAN.md](PORT_PLAN.md) for the design and the phase breakdown, and
[skin-integration/](skin-integration/) for the optional Streamline-side wiring.

## Integrating with your own skin

The plugin is self-contained: it serves a complete page, talks to Decaid
itself, and ships its own palette (`skin-vars.css`), fonts and libraries, so it
needs nothing from the skin that opens it. Integrating means two things: opening
it, and optionally reacting to what the user changed.

Machine settings (calibration, steam, hot water, firmware…) apply to the machine
and work with any skin. Preferences that belong to a *skin* (theme, zoom,
language, temperature unit) are only stored; they take effect when the skin
reads them.

### Checklist

- [ ] Install the plugin (see [Install](#install)).
- [ ] Open `<API_BASE>/plugins/streamline-settings.reaplugin/ui?return=<encoded URL>`
      from your settings button.
- [ ] Same origin as Decaid: show it in a full-screen iframe and close it when
      the frame reaches the sentinel URL. Different origin: navigate the whole
      page instead, with `return` set to the current URL.
- [ ] Do not draw a close bar. The plugin has its own Cancel / Save header.
- [ ] Optional: apply changes live (below). Skipping it is safe; the values are
      already in the KV store and land on the skin's next boot.
- [ ] Optional: read the `streamlineSettings` KV namespace on boot, if you want
      the skin to honour theme and the other preferences.

### URL and parameters

| Item | Value |
|---|---|
| Page | `<API_BASE>/plugins/streamline-settings.reaplugin/ui` |
| `API_BASE` | `http://<decaid-host>:8080/api/v1` (8080 is the port the dev tooling here assumes) |
| `?return=` | `encodeURIComponent(url)`. Where Cancel / Save sends the user. Without it the plugin navigates to Decaid's WebUI at `http://<host>:3000/` (hard-coded as `SKIN_PORT` in `return-to-skin.js`), which redirects to the active skin. Always pass it when you iframe the plugin: without it the *frame* goes to `:3000`, the skin loads inside its own overlay, and the overlay never closes. |
| Endpoint name | `ui`, not `settings`: Decaid reserves `/plugins/{id}/settings` for its own route, so a plugin endpoint of that name never gets the request. |
| Origin | Served by Decaid, so it always talks to the Decaid that served it (`api-base.js` uses `location.origin`). |

### How the return works

- **Same origin** (skin page and plugin share scheme, host and port): use a fixed full-screen iframe
  (`z-index: 9999`, `background: var(--bgmain-color)`). Pass a sentinel, a skin
  page URL such as `${origin}${pathname}?settingsReturn=1`, as `return`. On the
  iframe's `load`, read `contentWindow.location.href` inside try/catch; if it
  contains the sentinel, close the overlay (and refresh whatever needs it).
  The sentinel page loads inside the iframe before `load` fires; have your
  skin bail out early when its URL has `settingsReturn=1` and
  `window !== window.top`, or point `return` at a tiny static page you serve.
- **Cross origin** (for example a skin on `:3000` or a dev skin on `:8000`, with Decaid's API on `:8080`):
  the iframe is blocked, so navigate the page with `return` set to the current
  `location.href`. The plugin sends the user back there.

```js
const API_BASE = `http://${location.hostname}:8080/api/v1`; // your Decaid; `${location.origin}/api/v1` if the skin shares its origin
const PLUGIN_URL = `${API_BASE}/plugins/streamline-settings.reaplugin/ui`;
const sameOrigin = new URL(PLUGIN_URL, location.href).origin === location.origin;

function openSettings() {
  if (!sameOrigin) {
    location.href = `${PLUGIN_URL}?return=${encodeURIComponent(location.href)}`;
    return;
  }
  const sentinel = `${location.origin}${location.pathname}?settingsReturn=1`;
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:var(--bgmain-color,#fff)';
  const frame = document.createElement('iframe');
  frame.style.cssText = 'width:100%;height:100%;border:0;display:block';
  frame.addEventListener('load', () => {
    let href = '';
    try { href = frame.contentWindow.location.href; } catch { return; } // cross-origin
    if (href.includes('settingsReturn=1')) overlay.remove();
  });
  frame.src = `${PLUGIN_URL}?return=${encodeURIComponent(sentinel)}`;
  overlay.append(frame);
  document.body.append(overlay);
}
```

A fuller version (overlay reuse, `closeSettings`, live-apply) is in
[skin-integration/settings-plugin.js](skin-integration/settings-plugin.js); copy
it as a starting point. Its wiring steps in
[skin-integration/README.md](skin-integration/README.md) name Streamline's own
files (`app.js`, `profile_selector.js`, `router.js`), so for another skin use the
checklist above instead. `settings-plugin.js` is modelled on `openPluginOverlay` in
`src/modules/dyeStrip.js` of
[streamline-js](https://github.com/decentespresso/streamline-js). `dye2` is a
Decaid *plugin*, not a skin, so it is a reference for plugin structure
(`manifest.json` + `plugin.js`, one `api[]` entry per route, routes at
`/api/v1/plugins/<id>/<api-id>`), not for skin wiring.

### Live-applying changes (optional)

On exit the plugin posts `{ type: 'streamline:settings-changed', keys: [...] }`
to `window.parent`, with targetOrigin `'*'`. The payload is key names only, so
the skin has to re-read the values:

1. Accept the message only if `event.source === iframe.contentWindow`. Bind the
   `message` listener once for the page, not per open. Give the iframe an id (or
   keep a module-level reference) so the listener can find it; the message
   arrives as the frame navigates away.
2. Re-read the keys from the Decaid KV namespace `streamlineSettings`:
   `GET /api/v1/store/streamlineSettings/<key>`, or the whole namespace with
   `GET /api/v1/store/streamlineSettings?full=1`.
3. Apply them.

It lists synced keys written during the session (a value may be unchanged), is
sent on Cancel as well as Save, and is not sent if nothing was written. With a
full-page navigation there is no parent listening, so the message goes nowhere.
Ignoring it is safe.

Keys mirrored to `streamlineSettings` (`SYNCED_KEYS` in `modules/settingsSync.js`):

| Group | Keys |
|---|---|
| Display | `language`, `theme`, `uiZoom`, `maxStretch`, `chartLineWidth`, `tempUnit`, `waterTankUnit`, `waterRefillLevel` |
| Screen and wake | `screensaverEnabled`, `screensaverCycleSeconds`, `blackScreenSaver`, `wakeLockEnabled`, `wakeProfileEnabled`, `wakeProfileId` |
| Help | `streamlineHelpHidden`, `streamlineHelpLaunches` |
| Input | `keyboardBindings` |
| Last-used | `lastGrinderSetting`, `lastTargetDoseWeight` |
| Streamline | `streamline.steamStopMode`, `streamline.steamStopModeFallback`, `streamline.cupWarmerTarget`, `streamline.dye2Enabled`, `streamline.dyeStripMode`, `streamline.ecoSteam`, `streamline.ledSequences`, `streamline.settings.location` |
| Visualizer | `visualizerEnabled`, `visualizerAutoUpload` |

The values are the strings the settings page keeps in `localStorage`; the sync
code compares them with `String(value)`. `theme` is `light` or `dark`, set as
the `data-theme` attribute on `<html>`. Other formats (for example the JSON in
`keyboardBindings`) are defined by the vendored settings code, so treat that as
the reference. `reaHostname` and Visualizer credentials are deliberately not
mirrored.

### Skins other than Streamline

Streamline hydrates from `streamlineSettings` on boot by itself. Any other skin
must implement its own KV reader for that namespace and decide which keys it
honours; nothing in the plugin changes your skin.
The plugin carries its own copy of
Streamline's palette (`--bgmain-color`, `--mimoja-blue`, `--box-color`,
`--text-primary`) and picks light or dark from the synced `theme` key, not from
your CSS. Only the overlay backdrop uses your `--bgmain-color`, so set that to
avoid a flash while the frame loads.

## Layout

```
settings-plugin/          npm project — the source
  src/plugin.ts           host side: routes endpoints to pages and assets
  src/pages/settings.ts   the page shell (ported from settings.html)
  src/utils/shell.ts      page chrome: 1920x1200 fit script, palette, reset
  src/assets/             asset routes (app bundle, translations, iro, EasyMDE)
  src/app/                the browser-side app — real ES modules
    settings.js           the ported 9,862-line settings module
    settings-shell.js     nav, search, category loading, save/cancel
    prefs.js              skin-owned preferences <-> Decaid KV
    modules/              ~7,400 lines vendored from the skin
  src/vendor/             third-party + the translation sheet
  test/                   node --test; suites ported from the skin
streamline-settings.reaplugin/       build output (committed): manifest.json + plugin.js
skin-integration/         skin-side module + instructions (not applied)
```

Two bundles, not one: `plugin.ts` is the host-side IIFE that serves pages, and
`src/app/main.js` is a second IIFE built separately and embedded into it as text.
That is what lets the ported settings code stay real ES modules instead of the
template strings dye2 uses. See PORT_PLAN.md §2.

## Commands

```
npm run build        build:css -> build:app -> vite build   (in that order)
npm run dev          both watchers
npm run serve        dev server on :4555, proxies /api/* and /ws/* to the bridge
npm test             node --test
npm run sync         re-vendor from the LOCAL skin checkout
npm run sync:check   fail if the vendored copies have drifted
npm run watch:check  is there a newer skin RELEASE with settings changes?
npm run watch:sync   vendor from the latest skin release
```

### Where the settings code comes from

**Published releases of `decentespresso/streamline-js` are the source.**
`npm run watch:sync` resolves the latest release, downloads only that tag's
`src/`, filters it through the sync manifest and applies the port's patches.
`settings-plugin/upstream.json` records which tag is vendored — a vendored file
carries the port's patches and is never byte-equal to upstream, so without that
record "which skin version is in here?" has no answer.

`.github/workflows/upstream-watch.yml` runs `watch:check` daily and opens a PR —
build and tests gating it — when a release changes anything vendored.

`npm run sync` is the developer escape hatch: it reads a **local** skin checkout
(`STREAMLINE_SRC`, default `../../streamline_js/streamline_project/src`) so you
can work against skin changes before they are released. A working tree is
normally ahead of the last release, so `sync:check` reporting drift against it is
expected, not a problem — `watch:check` is the one that tracks what ships.

`npm run serve` defaults to `BRIDGE_URL=http://localhost:8080`; override it to
point at a tablet:

```
BRIDGE_URL=http://192.168.1.50:8080 npm run serve
```

Port 4555, not 4444 — dye2's dev server owns that one and the two run side by side.

## Canon: the skin, not this repo

`streamline_project/src/settings/` is the source of truth for settings code, and
stays that way. This plugin vendors from it — `src/app/settings.js`,
`settings-shell.js`, `settings-tree.js`, `settings-data.js`,
`settings-location.js`, `categories/*` and all of `src/app/modules/` are copies,
regenerated by `npm run sync`. So is `src/styles/skin-vars.css`.

**Change settings behaviour in the skin, then `npm run sync` here.** Editing a
vendored copy directly means the next sync silently reverts you.

The port's own edits to those files (relative API base, `ui-lite` in place of
`ui.js`, plugin asset routes, the ESM wrap on `reconnecting-websocket.js`) live
as declarative patches in `settings-plugin/sync-upstream.mjs`. Each asserts its
anchor still matches, so an upstream rewrite fails the sync loudly rather than
dropping the edit.

Code that *is* owned here, and is edited here: `src/plugin.ts`, `src/pages/`,
`src/utils/`, `src/assets/`, and in `src/app/` — `main.js`, `prefs.js`,
`api-base.js`, `return-to-skin.js`, `modules/ui-lite.js`, `modules/dye2-admin.js`.

See [skin-integration/README.md](skin-integration/README.md#canon).

## Install

`streamline-settings.reaplugin/` is the build output and is committed. Decaid installs it
from a GitHub release (`.github/workflows/release.yml` builds, tests, validates
and publishes on a `v*` tag), or from a branch checkout. The release asset is
`streamline-settings.reaplugin-<tag>.zip`, with the `streamline-settings.reaplugin/`
folder as its top-level entry. The folder name must stay
`streamline-settings.reaplugin`: Decaid uses it to recognise the plugin, and
renaming makes it uninstallable.

## Releasing

**The git tag is the version.** Never hand-bump ahead of a tag; the workflow sets
the version from the tag itself.

```bash
git tag v0.1.0
git push origin v0.1.0
```

`.github/workflows/release.yml` then:

1. Rewrites `manifest.src.json` `.version` and `package.json` / `package-lock.json`
   to the tag minus its `v` (the middleware reads the version from `package.json`).
2. Builds (`npm ci && npm run build`) and runs `npm test`.
3. Validates the output: both files non-empty, `id` matches, `apiVersion` and
   `version` present, `plugin.js` contains `createPlugin`.
4. Zips with `streamline-settings.reaplugin/` as the top-level entry and publishes
   `streamline-settings.reaplugin-vX.Y.Z.zip` to Releases.

Pushes to `main` run the same build, test and validate steps and upload the output as
a build artifact. A manual run (`workflow_dispatch`) does the same.

Two rules the workflow can't enforce for you:

- **Commit the rebuilt `streamline-settings.reaplugin/`.** Decaid can install straight
  from the `main` branch, so the committed output must be real. A push to `main`
  whose committed build differs from a clean build raises a CI warning.
- **Keep the branch head at or above the latest tag.** Decaid refuses any install that
  would downgrade an existing one unless downgrades are explicitly allowed. After
  tagging, bring `main`'s `manifest.src.json` version up to the released version, run
  `npm version --no-git-tag-version X.Y.Z` in `settings-plugin`, rebuild and commit.
  This is the one bump you make by hand, and it follows the tag rather than leading it.

Skin bumps from `npm run watch:sync` reach users the same way: merge the PR, then tag.

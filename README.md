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

## Using it with another skin

The plugin is self-contained. It serves a complete page at
`/api/v1/plugins/streamline-settings.reaplugin/ui`, talks to the bridge
itself, and carries its own palette, fonts and libraries — it needs nothing from
the skin that opens it.

A skin opens it the way Streamline opens DYE2: an iframe (or a plain navigation)
pointing at that URL, with `?return=<url>` so the page knows where to go when the
user hits Cancel or Save.

Machine settings apply to the machine and work with any skin. Preferences that
belong to a *skin* — theme, zoom, language, temperature unit — are written to
Decaid's KV store under `streamlineSettings`, and the page posts
`{type:'streamline:settings-changed', keys:[…]}` to its parent frame on exit. A
skin that wants to react can listen; one that does not can ignore it, and nothing
breaks.

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
and publishes on a `v*` tag), or from a branch checkout.

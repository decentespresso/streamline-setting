# Streamline Settings plugin

Streamline's settings page as a standalone Decaid plugin.

**What it is for:** running Streamline's settings with a different skin. If you
like how Streamline handles machine settings — calibration, steam, hot water,
maintenance, firmware, the lot — but want to use another skin day to day, install
this and you get that settings page on its own, served by Decaid and opened
from whatever skin you run.

It is a port, not a fork: the settings code is vendored from published releases
of [decentespresso/streamline-js](https://github.com/decentespresso/streamline-js)
and re-synced as new ones land, so it tracks upstream rather than drifting from it.
Modelled on the `dye2` plugin's structure.

**New here?** Start with the [Quick start](#quick-start). Writing a skin or an automation
(human or AI agent)? [At a glance](#at-a-glance) has every URL, parameter and constant in
one place, and [Verify your integration](#verify-your-integration) has commands with the
output to expect.

See [PORT_PLAN.md](PORT_PLAN.md) for the design and the phase breakdown, and
[skin-integration/](skin-integration/) for the optional Streamline-side wiring.

## Quick start

Three steps. Replace `<decaid-host>` with the host Decaid runs on (`localhost` on the same
machine); Decaid's API is on port 8080.

**1. Install the plugin** with one call to Decaid's plugin API. Decaid then tracks this
repo's releases and updates the plugin for you:

```bash
curl -X POST http://<decaid-host>:8080/api/v1/plugins/install/github-release \
  -H 'content-type: application/json' \
  -d '{"repo": "decentespresso/streamline-setting"}'
```

To run what is on `main` instead of the latest release (the committed build is kept
current, so this works):

```bash
curl -X POST http://<decaid-host>:8080/api/v1/plugins/install/github-branch \
  -H 'content-type: application/json' \
  -d '{"repo": "decentespresso/streamline-setting", "branch": "main"}'
```

Or download `streamline-settings.reaplugin-<tag>.zip` from [Releases](../../releases)
and install it from Decaid's Plugins screen.

**2. Check it is loaded:**

```bash
curl -s http://<decaid-host>:8080/api/v1/plugins \
  | jq '.[] | select(.id=="streamline-settings.reaplugin") | {id, version}'
# { "id": "streamline-settings.reaplugin", "version": "0.1.x" }
```

**3. Open the page** in a browser:

`http://<decaid-host>:8080/api/v1/plugins/streamline-settings.reaplugin/ui`

That is the whole settings page, working. To open it from your own skin, see
[Integrating with your own skin](#integrating-with-your-own-skin).

## At a glance

The facts, in one place. They come from the manifest, the code and a running Decaid. The
install calls are from Decaid's own docs and were not run while writing this.

```yaml
plugin:
  id: streamline-settings.reaplugin      # also the folder name; renaming it makes it uninstallable
  repo: decentespresso/streamline-setting
  release_asset: streamline-settings.reaplugin-<tag>.zip   # exactly one zip; plugin folder at its top level
  permissions: [log, api, emit, pluginStorage]
decaid:
  api_base: http://<decaid-host>:8080/api/v1    # the host that serves the plugin
  list_plugins:    GET  {api_base}/plugins
  install_release: POST {api_base}/plugins/install/github-release   # {"repo": "decentespresso/streamline-setting"}
  install_branch:  POST {api_base}/plugins/install/github-branch    # {"repo": "...", "branch": "main"}
page:
  url: "{api_base}/plugins/streamline-settings.reaplugin/ui"        # 200 text/html
  query:
    return: encodeURIComponent(url)   # where Cancel and Save navigate. Default: http://<host>:3000/ (Decaid's WebUI)
  route_name: ui                      # "settings" is reserved by Decaid and cannot be used
  internal_routes: [app, i18n.csv, iro, easymde, easymde.css, easymde-icons.css, notes-modal.css, inter.css]
                                      # served for the page itself; you never call these
on_exit:
  post_message_to_parent:             # only when the page is inside an iframe
    type: streamline:settings-changed
    keys: [string]                    # key names only; targetOrigin '*'
  kv_namespace: streamlineSettings    # GET {api_base}/store/streamlineSettings?full=1  -> flat JSON object of strings
needs_from_your_skin: nothing         # opening it is all that is required; honouring saved preferences is optional
```

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

- [ ] Install the plugin (see the [Quick start](#quick-start)).
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
  the iframe is blocked (Decaid sends `X-Frame-Options: SAMEORIGIN`), so navigate the page with `return` set to the current
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

The page also behaves like Streamline's own: it scales the way the skin does (uniform
scale, the canvas grows on screens taller than 16:10, `maxStretch` and `uiZoom` read
from the synced store), and its toasts and dialogs are drawn to match the skin's.

## Verify your integration

Each check has an expected result, so a person or a script can run it. `B` is
`http://<decaid-host>:8080/api/v1`.

| # | Check | Expect |
|---|---|---|
| 1 | `curl -s $B/plugins \| jq -r '.[] \| select(.id=="streamline-settings.reaplugin") \| .version'` | a version such as `0.1.4` |
| 2 | `curl -s -o /dev/null -w '%{http_code} %{content_type}' $B/plugins/streamline-settings.reaplugin/ui` | `200 text/html; charset=utf-8` |
| 3 | `curl -s "$B/plugins/streamline-settings.reaplugin/ui" \| grep -c cancel-settings-btn` | `1` (the page has its own Cancel / Save header) |
| 4 | Click your Settings button | the settings page, with no close bar of yours on top |
| 5 | Click **Cancel** | the browser is on exactly the `return` URL you passed (iframe case: the overlay closes) |
| 6 | Change a preference such as language, click **Save**, then `curl -s "$B/store/streamlineSettings?full=1"` | a flat JSON object that includes the key you changed, as a string |
| 7 | Open the page with no `return` and click **Cancel** | you land on `http://<host>:3000/` (Decaid's WebUI), not on a blank page |

Checks 1 to 3 and 6 are plain HTTP and work without a browser. Checks 4, 5 and 7 need a
browser, or a headless one.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| The iframe stays blank, or the console says it refused to connect | Decaid sends `X-Frame-Options: SAMEORIGIN` on the page, so only a skin on the same origin as the API may frame it. A skin on `:3000` with the API on `:8080` is cross-origin | Do not iframe. Navigate the whole page: `location.href = PLUGIN_URL + '?return=' + encodeURIComponent(location.href)` |
| After Save your skin appears *inside* the overlay and the overlay never closes | The iframe was opened without `return`, so the frame itself went to Decaid's WebUI | Always pass `return` when you iframe, and make it a same-origin URL of your skin |
| Overlay never closes even though `return` was passed | The sentinel URL is not on your skin's origin, so reading `contentWindow.location` throws | Build the sentinel from `location.origin` and your own path |
| `/plugins/streamline-settings.reaplugin/settings` returns JSON, not the page | Decaid reserves that path for the plugin's stored settings | Use the page route, `ui` |
| Install is refused as a downgrade | Decaid will not install a lower version over a higher one | Remove the installed plugin first, then install |
| Install says several `.zip` assets | A release carried more than one zip | Releases here carry exactly one; if you fork, keep it that way |
| Red toast "App update checks are not supported on this build" on the Updates page | Decaid refuses update checks on macOS and App Store builds | Harmless: the update badge works regardless |
| Errors such as `504` when reading calibration | Those settings come from the machine, and none is connected | Connect a machine; other settings still work |
| Your skin ignores theme, text size or language | Those are only stored; your skin has to read them | Read `streamlineSettings` at boot ([Live-applying changes](#live-applying-changes-optional)) |

## Working on the plugin

Everything below is for people changing the plugin itself. If you only want to use it,
you can stop here.

## Layout

```
settings-plugin/          npm project — the source
  src/plugin.ts           host side: routes endpoints to pages and assets
  src/pages/settings.ts   the page shell (ported from settings.html)
  src/utils/shell.ts      page chrome: fit script (mirrors the skin's scaling), palette, reset
  src/assets/             asset routes (app bundle, translations, iro, EasyMDE, Inter, notes CSS)
  src/styles/             skin-vars.css (generated), daisy-shim.css, Tailwind input and output
  src/app/                the browser-side app — real ES modules
    settings.js           the ported settings module
    settings-shell.js     nav, search, category loading, save/cancel
    prefs.js              skin-owned preferences <-> Decaid KV
    modules/              mostly vendored from the skin
  src/vendor/             third-party files, the translation sheet, and the generated
                          inter.css (the skin's Inter, inlined) and notes-modal.css
  test/                   node --test: suites ported from the skin, plus
                          routes (route contract), scaling and smoke tests
.github/workflows/        release.yml (build + publish on a tag), upstream-watch.yml
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
npm run serve        dev server on :4555, proxies /api/* and /ws/* to Decaid
npm test             node --test
npm run sync         re-vendor from the LOCAL skin checkout
npm run sync:check   fail if the vendored copies have drifted
npm run watch:check  is there a newer skin RELEASE with settings changes?
npm run watch:sync   vendor from the latest skin release
node watch-upstream.mjs --tag vX.Y.Z    vendor a specific skin release
```

### Where the settings code comes from

**Published releases of `decentespresso/streamline-js` are the source.**
`npm run watch:sync` resolves the latest release, downloads only that tag's
`src/`, filters it through the sync manifest and applies the port's patches.
`settings-plugin/upstream.json` records which tag is vendored — a vendored file
carries the port's patches and is never byte-equal to upstream, so without that
record "which skin version is in here?" has no answer.

`.github/workflows/upstream-watch.yml` runs daily. When a release changes anything
vendored it syncs it, builds, runs the tests and ships it as a new plugin release; see
[Skin releases are automatic](#skin-releases-are-automatic).

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

`src/settings/` in [decentespresso/streamline-js](https://github.com/decentespresso/streamline-js)
is the source of truth for settings code, and stays that way. This plugin vendors from it — `src/app/settings.js`,
`settings-shell.js`, `settings-tree.js`, `settings-data.js`,
`settings-location.js`, `categories/*` and all of `src/app/modules/` are copies,
regenerated by `npm run sync`. So are `src/styles/skin-vars.css`, `src/vendor/inter.css`
and `src/vendor/notes-modal.css`.

**Change settings behaviour in the skin, then `npm run sync` here.** Editing a
vendored copy directly means the next sync silently reverts you.

The port's own edits to those files (relative API base, `ui-lite` in place of
`ui.js`, plugin asset routes, the ESM wrap on `reconnecting-websocket.js`) live
as declarative patches in `settings-plugin/sync-upstream.mjs`. Each asserts its
anchor still matches, so an upstream rewrite fails the sync loudly rather than
dropping the edit.

Code that *is* owned here, and is edited here: `src/plugin.ts`, `src/pages/`,
`src/utils/`, `src/assets/`, `src/styles/daisy-shim.css`, `tailwind.config.js`, and in
`src/app/` — `main.js`, `prefs.js`, `api-base.js`, `return-to-skin.js`,
`modules/ui-lite.js`, `modules/dye2-admin.js`, `modules/profiles-lite.js`.

See [skin-integration/README.md](skin-integration/README.md#canon).

## Releasing

**The git tag is the version.** Never hand-bump ahead of a tag; the workflow sets
the version from the tag itself.

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

`.github/workflows/release.yml` then:

1. Rewrites `manifest.src.json` `.version` and `package.json` / `package-lock.json`
   to the tag minus its `v` (the middleware reads the version from `package.json`).
2. Builds (`npm ci && npm run build`) and runs `npm test`.
3. Validates the output: both files non-empty, `id` matches, `apiVersion` and
   `version` present, `plugin.js` contains `createPlugin`.
4. Zips with `streamline-settings.reaplugin/` as the top-level entry and publishes
   `streamline-settings.reaplugin-vX.Y.Z.zip` to Releases.

What Decaid needs from a release, all of which `release.yml` guarantees: the tag equals the
manifest `version` without its `v`, and the release carries exactly one `.zip` asset with the
`streamline-settings.reaplugin/` folder as its top-level entry. Decaid's own reference is
`doc/Plugins.md` in [decentespresso/decaid](https://github.com/decentespresso/decaid).

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

### Skin releases are automatic

`.github/workflows/upstream-watch.yml` runs daily. When a new `decentespresso/streamline-js`
release changes the vendored settings code it:

1. syncs the files, bumps the manifest and `package.json` to the next patch version, then builds
   and runs `npm test`;
2. opens a PR, squash-merges it (the PR stays as the record), tags the merge commit
   and runs `release.yml` against the tag, which publishes the zip.

Because the version is bumped before the tag, `main` is never below the latest release and
there is no manual catch-up commit on this path.

Nothing is merged or released if anything fails. The job opens (or comments on) an issue
labelled `upstream-sync-failed`, and a tag build that fails opens a `release-failed` issue.
`test/routes.test.mjs` is the contract that catches what a sync most often breaks: the
three route lists disagreeing, a route not serving, or vendored code loading an asset path
the plugin has no route for. A manual run pinned to a tag (`workflow_dispatch` with `tag`)
opens the PR only and never releases.

Hand-made releases (your own changes) still follow the steps above: tag, then bump.

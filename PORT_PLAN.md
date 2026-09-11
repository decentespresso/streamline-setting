# Porting Streamline Settings to a standalone REA plugin

Source: `streamline_js/streamline_project/src/settings` (+ ~23 modules it imports)
Model:  `streamline_js/dye2` (dye2-plugin → dye2.reaplugin)

## 1. What dye2 actually is (the structure being copied)

```
dye2/
├── dye2-plugin/            # source, npm project
│   ├── package.json        # build:css (tailwind) → vite build; dev (watch); serve (dev-server)
│   ├── vite.config.ts      # lib build, IIFE, name=createPlugin, out ../dye2.reaplugin/plugin.js
│   │                       # + closeBundle hook copying manifest.src.json → manifest.json
│   ├── manifest.src.json   # id/permissions/api[] — NOT named manifest.json (Decaid refuses 2 manifests)
│   ├── tailwind.config.ts  # scans src/**/*.ts (classes live in template strings)
│   ├── dev-server.mjs      # loads built plugin.js in node:vm, serves routes, proxies /api/* → bridge:8080
│   └── src/
│       ├── plugin.ts       # default export createPlugin(host) → { onLoad, onEvent, __httpRequestHandler }
│       ├── host.d.ts       # PluginHost / HttpRequest / HttpResponse types
│       ├── pages/*.ts      # one module per endpoint, returns HttpResponse with full HTML
│       ├── utils/          # dev-shell.ts (page shell + fit script + CSS var fallbacks)
│       │                   # dev-api.ts (browser API client, exported as a STRING to inline)
│       │                   # html.ts, shared-components.ts, plotly-asset.ts
│       └── styles/tailwind.generated.css   (imported `?inline`, no CDN — tablet is offline)
├── dye2.reaplugin/         # build output only: manifest.json + plugin.js (1.5 MB, committed)
└── .github/workflows/release.yml   # tag → sync version into manifest.src.json → build → release
```

Runtime contract: bridge serves the plugin at `/api/v1/plugins/<id>/<endpoint>`; each endpoint
returns a complete self-contained HTML document. The skin opens it in a same-origin `<iframe>`
overlay (`dyeStrip.js:openPluginOverlay`) passing `?return=<url>`; the page navigates to that URL
to close. Browser-side code talks to the bridge REST at `/api/v1/*` like any other client.

## 2. Deviation from dye2 worth making

dye2 authors browser JS as **template strings** (`dev-api.ts` exports a string). Settings is ~10k
lines of real ES modules with 26 imports — stringifying it would be a rewrite, not a port.

Instead: **two bundles.**
- `src/plugin.ts` → IIFE plugin (host side). Tiny: routes endpoints, serves HTML + assets.
- `src/app/main.js` → second vite entry, IIFE browser bundle. Ported settings code stays real ES
  modules. plugin.ts imports the built bundle as text (`?raw`, same trick as `tailwind.css?inline`
  / `plotly-asset.ts`) and serves it at the `app.js` endpoint.

Everything else follows dye2 exactly.

## 3. Target layout

```
streamline_setting_plugin/
├── settings-plugin/
│   ├── package.json  tsconfig.json  vite.config.ts  tailwind.config.js
│   ├── manifest.src.json          # id: streamline-settings.reaplugin
│   ├── dev-server.mjs             # routes: /settings, /app.js, /i18n.csv, /iro.js; proxy /api/*
│   ├── src/
│   │   ├── plugin.ts  host.d.ts
│   │   ├── pages/settings.ts      # HTML shell (settings.html markup) + <script src="app.js">
│   │   ├── utils/shell.ts         # dev-shell.ts port: fit script, CSS var fallbacks, keyboard shift
│   │   ├── assets/                # app-bundle.ts, i18n-csv.ts, iro.ts — `?raw` → HttpResponse
│   │   └── app/                   # ← the port lives here, real ES modules
│   │       ├── main.js            # boot: mount into #settings-content-area, wire save/cancel/return
│   │       ├── settings.js  settings-shell.js  settings-tree.js
│   │       ├── settings-data.js   settings-location.js
│   │       ├── categories/{quick-adjustments,maintenance,legacy-category}.js
│   │       └── modules/           # vendored subset (§4)
│   └── test/                      # node --experimental-strip-types, like dye2
└── streamline-settings.reaplugin/            # build output: manifest.json + plugin.js
```

Endpoints in `manifest.src.json`: `settings`, `app.js`, `i18n.csv`, `iro.js`.
Permissions: `log`, `api`, `emit`, `pluginStorage`.

## 4. Dependency triage (the actual work)

**A — copy unchanged** (pure logic, no host coupling): `eco-steam` 121, `units` 97, `machine` 73,
`steam-mode` 267, `firmware-progress` 292, `led-color` 51, `cup-warmer` 246, `loadcell-cal` 114,
`sensor-cal` 161, `settings-search` 106, `home-assistant` 53, `logger` 18, `screensaver-policy` 161,
`idb` 501, `numpad-modal` 550, `notes-modal` 273, `vendor-loader` 52. ≈3.1k lines, mechanical.

**B — `api.js` (2852)**: port with two edits. In production the plugin is served *by* the bridge, so
`API_BASE_URL` becomes relative `/api/v1` and WS becomes `ws://${location.host}/ws/v1/...` instead of
`http://${reaHostname}:8080`. Drop the `reaHostname` localStorage indirection (bridge is always self).
Everything else — REST, ReconnectingWebSocket, socket-slot, firmware NDJSON — carries over intact.

**C — `ui.js` (3186) → `ui-lite.js`**: only 6 things are used. `showToast` (134 call sites),
`Wheel`, `Slider`, `initThemeToggle`, `flashPlusMinusButton`, `setMilkProbePresent`/
`clearMilkStopProbeRestore`. Extract those; do not copy the file.
The 4 screensaver functions (`setScreensaverImages`, `activateScreensaver`, `hideScreensaver`,
`isScreensaverActive`) drive the **skin's** screensaver — the plugin cannot call them. They become
KV writes + a postMessage to the parent (§5).

**D — drop**: `scaling.js` (dye2's fit script in `shell.ts` already supersedes it — same 1920×1200
design reference, same MAX_STRETCH clamp), `router.js` `loadPage` (→ `?return=` navigation).

**E — `i18n.js` (288)**: fetches `src/ui/de1 gui translation - Sheet1.csv` from the skin origin.
Serve that CSV as the `i18n.csv` plugin endpoint and repoint the fetch.

**F — `dyeStrip.js` (777)**: only the Extensions→DYE2 subcategory needs it. Keep the
`/api/v1/plugins/*` install/update calls; drop strip rendering and `openPluginOverlay`.

**G — vendor `iro` (LED colour picker)** as an asset endpoint. Tablet is offline, no CDN.

## 5. The hard problem: skin-owned state

Settings writes prefs the *skin* consumes, via `localStorage`:
`theme, uiZoom, language, tempUnit, screensaverEnabled, screensaverCycleSeconds, wakeLockEnabled,
waterTankUnit, waterRefillLevel, keyboardBindings, visualizerEnabled, visualizerAutoUpload,
streamline.steamStopMode*`.

In production skin and plugin are same-origin so localStorage is physically shared — but the
*running* skin never re-reads it, and in dev (skin :8000 / bridge :8080) it isn't shared at all.

Solution already exists in the codebase: `modules/settingsSync.js` mirrors exactly these keys
(`SYNCED_KEYS`) into Decaid KV namespace `streamlineSettings`, over
`GET/PUT/DELETE /api/v1/store/streamlineSettings/{key}`, and the skin hydrates from it at boot.

So:
1. Plugin writes skin prefs to KV, not localStorage. Vendor `settingsSync.js`'s key list; replace
   the `localStorage.setItem` call sites in the ported settings.js with a `pref.set(key, value)`
   helper that writes KV (and localStorage as a same-origin fast path).
2. Live skin gets told: `window.parent.postMessage({ type: 'streamline:settings-changed', keys })`
   on save. **Skin-side change required** — a listener that re-hydrates those keys from KV and
   re-applies theme / zoom / language / screensaver. Not optional; budget it.
3. Full-page fallback (dev, cross-origin iframe blocked): skin re-hydrates on `?return=` landing.

## 6. Phases

> **Status (2026-09-10):** phases 1-6 and 8 are done and verified; phase 7 is
> written but deliberately not applied — see `skin-integration/`. Notes below
> record what each phase actually turned up.

1. **Scaffold** — copy dye2's package.json/vite.config/tsconfig/tailwind/dev-server/host.d.ts/
   html.ts/dev-shell.ts, rename to `streamline-settings.reaplugin`, serve a stub `settings` page. Verify the
   whole loop: `npm run build` → install in Decaid → page opens; `npm run serve` → dev at :4444.
   *Gate: nothing else starts until install + dev-server both work.*
2. **Second bundle** — wire the `app.js` entry + `?raw` asset serving. Ship a hello-world module
   graph. Confirms the deviation in §2 before 10k lines depend on it.
3. **Vendor group A + api.js (B) + ui-lite (C)** with the base-URL rewrite. Port dye2's test style
   (`node --experimental-strip-types`) for the logic modules that have branchy behaviour
   (firmware-progress, sensor-cal, cup-warmer, steam-mode, settings-search).
4. **Chrome** — settings.html markup into `pages/settings.ts`, plus settings-tree / settings-shell /
   settings-location / settings-data. Nav + search + save/cancel work against an empty content area.
5. **Machine-side categories** — the clean bulk, no skin coupling, straight bridge REST:
   quick adjustments, steam, hot water, water tank, flush, de1advanced, calibration
   (fan/voltage/refillkit/sensors/loadcell), machine info, USB, cup warmer, LED, maintenance,
   firmware update. Most of the 9862 lines.
6. **Skin-coupled categories** on top of §5's KV bridge: theme, active skin, language, display size,
   brightness, screensaver, wake lock, presence, temperature unit, keyboard shortcuts, visualizer /
   shot uploader, plugins, DYE2, Print The Shot, Decaid settings, user manual.
7. **Skin side** — `openSettingsOverlay()` (copy `dyeStrip.js:openPluginOverlay`), the
   settings-changed listener, feature flag to fall back to in-skin settings.
   **`src/settings/` is canon and is not deleted** (decided 2026-09-11): it stays the
   source of truth, the plugin vendors from it, and `sync-upstream.mjs` is therefore
   permanent infrastructure rather than a migration aid. See `skin-integration/README.md`.
8. **CI** — copy `.github/workflows/release.yml`, retarget paths, tag → GitHub release → Decaid
   installs from release.

## 7. Risks

- ~~**Two WebSocket clients.**~~ *(Resolved in phase 1: verified live against a
  running bridge — two concurrent /ws/v1/machine/snapshot clients receive
  identical frames. websocket_v1.yml documents 128 global / 32 per-client
  connections.)*
- **Two WebSocket clients.** Skin and plugin page both hold `/ws/v1/machine/snapshot`, `/scale/`,
  `/display/`. Verify the bridge fans out rather than replacing. Check this in phase 1, not phase 5.
- **Firmware update** holds an NDJSON stream and sets `setFirmwareFlashInFlight` — a mid-flash
  iframe close must not orphan it. Decide: block close, or move the guard into the skin.
- **CSS variables.** Skin injects `--mimoja-blue` etc.; the plugin page needs its own `:root`
  fallbacks (dye2's `cssVarFallbacks()`) *and* to read `theme` from KV to pick light/dark.
- **`uiZoom` / display size vs the fit script** — the setting scales the skin; inside the plugin
  page the fit script owns the transform. Decide whether the preview applies locally at all.
- **Numpad + soft keyboard.** dye2's shell shifts only `position:fixed` modals; settings has inline
  fields low on the page. May need the wrapper shift the dye2 comment flags as unimplemented.
- **Bundle size** is a non-issue: dye2's plugin.js is already 1.5 MB. *(Settled:
  the plugin is 2.9 MB, of which 1.5 MB is the translation sheet and 0.44 MB is
  EasyMDE + iro + Font Awesome.)*
- **Translation CSV** is fetched per page load; inline it into the bundle if it is large.

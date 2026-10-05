#!/usr/bin/env node

/**
 * Re-copy the vendored skin code from streamline_project and re-apply the port's
 * edits on top.
 *
 * The port runs for weeks against a source tree that keeps moving — between the
 * phase 3 vendoring and phase 4 alone, led-color.js grew a function and
 * maintenance-progress.js grew four exports that categories/maintenance.js had
 * already started importing. Hand-recopying loses the port's own edits (relative
 * API base, ui-lite, plugin asset routes); hand-patching loses upstream's.
 *
 * So the edits live here as declarative patches instead of in the vendored files'
 * history. Every patch asserts its anchor still exists: if upstream rewrites a
 * line the port depends on, this fails loudly at sync time rather than silently
 * dropping the edit.
 *
 * Usage:
 *   node sync-upstream.mjs           # apply
 *   node sync-upstream.mjs --check   # report drift, change nothing (CI)
 */

import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPSTREAM = process.env.STREAMLINE_SRC ||
  resolve(__dirname, "../../streamline_js/streamline_project/src");

const check = process.argv.includes("--check");

// `--src <dir>` overrides the upstream tree for one run; watch-upstream.mjs uses
// it to sync from an extracted release tarball instead of the local checkout.
const srcFlag = process.argv.indexOf("--src");
const UPSTREAM_DIR = srcFlag > -1 ? resolve(process.argv[srcFlag + 1]) : UPSTREAM;

// ── The port's edits, by file ────────────────────────────────────────────────
// Each entry: [find, replace]. `find` must appear exactly once.

// Upstream's settings/categories/ sits two levels above modules/; the port's
// src/app/categories/ sits one. And ui.js is never vendored — see PORT_PLAN §4-C.
const CATEGORY_IMPORTS = [
  { all: ["from '../../modules/ui.js'", "from '../modules/ui-lite.js'"] },
  { all: ["from '../../modules/", "from '../modules/"] },
];

export const FILES = [
  // ── modules vendored as-is ────────────────────────────────────────────────
  ...["eco-steam", "units", "machine", "steam-mode", "firmware-progress", "led-color",
      "cup-warmer", "loadcell-cal", "sensor-cal", "settings-search", "home-assistant",
      "logger", "screensaver-policy", "idb", "numpad-policy", "notes-modal",
      "maintenance-progress", "i18n-parser", "socket-slot",
      "visualizer", "settingsSync", "profile-overrides"]
    .map((m) => ({ from: `modules/${m}.js`, to: `src/app/modules/${m}.js` })),

  // Added to the skin after v0.1.110 and imported only by a settings.js from the
  // same commits, so a release older than that legitimately has neither the
  // modules nor the imports. `optional` keeps a genuine removal a hard error.
  ...["led-sequence", "led-strip-runner", "calibrated-steam", "auto-steam-capability",
      "auto-steam-flow", "auto-steam-safety", "auto-steam-session"].map((m) => ({
    from: `modules/${m}.js`,
    to: `src/app/modules/${m}.js`,
    optional: true,
  })),

  { from: "version.js", to: "src/app/version.js" },

  // ── modules the port edits ────────────────────────────────────────────────
  {
    from: "modules/api.js",
    to: "src/app/modules/api.js",
    patches: [
      // PORT_PLAN §4-B: the plugin is served by the bridge, so every URL is
      // same-origin. Absolute, not relative — settings.js's haDefaultHost() does
      // `new URL(API_BASE_URL)` and reads .hostname/.port off it.
      [`import * as ui from './ui.js';`,
       `import * as ui from './ui-lite.js';\n` +
       `import ReconnectingWebSocket from './reconnecting-websocket.js';\n` +
       `import { API_BASE_URL, WS_BASE_URL } from '../api-base.js';`],
      [`export let reaHostname = localStorage.getItem('reaHostname') || window.location.hostname;
export const REA_PORT = 8080;
export let API_BASE_URL = \`http://\${reaHostname}:\${REA_PORT}/api/v1\`;
export const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';`,
       `// PORT_PLAN.md §4-B: the skin points these at a bridge on another host:port
// and lets the user override the hostname; the plugin is served by the bridge
// itself, so every URL is same-origin. \`reaHostname\` / \`REA_PORT\` are
// deliberately gone — nothing outside this file consumed them.
export { API_BASE_URL };`],
      // All 9 socket URLs share this prefix, so one replacement covers them.
      { all: [`\`\${WS_PROTOCOL}//\${reaHostname}:\${REA_PORT}/ws/v1`, "`${WS_BASE_URL}"] },
    ],
  },
  {
    from: "modules/numpad-modal.js",
    to: "src/app/modules/numpad-modal.js",
    patches: [["from './ui.js'", "from './ui-lite.js'"]],
  },
  {
    from: "modules/i18n.js",
    to: "src/app/modules/i18n.js",
    patches: [
      // Served by the plugin's own route; page-relative so it resolves under both
      // the tablet (/api/v1/plugins/<id>/settings) and the dev server (/settings).
      [`fetch('src/ui/de1 gui translation - Sheet1.csv', { cache: 'no-cache' })`,
       `fetch('i18n.csv', { cache: 'no-cache' })`],
    ],
  },
  {
    from: "modules/vendor-loader.js",
    to: "src/app/modules/vendor-loader.js",
    patches: [
      [`loadStyle('src/vendor/easymde.min.css')`, `loadStyle('easymde.css')`],
      [`loadStyle('src/vendor/font-awesome/easymde-icons.css')`, `loadStyle('easymde-icons.css')`],
      [`loadScript('src/vendor/easymde.min.js', 'EasyMDE')`, `loadScript('easymde', 'EasyMDE')`],
      [`loadScript('src/vendor/iro.min.js', 'iro')`, `loadScript('iro', 'iro')`],
    ],
  },
  {
    from: "modules/reconnecting-websocket.js",
    to: "src/app/modules/reconnecting-websocket.js",
    patches: [
      // The skin loads this as a global <script> from index.html; the plugin has
      // no index.html to patch, so the UMD wrapper becomes a real export.
      { re: [/\(function\s*\(global,\s*factory\)[\s\S]*?\}\)\(this,\s*function\s*\(\)\s*\{/,
             `// Vendored from the skin, where index.html loads it as a global <script>.\n` +
             `// The UMD wrapper is replaced by a real export: the plugin bundles its\n` +
             `// dependencies rather than relying on script tags it cannot add.`] },
      { re: [/\n\s*return ReconnectingWebSocket;\s*\n\}\);\s*$/, `\n\nexport default ReconnectingWebSocket;\n`] },
      // A bare `return` is illegal at module top level, and the WebView always has WebSocket.
      [`    if (!('WebSocket' in window)) {
        return;
    }

    function ReconnectingWebSocket`,
       `    // Dropped the factory's \`if (!('WebSocket' in window)) return;\` guard: a
    // bare return is illegal at module top level, and the target WebView has it.
    function ReconnectingWebSocket`],
    ],
  },

  // ── the legacy settings module ────────────────────────────────────────────
  // 9,862 lines rendering every category not broken out into its own file.
  // Ported wholesale: the machine-side categories PORT_PLAN §6 phase 5 names and
  // the skin-coupled ones from phase 6 are interleaved throughout a single
  // module, so splitting the file would be a rewrite. The skin-coupled *state*
  // is redirected separately, in prefs.js.
  {
    from: "settings/settings.js",
    to: "src/app/settings.js",
    patches: [
      // Covers both `from '../modules/x.js'` and dynamic `import('../modules/x.js')`.
      { all: ["'../modules/", "'./modules/"] },
      { all: ["from '../version.js'", "from './version.js'"] },
      [`import * as ui from './modules/ui.js';`, `import * as ui from './modules/ui-lite.js';`],
      // PORT_PLAN §4-F: only the plugin admin block of dyeStrip.js is vendored.
      [`from './modules/dyeStrip.js'`, `from './modules/dye2-admin.js'`],
      // profileManager.js is 1,163 lines and imports ui.js, context-menu.js and
      // router.js — the skin's whole main-page tree — for three read-only symbols
      // (PORT_PLAN §4-C's reasoning, same as ui-lite and dye2-admin). It also runs
      // a destructive one-time KV->REST migration that belongs to the skin.
      //
      // Optional: the import arrived after v0.1.110, so it is absent from any
      // release at or before that and there is nothing to rewrite.
      {
        optional: true,
        why: "settings.js does not import profileManager in this revision",
        patch: [`from './modules/profileManager.js'`, `from './modules/profiles-lite.js'`],
      },
      // PORT_PLAN §4-D. scaling.js is imported upstream but never called — the
      // fit script in shell.ts supersedes it either way.
      [`import { initScaling } from './modules/scaling.js';\n`, ``],
      [`import { loadPage } from './modules/router.js'; // Singular and correctly formatted import`,
       `import { returnToSkin } from './return-to-skin.js';`],
      [`import { returnToSkin } from './return-to-skin.js';`,
       `import { returnToSkin } from './return-to-skin.js';\n` +
       `import { notifySkin } from './prefs.js';`],
      { all: [`            loadPage('index.html');`,
              `            notifySkin();\n            returnToSkin();`] },
    ],
  },

  // ── settings chrome ───────────────────────────────────────────────────────
  { from: "settings/settings-tree.js", to: "src/app/settings-tree.js" },
  // Added after v0.1.110, imported by a newer settings.js; see the optional modules above.
  ...["plugin-view", "settings-restore"].map((m) => ({
    from: `settings/${m}.js`,
    to: `src/app/${m}.js`,
    optional: true,
  })),
  { from: "settings/categories/legacy-category.js", to: "src/app/categories/legacy-category.js" },
  { from: "settings/settings-location.js", to: "src/app/settings-location.js" },
  {
    from: "settings/settings-data.js",
    to: "src/app/settings-data.js",
    patches: [{ all: ["from '../modules/", "from './modules/"] }],
  },
  {
    from: "settings/settings-shell.js",
    to: "src/app/settings-shell.js",
    patches: [
      { all: ["from '../modules/", "from './modules/"] },
      [`from './modules/ui.js'`, `from './modules/ui-lite.js'`],
      // PORT_PLAN §4-D: the skin swapped the subpage out of its own DOM; the
      // plugin is a separate document and navigates back to ?return=.
      [`import { loadPage } from './modules/router.js';`,
       `import { returnToSkin } from './return-to-skin.js';\n` +
       `import { notifySkin } from './prefs.js';`],
      // PORT_PLAN §5 step 2: the values are already in KV by now (settingsSync
      // mirrors every write); this tells the *running* skin which ones moved so
      // it can re-apply them instead of waiting for its next boot. Cancel notifies
      // too — settings.js commits a preference when the control is touched, not on
      // Save, so Cancel never unwound them upstream either.
      [`        clearSearchResults();
        resetSettingsSession();
        loadPage('index.html');`,
       `        clearSearchResults();
        resetSettingsSession();
        notifySkin();
        returnToSkin();`],
      [`            ui.showToast('Settings updated', 3000, 'success');
            loadPage('index.html');`,
       `            ui.showToast('Settings updated', 3000, 'success');
            notifySkin();
            returnToSkin();`],
    ],
  },
  {
    from: "settings/categories/quick-adjustments.js",
    to: "src/app/categories/quick-adjustments.js",
    patches: CATEGORY_IMPORTS,
  },
  {
    from: "settings/categories/maintenance.js",
    to: "src/app/categories/maintenance.js",
    patches: CATEGORY_IMPORTS,
  },

  // ── the skin's palette ────────────────────────────────────────────────────
  // Generated, not hand-copied: the first cut of this file took only the :root
  // blocks and silently dropped the 22 other [data-theme="dark"] rules in
  // dark-mode.css — including `body`'s background — so dark mode rendered as
  // light-grey text on a white page. Extracting it here means it cannot drift
  // and cannot be regenerated wrongly.
  {
    from: "css/main.css",
    to: "src/styles/skin-vars.css",
    generate: "skinVars",
  },

  // ── vendored assets ───────────────────────────────────────────────────────
  // Decaid has no static-asset endpoint for plugins, so each of these is served by
  // an `http` route of the plugin's own (src/assets/) and rides inside plugin.js.
  { from: "ui/de1 gui translation - Sheet1.csv", to: "src/vendor/translations.csv" },
  { from: "vendor/iro.min.js", to: "src/vendor/iro.min.js" },
  { from: "vendor/easymde.min.js", to: "src/vendor/easymde.min.js" },
  { from: "vendor/easymde.min.css", to: "src/vendor/easymde.min.css" },
  {
    from: "vendor/font-awesome/easymde-icons.css",
    to: "src/vendor/easymde-icons.css",
    // The @font-face points at ./fonts/fontawesome-webfont.woff2. A route could
    // serve the binary, but inlining it here costs one base64 blob and removes a
    // route, a relative-path resolution and a round trip on an offline tablet.
    inlineFont: {
      url: "./fonts/fontawesome-webfont.woff2",
      file: "vendor/font-awesome/fonts/fontawesome-webfont.woff2",
      mime: "font/woff2",
    },
  },
];

/**
 * Stamped onto every vendored copy. The skin's src/settings/ is canon and stays
 * that way, so these files are regenerated indefinitely — the warning has to sit
 * where someone is about to edit, not only in a README.
 */
function banner(from) {
  return `// VENDORED from streamline_project/src/${from} — do not edit.\n` +
         `// Canon is the skin. Change it there, then run \`npm run sync\` here.\n` +
         `// The port's own edits to this file live as patches in sync-upstream.mjs.\n`;
}

// ── Generated files ─────────────────────────────────────────────────────────

/**
 * The palette the plugin's document needs, lifted from the skin's stylesheets.
 *
 * Decaid injects these into the skin's page; the plugin is a separate
 * document and carries its own copy. Values must match the skin's exactly, or
 * every ported page is subtly off-palette.
 *
 * Takes main.css's :root, then EVERY rule in dark-mode.css — not just its :root.
 * The dark theme is mostly ordinary rules (body's background, .btn, the
 * scrollbars); taking only the custom properties flips the text colour and
 * leaves the page white underneath it.
 */
function buildSkinVars(mainCss) {
  const darkCss = readFileSync(resolve(UPSTREAM_DIR, "css/dark-mode.css"), "utf-8");

  const rootMain = mainCss.match(/^:root \{[\s\S]*?^\}/m);
  if (!rootMain) throw new Error("main.css: no :root block");

  // ui-lite.js's flashElement / flashPlusMinusButton drive these, and every
  // plus/minus control in settings.js calls them.
  const flash = mainCss.match(/@keyframes button-flash \{[\s\S]*?^\}\n\n\.flash-animation \{[\s\S]*?^\}/m);
  if (!flash) throw new Error("main.css: no button-flash/.flash-animation");
  const flashEl = mainCss.match(/^\.flash \{[\s\S]*?^\}/m);

  // Every selector in dark-mode.css except the ones scoped to elements the
  // plugin's document does not have (the skin's header/aside/panels chrome).
  const SKIN_ONLY = /^\[data-theme="dark"\] (header|aside|#shot-history-panel|#shot-data-panel|#ghc-controls|#sleep-button)/;
  const rules = [...darkCss.matchAll(/^([^{}]+?)\s*\{([\s\S]*?)^\}/gm)]
    .filter(([, selector]) => !SKIN_ONLY.test(selector.trim()))
    .map(([whole]) => whole);

  return `/* GENERATED by sync-upstream.mjs from the skin's css/main.css and
   css/dark-mode.css. Do not edit — run \`npm run sync\`.

   Decaid injects these variables into the skin's own page. The plugin is a
   separate document, so it carries its own copy, and the values have to match
   the skin's exactly or every ported page is subtly off-palette. */

${rootMain[0]}

${rules.join("\n\n")}

/* Plus/minus feedback — ui-lite.js's flashPlusMinusButton and flashElement. */
${flash[0]}
${flashEl ? flashEl[0] : ""}

/* The skin styles .settings-button only for dark mode; in light mode it inherits
   the bordered pill from its utility classes, so only the outline is set here. */
.settings-button {
    border: 2px solid var(--mimoja-blue);
}

/* --box-color-alt is referenced by the sub-category panel but is never defined
   in the skin either; it falls through to transparent there too. */

/* daisyUI's light theme supplied base-100/200/300 to the skin. The plugin needs
   three colours, not a plugin dependency, so they are variables here and are
   wired into tailwind.config.js — which keeps them themeable. */
:root {
    --base-100: #ffffff;
    --base-200: #F2F2F2;
    --base-300: #E5E6E6;
}
[data-theme="dark"] {
    --base-100: #17191e;
    --base-200: #101217;
    --base-300: #000000;
}

/* NOT copied from the skin — the port's own, and needed because the two pages
   are built differently.

   The skin darkens its surfaces by element -- [data-theme="dark"] header,
   ... aside, ... #shot-history-panel. Its settings markup is <header>/<aside>,
   so that reaches everything. The plugin's page (pages/settings.ts, ported from
   settings.html) is divs painted with bg-[var(--box-color)] and bg-base-200, and
   dark-mode.css never overrides those variables — so without this block the
   panels stay white while --text-primary flips to #E0E0E0, i.e. pale grey text
   on a white page.

   Values are the skin's own dark surfaces, taken from the element rules above:
   body #101217, header #17191e, aside #181a21. */
[data-theme="dark"] {
    --bgmain-color: #101217;
    --box-color: #17191e;
    --box-color-alt: #181a21;
    --profileselectorbg: #17191e;
    --profile-button-background-color: #1d1f26;
    --profile-button-outline-color: #2a2d36;
    --text-primary-disabled: #5a5a64;
    --presence-card-bg: #17191e;
    --presence-card-alt-bg: #1d1f26;
    --presence-card-text: #E0E0E0;
    --presence-input-bg: #1d1f26;
    --presence-input-text: #E0E0E0;
    --presence-input-border: #2a2d36;
    --button-secondary-bg: #2a2d36;
    --button-secondary-text: #E0E0E0;
}
`;
}

// ── Apply ────────────────────────────────────────────────────────────────────

// Only sync when run directly; `import { FILES }` must have no side effects.
const isMain = process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

let changed = 0, failed = 0;

if (isMain) {
  const state = existsSync(resolve(__dirname, "upstream.json"))
    ? JSON.parse(readFileSync(resolve(__dirname, "upstream.json"), "utf-8"))
    : {};
  console.log(`comparing against: ${UPSTREAM_DIR}`);
  if (state.tag) {
    console.log(`currently vendored: ${state.repo} ${state.tag} (a release)`);
    console.log("Drift here just means the local checkout differs from that release,");
    console.log("which is normal. `npm run watch:check` is the one that tracks releases.\n");
  }
}

for (const file of isMain ? FILES : []) {
  const src = resolve(UPSTREAM_DIR, file.from);
  const dst = resolve(__dirname, file.to);
  if (!existsSync(src)) {
    if (file.optional) {
      // Remove a copy left over from a revision that had this file: the vendored
      // tree must match the revision recorded in upstream.json, or the build can
      // silently keep compiling a module the recorded upstream does not ship.
      const stale = resolve(__dirname, file.to);
      if (existsSync(stale) && !check) {
        rmSync(stale);
        console.log(`  removed            ${file.to} (not in this upstream revision)`);
        changed++;
      } else if (existsSync(stale)) {
        console.log(`  DRIFTED            ${file.to} (stale; not in this upstream revision)`);
        changed++;
      } else {
        console.log(`  not in upstream    ${file.from} (optional)`);
      }
      continue;
    }
    console.error(`  MISSING UPSTREAM  ${file.from}`);
    failed++;
    continue;
  }

  let text = readFileSync(src, "utf-8");

  if (file.generate === "skinVars") text = buildSkinVars(text);
  // Only the ported skin sources. Third-party libraries and data files under
  // src/vendor/ are served byte-for-byte: a comment prepended to a CSV is
  // corruption, and `//` is not a CSS comment.
  else if (file.to.startsWith("src/app/")) text = banner(file.from) + text;

  if (file.inlineFont) {
    const { url, file: fontFile, mime } = file.inlineFont;
    if (!text.includes(url)) {
      console.error(`  PATCH FAILED      ${file.to}: no @font-face url ${url}`);
      failed++;
    } else {
      const bytes = readFileSync(resolve(UPSTREAM_DIR, fontFile));
      text = text.split(`url('${url}')`)
                 .join(`url('data:${mime};base64,${bytes.toString("base64")}')`);
    }
  }

  for (const patch of file.patches || []) {
    if (patch && patch.optional) {
      const [find, replace] = patch.patch;
      if (!text.includes(find)) {
        console.log(`  n/a in this rev     ${file.to}: ${patch.why || "optional patch"}`);
        continue;
      }
      text = text.split(find).join(replace);
    } else if (Array.isArray(patch)) {
      const [find, replace] = patch;
      const hits = text.split(find).length - 1;
      if (hits !== 1) {
        console.error(`  PATCH FAILED      ${file.to}: anchor found ${hits}x (want 1)\n` +
                      `                    ${JSON.stringify(find.slice(0, 70))}…`);
        failed++;
        continue;
      }
      text = text.replace(find, replace);
    } else if (patch.all) {
      const [find, replace] = patch.all;
      if (!text.includes(find)) {
        console.error(`  PATCH FAILED      ${file.to}: no occurrence of ${JSON.stringify(find.slice(0, 60))}`);
        failed++;
        continue;
      }
      text = text.split(find).join(replace);
    } else if (patch.re) {
      const [re, replace] = patch.re;
      if (!re.test(text)) {
        console.error(`  PATCH FAILED      ${file.to}: regex did not match ${re}`);
        failed++;
        continue;
      }
      text = text.replace(re, replace);
    }
  }

  const current = existsSync(dst) ? readFileSync(dst, "utf-8") : null;
  if (current === text) continue;

  changed++;
  if (check) {
    console.log(`  DRIFTED           ${file.to}`);
  } else {
    writeFileSync(dst, text);
    console.log(`  ${current === null ? "created" : "updated"}           ${file.to}`);
  }
}

if (isMain) {
  console.log(`\n${FILES.length} files, ${changed} ${check ? "drifted" : "written"}, ${failed} failed`);
}

// Record where the vendored copies came from. Without this, "which version of
// the skin is in here?" is unanswerable — the copies carry patches and a banner,
// so they are never byte-equal to any upstream revision.
if (isMain && !check && !failed) recordProvenance();

function recordProvenance() {
  const statePath = resolve(__dirname, "upstream.json");
  // watch-upstream.mjs passes --src and writes its own record afterwards; this
  // only describes a sync from a working tree.
  if (srcFlag > -1) return;

  const prev = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf-8")) : {};
  if (prev.tag) {
    console.log(`\nNOTE: this replaced code vendored from release ${prev.tag} with a local`);
    console.log(`working tree. Releases are the shipping source — run \`npm run watch:sync\``);
    console.log(`before committing unless you meant to develop against unreleased changes.`);
  }

  let describe = null;
  try {
    describe = execFileSync("git", ["-C", UPSTREAM_DIR, "describe", "--tags", "--always", "--dirty"],
                            { encoding: "utf-8" }).trim();
  } catch {
    // Not a git checkout, or no git. The path is still worth recording.
  }
  writeFileSync(statePath, JSON.stringify({
    source: "local-tree",
    path: UPSTREAM_DIR,
    describe,
    syncedAt: new Date().toISOString(),
  }, null, 2) + "\n");
  console.log(`provenance: local tree ${describe || UPSTREAM_DIR}`);
}
if (isMain && failed) {
  console.error("\nA patch anchor no longer matches upstream. Re-read that file and update\nthe patch in sync-upstream.mjs — do NOT edit the vendored copy directly.");
  process.exit(1);
}
if (isMain && check && changed) process.exit(1);

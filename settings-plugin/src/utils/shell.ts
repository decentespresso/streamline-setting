import { html } from "./html";
// Tailwind compiled at build time (scanned from src/**/*.ts) and inlined below,
// so pages style themselves with no network — the offline tablet has no CDN.
// Regenerate via `npm run build:css` (runs automatically as part of `npm run build`).
import tailwindCss from "../styles/tailwind.generated.css?inline";
// The skin's palette, copied verbatim — see the file header.
import skinVars from "../styles/skin-vars.css?inline";
// The daisyUI classes the ported markup uses — see the file header.
import daisyShim from "../styles/daisy-shim.css?inline";

// Pages are authored at a fixed 1920x1200 design reference (the Figma canvas at 75%,
// 16:10 like the tablet). Ported from streamline_project/src/modules/scaling.js:
// scale x and y independently instead of a uniform min(w,h) zoom, so a non-16:10
// screen (e.g. an 8" tablet at 1340x800) fills edge-to-edge instead of leaving thick
// letterbox gutters. The stretch ratio is clamped at 1.15 so round controls don't
// become visible ellipses on far-off aspects; 16:10 screens are unaffected either way.
// Transform (not zoom) is applied to <body> itself — a transformed element becomes the
// containing block for its position:fixed descendants, so modal overlays (which are
// siblings of the page's root div, both direct children of body) scale correctly too.
const fitScript = `
(function () {
  var DESIGN_W = 1920, DESIGN_H = 1200;
  var MAX_STRETCH = 1.15;
  function fit(vw, vh) {
    var sx = vw / DESIGN_W, sy = vh / DESIGN_H;
    var stretch = Math.max(sx, sy) / Math.min(sx, sy);
    if (stretch > MAX_STRETCH) {
      var k = MAX_STRETCH / stretch;
      if (sx > sy) { sx *= k; } else { sy *= k; }
    }
    var offsetX = (vw - DESIGN_W * sx) / 2;
    var offsetY = (vh - DESIGN_H * sy) / 2;
    document.body.style.width = DESIGN_W + 'px';
    document.body.style.height = DESIGN_H + 'px';
    document.body.style.transformOrigin = 'top left';
    document.body.style.transform =
      'translate(' + offsetX + 'px, ' + offsetY + 'px) scale(' + sx + ', ' + sy + ')';
    // body is no longer a flex container, so its root child (a plain block div) won't
    // auto-fill body's height on its own the way it auto-fills width — pin it explicitly.
    var root = document.body.firstElementChild;
    if (root) { root.style.width = '100%'; root.style.height = '100%'; }
    lastSy = sy;
  }
  var lastSy = 1;
  // Android's soft keyboard shrinks the viewport height (interactive-widget=overlays-content
  // only lands on newer WebViews, so we cannot rely on it). Refitting against that height
  // recomputes sy and visibly squashes the page mid-edit.
  //
  // Deciding by document.activeElement does NOT work: the WebView fires resize as the
  // keyboard animates in, often before focus has landed on the field, so the guard sees no
  // editing and refits anyway. Instead key off the only thing that is always true — the
  // keyboard can shrink the viewport but never widen or grow it. So: a width change is a
  // real resize (rotation), a taller viewport means the keyboard went away, and a
  // same-width-but-shorter viewport is the keyboard and gets ignored. No focus, no timers.
  var fitW = 0, fitH = 0;
  function apply() {
    var vw = window.innerWidth, vh = window.innerHeight;
    if (vw !== fitW || vh > fitH) { fitW = vw; fitH = vh; fit(vw, vh); }
  }
  apply();
  window.addEventListener('resize', apply);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', apply);

  // The page never moves for the keyboard (see above), so a field near the bottom of a
  // modal ends up underneath it. Shift just that modal up by however much the keyboard
  // covers the focused field. The overlay is a child of the scaled <body>, so its own
  // translate is in design px -> divide the on-screen overlap by the current scale.
  // ponytail: modal overlays only (nearest position:fixed ancestor). Inline page fields
  // are not moved; wire the same shift to a wrapper if one ever sits under the keyboard.
  var kbTarget = null;
  function kbReset() {
    if (kbTarget) { kbTarget.style.transform = kbTarget.__kbPrev || ''; kbTarget = null; }
  }
  function kbAdjust() {
    var vv = window.visualViewport;
    kbReset();
    if (!vv) return;
    var el = document.activeElement;
    if (!el || !/^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
    // With interactive-widget=overlays-content the layout viewport keeps its full height
    // and only the visual viewport shrinks; without it innerHeight shrinks too and this
    // difference is 0 -- either way what is hidden is what sits past the visual viewport.
    var box = el.getBoundingClientRect();
    var overlap = box.bottom + 24 - (vv.offsetTop + vv.height);
    if (overlap <= 0) return;
    var node = el.parentElement;
    while (node && node !== document.body) {
      if (getComputedStyle(node).position === 'fixed') break;
      node = node.parentElement;
    }
    if (!node || node === document.body) return;
    kbTarget = node;
    node.__kbPrev = node.style.transform;
    node.style.transform = (node.__kbPrev ? node.__kbPrev + ' ' : '') +
      'translateY(' + (-overlap / lastSy) + 'px)';
  }
  // The WebView fires the viewport resize while the keyboard animates in, often before
  // focus has landed -- so re-check on focus changes too, one frame late so the field is
  // laid out (and, on blur, so the next focus is already set).
  function kbSoon() { setTimeout(kbAdjust, 50); }
  if (window.visualViewport) window.visualViewport.addEventListener('resize', kbSoon);
  document.addEventListener('focusin', kbSoon);
  document.addEventListener('focusout', kbSoon);
})();
`;

// Applied before first paint, from this origin's localStorage. prefs.js corrects
// it after the KV hydrate if the durable copy differs.
const themeScript = `
(function () {
  try {
    var stored = localStorage.getItem('theme');
    document.documentElement.setAttribute('data-theme', stored || 'light');
  } catch (e) {
    // Storage can throw in a locked-down WebView; light is the stock default.
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`;

/** Page-level CSS: the skin palette (imported above) plus the reset and
    input/keyboard behaviour the pages assume. */
function cssVarFallbacks(): string {
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    /* Pages are authored at the fixed 1920x1200 design reference and fit into the
       viewport by the fit script, which scales+positions <body> directly (see
       fitScript) — the page never scrolls. Any leftover space on a non-16:10 screen
       becomes an even letterbox margin filled by this background, so it reads as
       intentional page chrome rather than empty space. */
    html {
      width: 100%; height: 100%;
      background: var(--bgmain-color);
    }
    /* width/height/transform set by the fit script (design px + computed scale). */
    body {
      overflow: hidden;
      background: var(--bgmain-color);
    }
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
    /* No border:none here — Tailwind preflight already zeroes border-width by
       default, and this used to win on specificity over button.border-2 etc.,
       silencing every bordered button (Add Note, Clear, Settings, Visualizer). */
    button { font-family: inherit; cursor: pointer; background: none; }
    input, textarea, select { font-family: inherit; }
    /* This is a tablet app, not a document: a long press should trigger our own gestures
       (e.g. long-press-to-edit on the favourites cards) rather than Android's text
       selection handles and paste callout. Fields opt back in below so typing, caret
       placement and clipboard still work where they matter. */
    body {
      user-select: none; -webkit-user-select: none;
      -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent;
    }
    input, textarea, [contenteditable="true"] {
      user-select: text; -webkit-user-select: text; -webkit-touch-callout: default;
    }
    .no-select { user-select: none; -webkit-user-select: none; }

    /* Focus mode: the field being edited goes white so it stands out across the page.
       Fields drawn transparent inside a bordered wrapper paint the wrapper instead. */
    input:focus, textarea:focus, select:focus, [contenteditable="true"]:focus {
      background: #fff;
      color: #111;
      caret-color: var(--mimoja-blue);
    }
    input:focus::placeholder, textarea:focus::placeholder { color: #9CA3AF; }
    .dye-form-input-wrap:focus-within, .re-input-row:focus-within {
      background: #fff;
      border-color: var(--mimoja-blue);
    }
    .dye-form-input-wrap:focus-within .dye-form-input,
    .dye-form-input-wrap:focus-within .dye-form-textarea,
    .re-input-row:focus-within .re-input { color: #111; }
  `;
}

/**
 * Page shell for dev-style pages (Tailwind + Decaid CSS variables).
 * Use this instead of hand-rolled HTML for pages ported from dev/.
 */
export function pageShell(
  title: string,
  content: string,
  styles: string = "",
  scripts: string[] = []
): string {
  return html`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <!-- interactive-widget=overlays-content: on-screen keyboard overlays the page instead of resizing/shrinking it -->
  <meta name="viewport" content="width=device-width, initial-scale=1, interactive-widget=overlays-content" />
  <title>Settings - ${title}</title>
  <style>${tailwindCss}</style>
  <style>${skinVars}${daisyShim}${cssVarFallbacks()}${styles}</style>
  ${/* Ported from the skin's index.html, which applies the stored theme before
        first paint. Without it the page renders light until something calls
        initThemeToggle() — which settings.js only does when the Theme category
        is opened, so a dark-theme user got a white page for the whole visit.
        Inline and in <head> on purpose: after paint would be a visible flash.
        prefs.js re-applies this once KV has hydrated, in case the durable copy
        disagrees with this origin's localStorage. */ ""}
  <script>${themeScript}</script>
</head>
<body>
  ${content}
  <script>${fitScript}</script>
  ${/* Page-relative, never a CDN — the tablet is offline. Resolves under both
        runtimes: /api/v1/plugins/streamline-settings.reaplugin/ui -> .../app, and
        the dev server's /ui -> /app. */ ""}
  <script src="app"></script>
  ${scripts.map((s) => `<script>${s}</script>`).join("\n")}
</body>
</html>`;
}

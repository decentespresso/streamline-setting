/**
 * Third-party libraries the settings pages load on demand, served by the plugin's
 * own routes. REA has no static-asset endpoint for plugins, and the tablet is
 * offline, so a CDN <script> would leave the LED colour picker and the notes
 * editor permanently broken.
 *
 * These are fetched lazily by modules/vendor-loader.js — only when a page that
 * needs them is opened — so their weight is not on the settings page's own load.
 * The route names match the paths patched into vendor-loader.js by
 * sync-upstream.mjs.
 */
import iroSource from "../vendor/iro.min.js?raw";
import easymdeSource from "../vendor/easymde.min.js?raw";
import easymdeCss from "../vendor/easymde.min.css?raw";
import easymdeIconsCss from "../vendor/easymde-icons.css?raw";

// Pinned vendored files that change only when the plugin is rebuilt, so the
// WebView may keep them rather than re-fetching a third of a megabyte.
const IMMUTABLE = "public, max-age=31536000, immutable";

function asset(
  request: HttpRequest,
  contentType: string,
  body: string
): HttpResponse {
  return {
    requestId: request.requestId,
    status: 200,
    headers: { "Content-Type": contentType, "Cache-Control": IMMUTABLE },
    body,
  };
}

/** iro.js — the colour wheel behind Machine > Lighting. */
export function renderIro(request: HttpRequest): HttpResponse {
  return asset(request, "application/javascript; charset=utf-8", iroSource);
}

/** EasyMDE — the markdown editor behind the notes modal. */
export function renderEasyMde(request: HttpRequest): HttpResponse {
  return asset(request, "application/javascript; charset=utf-8", easymdeSource);
}

export function renderEasyMdeCss(request: HttpRequest): HttpResponse {
  return asset(request, "text/css; charset=utf-8", easymdeCss);
}

/** Font Awesome subset for EasyMDE's toolbar; the woff2 is inlined as a data URI. */
export function renderEasyMdeIconsCss(request: HttpRequest): HttpResponse {
  return asset(request, "text/css; charset=utf-8", easymdeIconsCss);
}

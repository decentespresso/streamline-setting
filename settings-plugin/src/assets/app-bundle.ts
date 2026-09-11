/**
 * Serves the browser-side app bundle built by vite.app.config.ts.
 *
 * Decaid has no static-asset endpoint for plugins, so the only way to hand the
 * WebView a .js file is an `http` route of our own — the same trick dye2 uses
 * for Plotly. The bytes ride along inside plugin.js.
 */
import appSource from "../generated/app.js?raw";

export function renderAppBundle(request: HttpRequest): HttpResponse {
  return {
    requestId: request.requestId,
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // Rebuilt on every plugin release and served from the plugin's own route,
      // so a cached copy would outlive the page that needs it.
      "Cache-Control": "no-cache",
    },
    body: appSource,
  };
}

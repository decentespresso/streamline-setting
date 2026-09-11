/**
 * The translation table, served by the plugin's own route.
 *
 * i18n.js fetches this once per page load and parses it (i18n-parser.js). In the
 * skin it was a file under src/ui/; REA has no static-asset endpoint for plugins,
 * so it rides inside plugin.js like every other asset here.
 *
 * It is the single largest thing in the bundle (~1.5 MB). Left as a route rather
 * than inlined into the app bundle so it stays a one-off fetch that the page can
 * make after first paint, instead of parse-time weight on every load.
 */
import translationCsv from "../vendor/translations.csv?raw";

export function renderI18nCsv(request: HttpRequest): HttpResponse {
  return {
    requestId: request.requestId,
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      // i18n.js already requests this with `cache: 'no-cache'`; it changes only
      // when the plugin is rebuilt.
      "Cache-Control": "no-cache",
    },
    body: translationCsv,
  };
}

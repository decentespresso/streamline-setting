// PORT_PLAN.md §4-D: the skin closed Settings with router.js's loadPage('index.html'),
// which swapped the subpage out of its own DOM. The plugin is a separate document,
// so leaving means navigating back to where we came from.
//
// dyeStrip.js:openPluginOverlay passes ?return=<url>: in production it is a sentinel
// URL on the skin that the parent frame watches for (it closes the overlay and
// refreshes), and in dev, where the iframe is cross-origin and blocked, it is the
// skin page itself and this is a full-page navigation back to it.
//
// With no ?return= (opened directly, or a reload that dropped the param), go to
// Decaid's WebUI on :3000, whose `/` redirects to the active skin. Same fallback as
// Decaid's own "Decent Settings" back-link, and same shape as dye2: ?return= if
// given, else a fixed route. Never history.back().
const SKIN_PORT = 3000;

export function returnToSkin() {
    const url = new URLSearchParams(window.location.search).get('return');
    window.location.href = url || `${window.location.protocol}//${window.location.hostname}:${SKIN_PORT}/?_=${Date.now()}`;
}

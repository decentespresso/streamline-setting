// PORT_PLAN.md §4-D: the skin closed Settings with router.js's loadPage('index.html'),
// which swapped the subpage out of its own DOM. The plugin is a separate document,
// so leaving means navigating back to where we came from.
//
// dyeStrip.js:openPluginOverlay passes ?return=<url>: in production it is a sentinel
// URL on the skin that the parent frame watches for (it closes the overlay and
// refreshes), and in dev, where the iframe is cross-origin and blocked, it is the
// skin page itself and this is a full-page navigation back to it.
export function returnToSkin() {
    const url = new URLSearchParams(window.location.search).get('return');
    if (url) {
        window.location.href = url;
        return true;
    }
    // Opened directly (dev server, or a page reload that dropped the param) —
    // there is nowhere to go back to, so stay put rather than break out.
    return false;
}

// VENDORED from streamline_project/src/modules/numpad-policy.js — do not edit.
// Canon is the skin. Change it there, then run `npm run sync` here.
// The port's own edits to this file live as patches in sync-upstream.mjs.
export function shouldUseNumpad() {
    if (window._forceNumpadMobile !== undefined) return window._forceNumpadMobile;
    const isTouchDevice = 'ontouchstart' in window
        || navigator.maxTouchPoints > 0
        || window.matchMedia('(pointer: coarse)').matches;
    return !(window.innerWidth >= 1200 && window.innerHeight >= 900 && !isTouchDevice);
}

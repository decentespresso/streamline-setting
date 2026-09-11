// VENDORED from streamline_project/src/modules/logger.js — do not edit.
// Canon is the skin. Change it there, then run `npm run sync` here.
// The port's own edits to this file live as patches in sync-upstream.mjs.
const noop = () => {};

export const logger = {
    debug: noop, // Start with a no-op function for debug
    info: noop,
    warn: console.warn.bind(console, '[WARN]'),
    error: console.error.bind(console, '[ERROR]'),
};

export function setDebug(enabled) {
    if (enabled) {
        // When debugging is on, point logger.debug to a bound console.log
        logger.debug = console.log.bind(console, '[DEBUG]');
    } else {
        // When it's off, point it back to the function that does nothing
        logger.debug = noop;
    }
}

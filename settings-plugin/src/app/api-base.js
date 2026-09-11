// The plugin is served BY the bridge, so it is always same-origin with the API —
// unlike the skin, which reaches a bridge on another host:port and carries a
// `reaHostname` localStorage override for it. There is exactly one bridge here:
// the one that served this page.
//
// Absolute, not relative: settings.js's haDefaultHost() does `new URL(API_BASE_URL)`
// and reads .hostname/.port off it, which throws on a bare "/api/v1".
//
// This is the edit PORT_PLAN.md §4-B calls for.
export const API_BASE_URL = `${location.origin}/api/v1`;
export const WS_BASE_URL = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws/v1`;

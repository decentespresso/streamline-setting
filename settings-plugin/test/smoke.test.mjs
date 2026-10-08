/**
 * One runnable check that the build pipeline actually produces a working plugin:
 * load ../streamline-settings.reaplugin/plugin.js in a node:vm context (mirrors dev-server.mjs),
 * call createPlugin(mockHost), then hit __httpRequestHandler for the "settings" endpoint.
 * Run: npm test   (node --experimental-strip-types, matching dye2's test style)
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_PATH = resolve(__dirname, '../../streamline-settings.reaplugin/plugin.js');

const src = readFileSync(PLUGIN_PATH, 'utf-8');
const context = vm.createContext({ console, setTimeout, clearTimeout });
new vm.Script(src, { filename: 'plugin.js' }).runInContext(context);

assert.equal(typeof context.createPlugin, 'function', 'plugin.js must expose createPlugin globally');

const logs = [];
const mockHost = {
  log: (msg) => logs.push(msg),
  emit: () => {},
  storage: () => {},
};

const plugin = context.createPlugin(mockHost);
assert.equal(plugin.id, 'streamline-settings.reaplugin');
// CI stamps the tag version into manifest.src.json before building, so compare to that
// rather than a literal that every release would break.
const { version } = JSON.parse(readFileSync(resolve(__dirname, '../manifest.src.json'), 'utf-8'));
assert.equal(plugin.version, version);

plugin.onLoad({});
assert.ok(logs.some((l) => l.includes('loaded')), 'onLoad should log something');

const response = plugin.__httpRequestHandler({
  requestId: 'smoke-1',
  endpoint: 'ui',
  method: 'GET',
  headers: {},
  body: null,
  query: { return: 'http://example.test/back' },
});

assert.equal(response.status, 200);
assert.ok(response.body && response.body.length > 0, 'response body must be non-empty');

// The chrome settings-shell.js binds to. Each id here is looked up by name in
// settings-shell.js, so a rename that breaks the shell fails this first.
for (const id of ['page_title', 'settings-search', 'cancel-settings-btn', 'save-settings-btn',
                  'settings-body', 'main-categories-panel', 'sub-categories-panel',
                  'sub-categories-separator', 'separator', 'settings-content-area']) {
  assert.match(response.body, new RegExp(`id="${id}"`), `page must contain #${id}`);
}

// The main-category nav is generated from settings-tree.js; all 11 must be present
// with the `<id>-btn` ids the shell resolves.
for (const id of ['quickadjustments', 'bluetooth', 'calibration', 'machine', 'maintenance',
                  'skin', 'language', 'extensions', 'miscellaneous', 'updates', 'usermanual']) {
  assert.match(response.body, new RegExp(`id="${id}-btn"`), `nav must contain ${id}`);
}
assert.match(response.body, /<script src="app"><\/script>/, 'page must load the app bundle');

const appBundle = plugin.__httpRequestHandler({
  requestId: 'smoke-3',
  endpoint: 'app',
  method: 'GET',
  headers: {},
  body: null,
  query: {},
});

assert.equal(appBundle.status, 200);
assert.match(appBundle.headers['Content-Type'], /javascript/);
// Proves the whole second-bundle chain: the app's module graph was bundled and its
// text was embedded into plugin.js at build time.
assert.match(appBundle.body, /initializeSettingsShell/, 'app bundle must carry the settings shell');
assert.match(appBundle.body, /\/api\/v1/, 'app bundle must carry the api-base module');
assert.match(appBundle.body, /SETTINGS_TREE|settingsTree/, 'app bundle must carry the settings tree');

const csv = plugin.__httpRequestHandler({
  requestId: 'smoke-4',
  endpoint: 'i18n.csv',
  method: 'GET',
  headers: {},
  body: null,
  query: {},
});
assert.equal(csv.status, 200);
assert.match(csv.headers['Content-Type'], /text\/csv/);
assert.ok(csv.body.length > 1000, 'translation sheet must not be empty');

const notFound = plugin.__httpRequestHandler({
  requestId: 'smoke-2',
  endpoint: 'does-not-exist',
  method: 'GET',
  headers: {},
  body: null,
  query: {},
});
assert.equal(notFound.status, 404);

console.log('smoke test passed');

// Decaid owns these paths under /api/v1/plugins/{id}/; an endpoint named after
// one of them is shadowed by Decaid's own route and silently never reaches the
// plugin. That shipped once: the page was called "settings" and every request
// returned the manifest's settings object ({}) instead of the page.
{
  const manifest = JSON.parse(
    readFileSync(resolve(__dirname, '../manifest.src.json'), 'utf-8'));
  const RESERVED = ['settings', 'enable', 'disable', 'source', 'update'];
  for (const route of manifest.api) {
    assert.ok(!RESERVED.includes(route.id),
      `endpoint "${route.id}" collides with a built-in Decaid plugin route`);
  }
}

// A `*/` inside a CSS comment (a glob like src/**/*.js, say) ends the comment
// early and swallows the rule that follows into an invalid selector. That
// silently deleted the .btn base rule once; every daisyUI class the ported
// markup relies on is checked here against comment-stripped CSS.
{
  const css = readFileSync(resolve(__dirname, '../src/styles/daisy-shim.css'), 'utf-8');
  let stripped = '', i = 0;
  while (i < css.length) {
    const start = css.indexOf('/*', i);
    if (start < 0) { stripped += css.slice(i); break; }
    stripped += css.slice(i, start);
    const end = css.indexOf('*/', start + 2);
    if (end < 0) break;
    i = end + 2;
  }
  for (const sel of ['.btn', '.checkbox', '.input', '.modal', '.modal-box', '.modal-action', '.loading']) {
    // `:where(.x)` is the same rule at zero specificity (see daisy-shim.css)
    assert.match(stripped, new RegExp(`(^|\\})\\s*(:where\\()?\\${sel}\\)?\\s*\\{`),
      `${sel} must survive CSS comment stripping`);
  }

  // The dark theme has to repaint surfaces, not just text: the skin does that with
  // element rules the plugin's div-based markup never matches.
  const vars = readFileSync(resolve(__dirname, '../src/styles/skin-vars.css'), 'utf-8');
  assert.match(vars, /\[data-theme="dark"\][\s\S]*--box-color:/, 'dark theme must override --box-color');
  assert.match(vars, /\[data-theme="dark"\] body \{/, 'dark theme must repaint body');
}

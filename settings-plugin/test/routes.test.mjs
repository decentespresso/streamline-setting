/**
 * Route contract. A skin sync can bring in code that loads an asset by a skin-relative
 * path; the plugin has no such route, Decaid answers 404 text/plain, and the browser
 * refuses it (this is how notes-modal.css broke). Fails when:
 *   - manifest.src.json, src/plugin.ts and dev-server.mjs list different routes;
 *   - a route does not answer 200 with a sensible Content-Type;
 *   - vendored app code loads an asset path no route serves.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import vm from 'node:vm';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p), 'utf-8');

const manifestIds = JSON.parse(read('manifest.src.json')).api.map((a) => a.id).sort();

const ctx = vm.createContext({ console, setTimeout, clearTimeout });
new vm.Script(read('../streamline-settings.reaplugin/plugin.js')).runInContext(ctx);
const plugin = ctx.createPlugin({ log() {}, emit() {}, storage() {} });
plugin.onLoad({});
const get = (endpoint) =>
  plugin.__httpRequestHandler({ requestId: 't', endpoint, method: 'GET', headers: {}, body: null, query: {} });

test('manifest, plugin.ts and dev-server.mjs list the same routes', () => {
  const inPlugin = [...read('src/plugin.ts').matchAll(/case "([^"]+)":/g)].map((m) => m[1]).sort();
  const inDev = [...read('dev-server.mjs').match(/PLUGIN_ROUTES = \[([^\]]+)\]/)[1].matchAll(/"([^"]+)"/g)]
    .map((m) => m[1]).sort();
  assert.deepEqual(inPlugin, manifestIds, 'plugin.ts switch vs manifest api[]');
  assert.deepEqual(inDev, manifestIds, 'dev-server PLUGIN_ROUTES vs manifest api[]');
});

test('every route answers 200 with the right Content-Type', () => {
  for (const id of manifestIds) {
    const res = get(id);
    assert.equal(res.status, 200, `${id}: status`);
    assert.ok(res.body && res.body.length > 0, `${id}: empty body`);
    const type = res.headers['Content-Type'];
    const want = id.endsWith('.css') ? /text\/css/ : id.endsWith('.csv') ? /csv|text\/plain/ : /javascript|html/;
    assert.match(type, want, `${id}: Content-Type was ${type}`);
  }
  assert.equal(get('no-such-route').status, 404);
});

// ponytail: literal paths only (loadStyle/loadScript/fetch with a quoted relative path).
// Dynamic URLs are not scanned.
// loadQrCodeGen is exported by vendor-loader.js but nothing here calls it, so its
// 'src/vendor/qrcodegen.js' has no route. Remove from this list if a caller appears.
const UNUSED = new Set(['src/vendor/qrcodegen.js']);

function* jsFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* jsFiles(p);
    else if (p.endsWith('.js')) yield p;
  }
}

test('every asset path the vendored app loads has a route', () => {
  const missing = [];
  for (const file of jsFiles(resolve(root, 'src/app'))) {
    const src = readFileSync(file, 'utf-8');
    for (const m of src.matchAll(/\b(?:loadStyle|loadScript|fetch)\(\s*'([^'$`]+)'/g)) {
      const path = m[1];
      if (/^(https?:|\/|data:|blob:)/.test(path) || UNUSED.has(path)) continue;
      if (!manifestIds.includes(path)) missing.push(`${file.slice(root.length + 1)}: ${path}`);
    }
  }
  assert.deepEqual(missing, [], `asset paths with no plugin route:\n${missing.join('\n')}`);
});

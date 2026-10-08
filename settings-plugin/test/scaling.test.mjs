/**
 * The fit script that scales the 1920x1200 page into the viewport, run as shipped
 * (taken from the built page). Mirrors the skin's scaling.js: a screen taller than 16:10
 * grows the canvas at a uniform scale instead of stretching, a shorter one letterboxes
 * unless localStorage 'maxStretch' allows a squash, and 'uiZoom' multiplies the scale.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import test from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const ctx = vm.createContext({ console, setTimeout, clearTimeout });
new vm.Script(readFileSync(resolve(here, '../../streamline-settings.reaplugin/plugin.js'), 'utf-8')).runInContext(ctx);
const plugin = ctx.createPlugin({ log() {}, emit() {}, storage() {} });
plugin.onLoad({});
const page = plugin.__httpRequestHandler({ requestId: 't', endpoint: 'ui', method: 'GET', headers: {}, body: null, query: {} }).body;
const fit = page.match(/<script>(\s*\(function \(\) \{\s*var DESIGN_W[\s\S]*?)<\/script>/)[1];

function run(vw, vh, prefs = {}) {
  const body = { style: {}, firstElementChild: { style: {} } };
  const win = { innerWidth: vw, innerHeight: vh, addEventListener() {}, visualViewport: null };
  const localStorage = { getItem: (k) => prefs[k] ?? null };
  vm.runInContext(fit, vm.createContext({
    window: win, localStorage, setTimeout, getComputedStyle: () => ({}),
    document: { body, documentElement: { style: {} }, activeElement: null, addEventListener() {} },
  }));
  const [, tx, ty, sx, sy] = body.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([\d.]+), ([\d.]+)\)/).map(Number);
  return { height: parseFloat(body.style.height), tx, ty, sx, sy };
}
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} !== ${b}`);

test('16:10 is untouched', () => {
  const r = run(1920, 1200);
  assert.deepEqual([r.height, r.tx, r.ty, r.sx, r.sy], [1200, 0, 0, 1, 1]);
});

test('taller than 16:10 grows the canvas at a uniform scale (no stretch)', () => {
  const r = run(1400, 1000);
  near(r.sx, 1400 / 1920); near(r.sy, r.sx);
  near(r.height, 1000 / r.sx);
  assert.equal(r.ty, 0);
});

test('shorter than 16:10 letterboxes by default, squashes only if maxStretch allows', () => {
  const flat = run(1340, 800);
  near(flat.sx, flat.sy); assert.ok(flat.tx > 0, 'centred with side gutters');
  const loose = run(1340, 800, { maxStretch: '1.15' });
  assert.ok(loose.sx > loose.sy, 'squashed');
  assert.equal(loose.tx, 0);
});

test('uiZoom multiplies the scale, anchors top-left and caps at 2', () => {
  const z = run(1920, 1200, { uiZoom: '1.3' });
  near(z.sx, 1.3); assert.deepEqual([z.tx, z.ty], [0, 0]);
  near(run(1920, 1200, { uiZoom: '5' }).sx, 2);
});

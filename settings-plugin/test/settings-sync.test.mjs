import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideResync } from '../src/app/modules/resync-policy.js';
import { selectedRecipeSteam } from '../src/app/modules/dye-selection.js';
import { isSteamOff, steamOffPatch, steamOnPatch, steamDurationWrite, MIN_STEAM_DURATION_S } from '../src/app/modules/steam-mode.js';

// Persistence of the user's main-page settings: the shared KV record that
// outranks a drifted workflow (milk stop, plus the resync rule every tile value
// shares), the after-boot drift check on incoming shotSettings frames, and the
// per-profile brew-temp override.
//
// api.js / app.js / profileManager.js can't be imported under node (browser
// globals), so the functions under test are lifted out of the source and run
// with their dependencies injected -- same trick as settings-write-cache.test.mjs.

function lift(module, patterns) {
    const source = readFileSync(new URL(`../src/app/modules/${module}`, import.meta.url), 'utf8');
    return patterns.map(pattern => {
        const match = source.match(pattern);
        assert.ok(match, `${module}: no match for ${pattern}`);
        return match[0].replace('export ', '');
    }).join('\n');
}

// The own-push tracking resyncIfDrifted and the KV-first setters share.
const TRACKING = [
    /const lastOwnPush = new Map\(\);/,
    /const pendingPushKey = .*;/,
    /async function readPendingPush\(key\) \{[\s\S]*?\r?\n\}/,
    /async function pushRemembered\(key, value, send\) \{[\s\S]*?\r?\n\}/,
];

// Module state readSharedValue needs: the namespace it reads from, and its
// short-lived read cache. Lifted with it everywhere -- without the namespace
// the KV branch throws a ReferenceError that the function's own catch swallows,
// so every test silently measured the IndexedDB fallback instead.
const SHARED_VALUE_CACHE = [
    /const SETTINGS_NAMESPACE = .*;/,
    /const inFlightGets = new Map\(\);/,
    /function dedupedGet\(key, request\) \{[\s\S]*?\r?\n\}/,
    /const SHARED_VALUE_TTL_MS = .*;/,
    /const sharedValueCache = new Map\(\);.*/,
];

// ── Milk stop + the shared KV resync rule (api.js) ───────────────────────────
{
    const body = lift('api.js', [
        /export const MILK_STOP_LAST_VALUE_KEY = .*;/,
        ...SHARED_VALUE_CACHE,
        /export async function readSharedValue\(key\) \{[\s\S]*?\r?\n\}/,
        ...TRACKING,
        /export async function resyncIfDrifted\(key, fetchedValue, pushFn\) \{[\s\S]*?\r?\n\}/,
        /export async function resyncMilkStopIfDrifted\(stopAtTemperature\) \{[\s\S]*?\r?\n\}/,
        /export async function setStopAtTemperature\(celsius\) \{[\s\S]*?\r?\n\}/,
    ]);

    // `pending` is the per-device marker of a push of ours that never landed.
    const build = (remembered, { pending = null } = {}) => {
        const kvWrites = [];
        const workflowWrites = [];
        const pendingWrites = [];
        const api = new Function(
            'logger', 'persistSharedValue', 'persistLastValue', 'updateWorkflow', 'getValueFromStore', 'openDB', 'getSetting', 'decideResync',
             `const isAutoSteamActive = () => false; ${body}\nreturn { setStopAtTemperature, resyncMilkStopIfDrifted, resyncIfDrifted };`,
        )(
            { warn() {}, error() {} },
            async (key, value) => { kvWrites.push([key, value]); },
            async (key, value) => { pendingWrites.push([key, value]); },
            async (patch) => { workflowWrites.push(patch); },
            async () => remembered,
            async () => {},
            async (key) => (key.startsWith('pending-') ? pending : remembered),
            decideResync,
        );
        return { api, kvWrites, workflowWrites, pendingWrites };
    };

    test('an armed milk stop is remembered in KV before it reaches the machine', async () => {
        const { api, kvWrites, workflowWrites, pendingWrites } = build(null);
        await api.setStopAtTemperature(60);
        assert.deepEqual(kvWrites, [['last-milk-stop', 60]]);
        assert.deepEqual(workflowWrites, [{ steamSettings: { stopAtTemperature: 60 } }]);
        // Marked pending before the PUT, cleared once it landed.
        assert.deepEqual(pendingWrites, [['pending-last-milk-stop', 60], ['pending-last-milk-stop', null]]);
    });

    test('turning the stop off writes the machine but never the KV record', async () => {
        // 0 = off (user toggle, or a probe that vanished). Persisting it would erase
        // the temperature the user tuned.
        const { api, kvWrites, workflowWrites } = build(null);
        await api.setStopAtTemperature(0);
        assert.deepEqual(kvWrites, []);
        assert.deepEqual(workflowWrites, [{ steamSettings: { stopAtTemperature: 0 } }]);
    });

    test('an armed stop changed by another writer is adopted, not pushed back (#105)', async () => {
        const { api, kvWrites, workflowWrites } = build(60);
        assert.equal(await api.resyncMilkStopIfDrifted(55), null);
        assert.deepEqual(workflowWrites, []);
        assert.deepEqual(kvWrites, [['last-milk-stop', 55]]);
    });

    test('an armed stop whose own push never landed is re-pushed', async () => {
        const { api, kvWrites, workflowWrites } = build(60, { pending: 60 });
        await api.resyncMilkStopIfDrifted(55);
        assert.deepEqual(workflowWrites, [{ steamSettings: { stopAtTemperature: 60 } }]);
        assert.deepEqual(kvWrites, [['last-milk-stop', 60]]);
    });

    test('an agreeing armed stop is left alone', async () => {
        const { api, workflowWrites } = build(60);
        await api.resyncMilkStopIfDrifted(60);
        assert.deepEqual(workflowWrites, []);
    });

    test('a stop that is off is never re-armed by the remembered target', async () => {
        const { api, workflowWrites } = build(60);
        await api.resyncMilkStopIfDrifted(0);
        await api.resyncMilkStopIfDrifted(undefined);
        assert.deepEqual(workflowWrites, []);
    });

    test('a stored value above the API ceiling is clamped on the way out', async () => {
        // rest_v1.yml SteamSettings.stopAtTemperature documents range 0..80; the tile
        // used to allow 85, so an older KV record can still hold one.
        const { api, kvWrites, workflowWrites } = build(85, { pending: 85 });
        await api.resyncMilkStopIfDrifted(60);
        assert.deepEqual(workflowWrites, [{ steamSettings: { stopAtTemperature: 80 } }]);
        assert.deepEqual(kvWrites, [['last-milk-stop', 80]]);
    });

    test('a remembered value is pushed even when the workflow has no value at all', async () => {
        // The user's setting wins over an absent machine value -- a missing field is
        // the strongest reason to push what they asked for, not a reason to drop it.
        const pushed = [];
        const { api } = build(45);
        await api.resyncIfDrifted('last-anything', undefined, async (v) => { pushed.push(v); });
        await api.resyncIfDrifted('last-anything', null, async (v) => { pushed.push(v); });
        assert.deepEqual(pushed, [45, 45]);
    });

    test('the pushed value is returned so the caller can repaint its tile', async () => {
        // Pushing alone leaves the tile on the drifted workflow value. Steam flow,
        // the milk stop and the flush duration are in no websocket payload, so
        // nothing else would ever correct them.
        const { api } = build(45, { pending: 45 });
        assert.equal(await api.resyncIfDrifted('last-anything', 30, async () => {}), 45);
        assert.equal(await api.resyncMilkStopIfDrifted(55), 45);
    });

    test('an agreeing value returns nothing to repaint', async () => {
        const { api } = build(45);
        assert.equal(await api.resyncIfDrifted('last-anything', 45, async () => {}), null);
        assert.equal(await api.resyncMilkStopIfDrifted(45), null);
        // A disarmed stop never reaches the comparison at all.
        assert.equal(await api.resyncMilkStopIfDrifted(0), null);
    });

    test('a value some other writer set is adopted and not repainted or pushed', async () => {
        const pushed = [];
        const { api, kvWrites } = build(45);
        assert.equal(await api.resyncIfDrifted('last-anything', 30, async (v) => { pushed.push(v); }), null);
        assert.deepEqual(pushed, []);
        assert.deepEqual(kvWrites, [['last-anything', 30]]);
    });

    test('a push that fails stays pending so it can be retried after a reload', async () => {
        const kvWrites = [];
        const pendingWrites = [];
        const failing = new Function(
            'persistSharedValue', 'persistLastValue', 'openDB', 'getSetting', 'logger',
            `${body}\nreturn pushRemembered;`,
        )(
            async (key, value) => { kvWrites.push([key, value]); },
            async (key, value) => { pendingWrites.push([key, value]); },
            async () => {}, async () => null, { warn() {} },
        );
        await assert.rejects(failing('last-milk-stop', 60, async () => { throw new Error('503'); }));
        assert.deepEqual(kvWrites, [['last-milk-stop', 60]]);
        assert.deepEqual(pendingWrites, [['pending-last-milk-stop', 60]]);
    });

    test('with nothing remembered the machine value stands', async () => {
        const pushed = [];
        const { api } = build(null);
        await api.resyncIfDrifted('last-anything', 30, async (v) => { pushed.push(v); });
        await api.resyncIfDrifted('last-anything', undefined, async (v) => { pushed.push(v); });
        assert.deepEqual(pushed, []);
    });

    // resyncDriftedShotSettings re-checks drift on every shotSettings frame that
    // moves a field, and releases its cooldown whenever a check found nothing to
    // push -- so an unguarded readSharedValue was one /store GET per field per
    // frame. The cache is what keeps that at one round trip per field.
    {
        const buildCounted = (values) => {
            const reads = [];
            const api = new Function(
                'logger', 'persistSharedValue', 'persistLastValue', 'updateWorkflow', 'getValueFromStore', 'openDB', 'getSetting', 'decideResync',
                `const isAutoSteamActive = () => false; ${body}\nreturn { readSharedValue };`,
            )(
                { warn() {}, error() {} },
                async () => {}, async () => {}, async () => {},
                async (_ns, key) => { reads.push(key); return values[key] ?? null; },
                async () => {}, async () => null, decideResync,
            );
            return { api, reads };
        };

        test('a repeated shared-value read inside the TTL costs one store round trip', async () => {
            const { api, reads } = buildCounted({ 'last-steam-flow': 2.1 });
            assert.equal(await api.readSharedValue('last-steam-flow'), 2.1);
            assert.equal(await api.readSharedValue('last-steam-flow'), 2.1);
            assert.equal(await api.readSharedValue('last-steam-flow'), 2.1);
            assert.deepEqual(reads, ['last-steam-flow']);
        });

        test('each key is cached on its own, and a never-set key caches its null', async () => {
            const { api, reads } = buildCounted({ 'last-steam-flow': 2.1 });
            assert.equal(await api.readSharedValue('last-steam-flow'), 2.1);
            // null is a real answer ("never set"), so it must cache too -- the
            // boot resync asks for keys the user has never touched.
            assert.equal(await api.readSharedValue('last-milk-stop'), null);
            assert.equal(await api.readSharedValue('last-milk-stop'), null);
            assert.deepEqual(reads, ['last-steam-flow', 'last-milk-stop']);
        });
    }
}

// ── Steam duration 0 = the heater off; one rule for every way in (api.js) ───
{
    const body = lift('api.js', [
        /export const STEAM_DURATION_LAST_VALUE_KEY = .*;/,
        /export const STEAM_FLOW_LAST_VALUE_KEY = .*;/,
        /export const STEAM_TEMP_LAST_VALUE_KEY = .*;/,
        ...SHARED_VALUE_CACHE,
        /export async function readSharedValue\(key\) \{[\s\S]*?\r?\n\}/,
        ...TRACKING,
        /export async function setTargetSteamTemp\(temp\) \{[\s\S]*?\r?\n\}/,
        /async function steamHeaterFor\(on\) \{[\s\S]*?\r?\n\}/,
        /export async function setTargetSteamDuration\(duration, \{ rearm = false \} = \{\}\) \{[\s\S]*?\r?\n\}/,
        /export async function setSteamHeaterEnabled\(enabled\) \{[\s\S]*?\r?\n\}/,
    ]);

    // `remembered` is the KV record of the values to come back to (a bare number
    // is the temperature, the common case); `machine` is what the workflow
    // currently holds.
    const build = (remembered, machine = { targetTemperature: 150 }, dye = {}) => {
        const kv = typeof remembered === 'object' && remembered !== null ? remembered : { temp: remembered };
        const stored = {
            'last-steam-temp': kv.temp ?? null,
            'last-steam-duration': kv.duration ?? null,
            'last-steam-flow': kv.flow ?? null,
        };
        const steamSettings = typeof machine === 'number' ? { targetTemperature: machine } : machine;
        const kvWrites = [];
        const workflowWrites = [];
        const writerTags = [];
        const api = new Function(
            'logger', 'persistSharedValue', 'persistLastValue', 'updateWorkflow', 'getWorkflow', 'getValueFromStore', 'openDB', 'getSetting',
            'localStorage', 'getKVValue', 'getDye2KvArray', 'DYE2_KV_NAMESPACE', 'selectedRecipeSteam',
            'isSteamOff', 'steamOffPatch', 'steamOnPatch', 'steamDurationWrite', 'MIN_STEAM_DURATION_S',
            `const isAutoSteamActive = () => false; ${body}\nreturn { setTargetSteamDuration, setSteamHeaterEnabled, setTargetSteamTemp };`,
        )(
            { warn() {}, error() {} },
            async (key, value) => { kvWrites.push([key, value]); },
            async () => {},
            async (patch, writer) => { workflowWrites.push(patch); writerTags.push(writer); },
            async () => ({ steamSettings }),
            async (_namespace, key) => stored[key] ?? null,
            async () => {},
            async (key) => stored[key] ?? null,
            { getItem: () => (dye.enabled ? 'true' : null) },
            async () => dye.selection ?? null,
            async () => dye.recipes ?? null,
            'dye2.reaplugin',
            selectedRecipeSteam,
            isSteamOff, steamOffPatch, steamOnPatch, steamDurationWrite, MIN_STEAM_DURATION_S,
        );
        return { api, kvWrites, workflowWrites, writerTags };
    };

    test('duration 0 switches the heater off and is never remembered as a duration', async () => {
        // 0 has one meaning now: off. The last-* keys hold what we switch back
        // ON to, so a 0 must not land in them.
        const { api, kvWrites, workflowWrites } = build(null, { targetTemperature: 150, duration: 25 });
        await api.setTargetSteamDuration(0);
        assert.deepEqual(workflowWrites, [{ steamSettings: { targetTemperature: 0, duration: 0 } }]);
        assert.deepEqual(kvWrites, [['last-steam-temp', 150], ['last-steam-duration', 25]]);
    });

    test('the user setting a duration on an off machine brings the temperature back', async () => {
        // The tile reads the duration and the Settings toggle reads the
        // temperature. Sending the duration alone left the tile counting
        // seconds for a heater the toggle still (correctly) reported as off.
        const { api, workflowWrites, writerTags } = build({ temp: 150, duration: 45 }, 0);
        await api.setTargetSteamDuration(30, { rearm: true });
        assert.deepEqual(workflowWrites, [{ steamSettings: { targetTemperature: 150, duration: 30 } }],
            'the duration asked for wins over the remembered one');
        // Carrying the temperature makes this the heater writer's write, not
        // the duration writer's -- workflow-fields.js enforces that split.
        assert.deepEqual(writerTags, ['api.steamHeater']);
    });

    test('a background replay does not wake a heater the user switched off', async () => {
        // A drift resync or a profile's saved steam settings. Nothing is
        // written -- not the workflow, and not the KV key, which would
        // otherwise disagree with the workflow for good and have the drift
        // check replaying this on every cooldown.
        const { api, kvWrites, workflowWrites } = build({ temp: 150, duration: 45 }, 0);
        assert.equal(await api.setTargetSteamDuration(30), null);
        assert.deepEqual(workflowWrites, []);
        assert.deepEqual(kvWrites, []);
    });

    test('with the heater on, a duration write still sends the duration alone', async () => {
        const { api, workflowWrites } = build(150, { targetTemperature: 150 });
        await api.setTargetSteamDuration(30, { rearm: true });
        assert.deepEqual(workflowWrites, [{ steamSettings: { duration: 30 } }]);
    });

    test('switching the heater off zeroes both and remembers both', async () => {
        const { api, kvWrites, workflowWrites } = build(null, { targetTemperature: 150, duration: 45 });
        await api.setSteamHeaterEnabled(false);
        assert.deepEqual(workflowWrites, [{ steamSettings: { targetTemperature: 0, duration: 0 } }]);
        assert.deepEqual(kvWrites, [['last-steam-temp', 150], ['last-steam-duration', 45]]);
    });

    test('switching the heater on restores the remembered temperature and duration', async () => {
        const { api, workflowWrites } = build({ temp: 150, duration: 45 }, 0);
        await api.setSteamHeaterEnabled(true);
        assert.deepEqual(workflowWrites, [{ steamSettings: { targetTemperature: 150, duration: 45 } }]);
    });

    test('switching on with no remembered duration uses the documented default', async () => {
        const { api, workflowWrites } = build(150, 0);
        await api.setSteamHeaterEnabled(true);
        assert.deepEqual(workflowWrites, [{ steamSettings: { targetTemperature: 150, duration: 30 } }]);
    });

    test('a temperature set outside Streamline while steam is on is not overridden (#143)', async () => {
        const { api, workflowWrites } = build(150, 140);
        await api.setSteamHeaterEnabled(true);
        assert.deepEqual(workflowWrites, [{ steamSettings: {} }]);
    });

    test('a selected recipe beats the remembered values on re-arm, per field', async () => {
        const recipes = [{ id: '2', dashboardVariables: { steamTempC: 140, steamTimeS: 12 } }];
        const dye = { enabled: true, selection: { kind: 'recipe', id: '2' }, recipes };
        const { api, workflowWrites } = build({ temp: 150, duration: 45 }, 0, dye);
        await api.setSteamHeaterEnabled(true);
        assert.deepEqual(workflowWrites, [{ steamSettings: { targetTemperature: 140, duration: 12 } }]);
    });

    test('a recipe carrying only a temperature still gets the remembered duration', async () => {
        const recipes = [{ id: '2', dashboardVariables: { steamTempC: 140 } }];
        const dye = { enabled: true, selection: { kind: 'recipe', id: '2' }, recipes };
        const { api, workflowWrites } = build({ temp: 150, duration: 45 }, 0, dye);
        await api.setSteamHeaterEnabled(true);
        assert.deepEqual(workflowWrites, [{ steamSettings: { targetTemperature: 140, duration: 45 } }]);
    });

    test('DYE2 disabled or nothing selected falls back to the remembered values', async () => {
        const recipes = [{ id: '2', dashboardVariables: { steamTempC: 140 } }];
        const expected = [{ steamSettings: { targetTemperature: 150, duration: 45 } }];
        const off = build({ temp: 150, duration: 45 }, 0, { enabled: false, selection: { kind: 'recipe', id: '2' }, recipes });
        await off.api.setSteamHeaterEnabled(true);
        assert.deepEqual(off.workflowWrites, expected);
        const none = build({ temp: 150, duration: 45 }, 0, { enabled: true, recipes });
        await none.api.setSteamHeaterEnabled(true);
        assert.deepEqual(none.workflowWrites, expected);
    });

    test('a recipe steam temperature does not override a heater already on (#143)', async () => {
        const dye = { enabled: true, selection: { kind: 'recipe', id: '2' }, recipes: [{ id: '2', dashboardVariables: { steamTempC: 140 } }] };
        const { api, workflowWrites } = build(150, 145, dye);
        await api.setSteamHeaterEnabled(true);
        assert.deepEqual(workflowWrites, [{ steamSettings: {} }]);
    });

    test('switching on a heater that is already on changes nothing', async () => {
        const { api, workflowWrites } = build(null, 150);
        await api.setSteamHeaterEnabled(true);
        assert.deepEqual(workflowWrites, [{ steamSettings: {} }]);
    });

    test('an already-off machine has nothing worth remembering', async () => {
        const { api, kvWrites } = build(null, { targetTemperature: 0, duration: 0 });
        await api.setSteamHeaterEnabled(false);
        assert.deepEqual(kvWrites, []);
    });

    test('only enabled steam temperatures are remembered', async () => {
        const on = build(null);
        await on.api.setTargetSteamTemp(155);
        assert.deepEqual(on.kvWrites, [['last-steam-temp', 155]]);
        assert.deepEqual(on.workflowWrites, [{ steamSettings: { targetTemperature: 155 } }]);

        const off = build(null);
        await off.api.setTargetSteamTemp(0);
        assert.deepEqual(off.kvWrites, []);
        assert.deepEqual(off.workflowWrites, [{ steamSettings: { targetTemperature: 0 } }]);
    });
}

// REMOVED IN THE PORT: this block lifted resyncDriftedShotSettings out of the
// skin's app.js, and the next one lifted withSavedBrewTemp out of
// profileManager.js. Neither module is vendored — they are skin boot code, not
// settings code (PORT_PLAN.md §4-C/§4-F). The api.js coverage above, which is
// what settingsSync's KV contract actually rests on, is kept in full.


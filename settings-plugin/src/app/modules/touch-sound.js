// VENDORED from streamline_project/src/modules/touch-sound.js — do not edit.
// Canon is the skin. Change it there, then run `npm run sync` here.
// The port's own edits to this file live as patches in sync-upstream.mjs.
// The tap click, off by default (Settings > Miscellaneous).
//
// The sound is de1app's own `button_in`: src/sounds/KeypressStandard_120.ogg,
// registered there in utils.tcl as `dui sound set button_in` and played through
// `say`. It is the AOSP keypress effect at reduced volume (Apache-2.0, see
// src/sounds/README.md), so a Streamline tap sounds like a de1app tap.
//
// Played through WebAudio rather than an <audio> element: a decoded buffer can
// overlap with itself, so a fast double tap gives two clicks instead of cutting
// the first one off, and there is no per-tap element construction on the touch
// path. Nothing here touches the DOM at module load, so node tests can import it.

import { logger } from './logger.js';

export const TOUCH_SOUND_KEY = 'streamline.touchSound';
const SOUND_URL = 'data:audio/ogg;base64,T2dnUwACAAAAAAAAAAAAAAAAAAAAAB4ImBMBHgF2b3JiaXMAAAAAAUSsAAAAAAAA4CICAAAAAAC4AU9nZ1MAAAAAAAAAAAAAAAAAAAEAAAB4OPvuEv8M////////////////////XwN2b3JiaXMdAAAAWGlwaC5PcmcgbGliVm9yYmlzIEkgMjAwNDA2MjkSAAAAEwAAAENSRUFUT1I9QW1hZGV1cyBQcm8GAAAAVElUTEU9BgAAAEFMQlVNPQcAAABBUlRJU1Q9BQAAAERBVEU9BgAAAFRSQUNLPQwAAABUUkFDS05VTUJFUj0IAAAAQ09NTUVOVD0GAAAAR0VOUkU9BgAAAFRSQUNLPQcAAABBUlRJU1Q9EwAAAENSRUFUT1I9QW1hZGV1cyBQcm8GAAAAVElUTEU9BgAAAEFMQlVNPQwAAABUUkFDS05VTUJFUj0IAAAAQ09NTUVOVD0FAAAAREFURT0GAAAAR0VOUkU9AQV2b3JiaXMrQkNWAQAIAAAAMUwgxYDQkFUAABAAAGAkKQ6TZkkppZShKHmYlEhJKaWUxTCJmJSJxRhjjDHGGGOMMcYYY4wgNGQVAAAEAIAoCY6j5klqzjlnGCeOcqA5aU44pyAHilHgOQnC9SZjbqa0pmtuziklCA1ZBQAAAgBASCGFFFJIIYUUYoghhhhiiCGHHHLIIaeccgoqqKCCCjLIIINMMumkk0466aijjjrqKLTQQgsttNJKTDHVVmOuvQZdfHPOOeecc84555xzzglCQ1YBACAAAARCBhlkEEIIIYUUUogppphyCjLIgNCQVQAAIACAAAAAAEeRFEmxFMuxHM3RJE/yLFETNdEzRVNUTVVVVVV1XVd2Zdd2ddd2fVmYhVu4fVm4hVvYhV33hWEYhmEYhmEYhmH4fd/3fd/3fSA0ZBUAIAEAoCM5luMpoiIaouI5ogOEhqwCAGQAAAQAIAmSIimSo0mmZmquaZu2aKu2bcuyLMuyDISGrAIAAAEABAAAAAAAoGmapmmapmmapmmapmmapmmapmmaZlmWZVmWZVmWZVmWZVmWZVmWZVmWZVmWZVmWZVmWZVmWZVmWZVlAaMgqAEACAEDHcRzHcSRFUiTHciwHCA1ZBQDIAAAIAEBSLMVyNEdzNMdzPMdzPEd0RMmUTM30TA8IDVkFAAACAAgAAAAAAEAxHMVxHMnRJE9SLdNyNVdzPddzTdd1XVdVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVgdCQVQAABAAAIZ1mlmqACDOQYSA0ZBUAgAAAABihCEMMCA1ZBQAABAAAiKHkIJrQmvPNOQ6a5aCpFJvTwYlUmye5qZibc84555xszhnjnHPOKcqZxaCZ0JpzzkkMmqWgmdCac855EpsHranSmnPOGeecDsYZYZxzzmnSmgep2Vibc85Z0JrmqLkUm3POiZSbJ7W5VJtzzjnnnHPOOeecc86pXpzOwTnhnHPOidqba7kJXZxzzvlknO7NCeGcc84555xzzjnnnHPOCUJDVgEAQAAABGHYGMadgiB9jgZiFCGmIZMedI8Ok6AxyCmkHo2ORkqpg1BSGSeldILQkFUAACAAAIQQUkghhRRSSCGFFFJIIYYYYoghp5xyCiqopJKKKsoos8wyyyyzzDLLrMPOOuuwwxBDDDG00kosNdVWY4215p5zrjlIa6W11lorpZRSSimlIDRkFQAAAgBAIGSQQQYZhRRSSCGGmHLKKaegggoIDVkFAAACAAgAAADwJM8RHdERHdERHdERHdERHc/xHFESJVESJdEyLVMzPVVUVVd2bVmXddu3hV3Ydd/Xfd/XjV8XhmVZlmVZlmVZlmVZlmVZlmUJQkNWAQAgAAAAQgghhBRSSCGFlGKMMcecg05CCYHQkFUAACAAgAAAAABHcRTHkRzJkSRLsiRN0izN8jRP8zTRE0VRNE1TFV3RFXXTFmVTNl3TNWXTVWXVdmXZtmVbt31Ztn3f933f933f933f933f13UgNGQVACABAKAjOZIiKZIiOY7jSJIEhIasAgBkAAAEAKAojuI4jiNJkiRZkiZ5lmeJmqmZnumpogqEhqwCAAABAAQAAAAAAKBoiqeYiqeIiueIjiiJlmmJmqq5omzKruu6ruu6ruu6ruu6ruu6ruu6ruu6ruu6ruu6ruu6ruu6ruu6QGjIKgBAAgBAR3IkR3IkRVIkRXIkBwgNWQUAyAAACADAMRxDUiTHsixN8zRP8zTREz3RMz1VdEUXCA1ZBQAAAgAIAAAAAADAkAxLsRzN0SRRUi3VUjXVUi1VVD1VVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVXVNE3TNIHQkJUAABkAAKXFCCGEEA6DUGIOQlgMKUc9+CAxZJTUIISlFGISexCaYow5Jrm3ECqFCKJca4wQI8ZxEDJjUinJQfiSaik5CEJDVgQAUQAAAEKIMcQYYsxByCBEjDEIHYSIMQYhg5BBCCWFVDIIIZVQUsQYg5BByCCEVEIpHYSQUkilAACAAAcAgAALodCQFQFAnAAAg5BziCkIkWIQOggpdRBSihiDkDknJXNOSiiltVBKahFjEDLHpGTOSQkltBRKaa2D0FIopbVQSmuptVpTarF2EFIKpbQWSmkttRRjaq3WiDEImXNSMuekhFJaC6WkljknpYOQUgchpZJSiyWlFivnpHTQUekgpFRSia2kFGMopbWSUowlpRhbi7G2GGsNpbRWUomtpBRjiq3GFmOtEWMQMuekZM5JCaW0FkppLXNOSgchpc5BSSWlGEtJLWbOSekgpNRBSKmkFGNJKbZQSmslpRhLSS22GGttLcYaSmmtpBRjSSnGFmOuLcYaOwgphVJaC6W01lqrMbVWayiltZJSjCWlGFuMNbcYaw6ltFZSia2kFGOLLdcWY82ptVpbjLW2GHOttdZea+49tVZraq3WFmPNscZea629dxBSCqW0FkppLbVWY2qt1lBKayWlGEtJLbYYc20txhpKaa2kFGNJKcYWY60txlxTazW2GHNNrcVac+05xhp7aq3WFmPNLbZca6091xx7LQAAYMABACDAhDJQaMhKACAKAAAxBiHGIDTIKMUYhMYgpRiDECnFmHNSKqUYc05KxphzEFLJGHMOQkkhhFJSaSmEEEpKqRUAAFDgAAAQYIOmxOIAhYasBABCAgAYY5RizDnnpKSUUoOQUow5B6GUlFprEFKKMecglJJSa5VSjDkHIYRSUmqtUoox5yCEUEpKrWWMOQedhBJSaSm2jDHnHIQSSkmptdg5ByGEUlJJqbUYO+cghFJKSSm11mIHIYQSUkmppdhi7CCEEEpJKaXWYoyllFJSSaml2GKssZRSSkkppdZijLGmlFJqqbXYYqyx1pRSSqm11mKMsdaaWmsttthirLHWWlNrrbUWY4yx1lprAQAABw4AAAFG0ElGlUXYaMKFB6DQkBUBQBQAAGAMYgwxhpxzEDIIkXMMQgchcs5J6aRkUkJpoaVMSkglpBY556R0UjIpIaVQUiYlpFRaKQAA7MABAOzAQig0ZCUAkAcAwCCkFGOMOYcQUoox55xDCCnFGHPOKaUYY8w555RSjDHmnHOMMcacc845xhhjzjnnHHPMOeecc44555xzzjnnnHPOOecgdM4555xzEAoAACpwAAAIsFFkc4KRoEJDVgIAqQAAhDFKMeYchFIahRhzzjkIpTRKMeaccxBKqRhjzjkHoZRSMeacc9BJSCVzzjkHIZSSUuacc9BBKCWlzjkIIYRSSkqdcxBCKKGUlEIIoZRSSkmphRBKKKWUVFoqpZSSUkqptVZKKSmllFpqrQAA8AQHAKACG1ZHOCkaCyw0ZCUAkAEAgBiDkEEIIYMQQgghhBBCCAkAABhwAAAIMKEMFBqyEgBIBQAADFKKMeekpBQpxZhzEFJpKVKKMecglJRaxZhzEEpJqbWKMecglJJabJlzEEpJqbUYO+cglJJSazGGEEpJqbUYaw0hlJJSazHWWlJqKbYYa825pJRai7HWmnNqLcYac82555RajLHWmnPuBQAgNDgAgB3YsDrCSdFYYKEhKwGAPAAABiGlGGOMMaQUY4wxxhhSijHGGGNMMcYYY4w5pxhjjDHGmGOMMcaYc84xxhhjzDnnGGOOOeecc4wxxpxzzjnGmHPOOeccY8w555xzTgAAUIEDAECAjSKbE4wEFRqyEgAIBwAAjGHMOcegk5BKo5RzEkIoJZVWGqWckxJCKSmlljknJaVUWmotpsw5KSmVklJrMXZSUmqppdhiq7GTkFJrrbUWY40dhFRaii3GGmvsIJTUWmsx1lxrKKWl2GKssdZaQymttRZjrTXXWlKKLbZaa60155JSazHWWnOuPafWYqu1xlxzzkG1FmOtNeeacw0GAJg8OABAJdg4w0rSWeFocKEhKwGA3AAARinGnHMOQgghhBBCCJVSjDnnHIQQQgghhBAipRhzDjoIIYQQQgghZIw55xyEEEIIIYQQQsgYc845CCGEEEIIIYTQOecchBBCCCGEEEoJpXPOOQghhBBCCCWUEkoHHYQQQgihhFJKKaWUDjoIIYQQQgihlFJCKSGEEEIIIYQSSimllFJCCCGEEEIIJZRSSimlhBBCCKGEUkoppZRSSgkhhBBCCKGUUkoppZQSQgghlFJKKaWUUkopJYQQQgillFJKKaWUUkoIIYQQSimllFJKKaWUEEIIpZRSSimllFJKKSGEEkoppZRSSimllFJCCCGUUEoppZRSSimlhBBCCKWUUkoppZRSSgkhlFBCKaWUUkoppZRSAADQgQMAQIARlRZipxlXHoEjChkmoEJDVgIAUQAAACEQQgihgRBCCCFEEEIIIYQQQgghhBBCCCGEEEIIIYQQQgghhBBCCCGEEEIIIYQQOuecAMDoCwfA6AkbNCUWByg0ZCUAkBYAABjDmGNOQSYdlZRSapiCUEIIpaSSSkoxNYxBCCGEUlJJKbXUMugopVRKSq211lqNmYOSUiolpZRaqy3WDkJKKaXUWm251pprByGllFpqLcYYY6y1g5BKS63FGGOutfbeQSgptdZijLXW3HMOpaTWYoy19lp77z2HUlJqMdZce829955LSi3GmnPOueeee84lpRhrjLnm3HPOPffSWq211t5zzr333ntqrdZac+6555577721WGvuvffec++9995irLXW3HPvvffee2+x1tpzz7333nvvvbcaa865595z77333gsAyI1wAEBcMJKQOsuw0ogbT8AQgRQasgoAiAEAGIIgKBYfAACY4AAAEGAFuzJLqzaKmzrJiz4IfEJHbEaGXErFTE4EPVJDLVaCHVrBDV4AFhqyEgAgAwBAINaaa805MspJazXnEBnkJMXeS2YIYpBiLCEzRjlpNaZQIaSc1ZhKx5RiUmNqpWNKQWypthQ6Bim1GmsqnYMAAAAIAgAMRMhMIFAABQYyAOAAIUEKACgsMHQMFwEBuYSMAoPCMeGcdNoAAAQhMkMkIhaDxIRqoKiYDgAWFxjyASBDYyPt4gK6DHBBF3cdCCEIQQhicQAFJODghBueeMMTbnCCTlGpgwAAAAAAQACABwCAZAOIiGZmjqPD4wMkRGSEpMTkBCVFJQAAAAAAgADgAwAgWQEiopmZ4+jw+AAJERkhKTE5QUlRCQAAAAAAAAAAAAICAgAAAAAAAQAAAAICT2dnUwAEoRIAAAAAAAAAAAAAAgAAAA4lzwQMW09RVv+J/wb/FvvenELRA7iZKnzrH7qse51xfdPcHLkcmb5dETcTHl4wB9Py+sMzrpd2XC/XnZEeDhnXNUZqUB0pjlh3R9iC6yLX6rAN5szTkJe6dUTlRic0kvF3r+Rfy7sLfS4iALR22cQs5fqTqP785Poc4SgdzW95WLffhb+0keOp4XHqCPFDJcnW7+Z5X+DsemIIooS54BT3TzQSirNjEsI/zDuAAZICEIwOVWBgMIywOwO0VuEeVDV/hEaL/WP66/Ph3/bI/vAez276/8JP3dEqGytUMy5HecWLkQc8ZrZTHHoer41kVzGO2F4JbKn4wYDWAdyUR6wmH/ntPVkbXalDmwmkgtU7OIdYulbIedq6h9yLSM/dip+umiLUZa3TgzRte3BYE1JHG2zkd+NDcxmgmUcppL1fTfpxoCn0db1m/h2pc+hfl5NMI6iWmfQYX8h/z46vPUIAALrZ9NMtmxaM4n8pvl0mtO5+ef7ee1c3vv6Bq6vn792Iyfkrr9yLjT1sG+1UfKP6RrA7l19fnvh2zAFcb+i4wy35ZECt9WrniBFgKS9rMvJYiG3dCQAAkGWpygOLfIx0NVEAHol6+fqvrsZhV/L4jRx/4fCw/d5fMhoK3HSS79isqCZjExn73jQ9+6cKGP8ObOrZvFIZnj+7GK79DFR+95X+wu41bKYlQEi5+j3xTuOmy/np8PDF9xlVSgAAACzl9svz6d50u3dK5Yl69g458lf0wp5k16y1CACASxn3eum+p03KVq7Rn5aKWVER8NR8rXIG1triZIbzU2XqP5q3AAAgUjpvZSeSUsr18GJNtxYBAGApe2z28Kt9KWFFByiof7segZYOuN57AARjPfnusbb3HgEAAEx99mDbIwAAgJoPHTQKED9bXm619+3WsgQAAKrll64H0NpB1wdAeN9/fUcNY9TdH55VUQH1WwWg5sEa2h4hAAAAAADA1Pa/HdtvHcD79XrGAAAA3gbE66UUTpRfvrV5X6uVz/XTqwmwAZ8Z8QMT5TNUJ4bdVQkB4DjPzca1S+LeZvyje59mF3ayobZupfXa8x8hk6Wv7bfbGUb8aWbeUTAAABjkx9l6vY7J7lcYPr+5HZIHs/jlC0i+d0HvV5q+X0H++isCADu7igAQAAzR1i2XGlbvPz7PxJsD6G8e2B+j/DgjoD7OCAAAAADsfiXkjzOy+xUG8mNdmD0J9sujDKDKHBoMECCANkx4TRcnId0fTvht1GGhA0gqA4AbL0LxxsTe1ulcAgCh/kUTWETEBTwUWOeKl5MPu872gVAAZQ1rA2ufAUDMMoKv6QOANU19DgAAAAA3YwAAXhe8b+cWwgSAj54YARKITpLEYxkAHnsqxzBT7mnVnSLZjpa60hFJG9f29lLB/3qeYFe/Sj/8bBWvy8K3Trm56b2Sc+HcOX5qa7fiXkNwfN7OO+7szmxq9fEjKr9+jVVOYb0dvFh3QU6k1Cmjh4lDxx4cLk5XMLJbdDeEmlpwSMW51t3lOcc2YjzYvvHuxf1NX98Uvh3x9TmL55Lk1OSAXnfYw/UWCTIFK9h2NJG+AA4WspB3sexXW85fPyMKFo2vUaduytxSBxmiCwB+z9q7hjlgoNObpvdoHLCmRh1b0+Pt606ZS+m8fa6bjRtgb2/ryz4FC566Tf9HEXgHbN9OEgAAAJj68RMAALQEAACAIQMAgDagDR4GvJ29BHUA4Expr0TKu3yq6HOZp2VodJJEShkAQN3TyBDh1W1d5myMO59fDNR6C14jxbqhL7kOPTQ9eVt7QXsprKV16uL8S4luihdjsVeXdFOJvhEd6lBH5j/2EX9MXfiRejCvHTPGtmiMioxs8WvRgjBHm0IeFdmZMZFmt6ZW0uWkcKmdgoIvydvj4c62maoc8zGwU/ihOfWKL9f3T6CdaTl+WwjcHLuKhx+xDjMG2Hgez7W2MAotO0oNjYAaAnSvglvHBaQGdiKemZH2YP827ZMDZG2nD8zLvAAAdkbgCg5foQnApoEIANBNAgAAAGMFAAAAAADguQAAfgX8tbYdaSA7oddwPuk0yyC2a42npb91ZYJdNq7WSDIBAMDk4FFae41k9fhk8awqary3ve/9XhG963/h/I2zKxtnbeH7/fb+GBYBt1+tcO4fMeBhfpyt49uvVnj/9f8fx4R+/e13OqE+tzn5tovgP87W6xgYD0POqqqqqv3jrMrul+6cH2c0L/nj8Vlsy/swCwH9ev1jTc3ic1rlPEhqVLUiyUJsRVzeP1xhADAGAJTX0+c1gQdjDHgMTzY/XOGCMbDHhZP4ITgJ1kntpObvpwH9MwTQGSf5gR+0AfwA';

export function isTouchSoundEnabled() {
    try { return localStorage.getItem(TOUCH_SOUND_KEY) === 'true'; } catch (e) { return false; }
}

/**
 * Does a tap on this element deserve a click?
 *
 * Controls only: a tap on a background, a label or a readout is not a press and
 * must stay silent. `[data-no-sound]` opts an individual control out.
 *
 * @param {*} target  the pointerdown target
 * @param {function} closest  how to walk ancestors; injected so this is testable
 */
export function isSoundTarget(target, closest = (el, sel) => el?.closest?.(sel)) {
    if (!target) return false;
    const control = closest(target, 'button, [role="button"], input[type="checkbox"], input[type="radio"], select, a[href], .preset-button, [data-tile], [data-steam-mode], [data-auto-pitcher]');
    if (!control) return false;
    if (closest(target, '[data-no-sound]')) return false;
    return !control.disabled;
}

let context = null;
let buffer = null;
let loading = null;

// Decoding is deferred to the first tap that will actually play: the setting is
// off by default, and an AudioContext created before a user gesture starts
// suspended and would have to be resumed anyway.
async function ensureBuffer() {
    if (buffer) return buffer;
    loading ||= (async () => {
        context ||= new (window.AudioContext || window.webkitAudioContext)();
        const response = await fetch(SOUND_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        buffer = await context.decodeAudioData(await response.arrayBuffer());
        return buffer;
    })();
    return loading;
}

export async function playTouchSound() {
    try {
        await ensureBuffer();
        // Never awaited: resume() only settles once the page has real user
        // activation, so awaiting it inside a tap handler that fired without one
        // leaves a promise pending for the life of the page -- one per tap.
        // Fire and forget, then play; a context that is still suspended drops
        // this click, which is the right way to lose.
        if (context.state === 'suspended') context.resume().catch(() => {});
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        source.start();
    } catch (error) {
        loading = null; // a failed decode must not pin the module into silence
        logger.warn('Touch sound failed:', error);
    }
}

let started = false;

/** Idempotent. Safe to call on every main-page mount. */
export function initTouchSound() {
    if (started) return;
    started = true;
    // Capture phase on the document: every control is covered without each one
    // having to opt in, and a handler that stops propagation cannot mute it.
    // pointerdown rather than click, so the click lands with the finger.
    document.addEventListener('pointerdown', event => {
        if (!isTouchSoundEnabled() || !isSoundTarget(event.target)) return;
        playTouchSound();
    }, { capture: true, passive: true });
}

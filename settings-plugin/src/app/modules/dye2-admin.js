// PORT_PLAN.md §4-F: the settings page uses five functions out of dyeStrip.js —
// the DYE2 install / version / update card under Extensions. The rest of that
// module renders the skin's favourite strip and drags in profileManager.js and
// context-menu.js (~1,300 lines) that settings never touches, so only the plugin
// administration block is vendored here, verbatim from
// streamline_project/src/modules/dyeStrip.js (lines 367-617).
//
// It talks to Decaid's /plugins REST surface, which the plugin page reaches the
// same way the skin does.
import { getPlugins, installPluginFromRelease, enablePlugin, checkPluginUpdates, approvePluginUpdate, getWorkflow, updateWorkflow } from './api.js';
import { logger } from './logger.js';

// From dyeStrip.js's header (outside the extracted range).
const PLUGIN_ID = 'dye2.reaplugin';
export const PLUGIN_REPO = 'decentespresso/dye2';
export const PLUGIN_RELEASES_PAGE = 'https://github.com/decentespresso/dye2/releases/latest';

// ─── Plugin install / version state ───────────────────────────────────────────
//
// Streamline is a read-only consumer of DYE2's KV contract, so an outdated plugin
// shows up here as missing keys / empty strips rather than an error. Decaid owns
// distribution now: it records where dye2.reaplugin came from and installs new
// releases itself, holding back only updates that ask for new permissions (those
// surface as pendingUpdate on GET /plugins). So there is nothing to nag about —
// Streamline just reads the bridge and never talks to GitHub.
//
// Dialogs here are inline-styled like openPluginOverlay's overlay, not Tailwind:
// any new utility class would need a CSS rebuild to exist in app.css (see CLAUDE.md).

// ponytail: numeric compare only — dye2 tags are plain vMAJOR.MINOR.PATCH. If it
// ever ships `-beta` tags, borrow settings.js's compareVersions, which orders them.
function isOlderVersion(a, b) {
    const nums = (v) => String(v || '').trim().replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
    const x = nums(a), y = nums(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
        const d = (x[i] || 0) - (y[i] || 0);
        if (d !== 0) return d < 0;
    }
    return false;
}

// ─── Enable-time plugin requirement gate ────────────────────────────────────
// Toggling DYE2 on in Settings requires the plugin actually installed, loaded,
// and at least MIN_PLUGIN_VERSION — otherwise the header lights up with no data
// behind it. This floor is about the KV contract, not about being current: Decaid
// keeps the plugin up to date on its own, so bump it only when the contract moves.
const MIN_PLUGIN_VERSION = '0.1.4';

export async function checkDye2PluginRequirement() {
    const plugins = await getPlugins();
    if (!plugins) return { ok: false, reason: 'unreachable' };
    const plugin = plugins.find(p => p?.id === PLUGIN_ID);
    if (!plugin) return { ok: false, reason: 'missing' };
    if (!plugin.loaded) return { ok: false, reason: 'not-loaded', installed: plugin.version };
    if (isOlderVersion(plugin.version, MIN_PLUGIN_VERSION)) return { ok: false, reason: 'outdated', installed: plugin.version };
    return { ok: true, installed: plugin.version };
}

// Resolves true once the plugin is installed, loaded and at the required floor —
// so the Settings toggle can go on — and false if the user backed out or the
// install failed. Decaid installs plugins itself now (POST
// /plugins/install/github-release), so "missing" and "outdated" are one button,
// not a download-and-sideload errand; the releases page stays as the fallback for
// when that call fails (offline, GitHub down, a release with no single zip).
function promptPluginRequired(reason, installed) {
    return new Promise((resolve) => {
        const dlg = document.createElement('dialog');
        dlg.id = 'dye2-required-dialog';
        dlg.style.cssText =
            'border:0;border-radius:24px;padding:0;background:transparent;color:var(--text-primary);';
        const body = {
            missing: `The DYE2 plugin isn't installed (need v${MIN_PLUGIN_VERSION}+). Install it from ${PLUGIN_REPO} and it will be enabled for you.`,
            'not-loaded': `The DYE2 plugin (v${installed || '?'}) is installed but not loaded. Open Decaid's Plugin settings and enable it, then come back and turn DYE2 on again.`,
            outdated: `Installed DYE2 plugin is v${installed}, older than the required v${MIN_PLUGIN_VERSION}. Install the current release to continue.`,
            unreachable: `Couldn't reach the plugin bridge to verify DYE2 is installed. Check the connection and try again.`,
        }[reason] || `DYE2 plugin v${MIN_PLUGIN_VERSION}+ is required to enable this.`;
        // Only missing/outdated are fixable from here. "not-loaded" needs a human in
        // Decaid's plugin settings and "unreachable" has no bridge to install through.
        const canInstall = reason === 'missing' || reason === 'outdated';
        dlg.innerHTML = `
            <div style="background:var(--bgmain-color,#fff);border-radius:24px;padding:36px 40px;max-width:640px;display:flex;flex-direction:column;gap:18px;">
                <div style="font-size:30px;font-weight:700;color:var(--mimoja-blue);">DYE2 plugin required</div>
                <div id="dye2-required-body" style="font-size:23px;line-height:1.4;">${body}</div>
                <div style="display:flex;justify-content:flex-end;gap:14px;padding-top:6px;">
                    <button id="dye2-required-cancel" style="padding:10px 26px;border:2px solid var(--mimoja-blue);background:transparent;color:var(--mimoja-blue);border-radius:20px;font-size:22px;font-weight:600;cursor:pointer;">${canInstall ? 'Cancel' : 'OK'}</button>
                    ${canInstall ? `<button id="dye2-required-install" style="padding:10px 26px;border:0;background:var(--mimoja-blue);color:#fff;border-radius:20px;font-size:22px;font-weight:600;cursor:pointer;">Install</button>` : ''}
                </div>
            </div>`;
        document.body.appendChild(dlg);

        const close = (ok) => { dlg.close(); dlg.remove(); resolve(ok); };
        dlg.querySelector('#dye2-required-cancel').addEventListener('click', () => close(false));

        const installBtn = dlg.querySelector('#dye2-required-install');
        installBtn?.addEventListener('click', async () => {
            const text = dlg.querySelector('#dye2-required-body');
            installBtn.disabled = true;
            installBtn.textContent = 'Installing…';
            try {
                await installDye2Plugin();
                const recheck = await checkDye2PluginRequirement();
                if (recheck.ok) { close(true); return; }
                text.textContent = `Installed v${recheck.installed || '?'}, but it still isn't usable (${recheck.reason}). Open Decaid's Plugin settings to finish enabling it.`;
                installBtn.remove();
                dlg.querySelector('#dye2-required-cancel').textContent = 'OK';
            } catch (e) {
                logger.error('dyeStrip: DYE2 install failed', e);
                // textContent, not innerHTML: the message is a server/network error string.
                text.textContent = `Install failed: ${e.message || e}. You can install the zip by hand from the releases page instead.`;
                installBtn.disabled = false;
                installBtn.textContent = 'Releases';
                installBtn.replaceWith(installBtn.cloneNode(true)); // drop this handler
                dlg.querySelector('#dye2-required-install').addEventListener('click', () => {
                    close(false);
                    // Same-frame nav, no _blank/window.open: in the tablet webview the
                    // host intercepts the external URL and hands it to the OS browser.
                    window.location.href = PLUGIN_RELEASES_PAGE;
                });
            }
        });
        dlg.showModal();
    });
}

// Called from the Settings toggle before flipping DYE2 on. Prompts and returns
// false if the plugin isn't ready; the caller should leave the toggle off.
export async function ensureDye2PluginReady() {
    const check = await checkDye2PluginRequirement();
    if (check.ok) return true;
    // The prompt can fix "missing"/"outdated" in place, so its result — not the
    // original check — decides whether the toggle may go on.
    return promptPluginRequired(check.reason, check.installed);
}

// Everything the Settings → DYE2 card needs, straight off the bridge:
// GET /plugins carries the installed version, the recorded `source` and, when an
// update was held back for asking new permissions, `pendingUpdate`. An
// unreachable bridge is reported as such rather than guessed at.
export async function getDye2VersionInfo() {
    const plugins = await getPlugins().catch(() => null);
    if (!plugins) return { reachable: false, installed: null, loaded: false, source: null, pending: null };
    const plugin = plugins.find(p => p?.id === PLUGIN_ID);
    return {
        reachable: true,
        installed: plugin?.version || null,
        loaded: !!plugin?.loaded,
        source: plugin?.source || null,
        pending: plugin?.pendingUpdate || null,
    };
}

// Install from the canonical repo's latest release and enable it. Decaid installs
// plugins with auto-load off, so the enable call is what actually starts it and
// makes it load on the next app start.
export async function installDye2Plugin() {
    const result = await installPluginFromRelease(PLUGIN_REPO);
    await enablePlugin(PLUGIN_ID);
    logger.info(`dyeStrip: installed ${PLUGIN_ID} v${result?.version || '?'} from ${PLUGIN_REPO}`);
    return result;
}

const CHECK_COOLDOWN_MS = 15 * 60 * 1000; // see checkDye2UpdatesIfDue

// Ask Decaid to compare the installed copy against the release its recorded
// source points at. An update that asks for no new permission is downloaded AND
// installed inside this call — Decaid restarts the plugin on it — so afterwards
// the bridge already reports the new version. One that asks for more becomes a
// pendingUpdate that only an explicit approval installs.
//
// Decaid queries api.github.com unauthenticated: 60 requests an hour for the
// whole tablet, shared with its own periodic check and with skin updates. Past
// that GitHub answers 403 and the check records a lastError instead of an answer.
// Opening a settings page or flipping a toggle is something a user can do
// repeatedly, so honour the recorded lastChecked and skip a check that would only
// re-ask a question Decaid asked minutes ago. Anything an earlier check already
// found is still on the bridge to read.
//
// Returns the state after the check. Never throws: a failed check (offline,
// GitHub down, rate-limited) leaves the installed plugin working and untouched.
export async function checkDye2UpdatesIfDue() {
    const before = await getDye2VersionInfo();
    // An untracked copy (local ZIP or folder) has no source to check against, and
    // updateAllPlugins skips it anyway.
    if (!before.reachable || !before.installed || !before.source) return before;

    const lastChecked = Date.parse(before.source.lastChecked || '');
    if (Number.isFinite(lastChecked) && Date.now() - lastChecked < CHECK_COOLDOWN_MS) return before;

    try {
        await checkPluginUpdates();
    } catch (e) {
        logger.info(`dyeStrip: update check failed (${e.message || e})`);
    }
    const after = await getDye2VersionInfo();
    if (after.installed && after.installed !== before.installed) {
        logger.info(`dyeStrip: DYE2 updated v${before.installed} -> v${after.installed}`);
    }
    return after;
}

// Called after the DYE2 toggle goes on. Same check, plus the prompt: an update
// held back for asking new permissions is the one thing that needs a decision,
// and the toggle is where the user is looking. Resolves true if the plugin ended
// up on a new version, either because Decaid installed it or because the user
// approved the escalating one.
//
// Never blocks the toggle: the requirement gate already established the plugin is
// usable, so nothing here can leave DYE2 off.
export async function offerDye2Update() {
    const before = await getDye2VersionInfo();
    const after = await checkDye2UpdatesIfDue();
    if (after.installed && after.installed !== before.installed) return true;
    if (after.pending) return promptPluginUpdate(after);
    return false;
}

// Resolves true if the update was installed. The added permissions are listed
// verbatim: approving is consent to those, not to "an update", so nothing here
// approves on the user's behalf.
function promptPluginUpdate(info) {
    return new Promise((resolve) => {
        const dlg = document.createElement('dialog');
        dlg.id = 'dye2-update-dialog';
        dlg.style.cssText =
            'border:0;border-radius:24px;padding:0;background:transparent;color:var(--text-primary);';
        const permissions = (info.pending.addedPermissions || []).join(', ') || 'none listed';
        dlg.innerHTML = `
            <div style="background:var(--bgmain-color,#fff);border-radius:24px;padding:36px 40px;max-width:640px;display:flex;flex-direction:column;gap:18px;">
                <div style="font-size:30px;font-weight:700;color:var(--mimoja-blue);">DYE2 update available</div>
                <div id="dye2-update-body" style="font-size:23px;line-height:1.4;">
                    Installed <b>v${info.installed}</b>, available <b>v${info.pending.version}</b>.
                    It asks for permissions the installed version does not have:
                    <b>${permissions}</b>. Update only if you trust this.
                </div>
                <div style="display:flex;justify-content:flex-end;gap:14px;padding-top:6px;">
                    <button id="dye2-update-later" style="padding:10px 26px;border:2px solid var(--mimoja-blue);background:transparent;color:var(--mimoja-blue);border-radius:20px;font-size:22px;font-weight:600;cursor:pointer;">Later</button>
                    <button id="dye2-update-now" style="padding:10px 26px;border:0;background:var(--mimoja-blue);color:#fff;border-radius:20px;font-size:22px;font-weight:600;cursor:pointer;">Update</button>
                </div>
            </div>`;
        document.body.appendChild(dlg);

        const close = (updated) => { dlg.close(); dlg.remove(); resolve(updated); };
        dlg.querySelector('#dye2-update-later').addEventListener('click', () => close(false));

        const updateBtn = dlg.querySelector('#dye2-update-now');
        updateBtn.addEventListener('click', async () => {
            const text = dlg.querySelector('#dye2-update-body');
            updateBtn.disabled = true;
            updateBtn.textContent = 'Updating…';
            try {
                const result = await approvePluginUpdate(PLUGIN_ID);
                logger.info(`dyeStrip: DYE2 approved and updated to v${result?.version || '?'}`);
                close(true);
            } catch (e) {
                // 409: the release moved after this permission delta was shown. Decaid
                // has recorded the new candidate, so the fresh delta has to be reviewed
                // — retrying this call would only 409 again.
                text.textContent = e.status === 409
                    ? 'The update changed since it was shown. Open Settings → Extensions to review the new one.'
                    : `Update failed: ${e.message || e}`;
                if (e.status !== 409) logger.error('dyeStrip: DYE2 update approval failed', e);
                updateBtn.remove();
                dlg.querySelector('#dye2-update-later').textContent = 'OK';
            }
        });
        dlg.showModal();
    });
}

// ─── Workflow context hygiene ─────────────────────────────────────────────────
// Verbatim from dyeStrip.js (v0.2.7): the Settings toggle clears the bean/equipment
// identity DYE2 left on the workflow when it is switched off.
const DYE_CONTEXT_FIELDS = {
    beanBatchId: null, coffeeName: null, coffeeRoaster: null,
    grinderId: null, grinderModel: null,
    baristaName: null, drinkerName: null,
    extras: { basketId: null, basketName: null, rpm: null, note: null },
};

function hasDyeContext(context, includeGrinderSetting = false) {
    if (!context) return false;
    const extras = context.extras || {};
    const top = Object.keys(DYE_CONTEXT_FIELDS).filter(k => k !== 'extras');
    if (includeGrinderSetting) top.push('grinderSetting');
    return top.some(k => context[k] != null)
        || Object.keys(DYE_CONTEXT_FIELDS.extras).some(k => extras[k] != null);
}

export async function clearDyeWorkflowContext({ includeGrinderSetting = false } = {}) {
    try {
        const live = await getWorkflow();
        if (!hasDyeContext(live?.context, includeGrinderSetting)) return false;
        const context = { ...DYE_CONTEXT_FIELDS };
        if (includeGrinderSetting) context.grinderSetting = null;
        await updateWorkflow({ context });
        logger.info('dye2-admin: cleared stale DYE2 workflow context');
        return true;
    } catch (err) {
        // Cleanup is hygiene, never the point of the call that triggered it.
        logger.warn('Failed to clear DYE2 workflow context:', err);
        return false;
    }
}

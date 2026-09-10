import { CONTENT_SCRIPT_DEFINITIONS } from './content-script-definitions.js';

export { CONTENT_SCRIPT_DEFINITIONS } from './content-script-definitions.js';

export const MASTER_FEATURE_KEY = 'allFeaturesDisabled';

const OWNED_ID_PREFIX = 'ops-toolshed-';
let active = false;
let initialized = false;
let reconciliation = Promise.resolve();

function storageGet(defaults) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = value => {
            if (settled) return;
            settled = true;
            if (chrome.runtime?.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve({ ...defaults, ...(value || {}) });
        };
        try {
            const result = chrome.storage.sync.get(defaults, finish);
            result?.then?.(finish, reject);
        } catch (error) {
            reject(error);
        }
    });
}

async function getOwnedRegistrations() {
    if (typeof chrome.scripting?.getRegisteredContentScripts !== 'function') return [];
    const registrations = await chrome.scripting.getRegisteredContentScripts();
    return registrations.filter(item => item.id?.startsWith(OWNED_ID_PREFIX));
}

async function unregisterOwnedContentScripts() {
    if (typeof chrome.scripting?.unregisterContentScripts !== 'function') return;
    const registered = await getOwnedRegistrations();
    const ids = registered.map(item => item.id).filter(Boolean);
    if (ids.length > 0) await chrome.scripting.unregisterContentScripts({ ids });
}

async function registerOwnedContentScripts() {
    if (typeof chrome.scripting?.registerContentScripts !== 'function') return;
    await unregisterOwnedContentScripts();
    await chrome.scripting.registerContentScripts(CONTENT_SCRIPT_DEFINITIONS.map(definition => ({ ...definition })));
}

async function reloadMediaoceanTabs() {
    if (typeof chrome.tabs?.query !== 'function' || typeof chrome.tabs?.reload !== 'function') return;
    const tabs = await chrome.tabs.query({ url: ['https://*.mediaocean.com/*'] });
    await Promise.allSettled(tabs.filter(tab => Number.isInteger(tab.id)).map(tab => chrome.tabs.reload(tab.id)));
}

export function isFeatureModeActive() {
    return initialized && active;
}

export function isPopupSender(sender) {
    const popupUrl = chrome.runtime?.getURL?.('popup.html');
    return Boolean(popupUrl && sender?.url === popupUrl && !sender?.tab);
}

export function reconcileFeatureMode(disabled, { reloadTabs = false } = {}) {
    if (disabled === true) {
        active = false;
        initialized = true;
    }
    reconciliation = reconciliation.catch(() => undefined).then(async () => {
        const nextActive = disabled !== true;
        if (nextActive) {
            await registerOwnedContentScripts();
            active = true;
            initialized = true;
            if (reloadTabs) await reloadMediaoceanTabs();
            return true;
        }

        try {
            await unregisterOwnedContentScripts();
        } catch (error) {
            console.error('[Feature Mode] Could not unregister content scripts:', error);
        }
        if (reloadTabs) {
            try {
                await reloadMediaoceanTabs();
            } catch (error) {
                console.error('[Feature Mode] Could not reload Mediaocean tabs:', error);
            }
        }
        return false;
    });
    return reconciliation;
}

export const featureModeReady = storageGet({ [MASTER_FEATURE_KEY]: false })
    .then(settings => reconcileFeatureMode(settings[MASTER_FEATURE_KEY] === true))
    .catch(error => {
        active = false;
        initialized = true;
        console.error('[Feature Mode] Could not establish feature state; remaining off:', error);
        return unregisterOwnedContentScripts().catch(() => undefined).then(() => false);
    });

export async function refreshFeatureMode(options) {
    const settings = await storageGet({ [MASTER_FEATURE_KEY]: false });
    return reconcileFeatureMode(settings[MASTER_FEATURE_KEY] === true, options);
}

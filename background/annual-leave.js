// Independent of Prisma registrations: Workday access is optional and tenant-scoped.
export const WORKDAY_ORIGIN = 'https://wd3.myworkday.com/*';
export const WORKDAY_SCRIPT = {
    id: 'workday-annual-leave', matches: ['https://wd3.myworkday.com/wpp/*'],
    js: ['annual-leave-calendar.js', 'features/workday-annual-leave.js'],
    runAt: 'document_idle', persistAcrossSessions: false
};
let reconciliation = Promise.resolve();
export function reconcileAnnualLeave() {
    reconciliation = reconciliation.catch(() => {}).then(async () => {
        const settings = await chrome.storage.local.get({ annualLeaveEnabled: false });
        const master = await chrome.storage.sync.get({ allFeaturesDisabled: false });
        const allowed = await chrome.permissions?.contains?.({ origins: [WORKDAY_ORIGIN] }) || false;
        const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [WORKDAY_SCRIPT.id] });
        if (settings.annualLeaveEnabled && !master.allFeaturesDisabled && allowed) {
            if (!registered.length) await chrome.scripting.registerContentScripts([WORKDAY_SCRIPT]);
        } else if (registered.length) await chrome.scripting.unregisterContentScripts({ ids: [WORKDAY_SCRIPT.id] });
    });
    return reconciliation;
}
export function isWorkdaySender(sender) {
    if (!Number.isInteger(sender?.tab?.id) || sender.frameId !== 0) return false;
    try {
        const url = new URL(sender.url);
        return url.origin === 'https://wd3.myworkday.com' && url.pathname.startsWith('/wpp/');
    } catch { return false; }
}
export async function saveAnnualLeave(message, sender) {
    if (!isWorkdaySender(sender)) throw new Error('Open this helper from your Workday absence request.');
    const { annualLeaveEnabled } = await chrome.storage.local.get({ annualLeaveEnabled: false });
    const { allFeaturesDisabled } = await chrome.storage.sync.get({ allFeaturesDisabled: false });
    if (!annualLeaveEnabled || allFeaturesDisabled) throw new Error('Enable the Annual Leave helper first.');
    const draft = message.draft;
    if (!draft || typeof draft.name !== 'string' || !draft.name.trim() || draft.name.length > 200 ||
        !Array.isArray(draft.dates) || !draft.dates.length || draft.dates.length > 366 ||
        draft.dates.some(date => typeof date !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(date) ||
            !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)) {
        throw new Error('The selected leave dates could not be read. Open Annual Leave from the toolbar and enter them manually.');
    }
    // A single local draft is sufficient; no HR comments, balances or attachments are stored.
    const dates = [...new Set(draft.dates)].sort();
    const { annualLeaveDraft: previous } = await chrome.storage.local.get('annualLeaveDraft');
    const same = previous?.name === draft.name && JSON.stringify(previous.dates) === JSON.stringify(dates);
    const saved = { id: same ? previous.id : crypto.randomUUID(), name: draft.name, dates,
        submitted: draft.submitted === true, submissionPending: draft.submissionPending === true && draft.submitted !== true, capturedAt: Date.now() };
    if (draft.needsDayPart === true) saved.needsDayPart = true;
    await chrome.storage.local.set({ annualLeaveDraft: saved });
    return saved;
}
export async function openAnnualLeave(message, sender) {
    await saveAnnualLeave(message, sender);
    await chrome.tabs.create({ url: chrome.runtime.getURL('annual-leave.html') });
    return { ok: true };
}
export function initializeAnnualLeave() {
    const reconcile = () => reconcileAnnualLeave().catch(error => console.error('Annual Leave helper:', error));
    reconcile();
    chrome.runtime.onStartup?.addListener(reconcile);
    chrome.runtime.onInstalled.addListener(reconcile);
    chrome.permissions?.onAdded?.addListener(reconcile);
    chrome.permissions?.onRemoved?.addListener(reconcile);
    chrome.storage.onChanged.addListener((changes, area) => {
        if ((area === 'local' && changes.annualLeaveEnabled) || (area === 'sync' && changes.allFeaturesDisabled)) reconcile();
    });
    chrome.runtime.onMessage.addListener((message, sender, respond) => {
        if (!['annualLeave:open', 'annualLeave:save'].includes(message?.action)) return undefined;
        const operation = message.action === 'annualLeave:open' ? openAnnualLeave : saveAnnualLeave;
        operation(message, sender).then(() => respond({ ok: true }), error => respond({ ok: false, error: error.message }));
        return true;
    });
}

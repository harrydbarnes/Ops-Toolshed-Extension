import '../reccie-core.js';
import { buildReccieQuery } from './reccie-query.js';
import { isFeatureModeActive } from './feature-mode.js';

const core = globalThis.reccieCore;
const KEY = 'reccieTracker';
let checking = false;
let writes = Promise.resolve();
function queueWrite(work) {
    const pending = writes.then(work);
    writes = pending.catch(() => {});
    return pending;
}
const ownPage = sender => sender?.id === chrome.runtime.id &&
    ['reccies.html', 'popup.html'].some(path => sender.url?.split(/[?#]/)[0] === chrome.runtime.getURL(path));
function assertActive() {
    if (!isFeatureModeActive()) throw new Error('Enable Prisma features to use Reccies.');
}
async function assertPrismaProfile() {
    assertActive();
    const settings = await chrome.storage.sync.get({ allFeaturesDisabled: false, onboardingAudience: 'prisma' });
    if (settings.allFeaturesDisabled || settings.onboardingAudience === 'non-prisma') throw new Error('Choose the Prisma profile and enable features to check Reccies.');
}
async function prisma(path, body) {
    await assertPrismaProfile();
    const response = await fetch(`https://go.mediaocean.com/campaign-service/secure/campaign/${path}`, {
        method: body ? 'PUT' : 'GET', credentials: 'include', redirect: 'error',
        signal: AbortSignal.timeout(30000),
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {})
    });
    if (!response.ok) throw new Error(`Prisma HTTP ${response.status}. Check your signed-in session and campaign access.`);
    assertActive();
    return response.json();
}
export async function openReccies(request, sender, sendResponse) {
    try {
        assertActive();
        let prismaSender = false;
        try {
            const url = new URL(sender?.url);
            prismaSender = sender.id === chrome.runtime.id && sender.tab?.id &&
                (sender.frameId == null || sender.frameId === 0) && url.origin === 'https://go.mediaocean.com' && url.pathname.startsWith('/campaign-management/');
        } catch (_) { /* Only extension pages or the signed-in Prisma top frame may open this panel. */ }
        if (!ownPage(sender) && !prismaSender) throw new Error('Open Reccies from Ops Toolshed or Prisma.');
        const windowId = sender.tab?.windowId ?? request.windowId;
        if (!Number.isInteger(windowId)) throw new Error('Could not identify the active Chrome window.');
        const tabId = sender.tab?.id ?? request.tabId;
        // Preserve the original click gesture, as with the Help Guides launcher.
        const opening = chrome.sidePanel.open({ windowId });
        const options = [chrome.sidePanel.setOptions({ path: 'reccies.html', enabled: true })];
        // Replace a Help Guides tab override too; keep the global panel available
        // when a placement opens in a different tab in this window.
        if (Number.isInteger(tabId)) options.push(chrome.sidePanel.setOptions({ tabId, path: 'reccies.html', enabled: true }));
        await Promise.all([opening, ...options]);
        sendResponse({ status: 'success' });
    } catch (error) { sendResponse({ status: 'error', message: error.message }); }
}
async function importTracker(request, text, source) {
    const rows = core.importCsv(text, request.month);
    const tracker = { rows, month: request.month, source, importedAt: new Date().toISOString(),
        revision: crypto.randomUUID(), checks: {} };
    assertActive();
    await queueWrite(() => chrome.storage.local.set({ [KEY]: tracker }));
    return tracker;
}
async function checkRows(request) {
    if (checking) throw new Error('A Reccies check is already running.');
    checking = true;
    try {
        const tracker = (await chrome.storage.local.get(KEY))[KEY];
        if (!tracker || tracker.revision !== request.revision) throw new Error('The report changed. Reload Reccies and check again.');
        if (!Array.isArray(request.rowIds) || !request.rowIds.length || request.rowIds.length > 500) throw new Error('Choose up to 500 rows per check.');
        const ids = new Set(request.rowIds);
        const rows = tracker.rows.filter(row => ids.has(row.sourceRow));
        if (rows.length !== ids.size) throw new Error('Some selected rows are no longer in this report.');
        const groups = new Map(), results = {};
        for (const row of rows) {
            if (row.issue) { results[row.sourceRow] = { state: 'review', message: row.issue }; continue; }
            const key = `${row.campaignId}/${row.month}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(row);
        }
        if (groups.size > 10) throw new Error('Check up to 10 campaigns per batch.');
        const queue = [...groups.values()];
        const worker = async () => {
            while (queue.length) {
                const group = queue.shift(), first = group[0];
                try {
                    const campaign = await prisma(`publicforui/${first.campaignId}`);
                    if (campaign.publicId !== first.campaignId || !/^\d+$/.test(String(campaign.id))) throw new Error('Prisma returned a different campaign.');
                    const data = await prisma(`${campaign.id}/queryservice/mediaplan/hybrid/actualize`, buildReccieQuery(first.month));
                    const records = core.extractResults(data);
                    const checkedAt = new Date().toISOString();
                    group.forEach(row => { results[row.sourceRow] = { ...core.evaluateRow(row, records), checkedAt }; });
                } catch (error) {
                    const checkedAt = new Date().toISOString();
                    group.forEach(row => { results[row.sourceRow] = { state: 'error', message: error.message, checkedAt }; });
                }
            }
        };
        await Promise.all([worker(), worker(), worker()]);
        assertActive();
        return await queueWrite(async () => {
            const current = (await chrome.storage.local.get(KEY))[KEY];
            if (current?.revision !== tracker.revision) throw new Error('Report refreshed during the check. Results were discarded.');
            current.checks = { ...current.checks, ...results };
            await chrome.storage.local.set({ [KEY]: current });
            return current;
        });
    } finally { checking = false; }
}
export async function handleReccies(request, sender, sendResponse) {
    try {
        if (!ownPage(sender)) throw new Error('Tracker data is available only in Ops Toolshed.');
        await assertPrismaProfile();
        let tracker;
        if (request.operation === 'import') tracker = await importTracker(request, request.csv, { type: 'csv', name: String(request.name || 'CSV import').slice(0, 150) });
        else if (request.operation === 'refresh') {
            const source = core.sheetSource(request.url);
            if (!await chrome.permissions.contains({ origins: ['https://docs.google.com/*'] })) throw new Error('Allow Google Sheets read access first.');
            const response = await fetch(source.csvUrl, { method: 'GET', credentials: 'include', redirect: 'error', signal: AbortSignal.timeout(30000), cache: 'no-store' });
            if (!response.ok || !(response.headers.get('content-type') || '').includes('text/csv')) throw new Error('Google did not return CSV. Sign into the Google account with tracker access, or import a CSV.');
            tracker = await importTracker(request, await response.text(), { type: 'google', url: source.url });
        } else if (request.operation === 'check') tracker = await checkRows(request);
        else if (request.operation === 'clear') { await queueWrite(() => chrome.storage.local.remove([KEY, 'recciePreferences'])); }
        else throw new Error('Unknown Reccies action.');
        sendResponse({ status: 'success', tracker });
    } catch (error) { sendResponse({ status: 'error', message: error.message }); }
}

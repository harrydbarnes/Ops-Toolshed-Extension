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
async function prisma(path, body, requests, attempt, deadline, method) {
    await assertPrismaProfile();
    const started = performance.now();
    const timeoutMs = Math.min(method.requestTimeoutMs, Math.ceil(deadline - started));
    if (timeoutMs <= 0) throw new Error('Verification time limit reached. Verify these rows again.');
    const timing = { phase: body ? 'grid' : 'lookup', attempt, startedMs: Math.round(started - (deadline - method.runBudgetMs)),
        timeoutMs, httpStatus: null, headersMs: null, totalMs: 0, ok: false };
    requests.push(timing);
    try {
        const response = await fetch(`https://go.mediaocean.com/campaign-service/secure/campaign/${path}`, {
            method: body ? 'PUT' : 'GET', credentials: 'include', redirect: 'error',
            signal: AbortSignal.timeout(timeoutMs),
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            ...(body ? { body: JSON.stringify(body) } : {})
        });
        timing.headersMs = Math.round(performance.now() - started);
        timing.httpStatus = response.status ?? null;
        if (!response.ok) {
            const error = new Error(`Prisma HTTP ${response.status}. Check your signed-in session and campaign access.`);
            error.retryable = [500, 502, 503, 504].includes(response.status);
            throw error;
        }
        assertActive();
        const data = await response.json();
        timing.ok = true;
        return data;
    } catch (error) {
        timing.errorName = error.name;
        timing.timedOut = ['TimeoutError', 'AbortError'].includes(error.name);
        const failure = timing.timedOut ? new Error(`Prisma request timed out after ${(timeoutMs / 1000).toFixed(1)} seconds. Verify these rows again if the retry also fails.`) : error;
        if (timing.timedOut) failure.name = error.name;
        if (timing.timedOut || error instanceof TypeError) failure.retryable = true;
        throw failure;
    } finally { timing.totalMs = Math.round(performance.now() - started); }
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
    const started = performance.now();
    try {
        const method = core.verificationMethod(request.method);
        const tracker = (await chrome.storage.local.get(KEY))[KEY];
        if (!tracker || tracker.revision !== request.revision) throw new Error('The report changed. Reload Reccies and check again.');
        if (!Array.isArray(request.rowIds) || !request.rowIds.length || request.rowIds.length > method.maxRows) throw new Error(`Choose up to ${method.maxRows} rows per check.`);
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
        if (groups.size > method.maxCampaigns) throw new Error(`Check up to ${method.maxCampaigns} campaigns per batch.`);
        const timing = { method, rows: rows.length, campaigns: groups.size, concurrency: method.concurrency,
            runBudgetMs: method.runBudgetMs, skippedRows: Object.keys(results).length, cacheHits: 0, retries: 0, campaignsDetail: [] };
        const deadline = started + method.runBudgetMs;
        const queue = [...groups.values()].map(group => ({ group, attempt: 1, campaign: null }));
        const worker = async () => {
            while (queue.length) {
                const task = queue.shift(), {group} = task, first = group[0];
                if (!task.timing) {
                    task.timing = { campaign: first.campaignId, month: first.month, rows: group.length,
                        queueMs: Math.round(performance.now() - started), requests: [], outcome: 'error', attempts: 0, totalMs: 0 };
                    timing.campaignsDetail.push(task.timing);
                }
                const campaignTiming = task.timing;
                // Failed requests go behind untouched campaigns; avoid an immediate retry on small runs too.
                if (task.readyAt) await new Promise(resolve => setTimeout(resolve, Math.max(0, Math.min(task.readyAt, deadline) - performance.now())));
                const campaignStarted = performance.now();
                try {
                    if (campaignStarted >= deadline) throw new Error('Verification time limit reached. Verify these rows again.');
                    campaignTiming.attempts++;
                    if (task.attempt > 1) {
                        timing.retries++;
                        campaignTiming.retryQueueMs = Math.round(campaignStarted - started);
                    }
                    const campaign = task.campaign || await prisma(`publicforui/${first.campaignId}`, undefined, campaignTiming.requests, task.attempt, deadline, method);
                    if (campaign.publicId !== first.campaignId || !/^\d+$/.test(String(campaign.id))) throw new Error('Prisma returned a different campaign.');
                    task.campaign = campaign;
                    const data = await prisma(`${campaign.id}/queryservice/mediaplan/hybrid/actualize`, buildReccieQuery(first.month), campaignTiming.requests, task.attempt, deadline, method);
                    const records = core.extractResults(data);
                    const checkedAt = new Date().toISOString();
                    group.forEach(row => { results[row.sourceRow] = { ...core.evaluateRow(row, records), checkedAt }; });
                    campaignTiming.outcome = 'success';
                    delete campaignTiming.errorName;
                    delete campaignTiming.message;
                } catch (error) {
                    campaignTiming.errorName = error.name;
                    campaignTiming.message = error.message;
                    if (task.attempt <= method.retryLimit && error.retryable && performance.now() + 1000 < deadline) {
                        task.attempt++;
                        task.readyAt = performance.now() + 1000;
                        queue.push(task);
                        continue;
                    }
                    const checkedAt = new Date().toISOString();
                    group.forEach(row => { results[row.sourceRow] = { state: 'error', message: error.message, checkedAt }; });
                } finally { campaignTiming.totalMs += Math.round(performance.now() - campaignStarted); }
            }
        };
        await Promise.all(Array.from({length: method.concurrency}, () => worker()));
        assertActive();
        return await queueWrite(async () => {
            const current = (await chrome.storage.local.get(KEY))[KEY];
            if (current?.revision !== tracker.revision) throw new Error('Report refreshed during the check. Results were discarded.');
            current.checks = { ...current.checks, ...results };
            timing.totalMs = Math.round(performance.now() - started);
            current.lastCheckTiming = timing;
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
        else if (request.operation === 'clear') { await queueWrite(() => chrome.storage.local.remove([KEY, 'recciePreferences', 'reccieLastRunTiming'])); }
        else throw new Error('Unknown Reccies action.');
        sendResponse({ status: 'success', tracker });
    } catch (error) { sendResponse({ status: 'error', message: error.message }); }
}

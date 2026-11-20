import { PRISMA_DASHBOARD_URL, PRISMA_ORIGIN } from './prisma-url.js';

const HANDOFF_PREFIX = '#abw-check-po?';
const handoffKey = tabId => 'abwPoHandoff:' + tabId;
const handoffWrites = new Map();

function checkerUrl(rawUrl) {
    if (!rawUrl) return null;
    const url = new URL(rawUrl);
    return url.origin === PRISMA_ORIGIN && url.pathname === '/robots.txt' && !url.search &&
        (!url.hash || url.hash.startsWith(HANDOFF_PREFIX)) ? url : null;
}

export function rememberAbwPoHandoff(tabId, rawUrl, storage) {
    const url = checkerUrl(rawUrl);
    if (tabId < 0 || !url?.hash || url.hash.length >= 8192) return;
    const key = handoffKey(tabId);
    const write = storage.set({ [key]: { fragment: url.hash, expires: Date.now() + 15 * 60 * 1000 } });
    handoffWrites.set(tabId, write);
    const cleanup = () => { if (handoffWrites.get(tabId) === write) handoffWrites.delete(tabId); };
    return write.then(cleanup, cleanup);
}

export async function takeAbwPoHandoff(sender, storage) {
    if (sender.frameId !== 0 || !sender.tab || !checkerUrl(sender.url)) return {};
    const tabId = sender.tab.id;
    const key = handoffKey(tabId);
    await handoffWrites.get(tabId);
    const record = (await storage.get(key))[key];
    await storage.remove(key);
    return { fragment: record?.expires > Date.now() ? record.fragment : undefined };
}

export async function clearAbwPoHandoff(tabId, storage) {
    await handoffWrites.get(tabId);
    await storage.remove(handoffKey(tabId));
}

export function campaignContext(tab) {
    if (!tab?.url || tab.pendingUrl) return null;
    const url = new URL(tab.url);
    if (url.origin !== PRISMA_ORIGIN || url.pathname.replace(/\/$/, '') !== '/campaign-management') return null;
    return url.searchParams.get('_ctx');
}

async function readPurchaseOrders(origin, context, body) {
    if (location.origin !== origin || location.pathname.replace(/\/$/, '') !== '/campaign-management' ||
        new URLSearchParams(location.search).get('_ctx') !== context) return null;
    const response = await fetch(origin + '/campaign-service/secure/purchaseOrder/list', {
        method: 'PUT',
        credentials: 'include',
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'x-mo-context': context },
        body,
    });
    if (!response.ok) return null;
    const rows = await response.json();
    return Array.isArray(rows) ? rows : null;
}

export async function queryAbwPoFromPrismaTab(request, sender, tabs, scripting) {
    if (sender.frameId !== 0 || !sender.tab || !checkerUrl(sender.url)) return {};
    const { media, client, product, start, end } = request.lookup || {};
    if (![media, client, product].every(code => typeof code === 'string' && /^[A-Z0-9]{1,20}$/.test(code)) ||
        ![start, end].every(date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) || start > end) return {};
    const candidates = (await tabs.query({})).filter(tab => tab.incognito === sender.tab.incognito && campaignContext(tab));
    candidates.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
    const tab = candidates[0];
    if (!tab) return {};
    const body = JSON.stringify({ clientBusinessKey: ['UK', 'A1', media, client].join('|'), mediaCode: media, productCode: product, startDate: start, endDate: end });
    try {
        const [result] = await scripting.executeScript({
            target: { tabId: tab.id },
            func: readPurchaseOrders,
            args: [PRISMA_ORIGIN, campaignContext(tab), body],
        });
        return Array.isArray(result?.result) ? { rows: result.result } : {};
    } catch {
        return {};
    }
}

export async function queryAbwPoFromWorker(request, sender, tabs, fetchRows = fetch) {
    if (sender.frameId !== 0 || !sender.tab || !checkerUrl(sender.url)) return {};
    const { media, client, product, start, end } = request.lookup || {};
    if (![media, client, product].every(code => typeof code === 'string' && /^[A-Z0-9]{1,20}$/.test(code)) ||
        ![start, end].every(date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) || start > end) return {};
    const { context } = await getAbwPoPrismaContext({}, sender, tabs);
    if (!context) return {};
    try {
        const response = await fetchRows(PRISMA_ORIGIN + '/campaign-service/secure/purchaseOrder/list', {
            method: 'PUT',
            credentials: 'include',
            redirect: 'error',
            signal: AbortSignal.timeout(8000),
            headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'x-mo-context': context },
            body: JSON.stringify({ clientBusinessKey: ['UK', 'A1', media, client].join('|'), mediaCode: media, productCode: product, startDate: start, endDate: end }),
        });
        if (!response.ok) return {};
        const rows = await response.json();
        return Array.isArray(rows) ? { rows } : {};
    } catch {
        return {};
    }
}

export async function getAbwPoPrismaContext(request, sender, tabs) {
    // Chrome can report the original fragment even after the form removes it.
    if (sender.frameId !== 0 || !sender.tab || !checkerUrl(sender.url)) {
        return { status: 'error', message: 'Reopen Check PO from ABW.' };
    }

    if (Number.isInteger(request.signInTabId)) {
        const tab = (await tabs.query({})).find(candidate => candidate.id === request.signInTabId);
        if (!tab || tab.incognito !== sender.tab.incognito) return { closed: true };
        const context = campaignContext(tab);
        if (context && tab.active && tab.windowId === sender.tab.windowId) {
            await tabs.update(sender.tab.id, { active: true });
        }
        return { context };
    }

    if (!request.signInAgain) {
        const candidates = (await tabs.query({})).filter(tab => tab.incognito === sender.tab.incognito);
        candidates.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
        const context = candidates.map(campaignContext).find(Boolean);
        if (context) return { context };
        return { signInRequired: true };
    }

    const tab = await tabs.create({ url: PRISMA_DASHBOARD_URL, windowId: sender.tab.windowId, active: true });
    return { signInTabId: tab.id };
}

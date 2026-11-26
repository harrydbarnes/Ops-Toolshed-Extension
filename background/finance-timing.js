import { buildReccieQuery } from './reccie-query.js';

export const FINANCE_TIMING_ALARM = 'ops-finance-timing';
export const FINANCE_TIMING_KEY = 'financeTimingLog';
const PENDING = new Set(['PENDING', 'PROCESSING', 'IN_PROGRESS']);
const TERMINAL = new Set(['SUCCESSFUL', 'SUCCESS', 'FAILED', 'ERROR', 'UNSUCCESSFUL']);
const MAX_LOG = 1000;
let queue = Promise.resolve();
let polling = false;

function mutate(fn) {
    const job = queue.then(async () => {
        const saved = await chrome.storage.local.get({ [FINANCE_TIMING_KEY]: [] });
        const entries = Array.isArray(saved[FINANCE_TIMING_KEY]) ? saved[FINANCE_TIMING_KEY] : [];
        await fn(entries);
        while (entries.length > MAX_LOG) {
            const completed = entries.findIndex(entry => entry.status !== 'PENDING');
            if (completed < 0) break;
            entries.splice(completed, 1);
        }
        await chrome.storage.local.set({ [FINANCE_TIMING_KEY]: entries });
    });
    queue = job.catch(() => {});
    return job;
}

export function clearFinanceTimings() {
    return mutate(entries => { entries.length = 0; });
}

export async function observeFinancePending(request, sender) {
    let url;
    try { url = new URL(sender?.url); } catch (_) { throw new Error('Invalid Prisma sender.'); }
    const params = new URLSearchParams(url.hash.slice(1));
    if (sender.id !== chrome.runtime.id || sender.frameId > 0 || url.origin !== 'https://go.mediaocean.com' ||
        !url.pathname.startsWith('/campaign-management/') || params.get('campaign-id') !== request.campaignId ||
        (params.get('mos') || '').slice(0, 7) !== request.month ||
        !/^[A-Za-z0-9]{1,32}$/.test(request.campaignId) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(request.month) ||
        !Number.isFinite(request.observedAt) || request.observedAt > Date.now() + 5000 ||
        !Array.isArray(request.rows) || request.rows.length > 1000) throw new Error('Invalid finance observation.');
    const now = Date.now();
    await mutate(entries => {
        for (const row of request.rows) {
            const placement = String(row?.placementNumber || '').trim();
            if (!/^[A-Za-z0-9-]{1,64}$/.test(placement)) continue;
            if (entries.some(e => e.campaignId === request.campaignId && e.month === request.month &&
                e.placement === placement && e.status === 'PENDING')) continue;
            if (entries.some(e => e.campaignId === request.campaignId && e.month === request.month &&
                e.placement === placement && e.resultObservedAt >= request.observedAt)) continue;
            entries.push({ campaignId: request.campaignId, month: request.month, placement,
                firstPendingAt: now, lastPendingAt: now, status: 'PENDING', lastCheckedAt: now });
        }
    });
    await chrome.alarms.create(FINANCE_TIMING_ALARM, { periodInMinutes: 2 });
}

function extractRows(data) {
    if (!data || data.status !== 0 || !Array.isArray(data.nodes) || (Number(data.total) > 0 && !data.nodes.length)) {
        throw new Error('Invalid Prisma response');
    }
    const rows = [];
    function visit(nodes) {
        for (const node of nodes) {
            const fields = Object.fromEntries((node.fields || []).map(f => [f.id, f.value]));
            if (fields.placementNumber) rows.push(fields);
            if (Array.isArray(node.nodes)) visit(node.nodes);
        }
    }
    visit(data.nodes);
    return rows;
}

async function prisma(path, body) {
    const response = await fetch(`https://go.mediaocean.com/campaign-service/secure/campaign/${path}`, {
        method: body ? 'PUT' : 'GET', credentials: 'include', redirect: 'error', cache: 'no-store',
        signal: AbortSignal.timeout(30000), headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {})
    });
    if (!response.ok) throw new Error(`Prisma HTTP ${response.status}`);
    return response.json();
}

export async function pollFinanceTimings(isEnabled = () => true) {
    if (polling) return;
    polling = true;
    try {
        const saved = await chrome.storage.local.get({ [FINANCE_TIMING_KEY]: [] });
        const active = (saved[FINANCE_TIMING_KEY] || []).filter(e => e.status === 'PENDING');
        if (!active.length) return;
        const groups = new Map();
        for (const entry of active) {
            const key = `${entry.campaignId}|${entry.month}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(entry);
        }
        // Bound each pass and prioritise the least recently checked campaigns.
        // This avoids a large backlog creating a burst of Prisma requests.
        const nextGroups = [...groups.values()].sort((a, b) =>
            Math.min(...a.map(entry => entry.lastCheckedAt || 0)) - Math.min(...b.map(entry => entry.lastCheckedAt || 0))
        ).slice(0, 10);
        for (const entries of nextGroups) {
            if (!isEnabled()) return;
            const { campaignId, month } = entries[0];
            let rows, error = '';
            try {
                const campaign = await prisma(`publicforui/${encodeURIComponent(campaignId)}`);
                if (campaign.publicId !== campaignId || !/^\d+$/.test(String(campaign.id))) throw new Error('Campaign mismatch');
                rows = extractRows(await prisma(`${campaign.id}/queryservice/mediaplan/hybrid/actualize`, buildReccieQuery(month)));
            } catch (_) { error = 'Check failed; sign in and confirm campaign access.'; }
            const checkedAt = Date.now();
            if (!isEnabled()) return;
            await mutate(log => {
                for (const original of entries) {
                    const entry = log.find(e => e.campaignId === original.campaignId && e.month === original.month &&
                        e.placement === original.placement && e.firstPendingAt === original.firstPendingAt && e.status === 'PENDING');
                    if (!entry) continue;
                    entry.lastCheckedAt = checkedAt;
                    const matches = rows?.filter(r => String(r.placementNumber) === entry.placement &&
                        String(r.month || '').slice(0, 7) === month) || [];
                    if (error || matches.length !== 1) { entry.checkError = error || 'Placement missing or ambiguous.'; continue; }
                    const row = matches[0], status = String(row.buyStatus || '').trim().toUpperCase();
                    entry.dNumber = String(row.buySerialNumber || '').slice(0, 64);
                    if (PENDING.has(status)) { entry.lastPendingAt = checkedAt; delete entry.checkError; }
                    else if (TERMINAL.has(status)) {
                        entry.status = status; entry.resultObservedAt = checkedAt; delete entry.checkError;
                    } else entry.checkError = 'Unrecognised status; awaiting a reliable result.';
                }
            });
        }
    } finally { polling = false; }
}

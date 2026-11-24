import '../features/abw-po-verdict.js';
import { campaignContext } from './abw-po-session.js';
import { PRISMA_ORIGIN } from './prisma-url.js';

export const ABW_PO_ALARM = 'abw-automatic-po-check';
const HOST = 'net.insidemedia.abw.po_check';
let running = false;

function parseBooking(raw) {
    const booking = Object.fromEntries(['media', 'client', 'product', 'po', 'start', 'end', 'total', 'plan']
        .map(key => [key, typeof raw?.[key] === 'string' ? raw[key].trim() : '']));
    booking.media = !booking.media || /^digital$/i.test(booking.media) ? 'D' : booking.media.toUpperCase();
    for (const key of ['client', 'product']) booking[key] = booking[key].toUpperCase();
    for (const key of ['start', 'end']) {
        booking[key] = booking[key].replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$3-$2-$1');
    }
    for (const key of ['total', 'plan']) {
        const amount = booking[key].replace(/[£\s]/g, '');
        booking[key] = /^\d+,\d{1,2}$/.test(amount) ? amount.replace(',', '.') :
            /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(amount) ? amount.replace(/,/g, '') : '';
    }
    if (![booking.media, booking.client].every(code => /^[A-Z0-9]{1,20}$/.test(code)) ||
        (booking.product && !/^[A-Z0-9]{1,20}$/.test(booking.product)) ||
        !booking.po || booking.po.length > 100 || !booking.total || !booking.plan ||
        ![booking.start, booking.end].every(date => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date))) ||
        booking.start > booking.end) return null;
    return booking;
}

export async function checkAutomaticPo(raw, context, fetchRows = fetch) {
    const booking = parseBooking(raw);
    if (!booking) return 'unavailable';
    if (!context) return 'signin';
    const query = product => fetchRows(PRISMA_ORIGIN + '/campaign-service/secure/purchaseOrder/list', {
        method: 'PUT', credentials: 'include', redirect: 'manual', signal: AbortSignal.timeout(8000),
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'x-mo-context': context },
        body: globalThis.abwPoVerdict.lookupBody({ ...booking, product }),
    });
    try {
        const response = await query(booking.product);
        if (response.type === 'opaqueredirect' || [401, 403].includes(response.status)) return 'signin';
        if (!response.ok) return 'unavailable';
        const rows = await response.json();
        if (!Array.isArray(rows)) return 'unavailable';
        const verdict = globalThis.abwPoVerdict.compare(rows, booking);
        if (!booking.product || verdict.productEligible) return verdict.status;
        const broader = await query('').catch(() => null);
        if (!broader?.ok) return verdict.status;
        const broaderRows = await broader.json();
        return Array.isArray(broaderRows) ? globalThis.abwPoVerdict.compare([...rows, ...broaderRows], booking).status : verdict.status;
    } catch {
        return 'unavailable';
    }
}

export async function pollAutomaticPoChecks() {
    if (running || !chrome.runtime.sendNativeMessage) return;
    running = true;
    try {
        const { jobs } = await chrome.runtime.sendNativeMessage(HOST, { action: 'poll' });
        if (!Array.isArray(jobs) || !jobs.length) return;
        const tabs = (await chrome.tabs.query({})).filter(tab => !tab.incognito);
        tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
        const context = tabs.map(campaignContext).find(Boolean);
        await Promise.allSettled(jobs.slice(0, 8).map(async job => {
            const status = await checkAutomaticPo(job.booking, context);
            await chrome.runtime.sendNativeMessage(HOST, { action: 'complete', id: job.id, status });
        }));
    } catch {
        // The ABW helper is optional and may not have been paired on this machine.
    } finally {
        running = false;
    }
}

export async function startAutomaticPoPolling() {
    if (!chrome.alarms?.get) return;
    if (!await chrome.alarms.get(ABW_PO_ALARM)) await chrome.alarms.create(ABW_PO_ALARM, { periodInMinutes: 0.5 });
}

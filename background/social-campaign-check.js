import '../meta-report-api.js';
import '../social-campaign-core.js';
import { isFeatureModeActive } from './feature-mode.js';

export const SOCIAL_CHECK_ALARM = 'ops-toolshed-social-campaign-check';
const KEY = 'socialCampaignChecks';
const ORIGIN = 'https://go.mediaocean.com';
const inFlight = new Map(), revisions = new Map();
let writes = Promise.resolve();
const validId = id => /^CP[A-Z0-9]{3,20}$/.test(String(id || ''));
const enabled = () => { if (!isFeatureModeActive()) throw new Error('Enable Prisma features to use campaign checks.'); };
async function allowed() {
    enabled();
    const settings = await chrome.storage.sync.get({ allFeaturesDisabled: false, onboardingAudience: 'prisma' });
    if (settings?.allFeaturesDisabled || settings?.onboardingAudience === 'non-prisma') throw new Error('Enable Prisma features to use campaign checks.');
}
async function records() { return (await chrome.storage.local.get(KEY))?.[KEY] || {}; }
function update(id, apply) {
    const work = writes.then(async () => {
        const state = await records();
        const next = apply(state[id] || {});
        if (next) state[id] = next;
        const disposable = Object.keys(state).filter(key => !state[key].monitor).sort((a,b) => (state[b].checkedAt || '').localeCompare(state[a].checkedAt || ''));
        disposable.slice(100).forEach(key => delete state[key]);
        await chrome.storage.local.set({ [KEY]: state });
        return next;
    });
    writes = work.catch(() => {});
    return work;
}
async function prisma(path, options = {}) {
    await allowed();
    const response = await fetch(`${ORIGIN}${path}`, { ...options, credentials: 'include', redirect: 'error', ...(typeof AbortSignal.timeout === 'function' ? {signal: AbortSignal.timeout(30000)} : {}), headers: { Accept: 'application/json', 'Content-Type': 'application/json' } });
    if (!response.ok) throw new Error(`Prisma returned HTTP ${response.status}. Check your signed-in Prisma session.`);
    return response.json();
}
const QUERY_FIELDS = ['placementType','supplierSite','placementName','positionDimensionCombo','flightStart','flightEnd','costMethod','plannedCost','rate','unitAmount','sellerName','eSellerSyncStatus','payableRate','supplierCost','billableRate','billableCost','margin','marginPercent','budgetClientCost','budgetPayableAmount','budgetCommissionAmount','supplierDiscount','budgetDiscountAmount','budgetDiscountAmountBillable','budgetAsbof','budgetOrigin','budgetTotalClientCostBillable','marketplaceKey'];
export async function readPrismaCampaign(id) {
    if (!validId(id)) throw new Error('Choose a valid Prisma CP number.');
    const campaign = await prisma(`/campaign-service/secure/campaign/publicforui/${id}`);
    if (campaign.publicId !== id || !/^\d+$/.test(String(campaign.id))) throw new Error('Prisma returned a different campaign.');
    const grid = await prisma(`/campaign-service/secure/campaign/${campaign.id}/queryservice/mediaplan/hybrid/rc`, { method: 'PUT', body: JSON.stringify({ type: 'detailedHybrid', filter: { op: 'and', filters: [{ op: 'and', fields: [{ op: 'eq', id: 'onMediaPlan', value: 'true' }], alwaysApplied: true }] }, entity: 'Placement', sort: [{ id: 'placementName', dir: 'asc' }], fields: [...QUERY_FIELDS.map(id => ({id})), { id: 'programmaticPackageBudget', hidden: true }], filterByThisfeeOrderId: null, start: 0, end: 0 }) });
    return { campaign, ...globalThis.socialCampaignCore.extractBookings(grid) };
}
export async function setupSocialCheckAlarm() {
    try { await allowed(); } catch (_) { await chrome.alarms.clear(SOCIAL_CHECK_ALARM); return; }
    const state = await records();
    if (isFeatureModeActive() && Object.values(state).some(item => item.monitor)) await chrome.alarms.create(SOCIAL_CHECK_ALARM, { periodInMinutes: 30 });
    else await chrome.alarms.clear(SOCIAL_CHECK_ALARM);
}
export async function setSocialMonitoring(id, monitor) {
    await allowed();
    if (!validId(id)) throw new Error('Choose a valid Prisma CP number.');
    revisions.set(id, (revisions.get(id) || 0) + 1);
    const state = await records();
    const wasMonitoring = state[id]?.monitor === true;
    if (monitor && !state[id]?.checkedAt) throw new Error('Complete a campaign check before enabling monitoring.');
    if (monitor && Object.values(state).filter(item => item.monitor).length >= 50 && !state[id]?.monitor) throw new Error('Up to 50 campaigns can be monitored at once.');
    await update(id, old => ({ ...old, monitor: monitor === true, alertSignature: '' }));
    try { await setupSocialCheckAlarm(); }
    catch (_) {
        if (monitor === true) {
            revisions.set(id, (revisions.get(id) || 0) + 1);
            await update(id, old => ({ ...old, monitor: wasMonitoring }));
        }
        throw new Error('Monitoring could not be scheduled. Try again after reloading the extension.');
    }
    return { status: 'success' };
}
export function checkSocialCampaign(id, scheduled = false) {
    enabled();
    if (!validId(id)) return Promise.reject(new Error('Choose a valid Prisma CP number.'));
    if (inFlight.has(id)) return inFlight.get(id);
    const promise = performCheck(id, scheduled).finally(() => inFlight.delete(id));
    inFlight.set(id, promise);
    return promise;
}
async function performCheck(id, scheduled) {
    await allowed();
    const revision = revisions.get(id) || 0;
    const old = (await records())[id] || {};
    if (scheduled && !old.monitor) return;
    let latestPrisma = null;
    try {
        const data = await readPrismaCampaign(id);
        latestPrisma = { campaignName: data.campaign.campaignName, fetchedAt: new Date().toISOString(), bookings: data.bookings, unmatched: data.unmatched };
        if (old.agencyId && old.agencyId !== data.campaign.agencyId) throw new Error('Prisma agency context changed. Open the campaign in the original account and check again.');
        const groups = globalThis.socialCampaignCore.groupBookings(data.bookings);
        const results = [];
        const verifiedAccounts = new Set();
        if (groups.length) {
            const credentials = (await chrome.storage.local.get('socialBookingMetaApiCredentials'))?.socialBookingMetaApiCredentials || {};
            if (!credentials.accessToken) throw new Error('Save a Meta access token in Social Booking Checker to run the live comparison.');
            const client = globalThis.metaReportApi.createClient({ accessToken: credentials.accessToken });
            for (const group of groups) {
                enabled();
                let snapshot;
                let accountVerified = verifiedAccounts.has(group.accountId);
                try {
                    if (!accountVerified) {
                        await client.verifyAccountAccess(group.accountId);
                        verifiedAccounts.add(group.accountId);
                        accountVerified = true;
                    }
                    snapshot = await client.getCampaignSnapshot(group.campaignId);
                } catch (error) {
                    // Meta code 100 can mean missing access OR a missing object; do not infer assignment alone.
                    if ([10,100,200].includes(error.metaCode)) {
                        error.accountAccessMessage = accountVerified
                            ? `Token can read Meta ad account ${group.accountId}, but campaign ${group.campaignId} or its reporting data is unavailable. Check the campaign ID and token permissions for ads/reporting.`
                            : error.metaCode === 100
                                ? `Token cannot read Meta ad account ${group.accountId}, linked to Prisma ${group.bookings.map(item => item.placementNumber).join(', ')}. Check the Prisma account ID and assign this ad account to the token's system user in Meta Business Settings.`
                                : `Meta denied token access to ad account ${group.accountId}, linked to Prisma ${group.bookings.map(item => item.placementNumber).join(', ')}. Check the system user's ad account assignment and the app/token ads_read permissions in Meta Business Settings.`;
                    }
                    throw error;
                }
                let links = null;
                const provider = group.bookings[0].providerId;
                if (/^\d+$/.test(provider)) {
                    try { links = await prisma(`/campaign-service/secure/campaign/${data.campaign.id}/placement/${provider}/accounts/${group.accountId}/campaigns/${group.campaignId}`); } catch (_) { /* Coverage stays explicitly unverified. */ }
                }
                results.push(globalThis.socialCampaignCore.compare(group, snapshot, links, old.results?.find(item => item.campaignId === group.campaignId)));
            }
        }
        await allowed();
        const next = { campaignId: id, campaignName: data.campaign.campaignName || id, agencyId: data.campaign.agencyId, checkedAt: new Date().toISOString(), results, unmatched: data.unmatched, error: '', attemptedAt: new Date().toISOString() };
        if ((revisions.get(id) || 0) !== revision) return { ...next, monitor: false };
        const saved = await update(id, current => ({ ...current, ...next }));
        if (scheduled) await alertIfNeeded(id, saved, revision);
        return saved;
    } catch (error) {
        // Never store a token, response body, request URL or an untrusted provider error message.
        const message = error.metaCode === 190 || /token.*expired|code 190/i.test(error.message) ? "Your saved Meta token has expired or is invalid. Choose 'Meta access' at the bottom of the check panel to replace it, then check again." : error.accountAccessMessage || (String(error.message).startsWith('Save a Meta access token') ? "Choose 'Meta access' at the bottom of the check panel and save a token to run the live comparison. No report uploads are needed." : error.source === 'meta' || /Meta/.test(String(error.message)) ? "Meta check failed. Choose 'Meta access' at the bottom of the check panel to check your saved token, account access and API availability." : String(error.message || 'Campaign check failed.').slice(0, 240));
        if (!isFeatureModeActive() || (revisions.get(id) || 0) !== revision) throw new Error(message);
        try { await allowed(); } catch (_) { throw new Error(message); }
        const saved = await update(id, current => ({ ...current, ...(latestPrisma ? { latestPrisma, campaignName: latestPrisma.campaignName } : {}), error: message, attemptedAt: new Date().toISOString() }));
        if (scheduled) await alertIfNeeded(id, saved, revision);
        throw new Error(message);
    }
}
async function alertIfNeeded(id, record, revision) {
    try { await allowed(); } catch (_) { return; }
    if (!record.monitor || !isFeatureModeActive() || (revisions.get(id) || 0) !== revision) return;
    const actionable = record.error || record.unmatched?.length || record.results?.some(item => item.findings.length || item.warnings.length);
    if (!actionable) { await update(id, current => ({ ...current, alertSignature: '' })); return; }
    const signature = JSON.stringify([record.error, record.unmatched?.map(item => item.placementId), record.results?.map(item => [item.campaignId, item.fingerprint, item.findings.filter(value => !value.includes('changed since')), item.warnings, Math.round((item.outsideSpend || 0) * 100), item.budget])]);
    if (signature === record.alertSignature) return;
    await chrome.notifications.create(`social-check-${id}`, { type: 'basic', iconUrl: chrome.runtime.getURL('icon.png'), title: `Review Meta booking: ${id}`, message: record.error || 'Budget, date, spend or coverage differences need review. Open Live campaign checks in Social Booking Checker.' });
    await update(id, current => current.monitor && (revisions.get(id) || 0) === revision ? { ...current, alertSignature: signature } : current);
}
export async function pollSocialCampaigns() {
    if (!isFeatureModeActive()) return;
    const state = await records();
    for (const [id, record] of Object.entries(state)) {
        if (!isFeatureModeActive()) break;
        if (record.monitor) { try { await checkSocialCampaign(id, true); } catch (_) { /* Saved health error and deduplicated alert. */ } }
    }
}
async function openMetaCampaign(prismaId, metaId, accountId) {
    const account = String(accountId || '').replace(/^act_/, '');
    const campaign = String(metaId || '');
    if (!/^\d+$/.test(account) || !/^\d+$/.test(campaign) || !validId(prismaId)) throw new Error('Meta campaign link is incomplete. Run the check again.');
    const record = (await records())[prismaId];
    if (!record?.results?.some(item => String(item.campaignId) === campaign && String(item.accountId).replace(/^act_/, '') === account)) throw new Error('Run a check for this linked Meta campaign first.');
    const stored = (await chrome.storage.local.get('socialMetaPortfolioByAccount'))?.socialMetaPortfolioByAccount || {};
    const portfolios = Object.fromEntries(Object.entries(stored).filter(([key,value]) => /^\d+$/.test(key) && /^\d+$/.test(String(value))).slice(-200));
    const tabs = await chrome.tabs.query({ url: ['https://adsmanager.facebook.com/*', 'https://business.facebook.com/*'] });
    const matching = tabs.map(tab => {
        try {
            const url = new URL(tab.url);
            const business = url.searchParams.get('business_id');
            return ['https://adsmanager.facebook.com','https://business.facebook.com'].includes(url.origin) && url.searchParams.get('act') === account && /^\d+$/.test(business || '') ? { business, active: tab.active, accessed: tab.lastAccessed || 0 } : null;
        } catch (_) { return null; }
    }).filter(Boolean).sort((a,b) => Number(b.active) - Number(a.active) || b.accessed - a.accessed);
    if (matching.length) {
        delete portfolios[account]; portfolios[account] = matching[0].business;
        await chrome.storage.local.set({ socialMetaPortfolioByAccount: Object.fromEntries(Object.entries(portfolios).slice(-200)) });
    }
    const url = new URL('https://adsmanager.facebook.com/adsmanager/manage/campaigns');
    url.searchParams.set('act', account);
    if (portfolios[account]) {
        url.searchParams.set('business_id', portfolios[account]);
        url.searchParams.set('global_scope_id', portfolios[account]);
    }
    url.searchParams.set('selected_campaign_ids', campaign);
    url.searchParams.set('treenav', 'true');
    url.searchParams.set('filter_set', `CAMPAIGN_GROUP_SELECTED-STRING_SET\u001eIN\u001e["${campaign}"]`);
    await allowed();
    await chrome.tabs.create({ url: url.href });
    return { status: 'success' };
}
export async function handleSocialCheck(request, sender, sendResponse) {
    try {
        await allowed();
        let ownPage = false;
        try {
            const source = new URL(sender.url);
            const expected = new URL(chrome.runtime.getURL('social-campaign-check.html'));
            ownPage = sender.id === chrome.runtime.id && source.protocol === expected.protocol && source.host === expected.host && source.pathname === expected.pathname;
        } catch (_) { /* Not an extension page. */ }
        // Content-script sender.url describes its document at injection time.
        // Prisma changes the campaign hash without reinjecting that document.
        const isPrismaUrl = value => {
            try { const url = new URL(value); return url.origin === ORIGIN && url.pathname.startsWith('/campaign-management/'); }
            catch (_) { return false; }
        };
        let currentTabUrl = '';
        const prismaSender = sender.id === chrome.runtime.id && sender.tab &&
            (sender.frameId == null || sender.frameId === 0) && isPrismaUrl(sender.url || sender.tab.url);
        if (prismaSender) currentTabUrl = (await chrome.tabs.get(sender.tab.id)).url || '';
        const prismaTab = prismaSender && isPrismaUrl(currentTabUrl);
        if (!ownPage && !prismaTab) throw new Error('Campaign checks require Prisma or the Live campaign checks page.');
        const tabCampaign = prismaTab ? new URL(currentTabUrl).hash.match(/(?:^#|[&?])campaign-id=(CP[A-Z0-9]+)/)?.[1] : '';
        if (prismaTab && request.operation !== 'open' && (!tabCampaign || request.campaignId !== tabCampaign)) throw new Error('Check the campaign currently open in this Prisma tab.');
        if (request.operation === 'open' && prismaTab) {
            const url = new URL(currentTabUrl);
            const match = url.hash.match(/(?:^#|[&?])campaign-id=(CP[A-Z0-9]+)/);
            if (!match) throw new Error('Open a Prisma campaign first.');
            await chrome.tabs.create({ url: chrome.runtime.getURL(request.listOnly === true ? 'social-campaign-check.html' : `social-campaign-check.html?campaign=${match[1]}`) });
            sendResponse({ status: 'success' });
        } else if (prismaTab && request.operation === 'access') {
            await chrome.tabs.create({ url: chrome.runtime.getURL('meta-access.html') });
            sendResponse({ status: 'success' });
        } else if ((ownPage || prismaTab) && request.operation === 'openMeta') sendResponse(await openMetaCampaign(request.campaignId, request.metaCampaignId, request.accountId));
        else if ((ownPage || prismaTab) && request.operation === 'check') sendResponse({ status: 'success', record: await checkSocialCampaign(request.campaignId) });
        else if ((ownPage || prismaTab) && request.operation === 'monitor') sendResponse(await setSocialMonitoring(request.campaignId, request.monitor));
        else throw new Error('Unsupported campaign check request.');
    } catch (error) { sendResponse({ status: 'error', message: error.message }); }
}

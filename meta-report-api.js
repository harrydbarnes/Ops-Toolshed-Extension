(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.metaReportApi = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    const DEFAULT_API_VERSION = 'v24.0';
    const DEFAULT_BASE_URL = 'https://graph.facebook.com';
    const RETRYABLE_META_CODES = new Set([4, 17, 32, 613]);

    function cleanId(value) {
        return String(value || '').trim().replace(/^act_/, '');
    }

    function accountPath(value) {
        const id = cleanId(value);
        if (!id) throw new Error('Choose a Meta ad account.');
        return `act_${id}`;
    }

    function requireDate(value, label) {
        const date = String(value || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
            throw new Error(`${label} must be a valid date.`);
        }
        return date;
    }

    function splitMonthRanges(startDate, endDate) {
        const since = requireDate(startDate, 'Start date');
        const until = requireDate(endDate, 'End date');
        if (since > until) throw new Error('Start date must be on or before end date.');

        const ranges = [];
        let cursor = new Date(`${since}T00:00:00Z`);
        const finalDate = new Date(`${until}T00:00:00Z`);
        while (cursor <= finalDate) {
            const year = cursor.getUTCFullYear();
            const month = cursor.getUTCMonth();
            const monthEnd = new Date(Date.UTC(year, month + 1, 0));
            const rangeEnd = monthEnd < finalDate ? monthEnd : finalDate;
            ranges.push({
                since: cursor.toISOString().slice(0, 10),
                until: rangeEnd.toISOString().slice(0, 10),
                month: `${year}-${String(month + 1).padStart(2, '0')}`
            });
            cursor = new Date(Date.UTC(year, month + 1, 1));
        }
        return ranges;
    }

    function safeErrorMessage(payload, status) {
        const error = payload && payload.error;
        if (!error) return `Meta returned HTTP ${status}.`;
        const code = error.code ? ` (code ${error.code})` : '';
        return `${error.message || 'Meta could not complete the request.'}${code}`;
    }

    function retryDelay(response, attempt, random) {
        const retryAfter = Number(response && response.headers && response.headers.get && response.headers.get('Retry-After'));
        if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
        return Math.min(16000, (1000 * (2 ** attempt)) + Math.floor(random() * 250));
    }

    function createClient(options = {}) {
        const fetchImpl = options.fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
        const sleep = options.sleep || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
        const random = options.random || Math.random;
        const token = String(options.accessToken || '').trim();
        const apiVersion = String(options.apiVersion || DEFAULT_API_VERSION).replace(/^\/?/, '').replace(/\/$/, '');
        const baseUrl = String(options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
        const maxRetries = Number.isInteger(options.maxRetries) ? options.maxRetries : 4;

        if (!fetchImpl) throw new Error('Meta API requests are not available in this browser.');
        if (!token) throw new Error('Save a Meta access token first.');

        function buildUrl(pathOrUrl, params = {}) {
            const url = /^https:\/\//i.test(pathOrUrl)
                ? new URL(pathOrUrl)
                : new URL(`${baseUrl}/${apiVersion}/${String(pathOrUrl).replace(/^\//, '')}`);
            url.searchParams.delete('access_token');
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
            });
            return url;
        }

        async function request(pathOrUrl, params = {}) {
            const url = buildUrl(pathOrUrl, params);
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                let response;
                let payload;
                try {
                    response = await fetchImpl(url.toString(), {
                        method: 'GET',
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    payload = await response.json();
                } catch (error) {
                    if (attempt >= maxRetries) throw new Error(`Could not reach Meta: ${error.message}`);
                    await sleep(retryDelay(response, attempt, random));
                    continue;
                }

                const metaCode = Number(payload && payload.error && payload.error.code);
                const retryable = response.status === 429 || response.status >= 500 || RETRYABLE_META_CODES.has(metaCode);
                if (retryable && attempt < maxRetries) {
                    await sleep(retryDelay(response, attempt, random));
                    continue;
                }
                if (!response.ok || (payload && payload.error)) throw new Error(safeErrorMessage(payload, response.status));
                return payload;
            }
            throw new Error('Meta could not complete the request after several attempts.');
        }

        async function requestAll(path, params = {}) {
            const rows = [];
            let next = path;
            let nextParams = params;
            while (next) {
                const payload = await request(next, nextParams);
                if (Array.isArray(payload.data)) rows.push(...payload.data);
                next = payload.paging && payload.paging.next ? payload.paging.next : '';
                nextParams = {};
            }
            return rows;
        }

        function getCampaigns(accountId) {
            return requestAll(`${accountPath(accountId)}/campaigns`, {
                fields: 'id,name,start_time,stop_time,status,configured_status,effective_status,daily_budget,lifetime_budget',
                limit: 500
            });
        }

        function getAdSets(accountId) {
            return requestAll(`${accountPath(accountId)}/adsets`, {
                fields: 'id,campaign_id,name',
                limit: 500
            });
        }

        function getInsights(accountId, startDate, endDate) {
            const since = requireDate(startDate, 'Start date');
            const until = requireDate(endDate, 'End date');
            if (since > until) throw new Error('Start date must be on or before end date.');
            return requestAll(`${accountPath(accountId)}/insights`, {
                level: 'campaign',
                fields: 'campaign_id,campaign_name,spend',
                time_range: JSON.stringify({ since, until }),
                limit: 5000
            });
        }

        function campaignBudget(campaign) {
            const lifetime = Number(campaign.lifetime_budget);
            if (Number.isFinite(lifetime) && lifetime > 0) return { budget: lifetime / 100, budgetType: 'Lifetime' };
            const daily = Number(campaign.daily_budget);
            if (Number.isFinite(daily) && daily > 0) return { budget: daily / 100, budgetType: 'Daily' };
            return { budget: null, budgetType: '' };
        }

        function mergeCampaignData(account, campaigns, adSets, insights, range) {
            const insightByCampaign = new Map(insights.map(insight => [cleanId(insight.campaign_id), insight]));
            const campaignById = new Map(campaigns.map(campaign => [cleanId(campaign.id), campaign]));
            const adSetNames = new Map();
            adSets.forEach(adSet => {
                const campaignId = cleanId(adSet.campaign_id);
                if (!adSetNames.has(campaignId)) adSetNames.set(campaignId, []);
                if (adSet.name) adSetNames.get(campaignId).push(adSet.name);
            });
            insights.forEach(insight => {
                const id = cleanId(insight.campaign_id);
                if (!campaignById.has(id)) campaignById.set(id, { id, name: insight.campaign_name || '' });
            });

            return [...campaignById.values()].filter(campaign => {
                const id = cleanId(campaign.id);
                if (insightByCampaign.has(id)) return true;
                if (['ARCHIVED', 'DELETED'].includes(String(campaign.effective_status || campaign.status || '').toUpperCase())) return false;
                const starts = String(campaign.start_time || '').slice(0, 10);
                const ends = String(campaign.stop_time || '').slice(0, 10);
                return (!starts || starts <= range.until) && (!ends || ends >= range.since);
            }).map(campaign => {
                const campaignId = cleanId(campaign.id);
                const insight = insightByCampaign.get(campaignId) || {};
                const budget = campaignBudget(campaign);
                return {
                    accountId: cleanId(account.id || account.accountId),
                    accountName: account.name || '',
                    campaignId,
                    campaignName: campaign.name || insight.campaign_name || '',
                    adSetName: [...new Set(adSetNames.get(campaignId) || [])].join(', '),
                    month: range.month || range.since.slice(0, 7),
                    reportingStart: range.since,
                    reportingEnd: range.until,
                    startDate: String(campaign.start_time || '').slice(0, 10),
                    endDate: String(campaign.stop_time || '').slice(0, 10),
                    budget: budget.budget,
                    budgetType: budget.budgetType,
                    delivery: campaign.effective_status || campaign.configured_status || campaign.status || '',
                    status: campaign.status || '',
                    configuredStatus: campaign.configured_status || '',
                    effectiveStatus: campaign.effective_status || '',
                    spend: Number(insight.spend || 0)
                };
            });
        }

        async function getReport(account, startDate, endDate) {
            const range = { since: requireDate(startDate, 'Start date'), until: requireDate(endDate, 'End date') };
            if (range.since > range.until) throw new Error('Start date must be on or before end date.');
            const [campaigns, adSets, insights] = await Promise.all([
                getCampaigns(account.id || account.accountId),
                getAdSets(account.id || account.accountId),
                getInsights(account.id || account.accountId, range.since, range.until)
            ]);
            return mergeCampaignData(account, campaigns, adSets, insights, range);
        }

        async function getMonthlyReport(account, startDate, endDate) {
            const sync = await syncAccount(account, startDate, endDate);
            return sync.records;
        }

        async function syncAccount(account, startDate, endDate) {
            const accountId = account.id || account.accountId;
            const [campaigns, adSets] = await Promise.all([getCampaigns(accountId), getAdSets(accountId)]);
            const records = [];
            for (const range of splitMonthRanges(startDate, endDate)) {
                const insights = await getInsights(accountId, range.since, range.until);
                records.push(...mergeCampaignData(account, campaigns, adSets, insights, range));
            }
            return { accountId: cleanId(accountId), campaigns, adSets, records };
        }

        return { getCampaigns, getAdSets, getInsights, getReport, getMonthlyReport, syncAccount };
    }

    function resolveDateRange(preset, todayValue = new Date()) {
        const today = new Date(Date.UTC(todayValue.getUTCFullYear(), todayValue.getUTCMonth(), todayValue.getUTCDate()));
        const iso = date => date.toISOString().slice(0, 10);
        const shift = days => new Date(today.getTime() + (days * 86400000));
        if (preset === 'today') return { since: iso(today), until: iso(today) };
        if (preset === 'yesterday') return { since: iso(shift(-1)), until: iso(shift(-1)) };
        if (preset === 'last7') return { since: iso(shift(-6)), until: iso(today) };
        if (preset === 'last14') return { since: iso(shift(-13)), until: iso(today) };
        if (preset === 'last30') return { since: iso(shift(-29)), until: iso(today) };
        if (preset === 'thisMonth') return { since: iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))), until: iso(today) };
        if (preset === 'lastMonth') return {
            since: iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1))),
            until: iso(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0)))
        };
        return null;
    }

    function mergeReferenceData(reference, account, syncResult, syncedAt = new Date().toISOString()) {
        const next = {
            accounts: [...((reference && reference.accounts) || [])],
            campaigns: [...((reference && reference.campaigns) || [])],
            adSets: [...((reference && reference.adSets) || [])],
            importedAt: reference && reference.importedAt ? reference.importedAt : ''
        };
        const accounts = new Map(next.accounts.map(item => [cleanId(item.id), item]));
        const campaigns = new Map(next.campaigns.map(item => [cleanId(item.id), item]));
        const adSets = new Map(next.adSets.map(item => [cleanId(item.id), item]));
        const accountId = cleanId(account.id || account.accountId);
        accounts.set(accountId, { ...(accounts.get(accountId) || {}), id: accountId, name: account.name || accounts.get(accountId)?.name || accountId, lastSynced: syncedAt });
        (syncResult.campaigns || []).forEach(campaign => {
            const id = cleanId(campaign.id);
            campaigns.set(id, { ...(campaigns.get(id) || {}), id, name: campaign.name || campaigns.get(id)?.name || '', accountId });
        });
        (syncResult.adSets || []).forEach(adSet => {
            const id = cleanId(adSet.id);
            adSets.set(id, { ...(adSets.get(id) || {}), id, name: adSet.name || adSets.get(id)?.name || '', campaignId: cleanId(adSet.campaign_id) });
        });
        return { ...next, accounts: [...accounts.values()], campaigns: [...campaigns.values()], adSets: [...adSets.values()] };
    }

    function escapeCsv(value) {
        let text = value === null || value === undefined ? '' : String(value);
        if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
        return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }

    function reportToMetaCsv(records) {
        const columns = [
            ['Account name', 'accountName'], ['Account ID', 'accountId'], ['Campaign ID', 'campaignId'],
            ['Campaign name', 'campaignName'], ['Ad set name', 'adSetName'], ['Month', 'month'],
            ['Reporting starts', 'reportingStart'], ['Reporting ends', 'reportingEnd'],
            ['Amount spent (GBP)', 'spend'], ['Campaign budget', 'budget'], ['Campaign budget type', 'budgetType'],
            ['Delivery', 'delivery'], ['Configured status', 'configuredStatus'], ['Campaign status', 'status'],
            ['Campaign start', 'startDate'], ['Campaign end', 'endDate']
        ];
        return [columns.map(([label]) => escapeCsv(label)).join(','), ...(records || []).map(record => (
            columns.map(([, key]) => escapeCsv(record[key])).join(',')
        ))].join('\n');
    }

    return { createClient, splitMonthRanges, resolveDateRange, mergeReferenceData, reportToMetaCsv, cleanId, DEFAULT_API_VERSION };
});

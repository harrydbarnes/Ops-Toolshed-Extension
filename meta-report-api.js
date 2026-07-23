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
                fields: [
                    'id', 'name', 'start_time', 'stop_time', 'status', 'configured_status', 'effective_status',
                    'daily_budget', 'lifetime_budget', 'budget_remaining', 'budget_rebalance_flag',
                    'is_adset_budget_sharing_enabled', 'is_budget_schedule_enabled', 'updated_time'
                ].join(','),
                limit: 500
            });
        }

        function getAdSets(accountId) {
            return requestAll(`${accountPath(accountId)}/adsets`, {
                fields: [
                    'id', 'campaign_id', 'name', 'start_time', 'end_time', 'status', 'configured_status',
                    'effective_status', 'daily_budget', 'lifetime_budget', 'budget_remaining',
                    'is_budget_schedule_enabled', 'updated_time'
                ].join(','),
                limit: 500
            });
        }

        function getAccountMetadata(accountId) {
            return request(accountPath(accountId), {
                fields: 'id,name,currency,timezone_name,timezone_offset_hours_utc'
            });
        }

        function getInsights(accountId, startDate, endDate) {
            const since = requireDate(startDate, 'Start date');
            const until = requireDate(endDate, 'End date');
            if (since > until) throw new Error('Start date must be on or before end date.');
            return requestAll(`${accountPath(accountId)}/insights`, {
                level: 'campaign',
                fields: 'campaign_id,campaign_name,spend,impressions,reach,date_start,date_stop',
                time_range: JSON.stringify({ since, until }),
                limit: 5000
            });
        }

        function getDailyInsights(accountId, startDate, endDate) {
            const since = requireDate(startDate, 'Start date');
            const until = requireDate(endDate, 'End date');
            if (since > until) throw new Error('Start date must be on or before end date.');
            return requestAll(`${accountPath(accountId)}/insights`, {
                level: 'campaign',
                fields: 'campaign_id,campaign_name,spend,impressions,reach,date_start,date_stop',
                time_range: JSON.stringify({ since, until }),
                time_increment: 1,
                limit: 5000
            });
        }

        function moneyFromMinorUnits(value) {
            const number = Number(value);
            return Number.isFinite(number) && number >= 0 ? number / 100 : null;
        }

        function entityBudget(entity) {
            const lifetime = moneyFromMinorUnits(entity.lifetime_budget);
            if (lifetime !== null && lifetime > 0) return { budget: lifetime, budgetType: 'Lifetime' };
            const daily = moneyFromMinorUnits(entity.daily_budget);
            if (daily !== null && daily > 0) return { budget: daily, budgetType: 'Daily' };
            return { budget: null, budgetType: '' };
        }

        function unique(values) {
            return [...new Set(values.filter(value => value !== null && value !== undefined && value !== ''))];
        }

        function latestTimestamp(values) {
            return values.filter(Boolean).sort().at(-1) || '';
        }

        function aggregateAdSetMetadata(adSets) {
            const budgets = adSets.map(entityBudget).filter(item => item.budget !== null);
            const budgetTypes = unique(budgets.map(item => item.budgetType));
            const comparableBudget = budgets.length && budgetTypes.length === 1
                ? budgets.reduce((sum, item) => sum + item.budget, 0)
                : null;
            const remainingValues = adSets.map(adSet => moneyFromMinorUnits(adSet.budget_remaining)).filter(value => value !== null);
            const starts = adSets.map(adSet => String(adSet.start_time || '').slice(0, 10)).filter(Boolean).sort();
            const ends = adSets.map(adSet => String(adSet.end_time || '').slice(0, 10)).filter(Boolean).sort();
            const statuses = unique(adSets.map(adSet => adSet.effective_status || adSet.configured_status || adSet.status));
            return {
                names: unique(adSets.map(adSet => adSet.name)),
                startDate: starts[0] || '',
                endDate: ends.at(-1) || '',
                statuses,
                budget: comparableBudget,
                budgetType: budgetTypes.length === 1 ? budgetTypes[0] : (budgetTypes.length ? 'Mixed' : ''),
                budgetRemaining: remainingValues.length ? remainingValues.reduce((sum, value) => sum + value, 0) : null,
                updatedTime: latestTimestamp(adSets.map(adSet => adSet.updated_time)),
                budgetScheduleEnabled: adSets.some(adSet => adSet.is_budget_schedule_enabled === true),
                activeCount: adSets.filter(adSet => String(adSet.effective_status || '').toUpperCase() === 'ACTIVE').length
            };
        }

        function mergeCampaignData(account, campaigns, adSets, insights, dailyInsights, range, accountMetadata = {}) {
            const insightByCampaign = new Map(insights.map(insight => [cleanId(insight.campaign_id), insight]));
            const campaignById = new Map(campaigns.map(campaign => [cleanId(campaign.id), campaign]));
            const adSetsByCampaign = new Map();
            adSets.forEach(adSet => {
                const campaignId = cleanId(adSet.campaign_id);
                if (!adSetsByCampaign.has(campaignId)) adSetsByCampaign.set(campaignId, []);
                adSetsByCampaign.get(campaignId).push(adSet);
            });
            const dailyByCampaign = new Map();
            dailyInsights.forEach(insight => {
                const campaignId = cleanId(insight.campaign_id);
                if (!dailyByCampaign.has(campaignId)) dailyByCampaign.set(campaignId, []);
                dailyByCampaign.get(campaignId).push({
                    date: String(insight.date_start || '').slice(0, 10),
                    spend: Number(insight.spend || 0),
                    impressions: Number(insight.impressions || 0),
                    reach: Number(insight.reach || 0)
                });
            });
            insights.forEach(insight => {
                const id = cleanId(insight.campaign_id);
                if (!campaignById.has(id)) campaignById.set(id, { id, name: insight.campaign_name || '' });
            });

            return [...campaignById.values()].filter(campaign => {
                const id = cleanId(campaign.id);
                if (insightByCampaign.has(id)) return true;
                if (['ARCHIVED', 'DELETED'].includes(String(campaign.effective_status || campaign.status || '').toUpperCase())) return false;
                const adSetMetadata = aggregateAdSetMetadata(adSetsByCampaign.get(id) || []);
                const starts = adSetMetadata.startDate || String(campaign.start_time || '').slice(0, 10);
                const ends = adSetMetadata.endDate || String(campaign.stop_time || '').slice(0, 10);
                return (!starts || starts <= range.until) && (!ends || ends >= range.since);
            }).map(campaign => {
                const campaignId = cleanId(campaign.id);
                const insight = insightByCampaign.get(campaignId) || {};
                const campaignBudget = entityBudget(campaign);
                const campaignAdSets = adSetsByCampaign.get(campaignId) || [];
                const adSetMetadata = aggregateAdSetMetadata(campaignAdSets);
                const budget = campaignBudget.budget !== null ? campaignBudget : { budget: adSetMetadata.budget, budgetType: adSetMetadata.budgetType };
                const budgetLevel = campaignBudget.budget !== null ? 'Campaign' : (adSetMetadata.budget !== null ? 'Ad set' : '');
                const budgetRemaining = campaignBudget.budget !== null
                    ? moneyFromMinorUnits(campaign.budget_remaining)
                    : adSetMetadata.budgetRemaining;
                const dailySpend = (dailyByCampaign.get(campaignId) || []).sort((left, right) => left.date.localeCompare(right.date));
                const deliveryDays = dailySpend.filter(day => day.spend > 0 || day.impressions > 0);
                const isAdSetBudgetSharingEnabled = campaign.is_adset_budget_sharing_enabled === true;
                const budgetSource = campaignBudget.budget !== null
                    ? 'Campaign budget (CBO / Advantage campaign budget)'
                    : isAdSetBudgetSharingEnabled ? 'Shared ad set budget' : (adSetMetadata.budget !== null ? 'Ad set budgets' : '');
                return {
                    accountId: cleanId(account.id || account.accountId),
                    accountName: accountMetadata.name || account.name || '',
                    accountCurrency: accountMetadata.currency || '',
                    accountTimezone: accountMetadata.timezone_name || '',
                    accountTimezoneOffset: accountMetadata.timezone_offset_hours_utc ?? '',
                    campaignId,
                    campaignName: campaign.name || insight.campaign_name || '',
                    adSetName: adSetMetadata.names.join(', '),
                    adSetCount: campaignAdSets.length,
                    activeAdSetCount: adSetMetadata.activeCount,
                    adSetStatuses: adSetMetadata.statuses.join(', '),
                    month: range.month || range.since.slice(0, 7),
                    reportingStart: range.since,
                    reportingEnd: range.until,
                    startDate: adSetMetadata.startDate || String(campaign.start_time || '').slice(0, 10),
                    endDate: adSetMetadata.endDate || String(campaign.stop_time || '').slice(0, 10),
                    campaignStartDate: String(campaign.start_time || '').slice(0, 10),
                    campaignEndDate: String(campaign.stop_time || '').slice(0, 10),
                    adSetStartDate: adSetMetadata.startDate,
                    adSetEndDate: adSetMetadata.endDate,
                    budget: budget.budget,
                    budgetType: budget.budgetType,
                    budgetLevel,
                    budgetSource,
                    budgetRemaining,
                    campaignBudget: campaignBudget.budget,
                    campaignBudgetType: campaignBudget.budgetType,
                    adSetBudget: adSetMetadata.budget,
                    adSetBudgetType: adSetMetadata.budgetType,
                    isAdSetBudgetSharingEnabled,
                    budgetRebalanceFlag: campaign.budget_rebalance_flag === true,
                    budgetScheduleEnabled: campaign.is_budget_schedule_enabled === true || adSetMetadata.budgetScheduleEnabled,
                    delivery: campaign.effective_status || campaign.configured_status || campaign.status || '',
                    status: campaign.status || '',
                    configuredStatus: campaign.configured_status || '',
                    effectiveStatus: campaign.effective_status || '',
                    campaignUpdatedTime: campaign.updated_time || '',
                    adSetUpdatedTime: adSetMetadata.updatedTime,
                    updatedTime: latestTimestamp([campaign.updated_time, adSetMetadata.updatedTime]),
                    spend: Number(insight.spend || 0),
                    impressions: Number(insight.impressions || 0),
                    reach: Number(insight.reach || 0),
                    dailySpend,
                    activeSpendDays: deliveryDays.length,
                    firstDeliveryDate: deliveryDays[0]?.date || '',
                    lastDeliveryDate: deliveryDays.at(-1)?.date || ''
                };
            });
        }

        async function getReport(account, startDate, endDate) {
            const range = { since: requireDate(startDate, 'Start date'), until: requireDate(endDate, 'End date') };
            if (range.since > range.until) throw new Error('Start date must be on or before end date.');
            const [accountMetadata, campaigns, adSets, insights, dailyInsights] = await Promise.all([
                getAccountMetadata(account.id || account.accountId),
                getCampaigns(account.id || account.accountId),
                getAdSets(account.id || account.accountId),
                getInsights(account.id || account.accountId, range.since, range.until),
                getDailyInsights(account.id || account.accountId, range.since, range.until)
            ]);
            return mergeCampaignData(account, campaigns, adSets, insights, dailyInsights, range, accountMetadata);
        }

        async function getMonthlyReport(account, startDate, endDate) {
            const sync = await syncAccount(account, startDate, endDate);
            return sync.records;
        }

        async function syncAccount(account, startDate, endDate) {
            const accountId = account.id || account.accountId;
            const [accountMetadata, campaigns, adSets] = await Promise.all([
                getAccountMetadata(accountId),
                getCampaigns(accountId),
                getAdSets(accountId)
            ]);
            const records = [];
            for (const range of splitMonthRanges(startDate, endDate)) {
                const [insights, dailyInsights] = await Promise.all([
                    getInsights(accountId, range.since, range.until),
                    getDailyInsights(accountId, range.since, range.until)
                ]);
                records.push(...mergeCampaignData(account, campaigns, adSets, insights, dailyInsights, range, accountMetadata));
            }
            return { accountId: cleanId(accountId), account: accountMetadata, campaigns, adSets, records };
        }

        return { getAccountMetadata, getCampaigns, getAdSets, getInsights, getDailyInsights, getReport, getMonthlyReport, syncAccount };
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
        accounts.set(accountId, {
            ...(accounts.get(accountId) || {}),
            id: accountId,
            name: syncResult.account?.name || account.name || accounts.get(accountId)?.name || accountId,
            currency: syncResult.account?.currency || accounts.get(accountId)?.currency || '',
            timezone: syncResult.account?.timezone_name || accounts.get(accountId)?.timezone || '',
            timezoneOffset: syncResult.account?.timezone_offset_hours_utc ?? accounts.get(accountId)?.timezoneOffset ?? '',
            lastSynced: syncedAt
        });
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
            ['Account currency', 'accountCurrency'], ['Account timezone', 'accountTimezone'], ['Account timezone offset', 'accountTimezoneOffset'],
            ['Amount spent', 'spend'], ['Campaign budget', 'budget'], ['Campaign budget type', 'budgetType'],
            ['Budget level', 'budgetLevel'], ['Budget source', 'budgetSource'], ['Budget remaining', 'budgetRemaining'],
            ['Campaign budget value', 'campaignBudget'], ['Campaign budget value type', 'campaignBudgetType'],
            ['Ad set budget total', 'adSetBudget'], ['Ad set budget type', 'adSetBudgetType'],
            ['Ad set budget sharing enabled', 'isAdSetBudgetSharingEnabled'], ['Budget rebalance enabled', 'budgetRebalanceFlag'],
            ['Budget schedule enabled', 'budgetScheduleEnabled'],
            ['Delivery', 'delivery'], ['Configured status', 'configuredStatus'], ['Campaign status', 'status'],
            ['Ad set status', 'adSetStatuses'], ['Ad set count', 'adSetCount'], ['Active ad set count', 'activeAdSetCount'],
            ['Ad set start', 'adSetStartDate'], ['Ad set end', 'adSetEndDate'],
            ['Campaign start', 'campaignStartDate'], ['Campaign end', 'campaignEndDate'],
            ['Meta updated time', 'updatedTime'], ['Campaign updated time', 'campaignUpdatedTime'], ['Ad set latest updated time', 'adSetUpdatedTime'],
            ['Impressions', 'impressions'], ['Reach', 'reach'], ['Active delivery days', 'activeSpendDays'],
            ['First delivery date', 'firstDeliveryDate'], ['Last delivery date', 'lastDeliveryDate'], ['Daily spend by date', 'dailySpend']
        ];
        return [columns.map(([label]) => escapeCsv(label)).join(','), ...(records || []).map(record => (
            columns.map(([, key]) => escapeCsv(key === 'dailySpend' ? JSON.stringify(record[key] || []) : record[key])).join(',')
        ))].join('\n');
    }

    return { createClient, splitMonthRanges, resolveDateRange, mergeReferenceData, reportToMetaCsv, cleanId, DEFAULT_API_VERSION };
});

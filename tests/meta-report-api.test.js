const { createClient, splitMonthRanges, resolveDateRange, mergeReferenceData, reportToMetaCsv } = require('../meta-report-api');

function response(status, payload, headers = {}) {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: name => headers[name] || null },
        json: jest.fn().mockResolvedValue(payload)
    };
}

describe('Meta report API client', () => {
    test('paginates account-scoped GET requests without Business discovery or tokens in URLs', async () => {
        const fetchImpl = jest.fn(async urlValue => {
            const url = new URL(urlValue);
            if (url.pathname.endsWith('/campaigns') && !url.searchParams.has('after')) return response(200, {
                data: [{ id: '1', name: 'First' }],
                paging: { next: 'https://graph.facebook.com/v24.0/act_111/campaigns?after=next&access_token=leaked-token' }
            });
            if (url.pathname.endsWith('/campaigns')) return response(200, { data: [{ id: '2', name: 'Second' }] });
            throw new Error(`Unexpected URL ${url}`);
        });
        const client = createClient({ fetchImpl, accessToken: 'private-token' });

        await expect(client.getCampaigns('111')).resolves.toHaveLength(2);
        expect(client.getAdAccounts).toBeUndefined();
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        fetchImpl.mock.calls.forEach(([url, options]) => {
            expect(url).not.toContain('private-token');
            expect(url).not.toContain('leaked-token');
            expect(url).not.toContain('owned_ad_accounts');
            expect(url).not.toContain('client_ad_accounts');
            expect(options.method).toBe('GET');
            expect(options.headers.Authorization).toBe('Bearer private-token');
        });
    });

    test('retries rate limits before returning insights', async () => {
        const sleep = jest.fn().mockResolvedValue();
        const fetchImpl = jest.fn()
            .mockResolvedValueOnce(response(429, { error: { message: 'Slow down', code: 4 } }, { 'Retry-After': '1' }))
            .mockResolvedValueOnce(response(200, { data: [{ campaign_id: '9', campaign_name: 'Campaign', spend: '12.34' }] }));
        const client = createClient({ fetchImpl, sleep, random: () => 0, accessToken: 'token' });

        await expect(client.getInsights('111', '2026-06-01', '2026-06-30')).resolves.toHaveLength(1);
        expect(sleep).toHaveBeenCalledWith(1000);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    test('merges account settings, campaign and ad-set metadata, daily delivery, budgets, and monthly spend', async () => {
        const fetchImpl = jest.fn(async urlValue => {
            const url = new URL(urlValue);
            if (url.pathname.endsWith('/act_111')) return response(200, {
                id: 'act_111', name: 'Boots', currency: 'GBP', timezone_name: 'Europe/London', timezone_offset_hours_utc: 1
            });
            if (url.pathname.endsWith('/campaigns')) return response(200, { data: [{
                id: '9', name: 'Summer', start_time: '2026-06-03T00:00:00+0000', stop_time: '2026-08-31T23:59:59+0000',
                status: 'ACTIVE', configured_status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: '10000', lifetime_budget: '25000',
                budget_remaining: '12500', is_adset_budget_sharing_enabled: true, is_budget_schedule_enabled: false,
                updated_time: '2026-07-20T10:00:00+0000'
            }] });
            if (url.pathname.endsWith('/adsets')) return response(200, { data: [
                { id: 'a', campaign_id: '9', name: 'Prospecting', start_time: '2026-06-05T00:00:00+0000', end_time: '2026-07-31T23:59:59+0000', effective_status: 'ACTIVE', daily_budget: '5000', budget_remaining: '3000', updated_time: '2026-07-21T10:00:00+0000' },
                { id: 'b', campaign_id: '9', name: 'Retargeting', start_time: '2026-06-10T00:00:00+0000', end_time: '2026-08-15T23:59:59+0000', effective_status: 'PAUSED', daily_budget: '5000', budget_remaining: '2000', updated_time: '2026-07-19T10:00:00+0000' }
            ] });
            if (url.pathname.endsWith('/insights')) {
                const range = JSON.parse(url.searchParams.get('time_range'));
                if (url.searchParams.get('time_increment') === '1') return response(200, { data: [
                    { campaign_id: '9', campaign_name: 'Summer', date_start: range.since, date_stop: range.since, spend: '10', impressions: '100', reach: '80' },
                    { campaign_id: '9', campaign_name: 'Summer', date_start: range.until, date_stop: range.until, spend: range.since.startsWith('2026-06') ? '30' : '50', impressions: '300', reach: '200' }
                ] });
                return response(200, { data: [{
                    campaign_id: '9', campaign_name: 'Summer', spend: range.since.startsWith('2026-06') ? '40' : '60', impressions: '400', reach: '250'
                }] });
            }
            throw new Error(`Unexpected URL ${url}`);
        });
        const client = createClient({ fetchImpl, accessToken: 'token' });

        const sync = await client.syncAccount({ id: '111', name: 'Boots' }, '2026-06-15', '2026-07-20');
        const rows = sync.records;

        expect(rows).toHaveLength(2);
        expect(sync.campaigns).toHaveLength(1);
        expect(sync.adSets).toHaveLength(2);
        expect(rows[0]).toEqual(expect.objectContaining({
            accountId: '111', accountName: 'Boots', campaignId: '9', campaignName: 'Summer',
            adSetName: 'Prospecting, Retargeting', month: '2026-06', reportingStart: '2026-06-15',
            reportingEnd: '2026-06-30', startDate: '2026-06-05', endDate: '2026-08-15',
            accountCurrency: 'GBP', accountTimezone: 'Europe/London',
            budget: 250, budgetType: 'Lifetime', budgetLevel: 'Campaign', budgetRemaining: 125,
            budgetSource: 'Campaign budget (CBO / Advantage campaign budget)', isAdSetBudgetSharingEnabled: true,
            adSetBudget: 100, adSetBudgetType: 'Daily', adSetStatuses: 'ACTIVE, PAUSED',
            delivery: 'ACTIVE', effectiveStatus: 'ACTIVE', spend: 40, impressions: 400, reach: 250,
            activeSpendDays: 2, firstDeliveryDate: '2026-06-15', lastDeliveryDate: '2026-06-30',
            updatedTime: '2026-07-21T10:00:00+0000'
        }));
        expect(rows[1]).toEqual(expect.objectContaining({ month: '2026-07', spend: 60 }));
    });

    test('splits arbitrary ranges into comparison months and exports the engine-compatible shape', () => {
        expect(splitMonthRanges('2026-06-15', '2026-08-02')).toEqual([
            { since: '2026-06-15', until: '2026-06-30', month: '2026-06' },
            { since: '2026-07-01', until: '2026-07-31', month: '2026-07' },
            { since: '2026-08-01', until: '2026-08-02', month: '2026-08' }
        ]);
        const csv = reportToMetaCsv([{ accountId: '111', campaignId: '9', campaignName: 'Summer', month: '2026-06', accountCurrency: 'GBP', spend: 12.5, delivery: 'ACTIVE', adSetStartDate: '2026-06-01', adSetEndDate: '2026-06-30', dailySpend: [{ date: '2026-06-01', spend: 12.5 }] }]);
        expect(csv).toContain('Account ID,Campaign ID');
        expect(csv).toContain('Account currency');
        expect(csv).toContain('Amount spent');
        expect(csv).toContain('Daily spend by date');
        expect(csv).toContain('111,9,Summer');
        expect(csv).toContain('ACTIVE');
        expect(csv).toContain('2026-06-01,2026-06-30');
    });

    test('resolves date presets and adds newly discovered campaign and ad set references', () => {
        const today = new Date('2026-07-21T12:00:00Z');
        expect(resolveDateRange('last7', today)).toEqual({ since: '2026-07-15', until: '2026-07-21' });
        expect(resolveDateRange('lastMonth', today)).toEqual({ since: '2026-06-01', until: '2026-06-30' });

        const merged = mergeReferenceData(
            { importedAt: '2026-07-01', accounts: [{ id: '111', name: 'Boots', lastSynced: '' }], campaigns: [], adSets: [] },
            { id: '111', name: 'Boots' },
            { campaigns: [{ id: '9', name: 'New campaign' }], adSets: [{ id: 'a', campaign_id: '9', name: 'New ad set' }] },
            '2026-07-21T12:00:00.000Z'
        );
        expect(merged.accounts[0].lastSynced).toBe('2026-07-21T12:00:00.000Z');
        expect(merged.campaigns).toEqual([{ id: '9', name: 'New campaign', accountId: '111' }]);
        expect(merged.adSets).toEqual([{ id: 'a', name: 'New ad set', campaignId: '9' }]);
    });
});

const { createClient, splitMonthRanges, reportToMetaCsv } = require('../meta-report-api');

function response(status, payload, headers = {}) {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: name => headers[name] || null },
        json: jest.fn().mockResolvedValue(payload)
    };
}

describe('Meta report API client', () => {
    test('merges and paginates owned and client ad accounts without putting the token in a URL', async () => {
        const fetchImpl = jest.fn(async urlValue => {
            const url = new URL(urlValue);
            if (url.pathname.endsWith('/owned_ad_accounts') && !url.searchParams.has('after')) return response(200, {
                data: [{ id: 'act_111', account_id: '111', name: 'Boots' }],
                paging: { next: 'https://graph.facebook.com/v24.0/123/owned_ad_accounts?after=next&access_token=leaked-token' }
            });
            if (url.pathname.endsWith('/owned_ad_accounts')) return response(200, { data: [{ id: 'act_222', account_id: '222', name: 'No7' }] });
            if (url.pathname.endsWith('/client_ad_accounts')) return response(200, { data: [
                { id: 'act_222', account_id: '222', name: 'No7 duplicate' },
                { id: 'act_333', account_id: '333', name: 'Shared client' }
            ] });
            throw new Error(`Unexpected URL ${url}`);
        });
        const client = createClient({ fetchImpl, accessToken: 'private-token', businessId: '123' });

        const accounts = await client.getAdAccounts();
        expect(accounts).toHaveLength(3);
        expect(accounts).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: '111', name: 'Boots' }),
            expect.objectContaining({ id: '222', name: 'No7' }),
            expect.objectContaining({ id: '333', name: 'Shared client' })
        ]));
        expect(fetchImpl).toHaveBeenCalledTimes(3);
        fetchImpl.mock.calls.forEach(([url, options]) => {
            expect(url).not.toContain('private-token');
            expect(url).not.toContain('leaked-token');
            expect(options.headers.Authorization).toBe('Bearer private-token');
        });
    });

    test('retries rate limits before returning insights', async () => {
        const sleep = jest.fn().mockResolvedValue();
        const fetchImpl = jest.fn()
            .mockResolvedValueOnce(response(429, { error: { message: 'Slow down', code: 4 } }, { 'Retry-After': '1' }))
            .mockResolvedValueOnce(response(200, { data: [{ campaign_id: '9', campaign_name: 'Campaign', spend: '12.34' }] }));
        const client = createClient({ fetchImpl, sleep, random: () => 0, accessToken: 'token', businessId: '123' });

        await expect(client.getInsights('111', '2026-06-01', '2026-06-30')).resolves.toHaveLength(1);
        expect(sleep).toHaveBeenCalledWith(1000);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    test('merges campaign, ad set, budget, status, dates, and monthly spend', async () => {
        const fetchImpl = jest.fn(async urlValue => {
            const url = new URL(urlValue);
            if (url.pathname.endsWith('/campaigns')) return response(200, { data: [{
                id: '9', name: 'Summer', start_time: '2026-06-03T00:00:00+0000', stop_time: '2026-08-31T23:59:59+0000',
                status: 'ACTIVE', configured_status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: '10000'
            }] });
            if (url.pathname.endsWith('/adsets')) return response(200, { data: [
                { id: 'a', campaign_id: '9', name: 'Prospecting' },
                { id: 'b', campaign_id: '9', name: 'Retargeting' }
            ] });
            if (url.pathname.endsWith('/insights')) {
                const range = JSON.parse(url.searchParams.get('time_range'));
                return response(200, { data: [{ campaign_id: '9', campaign_name: 'Summer', spend: range.since.startsWith('2026-06') ? '40' : '60' }] });
            }
            throw new Error(`Unexpected URL ${url}`);
        });
        const client = createClient({ fetchImpl, accessToken: 'token', businessId: '123' });

        const rows = await client.getMonthlyReport({ id: '111', name: 'Boots' }, '2026-06-15', '2026-07-20');

        expect(rows).toHaveLength(2);
        expect(rows[0]).toEqual(expect.objectContaining({
            accountId: '111', accountName: 'Boots', campaignId: '9', campaignName: 'Summer',
            adSetName: 'Prospecting, Retargeting', month: '2026-06', reportingStart: '2026-06-15',
            reportingEnd: '2026-06-30', startDate: '2026-06-03', endDate: '2026-08-31',
            budget: 100, budgetType: 'Daily', effectiveStatus: 'ACTIVE', spend: 40
        }));
        expect(rows[1]).toEqual(expect.objectContaining({ month: '2026-07', spend: 60 }));
    });

    test('splits arbitrary ranges into comparison months and exports the engine-compatible shape', () => {
        expect(splitMonthRanges('2026-06-15', '2026-08-02')).toEqual([
            { since: '2026-06-15', until: '2026-06-30', month: '2026-06' },
            { since: '2026-07-01', until: '2026-07-31', month: '2026-07' },
            { since: '2026-08-01', until: '2026-08-02', month: '2026-08' }
        ]);
        const csv = reportToMetaCsv([{ accountId: '111', campaignId: '9', campaignName: 'Summer', month: '2026-06', spend: 12.5 }]);
        expect(csv).toContain('Account ID,Campaign ID');
        expect(csv).toContain('Amount spent (GBP)');
        expect(csv).toContain('111,9,Summer');
    });
});

const { getAbwPoPrismaContext, queryAbwPoFromPrismaTab, queryAbwPoFromWorker, rememberAbwPoHandoff, takeAbwPoHandoff } = require('../background/abw-po-session');
const { PRISMA_DASHBOARD_URL } = require('../background/prisma-url');

const sender = {
    url: 'https://go.mediaocean.com/robots.txt#abw-check-po?po=123',
    frameId: 0,
    tab: { id: 7, windowId: 1, incognito: false },
};
const campaign = {
    id: 42, incognito: false,
    url: 'https://go.mediaocean.com/campaign-management/?_ctx=test-context#campaign-id=CP123',
};

test('recognizes an existing campaign URL when Chrome retains the handoff fragment', async () => {
    const tabs = { query: jest.fn().mockResolvedValue([campaign]), create: jest.fn() };
    await expect(getAbwPoPrismaContext({}, sender, tabs)).resolves.toEqual({ context: 'test-context' });
    expect(tabs.create).not.toHaveBeenCalled();
});

test('opens Prisma and waits for the same tab to return from Okta', async () => {
    const tabs = {
        query: jest.fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([{ ...campaign, url: 'https://example.okta.com/login' }])
            .mockResolvedValueOnce([campaign]),
        create: jest.fn().mockResolvedValue({ id: 42 }),
    };
    await expect(getAbwPoPrismaContext({}, sender, tabs)).resolves.toEqual({ signInRequired: true });
    expect(tabs.create).not.toHaveBeenCalled();
    await expect(getAbwPoPrismaContext({ signInAgain: true }, sender, tabs)).resolves.toEqual({ signInTabId: 42 });
    expect(tabs.create).toHaveBeenCalledWith({ url: PRISMA_DASHBOARD_URL, windowId: 1, active: true });
    await expect(getAbwPoPrismaContext({ signInTabId: 42 }, sender, tabs)).resolves.toEqual({ context: null });
    await expect(getAbwPoPrismaContext({ signInTabId: 42 }, sender, tabs)).resolves.toEqual({ context: 'test-context' });
});

test('recovers a handoff once in the original tab after Okta drops the fragment', async () => {
    const records = {};
    const storage = {
        set: async values => Object.assign(records, values),
        get: async key => ({ [key]: records[key] }),
        remove: async key => { delete records[key]; },
    };
    await rememberAbwPoHandoff(sender.tab.id, sender.url, storage);
    const returned = { ...sender, url: 'https://go.mediaocean.com/robots.txt' };
    await expect(takeAbwPoHandoff({ ...returned, tab: { id: 8 } }, storage)).resolves.toEqual({});
    await expect(takeAbwPoHandoff(returned, storage)).resolves.toEqual({ fragment: '#abw-check-po?po=123' });
    await expect(takeAbwPoHandoff(returned, storage)).resolves.toEqual({});
});

test('rejects context requests from another page', async () => {
    const tabs = { query: jest.fn(), create: jest.fn() };
    await expect(getAbwPoPrismaContext({}, { ...sender, url: PRISMA_DASHBOARD_URL }, tabs))
        .resolves.toMatchObject({ status: 'error' });
    expect(tabs.query).not.toHaveBeenCalled();
});

test('uses the Prisma context and Chrome credentials for the worker lookup', async () => {
    const tabs = { query: jest.fn().mockResolvedValue([campaign]), create: jest.fn() };
    const lookup = { media: 'D', client: 'CW7', product: '3', start: '2026-10-01', end: '2026-12-31' };
    const rows = [{ reference: '1169037' }];
    const fetchRows = jest.fn().mockResolvedValue({ ok: true, json: async () => rows });
    await expect(queryAbwPoFromWorker({ lookup }, sender, tabs, fetchRows)).resolves.toEqual({ rows });
    expect(fetchRows).toHaveBeenCalledWith('https://go.mediaocean.com/campaign-service/secure/purchaseOrder/list', expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({ 'x-mo-context': 'test-context' }),
    }));
    expect(tabs.create).not.toHaveBeenCalled();
    fetchRows.mockResolvedValueOnce({ ok: false, status: 403 });
    await expect(queryAbwPoFromWorker({ lookup }, sender, tabs, fetchRows)).resolves.toEqual({});
});

test('runs the lookup in the existing Prisma tab without creating a tab', async () => {
    const tabs = { query: jest.fn().mockResolvedValue([campaign]), create: jest.fn() };
    const lookup = { media: 'D', client: 'CW7', product: '3', start: '2026-10-01', end: '2026-12-31' };
    const rows = [{ reference: '1169037' }];
    const scripting = { executeScript: jest.fn().mockResolvedValue([{ result: rows }]) };
    await expect(queryAbwPoFromPrismaTab({ lookup }, sender, tabs, scripting)).resolves.toEqual({ rows });
    expect(scripting.executeScript.mock.calls[0][0].target).toEqual({ tabId: campaign.id });
    expect(tabs.create).not.toHaveBeenCalled();
});

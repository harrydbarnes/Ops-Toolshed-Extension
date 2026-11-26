const { observeFinancePending, pollFinanceTimings } = require('../background/finance-timing');

describe('finance update timing', () => {
    let state;
    const sender = { id: 'test-extension-id', frameId: 0,
        url: 'https://go.mediaocean.com/campaign-management/#campaign-id=CP123&ptb-ctx=actualize&mos=2026-11-01' };
    const observation = () => ({ campaignId: 'CP123', month: '2026-11', observedAt: Date.now(), rows: [{ placementNumber: 'P123' }] });
    const response = (value) => ({ ok: true, json: async () => value });
    beforeEach(() => {
        state = {};
        chrome.runtime.id = 'test-extension-id';
        chrome.storage.local.get = jest.fn(async defaults => ({ ...defaults, ...structuredClone(state) }));
        chrome.storage.local.set = jest.fn(async value => Object.assign(state, structuredClone(value)));
        chrome.alarms.create = jest.fn(async () => {});
        global.fetch = jest.fn();
    });
    afterEach(() => { jest.restoreAllMocks(); delete global.fetch; });
    const grid = status => ({ status: 0, total: 1, nodes: [{ fields: [
        { id: 'placementNumber', value: 'P123' }, { id: 'month', value: '2026-11' },
        { id: 'buyStatus', value: status }, { id: 'buySerialNumber', value: 'D123' }
    ] }] });
    const setResponses = payload => {
        fetch.mockResolvedValueOnce(response({ publicId: 'CP123', id: 42 })).mockResolvedValueOnce(response(payload));
    };
    test('retains the first pending time and records a later successful observation', async () => {
        await observeFinancePending(observation(), sender);
        const first = state.financeTimingLog[0].firstPendingAt;
        await observeFinancePending(observation(), sender);
        expect(state.financeTimingLog).toHaveLength(1);
        setResponses(grid('SUCCESSFUL'));
        await pollFinanceTimings();
        expect(state.financeTimingLog[0]).toMatchObject({ firstPendingAt: first, status: 'SUCCESSFUL', dNumber: 'D123' });
        expect(state.financeTimingLog[0].resultObservedAt).toBeGreaterThanOrEqual(first);
        await observeFinancePending({ ...observation(), observedAt: first }, sender);
        expect(state.financeTimingLog).toHaveLength(1);
    });
    test('leaves failed and ambiguous checks unresolved', async () => {
        await observeFinancePending(observation(), sender);
        fetch.mockRejectedValueOnce(new Error('offline'));
        await pollFinanceTimings();
        expect(state.financeTimingLog[0]).toMatchObject({ status: 'PENDING', checkError: expect.any(String) });
        const duplicate = grid('SUCCESSFUL'); duplicate.nodes.push(duplicate.nodes[0]);
        setResponses(duplicate);
        await pollFinanceTimings();
        expect(state.financeTimingLog[0]).toMatchObject({ status: 'PENDING', checkError: 'Placement missing or ambiguous.' });
    });
    test('rejects observations from a different campaign', async () => {
        await expect(observeFinancePending({ ...observation(), campaignId: 'CP999' }, sender)).rejects.toThrow();
    });
});

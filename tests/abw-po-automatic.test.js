const { checkAutomaticPo, pollAutomaticPoChecks } = require('../background/abw-po-automatic');

const booking = {
    client: 'CW7', product: '3', po: '61507', start: '01/10/2026', end: '31/12/2026',
    total: '105 000', plan: '101 631,7',
};
const row = {
    mediaCode: 'D', clientCode: 'CW7', productCode: '3', reference: '0000061507',
    status: 'Approved', startDate: '2026-10-01', endDate: '2026-12-31', currencyCode: 'GBP', amount: 105000,
};

test('automatically checks a normalized booking and its padded PO', async () => {
    const fetchRows = jest.fn().mockResolvedValue({ ok: true, json: async () => [row] });
    await expect(checkAutomaticPo(booking, 'context', fetchRows)).resolves.toBe('checked');
    expect(JSON.parse(fetchRows.mock.calls[0][1].body)).toEqual({
        clientBusinessKey: 'UK|A1|D|CW7', mediaCode: 'D', productCode: '3', startDate: '2026-10-01', endDate: '2026-12-31',
    });
    fetchRows.mockResolvedValueOnce({ ok: true, json: async () => [{ ...row, amount: 101631 }] });
    await expect(checkAutomaticPo(booking, 'context', fetchRows)).resolves.toBe('review');
});

test('returns sign-in or incomplete input states without opening a tab', async () => {
    const fetchRows = jest.fn().mockResolvedValue({ ok: false, status: 403 });
    await expect(checkAutomaticPo(booking, undefined, fetchRows)).resolves.toBe('signin');
    await expect(checkAutomaticPo({ ...booking, plan: '' }, 'context', fetchRows)).resolves.toBe('unavailable');
    expect(fetchRows).not.toHaveBeenCalled();
    await expect(checkAutomaticPo(booking, 'context', fetchRows)).resolves.toBe('signin');
});

test('returns the job verdict through the native host without opening a tab', async () => {
    const previousChrome = global.chrome;
    const previousFetch = global.fetch;
    const native = jest.fn()
        .mockResolvedValueOnce({ jobs: [{ id: 'test-job', booking }] })
        .mockResolvedValueOnce({ ok: true });
    const create = jest.fn();
    global.chrome = {
        runtime: { sendNativeMessage: native },
        tabs: {
            query: jest.fn().mockResolvedValue([{ url: 'https://go.mediaocean.com/campaign-management/?_ctx=test-context' }]),
            create,
        },
    };
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [row] });
    try {
        await pollAutomaticPoChecks();
        expect(native.mock.calls).toEqual([
            ['net.insidemedia.abw.po_check', { action: 'poll' }],
            ['net.insidemedia.abw.po_check', { action: 'complete', id: 'test-job', status: 'checked' }],
        ]);
        expect(create).not.toHaveBeenCalled();
    } finally {
        global.chrome = previousChrome;
        global.fetch = previousFetch;
    }
});

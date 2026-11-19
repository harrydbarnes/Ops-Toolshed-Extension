const { JSDOM } = require('jsdom');
const path = require('path');
const { readScript } = require('./helpers/read-script');

test('finance log renders timing bounds and treats stored identifiers as text', async () => {
    const dom = new JSDOM('<div id="finance-timing-log"></div>', { runScripts: 'outside-only' });
    try {
        dom.window.chrome = { storage: {
            local: { get: async () => ({ financeTimingLog: [{ campaignId: '<b>CP</b>', month: '2026-11',
                placement: 'P1', status: 'SUCCESSFUL', firstPendingAt: 1000, lastPendingAt: 61000,
                lastCheckedAt: 121000, resultObservedAt: 121000 }] }) },
            onChanged: { addListener: () => {} }
        } };
        dom.window.eval(readScript(path.resolve(__dirname, '../toolshed-finance-log.js')));
        dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
        await new Promise(resolve => setTimeout(resolve, 0));
        const output = dom.window.document.getElementById('finance-timing-log');
        expect(output.textContent).toContain('last Pending');
        expect(output.textContent).toContain('first-to-result observation 2 min');
        expect(output.textContent).toContain('<b>CP</b>');
        expect(output.querySelector('b')).toBeNull();
    } finally { dom.window.close(); }
});

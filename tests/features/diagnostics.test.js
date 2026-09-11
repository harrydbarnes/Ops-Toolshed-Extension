const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const script = fs.readFileSync(
    path.resolve(__dirname, '../../features/diagnostics.js'),
    'utf8'
);

function setup(enabled = false) {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
        url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#ptb-mod=buy&campaign-id=private-id',
        runScripts: 'outside-only'
    });
    const listeners = [];
    dom.window.chrome = {
        runtime: { sendMessage: jest.fn().mockResolvedValue({ status: 'success' }) },
        storage: {
            sync: { get: jest.fn((_defaults, callback) => callback({ diagnosticsModeEnabled: enabled })) },
            onChanged: { addListener: jest.fn(listener => listeners.push(listener)) }
        }
    };
    dom.window.eval(script);
    return { dom, window: dom.window, listeners };
}

describe('Diagnostics content bridge', () => {
    test('does not send events while disabled', () => {
        const page = setup(false);

        page.window.opsDiagnostics.record({ source: 'test', operation: 'hidden' });

        expect(page.window.chrome.runtime.sendMessage).not.toHaveBeenCalled();
        page.dom.window.close();
    });

    test('sends the event, coarse Prisma area, and the current campaign ID when enabled', () => {
        const page = setup(true);

        page.window.opsDiagnostics.record({ source: 'test', operation: 'run', outcome: 'success' });

        expect(page.window.chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'RECORD_DIAGNOSTIC_EVENT',
            event: {
                source: 'test',
                operation: 'run',
                outcome: 'success',
                area: 'buy',
                campaignId: 'private-id'
            }
        });
        page.dom.window.close();
    });

    test('reacts to the Settings toggle and rate-limits hot lifecycle events', () => {
        const page = setup(false);
        const now = jest.spyOn(page.window.Date, 'now')
            .mockReturnValueOnce(1000)
            .mockReturnValueOnce(1200)
            .mockReturnValueOnce(2200);

        page.listeners[0]({ diagnosticsModeEnabled: { newValue: true } }, 'sync');
        page.window.opsDiagnostics.recordRateLimited('reconcile', { source: 'lifecycle', operation: 'reconcile' });
        page.window.opsDiagnostics.recordRateLimited('reconcile', { source: 'lifecycle', operation: 'reconcile' });
        page.window.opsDiagnostics.recordRateLimited('reconcile', { source: 'lifecycle', operation: 'reconcile' });

        expect(page.window.chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
        now.mockRestore();
        page.dom.window.close();
    });

    test('records allow-listed extension actions without reading their content', () => {
        const page = setup(true);
        const button = page.window.document.createElement('button');
        button.className = 'order-id-copy-btn';
        button.textContent = 'Sensitive order reference';
        page.window.document.body.appendChild(button);

        button.click();

        const diagnosticMessage = page.window.chrome.runtime.sendMessage.mock.calls[0][0];
        expect(diagnosticMessage.event).toMatchObject({
            source: 'order-id-copy',
            operation: 'copy',
            outcome: 'invoked',
            area: 'buy',
            campaignId: 'private-id',
            trigger: 'user-action'
        });
        expect(JSON.stringify(diagnosticMessage)).not.toContain('Sensitive order reference');
        page.dom.window.close();
    });
});

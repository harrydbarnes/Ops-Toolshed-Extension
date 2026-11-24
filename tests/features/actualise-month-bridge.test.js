const { readScript } = require('../helpers/read-script');
const path = require('path');
const { JSDOM } = require('jsdom');

const bridgeCode = readScript(path.resolve(__dirname, '../../features/actualise-month-bridge.js'));

describe('Actualise month bridge', () => {
    test('publishes the requested and returned month from the native Actualise XHR', async () => {
        const response = {
            fields: [
                { id: 'month', key: 'Nov 25', hidden: true }
            ],
            nodes: [{
                fields: [{ id: 'month', value: '2025-11', key: 'Nov 25' }],
                nodes: [{
                    fields: [
                        { id: 'month', value: '2025-11', key: 'Nov 25' },
                        { id: 'placementNumber', value: 'P123' },
                        { id: 'buyStatus', value: 'SUCCESSFUL' },
                        { id: 'buySerialNumber', value: 'D123' }
                    ]
                }]
            }]
        };
        const dom = new JSDOM('<!doctype html><html><body></body></html>', {
            runScripts: 'dangerously',
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP123&ptb-ctx=actualize&route=actualize&mos=2025-11-01'
        });
        try {
            class FakeXHR extends dom.window.EventTarget {
                open(method, url) {
                    this.method = method;
                    this.url = url;
                }

                send(body) {
                    this.body = body;
                    this.status = 200;
                    this.responseText = JSON.stringify(response);
                    this.dispatchEvent(new this.ownerDocument.defaultView.Event('load'));
                }
            }

            FakeXHR.prototype.ownerDocument = dom.window.document;
            dom.window.XMLHttpRequest = FakeXHR;
            dom.window.document.documentElement.setAttribute('data-ops-toolshed-features-active', 'true');
            const messages = [];
            dom.window.addEventListener('message', event => messages.push(event.data));
            const nextBridgeMessage = () => new Promise((resolve, reject) => {
                const onMessage = event => {
                    if (event.data?.type !== 'ops-toolshed-actualise-month-data') return;
                    dom.window.removeEventListener('message', onMessage);
                    dom.window.clearTimeout(timeout);
                    resolve();
                };
                const timeout = dom.window.setTimeout(() => {
                    dom.window.removeEventListener('message', onMessage);
                    reject(new Error('Actualise bridge did not publish a message'));
                }, 1000);
                dom.window.addEventListener('message', onMessage);
            });
            dom.window.eval(bridgeCode);

            const xhr = new dom.window.XMLHttpRequest();
            xhr.open(
                'PUT',
                'https://groupmuk-prisma.mediaocean.com/campaign-service/secure/campaign/1/queryservice/mediaplan/hybrid/actualize'
            );
            const firstMessage = nextBridgeMessage();
            xhr.send(JSON.stringify({
                type: 'prismaDetailActualizeReconcile',
                filter: {
                    op: 'and',
                    filters: [{
                        fields: [{ id: 'month', value: '2025-11', op: 'eq' }]
                    }]
                }
            }));
            await firstMessage;

            expect(messages).toContainEqual(expect.objectContaining({
                source: 'ops-toolshed-actualise-month-bridge',
                type: 'ops-toolshed-actualise-month-data',
                detail: expect.objectContaining({
                    campaignId: 'CP123',
                    requestMonth: '2025-11',
                    responseMonths: ['2025-11'],
                    buyStatusRows: [{ placementNumber: 'P123', buyStatus: 'SUCCESSFUL' }]
                })
            }));

            const replayMessage = nextBridgeMessage();
            dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
                source: dom.window,
                origin: dom.window.location.origin,
                data: {
                    source: 'ops-toolshed-actualise-month-bridge',
                    type: 'ops-toolshed-actualise-month-request-latest'
                }
            }));
            await replayMessage;
            expect(messages.filter(message => message?.type === 'ops-toolshed-actualise-month-data'))
                .toHaveLength(2);
        } finally {
            dom.window.close();
        }
    });

    test('does not publish unrelated requests', () => {
        const dom = new JSDOM('<!doctype html><html><body></body></html>', {
            runScripts: 'dangerously',
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/'
        });
        const send = jest.fn();
        dom.window.XMLHttpRequest = class {
            open() {}
            send(...args) { send(...args); }
        };
        const messages = [];
        dom.window.addEventListener('message', event => messages.push(event.data));
        dom.window.eval(bridgeCode);

        const xhr = new dom.window.XMLHttpRequest();
        xhr.open('GET', 'https://groupmuk-prisma.mediaocean.com/not-actualise');
        xhr.send('');

        expect(send).toHaveBeenCalledWith('');
        expect(messages).toHaveLength(0);
        dom.window.close();
    });

    test('does not parse a non-Actualise request body', async () => {
        const dom = new JSDOM('<!doctype html><html><body></body></html>', {
            runScripts: 'dangerously',
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/'
        });
        const send = jest.fn();
        dom.window.XMLHttpRequest = class {
            open() {}
            send(...args) { send(...args); }
        };
        dom.window.fetch = jest.fn().mockResolvedValue({});
        const parseSpy = jest.spyOn(dom.window.JSON, 'parse');
        dom.window.eval(bridgeCode);

        const payload = JSON.stringify({ placements: Array.from({ length: 1000 }, (_, id) => ({ id })) });
        const xhr = new dom.window.XMLHttpRequest();
        xhr.open('POST', 'https://groupmuk-prisma.mediaocean.com/campaign-service/secure/campaign/1/buy');
        xhr.send(payload);
        await dom.window.fetch('https://groupmuk-prisma.mediaocean.com/campaign-service/secure/campaign/1/buy', {
            method: 'POST',
            body: payload
        });

        expect(send).toHaveBeenCalledWith(payload);
        expect(parseSpy).not.toHaveBeenCalled();
        dom.window.close();
    });

    test('prevents unhandled rejection errors from non-Actualise host page fetch failures', async () => {
        const dom = new JSDOM('<!doctype html><html><body></body></html>', {
            runScripts: 'dangerously',
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP123&ptb-ctx=actualize&route=actualize&mos=2025-11-01'
        });
        dom.window.document.documentElement.setAttribute('data-ops-toolshed-features-active', 'true');
        const originalFetch = jest.fn(() => {
            const err = new dom.window.TypeError('Failed to fetch');
            err.stack = 'TypeError: Failed to fetch\n    at wrappedFetch (features/actualise-month-bridge.js:235:36)';
            return Promise.reject(err);
        });
        dom.window.fetch = originalFetch;

        dom.window.eval(bridgeCode);

        // Call a non-Actualise fetch that rejects
        const promise = dom.window.fetch('https://some-telemetry.mediaocean.com/ping');
        await expect(promise).rejects.toThrow('Failed to fetch');

        // Dispatch unhandledrejection event to verify bridge cancels it
        const unhandled = new dom.window.Event('unhandledrejection', { cancelable: true });
        const err = new dom.window.TypeError('Failed to fetch');
        err.stack = 'TypeError: Failed to fetch\n    at wrappedFetch (features/actualise-month-bridge.js:235:36)';
        unhandled.reason = err;
        dom.window.dispatchEvent(unhandled);

        expect(unhandled.defaultPrevented).toBe(true);
        dom.window.close();
    });

    test('captures Blob CSV downloads when export capture is active and restores originals on stop', async () => {
        const dom = new JSDOM('<!doctype html><html><body></body></html>', {
            runScripts: 'dangerously',
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP37TC2&ptb-ctx=actualize&route=actualize&mos=2026-01-01'
        });
        try {
            dom.window.document.documentElement.setAttribute('data-ops-toolshed-features-active', 'true');
            const originalAnchorClick = jest.fn();
            dom.window.HTMLAnchorElement.prototype.click = originalAnchorClick;
            const fakeBlobUrl = 'blob:https://groupmuk-prisma.mediaocean.com/11111111';
            const originalCreateObjectURL = jest.fn(() => fakeBlobUrl);
            dom.window.URL.createObjectURL = originalCreateObjectURL;

            const capturedMessages = [];
            dom.window.addEventListener('message', event => {
                if (event.data?.type === 'ops-toolshed-actualise-export-captured') {
                    capturedMessages.push(event.data);
                }
            });

            dom.window.eval(bridgeCode);

            dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
                source: dom.window,
                origin: dom.window.location.origin,
                data: {
                    source: 'ops-toolshed-actualise-month-bridge',
                    type: 'ops-toolshed-actualise-export-capture-start',
                    detail: { token: 'run-1' }
                }
            }));

            const csvBlob = new dom.window.Blob(
                ['D Number,Start Date\r\nD123456,2026-01-01\r\n'],
                { type: 'text/csv' }
            );
            const blobUrl = dom.window.URL.createObjectURL(csvBlob);
            const link = dom.window.document.createElement('a');
            link.href = blobUrl;
            link.download = 'Actualization-CP37TC2-HBARN-2026-01.csv';
            link.click();

            await new Promise(resolve => dom.window.setTimeout(resolve, 25));

            expect(originalAnchorClick).not.toHaveBeenCalled();
            expect(capturedMessages).toEqual([{
                source: 'ops-toolshed-actualise-month-bridge',
                type: 'ops-toolshed-actualise-export-captured',
                detail: expect.objectContaining({
                    token: 'run-1',
                    name: 'Actualization-CP37TC2-HBARN-2026-01.csv',
                    text: 'D Number,Start Date\r\nD123456,2026-01-01\r\n'
                })
            }]);

            dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
                source: dom.window,
                origin: dom.window.location.origin,
                data: {
                    source: 'ops-toolshed-actualise-month-bridge',
                    type: 'ops-toolshed-actualise-export-capture-stop',
                    detail: { token: 'run-1' }
                }
            }));

            expect(dom.window.HTMLAnchorElement.prototype.click).toBe(originalAnchorClick);
            expect(dom.window.URL.createObjectURL).toBe(originalCreateObjectURL);

            link.click();
            expect(originalAnchorClick).toHaveBeenCalledTimes(1);
        } finally {
            dom.window.close();
        }
    });
});

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const bridgeCode = fs.readFileSync(
    path.resolve(__dirname, '../../features/actualise-month-bridge.js'),
    'utf8'
);

describe('Actualise month bridge', () => {
    test('publishes the requested and returned month from the native Actualise XHR', async () => {
        const response = {
            fields: [
                { id: 'month', key: 'Nov 25', hidden: true }
            ],
            nodes: [{
                fields: [
                    { id: 'month', value: '2025-11', key: 'Nov 25' }
                ]
            }]
        };
        const dom = new JSDOM('<!doctype html><html><body></body></html>', {
            runScripts: 'dangerously',
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP123&ptb-ctx=actualize&route=actualize&mos=2025-11-01'
        });
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
        const messages = [];
        dom.window.addEventListener('message', event => messages.push(event.data));
        dom.window.eval(bridgeCode);

        const xhr = new dom.window.XMLHttpRequest();
        xhr.open(
            'PUT',
            'https://groupmuk-prisma.mediaocean.com/campaign-service/secure/campaign/1/queryservice/mediaplan/hybrid/actualize'
        );
        xhr.send(JSON.stringify({
            type: 'prismaDetailActualizeReconcile',
            filter: {
                op: 'and',
                filters: [{
                    fields: [{ id: 'month', value: '2025-11', op: 'eq' }]
                }]
            }
        }));
        await new Promise(resolve => dom.window.setTimeout(resolve, 0));

        expect(messages).toContainEqual(expect.objectContaining({
            source: 'ops-toolshed-actualise-month-bridge',
            type: 'ops-toolshed-actualise-month-data',
            detail: expect.objectContaining({
                campaignId: 'CP123',
                requestMonth: '2025-11',
                responseMonths: ['2025-11']
            })
        }));

        dom.window.dispatchEvent(new dom.window.MessageEvent('message', {
            source: dom.window,
            origin: dom.window.location.origin,
            data: {
                source: 'ops-toolshed-actualise-month-bridge',
                type: 'ops-toolshed-actualise-month-request-latest'
            }
        }));
        await new Promise(resolve => dom.window.setTimeout(resolve, 0));
        expect(messages.filter(message => message?.type === 'ops-toolshed-actualise-month-data'))
            .toHaveLength(2);
        dom.window.close();
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
});

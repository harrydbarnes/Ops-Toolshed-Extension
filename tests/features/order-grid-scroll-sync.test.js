const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const script = fs.readFileSync(
    path.resolve(__dirname, '../../features/order-grid-scroll-sync.js'),
    'utf8'
);

function setup({
    enabled = true,
    url = 'https://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP123&ptb-ctx=orderSummary&showOrders=true'
} = {}) {
    const dom = new JSDOM(`<!doctype html><html><body>
        <div class="ht-wrapper handsontable">
            <div class="ht_master"><div class="wtHolder"></div></div>
            <div class="ht_clone_top"><div class="wtHolder"></div></div>
        </div>
    </body></html>`, { runScripts: 'outside-only', url });
    const storageListeners = [];
    dom.window.chrome = {
        storage: {
            sync: {
                get: jest.fn((defaults, callback) => callback({
                    ...defaults,
                    orderGridScrollSyncEnabled: enabled
                }))
            },
            onChanged: {
                addListener: jest.fn(listener => storageListeners.push(listener))
            }
        }
    };
    dom.window.eval(script);
    return { dom, storageListeners };
}

describe('Order grid header scroll synchronization', () => {
    test('aligns the cloned header to the Order Summary body position', () => {
        const { dom } = setup();
        const master = dom.window.document.querySelector('.ht_master > .wtHolder');
        const header = dom.window.document.querySelector('.ht_clone_top > .wtHolder');
        master.scrollLeft = 275;

        expect(dom.window.orderGridScrollSyncFeature.syncAll()).toBe(1);
        expect(header.scrollLeft).toBe(275);
        dom.window.close();
    });

    test('keeps the cloned header aligned while the body scrolls', () => {
        const { dom } = setup();
        const master = dom.window.document.querySelector('.ht_master > .wtHolder');
        const header = dom.window.document.querySelector('.ht_clone_top > .wtHolder');
        dom.window.orderGridScrollSyncFeature.initialize();

        master.scrollLeft = 410;
        master.dispatchEvent(new dom.window.Event('scroll'));

        expect(header.scrollLeft).toBe(410);
        dom.window.close();
    });

    test('does not alter the same grid outside an Order Summary route', () => {
        const { dom } = setup({
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP123&ptb-mod=buy&ptb-ctx=digital'
        });
        const master = dom.window.document.querySelector('.ht_master > .wtHolder');
        const header = dom.window.document.querySelector('.ht_clone_top > .wtHolder');
        master.scrollLeft = 190;

        expect(dom.window.orderGridScrollSyncFeature.syncAll()).toBe(0);
        expect(header.scrollLeft).toBe(0);
        dom.window.close();
    });

    test('supports the legacy Orders application route', () => {
        const { dom } = setup({
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#osPspId=prsm-cm-ord&campaign-id=CP123'
        });
        const master = dom.window.document.querySelector('.ht_master > .wtHolder');
        const header = dom.window.document.querySelector('.ht_clone_top > .wtHolder');
        master.scrollLeft = 125;

        dom.window.orderGridScrollSyncFeature.syncAll();

        expect(header.scrollLeft).toBe(125);
        dom.window.close();
    });

    test('does not attach or synchronize while the Fixes setting is disabled', () => {
        const { dom, storageListeners } = setup({ enabled: false });
        const master = dom.window.document.querySelector('.ht_master > .wtHolder');
        const header = dom.window.document.querySelector('.ht_clone_top > .wtHolder');
        dom.window.orderGridScrollSyncFeature.initialize();

        master.scrollLeft = 220;
        master.dispatchEvent(new dom.window.Event('scroll'));
        expect(header.scrollLeft).toBe(0);

        storageListeners[0]({
            orderGridScrollSyncEnabled: { oldValue: false, newValue: true }
        }, 'sync');
        expect(header.scrollLeft).toBe(220);
        dom.window.close();
    });
});

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const featureScript = fs.readFileSync(
    path.resolve(__dirname, '../../features/campaign-tab-title.js'),
    'utf8'
);

const campaignUrl = 'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=12345';

function setup({ url = campaignUrl, enabled = true, title = 'Prisma Media - CRUK RFL' } = {}) {
    const dom = new JSDOM(`<!doctype html><html><head><title>${title}</title></head><body></body></html>`, {
        url,
        runScripts: 'dangerously'
    });
    const storageListeners = [];
    dom.window.chrome = {
        storage: {
            sync: {
                get: jest.fn((key, callback) => callback({ campaignTabTitleEnabled: enabled }))
            },
            onChanged: {
                addListener: jest.fn(listener => storageListeners.push(listener))
            }
        }
    };
    dom.window.eval(featureScript);
    dom.window.campaignTabTitleFeature.initialize();
    return { dom, window: dom.window, storageListeners };
}

describe('campaign tab title', () => {
    let dom;

    afterEach(() => {
        dom?.window.close();
    });

    test('uses only the campaign name on a Prisma campaign route', () => {
        ({ dom } = setup());
        expect(dom.window.document.title).toBe('CRUK RFL');
    });

    test('does not alter titles outside a specific campaign', () => {
        ({ dom } = setup({
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy'
        }));
        expect(dom.window.document.title).toBe('Prisma Media - CRUK RFL');
    });

    test('cleans later Prisma title updates and restores the full title when disabled', async () => {
        const environment = setup();
        dom = environment.dom;
        dom.window.document.title = 'Prisma Media - New Campaign Name';
        await new Promise(resolve => dom.window.setTimeout(resolve, 0));
        expect(dom.window.document.title).toBe('New Campaign Name');

        environment.storageListeners[0]({
            campaignTabTitleEnabled: { oldValue: true, newValue: false }
        }, 'sync');
        expect(dom.window.document.title).toBe('Prisma Media - New Campaign Name');
    });

    test('uses the delayed campaign header when refreshed tabs retain Prisma generic title', async () => {
        ({ dom } = setup({ title: 'prsm-cm-plan-to-buy' }));

        const pageHeader = dom.window.document.createElement('div');
        pageHeader.className = 'mo-page-header';
        pageHeader.innerHTML = `
            <span class="mo-campaign-name-wrapper">CRUK RFL Campaign</span>
            <span>12345</span>
        `;
        dom.window.document.body.appendChild(pageHeader);
        await new Promise(resolve => dom.window.setTimeout(resolve, 0));

        expect(dom.window.document.title).toBe('CRUK RFL Campaign');
    });

    test('uses a campaign name that is exactly 99 characters long', async () => {
        ({ dom } = setup({ title: 'prsm-cm-plan-to-buy' }));
        const campaignName = 'A'.repeat(99);
        const pageHeader = dom.window.document.createElement('div');
        pageHeader.className = 'mo-page-header';
        pageHeader.innerHTML = `<span class="mo-campaign-name-wrapper">${campaignName}</span><span>12345</span>`;
        dom.window.document.body.appendChild(pageHeader);
        await new Promise(resolve => dom.window.setTimeout(resolve, 0));

        expect(dom.window.document.title).toBe(campaignName);
    });

    test('leaves Prisma title untouched when the campaign name exceeds 99 characters', async () => {
        ({ dom } = setup({ title: 'prsm-cm-plan-to-buy' }));
        const pageHeader = dom.window.document.createElement('div');
        pageHeader.className = 'mo-page-header';
        pageHeader.innerHTML = `<span class="mo-campaign-name-wrapper">${'B'.repeat(100)}</span><span>12345</span>`;
        dom.window.document.body.appendChild(pageHeader);
        await new Promise(resolve => dom.window.setTimeout(resolve, 0));

        expect(dom.window.document.title).toBe('prsm-cm-plan-to-buy');
    });

    test('does not watch every mutation in the document head', () => {
        expect(featureScript).toContain("headObserver.observe(document.head, { childList: true });");
        expect(featureScript).not.toContain('observer.observe(document.head, { childList: true, subtree: true, characterData: true });');
    });
});

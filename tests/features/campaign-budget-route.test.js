const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const campaignScript = fs.readFileSync(
    path.resolve(__dirname, '../../features/campaign.js'),
    'utf8'
);

function createCampaignPage(url, settings = {}) {
    const dom = new JSDOM(`<!doctype html>
        <html>
            <head></head>
            <body>
                <div id="campaign-budget-overview-container">
                    <div class="gDndZofhX67JYdRMGJEFTw=="><div></div></div>
                </div>
            </body>
        </html>`, {
        url,
        runScripts: 'dangerously'
    });

    dom.window.chrome = {
        runtime: { id: 'test-extension', lastError: null },
        storage: {
            sync: {
                get: (_keys, callback) => callback({
                    optimisedNewNavEnabled: true,
                    ...settings
                })
            },
            onChanged: { addListener: () => {} }
        }
    };
    dom.window.eval(campaignScript);
    return dom;
}

describe('campaign budget optimisation route scope', () => {
    test('does not inject budget styles on the campaign dashboard', () => {
        const dom = createCampaignPage(
            'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=cm-dashboard&route=campaigns'
        );

        dom.window.campaignFeature.handleCampaignNavigationOptimisation();

        expect(dom.window.document.getElementById('optimised-budget-styles')).toBeNull();
        dom.window.close();
    });

    test('removes campaign budget styles after SPA navigation to the dashboard', () => {
        const dom = createCampaignPage(
            'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=prsm-cm-buy&campaign-id=CP12345&route=actualize'
        );

        dom.window.campaignFeature.handleCampaignNavigationOptimisation();
        expect(dom.window.document.getElementById('optimised-budget-styles')).not.toBeNull();

        dom.window.history.replaceState(
            {},
            '',
            '#osAppId=prsm-cm-spa&osPspId=cm-dashboard&route=campaigns'
        );
        dom.window.campaignFeature.handleCampaignNavigationOptimisation();

        expect(dom.window.document.getElementById('optimised-budget-styles')).toBeNull();
        dom.window.close();
    });

    test('removes stale budget styles even when navigation optimisation is disabled', () => {
        const dom = createCampaignPage(
            'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=cm-dashboard&route=campaigns',
            { optimisedNewNavEnabled: false }
        );
        const staleStyle = dom.window.document.createElement('style');
        staleStyle.id = 'optimised-budget-styles';
        dom.window.document.head.appendChild(staleStyle);

        dom.window.campaignFeature.handleCampaignNavigationOptimisation();

        expect(dom.window.document.getElementById('optimised-budget-styles')).toBeNull();
        dom.window.close();
    });
});

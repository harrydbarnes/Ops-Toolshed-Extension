const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const featureScript = fs.readFileSync(
    path.resolve(__dirname, '../../features/campaign.js'),
    'utf8'
);

function createPage() {
    const dom = new JSDOM(`<!doctype html><html><head></head><body>
        <div id="native-header">
            <div slot="right"><div class="workflow-widget-wrapper">Approvers</div></div>
        </div>
        <div class="p2b-navbar-wrapper"></div>
        <div class="mo-page-header">
            <mo-popover class="mo-campaign-name-popover">
                <mo-text class="mo-campaign-name-wrapper" contenteditable="true">Test Campaign Name</mo-text>
            </mo-popover>
            <div class="mo-header-right-section">
                <mo-toolbar-item id="campaign-menu-icon">Cog</mo-toolbar-item>
                <div class="buy-details-wrapper">Campaign dates and buy details</div>
            </div>
        </div>
    </body></html>`, {
        url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=prsm-cm-buy&route=online',
        runScripts: 'dangerously'
    });

    dom.window.chrome = {
        runtime: {
            id: 'test-extension',
            lastError: null
        },
        storage: {
            sync: {
                get: (_keys, callback) => callback({
                    campaignNavStyle: 'new',
                    optimisedNewNavEnabled: true
                })
            },
            onChanged: { addListener: () => {} }
        }
    };
    dom.window.eval(featureScript);
    return dom;
}

describe('campaign navigation UI optimisation', () => {
    test('keeps the approver workflow slot visible while Actualise removes the navbar', () => {
        const dom = createPage();
        const { document } = dom.window;

        dom.window.campaignFeature.handleCampaignNavigationOptimisation();
        const workflowSlot = document.querySelector('div[slot="right"]');
        expect(workflowSlot.parentElement).toBe(document.querySelector('.p2b-navbar-wrapper'));

        document.querySelector('.p2b-navbar-wrapper').remove();
        const actualiseMonthRow = document.createElement('div');
        actualiseMonthRow.id = 'month-filter-toolbar';
        actualiseMonthRow.innerHTML = '<div id="mos-paginator"><a>Jun 26</a></div>';
        document.body.prepend(actualiseMonthRow);
        dom.window.history.replaceState({}, '', '#ptb-ctx=actualize&route=actualize');

        dom.window.campaignFeature.handleCampaignNavigationOptimisation();

        expect(actualiseMonthRow.contains(workflowSlot)).toBe(true);
        expect(actualiseMonthRow.classList.contains('toolshed-actualise-month-row')).toBe(true);
        expect(workflowSlot.classList.contains('actualise-workflow-slot')).toBe(true);
        expect(actualiseMonthRow.textContent).toContain('Approvers');

        const restoredNavbar = document.createElement('div');
        restoredNavbar.className = 'p2b-navbar-wrapper';
        document.body.prepend(restoredNavbar);
        dom.window.history.replaceState({}, '', '#ptb-ctx=digital&route=online');
        dom.window.campaignFeature.handleCampaignNavigationOptimisation();

        expect(restoredNavbar.contains(workflowSlot)).toBe(true);
        expect(workflowSlot.classList.contains('actualise-workflow-slot')).toBe(false);
        dom.window.close();
    });

    test('places extracted actions immediately to the right of the campaign name', () => {
        const dom = createPage();
        const { document } = dom.window;

        dom.window.campaignFeature.handleCampaignNavigationOptimisation();

        const actions = document.getElementById('mo-extracted-actions-toolbar');
        const campaignName = document.querySelector('.mo-campaign-name-popover');
        const nativeCog = document.getElementById('campaign-menu-icon');
        expect(campaignName.nextElementSibling).toBe(actions);
        expect(actions.nextElementSibling).toBe(document.querySelector('.mo-header-right-section'));
        expect(nativeCog.style.display).toBe('none');
        dom.window.close();
    });

});

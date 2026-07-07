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
        runtime: { id: 'test-extension', lastError: null },
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
    Object.defineProperty(dom.window.navigator, 'clipboard', {
        value: { writeText: jest.fn().mockResolvedValue(undefined) },
        configurable: true
    });
    dom.window.eval(featureScript);
    return dom;
}

describe('campaign navigation UI optimisation', () => {
    test('reattaches the approver workflow slot when Actualise replaces the navbar', () => {
        const dom = createPage();
        const { document } = dom.window;

        dom.window.campaignFeature.handleCampaignNavigationOptimisation();
        const workflowSlot = document.querySelector('div[slot="right"]');
        expect(workflowSlot.parentElement).toBe(document.querySelector('.p2b-navbar-wrapper'));

        document.querySelector('.p2b-navbar-wrapper').remove();
        const actualiseNavbar = document.createElement('div');
        actualiseNavbar.className = 'p2b-navbar-wrapper';
        document.body.prepend(actualiseNavbar);

        dom.window.campaignFeature.handleCampaignNavigationOptimisation();

        expect(actualiseNavbar.contains(workflowSlot)).toBe(true);
        expect(actualiseNavbar.textContent).toContain('Approvers');
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

    test('copies the campaign name and shows confirmation when its editable area is clicked', async () => {
        const dom = createPage();
        const { document, navigator } = dom.window;
        dom.window.campaignFeature.handleCampaignNavigationOptimisation();

        document.querySelector('.mo-campaign-name-wrapper').click();
        await Promise.resolve();

        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Test Campaign Name');
        const toast = document.getElementById('campaign-name-copy-toast');
        expect(toast.textContent).toBe('Campaign Name Copied to Clipboard!');
        expect(toast.classList.contains('show')).toBe(true);
        dom.window.close();
    });
});

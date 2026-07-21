const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.resolve(__dirname, '../onboarding-tour.html'), 'utf8');
const script = fs.readFileSync(path.resolve(__dirname, '../onboarding-tour.js'), 'utf8');

function setup(settings = {}, startingUrl = 'https://groupmuk-prisma.mediaocean.com/campaign-management/#route=campaigns') {
    const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'chrome-extension://test/onboarding-tour.html' });
    let activeUrl = startingUrl;
    const chrome = {
        runtime: { getURL: jest.fn(file => `chrome-extension://test/${file}`) },
        storage: {
            sync: { get: jest.fn((defaults, callback) => callback({ ...defaults, ...settings })) },
            local: { set: jest.fn() }
        },
        tabs: {
            query: jest.fn(async () => [{ id: 12, url: activeUrl }]),
            sendMessage: jest.fn(async (tabId, message) => ({ status: 'success', found: message.action === 'showOnboardingHighlight' })),
            update: jest.fn(async (tabId, values) => {
                activeUrl = values.url;
                return { id: tabId, url: activeUrl };
            })
        },
        action: { openPopup: jest.fn(async () => {}) },
        sidePanel: { setOptions: jest.fn(async () => {}), close: jest.fn(async () => {}) }
    };
    dom.window.chrome = chrome;
    dom.window.eval(script);
    return { dom, chrome, setActiveUrl: value => { activeUrl = value; } };
}

describe('Onboarding side-panel journey', () => {
    test('builds only the campaign feature groups enabled by the user', async () => {
        const { dom } = setup({
            helpGuidesEnabled: false,
            bannerUsernameEnabled: false,
            swapAccountsEnabled: false,
            rememberAccountSwitchUrlEnabled: false,
            quickCampaignActionsEnabled: false,
            campaignNameQuickCopyEnabled: false,
            campaignHeaderQuickCopyEnabled: false,
            campaignDateShortcutEnabled: false,
            budgetWidgetOptimisedEnabled: false
        });
        await Promise.resolve();
        await Promise.resolve();

        const ids = dom.window.onboardingTourPanel.buildSteps().map(step => step.id);
        expect(ids).not.toContain('help-guides');
        expect(ids).not.toContain('account');
        expect(ids).not.toContain('campaign-details-action');
        expect(ids).toContain('open-campaign');
        expect(ids).toContain('popup-approvers');
        dom.window.close();
    });

    test('waits for a real campaign URL instead of reporting a present page element as missing', async () => {
        jest.useFakeTimers();
        const { dom, setActiveUrl } = setup();
        await Promise.resolve();
        await Promise.resolve();

        dom.window.document.getElementById('tour-next').click();
        await Promise.resolve();
        expect(dom.window.document.getElementById('tour-title').textContent).toContain('Open any campaign');
        expect(dom.window.document.getElementById('tour-status').textContent).not.toContain('not on the current page');

        setActiveUrl('https://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP3GH64&route=online');
        await jest.advanceTimersByTimeAsync(1000);
        expect(dom.window.document.getElementById('tour-title').textContent).not.toContain('Open any campaign');
        dom.window.close();
        jest.useRealTimers();
    });

    test('offers the real extension popup for the separate Approvers and Add Campaign steps', async () => {
        const { dom, chrome } = setup();
        await Promise.resolve();
        await Promise.resolve();

        const popupSteps = dom.window.onboardingTourPanel.buildSteps().filter(step => step.popupAction);
        expect(popupSteps.map(step => step.id)).toEqual(expect.arrayContaining(['popup-approvers', 'add-campaign']));

        dom.window.document.getElementById('tour-popup-action').hidden = false;
        dom.window.document.getElementById('tour-popup-action').click();
        await Promise.resolve();
        expect(chrome.action.openPopup).toHaveBeenCalled();
        dom.window.close();
    });

    test('uses one focused step for each account, campaign and navigation control', async () => {
        const { dom } = setup();
        await Promise.resolve();
        await Promise.resolve();

        const steps = dom.window.onboardingTourPanel.buildSteps();
        const byId = Object.fromEntries(steps.map(step => [step.id, step]));
        expect(byId['switch-accounts'].target).toBe('switchAccounts');
        expect(byId['switch-accounts'].description).toContain('one-click access');
        expect(byId['switch-accounts'].tip).not.toContain('UREL');
        expect(steps.map(step => step.id)).toEqual(expect.arrayContaining([
            'campaign-details-action', 'campaign-copy-action', 'campaign-history-action',
            'campaign-name-copy', 'campaign-id-copy', 'campaign-date-shortcut', 'campaign-budget',
            'orders-navigation', 'actualise-navigation', 'placement-counter'
        ]));
        expect(byId['orders-navigation'].target).toBe('ordersNav');
        expect(byId['actualise-navigation'].target).toBe('actualiseNav');
        expect(byId['placement-counter'].target).toBe('placementGrid');
        expect(byId['open-approver-widget'].mode).toBe('waitForApproverExpanded');
        expect(byId['approver-management'].target).toBe('approverWidgetExpanded');
        expect(byId['campaign-setup'].description).toContain('Wherever you launch Add Campaign');
        dom.window.close();
    });

    test('finishing returns Prisma home, closes the tour and does not open Help Guides', async () => {
        const campaignUrl = 'https://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP3GH64&route=online';
        const { dom, chrome } = setup({}, campaignUrl);
        await Promise.resolve();
        await Promise.resolve();

        await dom.window.onboardingTourPanel.finishTour(false);

        expect(chrome.tabs.update).toHaveBeenCalledWith(12, expect.objectContaining({ url: expect.stringContaining('route=campaigns') }));
        expect(chrome.sidePanel.close).toHaveBeenCalledWith({ tabId: 12 });
        expect(chrome.sidePanel.setOptions).not.toHaveBeenCalled();
        dom.window.close();
    });
});

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const featureScript = fs.readFileSync(
    path.resolve(__dirname, '../../features/campaign.js'),
    'utf8'
);

function createPage(settings = {}) {
    const dom = new JSDOM(`<!doctype html><html><head></head><body>
        <div id="native-header">
            <div slot="right"><div class="workflow-widget-wrapper">Approvers</div></div>
        </div>
        <div class="p2b-navbar-wrapper">
            <a id="p2b-navbar-section-analyze" href="#campaign-id=CP123&ptb-mod=analyze">ANALYSE</a>
        </div>
        <div class="mo-page-header">
            <mo-popover class="mo-campaign-name-popover">
                <mo-text class="mo-campaign-name-wrapper" contenteditable="true">Test Campaign Name</mo-text>
            </mo-popover>
            <div class="mo-header-right-section">
                <mo-text class="mo-date-field-wrapper" data-full-text="(JUN 23 - JUL 20, 2026)">(JUN 23 - JUL 20, 2026)</mo-text>
                <mo-toolbar-item id="campaign-menu-icon">Cog</mo-toolbar-item>
                <div class="buy-details-wrapper">CP3FMRK | D/LB9/2/245</div>
            </div>
        </div>
    </body></html>`, {
        url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=prsm-cm-buy&campaign-id=CP3FMRK&route=online',
        runScripts: 'dangerously'
    });

    dom.window.chrome = {
        runtime: {
            id: 'test-extension',
            lastError: null,
            sendMessage: jest.fn().mockResolvedValue({ status: 'success' })
        },
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
    Object.defineProperty(dom.window.navigator, 'clipboard', {
        value: { writeText: jest.fn().mockResolvedValue(undefined) },
        configurable: true
    });
    dom.window.HTMLCanvasElement.prototype.getContext = () => null;
    dom.window.eval(featureScript);
    return dom;
}

function mockBuyDetailsTextMetrics(dom, buyDetails, beforePipeWidth = 80) {
    const { document } = dom.window;
    const originalCreateElement = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation(tagName => {
        if (tagName !== 'canvas') return originalCreateElement(tagName);
        return {
            getContext: () => ({
                font: '',
                measureText: text => ({ width: text === 'CP3FMRK ' ? beforePipeWidth : text.length * 10 })
            })
        };
    });
    Object.defineProperty(buyDetails, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ left: 100, width: 180, bottom: 70 })
    });
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

    test('moves the replacement workflow slot after Orders empties the previously relocated slot', () => {
        const dom = createPage();
        const { document } = dom.window;
        const navbar = document.querySelector('.p2b-navbar-wrapper');

        dom.window.campaignFeature.handleCampaignNavigationOptimisation();
        const staleSlot = navbar.querySelector('div[slot="right"]');
        staleSlot.replaceChildren();

        const replacementToolbar = document.createElement('mo-toolbar');
        const replacementSlot = document.createElement('div');
        replacementSlot.setAttribute('slot', 'right');
        replacementSlot.innerHTML = '<div class="workflow-widget-wrapper">Approvers</div>';
        replacementToolbar.appendChild(replacementSlot);
        document.body.appendChild(replacementToolbar);

        dom.window.campaignFeature.handleCampaignNavigationOptimisation();

        expect(replacementSlot.parentElement).toBe(navbar);
        expect(replacementSlot.classList.contains('ai-style-change-1')).toBe(true);
        expect(staleSlot.classList.contains('ai-style-change-1')).toBe(false);
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
        const { document, chrome } = dom.window;
        dom.window.campaignFeature.handleCampaignNavigationOptimisation();

        document.querySelector('.mo-campaign-name-wrapper').dispatchEvent(
            new dom.window.MouseEvent('pointerdown', { bubbles: true, composed: true })
        );
        await Promise.resolve();

        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'copyToClipboard',
            text: 'Test Campaign Name'
        });
        const toast = document.getElementById('campaign-name-copy-toast');
        expect(toast.textContent).toBe('Campaign Name Copied to Clipboard!');
        expect(toast.classList.contains('show')).toBe(true);
        dom.window.close();
    });

    test('copies on the first click after Prisma replaces the editable name element', async () => {
        const dom = createPage();
        const { document, chrome } = dom.window;
        const originalName = document.querySelector('.mo-campaign-name-wrapper');
        const replacementName = originalName.cloneNode(true);
        originalName.replaceWith(replacementName);

        replacementName.dispatchEvent(
            new dom.window.MouseEvent('pointerdown', { bubbles: true, composed: true })
        );
        await Promise.resolve();

        expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'copyToClipboard',
            text: 'Test Campaign Name'
        });
        dom.window.close();
    });

    test('copies the Campaign ID from the buy details header', async () => {
        const dom = createPage();
        const { document, chrome } = dom.window;
        const buyDetails = document.querySelector('.buy-details-wrapper');
        mockBuyDetailsTextMetrics(dom, buyDetails);

        dom.window.campaignFeature.handleCampaignNavigationOptimisation();
        expect(buyDetails.innerHTML).toBe('CP3FMRK | D/LB9/2/245');
        buyDetails.dispatchEvent(
            new dom.window.MouseEvent('pointerdown', { bubbles: true, composed: true, clientX: 120 })
        );
        await Promise.resolve();

        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'copyToClipboard',
            text: 'CP3FMRK'
        });
        const toast = document.getElementById('campaign-name-copy-toast');
        expect(toast.textContent).toBe('Campaign ID Copied to Clipboard!');
        expect(toast.style.left).toBe('140px');
        dom.window.close();
    });

    test('copies the Campaign ID when clicking the right side of its text before the pipe', async () => {
        const dom = createPage();
        const { document, chrome } = dom.window;
        const buyDetails = document.querySelector('.buy-details-wrapper');
        mockBuyDetailsTextMetrics(dom, buyDetails, 110);

        dom.window.campaignFeature.handleCampaignNavigationOptimisation();
        buyDetails.dispatchEvent(
            new dom.window.MouseEvent('pointerdown', { bubbles: true, composed: true, clientX: 190, clientY: 50 })
        );
        await Promise.resolve();

        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'copyToClipboard',
            text: 'CP3FMRK'
        });
        dom.window.close();
    });

    test('copies CL/PR/CA from the buy details header without D or P prefix', async () => {
        const dom = createPage();
        const { document, chrome } = dom.window;
        const buyDetails = document.querySelector('.buy-details-wrapper');
        mockBuyDetailsTextMetrics(dom, buyDetails);

        dom.window.campaignFeature.handleCampaignNavigationOptimisation();
        expect(buyDetails.innerHTML).toBe('CP3FMRK | D/LB9/2/245');
        buyDetails.dispatchEvent(
            new dom.window.MouseEvent('pointerdown', { bubbles: true, composed: true, clientX: 260 })
        );
        await Promise.resolve();

        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'copyToClipboard',
            text: 'LB9/2/245'
        });
        const toast = document.getElementById('campaign-name-copy-toast');
        expect(toast.textContent).toBe('CL/PR/CA Copied to Clipboard!');
        expect(toast.style.left).toBe('230px');

        chrome.runtime.sendMessage.mockClear();
        buyDetails.textContent = 'CP3FMRK | P/LB9/2/245';
        dom.window.campaignFeature.handleCampaignNavigationOptimisation();
        expect(buyDetails.innerHTML).toBe('CP3FMRK | P/LB9/2/245');
        buyDetails.dispatchEvent(
            new dom.window.MouseEvent('pointerdown', { bubbles: true, composed: true, clientX: 260 })
        );
        await Promise.resolve();

        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'copyToClipboard',
            text: 'LB9/2/245'
        });
        dom.window.close();
    });

    test('opens Campaign details and focuses Basic when campaign dates are clicked', () => {
        const dom = createPage();
        const { document } = dom.window;
        const dates = document.querySelector('.mo-date-field-wrapper');
        const basic = document.createElement('div');
        basic.className = 'well editable';
        basic.textContent = 'Basic Name Start and end Advertiser';
        const basicClick = jest.fn();
        const basicMouseDownEvents = [];
        basic.addEventListener('mousedown', event => {
            basicMouseDownEvents.push({ clientX: event.clientX, clientY: event.clientY });
        });
        basic.click = basicClick;
        basic.scrollIntoView = jest.fn();
        const editIcon = document.createElement('mo-icon');
        editIcon.id = 'campaign-details-basics-pencil-icon';
        editIcon.setAttribute('name', 'edit');
        editIcon.setAttribute('role', 'button');
        const editClick = jest.fn();
        editIcon.click = editClick;
        const flight = document.createElement('td');
        flight.id = 'campaign-details-flight';
        flight.textContent = '23/06/2026 - 20/07/2026';
        basic.appendChild(editIcon);
        basic.appendChild(flight);
        Object.defineProperty(basic, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ left: 10, top: 120, width: 900, height: 240, bottom: 360 })
        });
        dom.window.setTimeout = callback => {
            callback();
            return 0;
        };
        const dispatchedWindowEvents = [];
        const originalDispatchEvent = dom.window.dispatchEvent.bind(dom.window);
        jest.spyOn(dom.window, 'dispatchEvent').mockImplementation(event => {
            dispatchedWindowEvents.push(event.type);
            return originalDispatchEvent(event);
        });

        dom.window.campaignFeature.handleCampaignNavigationOptimisation();
        document.body.appendChild(basic);
        dates.dispatchEvent(
            new dom.window.MouseEvent('pointerdown', { bubbles: true, composed: true })
        );

        expect(dom.window.location.href).toContain('osModalId=prsm-cm-cmpdtls');
        expect(dispatchedWindowEvents).toEqual(
            expect.arrayContaining(['hashchange', 'popstate'])
        );
        expect(basic.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
        expect(basicClick).toHaveBeenCalled();
        expect(basicMouseDownEvents).toEqual(
            expect.arrayContaining([{ clientX: 80, clientY: 182 }])
        );
        expect(editClick).not.toHaveBeenCalled();
        dom.window.close();
    });

    test('does not open Campaign details from campaign dates when the shortcut is disabled', () => {
        const dom = createPage({ campaignDateShortcutEnabled: false });
        const { document } = dom.window;
        const dates = document.querySelector('.mo-date-field-wrapper');

        dom.window.campaignFeature.handleCampaignNavigationOptimisation();
        dates.dispatchEvent(
            new dom.window.MouseEvent('pointerdown', { bubbles: true, composed: true })
        );

        expect(dom.window.location.href).not.toContain('osModalId=prsm-cm-cmpdtls');
        dom.window.close();
    });

    test('respects individually disabled navigation enhancements', async () => {
        const dom = createPage({
            ordersShortcutEnabled: false,
            approverWidgetPlacementEnabled: false,
            quickCampaignActionsEnabled: false,
            campaignNameQuickCopyEnabled: false,
            campaignHeaderQuickCopyEnabled: false
        });
        const { document, chrome } = dom.window;
        const buyDetails = document.querySelector('.buy-details-wrapper');
        mockBuyDetailsTextMetrics(dom, buyDetails);

        dom.window.campaignFeature.handleCampaignNavigationOptimisation();
        document.querySelector('.mo-campaign-name-wrapper').dispatchEvent(
            new dom.window.MouseEvent('pointerdown', { bubbles: true, composed: true })
        );
        buyDetails.dispatchEvent(
            new dom.window.MouseEvent('pointerdown', { bubbles: true, composed: true, clientX: 120 })
        );
        await Promise.resolve();

        expect(document.getElementById('p2b-navbar-section-orders')).toBeNull();
        expect(document.getElementById('mo-extracted-actions-toolbar')).toBeNull();
        expect(document.querySelector('.buy-details-wrapper').innerHTML).toBe('CP3FMRK | D/LB9/2/245');
        expect(document.querySelector('div[slot="right"]').parentElement.id).toBe('native-header');
        expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
        dom.window.close();
    });
});

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const featureScript = fs.readFileSync(
    path.resolve(__dirname, '../../features/campaign.js'),
    'utf8'
);
const campaignDetailsFocusScript = fs.readFileSync(
    path.resolve(__dirname, '../../features/campaign-details-focus.js'),
    'utf8'
);

function createPage(settings = {}, url = 'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=prsm-cm-buy&campaign-id=CP3FMRK&route=online') {
    const dom = new JSDOM(`<!doctype html><html><head></head><body>
        <div id="native-header">
            <div slot="right"><div class="workflow-widget-wrapper">Approvers</div></div>
        </div>
        <div class="p2b-navbar-wrapper">
            <a id="p2b-navbar-section-buy" class="mo-navbar-section active" aria-current="page" href="#campaign-id=CP123&ptb-mod=buy&ptb-ctx=digital">BUY</a>
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
        url,
        runScripts: 'dangerously'
    });

    dom.window.chrome = {
        runtime: {
            id: 'test-extension',
            lastError: null,
            sendMessage: jest.fn().mockResolvedValue({ status: 'success' }),
            onMessage: { addListener: jest.fn() }
        },
        storage: {
            sync: {
                get: (_keys, callback) => callback(settings)
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
    test.each(['legacy', 'new'])('marks Orders instead of Buy active on a %s Order Summary UI', orderUi => {
        const dom = createPage({}, 'https://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP3FMRK&ptb-mod=buy&ptb-ctx=orderSummary&showOrders=true');
        const { document } = dom.window;
        if (orderUi === 'new') {
            const orderSidebarHeader = document.createElement('div');
            orderSidebarHeader.id = 'cm-buy-sidebar-order-revisions-header';
            orderSidebarHeader.innerHTML = '<mo-menu><button>Latest</button><button>All</button></mo-menu>';
            document.body.appendChild(orderSidebarHeader);
        }

        dom.window.campaignFeature.handleCampaignNavigationOptimisation();

        const buy = document.getElementById('p2b-navbar-section-buy');
        const orders = document.getElementById('p2b-navbar-section-orders');
        expect(orders.classList).toContain('active');
        expect(orders.getAttribute('aria-current')).toBe('page');
        expect(buy.classList).not.toContain('active');
        expect(buy.hasAttribute('aria-current')).toBe(false);
        dom.window.close();
    });

    test('reconciles Orders and Buy active state after an in-place route change', () => {
        const dom = createPage({}, 'https://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP3FMRK&ptb-mod=buy&ptb-ctx=orderSummary&showOrders=true');
        const { document } = dom.window;

        dom.window.campaignFeature.handleCampaignNavigationOptimisation();
        dom.window.history.replaceState({}, '', '#campaign-id=CP3FMRK&ptb-mod=buy&ptb-ctx=digital&route=online');
        dom.window.campaignFeature.handleCampaignNavigationOptimisation();

        const buy = document.getElementById('p2b-navbar-section-buy');
        const orders = document.getElementById('p2b-navbar-section-orders');
        expect(buy.classList).toContain('active');
        expect(buy.getAttribute('aria-current')).toBe('page');
        expect(orders.classList).not.toContain('active');
        expect(orders.hasAttribute('aria-current')).toBe(false);
        dom.window.close();
    });

    test('removes Traffic and Analyse from Print campaign navigation', () => {
        const dom = createPage();
        const { document } = dom.window;
        const navbar = document.querySelector('.p2b-navbar-wrapper');
        const traffic = document.createElement('a');
        traffic.id = 'p2b-navbar-section-traffic';
        traffic.textContent = 'TRAFFIC';
        navbar.insertBefore(traffic, document.getElementById('p2b-navbar-section-analyze'));

        const printIcon = document.createElement('mo-icon');
        printIcon.setAttribute('name', 'print');
        document.querySelector('.mo-page-header').appendChild(printIcon);

        dom.window.campaignFeature.handleCampaignNavigationOptimisation();

        expect(document.getElementById('p2b-navbar-section-traffic')).toBeNull();
        expect(document.getElementById('p2b-navbar-section-analyze')).toBeNull();
        const orders = document.getElementById('p2b-navbar-section-orders');
        expect(orders).not.toBeNull();
        expect(orders.getAttribute('href')).toContain('ptb-ctx=orderSummary');
        expect(orders.getAttribute('href')).toContain('showOrders=true');
        dom.window.close();
    });

    test('repairs a Print Orders link from the left-side Order summary route', () => {
        const dom = createPage();
        const { document } = dom.window;
        const navbar = document.querySelector('.p2b-navbar-wrapper');
        const existingOrders = document.createElement('a');
        existingOrders.id = 'p2b-navbar-section-orders';
        existingOrders.className = 'mo-navbar-section mo-text-uppercase disabled';
        existingOrders.textContent = 'ORDERS';
        existingOrders.setAttribute('href', '');
        navbar.appendChild(existingOrders);

        const sidebarOrderSummary = document.createElement('a');
        sidebarOrderSummary.textContent = 'Order summary';
        sidebarOrderSummary.setAttribute(
            'href',
            '#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=CP3FMRK&ptb-mod=buy&ptb-ctx=orderSummary&showOrders=true'
        );
        document.body.appendChild(sidebarOrderSummary);

        const printIcon = document.createElement('mo-icon');
        printIcon.setAttribute('name', 'print');
        document.querySelector('.mo-page-header').appendChild(printIcon);

        dom.window.campaignFeature.handleCampaignNavigationOptimisation();

        expect(existingOrders.getAttribute('href')).toBe(sidebarOrderSummary.getAttribute('href'));
        expect(existingOrders.classList).not.toContain('disabled');
        expect(existingOrders.classList).not.toContain('mo-disabled');
        expect(existingOrders.hasAttribute('aria-disabled')).toBe(false);
        expect(document.getElementById('p2b-navbar-section-analyze')).toBeNull();
        dom.window.close();
    });

    test('uses the placement setting as the sole approver layout switch', () => {
        const enabledDom = createPage();
        const disabledDom = createPage({ approverWidgetPlacementEnabled: false });

        expect(enabledDom.window.document.body.classList)
            .toContain('approver-widget-placement-enabled');
        expect(disabledDom.window.document.body.classList)
            .not.toContain('approver-widget-placement-enabled');

        enabledDom.window.close();
        disabledDom.window.close();
    });

    test('targets the workflow widget without scanning every right-slot candidate repeatedly', () => {
        const dom = createPage();
        const { document } = dom.window;
        const originalQuerySelectorAll = document.querySelectorAll.bind(document);
        const broadRightSlotQuery = jest.spyOn(document, 'querySelectorAll');

        for (let index = 0; index < 20; index += 1) {
            const unrelated = document.createElement('div');
            unrelated.setAttribute('slot', 'right');
            unrelated.textContent = `Unrelated ${index}`;
            document.body.prepend(unrelated);
        }

        dom.window.campaignFeature.handleCampaignNavigationOptimisation();
        dom.window.campaignFeature.handleCampaignNavigationOptimisation();

        expect(
            broadRightSlotQuery.mock.calls.filter(([selector]) => selector === 'div[slot="right"]')
        ).toHaveLength(0);
        expect(document.querySelector('.workflow-widget-wrapper').parentElement.parentElement)
            .toBe(document.querySelector('.p2b-navbar-wrapper'));

        broadRightSlotQuery.mockRestore();
        document.querySelectorAll = originalQuerySelectorAll;
        dom.window.close();
    });

    test('finds a workflow widget nested inside the live Prisma right slot', () => {
        const dom = createPage();
        const { document } = dom.window;
        const workflowSlot = document.querySelector('div[slot="right"]');
        workflowSlot.innerHTML = '<div class="pad hydrated"><div class="workflow-widget-wrapper">Approvers</div></div>';

        dom.window.campaignFeature.handleCampaignNavigationOptimisation();

        expect(workflowSlot.parentElement).toBe(document.querySelector('.p2b-navbar-wrapper'));
        expect(workflowSlot.classList.contains('ai-style-change-1')).toBe(true);
        dom.window.close();
    });

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
            action: 'copyCampaignHeaderToClipboard',
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
            action: 'copyCampaignHeaderToClipboard',
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
            action: 'copyCampaignHeaderToClipboard',
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
            action: 'copyCampaignHeaderToClipboard',
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
            action: 'copyCampaignHeaderToClipboard',
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
            action: 'copyCampaignHeaderToClipboard',
            text: 'LB9/2/245'
        });
        dom.window.close();
    });

    test('opens Campaign details and requests Basic focus from the Campaign Details iframe', async () => {
        const dom = createPage();
        const { document, chrome } = dom.window;
        const dates = document.querySelector('.mo-date-field-wrapper');
        chrome.runtime.sendMessage.mockResolvedValue({ status: 'accepted' });
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
        dates.dispatchEvent(
            new dom.window.MouseEvent('pointerdown', { bubbles: true, composed: true })
        );
        await Promise.resolve();

        expect(dom.window.location.href).toContain('osModalId=prsm-cm-cmpdtls');
        expect(dispatchedWindowEvents).toEqual(
            expect.arrayContaining(['hashchange', 'popstate'])
        );
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'requestCampaignDetailsBasicFocus'
        });
        dom.window.close();
    });

    test('prefers a native Actualise month toolbar that appears after the fallback row', () => {
        const dom = createPage();
        const { document } = dom.window;

        dom.window.campaignFeature.handleCampaignNavigationOptimisation();
        const workflowSlot = document.querySelector('div[slot="right"]');
        document.querySelector('.p2b-navbar-wrapper').remove();
        dom.window.history.replaceState({}, '', '#ptb-ctx=actualize&route=actualize');

        const fallbackRow = document.createElement('div');
        fallbackRow.innerHTML = '<a>Jun 26</a><a>Jul 26</a>';
        document.body.prepend(fallbackRow);
        dom.window.campaignFeature.handleCampaignNavigationOptimisation();
        expect(fallbackRow.contains(workflowSlot)).toBe(true);

        const nativeRow = document.createElement('div');
        nativeRow.id = 'month-filter-toolbar';
        document.body.prepend(nativeRow);
        dom.window.campaignFeature.handleCampaignNavigationOptimisation();

        expect(nativeRow.contains(workflowSlot)).toBe(true);
        dom.window.close();
    });

    test('Campaign Details iframe activates its own Basic edit control', () => {
        const dom = createPage({}, 'https://groupmuk-prisma.mediaocean.com/idesk/prisma-campaign-details/index.html?osModalId=prsm-cm-cmpdtls');
        const { document, chrome } = dom.window;
        dom.window.eval(campaignDetailsFocusScript);
        const editIcon = document.createElement('mo-icon');
        editIcon.id = 'campaign-details-basics-pencil-icon';
        editIcon.click = jest.fn();
        editIcon.scrollIntoView = jest.fn();
        Object.defineProperty(editIcon, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ left: 720, top: 60, width: 14, height: 14, bottom: 74 })
        });
        document.body.appendChild(editIcon);
        const sendResponse = jest.fn();
        const listener = chrome.runtime.onMessage.addListener.mock.calls[0]?.[0];

        expect(listener).toEqual(expect.any(Function));
        listener({ action: 'focusCampaignDetailsBasic' }, {}, sendResponse);

        expect(sendResponse).toHaveBeenCalledWith({ status: 'accepted' });
        expect(editIcon.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
        expect(editIcon.click).toHaveBeenCalledTimes(1);
        dom.window.close();
    });

    test('Campaign Details frame helper remains inert on the top-level campaign page', () => {
        const dom = createPage();
        const { chrome } = dom.window;

        dom.window.eval(campaignDetailsFocusScript);

        expect(chrome.runtime.onMessage.addListener).not.toHaveBeenCalled();
        dom.window.close();
    });

    test('retries the frame request until Campaign Details is ready', async () => {
        const dom = createPage();
        const { document, chrome } = dom.window;
        chrome.runtime.sendMessage
            .mockResolvedValueOnce({ status: 'pending' })
            .mockResolvedValueOnce({ status: 'accepted' });
        dom.window.setTimeout = callback => {
            callback();
            return 0;
        };

        dom.window.campaignFeature.handleCampaignNavigationOptimisation();
        document.querySelector('.mo-date-field-wrapper').dispatchEvent(
            new dom.window.MouseEvent('pointerdown', { bubbles: true, composed: true })
        );
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
        expect(chrome.runtime.sendMessage).toHaveBeenNthCalledWith(1, {
            action: 'requestCampaignDetailsBasicFocus'
        });
        expect(chrome.runtime.sendMessage).toHaveBeenNthCalledWith(2, {
            action: 'requestCampaignDetailsBasicFocus'
        });
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

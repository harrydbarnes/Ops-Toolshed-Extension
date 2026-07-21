const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const script = fs.readFileSync(path.resolve(__dirname, '../../features/onboarding-tour.js'), 'utf8');

function setup() {
    const dom = new JSDOM('<!doctype html><html><head></head><body><button id="toolshed-help-guides-launcher">Help</button></body></html>', {
        runScripts: 'outside-only',
        url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/'
    });
    let listener;
    dom.window.chrome = {
        runtime: {
            onMessage: { addListener: jest.fn(callback => { listener = callback; }) }
        }
    };
    dom.window.matchMedia = jest.fn(() => ({ matches: true }));
    dom.window.requestAnimationFrame = callback => callback();
    dom.window.eval(script);
    return { dom, getListener: () => listener };
}

describe('Onboarding page highlights', () => {
    test('highlights and clears the Help Guides launcher', () => {
        const { dom, getListener } = setup();
        const target = dom.window.document.getElementById('toolshed-help-guides-launcher');
        target.getBoundingClientRect = () => ({ left: 20, top: 30, width: 42, height: 42 });
        const sendResponse = jest.fn();

        getListener()({ action: 'showOnboardingHighlight', target: 'helpGuides' }, {}, sendResponse);

        const overlay = dom.window.document.getElementById('ops-toolshed-onboarding-highlight');
        expect(sendResponse).toHaveBeenCalledWith({ status: 'success', found: true });
        expect(overlay.style.width).toBe('56px');
        expect(overlay.style.height).toBe('56px');
        expect(overlay.style.left).toBe('13px');
        const maskHole = dom.window.document.querySelector('#ops-toolshed-onboarding-backdrop [data-tour-mask="hole"]');
        expect(maskHole).not.toBeNull();
        expect(maskHole.getAttribute('rx')).toBe('12');
        expect(maskHole.getAttribute('width')).toBe('56');

        getListener()({ action: 'hideOnboardingHighlight' }, {}, sendResponse);
        expect(dom.window.document.getElementById('ops-toolshed-onboarding-highlight')).toBeNull();
        expect(dom.window.document.getElementById('ops-toolshed-onboarding-backdrop')).toBeNull();
        dom.window.close();
    });

    test('finds the account label inside a shadow root', () => {
        const { dom, getListener } = setup();
        const host = dom.window.document.createElement('div');
        const shadow = host.attachShadow({ mode: 'open' });
        const label = dom.window.document.createElement('span');
        label.className = 'user-menu-label';
        label.getBoundingClientRect = () => ({ left: 80, top: 10, width: 150, height: 30 });
        shadow.appendChild(label);
        dom.window.document.body.appendChild(host);
        const sendResponse = jest.fn();

        getListener()({ action: 'showOnboardingHighlight', target: 'account' }, {}, sendResponse);

        expect(sendResponse).toHaveBeenCalledWith({ status: 'success', found: true });
        expect(dom.window.document.getElementById('ops-toolshed-onboarding-highlight')).not.toBeNull();
        dom.window.close();
    });

    test('reports when the requested feature is not on the current page', () => {
        const { dom, getListener } = setup();
        const sendResponse = jest.fn();

        getListener()({ action: 'showOnboardingHighlight', target: 'campaignActions' }, {}, sendResponse);

        expect(sendResponse).toHaveBeenCalledWith({ status: 'success', found: false });
        expect(dom.window.document.getElementById('ops-toolshed-onboarding-highlight')).toBeNull();
        dom.window.close();
    });

    test('targets the precise Switch Accounts, campaign, navigation and expanded approver controls', () => {
        const { dom, getListener } = setup();
        const document = dom.window.document;
        const targets = [
            ['button', null, 'Switch Accounts'],
            ['div', 'mo-extracted-actions-toolbar', ''],
            ['a', 'p2b-navbar-section-orders', 'Orders'],
            ['a', 'p2b-navbar-section-actualise', 'Actualise'],
            ['div', 'grid-container_hot', 'Grid']
        ].map(([tag, id, text]) => {
            const element = document.createElement(tag);
            if (id) element.id = id;
            element.textContent = text;
            element.getBoundingClientRect = () => ({ left: 20, top: 20, width: 100, height: 30 });
            document.body.appendChild(element);
            return element;
        });
        ['Campaign details', 'Copy campaign', 'Campaign history'].forEach(label => {
            const wrapper = document.createElement('div');
            wrapper.getBoundingClientRect = () => ({ left: 20, top: 20, width: 30, height: 30 });
            const icon = document.createElement('span');
            icon.setAttribute('aria-label', label);
            wrapper.appendChild(icon);
            targets[1].appendChild(wrapper);
        });
        const widget = document.createElement('div');
        widget.className = 'workflow-widget-wrapper';
        widget.getBoundingClientRect = () => ({ left: 20, top: 20, width: 260, height: 180 });
        widget.innerHTML = '<div class="select2-choices"><input class="select2-input"></div><button class="prisma-paste-button">Paste Approvers</button>';
        document.body.appendChild(widget);

        const sendResponse = jest.fn();
        ['switchAccounts', 'campaignDetailsAction', 'campaignCopyAction', 'campaignHistoryAction', 'ordersNav', 'actualiseNav', 'placementGrid', 'approverWidgetExpanded']
            .forEach(target => getListener()({ action: 'showOnboardingHighlight', target }, {}, sendResponse));

        expect(sendResponse).toHaveBeenCalledTimes(8);
        expect(sendResponse.mock.calls.every(([value]) => value.found === true)).toBe(true);
        dom.window.close();
    });

    test('does not dim the page while a target is present but has no visible size', () => {
        const { dom, getListener } = setup();
        const target = dom.window.document.getElementById('toolshed-help-guides-launcher');
        target.getBoundingClientRect = () => ({ left: 20, top: 30, width: 0, height: 0 });
        const sendResponse = jest.fn();

        getListener()({ action: 'showOnboardingHighlight', target: 'helpGuides' }, {}, sendResponse);

        expect(sendResponse).toHaveBeenCalledWith({ status: 'success', found: false });
        expect(dom.window.document.getElementById('ops-toolshed-onboarding-highlight')).toBeNull();
        expect(dom.window.document.getElementById('ops-toolshed-onboarding-backdrop')).toBeNull();
        dom.window.close();
    });

    test('guards the Help Guides launcher for the full tour and restores it afterwards', () => {
        const { dom, getListener } = setup();
        const target = dom.window.document.getElementById('toolshed-help-guides-launcher');
        const openHelpGuides = jest.fn();
        target.addEventListener('click', openHelpGuides);
        const sendResponse = jest.fn();

        getListener()({ action: 'setOnboardingInteractionGuard', enabled: true }, {}, sendResponse);
        target.click();
        expect(openHelpGuides).not.toHaveBeenCalled();

        getListener()({ action: 'setOnboardingInteractionGuard', enabled: false }, {}, sendResponse);
        target.click();
        expect(openHelpGuides).toHaveBeenCalledTimes(1);
        dom.window.close();
    });
});

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

        getListener()({ action: 'hideOnboardingHighlight' }, {}, sendResponse);
        expect(dom.window.document.getElementById('ops-toolshed-onboarding-highlight')).toBeNull();
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
});

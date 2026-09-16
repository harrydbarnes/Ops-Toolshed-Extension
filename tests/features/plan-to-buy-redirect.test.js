const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const script = fs.readFileSync(
    path.resolve(__dirname, '../../features/plan-to-buy-redirect.js'),
    'utf8'
);

function setup(url, enabled = true, body = '') {
    const dom = new JSDOM(`<!doctype html><html><body>${body}</body></html>`, {
        url,
        runScripts: 'dangerously'
    });
    const listeners = [];
    dom.window.chrome = {
        storage: {
            sync: {
                get: jest.fn((_defaults, callback) => callback({ planToBuyRedirectEnabled: enabled }))
            },
            onChanged: {
                addListener: jest.fn(listener => listeners.push(listener))
            }
        }
    };
    dom.window.eval(script);
    return { dom, feature: dom.window.planToBuyRedirectFeature, listeners };
}

describe('Plan to Buy redirect', () => {
    const planUrl = 'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=CP3J3YP&ptb-mod=plan&ptb-ctx=rfpSummary';
    const buyUrl = 'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=CP3J3YP&ptb-mod=buy&ptb-ctx=digital&route=online';

    test('builds the matching Buy URL for a campaign in Plan', () => {
        const { dom, feature } = setup(planUrl);
        expect(feature.buildBuyUrl(planUrl)).toBe(buyUrl);
        dom.window.close();
    });

    test('retains Prisma context on the new host when moving Plan to Buy', () => {
        const { dom, feature } = setup(planUrl);
        const newPlanUrl = planUrl.replace('https://groupmuk-prisma.mediaocean.com/campaign-management/', 'https://go.mediaocean.com/campaign-management/?_ctx=session');
        expect(feature.buildBuyUrl(newPlanUrl)).toBe(buyUrl.replace('https://groupmuk-prisma.mediaocean.com/campaign-management/', 'https://go.mediaocean.com/campaign-management/?_ctx=session'));
        dom.window.close();
    });

    test.each([
        buyUrl,
        'https://groupmuk-prisma.mediaocean.com/campaign-management/#osPspId=prsm-cm-plan-to-buy&ptb-mod=plan&ptb-ctx=rfpSummary',
        'https://groupmuk-prisma.mediaocean.com/campaign-management/#osPspId=cm-dashboard&campaign-id=CP3J3YP&ptb-mod=plan',
        'https://example.com/campaign-management/#osPspId=prsm-cm-plan-to-buy&campaign-id=CP3J3YP&ptb-mod=plan'
    ])('does not redirect unrelated or already-Buy URLs: %s', url => {
        const { dom, feature } = setup(url);
        expect(feature.buildBuyUrl(url)).toBe('');
        dom.window.close();
    });

    test('redirects after the enabled setting loads', () => {
        const { dom, feature } = setup(planUrl);
        const navigate = jest.fn();

        feature.initialize(navigate);
        expect(navigate).toHaveBeenCalledWith(buyUrl);
        dom.window.close();
    });

    test('allows a deliberate click on Prisma’s Plan tab for that campaign', () => {
        const planLink = '#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=CP3J3YP&ptb-mod=plan&ptb-ctx=rfpSummary';
        const { dom, feature } = setup(
            buyUrl,
            true,
            `<a id="p2b-navbar-section-plan" href="${planLink}">Plan</a>`
        );
        const navigate = jest.fn();
        feature.initialize(navigate);

        const link = dom.window.document.getElementById('p2b-navbar-section-plan');
        link.addEventListener('click', event => event.preventDefault());
        link.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, button: 0 }));
        dom.window.history.replaceState({}, '', planLink);

        expect(feature.redirectIfNeeded(navigate)).toBe(false);
        expect(dom.window.location.hash).toContain('ptb-mod=plan');
        expect(feature.redirectIfNeeded(navigate)).toBe(false);
        dom.window.history.replaceState({}, '', buyUrl);
        expect(feature.redirectIfNeeded(navigate)).toBe(false);
        dom.window.history.replaceState({}, '', planLink);
        expect(feature.redirectIfNeeded(navigate)).toBe(true);
        expect(navigate).toHaveBeenCalledWith(buyUrl);
        dom.window.close();
    });

    test('respects a disabled setting and reacts when it is enabled', () => {
        const { dom, feature, listeners } = setup(planUrl, false);
        const navigate = jest.fn();
        feature.initialize(navigate);

        expect(feature.redirectIfNeeded(navigate)).toBe(false);
        listeners[0]({ planToBuyRedirectEnabled: { oldValue: false, newValue: true } }, 'sync');
        expect(navigate).toHaveBeenCalledWith(buyUrl);
        dom.window.close();
    });
});

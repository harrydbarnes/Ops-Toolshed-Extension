const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const featureCode = fs.readFileSync(
    path.resolve(__dirname, '../../features/actualise-shortcut.js'),
    'utf8'
);

describe('Actualise navigation shortcut', () => {
    function createFeature({
        enabled = true,
        includeOrders = true,
        injectedActualiseNavbar = false,
        url = 'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=CP3GH64&ptb-mod=buy&ptb-ctx=digital&route=online'
    } = {}) {
        const orders = includeOrders
            ? '<a id="p2b-navbar-section-orders" class="mo-navbar-section mo-text-uppercase">ORDERS</a>'
            : '';
        const wrapperId = injectedActualiseNavbar ? ' id="toolshed-actualise-navbar-wrapper"' : '';
        const dom = new JSDOM(`<!doctype html><html><body>
            <div${wrapperId}>
                <div id="p2b-navbar">
                    <div class="mo-navbar-sections">
                        <a id="p2b-navbar-section-buy" class="mo-navbar-section mo-text-uppercase active" aria-current="page">Buy</a>
                        <a id="p2b-navbar-section-analyze" class="mo-navbar-section mo-text-uppercase">Analyse</a>
                        ${orders}
                        <div class="mo-navbar-sections-triangle"></div>
                    </div>
                </div>
            </div>
        </body></html>`, {
            runScripts: 'dangerously',
            url
        });
        const NativeDate = dom.window.Date;
        dom.window.Date = class extends NativeDate {
            constructor(...args) {
                super(...(args.length ? args : ['2026-07-16T12:00:00']));
            }
            static now() {
                return new NativeDate('2026-07-16T12:00:00').getTime();
            }
        };
        const listeners = [];
        dom.window.chrome = {
            storage: {
                sync: {
                    get: jest.fn((defaults, callback) => callback({
                        ...defaults,
                        actualiseShortcutEnabled: enabled
                    }))
                },
                onChanged: {
                    addListener: jest.fn(listener => listeners.push(listener))
                }
            }
        };
        dom.window.eval(featureCode);
        return { dom, window: dom.window, listeners };
    }

    test('adds Actualise immediately after Orders using Prisma current-month routing', () => {
        const { dom, window } = createFeature();
        window.actualiseShortcutFeature.initialize();

        const orders = window.document.getElementById('p2b-navbar-section-orders');
        const actualise = window.document.getElementById('p2b-navbar-section-actualise');

        expect(actualise).not.toBeNull();
        expect(orders.nextElementSibling).toBe(actualise);
        expect(actualise.nextElementSibling.className).toBe('mo-navbar-sections-triangle');
        expect(actualise.getAttribute('href')).toContain('campaign-id=CP3GH64');
        expect(actualise.getAttribute('href')).toContain('ptb-ctx=actualize');
        expect(actualise.getAttribute('href')).toContain('route=actualize');
        expect(actualise.getAttribute('href')).toContain('mos=2026-07-01');
        expect(actualise.classList).not.toContain('active');
        dom.window.close();
    });

    test('falls back to immediately after Analyse when Orders is disabled', () => {
        const { dom, window } = createFeature({ includeOrders: false });
        window.actualiseShortcutFeature.initialize();

        expect(window.document.getElementById('p2b-navbar-section-analyze').nextElementSibling.id)
            .toBe('p2b-navbar-section-actualise');
        dom.window.close();
    });

    test('preserves the selected month and marks Actualise active inside Actualise', () => {
        const { dom, window } = createFeature({
            injectedActualiseNavbar: true,
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP3GH64&ptb-ctx=actualize&route=actualize&mos=2026-08-20'
        });
        window.actualiseShortcutFeature.initialize();

        const actualise = window.document.getElementById('p2b-navbar-section-actualise');
        const buy = window.document.getElementById('p2b-navbar-section-buy');
        expect(actualise.getAttribute('href')).toContain('mos=2026-08-20');
        expect(actualise.classList).toContain('active');
        expect(actualise.getAttribute('aria-current')).toBe('page');
        expect(buy.classList).not.toContain('active');
        expect(buy.hasAttribute('aria-current')).toBe(false);
        dom.window.close();
    });

    test('marks Orders instead of Buy active on an Order Summary route', () => {
        const { dom, window } = createFeature({
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP3GH64&ptb-mod=buy&ptb-ctx=orderSummary&showOrders=true'
        });
        window.actualiseShortcutFeature.initialize();

        const actualise = window.document.getElementById('p2b-navbar-section-actualise');
        const orders = window.document.getElementById('p2b-navbar-section-orders');
        const buy = window.document.getElementById('p2b-navbar-section-buy');
        expect(orders.classList).toContain('active');
        expect(orders.getAttribute('aria-current')).toBe('page');
        expect(buy.classList).not.toContain('active');
        expect(buy.hasAttribute('aria-current')).toBe(false);
        expect(actualise.classList).not.toContain('active');
        dom.window.close();
    });

    test('reconciles Orders and Buy active state after an in-place route change', () => {
        const { dom, window } = createFeature({
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP3GH64&ptb-mod=buy&ptb-ctx=orderSummary&showOrders=true'
        });
        window.actualiseShortcutFeature.initialize();
        window.history.replaceState({}, '', '#campaign-id=CP3GH64&ptb-mod=buy&ptb-ctx=digital&route=online');
        window.actualiseShortcutFeature.apply();

        const orders = window.document.getElementById('p2b-navbar-section-orders');
        const buy = window.document.getElementById('p2b-navbar-section-buy');
        expect(buy.classList).toContain('active');
        expect(buy.getAttribute('aria-current')).toBe('page');
        expect(orders.classList).not.toContain('active');
        expect(orders.hasAttribute('aria-current')).toBe(false);
        dom.window.close();
    });

    test('does not add the shortcut when its setting is disabled', () => {
        const { dom, window } = createFeature({ enabled: false });
        window.actualiseShortcutFeature.initialize();

        expect(window.document.getElementById('p2b-navbar-section-actualise')).toBeNull();
        dom.window.close();
    });

    test('responds to setting changes and remains idempotent', () => {
        const { dom, window, listeners } = createFeature();
        window.actualiseShortcutFeature.initialize();
        window.actualiseShortcutFeature.apply();
        expect(window.document.querySelectorAll('#p2b-navbar-section-actualise')).toHaveLength(1);

        listeners[0]({ actualiseShortcutEnabled: { oldValue: true, newValue: false } }, 'sync');
        expect(window.document.getElementById('p2b-navbar-section-actualise')).toBeNull();

        listeners[0]({ actualiseShortcutEnabled: { oldValue: false, newValue: true } }, 'sync');
        expect(window.document.querySelectorAll('#p2b-navbar-section-actualise')).toHaveLength(1);
        dom.window.close();
    });
});

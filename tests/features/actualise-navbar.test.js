const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const featureCode = fs.readFileSync(
    path.resolve(__dirname, '../../features/actualise-navbar.js'),
    'utf8'
);

describe('Actualise navigation bar', () => {
    function createFeature({
        enabled = true,
        parentEnabled = true,
        ordersEnabled = true,
        includeWorkspace = true,
        url = 'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=CP3GH64&ptb-mod=buy&ptb-ctx=actualize&route=actualize&mos=2026-07-20'
    } = {}) {
        const workspace = includeWorkspace
            ? '<div class="ptb-workspace-content-container"><div class="ptb-content-with-sidebar-wrapper"></div></div>'
            : '';
        const dom = new JSDOM(`<!doctype html><html><body>${workspace}</body></html>`, {
            runScripts: 'dangerously',
            url
        });
        const listeners = [];
        dom.window.chrome = {
            storage: {
                sync: {
                    get: jest.fn((defaults, callback) => callback({
                        ...defaults,
                        actualiseNavbarEnabled: enabled,
                        optimisedNewNavEnabled: parentEnabled,
                        ordersShortcutEnabled: ordersEnabled
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

    test('recreates the native campaign navbar above the Actualise workspace', () => {
        const { dom, window } = createFeature();
        window.actualiseNavbarFeature.initialize();

        const workspace = window.document.querySelector('.ptb-workspace-content-container');
        const wrapper = window.document.getElementById('toolshed-actualise-navbar-wrapper');
        const content = window.document.querySelector('.ptb-content-with-sidebar-wrapper');

        expect(wrapper).not.toBeNull();
        expect(wrapper.parentElement).toBe(workspace);
        expect(wrapper.nextElementSibling).toBe(content);
        expect(wrapper.classList).toContain('p2b-navbar-wrapper');
        expect(wrapper.querySelector('#p2b-navbar')).not.toBeNull();
        expect(wrapper.querySelector('#p2b-navbar-section-buy').classList).toContain('active');
        expect(wrapper.querySelector('#p2b-navbar-section-buy').getAttribute('aria-current')).toBe('page');
        expect(wrapper.querySelector('.scenario-subtitle').textContent).toBe('Actualise');
        expect(wrapper.querySelector('#p2b-navbar-section-orders')).not.toBeNull();
        expect(wrapper.querySelector('#p2b-navbar-section-plan').getAttribute('href')).toContain('campaign-id=CP3GH64');
        expect(wrapper.querySelector('#p2b-navbar-section-buy').getAttribute('href')).toContain('route=online');
        dom.window.close();
    });

    test.each([
        ['feature setting', { enabled: false }],
        ['navigation parent setting', { parentEnabled: false }]
    ])('does not add the navbar when the %s is disabled', (_label, options) => {
        const { dom, window } = createFeature(options);
        window.actualiseNavbarFeature.initialize();

        expect(window.document.getElementById('toolshed-actualise-navbar-wrapper')).toBeNull();
        dom.window.close();
    });

    test('respects the existing Orders shortcut preference', () => {
        const { dom, window } = createFeature({ ordersEnabled: false });
        window.actualiseNavbarFeature.initialize();

        expect(window.document.getElementById('p2b-navbar-section-orders')).toBeNull();
        expect(window.document.getElementById('p2b-navbar-section-analyze')).not.toBeNull();
        dom.window.close();
    });

    test('removes the injected navbar when leaving Actualise', () => {
        const { dom, window } = createFeature();
        window.actualiseNavbarFeature.initialize();
        expect(window.document.getElementById('toolshed-actualise-navbar-wrapper')).not.toBeNull();

        window.history.replaceState({}, '', '#osAppId=prsm-cm-spa&campaign-id=CP3GH64&ptb-ctx=digital&route=online');
        window.actualiseNavbarFeature.apply();

        expect(window.document.getElementById('toolshed-actualise-navbar-wrapper')).toBeNull();
        dom.window.close();
    });

    test('responds immediately when its setting changes', () => {
        const { dom, window, listeners } = createFeature();
        window.actualiseNavbarFeature.initialize();

        listeners[0]({ actualiseNavbarEnabled: { oldValue: true, newValue: false } }, 'sync');
        expect(window.document.getElementById('toolshed-actualise-navbar-wrapper')).toBeNull();

        listeners[0]({ actualiseNavbarEnabled: { oldValue: false, newValue: true } }, 'sync');
        expect(window.document.getElementById('toolshed-actualise-navbar-wrapper')).not.toBeNull();
        dom.window.close();
    });

    test('waits for Prisma to render the Actualise workspace and stays idempotent', () => {
        const { dom, window } = createFeature({ includeWorkspace: false });
        window.actualiseNavbarFeature.initialize();
        expect(window.document.getElementById('toolshed-actualise-navbar-wrapper')).toBeNull();

        const workspace = window.document.createElement('div');
        workspace.className = 'ptb-workspace-content-container';
        const content = window.document.createElement('div');
        content.className = 'ptb-content-with-sidebar-wrapper';
        workspace.appendChild(content);
        window.document.body.appendChild(workspace);
        window.actualiseNavbarFeature.apply();
        window.actualiseNavbarFeature.apply();

        expect(window.document.querySelectorAll('#toolshed-actualise-navbar-wrapper')).toHaveLength(1);
        dom.window.close();
    });
});

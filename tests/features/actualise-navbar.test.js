const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const featureCode = fs.readFileSync(
    path.resolve(__dirname, '../../features/actualise-navbar.js'),
    'utf8'
);
const shortcutCode = fs.readFileSync(
    path.resolve(__dirname, '../../features/actualise-shortcut.js'),
    'utf8'
);

describe('Actualise navigation bar', () => {
    function createFeature({
        enabled = true,
        ordersEnabled = true,
        includeWorkspace = true,
        mediaType = 'digital',
        url = 'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=CP3GH64&ptb-mod=buy&ptb-ctx=actualize&route=actualize&mos=2026-07-20'
    } = {}) {
        const header = mediaType === 'print'
            ? '<div id="ptb-header"><mo-icon name="print"></mo-icon></div>'
            : '<div id="ptb-header"><mo-icon name="digital"></mo-icon></div>';
        const workspace = includeWorkspace
            ? '<div class="ptb-workspace-content-container"><div class="ptb-content-with-sidebar-wrapper"></div></div>'
            : '';
        const dom = new JSDOM(`<!doctype html><html><body>${header}${workspace}</body></html>`, {
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

    test('does not add the navbar when its setting is disabled', () => {
        const { dom, window } = createFeature({ enabled: false });
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

    test('omits Traffic and Analyse for Print campaigns', () => {
        const { dom, window } = createFeature({ mediaType: 'print' });
        window.actualiseNavbarFeature.initialize();

        expect(window.document.getElementById('p2b-navbar-section-traffic')).toBeNull();
        expect(window.document.getElementById('p2b-navbar-section-analyze')).toBeNull();
        expect(window.document.getElementById('p2b-navbar-section-orders')).not.toBeNull();
        dom.window.close();
    });

    test('refreshes the Actualise navbar when the Print marker appears later', () => {
        const { dom, window } = createFeature();
        window.actualiseNavbarFeature.initialize();

        expect(window.document.getElementById('p2b-navbar-section-analyze')).not.toBeNull();
        const printIcon = window.document.createElement('mo-icon');
        printIcon.setAttribute('name', 'print');
        window.document.getElementById('ptb-header').appendChild(printIcon);
        window.actualiseNavbarFeature.apply();

        expect(window.document.getElementById('p2b-navbar-section-traffic')).toBeNull();
        expect(window.document.getElementById('p2b-navbar-section-analyze')).toBeNull();
        dom.window.close();
    });

    test('removes the injected navbar when leaving Actualise', () => {
        const { dom, window } = createFeature();
        window.actualiseNavbarFeature.initialize();
        const workspace = window.document.querySelector('.ptb-workspace-content-container');
        const nativeNavbar = window.document.createElement('div');
        nativeNavbar.id = 'p2b-navbar';
        workspace.appendChild(nativeNavbar);
        expect(window.document.getElementById('toolshed-actualise-navbar-wrapper')).not.toBeNull();

        window.history.replaceState({}, '', '#osAppId=prsm-cm-spa&campaign-id=CP3GH64&ptb-ctx=digital&route=online');
        window.actualiseNavbarFeature.apply();

        expect(window.document.getElementById('toolshed-actualise-navbar-wrapper')).not.toBeNull();
        nativeNavbar.innerHTML = `
            <div class="mo-navbar-sections">
                <a id="p2b-navbar-section-buy"></a>
                <a id="p2b-navbar-section-orders"></a>
            </div>
        `;
        window.actualiseNavbarFeature.apply();

        expect(window.document.getElementById('toolshed-actualise-navbar-wrapper')).toBeNull();
        dom.window.close();
    });

    test('keeps the Actualise shortcut visible until the native Orders navbar is mounted', () => {
        const { dom, window } = createFeature();
        window.actualiseNavbarFeature.initialize();
        window.eval(shortcutCode);
        window.actualiseShortcutFeature.initialize();

        expect(window.document.getElementById('p2b-navbar-section-actualise')).not.toBeNull();

        window.history.replaceState(
            {},
            '',
            '#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=CP3GH64&ptb-mod=buy&ptb-ctx=orderSummary&showOrders=true'
        );
        window.dispatchEvent(new window.Event('hashchange'));

        expect(window.document.getElementById('toolshed-actualise-navbar-wrapper')).not.toBeNull();
        expect(window.document.getElementById('p2b-navbar-section-actualise')).not.toBeNull();

        const workspace = window.document.querySelector('.ptb-workspace-content-container');
        const nativeWrapper = window.document.createElement('div');
        nativeWrapper.className = 'p2b-navbar-wrapper';
        nativeWrapper.innerHTML = '<div id="p2b-navbar"></div>';
        workspace.insertBefore(nativeWrapper, workspace.querySelector('.ptb-content-with-sidebar-wrapper'));

        window.actualiseNavbarFeature.apply();
        expect(window.document.getElementById('toolshed-actualise-navbar-wrapper')).not.toBeNull();
        expect(window.document.getElementById('p2b-navbar-section-actualise')).not.toBeNull();

        nativeWrapper.innerHTML = `
            <div id="p2b-navbar">
                <div class="mo-navbar-sections">
                    <a id="p2b-navbar-section-analyze"></a>
                    <a id="p2b-navbar-section-orders"></a>
                    <div class="mo-navbar-sections-triangle"></div>
                </div>
            </div>
        `;

        window.actualiseNavbarFeature.apply();
        window.actualiseShortcutFeature.apply();

        expect(window.document.getElementById('toolshed-actualise-navbar-wrapper')).toBeNull();
        expect(nativeWrapper.querySelector('#p2b-navbar-section-actualise')).not.toBeNull();
        dom.window.close();
    });

    test.each([
        ['Digital', 'digital', '<a id="p2b-navbar-section-traffic"></a><a id="p2b-navbar-section-analyze"></a>'],
        ['Print', 'print', '']
    ])('hands off the %s Buy route once native Plan and Buy are mounted', (label, mediaType, extraSections) => {
        const { dom, window } = createFeature({ mediaType });
        window.actualiseNavbarFeature.initialize();
        window.eval(shortcutCode);
        window.actualiseShortcutFeature.initialize();

        window.history.replaceState(
            {},
            '',
            '#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=CP3GH64&ptb-mod=buy&ptb-ctx=digital&route=online'
        );

        const workspace = window.document.querySelector('.ptb-workspace-content-container');
        const content = workspace.querySelector('.ptb-content-with-sidebar-wrapper');
        const nativeWrapper = window.document.createElement('div');
        nativeWrapper.className = 'p2b-navbar-wrapper';
        nativeWrapper.innerHTML = `
            <div id="p2b-navbar">
                <div class="mo-navbar-sections">
                    <a id="p2b-navbar-section-plan"></a>
                    <a id="p2b-navbar-section-buy"></a>
                    ${extraSections}
                    <div class="mo-navbar-sections-triangle"></div>
                </div>
            </div>
        `;
        workspace.insertBefore(nativeWrapper, content);

        window.actualiseNavbarFeature.apply();
        window.actualiseShortcutFeature.apply();

        expect(window.document.getElementById('toolshed-actualise-navbar-wrapper')).toBeNull();
        expect(window.document.querySelectorAll('.p2b-navbar-wrapper')).toHaveLength(1);
        expect(nativeWrapper.querySelector('#p2b-navbar-section-actualise')).not.toBeNull();
        dom.window.close();
    });

    test.each([
        ['Digital', 'digital'],
        ['Print', 'print']
    ])('does not show the native %s Orders bar while entering Actualise', (label, mediaType) => {
        const { dom, window } = createFeature({
            mediaType,
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=CP3GH64&ptb-mod=buy&ptb-ctx=orderSummary&showOrders=true'
        });
        window.actualiseNavbarFeature.initialize();

        const workspace = window.document.querySelector('.ptb-workspace-content-container');
        const content = workspace.querySelector('.ptb-content-with-sidebar-wrapper');
        const nativeWrapper = window.document.createElement('div');
        nativeWrapper.className = 'p2b-navbar-wrapper';
        nativeWrapper.innerHTML = `
            <div id="p2b-navbar">
                <div class="mo-navbar-sections">
                    <a id="p2b-navbar-section-plan"></a>
                    <a id="p2b-navbar-section-buy"></a>
                    <a id="p2b-navbar-section-orders"></a>
                    <div class="mo-navbar-sections-triangle"></div>
                </div>
            </div>
        `;
        workspace.insertBefore(nativeWrapper, content);

        window.history.replaceState(
            {},
            '',
            '#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=CP3GH64&ptb-mod=buy&ptb-ctx=actualize&route=actualize&mos=2026-07-20'
        );
        window.actualiseNavbarFeature.apply();

        const visibleWrappers = Array.from(window.document.querySelectorAll('.p2b-navbar-wrapper'))
            .filter(wrapper => wrapper.style.display !== 'none');
        expect(visibleWrappers).toHaveLength(1);
        expect(visibleWrappers[0].id).toBe('toolshed-actualise-navbar-wrapper');

        window.history.replaceState(
            {},
            '',
            '#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=CP3GH64&ptb-mod=buy&ptb-ctx=orderSummary&showOrders=true'
        );
        window.actualiseNavbarFeature.apply();

        expect(nativeWrapper.style.display).not.toBe('none');
        expect(window.document.getElementById('toolshed-actualise-navbar-wrapper')).toBeNull();
        dom.window.close();
    });

    test.each([
        ['Digital', 'digital', '<a id="p2b-navbar-section-analyze"></a>'],
        ['Print', 'print', '']
    ])('creates native Orders before removing the %s Actualise bar', (label, mediaType, extraSections) => {
        const { dom, window } = createFeature({ mediaType });
        window.actualiseNavbarFeature.initialize();

        const workspace = window.document.querySelector('.ptb-workspace-content-container');
        const content = workspace.querySelector('.ptb-content-with-sidebar-wrapper');
        const nativeWrapper = window.document.createElement('div');
        nativeWrapper.className = 'p2b-navbar-wrapper';
        nativeWrapper.innerHTML = `
            <div id="p2b-navbar">
                <div class="mo-navbar-sections">
                    <a id="p2b-navbar-section-plan"></a>
                    <a id="p2b-navbar-section-buy"></a>
                    ${extraSections}
                    <div class="mo-navbar-sections-triangle"></div>
                </div>
            </div>
        `;
        workspace.insertBefore(nativeWrapper, content);

        window.campaignFeature = {
            ensureOrdersNavigation: jest.fn(() => {
                const orders = window.document.createElement('a');
                orders.id = 'p2b-navbar-section-orders';
                nativeWrapper.querySelector('.mo-navbar-sections').appendChild(orders);
            })
        };
        window.history.replaceState(
            {},
            '',
            '#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=CP3GH64&ptb-mod=buy&ptb-ctx=digital&route=online'
        );

        window.actualiseNavbarFeature.apply();

        expect(window.campaignFeature.ensureOrdersNavigation).toHaveBeenCalledTimes(1);
        expect(nativeWrapper.querySelector('#p2b-navbar-section-orders')).not.toBeNull();
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

    test('derives an inclusive month range from the campaign dates', () => {
        const { dom, window } = createFeature();

        expect(window.actualiseNavbarFeature.getCampaignMonthRange(
            '(AUG 1, 2025 - JUL 30, 2026)'
        ).map(month => month.key)).toEqual([
            '2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01',
            '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'
        ]);
        expect(window.actualiseNavbarFeature.getCampaignMonthRange(
            '(JUN 23 - JUL 20, 2026)'
        ).map(month => month.key)).toEqual(['2026-06', '2026-07']);
        dom.window.close();
    });

    test('renders all campaign months alongside the native Actualise pager', () => {
        const { dom, window } = createFeature();
        const dateField = window.document.createElement('div');
        dateField.className = 'mo-date-field-wrapper';
        dateField.textContent = '(AUG 1, 2025 - JUL 30, 2026)';
        window.document.body.appendChild(dateField);

        const toolbar = window.document.createElement('div');
        toolbar.id = 'actualize-toolbar';
        const monthGroup = window.document.createElement('div');
        monthGroup.className = 'actual-months-group';
        const nativeGroup = window.document.createElement('mo-button-group');
        nativeGroup.className = 'month-button-group';
        monthGroup.appendChild(nativeGroup);
        ['Aug 25', 'Sep 25', 'Oct 25', 'Nov 25', 'Dec 25', 'Jan 26'].forEach(label => {
            const item = window.document.createElement('mo-button-group-item');
            item.textContent = label;
            item.setAttribute('aria-pressed', label === 'Dec 25' ? 'true' : 'false');
            nativeGroup.appendChild(item);
        });
        const next = window.document.createElement('mo-button-group-item');
        next.setAttribute('value', 'Next');
        nativeGroup.appendChild(next);
        toolbar.appendChild(monthGroup);
        window.document.body.appendChild(toolbar);

        window.actualiseNavbarFeature.initialize();
        window.actualiseNavbarFeature.apply();

        const selector = window.document.getElementById('toolshed-actualise-month-selector');
        expect(selector).not.toBeNull();
        expect(selector.getAttribute('aria-label')).toBe('Actualise months');
        expect(Array.from(selector.querySelectorAll('button')).map(button => button.textContent)).toEqual([
            'Aug 25', 'Sep 25', 'Oct 25', 'Nov 25', 'Dec 25', 'Jan 26',
            'Feb 26', 'Mar 26', 'Apr 26', 'May 26', 'Jun 26', 'Jul 26'
        ]);
        expect(nativeGroup.getAttribute('data-toolshed-actualise-native-month-group')).toBe('true');
        expect(selector.querySelector('[aria-pressed="true"]').textContent).toBe('Dec 25');
        dom.window.close();
    });

    test('keeps a distant month highlighted while the native pager crosses intermediate months', async () => {
        const { dom, window } = createFeature();
        const dateField = window.document.createElement('div');
        dateField.className = 'mo-date-field-wrapper';
        dateField.textContent = '(AUG 1, 2025 - OCT 30, 2025)';
        window.document.body.appendChild(dateField);

        const toolbar = window.document.createElement('div');
        toolbar.id = 'actualize-toolbar';
        const monthGroup = window.document.createElement('div');
        monthGroup.className = 'actual-months-group';
        const nativeGroup = window.document.createElement('mo-button-group');
        nativeGroup.className = 'month-button-group';
        monthGroup.appendChild(nativeGroup);
        ['Aug 25', 'Sep 25'].forEach((label, index) => {
            const item = window.document.createElement('mo-button-group-item');
            item.textContent = label;
            item.setAttribute('aria-pressed', index === 0 ? 'true' : 'false');
            nativeGroup.appendChild(item);
        });
        const next = window.document.createElement('mo-button-group-item');
        next.setAttribute('value', 'Next');
        next.addEventListener('click', () => {
            nativeGroup.querySelectorAll('mo-button-group-item').forEach(item => item.setAttribute('aria-pressed', 'false'));
            nativeGroup.querySelectorAll('mo-button-group-item')[1].setAttribute('aria-pressed', 'true');
            const targetItem = window.document.createElement('mo-button-group-item');
            targetItem.textContent = 'Oct 25';
            targetItem.setAttribute('aria-pressed', 'false');
            targetItem.addEventListener('click', () => {
                nativeGroup.querySelectorAll('mo-button-group-item').forEach(item => item.setAttribute('aria-pressed', 'false'));
                targetItem.setAttribute('aria-pressed', 'true');
            });
            nativeGroup.insertBefore(targetItem, next);
        });
        nativeGroup.appendChild(next);
        toolbar.appendChild(monthGroup);
        window.document.body.appendChild(toolbar);

        window.actualiseNavbarFeature.initialize();
        window.actualiseNavbarFeature.apply();
        const target = window.document.querySelector('button[data-month="2025-10"]');
        target.click();
        await new Promise(resolve => window.setTimeout(resolve, 10));

        expect(target.getAttribute('aria-pressed')).toBe('true');
        expect(target.classList.contains('is-selected')).toBe(true);
        dom.window.close();
    });
});

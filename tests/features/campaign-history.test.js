const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const featureScript = fs.readFileSync(
    path.resolve(__dirname, '../../features/campaign-history.js'),
    'utf8'
);
const contentCss = fs.readFileSync(path.resolve(__dirname, '../../content.css'), 'utf8');

function cssRule(css, selector) {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1] || '';
}

const campaignUrl = 'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=CP3FMRK&ptb-mod=buy&route=online';
const dashboardUrl = 'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=cm-dashboard&route=campaigns';

function createStorageArea(store) {
    return {
        get: jest.fn((keys, callback) => {
            const result = {};
            if (typeof keys === 'string') {
                if (store[keys] !== undefined) result[keys] = store[keys];
            } else if (keys && typeof keys === 'object') {
                Object.keys(keys).forEach(key => {
                    result[key] = store[key] === undefined ? keys[key] : store[key];
                });
            } else {
                Object.assign(result, store);
            }
            callback?.(result);
            return Promise.resolve(result);
        }),
        set: jest.fn((values, callback) => {
            Object.assign(store, values);
            callback?.();
            return Promise.resolve();
        })
    };
}

async function flushPromises() {
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

function wait(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function createPage({
    url = campaignUrl,
    settings = {},
    entries = [],
    fieldMarkup = '',
    location = '',
    navigationMarkup = `
        <div id="ptb-header">
            <nav id="prisma-top-navigation">
                <a id="prisma-campaigns" href="#campaigns">Campaigns</a>
                <a id="prisma-reports" href="#reports">Reports</a>
            </nav>
        </div>`
} = {}) {
    const dom = new JSDOM(`<!doctype html><html><head></head><body>
        ${navigationMarkup}
        <div class="p2b-navbar-wrapper">
            <a id="p2b-navbar-section-buy" class="mo-navbar-section active" href="#buy">BUY</a>
            <a id="p2b-navbar-section-analyze" class="mo-navbar-section" href="#analyze">ANALYSE</a>
            <div class="mo-navbar-sections-triangle"></div>
        </div>
        <div class="mo-page-header">
            <span class="mo-campaign-name-wrapper">TCCC ZeroZero July Burst</span>
        </div>
        <div class="buy-details-wrapper">CP3FMRK | D/LB9/2/245</div>
        ${fieldMarkup}
    </body></html>`, {
        url,
        runScripts: 'dangerously'
    });

    if (location) {
        const contextMenu = dom.window.document.createElement('mo-banner-sub-context-menu');
        const contextShadow = contextMenu.attachShadow({ mode: 'open' });
        const contextLabel = dom.window.document.createElement('div');
        contextLabel.id = 'user-context-menu-label';
        contextLabel.textContent = location;
        contextShadow.appendChild(contextLabel);
        dom.window.document.body.appendChild(contextMenu);
    }

    const syncStore = {
        campaignHistoryEnabled: true,
        campaignHistoryLoggingEnabled: true,
        ...settings
    };
    const localStore = { campaignHistoryEntries: entries };
    const changeListeners = [];
    const sync = createStorageArea(syncStore);
    const local = createStorageArea(localStore);

    dom.window.chrome = {
        runtime: { lastError: null },
        storage: {
            sync,
            local,
            onChanged: { addListener: listener => changeListeners.push(listener) }
        }
    };
    dom.window.eval(featureScript);
    dom.window.campaignHistoryFeature.initialize();

    return { dom, localStore, changeListeners };
}

describe('campaign history feature', () => {
    test('uses the reminder popup pink for the panel accent', () => {
        expect(contentCss).toMatch(/--toolshed-history-reminder-pink:\s*#ff3d80/i);
        expect(cssRule(contentCss, '#toolshed-campaign-history-panel::before'))
            .toMatch(/background:\s*var\(--toolshed-history-reminder-pink\)/i);
        expect(cssRule(contentCss, '#toolshed-campaign-history-panel'))
            .toMatch(/transition:[\s\S]*transform var\(--toolshed-history-motion-duration\)/i);
        expect(cssRule(contentCss, '#toolshed-campaign-history-panel.is-open'))
            .toMatch(/transform:\s*translate3d\(0,\s*0,\s*0\)/i);
        expect(cssRule(contentCss, '#toolshed-campaign-history-panel.is-expanded'))
            .toMatch(/top:\s*max\(56px,\s*5vh\)/i);
        expect(cssRule(contentCss, '#toolshed-campaign-history-panel.is-expanded'))
            .toMatch(/left:\s*5vw/i);
        expect(cssRule(contentCss, '.toolshed-campaign-history-match'))
            .toMatch(/background:\s*var\(--toolshed-history-highlight\)/i);
    });

    test('adds a native-looking History navigation link and records searchable campaign metadata', async () => {
        const { dom, localStore } = createPage({
            fieldMarkup: '<div data-cy="client-name">The Coca-Cola Company</div><div data-cy="supplier">Meta</div>',
            location: 'NGMCLON'
        });
        const { document, campaignHistoryFeature } = dom.window;

        await flushPromises();

        const navLink = document.getElementById('toolshed-campaign-history-nav');
        expect(navLink).not.toBeNull();
        expect(navLink.parentElement.id).toBe('prisma-top-navigation');
        expect(navLink.previousElementSibling.id).toBe('prisma-reports');
        expect(document.querySelector('.p2b-navbar-wrapper #toolshed-campaign-history-nav')).toBeNull();
        expect(navLink.textContent).toContain('History');
        expect(navLink.querySelector('svg')).not.toBeNull();

        expect(localStore.campaignHistoryEntries).toHaveLength(1);
        expect(localStore.campaignHistoryEntries[0]).toMatchObject({
            campaignName: 'TCCC ZeroZero July Burst',
            clientName: 'The Coca-Cola Company',
            supplier: 'Meta',
            location: 'NGMCLON',
            campaignId: 'CP3FMRK',
            cpNumber: 'CP3FMRK',
            clPrCa: 'LB9/2/245'
        });

        navLink.click();
        await flushPromises();

        const panel = document.getElementById('toolshed-campaign-history-panel');
        expect(panel.hidden).toBe(false);
        expect(document.querySelector('.toolshed-campaign-history-helper').textContent)
            .toBe('Search the campaigns you have visited by campaign name, client name, CP number, CL/PR/CA reference or supplier.');
        expect(document.querySelector('.toolshed-campaign-history-count').textContent)
            .toBe('1 campaign visited');
        expect(document.querySelector('.toolshed-campaign-history-result').textContent)
            .toContain('LocationNGMCLON');
        const input = document.getElementById('toolshed-campaign-history-search-input');
        input.value = 'Meta';
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        expect(document.querySelectorAll('.toolshed-campaign-history-result')).toHaveLength(1);
        expect(document.querySelectorAll('.toolshed-campaign-history-match'))
            .toHaveLength(1);
        expect(document.querySelector('.toolshed-campaign-history-match').textContent).toBe('Meta');
        ['TCCC ZeroZero', 'The Coca-Cola Company', 'CP3FMRK', 'LB9/2/245', 'Meta']
            .forEach(query => expect(campaignHistoryFeature.filterHistoryEntries(query)).toHaveLength(1));
        expect(campaignHistoryFeature.filterHistoryEntries('NGMCLON')).toHaveLength(1);

        input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(input.value).toBe('');
        expect(panel.hidden).toBe(false);

        input.focus();
        const expandButton = document.querySelector('.toolshed-campaign-history-expand');
        const pointerDown = new dom.window.MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            button: 0
        });
        expandButton.dispatchEvent(pointerDown);
        expect(pointerDown.defaultPrevented).toBe(true);
        expandButton.click();
        expect(panel.classList).toContain('is-expanded');
        expect(panel.getAttribute('aria-modal')).toBe('true');
        expect(expandButton.getAttribute('aria-label')).toBe('Minimise campaign history');
        expect(expandButton.querySelector('.toolshed-campaign-history-button-label').textContent)
            .toBe('Minimise');
        expect(document.activeElement).toBe(input);

        const expandedRect = {
            top: 50,
            left: 96,
            width: 1728,
            height: 922,
            right: 1824,
            bottom: 972
        };
        const collapsedRect = {
            top: 62,
            left: 1162,
            width: 640,
            height: 400,
            right: 1802,
            bottom: 462
        };
        panel.getBoundingClientRect = jest.fn(() => {
            if (panel.classList.contains('is-expanded')) return expandedRect;
            if (panel.style.transition === 'none') return collapsedRect;
            return expandedRect;
        });

        expandButton.dispatchEvent(new dom.window.MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            button: 0
        }));
        expandButton.click();
        expect(panel.classList).not.toContain('is-expanded');
        expect(expandButton.getAttribute('aria-label')).toBe('Expand campaign history');
        expect(document.activeElement).toBe(input);
        await wait(300);
        expect(panel.style.left).toBe(`${collapsedRect.left}px`);
        expect(panel.style.width).toBe(`${collapsedRect.width}px`);
        expect(panel.style.right).toBe('auto');

        document.querySelector('.toolshed-campaign-history-close').click();
        expect(panel.hidden).toBe(false);
        expect(panel.classList).toContain('is-closing');
        await wait(300);
        expect(panel.hidden).toBe(true);

        dom.window.close();
    });

    test('uses campaign count wording for the full history and filtered results', async () => {
        const { dom } = createPage({
            settings: { campaignHistoryLoggingEnabled: false },
            entries: [
                { key: 'campaign:one', campaignName: 'One', firstVisitedAt: 1, lastVisitedAt: 1 },
                { key: 'campaign:two', campaignName: 'Two', firstVisitedAt: 2, lastVisitedAt: 2 },
                { key: 'campaign:three', campaignName: 'Three', firstVisitedAt: 3, lastVisitedAt: 3 }
            ]
        });
        const { document } = dom.window;

        await flushPromises();
        document.getElementById('toolshed-campaign-history-nav').click();
        await flushPromises();
        expect(document.querySelector('.toolshed-campaign-history-count').textContent)
            .toBe('3 campaigns visited');

        const input = document.getElementById('toolshed-campaign-history-search-input');
        input.value = 'Two';
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        expect(document.querySelector('.toolshed-campaign-history-count').textContent)
            .toBe('1 campaign visited');
        dom.window.close();
    });

    test('adds the current location to an existing campaign entry recorded before location tracking', async () => {
        const { dom, localStore } = createPage({
            location: 'NGMCLON',
            entries: [{
                key: 'campaign:cp3fmrk',
                campaignId: 'CP3FMRK',
                campaignName: 'TCCC ZeroZero July Burst',
                firstVisitedAt: 1,
                lastVisitedAt: 1,
                visitCount: 1
            }]
        });

        await flushPromises();

        expect(localStore.campaignHistoryEntries).toHaveLength(1);
        expect(localStore.campaignHistoryEntries[0].location).toBe('NGMCLON');
        expect(localStore.campaignHistoryEntries[0].key).toBe('campaign:cp3fmrk@ngmclon');
        dom.window.close();
    });

    test('finds History in a shell without #ptb-header and restores its furthest-right position', async () => {
        const { dom } = createPage({
            navigationMarkup: `
                <header class="global-header">
                    <nav class="global-primary-navigation">
                        <a href="#campaigns">Campaigns</a>
                        <a href="#reports">Reports</a>
                    </nav>
                </header>`
        });
        const { document, campaignHistoryFeature } = dom.window;

        await flushPromises();

        const nav = document.querySelector('.global-primary-navigation');
        const navLink = document.getElementById('toolshed-campaign-history-nav');
        expect(navLink).not.toBeNull();
        expect(navLink.parentElement).toBe(nav);
        expect(nav.lastElementChild).toBe(navLink);

        const nativeOption = document.createElement('a');
        nativeOption.href = '#help';
        nativeOption.textContent = 'Help';
        nav.appendChild(nativeOption);
        campaignHistoryFeature.apply();
        expect(nav.lastElementChild).toBe(navLink);

        dom.window.close();
    });

    test('adds a visible anchor to the Prisma banner module container inside nested shadow roots', async () => {
        const { dom } = createPage({ navigationMarkup: '' });
        const { document } = dom.window;
        await flushPromises();
        const banner = document.createElement('mo-banner');
        const bannerShadow = banner.attachShadow({ mode: 'open' });
        const moduleContainer = document.createElement('div');
        moduleContainer.id = 'mo-banner-module-container';

        [
            ['mo-banner-module-prsm-cm-spa', 'Campaigns', '#campaigns'],
            ['mo-banner-module-prsm-cvr', 'Reports', '#reports']
        ].forEach(([id, label, href]) => {
            const module = document.createElement('mo-banner-module');
            module.id = id;
            const moduleShadow = module.attachShadow({ mode: 'open' });
            const menu = document.createElement('mo-menu');
            const menuShadow = menu.attachShadow({ mode: 'open' });
            const nativeLink = document.createElement('a');
            nativeLink.href = href;
            nativeLink.textContent = label;
            menuShadow.appendChild(nativeLink);
            moduleShadow.appendChild(menu);
            moduleContainer.appendChild(module);
        });

        bannerShadow.appendChild(moduleContainer);
        document.body.prepend(banner);
        await flushPromises();

        const historyLink = bannerShadow.querySelector('#toolshed-campaign-history-nav');
        expect(historyLink).not.toBeNull();
        expect(historyLink.tagName).toBe('A');
        expect(historyLink.parentElement).toBe(moduleContainer);
        expect(moduleContainer.lastElementChild).toBe(historyLink);
        expect(historyLink.textContent).toContain('History');
        expect(bannerShadow.querySelector('#toolshed-campaign-history-shadow-styles')).not.toBeNull();

        dom.window.close();
    });

    test('keeps the History link available from the Prisma dashboard without logging a visit', async () => {
        const { dom, localStore } = createPage({ url: dashboardUrl });
        const { document } = dom.window;

        await flushPromises();

        const navLink = document.getElementById('toolshed-campaign-history-nav');
        expect(navLink?.parentElement.id).toBe('prisma-top-navigation');
        expect(localStore.campaignHistoryEntries).toHaveLength(0);
        navLink.click();
        await flushPromises();
        expect(document.getElementById('toolshed-campaign-history-panel').hidden).toBe(false);
        dom.window.close();
    });

    test('captures suppliers from Prisma Buy grouping rows when no Supplier label is rendered', async () => {
        const { dom, localStore } = createPage({
            fieldMarkup: `
                <div id="grid-container_hot">
                    <div class="ht_master">
                        <table class="htCore"><tbody>
                            <tr role="row">
                                <td></td><td></td><td class="group-cell hierarchical-level-group-0"></td>
                                <td class="group-cell hierarchical-level-group-0 hierarchical-name">Display</td>
                            </tr>
                            <tr role="row">
                                <td></td><td></td><td class="group-cell hierarchical-level-group-1"></td>
                                <td class="group-cell hierarchical-level-group-1 hierarchical-name">WPP MS ADV DOOH (GBP)</td>
                            </tr>
                            <tr role="row"><td></td><td></td><td></td><td class="hierarchical-name">DOOH_London</td></tr>
                        </tbody></table>
                    </div>
                    <div class="fees-grid">
                        <table class="htCore"><tbody>
                            <tr role="row">
                                <td data-field="supplier">Meta Digital Service Charge (GBP)</td>
                            </tr>
                        </tbody></table>
                    </div>
                </div>`
        });

        await flushPromises();

        expect(dom.window.campaignHistoryFeature.getCampaignSnapshot().supplier)
            .toBe('WPP MS ADV DOOH (GBP) | Meta Digital Service Charge (GBP)');
        expect(localStore.campaignHistoryEntries).toHaveLength(1);
        expect(localStore.campaignHistoryEntries[0].supplier)
            .toBe('WPP MS ADV DOOH (GBP) | Meta Digital Service Charge (GBP)');
        expect(dom.window.campaignHistoryFeature.filterHistoryEntries('WPP')).toHaveLength(1);
        expect(dom.window.campaignHistoryFeature.filterHistoryEntries('Meta Digital')).toHaveLength(1);
        dom.window.close();
    });

    test('does not show the link when viewing is disabled and can be re-enabled live', async () => {
        const { dom, changeListeners } = createPage({
            settings: { campaignHistoryEnabled: false }
        });
        const { document } = dom.window;

        await flushPromises();
        expect(document.getElementById('toolshed-campaign-history-nav')).toBeNull();

        changeListeners[0](
            { campaignHistoryEnabled: { newValue: true } },
            'sync'
        );
        await flushPromises();
        expect(document.getElementById('toolshed-campaign-history-nav')).not.toBeNull();

        document.getElementById('toolshed-campaign-history-nav').click();
        changeListeners[0](
            { campaignHistoryEnabled: { newValue: false } },
            'sync'
        );
        expect(document.getElementById('toolshed-campaign-history-nav')).toBeNull();
        expect(document.getElementById('toolshed-campaign-history-panel').hidden).toBe(true);

        changeListeners[0](
            { campaignHistoryEnabled: { newValue: true } },
            'sync'
        );
        expect(document.getElementById('toolshed-campaign-history-nav')).not.toBeNull();
        dom.window.close();
    });

    test('does not record visits while logging is disabled, then records the current campaign when re-enabled', async () => {
        const { dom, localStore, changeListeners } = createPage({
            settings: { campaignHistoryLoggingEnabled: false }
        });

        await flushPromises();
        expect(localStore.campaignHistoryEntries).toHaveLength(0);

        changeListeners[0](
            { campaignHistoryLoggingEnabled: { newValue: true } },
            'sync'
        );
        await flushPromises();
        expect(localStore.campaignHistoryEntries).toHaveLength(1);
        dom.window.close();
    });
});

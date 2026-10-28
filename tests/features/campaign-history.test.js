const fs = require('fs');
const { readScript } = require('../helpers/read-script');
const path = require('path');
const { JSDOM } = require('jsdom');
const { captureTrustedClicks } = require('../helpers/trusted-dom-event');

const featureScript = readScript(path.resolve(__dirname, '../../features/campaign-history.js'));
const contentCss = fs.readFileSync(path.resolve(__dirname, '../../content.css'), 'utf8') + fs.readFileSync(path.resolve(__dirname, '../../search-highlight.css'), 'utf8');

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

function setElementRect(element, { left, top, width, height }) {
    const rect = {
        x: left,
        y: top,
        left,
        top,
        right: left + width,
        bottom: top + height,
        width,
        height,
        toJSON: () => ({ left, top, right: left + width, bottom: top + height, width, height })
    };
    element.getBoundingClientRect = () => rect;
}

function setClientSize(element, width, height) {
    Object.defineProperties(element, {
        clientWidth: { configurable: true, value: width },
        clientHeight: { configurable: true, value: height }
    });
}

function createPrismaOverflowMenu(document) {
    const overflowOverlay = document.createElement('mo-overlay');
    overflowOverlay.setAttribute('role', 'menu');
    const overflowMenu = document.createElement('mo-banner-module-overflow-menu-content');
    const overflowShadow = overflowMenu.attachShadow({ mode: 'open' });
    const group = document.createElement('mo-menu-item-group');
    group.setAttribute('role', 'group');
    const reportsItem = document.createElement('mo-menu-item');
    reportsItem.id = 'prsm-cvr';
    reportsItem.setAttribute('role', 'menuitem');
    reportsItem.className = 'menu-item';
    const reportsLink = document.createElement('a');
    reportsLink.className = 'module-label';
    reportsLink.href = '#reports';
    const reportsLabel = document.createElement('div');
    reportsLabel.className = 'module-label-text';
    reportsLabel.textContent = 'Reports';
    reportsLink.appendChild(reportsLabel);
    reportsItem.appendChild(reportsLink);
    group.appendChild(reportsItem);
    overflowShadow.appendChild(group);
    overflowOverlay.appendChild(overflowMenu);
    document.body.appendChild(overflowOverlay);
    return { overflowOverlay, overflowMenu, group };
}

function getHistoryOverflowItem(document) {
    return document.getElementById('toolshed-campaign-history-overflow-item')?.parentElement ||
        document.querySelector('mo-banner-module-overflow-menu-content')
            ?.shadowRoot?.querySelector('#toolshed-campaign-history-overflow-nav') || null;
}

function createPrismaBannerOverflow(document, {
    overflowVisible = true,
    availableWidth = 0,
    moduleWidths = { campaigns: 121, reports: 86 }
} = {}) {
    const banner = document.createElement('mo-banner');
    const bannerShadow = banner.attachShadow({ mode: 'open' });
    const bannerLayout = document.createElement('div');
    bannerLayout.className = 'banner';
    const moduleContainer = document.createElement('div');
    moduleContainer.id = 'mo-banner-module-container';

    const createModule = (id, label, hidden = false, width = 0, left = 0) => {
        const module = document.createElement('mo-banner-module');
        module.id = id;
        module.setAttribute('data-module-id', id.replace('mo-banner-module-', ''));
        if (hidden) {
            module.classList.add('hidden');
            module.style.visibility = 'hidden';
        }

        const moduleShadow = module.attachShadow({ mode: 'open' });
        const menu = document.createElement('mo-menu');
        const menuShadow = menu.attachShadow({ mode: 'open' });
        const link = document.createElement('a');
        link.className = 'module-label';
        link.href = `#${label.toLowerCase()}`;
        link.textContent = label;
        menuShadow.appendChild(link);
        moduleShadow.appendChild(menu);
        setElementRect(module, { left, top: 0, width, height: 40 });
        return module;
    };

    moduleContainer.append(
        createModule('mo-banner-module-prsm-cm-spa', 'Campaigns', false, moduleWidths.campaigns, 0),
        createModule('mo-banner-module-prsm-cvr', 'Reports', true, moduleWidths.reports, moduleWidths.campaigns)
    );
    setClientSize(moduleContainer, availableWidth, 40);
    setElementRect(moduleContainer, { left: 0, top: 0, width: availableWidth, height: 40 });

    const overflowMenu = document.createElement('mo-banner-module-overflow-menu');
    overflowMenu.style.visibility = overflowVisible ? 'visible' : 'hidden';
    setElementRect(overflowMenu, { left: availableWidth, top: 0, width: 32, height: 40 });
    const overflowShadow = overflowMenu.attachShadow({ mode: 'open' });
    const widget = document.createElement('mo-banner-widget');
    const widgetShadow = widget.attachShadow({ mode: 'open' });
    const overflowLabelLayout = document.createElement('div');
    overflowLabelLayout.className = 'overflow-label-layout';
    const countLabel = document.createElement('div');
    countLabel.textContent = '1';
    overflowLabelLayout.append(countLabel, document.createElement('div'));
    widgetShadow.appendChild(overflowLabelLayout);
    overflowShadow.appendChild(widget);

    bannerLayout.append(moduleContainer, overflowMenu);
    bannerShadow.appendChild(bannerLayout);
    document.body.prepend(banner);
    return { banner, bannerShadow, moduleContainer, overflowMenu, countLabel };
}

function clickHistoryMenuItem(document) {
    getHistoryOverflowItem(document)?.querySelector('a.module-label')?.click();
}

function createPage({
    url = campaignUrl,
    settings = {},
    entries = [],
    fieldMarkup = '',
    location = '',
    overflowMenu = true,
    navigationMarkup = `
        <div id="ptb-header">
            <nav id="prisma-top-navigation">
                <a id="prisma-campaigns" href="#campaigns">Campaigns</a>
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

    if (overflowMenu) createPrismaOverflowMenu(dom.window.document);

    const syncStore = {
        campaignHistoryEnabled: true,
        campaignHistoryLoggingEnabled: true,
        ...settings
    };
    const localStore = { campaignHistoryEntries: entries };
    const changeListeners = [];
    const sync = createStorageArea(syncStore);
    const local = createStorageArea(localStore);

    const trustedClick = captureTrustedClicks(dom.window);
    dom.window.chrome = {
        runtime: { lastError: null, sendMessage: jest.fn().mockResolvedValue({ status: 'success' }) },
        storage: {
            sync,
            local,
            onChanged: { addListener: listener => changeListeners.push(listener) }
        }
    };
    dom.window.eval(readScript(path.resolve(__dirname, '../../search-highlight.js')));
    dom.window.eval(featureScript);
    dom.window.campaignHistoryFeature.initialize();

    return { dom, localStore, changeListeners, trustedClick };
}

describe('campaign history feature', () => {
    test('campaign metadata survives an inaccessible embedded frame', async () => {
        const { dom } = createPage();
        let frame;
        try {
            await flushPromises();
            frame = dom.window.document.createElement('iframe');
            dom.window.document.body.append(frame);
            const inaccessible = jest.fn(() => { throw new dom.window.DOMException('Blocked cross-origin frame', 'SecurityError'); });
            Object.defineProperty(frame, 'contentDocument', { configurable: true, get: inaccessible });
            const snapshot = dom.window.campaignHistoryFeature.getCampaignSnapshot();
            expect(snapshot.campaignName).toBe('TCCC ZeroZero July Burst');
            expect(inaccessible).toHaveBeenCalled();
        } finally {
            if (frame) delete frame.contentDocument;
            dom.window.close();
        }
    });
    test.each(['throw', 'promise', 'callback'])('stops quietly after extension invalidation via %s', async mode => {
        const { dom } = createPage({ settings: { campaignHistoryLoggingEnabled: false } });
        try {
            await flushPromises();
            const { window } = dom;
            const warn = jest.spyOn(window.console, 'warn').mockImplementation(() => {});
            const get = window.chrome.storage.local.get;
            get.mockImplementation((keys, callback) => {
                if (mode === 'throw') throw new Error('Extension context invalidated.');
                if (mode === 'promise') return Promise.reject(new Error('Extension context invalidated.'));
                window.chrome.runtime.lastError = { message: 'Extension context invalidated.' };
                callback();
                window.chrome.runtime.lastError = null;
            });
            window.campaignHistoryFeature.open();
            await flushPromises();
            window.campaignHistoryFeature.apply();
            window.dispatchEvent(new window.Event('pageshow'));
            expect(window.campaignHistoryFeature.open()).toBe(false);
            expect(get).toHaveBeenCalledTimes(1);
            expect(warn).not.toHaveBeenCalled();
            expect(window.document.getElementById('toolshed-campaign-history-nav')).toBeNull();
            expect(getHistoryOverflowItem(window.document)).toBeNull();
        } finally {
            dom.window.close();
        }
    });

    test('still warns and retries a genuine campaign storage failure', async () => {
        const { dom } = createPage();
        try {
            await flushPromises();
            const { window } = dom;
            const warn = jest.spyOn(window.console, 'warn').mockImplementation(() => {});
            window.chrome.storage.local.set.mockImplementationOnce(() => Promise.reject(new Error('Storage quota exceeded')));
            window.document.querySelector('.mo-campaign-name-wrapper').textContent = 'Updated campaign';
            window.campaignHistoryFeature.apply();
            await flushPromises();
            expect(warn).toHaveBeenCalledWith('[Campaign History] Could not save campaign visit.', expect.any(Error));
            window.campaignHistoryFeature.apply();
            await flushPromises();
            expect(window.chrome.storage.local.set).toHaveBeenCalledTimes(3);
        } finally {
            dom.window.close();
        }
    });

    test('does not retry or warn when saving a visit loses the extension context', async () => {
        const { dom } = createPage();
        try {
            await flushPromises();
            const { window } = dom;
            const warn = jest.spyOn(window.console, 'warn').mockImplementation(() => {});
            window.chrome.storage.local.set.mockImplementationOnce(() => Promise.reject(new Error('Extension context invalidated.')));
            window.document.querySelector('.mo-campaign-name-wrapper').textContent = 'Updated campaign';
            window.campaignHistoryFeature.apply();
            await flushPromises();
            window.campaignHistoryFeature.apply();
            window.campaignHistoryFeature.handleRouteChange();
            window.campaignHistoryFeature.apply();
            await flushPromises();
            expect(window.chrome.storage.local.set).toHaveBeenCalledTimes(2);
            expect(warn).not.toHaveBeenCalled();
        } finally {
            dom.window.close();
        }
    });
    test('unrelated grid mutations do not trigger a full navigation rescan', async () => {
        const { dom } = createPage();
        await flushPromises();
        const { document } = dom.window;
        expect(getHistoryOverflowItem(document)).not.toBeNull();
        const querySelectorAll = jest.spyOn(document, 'querySelectorAll');
        const grid = document.createElement('div');
        grid.id = 'unrelated-grid';
        document.body.appendChild(grid);
        for (let index = 0; index < 40; index += 1) {
            const row = document.createElement('div');
            row.textContent = `row ${index}`;
            grid.appendChild(row);
        }
        await flushPromises();
        expect(querySelectorAll.mock.calls.filter(([selector]) => selector === '*')).toHaveLength(0);
        dom.window.close();
    });
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
            .toMatch(/background:\s*var\(--toolshed-history-highlight,\s*#f3e7ad\)/i);
        expect(cssRule(contentCss, '.toolshed-campaign-history-result button'))
            .toMatch(/text-indent:\s*0/i);
        expect(cssRule(contentCss, '.toolshed-campaign-history-result-copy'))
            .toMatch(/padding-left:\s*0/i);
        expect(cssRule(contentCss, '.toolshed-campaign-history-helper'))
            .toMatch(/margin:\s*8px 20px 6px 22px/i);
        expect(cssRule(contentCss, '.toolshed-campaign-history-status'))
            .toMatch(/min-height:\s*0/i);
        expect(cssRule(contentCss, '.toolshed-campaign-history-page-button'))
            .toMatch(/width:\s*52px/i);
        expect(cssRule(contentCss, '.toolshed-campaign-history-page-button'))
            .toMatch(/height:\s*32px/i);
        expect(cssRule(contentCss, '.toolshed-campaign-history-nav'))
            .toMatch(/gap:\s*6px/i);
        expect(featureScript)
            .toMatch(/toolshed-campaign-history-nav-label[\s\S]*?translateY\(-0\.5px\)/i);
        expect(contentCss)
            .toMatch(/@keyframes\s+toolshed-campaign-history-page-next/);
        expect(contentCss)
            .toMatch(/@keyframes\s+toolshed-campaign-history-page-previous/);
        expect(contentCss)
            .toMatch(/prefers-reduced-motion:\s*reduce/);
    });

    test('uses page lifecycle events supported by Prisma permissions policy', () => {
        expect(featureScript)
            .toMatch(/window\.addEventListener\('pagehide',\s*removeNavigationObserver\)/);
        expect(featureScript)
            .toMatch(/window\.addEventListener\('pageshow',\s*handlePageShow\)/);
        expect(featureScript)
            .toMatch(/document\.addEventListener\('visibilitychange',\s*handleVisibilityChange\)/);
        expect(featureScript)
            .not.toMatch(/window\.addEventListener\('unload',/);
    });

    test('keeps History in the banner before Reports moves to overflow and records searchable campaign metadata', async () => {
        const { dom, localStore } = createPage({
            fieldMarkup: '<div data-cy="client-name">The Coca-Cola Company</div><div data-cy="supplier">Meta</div>',
            location: 'NGMCLON',
            overflowMenu: false,
            navigationMarkup: `
                <div id="ptb-header">
                    <nav id="prisma-top-navigation">
                        <a id="prisma-campaigns" href="#campaigns">Campaigns</a>
                        <a id="prisma-reports" href="#reports">Reports</a>
                    </nav>
                </div>`
        });
        const { document, campaignHistoryFeature } = dom.window;

        await flushPromises();

        const navLink = document.getElementById('toolshed-campaign-history-nav');
        expect(navLink).not.toBeNull();
        expect(navLink.parentElement.id).toBe('prisma-top-navigation');
        expect(navLink.previousElementSibling.id).toBe('prisma-reports');
        expect(getHistoryOverflowItem(document)).toBeNull();
        expect(document.querySelector('.p2b-navbar-wrapper #toolshed-campaign-history-nav')).toBeNull();
        expect(navLink.textContent).toContain('History');
        const navContent = navLink.querySelector('.toolshed-campaign-history-nav-content');
        const historyIcon = navContent.querySelector('.toolshed-campaign-history-icon-history');
        expect(navContent.children[0].textContent).toBe('History');
        expect(historyIcon).not.toBeNull();
        expect(historyIcon.querySelector('circle')).toBeNull();
        expect(historyIcon.querySelectorAll('path')).toHaveLength(3);
        expect(historyIcon.querySelector('[data-history-arrowhead]')).not.toBeNull();

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
        const supplierLabel = Array.from(document.querySelectorAll('.toolshed-campaign-history-metadata-label'))
            .find(label => label.textContent === 'Supplier');
        expect(supplierLabel?.textContent)
            .toBe('Supplier');
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
        await wait(20); // Install the outside-click listener before clicking the icon.
        expandButton.querySelector('svg path').dispatchEvent(new dom.window.MouseEvent('click', {
            bubbles: true
        }));
        expect(panel.classList).toContain('is-expanded');
        expect(panel.classList).not.toContain('is-closing');
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
        getHistoryOverflowItem(document).click();
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

    test('shows four campaigns per collapsed page and the full list when expanded', async () => {
        const entries = Array.from({ length: 7 }, (_value, index) => ({
            key: `campaign:${index + 1}`,
            campaignId: `CP${index + 1}`,
            campaignName: `Campaign ${index + 1}`,
            firstVisitedAt: 7 - index,
            lastVisitedAt: 7 - index,
            visitCount: 1
        }));
        const { dom } = createPage({
            settings: { campaignHistoryLoggingEnabled: false },
            entries
        });
        const { document } = dom.window;

        await flushPromises();
        getHistoryOverflowItem(document).click();
        await flushPromises();

        const panel = document.getElementById('toolshed-campaign-history-panel');
        const resultList = document.getElementById('toolshed-campaign-history-results');
        const pagination = document.getElementById('toolshed-campaign-history-pagination');
        const previousButton = document.querySelector('.toolshed-campaign-history-page-previous');
        const nextButton = document.querySelector('.toolshed-campaign-history-page-next');
        const pageIndicator = document.getElementById('toolshed-campaign-history-page-indicator');
        const getCampaignNames = () => Array.from(
            document.querySelectorAll('.toolshed-campaign-history-result-title')
        ).map(title => title.textContent);

        expect(getCampaignNames()).toEqual([
            'Campaign 1',
            'Campaign 2',
            'Campaign 3',
            'Campaign 4'
        ]);
        expect(pagination.hidden).toBe(false);
        expect(previousButton.disabled).toBe(true);
        expect(nextButton.disabled).toBe(false);
        expect(pageIndicator.textContent).toBe('1–4 of 7');

        nextButton.click();
        expect(getCampaignNames()).toEqual(['Campaign 5', 'Campaign 6', 'Campaign 7']);
        expect(previousButton.disabled).toBe(false);
        expect(nextButton.disabled).toBe(true);
        expect(pageIndicator.textContent).toBe('5–7 of 7');
        expect(resultList.classList).toContain('is-page-transitioning-next');

        previousButton.click();
        expect(getCampaignNames()).toEqual([
            'Campaign 1',
            'Campaign 2',
            'Campaign 3',
            'Campaign 4'
        ]);
        expect(resultList.classList).toContain('is-page-transitioning-previous');

        panel.querySelector('.toolshed-campaign-history-expand').click();
        expect(panel.classList).toContain('is-expanded');
        expect(pagination.hidden).toBe(true);
        expect(getCampaignNames()).toHaveLength(7);

        panel.querySelector('.toolshed-campaign-history-expand').click();
        expect(panel.classList).not.toContain('is-expanded');
        expect(getCampaignNames()).toHaveLength(4);
        expect(pagination.hidden).toBe(false);
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

    test('keeps History beside Reports in shells without #ptb-header', async () => {
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
        const historyLink = document.getElementById('toolshed-campaign-history-nav');
        expect(historyLink).not.toBeNull();
        expect(historyLink.parentElement).toBe(nav);
        expect(historyLink.previousElementSibling.textContent).toBe('Reports');
        expect(Array.from(nav.children, child => child.textContent)).toEqual(['Campaigns', 'Reports', expect.stringContaining('History')]);

        const nativeOption = document.createElement('a');
        nativeOption.href = '#help';
        nativeOption.textContent = 'Help';
        nav.appendChild(nativeOption);
        campaignHistoryFeature.apply();
        expect(nav.lastElementChild).toBe(nativeOption);
        expect(historyLink.nextElementSibling).toBe(nativeOption);

        dom.window.close();
    });

    test('adds History beside Reports inside Prisma’s banner module container', async () => {
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
        expect(historyLink.previousElementSibling.id).toBe('mo-banner-module-prsm-cvr');
        expect(Array.from(moduleContainer.children, child => child.id)).toEqual([
            'mo-banner-module-prsm-cm-spa',
            'mo-banner-module-prsm-cvr',
            'toolshed-campaign-history-nav'
        ]);

        dom.window.close();
    });

    test('moves History with Reports between the banner and its overflow menu', async () => {
        const { dom } = createPage({
            overflowMenu: false,
            navigationMarkup: `
                <div id="ptb-header">
                    <nav id="prisma-top-navigation">
                        <a id="prisma-campaigns" href="#campaigns">Campaigns</a>
                        <button id="prisma-campaigns-overflow" type="button" aria-label="More">•••</button>
                        <a id="prisma-reports" href="#reports">Reports</a>
                    </nav>
                </div>`
        });
        const { document } = dom.window;
        await flushPromises();

        const nav = document.getElementById('prisma-top-navigation');
        const directHistoryLink = document.getElementById('toolshed-campaign-history-nav');
        expect(directHistoryLink.previousElementSibling.id).toBe('prisma-reports');
        expect(directHistoryLink.nextElementSibling).toBeNull();

        const { group } = createPrismaOverflowMenu(document);
        const reportsItem = group.querySelector('#prsm-cvr');

        await flushPromises();
        expect(getHistoryOverflowItem(document)).toBeNull();

        document.getElementById('prisma-reports').remove();
        await flushPromises();

        const historyItem = getHistoryOverflowItem(document);
        expect(historyItem).not.toBeNull();
        expect(historyItem.tagName).toBe('MO-MENU-ITEM');
        expect(historyItem.querySelector('.module-label-text').textContent).toBe('History');
        expect(reportsItem.nextElementSibling).toBe(historyItem);
        expect(historyItem.className).toBe(reportsItem.className);
        expect(historyItem.querySelector('a.module-label').className)
            .toBe(reportsItem.querySelector('a.module-label').className);
        expect(historyItem.querySelector('.module-label-text').className)
            .toBe(reportsItem.querySelector('.module-label-text').className);
        expect(document.getElementById('toolshed-campaign-history-nav')).toBeNull();

        group.appendChild(document.createElement('mo-menu-item'));
        await flushPromises();
        expect(reportsItem.nextElementSibling).toBe(historyItem);

        historyItem.remove();
        await flushPromises();
        const restoredHistoryItem = getHistoryOverflowItem(document);
        expect(restoredHistoryItem).not.toBeNull();
        expect(restoredHistoryItem).not.toBe(historyItem);
        expect(reportsItem.nextElementSibling).toBe(restoredHistoryItem);

        const click = new dom.window.MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            composed: true
        });
        restoredHistoryItem.querySelector('a.module-label').dispatchEvent(click);
        await flushPromises();
        expect(click.defaultPrevented).toBe(true);
        expect(document.getElementById('toolshed-campaign-history-panel').hidden).toBe(false);

        await wait(15);
        const secondClick = new dom.window.MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            composed: true
        });
        restoredHistoryItem.querySelector('a.module-label').dispatchEvent(secondClick);
        expect(document.getElementById('toolshed-campaign-history-panel').classList.contains('is-closing')).toBe(true);

        const reportsLink = document.createElement('a');
        reportsLink.id = 'prisma-reports';
        reportsLink.href = '#reports';
        reportsLink.textContent = 'Reports';
        nav.appendChild(reportsLink);
        await flushPromises();
        expect(document.getElementById('toolshed-campaign-history-nav').previousElementSibling)
            .toBe(reportsLink);
        expect(getHistoryOverflowItem(document)).toBeNull();

        dom.window.close();
    });

    test('collapses History, Reports, then Campaigns into the responsive Prisma overflow', async () => {
        const { dom } = createPage({ navigationMarkup: '', overflowMenu: false });
        const { document, campaignHistoryFeature } = dom.window;
        const banner = createPrismaBannerOverflow(document, { availableWidth: 1 });

        try {
            await flushPromises();
            campaignHistoryFeature.apply();
            await flushPromises();

            const historyLink = banner.bannerShadow.querySelector('#toolshed-campaign-history-nav');
            expect(historyLink).not.toBeNull();
            expect(historyLink.classList.contains('toolshed-campaign-history-overflow-collapsed')).toBe(true);
            const menu = document.getElementById('toolshed-campaign-history-overflow-menu');
            expect(Array.from(menu.children).map(item => item.textContent)).toEqual([
                'History', 'Reports', 'Campaigns'
            ]);
            expect(banner.overflowMenu.classList.contains('toolshed-campaign-history-overflow-trigger'))
                .toBe(true);
            expect(banner.countLabel.textContent).toBe('3');
        } finally {
            dom.window.close();
        }
    });

    test('reveals Prisma’s overflow trigger when Reports is collapsed but the native trigger is hidden', async () => {
        const { dom } = createPage({ navigationMarkup: '', overflowMenu: false });
        const { document, campaignHistoryFeature } = dom.window;
        const banner = createPrismaBannerOverflow(document, { overflowVisible: false });
        const { group } = createPrismaOverflowMenu(document);

        try {
            await flushPromises();
            campaignHistoryFeature.apply();
            await flushPromises();

            expect(document.getElementById('toolshed-campaign-history-nav')).toBeNull();
            expect(getHistoryOverflowItem(document)).not.toBeNull();
            expect(banner.overflowMenu.classList.contains('toolshed-campaign-history-overflow-trigger'))
                .toBe(true);
            expect(banner.bannerShadow.querySelector('#toolshed-campaign-history-overflow-spacing-styles')
                .textContent).toContain('visibility: visible !important');
            const overflowLayoutStyles = banner.bannerShadow.querySelector('#toolshed-campaign-history-overflow-spacing-styles')
                .textContent;
            expect(overflowLayoutStyles).not.toContain('#mo-banner-module-container.');
            expect(group.querySelector('#toolshed-campaign-history-overflow-nav')).not.toBeNull();
        } finally {
            dom.window.close();
        }
    });

    test('observes the nav flex slot and reconciles when it shrinks independently of the app', async () => {
        const { dom } = createPage({ navigationMarkup: '', overflowMenu: false });
        const { document, campaignHistoryFeature } = dom.window;
        const bodyContainer = document.createElement('main');
        bodyContainer.id = 'mo-body-container';
        document.body.appendChild(bodyContainer);
        const banner = createPrismaBannerOverflow(document, { availableWidth: 300 });
        const observedTargets = new Set();
        let resizeCallback;

        dom.window.ResizeObserver = class TestResizeObserver {
            constructor(callback) {
                resizeCallback = callback;
            }

            observe(target) {
                observedTargets.add(target);
            }

            disconnect() {}
        };

        try {
            await flushPromises();
            campaignHistoryFeature.apply();
            const historyLink = banner.bannerShadow.querySelector('#toolshed-campaign-history-nav');
            setElementRect(historyLink, { left: 207, top: 0, width: 88, height: 40 });
            campaignHistoryFeature.apply();

            expect(observedTargets.has(bodyContainer)).toBe(true);
            expect(observedTargets.has(banner.banner)).toBe(false);
            expect(observedTargets.has(banner.moduleContainer)).toBe(true);

            // The overall app stays wide while flex siblings reduce the nav
            // slot. This must be enough to collapse Reports after History.
            setClientSize(banner.moduleContainer, 155, 40);
            setElementRect(banner.moduleContainer, { left: 0, top: 0, width: 155, height: 40 });
            resizeCallback([{ target: banner.moduleContainer, contentRect: { width: 155 } }]);
            await flushPromises();

            expect(historyLink.classList.contains('toolshed-campaign-history-overflow-collapsed')).toBe(true);
            expect(banner.moduleContainer.querySelector('#mo-banner-module-prsm-cvr')
                .classList.contains('toolshed-campaign-history-overflow-collapsed')).toBe(true);
            expect(banner.countLabel.textContent).toBe('2');
        } finally {
            dom.window.close();
        }
    });

    test('reconciles after Prisma finishes the flex reflow following a window resize', async () => {
        const { dom } = createPage({ navigationMarkup: '', overflowMenu: false });
        const { document, campaignHistoryFeature } = dom.window;
        const bodyContainer = document.createElement('main');
        bodyContainer.id = 'mo-body-container';
        document.body.appendChild(bodyContainer);
        const banner = createPrismaBannerOverflow(document, { availableWidth: 300 });

        try {
            await flushPromises();
            campaignHistoryFeature.apply();
            const historyLink = banner.bannerShadow.querySelector('#toolshed-campaign-history-nav');
            setElementRect(historyLink, { left: 207, top: 0, width: 88, height: 40 });
            campaignHistoryFeature.apply();
            await flushPromises();

            expect(historyLink.classList.contains('toolshed-campaign-history-overflow-collapsed')).toBe(false);

            // The resize event can arrive before Prisma's flex layout updates.
            // A settled pass must catch the new slot width after that reflow.
            dom.window.dispatchEvent(new dom.window.Event('resize'));
            await flushPromises();
            expect(historyLink.classList.contains('toolshed-campaign-history-overflow-collapsed')).toBe(false);

            setClientSize(banner.moduleContainer, 200, 40);
            setElementRect(banner.moduleContainer, { left: 0, top: 0, width: 200, height: 40 });
            await wait(120);
            await flushPromises();

            expect(historyLink.classList.contains('toolshed-campaign-history-overflow-collapsed')).toBe(true);
            expect(banner.moduleContainer.querySelector('#mo-banner-module-prsm-cvr')
                .classList.contains('toolshed-campaign-history-overflow-collapsed')).toBe(true);
            expect(banner.countLabel.textContent).toBe('2');
            expect(Array.from(document.getElementById('toolshed-campaign-history-overflow-menu').children)
                .map(item => item.textContent)).toEqual(['History', 'Reports']);
        } finally {
            dom.window.close();
        }
    });

    test('collapses rendered navigation overflow when cached module widths are too small', async () => {
        const { dom } = createPage({ navigationMarkup: '', overflowMenu: false });
        const { document, campaignHistoryFeature } = dom.window;
        const banner = createPrismaBannerOverflow(document, {
            availableWidth: 200,
            moduleWidths: { campaigns: 50, reports: 40 }
        });

        try {
            await flushPromises();
            campaignHistoryFeature.apply();
            await flushPromises();

            const historyLink = banner.bannerShadow.querySelector('#toolshed-campaign-history-nav');
            const campaigns = banner.moduleContainer.querySelector('#mo-banner-module-prsm-cm-spa');
            const reports = banner.moduleContainer.querySelector('#mo-banner-module-prsm-cvr');
            const layoutItems = [campaigns, reports, historyLink];
            const renderedWidths = new Map([
                [campaigns, 50],
                [reports, 40],
                [historyLink, 40]
            ]);
            const installFlexRects = () => {
                layoutItems.forEach((item, index) => {
                    item.getBoundingClientRect = () => {
                        const collapsed = item.classList.contains('toolshed-campaign-history-overflow-collapsed');
                        const left = layoutItems.slice(0, index).reduce((total, previous) =>
                            total + (previous.classList.contains('toolshed-campaign-history-overflow-collapsed')
                                ? 0
                                : renderedWidths.get(previous)), 0);
                        const width = collapsed ? 0 : renderedWidths.get(item);
                        return {
                            x: left,
                            y: 0,
                            left,
                            top: 0,
                            right: left + width,
                            bottom: 40,
                            width,
                            height: 40,
                            toJSON: () => ({ left, top: 0, right: left + width, bottom: 40, width, height: 40 })
                        };
                    };
                });
            };

            installFlexRects();
            campaignHistoryFeature.apply();
            await flushPromises();

            expect(historyLink.classList.contains('toolshed-campaign-history-overflow-collapsed')).toBe(false);

            // The slot shrinks after Prisma finishes its flex reflow, while the
            // extension's earlier measurements still report the smaller widths.
            renderedWidths.set(campaigns, 121);
            renderedWidths.set(reports, 86);
            renderedWidths.set(historyLink, 88);
            campaignHistoryFeature.apply();
            await flushPromises();

            expect(historyLink.classList.contains('toolshed-campaign-history-overflow-collapsed')).toBe(true);
            expect(reports.classList.contains('toolshed-campaign-history-overflow-collapsed')).toBe(true);
            expect(campaigns.classList.contains('toolshed-campaign-history-overflow-collapsed')).toBe(false);
            expect(banner.countLabel.textContent).toBe('2');
            expect(Array.from(document.getElementById('toolshed-campaign-history-overflow-menu').children)
                .map(item => item.textContent)).toEqual(['History', 'Reports']);
        } finally {
            dom.window.close();
        }
    });

    test('corrects the overflow badge after Prisma redraws it when the menu opens', async () => {
        const { dom } = createPage({ navigationMarkup: '', overflowMenu: false });
        const { document, campaignHistoryFeature } = dom.window;
        const banner = createPrismaBannerOverflow(document);
        const { group } = createPrismaOverflowMenu(document);
        const campaignsItem = document.createElement('mo-menu-item');
        campaignsItem.id = 'prsm-cm-spa';
        campaignsItem.textContent = 'Campaigns';
        group.prepend(campaignsItem);

        try {
            await flushPromises();
            campaignHistoryFeature.apply();
            await flushPromises();

            expect(Array.from(group.children).filter(item => item.tagName === 'MO-MENU-ITEM')).toHaveLength(3);
            expect(banner.countLabel.textContent).toBe('3');

            // Prisma redraws its native badge from its two original modules after
            // the menu opens. The extension must restore the visible row count.
            banner.countLabel.textContent = '2';
            banner.overflowMenu.dispatchEvent(new dom.window.MouseEvent('click', {
                bubbles: true,
                composed: true
            }));
            await wait(100);

            expect(banner.countLabel.textContent).toBe('3');
        } finally {
            dom.window.close();
        }
    });

    test('moves History into overflow when the link itself would be clipped after Reports', async () => {
        const { dom } = createPage({
            navigationMarkup: `
                <div id="ptb-header">
                    <nav id="prisma-top-navigation">
                        <a id="prisma-campaigns" href="#campaigns">Campaigns</a>
                        <a id="prisma-reports" href="#reports">Reports</a>
                    </nav>
                </div>`
        });
        const { document, Element, campaignHistoryFeature } = dom.window;
        const nav = document.getElementById('prisma-top-navigation');
        const reports = document.getElementById('prisma-reports');
        nav.style.overflow = 'hidden';
        setClientSize(nav, 110, 40);
        setElementRect(nav, { left: 0, top: 0, width: 110, height: 40 });
        setElementRect(reports, { left: 20, top: 0, width: 70, height: 40 });

        const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
        Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
            if (this.id === 'toolshed-campaign-history-nav') {
                return {
                    x: 90,
                    y: 0,
                    left: 90,
                    top: 0,
                    right: 175,
                    bottom: 40,
                    width: 85,
                    height: 40
                };
            }
            return originalGetBoundingClientRect.call(this);
        };

        try {
            await flushPromises();
            campaignHistoryFeature.apply();
            await flushPromises();

            const historyItem = getHistoryOverflowItem(document);
            expect(document.getElementById('toolshed-campaign-history-nav')).toBeNull();
            expect(historyItem).not.toBeNull();
            expect(historyItem.previousElementSibling.id).toBe('prsm-cvr');
        } finally {
            Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
            dom.window.close();
        }
    });

    test('includes History in the overflow badge before Prisma lazily mounts the menu', async () => {
        const { dom } = createPage({ navigationMarkup: '', overflowMenu: false });
        const { document } = dom.window;

        await flushPromises();

        const banner = createPrismaBannerOverflow(document);
        await flushPromises();

        // One hidden native module (Reports) plus History should display 2,
        // even before Prisma creates the menu rows.
        expect(banner.countLabel.textContent).toBe('2');

        const additionalHiddenModule = document.createElement('mo-banner-module');
        additionalHiddenModule.id = 'mo-banner-module-prsm-orders';
        additionalHiddenModule.classList.add('hidden');
        additionalHiddenModule.style.visibility = 'hidden';
        banner.moduleContainer.appendChild(additionalHiddenModule);
        await flushPromises();

        // The badge grows with another collapsed module instead of using a
        // fixed count.
        expect(banner.countLabel.textContent).toBe('3');
        expect(document.getElementById('toolshed-campaign-history-nav')).toBeNull();
        expect(getHistoryOverflowItem(document)).toBeNull();

        const { group } = createPrismaOverflowMenu(document);
        group.appendChild(document.createElement('mo-menu-item'));
        await flushPromises();

        expect(getHistoryOverflowItem(document)).not.toBeNull();
        expect(banner.countLabel.textContent).toBe('3');

        dom.window.close();
    });

    test('counts responsive overflow options and keeps the trigger available when Prisma hides it', async () => {
        const { dom } = createPage({ navigationMarkup: '', overflowMenu: false });
        const { document, campaignHistoryFeature } = dom.window;
        const banner = createPrismaBannerOverflow(document, { availableWidth: 156 });

        await flushPromises();
        campaignHistoryFeature.apply();
        const historyLink = banner.bannerShadow.querySelector('#toolshed-campaign-history-nav');
        setElementRect(historyLink, { left: 207, top: 0, width: 88, height: 40 });
        campaignHistoryFeature.apply();

        expect(getHistoryOverflowItem(document)).not.toBeNull();
        expect(banner.countLabel.textContent).toBe('2');
        const spacingStyle = banner.bannerShadow.querySelector('#toolshed-campaign-history-overflow-spacing-styles');
        expect(spacingStyle.textContent).toContain(
            '#mo-banner-module-container > mo-banner-module.toolshed-campaign-history-overflow-collapsed'
        );
        expect(spacingStyle.textContent).toContain('display: none !important');

        setClientSize(banner.moduleContainer, 80, 40);
        setElementRect(banner.moduleContainer, { left: 0, top: 0, width: 80, height: 40 });
        campaignHistoryFeature.apply();
        expect(banner.countLabel.textContent).toBe('3');
        expect(Array.from(document.getElementById('toolshed-campaign-history-overflow-menu').children)
            .map(item => item.textContent)).toEqual(['History', 'Reports', 'Campaigns']);

        banner.overflowMenu.style.visibility = 'hidden';
        campaignHistoryFeature.apply();
        expect(banner.overflowMenu.classList.contains('toolshed-campaign-history-overflow-trigger')).toBe(true);
        expect(banner.bannerShadow.querySelector('#toolshed-campaign-history-overflow-spacing-styles')).not.toBeNull();

        banner.overflowMenu.style.visibility = 'visible';
        campaignHistoryFeature.apply();
        expect(banner.bannerShadow.querySelector('#toolshed-campaign-history-overflow-spacing-styles')).not.toBeNull();

        dom.window.close();
    });

    test('keeps Prisma navigation in a stable History, Reports, Campaigns overflow order', async () => {
        const { dom } = createPage({ navigationMarkup: '', overflowMenu: false });
        try {
            const { document, campaignHistoryFeature } = dom.window;
            const banner = createPrismaBannerOverflow(document, { availableWidth: 295 });

            await flushPromises();
            campaignHistoryFeature.apply();
            await flushPromises();
            const historyLink = banner.banner.shadowRoot.getElementById('toolshed-campaign-history-nav');
            expect(historyLink).not.toBeNull();
            setElementRect(historyLink, { left: 207, top: 0, width: 88, height: 40 });
            banner.countLabel.textContent = '0';
            campaignHistoryFeature.apply();
            await flushPromises();

            expect(historyLink.classList.contains('toolshed-campaign-history-overflow-collapsed')).toBe(false);
            expect(banner.overflowMenu.classList.contains('toolshed-campaign-history-overflow-trigger')).toBe(false);

            let triggerBaseLeft = 0;
            banner.overflowMenu.getBoundingClientRect = () => {
                const offset = Number.parseFloat(banner.overflowMenu.style
                    .getPropertyValue('--toolshed-campaign-history-overflow-offset-x')) || 0;
                const left = triggerBaseLeft + offset;
                return {
                    x: left,
                    y: 0,
                    left,
                    top: 0,
                    right: left + 32,
                    bottom: 40,
                    width: 32,
                    height: 40,
                    toJSON: () => ({ left, top: 0, right: left + 32, bottom: 40, width: 32, height: 40 })
                };
            };
            const setAvailableWidth = width => {
                setClientSize(banner.moduleContainer, width, 40);
                setElementRect(banner.moduleContainer, { left: 0, top: 0, width, height: 40 });
                triggerBaseLeft = width;
                campaignHistoryFeature.apply();
            };
            const clickOverflowTrigger = () => {
                const eventOptions = { bubbles: true, cancelable: true, composed: true };
                ['pointerdown', 'mousedown', 'focusin', 'pointerup', 'mouseup', 'click'].forEach(type => {
                    banner.overflowMenu.dispatchEvent(new dom.window.MouseEvent(type, eventOptions));
                });
            };

            // At 220px, History alone moves into the menu. Hover opens after a
            // short delay, while clicking opens immediately and keeps it open.
            setAvailableWidth(220);
            let menu = document.getElementById('toolshed-campaign-history-overflow-menu');
            expect(menu.hidden).toBe(true);
            expect(banner.countLabel.textContent).toBe('1');
            banner.overflowMenu.dispatchEvent(new dom.window.MouseEvent('mouseover', {
                bubbles: true,
                cancelable: true,
                composed: true
            }));
            expect(menu.hidden).toBe(true);
            clickOverflowTrigger();
            expect(menu.hidden).toBe(false);
            await wait(280);
            expect(menu.hidden).toBe(false);
            clickOverflowTrigger();
            expect(menu.hidden).toBe(true);

            banner.overflowMenu.dispatchEvent(new dom.window.MouseEvent('mouseover', {
                bubbles: true,
                cancelable: true,
                composed: true
            }));
            banner.overflowMenu.dispatchEvent(new dom.window.MouseEvent('mouseout', {
                bubbles: true,
                cancelable: true,
                composed: true,
                relatedTarget: document.body
            }));
            await wait(280);
            expect(menu.hidden).toBe(true);

            banner.overflowMenu.dispatchEvent(new dom.window.MouseEvent('mouseover', {
                bubbles: true,
                cancelable: true,
                composed: true
            }));
            await wait(280);
            expect(menu.hidden).toBe(false);
            expect(Array.from(menu.children).map(item => item.textContent)).toEqual(['History']);
            clickOverflowTrigger();
            expect(menu.hidden).toBe(false);
            menu.querySelector('#toolshed-campaign-history-overflow-item').click();
            await flushPromises();
            expect(document.getElementById('toolshed-campaign-history-panel').hidden).toBe(false);

            // Reports is the next item hidden, followed by Campaigns. The badge
            // tracks the number of actual menu options at each step.
            setAvailableWidth(156);
            menu = document.getElementById('toolshed-campaign-history-overflow-menu');
            expect(banner.countLabel.textContent).toBe('2');
            expect(Array.from(menu.children).map(item => item.textContent)).toEqual(['History', 'Reports']);
            expect(menu.querySelector('mo-menu, [aria-haspopup]')).toBeNull();
            expect(banner.overflowMenu.style.getPropertyValue('--toolshed-campaign-history-overflow-offset-x'))
                .toBe('-35px');
            expect(banner.overflowMenu.getBoundingClientRect().left)
                .toBe(banner.moduleContainer.querySelector('#mo-banner-module-prsm-cm-spa')
                    .getBoundingClientRect().right);

            setAvailableWidth(80);
            expect(banner.countLabel.textContent).toBe('3');
            expect(Array.from(menu.children).map(item => item.textContent))
                .toEqual(['History', 'Reports', 'Campaigns']);
            expect(banner.overflowMenu.style.getPropertyValue('--toolshed-campaign-history-overflow-offset-x'))
                .toBe('-80px');
            expect(banner.overflowMenu.getBoundingClientRect().left)
                .toBe(banner.moduleContainer.getBoundingClientRect().left);

            setAvailableWidth(320);
            expect(historyLink.classList.contains('toolshed-campaign-history-overflow-collapsed')).toBe(false);
            expect(document.getElementById('toolshed-campaign-history-overflow-menu')).toBeNull();
        } finally {
            dom.window.close();
        }
    });

    test('keeps Prisma’s three-dot trigger next to Campaigns and History beside Reports', async () => {
        const { dom } = createPage({
            navigationMarkup: `
                <div id="ptb-header">
                    <nav id="prisma-top-navigation">
                        <a id="prisma-campaigns" href="#campaigns">Campaigns</a>
                        <button id="prisma-campaigns-overflow" type="button" aria-label="More">•••</button>
                        <a id="prisma-reports" href="#reports">Reports</a>
                    </nav>
                </div>`
        });
        const { document } = dom.window;

        await flushPromises();

        const campaigns = document.getElementById('prisma-campaigns');
        const overflowTrigger = document.getElementById('prisma-campaigns-overflow');
        expect(campaigns.nextElementSibling).toBe(overflowTrigger);
        expect(document.getElementById('prisma-top-navigation').children).toHaveLength(4);
        const reports = document.getElementById('prisma-reports');
        const history = document.getElementById('toolshed-campaign-history-nav');
        expect(history.previousElementSibling).toBe(reports);
        expect(getHistoryOverflowItem(document)).toBeNull();

        dom.window.close();
    });

    test('keeps History in the overflow menu on the Prisma dashboard without logging a visit', async () => {
        const { dom, localStore } = createPage({ url: dashboardUrl });
        const { document } = dom.window;

        await flushPromises();

        const historyItem = getHistoryOverflowItem(document);
        expect(historyItem).not.toBeNull();
        expect(localStore.campaignHistoryEntries).toHaveLength(0);
        historyItem.click();
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
            .toBe('WPP MS ADV DOOH | Meta Digital Service Charge');
        expect(localStore.campaignHistoryEntries).toHaveLength(1);
        expect(localStore.campaignHistoryEntries[0].supplier)
            .toBe('WPP MS ADV DOOH | Meta Digital Service Charge');
        expect(dom.window.campaignHistoryFeature.filterHistoryEntries('WPP')).toHaveLength(1);
        expect(dom.window.campaignHistoryFeature.filterHistoryEntries('Meta Digital')).toHaveLength(1);
        dom.window.close();
    });

    test('normalizes common supplier names before logging and migrating history', async () => {
        const { dom, localStore } = createPage({
            settings: { campaignHistoryLoggingEnabled: false },
            fieldMarkup: `
                <div id="grid-container_hot">
                    <div class="ht_master">
                        <table class="htCore"><tbody>
                            <tr><td class="group-cell hierarchical-level-group-1 hierarchical-name">FACEBOOK(Facebook Mediacom)</td></tr>
                            <tr><td class="group-cell hierarchical-level-group-1 hierarchical-name">GOAT SOLUTIONS (GROUPM) GBP</td></tr>
                            <tr><td class="group-cell hierarchical-level-group-1 hierarchical-name">ADAPTED CREATIVE LIMITED:Adapted</td></tr>
                        </tbody></table>
                    </div>
                </div>`,
            entries: [
                {
                    key: 'campaign:facebook',
                    campaignId: 'CPFACEBOOK',
                    campaignName: 'Facebook campaign',
                    supplier: 'FACEBOOK(Facebook Mediacom)',
                    firstVisitedAt: 1,
                    lastVisitedAt: 1,
                    visitCount: 1
                },
                {
                    key: 'campaign:goat',
                    campaignId: 'CPGOAT',
                    campaignName: 'GOAT campaign',
                    supplier: 'GOAT SOLUTIONS (GROUPM) GBP',
                    firstVisitedAt: 2,
                    lastVisitedAt: 2,
                    visitCount: 1
                },
                {
                    key: 'campaign:adapted',
                    campaignId: 'CPADAPTED',
                    campaignName: 'Adapted campaign',
                    supplier: 'ADAPTED CREATIVE LIMITED:Adapted',
                    firstVisitedAt: 3,
                    lastVisitedAt: 3,
                    visitCount: 1
                }
            ]
        });

        await flushPromises();

        expect(dom.window.campaignHistoryFeature.getCampaignSnapshot().supplier)
            .toBe('Facebook | GOAT | Adapted');

        clickHistoryMenuItem(dom.window.document);
        await flushPromises();

        expect(localStore.campaignHistoryEntries.map(entry => entry.supplier))
            .toEqual(['Adapted', 'GOAT', 'Facebook']);
        const resultText = dom.window.document.querySelector('.toolshed-campaign-history-results').textContent;
        expect(resultText).toContain('Facebook');
        expect(resultText).toContain('GOAT');
        expect(resultText).toContain('Adapted');
        expect(resultText).not.toContain('Facebook(Facebook Mediacom)');
        expect(resultText).not.toContain('GOAT SOLUTIONS (GROUPM) GBP');
        expect(resultText).not.toContain('ADAPTED CREATIVE LIMITED:Adapted');
        dom.window.close();
    });

    test('captures an Actualise supplier group without mistaking Redistribute for a supplier', async () => {
        const { dom, localStore } = createPage({
            fieldMarkup: `
                <div id="grid-container_hot">
                    <div class="ht_master">
                        <table class="htCore"><tbody>
                            <tr role="row">
                                <td class="group-cell table-row-total hierarchical-name"></td>
                                <td class="group-cell table-row-total hierarchical-name">Media total</td>
                            </tr>
                            <tr role="row">
                                <td class="group-cell hierarchical-level-group-0 mo-row-expandcollapse"></td>
                                <td class="group-cell hierarchical-level-group-0 hierarchical-name">GUARDIAN | 000010</td>
                                <td class="hierarchical-level-group-1 redistribute-btn-col">
                                    <button>Redistribute</button>
                                </td>
                            </tr>
                            <tr role="row">
                                <td class="hierarchical-name">Digital placement</td>
                            </tr>
                        </tbody></table>
                    </div>
                </div>`
        });

        await flushPromises();

        expect(dom.window.campaignHistoryFeature.getCampaignSnapshot().supplier)
            .toBe('GUARDIAN');
        expect(localStore.campaignHistoryEntries).toHaveLength(1);
        expect(localStore.campaignHistoryEntries[0].supplier).toBe('GUARDIAN');
        expect(localStore.campaignHistoryEntries[0].supplier).not.toContain('Redistribute');
        dom.window.close();
    });

    test('migrates legacy Redistribute supplier values and uses Suppliers for multiple values', async () => {
        const { dom, localStore } = createPage({
            settings: { campaignHistoryLoggingEnabled: false },
            entries: [{
                key: 'campaign:legacy',
                campaignId: 'CPLEGACY',
                campaignName: 'Legacy campaign',
                supplier: 'Redistribute',
                firstVisitedAt: 1,
                lastVisitedAt: 1,
                visitCount: 1
            }, {
                key: 'campaign:many',
                campaignId: 'CPMANY',
                campaignName: 'Many suppliers',
                supplier: 'Meta | Reddit',
                firstVisitedAt: 2,
                lastVisitedAt: 2,
                visitCount: 1
            }]
        });

        await flushPromises();
        clickHistoryMenuItem(dom.window.document);
        await flushPromises();

        const results = Array.from(dom.window.document.querySelectorAll('.toolshed-campaign-history-result'));
        const legacyResult = results.find(result => result.textContent.includes('Legacy campaign'));
        const manyResult = results.find(result => result.textContent.includes('Many suppliers'));
        expect(localStore.campaignHistoryEntries.find(entry => entry.campaignId === 'CPLEGACY').supplier)
            .toBe('');
        expect(legacyResult.textContent).not.toContain('Redistribute');
        expect(manyResult.querySelector('.toolshed-campaign-history-metadata-label').textContent)
            .toBe('Suppliers');
        dom.window.close();
    });

    test('does not show the link when viewing is disabled and can be re-enabled live', async () => {
        const { dom, changeListeners } = createPage({
            settings: { campaignHistoryEnabled: false }
        });
        const { document } = dom.window;

        await flushPromises();
        expect(getHistoryOverflowItem(document)).toBeNull();

        changeListeners[0](
            { campaignHistoryEnabled: { newValue: true } },
            'sync'
        );
        await flushPromises();
        expect(getHistoryOverflowItem(document)).not.toBeNull();

        clickHistoryMenuItem(document);
        changeListeners[0](
            { campaignHistoryEnabled: { newValue: false } },
            'sync'
        );
        expect(getHistoryOverflowItem(document)).toBeNull();
        expect(document.getElementById('toolshed-campaign-history-panel').hidden).toBe(true);

        changeListeners[0](
            { campaignHistoryEnabled: { newValue: true } },
            'sync'
        );
        expect(getHistoryOverflowItem(document)).not.toBeNull();
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

    test('supports middle-click, ctrl-click, and right-click context menu on campaign cards', async () => {
        const testCampaignUrl = 'https://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP100';
        const { dom, trustedClick } = createPage({
            url: dashboardUrl,
            entries: [
                {
                    key: 'campaign:CP100',
                    campaignId: 'CP100',
                    cpNumber: 'CP100',
                    campaignName: 'Test Target Campaign',
                    url: testCampaignUrl,
                    firstVisitedAt: 100,
                    lastVisitedAt: 100
                }
            ]
        });
        const { window } = dom;
        const { document } = window;

        window.open = jest.fn();
        Object.assign(window.navigator, {
            clipboard: {
                writeText: jest.fn().mockResolvedValue(undefined)
            }
        });

        await flushPromises();
        clickHistoryMenuItem(document);
        await flushPromises();

        const card = document.querySelector('.toolshed-campaign-history-result button');
        expect(card).not.toBeNull();

        // 1. Middle-click (auxclick with button: 1) opens in new tab
        card.dispatchEvent(new window.MouseEvent('auxclick', {
            bubbles: true,
            cancelable: true,
            button: 1
        }));
        expect(window.open).toHaveBeenCalledWith(testCampaignUrl, '_blank');

        // 2. Ctrl+click opens in new tab
        window.open.mockClear();
        card.dispatchEvent(new window.MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            ctrlKey: true
        }));
        expect(window.open).toHaveBeenCalledWith(testCampaignUrl, '_blank');

        // 3. Right-click (contextmenu) opens custom context menu
        card.dispatchEvent(new window.MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: 150,
            clientY: 200
        }));

        const menu = document.getElementById('toolshed-campaign-history-context-menu');
        expect(menu).not.toBeNull();
        const items = Array.from(menu.querySelectorAll('.toolshed-campaign-history-context-item'));
        expect(items).toHaveLength(4);
        expect(items[0].textContent).toBe('Open in new tab');
        expect(items[1].textContent).toBe('Copy campaign');
        expect(items[2].textContent).toBe('Copy campaign link');
        expect(items[3].textContent).toBe('Copy campaign name');

        // 4. Test "Open in new tab" item
        window.open.mockClear();
        items[0].click();
        expect(window.open).not.toHaveBeenCalled();
        trustedClick(items[0]);
        expect(window.open).toHaveBeenCalledWith(testCampaignUrl, '_blank');
        expect(document.getElementById('toolshed-campaign-history-context-menu')).toBeNull();

        // 4b. Test "Copy campaign" item
        card.dispatchEvent(new window.MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: 150,
            clientY: 200
        }));
        const menuCopy = document.getElementById('toolshed-campaign-history-context-menu');
        const copyCampaignBtn = Array.from(menuCopy.querySelectorAll('.toolshed-campaign-history-context-item'))
            .find(el => el.textContent === 'Copy campaign');
        trustedClick(copyCampaignBtn);
        expect(window.location.href).toContain('&osModalId=prsm-cm-cmpcopy');
        expect(document.getElementById('toolshed-campaign-history-context-menu')).toBeNull();

        // 5. Test "Copy campaign link"
        card.dispatchEvent(new window.MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: 150,
            clientY: 200
        }));
        const menu2 = document.getElementById('toolshed-campaign-history-context-menu');
        const copyLinkItem = Array.from(menu2.querySelectorAll('.toolshed-campaign-history-context-item'))
            .find(el => el.textContent.includes('Copy campaign link'));
        window.chrome.runtime.sendMessage.mockClear();
        copyLinkItem.click();
        expect(window.chrome.runtime.sendMessage).not.toHaveBeenCalled();
        trustedClick(copyLinkItem);
        expect(window.chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'copyCampaignUrlToClipboard', text: testCampaignUrl });

        // 6. Test "Copy campaign name"
        card.dispatchEvent(new window.MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: 150,
            clientY: 200
        }));
        const menu3 = document.getElementById('toolshed-campaign-history-context-menu');
        const copyNameItem = Array.from(menu3.querySelectorAll('.toolshed-campaign-history-context-item'))
            .find(el => el.textContent.includes('Copy campaign name'));
        trustedClick(copyNameItem);
        expect(window.chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'copyCampaignHeaderToClipboard', text: 'Test Target Campaign' });
        await flushPromises();
        expect(copyNameItem.textContent).toContain('Copied name!');
        window.chrome.runtime.sendMessage.mockRejectedValueOnce(new Error('Extension context invalidated'));
        trustedClick(copyNameItem);
        await flushPromises();
        expect(copyNameItem.textContent).toContain('Failed to copy');

        // 7. Test dismissal via Escape key
        card.dispatchEvent(new window.MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            clientX: 150,
            clientY: 200
        }));
        expect(document.getElementById('toolshed-campaign-history-context-menu')).not.toBeNull();
        document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(document.getElementById('toolshed-campaign-history-context-menu')).toBeNull();

        dom.window.close();
    });

    test('clicking outside the open history panel triggers the close animation', async () => {
        const { dom } = createPage();
        const { window } = dom;
        const { document } = window;

        await flushPromises();

        const historyTrigger = getHistoryOverflowItem(document)?.querySelector('a.module-label');
        expect(historyTrigger).not.toBeNull();

        historyTrigger.click();
        await flushPromises();

        const panel = document.getElementById('toolshed-campaign-history-panel');
        expect(panel).not.toBeNull();
        expect(panel.hidden).toBe(false);
        expect(panel.classList.contains('is-closing')).toBe(false);

        // Wait for the outside-click listener delay (10ms)
        await wait(25);

        // Clicking inside the panel should not close it
        panel.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(panel.hidden).toBe(false);
        expect(panel.classList.contains('is-closing')).toBe(false);

        // Clicking outside the panel (e.g. on body) triggers the close animation
        document.body.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(panel.classList.contains('is-closing')).toBe(true);

        dom.window.close();
    });

    test('clicking the navigation link while the panel is open toggles it closed', async () => {
        const { dom } = createPage();
        const { window } = dom;
        const { document } = window;

        await flushPromises();

        const historyTrigger = getHistoryOverflowItem(document)?.querySelector('a.module-label');
        historyTrigger.click();
        await flushPromises();

        const panel = document.getElementById('toolshed-campaign-history-panel');
        expect(panel).not.toBeNull();
        expect(panel.hidden).toBe(false);
        expect(panel.classList.contains('is-closing')).toBe(false);

        // Clicking History again closes the panel with animation.
        historyTrigger.click();
        expect(panel.classList.contains('is-closing')).toBe(true);

        dom.window.close();
    });
});

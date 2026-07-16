const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.resolve(__dirname, '../help-guides.html'), 'utf8');
const dataCode = fs.readFileSync(path.resolve(__dirname, '../help-guides-data.js'), 'utf8');
const appCode = fs.readFileSync(path.resolve(__dirname, '../help-guides.js'), 'utf8');

async function createApp({ favourites = [], recent = [], sortMode = 'alpha' } = {}) {
    const dom = new JSDOM(html, {
        runScripts: 'outside-only',
        url: 'chrome-extension://test/help-guides.html'
    });
    const syncSet = jest.fn((values, callback) => callback?.());
    const localSet = jest.fn((values, callback) => callback?.());
    dom.window.chrome = {
        storage: {
            sync: {
                get: jest.fn((defaults, callback) => callback({ ...defaults, helpGuideFavouriteIds: favourites })),
                set: syncSet
            },
            local: {
                get: jest.fn((defaults, callback) => callback({
                    ...defaults,
                    helpGuideRecentIds: recent,
                    helpGuidesSortMode: sortMode
                })),
                set: localSet
            }
        },
        runtime: {
            sendMessage: jest.fn().mockResolvedValue({ status: 'success' })
        }
    };
    Object.defineProperty(dom.window.navigator, 'clipboard', {
        configurable: true,
        value: { writeText: jest.fn().mockResolvedValue(undefined) }
    });
    Object.defineProperty(dom.window.navigator, 'share', { configurable: true, value: undefined });
    dom.window.eval(dataCode);
    dom.window.eval(appCode);
    await dom.window.helpGuidesApp.hydratePreferences();
    return { dom, syncSet, localSet };
}

function closeApp(dom) {
    dom.window.helpGuidesApp.dispose();
    dom.window.close();
}

describe('Help Guides side panel', () => {
    test('renders all 21 unique guides and the seven requested category controls', async () => {
        const { dom } = await createApp();
        const labels = [...dom.window.document.querySelectorAll('.category-filter')].map(node => node.textContent);

        expect(dom.window.document.querySelectorAll('.guide-card')).toHaveLength(21);
        expect(labels).toEqual(['All', 'Access', 'Approval', 'Booking', 'Reconcile', 'Supplier Integrations', 'Traffic']);
        expect(dom.window.document.getElementById('results-summary').textContent).toBe('21 guides');
        expect([...dom.window.document.querySelectorAll('.guide-card strong')]
            .filter(node => node.textContent === 'Suppliers')).toHaveLength(1);
        closeApp(dom);
    });

    test('focuses search as soon as the side panel opens', async () => {
        const { dom } = await createApp();
        expect(dom.window.document.activeElement).toBe(dom.window.document.getElementById('guide-search'));
        closeApp(dom);
    });

    test('filters by category and supports fuzzy tag search', async () => {
        const { dom } = await createApp();
        const { document, Event } = dom.window;

        document.querySelector('[data-category="Access"]').click();
        expect(document.querySelectorAll('.guide-card')).toHaveLength(3);

        document.querySelector('[data-category="All"]').click();
        const search = document.getElementById('guide-search');
        search.value = 'facebook amndmnt';
        search.dispatchEvent(new Event('input', { bubbles: true }));

        expect(document.querySelectorAll('.guide-card')).toHaveLength(1);
        expect(document.querySelector('.guide-card strong').textContent)
            .toBe('Facebook Integration - Amendments & Cancellation');
        closeApp(dom);
    });

    test('toggles between A-Z and category grouping and persists the choice', async () => {
        const { dom, localSet } = await createApp();
        const { document } = dom.window;

        document.getElementById('sort-guides').click();
        expect(document.querySelector('#sort-guides span').textContent).toBe('Category');
        expect([...document.querySelectorAll('.guide-section-title')].map(node => node.textContent))
            .toEqual(['Access', 'Approval', 'Booking', 'Reconcile', 'Supplier Integrations', 'Traffic']);
        expect(localSet).toHaveBeenCalledWith({ helpGuidesSortMode: 'category' }, expect.any(Function));

        document.getElementById('sort-guides').click();
        expect(document.querySelector('#sort-guides span').textContent).toBe('A–Z');
        closeApp(dom);
    });

    test('keeps category controls stable and reset returns to All', async () => {
        const { dom } = await createApp();
        const { document } = dom.window;
        const bookingFilter = document.querySelector('[data-category="Booking"]');
        bookingFilter.focus();
        bookingFilter.click();

        expect(document.querySelector('[data-category="Booking"]')).toBe(bookingFilter);
        expect(document.activeElement).toBe(bookingFilter);
        expect(bookingFilter.getAttribute('aria-pressed')).toBe('true');
        expect(document.querySelectorAll('.guide-card')).toHaveLength(11);

        document.getElementById('clear-search').click();
        expect(document.querySelector('[data-category="All"]').getAttribute('aria-pressed')).toBe('true');
        expect(document.querySelectorAll('.guide-card')).toHaveLength(21);
        closeApp(dom);
    });

    test('shows the three most recently accessed guides at the top of All', async () => {
        const { dom, localSet } = await createApp({
            recent: ['access-support', 'approval-budget', 'booking-categories', 'booking-suppliers']
        });
        const { document } = dom.window;

        expect(document.querySelector('.guide-section-title').textContent).toContain('Recently accessed');
        expect([...document.querySelectorAll('.guide-section')[0].querySelectorAll('.guide-card strong')]
            .map(node => node.textContent)).toEqual(['Support', 'Budget Approval', 'Booking Categories']);

        document.querySelector('[data-guide-id="traffic-supplier-mappings"]').click();
        expect(localSet).toHaveBeenCalledWith({
            helpGuideRecentIds: ['traffic-supplier-mappings', 'access-support', 'approval-budget']
        }, expect.any(Function));
        closeApp(dom);
    });

    test('favourites a viewed PDF and pins it above recents in All', async () => {
        const { dom, syncSet } = await createApp({ recent: ['access-support'] });
        const { document } = dom.window;

        document.querySelector('[data-guide-id="approval-budget"]').click();
        document.getElementById('favourite-guide').click();
        expect(document.getElementById('favourite-guide').getAttribute('aria-pressed')).toBe('true');
        expect(syncSet).toHaveBeenCalledWith({ helpGuideFavouriteIds: ['approval-budget'] }, expect.any(Function));

        document.getElementById('back-to-guides').click();
        const sectionTitles = [...document.querySelectorAll('.guide-section-title')].map(node => node.textContent);
        expect(sectionTitles[0]).toContain('Favourites');
        expect(document.querySelector('.guide-section .guide-card strong').textContent).toBe('Budget Approval');
        closeApp(dom);
    });

    test('shares the current guide via clipboard fallback and shows feedback', async () => {
        const { dom } = await createApp();
        const { document, navigator } = dom.window;
        document.querySelector('[data-guide-id="reconcile-cost-refresh"]').click();

        await dom.window.helpGuidesApp.shareCurrentGuide();
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('dummy.pdf'));
        expect(document.getElementById('panel-toast-message').textContent).toBe('Guide link copied');
        expect(document.getElementById('panel-toast-layer').hidden).toBe(false);
        closeApp(dom);
    });

    test('opens the selected PDF inside the panel with share, favourite and open actions', async () => {
        const { dom } = await createApp();
        const { document } = dom.window;
        document.querySelector('[data-guide-id="supplier-facebook-workflow-1"]').click();

        expect(document.getElementById('library-view').hidden).toBe(true);
        expect(document.getElementById('viewer-view').hidden).toBe(false);
        expect(document.getElementById('viewer-title').textContent).toBe('Facebook Integration Workflow 1');
        expect(document.getElementById('pdf-frame').src).toContain('dummy.pdf');
        expect(document.getElementById('share-guide')).not.toBeNull();
        expect(document.getElementById('favourite-guide')).not.toBeNull();
        expect(document.getElementById('open-external').textContent.trim()).toBe('Open');

        document.getElementById('pdf-frame').dispatchEvent(new dom.window.Event('error'));
        expect(document.getElementById('viewer-fallback').hidden).toBe(false);
        closeApp(dom);
    });

    test('requires confirmation before disabling and then shows the recovery message', async () => {
        const { dom, syncSet } = await createApp();
        const { document } = dom.window;
        const disable = document.getElementById('disable-help-guides');

        disable.click();
        expect(disable.textContent).toContain('Are You Sure?');
        expect(syncSet).not.toHaveBeenCalledWith({ helpGuidesEnabled: false }, expect.anything());

        disable.click();
        expect(syncSet).toHaveBeenCalledWith({ helpGuidesEnabled: false }, expect.any(Function));
        expect(document.getElementById('panel-toast-message').textContent)
            .toBe('You can turn this on again in the Ops Toolshed settings');
        expect(document.getElementById('panel-toast-layer').hidden).toBe(false);
        closeApp(dom);
    });

    test('uses textContent so guide metadata cannot inject markup', async () => {
        const { dom } = await createApp();
        const guide = {
            id: 'unsafe',
            title: '<img src=x onerror=alert(1)>',
            category: 'Booking',
            tags: ['<script>alert(1)</script>'],
            url: 'https://example.com/test.pdf'
        };

        dom.window.helpGuidesApp.openGuide(guide);
        expect(dom.window.document.getElementById('viewer-title').textContent).toBe(guide.title);
        expect(dom.window.document.getElementById('viewer-title').querySelector('img')).toBeNull();
        closeApp(dom);
    });
});

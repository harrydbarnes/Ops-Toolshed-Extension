const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.resolve(__dirname, '../help-guides.html'), 'utf8');
const styles = fs.readFileSync(path.resolve(__dirname, '../help-guides.css'), 'utf8');
const dataCode = fs.readFileSync(path.resolve(__dirname, '../help-guides-data.js'), 'utf8');
const pdfViewerCode = fs.readFileSync(path.resolve(__dirname, '../features/help-guide-pdf-viewer.js'), 'utf8');
const appCode = fs.readFileSync(path.resolve(__dirname, '../help-guides.js'), 'utf8');

async function createApp({
    favourites = [],
    recent = [],
    sortMode = 'alpha',
    reducedMotion = true,
    nativePanelEvents = false,
    sharePointBytes = null,
    viewerHintCount = 0,
    viewerHintDismissed = false,
    enableResizeObserver = false,
    initialScrollTop = 0
} = {}) {
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
                    helpGuidesSortMode: sortMode,
                    helpGuideViewerCoachmarkCount: viewerHintCount,
                    helpGuideViewerHintDismissed: viewerHintDismissed
                })),
                set: localSet
            }
        },
        runtime: {
            sendMessage: jest.fn().mockResolvedValue({ status: 'success' })
        },
        sidePanel: nativePanelEvents ? { onClosed: { addListener: jest.fn() } } : undefined
    };
    dom.window.matchMedia = jest.fn(() => ({ matches: reducedMotion }));
    dom.window.scrollTo = jest.fn();
    dom.window.document.documentElement.scrollTop = initialScrollTop;
    dom.window.document.body.scrollTop = initialScrollTop;
    const resizeObserver = jest.fn(function(callback) {
        this.observe = jest.fn();
        this.disconnect = jest.fn();
        this.callback = callback;
    });
    if (enableResizeObserver) dom.window.ResizeObserver = resizeObserver;
    const fetchMock = jest.fn();
    if (sharePointBytes) {
        fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            url: 'https://insidemedia.sharepoint.com/sites/TPO-SharePoint/test.pdf',
            arrayBuffer: jest.fn().mockResolvedValue(sharePointBytes)
        });
        dom.window.fetch = fetchMock;
    }
    dom.window.URL.createObjectURL = jest.fn(() => 'blob:chrome-extension://test/sharepoint-pdf');
    dom.window.URL.revokeObjectURL = jest.fn();
    const renderTask = { promise: Promise.resolve(), cancel: jest.fn() };
    const pdfPage = {
        getViewport: jest.fn(({ scale }) => ({ width: 600 * scale, height: 800 * scale })),
        render: jest.fn(() => renderTask),
        getTextContent: jest.fn().mockResolvedValue({
            items: [{ str: 'Budget approval and supplier mapping guidance' }]
        })
    };
    const pdfDocument = {
        numPages: 9,
        getPage: jest.fn().mockResolvedValue(pdfPage),
        destroy: jest.fn().mockResolvedValue(undefined)
    };
    const getDocumentTask = {
        promise: Promise.resolve(pdfDocument),
        destroy: jest.fn()
    };
    dom.window.pdfjsLib = {
        GlobalWorkerOptions: {},
        getDocument: jest.fn(() => getDocumentTask)
    };
    dom.window.HTMLCanvasElement.prototype.getContext = jest.fn(() => ({}));
    const canvasScroll = dom.window.document.getElementById('pdf-canvas-scroll');
    Object.defineProperty(canvasScroll, 'clientWidth', { configurable: true, value: 440 });
    canvasScroll.scrollTo = jest.fn();
    Object.defineProperty(dom.window.navigator, 'clipboard', {
        configurable: true,
        value: { writeText: jest.fn().mockResolvedValue(undefined) }
    });
    Object.defineProperty(dom.window.navigator, 'share', { configurable: true, value: undefined });
    dom.window.eval(dataCode);
    dom.window.eval(pdfViewerCode);
    dom.window.eval(appCode);
    await dom.window.helpGuidesApp.hydratePreferences();
    return { dom, syncSet, localSet, fetchMock, pdfDocument, pdfPage, resizeObserver };
}

function closeApp(dom) {
    dom.window.helpGuidesApp.dispose();
    dom.window.close();
}

describe('Help Guides side panel', () => {
    test('opens the guide library at the top even when Chrome restores side-panel scroll', async () => {
        const { dom } = await createApp({ initialScrollTop: 240 });

        expect(dom.window.document.documentElement.scrollTop).toBe(0);
        expect(dom.window.document.body.scrollTop).toBe(0);
        expect(dom.window.scrollTo).toHaveBeenCalledWith(0, 0);
        closeApp(dom);
    });

    test('confines PDF scrolling to a fixed-height viewer viewport', () => {
        const viewerRule = styles.match(/\.viewer-view\s*\{([^}]+)\}/)?.[1] || '';
        const scrollerRule = styles.match(/\.pdf-canvas-scroll\s*\{([^}]+)\}/)?.[1] || '';

        expect(viewerRule).toMatch(/(?:^|\n)\s*height:\s*100vh/);
        expect(viewerRule).toMatch(/overflow:\s*hidden/);
        expect(scrollerRule).toMatch(/overflow:\s*auto/);
    });

    test('smoothly collapses optional PDF controls in a narrow panel', () => {
        expect(styles).toMatch(/@container\s*\(max-width:\s*410px\)/);
        expect(styles).toMatch(/#pdf-fit-width,[\s\S]*#pdf-search-toggle,[\s\S]*\.pdf-zoom-label[\s\S]*visibility:\s*hidden/);
    });

    test('uses an animated blurred modal layer for the larger viewer coachmarks', () => {
        const layerRule = styles.match(/\.viewer-coachmark-layer\s*\{([^}]+)\}/)?.[1] || '';
        const coachmarkRule = styles.match(/(?:^|\n)\.viewer-coachmark\s*\{([^}]+)\}/)?.[1] || '';

        expect(layerRule).toMatch(/backdrop-filter:\s*blur\(5px\)/);
        expect(layerRule).toMatch(/background:\s*rgba\(6,\s*8,\s*35,\s*0\.52\)/);
        expect(coachmarkRule).toMatch(/420px/);
        expect(styles).toMatch(/viewer-coachmark-layer\.is-closing/);
    });

    test('renders the 21 library guides plus two SharePoint proof-of-concept PDFs', async () => {
        const { dom } = await createApp();
        const labels = [...dom.window.document.querySelectorAll('.category-filter')].map(node => node.textContent);

        expect(dom.window.document.querySelectorAll('.guide-card')).toHaveLength(23);
        expect(dom.window.document.querySelectorAll('.guide-card-favourite')).toHaveLength(23);
        expect(labels).toEqual(['All', 'Access', 'Approval', 'Booking', 'Reconcile', 'Supplier Integrations', 'Traffic']);
        expect(dom.window.document.getElementById('results-summary').textContent).toBe('23 guides');
        const debugSection = dom.window.document.querySelector('.guide-section.is-debug');
        expect(debugSection.querySelector('.guide-section-title').textContent).toContain('Example PDFs · Debugging');
        expect([...debugSection.querySelectorAll('.guide-card')].map(card => card.dataset.guideId))
            .toEqual(['debug-sharepoint-pdf-1', 'debug-sharepoint-pdf-2']);
        expect([...dom.window.document.querySelectorAll('.guide-card strong')]
            .filter(node => node.textContent === 'Suppliers')).toHaveLength(1);
        closeApp(dom);
    });

    test('focuses search as soon as the side panel opens', async () => {
        const { dom } = await createApp();
        expect(dom.window.document.activeElement).toBe(dom.window.document.getElementById('guide-search'));
        closeApp(dom);
    });

    test('does not report a false close during a panel document refresh when native close events exist', async () => {
        const { dom } = await createApp({ nativePanelEvents: true });
        dom.window.chrome.runtime.sendMessage.mockClear();

        dom.window.dispatchEvent(new dom.window.Event('pagehide'));

        expect(dom.window.chrome.runtime.sendMessage).not.toHaveBeenCalledWith({ action: 'helpGuidesPanelClosed' });
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

        document.querySelector('[data-sort="category"]').click();
        expect(document.querySelector('[data-sort="category"]').getAttribute('aria-pressed')).toBe('true');
        expect([...document.querySelectorAll('.guide-section-title')].map(node => node.textContent))
            .toEqual(['◇Example PDFs · Debugging', 'Access', 'Approval', 'Booking', 'Reconcile', 'Supplier Integrations', 'Traffic']);
        expect(localSet).toHaveBeenCalledWith({ helpGuidesSortMode: 'category' }, expect.any(Function));

        document.querySelector('[data-sort="alpha"]').click();
        expect(document.querySelector('[data-sort="alpha"]').getAttribute('aria-pressed')).toBe('true');
        closeApp(dom);
    });

    test('uses coloured category abbreviations and visually distinct tag chips', async () => {
        const { dom } = await createApp();
        const { document } = dom.window;
        const expected = ['POC', 'Acc', 'Appr', 'Book', 'Rec', 'Int', 'Tfc'];

        expect(new Set([...document.querySelectorAll('.guide-file-icon')].map(node => node.textContent)))
            .toEqual(new Set(expected));
        expect(document.querySelector('.guide-file-icon').closest('.guide-card').style.getPropertyValue('--category-color'))
            .not.toBe('');
        expect(document.querySelectorAll('.guide-tag').length).toBeGreaterThan(20);
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
        expect(document.querySelectorAll('.guide-card')).toHaveLength(23);
        closeApp(dom);
    });

    test('shows the three most recently accessed guides at the top of All', async () => {
        const { dom, localSet } = await createApp({
            recent: ['access-support', 'approval-budget', 'booking-categories', 'booking-suppliers']
        });
        const { document } = dom.window;

        const recentSection = [...document.querySelectorAll('.guide-section')]
            .find(section => section.querySelector('.guide-section-title')?.textContent.includes('Recently accessed'));
        expect(recentSection).toBeDefined();
        expect([...recentSection.querySelectorAll('.guide-card strong')]
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
        expect(sectionTitles[1]).toContain('Favourites');
        const favouriteSection = [...document.querySelectorAll('.guide-section')]
            .find(section => section.querySelector('.guide-section-title')?.textContent.includes('Favourites'));
        expect(favouriteSection.querySelector('.guide-card strong').textContent).toBe('Budget Approval');
        expect(document.querySelector('.guide-card-favourite[aria-pressed="true"]').getAttribute('aria-label'))
            .toBe('Remove Budget Approval from favourites');
        closeApp(dom);
    });

    test('animates a favourite out when its card star is clicked', async () => {
        const { dom, syncSet } = await createApp({ favourites: ['approval-budget'] });
        const { document } = dom.window;
        const star = document.querySelector('.guide-card-favourite[aria-pressed="true"]');
        const shell = star.closest('.guide-card-shell');

        star.click();
        expect(shell.classList.contains('is-removing-favourite')).toBe(true);
        expect(syncSet).toHaveBeenCalledWith({ helpGuideFavouriteIds: [] }, expect.any(Function));
        await new Promise(resolve => dom.window.setTimeout(resolve, 260));
        expect(document.querySelector('.guide-section-title')?.textContent || '').not.toContain('Favourites');
        closeApp(dom);
    });

    test('offers feedback both at the bottom and alongside empty search results', async () => {
        const { dom } = await createApp();
        const { document, Event } = dom.window;
        const openFeedback = jest.fn();
        dom.window.feedbackModalFeature = { open: openFeedback };

        document.querySelector('.help-feedback-prompt .help-feedback-trigger').click();
        expect(openFeedback).toHaveBeenCalledTimes(1);
        expect(openFeedback).toHaveBeenCalledWith(expect.objectContaining({
            variant: 'help-guides',
            categories: ['Access', 'Approval', 'Booking', 'Reconcile', 'Supplier Integrations', 'Traffic', 'Other'],
            types: ['New training material', 'Training material amend', 'Feedback'],
            showIdeaBy: false
        }));

        const search = document.getElementById('guide-search');
        search.value = 'zzzzzzmissing';
        search.dispatchEvent(new Event('input', { bubbles: true }));
        expect(document.getElementById('empty-state').hidden).toBe(false);
        expect(document.querySelector('.help-feedback-prompt').hidden).toBe(true);
        document.querySelector('.empty-state .help-feedback-trigger').click();
        expect(openFeedback).toHaveBeenCalledTimes(2);
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

    test('renders SharePoint PDFs with custom page, zoom and download controls', async () => {
        const pdfBytes = Uint8Array.from([37, 80, 68, 70, 45, 49, 46, 55, 10, 37, 226, 227, 207, 211]).buffer;
        const { dom, fetchMock, pdfDocument } = await createApp({ sharePointBytes: pdfBytes });
        const { document } = dom.window;
        const guide = dom.window.HELP_GUIDES.find(item => item.id === 'debug-sharepoint-pdf-1');

        await dom.window.helpGuidesApp.openGuide(guide);

        expect(fetchMock).toHaveBeenCalledWith(`${guide.url}?download=1`, {
            cache: 'no-store',
            credentials: 'include',
            redirect: 'follow'
        });
        expect(document.getElementById('custom-pdf-viewer').hidden).toBe(false);
        expect(document.getElementById('pdf-frame').hidden).toBe(true);
        expect(document.querySelectorAll('.pdf-page')).toHaveLength(9);
        expect(document.querySelectorAll('.pdf-page canvas')).toHaveLength(9);
        expect(document.querySelector('.pdf-page').getAttribute('aria-label')).toBe('Page 1 of 9');
        expect(document.getElementById('pdf-page-number').value).toBe('1');
        expect(document.getElementById('pdf-page-total').textContent).toBe('9');
        expect(document.getElementById('pdf-download').href).toBe('blob:chrome-extension://test/sharepoint-pdf');
        expect(document.getElementById('pdf-download').download).toBe('test.pdf');
        expect(document.getElementById('open-external').href).toBe(guide.url);

        document.getElementById('pdf-next-page').click();
        await new Promise(resolve => dom.window.setTimeout(resolve, 0));
        expect(document.getElementById('pdf-page-number').value).toBe('2');
        expect(document.getElementById('pdf-canvas-scroll').scrollTo).toHaveBeenCalledWith(expect.objectContaining({
            behavior: 'smooth'
        }));

        const initialZoom = document.getElementById('pdf-zoom-label').textContent;
        document.getElementById('pdf-zoom-in').click();
        await new Promise(resolve => dom.window.setTimeout(resolve, 0));
        expect(document.getElementById('pdf-zoom-label').textContent).not.toBe(initialZoom);

        document.getElementById('pdf-search-toggle').click();
        const searchInput = document.getElementById('pdf-search-input');
        searchInput.value = 'supplier';
        searchInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        await new Promise(resolve => dom.window.setTimeout(resolve, 220));
        expect(document.getElementById('pdf-search-count').textContent).toBe('1 of 9');
        expect(document.querySelector('.pdf-page.is-search-result')).not.toBeNull();
        expect(document.getElementById('pdf-download').textContent.trim()).toBe('');

        dom.window.helpGuidesApp.closeGuide();
        expect(dom.window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:chrome-extension://test/sharepoint-pdf');
        closeApp(dom);
    });

    test('rerenders fit-to-width pages once per panel resize without observing PDF content changes', async () => {
        const pdfBytes = Uint8Array.from([37, 80, 68, 70, 45, 49, 46, 55]).buffer;
        const { dom, pdfPage, resizeObserver } = await createApp({
            sharePointBytes: pdfBytes,
            enableResizeObserver: true
        });
        const guide = dom.window.HELP_GUIDES.find(item => item.id === 'debug-sharepoint-pdf-1');
        await dom.window.helpGuidesApp.openGuide(guide);
        expect(pdfPage.render).toHaveBeenCalledTimes(9);

        dom.window.dispatchEvent(new dom.window.Event('resize'));
        await new Promise(resolve => dom.window.setTimeout(resolve, 160));
        expect(pdfPage.render).toHaveBeenCalledTimes(18);
        await new Promise(resolve => dom.window.setTimeout(resolve, 160));
        expect(pdfPage.render).toHaveBeenCalledTimes(18);
        expect(resizeObserver).not.toHaveBeenCalled();
        closeApp(dom);
    });

    test('shows the resize and Open reminder only for the first three PDF loads', async () => {
        const pdfBytes = Uint8Array.from([37, 80, 68, 70, 45, 49, 46, 55]).buffer;
        const { dom, localSet } = await createApp({
            sharePointBytes: pdfBytes,
            viewerHintCount: 2
        });
        const firstGuide = dom.window.HELP_GUIDES.find(item => item.id === 'debug-sharepoint-pdf-1');
        const secondGuide = dom.window.HELP_GUIDES.find(item => item.id === 'debug-sharepoint-pdf-2');

        await dom.window.helpGuidesApp.openGuide(firstGuide);
        expect(dom.window.document.getElementById('viewer-coachmark').hidden).toBe(false);
        expect(dom.window.document.getElementById('viewer-coachmark-title').textContent).toBe('Need more room?');
        expect(localSet).toHaveBeenCalledWith({ helpGuideViewerCoachmarkCount: 3 }, expect.any(Function));

        dom.window.helpGuidesApp.closeGuide();
        await Promise.resolve();
        await dom.window.helpGuidesApp.openGuide(secondGuide);
        expect(dom.window.document.getElementById('viewer-coachmark').hidden).toBe(true);
        expect(dom.window.helpGuidesApp.getState().viewerHintCount).toBe(3);
        closeApp(dom);
    });

    test('allows the resize reminder to be permanently dismissed', async () => {
        const pdfBytes = Uint8Array.from([37, 80, 68, 70, 45, 49, 46, 55]).buffer;
        const { dom, localSet } = await createApp({ sharePointBytes: pdfBytes });
        const guide = dom.window.HELP_GUIDES.find(item => item.id === 'debug-sharepoint-pdf-1');

        await dom.window.helpGuidesApp.openGuide(guide);
        const optout = dom.window.document.getElementById('viewer-coachmark-disable');
        optout.checked = true;
        optout.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

        expect(localSet).toHaveBeenCalledWith({ helpGuideViewerHintDismissed: true }, expect.any(Function));
        expect(dom.window.helpGuidesApp.getState().viewerHintDismissed).toBe(true);
        closeApp(dom);
    });

    test('shows a five-second side-panel message after Open is selected', async () => {
        const pdfBytes = Uint8Array.from([37, 80, 68, 70, 45, 49, 46, 55]).buffer;
        const { dom } = await createApp({ sharePointBytes: pdfBytes, viewerHintDismissed: true });
        const guide = dom.window.HELP_GUIDES.find(item => item.id === 'debug-sharepoint-pdf-1');
        await dom.window.helpGuidesApp.openGuide(guide);
        const open = dom.window.document.getElementById('open-external');
        open.addEventListener('click', event => event.preventDefault());

        open.click();

        expect(dom.window.document.getElementById('viewer-coachmark-title').textContent)
            .toBe('Opened in a new tab');
        expect(dom.window.document.getElementById('viewer-coachmark-optout').hidden).toBe(true);
        expect(dom.window.document.querySelector('.viewer-coachmark-progress')).not.toBeNull();
        closeApp(dom);
    });

    test('rejects a SharePoint sign-in page instead of rendering it as a PDF', async () => {
        const htmlBytes = Uint8Array.from([60, 104, 116, 109, 108, 62]).buffer;
        const { dom } = await createApp({ sharePointBytes: htmlBytes });
        const guide = dom.window.HELP_GUIDES.find(item => item.id === 'debug-sharepoint-pdf-2');

        await dom.window.helpGuidesApp.openGuide(guide);

        expect(dom.window.URL.createObjectURL).not.toHaveBeenCalled();
        expect(dom.window.document.getElementById('pdf-frame').src).toBe('about:blank');
        expect(dom.window.document.getElementById('viewer-fallback').hidden).toBe(false);
        closeApp(dom);
    });

    test('slides between the guide library and PDF viewer in both directions', async () => {
        const { dom } = await createApp({ reducedMotion: false });
        const { document } = dom.window;

        document.querySelector('[data-guide-id="approval-budget"]').click();
        expect(document.getElementById('viewer-view').classList).toContain('is-entering');
        expect(document.getElementById('library-view').classList).toContain('is-leaving');
        await new Promise(resolve => dom.window.setTimeout(resolve, 300));
        expect(document.getElementById('library-view').hidden).toBe(true);

        document.getElementById('back-to-guides').click();
        expect(document.getElementById('viewer-view').classList).toContain('is-leaving');
        expect(document.getElementById('library-view').classList).toContain('is-returning');
        await new Promise(resolve => dom.window.setTimeout(resolve, 300));
        expect(document.getElementById('viewer-view').hidden).toBe(true);
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

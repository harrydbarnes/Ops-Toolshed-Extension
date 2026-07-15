const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.resolve(__dirname, '../help-guides.html'), 'utf8');
const dataCode = fs.readFileSync(path.resolve(__dirname, '../help-guides-data.js'), 'utf8');
const appCode = fs.readFileSync(path.resolve(__dirname, '../help-guides.js'), 'utf8');

function createApp() {
    const dom = new JSDOM(html, {
        runScripts: 'outside-only',
        url: 'chrome-extension://test/help-guides.html'
    });
    dom.window.eval(dataCode);
    dom.window.eval(appCode);
    return dom;
}

describe('Help Guides side panel', () => {
    test('renders all twelve test guides and six category controls', () => {
        const dom = createApp();
        expect(dom.window.document.querySelectorAll('.guide-card')).toHaveLength(12);
        expect(dom.window.document.querySelectorAll('.category-filter')).toHaveLength(6);
        expect(dom.window.document.getElementById('results-summary').textContent).toBe('12 guides');
        dom.window.close();
    });

    test('filters by category and supports fuzzy tag search', () => {
        const dom = createApp();
        const { document, Event } = dom.window;

        document.querySelector('[data-category="Reconciliation"]').click();
        expect(document.querySelectorAll('.guide-card')).toHaveLength(3);

        document.querySelector('[data-category="All"]').click();
        const search = document.getElementById('guide-search');
        search.value = 'overspnd';
        search.dispatchEvent(new Event('input', { bubbles: true }));

        expect(document.querySelectorAll('.guide-card')).toHaveLength(1);
        expect(document.querySelector('.guide-card strong').textContent).toBe('Investigating spend variances');
        dom.window.close();
    });

    test('opens the selected PDF inside the panel and offers a new-tab fallback', () => {
        const dom = createApp();
        const { document } = dom.window;
        document.querySelector('[data-guide-id="meta-export"]').click();

        expect(document.getElementById('library-view').hidden).toBe(true);
        expect(document.getElementById('viewer-view').hidden).toBe(false);
        expect(document.getElementById('viewer-title').textContent).toBe('Exporting delivery from Meta');
        expect(document.getElementById('pdf-frame').src).toContain('dummy.pdf');
        expect(document.getElementById('open-external').href).toContain('dummy.pdf');

        document.getElementById('back-to-guides').click();
        expect(document.getElementById('library-view').hidden).toBe(false);
        dom.window.close();
    });

    test('uses textContent so guide metadata cannot inject markup', () => {
        const dom = createApp();
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
        dom.window.close();
    });
});

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const gateSource = fs.readFileSync(path.resolve(__dirname, '../extension-page-gate.js'), 'utf8');
const gatedPages = [
    'settings.html',
    'toolshed.html',
    'approvers.html',
    'onboarding.html',
    'onboarding-tour.html',
    'onboarding-tour-v2.html',
    'help-guides.html',
    'social-finance.html'
];

function createPage({ disabled = false, storageError = false } = {}) {
    const dom = new JSDOM('<!doctype html><html><body><p id="original">Original</p></body></html>', {
        runScripts: 'outside-only',
        url: 'chrome-extension://test/settings.html'
    });
    const { window } = dom;
    const gateScript = window.document.createElement('script');
    gateScript.dataset.scripts = '';
    Object.defineProperty(window.document, 'currentScript', {
        configurable: true,
        value: gateScript
    });
    window.chrome = {
        runtime: { lastError: storageError ? { message: 'unavailable' } : null },
        storage: {
            sync: {
                get: jest.fn((_defaults, callback) => {
                    const result = { allFeaturesDisabled: disabled };
                    callback(result);
                    return Promise.resolve(result);
                })
            },
            onChanged: { addListener: jest.fn() }
        }
    };
    window.eval(gateSource);
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
    return dom;
}

describe('extension page gate', () => {
    test('shows only an inert Off message when the master setting is disabled', async () => {
        const dom = createPage({ disabled: true });
        await Promise.resolve();

        expect(dom.window.opsToolshedPageGate.isEnabled()).toBe(false);
        expect(dom.window.document.documentElement.hidden).toBe(false);
        expect(dom.window.document.body.textContent).toContain('Ops Toolshed features are off');
        expect(dom.window.document.getElementById('original')).toBeNull();
        dom.window.close();
    });

    test('unhides an enabled page after the gate resolves', async () => {
        const dom = createPage({ disabled: false });
        await Promise.resolve();
        await Promise.resolve();

        await expect(dom.window.opsToolshedPageGate.ready).resolves.toBe(true);
        expect(dom.window.opsToolshedPageGate.isEnabled()).toBe(true);
        expect(dom.window.document.documentElement.hidden).toBe(false);
        expect(dom.window.document.getElementById('original')).not.toBeNull();
        dom.window.close();
    });

    test('fails closed when storage cannot establish the master state', async () => {
        const dom = createPage({ storageError: true });
        await Promise.resolve();

        await expect(dom.window.opsToolshedPageGate.ready).resolves.toBe(false);
        expect(dom.window.document.body.textContent).toContain('Ops Toolshed features are off');
        dom.window.close();
    });

    test('loads only the gate directly on every non-popup extension page', () => {
        gatedPages.forEach(page => {
            const html = fs.readFileSync(path.resolve(__dirname, `../${page}`), 'utf8');
            const directSources = Array.from(html.matchAll(/<script[^>]+src="([^"]+)"/g), match => match[1]);
            expect(directSources).toEqual(['extension-page-gate.js']);
            expect(html).toContain('data-scripts=');
            expect(html).toContain('<style>html { visibility: hidden; }</style>');
        });
    });
});

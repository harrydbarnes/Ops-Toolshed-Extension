const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.resolve(__dirname, '../onboarding.html'), 'utf8');
const script = fs.readFileSync(path.resolve(__dirname, '../onboarding.js'), 'utf8');

function createStorage(initial = {}) {
    const store = { ...initial };
    return {
        store,
        get: jest.fn((defaults, callback) => {
            const result = { ...defaults, ...store };
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

function setup() {
    const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'chrome-extension://test/onboarding.html' });
    const sync = createStorage();
    const local = createStorage();
    dom.window.chrome = {
        runtime: { getURL: jest.fn(file => `chrome-extension://test/${file}`), lastError: undefined },
        storage: { sync, local },
        sidePanel: { setOptions: jest.fn(() => Promise.resolve()), open: jest.fn(() => Promise.resolve()) },
        tabs: { update: jest.fn() },
        windows: { WINDOW_ID_CURRENT: -2 }
    };
    dom.window.eval(script);
    return { dom, sync, local, chrome: dom.window.chrome };
}

describe('First-run onboarding', () => {
    test('uses a five-step accessible tab flow', async () => {
        const { dom } = setup();
        await Promise.resolve();

        const tabs = Array.from(dom.window.document.querySelectorAll('[role="tab"]'));
        expect(tabs).toHaveLength(5);
        expect(tabs[0].getAttribute('aria-selected')).toBe('true');

        dom.window.document.getElementById('next-step').click();
        expect(tabs[1].getAttribute('aria-selected')).toBe('true');
        expect(dom.window.document.querySelector('[data-page="1"]').hidden).toBe(false);
        dom.window.close();
    });

    test('saves settings as choices change', async () => {
        const { dom, sync } = setup();
        await Promise.resolve();

        const toggle = dom.window.document.querySelector('[data-setting="helpGuidesEnabled"]');
        toggle.checked = false;
        toggle.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

        expect(sync.set).toHaveBeenCalledWith({ helpGuidesEnabled: false }, expect.any(Function));
        dom.window.close();
    });

    test('opens Prisma and the guided side panel from the final step', async () => {
        const { dom, local, chrome } = setup();
        await Promise.resolve();

        const tabs = dom.window.document.querySelectorAll('[role="tab"]');
        tabs[4].click();
        dom.window.document.getElementById('start-tour').click();

        expect(chrome.sidePanel.setOptions).toHaveBeenCalledWith({ path: 'onboarding-tour.html', enabled: true });
        expect(chrome.sidePanel.open).toHaveBeenCalledWith({ windowId: -2 });
        expect(chrome.tabs.update).toHaveBeenCalledWith(expect.objectContaining({
            url: expect.stringContaining('groupmuk-prisma.mediaocean.com')
        }));
        expect(local.store).toEqual(expect.objectContaining({ onboardingCompleted: true, onboardingTourActive: true }));
        dom.window.close();
    });
});

const path = require('path');
const { JSDOM } = require('jsdom');
const { readScript } = require('./helpers/read-script');
const flush = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };

async function launcher(sendMessage, data = {}) {
        const dom = new JSDOM('<mo-banner-user-menu></mo-banner-user-menu>', {
        url: 'https://go.mediaocean.com/campaign-management/',
        runScripts: 'outside-only'
    });
    const win = dom.window;
    await new Promise(resolve => win.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    win.chrome = {
        runtime: { sendMessage, getURL: file => `chrome-extension://test/${file}` },
        tabs: { query: async () => [{ id: 42, windowId: 7 }], create: jest.fn() },
        storage: { local: { get: async () => data }, onChanged: { addListener: jest.fn() } }
    };
    win.opsToolshedExtensionState = { isActive: () => true, subscribe: fn => fn(true) };
    win.eval(readScript(path.resolve(__dirname, '..', 'features/reccies-launcher.js')));
    await flush();
    return { dom, win, button: win.document.getElementById('ops-reccies-launcher') };
}

describe('header Reccies preparation', () => {
    test('reuses the count during reconciliation and refreshes it for tracker and assignment changes', async () => {
        let reads = 0;
        const row = { ops: 'Harry', buyer: 'Other', get reccied() { reads++; return 'No'; } };
        const data = { reccieTracker: { rows: [row] }, recciePreferences: { person: 'Harry', assignment: 'ops' } };
        const { dom, win, button } = await launcher(async () => ({ status: 'success' }), data);
        try {
            expect(button.textContent).toBe('Reccies · 1');
            const initialReads = reads;
            const observer = new win.MutationObserver(() => {});
            observer.observe(button, { attributes: true, childList: true, subtree: true });
            for (let i = 0; i < 5; i++) win.opsRecciesLauncher.reconcile();
            expect(reads).toBe(initialReads);
            expect(observer.takeRecords()).toHaveLength(0);
            observer.disconnect();
            const changed = win.chrome.storage.onChanged.addListener.mock.calls[0][0];
            changed({ recciePreferences: { newValue: { person: 'Other', assignment: 'buyer' } } }, 'local');
            expect(button.textContent).toBe('Reccies · 1');
            changed({ reccieTracker: { newValue: { rows: [{ ...row, reccied: 'Yes' }] } } }, 'local');
            expect(button.textContent).toBe('Reccies · 0');
            // Header replacement must retain the latest derived count.
            button.remove(); win.opsRecciesLauncher.reconcile(); await flush();
            expect(win.document.getElementById('ops-reccies-launcher').textContent).toBe('Reccies · 0');
            changed({ recciePreferences: {} }, 'local');
            expect(win.document.getElementById('ops-reccies-launcher').textContent).toBe('Reccies');
        } finally { dom.window.close(); }
    });

    test('Any assignment counts each row once and ignores unrelated or sync storage changes', async () => {
        const prefs = { person: 'HARRY', assignment: 'any' };
        const data = { recciePreferences: prefs, reccieTracker: { rows: [
            { reccied: 'No', ops: 'Harry', buyer: 'Harry' },
            { reccied: 'YES', group: 'harry' },
            { reccied: '', group: 'harry' },
            { reccied: 'No', ops: 'Other' }
        ] } };
        const { dom, win, button } = await launcher(async () => ({ status: 'success' }), data);
        try {
            expect(button.textContent).toBe('Reccies · 2');
            const changed = win.chrome.storage.onChanged.addListener.mock.calls[0][0];
            changed({ reccieTracker: { newValue: null } }, 'sync');
            changed({ unrelated: { newValue: true } }, 'local');
            expect(button.textContent).toBe('Reccies · 2');
            changed({ reccieTracker: {} }, 'local');
            expect(button.textContent).toBe('Reccies · 0');
        } finally { dom.window.close(); }
    });

    test('prepares before activation and calls open directly from the subsequent click', async () => {
        let ready;
        const send = jest.fn(request => request.action === 'prepareReccies'
            ? new Promise(resolve => { ready = resolve; }) : Promise.resolve({ status: 'success' }));
        const { dom, button } = await launcher(send);
        try {
            expect(button.disabled).toBe(true);
            button.click();
            expect(send.mock.calls.filter(([r]) => r.action === 'openReccies')).toHaveLength(0);
            ready({ status: 'success' }); await flush();
            expect(button.disabled).toBe(false);
            // No await here: opening must retain the current click gesture.
            button.click();
            expect(send.mock.calls.filter(([r]) => r.action === 'openReccies')).toHaveLength(1);
        } finally { dom.window.close(); }
    });

    test('recovers from a later cold worker without replaying the original click', async () => {
        let preparations = 0, recover;
        const send = jest.fn(request => {
            if (request.action === 'prepareReccies') {
                if (++preparations === 1) return Promise.resolve({ status: 'success' });
                return new Promise(resolve => { recover = resolve; });
            }
            return Promise.resolve({ status: 'error', code: 'FEATURES_STARTING', message: 'Still starting' });
        });
        const { dom, win, button } = await launcher(send);
        try {
            button.click(); await flush();
            expect(button.disabled).toBe(true);
            expect(button.textContent).toContain('starting');
            recover({ status: 'success' }); await flush();
            expect(button.disabled).toBe(false);
            expect(send.mock.calls.filter(([r]) => r.action === 'openReccies')).toHaveLength(1);
            send.mockImplementation(() => Promise.resolve({ status: 'success' }));
            button.click();
            expect(send.mock.calls.filter(([r]) => r.action === 'openReccies')).toHaveLength(2);
        } finally { dom.window.close(); }
    });

    test('preserves genuine failure details instead of treating every error as startup', async () => {
        const send = jest.fn(request => Promise.resolve(request.action === 'prepareReccies'
            ? { status: 'success' } : { status: 'error', message: 'Panel permission denied' }));
        const { dom, win, button } = await launcher(send);
        try {
            button.click(); await flush();
            win.opsRecciesLauncher.reconcile();
            expect(button.getAttribute('aria-label')).toContain('Panel permission denied');
            expect(send.mock.calls.filter(([r]) => r.action === 'prepareReccies')).toHaveLength(1);
        } finally { dom.window.close(); }
    });
});

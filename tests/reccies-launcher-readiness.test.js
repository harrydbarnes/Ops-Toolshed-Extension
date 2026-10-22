const path = require('path');
const { JSDOM } = require('jsdom');
const { readScript } = require('./helpers/read-script');
const flush = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };

async function launcher(sendMessage) {
        const dom = new JSDOM('<mo-banner-user-menu></mo-banner-user-menu>', {
        url: 'https://go.mediaocean.com/campaign-management/',
        runScripts: 'outside-only'
    });
    const win = dom.window;
    await new Promise(resolve => win.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    win.chrome = {
        runtime: { sendMessage, getURL: file => `chrome-extension://test/${file}` },
        tabs: { query: async () => [{ id: 42, windowId: 7 }], create: jest.fn() },
        storage: { local: { get: async () => ({}) }, onChanged: { addListener() {} } }
    };
    win.opsToolshedExtensionState = { isActive: () => true, subscribe: fn => fn(true) };
    win.eval(readScript(path.resolve(__dirname, '..', 'features/reccies-launcher.js')));
    await flush();
    return { dom, win, button: win.document.getElementById('ops-reccies-launcher') };
}

describe('header Reccies preparation', () => {
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

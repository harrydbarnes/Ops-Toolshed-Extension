const { JSDOM } = require('jsdom');
const { readScript } = require('../helpers/read-script');
const path = require('path');
const code = readScript(path.resolve(__dirname, '../../features/stats-collector.js'));

describe('confirmed placement save collection', () => {
    let dom, window, sendMessage, storageChanged;
    const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
    const click = () => window.document.querySelector('#btn-save span').click();
    const notice = text => {
        const node = window.document.createElement('div');
        node.className = 'toast-success';
        node.textContent = text;
        window.document.body.append(node);
        return node;
    };
    const confirmed = () => sendMessage.mock.calls.map(([message]) => message).filter(message => message.type === 'PLACEMENT_CONFIRMED');
    beforeEach(() => {
        dom = new JSDOM('<div role="dialog"><h2>New placement</h2><button id="btn-save"><span>Save</span></button></div>', {
            runScripts: 'outside-only', url: 'https://go.mediaocean.com/campaign-management/#campaign-id=CP123'
        });
        window = dom.window;
        sendMessage = jest.fn().mockResolvedValue({ status: 'success' });
        window.chrome = { runtime: { sendMessage }, storage: {
            sync: { get: (_key, callback) => callback({ statsCollectorEnabled: true }) },
            onChanged: { addListener: listener => { storageChanged = listener; } }
        } };
        window.loadingMonitor = { getState: () => ({ visibleSpinners: [] }), subscribe: () => () => {} };
        window.eval(code);
        window.statsCollector.initialize();
    });
    afterEach(() => dom.window.close());

    test('does not count clicks, repeated clicks, stale success or generic success', async () => {
        notice('Placement created successfully.');
        click(); click();
        notice('Success');
        await flush();
        expect(confirmed()).toHaveLength(0);
        expect(sendMessage.mock.calls.some(([message]) => message.type === 'PLACEMENT_ADDED')).toBe(false);
        const saved = notice('Placement created successfully.');
        await flush();
        saved.textContent = 'Placement created successfully.';
        notice('Placement created successfully.');
        await flush();
        expect(confirmed()).toHaveLength(1);
        expect(confirmed()[0].value.kind).toBe('created');
    });

    test('distinguishes update, create and an unclassified confirmed save', async () => {
        window.document.querySelector('h2').textContent = 'Edit placement';
        click(); notice('Placement saved successfully.'); await flush();
        window.document.querySelector('h2').textContent = 'Placement';
        click(); notice('Placement saved successfully.'); await flush();
        click(); notice('Placement updated successfully.'); await flush();
        expect(confirmed().map(message => message.value.kind)).toEqual(['updated', 'other', 'updated']);
        expect(new Set(confirmed().map(message => message.value.eventId)).size).toBe(3);
    });

    test('failed validation can be retried, and navigation and disabling cancel pending evidence', async () => {
        click();
        const error = notice('Unable to save placement');
        error.className = 'toast-error';
        await flush();
        expect(confirmed()).toHaveLength(0);
        click(); notice('Placement added successfully.'); await flush();
        expect(confirmed()).toHaveLength(1);
        click();
        window.history.replaceState({}, '', '#campaign-id=CP999');
        window.dispatchEvent(new window.Event('hashchange'));
        notice('Placement created successfully.'); await flush();
        expect(confirmed()).toHaveLength(1);
        click();
        storageChanged({ statsCollectorEnabled: { newValue: false } }, 'sync');
        notice('Placement created successfully.'); await flush();
        expect(confirmed()).toHaveLength(1);
    });

    test('late success after timeout and success without a save are ignored', async () => {
        jest.useFakeTimers();
        try {
            notice('Placement created successfully.'); await flush();
            expect(confirmed()).toHaveLength(0);
            click();
            jest.advanceTimersByTime(20001);
            notice('Placement created successfully.'); await flush();
            expect(confirmed()).toHaveLength(0);
        } finally { jest.useRealTimers(); }
    });
});

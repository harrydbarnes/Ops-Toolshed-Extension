const { JSDOM } = require('jsdom');
const path = require('path');
const { readScript } = require('./helpers/read-script');
const source = readScript(path.resolve(__dirname, '../utils.js'));

describe('DOM polling utilities', () => {
    let dom;
    beforeEach(() => {
        jest.useFakeTimers();
        dom = new JSDOM('<body></body>', { runScripts: 'outside-only' });
        dom.window.setInterval = setInterval;
        dom.window.clearInterval = clearInterval;
        dom.window.setTimeout = setTimeout;
        dom.window.clearTimeout = clearTimeout;
        dom.window.eval(source);
    });
    afterEach(() => {
        dom.window.close();
        jest.useRealTimers();
    });

    test('returns a delayed lookup result and clears all polling timers', async () => {
        const element = dom.window.document.createElement('button');
        const find = jest.fn().mockReturnValueOnce(null).mockReturnValue(element);
        const pending = dom.window.utils.waitForResult(find, { timeout: 500 });
        await jest.advanceTimersByTimeAsync(200);
        await expect(pending).resolves.toBe(element);
        expect(jest.getTimerCount()).toBe(0);
    });

    test('rejects with the supplied timeout message and stops looking', async () => {
        const find = jest.fn().mockReturnValue(null);
        const pending = dom.window.utils.waitForResult(find, { timeout: 250, timeoutMessage: 'Copy button unavailable' });
        const assertion = expect(pending).rejects.toThrow('Copy button unavailable');
        await jest.advanceTimersByTimeAsync(250);
        await assertion;
        expect(find).toHaveBeenCalledTimes(2);
        expect(jest.getTimerCount()).toBe(0);
    });

    test('rejects lookup errors immediately and clears both timers', async () => {
        const failure = new Error('DOM lookup failed');
        const pending = dom.window.utils.waitForResult(() => { throw failure; }, { timeout: 500 });
        const assertion = expect(pending).rejects.toBe(failure);
        await jest.advanceTimersByTimeAsync(100);
        await assertion;
        expect(jest.getTimerCount()).toBe(0);
    });

    test('shadow lookup accepts timeout second and an optional search root third', async () => {
        const host = dom.window.document.createElement('div');
        dom.window.document.body.append(host);
        const root = host.attachShadow({ mode: 'open' });
        const button = dom.window.document.createElement('button');
        root.append(button);
        const pending = dom.window.utils.waitForElementInShadow('button', 500, root);
        await jest.advanceTimersByTimeAsync(200);
        await expect(pending).resolves.toBe(button);
        expect(jest.getTimerCount()).toBe(0);
    });

    test('shadow lookup enforces a caller-supplied timeout without requiring a root', async () => {
        const pending = dom.window.utils.waitForElementInShadow('.missing', 250);
        const assertion = expect(pending).rejects.toThrow('not found within 250ms');
        await jest.advanceTimersByTimeAsync(250);
        await assertion;
        expect(jest.getTimerCount()).toBe(0);
    });
});

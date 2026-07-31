const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const bridgeScript = fs.readFileSync(
    path.resolve(__dirname, '../../features/moe-launcher-bridge.js'),
    'utf8'
);

describe('Moe launcher main-page bridge', () => {
    let dom;

    beforeEach(() => {
        jest.useFakeTimers();
        dom = new JSDOM('<!doctype html><html><body></body></html>', {
            runScripts: 'outside-only',
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/'
        });
    });

    afterEach(() => {
        dom?.window.close();
        jest.useRealTimers();
    });

    test('opens the supported Zendesk messaging UI immediately when available', () => {
        dom.window.zE = jest.fn();
        const pageScan = jest.spyOn(dom.window.document, 'querySelectorAll');
        dom.window.eval(bridgeScript);
        const baselineTimers = jest.getTimerCount();

        dom.window.document.dispatchEvent(new dom.window.CustomEvent('ops-toolshed-open-moe'));

        expect(dom.window.zE).toHaveBeenCalledWith('messenger', 'open');
        expect(jest.getTimerCount()).toBe(baselineTimers);
        expect(pageScan).not.toHaveBeenCalled();
    });

    test('uses one short-lived retry loop when Zendesk is still starting', () => {
        dom.window.eval(bridgeScript);
        const baselineTimers = jest.getTimerCount();
        dom.window.document.dispatchEvent(new dom.window.CustomEvent('ops-toolshed-open-moe'));
        dom.window.document.dispatchEvent(new dom.window.CustomEvent('ops-toolshed-open-moe'));
        expect(jest.getTimerCount()).toBe(baselineTimers + 1);

        dom.window.zE = jest.fn();
        jest.advanceTimersByTime(100);

        expect(dom.window.zE).toHaveBeenCalledTimes(1);
        expect(dom.window.zE).toHaveBeenCalledWith('messenger', 'open');
        expect(jest.getTimerCount()).toBe(0);
    });

    test('stops retrying when the Zendesk API remains unavailable', () => {
        dom.window.zE = jest.fn(() => {
            throw new Error('Widget still starting');
        });
        dom.window.eval(bridgeScript);
        dom.window.document.dispatchEvent(new dom.window.CustomEvent('ops-toolshed-open-moe'));

        jest.advanceTimersByTime(2000);

        expect(dom.window.zE).toHaveBeenCalledTimes(21);
        expect(jest.getTimerCount()).toBe(0);
    });
});

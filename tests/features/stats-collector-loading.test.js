const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const utilsCode = fs.readFileSync(path.resolve(__dirname, '../../utils.js'), 'utf8');
const statsCode = fs.readFileSync(path.resolve(__dirname, '../../features/stats-collector.js'), 'utf8');

describe('loading-time collection', () => {
    function createCollector() {
        const dom = new JSDOM('<!doctype html><html><body></body></html>', {
            runScripts: 'dangerously',
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/'
        });
        const { window } = dom;
        let now = 0;
        const NativeDate = window.Date;
        window.Date = class extends NativeDate {
            static now() { return now; }
        };
        window.chrome = {
            runtime: { sendMessage: jest.fn() },
            storage: {
                sync: { get: jest.fn((_key, callback) => callback({ statsCollectorEnabled: true })) },
                onChanged: { addListener: jest.fn() }
            }
        };
        window.MutationObserver = jest.fn(() => ({ observe: jest.fn(), disconnect: jest.fn() }));
        window.eval(utilsCode);
        window.eval(statsCode);
        window.statsCollector.initialize();
        return { dom, window, setNow: value => { now = value; } };
    }

    function makeVisible(element) {
        element.getBoundingClientRect = () => ({ width: 40, height: 40, left: 0, top: 0, right: 40, bottom: 40 });
        return element;
    }

    test('counts a short campaign spinner and finishes when it disappears', () => {
        const { dom, window, setNow } = createCollector();
        const spinner = makeVisible(window.document.createElement('i'));
        spinner.className = 'fa fa-circle-o-notch fa-spin';
        const blocker = window.document.createElement('div');
        blocker.id = 'vp-block';
        blocker.appendChild(spinner);

        setNow(1000);
        window.document.body.appendChild(blocker);
        window.statsCollector.checkLoadingState();
        setNow(1050);
        blocker.remove();
        window.statsCollector.checkLoadingState();

        expect(window.chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'TRACK_STAT',
            type: 'LOADING_TIME',
            value: 0.05
        });
        dom.window.close();
    });

    test('keeps one continuous timer while visible spinner elements are replaced', () => {
        const { dom, window, setNow } = createCollector();
        const first = makeVisible(window.document.createElement('mo-spinner'));
        const second = makeVisible(window.document.createElement('div'));
        second.className = 'mo-spinner';

        setNow(1000);
        window.document.body.appendChild(first);
        window.statsCollector.checkLoadingState();
        setNow(1400);
        first.replaceWith(second);
        window.statsCollector.checkLoadingState();
        setNow(2500);
        second.remove();
        window.statsCollector.checkLoadingState();

        expect(window.chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
        expect(window.chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'TRACK_STAT',
            type: 'LOADING_TIME',
            value: 1.5
        });
        dom.window.close();
    });

    test('ignores hidden stale spinner nodes', () => {
        const { dom, window, setNow } = createCollector();
        const spinner = makeVisible(window.document.createElement('mo-spinner'));
        spinner.style.visibility = 'hidden';

        setNow(1000);
        window.document.body.appendChild(spinner);
        window.statsCollector.checkLoadingState();
        setNow(3000);
        spinner.remove();
        window.statsCollector.checkLoadingState();

        expect(window.chrome.runtime.sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'LOADING_TIME' }));
        dom.window.close();
    });
});

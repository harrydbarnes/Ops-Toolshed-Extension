const { readScript } = require('../helpers/read-script');
const path = require('path');
const { JSDOM } = require('jsdom');

const utilsCode = readScript(path.resolve(__dirname, '../../utils.js'));
const statsCode = readScript(path.resolve(__dirname, '../../features/stats-collector.js'));

describe('loading-time collection', () => {
    function createCollector(
        url = 'https://groupmuk-prisma.mediaocean.com/campaign-management/',
        sendMessage = jest.fn().mockResolvedValue({ status: 'success' })
    ) {
        const dom = new JSDOM('<!doctype html><html><body></body></html>', {
            runScripts: 'dangerously',
            url
        });
        const { window } = dom;
        let now = 0;
        const NativeDate = window.Date;
        window.Date = class extends NativeDate {
            static now() { return now; }
        };
        window.chrome = {
            runtime: { sendMessage },
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

    test('captures exact GBP totals once, rejects rounded money and stale campaign headers', () => {
        const { dom, window } = createCollector('https://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP123');
        window.document.body.innerHTML = '<div class="buy-details-wrapper">CP123 | Campaign</div><div data-cy="budget-type-label">Total client cost</div><div data-cy="budget-amount">£1,000.00 budget</div><div data-cy="budget-purchased">£800.00 buy total (billable amount)</div>';
        window.campaignHistoryFeature = { getCampaignSnapshot: () => ({ key: 'campaign:cp123', campaignId: 'CP123', clientName: 'Client', supplier: 'Meta' }) };
        window.statsCollector.checkLoadingState();
        window.statsCollector.checkLoadingState();
        let snapshots = window.chrome.runtime.sendMessage.mock.calls.map(call => call[0]).filter(message => message.type === 'CAMPAIGN_SNAPSHOT');
        expect(snapshots).toHaveLength(1);
        expect(snapshots[0].value).toMatchObject({ budget: 1000, booked: 800 });
        window.document.querySelector('[data-cy="budget-amount"]').textContent = '£1k';
        window.statsCollector.checkLoadingState();
        snapshots = window.chrome.runtime.sendMessage.mock.calls.map(call => call[0]).filter(message => message.type === 'CAMPAIGN_SNAPSHOT');
        expect(snapshots[1].value.budget).toBeNull();
        window.document.querySelector('.buy-details-wrapper').textContent = 'CP999 | Old campaign';
        window.document.querySelector('[data-cy="budget-amount"]').textContent = '£999.00';
        window.statsCollector.checkLoadingState();
        expect(window.chrome.runtime.sendMessage.mock.calls.filter(call => call[0].type === 'CAMPAIGN_SNAPSHOT')).toHaveLength(2);
        dom.window.close();
    });

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
            value: { seconds: 0.05, area: 'other' }
        });
        dom.window.close();
    });

    test('records only one visit when Prisma rewrites the same campaign route', () => {
        const sendMessage = jest.fn().mockResolvedValue({ status: 'success' });
        const { dom, window } = createCollector(
            'https://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP3BP6L&ptb-mod=buy',
            sendMessage
        );

        window.statsCollector.trackCampaignId();
        window.history.replaceState({}, '', '#campaign-id=CP3BP6L&ptb-mod=buy&route=online');
        window.statsCollector.trackCampaignId();

        expect(sendMessage).toHaveBeenCalledTimes(1);
        expect(sendMessage).toHaveBeenCalledWith({
            action: 'TRACK_STAT',
            type: 'CAMPAIGN_VISIT',
            value: 'CP3BP6L'
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
            value: { seconds: 1.5, area: 'other' }
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

    test('counts the wide loader used by Actualise', () => {
        const { dom, window, setNow } = createCollector();
        const spinner = makeVisible(window.document.createElement('mo-spinner'));
        Object.defineProperty(spinner, 'offsetWidth', { value: 500 });

        setNow(1000);
        window.document.body.appendChild(spinner);
        window.statsCollector.checkLoadingState();
        setNow(4250);
        spinner.remove();
        window.statsCollector.checkLoadingState();

        expect(window.chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'TRACK_STAT',
            type: 'LOADING_TIME',
            value: { seconds: 3.25, area: 'other' }
        });
        dom.window.close();
    });

    test.each([
        ['https://groupmuk-prisma.mediaocean.com/campaign-management/#osPspId=cm-dashboard&route=campaigns', 'home'],
        ['https://groupmuk-prisma.mediaocean.com/campaign-management/#ptb-mod=plan&ptb-ctx=rfpSummary', 'plan'],
        ['https://groupmuk-prisma.mediaocean.com/campaign-management/#ptb-mod=buy&ptb-ctx=digital&route=online', 'buy'],
        ['https://groupmuk-prisma.mediaocean.com/campaign-management/#ptb-mod=buy&ptb-ctx=actualize&route=actualize', 'actualise'],
        ['https://groupmuk-prisma.mediaocean.com/campaign-management/#ptb-mod=traffic', 'traffic'],
        ['https://groupmuk-prisma.mediaocean.com/campaign-management/#ptb-mod=analyze', 'analyse'],
        ['https://groupmuk-prisma.mediaocean.com/campaign-management/#ptb-mod=buy&ptb-ctx=orderSummary&showOrders=true', 'orders']
    ])('classifies %s as %s', (url, expectedArea) => {
        const { dom, window } = createCollector(url);
        expect(window.statsCollector.getPrismaArea()).toBe(expectedArea);
        dom.window.close();
    });

    test('splits continuous loading time when navigation changes the Prisma area', () => {
        const { dom, window, setNow } = createCollector(
            'https://groupmuk-prisma.mediaocean.com/campaign-management/#osPspId=cm-dashboard&route=campaigns'
        );
        const spinner = makeVisible(window.document.createElement('mo-spinner'));

        setNow(1000);
        window.document.body.appendChild(spinner);
        window.statsCollector.checkLoadingState();
        setNow(1500);
        window.history.replaceState({}, '', '#ptb-mod=plan&ptb-ctx=rfpSummary');
        window.statsCollector.checkLoadingState();
        setNow(2500);
        spinner.remove();
        window.statsCollector.checkLoadingState();

        expect(window.chrome.runtime.sendMessage).toHaveBeenNthCalledWith(1, {
            action: 'TRACK_STAT',
            type: 'LOADING_TIME',
            value: { seconds: 0.5, area: 'home' }
        });
        expect(window.chrome.runtime.sendMessage).toHaveBeenNthCalledWith(2, {
            action: 'TRACK_STAT',
            type: 'LOADING_TIME',
            value: { seconds: 1, area: 'plan' }
        });
        dom.window.close();
    });

    test('records shared monitor transitions without a separate observer and resumes after pagehide', () => {
        const dom = new JSDOM('<!doctype html><html><body></body></html>', {
            runScripts: 'outside-only',
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/'
        });
        const { window } = dom;
        let now = 1000;
        window.Date.now = () => now;
        window.chrome = {
            runtime: { sendMessage: jest.fn().mockResolvedValue({ status: 'success' }) },
            storage: {
                sync: { get: jest.fn((_key, callback) => callback({ statsCollectorEnabled: true })) },
                onChanged: { addListener: jest.fn() }
            }
        };
        let deliverMutations;
        window.MutationObserver = jest.fn(callback => {
            deliverMutations = callback;
            return { observe: jest.fn(), disconnect: jest.fn() };
        });
        window.eval(utilsCode);
        window.eval(readScript(path.resolve(__dirname, '../../features/loading-monitor.js')));
        window.loadingMonitor.initialize();
        const observersBeforeStats = window.MutationObserver.mock.calls.length;
        const subscribe = jest.spyOn(window.loadingMonitor, 'subscribe');
        window.eval(statsCode);
        window.statsCollector.initialize();
        window.statsCollector.initialize();
        expect(window.MutationObserver).toHaveBeenCalledTimes(observersBeforeStats);

        const spinner = makeVisible(window.document.createElement('mo-spinner'));
        window.document.body.appendChild(spinner);
        deliverMutations([{ type: 'childList', addedNodes: [spinner] }]);
        window.loadingMonitor.refreshNow();
        now = 1500;
        window.dispatchEvent(new window.Event('pagehide'));
        expect(window.chrome.runtime.sendMessage).toHaveBeenLastCalledWith({
            action: 'TRACK_STAT', type: 'LOADING_TIME', value: { seconds: 0.5, area: 'other' }
        });
        expect(subscribe).toHaveBeenCalledTimes(1);
        now = 2000;
        spinner.remove();
        window.loadingMonitor.refreshNow();
        expect(window.chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
        window.dispatchEvent(new window.Event('pageshow'));
        expect(subscribe).toHaveBeenCalledTimes(2);
        window.document.body.appendChild(spinner);
        deliverMutations([{ type: 'childList', addedNodes: [spinner] }]);
        window.loadingMonitor.refreshNow();
        now = 2250;
        spinner.remove();
        window.loadingMonitor.refreshNow();
        expect(window.chrome.runtime.sendMessage).toHaveBeenLastCalledWith({
            action: 'TRACK_STAT', type: 'LOADING_TIME', value: { seconds: 0.25, area: 'other' }
        });
        expect(window.chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
        dom.window.close();
    });

});

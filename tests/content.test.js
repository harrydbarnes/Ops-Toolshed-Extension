const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const scriptsToLoad = [
    'utils.js',
    'features/logo.js',
    'features/reminders.js',
    'features/campaign.js',
    'features/d-number-search.js',
    'features/gmi-chat.js',
    'features/live-chat-enhancements.js',
    'features/approver-pasting.js',
    'features/max-campaign-budget.js',
    'features/dst-assurance.js',
    'features/actualise-month-assurance.js',
    'content.js'
].map(scriptPath => fs.readFileSync(path.resolve(__dirname, `../${scriptPath}`), 'utf8'));

describe('Content Script Main Logic', () => {
    let window;
    let document;
    let consoleSpy;

    const setupJSDOM = (url, param2 = [], param3 = [], param4 = {}) => {
        let customReminders = [];
        let options = {};
        if (typeof param2 === 'boolean') {
            customReminders = Array.isArray(param3) ? param3 : [];
            options = param4 || {};
        } else {
            customReminders = Array.isArray(param2) ? param2 : [];
            options = param3 || {};
        }
        require('./mocks/chrome');
        chrome.runtime.id = 'test-extension-id';
        chrome.storage.sync.__getStore().customReminders = customReminders;

        const configureStorageGet = (storageArea) => {
            storageArea.get.mockImplementation((keys, callback) => {
                const readStoredValues = () => {
                    const store = storageArea.__getStore();
                    const result = {};
                    if (!keys) {
                        Object.assign(result, store);
                    } else if (Array.isArray(keys)) {
                        keys.forEach(key => {
                            if (store[key] !== undefined) result[key] = store[key];
                        });
                    } else if (typeof keys === 'object') {
                        Object.keys(keys).forEach(key => {
                            result[key] = store[key] === undefined ? keys[key] : store[key];
                        });
                    } else if (store[keys] !== undefined) {
                        result[keys] = store[keys];
                    }
                    if (callback) callback(result);
                    return result;
                };

                if (options.synchronousStorage) {
                    return Promise.resolve(readStoredValues());
                }
                return new Promise(resolve => {
                    setTimeout(() => resolve(readStoredValues()), 0);
                });
            });
        };
        configureStorageGet(chrome.storage.local);
        configureStorageGet(chrome.storage.sync);

        const dom = new JSDOM('<!DOCTYPE html><html><body><p>Some initial content</p></body></html>', { url, runScripts: 'dangerously' });
        window = dom.window;
        document = window.document;
        window.chrome = global.chrome;
        Object.defineProperty(document.body, 'innerText', {
            configurable: true,
            get() {
                return this.textContent;
            }
        });

        // Mock feature modules before loading scripts
        window.statsCollector = {
            initialize: jest.fn(),
            trackCampaignId: jest.fn(),
        };

        // Mock setInterval to prevent infinite loops when using jest.runAllTimers()
        window.eval(`
            window.__intervalCallbacks = [];
            window.setInterval = callback => window.__intervalCallbacks.push(callback);
        `);

        const mutationCallbackMap = new Map();
        const mutationObservers = [];
        window.MutationObserver = jest.fn(function(callback) {
            const instance = {
                observe: jest.fn(() => mutationCallbackMap.set(instance, callback)),
                disconnect: jest.fn(() => mutationCallbackMap.delete(instance)),
                __callback: callback,
                __trigger: (mutations) => {
                    const cb = mutationCallbackMap.get(instance);
                    if (cb) cb(mutations, instance);
                }
            };
            mutationObservers.push(instance);
            return instance;
        });

        // Load all scripts into the JSDOM environment
        scriptsToLoad.forEach(scriptContent => {
            const scriptEl = document.createElement('script');
            scriptEl.textContent = scriptContent;
            document.head.appendChild(scriptEl);
        });

        // Route-startup tests can replace feature modules after their source
        // has loaded but before DOMContentLoaded invokes content.js.
        if (options.featureMocks) {
            Object.assign(window, options.featureMocks);
        }

        // Manually dispatch DOMContentLoaded to ensure the script's main logic runs.
        if (options.dispatchDOMContentLoaded !== false) {
            document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true, cancelable: true }));
        }

        return {
            window,
            document,
            intervalCallbacks: window.__intervalCallbacks,
            mutationObservers
        };
    };

    beforeEach(() => {
        if (typeof resetMocks === 'function') resetMocks();
        jest.useFakeTimers();
        consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        if (window) window.close();
        jest.useRealTimers();
        consoleSpy.mockRestore();
        jest.clearAllMocks();
    });

    test('should initialize features on injection', () => {
        const { window } = setupJSDOM('https://groupmuk-prisma.mediaocean.com/');
        const hasInitializationLog = consoleSpy.mock.calls.some(call => call.join(' ').includes('[ContentScript Prisma] Script Injected'));
        expect(hasInitializationLog).toBe(true);
        expect(window.statsCollector).toBeDefined();
    });

    test('starts campaign features only on campaign routes and keeps Actualise/Orders route gates narrow', async () => {
        const featureNames = [
            'appLearnFeature',
            'helpGuidesLauncherFeature',
            'bannerUsernameFeature',
            'placementCounterFeature',
            'dstAssuranceFeature',
            'approverPastingFeature',
            'swapAccountsFeature',
            'autoCopyUrlFeature',
            'orderIdCopyFeature',
            'orderViewToggleFeature',
            'orderGridScrollSyncFeature',
            'actualiseScrollRestoreFeature',
            'actualiseNavbarFeature',
            'actualiseShortcutFeature',
            'actualiseExportAllFeature',
            'actualiseMonthAssuranceFeature',
            'maxCampaignBudgetFeature',
            'campaignTabTitleFeature',
            'loadingFactsFeature',
            'liveChatEnhancements'
        ];
        const makeMocks = () => Object.fromEntries(featureNames.map(name => [name, {
            initialize: jest.fn(),
            apply: jest.fn(),
            applyTransparency: jest.fn(),
            ensureLauncher: jest.fn(),
            handleOrderViewToggle: jest.fn(),
            isNewOrderUi: jest.fn(() => false),
            handleApproverPasting: jest.fn(),
            handleManageFavouritesButton: jest.fn(),
            addRecipientHistoryControls: jest.fn(),
            handleAutoCopy: jest.fn(),
            checkSelection: jest.fn(),
            syncAll: jest.fn(),
            checkAndAddCopyButtons: jest.fn()
        }]));
        const logoMock = { shouldReplaceLogoOnThisPage: jest.fn(() => false) };

        const dashboardMocks = makeMocks();
        dashboardMocks.logoFeature = logoMock;
        const dashboard = setupJSDOM(
            'https://groupmuk-prisma.mediaocean.com/campaign-management/#osPspId=cm-dashboard&route=campaigns',
            [],
            { synchronousStorage: true, featureMocks: dashboardMocks }
        );
        await Promise.resolve();
        jest.runOnlyPendingTimers();

        expect(dashboardMocks.appLearnFeature.initialize).toHaveBeenCalledTimes(1);
        expect(dashboardMocks.helpGuidesLauncherFeature.initialize).toHaveBeenCalledTimes(1);
        expect(dashboardMocks.loadingFactsFeature.initialize).toHaveBeenCalledTimes(1);
        expect(dashboardMocks.bannerUsernameFeature.initialize).toHaveBeenCalledTimes(1);
        expect(dashboardMocks.placementCounterFeature.initialize).not.toHaveBeenCalled();
        expect(dashboardMocks.dstAssuranceFeature.initialize).not.toHaveBeenCalled();
        expect(dashboardMocks.approverPastingFeature.initialize).not.toHaveBeenCalled();
        expect(dashboardMocks.autoCopyUrlFeature.initialize).not.toHaveBeenCalled();
        expect(dashboardMocks.liveChatEnhancements.initialize).not.toHaveBeenCalled();
        expect(dashboardMocks.orderIdCopyFeature.initialize).not.toHaveBeenCalled();
        expect(dashboardMocks.orderViewToggleFeature.initialize).not.toHaveBeenCalled();
        expect(dashboardMocks.orderGridScrollSyncFeature.initialize).not.toHaveBeenCalled();
        expect(dashboardMocks.actualiseNavbarFeature.initialize).not.toHaveBeenCalled();
        expect(dashboardMocks.actualiseShortcutFeature.initialize).not.toHaveBeenCalled();
        expect(dashboardMocks.actualiseMonthAssuranceFeature.initialize).not.toHaveBeenCalled();

        dashboard.window.history.replaceState(
            {},
            '',
            '#osPspId=prsm-cm-plan-to-buy&campaign-id=CP123&ptb-mod=buy&ptb-ctx=digital'
        );
        dashboard.window.dispatchEvent(new dashboard.window.Event('popstate'));
        jest.advanceTimersByTime(20);
        jest.advanceTimersByTime(300);
        await Promise.resolve();
        expect(dashboardMocks.orderIdCopyFeature.initialize).toHaveBeenCalledTimes(1);
        expect(dashboardMocks.orderViewToggleFeature.initialize).toHaveBeenCalledTimes(1);
        expect(dashboardMocks.approverPastingFeature.initialize).toHaveBeenCalledTimes(1);
        expect(dashboardMocks.autoCopyUrlFeature.initialize).toHaveBeenCalledTimes(1);
        dashboard.window.close();

        const campaignMocks = makeMocks();
        campaignMocks.logoFeature = logoMock;
        const campaign = setupJSDOM(
            'https://groupmuk-prisma.mediaocean.com/campaign-management/#osPspId=prsm-cm-plan-to-buy&campaign-id=CP123&ptb-mod=buy&ptb-ctx=digital',
            [],
            { synchronousStorage: true, featureMocks: campaignMocks }
        );
        await Promise.resolve();

        expect(campaignMocks.placementCounterFeature.initialize).toHaveBeenCalledTimes(1);
        expect(campaignMocks.dstAssuranceFeature.initialize).toHaveBeenCalledTimes(1);
        expect(campaignMocks.approverPastingFeature.initialize).toHaveBeenCalledTimes(1);
        expect(campaignMocks.autoCopyUrlFeature.initialize).toHaveBeenCalledTimes(1);
        expect(campaignMocks.liveChatEnhancements.initialize).toHaveBeenCalledTimes(1);
        expect(campaignMocks.orderIdCopyFeature.initialize).toHaveBeenCalledTimes(1);
        expect(campaignMocks.orderViewToggleFeature.initialize).toHaveBeenCalledTimes(1);
        expect(campaignMocks.actualiseShortcutFeature.initialize).toHaveBeenCalledTimes(1);
        expect(campaignMocks.actualiseNavbarFeature.initialize).not.toHaveBeenCalled();
        expect(campaignMocks.actualiseExportAllFeature.initialize).not.toHaveBeenCalled();
        expect(campaignMocks.actualiseMonthAssuranceFeature.initialize).not.toHaveBeenCalled();
        expect(campaignMocks.orderGridScrollSyncFeature.initialize).not.toHaveBeenCalled();
        campaign.window.close();

        const actualiseMocks = makeMocks();
        actualiseMocks.logoFeature = logoMock;
        const actualise = setupJSDOM(
            'https://groupmuk-prisma.mediaocean.com/campaign-management/#osPspId=prsm-cm-plan-to-buy&campaign-id=CP123&ptb-mod=buy&ptb-ctx=actualize&route=actualize',
            [],
            { synchronousStorage: true, featureMocks: actualiseMocks }
        );
        await Promise.resolve();

        expect(actualiseMocks.actualiseScrollRestoreFeature.initialize).toHaveBeenCalledTimes(1);
        expect(actualiseMocks.actualiseNavbarFeature.initialize).toHaveBeenCalledTimes(1);
        expect(actualiseMocks.actualiseExportAllFeature.initialize).toHaveBeenCalledTimes(1);
        expect(actualiseMocks.actualiseMonthAssuranceFeature.initialize).toHaveBeenCalledTimes(1);
        expect(actualiseMocks.actualiseShortcutFeature.initialize).toHaveBeenCalledTimes(1);
        expect(actualiseMocks.dstAssuranceFeature.initialize).toHaveBeenCalledTimes(1);
        expect(actualiseMocks.orderIdCopyFeature.initialize).toHaveBeenCalledTimes(1);
        expect(actualiseMocks.orderViewToggleFeature.initialize).toHaveBeenCalledTimes(1);
        expect(actualiseMocks.orderGridScrollSyncFeature.initialize).not.toHaveBeenCalled();
        actualise.window.close();
    });

    test('coalesces repeated Prisma mutation batches into one fast and one deferred reconciliation', async () => {
        const { window, document, mutationObservers } = setupJSDOM(
            'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=CP123&ptb-mod=buy&ptb-ctx=actualize&route=actualize',
            [],
            { synchronousStorage: true }
        );
        await Promise.resolve();
        jest.runOnlyPendingTimers();

        const observer = mutationObservers.find(instance =>
            instance.__callback.toString().includes('scheduleDynamicUiReconciliation') ||
            instance.__callback.toString().includes('orderViewToggleFeature')
        );
        expect(observer).toBeDefined();

        window.actualiseNavbarFeature = {
            isInitialized: jest.fn(() => true),
            apply: jest.fn()
        };
        window.actualiseShortcutFeature = { apply: jest.fn() };
        window.actualiseExportAllFeature = { apply: jest.fn() };
        window.orderViewToggleFeature = { handleOrderViewToggle: jest.fn() };
        const fastApply = window.actualiseNavbarFeature.apply;
        const deferredApply = jest.spyOn(
            window.campaignFeature,
            'handleCampaignNavigationOptimisation'
        ).mockClear();
        const mutation = [{ type: 'childList', target: document.body, addedNodes: [] }];

        for (let index = 0; index < 20; index += 1) observer.__trigger(mutation);

        expect(fastApply).not.toHaveBeenCalled();
        expect(deferredApply).not.toHaveBeenCalled();

        jest.advanceTimersByTime(20);
        expect(fastApply).toHaveBeenCalledTimes(1);
        expect(deferredApply).not.toHaveBeenCalled();

        jest.advanceTimersByTime(300);
        expect(deferredApply).toHaveBeenCalledTimes(1);
    });

    test('does not run campaign or Actualise reconciliation on the Campaigns dashboard', async () => {
        const { window, document, mutationObservers } = setupJSDOM(
            'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=cm-dashboard&route=campaigns',
            [],
            { synchronousStorage: true }
        );
        await Promise.resolve();
        jest.runOnlyPendingTimers();

        const observer = mutationObservers.find(instance =>
            instance.__callback.toString().includes('scheduleDynamicUiReconciliation') ||
            instance.__callback.toString().includes('orderViewToggleFeature')
        );
        window.actualiseNavbarFeature = { apply: jest.fn() };
        window.actualiseShortcutFeature = { apply: jest.fn() };
        window.actualiseExportAllFeature = { apply: jest.fn() };
        window.orderViewToggleFeature = { handleOrderViewToggle: jest.fn() };
        const actualiseApply = window.actualiseNavbarFeature.apply;
        const navigationApply = jest.spyOn(
            window.campaignFeature,
            'handleCampaignNavigationOptimisation'
        ).mockClear();

        observer.__trigger([{ type: 'childList', target: document.body, addedNodes: [] }]);
        jest.runOnlyPendingTimers();

        expect(actualiseApply).not.toHaveBeenCalled();
        expect(navigationApply).not.toHaveBeenCalled();
    });

    test('runs campaign controls on Plan without invoking Actualise-only controls', async () => {
        const { window, document, mutationObservers } = setupJSDOM(
            'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=CP123&ptb-mod=plan&ptb-ctx=rfpSummary',
            [],
            { synchronousStorage: true }
        );
        await Promise.resolve();
        jest.runOnlyPendingTimers();

        window.actualiseNavbarFeature = { apply: jest.fn() };
        window.actualiseShortcutFeature = { apply: jest.fn() };
        window.actualiseExportAllFeature = { apply: jest.fn() };
        window.maxCampaignBudgetFeature = { apply: jest.fn() };
        const navigationApply = jest.spyOn(
            window.campaignFeature,
            'handleCampaignNavigationOptimisation'
        ).mockClear();
        const observer = mutationObservers.find(instance =>
            instance.__callback.toString().includes('scheduleDynamicUiReconciliation')
        );

        observer.__trigger([{ type: 'childList', target: document.body, addedNodes: [] }]);
        jest.runOnlyPendingTimers();

        expect(window.actualiseShortcutFeature.apply).toHaveBeenCalledTimes(1);
        expect(window.maxCampaignBudgetFeature.apply).toHaveBeenCalledTimes(1);
        expect(navigationApply).toHaveBeenCalledTimes(1);
        expect(window.actualiseNavbarFeature.apply).not.toHaveBeenCalled();
        expect(window.actualiseExportAllFeature.apply).not.toHaveBeenCalled();
    });

    test('reconciles legacy Order ID copy and removes stale New Order UI controls on an old Order Summary', async () => {
        const { window, document, mutationObservers } = setupJSDOM(
            'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=CP123&ptb-mod=buy&ptb-ctx=orderSummary&showOrders=true',
            [],
            { synchronousStorage: true }
        );
        await Promise.resolve();
        jest.runOnlyPendingTimers();

        window.orderViewToggleFeature = {
            isNewOrderUi: jest.fn(() => false),
            handleOrderViewToggle: jest.fn()
        };
        window.orderIdCopyFeature = { checkAndAddCopyButtons: jest.fn() };
        window.actualiseNavbarFeature = { apply: jest.fn() };
        window.actualiseExportAllFeature = { apply: jest.fn() };
        const staleOrderView = document.createElement('div');
        staleOrderView.className = 'order-view-toggle';
        document.body.appendChild(staleOrderView);
        const observer = mutationObservers.find(instance =>
            instance.__callback.toString().includes('scheduleDynamicUiReconciliation')
        );

        observer.__trigger([{ type: 'childList', target: document.body, addedNodes: [] }]);
        jest.runOnlyPendingTimers();

        expect(window.orderViewToggleFeature.handleOrderViewToggle).toHaveBeenCalledTimes(1);
        expect(window.orderIdCopyFeature.checkAndAddCopyButtons).toHaveBeenCalledTimes(1);
        expect(window.actualiseNavbarFeature.apply).not.toHaveBeenCalled();
        expect(window.actualiseExportAllFeature.apply).not.toHaveBeenCalled();
    });

    test('reconciles New Order UI controls and lets Order ID copy remove stale legacy controls', async () => {
        const { window, document, mutationObservers } = setupJSDOM(
            'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=CP123&ptb-mod=buy&ptb-ctx=orderSummary&showOrders=true',
            [],
            { synchronousStorage: true }
        );
        await Promise.resolve();
        jest.runOnlyPendingTimers();

        window.orderViewToggleFeature = {
            isNewOrderUi: jest.fn(() => true),
            handleOrderViewToggle: jest.fn()
        };
        window.orderIdCopyFeature = { checkAndAddCopyButtons: jest.fn() };
        const staleLegacyCell = document.createElement('td');
        staleLegacyCell.className = 'order-id-copy-cell';
        document.body.appendChild(staleLegacyCell);
        const observer = mutationObservers.find(instance =>
            instance.__callback.toString().includes('scheduleDynamicUiReconciliation')
        );

        observer.__trigger([{ type: 'childList', target: document.body, addedNodes: [] }]);
        jest.runOnlyPendingTimers();

        expect(window.orderViewToggleFeature.handleOrderViewToggle).toHaveBeenCalledTimes(1);
        expect(window.orderIdCopyFeature.checkAndAddCopyButtons).toHaveBeenCalledTimes(1);
    });

    test('keeps clean new Order UI mutations on the narrow optimized path', async () => {
        const { window, document, mutationObservers } = setupJSDOM(
            'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=CP123&ptb-mod=buy&ptb-ctx=orderSummary&showOrders=true',
            [],
            { synchronousStorage: true }
        );
        await Promise.resolve();
        jest.runOnlyPendingTimers();

        window.orderViewToggleFeature = {
            isNewOrderUi: jest.fn(() => true),
            handleOrderViewToggle: jest.fn()
        };
        window.orderIdCopyFeature = { checkAndAddCopyButtons: jest.fn() };
        const observer = mutationObservers.find(instance =>
            instance.__callback.toString().includes('scheduleDynamicUiReconciliation')
        );

        observer.__trigger([{ type: 'childList', target: document.body, addedNodes: [] }]);
        jest.runOnlyPendingTimers();

        expect(window.orderViewToggleFeature.handleOrderViewToggle).toHaveBeenCalledTimes(1);
        expect(window.orderIdCopyFeature.checkAndAddCopyButtons).not.toHaveBeenCalled();
    });

    test('runs New Order UI reconciliation on the Buy route where its native header is rendered', async () => {
        const { window, document, mutationObservers } = setupJSDOM(
            'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=CP123&ptb-mod=buy&ptb-ctx=digital&route=online',
            [],
            { synchronousStorage: true }
        );
        await Promise.resolve();
        jest.runOnlyPendingTimers();

        window.orderViewToggleFeature = {
            isNewOrderUi: jest.fn(() => true),
            handleOrderViewToggle: jest.fn()
        };
        const observer = mutationObservers.find(instance =>
            instance.__callback.toString().includes('scheduleDynamicUiReconciliation')
        );

        observer.__trigger([{ type: 'childList', target: document.body, addedNodes: [] }]);
        jest.runOnlyPendingTimers();

        expect(window.orderViewToggleFeature.handleOrderViewToggle).toHaveBeenCalledTimes(1);
    });

    test('cleans campaign budget styles immediately when the SPA URL changes to the dashboard', () => {
        const { window, document, intervalCallbacks } = setupJSDOM(
            'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=prsm-cm-buy&route=actualize',
            false
        );
        jest.advanceTimersByTime(100);
        const staleStyle = document.createElement('style');
        staleStyle.id = 'optimised-budget-styles';
        document.head.appendChild(staleStyle);

        window.history.replaceState(
            {},
            '',
            '#osAppId=prsm-cm-spa&osPspId=cm-dashboard&route=campaigns'
        );
        window.dispatchEvent(new window.Event('popstate'));

        expect(intervalCallbacks).toHaveLength(0);
        expect(document.getElementById('optimised-budget-styles')).toBeNull();
    });

    test('does not reconcile Prisma features for extension-owned DOM churn', async () => {
        const { window, document, mutationObservers } = setupJSDOM(
            'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=CP123&ptb-mod=buy&route=online',
            false,
            [],
            { synchronousStorage: true }
        );
        await Promise.resolve();
        jest.runOnlyPendingTimers();
        const navigation = jest.spyOn(window.campaignFeature, 'handleCampaignNavigationOptimisation').mockClear();
        const observer = mutationObservers.find(instance =>
            instance.__callback.toString().includes('scheduleDynamicUiReconciliation')
        );
        const extensionNode = document.createElement('div');
        extensionNode.className = 'toolshed-feature-preview';

        observer.__trigger([{ type: 'childList', target: document.body, addedNodes: [extensionNode] }]);
        jest.runOnlyPendingTimers();

        expect(navigation).not.toHaveBeenCalled();
    });

    test('reconciles mapped dirty groups for a known native region', async () => {
        const { window, document, mutationObservers } = setupJSDOM(
            'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=CP123&ptb-mod=plan&ptb-ctx=rfpSummary',
            false,
            [],
            { synchronousStorage: true }
        );
        await Promise.resolve();
        jest.runOnlyPendingTimers();

        const navigation = jest.spyOn(
            window.campaignFeature,
            'handleCampaignNavigationOptimisation'
        ).mockClear();
        window.actualiseNavbarFeature = { apply: jest.fn() };
        window.actualiseShortcutFeature = { apply: jest.fn() };
        const observer = mutationObservers.find(instance =>
            instance.__callback.toString().includes('markDirtyFeaturesFromMutations')
        );
        const nativeWorkflowRegion = document.createElement('div');
        nativeWorkflowRegion.className = 'workflow-widget-wrapper';

        observer.__trigger([{
            type: 'childList',
            target: document.body,
            addedNodes: [nativeWorkflowRegion]
        }]);
        jest.runOnlyPendingTimers();

        expect(navigation).toHaveBeenCalledTimes(1);
        expect(window.actualiseNavbarFeature.apply).not.toHaveBeenCalled();
        expect(window.actualiseShortcutFeature.apply).not.toHaveBeenCalled();
    });

    test('closes the message channel immediately for unknown actions', () => {
        setupJSDOM('https://other.mediaocean.com/', false);
        jest.advanceTimersByTime(100);
        const sendResponse = jest.fn();

        const keepChannelOpen = chrome.runtime.onMessage.listener(
            { action: 'notHandledByContentScript' },
            {},
            sendResponse
        );

        expect(keepChannelOpen).toBe(false);
        expect(sendResponse).not.toHaveBeenCalled();
    });

    test('closes the message channel after a synchronous recognised action', () => {
        const { window } = setupJSDOM('https://other.mediaocean.com/', false);
        jest.advanceTimersByTime(100);
        window.remindersFeature.forceShowMetaReminder = jest.fn();
        const sendResponse = jest.fn();

        const keepChannelOpen = chrome.runtime.onMessage.listener(
            { action: 'showMetaReminder' },
            {},
            sendResponse
        );

        expect(keepChannelOpen).toBe(false);
        expect(window.remindersFeature.forceShowMetaReminder).toHaveBeenCalledTimes(1);
        expect(sendResponse).toHaveBeenCalledWith({
            status: 'Meta reminder shown by content script'
        });
    });

    test('applies the explicit disabled logo state immediately', () => {
        const { window } = setupJSDOM('https://groupmuk-prisma.mediaocean.com/', false);
        jest.advanceTimersByTime(100);
        window.logoFeature.setLogoReplaceEnabled = jest.fn();
        const sendResponse = jest.fn();

        const keepChannelOpen = chrome.runtime.onMessage.listener(
            { action: 'checkLogoReplaceEnabled', enabled: false },
            {},
            sendResponse
        );

        expect(keepChannelOpen).toBe(false);
        expect(window.logoFeature.setLogoReplaceEnabled).toHaveBeenCalledWith(false);
        expect(sendResponse).toHaveBeenCalledWith({
            status: 'Logo check processed by content script'
        });
    });

    test('returns a synchronous error when D/O search data is missing', () => {
        setupJSDOM('https://other.mediaocean.com/', false);
        jest.advanceTimersByTime(100);
        const sendResponse = jest.fn();

        const keepChannelOpen = chrome.runtime.onMessage.listener(
            { action: 'executeDNumberSearch' },
            {},
            sendResponse
        );

        expect(keepChannelOpen).toBe(false);
        expect(sendResponse).toHaveBeenCalledWith({
            status: 'error',
            message: 'A D or O number is required.'
        });
    });

    test('reports a failed custom-reminder refresh through the async response', async () => {
        const { window } = setupJSDOM('https://other.mediaocean.com/', false);
        jest.advanceTimersByTime(100);
        window.remindersFeature.fetchCustomReminders = jest
            .fn()
            .mockRejectedValue(new Error('Reminder sync failed'));
        const sendResponse = jest.fn();

        const keepChannelOpen = chrome.runtime.onMessage.listener(
            { action: 'customRemindersUpdated' },
            {},
            sendResponse
        );
        await Promise.resolve();
        await Promise.resolve();

        expect(keepChannelOpen).toBe(true);
        expect(sendResponse).toHaveBeenCalledWith({
            status: 'error',
            message: 'Reminder sync failed'
        });
    });

    test('shows an existing custom reminder during the initial Prisma load', async () => {
        const reminder = {
            id: 'test1',
            name: 'Test Reminder',
            urlPattern: '*mediaocean.com*',
            textTrigger: 'initial content',
            popupMessage: '<p>A reminder message</p>',
            enabled: true,
        };
        const { window, document } = setupJSDOM(
            'https://groupmuk-prisma.mediaocean.com/',
            false,
            [reminder],
            {
                synchronousStorage: true,
                dispatchDOMContentLoaded: false
            }
        );
        const originalFetchCustomReminders = window.remindersFeature.fetchCustomReminders;
        let initialReminderFetch;
        jest.spyOn(window.remindersFeature, 'fetchCustomReminders')
            .mockImplementation(() => {
                initialReminderFetch = originalFetchCustomReminders();
                return initialReminderFetch;
            });
        const initialReminderCheck = jest.spyOn(
            window.remindersFeature,
            'checkCustomReminders'
        );

        document.dispatchEvent(new window.Event('DOMContentLoaded', {
            bubbles: true,
            cancelable: true
        }));

        expect(initialReminderFetch).toBeDefined();
        await initialReminderFetch;
        await Promise.resolve();

        // mainContentScriptInit checks existing reminders two seconds after settings load.
        jest.advanceTimersByTime(2000);
        await Promise.resolve();

        expect(initialReminderCheck).toHaveBeenCalled();
        const popup = document.getElementById('custom-reminder-display-popup');
        expect(popup).not.toBeNull();
        expect(popup.innerHTML).toContain('<h3>Test Reminder</h3>');
        expect(popup.textContent).toContain('A reminder message');
        expect(popup.textContent).toContain('Test Reminder');
    });
});

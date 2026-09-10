require('./mocks/chrome');

describe('background behavior while Features is off', () => {
    beforeEach(() => {
        jest.resetModules();
        resetMocks();
        chrome.runtime.id = 'test-extension-id';
        chrome.tabs.query.mockResolvedValue([]);
        chrome.runtime.getContexts.mockResolvedValue([]);
        chrome.storage.sync.get.mockImplementation((keys, callback) => {
            let result;
            if (keys && typeof keys === 'object' && !Array.isArray(keys)) {
                result = { ...keys, allFeaturesDisabled: true };
            } else {
                result = { allFeaturesDisabled: true };
            }
            callback?.(result);
            return Promise.resolve(result);
        });
    });

    afterEach(() => {
        delete chrome.runtime.id;
    });

    async function loadDisabledBackground() {
        require('../background');
        const featureMode = require('../background/feature-mode');
        await featureMode.featureModeReady;
        await new Promise(jest.requireActual('timers').setImmediate);
        return featureMode;
    }

    test('rejects non-popup messages before any feature handler runs', async () => {
        await loadDisabledBackground();
        const sendResponse = jest.fn();
        const contextChecksBeforeMessage = chrome.runtime.getContexts.mock.calls.length;

        const keepOpen = chrome.runtime.onMessage.listener(
            { action: 'showTimesheetReminder' },
            { url: 'mock-url/settings.html' },
            sendResponse
        );
        await Promise.resolve();
        await Promise.resolve();

        expect(keepOpen).toBe(true);
        expect(sendResponse).toHaveBeenCalledWith({
            status: 'error',
            message: 'Ops Toolshed features are off.'
        });
        expect(chrome.notifications.create).not.toHaveBeenCalled();
        expect(chrome.runtime.getContexts).toHaveBeenCalledTimes(contextChecksBeforeMessage);
    });

    test('does not process tab lifecycle events or create approval alarms', async () => {
        await loadDisabledBackground();
        const tabCreatedListener = chrome.tabs.onCreated.addListener.mock.calls[0][0];
        const tabUpdatedListener = chrome.tabs.onUpdated.addListener.mock.calls[0][0];

        tabUpdatedListener(10, { status: 'loading' }, {
            id: 10,
            windowId: 7,
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/'
        });
        tabCreatedListener({ id: 20, windowId: 7, openerTabId: 10, url: '' });
        await Promise.resolve();

        expect(chrome.tabs.remove).not.toHaveBeenCalled();
        expect(chrome.alarms.create).not.toHaveBeenCalled();
    });

    test('an Off transition clears alarms, notifications, panels, and offscreen work', async () => {
        await loadDisabledBackground();
        await new Promise(jest.requireActual('timers').setImmediate);
        chrome.alarms.clear.mockClear();
        chrome.notifications.clear.mockClear();
        chrome.sidePanel.close.mockClear();
        chrome.sidePanel.setOptions.mockClear();
        chrome.offscreen.closeDocument.mockClear();
        chrome.runtime.getContexts.mockResolvedValue([{ tabId: 42 }, { tabId: -1 }]);
        chrome.sidePanel.close.mockRejectedValue(new Error('stale panel'));
        const modeListener = chrome.storage.onChanged.addListener.mock.calls
            .map(call => call[0])
            .find(listener => listener.toString().includes('MASTER_FEATURE_KEY'));

        expect(modeListener).toBeDefined();
        modeListener({ allFeaturesDisabled: { oldValue: false, newValue: true } }, 'sync');
        await new Promise(jest.requireActual('timers').setImmediate);
        await new Promise(jest.requireActual('timers').setImmediate);

        expect(chrome.alarms.clear).toHaveBeenCalledWith('timesheetReminder');
        expect(chrome.alarms.clear).toHaveBeenCalledWith('approvalStatusCheckAlarm');
        expect(chrome.notifications.clear).toHaveBeenCalledWith('timesheetReminder');
        expect(chrome.sidePanel.close).toHaveBeenCalledWith({ tabId: 42 });
        expect(chrome.sidePanel.close).toHaveBeenCalledTimes(1);
        expect(chrome.sidePanel.setOptions).toHaveBeenCalledWith({ enabled: false });
        expect(chrome.offscreen.closeDocument).toHaveBeenCalled();
    });
});

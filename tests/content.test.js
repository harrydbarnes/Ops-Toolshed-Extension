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
    'content.js'
].map(scriptPath => fs.readFileSync(path.resolve(__dirname, `../${scriptPath}`), 'utf8'));

describe('Content Script Main Logic', () => {
    let window;
    let document;
    let consoleSpy;

    const setupJSDOM = (url, timeBombActive = false, customReminders = [], options = {}) => {
        require('./mocks/chrome');
        chrome.runtime.id = 'test-extension-id';
        chrome.storage.local.__getStore().timeBombActive = timeBombActive;
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
        window.MutationObserver = jest.fn(function(callback) {
            const instance = {
                observe: jest.fn(() => mutationCallbackMap.set(this, callback)),
                disconnect: jest.fn(() => mutationCallbackMap.delete(this)),
                __trigger: (mutations) => {
                    const cb = mutationCallbackMap.get(this);
                    if (cb) cb(mutations, this);
                }
            };
            return instance;
        });

        // Load all scripts into the JSDOM environment
        scriptsToLoad.forEach(scriptContent => {
            const scriptEl = document.createElement('script');
            scriptEl.textContent = scriptContent;
            document.head.appendChild(scriptEl);
        });

        // Manually dispatch DOMContentLoaded to ensure the script's main logic runs.
        if (options.dispatchDOMContentLoaded !== false) {
            document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true, cancelable: true }));
        }

        return { window, document, intervalCallbacks: window.__intervalCallbacks };
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

    test('should NOT initialize features if time bomb is active', () => {
        setupJSDOM('https://groupmuk-prisma.mediaocean.com/', true);
        jest.advanceTimersByTime(100);
        expect(consoleSpy).toHaveBeenCalledWith('Ops Toolshed features disabled due to time bomb.');
    });

    test('should initialize features if time bomb is NOT active', () => {
        const { window } = setupJSDOM('https://groupmuk-prisma.mediaocean.com/', false);
        jest.advanceTimersByTime(100);
        const hasInitializationLog = consoleSpy.mock.calls.some(call => call.join(' ').includes('[ContentScript Prisma] Script Injected'));
        expect(hasInitializationLog).toBe(true);
        expect(window.statsCollector).toBeDefined();
    });

    test('cleans campaign budget styles immediately when the URL changes to the dashboard', () => {
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
        const urlWatcher = intervalCallbacks.find(callback =>
            typeof callback === 'function' &&
            callback.toString().includes('currentUrlForDismissFlags')
        );
        expect(urlWatcher).toEqual(expect.any(Function));
        urlWatcher();

        expect(document.getElementById('optimised-budget-styles')).toBeNull();
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

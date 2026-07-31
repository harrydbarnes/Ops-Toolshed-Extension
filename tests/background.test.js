describe('Background Extension Lifecycle', () => {
    // Helper function to robustly flush all timers and microtasks
    async function flushPromisesAndTimers() {
        // Await a `setImmediate` to allow any pending microtasks (like promise resolutions) to process first.
        await new Promise(jest.requireActual('timers').setImmediate);

        // Loop to run all pending timers (macrotasks), including any that are scheduled by other timers.
        while (jest.getTimerCount() > 0) {
            jest.runOnlyPendingTimers();
            // Await another `setImmediate` to process microtasks queued by the timers.
            await new Promise(jest.requireActual('timers').setImmediate);
        }
    }

    beforeEach(() => {
        // Reset all mocks and storage before each test
        if (typeof resetMocks === 'function') {
            resetMocks();
        }
        jest.resetModules(); // This is crucial to get a fresh module
    });

    afterEach(() => {
        jest.useRealTimers(); // Clean up fake timers after each test
        delete chrome.runtime.id;
    });

    test('opens onboarding only for a fresh install', () => {
        chrome.runtime.id = 'test-extension-id';
        jest.isolateModules(() => {
            require('../background');
        });

        chrome.runtime.onInstalled.listener({ reason: 'install' });

        expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'mock-url/onboarding.html' });
    });

    test('does not open onboarding when the extension updates', () => {
        chrome.runtime.id = 'test-extension-id';
        jest.isolateModules(() => {
            require('../background');
        });

        chrome.runtime.onInstalled.listener({ reason: 'update' });

        expect(chrome.tabs.create).not.toHaveBeenCalled();
    });
});

describe('getNextAlarmDate (existing tests)', () => {
    let getNextAlarmDate;

    beforeAll(() => {
        const background = require('../background');
        getNextAlarmDate = background.getNextAlarmDate;
    });

    const constantDate = new Date('2024-07-26T10:00:00'); // A Friday

    beforeEach(() => {
        jest.useFakeTimers().setSystemTime(constantDate);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('should return the next Friday if the current day is Friday but the time has passed', () => {
        const nextAlarm = getNextAlarmDate('Friday', '09:00');
        const expectedDate = new Date(constantDate);
        expectedDate.setDate(constantDate.getDate() + 7);
        expectedDate.setHours(9, 0, 0, 0);
        expect(nextAlarm.getTime()).toBe(expectedDate.getTime());
    });
});

describe('AppLearn popup blocking', () => {
    const waitForPopupStatUpdate = async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
        await new Promise(resolve => setTimeout(resolve, 0));
        await new Promise(resolve => setTimeout(resolve, 0));
    };

    beforeEach(() => {
        resetMocks();
        jest.resetModules();
        ({ maybeBlockAppLearnPopup } = require('../background'));
    });

    test('closes a blank child tab immediately while its Mediaocean opener reloads', async () => {
        const tabUpdatedListener = chrome.tabs.onUpdated.addListener.mock.calls[0][0];
        const tabCreatedListener = chrome.tabs.onCreated.addListener.mock.calls[0][0];
        chrome.tabs.remove.mockResolvedValue(undefined);

        tabUpdatedListener(10, { status: 'loading' }, {
            id: 10,
            windowId: 7,
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/'
        });
        tabCreatedListener({
            id: 20,
            windowId: 7,
            openerTabId: 10,
            pendingUrl: '',
            url: ''
        });

        expect(chrome.tabs.remove).toHaveBeenCalledWith(20);
        await waitForPopupStatUpdate();
        expect(chrome.storage.local.__getStore().appLearnPopupsBlocked).toBe(1);
    });

    test('closes a same-window blank tab when AppLearn omits its opener', async () => {
        const tabUpdatedListener = chrome.tabs.onUpdated.addListener.mock.calls[0][0];
        const tabCreatedListener = chrome.tabs.onCreated.addListener.mock.calls[0][0];
        chrome.tabs.remove.mockResolvedValue(undefined);

        tabUpdatedListener(10, { status: 'loading' }, {
            id: 10,
            windowId: 7,
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/'
        });
        tabCreatedListener({
            id: 20,
            windowId: 7,
            pendingUrl: '',
            url: ''
        });

        expect(chrome.tabs.remove).toHaveBeenCalledWith(20);
        await waitForPopupStatUpdate();
        expect(chrome.storage.local.__getStore().appLearnPopupsBlocked).toBe(1);
    });

    test('leaves same-window blank tabs open after the short noopener guard expires', () => {
        const now = jest.spyOn(Date, 'now');
        now.mockReturnValueOnce(1000).mockReturnValue(4001);
        const tabUpdatedListener = chrome.tabs.onUpdated.addListener.mock.calls[0][0];
        const tabCreatedListener = chrome.tabs.onCreated.addListener.mock.calls[0][0];

        tabUpdatedListener(10, { status: 'loading' }, {
            id: 10,
            windowId: 7,
            url: 'https://go.demo.mediaocean.com/campaign-management/'
        });
        tabCreatedListener({
            id: 20,
            windowId: 7,
            pendingUrl: '',
            url: ''
        });

        expect(chrome.tabs.remove).not.toHaveBeenCalled();
        now.mockRestore();
    });

    test('does not close blank child tabs after popup blocking is disabled', async () => {
        const settingListener = chrome.storage.onChanged.addListener.mock.calls
            .map(call => call[0])
            .find(listener => listener.toString().includes('blockAppLearnPopupsEnabled'));
        const tabUpdatedListener = chrome.tabs.onUpdated.addListener.mock.calls[0][0];
        const tabCreatedListener = chrome.tabs.onCreated.addListener.mock.calls[0][0];

        await settingListener({
            blockAppLearnPopupsEnabled: { oldValue: true, newValue: false }
        }, 'sync');
        tabUpdatedListener(10, { status: 'loading' }, {
            id: 10,
            windowId: 7,
            url: 'https://go.demo.mediaocean.com/campaign-management/'
        });
        tabCreatedListener({
            id: 20,
            windowId: 7,
            openerTabId: 10,
            pendingUrl: '',
            url: ''
        });

        expect(chrome.tabs.remove).not.toHaveBeenCalled();
    });

    test('leaves unrelated blank child tabs open', () => {
        const tabCreatedListener = chrome.tabs.onCreated.addListener.mock.calls[0][0];

        tabCreatedListener({
            id: 20,
            windowId: 7,
            openerTabId: 99,
            pendingUrl: '',
            url: ''
        });

        expect(chrome.tabs.remove).not.toHaveBeenCalled();
    });

    test.each([
        'https://splitscreen-adopt.applearn.tv/',
        'https://wpp.okta.com/app/wpp_groupmapplearndev_1/example/sso/saml'
    ])('closes %s when it was opened by a Mediaocean page', async popupUrl => {
        chrome.tabs.get.mockResolvedValue({
            id: 10,
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/'
        });
        chrome.tabs.remove.mockResolvedValue(undefined);

        await expect(maybeBlockAppLearnPopup(20, popupUrl, 10)).resolves.toBe(true);
        expect(chrome.tabs.remove).toHaveBeenCalledWith(20);
        expect(chrome.storage.local.__getStore().appLearnPopupsBlocked).toBe(1);
    });

    test('leaves the popup open when blocking is disabled', async () => {
        chrome.storage.sync.__getStore().blockAppLearnPopupsEnabled = false;

        await expect(maybeBlockAppLearnPopup(
            20,
            'https://splitscreen-adopt.applearn.tv/',
            10
        )).resolves.toBe(false);
        expect(chrome.tabs.remove).not.toHaveBeenCalled();
    });

    test('does not close the same URLs when opened outside Mediaocean', async () => {
        chrome.tabs.get.mockResolvedValue({ id: 10, url: 'https://example.com/' });

        await expect(maybeBlockAppLearnPopup(
            20,
            'https://wpp.okta.com/app/wpp_groupmapplearndev_1/example/sso/saml',
            10
        )).resolves.toBe(false);
        expect(chrome.tabs.remove).not.toHaveBeenCalled();
    });

    test('closes a noopener AppLearn popup while a Mediaocean tab is active', async () => {
        chrome.tabs.query.mockResolvedValue([
            { id: 10, url: 'https://aura.mediaocean.com/timesheets/' },
            { id: 20, url: 'https://splitscreen-adopt.applearn.tv/' }
        ]);
        chrome.tabs.remove.mockResolvedValue(undefined);

        await expect(maybeBlockAppLearnPopup(
            20,
            'https://splitscreen-adopt.applearn.tv/',
            undefined
        )).resolves.toBe(true);
        expect(chrome.tabs.remove).toHaveBeenCalledWith(20);
        expect(chrome.storage.local.__getStore().appLearnPopupsBlocked).toBe(1);
    });

    test('recovers the blocked-popup counter after a storage failure', async () => {
        chrome.tabs.get.mockResolvedValue({
            id: 10,
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/'
        });
        chrome.tabs.remove.mockResolvedValue(undefined);
        chrome.storage.local.get.mockRejectedValueOnce(new Error('Temporary storage failure'));

        await expect(maybeBlockAppLearnPopup(
            20,
            'https://splitscreen-adopt.applearn.tv/',
            10
        )).resolves.toBe(false);
        await expect(maybeBlockAppLearnPopup(
            21,
            'https://splitscreen-adopt.applearn.tv/',
            10
        )).resolves.toBe(true);

        expect(chrome.tabs.remove).toHaveBeenCalledTimes(2);
        expect(chrome.storage.local.__getStore().appLearnPopupsBlocked).toBe(1);
    });

    test('contains a failed settings read instead of rejecting the tab listener task', async () => {
        chrome.storage.sync.get.mockRejectedValueOnce(new Error('Settings unavailable'));

        await expect(maybeBlockAppLearnPopup(
            20,
            'https://splitscreen-adopt.applearn.tv/',
            10
        )).resolves.toBe(false);
        expect(chrome.tabs.remove).not.toHaveBeenCalled();
    });
});

describe('Background message routing', () => {
    const waitForResponse = async (sendResponse) => {
        for (let attempt = 0; attempt < 20 && sendResponse.mock.calls.length === 0; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    };

    const loadMessageListener = () => {
        jest.resetModules();
        require('../background');
        return chrome.runtime.onMessage.listener;
    };

    beforeEach(() => {
        resetMocks();
        jest.useRealTimers();
        chrome.runtime.id = 'test-extension-id';
    });

    afterEach(() => {
        delete chrome.runtime.id;
    });

    test('rejects malformed messages without throwing', async () => {
        const listener = loadMessageListener();
        const sendResponse = jest.fn();

        expect(listener(null, {}, sendResponse)).toBe(true);
        await waitForResponse(sendResponse);

        expect(sendResponse).toHaveBeenCalledTimes(1);
        expect(sendResponse).toHaveBeenCalledWith({
            status: 'error',
            message: 'Invalid message request.'
        });
    });

    test('returns an explicit error for unknown actions', async () => {
        const listener = loadMessageListener();
        const sendResponse = jest.fn();

        expect(listener({ action: 'notRegistered' }, {}, sendResponse)).toBe(true);
        await waitForResponse(sendResponse);

        expect(sendResponse).toHaveBeenCalledTimes(1);
        expect(sendResponse).toHaveBeenCalledWith({
            status: 'error',
            message: 'Unknown action: notRegistered'
        });
    });

    test('does not treat inherited object properties as handlers', async () => {
        const listener = loadMessageListener();
        const sendResponse = jest.fn();

        listener({ action: 'toString' }, {}, sendResponse);
        await waitForResponse(sendResponse);

        expect(sendResponse).toHaveBeenCalledTimes(1);
        expect(sendResponse).toHaveBeenCalledWith({
            status: 'error',
            message: 'Unknown action: toString'
        });
    });

    test('reports storage failures instead of leaving the caller waiting', async () => {
        chrome.storage.local.get.mockRejectedValueOnce(new Error('Storage unavailable'));
        const listener = loadMessageListener();
        const sendResponse = jest.fn();

        listener({ action: 'getFavouriteApprovers' }, {}, sendResponse);
        await waitForResponse(sendResponse);

        expect(sendResponse).toHaveBeenCalledTimes(1);
        expect(sendResponse).toHaveBeenCalledWith({
            status: 'error',
            message: 'Storage unavailable'
        });
    });

    test('reports rejected handlers exactly once', async () => {
        chrome.tabs.create.mockRejectedValueOnce(new Error('Tab creation failed'));
        const listener = loadMessageListener();
        const sendResponse = jest.fn();

        listener({ action: 'openApproversPage' }, {}, sendResponse);
        await waitForResponse(sendResponse);

        expect(sendResponse).toHaveBeenCalledTimes(1);
        expect(sendResponse).toHaveBeenCalledWith({
            status: 'error',
            message: 'Tab creation failed'
        });
    });

    test('preserves existing successful handler responses', async () => {
        const listener = loadMessageListener();
        const sendResponse = jest.fn();

        listener({ action: 'removeTimesheetAlarm' }, {}, sendResponse);
        await waitForResponse(sendResponse);

        expect(chrome.alarms.clear).toHaveBeenCalledWith('timesheetReminder');
        expect(sendResponse).toHaveBeenCalledTimes(1);
        expect(sendResponse).toHaveBeenCalledWith({ status: 'Alarm removed' });
    });

    test('rejects clipboard reads from an unverified page sender', async () => {
        const listener = loadMessageListener();
        const sendResponse = jest.fn();

        listener({ action: 'getClipboardText' }, {
            id: chrome.runtime.id,
            tab: { id: 42 },
            frameId: 0,
            url: 'https://attacker.example/approval'
        }, sendResponse);
        await waitForResponse(sendResponse);

        expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
        expect(sendResponse).toHaveBeenCalledWith({
            status: 'error',
            message: 'Clipboard reads are only available from Prisma.'
        });
    });

    test('allows clipboard reads from a verified Mediaocean frame', async () => {
        chrome.runtime.getContexts.mockResolvedValue([{}]);
        chrome.runtime.sendMessage.mockResolvedValue({ status: 'success', text: 'first@example.com' });
        const listener = loadMessageListener();
        const sendResponse = jest.fn();

        listener({ action: 'getClipboardText' }, {
            id: chrome.runtime.id,
            tab: { id: 42 },
            frameId: 3,
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#approval'
        }, sendResponse);
        await waitForResponse(sendResponse);

        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            target: 'offscreen',
            action: 'readClipboard',
            text: undefined
        });
        expect(sendResponse).toHaveBeenCalledWith({
            status: 'success',
            text: 'first@example.com'
        });
    });

    test('relays campaign URL copies to the targeted offscreen clipboard action', async () => {
        chrome.runtime.getContexts.mockResolvedValue([{}]);
        chrome.runtime.sendMessage.mockResolvedValue({ status: 'success' });
        const listener = loadMessageListener();
        const sendResponse = jest.fn();

        listener({
            action: 'copyCampaignUrlToClipboard',
            text: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP123'
        }, {
            id: chrome.runtime.id,
            tab: { id: 42 },
            frameId: 0,
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP123'
        }, sendResponse);
        await waitForResponse(sendResponse);

        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
            target: 'offscreen',
            action: 'copyToClipboard',
            text: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP123'
        });
        expect(sendResponse).toHaveBeenCalledWith({ status: 'success' });
    });

    test('rejects campaign URL copies from an unverified sender', async () => {
        const listener = loadMessageListener();
        const sendResponse = jest.fn();

        listener({
            action: 'copyCampaignUrlToClipboard',
            text: 'https://attacker.example/'
        }, {
            id: chrome.runtime.id,
            tab: { id: 42 },
            frameId: 0,
            url: 'https://attacker.example/'
        }, sendResponse);
        await waitForResponse(sendResponse);

        expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
        expect(sendResponse).toHaveBeenCalledWith({
            status: 'error',
            message: 'Campaign URL copies are only available from Prisma.'
        });
    });

    test('ignores messages explicitly targeted at the offscreen document', () => {
        const listener = loadMessageListener();
        const sendResponse = jest.fn();

        expect(listener({
            target: 'offscreen',
            action: 'copyToClipboard',
            text: 'copy me'
        }, { id: chrome.runtime.id }, sendResponse)).toBe(false);
        expect(sendResponse).not.toHaveBeenCalled();
    });

    test('opens Help Guides before any asynchronous storage gate can consume the user gesture', async () => {
        chrome.sidePanel.open.mockResolvedValue(undefined);
        chrome.sidePanel.setOptions.mockResolvedValue(undefined);
        const listener = loadMessageListener();
        const sendResponse = jest.fn();

        listener({ action: 'openHelpGuides' }, { tab: { id: 42 } }, sendResponse);
        await waitForResponse(sendResponse);

        expect(chrome.storage.local.get).not.toHaveBeenCalled();
        expect(chrome.sidePanel.open).toHaveBeenCalledWith({ tabId: 42 });
        expect(sendResponse).toHaveBeenCalledWith({ status: 'success', panelState: 'open' });
    });
});

describe('D/O-number search receiver readiness', () => {
    let performDNumberSearch;

    beforeEach(() => {
        resetMocks();
        jest.resetModules();
        ({ performDNumberSearch } = require('../background/message-handlers').messageHandlers);
        chrome.tabs.create.mockResolvedValue({ id: 42 });
    });

    test.each([
        'Could not establish connection. Receiving end does not exist.',
        'Receiving end does not exist.'
    ])('retries a transient receiver error: %s', async errorMessage => {
        chrome.tabs.sendMessage
            .mockRejectedValueOnce(new Error(errorMessage))
            .mockResolvedValueOnce({ status: 'success', message: 'Search started' });
        const sendResponse = jest.fn();

        await performDNumberSearch({ dNumber: 'D12345678' }, {}, sendResponse);

        expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(2);
        expect(sendResponse).toHaveBeenCalledWith({ status: 'success', message: 'Search started' });
    });

    test('does not retry a terminal content-script failure', async () => {
        chrome.tabs.sendMessage.mockResolvedValue({
            status: 'error',
            message: 'Campaign was not found.'
        });
        const sendResponse = jest.fn();

        await performDNumberSearch({ dNumber: 'D00000000' }, {}, sendResponse);

        expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(1);
        expect(sendResponse).toHaveBeenCalledWith({
            status: 'error',
            message: 'Campaign was not found.'
        });
    });

    test('fails clearly when the created tab has no id', async () => {
        chrome.tabs.create.mockResolvedValue({});
        const sendResponse = jest.fn();

        await performDNumberSearch({ dNumber: 'D12345678' }, {}, sendResponse);

        expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
        expect(sendResponse).toHaveBeenCalledWith({
            status: 'error',
            message: 'Could not create a Prisma search tab.'
        });
    });
});

describe('Campaign Details frame messaging', () => {
    let requestCampaignDetailsBasicFocus;

    beforeEach(() => {
        resetMocks();
        jest.resetModules();
        ({ requestCampaignDetailsBasicFocus } = require('../background/message-handlers').messageHandlers);
    });

    test('relays the Basic focus request to every content-script frame in the sender tab', async () => {
        chrome.tabs.sendMessage.mockResolvedValue({ status: 'accepted' });
        const sendResponse = jest.fn();

        await requestCampaignDetailsBasicFocus(
            {},
            {
                tab: { id: 42 },
                url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP123'
            },
            sendResponse
        );

        expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(42, {
            action: 'focusCampaignDetailsBasic'
        });
        expect(sendResponse).toHaveBeenCalledWith({ status: 'accepted' });
    });

    test('rejects a relay request without a Mediaocean sender tab', async () => {
        const sendResponse = jest.fn();

        await requestCampaignDetailsBasicFocus({}, {}, sendResponse);

        expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
        expect(sendResponse).toHaveBeenCalledWith({
            status: 'error',
            message: 'Campaign Details focus request must come from a Mediaocean tab.'
        });
    });

    test('reports pending while the Campaign Details frame is still loading', async () => {
        chrome.tabs.sendMessage.mockRejectedValue(new Error('Receiving end does not exist.'));
        const sendResponse = jest.fn();

        await requestCampaignDetailsBasicFocus(
            {},
            {
                tab: { id: 42 },
                url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP123'
            },
            sendResponse
        );

        expect(sendResponse).toHaveBeenCalledWith({ status: 'pending' });
    });
});

describe('Help Guides side panel messaging', () => {
    let openHelpGuides;
    let closeHelpGuides;
    let closeHelpGuidesFromLauncher;
    let getHelpGuidesPanelState;

    beforeEach(() => {
        resetMocks();
        jest.resetModules();
        chrome.sidePanel.open.mockResolvedValue(undefined);
        chrome.sidePanel.setOptions.mockResolvedValue(undefined);
        chrome.sidePanel.close.mockResolvedValue(undefined);
        ({ openHelpGuides, closeHelpGuides, closeHelpGuidesFromLauncher, getHelpGuidesPanelState } = require('../background/message-handlers').messageHandlers);
    });

    test('opens and configures a tab-specific panel from the page launcher', async () => {
        const sendResponse = jest.fn();

        await openHelpGuides({}, { tab: { id: 42 } }, sendResponse);

        expect(chrome.sidePanel.open).toHaveBeenCalledWith({ tabId: 42 });
        expect(chrome.sidePanel.setOptions).toHaveBeenCalledWith({
            tabId: 42,
            path: 'help-guides.html',
            enabled: true
        });
        expect(sendResponse).toHaveBeenCalledWith({ status: 'success', panelState: 'open' });
    });

    test('rejects requests that do not come from a browser tab', async () => {
        const sendResponse = jest.fn();

        await openHelpGuides({}, {}, sendResponse);

        expect(chrome.sidePanel.open).not.toHaveBeenCalled();
        expect(sendResponse).toHaveBeenCalledWith({
            status: 'error',
            message: 'Could not identify the current tab.'
        });
    });

    test('clicking the launcher again closes an already-open panel', async () => {
        const firstResponse = jest.fn();
        const secondResponse = jest.fn();

        await openHelpGuides({}, { tab: { id: 42 } }, firstResponse);
        await openHelpGuides({}, { tab: { id: 42 } }, secondResponse);

        expect(chrome.sidePanel.open).toHaveBeenCalledTimes(1);
        expect(chrome.sidePanel.close).toHaveBeenCalledWith({ tabId: 42 });
        expect(secondResponse).toHaveBeenCalledWith({ status: 'success', panelState: 'closed' });
    });

    test('closes directly from a launcher content-script request', async () => {
        const sendResponse = jest.fn();

        await closeHelpGuidesFromLauncher({}, { tab: { id: 42 } }, sendResponse);

        expect(chrome.sidePanel.close).toHaveBeenCalledWith({ tabId: 42 });
        expect(sendResponse).toHaveBeenCalledWith({ status: 'success', panelState: 'closed' });
    });

    test('restores the open panel state after the background worker restarts', async () => {
        chrome.storage.session.__getStore().openHelpGuideTabIds = [42];
        const sendResponse = jest.fn();

        await getHelpGuidesPanelState({}, { tab: { id: 42 } }, sendResponse);

        expect(sendResponse).toHaveBeenCalledWith({ status: 'success', open: true });
    });

    test('uses the live side-panel extension context instead of stale stored state', async () => {
        chrome.runtime.getContexts.mockResolvedValue([{
            contextType: 'SIDE_PANEL',
            tabId: 42,
            documentUrl: 'mock-url/help-guides.html'
        }]);
        const sendResponse = jest.fn();

        await getHelpGuidesPanelState({}, { tab: { id: 42 } }, sendResponse);

        expect(chrome.runtime.getContexts).toHaveBeenCalledWith({
            contextTypes: ['SIDE_PANEL'],
            tabIds: [42]
        });
        expect(sendResponse).toHaveBeenCalledWith({ status: 'success', open: true });
    });

    test('closes the active tab-specific Help Guides panel', async () => {
        chrome.tabs.query.mockResolvedValue([{ id: 42, windowId: 7 }]);
        const sendResponse = jest.fn();

        await closeHelpGuides({}, {}, sendResponse);

        expect(chrome.sidePanel.close).toHaveBeenCalledWith({ tabId: 42 });
        expect(sendResponse).toHaveBeenCalledWith({ status: 'success' });
    });
});

describe('Help Guides native side panel lifecycle', () => {
    beforeEach(() => {
        resetMocks();
        jest.resetModules();
        chrome.tabs.sendMessage.mockResolvedValue(undefined);
        require('../background');
    });

    test('uses Chrome open and close events as the authoritative launcher state', async () => {
        expect(chrome.sidePanel.onOpened.addListener).toHaveBeenCalledTimes(1);
        expect(chrome.sidePanel.onClosed.addListener).toHaveBeenCalledTimes(1);

        await chrome.sidePanel.onOpened.listener({ path: 'help-guides.html', tabId: 42, windowId: 7 });
        expect(chrome.tabs.sendMessage).toHaveBeenLastCalledWith(42, {
            action: 'helpGuidesPanelState',
            open: true
        });

        await chrome.sidePanel.onClosed.listener({ path: 'help-guides.html', tabId: 42, windowId: 7 });
        expect(chrome.tabs.sendMessage).toHaveBeenLastCalledWith(42, {
            action: 'helpGuidesPanelState',
            open: false
        });
        expect(chrome.storage.session.__getStore().openHelpGuideTabIds).toEqual([]);
    });
});

describe('account-switch return URL storage', () => {
    let rememberAccountSwitchUrl;
    let getAccountSwitchUrl;
    let clearAccountSwitchUrl;

    beforeEach(() => {
        resetMocks();
        jest.resetModules();
        ({
            rememberAccountSwitchUrl,
            getAccountSwitchUrl,
            clearAccountSwitchUrl
        } = require('../background/message-handlers').messageHandlers);
    });

    test('keeps pending URLs isolated by the sender tab', async () => {
        const firstResponse = jest.fn();
        await rememberAccountSwitchUrl({
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP123'
        }, {
            tab: { id: 41 },
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#route=online'
        }, firstResponse);

        const matchingResponse = jest.fn();
        const otherTabResponse = jest.fn();
        await getAccountSwitchUrl({}, {
            tab: { id: 41 },
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#route=campaigns'
        }, matchingResponse);
        await getAccountSwitchUrl({}, {
            tab: { id: 42 },
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#route=campaigns'
        }, otherTabResponse);

        expect(firstResponse).toHaveBeenCalledWith({ status: 'success' });
        expect(matchingResponse).toHaveBeenCalledWith({
            status: 'success',
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP123'
        });
        expect(otherTabResponse).toHaveBeenCalledWith({ status: 'success', url: null });
    });

    test('clears only the current tab pending URL', async () => {
        const sender = {
            tab: { id: 41 },
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#route=online'
        };
        await rememberAccountSwitchUrl({ url: sender.url }, sender, jest.fn());
        await clearAccountSwitchUrl({}, sender, jest.fn());

        const response = jest.fn();
        await getAccountSwitchUrl({}, sender, response);

        expect(response).toHaveBeenCalledWith({ status: 'success', url: null });
    });
});

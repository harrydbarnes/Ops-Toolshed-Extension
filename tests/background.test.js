describe('Time Bomb Feature in background.js', () => {
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
    });

    test('should set initial deadline correctly when installed on a Monday', async () => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2024-07-29T10:00:00')); // A Monday

        jest.isolateModules(() => {
            require('../background');
        });

        if (chrome.runtime.onInstalled.listener) {
            chrome.runtime.onInstalled.listener();
        }

        await flushPromisesAndTimers();

        const storage = chrome.storage.local.__getStore();
        expect(storage.initialDeadline).toBeDefined();
        expect(storage.timeBombActive).toBe(false);
        const expectedDeadline = new Date('2024-07-30T23:59:00');
        expect(storage.initialDeadline).toBe(expectedDeadline.getTime());
    });

    test('should set deadline for next week if installed after the deadline on a Tuesday', async () => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2024-07-30T23:59:01'));

        jest.isolateModules(() => {
            require('../background');
        });

        if (chrome.runtime.onInstalled.listener) {
            chrome.runtime.onInstalled.listener();
        }

        await flushPromisesAndTimers();

        const storage = chrome.storage.local.__getStore();
        const expectedDeadline = new Date('2024-08-06T23:59:00');
        expect(storage.initialDeadline).toBe(expectedDeadline.getTime());
    });

    test('should become active after the deadline has passed', async () => {
        const initialDeadline = new Date('2024-07-30T23:59:00').getTime();
        chrome.storage.local.__getStore().initialDeadline = initialDeadline;

        jest.useFakeTimers();
        jest.setSystemTime(new Date('2024-07-31T00:00:01'));

        let checkTimeBomb;
        jest.isolateModules(() => {
            checkTimeBomb = require('../background').checkTimeBomb;
        });

        const promise = checkTimeBomb();
        await flushPromisesAndTimers();
        await promise;

        const storage = chrome.storage.local.__getStore();
        expect(storage.timeBombActive).toBe(true);
    });

    test('should remain inactive before the deadline has passed', async () => {
        const initialDeadline = new Date('2024-07-30T23:59:00').getTime();
        chrome.storage.local.__getStore().initialDeadline = initialDeadline;

        jest.useFakeTimers();
        jest.setSystemTime(new Date('2024-07-30T23:58:59'));

        let checkTimeBomb;
        jest.isolateModules(() => {
            checkTimeBomb = require('../background').checkTimeBomb;
        });

        const promise = checkTimeBomb();
        await flushPromisesAndTimers();
        await promise;

        const storage = chrome.storage.local.__getStore();
        expect(storage.timeBombActive).toBe(false);
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

    test('should return the upcoming Friday in the same week if the time has not passed', () => {
        const nextAlarm = getNextAlarmDate('Friday', '14:30');
        const expectedDate = new Date(constantDate);
        expectedDate.setHours(14, 30, 0, 0);
        expect(nextAlarm.getTime()).toBe(expectedDate.getTime());
    });

    test('should return next Monday if current day is Friday', () => {
        const nextAlarm = getNextAlarmDate('Monday', '09:30');
        const expectedDate = new Date('2024-07-29T09:30:00');
        expect(nextAlarm.getTime()).toBe(expectedDate.getTime());
    });

    test('should handle month rollovers correctly', () => {
        jest.setSystemTime(new Date('2024-08-30T15:00:00')); // A Friday
        const nextAlarm = getNextAlarmDate('Wednesday', '11:00');
        const expectedDate = new Date('2024-09-04T11:00:00');
        expect(nextAlarm.getTime()).toBe(expectedDate.getTime());
    });

    test('should handle year rollovers correctly', () => {
        jest.setSystemTime(new Date('2024-12-30T10:00:00')); // A Monday
        const nextAlarm = getNextAlarmDate('Tuesday', '09:00');
        const expectedDate = new Date('2024-12-31T09:00:00');
        expect(nextAlarm.getTime()).toBe(expectedDate.getTime());
    });

    test('should return a date exactly 7 days in the future if the day is the same and time is earlier', () => {
        jest.setSystemTime(new Date('2024-07-26T08:00:00')); // Friday morning
        const nextAlarm = getNextAlarmDate('Friday', '07:00'); // Time has passed
        const expectedDate = new Date('2024-08-02T07:00:00');
        expect(nextAlarm.getTime()).toBe(expectedDate.getTime());
    });
});

describe('AppLearn popup blocking', () => {
    let maybeBlockAppLearnPopup;

    beforeEach(() => {
        resetMocks();
        jest.resetModules();
        ({ maybeBlockAppLearnPopup } = require('../background'));
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

        listener({ action: 'removeTimesheetAlarm' }, {}, sendResponse);
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

    test('blocks normal actions while the time bomb is active', async () => {
        chrome.storage.local.__getStore().timeBombActive = true;
        const listener = loadMessageListener();
        const sendResponse = jest.fn();

        listener({ action: 'removeTimesheetAlarm' }, {}, sendResponse);
        await waitForResponse(sendResponse);

        expect(chrome.alarms.clear).not.toHaveBeenCalled();
        expect(sendResponse).toHaveBeenCalledWith({
            status: 'error',
            message: 'All features have been disabled.'
        });
    });

    test('allows the time bomb disable action through the active gate', async () => {
        chrome.storage.local.__getStore().timeBombActive = true;
        chrome.storage.local.__getStore().initialDeadline = 123;
        const listener = loadMessageListener();
        const sendResponse = jest.fn();

        listener({ action: 'disableTimeBomb' }, {}, sendResponse);
        await waitForResponse(sendResponse);

        expect(chrome.storage.local.__getStore().timeBombActive).toBeUndefined();
        expect(chrome.storage.local.__getStore().initialDeadline).toBeUndefined();
        expect(sendResponse).toHaveBeenCalledWith({ status: 'success' });
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

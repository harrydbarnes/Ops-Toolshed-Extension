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

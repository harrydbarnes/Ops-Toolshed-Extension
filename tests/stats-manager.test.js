import { handleTrackStat, migrateStats } from '../background/stats-manager';

describe('Stats Manager', () => {
    const RealDate = Date;

    beforeEach(() => {
        global.resetMocks();

        // Manual Date mock to ensure deterministic dates (2023-10-27)
        global.Date = class extends RealDate {
            constructor(...args) {
                if (args.length) {
                    return new RealDate(...args);
                }
                return new RealDate('2023-10-27T02:00:00Z');
            }
            static now() {
                return new RealDate('2023-10-27T02:00:00Z').getTime();
            }
        };
    });

    afterEach(() => {
        global.Date = RealDate;
    });

    test('migrateStats should move prismaUserStats to legacyStats', async () => {
        const oldStats = {
            visitedCampaigns: ['c1'],
            totalLoadingTime: 10,
            placementsAdded: 5,
            reconciliations: 0
        };
        // Use the mock set (real setTimeout)
        await chrome.storage.local.set({ prismaUserStats: oldStats });

        await migrateStats();

        const store = chrome.storage.local.__getStore();
        expect(store.legacyStats).toEqual(oldStats);
        expect(store.prismaUserStats).toBeUndefined();
    });

    test('migrateStats should initialize legacyStats if nothing exists', async () => {
        await migrateStats();

        const store = chrome.storage.local.__getStore();
        expect(store.legacyStats).toEqual({
            visitedCampaigns: [],
            totalLoadingTime: 0,
            placementsAdded: 0,
            reconciliations: 0
        });
    });

    test('handleTrackStat should update dailyStats correctly', async () => {
        // With mocked date, today is fixed
        const d = new Date();
        const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

        // Await the real queued writes, including concurrent submissions.
        handleTrackStat({ type: 'CAMPAIGN_VISIT', value: 'c2' }, {}, () => {});
        handleTrackStat({ type: 'LOADING_TIME', value: 2.5 }, {}, () => {});
        handleTrackStat({ type: 'PLACEMENT_ADDED', value: 3 }, {}, () => {});
        await handleTrackStat({ type: 'RECONCILIATION', value: 2 }, {}, () => {});

        const store = chrome.storage.local.__getStore();
        // Check if dailyStats exists first
        expect(store.dailyStats).toBeDefined();
        expect(store.statsStartDate).toBe('2023-10-27T02:00:00.000Z');

        const daily = store.dailyStats[today];
        expect(daily).toBeDefined();
        expect(daily.visitedCampaigns).toContain('c2');
        expect(daily.loadingTime).toBe(2.5);
        expect(daily.loadingByArea).toEqual({});
        expect(daily.placements).toBe(3);
        expect(daily.reconciliations).toBe(2);
    });

    test('handleTrackStat should deduplicate campaign visits', async () => {
        const d = new Date();
        const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

        await handleTrackStat({ type: 'CAMPAIGN_VISIT', value: 'c2' }, {}, () => {});

        await handleTrackStat({ type: 'CAMPAIGN_VISIT', value: 'c2' }, {}, () => {});

        const store = chrome.storage.local.__getStore();
        expect(store.dailyStats).toBeDefined();
        const daily = store.dailyStats[today];

        expect(daily.visitedCampaigns.length).toBe(1);
    });

    test('records loading time against its Prisma area while retaining the total', async () => {
        handleTrackStat({
            type: 'LOADING_TIME',
            value: { seconds: 3.25, area: 'actualise' }
        }, {}, () => {});
        await handleTrackStat({
            type: 'LOADING_TIME',
            value: { seconds: 1.5, area: 'actualise' }
        }, {}, () => {});

        const store = chrome.storage.local.__getStore();
        const daily = store.dailyStats['2023-10-27'];
        expect(daily.loadingTime).toBe(4.75);
        expect(daily.loadingByArea).toEqual({ actualise: 4.75 });
    });

    test('keeps the background message handler alive until the queued stats write completes', async () => {
        const sendResponse = jest.fn();

        const completion = handleTrackStat({
            type: 'LOADING_TIME',
            value: { seconds: 2.75, area: 'orders' }
        }, {}, sendResponse);

        expect(completion).toBeInstanceOf(Promise);
        await completion;

        expect(chrome.storage.local.__getStore().dailyStats['2023-10-27'].loadingByArea)
            .toEqual({ orders: 2.75 });
        expect(sendResponse).toHaveBeenCalledWith({ status: 'success' });
    });

    test('reports a failed storage write and continues processing subsequent stats', async () => {
        const failedResponse = jest.fn();
        const nextResponse = jest.fn();
        const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
        chrome.storage.local.set.mockRejectedValueOnce(new Error('Storage unavailable'));

        try {
            await handleTrackStat({ type: 'PLACEMENT_ADDED', value: 1 }, {}, failedResponse);
            expect(failedResponse).toHaveBeenCalledTimes(1);
            expect(failedResponse).toHaveBeenCalledWith({
                status: 'error', message: 'Error: Storage unavailable'
            });

            await handleTrackStat({ type: 'PLACEMENT_ADDED', value: 2 }, {}, nextResponse);
            expect(nextResponse).toHaveBeenCalledTimes(1);
            expect(nextResponse).toHaveBeenCalledWith({ status: 'success' });
            expect(chrome.storage.local.__getStore().dailyStats['2023-10-27'].placements).toBe(2);
        } finally {
            errorLog.mockRestore();
        }
    });

    test('handleTrackStat should recover the start date from existing daily stats', async () => {
        await chrome.storage.local.set({
            dailyStats: {
                '2023-01-15': {
                    placements: 1,
                    loadingTime: 0,
                    visitedCampaigns: [],
                    reconciliations: 0
                }
            }
        });

        await handleTrackStat({ type: 'PLACEMENT_ADDED', value: 1 }, {}, () => {});

        const store = chrome.storage.local.__getStore();
        expect(store.statsStartDate).toBe('2023-01-15T00:00:00.000Z');
    });
});

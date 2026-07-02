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

    // Helper to wait for async operations (using real timers)
    async function waitForAsync() {
        await new Promise(resolve => setTimeout(resolve, 100));
    }

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

        // These are fire-and-forget in implementation, so we wait after
        handleTrackStat({ type: 'CAMPAIGN_VISIT', value: 'c2' }, {}, () => {});
        handleTrackStat({ type: 'LOADING_TIME', value: 2.5 }, {}, () => {});
        handleTrackStat({ type: 'PLACEMENT_ADDED', value: 3 }, {}, () => {});
        handleTrackStat({ type: 'RECONCILIATION', value: 2 }, {}, () => {});

        // Wait for the chain of promises to resolve
        await waitForAsync();

        const store = chrome.storage.local.__getStore();
        // Check if dailyStats exists first
        expect(store.dailyStats).toBeDefined();

        const daily = store.dailyStats[today];
        expect(daily).toBeDefined();
        expect(daily.visitedCampaigns).toContain('c2');
        expect(daily.loadingTime).toBe(2.5);
        expect(daily.placements).toBe(3);
        expect(daily.reconciliations).toBe(2);
    });

    test('handleTrackStat should deduplicate campaign visits', async () => {
        const d = new Date();
        const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

        handleTrackStat({ type: 'CAMPAIGN_VISIT', value: 'c2' }, {}, () => {});
        await waitForAsync();

        handleTrackStat({ type: 'CAMPAIGN_VISIT', value: 'c2' }, {}, () => {});
        await waitForAsync();

        const store = chrome.storage.local.__getStore();
        expect(store.dailyStats).toBeDefined();
        const daily = store.dailyStats[today];

        expect(daily.visitedCampaigns.length).toBe(1);
    });
});

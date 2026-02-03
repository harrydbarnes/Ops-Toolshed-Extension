import { migrateStats, handleTrackStat } from '../background/stats-manager';

describe('Stats Manager', () => {
    beforeEach(() => {
        global.resetMocks();
    });

    test('migrateStats should move prismaUserStats to legacyStats', async () => {
        const oldStats = {
            visitedCampaigns: ['c1'],
            totalLoadingTime: 10,
            placementsAdded: 5
        };
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
            placementsAdded: 0
        });
    });

    test('handleTrackStat should update dailyStats correctly', async () => {
        const today = new Date().toISOString().split('T')[0];

        handleTrackStat({ type: 'CAMPAIGN_VISIT', value: 'c2' }, {}, () => {});
        handleTrackStat({ type: 'LOADING_TIME', value: 2.5 }, {}, () => {});
        handleTrackStat({ type: 'PLACEMENT_ADDED', value: 3 }, {}, () => {});

        // Wait for async execution
        await new Promise(r => setTimeout(r, 100));

        const store = chrome.storage.local.__getStore();
        const daily = store.dailyStats[today];

        expect(daily).toBeDefined();
        expect(daily.visitedCampaigns).toContain('c2');
        expect(daily.loadingTime).toBe(2.5);
        expect(daily.placements).toBe(3);
    });

    test('handleTrackStat should deduplicate campaign visits', async () => {
        const today = new Date().toISOString().split('T')[0];

        handleTrackStat({ type: 'CAMPAIGN_VISIT', value: 'c2' }, {}, () => {});
        await new Promise(r => setTimeout(r, 50));
        handleTrackStat({ type: 'CAMPAIGN_VISIT', value: 'c2' }, {}, () => {});
        await new Promise(r => setTimeout(r, 50));

        const store = chrome.storage.local.__getStore();
        const daily = store.dailyStats[today];

        expect(daily.visitedCampaigns.length).toBe(1);
    });
});

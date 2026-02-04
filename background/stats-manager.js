
let updatePromise = Promise.resolve();

export async function migrateStats() {
    const data = await chrome.storage.local.get(['prismaUserStats', 'legacyStats']);
    if (data.prismaUserStats && !data.legacyStats) {
        // Migration needed
        await chrome.storage.local.set({
            legacyStats: data.prismaUserStats
        });
        await chrome.storage.local.remove('prismaUserStats');
        console.log('[Stats Manager] Stats migrated to legacyStats format.');
    } else if (!data.legacyStats) {
        // Initialize if neither exists
        await chrome.storage.local.set({
            legacyStats: {
                visitedCampaigns: [],
                totalLoadingTime: 0,
                placementsAdded: 0
            }
        });
    }
}

export function handleTrackStat(request, sender, sendResponse) {
    // Queue updates to avoid race conditions
    updatePromise = updatePromise.then(async () => {
        const d = new Date();
        const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const data = await chrome.storage.local.get(['dailyStats']);
        let dailyStats = data.dailyStats || {};

        if (!dailyStats[today]) {
            dailyStats[today] = {
                placements: 0,
                loadingTime: 0,
                visitedCampaigns: []
            };
        }

        const stats = dailyStats[today];

        if (request.type === 'CAMPAIGN_VISIT') {
            if (!stats.visitedCampaigns.includes(request.value)) {
                stats.visitedCampaigns.push(request.value);
            }
        } else if (request.type === 'LOADING_TIME') {
            const val = parseFloat(request.value);
            if (!isNaN(val)) {
                stats.loadingTime += val;
            }
        } else if (request.type === 'PLACEMENT_ADDED') {
            const val = parseInt(request.value, 10);
            if (!isNaN(val)) {
                stats.placements += val;
            }
        }

        dailyStats[today] = stats;
        await chrome.storage.local.set({ dailyStats });
    }).catch(err => {
        console.error('[Stats Manager] Error updating stats:', err);
    });

    sendResponse({ status: 'success' });
}

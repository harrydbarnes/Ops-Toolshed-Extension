
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
                placementsAdded: 0,
                reconciliations: 0
            }
        });
    }
}

export function handleTrackStat(request, sender, sendResponse) {
    // Queue updates to avoid race conditions
    updatePromise = updatePromise.then(async () => {
        const d = new Date();
        const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const data = await chrome.storage.local.get(['dailyStats', 'statsStartDate']);
        let dailyStats = data.dailyStats || {};
        let statsStartDate = data.statsStartDate;

        if (!statsStartDate) {
            const earliestRecordedDate = Object.keys(dailyStats)
                .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date))
                .sort()[0];

            statsStartDate = earliestRecordedDate
                ? new Date(`${earliestRecordedDate}T00:00:00`).toISOString()
                : d.toISOString();
        }

        if (!dailyStats[today]) {
            dailyStats[today] = {
                placements: 0,
                loadingTime: 0,
                loadingByArea: {},
                visitedCampaigns: [],
                reconciliations: 0
            };
        }

        const stats = dailyStats[today];
        // Ensure reconciliations exists for existing days
        if (typeof stats.reconciliations === 'undefined') {
            stats.reconciliations = 0;
        }
        if (!stats.loadingByArea || typeof stats.loadingByArea !== 'object') {
            stats.loadingByArea = {};
        }

        if (request.type === 'CAMPAIGN_VISIT') {
            if (!stats.visitedCampaigns.includes(request.value)) {
                stats.visitedCampaigns.push(request.value);
            }
        } else if (request.type === 'LOADING_TIME') {
            const detailedValue = request.value && typeof request.value === 'object'
                ? request.value
                : null;
            const val = parseFloat(detailedValue ? detailedValue.seconds : request.value);
            if (!isNaN(val)) {
                stats.loadingTime += val;
                const area = String(detailedValue?.area || '').toLowerCase();
                const supportedAreas = new Set([
                    'home', 'plan', 'buy', 'actualise', 'traffic', 'analyse', 'orders', 'other'
                ]);
                if (supportedAreas.has(area)) {
                    stats.loadingByArea[area] = (Number(stats.loadingByArea[area]) || 0) + val;
                }
            }
        } else if (request.type === 'PLACEMENT_ADDED') {
            const val = parseInt(request.value, 10);
            if (!isNaN(val)) {
                stats.placements += val;
            }
        } else if (request.type === 'RECONCILIATION') {
            const val = parseInt(request.value, 10);
            if (!isNaN(val)) {
                stats.reconciliations += val;
            }
        }

        dailyStats[today] = stats;
        await chrome.storage.local.set({ dailyStats, statsStartDate });
        sendResponse({ status: 'success' });
    }).catch(err => {
        console.error('[Stats Manager] Error updating stats:', err);
        sendResponse({ status: 'error', message: err.toString() });
    });

    return true; // Indicates async response
}

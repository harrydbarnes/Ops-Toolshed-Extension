
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
    if (request.type === 'PLACEMENT_ADDED') {
        // Older injected pages may still emit click estimates. Preserve stored
        // history, but only confirmed save acknowledgements add new placements.
        sendResponse({ status: 'success', ignored: true });
        return Promise.resolve();
    }
    // Queue updates to avoid race conditions
    updatePromise = updatePromise.then(async () => {
        if (request.type === 'CAMPAIGN_SNAPSHOT') {
            const value = request.value;
            if (!value || typeof value.key !== 'string' || !value.key || value.key.length > 1000) {
                sendResponse({ status: 'error', message: 'Invalid campaign snapshot' });
                return;
            }
            const { campaignStatsSnapshots = [] } = await chrome.storage.local.get('campaignStatsSnapshots');
            const entries = Array.isArray(campaignStatsSnapshots) ? campaignStatsSnapshots : [];
            const previous = entries.find(entry => entry.key === value.key);
            const money = (number, fallback) => typeof number === 'number' && Number.isFinite(number) && number >= 0 ? number : fallback ?? null;
            const snapshot = {
                key: value.key,
                clientName: String(value.clientName || previous?.clientName || '').slice(0, 220),
                supplier: String(value.supplier || previous?.supplier || '').slice(0, 2000),
                budget: money(value.budget, previous?.budget),
                booked: money(value.booked, previous?.booked),
                updatedAt: Date.now()
            };
            await chrome.storage.local.set({ campaignStatsSnapshots: [snapshot, ...entries.filter(entry => entry.key !== value.key)].slice(0, 2000) });
            sendResponse({ status: 'success' });
            return;
        }
        const d = new Date();
        const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const data = await chrome.storage.local.get(['dailyStats', 'statsStartDate', 'statsSaveReceipts']);
        const confirmed = request.type === 'PLACEMENT_CONFIRMED';
        if (confirmed && (!request.value || !/^[a-f0-9-]{36}$/i.test(request.value.eventId || '') || !['created', 'updated', 'other'].includes(request.value.kind))) {
            sendResponse({ status: 'error', message: 'Invalid save acknowledgement' });
            return;
        }
        const receipts = Array.isArray(data.statsSaveReceipts) ? data.statsSaveReceipts : [];
        if (confirmed && receipts.includes(request.value.eventId)) {
            sendResponse({ status: 'success' });
            return;
        }
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

        if (confirmed) {
            const field = { created: 'placementsCreated', updated: 'placementsUpdated', other: 'placementSavesOther' }[request.value.kind];
            stats[field] = (Number(stats[field]) || 0) + 1;
        } else if (request.type === 'CAMPAIGN_VISIT') {
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
        } else if (request.type === 'RECONCILIATION') {
            const val = parseInt(request.value, 10);
            if (!isNaN(val)) {
                stats.reconciliations += val;
            }
        }

        dailyStats[today] = stats;
        await chrome.storage.local.set({ dailyStats, statsStartDate,
            ...(confirmed ? { statsSaveReceipts: [...receipts, request.value.eventId].slice(-5000) } : {}) });
        sendResponse({ status: 'success' });
    }).catch(err => {
        console.error('[Stats Manager] Error updating stats:', err);
        sendResponse({ status: 'error', message: err.toString() });
    });

    // The background message router awaits handler promises. Returning the
    // queued write keeps the MV3 service worker alive until storage is updated
    // and the sender has received its acknowledgement.
    return updatePromise;
}

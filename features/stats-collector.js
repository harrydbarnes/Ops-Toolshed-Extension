(function() {
    'use strict';

    let isUpdatingStats = false;

    // --- Utility function to get and set stats ---
    async function updateStats(updateFunction) {
        if (isUpdatingStats) {
            console.warn('[Stats Collector] Concurrent update dropped to prevent race condition.');
            return;
        }
        isUpdatingStats = true;
        try {
            const data = await chrome.storage.local.get(['prismaUserStats', 'statsStartDate', 'visitTimestamps']);
            let stats = data.prismaUserStats;
            let timestamps = data.visitTimestamps || [];

            // If stats object doesn't exist, this is the first time.
            if (!stats) {
                stats = {
                    visitedCampaigns: [],
                    totalLoadingTime: 0,
                    placementsAdded: 0
                };
                // Set the start date only if it doesn't already exist.
                if (!data.statsStartDate) {
                    chrome.storage.local.set({ statsStartDate: new Date().toISOString() });
                }
            }

            const updatedStats = updateFunction(stats);
            timestamps.push(new Date().toISOString());
            await chrome.storage.local.set({ 'prismaUserStats': updatedStats, 'visitTimestamps': timestamps });
        } catch (error) {
            if (error.message.includes('Extension context invalidated')) {
                console.warn('[Stats Collector] Extension context invalidated. Aborting stats update.');
            } else {
                console.error('[Stats Collector] Unexpected error during stats update:', error);
            }
        } finally {
            isUpdatingStats = false;
        }
    }

    // --- 1. Track Unique Campaign IDs ---
    let lastUrl = '';
    function trackCampaignId() {
        if (window.location.href === lastUrl) return;
        lastUrl = window.location.href;

        const campaignIdMatch = lastUrl.match(/campaign-id=([^&]+)/);
        if (campaignIdMatch && campaignIdMatch[1]) {
            const campaignId = campaignIdMatch[1];
            updateStats(stats => {
                if (!stats.visitedCampaigns.includes(campaignId)) {
                    stats.visitedCampaigns.push(campaignId);
                    console.log(`[Stats Collector] New campaign tracked: ${campaignId}`);
                }
                return stats;
            });
        }
    }

    function observeLoadingSpinner() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(findAndTrackSpinner, 150); // Debounce for 150ms
    }

    // --- 2. Track Loading Spinner Time ---
    let loadingSpinnerStartTime = null;
    let debounceTimer = null;

    function findAndTrackSpinner() {
        const spinner = window.utils.queryShadowDom('svg.spinner') || document.querySelector('i.fa-spin');

        if (spinner && loadingSpinnerStartTime === null) {
            // Spinner appeared
            loadingSpinnerStartTime = Date.now();
            console.log('[Stats Collector] Loading spinner detected. Timer started.');
        } else if (!spinner && loadingSpinnerStartTime !== null) {
            // Spinner disappeared
            const duration = (Date.now() - loadingSpinnerStartTime) / 1000; // in seconds
            loadingSpinnerStartTime = null;
            console.log(`[Stats Collector] Loading finished. Duration: ${duration.toFixed(2)}s`);
            updateStats(stats => {
                stats.totalLoadingTime += duration;
                return stats;
            });
        }
    }

    // --- 3. Track Placement "Save" Clicks using Event Delegation ---
    function handleSaveButtonClick(event) {
        if (event.target.id === 'btn-save' || event.target.id === 'btn-save-and-add-another') {
            console.log('[Stats Collector] Save button clicked.');
            updateStats(stats => {
                stats.placementsAdded += 1;
                return stats;
            });
        }
    }

    // --- Main Initialization ---
    let isInitialized = false;
    function initializeStatsCollector() {
        if (isInitialized) return;

        const observer = new MutationObserver(observeLoadingSpinner);
        observer.observe(document.body, { childList: true, subtree: true });

        // Use event delegation for save buttons
        document.body.addEventListener('click', handleSaveButtonClick);

        isInitialized = true;
        console.log("Stats Collector Initialized");
    }

    window.statsCollector = {
        initialize: initializeStatsCollector,
        trackCampaignId: trackCampaignId // Expose for centralized observer
    };

})();
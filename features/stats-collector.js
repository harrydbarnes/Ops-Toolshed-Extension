(function() {
    'use strict';

    // --- Utility function to get and set stats ---
    async function updateStats(updateFunction) {
        const data = await chrome.storage.local.get('prismaUserStats');
        let stats = data.prismaUserStats || {
            visitedCampaigns: [],
            totalLoadingTime: 0,
            placementsAdded: 0
        };
        const updatedStats = updateFunction(stats);
        await chrome.storage.local.set({ 'prismaUserStats': updatedStats });
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

    // --- 2. Track Loading Spinner Time ---
    let loadingSpinnerStartTime = null;
    function observeLoadingSpinner(mutations) {
        // FIX: Use window.utils.queryShadowDom to find spinners deep inside
        // Shadow DOMs (like the mo-spinner component). We'll search for the
        // most consistent indicator, which is the 'svg.spinner' inside the shadow root,
        // or fall back to the simpler 'i.fa-spin' in the light DOM.

        const spinner = window.utils.queryShadowDom('svg.spinner') ||
                        document.querySelector('i.fa-spin');

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
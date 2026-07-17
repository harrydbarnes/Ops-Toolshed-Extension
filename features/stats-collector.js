(function() {
    'use strict';

    let isEnabled = true;

    chrome.storage.sync.get('statsCollectorEnabled', (data) => {
        isEnabled = data.statsCollectorEnabled !== false;
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes.statsCollectorEnabled) {
            isEnabled = changes.statsCollectorEnabled.newValue !== false;
            if (!isEnabled) loadingSpinnerStartTime = null;
            else scheduleLoadingCheck();
        }
    });

    // --- Utility function to track stats ---
    function trackStat(type, value) {
        if (!isEnabled) return;

        try {
            const messageResult = chrome.runtime.sendMessage({
                action: 'TRACK_STAT',
                type: type,
                value: value
            });
            Promise.resolve(messageResult)
                .then(response => {
                    if (response?.status === 'error') {
                        console.error('[Stats Collector] Stat was not saved:', response.message || 'Unknown background error.');
                    }
                })
                .catch(error => {
                    if (!String(error?.message || error).includes('Extension context invalidated')) {
                        console.error('[Stats Collector] Error sending stat:', error);
                    }
                });
        } catch (error) {
            // Silence "Extension context invalidated" errors
            if (!error.message.includes('Extension context invalidated')) {
                console.error('[Stats Collector] Error sending stat:', error);
            }
        }
    }

    // --- 1. Track Unique Campaign IDs ---
    let lastUrl = '';
    function trackCampaignId() {
        if (!isEnabled) return;
        if (window.location.href === lastUrl) return;
        lastUrl = window.location.href;

        const campaignIdMatch = lastUrl.match(/campaign-id=([^&]+)/);
        if (campaignIdMatch && campaignIdMatch[1]) {
            const campaignId = campaignIdMatch[1];
            trackStat('CAMPAIGN_VISIT', campaignId);
            console.log(`[Stats Collector] Campaign tracked: ${campaignId}`);
        }
    }

    function observeLoadingSpinner() {
        scheduleLoadingCheck();
    }

    function getPrismaArea(url = window.location.href) {
        let params;
        try {
            const parsedUrl = new URL(url, window.location.origin);
            params = new URLSearchParams(parsedUrl.hash.replace(/^#/, ''));
        } catch {
            return 'other';
        }

        const app = (params.get('osPspId') || '').toLowerCase();
        const module = (params.get('ptb-mod') || '').toLowerCase();
        const context = (params.get('ptb-ctx') || '').toLowerCase();
        const route = (params.get('route') || '').toLowerCase();
        const showOrders = params.get('showOrders') === 'true';

        if (app === 'cm-dashboard' || route === 'campaigns') return 'home';
        if (context === 'actualize' || route === 'actualize') return 'actualise';
        if (showOrders || context === 'ordersummary') return 'orders';
        if (module === 'plan') return 'plan';
        if (module === 'traffic') return 'traffic';
        if (module === 'analyze') return 'analyse';
        if (module === 'buy') return 'buy';
        return 'other';
    }

    // --- 2. Track Loading Spinner Time ---
    let loadingSpinnerStartTime = null;
    let loadingCheckScheduled = false;

    function scheduleLoadingCheck() {
        if (!isEnabled || loadingCheckScheduled) return;
        loadingCheckScheduled = true;
        const schedule = window.requestAnimationFrame || (callback => window.setTimeout(callback, 0));
        schedule(() => {
            loadingCheckScheduled = false;
            checkLoadingState();
        });
    }

    function checkLoadingState() {
        if (!isEnabled) {
            loadingSpinnerStartTime = null;
            return;
        }
        const hasVisibleSpinner = window.utils.findVisibleLoadingSpinners().length > 0;

        if (hasVisibleSpinner && loadingSpinnerStartTime === null) {
            loadingSpinnerStartTime = Date.now();
            console.log('[Stats Collector] Loading spinner detected. Timer started.');
        } else if (!hasVisibleSpinner && loadingSpinnerStartTime !== null) {
            const duration = (Date.now() - loadingSpinnerStartTime) / 1000; // in seconds
            loadingSpinnerStartTime = null;
            console.log(`[Stats Collector] Loading finished. Duration: ${duration.toFixed(2)}s`);
            if (duration > 0) trackStat('LOADING_TIME', {
                seconds: duration,
                area: getPrismaArea()
            });
        }
    }

    function finishActiveLoadingMeasurement() {
        if (!isEnabled || loadingSpinnerStartTime === null) return;
        const duration = (Date.now() - loadingSpinnerStartTime) / 1000;
        loadingSpinnerStartTime = null;
        if (duration > 0) trackStat('LOADING_TIME', {
            seconds: duration,
            area: getPrismaArea()
        });
    }

    // --- 3. Track Click Events (Save Placements & Reconciliations) ---
    function handleClickEvents(event) {
        if (!isEnabled) return;

        // Track Placement Saves
        if (event.target.id === 'btn-save' || event.target.id === 'btn-save-and-add-another') {
            console.log('[Stats Collector] Save button clicked.');
            trackStat('PLACEMENT_ADDED', 1);
        }

        // Track Reconciliations (Ok to Pay = Yes)
        if (event.target.id === 'ok-to-pay-yes-button') {
            console.log('[Stats Collector] Reconciliation clicked.');
            trackStat('RECONCILIATION', 1);
        }

        // Track Reconciliations via Cost Source Dropdown
        // (User selects an item which changes "Ok to Pay" to Yes)
        const costSourceLink = event.target.closest('.handle-cost-source-selection-div li a[role="menuitem"]');
        if (costSourceLink) {
            console.log('[Stats Collector] Cost Source selection detected (Reconciliation).');
            trackStat('RECONCILIATION', 1);
        }
    }

    // --- Main Initialization ---
    let isInitialized = false;
    function initializeStatsCollector() {
        if (isInitialized) return;

        const observer = new MutationObserver(observeLoadingSpinner);
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style', 'hidden']
        });
        checkLoadingState();

        // Use event delegation for buttons
        document.body.addEventListener('click', handleClickEvents);
        window.addEventListener('pagehide', finishActiveLoadingMeasurement);

        isInitialized = true;
        console.log("Stats Collector Initialized");
    }

    window.statsCollector = {
        initialize: initializeStatsCollector,
        trackCampaignId: trackCampaignId,
        checkLoadingState,
        getPrismaArea
    };

})();

(function() {
    'use strict';

    let isEnabled = true;

    chrome.storage.sync.get('statsCollectorEnabled', (data) => {
        isEnabled = data.statsCollectorEnabled !== false;
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.campaignStatsSnapshots && !changes.campaignStatsSnapshots.newValue?.length) {
            lastSnapshotFingerprint = '';
        }
        if (area === 'sync' && changes.statsCollectorEnabled) {
            isEnabled = changes.statsCollectorEnabled.newValue !== false;
            if (!isEnabled) {
                loadingSpinnerStartTime = null;
                loadingSpinnerArea = '';
            }
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
    let lastTrackedCampaignId = '';
    let lastSnapshotFingerprint = '';
    function trackCampaignSnapshot() {
        if (!isEnabled || getVisibleSpinners().length) return;
        const id = new URLSearchParams(window.location.hash.slice(1)).get('campaign-id');
        const snapshot = window.campaignHistoryFeature?.getCampaignSnapshot?.();
        if (!id || !snapshot?.key || snapshot.campaignId !== id) return;
        const renderedId = document.querySelector('.buy-details-wrapper, .buy-details-background')?.textContent?.match(/\bCP[A-Z0-9-]+\b/i)?.[0];
        if (!renderedId || renderedId.toLowerCase() !== id.toLowerCase()) return;
        const exactMoney = selector => {
            const text = (document.querySelector(selector)?.textContent?.trim() || '')
                .replace(/\s+(?:budget|buy total \(billable amount\))$/i, '');
            // Never infer money from rounded K/M labels or mix currencies.
            if (!/^(?:£|GBP\s*)\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/.test(text)) return null;
            return Number(text.replace(/GBP|£|,|\s/g, ''));
        };
        const budgetType = document.querySelector('[data-cy="budget-type-label"]')?.textContent?.trim();
        const value = {
            key: snapshot.key, clientName: snapshot.clientName || '',
            supplier: snapshot.supplier || '',
            budget: /total client cost/i.test(budgetType || '') ? exactMoney('[data-cy="budget-amount"]') : null,
            booked: /total client cost/i.test(budgetType || '') ? exactMoney('[data-cy="budget-purchased"]') : null
        };
        const fingerprint = JSON.stringify(value);
        if (fingerprint === lastSnapshotFingerprint) return;
        lastSnapshotFingerprint = fingerprint;
        trackStat('CAMPAIGN_SNAPSHOT', value);
    }
    function trackCampaignId() {
        if (!isEnabled) return;
        trackCampaignSnapshot();
        const campaignIdMatch = window.location.href.match(/campaign-id=([^&]+)/);
        const campaignId = campaignIdMatch?.[1] ? decodeURIComponent(campaignIdMatch[1]) : '';
        if (!campaignId) {
            lastTrackedCampaignId = '';
            return;
        }
        // Prisma can rewrite route parameters repeatedly during an initial
        // campaign render. A visit is a campaign-level event, not a URL-level
        // event, so repeated route updates must not queue duplicate storage
        // writes for the same campaign.
        if (campaignId === lastTrackedCampaignId) return;
        lastTrackedCampaignId = campaignId;
        trackStat('CAMPAIGN_VISIT', campaignId);
        console.log(`[Stats Collector] Campaign tracked: ${campaignId}`);
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
    let loadingSpinnerArea = '';
    function getVisibleSpinners(state) {
        if (Array.isArray(state?.visibleSpinners)) return state.visibleSpinners;
        if (window.loadingMonitor?.getState) {
            return window.loadingMonitor.getState().visibleSpinners;
        }
        return window.utils.findVisibleLoadingSpinners();
    }

    function recordLoadingSegment(endedAt = Date.now()) {
        if (loadingSpinnerStartTime === null) return;
        const duration = (endedAt - loadingSpinnerStartTime) / 1000;
        const area = loadingSpinnerArea || getPrismaArea();
        loadingSpinnerStartTime = null;
        loadingSpinnerArea = '';
        if (duration > 0) trackStat('LOADING_TIME', { seconds: duration, area });
    }

    function checkLoadingState(state) {
        if (!isEnabled) {
            loadingSpinnerStartTime = null;
            loadingSpinnerArea = '';
            return;
        }
        const hasVisibleSpinner = getVisibleSpinners(state).length > 0;
        if (!hasVisibleSpinner) trackCampaignSnapshot();
        const currentArea = getPrismaArea();

        if (hasVisibleSpinner && loadingSpinnerStartTime === null) {
            loadingSpinnerStartTime = Date.now();
            loadingSpinnerArea = currentArea;
            console.log('[Stats Collector] Loading spinner detected. Timer started.');
        } else if (hasVisibleSpinner && loadingSpinnerArea !== currentArea) {
            const areaChangedAt = Date.now();
            recordLoadingSegment(areaChangedAt);
            loadingSpinnerStartTime = areaChangedAt;
            loadingSpinnerArea = currentArea;
        } else if (!hasVisibleSpinner && loadingSpinnerStartTime !== null) {
            const duration = (Date.now() - loadingSpinnerStartTime) / 1000;
            console.log(`[Stats Collector] Loading finished. Duration: ${duration.toFixed(2)}s`);
            recordLoadingSegment();
        }
    }

    function finishActiveLoadingMeasurement() {
        if (!isEnabled || loadingSpinnerStartTime === null) return;
        recordLoadingSegment();
    }

    // --- 3. Track Click Events (Save Placements & Reconciliations) ---
    function handleClickEvents(event) {
        if (!isEnabled) return;
        // The exact amounts may appear only after opening Prisma's budget popover.
        if (event.target.closest('#campaign-budget-overview-container')) {
            window.setTimeout(trackCampaignSnapshot, 500);
        }

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
    let unsubscribeLoadingMonitor = null;

    function startLoadingMeasurements() {
        if (unsubscribeLoadingMonitor || !window.loadingMonitor?.subscribe) return;
        unsubscribeLoadingMonitor = window.loadingMonitor.subscribe(checkLoadingState);
    }

    function stopLoadingMeasurements() {
        finishActiveLoadingMeasurement();
        unsubscribeLoadingMonitor?.();
        unsubscribeLoadingMonitor = null;
    }
    function initializeStatsCollector() {
        if (isInitialized) return;

        // Share the existing monitor so statistics stay independent of Loading Facts.
        startLoadingMeasurements();

        // Use event delegation for buttons
        document.body.addEventListener('click', handleClickEvents);
        window.addEventListener('pagehide', stopLoadingMeasurements);
        window.addEventListener('pageshow', startLoadingMeasurements);
        window.addEventListener('hashchange', () => checkLoadingState());
        window.addEventListener('popstate', () => checkLoadingState());

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

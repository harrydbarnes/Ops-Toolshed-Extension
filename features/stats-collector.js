(function() {
    'use strict';

    let isEnabled = true;

    chrome.storage.sync.get('statsCollectorEnabled', (data) => {
        isEnabled = data.statsCollectorEnabled !== false;
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes.statsCollectorEnabled) {
            isEnabled = changes.statsCollectorEnabled.newValue !== false;
        }
    });

    // --- Utility function to track stats ---
    function trackStat(type, value) {
        if (!isEnabled) return;

        try {
            chrome.runtime.sendMessage({
                action: 'TRACK_STAT',
                type: type,
                value: value
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
        if (!isEnabled) return;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(findAndTrackSpinner, 150); // Debounce for 150ms
    }

    // --- 2. Track Loading Spinner Time ---
    let loadingSpinnerStartTime = null;
    let debounceTimer = null;

    function findAndTrackSpinner() {
        if (!isEnabled) {
            loadingSpinnerStartTime = null;
            return;
        }
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
            trackStat('LOADING_TIME', duration);
        }
    }

    // --- 3. Track Click Events (Save Placements & Reconciliations) ---
    // State to track manual reconciliations that are pending a 'Save'
    let pendingManualReconciliations = new Set();

    function handleClickEvents(event) {
        if (!isEnabled) return;
        const target = event.target;

        // --- A. Handle Save (Flush Pending Manual Reconciliations) ---
        // Triggers on: #btn-save, #btn-save-and-add-another, or #save-button
        if (target.id === 'btn-save' || target.id === 'btn-save-and-add-another' || target.id === 'save-button') {
            console.log('[Stats Collector] Save button clicked.');
            trackStat('PLACEMENT_ADDED', 1);

            // If we have pending manual reconciliations, track them now
            if (pendingManualReconciliations.size > 0) {
                console.log(`[Stats Collector] Tracking ${pendingManualReconciliations.size} manual reconciliations on save.`);
                trackStat('RECONCILIATION', pendingManualReconciliations.size);
                pendingManualReconciliations.clear();
            }
        }

        // --- B. Handle Dropdown (Immediate Reconciliation) ---
        // Trigger: Clicking Planned, Supplier, or Override
        // Condition: Only count if the "Ok to Pay" button for that row is currently "No"
        const dropdownItem = target.closest('.actual-cell-menu-item');
        if (dropdownItem) {
            const costBasisSpan = dropdownItem.querySelector('.cost-basis');
            const costBasis = costBasisSpan ? costBasisSpan.textContent.trim() : '';

            if (['Planned', 'Supplier', 'Override'].includes(costBasis)) {
                const row = target.closest('tr');
                // Check if the row exists and the button is currently 'No'
                const okToPayBtn = row ? row.querySelector('.ok-to-pay') : null;

                if (okToPayBtn && okToPayBtn.textContent.trim().toLowerCase() === 'no') {
                    console.log(`[Stats Collector] Dropdown reconciliation (${costBasis}) detected.`);
                    trackStat('RECONCILIATION', 1);
                }
            }
        }

        // --- C. Handle Manual Toggle (Delayed Reconciliation) ---
        // Trigger: Clicking "Ok to Pay"
        // Condition: Staged until Save is clicked
        if (target.classList.contains('ok-to-pay')) {
            // Use data-row-num as unique ID
            const rowId = target.getAttribute('data-row-num');
            if (rowId) {
                const isCurrentlyNo = target.textContent.trim().toLowerCase() === 'no';

                if (isCurrentlyNo) {
                    // Toggling No -> Yes: Stage it
                    pendingManualReconciliations.add(rowId);
                    console.log(`[Stats Collector] Manual reconciliation staged for row ${rowId}`);
                } else {
                    // Toggling Yes -> No: Unstage it
                    pendingManualReconciliations.delete(rowId);
                    console.log(`[Stats Collector] Manual reconciliation unstaged for row ${rowId}`);
                }
            }
        }
    }

    // --- Main Initialization ---
    let isInitialized = false;
    function initializeStatsCollector() {
        if (isInitialized) return;

        const observer = new MutationObserver(observeLoadingSpinner);
        observer.observe(document.body, { childList: true, subtree: true });

        // Use event delegation for buttons
        document.body.addEventListener('click', handleClickEvents);

        isInitialized = true;
        console.log("Stats Collector Initialized");
    }

    window.statsCollector = {
        initialize: initializeStatsCollector,
        trackCampaignId: trackCampaignId // Expose for centralized observer
    };

})();

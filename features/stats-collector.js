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
        debounceTimer = setTimeout(findAndTrackSpinner, 150);
    }

    // --- 2. Track Loading Spinner Time ---
    let loadingSpinnerStartTime = null;
    let debounceTimer = null;

    function findAndTrackSpinner() {
        if (!isEnabled) {
            loadingSpinnerStartTime = null;
            return;
        }
        const spinner = window.utils && window.utils.queryShadowDom ?
                        window.utils.queryShadowDom('svg.spinner') :
                        document.querySelector('i.fa-spin');

        if (spinner && loadingSpinnerStartTime === null) {
            loadingSpinnerStartTime = Date.now();
            console.log('[Stats Collector] Loading spinner detected. Timer started.');
        } else if (!spinner && loadingSpinnerStartTime !== null) {
            const duration = (Date.now() - loadingSpinnerStartTime) / 1000;
            loadingSpinnerStartTime = null;
            console.log(`[Stats Collector] Loading finished. Duration: ${duration.toFixed(2)}s`);
            trackStat('LOADING_TIME', duration);
        }
    }

    // --- 3. Reconciliation & Placement Logic ---

    // State Tracking
    let pendingManualReconciliations = new Set();
    let lastInteractedRowId = null;
    let watchingRows = new Set(); // Rows being actively watched for a status flip

    /**
     * actively watches a specific row for a few seconds to see if 'Ok to Pay' flips to 'Yes'.
     * Used for Dropdown actions and Redistribute where the change might be async (after API/Modal).
     */
    function startWatchingRow(rowId) {
        if (watchingRows.has(rowId)) return;

        // Find the specific button for this row
        const btnSelector = `.ok-to-pay[data-row-num="${rowId}"]`;
        const okToPayBtn = document.querySelector(btnSelector);

        if (!okToPayBtn) return;

        // Only watch if it is currently "No"
        if (okToPayBtn.textContent.trim().toLowerCase() !== 'no') return;

        console.log(`[Stats Collector] Watching Row ${rowId} for reconciliation...`);
        watchingRows.add(rowId);

        let checks = 0;
        const maxChecks = 40; // 40 * 100ms = 4 seconds monitoring
        const interval = setInterval(() => {
            checks++;
            const currentBtn = document.querySelector(btnSelector);

            if (!currentBtn) {
                 clearInterval(interval);
                 watchingRows.delete(rowId);
                 return;
            }

            const text = currentBtn.textContent.trim().toLowerCase();

            if (text === 'yes') {
                console.log(`[Stats Collector] Reconciliation detected on Row ${rowId}`);
                trackStat('RECONCILIATION', 1);
                clearInterval(interval);
                watchingRows.delete(rowId);
            } else if (checks >= maxChecks) {
                // Timeout
                clearInterval(interval);
                watchingRows.delete(rowId);
            }
        }, 100);
    }

    function handleClickEvents(event) {
        if (!isEnabled) return;
        const target = event.target;

        // --- A. Context Tracking (Capture Row ID) ---
        // 1. Click on "Ok to Pay" button itself
        if (target.classList.contains('ok-to-pay')) {
            const rowId = target.getAttribute('data-row-num');
            if (rowId) lastInteractedRowId = rowId;
        }

        // 2. Click on Caret/Menu opener (to set context for Dropdown items which are detached)
        if (target.classList.contains('mo-menu-caret') || target.classList.contains('fa-caret-down')) {
            // Usually inside a TD with ID like "payableActualCostOct24-2"
            const parentTd = target.closest('td');
            if (parentTd && parentTd.id) {
                const parts = parentTd.id.split('-');
                const possibleId = parts[parts.length - 1];
                if (possibleId && !isNaN(possibleId)) {
                    lastInteractedRowId = possibleId;
                }
            }
        }

        // --- B. Manual "Yes" (Stage for Save) ---
        // Click on the "Yes" toggle inside the popover
        if (target.id === 'ok-to-pay-yes-button') {
            if (lastInteractedRowId) {
                // Check if we are toggling to Yes (the button itself is the "Yes" button)
                console.log(`[Stats Collector] Manual reconciliation staged for Row ${lastInteractedRowId}`);
                pendingManualReconciliations.add(lastInteractedRowId);
            }
        }

        // --- C. Global Save (Flush Pending) ---
        // Triggered by main save button (not modal save)
        if (target.id === 'save-button' || target.id === 'btn-save-and-add-another') {
            console.log('[Stats Collector] Save clicked. Flushing stats.');
            trackStat('PLACEMENT_ADDED', 1);

            if (pendingManualReconciliations.size > 0) {
                console.log(`[Stats Collector] Tracking ${pendingManualReconciliations.size} manual reconciliations.`);
                trackStat('RECONCILIATION', pendingManualReconciliations.size);
                pendingManualReconciliations.clear();
            }
        }

        // --- D. Dropdown / Redistribute (Immediate Watcher) ---

        let shouldWatch = false;

        // 1. Dropdown Actions (Planned, Supplier, Override)
        // These elements are usually in a detached list at the end of <body>
        if (target.classList.contains('cost-basis') || target.closest('.cost-basis')) {
            const text = target.textContent.trim();
            if (['Planned', 'Supplier', 'Override'].includes(text)) {
                shouldWatch = true;
            }
        }

        // 2. Redistribute Button
        // This is usually inside the row
        if (target.classList.contains('redistributeBtn')) {
            // For redistribute, we can update the ID directly from the row context
            const row = target.closest('tr');
            if (row) {
                const okBtn = row.querySelector('.ok-to-pay');
                if (okBtn) {
                    lastInteractedRowId = okBtn.getAttribute('data-row-num');
                }
            }
            shouldWatch = true;
        }

        if (shouldWatch && lastInteractedRowId) {
            startWatchingRow(lastInteractedRowId);
        }
    }

    // --- Main Initialization ---
    let isInitialized = false;
    function initializeStatsCollector() {
        if (isInitialized) return;

        const observer = new MutationObserver(observeLoadingSpinner);
        observer.observe(document.body, { childList: true, subtree: true });

        document.body.addEventListener('click', handleClickEvents);

        isInitialized = true;
        console.log("Stats Collector Initialized");
    }

    window.statsCollector = {
        initialize: initializeStatsCollector,
        trackCampaignId: trackCampaignId
    };

})();

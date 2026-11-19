(function() {
    'use strict';

    const SETTING_KEY = 'orderGridScrollSyncEnabled';
    let initialized = false;
    let featureEnabled = true;
    let scrollListenerAttached = false;

    function isOrderSummaryRoute() {
        const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        return params.get('osPspId') === 'prsm-cm-ord' || (
            params.get('ptb-ctx') === 'orderSummary' &&
            params.get('showOrders') === 'true'
        );
    }

    function getGridParts(masterHolder) {
        if (!masterHolder?.matches?.('.ht_master > .wtHolder')) return null;

        const wrapper = masterHolder.closest('.ht-wrapper.handsontable');
        const headerHolder = wrapper?.querySelector('.ht_clone_top > .wtHolder');
        return wrapper && headerHolder ? { headerHolder, masterHolder } : null;
    }

    function syncGrid(masterHolder) {
        const parts = getGridParts(masterHolder);
        if (!parts) return false;

        if (parts.headerHolder.scrollLeft !== parts.masterHolder.scrollLeft) {
            parts.headerHolder.scrollLeft = parts.masterHolder.scrollLeft;
        }
        return true;
    }

    function syncAll() {
        if (!featureEnabled || !isOrderSummaryRoute()) return 0;

        let synced = 0;
        document.querySelectorAll('.ht-wrapper.handsontable .ht_master > .wtHolder')
            .forEach(masterHolder => {
                if (syncGrid(masterHolder)) synced += 1;
            });
        return synced;
    }

    function handleScroll(event) {
        if (!featureEnabled || !isOrderSummaryRoute()) return;
        syncGrid(event.target);
    }

    function syncScrollListener() {
        if (featureEnabled && !scrollListenerAttached) {
            document.addEventListener('scroll', handleScroll, true);
            scrollListenerAttached = true;
        } else if (!featureEnabled && scrollListenerAttached) {
            document.removeEventListener('scroll', handleScroll, true);
            scrollListenerAttached = false;
        }
    }

    function initialize() {
        if (initialized) return;
        initialized = true;

        chrome.storage.sync.get({ [SETTING_KEY]: true }, data => {
            featureEnabled = data[SETTING_KEY] !== false;
            syncScrollListener();
            syncAll();
        });

        chrome.storage.onChanged?.addListener((changes, area) => {
            if (area !== 'sync' || !changes[SETTING_KEY]) return;
            featureEnabled = changes[SETTING_KEY].newValue !== false;
            syncScrollListener();
            if (featureEnabled) syncAll();
        });
    }

    window.orderGridScrollSyncFeature = {
        handleScroll,
        initialize,
        isOrderSummaryRoute,
        isEnabled: () => featureEnabled,
        syncAll,
        syncGrid
    };
})();

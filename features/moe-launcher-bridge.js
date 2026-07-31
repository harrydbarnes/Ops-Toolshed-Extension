(function() {
    'use strict';

    const OPEN_MOE_EVENT = 'ops-toolshed-open-moe';
    const RETRY_INTERVAL_MS = 100;
    const MAX_RETRIES = 20;
    let retryTimer = null;

    function openMoe() {
        if (typeof window.zE !== 'function') return false;
        try {
            window.zE('messenger', 'open');
            return true;
        } catch (error) {
            return false;
        }
    }

    function requestOpen() {
        if (openMoe()) return;
        if (retryTimer !== null) window.clearInterval(retryTimer);

        let retries = 0;
        retryTimer = window.setInterval(() => {
            retries += 1;
            if (openMoe() || retries >= MAX_RETRIES) {
                window.clearInterval(retryTimer);
                retryTimer = null;
            }
        }, RETRY_INTERVAL_MS);
    }

    document.addEventListener(OPEN_MOE_EVENT, requestOpen);
})();

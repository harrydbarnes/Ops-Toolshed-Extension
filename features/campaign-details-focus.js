(function() {
    'use strict';

    const CAMPAIGN_DETAILS_PATH = '/idesk/prisma-campaign-details/';
    const FOCUS_ACTION = 'focusCampaignDetailsBasic';
    const FOCUS_WINDOW_MS = 12000;
    const RETRY_DELAY_MS = 300;

    let focusAttempt = 0;
    let focusTimeout = null;

    function isCampaignDetailsFrame() {
        return window.location.pathname.includes(CAMPAIGN_DETAILS_PATH);
    }

    function activateElement(element) {
        const rect = element.getBoundingClientRect?.();
        const eventOptions = {
            bubbles: true,
            cancelable: true,
            composed: true,
            clientX: rect ? rect.left + Math.max(rect.width / 2, 1) : 0,
            clientY: rect ? rect.top + Math.max(rect.height / 2, 1) : 0,
            button: 0,
            buttons: 1,
            view: window
        };

        element.dispatchEvent?.(new MouseEvent('mousedown', eventOptions));
        element.dispatchEvent?.(new MouseEvent('mouseup', { ...eventOptions, buttons: 0 }));
        element.click?.();
    }

    function focusBasic(attemptId, deadline) {
        if (attemptId !== focusAttempt || !isCampaignDetailsFrame()) return false;
        if (document.getElementById('gwt-debug-campaignFlightStart')) {
            focusTimeout = null;
            return true;
        }

        const editControl = document.getElementById('campaign-details-basics-pencil-icon');
        const rect = editControl?.getBoundingClientRect?.();
        if (editControl && rect && rect.width > 0 && rect.height > 0) {
            editControl.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
            activateElement(editControl);
        }

        if (Date.now() < deadline) {
            focusTimeout = window.setTimeout(
                () => focusBasic(attemptId, deadline),
                RETRY_DELAY_MS
            );
        }
        return false;
    }

    function startBasicFocus() {
        focusAttempt += 1;
        if (focusTimeout !== null) {
            window.clearTimeout(focusTimeout);
            focusTimeout = null;
        }
        focusBasic(focusAttempt, Date.now() + FOCUS_WINDOW_MS);
    }

    if (!isCampaignDetailsFrame() || !chrome.runtime?.onMessage?.addListener) return;
    chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
        if (request?.action !== FOCUS_ACTION) return;
        sendResponse({ status: 'accepted' });
        startBasicFocus();
    });
})();

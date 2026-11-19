(function () {
    'use strict';
    if (!location.pathname.includes('/campaign-management/')) return;
    let enabled = false;
    let lastInteraction = 0;
    let previous = null;
    chrome.storage.local.get({ timesheetTrackingEnabled: false }, data => { enabled = data.timesheetTrackingEnabled === true; });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.timesheetTrackingEnabled) {
            enabled = changes.timesheetTrackingEnabled.newValue === true;
            previous = null;
        }
    });
    for (const event of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']) {
        document.addEventListener(event, () => { lastInteraction = Date.now(); }, { passive: true });
    }
    function readCampaign() {
        const id = new URLSearchParams(location.hash.slice(1)).get('campaign-id');
        const header = document.querySelector('.buy-details-wrapper .buy-details-full');
        const text = header?.getAttribute('data-full-text') || header?.textContent || '';
        const match = text.match(/^\s*([^|]+)\|\s*([^/|]+)\/([^/|]+)\/(?:\(([^)]+)\)|([^/|]+))\//);
        if (!id || !match || match[1].trim() !== id) return null;
        return { id, client: match[3].trim(), product: (match[4] || match[5]).trim() };
    }
    setInterval(() => {
        const now = Date.now();
        const campaign = enabled && window.opsToolshedExtensionState?.isActive() && document.visibilityState === 'visible' && document.hasFocus() && now - lastInteraction < 60000 ? readCampaign() : null;
        const day = new Date(now - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        if (campaign && previous && previous.id === campaign.id && previous.client === campaign.client && previous.product === campaign.product && previous.day === day && now - previous.time <= 20000) {
            chrome.runtime.sendMessage({ action: 'timesheetActivity', campaign, day, seconds: Math.min(15, (now - previous.time) / 1000) }).catch(() => {});
        }
        previous = campaign ? { ...campaign, day, time: now } : null;
    }, 15000);
})();

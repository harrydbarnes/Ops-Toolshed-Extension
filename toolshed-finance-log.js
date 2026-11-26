(function () {
    'use strict';
    const key = 'financeTimingLog';
    function duration(ms) {
        const minutes = Math.floor(Math.max(0, ms) / 60000);
        return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
    }
    async function render() {
        const target = document.getElementById('finance-timing-log');
        if (!target) return;
        const data = await chrome.storage.local.get({ [key]: [] });
        const entries = Array.isArray(data[key]) ? data[key].slice().reverse() : [];
        target.replaceChildren();
        if (!entries.length) { target.textContent = 'No Pending finance updates observed yet.'; return; }
        const list = document.createElement('ul');
        for (const entry of entries) {
            const item = document.createElement('li');
            const start = new Date(entry.firstPendingAt).toLocaleString();
            const last = new Date(entry.lastCheckedAt).toLocaleString();
            const outcome = entry.status === 'PENDING'
                ? `Pending at last confirmed check (${duration(entry.lastPendingAt - entry.firstPendingAt)} observed)`
                : `${entry.status} observed ${new Date(entry.resultObservedAt).toLocaleString()} (last Pending ${new Date(entry.lastPendingAt).toLocaleString()}; first-to-result observation ${duration(entry.resultObservedAt - entry.firstPendingAt)})`;
            item.textContent = `${entry.campaignId} · ${entry.month} · ${entry.dNumber || entry.placement} · ${outcome} · first Pending ${start} · last check ${last}${entry.checkError ? ` · ${entry.checkError}` : ''}`;
            list.appendChild(item);
        }
        target.appendChild(list);
    }
    document.addEventListener('DOMContentLoaded', () => { render().catch(() => {}); });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes[key]) render().catch(() => {});
    });
})();

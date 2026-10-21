document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('recciesButton');
    const status = document.getElementById('recciesPopupStatus');
    if (!button || !status) return;
    let activeTab = null;
    button.disabled = true;
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        activeTab = tab; button.disabled = !Number.isInteger(tab?.windowId);
    }).catch(() => { status.textContent = 'Could not find the active window. Use Open full page.'; });
    button.addEventListener('click', async () => {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'openReccies', tabId: activeTab?.id, windowId: activeTab?.windowId });
            if (response?.status !== 'success') throw new Error(response?.message || 'Could not open the sidebar.');
            window.close();
        } catch (error) { status.textContent = error.message; }
    });
    document.getElementById('recciesPageButton')?.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('reccies.html') });
    });
    chrome.storage.local.get(['reccieTracker','recciePreferences']).then(data => {
        const tracker = data.reccieTracker, prefs = data.recciePreferences || {};
        if (!tracker) { status.textContent = 'Connect your tracker to see your assignments.'; return; }
        if (!prefs.person) { status.textContent = `${tracker.rows.length} rows loaded · Choose your name in Reccies.`; return; }
        const role = prefs.assignment || 'ops';
        const mine = tracker.rows.filter(row => (role === 'any' ? ['ops','buyer','group'] : [role]).some(key => row[key]?.toLowerCase() === prefs.person.toLowerCase()));
        const outstanding = mine.filter(row => row.reccied.toLowerCase() !== 'yes').length;
        status.textContent = `${prefs.person} · ${tracker.month} · ${outstanding} not marked Yes / ${mine.length} assigned. Read only.`;
    }).catch(() => { status.textContent = 'Open Reccies to load your tracker.'; });
});

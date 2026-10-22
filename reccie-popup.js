document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('recciesButton');
    const status = document.getElementById('recciesPopupStatus');
    if (!button || !status) return;
    let activeTab = null, panelReady = false, preparation = null;
    let summary = status.textContent, launchMessage = '';
    const render = () => {
        button.disabled = !Number.isInteger(activeTab?.windowId) || (!panelReady && !!preparation);
        status.textContent = launchMessage || (panelReady ? summary : 'Preparing Reccies…');
        button.setAttribute('aria-busy', String(!panelReady && !!preparation));
    };
    const prepare = (recovering = false) => {
        if (preparation || !Number.isInteger(activeTab?.windowId)) return preparation;
        if (!panelReady) launchMessage = 'Preparing Reccies…';
        preparation = Promise.resolve().then(() => chrome.runtime.sendMessage({
            action: 'prepareReccies', tabId: activeTab.id, windowId: activeTab.windowId
        })).then(response => {
            if (response?.status !== 'success') throw new Error(response?.message || 'Could not prepare Reccies.');
            panelReady = true;
            launchMessage = recovering ? 'Reccies is ready. Click Open Reccies sidebar to open it.' : '';
        }).catch(error => {
            panelReady = false;
            launchMessage = error.message;
        }).finally(() => { preparation = null; render(); });
        render();
        return preparation;
    };
    button.disabled = true;
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
        activeTab = tab;
        if (Number.isInteger(tab?.windowId)) prepare();
        else { launchMessage = 'Could not find the active window. Use Open full page.'; render(); }
    }).catch(() => { status.textContent = 'Could not find the active window. Use Open full page.'; });
    button.addEventListener('pointerenter', () => prepare());
    button.addEventListener('focus', () => prepare());
    button.addEventListener('click', async () => {
        if (!panelReady) { prepare(); return; }
        try {
            const response = await chrome.runtime.sendMessage({ action: 'openReccies', tabId: activeTab?.id, windowId: activeTab?.windowId });
            if (response?.code === 'FEATURES_STARTING') {
                panelReady = false;
                prepare(true);
                return;
            }
            if (response?.status !== 'success') throw new Error(response?.message || 'Could not open the sidebar.');
            window.close();
        } catch (error) { launchMessage = error.message; render(); }
    });
    document.getElementById('recciesPageButton')?.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('reccies.html') });
    });
    const loadTrackerSummary = () => chrome.storage.local.get(['reccieTracker','recciePreferences']).then(data => {
        const tracker = data.reccieTracker, prefs = data.recciePreferences || {};
        if (!tracker) { summary = 'Connect your tracker to see your assignments.'; render(); return; }
        if (!prefs.person) { summary = `${tracker.rows.length} rows loaded · Choose your name in Reccies.`; render(); return; }
        const role = prefs.assignment || 'ops';
        const mine = tracker.rows.filter(row => (role === 'any' ? ['ops','buyer','group'] : [role]).some(key => row[key]?.toLowerCase() === prefs.person.toLowerCase()));
        const outstanding = mine.filter(row => row.reccied.toLowerCase() !== 'yes').length;
        summary = `${prefs.person} · ${tracker.month} · ${outstanding} not marked Yes / ${mine.length} assigned. Read only.`;
        render();
    }).catch(() => { summary = 'Open Reccies to load your tracker.'; render(); });
    // The tracker can include rows, check results and timing reports. Give the
    // popup a rendering opportunity before transferring and scanning that data.
    if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => window.setTimeout(loadTrackerSummary, 0));
    } else {
        window.setTimeout(loadTrackerSummary, 0);
    }
});

let queue = Promise.resolve();

export function clearTimesheetActivity(days) {
    const work = async () => {
        if (!Array.isArray(days) || days.length !== 7 || days.some(day => !/^\d{4}-\d{2}-\d{2}$/.test(day))) throw new Error('Invalid week');
        const stored = await chrome.storage.local.get({ timesheetActivity: {} });
        for (const day of days) delete stored.timesheetActivity[day];
        await chrome.storage.local.set({ timesheetActivity: stored.timesheetActivity });
    };
    queue = queue.catch(() => {}).then(work);
    return queue;
}

export function recordTimesheetActivity(request, sender) {
    const work = async () => {
        let url;
        try { url = new URL(sender?.url); } catch { return; }
        if (!url.hostname.endsWith('.mediaocean.com') || !url.pathname.includes('/campaign-management/') || !Number.isInteger(sender?.tab?.id) || sender.frameId !== 0) return;
        const campaign = request.campaign || {};
        const id = new URLSearchParams(url.hash.slice(1)).get('campaign-id');
        if (!id || id !== campaign.id || !/^[A-Za-z0-9_-]{1,30}$/.test(id) || !/^[A-Za-z0-9]{1,20}$/.test(campaign.client || '') || !/^[A-Za-z0-9]{1,20}$/.test(campaign.product || '')) return;
        const now = new Date();
        const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        const seconds = Number(request.seconds);
        if (request.day !== today || !Number.isFinite(seconds) || seconds <= 0 || seconds > 15) return;
        const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (!tabs.some(tab => tab.id === sender.tab.id)) return;
        const stored = await chrome.storage.local.get({ timesheetTrackingEnabled: false, timesheetActivity: {} });
        if (!stored.timesheetTrackingEnabled) return;
        const activity = stored.timesheetActivity || {};
        const key = `${campaign.client.toUpperCase()} / ${campaign.product.toUpperCase()}`;
        activity[today] ||= {};
        activity[today][key] = (activity[today][key] || 0) + seconds;
        await chrome.storage.local.set({ timesheetActivity: activity });
    };
    queue = queue.catch(() => {}).then(work);
    return queue;
}

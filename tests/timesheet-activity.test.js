require('./mocks/chrome');
const { recordTimesheetActivity, clearTimesheetActivity } = require('../background/timesheet-activity');

test('records only enabled activity from the active Prisma tab and clears it serially', async () => {
    const now = new Date(); const day = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0,10);
    const url = 'https://go.mediaocean.com/campaign-management/#campaign-id=CP3BP6L';
    const sender = { url, frameId: 0, tab: { id: 12 } };
    const request = { day, seconds: 15, campaign: { id: 'CP3BP6L', client: 'N88', product: '1' } };
    await chrome.storage.local.set({ timesheetTrackingEnabled: true }); chrome.tabs.query.mockResolvedValue([{id:12}]);
    await recordTimesheetActivity(request, sender);
    expect((await chrome.storage.local.get('timesheetActivity')).timesheetActivity[day]['N88 / 1']).toBe(15);
    chrome.tabs.query.mockResolvedValue([{id:99}]); await recordTimesheetActivity(request, sender);
    expect((await chrome.storage.local.get('timesheetActivity')).timesheetActivity[day]['N88 / 1']).toBe(15);
    await clearTimesheetActivity(Array(7).fill(day));
    expect((await chrome.storage.local.get('timesheetActivity')).timesheetActivity[day]).toBeUndefined();
});

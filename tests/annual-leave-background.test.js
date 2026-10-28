const { reconcileAnnualLeave, saveAnnualLeave, openAnnualLeave, isWorkdaySender, WORKDAY_SCRIPT, WORKDAY_ORIGIN } = require('../background/annual-leave');
const sender = { tab: { id: 9 }, frameId: 0, url: 'https://wd3.myworkday.com/wpp/d/home.htmld' };
const message = { draft: { name: 'Harry Barnes', dates: ['2026-12-21', '2026-12-22'], submitted: true } };

describe('Workday optional integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        chrome.permissions = { contains: jest.fn().mockResolvedValue(true) };
        chrome.storage.local.get.mockImplementation(async keys => keys === 'annualLeaveDraft' ? {} : { annualLeaveEnabled: true });
        chrome.storage.sync.get.mockResolvedValue({ allFeaturesDisabled: false });
        chrome.storage.local.set.mockResolvedValue();
        chrome.scripting.getRegisteredContentScripts.mockResolvedValue([]);
        chrome.scripting.registerContentScripts.mockResolvedValue();
        chrome.scripting.unregisterContentScripts.mockResolvedValue();
        chrome.tabs.create.mockResolvedValue();
    });
    test('registers only the WPP Workday helper after explicit opt-in and host access', async () => {
        await reconcileAnnualLeave();
        expect(chrome.permissions.contains).toHaveBeenCalledWith({ origins: [WORKDAY_ORIGIN] });
        expect(chrome.scripting.registerContentScripts).toHaveBeenCalledWith([WORKDAY_SCRIPT]);
        expect(WORKDAY_SCRIPT.matches).toEqual(['https://wd3.myworkday.com/wpp/*']);
    });
    test.each(['permission', 'master', 'disabled'])('unregisters when %s is off', async mode => {
        chrome.scripting.getRegisteredContentScripts.mockResolvedValue([WORKDAY_SCRIPT]);
        if (mode === 'permission') chrome.permissions.contains.mockResolvedValue(false);
        if (mode === 'master') chrome.storage.sync.get.mockResolvedValue({ allFeaturesDisabled: true });
        if (mode === 'disabled') chrome.storage.local.get.mockResolvedValue({ annualLeaveEnabled: false });
        await reconcileAnnualLeave();
        expect(chrome.scripting.unregisterContentScripts).toHaveBeenCalledWith({ ids: [WORKDAY_SCRIPT.id] });
    });
    test('checks sender URL, tenant and top frame, never origin alone', () => {
        expect(isWorkdaySender(sender)).toBe(true);
        for (const change of [{ url: 'https://evil.example/wpp/' }, { url: 'https://wd3.myworkday.com/other/' }, { url: undefined, origin: 'https://wd3.myworkday.com' }, { frameId: 1 }]) {
            expect(isWorkdaySender({ ...sender, ...change })).toBe(false);
        }
    });
    test('stores only minimal date/name data and opens a review page without sending invites', async () => {
        await openAnnualLeave({ draft: { ...message.draft, comments: 'private HR comments' } }, sender);
        expect(chrome.storage.local.set).toHaveBeenCalledWith({ annualLeaveDraft: expect.objectContaining({ name: 'Harry Barnes', dates: message.draft.dates, submitted: true }) });
        expect(chrome.storage.local.set.mock.calls[0][0].annualLeaveDraft).not.toHaveProperty('comments');
        expect(chrome.tabs.create).toHaveBeenCalledWith({ url: chrome.runtime.getURL('annual-leave.html') });
    });
    test('refuses invalid dates and messages while disabled', async () => {
        await expect(openAnnualLeave({ draft: { ...message.draft, dates: ['2026-02-30'] } }, sender)).rejects.toThrow();
        chrome.storage.local.get.mockResolvedValue({ annualLeaveEnabled: false });
        await expect(openAnnualLeave(message, sender)).rejects.toThrow('Enable');
        expect(chrome.tabs.create).not.toHaveBeenCalled();
    });
    test('persists a submission snapshot without opening a tab or claiming submission success', async () => {
        await saveAnnualLeave({ draft: { ...message.draft, submitted: false, submissionPending: true } }, sender);
        expect(chrome.storage.local.set).toHaveBeenCalledWith({ annualLeaveDraft: expect.objectContaining({ submitted: false, submissionPending: true }) });
        expect(chrome.tabs.create).not.toHaveBeenCalled();
    });
    test('preserves the requirement to choose a half-day period', async () => {
        await saveAnnualLeave({ draft: { ...message.draft, needsDayPart: true } }, sender);
        expect(chrome.storage.local.set).toHaveBeenCalledWith({ annualLeaveDraft: expect.objectContaining({ needsDayPart: true }) });
    });
});

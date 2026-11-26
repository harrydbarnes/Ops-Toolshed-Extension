jest.mock('../background/diagnostics-manager', () => ({
    enableDiagnostics: jest.fn().mockResolvedValue({ enabled: true }),
    disableDiagnostics: jest.fn().mockResolvedValue({ enabled: false }),
    getDiagnosticReport: jest.fn().mockResolvedValue({ events: [] }),
    clearDiagnosticEvents: jest.fn().mockResolvedValue({ status: 'success' }),
    recordDiagnosticEvent: jest.fn().mockResolvedValue({ status: 'success' })
}));
const diagnostics = require('../background/diagnostics-manager');
const { messageHandlers } = require('../background/message-handlers');

describe('diagnostic administration caller policy', () => {
    const actions = ['SET_DIAGNOSTICS_MODE', 'GET_DIAGNOSTIC_REPORT', 'CLEAR_DIAGNOSTIC_EVENTS'];
    beforeEach(() => {
        resetMocks();
        jest.clearAllMocks();
        chrome.runtime.id = 'test-extension';
        chrome.runtime.getURL.mockImplementation(path => `chrome-extension://test-extension/${path}`);
    });

    test.each(actions)('%s rejects content scripts and other pages before touching diagnostics', async action => {
        for (const sender of [
            {},
            { id: 'test-extension', url: 'https://go.mediaocean.com/campaign-management/', tab: { id: 42 } },
            { id: 'foreign-extension', url: chrome.runtime.getURL('settings.html') },
            { id: 'test-extension', url: chrome.runtime.getURL('popup.html') },
            { id: 'test-extension', url: chrome.runtime.getURL('settings.html/extra') }
        ]) {
            const reply = jest.fn();
            await messageHandlers[action]({ enabled: true, url: chrome.runtime.getURL('settings.html') }, sender, reply);
            expect(reply).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
        }
        for (const operation of Object.values(diagnostics)) expect(operation).not.toHaveBeenCalled();
    });

    test.each(actions)('%s accepts the Settings page with feature navigation parameters', async action => {
        const reply = jest.fn();
        await messageHandlers[action]({ enabled: true }, {
            id: 'test-extension', url: `${chrome.runtime.getURL('settings.html')}?feature=diagnostics#advanced`
        }, reply);
        expect(reply).toHaveBeenCalledWith(expect.objectContaining({ status: 'success' }));
    });

    test('content scripts retain the separate event-recording capability', async () => {
        const event = { source: 'test', operation: 'run' }, reply = jest.fn();
        await messageHandlers.RECORD_DIAGNOSTIC_EVENT({ event }, {
            id: 'test-extension', url: 'https://go.mediaocean.com/campaign-management/', tab: { id: 42 }
        }, reply);
        expect(diagnostics.recordDiagnosticEvent).toHaveBeenCalledWith(event);
    });

    test.each(['createTimesheetAlarm', 'removeTimesheetAlarm'])('%s restricts alarm administration to Settings', async action => {
        const context = { createTimesheetAlarm: jest.fn().mockResolvedValue(undefined) };
        const request = { day: 'Friday', time: '14:30' };
        chrome.alarms.clear.mockClear();
        for (const sender of [
            {},
            { id: chrome.runtime.id, url: 'https://go.mediaocean.com/campaign-management/', tab: { id: 42 } },
            { id: 'other-extension', url: chrome.runtime.getURL('settings.html') },
            { id: chrome.runtime.id, url: chrome.runtime.getURL('popup.html') }
        ]) {
            const reply = jest.fn();
            await messageHandlers[action](request, sender, reply, context);
            expect(reply).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
        }
        expect(context.createTimesheetAlarm).not.toHaveBeenCalled();
        expect(chrome.alarms.clear).not.toHaveBeenCalled();
        const reply = jest.fn();
        await messageHandlers[action](request, {
            id: chrome.runtime.id, url: `${chrome.runtime.getURL('settings.html')}?feature=timesheets#features`
        }, reply, context);
        expect(reply).toHaveBeenCalledWith({ status: action === 'createTimesheetAlarm' ? 'Alarm created' : 'Alarm removed' });
        if (action === 'createTimesheetAlarm') expect(context.createTimesheetAlarm).toHaveBeenCalledWith('Friday', '14:30');
        else expect(chrome.alarms.clear).toHaveBeenCalledWith('timesheetReminder');
    });
});

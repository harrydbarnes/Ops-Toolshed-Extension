function createStorageArea(store) {
    return {
        get: jest.fn(async defaults => ({ ...(defaults || {}), ...store })),
        set: jest.fn(async values => Object.assign(store, values)),
        remove: jest.fn(async keys => {
            (Array.isArray(keys) ? keys : [keys]).forEach(key => delete store[key]);
        })
    };
}

describe('Diagnostics manager', () => {
    let syncStore;
    let localStore;
    let sessionStore;
    let diagnostics;

    beforeEach(() => {
        jest.resetModules();
        syncStore = {};
        localStore = {};
        sessionStore = {};
        global.chrome = {
            storage: {
                sync: createStorageArea(syncStore),
                local: createStorageArea(localStore),
                session: createStorageArea(sessionStore)
            }
        };
        diagnostics = require('../background/diagnostics-manager');
    });

    afterEach(() => {
        delete global.chrome;
    });

    test('enables diagnostics for the current browser session and 24 hours', async () => {
        const now = Date.parse('2026-09-10T10:00:00Z');

        const state = await diagnostics.enableDiagnostics(now);

        expect(state).toEqual({ enabled: true, expiresAt: now + diagnostics.DIAGNOSTICS_DURATION_MS });
        expect(syncStore.diagnosticsModeEnabled).toBe(true);
        expect(sessionStore.diagnosticsModeSessionActive).toBe(true);
        expect(localStore.diagnosticEvents).toEqual([]);
    });

    test('expires when the browser session marker is absent even inside 24 hours', async () => {
        const now = Date.parse('2026-09-10T10:00:00Z');
        syncStore.diagnosticsModeEnabled = true;
        localStore.diagnosticsModeExpiresAt = now + 10000;

        await expect(diagnostics.expireDiagnosticsIfNeeded(now)).resolves.toEqual({
            enabled: false,
            expiresAt: 0
        });
        expect(syncStore.diagnosticsModeEnabled).toBe(false);
    });

    test('expires after 24 hours even while the browser session remains active', async () => {
        const now = Date.parse('2026-09-10T10:00:00Z');
        syncStore.diagnosticsModeEnabled = true;
        localStore.diagnosticsModeExpiresAt = now;
        sessionStore.diagnosticsModeSessionActive = true;

        await expect(diagnostics.expireDiagnosticsIfNeeded(now)).resolves.toEqual({
            enabled: false,
            expiresAt: 0
        });
        expect(syncStore.diagnosticsModeEnabled).toBe(false);
        expect(sessionStore.diagnosticsModeSessionActive).toBeUndefined();
    });

    test('stores only allow-listed, non-identifying diagnostic fields', async () => {
        const now = Date.parse('2026-09-10T10:00:00Z');
        await diagnostics.enableDiagnostics(now);

        await diagnostics.recordDiagnosticEvent({
            source: 'Approval Tracking',
            operation: 'Scheduled Check',
            outcome: 'Success',
            area: 'actualise',
            durationMs: 123.6,
            details: {
                checkedCount: 3,
                approvedTransitions: 1,
                campaignName: 'Must not be retained',
                campaignId: '12345',
                url: 'https://example.test/private'
            }
        }, now + 1000);

        expect(localStore.diagnosticEvents).toEqual([{
            timestamp: '2026-09-10T10:00:01.000Z',
            source: 'approval-tracking',
            operation: 'scheduled-check',
            outcome: 'success',
            area: 'actualise',
            durationMs: 124,
            details: { checkedCount: 3, approvedTransitions: 1 }
        }]);
    });

    test('keeps a bounded rolling event log', async () => {
        const now = Date.parse('2026-09-10T10:00:00Z');
        await diagnostics.enableDiagnostics(now);
        localStore.diagnosticEvents = Array.from({ length: diagnostics.MAX_EVENTS }, (_, index) => ({
            timestamp: new Date(now - index).toISOString(),
            source: 'test',
            operation: 'existing',
            outcome: 'success',
            area: 'other'
        }));

        await diagnostics.recordDiagnosticEvent({ source: 'test', operation: 'latest' }, now + 1);

        expect(localStore.diagnosticEvents).toHaveLength(diagnostics.MAX_EVENTS);
        expect(localStore.diagnosticEvents.at(-1).operation).toBe('latest');
    });

    test('caches the disabled state so normal feature use adds no repeated storage work', async () => {
        await diagnostics.recordDiagnosticEvent({ source: 'test', operation: 'first' });
        await diagnostics.recordDiagnosticEvent({ source: 'test', operation: 'second' });

        expect(chrome.storage.sync.get).toHaveBeenCalledTimes(1);
        expect(chrome.storage.session.get).toHaveBeenCalledTimes(1);
        expect(chrome.storage.local.get).toHaveBeenCalledTimes(1);
        expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });
});

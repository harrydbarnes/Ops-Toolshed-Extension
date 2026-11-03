const diagnostics = require('../diagnostics');
const { handleTrackStat, handleResetStats } = require('../background/stats-manager');
describe('local performance diagnostics', () => {
    const sample = () => ({ timestamp: Date.now(), signal: 'page_indicator', area: 'buy', duration: 12000, outcome: 'completed' });
    beforeEach(() => global.resetMocks());
    test('strictly rejects sensitive, unknown and invalid fields', () => {
        for (const patch of [{ url: 'secret' }, { duration: Infinity }, { duration: -1 }, { duration: 300001 }, { area: 'client' }, { outcome: 'success' }, { timestamp: NaN }, { signal: 'pending' }]) expect(diagnostics.sanitize({ ...sample(), ...patch })).toBeNull();
        const event = sample(); expect(diagnostics.sanitize(event)).toEqual(event);
    });
    test.each(['session', 'startup', 'navigation', 'unclassified', 'other'])('retains only the category for %s diagnostics', area => {
        const event = { ...sample(), area };
        expect(diagnostics.sanitize(event)).toEqual(event);
        expect(diagnostics.sanitize({ ...event, url: 'https://example.com/private' })).toBeNull();
    });
    test('bounds recent samples, expires days and estimates histogram percentiles', () => {
        const now = Date.now();
        let store = { days: { '2000-01-01': {} }, recent: [] };
        for (let i = 0; i < 1100; i++) store = diagnostics.append(store, { ...sample(), timestamp: now - i }, now);
        expect(store.recent).toHaveLength(1000);
        expect(store.days['2000-01-01']).toBeUndefined();
        expect(diagnostics.summarize(Object.values(store.days)[0])).toMatchObject({ count: 1100, slow: 1100, median: 20000, p95: 20000 });
    });
    test('completed percentiles exclude interrupted, failed and timed-out observations', () => {
        const now = Date.now(); let store;
        for (let i = 0; i < 9; i++) store = diagnostics.append(store, { ...sample(), timestamp: now - i, duration: 95, outcome: 'interrupted' }, now);
        store = diagnostics.append(store, { ...sample(), timestamp: now - 20, duration: 20000 }, now);
        store = diagnostics.append(store, { ...sample(), timestamp: now - 21, duration: 300000, outcome: 'timed_out' }, now);
        store = diagnostics.append(store, { ...sample(), timestamp: now - 22, duration: 120000, outcome: 'error' }, now);
        expect(diagnostics.summarize(Object.values(store.days)[0])).toMatchObject({ count: 12, timedCompleted: 1, slow: 1, timeouts: 1, median: 20000, p95: 20000 });
    });
    test('legacy mixed history keeps counts but cannot contaminate new completed timings', () => {
        const now = Date.now(), day = new Date(now).toISOString().slice(0, 10), histogram = diagnostics.bounds.map(() => 0);
        histogram[0] = 9; histogram[6] = 1;
        let store = { days: { [day]: { 'page_indicator:buy': { count: 10, slow: 1, histogram, outcomes: { interrupted: 9, completed: 1 } } } }, recent: [] };
        expect(diagnostics.summarize(store.days[day])).toMatchObject({ count: 10, timedCompleted: 0, median: null, p95: null });
        store = diagnostics.append(store, { ...sample(), timestamp: now, duration: 1200 }, now);
        expect(diagnostics.summarize(store.days[day])).toMatchObject({ count: 11, timedCompleted: 1, slow: 0, median: 2000, p95: 2000 });
        expect(store.days[day]['page_indicator:buy'].outcomes).toEqual({ interrupted: 9, completed: 2 });
        const completedOnly = { count: 1, slow: 1, histogram: diagnostics.bounds.map((_, i) => i === 6 ? 1 : 0), outcomes: { completed: 1 } };
        expect(diagnostics.summarize({ 'page_indicator:buy': completedOnly })).toMatchObject({ timedCompleted: 1, median: 20000 });
    });
    test('deduplicates delivery, rejects pre-reset samples and recovers from storage errors', async () => {
        const event = sample(), reply = jest.fn();
        await handleTrackStat({ type: 'PERFORMANCE_SAMPLE', value: event }, {}, reply);
        await handleTrackStat({ type: 'PERFORMANCE_SAMPLE', value: event }, {}, reply);
        expect(chrome.storage.local.__getStore().prismaDiagnostics.recent).toHaveLength(1);
        await chrome.storage.local.set({ prismaDiagnostics: { days: {}, recent: [] }, diagnosticsResetAt: event.timestamp });
        await handleTrackStat({ type: 'PERFORMANCE_SAMPLE', value: event }, {}, reply);
        expect(chrome.storage.local.__getStore().prismaDiagnostics.recent).toHaveLength(0);
        await chrome.storage.local.set({ diagnosticsResetAt: 0 });
        const error = jest.spyOn(console, 'error').mockImplementation(() => {});
        chrome.storage.local.set.mockRejectedValueOnce(new Error('quota'));
        await handleTrackStat({ type: 'PERFORMANCE_SAMPLE', value: event }, {}, reply);
        expect(reply).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'error' }));
        await handleTrackStat({ type: 'PERFORMANCE_SAMPLE', value: event }, {}, reply);
        expect(chrome.storage.local.__getStore().prismaDiagnostics.recent).toHaveLength(1);
        error.mockRestore();
    });
    test('queues reset after in-flight writes and rejects content-page resets', async () => {
        chrome.runtime.getURL.mockImplementation(file => 'chrome-extension://test/' + file);
        const event = sample(), reply = jest.fn();
        const saving = handleTrackStat({ type: 'PERFORMANCE_SAMPLE', value: event }, {}, reply);
        const resetting = handleResetStats({}, { url: chrome.runtime.getURL('toolshed.html') }, reply);
        await Promise.all([saving, resetting]);
        expect(chrome.storage.local.__getStore().prismaDiagnostics).toEqual({ days: {}, recent: [] });
        expect(chrome.storage.local.__getStore().dailyStats).toEqual({});
        await handleTrackStat({ type: 'PERFORMANCE_SAMPLE', value: event }, {}, reply);
        expect(chrome.storage.local.__getStore().prismaDiagnostics.recent).toHaveLength(0);
        await handleResetStats({}, { url: 'https://go.mediaocean.com/' }, reply);
        expect(reply).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'error' }));
    });
    test('serializes concurrent writes, rejects unknown types and honors disabling', async () => {
        const reply = jest.fn();
        await Promise.all(Array.from({ length: 3 }, (_, i) => handleTrackStat({ type: 'PERFORMANCE_SAMPLE', value: { ...sample(), timestamp: Date.now() - i * 1000 } }, {}, reply)));
        expect(chrome.storage.local.__getStore().prismaDiagnostics.recent).toHaveLength(3);
        await chrome.storage.sync.set({ statsCollectorEnabled: false });
        await handleTrackStat({ type: 'PERFORMANCE_SAMPLE', value: sample() }, {}, reply);
        expect(chrome.storage.local.__getStore().prismaDiagnostics.recent).toHaveLength(3);
        await handleTrackStat({ type: 'UNKNOWN' }, {}, reply);
        expect(reply).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'error' }));
    });
});

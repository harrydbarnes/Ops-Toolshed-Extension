(function(root) {
    'use strict';
    const areas = ['home', 'plan', 'buy', 'actualise', 'traffic', 'analyse', 'orders', 'session', 'startup', 'navigation', 'unclassified', 'other'];
    const signals = ['page_indicator', 'side_panel_indicator', 'placement_save', 'manual_slowness', 'manual_incomplete', 'manual_pending'];
    const outcomes = ['completed', 'error', 'timed_out', 'interrupted', 'reported'];
    const bounds = [250, 500, 1000, 2000, 5000, 10000, 20000, 30000, 60000, 120000, 300000];
    function completedTimings(group) {
        if (Array.isArray(group.completedHistogram)) return { histogram: group.completedHistogram, slow: group.completedSlow || 0 };
        // Old mixed histograms cannot be separated reliably from the capped recent ring.
        if (group.count === group.outcomes?.completed) return { histogram: group.histogram, slow: group.slow || 0 };
        return { histogram: bounds.map(() => 0), slow: 0 };
    }
    function sanitize(value, now = Date.now()) {
        if (!value || Object.keys(value).sort().join(',') !== 'area,duration,outcome,signal,timestamp') return null;
        if (!areas.includes(value.area) || !signals.includes(value.signal) || !outcomes.includes(value.outcome)) return null;
        if (!Number.isFinite(value.duration) || value.duration < 0 || value.duration > 300000 || !Number.isFinite(value.timestamp) || value.timestamp > now + 60000 || value.timestamp < now - 366 * 86400000) return null;
        const manual = value.signal.startsWith('manual_');
        if (manual !== (value.outcome === 'reported') || (manual && value.duration !== 0)) return null;
        return { timestamp: Math.round(value.timestamp), signal: value.signal, area: value.area, duration: Math.round(value.duration), outcome: value.outcome };
    }
    function append(store, event, now = Date.now()) {
        if (store?.recent?.some(item => ['timestamp', 'signal', 'area', 'duration', 'outcome'].every(key => item[key] === event[key]))) return store;
        const cutoff = new Date(now - 365 * 86400000).toISOString().slice(0, 10);
        const days = Object.fromEntries(Object.entries(store?.days || {}).filter(([key]) => key >= cutoff));
        const day = new Date(event.timestamp).toISOString().slice(0, 10);
        if (day < cutoff) return { days, recent: (store?.recent || []).filter(item => item.timestamp >= now - 365 * 86400000).slice(-1000) };
        const groups = days[day] = { ...(days[day] || {}) };
        const key = `${event.signal}:${event.area}`;
        const previous = groups[key];
        const completed = previous ? completedTimings(previous) : { histogram: bounds.map(() => 0), slow: 0 };
        const group = groups[key] = previous
            ? { histogram: [...previous.histogram], count: previous.count, slow: previous.slow, outcomes: { ...previous.outcomes } }
            : { histogram: bounds.map(() => 0), count: 0, slow: 0, outcomes: {} };
        group.completedHistogram = [...completed.histogram];
        group.completedSlow = completed.slow;
        group.count++;
        group.outcomes[event.outcome] = (group.outcomes[event.outcome] || 0) + 1;
        if (!event.signal.startsWith('manual_')) {
            group.histogram[bounds.findIndex(bound => event.duration <= bound)]++;
            if (event.duration >= 10000) group.slow++;
            if (event.outcome === 'completed') {
                group.completedHistogram[bounds.findIndex(bound => event.duration <= bound)]++;
                if (event.duration >= 10000) group.completedSlow++;
            }
        }
        return { days, recent: [...(store?.recent || []).filter(item => item.timestamp >= now - 365 * 86400000), event].slice(-1000) };
    }
    function summarize(groups) {
        const histogram = bounds.map(() => 0);
        let count = 0, slow = 0, timeouts = 0, reports = 0;
        Object.entries(groups || {}).forEach(([key, group]) => {
            count += group.count;
            timeouts += group.outcomes.timed_out || 0;
            if (key.startsWith('manual_')) reports += group.count;
            else {
                const completed = completedTimings(group);
                slow += completed.slow;
                completed.histogram.forEach((value, index) => { histogram[index] += value; });
            }
        });
        const total = histogram.reduce((sum, value) => sum + value, 0);
        const percentile = fraction => {
            if (!total) return null;
            let cumulative = 0;
            return bounds[histogram.findIndex(value => { cumulative += value; return cumulative >= Math.ceil(total * fraction); })];
        };
        return { count, slow, timeouts, reports, timedCompleted: total, median: percentile(.5), p95: percentile(.95) };
    }
    const api = { areas, signals, outcomes, bounds, sanitize, append, summarize };
    if (typeof module !== 'undefined') module.exports = api;
    else root.prismaDiagnostics = api;
})(typeof window === 'undefined' ? globalThis : window);

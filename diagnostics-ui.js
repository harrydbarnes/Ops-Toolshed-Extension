(function() {
    'use strict';
    let exportData;
    window.renderPrismaDiagnostics = function(store, includes, range) {
        const api = window.prismaDiagnostics;
        const signal = document.querySelector('[data-diagnostics-signal][aria-pressed="true"]').dataset.diagnosticsSignal;
        // Reconstruct every exported aggregate from allowlisted numeric fields.
        const days = {};
        for (const [day, groups] of Object.entries(store?.days || {})) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !includes(day)) continue;
            for (const kind of api.signals) for (const area of api.areas) {
                const key = `${kind}:${area}`, group = groups[key];
                if (!group) continue;
                const number = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
                (days[day] ||= {})[key] = { count: number(group.count), slow: number(group.slow), histogram: api.bounds.map((_, i) => number(group.histogram?.[i])), outcomes: Object.fromEntries(api.outcomes.map(outcome => [outcome, number(group.outcomes?.[outcome])])) };
                if (Array.isArray(group.completedHistogram)) {
                    days[day][key].completedHistogram = api.bounds.map((_, i) => number(group.completedHistogram[i]));
                    days[day][key].completedSlow = number(group.completedSlow);
                }
            }
        }
        const rows = Object.entries(days).sort().map(([day, groups]) => ({ day, ...api.summarize(Object.fromEntries(Object.entries(groups).filter(([key]) => key.startsWith(`${signal}:`)))) })).filter(row => row.count);
        const total = rows.reduce((sum, row) => ({ count: sum.count + row.count, timedCompleted: sum.timedCompleted + row.timedCompleted, slow: sum.slow + row.slow, timeouts: sum.timeouts + row.timeouts }), { count: 0, timedCompleted: 0, slow: 0, timeouts: 0 });
        const reports = Object.values(days).reduce((sum, groups) => sum + api.summarize(Object.fromEntries(Object.entries(groups).filter(([key]) => key.startsWith('manual_')))).reports, 0);
        document.getElementById('diagnostics-summary').textContent = `${total.count} timed samples · ${total.timedCompleted} completed timings · ${total.slow} slow completions · ${total.timeouts} timed out · ${reports} manual reports` + (total.timedCompleted ? '' : ' · No completed timing data for these dates and signal.');
        const timedRows = rows.filter(row => row.timedCompleted > 0);
        const svg = document.getElementById('diagnostics-chart'); svg.replaceChildren();
        const max = Math.max(1000, ...timedRows.map(row => row.p95));
        const x = row => 30 + (new Date(row.day) - new Date(rows[0].day)) / Math.max(86400000, new Date(rows.at(-1).day) - new Date(rows[0].day)) * 740;
        const element = (name, attributes) => { const node = document.createElementNS(svg.namespaceURI, name); Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value)); svg.append(node); return node; };
        for (const [metric, color] of [['median', '#2563eb'], ['p95', '#ea580c']]) {
            element('polyline', { points: timedRows.map(row => `${x(row)},${170 - row[metric] / max * 145}`).join(' '), stroke: color, fill: 'none', 'stroke-width': 3 });
            timedRows.forEach(row => element('circle', { cx: x(row), cy: 170 - row[metric] / max * 145, r: 3, fill: color }));
        }
        element('text', { x: 5, y: 195 }).textContent = timedRows.length ? `${rows[0].day} — ${rows.at(-1).day} · scale 0–${max / 1000}s` : 'No completed timing samples';
        const table = document.createElement('table');
        const head = table.insertRow();
        ['UTC day', 'Median estimate (s)', 'p95 estimate (s)', 'Samples', 'Completed timings', 'Slow completions', 'Timeouts', 'Completed', 'Error', 'Interrupted'].forEach(text => { const th = document.createElement('th'); th.textContent = text; head.append(th); });
        rows.forEach(row => {
            const outcomes = name => Object.entries(days[row.day]).filter(([key]) => key.startsWith(`${signal}:`)).reduce((sum, [, group]) => sum + group.outcomes[name], 0);
            const tr = table.insertRow(); [row.day, row.median === null ? '—' : row.median / 1000, row.p95 === null ? '—' : row.p95 / 1000, row.count, row.timedCompleted, row.slow, row.timeouts, outcomes('completed'), outcomes('error'), outcomes('interrupted')].forEach(value => { tr.insertCell().textContent = value; });
        });
        document.getElementById('diagnostics-table').replaceChildren(table);
        exportData = { schemaVersion: 2, timingBasis: 'completed', version: chrome.runtime.getManifest().version, build: { buildDate: window.buildInfo?.buildDate || '', commitId: window.buildInfo?.commitId || '' }, range, histogramBoundsMs: api.bounds, days, recent: (store?.recent || []).map(value => api.sanitize(value)).filter(value => value && includes(new Date(value.timestamp).toISOString().slice(0, 10))) };
    };
    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('diagnostics-export')?.addEventListener('click', () => {
            if (!exportData) return;
            const url = URL.createObjectURL(new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' }));
            const link = document.createElement('a'); link.href = url; link.download = 'prisma-diagnostics.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
        document.getElementById('diagnostics-report-button')?.addEventListener('click', async () => {
            const status = document.getElementById('diagnostics-report-status');
            try {
                const response = await chrome.runtime.sendMessage({ action: 'TRACK_STAT', type: 'PERFORMANCE_SAMPLE', value: { timestamp: Date.now(), signal: document.getElementById('diagnostics-report').value, area: document.getElementById('diagnostics-area').value, duration: 0, outcome: 'reported' } });
                status.textContent = response?.ignored ? 'Stats Collector is disabled.' : response?.status === 'success' ? 'Observation recorded locally.' : 'Could not save observation.';
            } catch { status.textContent = 'Could not save observation.'; }
        });
    });
})();

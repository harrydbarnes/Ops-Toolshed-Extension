// Synthetic source benchmarks. APIs are mocked; no network or tracker writes.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { performance: clock } = require('node:perf_hooks');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const baselineRef = process.argv[2];
if (baselineRef && !/^[a-f0-9]{7,40}$/i.test(baselineRef)) throw Error('Expected a baseline Git commit hash');
const source = file => baselineRef
    ? execFileSync('git', ['show', `${baselineRef}:${file}`], { cwd: root, encoding: 'utf8' })
    : fs.readFileSync(path.join(root, file), 'utf8');
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];

async function header(rows) {
    const dom = new JSDOM('<nav><button class="toolshed-approval-banner-button">Approvals</button></nav>', {
        url: 'https://go.mediaocean.com/campaign-management/', runScripts: 'outside-only'
    });
    try {
        const win = dom.window;
        const tracker = { rows: Array.from({ length: rows }, () => ({ reccied: 'No', ops: 'Harry' })) };
        win.chrome = { runtime: { sendMessage: async () => ({ status: 'success' }) }, storage: {
            local: { get: async () => ({ reccieTracker: tracker, recciePreferences: { person: 'Harry', assignment: 'ops' } }) },
            onChanged: { addListener() {} }
        } };
        win.opsToolshedExtensionState = { isActive: () => true, subscribe: fn => fn(true) };
        win.setInterval = () => 1; win.clearInterval = () => {};
        win.eval(source('features/reccies-launcher.js'));
        await flush();
        const run = win.opsRecciesLauncher.reconcile;
        for (let i = 0; i < 50; i++) run();
        const samples = [];
        for (let sample = 0; sample < 5; sample++) {
            const start = clock.now(); for (let i = 0; i < 100; i++) run();
            samples.push((clock.now() - start) / 100);
        }
        if (win.document.getElementById('ops-reccies-launcher').textContent !== `Reccies · ${rows}`) throw Error('Header fixture failed');
        return { rows, medianCallbackMs: median(samples) };
    } finally { dom.window.close(); }
}

async function eligibility(count, selected = count) {
    const rows = Array.from({ length: count }, (_, i) => ({ sourceRow: i + 2, dNumber: `D${i}`, campaignId: `CP${i}`, month: '2026-09', ops: 'Harry', reccied: 'No' }));
    const checks = Object.fromEntries(rows.map(row => [row.sourceRow, { state: 'ready', reconciled: '1', buyStatus: 'SUCCESSFUL', checkedAt: new Date().toISOString() }]));
    const tracker = { revision: 'benchmark', source: { type: 'google' }, rows, checks };
    const state = { reccieAutomation: { autoMark: true }, recciePreferences: { person: 'Harry', assignment: 'ops' }, reccieTracker: tracker };
    const sandbox = {
        // Deliberately stop at preview: measure selection, never execute a write.
        manualTrackerWrite: async () => { throw Error('Benchmark preview stop'); },
        chrome: { storage: { local: { get: async () => state, set: async () => {} } } },
        reccieCore: { trackerKey: () => 'reccieTracker' }
    };
    // Execute the actual module body with its two imports supplied above.
    vm.runInNewContext(source('background/reccie-automation.js').replace(/^import .*;\r?\n/gm, '').replace(/\bexport /g, ''), sandbox);
    const samples = [];
    for (let i = 0; i < 5; i++) {
        const start = clock.now();
        const result = await sandbox.autoMarkVerified(tracker, { month: '2026-09', rowIds: rows.slice(0, selected).map(row => row.sourceRow) }, { assertActive() {}, queueWrite: fn => fn() });
        samples.push(clock.now() - start);
        if (result.lastAutoUpdate.eligible !== selected) throw Error('Eligibility fixture failed');
    }
    return { rows: count, selectedRows: selected, medianSelectionMs: median(samples) };
}

function bookingScan(count) {
    const row = (name, classes = '') => `<tr><td></td><td></td><td></td><td class="${classes}">${name}</td><td></td><td></td><td></td><td></td><td>0</td></tr>`;
    const dom = new JSDOM('<div class="ht_master"><table class="htCore"><tbody>' +
        row('Display', 'group-cell hierarchical-level-group-0') + row('FACEBOOK(Facebook Mediacom)', 'group-cell hierarchical-level-group-1') +
        Array.from({ length: count }, (_, i) => row(`Placement ${i}`)).join('') + '</tbody></table></div>', { runScripts: 'outside-only' });
    try {
        dom.window.eval(source('features/dst-assurance.js'));
        const run = dom.window.dstAssuranceFeature.hasFacebookBooking;
        for (let i = 0; i < 5; i++) run();
        const samples = [];
        for (let i = 0; i < 20; i++) { const start = clock.now(); if (!run()) throw Error('Booking fixture failed'); samples.push(clock.now() - start); }
        return { rows: count, medianScanMs: median(samples) };
    } finally { dom.window.close(); }
}

(async () => {
    const result = { source: baselineRef || 'working tree', environment: `Node ${process.version}, jsdom; synthetic data; not Chrome latency`, header: [], eligibility: [], bookingScan: [] };
    for (const rows of [1000, 20000]) result.header.push(await header(rows));
    for (const rows of [1000, 5000]) result.eligibility.push(await eligibility(rows));
    result.eligibility.push(await eligibility(5000, 100));
    for (const rows of [100, 1000]) result.bookingScan.push(bookingScan(rows));
    console.log(JSON.stringify(result, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });

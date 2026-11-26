/** @jest-environment ./tests/jsdom-environment.cjs */
const fs = require('fs');
const path = require('path');
const { readScript } = require('./helpers/read-script');
const api = require('../diagnostics');
describe('diagnostics Stats graph and private export', () => {
    beforeEach(() => {
        global.resetMocks();
        chrome.runtime.getManifest = () => ({ version: '1.9.0' });
        document.documentElement.innerHTML = fs.readFileSync(path.resolve(__dirname, '../toolshed.html'), 'utf8');
        window.prismaDiagnostics = api;
        window.eval(readScript(path.resolve(__dirname, '../diagnostics-ui.js')));
    });
    test('filters days, estimates trends, and strips sensitive stored fields from export', () => {
        const now = Date.now(); const day = new Date(now).toISOString().slice(0, 10);
        const event = { timestamp: now, signal: 'page_indicator', area: 'buy', duration: 12000, outcome: 'completed' };
        let store = api.append(null, event);
        store.days[day]['page_indicator:buy'].url = 'SECRET';
        store.days[day]['campaign:SECRET'] = { text: 'SECRET' };
        store.days['2000-01-01'] = store.days[day];
        store.recent.push({ ...event, campaign: 'SECRET' });
        window.renderPrismaDiagnostics(store, key => key === day, { start: day, end: day });
        expect(document.getElementById('diagnostics-summary').textContent).toContain('1 timed samples');
        expect(document.querySelectorAll('#diagnostics-chart circle')).toHaveLength(2);
        expect(document.getElementById('diagnostics-table').textContent).toContain('20');
        let blob;
        URL.createObjectURL = jest.fn(value => { blob = value; return 'blob:local'; });
        URL.revokeObjectURL = jest.fn();
        jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        document.dispatchEvent(new Event('DOMContentLoaded'));
        document.getElementById('diagnostics-export').click();
        expect(blob).toBeDefined();
        // Blob contents are inspected using FileReader because jsdom lacks Blob.text().
        return new Promise(resolve => { const reader = new FileReader(); reader.onload = () => {
            const exported = JSON.parse(reader.result);
            expect(JSON.stringify(exported)).not.toContain('SECRET');
            expect(Object.keys(exported.days)).toEqual([day]);
            expect(exported.recent).toEqual([event]);
            expect(exported).toMatchObject({ schemaVersion: 2, timingBasis: 'completed' });
            expect(exported.days[day]['page_indicator:buy'].completedHistogram.reduce((a, b) => a + b, 0)).toBe(1);
            resolve();
        }; reader.readAsText(blob); });
    });
    test('shows no-data state for excluded dates', () => {
        window.renderPrismaDiagnostics({ days: {}, recent: [] }, () => false, {});
        expect(document.getElementById('diagnostics-summary').textContent).toContain('No completed timing data');
        expect(document.querySelectorAll('#diagnostics-chart circle')).toHaveLength(0);
    });
    test('keeps interruption-only days in the outcome table without plotting false zero timings', () => {
        const now = Date.now(), day = new Date(now).toISOString().slice(0, 10);
        const store = api.append(null, { timestamp: now, signal: 'page_indicator', area: 'buy', duration: 100, outcome: 'interrupted' });
        window.renderPrismaDiagnostics(store, () => true, {});
        expect(document.getElementById('diagnostics-summary').textContent).toContain('0 completed timings');
        expect(document.querySelectorAll('#diagnostics-chart circle')).toHaveLength(0);
        expect(document.querySelector('#diagnostics-table tr:nth-child(2)').textContent).toContain(day + '——');
    });
});

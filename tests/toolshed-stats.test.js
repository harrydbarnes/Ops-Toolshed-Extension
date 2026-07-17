/**
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.resolve(__dirname, '../toolshed.html'), 'utf8');
const css = fs.readFileSync(path.resolve(__dirname, '../toolshed.css'), 'utf8');

describe('Toolshed Stats UI', () => {
    beforeEach(() => {
        window.history.replaceState({}, '', '/toolshed.html');
        document.documentElement.innerHTML = html.toString();
        global.resetMocks();
        jest.resetModules();
        // Reset window.confetti
        delete window.confetti;
    });

    test('should display stats from legacy and daily storage', async () => {
        // Setup storage
        const legacyStats = {
            visitedCampaigns: ['c1'],
            totalLoadingTime: 180,
            placementsAdded: 100
        };
        const dailyStats = {
            '2023-10-01': {
                placements: 10,
                loadingTime: 180,
                loadingByArea: {
                    home: 20,
                    plan: 15,
                    buy: 45,
                    actualise: 115,
                    analyse: 25,
                    other: 10
                },
                visitedCampaigns: ['c2']
            }
        };

        await chrome.storage.local.set({ legacyStats, dailyStats, appLearnPopupsBlocked: 7 });

        // Load script
        require('../toolshed.js');

        // Trigger DOMContentLoaded
        document.dispatchEvent(new Event('DOMContentLoaded'));

        // Wait for async storage get
        await new Promise(r => setTimeout(r, 100));

        // Check Totals
        // Campaigns: c1 + c2 = 2
        expect(document.getElementById('campaigns-visited-stat').textContent).toBe('2');
        // Loading Time: 180 + 180 = 360s -> 6 mins &<br> 0s
        expect(document.getElementById('loading-time-stat').textContent).toContain('6 mins');
        // Placements: 100 + 10 = 110
        expect(document.getElementById('placements-added-stat').textContent).toBe('110');
        expect(document.getElementById('applearn-popups-blocked-stat').textContent).toBe('7');

        // Existing daily stats should restore the missing collection start date.
        expect(document.querySelector('#stats h2 .since-date').textContent)
            .toMatch(/^\(since (?:1 October 2023|October 1, 2023)\)$/);

        // Check Kettle Index: 360 / 45 = 8
        expect(document.getElementById('kettle-index').textContent).toBe('8');

        const areaItems = document.querySelectorAll('#loading-area-breakdown .loading-area-item');
        expect(areaItems).toHaveLength(6);
        expect(document.querySelector('[data-loading-area="home"] .loading-area-time').textContent).toBe('20s');
        expect(document.querySelector('[data-loading-area="buy"] .loading-area-time').textContent).toBe('45s');
        expect(document.querySelector('[data-loading-area="actualise"] .loading-area-time').textContent).toBe('1m 55s');
        expect(document.querySelector('[data-loading-area="plan"]')).toBeNull();
        expect(document.querySelector('[data-loading-area="analyse"]')).toBeNull();
        expect(document.querySelector('[data-loading-area="other"] .loading-area-time').textContent).toBe('50s');
        expect(Array.from(document.querySelectorAll('[data-loading-area="other"] .loading-area-tooltip-row'))
            .map(row => Array.from(row.children).map(child => child.textContent)))
            .toEqual([['Plan', '15s'], ['Analyse', '25s'], ['Other areas', '10s']]);
        expect(document.getElementById('loading-area-context').textContent).toContain('3 mins 50s tracked');

        // Check Heatmap presence (at least one day should be generated)
        expect(document.getElementById('heatmap').children.length).toBeGreaterThan(300);
    });

    test('updates the area breakdown in real time when daily stats change', async () => {
        await chrome.storage.local.set({ dailyStats: {} });
        require('../toolshed.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await new Promise(r => setTimeout(r, 20));

        const changeListener = chrome.storage.onChanged.addListener.mock.calls
            .map(call => call[0])
            .find(listener => typeof listener === 'function');
        expect(changeListener).toBeDefined();

        const dailyStats = {
            '2026-07-17': {
                placements: 0,
                loadingTime: 6.4,
                loadingByArea: { actualise: 4.2, orders: 2.2 },
                visitedCampaigns: [],
                reconciliations: 0
            }
        };
        await chrome.storage.local.set({ dailyStats });
        changeListener({ dailyStats: { oldValue: {}, newValue: dailyStats } }, 'local');
        await new Promise(r => setTimeout(r, 20));

        expect(document.querySelector('[data-loading-area="actualise"] .loading-area-time').textContent)
            .toBe('4.2s');
        expect(document.querySelector('[data-loading-area="orders"] .loading-area-time').textContent)
            .toBe('2.2s');
    });

    test('shows the AppLearn count as a separate row immediately above Reset Stats', () => {
        const appLearnRow = document.getElementById('applearn-popups-blocked-stat').closest('.fun-stat');
        const resetButton = document.getElementById('reset-stats-button');

        expect(appLearnRow).not.toBeNull();
        expect(appLearnRow.classList.contains('applearn-stat-row')).toBe(true);
        expect(appLearnRow.nextElementSibling).toBe(resetButton);
        expect(document.querySelector('.stats-overview #applearn-popups-blocked-stat')).toBeNull();
    });

    test('places the compact loading-area strip between overview stats and heatmap', () => {
        const overview = document.querySelector('.stats-overview');
        const areaSection = document.querySelector('.loading-area-section');
        const heatmapSection = document.getElementById('heatmap').closest('.stats-section');

        expect(overview.nextElementSibling).toBe(areaSection);
        expect(areaSection.nextElementSibling).toBe(heatmapSection);
        expect(css).toMatch(/\.loading-area-grid\s*{[^}]*grid-template-columns:\s*repeat\(6,/s);
    });

    test('deep-links tabs and keeps the selected tab across navigation', async () => {
        window.history.replaceState({}, '', '/toolshed.html#stats');
        require('../toolshed.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await new Promise(r => setTimeout(r, 20));

        expect(document.querySelector('[data-tab="stats"]').classList).toContain('active');
        expect(document.getElementById('stats').classList).toContain('active');

        document.querySelector('[data-tab="roadmap"]').click();
        expect(window.location.hash).toBe('#roadmap');
        expect(document.getElementById('roadmap').classList).toContain('active');

        window.history.replaceState({}, '', '#release-notes');
        window.dispatchEvent(new PopStateEvent('popstate'));
        expect(document.getElementById('release-notes').classList).toContain('active');
    });

    test('lists the planned Timesheet Helper, Meta Spend Check and Recy Sheet features', () => {
        const roadmapItems = Array.from(document.querySelectorAll('#roadmap li'))
            .map(item => item.textContent.trim());

        expect(roadmapItems).toContain('Timesheet Helper');
        expect(roadmapItems).toContain('Meta Spend Check');
        expect(roadmapItems).toContain('Recy Sheet Campaign List');
    });

    test('keeps every tab at the same content width without scrollbar layout shifts', () => {
        expect(css).toMatch(/html\s*{[^}]*scrollbar-gutter:\s*stable;/s);
        expect(css).toMatch(/\.tab-content\s*{[^}]*width:\s*100%;[^}]*box-sizing:\s*border-box;/s);
    });

});

/**
 * @jest-environment ./tests/jsdom-environment.cjs
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
        expect(document.getElementById('heatmap').children.length).toBeGreaterThan(250);
        expect([...document.querySelectorAll('.heatmap-day')].every(cell => ![0, 6].includes(new Date(`${cell.dataset.date}T00:00:00`).getDay()))).toBe(true);
    });

    test('ranks campaigns safely and shows only available financial coverage', async () => {
        await chrome.storage.local.set({ campaignStatsSnapshots: [
            { key: 'a', clientName: '<img src=x>', supplier: 'Meta | META | Google', budget: 100, booked: 80 },
            { key: 'b', clientName: '<img src=x>', supplier: 'Google', budget: 300, booked: 0 },
            { key: 'c', clientName: 'Other', supplier: '', budget: null, booked: null }
        ] });
        require('../toolshed.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await new Promise(r => setTimeout(r, 30));
        expect(document.getElementById('average-campaign-budget').textContent).toBe('£200.00');
        expect(document.getElementById('total-campaign-booked').textContent).toBe('£80.00');
        expect(document.querySelector('#top-clients li').textContent).toBe('<img src=x>2 campaigns');
        expect(document.querySelector('#top-clients img')).toBeNull();
        expect(document.querySelector('#top-suppliers li').textContent).toBe('Google2 campaigns');
        expect(document.getElementById('campaign-insights-coverage').textContent).toBe('3 campaigns · Budgets 2/3 · Booked 2/3');
        const details = document.querySelector('.campaign-insights-details');
        expect(details.open).toBe(false);
        expect(details.textContent).toContain('rather than lifetime booking transactions');
    });

    test('includes an active weekend without showing empty weekends or future dates', async () => {
        const saturday = new Date();
        saturday.setHours(0, 0, 0, 0);
        saturday.setDate(saturday.getDate() - ((saturday.getDay() + 1) % 7));
        const key = `${saturday.getFullYear()}-${String(saturday.getMonth() + 1).padStart(2, '0')}-${String(saturday.getDate()).padStart(2, '0')}`;
        const previousSaturday = new Date(saturday);
        previousSaturday.setDate(previousSaturday.getDate() - 7);
        const waitingOnlyKey = `${previousSaturday.getFullYear()}-${String(previousSaturday.getMonth() + 1).padStart(2, '0')}-${String(previousSaturday.getDate()).padStart(2, '0')}`;
        await chrome.storage.local.set({ dailyStats: { [key]: { visitedCampaigns: ['a'] }, [waitingOnlyKey]: { loadingTime: 10 } } });
        require('../toolshed.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await new Promise(r => setTimeout(r, 30));
        const weekendCells = [...document.querySelectorAll('.heatmap-day')].filter(cell => [0, 6].includes(new Date(`${cell.dataset.date}T00:00:00`).getDay()));
        expect(weekendCells.map(cell => cell.dataset.date)).toEqual([key]);
        expect(document.getElementById('heatmap').style.gridTemplateRows).toBe('repeat(5, 12px)');
        expect(document.querySelector('#heatmap .heatmap-day[data-date="' + key + '"]')).toBeNull();
        expect(weekendCells[0].closest('#heatmap-weekends')).not.toBeNull();
        expect(document.getElementById('heatmap-weekends').hidden).toBe(false);
        expect(weekendCells[0].parentElement.textContent).toContain('Sat');
        expect(weekendCells[0].dataset.level).toBe('1');
        expect(weekendCells[0].dataset.tooltipText).toContain('1 actions');
        expect([...document.querySelectorAll('.heatmap-day')].every(cell => new Date(`${cell.dataset.date}T00:00:00`) <= new Date())).toBe(true);
    });

    test('explains all-weeks productivity on focus and dismisses with Escape', async () => {
        require('../toolshed.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        const button = document.getElementById('weekly-productivity-info');
        button.focus();
        const tooltip = document.getElementById('weekly-productivity-tooltip');
        expect(tooltip.hidden).toBe(false);
        expect(tooltip.textContent).toContain('across all recorded weeks');
        expect(button.getAttribute('aria-describedby')).toBe(tooltip.id);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(tooltip.hidden).toBe(true);
        expect(button.hasAttribute('aria-describedby')).toBe(false);
        await new Promise(r => setTimeout(r, 30));
    });

    test('keeps insight explanations collapsed and matches the Features info icon styling', () => {
        expect(document.querySelector('.campaign-insights-details').open).toBe(false);
        expect(document.querySelector('.campaign-insights-summary').classList.contains('stat-summary')).toBe(false);
        expect(css).toMatch(/\.stats-info-button\s*{[^}]*width: 24px;[^}]*height: 24px;[^}]*border: 0;/s);
        expect(css).toContain('var(--md-sys-color-secondary-container, #f9dce9)');
        expect(css).toContain('var(--md-sys-color-on-secondary-container, #6f123e)');
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

    test('lists the planned Meta Spend Check and Recy Sheet features', () => {
        const roadmapItems = Array.from(document.querySelectorAll('#roadmap li'))
            .map(item => item.textContent.trim());

        expect(roadmapItems).not.toContain('Timesheet Helper');
        expect(roadmapItems).toContain('Meta Spend Check');
        expect(roadmapItems).toContain('Recy Sheet Campaign List');
        expect(roadmapItems).toContain('Campaign history with the ability to search visited campaigns by supplier');
    });

    test('keeps every tab at the same content width without scrollbar layout shifts', () => {
        expect(css).toMatch(/html\s*{[^}]*scrollbar-gutter:\s*stable;/s);
        expect(css).toMatch(/\.tab-content\s*{[^}]*width:\s*100%;[^}]*box-sizing:\s*border-box;/s);
    });

});

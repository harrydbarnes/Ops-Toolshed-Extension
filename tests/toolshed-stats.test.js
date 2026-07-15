/**
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.resolve(__dirname, '../toolshed.html'), 'utf8');
const css = fs.readFileSync(path.resolve(__dirname, '../toolshed.css'), 'utf8');

describe('Toolshed Stats UI', () => {
    beforeEach(() => {
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
            '2023-10-01': { placements: 10, loadingTime: 180, visitedCampaigns: ['c2'] }
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

        // Check Heatmap presence (at least one day should be generated)
        expect(document.getElementById('heatmap').children.length).toBeGreaterThan(300);
    });

    test('shows the AppLearn count as a separate row immediately above Reset Stats', () => {
        const appLearnRow = document.getElementById('applearn-popups-blocked-stat').closest('.fun-stat');
        const resetButton = document.getElementById('reset-stats-button');

        expect(appLearnRow).not.toBeNull();
        expect(appLearnRow.classList.contains('applearn-stat-row')).toBe(true);
        expect(appLearnRow.nextElementSibling).toBe(resetButton);
        expect(document.querySelector('.stats-overview #applearn-popups-blocked-stat')).toBeNull();
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

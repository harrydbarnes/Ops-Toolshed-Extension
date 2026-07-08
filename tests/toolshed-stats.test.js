/**
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.resolve(__dirname, '../toolshed.html'), 'utf8');

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

        await chrome.storage.local.set({ legacyStats, dailyStats });

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

        // Check Kettle Index: 360 / 45 = 8
        expect(document.getElementById('kettle-index').textContent).toBe('8');

        // Check Heatmap presence (at least one day should be generated)
        expect(document.getElementById('heatmap').children.length).toBeGreaterThan(300);
    });

    test('should trigger confetti on milestone', async () => {
        window.confetti = jest.fn();

        const legacyStats = { placementsAdded: 100, visitedCampaigns: [], totalLoadingTime: 0 }; // Milestone 100
        await chrome.storage.local.set({ legacyStats });

        require('../toolshed.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));

        await new Promise(r => setTimeout(r, 100));

        expect(window.confetti).toHaveBeenCalled();
    });
});

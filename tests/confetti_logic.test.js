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
        delete window.confetti;
    });

    test('should trigger confetti on milestone crossing', async () => {
        window.confetti = jest.fn();

        // Initial State: 99 placements
        const legacyStats = { placementsAdded: 99, visitedCampaigns: [], totalLoadingTime: 0 };
        const dailyStats = {};

        // Mock get for first call
        chrome.storage.local.get.mockImplementation((keys, cb) => {
            cb({ legacyStats, dailyStats, statsStartDate: '2023-01-01' });
        });

        // Load script - displayStats() runs
        require('../toolshed.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));

        await new Promise(r => setTimeout(r, 50));

        // Should NOT trigger yet (99 is not milestone)
        expect(window.confetti).not.toHaveBeenCalled();

        // Simulate Update: 101 placements (Crossed 100)
        const newLegacyStats = { placementsAdded: 101, visitedCampaigns: [], totalLoadingTime: 0 };
        chrome.storage.local.get.mockImplementation((keys, cb) => {
            cb({ legacyStats: newLegacyStats, dailyStats, statsStartDate: '2023-01-01' });
        });

        // Trigger storage change
        const changeCallback = chrome.storage.onChanged.addListener.mock.calls[0][0];
        changeCallback({ legacyStats: {} }, 'local');

        await new Promise(r => setTimeout(r, 50));

        // Should trigger now
        expect(window.confetti).toHaveBeenCalled();
    });

    test('should trigger confetti on initial load if exactly on milestone', async () => {
        window.confetti = jest.fn();

        // Initial State: 100 placements
        const legacyStats = { placementsAdded: 100, visitedCampaigns: [], totalLoadingTime: 0 };

        chrome.storage.local.get.mockImplementation((keys, cb) => {
            cb({ legacyStats, dailyStats: {}, statsStartDate: '2023-01-01' });
        });

        // Reset modules to reload script and clear previousTotalPlacements
        jest.resetModules();
        require('../toolshed.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));

        await new Promise(r => setTimeout(r, 50));

        expect(window.confetti).toHaveBeenCalled();
    });
});

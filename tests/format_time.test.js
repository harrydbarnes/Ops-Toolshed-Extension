/** @jest-environment ./tests/jsdom-environment.cjs */
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.resolve(__dirname, '../toolshed.html'), 'utf8');

describe('Stats loading time formatting from real stored totals', () => {
    beforeEach(() => {
        resetMocks();
        jest.resetModules();
        document.documentElement.innerHTML = html;
    });
    test.each([
        [0, '0s'], [0.005, '<0.01s'], [45.56, '45.5s'], [59.9, '59.9s'],
        [60, '1 min &<br> 0s'], [90.5, '1 min &<br> 30.5s'],
        [330.5, '5 mins &<br> 30.5s'],
        [599.9, '9 mins &<br> ' + Math.floor((599.9 % 60) * 10) / 10 + 's'],
        [600, '10m &<br> 0s'], [724, '12m &<br> 4s'],
        [3599, '59m &<br> 59s'], [3600, '1h,<br> 0m & 0s'],
        [3930, '1h,<br> 5m & 30s'], [9015, '2h,<br> 30m & 15s']
    ])('%s seconds renders the expected precision and units', async (totalLoadingTime, expected) => {
        await chrome.storage.local.set({ legacyStats: { totalLoadingTime } });
        require('../toolshed.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await new Promise(resolve => setTimeout(resolve, 20));
        const expectedElement = document.createElement('div');
        expectedElement.innerHTML = expected;
        expect(document.getElementById('loading-time-stat').textContent).toBe(expectedElement.textContent);
        expect(document.getElementById('loading-time-stat').querySelectorAll('br')).toHaveLength(expectedElement.querySelectorAll('br').length);
    });
});

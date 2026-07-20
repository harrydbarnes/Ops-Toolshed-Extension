const fs = require('fs');
const path = require('path');

const settingsHtml = fs.readFileSync(path.resolve(__dirname, '../settings.html'), 'utf8');
const settingsScript = fs.readFileSync(path.resolve(__dirname, '../settings.js'), 'utf8');

describe('Loading Facts review settings', () => {
    test('links the feature toggle to a dedicated rating and export view', () => {
        expect(settingsHtml).toContain('id="loadingFactsStatsButton"');
        expect(settingsHtml).toContain('id="tab-loading-facts"');
        expect(settingsHtml).toContain('id="loadingFactReviewList"');
        expect(settingsHtml).toContain('id="exportLoadingFactRatings"');
        expect(settingsHtml).toContain('<script src="features/loading-facts.js"></script>');
    });

    test('stores ratings locally and exports fact text with each rating', () => {
        expect(settingsScript).toContain("chrome.storage.local.get('loadingFactRatings'");
        expect(settingsScript).toContain("chrome.storage.local.set({ loadingFactRatings: nextRatings })");
        expect(settingsScript).toContain("format: 'ops-toolshed-loading-fact-ratings'");
        expect(settingsScript).toContain('.map(fact => ({ fact, rating: ratings[fact] }))');
    });
});

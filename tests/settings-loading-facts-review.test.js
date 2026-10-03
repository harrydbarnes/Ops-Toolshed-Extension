const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const settingsHtml = fs.readFileSync(path.resolve(__dirname, '../settings.html'), 'utf8');
const settingsScript = fs.readFileSync(path.resolve(__dirname, '../settings.js'), 'utf8');

describe('Loading Facts review settings', () => {
    test('sign-in inputs share a scoped sizing rule that overrides general text-input styles', () => {
        const view=new JSDOM('<style></style>');
        view.window.document.querySelector('style').textContent=fs.readFileSync(path.resolve(__dirname,'../settings.css'),'utf8');
        const rules=[...view.window.document.styleSheets[0].cssRules];
        const sizing=rules.find(rule=>rule.selectorText==='.prisma-login-assistant-options label input');
        expect(sizing.style.getPropertyValue('width')).toBe('100%');
        expect(sizing.style.getPropertyValue('margin')).toBe('0px');
        expect(sizing.style.getPropertyValue('height')).toBe('38px');
        expect(sizing.style.getPropertyValue('box-sizing')).toBe('border-box');
        view.window.close();
    });
    test('uses the dedicated rating and export tab without a redundant feature-row button', () => {
        expect(settingsHtml).not.toContain('id="loadingFactsStatsButton"');
        expect(settingsHtml).toContain('id="tab-loading-facts"');
        expect(settingsHtml).toContain('id="loadingFactReviewList"');
        expect(settingsHtml).toContain('id="exportLoadingFactRatings"');
        expect(settingsHtml).toContain('data-scripts="feature-settings-registry.js,build-info.js,utils.js,features/feedback-modal.js,features/loading-facts.js,settings.js"');
    });

    test('stores ratings locally and exports fact text with each rating', () => {
        expect(settingsScript).toContain("chrome.storage.local.get('loadingFactRatings'");
        expect(settingsScript).toContain("chrome.storage.local.set({ loadingFactRatings: nextRatings })");
        expect(settingsScript).toContain("format: 'ops-toolshed-loading-fact-ratings'");
        expect(settingsScript).toContain('.map(fact => ({ fact, rating: ratings[fact] }))');
    });
});

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { filterFeatureSettings } = require('../settings');

const settingsHtml = fs.readFileSync(path.resolve(__dirname, '../settings.html'), 'utf8');
const settingsCss = fs.readFileSync(path.resolve(__dirname, '../settings.css'), 'utf8');

function setup() {
    const dom = new JSDOM(settingsHtml);
    const sections = dom.window.document.querySelectorAll('#features > section');
    return { dom, document: dom.window.document, sections };
}

describe('Feature Settings search', () => {
    test('keeps the search outside the ARIA tablist while sharing its toolbar row', () => {
        const { dom, document } = setup();
        const toolbar = document.querySelector('.settings-tab-toolbar');
        expect(toolbar.querySelector(':scope > [role="tablist"]')).not.toBeNull();
        expect(toolbar.querySelector(':scope > [role="search"]')).not.toBeNull();
        expect(document.getElementById('clear-feature-settings-search').getAttribute('aria-label'))
            .toBe('Clear feature search');
        dom.window.close();
    });

    test('keeps the toolbar search compact without wrapping tab labels', () => {
        expect(settingsCss).toMatch(/\.feature-settings-search\s*\{[^}]*flex:\s*0 0 240px;/s);
        expect(settingsCss).toMatch(/#feature-settings-search-input\s*\{[^}]*height:\s*34px;/s);
        expect(settingsCss).toMatch(/#feature-settings-search-input\s*\{[^}]*margin:\s*0;/s);
        expect(settingsCss).toMatch(/\.feature-settings-search-clear\s*\{[^}]*align-items:\s*center;[^}]*margin:\s*0;/s);
        expect(settingsCss).toMatch(/\.tab-button\s*\{[^}]*white-space:\s*nowrap;/s);
    });

    test('filters individual settings and hides categories without matches', () => {
        const { dom, document, sections } = setup();

        expect(filterFeatureSettings('GMI Chat', sections)).toBe(1);
        expect(document.getElementById('campaign-view-settings').classList).not.toContain('settings-search-hidden');
        expect(document.getElementById('gmiChatShortcutToggle').closest('.toggle-container').classList)
            .not.toContain('settings-search-hidden');
        expect(document.getElementById('budgetWidgetOptimisedToggle').closest('.toggle-container').classList)
            .toContain('settings-search-hidden');
        expect(document.getElementById('live-chat-settings').classList).toContain('settings-search-hidden');
        dom.window.close();
    });

    test('filters Advanced actions individually and restores everything when cleared', () => {
        const { dom, document, sections } = setup();
        const v1 = document.getElementById('launchOnboardingTourV1Button');
        const v2 = document.getElementById('launchOnboardingTourV2Button');
        const defaults = document.getElementById('resetFeatureSettingsButton');

        expect(filterFeatureSettings('side panel v2', sections)).toBe(1);
        expect(v1.classList).toContain('settings-search-hidden');
        expect(v2.classList).not.toContain('settings-search-hidden');
        expect(defaults.classList).toContain('settings-search-hidden');

        expect(filterFeatureSettings('', sections)).toBe(9);
        expect(document.querySelectorAll('.settings-search-hidden')).toHaveLength(0);
        dom.window.close();
    });

    test('returns zero visible sections for an unknown setting', () => {
        const { dom, sections } = setup();
        expect(filterFeatureSettings('definitely unknown feature', sections)).toBe(0);
        dom.window.close();
    });
});

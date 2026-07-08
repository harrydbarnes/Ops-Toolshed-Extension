const fs = require('fs');
const path = require('path');

const settingsHtml = fs.readFileSync(path.resolve(__dirname, '../settings.html'), 'utf8');
const settingsScript = fs.readFileSync(path.resolve(__dirname, '../settings.js'), 'utf8');

describe('campaign navigation settings', () => {
    test('removes the obsolete navigation style selector', () => {
        expect(settingsHtml).not.toContain('campaignNavStyleDropdown');
        expect(settingsScript).not.toContain("'campaignNavStyle'");
    });

    test.each([
        ['ordersShortcutToggle', 'ordersShortcutEnabled'],
        ['approverWidgetPlacementToggle', 'approverWidgetPlacementEnabled'],
        ['quickCampaignActionsToggle', 'quickCampaignActionsEnabled'],
        ['budgetWidgetOptimisedToggle', 'budgetWidgetOptimisedEnabled'],
        ['campaignNameQuickCopyToggle', 'campaignNameQuickCopyEnabled'],
        ['newOrderUiOptimisationToggle', 'newOrderUiOptimisationEnabled'],
        ['actualiseScrollRestoreToggle', 'actualiseScrollRestoreEnabled']
    ])('exposes enabled-by-default sub-option %s', (toggleId, storageKey) => {
        expect(settingsHtml).toContain(`id="${toggleId}"`);
        expect(settingsScript).toContain(`setupToggle('${toggleId}', '${storageKey}'`);
    });

    test('master toggle disables only the controls, preserving child values', () => {
        expect(settingsScript).toContain('input.disabled = !isEnabled');
        expect(settingsScript).not.toContain('ordersShortcutEnabled: isEnabled');
        expect(settingsScript).not.toContain('campaignNameQuickCopyEnabled: isEnabled');
    });

    test('keeps an open Settings page synced with popup storage changes', () => {
        expect(settingsScript).toContain("chrome.storage.onChanged.addListener((changes, area) =>");
        expect(settingsScript).toContain('input.checked = changes[storageKey].newValue !== false');
        expect(settingsScript).toContain('setNavigationSubOptionsEnabled(changes.optimisedNewNavEnabled.newValue !== false)');
    });
});

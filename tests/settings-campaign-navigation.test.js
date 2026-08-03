const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const settingsHtml = fs.readFileSync(path.resolve(__dirname, '../settings.html'), 'utf8');
const settingsScript = fs.readFileSync(path.resolve(__dirname, '../settings.js'), 'utf8');

describe('campaign navigation settings', () => {
    test('removes the obsolete navigation style selector', () => {
        expect(settingsHtml).not.toContain('campaignNavStyleDropdown');
        expect(settingsScript).not.toContain("'campaignNavStyle'");
    });

    test('uses one approver-widget placement setting without the legacy duplicate', () => {
        expect(settingsHtml).toContain('id="approverWidgetPlacementToggle"');
        expect(settingsScript).toContain("'approverWidgetPlacementEnabled'");
        expect(settingsHtml).not.toContain('id="approverWidgetOptimiseToggle"');
        expect(settingsScript).not.toContain('approverWidgetOptimiseEnabled');
    });

    test.each([
        ['ordersShortcutToggle', 'ordersShortcutEnabled'],
        ['actualiseShortcutToggle', 'actualiseShortcutEnabled'],
        ['approverWidgetPlacementToggle', 'approverWidgetPlacementEnabled'],
        ['quickCampaignActionsToggle', 'quickCampaignActionsEnabled'],
        ['budgetWidgetOptimisedToggle', 'budgetWidgetOptimisedEnabled'],
        ['campaignNameQuickCopyToggle', 'campaignNameQuickCopyEnabled'],
        ['campaignHeaderQuickCopyToggle', 'campaignHeaderQuickCopyEnabled'],
        ['campaignDateShortcutToggle', 'campaignDateShortcutEnabled'],
        ['newOrderUiOptimisationToggle', 'newOrderUiOptimisationEnabled'],
        ['actualiseScrollRestoreToggle', 'actualiseScrollRestoreEnabled'],
        ['actualiseNavbarToggle', 'actualiseNavbarEnabled']
    ])('exposes enabled-by-default sub-option %s', (toggleId, storageKey) => {
        expect(settingsHtml).toContain(`id="${toggleId}"`);
        expect(settingsScript).toContain(`setupToggle('${toggleId}', '${storageKey}'`);
    });

    test('removes the obsolete navigation master and keeps every feature independent', () => {
        expect(settingsHtml).not.toContain('optimisedNewNavToggle');
        expect(settingsHtml).not.toContain('Optimised New Campaign Navigation');
        expect(settingsScript).not.toContain('optimisedNewNavEnabled');
    });

    test('exposes the campaign-only tab title toggle', () => {
        expect(settingsHtml).toContain('id="campaignTabTitleToggle"');
        expect(settingsScript).toContain("setupToggle('campaignTabTitleToggle', 'campaignTabTitleEnabled'");
    });

    test('exposes the account-switch return toggle independently of the custom switch button', () => {
        expect(settingsHtml).toContain('id="rememberAccountSwitchUrlToggle"');
        expect(settingsScript).toContain(
            "setupToggle('rememberAccountSwitchUrlToggle', 'rememberAccountSwitchUrlEnabled'"
        );
    });

    test('keeps an open Settings page synced with popup storage changes', () => {
        expect(settingsScript).toContain("chrome.storage.onChanged.addListener((changes, area) =>");
        expect(settingsScript).toContain('input.checked = changes[storageKey].newValue !== false');
    });

    test('groups Feature settings in the requested order', () => {
        const dom = new JSDOM(settingsHtml);
        const sections = Array.from(dom.window.document.querySelectorAll('#features > section'));
        expect(sections.map(section => section.querySelector('h2')?.textContent)).toEqual([
            'Appearance',
            'Productivity',
            'Navigation',
            'Quick Actions',
            'Automation',
            'Campaign View',
            'Live Chat',
            'Fixes',
            'Advanced'
        ]);

        const expectedSections = {
            gmiChatShortcutToggle: 'campaign-view-settings',
            hidingSectionsToggle: 'automation-settings',
            swapAccountsToggle: 'quick-actions-settings',
            rememberAccountSwitchUrlToggle: 'automation-settings',
            orderGridScrollSyncToggle: 'fixes-settings',
            statsCollectorToggle: 'advanced-settings'
        };
        Object.entries(expectedSections).forEach(([toggleId, sectionId]) => {
            expect(dom.window.document.getElementById(toggleId)?.closest('section')?.id).toBe(sectionId);
        });
        dom.window.close();
    });

    test('keeps both walkthrough labels and offers a confirmed Features-only reset', () => {
        expect(settingsHtml).toContain('Open side panel v1');
        expect(settingsHtml).toContain('Open side panel v2');
        expect(settingsHtml).toContain('id="resetFeatureSettingsButton"');
        expect(settingsScript).toContain("title: 'Restore default settings?'");
        expect(settingsScript).toContain('This resets the Features tab only.');
    });
});

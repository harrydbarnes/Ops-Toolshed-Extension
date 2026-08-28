const { FEATURE_SETTINGS_DEFAULTS, SETTINGS_DEFAULTS, loadSettingsWithDefaults } = require('../settings');

const EXPECTED_DEFAULTS = {
    uiTheme: 'pink',
    reminderTheme: 'pink',
    autoCopyUrlMode: 'short',
    metaFinanceToolMode: 'social',
    logoReplaceEnabled: true,
    appLearnReplaceEnabled: true,
    blockAppLearnPopupsEnabled: true,
    helpGuidesEnabled: true,
    approverSidebarEnhancementsEnabled: true,
    approverSubmittedRecipientDisplayEnabled: true,
    actualiseBulkExportEnabled: true,
    prismaReminderFrequency: 'daily',
    prismaCountdownDuration: '5',
    metaReminderEnabled: true,
    iasReminderEnabled: true,
    fontSizeToggleEnabled: true,
    resizableChatToggleEnabled: true,
    scheduledChatToggleEnabled: true,
    directMoeChatEnabled: true,
    addCampaignShortcutEnabled: true,
    hidingSectionsEnabled: true,
    automateFormFieldsEnabled: true,
    countPlacementsSelectedEnabled: true,
    swapAccountsEnabled: true,
    rememberAccountSwitchUrlEnabled: true,
    bannerUsernameEnabled: true,
    alwaysShowCommentsEnabled: true,
    orderIdCopyEnabled: true,
    maxCampaignBudgetEnabled: true,
    newOrderUiOptimisationEnabled: true,
    ordersShortcutEnabled: true,
    actualiseShortcutEnabled: true,
    approverWidgetPlacementEnabled: true,
    campaignHistoryEnabled: true,
    campaignHistoryLoggingEnabled: true,
    dstAssuranceEnabled: true,
    actualiseMonthAssuranceEnabled: true,
    productCodeLimitWarningEnabled: true,
    quickCampaignActionsEnabled: true,
    budgetWidgetOptimisedEnabled: true,
    campaignNameQuickCopyEnabled: true,
    campaignHeaderQuickCopyEnabled: true,
    campaignDateShortcutEnabled: true,
    actualiseScrollRestoreEnabled: true,
    actualiseNavbarEnabled: true,
    campaignTabTitleEnabled: true,
    gmiChatShortcutEnabled: true,
    autoCopyUrlEnabled: true,
    loadingFactsEnabled: true,
    orderGridScrollSyncEnabled: true,
    statsCollectorEnabled: true,
    timesheetReminderEnabled: true,
    reminderDay: 'Friday',
    reminderTime: '14:30',
    customReminders: []
};

describe('batched Settings initialization', () => {
    test('keeps every established Settings default explicit and unchanged', () => {
        expect(SETTINGS_DEFAULTS).toEqual(EXPECTED_DEFAULTS);
    });

    test('feature defaults exclude all reminder settings and user-created reminder data', () => {
        expect(FEATURE_SETTINGS_DEFAULTS).toEqual(expect.objectContaining({
            uiTheme: 'pink',
            orderGridScrollSyncEnabled: true,
            statsCollectorEnabled: true
        }));
        [
            'reminderTheme',
            'prismaReminderFrequency',
            'prismaCountdownDuration',
            'metaReminderEnabled',
            'iasReminderEnabled',
            'timesheetReminderEnabled',
            'reminderDay',
            'reminderTime',
            'customReminders'
        ].forEach(key => expect(FEATURE_SETTINGS_DEFAULTS).not.toHaveProperty(key));
    });

    test('reads once, preserves stored values, and writes all missing defaults once', async () => {
        const stored = {
            uiTheme: 'black',
            appLearnReplaceEnabled: false,
            autoCopyUrlEnabled: false,
            reminderDay: 'Monday'
        };
        const storageArea = {
            get: jest.fn().mockResolvedValue(stored),
            set: jest.fn().mockResolvedValue(undefined)
        };

        const settings = await loadSettingsWithDefaults(storageArea);

        expect(storageArea.get).toHaveBeenCalledTimes(1);
        expect(storageArea.get).toHaveBeenCalledWith(
            Object.keys(EXPECTED_DEFAULTS),
            expect.any(Function)
        );
        expect(storageArea.set).toHaveBeenCalledTimes(1);
        expect(storageArea.set.mock.calls[0][0]).not.toHaveProperty('uiTheme');
        expect(storageArea.set.mock.calls[0][0]).not.toHaveProperty('appLearnReplaceEnabled');
        expect(storageArea.set.mock.calls[0][0]).not.toHaveProperty('autoCopyUrlEnabled');
        expect(storageArea.set.mock.calls[0][0]).not.toHaveProperty('reminderDay');
        expect(settings).toEqual({ ...EXPECTED_DEFAULTS, ...stored });
    });

    test('does not write when every setting already exists', async () => {
        const storageArea = {
            get: jest.fn().mockResolvedValue(EXPECTED_DEFAULTS),
            set: jest.fn().mockResolvedValue(undefined)
        };

        await loadSettingsWithDefaults(storageArea);

        expect(storageArea.get).toHaveBeenCalledTimes(1);
        expect(storageArea.set).not.toHaveBeenCalled();
    });
});

(function(root, factory) {
    const registry = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = registry;
    if (root) root.OpsToolshedFeatureSettings = registry;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    'use strict';

    const BOOLEAN_DEFAULTS = Object.freeze({
        logoReplaceEnabled: true,
        appLearnReplaceEnabled: true,
        blockAppLearnPopupsEnabled: true,
        helpGuidesEnabled: true,
        approverSidebarEnhancementsEnabled: true,
        approverSubmittedRecipientDisplayEnabled: true,
        approvalTrackingEnabled: true,
        approvalBannerIndicatorEnabled: true,
        approvalToastNotificationEnabled: true,
        actualiseBulkExportEnabled: true,
        metaReminderEnabled: true,
        iasReminderEnabled: true,
        fontSizeToggleEnabled: true,
        resizableChatToggleEnabled: true,
        moeChatMediaAutoSelectEnabled: true,
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
        planToBuyRedirectEnabled: true,
        gmiChatShortcutEnabled: true,
        autoCopyUrlEnabled: true,
        loadingFactsEnabled: true,
        orderGridScrollSyncEnabled: true,
        statsCollectorEnabled: true,
        diagnosticsModeEnabled: false,
        timesheetReminderEnabled: true
    });

    return Object.freeze({
        BOOLEAN_DEFAULTS,
        KEYS: Object.freeze(Object.keys(BOOLEAN_DEFAULTS))
    });
});

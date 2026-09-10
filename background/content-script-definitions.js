export const CONTENT_SCRIPT_DEFINITIONS = Object.freeze([
    {
        id: 'ops-toolshed-applearn-main',
        matches: ['https://*.mediaocean.com/*'],
        js: ['features/applearn-popup-guard.js'],
        runAt: 'document_start',
        allFrames: true,
        world: 'MAIN',
        persistAcrossSessions: false
    },
    {
        id: 'ops-toolshed-applearn-controller',
        matches: ['https://*.mediaocean.com/*'],
        js: ['features/extension-state-controller.js', 'features/applearn-popup-guard-controller.js'],
        runAt: 'document_start',
        allFrames: true,
        persistAcrossSessions: false
    },
    {
        id: 'ops-toolshed-moe-main',
        matches: ['https://*.mediaocean.com/*'],
        js: ['features/moe-launcher-bridge.js'],
        runAt: 'document_start',
        world: 'MAIN',
        persistAcrossSessions: false
    },
    {
        id: 'ops-toolshed-actualise-main',
        matches: ['https://*.mediaocean.com/*'],
        js: ['features/actualise-month-bridge.js'],
        runAt: 'document_start',
        world: 'MAIN',
        persistAcrossSessions: false
    },
    {
        id: 'ops-toolshed-campaign-details-frames',
        matches: ['https://*.mediaocean.com/idesk/prisma-campaign-details/*'],
        js: [
            'features/extension-state-controller.js',
            'features/campaign-details-focus.js',
            'features/campaign-add-sections.js'
        ],
        allFrames: true,
        persistAcrossSessions: false
    },
    {
        id: 'ops-toolshed-mediaocean-features',
        matches: ['https://*.mediaocean.com/*'],
        js: [
            'features/extension-state-controller.js',
            'utils.js',
            'features/feedback-modal.js',
            'features/logo.js',
            'features/reminders.js',
            'features/campaign.js',
            'features/campaign-history.js',
            'features/product-code-limit-warning.js',
            'features/campaign-tab-title.js',
            'features/plan-to-buy-redirect.js',
            'features/d-number-search.js',
            'features/gmi-chat.js',
            'features/live-chat-enhancements.js',
            'features/approver-pasting.js',
            'features/loading-monitor.js',
            'features/stats-collector.js',
            'features/placement-counter.js',
            'features/dst-assurance.js',
            'features/actualise-month-assurance.js',
            'features/banner-username.js',
            'features/swap-accounts.js',
            'features/auto-copy-url.js',
            'features/order-id-copy.js',
            'features/order-grid-scroll-sync.js',
            'features/order-view-toggle.js',
            'features/actualise-navbar.js',
            'features/actualise-shortcut.js',
            'features/actualise-export-all.js',
            'features/actualise-scroll-restore.js',
            'features/max-campaign-budget.js',
            'features/loading-facts.js',
            'features/help-guides-launcher.js',
            'features/onboarding-tour.js',
            'features/applearn-replace.js',
            'features/approval-tracking.js',
            'content.js'
        ],
        css: [
            'approvers.css',
            'content.css',
            'features/feedback-modal.css',
            'features/approval-tracking.css'
        ],
        persistAcrossSessions: false
    }
]);

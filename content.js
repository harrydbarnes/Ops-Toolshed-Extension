(function() { // Wrap the entire script in an IIFE to control execution.
  // Page-level orchestration belongs only to the top frame. Campaign Details
  // receives its own lightweight frame script for the Basic-field shortcut.
  if (window.top !== window.self) return;

  initializeContentScript();

  function initializeContentScript() {
    console.log("[ContentScript Prisma] Script Injected on URL:", window.location.href, "at", new Date().toLocaleTimeString());


// Reminder-related functions are now in features/reminders.js

// Dynamic Prisma rendering can invalidate only a subset of our controls. Keep
// those subsets dirty until the deferred reconciliation has completed so the
// observer does not ask every feature to rescan on every native render batch.
const DIRTY_FEATURE_GROUPS = [
    'shell',
    'orders',
    'actualise',
    'campaign',
    'approvals',
    'chat',
    'placement',
    'dstAssurance',
    'reminders',
    'autoCopy',
    'logo'
];

const EXTENSION_OWNED_SELECTOR = [
    '[id^="toolshed-"]',
    '[id^="ops-toolshed-"]',
    '[class*="toolshed-"]',
    '.prisma-paste-button',
    '.manage-favourites-button',
    '.gmi-chat-button',
    '.custom-prisma-logo',
    '.order-id-copy-cell',
    '.order-id-copy-btn',
    '.order-id-copy-toast',
    '.order-view-toggle',
    '.placement-toast',
    '.reminder-overlay',
    '.loading-fact-toast',
    '.extracted-action-tooltip',
    '.tooltip-arrow-custom',
    '.switch-account-button',
    '#mo-extracted-actions-toolbar',
    '#campaign-name-copy-toast',
    '#p2b-navbar-section-orders',
    '#p2b-navbar-section-actualise',
    '#order-id-copy-styles',
    '#resizable-chat-handle',
    '#launcher-button-container',
    '#custom-reminder-display-popup',
    '#optimised-budget-styles',
    '#optimised-order-grid-scroll-styles'
].join(', ');

const DIRTY_FEATURE_HINTS = [
    {
        groups: ['orders'],
        selector: '#cm-buy-sidebar-order-revisions-header, #cm-buy-sidebar-order-revisions, [data-cy="order-summary"]'
    },
    {
        groups: ['actualise'],
        selector: '#mos-paginator, #mos-import-export, [data-cy="actualise-grid"]'
    },
    {
        groups: ['campaign', 'actualise'],
        selector: '.p2b-navbar-wrapper, #month-filter-toolbar, #actualize-toolbar, .actual-header, .actual-months-group'
    },
    {
        groups: ['campaign', 'actualise'],
        selector: '#ptb-header mo-icon[name="print"], .mo-page-header mo-icon[name="print"], .buy-details-background, .buy-details-wrapper'
    },
    {
        groups: ['campaign', 'approvals', 'chat', 'placement', 'dstAssurance'],
        selector: '.workflow-widget-wrapper'
    },
    {
        groups: ['campaign', 'chat'],
        selector: '.mo-campaign-name-wrapper'
    },
    {
        groups: ['approvals'],
        selector: '.select2-choices, .select2-drop-active'
    },
    {
        groups: ['chat'],
        selector: 'mo-banner, mo-banner-help-menu, mo-menu'
    },
    {
        groups: ['shell'],
        selector: 'mo-side-panel, #vp-block, mo-spinner, .mo-spinner'
    },
    {
        groups: ['placement', 'dstAssurance'],
        selector: '.ht_master .htCore, [data-placement-id], .placement-row'
    }
];

function createDirtyFeatureState(value) {
    return DIRTY_FEATURE_GROUPS.reduce((state, group) => {
        state[group] = value;
        return state;
    }, {});
}

let dirtyFeatures = createDirtyFeatureState(true);
let dirtyRevision = 0;
let scheduleDynamicUiReconciliationCallback = null;

function markAllFeaturesDirty() {
    const wasClean = !DIRTY_FEATURE_GROUPS.some(group => dirtyFeatures[group]);
    dirtyFeatures = createDirtyFeatureState(true);
    if (wasClean) dirtyRevision += 1;
}

function markFeatureGroupsDirty(groups) {
    let changed = false;
    groups.forEach(group => {
        if (!dirtyFeatures[group]) {
            dirtyFeatures[group] = true;
            changed = true;
        }
    });
    if (changed) dirtyRevision += 1;
}

function hasDirtyFeature(group) {
    return dirtyFeatures[group] === true;
}

function hasAnyDirtyFeatures() {
    return DIRTY_FEATURE_GROUPS.some(group => dirtyFeatures[group]);
}

function clearDirtyFeaturesIfUnchanged(revision) {
    if (dirtyRevision === revision) {
        dirtyFeatures = createDirtyFeatureState(false);
    }
}

function isExtensionOwnedElement(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node === document.body || node === document.documentElement) return false;
    if (node.matches?.(EXTENSION_OWNED_SELECTOR)) return true;
    return Boolean(node.querySelector?.(EXTENSION_OWNED_SELECTOR));
}

function isExtensionOwnedRoot(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node === document.body || node === document.documentElement) return false;
    return Boolean(node.matches?.(EXTENSION_OWNED_SELECTOR));
}

function elementTouchesDirtyHint(element, selector) {
    if (!element || element.nodeType !== 1) return false;
    if (element.matches?.(selector)) return true;

    // Do not inspect the entire document for a body-level mutation. The
    // changed nodes themselves are checked below, while a nested target can
    // still identify its owning native region.
    if (element === document.body || element === document.documentElement) return false;
    return Boolean(element.querySelector?.(selector));
}

function markDirtyFeaturesFromMutations(mutations) {
    const groups = new Set();
    let sawNativeMutation = false;

    for (const mutation of mutations || []) {
        const changedElements = [
            ...(mutation.addedNodes || []),
            ...(mutation.removedNodes || [])
        ].filter(node => node?.nodeType === 1);

        // A mutation made entirely inside one of our own nodes cannot make a
        // missing native Prisma target appear, so it needs no reconciliation.
        const extensionOwned = isExtensionOwnedRoot(mutation.target) || (
            changedElements.length > 0
                ? changedElements.every(isExtensionOwnedElement)
                : isExtensionOwnedElement(mutation.target)
        );
        if (extensionOwned) continue;

        sawNativeMutation = true;
        const candidates = changedElements.length > 0
            ? changedElements
            : [mutation.target];
        const matchingHints = DIRTY_FEATURE_HINTS.filter(hint =>
            candidates.some(candidate => elementTouchesDirtyHint(candidate, hint.selector))
        );

        // Unknown native changes remain a safe full reconciliation. The dirty
        // groups are an optimization for known regions, never a correctness
        // gate for a new Prisma component we have not mapped yet.
        if (matchingHints.length === 0) {
            markAllFeaturesDirty();
            return true;
        }
        matchingHints.forEach(hint => hint.groups.forEach(group => groups.add(group)));
    }

    if (!sawNativeMutation) return false;
    markFeatureGroupsDirty(groups);
    return true;
}

let currentUrlForDismissFlags = window.location.href;
function handleUrlChange() {
    if (currentUrlForDismissFlags === window.location.href) return false;

    console.log("[ContentScript Prisma] URL changed, reminder dismissal flags reset.");
    window.remindersFeature.resetReminderDismissalFlags();
    window.campaignFeature.resetCampaignFlags();
    window.campaignFeature.handleCampaignNavigationOptimisation();
    currentUrlForDismissFlags = window.location.href;
    markAllFeaturesDirty();
    scheduleDynamicUiReconciliationCallback?.();
    return true;
}

// Prisma's SPA changes normally arrive with one of these navigation events.
// The central DOM observer also calls handleUrlChange below for replaceState-style
// transitions that do not emit a browser navigation event.
window.addEventListener('hashchange', handleUrlChange);
window.addEventListener('popstate', handleUrlChange);

// D-Number search, GMI chat, and other features will be extracted.
// For now, their functions are removed and will be replaced by calls to the new modules.

// GMI chat button function is now in features/gmi-chat.js
// Campaign management functions are now in features/campaign.js

// Approver pasting functions are now in features/approver-pasting.js

// --- End Custom Reminder Functions ---

// Logo-related functions are now in features/logo.js

let contentScriptInitializationStarted = false;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mainContentScriptInit);
} else {
    mainContentScriptInit();
}

async function mainContentScriptInit() {
    if (contentScriptInitializationStarted) return;
    contentScriptInitializationStarted = true;
    console.log("[ContentScript Prisma] DOMContentLoaded or already loaded. Initializing checks.");

    const hostname = window.location.hostname || new URL(window.location.href).hostname;
    const isPrismaLike =
        hostname.includes('prisma.mediaocean.com') ||
        hostname.includes('go.demo.mediaocean.com');
    const isAura = hostname.includes('aura.mediaocean.com');
    const isMediaoceanPage = hostname.includes('mediaocean.com');
    const initialRoute = getDynamicRouteContext();
    const initializedFeatureInstances = new WeakSet();

    function initializeFeature(feature, shouldInitialize) {
        if (!shouldInitialize || !feature || typeof feature.initialize !== 'function') return;
        if (initializedFeatureInstances.has(feature)) return;
        initializedFeatureInstances.add(feature);
        feature.initialize();
    }

    // Keep route ownership in one registry. Both initial load and later SPA
    // navigations use it, so a feature cannot accidentally be initialized on
    // one path but omitted from the other.
    const featureInitializers = [
        { getFeature: () => window.statsCollector, when: () => isMediaoceanPage },
        { getFeature: () => window.appLearnFeature, when: () => isMediaoceanPage },
        { getFeature: () => window.helpGuidesLauncherFeature, when: () => isMediaoceanPage },
        { getFeature: () => window.bannerUsernameFeature, when: () => isPrismaLike },
        { getFeature: () => window.productCodeLimitWarningFeature, when: route => isPrismaLike && (route.isCampaignWorkspace || route.isAddCampaign) },
        { getFeature: () => window.placementCounterFeature, when: route => isPrismaLike && route.isCampaignWorkspace },
        { getFeature: () => window.dstAssuranceFeature, when: route => isPrismaLike && route.isCampaignWorkspace },
        { getFeature: () => window.approverPastingFeature, when: route => isPrismaLike && route.isCampaignWorkspace },
        { getFeature: () => window.autoCopyUrlFeature, when: route => (isPrismaLike || isAura) && route.isCampaignWorkspace },
        { getFeature: () => window.liveChatEnhancements, when: route => isPrismaLike && route.isCampaignWorkspace },
        { getFeature: () => window.campaignTabTitleFeature, when: route => isPrismaLike && route.isCampaignWorkspace },
        { getFeature: () => window.swapAccountsFeature, when: () => isPrismaLike || isAura },
        { getFeature: () => window.orderIdCopyFeature, when: route => isPrismaLike && route.isCampaignWorkspace },
        { getFeature: () => window.orderViewToggleFeature, when: route => isPrismaLike && route.isCampaignWorkspace },
        { getFeature: () => window.orderGridScrollSyncFeature, when: route => isPrismaLike && route.isOrderSummary },
        { getFeature: () => window.actualiseScrollRestoreFeature, when: route => isPrismaLike && route.isActualise },
        { getFeature: () => window.actualiseNavbarFeature, when: route => isPrismaLike && route.isActualise },
        { getFeature: () => window.actualiseShortcutFeature, when: route => isPrismaLike && route.isCampaignWorkspace },
        { getFeature: () => window.actualiseExportAllFeature, when: route => isPrismaLike && route.isActualise },
        { getFeature: () => window.actualiseMonthAssuranceFeature, when: route => isPrismaLike && route.isActualise },
        { getFeature: () => window.maxCampaignBudgetFeature, when: route => isPrismaLike && route.isCampaignWorkspace },
        { getFeature: () => window.loadingFactsFeature, when: () => isPrismaLike }
    ];

    function initializeEligibleFeatures(route) {
        featureInitializers.forEach(({ getFeature, when }) => {
            initializeFeature(getFeature(), when(route));
        });
    }

    initializeEligibleFeatures(initialRoute);

    // Prisma: full enhancement set
    if (isPrismaLike && window.logoFeature.shouldReplaceLogoOnThisPage()) {
        await window.remindersFeature.fetchCustomReminders(); // Fetch initial set of custom reminders
        window.logoFeature.checkAndReplaceLogo();
        setTimeout(() => {
            const route = getDynamicRouteContext();
            window.remindersFeature.checkForMetaConditions();
            window.remindersFeature.checkForIASConditions();
            window.remindersFeature.checkCustomReminders(); // Initial check for custom reminders
            if (route.isCampaignWorkspace) {
                window.campaignFeature.handleCampaignManagementFeatures();
                if (route.isActualise) window.campaignFeature.handleAlwaysShowComments();
                window.campaignFeature.handleCampaignNavigationOptimisation();
            }
        }, 2000);
    // Aura: only logo replacement + popup reminders (custom or otherwise)
    } else if (isAura && window.logoFeature.shouldReplaceLogoOnThisPage()) {
        await window.remindersFeature.fetchCustomReminders();
        window.logoFeature.checkAndReplaceLogo();
        setTimeout(() => {
            // Meta/IAS reminders are themselves URL / setting gated; safe to call.
            window.remindersFeature.checkForMetaConditions();
            window.remindersFeature.checkForIASConditions();
            window.remindersFeature.checkCustomReminders();
        }, 2000);
    }

    let fastReconciliationQueued = false;
    let deferredReconciliationTimer = null;
    const scheduleFrame = window.requestAnimationFrame || (callback => window.setTimeout(callback, 0));

    function getDynamicRouteContext() {
        const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const pspId = params.get('osPspId') || '';
        const href = window.location.href;
        const isDashboard = pspId === 'cm-dashboard' || href.includes('cm-dashboard');
        const hasCampaign = Boolean(params.get('campaign-id'));
        const isAddCampaign = params.get('osModalId') === 'prsm-cm-cmpadd';
        const isCampaignWorkspace = !isDashboard && (
            hasCampaign || pspId.startsWith('prsm-cm-')
        );
        const isActualise = isCampaignWorkspace && (
            params.get('ptb-ctx') === 'actualize' || params.get('route') === 'actualize'
        );
        const isBuy = isCampaignWorkspace && params.get('ptb-mod') === 'buy' && !isActualise;
        const isOrderSummary = isCampaignWorkspace && (
            pspId === 'prsm-cm-ord' || params.get('ptb-ctx') === 'orderSummary'
        );

        return {
            isAddCampaign,
            isActualise,
            isBuy,
            isCampaignWorkspace,
            isOrderSummary
        };
    }

    function runFastDynamicUiReconciliation() {
        const route = getDynamicRouteContext();

        if (isPrismaLike) {
            initializeEligibleFeatures(route);

            if (hasDirtyFeature('orders') && (route.isBuy || route.isOrderSummary) && window.orderViewToggleFeature) {
                const hasNewOrderUi = window.orderViewToggleFeature.isNewOrderUi?.() === true;
                const hasStaleOrderViewControls = Boolean(document.querySelector(
                    '.order-view-toggle, #cm-buy-sidebar-order-revisions-header.order-view-toggle-active'
                ));
                if (hasNewOrderUi || hasStaleOrderViewControls) {
                    window.orderViewToggleFeature.handleOrderViewToggle();
                }
            }
            if (
                hasDirtyFeature('actualise') &&
                route.isCampaignWorkspace &&
                window.actualiseNavbarFeature?.isInitialized?.()
            ) {
                window.actualiseNavbarFeature.apply();
            }
            if (hasDirtyFeature('actualise') && route.isCampaignWorkspace && window.actualiseShortcutFeature) {
                window.actualiseShortcutFeature.apply();
            }
            if (hasDirtyFeature('actualise') && route.isActualise && window.actualiseExportAllFeature) {
                window.actualiseExportAllFeature.apply();
            }
            if (hasDirtyFeature('actualise') && route.isActualise && window.actualiseMonthAssuranceFeature) {
                window.actualiseMonthAssuranceFeature.apply();
            }
            if (hasDirtyFeature('campaign') && route.isCampaignWorkspace) {
                window.campaignFeature?.syncPrintNavigationSections?.();
            }
            if (hasDirtyFeature('campaign') && route.isCampaignWorkspace && window.maxCampaignBudgetFeature) {
                window.maxCampaignBudgetFeature.apply();
            }
        }

        if (hasDirtyFeature('shell')) {
            window.appLearnFeature?.applyTransparency?.();
            window.helpGuidesLauncherFeature?.ensureLauncher?.();
        }
    }

    function runDeferredDynamicUiReconciliation() {
        const route = getDynamicRouteContext();
        const reconciliationRevision = dirtyRevision;

        initializeEligibleFeatures(route);

        if (isPrismaLike && window.logoFeature.shouldReplaceLogoOnThisPage()) {
            if (hasDirtyFeature('logo')) {
                window.logoFeature.checkAndReplaceLogo();
            }
            if (hasDirtyFeature('reminders')) {
                window.remindersFeature.checkForMetaConditions();
                window.remindersFeature.checkForIASConditions();
                window.remindersFeature.checkCustomReminders();
            }

            if (route.isCampaignWorkspace) {
                if (hasDirtyFeature('campaign')) {
                    window.campaignFeature.handleCampaignManagementFeatures();
                    if (route.isActualise) window.campaignFeature.handleAlwaysShowComments();
                    window.campaignFeature.handleCampaignNavigationOptimisation();
                }
                if (hasDirtyFeature('approvals')) {
                    window.approverPastingFeature?.handleApproverPasting?.();
                    window.approverPastingFeature?.handleManageFavouritesButton?.();
                    window.approverPastingFeature?.addRecipientHistoryControls?.();
                    window.approverPastingFeature?.handleSubmittedRecipientDisplay?.();
                }
                if (hasDirtyFeature('chat')) {
                    window.gmiChatFeature?.handleGmiChatButton?.();
                }
                if (hasDirtyFeature('placement')) {
                    window.placementCounterFeature?.checkSelection();
                }
                if (hasDirtyFeature('dstAssurance')) {
                    window.dstAssuranceFeature?.apply?.();
                }
                if (route.isActualise && hasDirtyFeature('actualise')) {
                    window.actualiseMonthAssuranceFeature?.apply?.();
                }
            }

            if (hasDirtyFeature('orders') && route.isOrderSummary) {
                window.orderGridScrollSyncFeature?.syncAll();
                const hasNewOrderUi = window.orderViewToggleFeature?.isNewOrderUi?.() === true;
                const hasStaleLegacyOrderIdControls = Boolean(document.querySelector('.order-id-copy-cell'));
                if (!hasNewOrderUi || hasStaleLegacyOrderIdControls) {
                    // The feature performs a targeted new/legacy UI check before
                    // any legacy cell scan and removes stale legacy controls.
                    window.orderIdCopyFeature?.checkAndAddCopyButtons();
                }
            }
        } else if (isAura && window.logoFeature.shouldReplaceLogoOnThisPage()) {
            if (hasDirtyFeature('logo')) {
                window.logoFeature.checkAndReplaceLogo();
            }
            if (hasDirtyFeature('reminders')) {
                window.remindersFeature.checkForMetaConditions();
                window.remindersFeature.checkForIASConditions();
            }
            if (hasDirtyFeature('reminders') || hasDirtyFeature('autoCopy')) {
                window.remindersFeature.checkCustomReminders();
            }
            if (hasDirtyFeature('autoCopy') && route.isCampaignWorkspace) {
                window.autoCopyUrlFeature?.handleAutoCopy();
            }
        }

        clearDirtyFeaturesIfUnchanged(reconciliationRevision);
    }

    function scheduleDynamicUiReconciliation() {
        if (!hasAnyDirtyFeatures()) return;

        if (!fastReconciliationQueued) {
            fastReconciliationQueued = true;
            scheduleFrame(() => {
                fastReconciliationQueued = false;
                runFastDynamicUiReconciliation();
            });
        }

        // Throttle rather than restart this timer so continuous Prisma rendering
        // cannot postpone the heavier reconciliation indefinitely.
        if (deferredReconciliationTimer === null) {
            deferredReconciliationTimer = window.setTimeout(() => {
                deferredReconciliationTimer = null;
                runDeferredDynamicUiReconciliation();
            }, 300);
        }
    }

    scheduleDynamicUiReconciliationCallback = scheduleDynamicUiReconciliation;

    const observer = new MutationObserver(function(mutations) {
        const urlChanged = handleUrlChange();
        const nativeMutationNeedsReconciliation = markDirtyFeaturesFromMutations(mutations);
        if (urlChanged || nativeMutationNeedsReconciliation) {
            scheduleDynamicUiReconciliation();
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Run one initial pass so the dirty state is cleared before the observer
    // begins filtering extension-owned DOM churn.
    scheduleDynamicUiReconciliation();
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log("[ContentScript Prisma] Message received in listener:", request);

    const action = request?.action;
    try {
        if (action === "checkLogoReplaceEnabled") {
            console.log("[ContentScript Prisma] 'checkLogoReplaceEnabled' action received.");
            if (window.logoFeature.shouldReplaceLogoOnThisPage()) {
                if (typeof request.enabled === 'boolean') {
                    window.logoFeature.setLogoReplaceEnabled(request.enabled);
                } else {
                    window.logoFeature.checkAndReplaceLogo();
                }
            }
            sendResponse({status: "Logo check processed by content script"});
            return false;
        }

        if (action === "showMetaReminder") {
            console.log("[ContentScript Prisma] 'showMetaReminder' action received. Attempting to create popup.");
            window.remindersFeature.forceShowMetaReminder();
            sendResponse({status: "Meta reminder shown by content script"});
            return false;
        }

        if (action === "resetProductCodeLimitWarningIgnores") {
            const resetIgnoredProductCodes = window.productCodeLimitWarningFeature?.resetIgnoredProductCodes;
            if (typeof resetIgnoredProductCodes !== 'function') {
                sendResponse({ status: 'Product Code Limit Warning is unavailable' });
                return false;
            }

            Promise.resolve(resetIgnoredProductCodes())
                .then(() => sendResponse({ status: 'Product Code Limit Warning ignores reset' }))
                .catch(error => sendResponse({
                    status: 'error',
                    message: error?.message || 'Product Code Limit Warning reset failed.'
                }));
            return true;
        }

        if (action === "customRemindersUpdated") {
            console.log("[ContentScript Prisma] Received 'customRemindersUpdated' message. Re-fetching reminders.");
            window.remindersFeature.fetchCustomReminders()
                .then(() => {
                    window.remindersFeature.resetReminderDismissalFlags();
                    window.remindersFeature.checkCustomReminders();
                    sendResponse({status: "Custom reminders re-fetched and IDs reset by content script"});
                })
                .catch(error => {
                    console.error("Failed to refresh custom reminders:", error);
                    sendResponse({
                        status: 'error',
                        message: error?.message || 'Failed to refresh custom reminders.'
                    });
                });
            return true; // Keep message port open for async response
        }

        if (action === "executeDNumberSearch") {
            if (!request.dNumber) {
                sendResponse({ status: 'error', message: 'A D or O number is required.' });
                return false;
            }

            (async () => {
                try {
                    await window.dNumberSearchFeature.handleDNumberSearch(request.dNumber);
                    sendResponse({ status: 'success', message: 'D-Number search initiated successfully.' });
                } catch (error) {
                    console.error("D-Number search failed:", error);
                    sendResponse({ status: 'error', message: error.message });
                }
            })();
            return true; // Keep the message channel open for asynchronous response
        }

        if (action === "openFeedbackModal") {
            console.log("[ContentScript] Opening Feedback Modal");
            if (window.feedbackModalFeature) {
                window.feedbackModalFeature.open();
            }
            sendResponse({ status: "opened" });
            return false;
        }

        console.log("[ContentScript Prisma] Unknown action received or no action taken:", action);
        return false;
    } catch (error) {
        console.error(`Content-script message handler failed for action "${action || 'unknown'}":`, error);
        sendResponse({
            status: 'error',
            message: error?.message || 'Content-script message handling failed.'
        });
        return false;
    }
});

    console.log("[ContentScript Prisma] Event listeners, including onMessage, should be set up now.");
  } // End of initializeContentScript
})(); // End of IIFE

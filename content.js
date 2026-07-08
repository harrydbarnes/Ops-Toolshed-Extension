(function() { // Wrap the entire script in an IIFE to control execution.
  chrome.storage.local.get('timeBombActive', (data) => {
    if (data.timeBombActive) {
      console.log('Ops Toolshed features disabled due to time bomb.');
      return; // Do not initialize anything if the time bomb is active.
    }
    // If not active, run the main script logic.
    initializeContentScript();
  });

  function initializeContentScript() {
    chrome.storage.sync.get('approverWidgetOptimiseEnabled', (data) => {
        if (data.approverWidgetOptimiseEnabled) {
            document.body.classList.add('approver-widget-optimise');
        }
    });
    console.log("[ContentScript Prisma] Script Injected on URL:", window.location.href, "at", new Date().toLocaleTimeString());

// Utility functions are now in utils.js

// Logo-related functions are now in features/logo.js

// Reminder-related functions are now in features/reminders.js

let currentUrlForDismissFlags = window.location.href;
setInterval(() => {
    if (currentUrlForDismissFlags !== window.location.href) {
        console.log("[ContentScript Prisma] URL changed, reminder dismissal flags reset.");
        window.remindersFeature.resetReminderDismissalFlags();
        window.campaignFeature.resetCampaignFlags();
        window.campaignFeature.handleCampaignNavigationOptimisation();
        window.statsCollector.trackCampaignId(); // Centralized call
        currentUrlForDismissFlags = window.location.href;
    }
}, 500);

// D-Number search, GMI chat, and other features will be extracted.
// For now, their functions are removed and will be replaced by calls to the new modules.

// GMI chat button function is now in features/gmi-chat.js
// Campaign management functions are now in features/campaign.js

// Approver pasting functions are now in features/approver-pasting.js

// --- End Custom Reminder Functions ---

// Logo-related functions are now in features/logo.js

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mainContentScriptInit);
} else {
    mainContentScriptInit();
}

async function mainContentScriptInit() {
    console.log("[ContentScript Prisma] DOMContentLoaded or already loaded. Initializing checks.");

    const hostname = window.location.hostname || new URL(window.location.href).hostname;
    const isPrismaLike =
        hostname.includes('prisma.mediaocean.com') ||
        hostname.includes('go.demo.mediaocean.com');
    const isAura = hostname.includes('aura.mediaocean.com');

    // Initialize features that should run once
    window.statsCollector.initialize();
    if (window.appLearnFeature) {
        window.appLearnFeature.initialize();
    }
    window.statsCollector.trackCampaignId(); // Initial call on page load

    // Placement counter is Prisma-only
    if (isPrismaLike && window.placementCounterFeature) {
        window.placementCounterFeature.initialize();
    }

    // Switch accounts is allowed on Prisma + Aura (gated by its own setting)
    if ((isPrismaLike || isAura) && window.swapAccountsFeature) {
        window.swapAccountsFeature.initialize();
    }

    // Auto-copy URL is allowed on Prisma + Aura (gated by its own setting)
    if ((isPrismaLike || isAura) && window.autoCopyUrlFeature) {
        window.autoCopyUrlFeature.initialize();
    }

    // Order ID copy is Prisma-only
    if (isPrismaLike && window.orderIdCopyFeature) {
        window.orderIdCopyFeature.initialize();
    }

    if (isPrismaLike && window.orderViewToggleFeature) {
        window.orderViewToggleFeature.initialize();
    }

    if (isPrismaLike && window.actualiseScrollRestoreFeature) {
        window.actualiseScrollRestoreFeature.initialize();
    }

    // Initialize Loading Facts Feature
    if (isPrismaLike && window.loadingFactsFeature) {
        window.loadingFactsFeature.initialize();
    }

    // Prisma: full enhancement set
    if (isPrismaLike && window.logoFeature.shouldReplaceLogoOnThisPage()) {
        await window.remindersFeature.fetchCustomReminders(); // Fetch initial set of custom reminders
        window.logoFeature.checkAndReplaceLogo();
        setTimeout(() => {
            window.remindersFeature.checkForMetaConditions();
            window.remindersFeature.checkForIASConditions();
            window.remindersFeature.checkCustomReminders(); // Initial check for custom reminders
            window.campaignFeature.handleCampaignManagementFeatures();
            window.campaignFeature.handleAlwaysShowComments();
            window.campaignFeature.handleCampaignNavigationOptimisation();
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

    const observer = new MutationObserver(function(mutations) {
        if (isPrismaLike && window.orderViewToggleFeature) {
            window.orderViewToggleFeature.handleOrderViewToggle();
        }

        if (isPrismaLike && window.loadingFactsFeature) {
            window.loadingFactsFeature.checkForLoading();
        }

        if (window.appLearnFeature) {
            window.appLearnFeature.applyTransparency();
        }

        if (isPrismaLike && window.logoFeature.shouldReplaceLogoOnThisPage()) {
            window.logoFeature.checkAndReplaceLogo();
            // No need to iterate mutations for these checks, just run them if any mutation occurred
            setTimeout(() => { // Debounce/delay slightly
                window.remindersFeature.checkForMetaConditions();
                window.remindersFeature.checkForIASConditions();
                window.remindersFeature.checkCustomReminders(); // Check for custom reminders on DOM changes
                window.campaignFeature.handleCampaignManagementFeatures();
                window.campaignFeature.handleAlwaysShowComments();
                window.campaignFeature.handleCampaignNavigationOptimisation();
                window.approverPastingFeature.handleApproverPasting();
                window.approverPastingFeature.handleManageFavouritesButton();
                window.gmiChatFeature.handleGmiChatButton();
                window.liveChatEnhancements.initialize();

                // NEW LINE ADDED: Explicit check for placement selection on DOM change
                if (window.placementCounterFeature) {
                    window.placementCounterFeature.checkSelection();
                }

                if (window.autoCopyUrlFeature) {
                    window.autoCopyUrlFeature.handleAutoCopy();
                }

                if (window.orderIdCopyFeature) {
                    window.orderIdCopyFeature.checkAndAddCopyButtons();
                }

            }, 300);
        } else if (isAura && window.logoFeature.shouldReplaceLogoOnThisPage()) {
            window.logoFeature.checkAndReplaceLogo();
            setTimeout(() => {
                // Aura: only popup reminders + auto-copy URL are allowed here.
                window.remindersFeature.checkForMetaConditions();
                window.remindersFeature.checkForIASConditions();
                window.remindersFeature.checkCustomReminders();

                if (window.autoCopyUrlFeature) {
                    window.autoCopyUrlFeature.handleAutoCopy();
                }
            }, 300);
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log("[ContentScript Prisma] Message received in listener:", request);

    if (request.action === "checkLogoReplaceEnabled") {
        console.log("[ContentScript Prisma] 'checkLogoReplaceEnabled' action received.");
        if (window.logoFeature.shouldReplaceLogoOnThisPage()) {
            window.logoFeature.checkAndReplaceLogo();
        }
        sendResponse({status: "Logo check processed by content script"});
    } else if (request.action === "showMetaReminder") {
        console.log("[ContentScript Prisma] 'showMetaReminder' action received. Attempting to create popup.");
        window.remindersFeature.forceShowMetaReminder();
        sendResponse({status: "Meta reminder shown by content script"});
    } else if (request.action === "customRemindersUpdated") {
        console.log("[ContentScript Prisma] Received 'customRemindersUpdated' message. Re-fetching reminders.");
        window.remindersFeature.fetchCustomReminders().then(() => {
            window.remindersFeature.resetReminderDismissalFlags();
            window.remindersFeature.checkCustomReminders();
            sendResponse({status: "Custom reminders re-fetched and IDs reset by content script"});
        });
        return true; // Keep message port open for async response
    } else if (request.action === "executeDNumberSearch" && request.dNumber) {
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
    } else if (request.action === "openFeedbackModal") {
        console.log("[ContentScript] Opening Feedback Modal");
        if (window.feedbackModalFeature) {
            window.feedbackModalFeature.open();
        }
        sendResponse({ status: "opened" });
    } else {
        console.log("[ContentScript Prisma] Unknown action received or no action taken:", request.action);
    }
    return true; // Keep the message channel open for asynchronous response if needed
});

    console.log("[ContentScript Prisma] Event listeners, including onMessage, should be set up now.");
  } // End of initializeContentScript
})(); // End of IIFE

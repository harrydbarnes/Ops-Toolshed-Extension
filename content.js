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
    console.log("[ContentScript Prisma] Script Injected on URL:", window.location.href, "at", new Date().toLocaleTimeString());

// Global variables for custom reminders
let activeCustomReminders = [];
let shownCustomReminderIds = new Set();
let mediaMixAutomated = false;
let budgetTypeAutomated = false;

// Utility functions are now in utils.js

// Logo-related functions are now in features/logo.js

// Reminder-related functions are now in features/reminders.js

let currentUrlForDismissFlags = window.location.href;
setInterval(() => {
    if (currentUrlForDismissFlags !== window.location.href) {
        console.log("[ContentScript Prisma] URL changed, reminder dismissal flags reset.");
        window.remindersFeature.resetReminderDismissalFlags();
        window.campaignFeature.resetCampaignFlags();
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
    if (window.logoFeature.shouldReplaceLogoOnThisPage()) {
        await window.remindersFeature.fetchCustomReminders(); // Fetch initial set of custom reminders
        window.logoFeature.checkAndReplaceLogo();
        setTimeout(() => {
            window.remindersFeature.checkForMetaConditions();
            window.remindersFeature.checkForIASConditions();
            window.remindersFeature.checkCustomReminders(); // Initial check for custom reminders
            window.campaignFeature.handleCampaignManagementFeatures();
        }, 2000);
    }

    const observer = new MutationObserver(function(mutations) {
        if (window.logoFeature.shouldReplaceLogoOnThisPage()) {
            window.logoFeature.checkAndReplaceLogo();
            // No need to iterate mutations for these checks, just run them if any mutation occurred
            setTimeout(() => { // Debounce/delay slightly
                window.remindersFeature.checkForMetaConditions();
                window.remindersFeature.checkForIASConditions();
                window.remindersFeature.checkCustomReminders(); // Check for custom reminders on DOM changes
                window.campaignFeature.handleCampaignManagementFeatures();
                window.approverPastingFeature.handleApproverPasting();
                window.approverPastingFeature.handleManageFavouritesButton();
                window.gmiChatFeature.handleGmiChatButton();
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
        // This needs to be handled within the reminders module now.
        // For now, this will be a no-op until that feature is refactored.
        sendResponse({status: "Meta reminder show request received."});
    } else if (request.action === "customRemindersUpdated") {
        console.log("[ContentScript Prisma] Received 'customRemindersUpdated' message. Re-fetching reminders.");
        window.remindersFeature.fetchCustomReminders().then(() => {
            window.remindersFeature.resetReminderDismissalFlags();
            window.remindersFeature.checkCustomReminders();
            sendResponse({status: "Custom reminders re-fetched and IDs reset by content script"});
        });
        return true; // Keep message port open for async response
    } else if (request.action === "performDNumberSearch" && request.dNumber) {
        window.dNumberSearchFeature.handleDNumberSearch(request.dNumber)
            .then(() => sendResponse({ status: "D-Number search initiated successfully" }))
            .catch(error => sendResponse({ status: "D-Number search failed", error: error.message }));
        return true; // Keep the message channel open for asynchronous response
    } else {
        console.log("[ContentScript Prisma] Unknown action received or no action taken:", request.action);
    }
    return true; // Keep the message channel open for asynchronous response if needed
});

    console.log("[ContentScript Prisma] Event listeners, including onMessage, should be set up now.");
  } // End of initializeContentScript
})(); // End of IIFE
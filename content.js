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

// Utility to escape HTML for display (used by custom reminder popup)
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

/**
 * Recursively searches for an element matching the selector, piercing through shadow DOMs.
 * @param {string} selector - The CSS selector to search for.
 * @param {Element|ShadowRoot} [root=document] - The root element to start the search from.
 * @returns {Element|null} The first matching element found, or null.
 */
function queryShadowDom(selector, root = document) {
    const found = root.querySelector(selector);
    if (found) return found;

    const allElements = root.querySelectorAll('*');
    for (const element of allElements) {
        if (element.shadowRoot) {
            const foundInShadow = queryShadowDom(selector, element.shadowRoot);
            if (foundInShadow) return foundInShadow;
        }
    }
    return null;
}

function waitForElement(selector, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      const element = document.querySelector(selector);
      if (element) {
        clearInterval(interval);
        clearTimeout(timer);
        resolve(element);
      }
    }, 100);
    const timer = setTimeout(() => {
      clearInterval(interval);
      reject(new Error(`Element '${selector}' not found within ${timeout}ms`));
    }, timeout);
  });
}

function waitForElementToDisappear(selector, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      const element = document.querySelector(selector);
      if (!element) {
        clearInterval(interval);
        clearTimeout(timer);
        resolve();
      }
    }, 100);
    const timer = setTimeout(() => {
      clearInterval(interval);
      reject(new Error(`Element '${selector}' did not disappear within ${timeout}ms`));
    }, timeout);
  });
}

function replaceLogo() {
    // Use a more robust selector by finding a unique path within the SVG,
    // and use queryShadowDom to search inside shadow DOM trees.
    const uniquePath = queryShadowDom('path[d="M9.23616 0C4.13364 0 0 3.78471 0 8.455C0 13.1253 4.13364 16.91 9.23616 16.91"]');
    const specificSvg = uniquePath ? uniquePath.closest('svg') : null;
    const logoContainer = specificSvg ? specificSvg.parentElement : null;

    if (logoContainer) {
        // Check if custom logo already exists by checking for our specific class within the container
        if (logoContainer.querySelector('.custom-prisma-logo')) {
            return; // Already replaced
        }

        // Store original content (the SVG itself) if not already stored
        if (!logoContainer.dataset.originalSvgContent && specificSvg) {
            logoContainer.dataset.originalSvgContent = specificSvg.outerHTML;
        }

        // Remove the original SVG
        if (specificSvg) {
            specificSvg.remove();
        }

        const newLogoImg = document.createElement('img');
        newLogoImg.src = chrome.runtime.getURL('icon.png');
        newLogoImg.style.width = '32px'; // Or use dimensions from the original SVG if desired
        newLogoImg.style.height = '28px'; // Match height of original SVG container
        newLogoImg.style.objectFit = 'contain';
        newLogoImg.className = 'custom-prisma-logo';

        logoContainer.appendChild(newLogoImg);
        // console.log("[ContentScript Prisma] Prisma logo SVG replaced with custom image.");
    }
}

function restoreOriginalLogo() {
    const customLogoImg = document.querySelector('i.logo > img.custom-prisma-logo');
    if (customLogoImg) {
        const logoContainer = customLogoImg.parentElement; // The <i> tag
        if (logoContainer && logoContainer.dataset.originalSvgContent) {
            customLogoImg.remove(); // Remove the custom image
            // Prepend original SVG. Ensure it's not added multiple times if logic re-runs.
            if (!logoContainer.querySelector('svg[width="20"][height="28"]')) {
                 logoContainer.innerHTML = logoContainer.dataset.originalSvgContent + logoContainer.innerHTML;
            }
            // console.log("[ContentScript Prisma] Original Prisma SVG logo restored from stored content.");
        } else if (logoContainer) {
            // Fallback if original content wasn't stored: just remove the custom logo
            customLogoImg.remove();
            // console.log("[ContentScript Prisma] Custom logo image removed (no stored original SVG). Page may need refresh for original logo.");
        }
    }
}

function checkAndReplaceLogo() {
    // Gracefully handle cases where the extension context is invalidated.
    if (!chrome.runtime || !chrome.runtime.id) {
        // The extension context has been invalidated, so we can't use chrome.storage.
        // This can happen if the extension is reloaded or updated.
        // console.log("Extension context invalidated. Skipping logo replacement check.");
        return;
    }

    chrome.storage.sync.get('logoReplaceEnabled', function(data) {
        if (chrome.runtime.lastError) {
            console.error(`Error getting logoReplaceEnabled setting: ${chrome.runtime.lastError.message}`);
            return;
        }
        // In settings.js, the default is true if the value is undefined.
        // So we should replace the logo unless the setting is explicitly false.
        if (data.logoReplaceEnabled !== false) {
            replaceLogo();
        } else {
            restoreOriginalLogo();
        }
    });
}

// addReminderStyles function is now removed as styles are in style.css
// Ensure style.css is listed in manifest.json's content_scripts css array.

let metaReminderDismissed = false;
let iasReminderDismissed = false;
let metaCheckInProgress = false;

// --- New Reminder Logic ---

function shouldShowReminder(storageKey, frequency, callback) {
    chrome.storage.local.get([storageKey], (data) => {
        const lastShownTimestamp = data[storageKey];
        if (!lastShownTimestamp) {
            callback(true); // Never shown, so show it.
            return;
        }

        const now = new Date();
        const lastShown = new Date(lastShownTimestamp);
        let show = false;

        switch (frequency) {
            case 'daily':
                if (now.toDateString() !== lastShown.toDateString()) show = true;
                break;
            case 'weekly':
                const oneWeek = 7 * 24 * 60 * 60 * 1000;
                if (now.getTime() - lastShown.getTime() > oneWeek) show = true;
                break;
            case 'monthly':
                if (now.getMonth() !== lastShown.getMonth() || now.getFullYear() !== lastShown.getFullYear()) show = true;
                break;
            case 'once':
                // Handled by the initial check for `lastShownTimestamp`. If we get here, it's already been shown.
                show = false;
                break;
            default: // Default to daily
                if (now.toDateString() !== lastShown.toDateString()) show = true;
                break;
        }
        callback(show);
    });
}

function setReminderShown(storageKey) {
    chrome.storage.local.set({ [storageKey]: Date.now() });
}

function createPrismaReminderPopup({ popupId, content, countdownSeconds, storageKey }) {
    if (document.getElementById(popupId)) return;

    const overlay = document.createElement('div');
    overlay.className = 'reminder-overlay';
    overlay.id = `${popupId}-overlay`;
    document.body.appendChild(overlay);

    const popup = document.createElement('div');
    popup.id = popupId;

    const h3 = document.createElement('h3');
    h3.textContent = content.title;
    popup.appendChild(h3);

    const p = document.createElement('p');
    p.textContent = content.message;
    popup.appendChild(p);

    const ul = document.createElement('ul');
    content.list.forEach(itemText => {
        const li = document.createElement('li');
        li.textContent = itemText;
        ul.appendChild(li);
    });
    popup.appendChild(ul);

    const closeButton = document.createElement('button');
    closeButton.id = `${popupId}-close`;
    closeButton.className = 'reminder-close-button';
    closeButton.textContent = 'Got it!';
    popup.appendChild(closeButton);

    document.body.appendChild(popup);
    console.log(`[ContentScript Prisma] ${content.title} popup CREATED.`);

    let countdownInterval;
    const cleanupPopup = () => {
        popup.remove();
        overlay.remove();
        clearInterval(countdownInterval);
        setReminderShown(storageKey);
        if (popupId === 'meta-reminder-popup') {
            metaReminderDismissed = true;
            metaCheckInProgress = false; // Reset the check flag on dismissal
        }
        if (popupId === 'ias-reminder-popup') iasReminderDismissed = true;
    };

    if (countdownSeconds > 0) {
        closeButton.disabled = true;
        let secondsLeft = countdownSeconds;
        closeButton.textContent = `Got it! (${secondsLeft}s)`;
        countdownInterval = setInterval(() => {
            secondsLeft--;
            if (secondsLeft > 0) {
                closeButton.textContent = `Got it! (${secondsLeft}s)`;
            } else {
                clearInterval(countdownInterval);
                closeButton.textContent = 'Got it!';
                closeButton.disabled = false;
            }
        }, 1000);
    }

    closeButton.addEventListener('click', cleanupPopup);
}

function checkForMetaConditions() {
    if (metaReminderDismissed || metaCheckInProgress) return;
    const currentUrl = window.location.href;
    if (!currentUrl.includes('groupmuk-prisma.mediaocean.com/') || !currentUrl.includes('actualize')) return;

    if (!chrome.runtime || !chrome.runtime.id) return;

    chrome.storage.sync.get(['metaReminderEnabled', 'prismaReminderFrequency', 'prismaCountdownDuration'], (settings) => {
        if (chrome.runtime.lastError || settings.metaReminderEnabled === false) return;

        const frequency = settings.prismaReminderFrequency || 'daily';
        shouldShowReminder('metaReminderLastShown', frequency, (show) => {
            if (!show) return;

            metaCheckInProgress = true;
            let attempts = 0;
            const maxAttempts = 15;

            const intervalId = setInterval(() => {
                const pageText = document.body.textContent || "";
                const conditionsMet = pageText.includes('000770') && pageText.includes('Redistribute all');

                if (conditionsMet) {
                    clearInterval(intervalId);
                    // metaCheckInProgress remains true until the user dismisses the popup.
                    if (!document.getElementById('meta-reminder-popup')) {
                        createPrismaReminderPopup({
                            popupId: 'meta-reminder-popup',
                            content: {
                                title: '⚠️ Meta Reconciliation Reminder ⚠️',
                                message: 'When reconciling Meta, please:',
                                list: ["Actualise to the 'Supplier' option", "Self-accept the IO", "Push through on trafficking tab to Meta", "Verify success of the push, every time", "Do not just leave the page!"]
                            },
                            countdownSeconds: parseInt(settings.prismaCountdownDuration, 10) || 0,
                            storageKey: 'metaReminderLastShown'
                        });
                    }
                } else if (attempts >= maxAttempts) {
                    clearInterval(intervalId);
                    metaCheckInProgress = false; // Reset only on timeout
                }
                attempts++;
            }, 2000);
        });
    });
}

function checkForIASConditions() {
    if (iasReminderDismissed) return;
    if (!chrome.runtime || !chrome.runtime.id) return;

    chrome.storage.sync.get(['iasReminderEnabled', 'prismaReminderFrequency', 'prismaCountdownDuration'], (settings) => {
        if (chrome.runtime.lastError || settings.iasReminderEnabled === false) return;

        const pageText = document.body.innerText;
        if (pageText.includes('001148') && pageText.includes('Flat') && pageText.includes('Unit type')) {
            const frequency = settings.prismaReminderFrequency || 'daily';
            shouldShowReminder('iasReminderLastShown', frequency, (show) => {
                if (show && !document.getElementById('ias-reminder-popup')) {
                    createPrismaReminderPopup({
                        popupId: 'ias-reminder-popup',
                        content: {
                            title: '⚠️ IAS Booking Reminder ⚠️',
                            message: 'Please ensure you book as CPM',
                            list: ['With correct rate for media type', 'Check the plan', 'Ensure what is planned is what goes live']
                        },
                        countdownSeconds: parseInt(settings.prismaCountdownDuration, 10) || 0,
                        storageKey: 'iasReminderLastShown'
                    });
                }
            });
        }
    });
}

let currentUrlForDismissFlags = window.location.href;
setInterval(() => {
    if (currentUrlForDismissFlags !== window.location.href) {
        console.log("[ContentScript Prisma] URL changed, reminder dismissal flags reset.");
        metaReminderDismissed = false;
        iasReminderDismissed = false;
        shownCustomReminderIds.clear(); // Reset shown custom reminders on URL change
        mediaMixAutomated = false;
        budgetTypeAutomated = false;
        currentUrlForDismissFlags = window.location.href;
        // Potentially re-fetch or re-check custom reminders if needed immediately on SPA navigation
        // For now, MutationObserver and initial load handle most cases.
        // checkCustomReminders(); // Optional: check immediately on navigation
    }
}, 500);

async function handleDNumberSearch(dNumber) {
    console.log(`[DNumberSearch] Starting search for D-Number: ${dNumber}`);
    const maxRetries = 20; // Give it a bit more time
    let currentRetry = 0;

    // 1. Find and click the Campaign module button by its text content.
    let campaignModuleButton;
    while (currentRetry < maxRetries) {
        const allModules = document.querySelectorAll('mo-banner-module');
        campaignModuleButton = Array.from(allModules).find(m => m.innerText.trim() === 'Campaigns');
        if (campaignModuleButton) {
            console.log('[DNumberSearch] Found Campaign module button.');
            break;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
        currentRetry++;
    }

    if (campaignModuleButton) {
        campaignModuleButton.click();
    } else {
        console.error('[DNumberSearch] FATAL: Could not find Campaign module button.');
        return;
    }

    // 2. Dynamically find the newly opened overlay and its content.
    let overlayContent;
    currentRetry = 0;
    while(currentRetry < maxRetries) {
        const overlays = document.querySelectorAll('mo-overlay[role="dialog"]');
        if (overlays.length > 0) {
            const lastOverlay = overlays[overlays.length - 1];
            overlayContent = lastOverlay.querySelector('mo-banner-recent-menu-content');
            if (overlayContent) {
                console.log('[DNumberSearch] Found active search overlay content.');
                break;
            }
        }
        await new Promise(resolve => setTimeout(resolve, 300));
        currentRetry++;
    }

    if (!overlayContent) {
        console.error('[DNumberSearch] FATAL: Could not find search overlay content area.');
        return;
    }

    // 3. Find and click the toggle switch within the dynamic overlay.
    let toggleSwitch;
    currentRetry = 0;
    while (currentRetry < maxRetries) {
        if (overlayContent.shadowRoot) {
            toggleSwitch = overlayContent.shadowRoot.querySelector('mo-toggle-switch');
            if (toggleSwitch) {
                console.log('[DNumberSearch] Found toggle switch.');
                break;
            }
        }
        await new Promise(resolve => setTimeout(resolve, 300));
        currentRetry++;
    }

    if (toggleSwitch) {
        if (toggleSwitch.getAttribute('aria-checked') !== 'true') {
            console.log('[DNumberSearch] Clicking toggle switch for ID search.');
            toggleSwitch.click();
            await new Promise(resolve => setTimeout(resolve, 300));
        } else {
             console.log('[DNumberSearch] ID search already active.');
        }
    } else {
        console.error('[DNumberSearch] FATAL: Could not find the toggle switch.');
        return;
    }

    // 4. Find the search input, paste D-number, and trigger search.
    let searchInput;
    currentRetry = 0;
    while (currentRetry < maxRetries) {
        if (overlayContent.shadowRoot) {
            const searchBox = overlayContent.shadowRoot.querySelector('mo-search-box.search-box-container');
            if (searchBox && searchBox.shadowRoot) {
                const moInput = searchBox.shadowRoot.querySelector('mo-input');
                if(moInput && moInput.shadowRoot) {
                   searchInput = moInput.shadowRoot.querySelector('input[type="text"]');
                   if (searchInput) {
                       console.log('[DNumberSearch] Found search input.');
                       break;
                   }
                }
            }
        }
        await new Promise(resolve => setTimeout(resolve, 300));
        currentRetry++;
    }

    if (searchInput) {
        console.log('[DNumberSearch] Inputting D-Number and dispatching events.');
        searchInput.value = dNumber;
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.dispatchEvent(new Event('change', { bubbles: true }));
        searchInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
    } else {
        console.error('[DNumberSearch] FATAL: Could not find the search input field.');
        return;
    }

    // 5. Wait for the correct result link to appear and click it.
    let resultLink;
    currentRetry = 0;
    while (currentRetry < maxRetries) {
        if (overlayContent.shadowRoot) {
            const itemRowAnchors = Array.from(overlayContent.shadowRoot.querySelectorAll('a.item-row'));
            resultLink = itemRowAnchors.find(a => a.textContent.includes(dNumber));
            if (resultLink) {
                console.log('[DNumberSearch] Found result link.');
                break;
            }
        }
        await new Promise(resolve => setTimeout(resolve, 300));
        currentRetry++;
    }

    if (resultLink) {
        console.log('[DNumberSearch] Clicking result link.');
        resultLink.click();
    } else {
        console.error(`[DNumberSearch] FATAL: Could not find result link for D-Number ${dNumber}.`);
    }
}
// --- New function to handle D-Number Search (End) ---

// --- Custom Reminder Functions (Rest of file remains unchanged) ---

function fetchCustomReminders() {
    if (!chrome.runtime || !chrome.runtime.id) return; // Context guard
    chrome.storage.sync.get({customReminders: []}, function(data) {
        if (chrome.runtime.lastError) {
            console.error("[ContentScript Prisma] Error fetching custom reminders:", chrome.runtime.lastError);
            activeCustomReminders = [];
            return;
        }
        activeCustomReminders = data.customReminders.filter(r => r.enabled);
        // console.log("[ContentScript Prisma] Fetched active custom reminders:", activeCustomReminders);
        // Resetting shownCustomReminderIds here might be too broad if only one reminder setting changed.
        // However, the message listener for "customRemindersUpdated" already clears it, which is often sufficient.
    });
}

function wildcardToRegex(pattern) {
    // Escape regex special chars
    let escapedPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    // If no wildcard '*' is present in the original pattern, assume it means 'contains'
    // So, add '.*' to the beginning and end of the escaped pattern.
    // Otherwise, just convert user-defined '*' to '.*'
    if (!pattern.includes('*')) {
        escapedPattern = '.*' + escapedPattern + '.*';
    } else {
        // Convert user-defined '*' to '.*'
        escapedPattern = escapedPattern.replace(/\*/g, '.*');
    }
    // Always ensure the regex is case-insensitive for URL matching, and still use ^$ to match the whole URL against the pattern
    return new RegExp('^' + escapedPattern + '$', 'i'); // Added 'i' flag for case-insensitivity
}

function createCustomReminderPopup(reminder) {
    // const popupId = 'custom-reminder-popup-' + reminder.id; // Old ID
    if (document.getElementById('custom-reminder-display-popup')) { // Check for the new generic ID
        // console.log(`[ContentScript Prisma] Custom reminder popup for ${reminder.name} already exists or another custom reminder is shown.`);
        return; // Avoid showing multiple custom popups if one is already up with the generic ID
    }

    // addReminderStyles(); // Ensure styles are loaded // Removed call

    const overlay = document.createElement('div');
    overlay.className = 'reminder-overlay';
    overlay.id = 'custom-reminder-overlay-' + reminder.id; // Keep overlay ID specific for now
    // Ensure overlay doesn't stack if multiple custom popups appear (though shownCustomReminderIds should prevent this)
    // And also check generic overlays from meta/ias
    if (!document.querySelector('.reminder-overlay')) { // Simpler check: if ANY .reminder-overlay exists, don't add another one if this logic is flawed
        document.body.appendChild(overlay);
    } else if (!document.getElementById(overlay.id)) { // Only add if this specific overlay isn't already there
        // If an overlay for another reminder (meta, ias, or another custom) is already there,
        // this new custom popup will appear over it, which is fine.
        // The z-index for popups is higher than overlays.
        // We still append this specific overlay to ensure its removal logic is tied to this popup.
        document.body.appendChild(overlay);
    }


    const popup = document.createElement('div');
    popup.id = 'custom-reminder-display-popup'; // Standardized ID

    // Inline styles are removed, will be handled by addReminderStyles

    popup.innerHTML = `
        <h3>${escapeHTML(reminder.name)}</h3>
        ${reminder.popupMessage}
        <button id="custom-reminder-display-close">Got it!</button>
    `;
    document.body.appendChild(popup);

    const closeButton = document.getElementById('custom-reminder-display-close'); // Use new ID
    closeButton.addEventListener('click', () => {
        if (popup.parentNode) popup.parentNode.removeChild(popup);
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay); // Remove its specific overlay
        // shownCustomReminderIds.add(reminder.id) happens in checkCustomReminders, which is correct.
        console.log(`[ContentScript Prisma] Custom reminder popup for ${reminder.name} closed by user.`);
    });
    console.log(`[ContentScript Prisma] Custom reminder popup created for: ${reminder.name}`);
}


function handleGmiChatButton() {
    const workflowWidget = document.querySelector('.workflow-widget-wrapper');
    if (!workflowWidget || workflowWidget.querySelector('.gmi-chat-button')) {
        return; // Exit if the widget doesn't exist or the button is already there
    }

    const gmiChatButton = document.createElement('button');
    gmiChatButton.textContent = 'GMI Chat';
    gmiChatButton.className = 'filter-button prisma-paste-button gmi-chat-button';

    gmiChatButton.addEventListener('click', () => {
        const clientNameElement = document.querySelector('#gwt-debug-0-idesk-csl-product-label');
        const campaignNameElement = document.querySelector('#gwt-debug-campaign-name');

        const clientName = clientNameElement ? clientNameElement.textContent.trim() : 'CLIENT_NAME_HERE';
        const campaignName = campaignNameElement ? campaignNameElement.getAttribute('title').trim() : 'CAMPAIGN_NAME_HERE';
        const currentUrl = window.location.href;

        const message = `${clientName} - ${campaignName}`;
        const teamsUrl = `https://teams.microsoft.com/l/chat/0/0?users=edwin.balagopalan@wppmedia.com,ellie.vigors@wppmedia.com,harry.barnes@wppmedia.com,isobel.shaw@wppmedia.com,jett.hudson@wppmedia.com,lauren.pringle@wppmedia.com,matt.akerman@wppmedia.com,mihaela.lupu@wppmedia.com,rita.bressi@wppmedia.com,santiago.feberero@wppmedia.com,scott.moore@wppmedia.com,shreya.gurung@wppmedia.com,trish.costa@wppmedia.com&message=${encodeURIComponent(message)}%20${encodeURIComponent(currentUrl)}`;

        window.open(teamsUrl, '_blank');
    });

    workflowWidget.appendChild(gmiChatButton);
}


function checkCustomReminders() {
    console.log("[ContentScript Prisma] Running checkCustomReminders...");
    if (activeCustomReminders.length === 0) {
        console.log("[ContentScript Prisma] No active custom reminders to check.");
        return;
    }

    // If a custom reminder is already displayed using the generic ID, don't try to show another one.
    if (document.getElementById('custom-reminder-display-popup')) {
        console.log("[ContentScript Prisma] Another custom reminder popup is already visible. Skipping further checks.");
        // Log which reminder is being skipped IF we were iterating, but here we are aborting early.
        // To log the specific reminder that would have been shown, this check needs to be inside the loop.
        // However, the current logic is to prevent ANY new custom reminder if one is up.
        return;
    }

    const currentUrl = window.location.href;
    const pageText = document.body.innerText.toLowerCase(); // For case-insensitive search

    for (const reminder of activeCustomReminders) {
        console.log("[ContentScript Prisma] Checking custom reminder:", reminder.name, "ID:", reminder.id);
        console.log("[ContentScript Prisma] Current URL:", currentUrl);
        console.log("[ContentScript Prisma] Reminder URL Pattern:", reminder.urlPattern);

        if (shownCustomReminderIds.has(reminder.id)) {
            console.log("[ContentScript Prisma] Reminder", reminder.name, "already shown on this page load. Skipping.");
            continue;
        }

        // Moved this check inside the loop so we can log which reminder is skipped due to an existing popup
        if (document.getElementById('custom-reminder-display-popup')) {
            console.log("[ContentScript Prisma] Another custom reminder popup is already visible. Skipping reminder:", reminder.name);
            // Since custom popups now use a generic ID, we should break after finding the first one to show.
            // This prevents multiple custom reminders from trying to use the same popup ID simultaneously.
            break;
        }

        const urlRegex = wildcardToRegex(reminder.urlPattern);
        console.log("[ContentScript Prisma] Generated Regex:", urlRegex.toString());
        const urlMatches = urlRegex.test(currentUrl);
        console.log("[ContentScript Prisma] URL Match Result:", urlMatches);

        if (urlMatches) {
            console.log("[ContentScript Prisma] Reminder Text Trigger:", reminder.textTrigger);
            let textMatch = false;
            if (reminder.textTrigger && reminder.textTrigger.trim() !== '') {
                const triggerTexts = reminder.textTrigger.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length > 0);
                if (triggerTexts.length > 0) {
                    if (triggerTexts.some(text => {
                        const pageIncludesText = pageText.includes(text);
                        // console.log(`[ContentScript Prisma] Checking page text for: "${text}", Found: ${pageIncludesText}`); // Potentially too verbose
                        return pageIncludesText;
                    })) {
                        textMatch = true;
                    }
                } else {
                     textMatch = true; // Text trigger was defined but empty after trim/split (e.g. ", ,") means match.
                }
            } else {
                textMatch = true; // No text trigger defined, URL match is enough
            }
            console.log("[ContentScript Prisma] Text Match Result:", textMatch);

            if (textMatch) {
                console.log("[ContentScript Prisma] Conditions MET for custom reminder:", reminder.name);
                createCustomReminderPopup(reminder);
                shownCustomReminderIds.add(reminder.id);
                // Since custom popups now use a generic ID, we should break after finding the first one to show.
                // This prevents multiple custom reminders from trying to use the same popup ID simultaneously.
                break;
            }
        }
    }
    console.log("[ContentScript Prisma] Finished checkCustomReminders.");
}

function handleCampaignManagementFeatures() {
    if (!window.location.href.includes('osModalId=prsm-cm-cmpadd')) {
        return;
    }

    if (!chrome.runtime || !chrome.runtime.id) return; // Context guard
    chrome.storage.sync.get(['hidingSectionsEnabled', 'automateFormFieldsEnabled'], (data) => {
        if (chrome.runtime.lastError) return; // Error guard
        if (data.hidingSectionsEnabled !== false) {
            // Hide sections
            const objectiveSection = document.querySelector('fieldset.sectionObjective');
            if (objectiveSection) {
                objectiveSection.style.display = 'none';
            }
            const targetingSection = document.querySelector('fieldset.sectionTargeting');
            if (targetingSection) {
                targetingSection.style.display = 'none';
            }

            // Hide Flighting section
            const flightingSelect = document.querySelector('#gwt-debug-distribution');
            if (flightingSelect) {
                const controlGroupDiv = flightingSelect.parentElement;
                if (controlGroupDiv) {
                    const outerDiv = controlGroupDiv.parentElement;
                    if (outerDiv) {
                        outerDiv.style.display = 'none';
                    }
                }
            }
        }

        if (data.automateFormFieldsEnabled !== false) {
            // Automate Media Mix field
            const mediaTypeSelect = document.getElementById('debug-mediaMix-mediaType0'); // Corrected ID
            if (mediaTypeSelect && !mediaMixAutomated) {
                const onlineOption = mediaTypeSelect.querySelector('option[value="media_digital"]');
                if (onlineOption) {
                    mediaTypeSelect.value = 'media_digital';
                    mediaTypeSelect.dispatchEvent(new Event('change', { bubbles: true }));
                    mediaTypeSelect.dispatchEvent(new Event('input', { bubbles: true })); // For Knockout.js
                    mediaMixAutomated = true;
                }
            }

            // Automate Budget Type field
            const budgetTypeSelect = document.getElementById('gwt-debug-budgetType'); // Corrected ID
            if (budgetTypeSelect && !budgetTypeAutomated) {
                const totalCostOption = budgetTypeSelect.querySelector('option[value="3"]');
                if (totalCostOption) {
                    budgetTypeSelect.value = '3';
                    budgetTypeSelect.dispatchEvent(new Event('change', { bubbles: true }));
                    budgetTypeSelect.dispatchEvent(new Event('input', { bubbles: true })); // For Knockout.js
                    budgetTypeAutomated = true;
                }
            }
        }
    });
}

// --- Approver Pasting Feature (Rest of file remains unchanged) ---

function handleApproverPasting() {
    const selectors = {
        toLabel: 'label',
        selectContainer: '.select2-choices',
        firstResult: '.select2-result-selectable'
    };

    // Find the "To" label on the page
    const toLabel = Array.from(document.querySelectorAll(selectors.toLabel)).find(label => label.textContent.trim() === 'To');

    if (!toLabel) {
        return; // 'To:' label not found, so do nothing.
    }

    const buttonContainer = toLabel.parentNode;

    // Check if the buttons are already added
    if (buttonContainer.querySelector('.filter-button')) {
        return;
    }

    // Create and add the "Paste approvers" button
    const pasteButton = document.createElement('button');
    pasteButton.textContent = 'Paste Approvers';
    pasteButton.className = 'filter-button prisma-paste-button';
    pasteButton.style.marginLeft = '10px';

    const pasteFavouritesButton = document.createElement('button');
    pasteFavouritesButton.textContent = 'Favourites';
    pasteFavouritesButton.className = 'filter-button prisma-paste-button';
    pasteFavouritesButton.style.marginLeft = '5px';

    pasteButton.addEventListener('click', async () => {
        console.log('[Paste Logic] Start');
        pasteButton.disabled = true;
        pasteButton.textContent = 'Pasting...';
        let originalClipboard = '';

        try {
            // 1. Read the full list of emails from the clipboard.
            const initialResponse = await chrome.runtime.sendMessage({ action: 'getClipboardText' });
            console.log('[Paste Logic] Read initial clipboard:', initialResponse);

            if (initialResponse.status !== 'success' || !initialResponse.text) {
                console.error('Could not read clipboard.');
                return;
            }
            originalClipboard = initialResponse.text;

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            const emails = originalClipboard.split(/[\n,;]+/).map(e => e.trim()).filter(e => emailRegex.test(e));
            console.log(`[Paste Logic] Found ${emails.length} valid emails.`);

            if (emails.length > 0) {
                await pasteEmails(emails);
            }

        } catch (error) {
            console.error('[Paste Logic] Error during paste operation:', error);
        } finally {
            // 4. Restore original clipboard.
            if (originalClipboard) {
                console.log('[Paste Logic] Restoring original clipboard.');
                await chrome.runtime.sendMessage({ action: 'copyToClipboard', text: originalClipboard });
            }
            pasteButton.disabled = false;
            pasteButton.textContent = 'Paste Approvers';
            console.log('[Paste Logic] End');
        }
    });


    pasteFavouritesButton.addEventListener('click', async () => {
        pasteFavouritesButton.disabled = true;
        pasteFavouritesButton.textContent = 'Pasting...';

        try {
            const response = await chrome.runtime.sendMessage({ action: 'getFavouriteApprovers' });
            if (response.status === 'success') {
                await pasteEmails(response.emails);
            }
        } catch (error) {
            console.error('Error pasting favourite approvers:', error);
        } finally {
            pasteFavouritesButton.disabled = false;
            pasteFavouritesButton.textContent = 'Favourites';
        }
    });

    async function pasteEmails(emails) {
        for (const email of emails) {
            console.log(`[Paste Logic] Processing: ${email}`);
            await chrome.runtime.sendMessage({ action: 'copyToClipboard', text: email });
            const selectContainer = document.querySelector(selectors.selectContainer);
            if (selectContainer) {
                selectContainer.click();
            } else {
                console.error('[Paste Logic] Cannot find .select2-choices container.');
                break;
            }
            try {
                await waitForElement('.select2-search-field input', 500);
            } catch (error) {
                console.warn('[Paste Logic] Did not find select2 search input after click.', error);
            }
            document.execCommand('paste');
            try {
                const firstResult = await waitForElement(selectors.firstResult);
                firstResult.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                await waitForElementToDisappear(selectors.firstResult);
            } catch (error) {
                console.warn('[Paste Logic] No search result found to click or it did not disappear.', error);
            }
        }
    }

    // Insert the button after the "To:" label
    toLabel.parentNode.insertBefore(pasteButton, toLabel.nextSibling);
    toLabel.parentNode.insertBefore(pasteFavouritesButton, pasteButton.nextSibling);
}

function handleManageFavouritesButton() {
    const clearButton = Array.from(document.querySelectorAll('button.btn-link.mo-btn-link')).find(btn => btn.textContent.trim() === 'Clear');
    if (!clearButton) {
        return;
    }

    const buttonContainer = clearButton.parentNode;
    if (buttonContainer.querySelector('.manage-favourites-button')) {
        return;
    }

    const manageFavouritesButton = document.createElement('button');
    manageFavouritesButton.textContent = 'Manage Favourites';
    manageFavouritesButton.className = 'btn-link mo-btn-link manage-favourites-button';

    manageFavouritesButton.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'openApproversPage' });
    });

    clearButton.parentNode.insertBefore(manageFavouritesButton, clearButton.nextSibling);
}

// --- End Custom Reminder Functions (Rest of file remains unchanged) ---

function shouldReplaceLogoOnThisPage() {
    if (typeof window === 'undefined' || !window.location || !window.location.href) {
        return false; // Guard against test environments where window/location might not be fully available
    }
    const url = window.location.href;
    // Updated condition:
    return url.includes('aura.mediaocean.com') || url.includes('prisma.mediaocean.com');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mainContentScriptInit);
} else {
    mainContentScriptInit();
}

function mainContentScriptInit() {
    console.log("[ContentScript Prisma] DOMContentLoaded or already loaded. Initializing checks.");
    if (shouldReplaceLogoOnThisPage()) {
        fetchCustomReminders(); // Fetch initial set of custom reminders
        checkAndReplaceLogo();
        setTimeout(() => {
            checkForMetaConditions();
            checkForIASConditions();
            checkCustomReminders(); // Initial check for custom reminders
            handleCampaignManagementFeatures();
        }, 2000);
    }

    const observer = new MutationObserver(function(mutations) {
        if (shouldReplaceLogoOnThisPage()) {
            checkAndReplaceLogo();
            // No need to iterate mutations for these checks, just run them if any mutation occurred
            setTimeout(() => { // Debounce/delay slightly
                checkForMetaConditions();
                checkForIASConditions();
                checkCustomReminders(); // Check for custom reminders on DOM changes
                handleCampaignManagementFeatures();
                handleApproverPasting();
                handleManageFavouritesButton();
                handleGmiChatButton();
            }, 300);
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log("[ContentScript Prisma] Message received in listener:", request);

    if (request.action === "checkLogoReplaceEnabled") {
        console.log("[ContentScript Prisma] 'checkLogoReplaceEnabled' action received.");
        if (shouldReplaceLogoOnThisPage()) {
            checkAndReplaceLogo();
        }
        sendResponse({status: "Logo check processed by content script"});
    } else if (request.action === "showMetaReminder") {
        console.log("[ContentScript Prisma] 'showMetaReminder' action received. Attempting to create popup.");
        metaReminderDismissed = false;
        window.forceShowMetaReminder = true;
        checkForMetaConditions();
        sendResponse({status: "Meta reminder shown by content script"});
        console.log("[ContentScript Prisma] Response sent for 'showMetaReminder'.");
    } else if (request.action === "customRemindersUpdated") {
        console.log("[ContentScript Prisma] Received 'customRemindersUpdated' message. Re-fetching reminders.");
        fetchCustomReminders();
        shownCustomReminderIds.clear(); // Allow all reminders to be shown again as settings/list might have changed
        checkCustomReminders(); // Optional: re-check immediately after update
        sendResponse({status: "Custom reminders re-fetched and IDs reset by content script"});
    } else if (request.action === "performDNumberSearch" && request.dNumber) { // <--- ADDED LOGIC FOR D-NUMBER SEARCH
        handleDNumberSearch(request.dNumber)
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
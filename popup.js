function formatTimeRemaining(deadline) {
    if (!deadline) return '';
    const now = new Date().getTime();
    const remaining = deadline - now;

    if (remaining <= 0) {
        return " - Expired";
    }

    const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) {
        return ` - ${days} day${days !== 1 ? 's' : ''} left`;
    }
    if (hours > 0) {
        return ` - ${hours} hour${hours !== 1 ? 's' : ''} left`;
    }
    return " - Less than an hour left";
}

document.addEventListener('DOMContentLoaded', function() {
    chrome.storage.local.get(['timeBombActive', 'initialDeadline'], function(data) {
        const versionLink = document.getElementById('version-link');
        const manifest = chrome.runtime.getManifest();
        let versionText = `r${manifest.version}`;

        if (data.timeBombActive) {
            versionText += ' - Features Disabled';
            if (versionLink) {
                versionLink.classList.add('disabled-version');
            }
            // Disable all interactive elements except settings
            document.querySelectorAll('button, input, textarea, a').forEach(el => {
                const allowedIds = ['openSettingsPage', 'feedback-link'];
                if (!allowedIds.includes(el.id)) {
                     el.disabled = true;
                     el.style.pointerEvents = 'none';
                     el.style.opacity = '0.5';
                }
            });
            const feedbackLink = document.getElementById('feedback-link');
            if (feedbackLink) {
                feedbackLink.textContent = 'Submit feedback / ask for reinstall';
            }
        } else {
             versionText += formatTimeRemaining(data.initialDeadline);
        }

        if (versionLink) {
            versionLink.textContent = versionText;
            versionLink.addEventListener('click', () => {
                chrome.tabs.create({ url: chrome.runtime.getURL('toolshed.html') });
            });
        }
    });

    const generateUrlButton = document.getElementById('generateUrl');
    // const logoToggle = document.getElementById('logoToggle'); // Removed
    // const metaReminderToggle = document.getElementById('metaReminderToggle'); // Removed
    // const timesheetReminderToggle = document.getElementById('timesheetReminderToggle'); // Removed
    // const settingsToggle = document.getElementById('settingsToggle'); // Removed
    // const settingsContent = document.getElementById('settingsContent'); // Removed
    // const settingsIcon = settingsToggle.querySelector('i'); // Removed
    const triggerTimesheetReminderButton = document.getElementById('triggerTimesheetReminder');
    const triggerMetaReminder = document.getElementById('triggerMetaReminder');
    // const reminderDay = document.getElementById('reminderDay'); // Removed
    // const reminderTime = document.getElementById('reminderTime'); // Removed
    // const reminderSettings = document.getElementById('reminderSettings'); // Removed
    // const saveReminderSettingsButton = document.getElementById('saveReminderSettings'); // Removed
    // const reminderUpdateMessage = document.getElementById('reminderUpdateMessage'); // Removed

    console.log("[Popup Load] DOMContentLoaded event fired.");

    // Event Listeners

    // --- Settings UI related initializations and event listeners are removed ---

    if(generateUrlButton) generateUrlButton.addEventListener('click', handleGenerateUrl);

    const openCampaignDNumberButton = document.getElementById('openCampaignDNumber');
    if (openCampaignDNumberButton) {
        openCampaignDNumberButton.addEventListener('click', handleOpenCampaignDNumber);
    }

    const dNumberInput = document.getElementById('dNumber');
    if (dNumberInput) {
        dNumberInput.addEventListener('keydown', function(event) {
            if (event.key === 'Enter') {
                event.preventDefault(); // Stop default form submission
                handleOpenCampaignDNumber();
            }
        });
    }
    // Event listeners for logoToggle, metaReminderToggle, timesheetReminderToggle, reminderDay, reminderTime, settingsToggle, saveReminderSettingsButton are removed.

    if (triggerTimesheetReminderButton) {
        triggerTimesheetReminderButton.addEventListener('click', function() {
            console.log("Trigger timesheet button clicked");
            chrome.runtime.sendMessage({action: "showTimesheetNotification"}, function(response) {
                if (chrome.runtime.lastError) {
                    console.error("Error sending message for timesheet notification:", chrome.runtime.lastError.message);
                } else {
                    console.log("Timesheet reminder triggered:", response?.status || "No response");
                }
            });
        });
    }

    if (triggerMetaReminder) {
        triggerMetaReminder.addEventListener('click', function() {
            console.log("Trigger Meta Reminder button clicked");
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                if (tabs.length > 0 && tabs[0].id) {
                    chrome.tabs.sendMessage(tabs[0].id, { action: "showMetaReminder" }, function(response) {
                        if (chrome.runtime.lastError) {
                            console.error("Error sending message for meta reminder:", chrome.runtime.lastError.message);
                            alert('Could not trigger the Meta reminder. Please make sure you are on a Prisma page.');
                        } else {
                            console.log("Meta reminder triggered:", response?.status || "No response");
                        }
                    });
                } else {
                     console.error("Could not find active tab to send message.");
                }
            });
        });
    }

    // Logic for saveReminderSettingsButton is removed.

    const metaBillingCheckButton = document.getElementById('metaBillingCheckButton');
    if (metaBillingCheckButton) {
        metaBillingCheckButton.addEventListener('click', function() {
            // Send a message to the background script to initiate the check.
            // The background script will handle the URL check and script injection.
            chrome.runtime.sendMessage({ action: "metaBillingCheck" }, (response) => {
                if (chrome.runtime.lastError) {
                    // This could happen if the background script has an error.
                    console.error("Error messaging background script:", chrome.runtime.lastError.message);
                    alert("An error occurred. Check the extension's console for details.");
                } else if (response && response.status === 'error') {
                    // Handle specific errors reported by the background script, like wrong URL.
                    alert(response.message);
                }
            });
        });
    }

    addClickListener('prismaApproversButton', 'approvers.html');
    addClickListener('prismaButton', 'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=cm-dashboard&route=campaigns');
    addClickListener('metaHandbookButton', 'https://insidemedia.sharepoint.com/sites/GRM-UK-GMS/SitePages/Prisma-x-Meta-Integration-Support.aspx');
    addClickListener('timesheetsButton', 'https://groupmuk-aura.mediaocean.com/viewport-home/#osAppId=rod-time&osPspId=rod-time&route=time/display/myTimesheets/ToDo');
    addClickListener('approvalsButton', 'https://groupmuk-aura.mediaocean.com/viewport-home/#osAppId=rod-time&osPspId=rod-time&route=time/display/myTimesheetApprovals/AwaitingMe');
    addClickListener('officeHoursButton', 'https://myofficedays.netlify.app/');
    addClickListener('approversListButton', 'https://insidemedia.sharepoint.com/:x:/s/TPO-SharePoint/EYxRbLkQU_xLpMSvnQQFIt4Bug1w9CJupONy6sIdr6IuFw?email=harry.barnes%40wppmedia.com&e=Mi9JPh');
    addClickListener('tpoSharepointButton', 'https://insidemedia.sharepoint.com/sites/TPO-SharePoint');
    addClickListener('addCampaignButton', 'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=cm-dashboard&route=campaigns&osModalId=prsm-cm-cmpadd&osMOpts=lb');
    addClickListener('opsDreButton', 'https://opsguide.netlify.app/');

    addClickListener('ngmclonButton', 'https://groupmuk-prisma.mediaocean.com/ideskos-viewport/launchapp?workflowid=buyers-workflow&moduleid=prsm-cm-spa&context=eyJ0byI6eyJpZCI6IjM1LVJFSUtXWEgtNiIsInN1YkNvbnRleHQiOnsiaWQiOiJOR01DTE9OIn19LCJmcm9tIjp7ImlkIjoiMzUtUkVJS1dYSC02Iiwic3ViQ29udGV4dCI6eyJpZCI6Ik5HTUNJTlQifX19');
    addClickListener('ngmcintButton', 'https://groupmuk-prisma.mediaocean.com/ideskos-viewport/launchapp?workflowid=buyers-workflow&moduleid=prsm-cm-spa&context=eyJ0byI6eyJpZCI6IjM1LVJFSUtXWEgtNiIsInN1YkNvbnRleHQiOnsiaWQiOiJOR01DSU5UIn19LCJmcm9tIjp7ImlkIjoiMzUtUkVJS1dYSC02Iiwic3ViQ29udGV4dCI6eyJpZCI6Ik5HTUNJTlQifX19');
    addClickListener('ngmcscoButton', 'https://groupmuk-prisma.mediaocean.com/ideskos-viewport/launchapp?workflowid=buyers-workflow&moduleid=prsm-cm-spa&context=eyJ0byI6eyJpZCI6IjM1LVJFSUtXWEgtNiIsInN1YkNvbnRleHQiOnsiaWQiOiJOR01DU0NPIn19LCJmcm9tIjp7ImlkIjoiMzUtUkVJS1dYSC02Iiwic3ViQ29udGV4dCI6eyJpZCI6Ik5HTUNJTlQifX19');
    addClickListener('ngopenButton', 'https://groupmuk-prisma.mediaocean.com/ideskos-viewport/launchapp?workflowid=buyers-workflow&moduleid=prsm-cm-spa&context=eyJ0byI6eyJpZCI6IjM1LVJFSUtXWEgtNiIsInN1YkNvbnRleHQiOnsiaWQiOiJOR09QRU4ifX0sImZyb20iOnsiaWQiOiIzNS1SRUlLV1hILTYiLCJzdWJDb250ZXh0Ijp7ImlkIjoiTkdNQ0lOVCJ9fX0=');

    // Setup navigation for settings and toolshed pages
    addNavigationClickListener('openSettingsPage', () => {
        chrome.runtime.openOptionsPage(
            () => {
                if (chrome.runtime.lastError) {
                    console.error('Error opening options page:', chrome.runtime.lastError);
                    // Fallback if openOptionsPage is not set up or fails
                    chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
                }
            }
        );
    });

    addNavigationClickListener('openToolshedPage', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('toolshed.html') });
    });
});

// Removed setLogoToggleState, setMetaReminderToggleState, setTimesheetReminderToggleState functions

function handleOpenCampaignDNumber() {
    const dNumberInput = document.getElementById('dNumber');
    const dNumberError = document.getElementById('dNumberError');
    if (!dNumberInput || !dNumberError) return;

    // Get value, trim whitespace, and convert to uppercase
    let campaignNumber = dNumberInput.value.trim().toUpperCase();

    // Remove revision suffixes like -R0, -R1, etc.
    campaignNumber = campaignNumber.replace(/-R\d+$/, '');

    // A D-number is 'D' + 8 digits. An O-number is 'O-' + 5 alphanumeric chars.
    if (!/^(D\d{8}|O-[A-Z0-9]{5})$/.test(campaignNumber)) {
        dNumberError.textContent = 'Invalid format: use D followed by 8 digits, or O- followed by 5 chars.';
        dNumberError.classList.remove('hidden');
    } else {
        dNumberError.classList.add('hidden');
        // The message action is still called "performDNumberSearch" but now sends a generic campaignNumber
        chrome.runtime.sendMessage({ action: "performDNumberSearch", dNumber: campaignNumber }, (response) => {
            if (chrome.runtime.lastError) {
                dNumberError.textContent = `Error: ${chrome.runtime.lastError.message}`;
                dNumberError.classList.remove('hidden');
                return;
            }
            if (response && response.status === 'error') {
                dNumberError.textContent = `Error: ${response.message}`;
                dNumberError.classList.remove('hidden');
                return;
            }
            // On success, the background script opens a new tab, so we can just close the popup.
            window.close();
        });
    }
}

function handleGenerateUrl() {
    const campaignIdInput = document.getElementById('campaignId');
    const campaignDateInput = document.getElementById('campaignDate');
    if (!campaignIdInput || !campaignDateInput) return;

    const campaignId = campaignIdInput.value;
    const campaignDateStr = campaignDateInput.value.trim();

    const finalUrl = generateUrlFromData(campaignId, campaignDateStr);

    if (finalUrl) {
        chrome.tabs.create({ url: finalUrl });
    } else if (!campaignId) {
        alert('Please enter a Campaign ID.');
    } else {
        alert("Could not parse date: '" + campaignDateStr + "'. Please use formats like 'July 25', '07/25', 'July 2025', '07/2025', '2025-07', or leave blank for current month.");
    }
}

function generateUrlFromData(campaignId, campaignDateStr) {
    if (!campaignId) {
        return null;
    }

    let dateToUse = new Date();
    dateToUse.setDate(1);

    if (campaignDateStr) {
        let parsedDate;
        const currentYear = new Date().getFullYear();
        const currentCentury = Math.floor(currentYear / 100) * 100;

        const monthShortYearMatch = campaignDateStr.match(/^([a-zA-Z]+) (\d{2})$/i);
        if (monthShortYearMatch) {
            parsedDate = new Date(monthShortYearMatch[1] + " 1, " + (currentCentury + parseInt(monthShortYearMatch[2], 10)));
        } else {
            const slashMonthShortYearMatch = campaignDateStr.match(/^(\d{1,2})\/(\d{2})$/);
            if (slashMonthShortYearMatch) {
                parsedDate = new Date(currentCentury + parseInt(slashMonthShortYearMatch[2], 10), parseInt(slashMonthShortYearMatch[1], 10) - 1, 1);
            } else {
                const monthFullYearMatch = campaignDateStr.match(/^([a-zA-Z]+) (\d{4})$/i);
                if (monthFullYearMatch) {
                    parsedDate = new Date(monthFullYearMatch[1] + " 1, " + monthFullYearMatch[2]);
                } else {
                    const slashMonthFullYearMatch = campaignDateStr.match(/^(\d{1,2})\/(\d{4})$/);
                    if (slashMonthFullYearMatch) {
                        parsedDate = new Date(parseInt(slashMonthFullYearMatch[2], 10), parseInt(slashMonthFullYearMatch[1], 10) - 1, 1);
                    } else {
                        const isoMatch = campaignDateStr.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
                        if (isoMatch) {
                            parsedDate = new Date(parseInt(isoMatch[1], 10), parseInt(isoMatch[2], 10) - 1, 1);
                        }
                    }
                }
            }
        }

        if (parsedDate && !isNaN(parsedDate)) {
            dateToUse = parsedDate;
        } else {
            return null; // Invalid date format
        }
    }

    const formattedDate = `${dateToUse.getFullYear()}-${String(dateToUse.getMonth() + 1).padStart(2, '0')}-01`;
    const baseUrl = 'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=prsm-cm-buy&campaign-id=';
    return `${baseUrl}${encodeURIComponent(campaignId)}&route=actualize&mos=${formattedDate}`;
}

// Removed handleLogoToggle, handleMetaReminderToggle, handleTimesheetReminderToggle,
// handleReminderDayChange, handleReminderTimeChange, updateTimeOptions, and updateAlarm functions.
// Note: If `updateAlarm` or parts of it were used by other functionalities not being removed,
// those parts would need to be preserved or refactored. Based on the current context,
// they seem exclusively tied to the removed settings UI.

/**
 * Adds a click listener to a link-like element (e.g., <a>).
 * Prevents the default link navigation and executes a custom handler.
 * @param {string} id The ID of the DOM element.
 * @param {function} clickHandler The function to execute on click.
 */
function addNavigationClickListener(id, clickHandler) {
    const element = document.getElementById(id);
    if (element) {
        element.addEventListener('click', (event) => {
            event.preventDefault();
            clickHandler(event);
        });
    }
}

function addClickListener(id, url) {
    const button = document.getElementById(id);
    if (button) {
        button.addEventListener('click', () => {
            // console.log(`Button ${id} clicked`); // Less verbose logging for general buttons
            if (url) {
                chrome.tabs.create({ url: url });
            }
        });
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { handleGenerateUrl, generateUrlFromData };
}

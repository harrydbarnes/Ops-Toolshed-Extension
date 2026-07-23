const FEATURE_SETTING_KEYS = [
    'logoReplaceEnabled',
    'statsCollectorEnabled',
    'loadingFactsEnabled',
    'appLearnReplaceEnabled',
    'optimisedNewNavEnabled',
    'ordersShortcutEnabled',
    'actualiseShortcutEnabled',
    'actualiseNavbarEnabled',
    'bannerUsernameEnabled',
    'approverWidgetPlacementEnabled',
    'quickCampaignActionsEnabled',
    'budgetWidgetOptimisedEnabled',
    'campaignNameQuickCopyEnabled',
    'campaignHeaderQuickCopyEnabled',
    'campaignDateShortcutEnabled',
    'actualiseScrollRestoreEnabled',
    'gmiChatShortcutEnabled',
    'autoCopyUrlEnabled',
    'orderIdCopyEnabled',
    'newOrderUiOptimisationEnabled',
    'addCampaignShortcutEnabled',
    'hidingSectionsEnabled',
    'automateFormFieldsEnabled',
    'approverWidgetOptimiseEnabled',
    'countPlacementsSelectedEnabled',
    'swapAccountsEnabled',
    'alwaysShowCommentsEnabled',
    'fontSizeToggleEnabled',
    'resizableChatToggleEnabled',
    'scheduledChatToggleEnabled',
    'metaReminderEnabled',
    'iasReminderEnabled',
    'timesheetReminderEnabled'
];

function buildDisabledFeatureState(currentSettings) {
    const backup = {};
    const disabledSettings = {};

    FEATURE_SETTING_KEYS.forEach(key => {
        backup[key] = currentSettings[key] === undefined ? true : currentSettings[key];
        disabledSettings[key] = false;
    });

    const customReminders = Array.isArray(currentSettings.customReminders)
        ? currentSettings.customReminders
        : [];
    backup.customReminders = customReminders;
    disabledSettings.customReminders = customReminders.map(reminder => ({
        ...reminder,
        enabled: false
    }));

    return { backup, disabledSettings };
}

function setKillSwitchAppearance(button, featuresDisabled) {
    if (!button) return;

    const label = button.querySelector('span');
    button.classList.toggle('is-off', featuresDisabled);
    button.setAttribute('aria-checked', String(featuresDisabled));
    button.title = featuresDisabled
        ? 'Restore your previous Settings features'
        : 'Turn off all Settings features';
    if (label) label.textContent = featuresDisabled ? 'Features off' : 'Features on';
}

function getMetaFinanceToolConfig(mode) {
    if (mode === 'legacy') {
        return {
            mode: 'legacy',
            label: 'Meta Billing Check',
            action: 'metaBillingCheck'
        };
    }

    return {
        mode: 'social',
        label: 'Social Booking Checker',
        extensionPage: 'social-finance.html'
    };
}

function launchMetaFinanceTool(mode, dependencies = {}) {
    const runtime = dependencies.runtime || chrome.runtime;
    const tabs = dependencies.tabs || chrome.tabs;
    const alertUser = dependencies.alertUser || (message => window.alert(message));
    const config = getMetaFinanceToolConfig(mode);

    if (config.extensionPage) {
        tabs.create({ url: runtime.getURL(config.extensionPage) });
        return;
    }

    runtime.sendMessage({ action: config.action }, response => {
        if (runtime.lastError) {
            console.error('Error messaging background script:', runtime.lastError.message);
            alertUser("Meta Billing Check couldn't start. Check the extension console for details.");
        } else if (response?.status === 'error') {
            alertUser(response.message);
        }
    });
}

function initialiseFeaturesKillSwitch() {
    const button = document.getElementById('featuresKillSwitch');
    if (!button) return;

    chrome.storage.sync.get('allFeaturesDisabled', data => {
        setKillSwitchAppearance(button, data.allFeaturesDisabled === true);
    });

    button.addEventListener('click', () => {
        button.disabled = true;
        chrome.storage.sync.get(null, currentSettings => {
            const featuresDisabled = currentSettings.allFeaturesDisabled === true;

            if (featuresDisabled) {
                const restoredSettings = currentSettings.featureKillSwitchBackup || {};
                chrome.storage.sync.set({
                    ...restoredSettings,
                    allFeaturesDisabled: false
                }, () => {
                    button.disabled = false;
                    setKillSwitchAppearance(button, false);
                });
                return;
            }

            const { backup, disabledSettings } = buildDisabledFeatureState(currentSettings);
            chrome.storage.sync.set({
                ...disabledSettings,
                featureKillSwitchBackup: backup,
                allFeaturesDisabled: true
            }, () => {
                button.disabled = false;
                setKillSwitchAppearance(button, true);
            });
        });
    });
}

document.addEventListener('DOMContentLoaded', function() {
    initialiseFeaturesKillSwitch();

    const versionLink = document.getElementById('version-link');
    const manifest = chrome.runtime.getManifest();
    if (versionLink) {
        versionLink.textContent = `r${manifest.version}`;
        versionLink.addEventListener('click', () => {
            chrome.tabs.create({ url: chrome.runtime.getURL('toolshed.html') });
        });
    }

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

    const socialFinanceReportButton = document.getElementById('socialFinanceReportButton');
    if (socialFinanceReportButton) {
        const updateMetaFinanceButton = mode => {
            const config = getMetaFinanceToolConfig(mode);
            socialFinanceReportButton.textContent = config.label;
            socialFinanceReportButton.dataset.mode = config.mode;
        };

        chrome.storage.sync.get({ metaFinanceToolMode: 'social' }, data => {
            updateMetaFinanceButton(data.metaFinanceToolMode);
        });

        socialFinanceReportButton.addEventListener('click', function() {
            chrome.storage.sync.get({ metaFinanceToolMode: 'social' }, data => {
                launchMetaFinanceTool(data.metaFinanceToolMode);
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

    // --- New Menu Handlers ---

    // Settings
    const menuSettings = document.getElementById('menu-settings');
    if (menuSettings) {
        menuSettings.addEventListener('click', () => {
             chrome.runtime.openOptionsPage(() => {
                // Fallback if openOptionsPage fails
                if (chrome.runtime.lastError) {
                    console.error('Error opening options page:', chrome.runtime.lastError);
                    chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
                }
            });
        });
    }

    // Release Notes & Roadmap
    const menuRoadmap = document.getElementById('menu-roadmap');
    if (menuRoadmap) {
        menuRoadmap.addEventListener('click', () => {
             chrome.tabs.create({ url: chrome.runtime.getURL('toolshed.html') });
        });
    }

    // Feedback
    const menuFeedback = document.getElementById('menu-feedback');
    if (menuFeedback) {
        menuFeedback.addEventListener('click', () => {
            // Check if active tab is a MediaOcean/Prisma page where we can inject the modal
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                const activeTab = tabs[0];
                // Modified: Removed sharepoint.com check as content scripts don't run there
                const isPrisma = activeTab.url && activeTab.url.includes("mediaocean.com");
                
                if (isPrisma) {
                    chrome.tabs.sendMessage(activeTab.id, { action: "openFeedbackModal" }, (response) => {
                        // If error (e.g., content script not loaded), fallback to toolshed page
                        if (chrome.runtime.lastError) {
                            chrome.tabs.create({ url: chrome.runtime.getURL('toolshed.html?feedback=true') });
                        } else {
                            window.close(); // Close popup if modal opened successfully
                        }
                    });
                } else {
                    // Not on a Prisma page, open toolshed with feedback param
                    chrome.tabs.create({ url: chrome.runtime.getURL('toolshed.html?feedback=true') });
                }
            });
        });
    }
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
    if (!isValidDNumber(campaignNumber)) {
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

function isValidDNumber(dNumber) {
    if (!dNumber) return false;
    // A D-number is 'D' + 8 digits. An O-number is 'O-' + 5 alphanumeric chars.
    return /^(D\d{8}|O-[A-Z0-9]{5})$/i.test(dNumber);
}

function isValidCampaignId(campaignId) {
    if (!campaignId) return false;
    // Starts with C (case insensitive) and is 7 characters long.
    return /^[cC].{6}$/.test(campaignId);
}

function handleGenerateUrl() {
    const campaignIdInput = document.getElementById('campaignId');
    const campaignDateInput = document.getElementById('campaignDate');
    const campaignIdError = document.getElementById('campaignIdError');
    if (!campaignIdInput || !campaignDateInput) return;

    const campaignId = campaignIdInput.value.trim();
    const campaignDateStr = campaignDateInput.value.trim();

    if (!campaignId) {
        if (campaignIdError) {
            campaignIdError.textContent = 'Please enter a Campaign ID.';
            campaignIdError.classList.remove('hidden');
        } else {
            alert('Please enter a Campaign ID.');
        }
        return;
    }

    if (!isValidCampaignId(campaignId)) {
        if (campaignIdError) {
            campaignIdError.textContent = 'Invalid Campaign ID format. Must start with C and be 7 characters long.';
            campaignIdError.classList.remove('hidden');
        } else {
            alert('Invalid Campaign ID format. Must start with C and be 7 characters long.');
        }
        return;
    }

    if (campaignIdError) {
        campaignIdError.classList.add('hidden');
    }

    const finalUrl = generateUrlFromData(campaignId, campaignDateStr);

    if (finalUrl) {
        chrome.tabs.create({ url: finalUrl });
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
    module.exports = {
        FEATURE_SETTING_KEYS,
        buildDisabledFeatureState,
        handleGenerateUrl,
        generateUrlFromData,
        isValidDNumber,
        isValidCampaignId,
        getMetaFinanceToolConfig,
        launchMetaFinanceTool
    };
}

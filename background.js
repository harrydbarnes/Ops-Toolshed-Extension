import { approversData } from './approvers-data.js';

/**
 * @fileoverview Background service worker for the Ops Toolshed extension.
 * Handles alarms, notifications, offscreen documents, and message routing.
 * Manages the "Time-Bomb" feature and Timesheet Reminders.
 */

// --- Time-Bomb Feature ---
/**
 * Configuration for the Time-Bomb feature.
 * @type {Object}
 * @property {string} enabled - 'Y' to enable, 'N' to disable.
 * @property {number} disableDay - Day of the week to disable (0=Sun, 1=Mon, etc.).
 * @property {number} disableHour - Hour of the day to disable (0-23).
 * @property {number} disableMinute - Minute of the hour to disable (0-59).
 */
const timeBombConfig = {
  enabled: 'Y', // Change to 'N' to disable
  disableDay: 2, // Tuesday (0=Sun, 1=Mon, 2=Tue, etc.)
  disableHour: 23,
  disableMinute: 59
};

/**
 * Calculates the timestamp for the next deadline based on the configuration.
 * @returns {number} The timestamp (ms) of the next deadline.
 */
function getNextDeadline() {
  const now = new Date();
  const deadline = new Date(now);
  const dayOfWeek = now.getDay();
  let daysUntil = (timeBombConfig.disableDay - dayOfWeek + 7) % 7;
  if (daysUntil === 0 && (now.getHours() > timeBombConfig.disableHour || (now.getHours() === timeBombConfig.disableHour && now.getMinutes() >= timeBombConfig.disableMinute))) {
    daysUntil = 7;
  }
  deadline.setDate(now.getDate() + daysUntil);
  deadline.setHours(timeBombConfig.disableHour, timeBombConfig.disableMinute, 0, 0);
  return deadline.getTime();
}

/**
 * Checks if the time bomb deadline has passed and updates storage.
 * If disabled via config, clears related storage.
 * @returns {Promise<void>}
 */
function checkTimeBomb() {
  if (timeBombConfig.enabled !== 'Y') {
    // If disabled in the code, clear all time bomb variables from storage.
    return chrome.storage.local.remove(['timeBombActive', 'initialDeadline']);
  }

  return chrome.storage.local.get(['initialDeadline']).then((data) => {
    let initialDeadline = data.initialDeadline;
    if (!initialDeadline) {
      initialDeadline = getNextDeadline();
    }

    const now = new Date().getTime();
    const timeBombActive = now > initialDeadline;

    // Set both values. This is simpler and ensures consistency.
    return chrome.storage.local.set({ initialDeadline, timeBombActive });
  });
}

// Set up a recurring alarm to check the time bomb status.
// The onInstalled listener will handle the initial check.
chrome.alarms.create('timeBombCheck', { periodInMinutes: 1 });
// --- End Time-Bomb Feature ---


/**
 * Listener for extension installation.
 * Initializes the time bomb check and timesheet reminder settings.
 */
chrome.runtime.onInstalled.addListener(() => {
  checkTimeBomb(); // Run on install
  if (!chrome.runtime || !chrome.runtime.id) return; // Context guard
  chrome.storage.sync.get(['timesheetReminderEnabled', 'reminderDay', 'reminderTime'], function(data) {
    if (chrome.runtime.lastError) return; // Error guard
    if (data.timesheetReminderEnabled !== false) {
      createTimesheetAlarm(data.reminderDay, data.reminderTime);
    }
    if (data.reminderDay === undefined || data.reminderTime === undefined) {
      chrome.storage.sync.set({ reminderDay: 'Friday', reminderTime: '14:30' });
    }
  });
});

/**
 * Creates a recurring alarm for the timesheet reminder.
 * @param {string} [day='Friday'] - The day of the week for the alarm (e.g., 'Friday').
 * @param {string} [time='14:30'] - The time for the alarm in HH:MM format.
 */
function createTimesheetAlarm(day, time) {
  // Default to Friday at 14:30 if day or time is undefined
  day = day || 'Friday';
  time = time || '14:30';

  const nextAlarmDate = getNextAlarmDate(day, time);
  chrome.alarms.create('timesheetReminder', {
    when: nextAlarmDate.getTime(),
    periodInMinutes: 10080 // 7 days in minutes
  });
  console.log("Alarm set for:", nextAlarmDate);
}

/**
 * Calculates the next occurrence of a specific day and time.
 * @param {string} day - The target day of the week.
 * @param {string} time - The target time in HH:MM format.
 * @returns {Date} The Date object for the next alarm.
 */
function getNextAlarmDate(day, time) {
  const now = new Date();
  const [hours, minutes] = time.split(':').map(Number);
  const dayIndex = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(day);

  let nextDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (dayIndex + 7 - now.getDay()) % 7, hours, minutes);

  if (nextDate <= now) {
    nextDate.setDate(nextDate.getDate() + 7);
  }

  return nextDate;
}

/**
 * Checks if an offscreen document with the given path is already open.
 * @param {string} path - The path of the offscreen document.
 * @returns {Promise<boolean>} True if the document exists, false otherwise.
 */
async function hasOffscreenDocument(path) {
  const matchedClients = await clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  });

  for (const client of matchedClients) {
    if (client.url.endsWith(path)) {
      return true;
    }
  }
  return false;
}

// Create the offscreen document if it doesn't exist
let creating; // A global promise to avoid racing createDocument
/**
 * Creates the offscreen document if it does not already exist.
 * Ensures only one creation process runs at a time.
 * @returns {Promise<void>}
 */
async function createOffscreenDocument() {
  // Check if we have an existing document.
  if (await hasOffscreenDocument('offscreen.html')) {
    return;
  }

  // createDocument may throw if another document is already opening.
  if (creating) {
    await creating;
  } else {
    creating = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['CLIPBOARD', 'AUDIO_PLAYBACK'],
      justification: 'Plays alarm sound and reads clipboard content',
    });
    await creating;
    creating = null; // Reset the promise once resolving.
  }
}

/**
 * Handles clipboard actions by delegating to the offscreen document.
 * @param {Object} request - The message request object.
 * @param {string} request.action - The action to perform ('getClipboardText' or 'copyToClipboard').
 * @param {string} [request.text] - The text to write to the clipboard (if applicable).
 * @param {function} sendResponse - The function to send the response back to the sender.
 */
async function handleOffscreenClipboard(request, sendResponse) {
    const { action, text } = request;
    // Map the action from the content script to the action for the offscreen document.
    const offscreenAction = action === 'getClipboardText' ? 'readClipboard' : action;

    try {
        await createOffscreenDocument();
        const response = await chrome.runtime.sendMessage({
            action: offscreenAction,
            text: text // This will be undefined for 'readClipboard' and that's OK
        });
        sendResponse(response);
    } catch (e) {
        console.error(`Error handling action ${action}:`, e);
        sendResponse({ status: 'error', message: e.message });
    }
}

/**
 * Plays the alarm sound by sending a message to the offscreen document.
 * Checks user settings before playing.
 */
async function playAlarmSound() {
  console.log("playAlarmSound function called");
  if (!chrome.runtime || !chrome.runtime.id) return; // Context guard
  chrome.storage.sync.get('timesheetReminderEnabled', async function(data) {
    if (chrome.runtime.lastError) return; // Error guard
    console.log("Timesheet reminder enabled:", data.timesheetReminderEnabled);
    if (data.timesheetReminderEnabled !== false) {
      // Create offscreen document before playing sound
      await createOffscreenDocument(); // Wait for the offscreen document

      // Send message to the offscreen document to play the sound
      chrome.runtime.sendMessage({
          action: 'playAlarm',
          sound: chrome.runtime.getURL('alarm.mp3') // Use chrome.runtime.getURL for the sound file
      }).catch(error => console.error('Error sending message to offscreen document:', error));
    }
  });
}


/**
 * Listener for alarms.
 * Triggers the time bomb check or timesheet reminder notification.
 */
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'timeBombCheck') {
    checkTimeBomb();
  } else if (alarm.name === 'timesheetReminder') {
    showTimesheetNotification(); // This will now trigger the notification and sound via offscreen document
  }
});

/**
 * Displays the timesheet reminder notification and plays a sound.
 */
async function showTimesheetNotification() {
    console.log("showTimesheetNotification function called");
    if (!chrome.runtime || !chrome.runtime.id) return; // Context guard
    chrome.storage.sync.get('timesheetReminderEnabled', async function(data) {
        if (chrome.runtime.lastError) return; // Error guard
        console.log("Timesheet reminder enabled:", data.timesheetReminderEnabled);
        if (data.timesheetReminderEnabled !== false) {
            // Trigger the sound playback via the offscreen document
            await playAlarmSound();

            chrome.notifications.create('timesheetReminder', {
                type: 'basic',
                iconUrl: 'icon.png',
                title: 'Timesheet Reminder',
                message: 'Don\'t forget to submit your timesheet!',
                buttons: [
                    { title: 'Open My Timesheets' },
                    { title: 'Snooze for 15 minutes' }
                ],
                priority: 2
            }, function(notificationId) {
                console.log("Notification created with ID:", notificationId);
                if (chrome.runtime.lastError) {
                    console.error("Error creating notification:", chrome.runtime.lastError);
                }
            });
        }
    });
}


/**
 * Listener for notification button clicks.
 * Handles opening the timesheet URL or snoozing the reminder.
 */
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (notificationId === 'timesheetReminder') {
    if (buttonIndex === 0) {
      chrome.tabs.create({ url: 'https://groupmuk-aura.mediaocean.com/viewport-home/#osAppId=rod-time&osPspId=rod-time&route=time/display/myTimesheets/ToDo' });
    } else if (buttonIndex === 1) {
      chrome.alarms.create('timesheetReminder', {
        delayInMinutes: 15
      });
    }
    chrome.notifications.clear(notificationId);
  }
});


// --- Meta Billing Check Logic ---

/**
 * Script execution function to open a campaign with a D-Number.
 * This function is injected into the page context.
 * @param {string} dNumber - The D-Number to search for.
 */
function openCampaignWithDNumberScript(dNumber) {
    // REFACTORED: findElement now accepts an optional root element to search within.
    const findElement = (selector, rootElement = document, timeout = 15000) => {
        return new Promise((resolve, reject) => {
            const intervalTime = 500;
            let elapsedTime = 0;

            const queryShadowDom = (root, selector) => {
                const element = root.querySelector(selector);
                // Check for visibility (offsetParent is a common way to check if an element is rendered)
                if (element && element.offsetParent !== null) return element;

                // Also search within shadow roots of all elements in the current root
                const allElements = root.querySelectorAll('*');
                for (const el of allElements) {
                    if (el.shadowRoot) {
                        // Important: Pass the selector down, not just search for anything.
                        const foundInShadow = queryShadowDom(el.shadowRoot, selector);
                        if (foundInShadow) return foundInShadow;
                    }
                }
                return null;
            };

            const interval = setInterval(() => {
                // Start the search from the provided rootElement
                const element = queryShadowDom(rootElement, selector);
                if (element) {
                    clearInterval(interval);
                    resolve(element);
                } else {
                    elapsedTime += intervalTime;
                    if (elapsedTime >= timeout) {
                        clearInterval(interval);
                        // Make the error message more specific about the scope
                        const scope = rootElement === document ? 'document' : rootElement.tagName;
                        reject(new Error(`Element not found or not visible: ${selector} within ${scope}`));
                    }
                }
            }, intervalTime);
        });
    };

    // REFACTORED: robustClick now accepts an optional root element.
    const robustClick = async (selector, rootElement = document) => {
        const element = await findElement(selector, rootElement);
        const mousedownEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window });
        const mouseupEvent = new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window });
        const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
        element.dispatchEvent(mousedownEvent);
        element.dispatchEvent(mouseupEvent);
        element.dispatchEvent(clickEvent);
    };

    (async () => {
        try {
            console.log("Attempting D-Number search with SCOPED waiting...");

            // 1. Click the main search icon to open the search banner. This is a global action.
            await robustClick('mo-icon[name="search"]');

            // 2. IMPORTANT: Wait for the search BANNER to appear. This is our new scope.
            // All subsequent actions will be performed inside this banner.
            const searchBanner = await findElement('mo-banner-recent-menu-content');
            console.log("Found search banner. All subsequent searches will be scoped to this element.");

            // 3. Find the search box *within the banner*.
            const searchBox = await findElement('mo-search-box', searchBanner);

            // 4. Find the mo-input *within the search box's shadow DOM*.
            const moInputWrapper = searchBox.shadowRoot.querySelector('mo-input');
            if (!moInputWrapper) {
                throw new Error('Could not find mo-input within the mo-search-box shadow DOM.');
            }

            // 5. Find the native input *within the mo-input's shadow DOM*.
            const inputField = moInputWrapper.shadowRoot.querySelector('input');
            if (!inputField) {
                throw new Error('Could not find the native input element within the mo-input shadow DOM.');
            }

            // 6. Manually focus the native input field.
            inputField.focus();

            // 7. Set the value and dispatch events.
            inputField.value = dNumber;
            inputField.dispatchEvent(new Event('input', { bubbles: true, composed: true }));

            // 8. Click the switch for D-number search *within the banner*.
            await robustClick('div.switch[role="switch"]', searchBanner);

            // 9. Click the open campaign icon *within the banner*.
            await robustClick('mo-button mo-icon[name="folder-open"]', searchBanner);

            console.log("D-Number script finished successfully.");
        } catch (error) {
            console.error('Error during D Number script execution:', error);
            alert(`Automation failed: ${error.message}`);
        }
    })();
}

/**
 * Script execution function to scrape and download CSV from Meta Ads Manager.
 * This function is injected into the page context.
 */
function scrapeAndDownloadCsv() {
    (async () => {
        const scrapingMessage = document.createElement('div');
        scrapingMessage.id = 'scraping-in-progress-message';
        Object.assign(scrapingMessage.style, {
            position: 'fixed', top: '20px', right: '20px',
            backgroundColor: 'rgba(0, 0, 0, 0.8)', color: 'white',
            padding: '15px', borderRadius: '8px', zIndex: '10001', fontSize: '16px'
        });
        document.body.appendChild(scrapingMessage);

        const cleanupUI = () => {
            if (document.getElementById('scraping-in-progress-message')) {
                document.getElementById('scraping-in-progress-message').remove();
            }
        };

        const delay = ms => new Promise(res => setTimeout(res, ms));

        try {
            scrapingMessage.innerHTML = 'Scraping data...<br>Scraped 0 rows.';
            const wantedHeaders = ["Campaign", "Starts", "Ends", "Tags", "Impressions", "Budget", "Amount spent"];
            const grid = document.querySelector('[role="table"]');
            if (!grid) throw new Error("Could not find the main data table.");

            let scrollContainer = grid.parentElement;
            while(scrollContainer && scrollContainer.scrollHeight <= scrollContainer.clientHeight && scrollContainer.tagName !== 'BODY') {
                scrollContainer = scrollContainer.parentElement;
            }
            if (!scrollContainer || scrollContainer.tagName === 'BODY') {
                scrollContainer = document.querySelector('div._7mkk') || window;
            }

            const allHeaderElements = Array.from(grid.querySelectorAll('[role="columnheader"]'));
            const allHeaderTexts = allHeaderElements.map(el => el.innerText.trim());
            const wantedHeaderInfo = wantedHeaders.map(wantedHeader => {
                const index = allHeaderTexts.findIndex(header => header.startsWith(wantedHeader));
                if (index === -1) throw new Error(`Could not find column: "${wantedHeader}"`);
                return { name: wantedHeader, index: index + 1 };
            });

            const allRowsData = [];
            const processedRowKeys = new Set();
            let consecutiveNoNewRows = 0;

            while (consecutiveNoNewRows < 3) {
                const currentScrollTop = scrollContainer.scrollTop || window.scrollY;
                const dataRowElements = Array.from(grid.querySelectorAll('._1gda'));
                if (dataRowElements.length === 0 && allRowsData.length === 0) throw new Error("Found table headers, but no data rows.");

                let newRowsFoundInThisPass = false;
                const getCellText = (cell, headerName) => {
                    if (!cell) return "";
                    let text = cell.innerText;
                    if (headerName === "Amount spent" || headerName === "Budget") return text.replace(/[£,Â]/g, '').split('\n')[0].trim();
                    if (headerName === "Ends") return text.split('\n')[0];
                    return text.replace(/\n/g, ' ').trim();
                };

                for (const rowEl of dataRowElements) {
                    const cellElements = Array.from(rowEl.querySelectorAll('._4lg0'));
                    const campaignCell = cellElements[wantedHeaderInfo.find(h => h.name === 'Campaign').index];
                    const startsCell = cellElements[wantedHeaderInfo.find(h => h.name === 'Starts').index];
                    const rowKey = (campaignCell?.innerText || '') + '||' + (startsCell?.innerText || '');

                    if (rowKey && !processedRowKeys.has(rowKey)) {
                        processedRowKeys.add(rowKey);
                        newRowsFoundInThisPass = true;
                        const rowData = {};
                        wantedHeaderInfo.forEach(info => {
                            rowData[info.name] = getCellText(cellElements[info.index], info.name);
                        });
                        allRowsData.push(rowData);
                    }
                }

                scrapingMessage.innerHTML = `Scraping data...<br>Scraped ${allRowsData.length} rows.`;
                if (newRowsFoundInThisPass) consecutiveNoNewRows = 0; else consecutiveNoNewRows++;

                if (scrollContainer === window) window.scrollBy(0, window.innerHeight * 0.8);
                else scrollContainer.scrollBy(0, scrollContainer.clientHeight * 0.8);

                await delay(1000);
                if ((scrollContainer.scrollTop || window.scrollY) === currentScrollTop && !newRowsFoundInThisPass) break;
            }

            // --- CSV Generation ---
            const escapeCsvCell = (cell) => {
                if (cell === null || cell === undefined) return '';
                let cellStr = String(cell);
                if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
                    return `"${cellStr.replace(/"/g, '""')}"`;
                }
                return cellStr;
            };

            let csvContent = wantedHeaders.join(',') + '\n';
            allRowsData.forEach(rowDataObj => {
                const rowValues = wantedHeaders.map(header => escapeCsvCell(rowDataObj[header]));
                csvContent += rowValues.join(',') + '\n';
            });

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = 'meta_billing_check.csv';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

        } catch (e) {
            console.error("Error during Meta Billing Check:", e);
            alert("An error occurred while scraping: " + e.message);
        } finally {
            cleanupUI();
        }
    })();
}

/**
 * Global message listener.
 * Handles internal messages for various extension features like time bomb overrides,
 * notifications, and script injection.
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Allow the disableTimeBomb action to proceed even if the bomb is active.
    if (request.action === "disableTimeBomb") {
        chrome.storage.local.remove(['timeBombActive', 'initialDeadline'], () => {
            console.log('Time bomb has been manually disabled via override.');
            if (chrome.runtime.lastError) {
                sendResponse({ status: 'error', message: chrome.runtime.lastError.message });
            } else {
                sendResponse({ status: 'success' });
            }
        });
        return true; // Required for async sendResponse
    }

    chrome.storage.local.get('timeBombActive', (data) => {
        if (data.timeBombActive) {
            console.log(`Message with action "${request.action}" blocked by time bomb.`);
            if (sendResponse) {
                sendResponse({ status: 'error', message: 'All features have been disabled.' });
            }
            return; // Stop all further execution of the listener.
        }

        // If the time bomb is not active, proceed with the normal message handling.
        console.log("Received message:", request);
        if (request.action === "showTimesheetNotification") {
        console.log("Showing timesheet notification");
        showTimesheetNotification();
        sendResponse({status: "Notification shown"});
    } else if (request.action === "createTimesheetAlarm") {
        createTimesheetAlarm(request.day, request.time);
        sendResponse({status: "Alarm created"});
    } else if (request.action === "removeTimesheetAlarm") {
        chrome.alarms.clear('timesheetReminder');
        sendResponse({status: "Alarm removed"});
    } else if (request.action === "openCampaignWithDNumber") {
        (async () => {
            const tab = await chrome.tabs.create({ url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=cm-dashboard&route=campaigns' });

            setTimeout(() => {
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: openCampaignWithDNumberScript,
                    args: [request.dNumber]
                });
            }, 10000); // Increased timeout to 10 seconds for reliability
        })();
        sendResponse({status: "Action initiated"});
    } else if (request.action === "metaBillingCheck") {
        (async () => {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                return sendResponse({ status: 'error', message: 'Could not find active tab.' });
            }
            if (tab.url && tab.url.includes('adsmanager.facebook.com/adsmanager/manage/campaigns')) {
                try {
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: scrapeAndDownloadCsv,
                    });
                    sendResponse({ status: 'success', message: 'Scraping process initiated.' });
                } catch (e) {
                    console.error("Failed to inject scripts:", e);
                    sendResponse({ status: 'error', message: `Failed to start scraper: ${e.message}` });
                }
            } else {
                sendResponse({ status: 'error', message: 'You need to be on the Meta Ads Manager campaigns page for this to work.' });
            }
        })();
        return true; // Required for async sendResponse
    } else if (request.action === 'getClipboardText' || request.action === 'copyToClipboard') {
        handleOffscreenClipboard(request, sendResponse);
        return true; // Required for async sendResponse
    } else if (request.action === 'getFavouriteApprovers') {
        (async () => {
            try {
                const data = await new Promise((resolve, reject) => {
                    chrome.storage.local.get(['favoriteApprovers'], (result) => {
                        if (chrome.runtime.lastError) {
                            return reject(chrome.runtime.lastError);
                        }
                        resolve(result);
                    });
                });

                const favoriteIds = new Set(data.favoriteApprovers || []);
                if (favoriteIds.size === 0) {
                    return sendResponse({ status: 'success', emails: [] });
                }

                const favoriteEmails = approversData
                    .filter(approver => favoriteIds.has(approver.id))
                    .map(approver => approver.email);

                sendResponse({ status: 'success', emails: favoriteEmails });
            } catch (error) {
                console.error('Error getting favourite approvers:', error);
                sendResponse({ status: 'error', message: error.message });
            }
        })();
        return true; // Required for async sendResponse
    } else if (request.action === 'openApproversPage') {
        chrome.tabs.create({ url: chrome.runtime.getURL('approvers.html') });
        sendResponse({ status: 'success' });
    }
    return true;  // Indicates that the response is sent asynchronously
    }); // close chrome.storage.local.get
});

/**
 * Listener for tab updates.
 * Removes specific URL parameters if the shortcut feature is enabled.
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Check if the URL has changed and the feature is enabled
    if (changeInfo.url) {
        if (!chrome.runtime || !chrome.runtime.id) return; // Context guard
        chrome.storage.sync.get('addCampaignShortcutEnabled', (data) => {
            if (chrome.runtime.lastError) return; // Error guard
            if (data.addCampaignShortcutEnabled !== false) {
                // Check if the URL contains the specific parameter to be removed
                if (changeInfo.url.includes('osMOpts=lb')) {
                    // Construct the new URL by removing the parameter
                    const newUrl = changeInfo.url.replace(/&?osMOpts=lb/, '');
                    // Update the tab with the new URL
                    chrome.tabs.update(tabId, { url: newUrl });
                }
            }
        });
    }
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getNextAlarmDate,
        createTimesheetAlarm,
        // For testing
        getNextDeadline,
        checkTimeBomb
    };
}

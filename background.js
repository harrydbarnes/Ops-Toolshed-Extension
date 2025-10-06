import { approversData } from './approvers-data.js';

// --- Time-Bomb Feature ---
const timeBombConfig = {
  enabled: 'Y', // Change to 'N' to disable
  disableDay: 2, // Tuesday (0=Sun, 1=Mon, 2=Tue, etc.)
  disableHour: 23,
  disableMinute: 59
};

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

// Check if an offscreen document is already open
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

// Helper function to handle clipboard actions with the offscreen document.
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

// Modify playAlarmSound to use the offscreen document
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


chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'timeBombCheck') {
    checkTimeBomb();
  } else if (alarm.name === 'timesheetReminder') {
    showTimesheetNotification(); // This will now trigger the notification and sound via offscreen document
  }
});

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

const openCampaignWithDNumberScript = (dNumber) => {
    // This script is injected into the page and must be self-contained,
    // including all helper functions required for Shadow DOM traversal and waiting.

    /**
     * Recursively finds all elements matching a selector, piercing through Shadow DOMs.
     * @param {string} selector - The CSS selector to search for.
     * @param {Element|ShadowRoot} root - The root element to start the search from.
     * @returns {Element[]} An array of all matching elements found.
     */
    function findAllElementsInShadowDom(selector, root = document) {
        let results = [];
        // Find elements in the current root's light DOM
        results = results.concat(Array.from(root.querySelectorAll(selector)));

        // Recursively search in shadow roots
        const allElements = root.querySelectorAll('*');
        for (const element of allElements) {
            if (element.shadowRoot) {
                results = results.concat(findAllElementsInShadowDom(selector, element.shadowRoot));
            }
        }
        return results;
    }

    /**
     * Waits for a specific indexed element to appear in the DOM.
     */
    function waitForElement(selector, index = 0, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const intervalTime = 200;
            let elapsedTime = 0;
            const interval = setInterval(() => {
                const elements = findAllElementsInShadowDom(selector);
                if (elements.length > index) {
                    resolve(elements[index]);
                    clearInterval(interval);
                    return;
                }

                elapsedTime += intervalTime;
                if (elapsedTime >= timeout) {
                    clearInterval(interval);
                    reject(new Error(`Element '${selector}' at index ${index} not found within ${timeout}ms`));
                }
            }, intervalTime);
        });
    }

    // This is the main execution logic
    (async () => {
        const initialDelay = ms => new Promise(res => setTimeout(res, ms));

        console.log(`[D-Number Open - Injected] Start for D-Number: ${dNumber}`);

        try {
            // Add a small pre-click delay just in case elements are still settling from the 20s initial wait.
            await initialDelay(1000);

            // FIX 1: Use a broader selector for the element that opens the search menu.
            // We'll target the wrapper that contains the quick search and force a click on the chevron.
            const chevronIconSelector = 'mo-banner mo-menu mo-icon.chevron-icon';
            const initialClickElement = await waitForElement(chevronIconSelector, 0, 15000);

            initialClickElement.click();
            console.log(`[D-Number Open - Injected] Chevron icon clicked to open menu.`);

            // 2. Wait for the native input element inside the newly opened overlay.
            // Selector: mo-banner-recent-menu-content input[type="text"]
            const inputSelector = 'mo-banner-recent-menu-content input[type="text"]';
            const inputElement = await waitForElement(inputSelector, 0, 15000);

            // Ensure the input field is clear and active
            inputElement.focus();
            inputElement.value = '';

            console.log(`[D-Number Open - Injected] Native input element found. Inputting D-Number...`);

            // 3. Set the value directly and dispatch events
            inputElement.value = dNumber;
            inputElement.dispatchEvent(new Event('change', { bubbles: true }));
            inputElement.dispatchEvent(new Event('input', { bubbles: true }));
            inputElement.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter', keyCode: 13, code: 'Enter' }));

            console.log(`[D-Number Open - Injected] D-Number input and search triggered. Waiting for correct result link...`);

            // 4. Robustly wait for the result link to appear AND contain the D-number
            const resultLinkSelector = `a.item-row[href*="campaign-id"]`;
            let resultLink;

            const maxWaitResult = 10000;
            const checkInterval = 500;
            let elapsedWait = 0;

            while (elapsedWait < maxWaitResult) {
                const links = findAllElementsInShadowDom(resultLinkSelector);
                resultLink = links.find(link => link.innerText && link.innerText.includes(dNumber));
                if (resultLink) {
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, checkInterval));
                elapsedWait += checkInterval;
            }

            if (!resultLink) {
                throw new Error(`Search result link for D-number ${dNumber} not found within ${maxWaitResult}ms.`);
            }

            console.log('[D-Number Open - Injected] Correct result link found. Navigating.');

            // 5. Click the link to navigate.
            resultLink.click();

        } catch (error) {
            console.error('[D-Number Open - Injected] Automation failed:', error);
            alert(`Ops Toolshed D-Number Automation Failed: ${error.message}. You may need to manually search in the quick search box or refresh the page.`);
        }
        console.log('[D-Number Open - Injected] End');
    })();
};

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
            try {
                // Open the tab.
                const tab = await chrome.tabs.create({ url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=cm-dashboard&route=campaigns' });

                // Wait for the tab to be ready before injecting the script.
                setTimeout(() => {
                    chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        func: openCampaignWithDNumberScript,
                        args: [request.dNumber] // Pass dNumber directly
                    });
                }, 15000); // 15-second delay for page load.

                sendResponse({ status: "Action initiated" });
            } catch (error) {
                console.error("Error in openCampaignWithDNumber:", error);
                sendResponse({ status: "error", message: error.message });
            }
        })();
        return true; // Required for async sendResponse.
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
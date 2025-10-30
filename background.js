import { messageHandlers } from './background/message-handlers.js';

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

async function checkTimeBomb() {
    if (timeBombConfig.enabled !== 'Y') {
        await chrome.storage.local.remove(['timeBombActive', 'initialDeadline']);
        return;
    }

    const data = await chrome.storage.local.get(['initialDeadline']);
    let initialDeadline = data.initialDeadline;
    if (!initialDeadline) {
        initialDeadline = getNextDeadline();
    }

    const now = new Date().getTime();
    const timeBombActive = now > initialDeadline;

    await chrome.storage.local.set({ initialDeadline, timeBombActive });
}

// --- Alarms and Notifications ---
chrome.alarms.create('timeBombCheck', { periodInMinutes: 1 });

chrome.runtime.onInstalled.addListener(() => {
  checkTimeBomb().catch(error => console.error("Error during initial time bomb check:", error));
  if (!chrome.runtime || !chrome.runtime.id) return;
  chrome.storage.sync.get('countPlacementsSelectedEnabled', function(data) {
    if (data.countPlacementsSelectedEnabled === undefined) {
      chrome.storage.sync.set({ countPlacementsSelectedEnabled: true });
    }
  });
  chrome.storage.sync.get(['timesheetReminderEnabled', 'reminderDay', 'reminderTime'], function(data) {
    if (chrome.runtime.lastError) {
        console.error(`Error getting timesheet reminder settings: ${chrome.runtime.lastError.message}`);
        return;
    }
    if (data.timesheetReminderEnabled !== false) {
      createTimesheetAlarm(data.reminderDay, data.reminderTime);
    }
    if (data.reminderDay === undefined || data.reminderTime === undefined) {
      chrome.storage.sync.set({ reminderDay: 'Friday', reminderTime: '14:30' });
    }
  });
});

async function createTimesheetAlarm(day, time) {
  day = day || 'Friday';
  time = time || '14:30';
  const nextAlarmDate = getNextAlarmDate(day, time);
  await chrome.alarms.create('timesheetReminder', {
    when: nextAlarmDate.getTime(),
    periodInMinutes: 10080 // 7 days
  });
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

async function triggerTimesheetNotification() {
    if (!chrome.runtime || !chrome.runtime.id) return;
    const data = await chrome.storage.sync.get('timesheetReminderEnabled');
    if (data.timesheetReminderEnabled !== false) {
        await playAlarmSound();
        chrome.notifications.create('timesheetReminder', {
            type: 'basic',
            iconUrl: 'icon.png',
            title: 'Timesheet Reminder',
            message: 'Don\'t forget to submit your timesheet!',
            buttons: [{ title: 'Open My Timesheets' }, { title: 'Snooze for 15 minutes' }],
            priority: 2
        });
    }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  try {
    if (alarm.name === 'timeBombCheck') {
      await checkTimeBomb();
    } else if (alarm.name === 'timesheetReminder') {
      await triggerTimesheetNotification();
    }
  } catch (error) {
    console.error(`Error handling alarm "${alarm.name}":`, error);
  }
});

chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (notificationId === 'timesheetReminder') {
    if (buttonIndex === 0) {
      chrome.tabs.create({ url: 'https://groupmuk-aura.mediaocean.com/viewport-home/#osAppId=rod-time&osPspId=rod-time&route=time/display/myTimesheets/ToDo' });
    } else if (buttonIndex === 1) {
      try {
        await chrome.alarms.create('timesheetReminder', { delayInMinutes: 15 });
      } catch (e) {
        console.error('Failed to create snooze alarm:', e);
      }
    }
    chrome.notifications.clear(notificationId);
  }
});

// --- Offscreen Document for Clipboard and Audio ---
const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';
let creating;
async function createOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
  });
  if (existingContexts.length > 0) return;

  if (creating) {
    await creating;
  } else {
    creating = chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: ['CLIPBOARD', 'AUDIO_PLAYBACK'],
      justification: 'Plays alarm sound and handles clipboard actions',
    });
    await creating;
    creating = null;
  }
}

async function playAlarmSound() {
  await createOffscreenDocument();
  chrome.runtime.sendMessage({
      action: 'playAlarm',
      sound: chrome.runtime.getURL('alarm.mp3')
  }).catch(error => console.error('Error sending message to offscreen document:', error));
}

async function handleOffscreenClipboard(request, sendResponse) {
    await createOffscreenDocument();
    try {
        const response = await chrome.runtime.sendMessage({
            action: request.action === 'getClipboardText' ? 'readClipboard' : 'copyToClipboard',
            text: request.text
        });
        sendResponse(response);
    } catch (e) {
        console.error(`Error in handleOffscreenClipboard for action "${request.action}":`, e);
        sendResponse({ status: 'error', message: e.message });
    }
}

// --- Main Message Router ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const { action } = request;

    if (action === 'disableTimeBomb') {
        messageHandlers.disableTimeBomb(request, sender, sendResponse);
        return true;
    }

    (async () => {
        const data = await chrome.storage.local.get('timeBombActive');
        if (data.timeBombActive) {
            sendResponse({ status: 'error', message: 'All features have been disabled.' });
            return;
        }

        const handler = messageHandlers[action];
        if (handler) {
            const context = {
                playAlarmSound,
                createTimesheetAlarm,
                handleOffscreenClipboard,
                triggerTimesheetNotification
            };
            handler(request, sender, sendResponse, context);
        } else {
            console.warn(`No handler found for action: ${action}`);
            sendResponse({ status: 'error', message: `Unknown action: ${action}` });
        }
    })();

    return true; // Indicates async response.
});

// --- URL-based Features ---
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url) {
        if (!chrome.runtime || !chrome.runtime.id) return;
        chrome.storage.sync.get('addCampaignShortcutEnabled', (data) => {
            if (chrome.runtime.lastError) {
                console.error(`Error getting addCampaignShortcutEnabled setting: ${chrome.runtime.lastError.message}`);
                return;
            }
            if (data.addCampaignShortcutEnabled !== false) {
                if (changeInfo.url.includes('osMOpts=lb')) {
                    const url = new URL(changeInfo.url);
                    const hashParams = new URLSearchParams(url.hash.substring(1));
                    if (hashParams.has('osMOpts')) {
                        hashParams.delete('osMOpts');
                        const newHash = hashParams.toString();
                        url.hash = newHash ? `#${newHash}` : '';
                        chrome.tabs.update(tabId, { url: url.toString() });
                    }
                }
            }
        });
    }
});

// --- Exports for Testing ---
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getNextAlarmDate,
        createTimesheetAlarm,
        getNextDeadline,
        checkTimeBomb,
        triggerTimesheetNotification
    };
}
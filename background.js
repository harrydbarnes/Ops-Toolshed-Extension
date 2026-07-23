import { handleHelpGuidesPanelEvent, messageHandlers } from './background/message-handlers.js';
import { migrateStats } from './background/stats-manager.js';

chrome.sidePanel?.onOpened?.addListener(info => handleHelpGuidesPanelEvent(info, true)
  .catch(error => console.error('Failed to sync opened Help Guides panel:', error)));
chrome.sidePanel?.onClosed?.addListener(info => handleHelpGuidesPanelEvent(info, false)
  .catch(error => console.error('Failed to sync closed Help Guides panel:', error)));

// --- Alarms and Notifications ---

chrome.runtime.onInstalled.addListener((details) => {
  migrateStats();
  if (!chrome.runtime || !chrome.runtime.id) return;

  if (details?.reason === 'install') {
    Promise.resolve(chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') }))
      .catch(error => console.error('Could not open first-run onboarding:', error));
  }

  chrome.storage.sync.get([
    'countPlacementsSelectedEnabled',
    'approverWidgetOptimiseEnabled',
    'swapAccountsEnabled',
    'timesheetReminderEnabled',
    'reminderDay',
    'reminderTime'
  ], (data) => {
    if (chrome.runtime.lastError) {
        console.error(`Error getting settings: ${chrome.runtime.lastError.message}`);
        return;
    }

    const defaults = {};

    if (data.countPlacementsSelectedEnabled === undefined) {
        defaults.countPlacementsSelectedEnabled = true;
    }

    if (data.approverWidgetOptimiseEnabled === undefined) {
        defaults.approverWidgetOptimiseEnabled = true;
    }

    if (data.swapAccountsEnabled === undefined) {
        defaults.swapAccountsEnabled = true;
    }

    if (data.reminderDay === undefined) {
        defaults.reminderDay = 'Friday';
    }
    if (data.reminderTime === undefined) {
        defaults.reminderTime = '14:30';
    }

    if (Object.keys(defaults).length > 0) {
        chrome.storage.sync.set(defaults);
    }

    if (data.timesheetReminderEnabled !== false) {
      createTimesheetAlarm(data.reminderDay || defaults.reminderDay, data.reminderTime || defaults.reminderTime);
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
    if (alarm.name === 'timesheetReminder') {
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
    let hasResponded = false;
    const respondOnce = (response) => {
        if (hasResponded) return false;
        hasResponded = true;
        sendResponse(response);
        return true;
    };

    (async () => {
        try {
            if (!request || typeof request !== 'object' || typeof request.action !== 'string' || !request.action.trim()) {
                respondOnce({ status: 'error', message: 'Invalid message request.' });
                return;
            }

            const { action } = request;
            const handler = Object.prototype.hasOwnProperty.call(messageHandlers, action)
                ? messageHandlers[action]
                : null;
            if (typeof handler !== 'function') {
                console.warn(`No handler found for action: ${action}`);
                respondOnce({ status: 'error', message: `Unknown action: ${action}` });
                return;
            }

            const context = {
                playAlarmSound,
                createTimesheetAlarm,
                handleOffscreenClipboard,
                triggerTimesheetNotification
            };

            // chrome.sidePanel.open() must be the first asynchronous operation
            // after the page click or Chrome discards the user gesture.
            if (action === 'openHelpGuides') {
                await handler(request, sender, respondOnce, context);
                return;
            }

            await handler(request, sender, respondOnce, context);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error || 'Unknown background error.');
            console.error('Background message handler failed:', error);
            respondOnce({ status: 'error', message });
        }
    })();

    return true; // Indicates async response.
});

// --- URL-based Features ---
function isBlockedAppLearnUrl(rawUrl) {
    if (!rawUrl) return false;

    try {
        const url = new URL(rawUrl);
        if (url.hostname === 'splitscreen-adopt.applearn.tv') return true;

        return url.hostname === 'wpp.okta.com' &&
            url.pathname.toLowerCase().startsWith('/app/wpp_groupmapplearndev_1');
    } catch {
        return false;
    }
}

function isMediaoceanUrl(rawUrl) {
    if (!rawUrl) return false;

    try {
        const hostname = new URL(rawUrl).hostname;
        return hostname === 'mediaocean.com' || hostname.endsWith('.mediaocean.com');
    } catch {
        return false;
    }
}

let appLearnPopupStatUpdate = Promise.resolve();

function incrementAppLearnPopupBlockedStat() {
    // Recover the queue before scheduling the next update. Without this, one
    // rejected storage operation leaves the promise chain permanently rejected.
    appLearnPopupStatUpdate = appLearnPopupStatUpdate.catch(() => undefined).then(async () => {
        const data = await chrome.storage.local.get({ appLearnPopupsBlocked: 0 });
        const currentCount = Number(data.appLearnPopupsBlocked) || 0;
        await chrome.storage.local.set({ appLearnPopupsBlocked: currentCount + 1 });
    });
    return appLearnPopupStatUpdate;
}

async function maybeBlockAppLearnPopup(tabId, url, openerTabId) {
    if (!isBlockedAppLearnUrl(url)) return false;

    try {
        const data = await chrome.storage.sync.get({ blockAppLearnPopupsEnabled: true });
        if (data.blockAppLearnPopupsEnabled === false) return false;

        let openedFromMediaocean = false;
        if (openerTabId) {
            const openerTab = await chrome.tabs.get(openerTabId);
            openedFromMediaocean = isMediaoceanUrl(openerTab?.url);
        } else {
            // AppLearn sometimes creates a noopener popup, so Chrome omits
            // openerTabId. Active tabs are reported once per window; the
            // original Prisma/Aura window remains active behind the popup.
            const activeTabs = await chrome.tabs.query({ active: true });
            openedFromMediaocean = activeTabs.some(tab => isMediaoceanUrl(tab.url));
        }
        if (!openedFromMediaocean) return false;

        await chrome.tabs.remove(tabId);
        await incrementAppLearnPopupBlockedStat();
        return true;
    } catch (error) {
        // The popup or its opener may already have closed during navigation.
        console.debug('AppLearn popup check ended before completion:', error.message);
        return false;
    }
}

chrome.tabs.onCreated.addListener(tab => {
    maybeBlockAppLearnPopup(tab.id, tab.pendingUrl || tab.url, tab.openerTabId)
        .catch(error => console.error('Unexpected AppLearn popup check failure:', error));
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url) {
        maybeBlockAppLearnPopup(tabId, changeInfo.url, tab.openerTabId)
            .catch(error => console.error('Unexpected AppLearn popup check failure:', error));

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
        triggerTimesheetNotification,
        isBlockedAppLearnUrl,
        isMediaoceanUrl,
        maybeBlockAppLearnPopup
    };
}

import { handleHelpGuidesPanelEvent, messageHandlers } from './background/message-handlers.js';
import { migrateStats } from './background/stats-manager.js';
import { setupApprovalAlarm, pollPendingApprovals, ALARM_NAME as APPROVAL_ALARM_NAME } from './background/approval-polling.js';
import { expireDiagnosticsIfNeeded, recordDiagnosticEvent } from './background/diagnostics-manager.js';
import {
  MASTER_FEATURE_KEY,
  featureModeReady,
  isFeatureModeActive,
  isPopupSender,
  reconcileFeatureMode,
  refreshFeatureMode
} from './background/feature-mode.js';

chrome.sidePanel?.onOpened?.addListener(info => isFeatureModeActive() && handleHelpGuidesPanelEvent(info, true)
  .catch(error => console.error('Failed to sync opened Help Guides panel:', error)));
chrome.sidePanel?.onClosed?.addListener(info => isFeatureModeActive() && handleHelpGuidesPanelEvent(info, false)
  .catch(error => console.error('Failed to sync closed Help Guides panel:', error)));

// --- Alarms and Notifications ---

featureModeReady.then(enabled => {
  if (enabled) setupApprovalAlarm();
  else closeFeatureSurfaces();
});

chrome.runtime.onStartup?.addListener(() => {
  expireDiagnosticsIfNeeded().catch(error => console.error('Could not expire Diagnostics Mode:', error));
  refreshFeatureMode({ reloadTabs: true })
    .then(enabled => enabled ? restoreFeatureResources() : closeFeatureSurfaces())
    .catch(error => console.error('Could not restore feature mode on browser startup:', error));
});

chrome.runtime.onInstalled.addListener(async (details) => {
  await expireDiagnosticsIfNeeded().catch(error => console.error('Could not expire Diagnostics Mode:', error));
  await featureModeReady;
  if (!isFeatureModeActive()) {
    await reconcileFeatureMode(true, { reloadTabs: true });
    await closeFeatureSurfaces();
    return;
  }
  migrateStats();
  setupApprovalAlarm();
  if (!chrome.runtime || !chrome.runtime.id) return;

  if (details?.reason === 'install') {
    Promise.resolve(chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') }))
      .catch(error => console.error('Could not open first-run onboarding:', error));
  }

  chrome.storage.sync.get([
    'countPlacementsSelectedEnabled',
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
    const data = await chrome.storage.sync.get({
      timesheetReminderEnabled: true,
      [MASTER_FEATURE_KEY]: false
    });
    if (data[MASTER_FEATURE_KEY] !== true && data.timesheetReminderEnabled !== false) {
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
    await featureModeReady;
    if (!isFeatureModeActive()) return;
    if (alarm.name === 'timesheetReminder') {
      await triggerTimesheetNotification();
    } else if (alarm.name === APPROVAL_ALARM_NAME) {
      await pollPendingApprovals();
    }
  } catch (error) {
    console.error(`Error handling alarm "${alarm.name}":`, error);
  }
});

chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  await featureModeReady;
  if (!isFeatureModeActive()) return;
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
      target: 'offscreen',
      action: 'playAlarm',
      sound: chrome.runtime.getURL('alarm.mp3')
  }).catch(error => console.error('Error sending message to offscreen document:', error));
}

async function handleOffscreenClipboard(request, sendResponse) {
    await createOffscreenDocument();
    try {
        const response = await chrome.runtime.sendMessage({
            target: 'offscreen',
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
const DIAGNOSTIC_CONTROL_ACTIONS = new Set([
    'SET_DIAGNOSTICS_MODE',
    'RECORD_DIAGNOSTIC_EVENT',
    'GET_DIAGNOSTIC_REPORT',
    'CLEAR_DIAGNOSTIC_EVENTS'
]);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request?.target === 'offscreen') return false;

    let hasResponded = false;
    let diagnosticMessageEligible = false;
    const messageStartedAt = Date.now();
    const respondOnce = (response) => {
        if (hasResponded) return false;
        hasResponded = true;
        sendResponse(response);
        const action = request?.action;
        if (
            typeof action === 'string' &&
            diagnosticMessageEligible &&
            action !== 'TRACK_STAT' &&
            action !== 'openHelpGuides' &&
            !DIAGNOSTIC_CONTROL_ACTIONS.has(action)
        ) {
            recordDiagnosticEvent({
                source: 'background-message',
                operation: action,
                outcome: response?.status === 'error' ? 'error' : 'success',
                durationMs: Date.now() - messageStartedAt
            });
        }
        return true;
    };

    (async () => {
        try {
            if (!request || typeof request !== 'object' || typeof request.action !== 'string' || !request.action.trim()) {
                respondOnce({ status: 'error', message: 'Invalid message request.' });
                return;
            }

            const { action } = request;
            await featureModeReady;
            if (!isFeatureModeActive() && !isPopupSender(sender) && !DIAGNOSTIC_CONTROL_ACTIONS.has(action)) {
                respondOnce({ status: 'error', message: 'Ops Toolshed features are off.' });
                return;
            }
            const handler = Object.prototype.hasOwnProperty.call(messageHandlers, action)
                ? messageHandlers[action]
                : null;
            if (typeof handler !== 'function') {
                console.warn(`No handler found for action: ${action}`);
                respondOnce({ status: 'error', message: `Unknown action: ${action}` });
                return;
            }
            diagnosticMessageEligible = true;

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

const APPLEARN_BLANK_POPUP_WINDOW_MS = 15000;
const APPLEARN_NOOPENER_WINDOW_MS = 3000;
const loadingMediaoceanTabs = new Map();
let blockAppLearnPopupsEnabled = true;

chrome.storage.sync.get({ blockAppLearnPopupsEnabled: true })
    .then(data => {
        blockAppLearnPopupsEnabled = data.blockAppLearnPopupsEnabled !== false;
    })
    .catch(error => console.debug('Could not preload AppLearn popup setting:', error.message));

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync' || !changes.blockAppLearnPopupsEnabled) return;
    blockAppLearnPopupsEnabled = changes.blockAppLearnPopupsEnabled.newValue !== false;
});

function rememberLoadingMediaoceanTab(tabId, windowId) {
    if (!Number.isInteger(tabId)) return;
    const now = Date.now();
    loadingMediaoceanTabs.set(tabId, {
        guardUntil: now + APPLEARN_BLANK_POPUP_WINDOW_MS,
        noOpenerGuardUntil: now + APPLEARN_NOOPENER_WINDOW_MS,
        windowId
    });
}

function isBlankTabUrl(tab) {
    const url = tab?.pendingUrl || tab?.url;
    return !url || url === 'about:blank' || url === 'chrome://newtab/';
}

function closeBlankAppLearnCandidate(tab) {
    if (!blockAppLearnPopupsEnabled || !isBlankTabUrl(tab)) return false;
    if (!Number.isInteger(tab?.id)) return false;

    const now = Date.now();
    let loadingSourceFound = false;

    for (const [tabId, loadingTab] of loadingMediaoceanTabs) {
        if (loadingTab.guardUntil < now) {
            loadingMediaoceanTabs.delete(tabId);
            continue;
        }

        const isKnownChild = Number.isInteger(tab.openerTabId) && tab.openerTabId === tabId;
        const isNoOpenerSibling = !Number.isInteger(tab.openerTabId)
            && Number.isInteger(tab.windowId)
            && tab.windowId === loadingTab.windowId
            && loadingTab.noOpenerGuardUntil >= now;

        if (isKnownChild || isNoOpenerSibling) {
            loadingSourceFound = true;
            break;
        }
    }

    if (!loadingSourceFound) return false;

    // Do not wait for the blank tab to navigate to AppLearn: removing it in
    // the creation event prevents the visible flash reported on Prisma reload.
    chrome.tabs.remove(tab.id)
        .then(() => incrementAppLearnPopupBlockedStat())
        .catch(error => console.debug('Could not close blank AppLearn popup candidate:', error.message));
    return true;
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
    if (!isFeatureModeActive()) return;
    if (isMediaoceanUrl(tab.pendingUrl || tab.url)) {
        rememberLoadingMediaoceanTab(tab.id, tab.windowId);
    }
    if (closeBlankAppLearnCandidate(tab)) return;

    maybeBlockAppLearnPopup(tab.id, tab.pendingUrl || tab.url, tab.openerTabId)
        .catch(error => console.error('Unexpected AppLearn popup check failure:', error));
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!isFeatureModeActive()) return;
    const currentUrl = changeInfo.url || tab.url;
    if (changeInfo.status === 'loading' && isMediaoceanUrl(currentUrl)) {
        rememberLoadingMediaoceanTab(tabId, tab.windowId);
    } else if (changeInfo.status === 'complete' || (changeInfo.url && !isMediaoceanUrl(currentUrl))) {
        loadingMediaoceanTabs.delete(tabId);
    }

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

chrome.tabs.onRemoved.addListener(tabId => {
    loadingMediaoceanTabs.delete(tabId);
});

async function closeFeatureSurfaces() {
  await Promise.allSettled([
    chrome.alarms.clear('timesheetReminder'),
    chrome.alarms.clear(APPROVAL_ALARM_NAME),
    chrome.notifications.clear('timesheetReminder')
  ]);

  try {
    const contexts = await chrome.runtime.getContexts?.({ contextTypes: ['SIDE_PANEL'] });
    await Promise.allSettled((contexts || [])
      .filter(context => Number.isInteger(context.tabId) && context.tabId >= 0)
      .map(context => chrome.sidePanel?.close?.({ tabId: context.tabId })));
  } catch (error) {
    console.debug('Could not enumerate feature side panels:', error.message);
  }

  try {
    await chrome.sidePanel?.setOptions?.({ enabled: false });
  } catch (error) {
    console.debug('Could not disable feature side panels:', error.message);
  }

  try {
    await chrome.offscreen?.closeDocument?.();
  } catch (error) {
    console.debug('Could not close the offscreen feature document:', error.message);
  }
}

async function restoreFeatureResources() {
  await chrome.sidePanel?.setOptions?.({ path: 'help-guides.html', enabled: true });
  await setupApprovalAlarm();
  const settings = await chrome.storage.sync.get({
    timesheetReminderEnabled: true,
    reminderDay: 'Friday',
    reminderTime: '14:30'
  });
  if (settings.timesheetReminderEnabled !== false) {
    await createTimesheetAlarm(settings.reminderDay, settings.reminderTime);
  }
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'sync' || !changes[MASTER_FEATURE_KEY]) return;
  const disabled = changes[MASTER_FEATURE_KEY].newValue === true;
  reconcileFeatureMode(disabled, { reloadTabs: true })
    .then(enabled => enabled ? restoreFeatureResources() : closeFeatureSurfaces())
    .catch(error => console.error('Could not apply the global feature mode:', error));
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

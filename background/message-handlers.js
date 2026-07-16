import { approversData } from '../approvers-data.js';

const openHelpGuideTabs = new Set();
import { scrapeAndDownloadCsv } from './meta-billing-scraper.js';
import { handleTrackStat } from './stats-manager.js';

const PRISMA_DASHBOARD_URL = 'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=cm-dashboard&route=campaigns';
const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 500;

function isTransientReceiverError(error) {
    const message = String(error?.message || error || '').toLowerCase();
    return message.includes('could not establish connection') ||
        message.includes('receiving end does not exist') ||
        message.includes('message port closed before a response was received');
}

async function disableTimeBomb(request, sender, sendResponse) {
    try {
        await chrome.storage.local.remove(['timeBombActive', 'initialDeadline']);
        sendResponse({ status: 'success' });
    } catch (e) {
        console.error('Failed to disable time bomb:', e);
        sendResponse({ status: 'error', message: e.message });
    }
}

async function showTimesheetNotification(request, sender, sendResponse, context) {
    await context.triggerTimesheetNotification();
    sendResponse({ status: "Notification shown" });
}

async function createTimesheetAlarm(request, sender, sendResponse, context) {
    await context.createTimesheetAlarm(request.day, request.time);
    sendResponse({ status: "Alarm created" });
}

async function removeTimesheetAlarm(request, sender, sendResponse) {
    await chrome.alarms.clear('timesheetReminder');
    sendResponse({ status: "Alarm removed" });
}

async function metaBillingCheck(request, sender, sendResponse) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
        sendResponse({ status: 'error', message: 'Could not find active tab.' });
        return;
    }
    if (tab.url && tab.url.includes('adsmanager.facebook.com/adsmanager/manage/campaigns')) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: scrapeAndDownloadCsv,
            });
            sendResponse({ status: 'success', message: 'Scraping process initiated.' });
        } catch (e) {
            sendResponse({ status: 'error', message: `Failed to start scraper: ${e.message}` });
        }
    } else {
        sendResponse({ status: 'error', message: 'You need to be on the Meta Ads Manager campaigns page for this to work.' });
    }
}

async function performDNumberSearch(request, sender, sendResponse) {
    try {
        const newTab = await chrome.tabs.create({ url: PRISMA_DASHBOARD_URL });
        const tabId = newTab.id;
        const dNumber = request.dNumber;
        if (!tabId) {
            throw new Error('Could not create a Prisma search tab.');
        }

        // Wait for the content script to be ready by retrying the message and awaiting its response.
        let response;
        for (let i = 0; i < MAX_RETRIES; i++) { // Retry for up to 5 seconds
            try {
                // The content script will perform the search automation upon receiving this message.
                response = await chrome.tabs.sendMessage(tabId, { action: 'executeDNumberSearch', dNumber: dNumber });
                if (response && response.status === 'success') {
                    break; // Success
                } else {
                    // This is a terminal failure response from the content script.
                    throw new Error(response?.message || 'D-Number search failed in content script.');
                }
            } catch (e) {
                // Only retry for connection errors. For other errors (like failures from the content script), fail immediately.
                if (isTransientReceiverError(e) && i < MAX_RETRIES - 1) {
                    await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
                } else {
                    throw e; // Rethrow terminal errors or on last retry.
                }
            }
        }
        sendResponse(response);

    } catch (e) {
        console.error("Failed to execute D-Number search in new tab:", e);
        sendResponse({ status: 'error', message: e.message });
    }
}

async function getClipboardText(request, sender, sendResponse, context) {
    await context.handleOffscreenClipboard(request, sendResponse);
}

async function copyToClipboard(request, sender, sendResponse, context) {
    await context.handleOffscreenClipboard(request, sendResponse);
}

async function getFavouriteApprovers(request, sender, sendResponse) {
    try {
        const data = await chrome.storage.local.get(['favoriteApprovers']);
        const favoriteIds = new Set(data.favoriteApprovers || []);
        if (favoriteIds.size === 0) {
            sendResponse({ status: 'success', emails: [] });
            return;
        }
        const favoriteEmails = approversData
            .filter(approver => favoriteIds.has(approver.id))
            .map(approver => approver.email);
        sendResponse({ status: 'success', emails: favoriteEmails });
    } catch (error) {
        sendResponse({ status: 'error', message: error.message });
    }
}

async function openApproversPage(request, sender, sendResponse) {
    await chrome.tabs.create({ url: chrome.runtime.getURL('approvers.html') });
    sendResponse({ status: 'success' });
}

async function openHelpGuides(request, sender, sendResponse) {
    const tabId = sender?.tab?.id;
    if (!tabId) {
        sendResponse({ status: 'error', message: 'Could not identify the current tab.' });
        return;
    }

    if (openHelpGuideTabs.has(tabId) && typeof chrome.sidePanel?.close === 'function') {
        await chrome.sidePanel.close({ tabId });
        openHelpGuideTabs.delete(tabId);
        sendResponse({ status: 'success', panelState: 'closed' });
        return;
    }

    // open() must stay directly tied to the content-script click. Configure the
    // tab-specific instance afterwards, matching Chrome's supported pattern.
    await chrome.sidePanel.open({ tabId });
    await chrome.sidePanel.setOptions({
        tabId,
        path: 'help-guides.html',
        enabled: true
    });
    openHelpGuideTabs.add(tabId);
    sendResponse({ status: 'success', panelState: 'open' });
}

async function closeHelpGuides(request, sender, sendResponse) {
    if (typeof chrome.sidePanel?.close !== 'function') {
        sendResponse({ status: 'unsupported' });
        return;
    }

    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) {
        sendResponse({ status: 'error', message: 'Could not identify the active tab.' });
        return;
    }

    await chrome.sidePanel.close({ tabId: activeTab.id });
    openHelpGuideTabs.delete(activeTab.id);
    sendResponse({ status: 'success' });
}

async function updateHelpGuidesPanelState(request, sender, sendResponse) {
    let tabId = sender?.tab?.id || request?.tabId;
    if (!tabId) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        tabId = activeTab?.id;
    }
    if (tabId) {
        if (request.action === 'helpGuidesPanelOpened') openHelpGuideTabs.add(tabId);
        else openHelpGuideTabs.delete(tabId);
    }
    sendResponse({ status: 'success' });
}

async function requestCampaignDetailsBasicFocus(request, sender, sendResponse) {
    const tabId = sender?.tab?.id;
    let senderUrl;
    try {
        senderUrl = new URL(sender?.url || '');
    } catch {
        senderUrl = null;
    }

    if (
        !tabId ||
        !senderUrl ||
        !senderUrl.hostname.endsWith('.mediaocean.com') ||
        !senderUrl.pathname.startsWith('/campaign-management/')
    ) {
        sendResponse({
            status: 'error',
            message: 'Campaign Details focus request must come from a Mediaocean tab.'
        });
        return;
    }

    try {
        const response = await chrome.tabs.sendMessage(tabId, {
            action: 'focusCampaignDetailsBasic'
        });
        sendResponse(response?.status === 'accepted'
            ? { status: 'accepted' }
            : { status: 'pending' });
    } catch (error) {
        // The Campaign Details frame may not have loaded its content script yet.
        sendResponse({ status: 'pending' });
    }
}

export const messageHandlers = {
    disableTimeBomb,
    showTimesheetNotification,
    createTimesheetAlarm,
    removeTimesheetAlarm,
    metaBillingCheck,
    performDNumberSearch,
    getClipboardText,
    copyToClipboard,
    getFavouriteApprovers,
    openApproversPage,
    openHelpGuides,
    closeHelpGuides,
    helpGuidesPanelOpened: updateHelpGuidesPanelState,
    helpGuidesPanelClosed: updateHelpGuidesPanelState,
    requestCampaignDetailsBasicFocus,
    TRACK_STAT: handleTrackStat
};

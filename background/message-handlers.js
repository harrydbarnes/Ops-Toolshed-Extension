import { approversData } from '../approvers-data.js';
import { scrapeAndDownloadCsv } from './meta-billing-scraper.js';

const PRISMA_DASHBOARD_URL = 'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=cm-dashboard&route=campaigns';
const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 500;

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
                if (e.message?.includes('Could not establish connection') && i < MAX_RETRIES - 1) {
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
    openApproversPage
};
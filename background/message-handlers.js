import { approversData } from '../approvers-data.js';
import { scrapeAndDownloadCsv } from './meta-billing-scraper.js';

function disableTimeBomb(request, sender, sendResponse) {
    chrome.storage.local.remove(['timeBombActive', 'initialDeadline'], () => {
        if (chrome.runtime.lastError) {
            sendResponse({ status: 'error', message: chrome.runtime.lastError.message });
        } else {
            sendResponse({ status: 'success' });
        }
    });
    return true;
}

async function showTimesheetNotification(request, sender, sendResponse, context) {
    if (!chrome.runtime || !chrome.runtime.id) return;
    const data = await chrome.storage.sync.get('timesheetReminderEnabled');
    if (data.timesheetReminderEnabled !== false) {
        await context.playAlarmSound();
        chrome.notifications.create('timesheetReminder', {
            type: 'basic',
            iconUrl: 'icon.png',
            title: 'Timesheet Reminder',
            message: 'Don\'t forget to submit your timesheet!',
            buttons: [{ title: 'Open My Timesheets' }, { title: 'Snooze for 15 minutes' }],
            priority: 2
        });
    }
    sendResponse({ status: "Notification shown" });
}

async function createTimesheetAlarm(request, sender, sendResponse, context) {
    context.createTimesheetAlarm(request.day, request.time);
    sendResponse({ status: "Alarm created" });
}

async function removeTimesheetAlarm(request, sender, sendResponse) {
    chrome.alarms.clear('timesheetReminder');
    sendResponse({ status: "Alarm removed" });
}

async function metaBillingCheck(request, sender, sendResponse) {
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
            sendResponse({ status: 'error', message: `Failed to start scraper: ${e.message}` });
        }
    } else {
        sendResponse({ status: 'error', message: 'You need to be on the Meta Ads Manager campaigns page for this to work.' });
    }
}

async function performDNumberSearch(request, sender, sendResponse) {
    const PRISMA_DASHBOARD_URL = 'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=cm-dashboard&route=campaigns';
    try {
        const newTab = await chrome.tabs.create({ url: PRISMA_DASHBOARD_URL });
        const tabId = newTab.id;
        const dNumber = request.dNumber;

        const tabLoaded = new Promise((resolve, reject) => {
            const listener = (updatedTabId, changeInfo, tab) => {
                if (updatedTabId === tabId) {
                    if (changeInfo.status === 'complete') {
                        chrome.tabs.onUpdated.removeListener(listener);
                        resolve(tab);
                    }
                    // It's good practice to also handle load errors.
                    if (changeInfo.status === 'error') {
                         chrome.tabs.onUpdated.removeListener(listener);
                         reject(new Error("Tab failed to load."));
                    }
                }
            };
            chrome.tabs.onUpdated.addListener(listener);
        });

        await tabLoaded;
        await new Promise(r => setTimeout(r, 1000)); // Wait for content script to be ready

        await chrome.tabs.sendMessage(tabId, { action: 'performDNumberSearch', dNumber: dNumber });
        sendResponse({ status: 'success', message: 'D-Number search initiated.' });
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
            return sendResponse({ status: 'success', emails: [] });
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
    chrome.tabs.create({ url: chrome.runtime.getURL('approvers.html') });
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
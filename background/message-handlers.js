import { approversData } from '../approvers-data.js';

const openHelpGuideTabs = new Set();
const OPEN_HELP_GUIDE_TABS_KEY = 'openHelpGuideTabIds';
const ACCOUNT_SWITCH_RETURN_URLS_KEY = 'accountSwitchReturnUrlsByTab';
const ACCOUNT_SWITCH_RETURN_TTL_MS = 2 * 60 * 1000;
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

function getVerifiedPrismaRequest(request, sender) {
    const tabId = sender?.tab?.id;
    let senderUrl;
    let requestedUrl;
    try {
        senderUrl = new URL(sender?.url || '');
        requestedUrl = request?.url ? new URL(request.url) : null;
    } catch {
        return null;
    }

    const isMediaoceanHost = senderUrl.hostname === 'mediaocean.com' ||
        senderUrl.hostname.endsWith('.mediaocean.com');
    if (!tabId || senderUrl.protocol !== 'https:' || !isMediaoceanHost) return null;
    if (requestedUrl && requestedUrl.origin !== senderUrl.origin) return null;
    return { tabId, requestedUrl };
}

async function getAccountSwitchReturnUrls() {
    const stored = await chrome.storage.session.get({ [ACCOUNT_SWITCH_RETURN_URLS_KEY]: {} });
    const urlsByTab = { ...(stored[ACCOUNT_SWITCH_RETURN_URLS_KEY] || {}) };
    const now = Date.now();
    let changed = false;
    Object.entries(urlsByTab).forEach(([tabId, pending]) => {
        if (!pending?.url || !Number.isFinite(pending.createdAt) ||
            now - pending.createdAt > ACCOUNT_SWITCH_RETURN_TTL_MS) {
            delete urlsByTab[tabId];
            changed = true;
        }
    });
    if (changed) await chrome.storage.session.set({ [ACCOUNT_SWITCH_RETURN_URLS_KEY]: urlsByTab });
    return urlsByTab;
}

async function rememberAccountSwitchUrl(request, sender, sendResponse) {
    const verified = getVerifiedPrismaRequest(request, sender);
    if (!verified?.requestedUrl) {
        sendResponse({ status: 'error', message: 'Invalid account-switch return URL.' });
        return;
    }
    const urlsByTab = await getAccountSwitchReturnUrls();
    urlsByTab[verified.tabId] = { url: verified.requestedUrl.href, createdAt: Date.now() };
    await chrome.storage.session.set({ [ACCOUNT_SWITCH_RETURN_URLS_KEY]: urlsByTab });
    sendResponse({ status: 'success' });
}

async function getAccountSwitchUrl(request, sender, sendResponse) {
    const verified = getVerifiedPrismaRequest(request, sender);
    if (!verified) {
        sendResponse({ status: 'error', message: 'Could not identify the Prisma tab.' });
        return;
    }
    const urlsByTab = await getAccountSwitchReturnUrls();
    sendResponse({ status: 'success', url: urlsByTab[verified.tabId]?.url || null });
}

async function clearAccountSwitchUrl(request, sender, sendResponse) {
    const verified = getVerifiedPrismaRequest(request, sender);
    if (!verified) {
        sendResponse({ status: 'error', message: 'Could not identify the Prisma tab.' });
        return;
    }
    const urlsByTab = await getAccountSwitchReturnUrls();
    delete urlsByTab[verified.tabId];
    await chrome.storage.session.set({ [ACCOUNT_SWITCH_RETURN_URLS_KEY]: urlsByTab });
    sendResponse({ status: 'success' });
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
    const verified = getVerifiedPrismaRequest({}, sender);
    if (sender?.id !== chrome.runtime.id || !verified) {
        sendResponse({ status: 'error', message: 'Clipboard reads are only available from Prisma.' });
        return;
    }
    await context.handleOffscreenClipboard(request, sendResponse);
}

async function copyCampaignUrlToClipboard(request, sender, sendResponse, context) {
    const verified = getVerifiedPrismaRequest({}, sender);
    if (sender?.id !== chrome.runtime.id || !verified) {
        sendResponse({ status: 'error', message: 'Campaign URL copies are only available from Prisma.' });
        return;
    }
    await context.handleOffscreenClipboard(request, sendResponse);
}

async function copyCampaignHeaderToClipboard(request, sender, sendResponse, context) {
    const verified = getVerifiedPrismaRequest({}, sender);
    if (sender?.id !== chrome.runtime.id || !verified) {
        sendResponse({ status: 'error', message: 'Campaign header copies are only available from Prisma.' });
        return;
    }
    if (typeof request?.text !== 'string' || !request.text.trim()) {
        sendResponse({ status: 'error', message: 'Campaign header copy text is missing.' });
        return;
    }
    await context.handleOffscreenClipboard(request, sendResponse);
}

async function copyOrderIdToClipboard(request, sender, sendResponse, context) {
    const verified = getVerifiedPrismaRequest({}, sender);
    if (sender?.id !== chrome.runtime.id || !verified) {
        sendResponse({ status: 'error', message: 'Order ID copies are only available from Prisma.' });
        return;
    }
    const orderId = typeof request?.text === 'string' ? request.text.trim() : '';
    if (!/^O-[A-Z0-9]+$/i.test(orderId)) {
        sendResponse({ status: 'error', message: 'A valid Order ID is required.' });
        return;
    }
    await context.handleOffscreenClipboard({ ...request, text: orderId }, sendResponse);
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

function persistOpenHelpGuideTabs() {
    return chrome.storage?.session?.set?.({
        [OPEN_HELP_GUIDE_TABS_KEY]: Array.from(openHelpGuideTabs)
    });
}

async function getLiveHelpGuidesPanelState(tabId) {
    if (typeof chrome.runtime?.getContexts !== 'function' || !tabId) return null;
    try {
        const contexts = await chrome.runtime.getContexts({
            contextTypes: ['SIDE_PANEL'],
            tabIds: [tabId]
        });
        if (!Array.isArray(contexts)) return null;
        const panelUrl = chrome.runtime.getURL('help-guides.html');
        return contexts.some(context =>
            context.documentUrl === panelUrl || context.documentUrl?.startsWith(`${panelUrl}?`)
        );
    } catch {
        return null;
    }
}

async function getHelpGuidesPanelState(request, sender, sendResponse) {
    const tabId = sender?.tab?.id;
    if (!tabId) {
        sendResponse({ status: 'error', message: 'Could not identify the current tab.' });
        return;
    }

    const stored = await chrome.storage?.session?.get?.({ [OPEN_HELP_GUIDE_TABS_KEY]: [] });
    const storedTabIds = stored?.[OPEN_HELP_GUIDE_TABS_KEY] || [];
    storedTabIds.forEach(storedTabId => openHelpGuideTabs.add(storedTabId));

    const liveState = await getLiveHelpGuidesPanelState(tabId);
    if (typeof liveState === 'boolean') {
        if (liveState) openHelpGuideTabs.add(tabId);
        else openHelpGuideTabs.delete(tabId);
        await persistOpenHelpGuideTabs();
    }
    sendResponse({ status: 'success', open: openHelpGuideTabs.has(tabId) });
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
        await persistOpenHelpGuideTabs();
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
    await persistOpenHelpGuideTabs();
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
    await persistOpenHelpGuideTabs();
    sendResponse({ status: 'success' });
}

async function closeHelpGuidesFromLauncher(request, sender, sendResponse) {
    const tabId = sender?.tab?.id;
    if (!tabId) {
        sendResponse({ status: 'error', message: 'Could not identify the current tab.' });
        return;
    }
    if (typeof chrome.sidePanel?.close !== 'function') {
        sendResponse({ status: 'unsupported' });
        return;
    }
    await chrome.sidePanel.close({ tabId });
    openHelpGuideTabs.delete(tabId);
    await persistOpenHelpGuideTabs();
    sendResponse({ status: 'success', panelState: 'closed' });
}

async function setHelpGuidesPanelState(tabId, isOpen) {
    if (!tabId) return;
    if (isOpen) openHelpGuideTabs.add(tabId);
    else openHelpGuideTabs.delete(tabId);
    await persistOpenHelpGuideTabs();
    try {
        await chrome.tabs.sendMessage(tabId, { action: 'helpGuidesPanelState', open: isOpen });
    } catch {
        // The page content script may be between route loads while the panel changes state.
    }
}

export async function handleHelpGuidesPanelEvent(info, isOpen) {
    if (String(info?.path || '').replace(/^\//, '') !== 'help-guides.html') return;
    let tabId = info?.tabId;
    if (!tabId) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        tabId = activeTab?.id;
    }
    // Chrome can deliver an old close event after a replacement panel has
    // already opened. Reconcile close events against the live context before
    // publishing state, otherwise the launcher briefly believes the panel is
    // closed and the next click refreshes it instead of closing it.
    const liveState = !isOpen ? await getLiveHelpGuidesPanelState(tabId) : null;
    if (liveState === true) isOpen = true;
    await setHelpGuidesPanelState(tabId, isOpen);
}

async function updateHelpGuidesPanelState(request, sender, sendResponse) {
    let tabId = sender?.tab?.id || request?.tabId;
    if (!tabId) {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        tabId = activeTab?.id;
    }
    await setHelpGuidesPanelState(tabId, request.action === 'helpGuidesPanelOpened');
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
    showTimesheetNotification,
    createTimesheetAlarm,
    removeTimesheetAlarm,
    metaBillingCheck,
    performDNumberSearch,
    getClipboardText,
    copyCampaignUrlToClipboard,
    copyCampaignHeaderToClipboard,
    copyOrderIdToClipboard,
    getFavouriteApprovers,
    openApproversPage,
    openHelpGuides,
    getHelpGuidesPanelState,
    closeHelpGuides,
    closeHelpGuidesFromLauncher,
    helpGuidesPanelOpened: updateHelpGuidesPanelState,
    helpGuidesPanelClosed: updateHelpGuidesPanelState,
    requestCampaignDetailsBasicFocus,
    rememberAccountSwitchUrl,
    getAccountSwitchUrl,
    clearAccountSwitchUrl,
    TRACK_STAT: handleTrackStat
};

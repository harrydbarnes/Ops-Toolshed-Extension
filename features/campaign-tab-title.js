(function() {
    'use strict';

    const SETTING_KEY = 'campaignTabTitleEnabled';
    const PRISMA_TITLE_PREFIX = 'Prisma Media - ';
    const PRISMA_DEFAULT_TITLE = 'Prisma Media';
    const CAMPAIGN_PATH = '/campaign-management';
    // Keep the rendered title within Prisma's safe length, including an ellipsis.
    const MAX_CAMPAIGN_TAB_TITLE_LENGTH = 99;

    let enabled = true;
    let initialized = false;
    let settingsReady = null;
    let activeCampaignId = '';
    let originalCampaignTitle = '';
    let appliedCampaignTitle = '';
    let campaignNameObserver = null;
    let titleObserver = null;
    let observedTitleElement = null;

    function isPrismaHost(hostname = window.location.hostname) {
        return hostname.includes('prisma.mediaocean.com') ||
            hostname === 'go.demo.mediaocean.com' ||
            hostname === 'go.mediaocean.com';
    }

    function getCampaignId() {
        if (!isPrismaHost()) return '';
        if (!window.location.pathname.startsWith(CAMPAIGN_PATH)) return '';

        const hash = window.location.hash.replace(/^#/, '');
        const params = new URLSearchParams(hash);
        const pspId = params.get('osPspId') || '';
        if (pspId === 'cm-dashboard' || window.location.href.includes('cm-dashboard')) return '';

        const campaignId = params.get('campaign-id') ||
            window.location.href.match(/(?:^#|[&?])campaign-id=([^&]+)/)?.[1] || '';
        return decodeURIComponent(campaignId);
    }

    function isCampaignRoute() {
        return Boolean(getCampaignId());
    }

    function isPlaceholderTitle(title) {
        const text = String(title || '').trim();
        if (!text) return true;
        if (/^prisma media(?:\s*-\s*)?$/i.test(text)) return true;
        const stripped = text.replace(/^prisma media\s*-\s*/i, '').trim();
        if (!stripped) return true;
        if (/^prsm[-_]cm/i.test(stripped)) return true;
        if (/^cm[-_]dashboard/i.test(stripped)) return true;
        return false;
    }

    function compactTitle(text) {
        return text.length <= MAX_CAMPAIGN_TAB_TITLE_LENGTH
            ? text
            : text.slice(0, MAX_CAMPAIGN_TAB_TITLE_LENGTH - 1).trimEnd() + '…';
    }

    function getCampaignTitle(title) {
        const text = String(title || '').trim();
        if (!text.startsWith(PRISMA_TITLE_PREFIX)) {
            return isPlaceholderTitle(text) ? '' : compactTitle(text);
        }
        const candidate = text.substring(PRISMA_TITLE_PREFIX.length).trim();
        if (isPlaceholderTitle(candidate)) return '';
        return compactTitle(candidate);
    }

    function getHeaderCampaignName(campaignId) {
        const pageDocument = window.document;
        if (!pageDocument?.querySelector) return '';
        const nameElement = pageDocument.querySelector('.mo-page-header .mo-campaign-name-wrapper') ||
            pageDocument.querySelector('.mo-campaign-name-wrapper') ||
            pageDocument.querySelector('[id$="-campaign-name"]');
        if (!nameElement) return '';

        const pageHeader = nameElement.closest('.mo-page-header, [class*="campaign-header"], .buy-details-wrapper');
        const headerText = pageHeader?.textContent || '';
        const numericCampaignId = String(campaignId || '').replace(/^CP/i, '');
        if (campaignId && headerText && !headerText.includes(campaignId) && !headerText.includes(numericCampaignId)) {
            if (/(?:^|\b)(?:CP[A-Z0-9]+|\d{5,})\b/i.test(headerText)) {
                return '';
            }
        }

        const campaignName = (nameElement.getAttribute('data-full-text') || nameElement.textContent || '').trim();
        if (!campaignName || isPlaceholderTitle(campaignName)) return '';

        return compactTitle(campaignName);
    }

    function stopCampaignNameObserver() {
        campaignNameObserver?.disconnect();
        campaignNameObserver = null;
    }

    function watchForCampaignName() {
        if (campaignNameObserver || !document.body || !enabled || !activeCampaignId) return;

        campaignNameObserver = new MutationObserver(() => {
            if (!getHeaderCampaignName(activeCampaignId)) return;
            applyCampaignTitle();
            stopCampaignNameObserver();
        });
        campaignNameObserver.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    function setActiveCampaign(campaignId) {
        if (campaignId === activeCampaignId) return;
        stopCampaignNameObserver();
        activeCampaignId = campaignId;
        originalCampaignTitle = '';
        appliedCampaignTitle = '';
    }

    function applyCampaignTitle() {
        const campaignId = getCampaignId();
        if (!enabled || !campaignId) return;
        setActiveCampaign(campaignId);

        const currentTitle = document.title;
        const headerCampaignName = getHeaderCampaignName(campaignId);
        if (headerCampaignName === null) {
            stopCampaignNameObserver();
            return;
        }

        const prefixedCampaignTitle = getCampaignTitle(currentTitle);
        const campaignTitle = headerCampaignName || prefixedCampaignTitle;

        if (!campaignTitle) {
            watchForCampaignName();
            if (isPlaceholderTitle(currentTitle) && currentTitle !== PRISMA_DEFAULT_TITLE) {
                appliedCampaignTitle = PRISMA_DEFAULT_TITLE;
                document.title = PRISMA_DEFAULT_TITLE;
            }
            return;
        }

        if (headerCampaignName) stopCampaignNameObserver();
        if (campaignTitle === currentTitle) return;

        if (currentTitle && currentTitle !== appliedCampaignTitle && !isPlaceholderTitle(currentTitle)) {
            originalCampaignTitle = currentTitle;
        }
        appliedCampaignTitle = campaignTitle;
        document.title = campaignTitle;
    }

    function restorePrismaTitle() {
        const titleToRestore = originalCampaignTitle;
        const titleAppliedByExtension = appliedCampaignTitle;
        originalCampaignTitle = '';
        appliedCampaignTitle = '';
        if (titleToRestore && document.title === titleAppliedByExtension) {
            document.title = titleToRestore;
        }
    }

    function refreshTitle() {
        const campaignId = getCampaignId();
        if (enabled && campaignId) {
            setActiveCampaign(campaignId);
            applyCampaignTitle();
            return;
        }

        stopCampaignNameObserver();
        if (!enabled) {
            restorePrismaTitle();
            return;
        }

        activeCampaignId = '';
        originalCampaignTitle = '';
        appliedCampaignTitle = '';
    }

    function observeTitleElement() {
        const titleElement = document.querySelector('title');
        if (!titleElement || titleElement === observedTitleElement) return;

        titleObserver?.disconnect();
        observedTitleElement = titleElement;
        titleObserver = new MutationObserver(refreshTitle);
        titleObserver.observe(titleElement, { childList: true, subtree: true, characterData: true });
    }

    function initialize() {
        if (!settingsReady) {
            settingsReady = new Promise((resolve, reject) => {
                chrome.storage.sync.get(SETTING_KEY, data => {
                    try {
                        if (chrome.runtime?.lastError) throw new Error(chrome.runtime.lastError.message);
                        enabled = data[SETTING_KEY] !== false;
                        refreshTitle();
                        resolve();
                    } catch (error) { reject(error); }
                });
            }).catch(error => { settingsReady = null; throw error; });
        }
        if (initialized) return settingsReady;
        initialized = true;

        // Prisma frequently adds styles and metadata to <head> while a
        // campaign loads. Watching the whole head made every one of those
        // unrelated mutations re-read and rewrite a campaign title. Observe
        // the title node itself, and only reconnect if Prisma replaces it.
        observeTitleElement();
        const headObserver = new MutationObserver(mutations => {
            const titleWasReplaced = mutations.some(mutation =>
                Array.from(mutation.addedNodes).some(node => node.nodeName === 'TITLE') ||
                Array.from(mutation.removedNodes).some(node => node.nodeName === 'TITLE')
            );
            if (!titleWasReplaced) return;
            observedTitleElement = null;
            observeTitleElement();
            refreshTitle();
        });
        headObserver.observe(document.head, { childList: true });
        window.addEventListener('pagehide', () => {
            titleObserver?.disconnect();
            titleObserver = null;
            observedTitleElement = null;
            stopCampaignNameObserver();
            headObserver.disconnect();
        }, { once: true });
        window.addEventListener('hashchange', refreshTitle);
        window.addEventListener('popstate', refreshTitle);

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'sync' || !changes[SETTING_KEY]) return;
            enabled = changes[SETTING_KEY].newValue !== false;
            refreshTitle();
        });
        return settingsReady;
    }

    window.campaignTabTitleFeature = {
        initialize,
        isCampaignRoute,
        applyCampaignTitle
    };
})();

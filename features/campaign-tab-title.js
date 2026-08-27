(function() {
    'use strict';

    const SETTING_KEY = 'campaignTabTitleEnabled';
    const PRISMA_TITLE_PREFIX = 'Prisma Media - ';
    const CAMPAIGN_HOST = 'groupmuk-prisma.mediaocean.com';
    const CAMPAIGN_PATH = '/campaign-management';
    // Prisma's header reacts poorly when a long campaign value is read and
    // written back as the document title during its initial render. Keep this
    // deliberately compact so normal tabs retain the feature while verbose
    // booking names stay on Prisma's native title.
    const MAX_CAMPAIGN_TAB_TITLE_LENGTH = 99;

    let enabled = true;
    let initialized = false;
    let activeCampaignId = '';
    let originalCampaignTitle = '';
    let appliedCampaignTitle = '';
    let campaignNameObserver = null;
    let titleObserver = null;
    let observedTitleElement = null;

    function getCampaignId() {
        if (window.location.hostname !== CAMPAIGN_HOST) return '';
        if (window.location.pathname.replace(/\/+$/, '') !== CAMPAIGN_PATH) return '';

        const params = new URLSearchParams(window.location.hash.substring(1));
        if (params.get('osAppId') !== 'prsm-cm-spa' ||
            params.get('osPspId') !== 'prsm-cm-plan-to-buy') return '';
        return params.get('campaign-id') || '';
    }

    function isCampaignRoute() {
        return Boolean(getCampaignId());
    }

    function getCampaignTitle(title) {
        if (!title.startsWith(PRISMA_TITLE_PREFIX)) return title;
        const campaignTitle = title.substring(PRISMA_TITLE_PREFIX.length).trim() || title;
        return campaignTitle.length <= MAX_CAMPAIGN_TAB_TITLE_LENGTH ? campaignTitle : '';
    }

    function getHeaderCampaignName(campaignId) {
        const pageDocument = window.document;
        if (!pageDocument?.querySelector) return '';
        const nameElement = pageDocument.querySelector('.mo-page-header .mo-campaign-name-wrapper');
        const pageHeader = nameElement?.closest('.mo-page-header');
        if (!nameElement || !pageHeader || !pageHeader.textContent.includes(campaignId)) return '';
        const campaignName = nameElement.textContent.trim();
        // Very long names can be repeatedly re-rendered by Prisma while the
        // header is settling. Do not turn that volatile UI value into a tab
        // title; leave Prisma's native title untouched for that campaign.
        return campaignName.length <= MAX_CAMPAIGN_TAB_TITLE_LENGTH ? campaignName : null;
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
        const campaignTitle = headerCampaignName ||
            (prefixedCampaignTitle !== currentTitle ? prefixedCampaignTitle : '');

        if (!headerCampaignName) watchForCampaignName();
        if (!campaignTitle || campaignTitle === currentTitle) return;

        if (currentTitle && currentTitle !== appliedCampaignTitle) {
            originalCampaignTitle = currentTitle;
        }
        appliedCampaignTitle = campaignTitle;
        document.title = campaignTitle;
        if (headerCampaignName) stopCampaignNameObserver();
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
        if (initialized) return;
        initialized = true;

        chrome.storage.sync.get(SETTING_KEY, data => {
            enabled = data[SETTING_KEY] !== false;
            refreshTitle();
        });

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
    }

    window.campaignTabTitleFeature = {
        initialize,
        isCampaignRoute,
        applyCampaignTitle
    };
})();

(function() {
    'use strict';

    const SETTING_KEY = 'campaignTabTitleEnabled';
    const PRISMA_TITLE_PREFIX = 'Prisma Media - ';
    const CAMPAIGN_HOST = 'groupmuk-prisma.mediaocean.com';
    const CAMPAIGN_PATH = '/campaign-management';

    let enabled = true;
    let initialized = false;
    let activeCampaignId = '';
    let originalCampaignTitle = '';
    let appliedCampaignTitle = '';
    let campaignNameObserver = null;

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
        return title.substring(PRISMA_TITLE_PREFIX.length).trim() || title;
    }

    function getHeaderCampaignName(campaignId) {
        const nameElement = document.querySelector('.mo-page-header .mo-campaign-name-wrapper');
        const pageHeader = nameElement?.closest('.mo-page-header');
        if (!nameElement || !pageHeader || !pageHeader.textContent.includes(campaignId)) return '';
        return nameElement.textContent.trim();
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

    function initialize() {
        if (initialized) return;
        initialized = true;

        chrome.storage.sync.get(SETTING_KEY, data => {
            enabled = data[SETTING_KEY] !== false;
            refreshTitle();
        });

        const observer = new MutationObserver(refreshTitle);
        observer.observe(document.head, { childList: true, subtree: true, characterData: true });
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

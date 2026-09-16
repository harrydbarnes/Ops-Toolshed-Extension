(function() {
    'use strict';

    const SETTING_KEY = 'planToBuyRedirectEnabled';
    const CAMPAIGN_PATH = '/campaign-management';
    let initialized = false;
    let enabled = true;
    let settingsLoaded = false;
    let manualPlanCampaignId = '';
    let manualPlanNavigationUntil = 0;

    function buildBuyUrl(currentHref) {
        let url;
        try {
            url = new URL(currentHref);
        } catch (error) {
            return '';
        }

        const isPrismaHost = url.hostname.includes('prisma.mediaocean.com') ||
            url.hostname === 'go.demo.mediaocean.com' ||
            url.hostname === 'go.mediaocean.com';
        if (!isPrismaHost || url.pathname.replace(/\/+$/, '') !== CAMPAIGN_PATH) return '';

        const params = new URLSearchParams(url.hash.replace(/^#/, ''));
        if (
            params.get('osPspId') !== 'prsm-cm-plan-to-buy' ||
            !params.get('campaign-id') ||
            params.get('ptb-mod') !== 'plan'
        ) return '';

        params.set('ptb-mod', 'buy');
        params.set('ptb-ctx', 'digital');
        params.set('route', 'online');
        params.delete('showOrders');
        params.delete('mos');
        url.hash = params.toString();
        return url.href;
    }

    function redirectIfNeeded(navigate = target => window.location.replace(target)) {
        if (!settingsLoaded || !enabled) return false;
        const target = buildBuyUrl(window.location.href);
        if (!target || target === window.location.href) {
            // The deliberate Plan visit has ended. A later direct Plan URL
            // should be treated as a fresh navigation.
            manualPlanCampaignId = '';
            manualPlanNavigationUntil = 0;
            return false;
        }

        const currentParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const campaignId = currentParams.get('campaign-id') || '';
        if (campaignId === manualPlanCampaignId && Date.now() <= manualPlanNavigationUntil) {
            // Chrome can report both popstate and hashchange for one navigation.
            // Keep this exception until leaving Plan so the second event cannot
            // undo a deliberate click.
            return false;
        }

        navigate(target);
        return true;
    }

    function rememberPlanTabClick(event) {
        if (!settingsLoaded || !enabled || event.defaultPrevented) return;
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

        const planLink = event.target?.closest?.('#p2b-navbar-section-plan, a[href*="ptb-mod=plan"]');
        if (!planLink) return;

        const href = planLink.getAttribute('href') || '';
        let targetParams;
        try {
            targetParams = new URLSearchParams(new URL(href, window.location.href).hash.replace(/^#/, ''));
        } catch (error) {
            targetParams = new URLSearchParams();
        }
        const currentParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        manualPlanCampaignId = targetParams.get('campaign-id') || currentParams.get('campaign-id') || '';
        manualPlanNavigationUntil = Date.now() + 5000;
    }

    function initialize(navigate) {
        if (initialized) return;
        initialized = true;

        chrome.storage.sync.get({ [SETTING_KEY]: true }, data => {
            enabled = data[SETTING_KEY] !== false;
            settingsLoaded = true;
            redirectIfNeeded(navigate);
        });

        chrome.storage.onChanged?.addListener((changes, area) => {
            if (area !== 'sync' || !changes[SETTING_KEY]) return;
            enabled = changes[SETTING_KEY].newValue !== false;
            settingsLoaded = true;
            redirectIfNeeded(navigate);
        });

        window.addEventListener('hashchange', () => redirectIfNeeded(navigate));
        window.addEventListener('popstate', () => redirectIfNeeded(navigate));
        window.addEventListener('pageshow', () => redirectIfNeeded(navigate));
        document.addEventListener('click', rememberPlanTabClick, true);
    }

    window.planToBuyRedirectFeature = {
        initialize,
        buildBuyUrl,
        redirectIfNeeded,
        rememberPlanTabClick,
        isInitialized: () => initialized,
        isEnabled: () => settingsLoaded && enabled
    };
})();

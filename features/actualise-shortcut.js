(function() {
    'use strict';

    const SETTING_KEY = 'actualiseShortcutEnabled';
    const LINK_ID = 'p2b-navbar-section-actualise';
    const ACTUALISE_WRAPPER_ID = 'toolshed-actualise-navbar-wrapper';

    let featureEnabled = true;
    let settingsLoaded = false;
    let initialized = false;

    function getHashParams() {
        return new URLSearchParams(window.location.hash.replace(/^#/, ''));
    }

    function isActualiseRoute() {
        const params = getHashParams();
        return params.get('ptb-ctx') === 'actualize' || params.get('route') === 'actualize';
    }

    function isOrderSummaryRoute(params = getHashParams()) {
        return params.get('ptb-ctx') === 'orderSummary' && params.get('showOrders') === 'true';
    }

    function getNavbarSections() {
        const navbars = Array.from(document.querySelectorAll('#p2b-navbar'));
        const injectedNavbar = navbars.find(navbar => navbar.closest(`#${ACTUALISE_WRAPPER_ID}`));
        const nativeNavbar = navbars.find(navbar => !navbar.closest(`#${ACTUALISE_WRAPPER_ID}`));
        const navbar = isActualiseRoute()
            ? injectedNavbar || nativeNavbar
            : nativeNavbar || injectedNavbar;
        return navbar?.querySelector(':scope > .mo-navbar-sections') ||
            navbar?.querySelector('.mo-navbar-sections');
    }

    function setActiveState(link, active) {
        if (!link) return;
        link.classList.toggle('active', active);
        if (active) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
    }

    function getCurrentMonthStart() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    }

    function getActualiseMonth(params) {
        const existingMonth = params.get('mos');
        return /^\d{4}-\d{2}-\d{2}$/.test(existingMonth || '')
            ? existingMonth
            : getCurrentMonthStart();
    }

    function buildActualiseHref(campaignId, month) {
        const params = new URLSearchParams([
            ['osAppId', 'prsm-cm-spa'],
            ['osPspId', 'prsm-cm-plan-to-buy'],
            ['campaign-id', campaignId],
            ['ptb-mod', 'buy'],
            ['ptb-ctx', 'actualize'],
            ['route', 'actualize'],
            ['mos', month]
        ]);
        return `#${params.toString()}`;
    }

    function restoreBuyActiveState() {
        if (!document.getElementById(ACTUALISE_WRAPPER_ID)) return;
        const buyLink = document.getElementById('p2b-navbar-section-buy');
        buyLink?.classList.add('active');
        buyLink?.setAttribute('aria-current', 'page');
    }

    function removeShortcut() {
        document.getElementById(LINK_ID)?.remove();
        restoreBuyActiveState();
    }

    function applyActiveState(link) {
        const params = getHashParams();
        const buyLink = document.getElementById('p2b-navbar-section-buy');
        const ordersLink = document.getElementById('p2b-navbar-section-orders');
        const actualiseActive = isActualiseRoute();
        const ordersActive = !actualiseActive && isOrderSummaryRoute(params);
        const buyActive = !actualiseActive && !ordersActive && params.get('ptb-mod') === 'buy';

        setActiveState(buyLink, buyActive);
        setActiveState(ordersLink, ordersActive);
        setActiveState(link, actualiseActive);
    }

    function apply() {
        if (!settingsLoaded || !featureEnabled) {
            removeShortcut();
            return;
        }

        const params = getHashParams();
        const campaignId = params.get('campaign-id');
        const sections = getNavbarSections();
        const analyzeLink = document.getElementById('p2b-navbar-section-analyze');
        const ordersLink = document.getElementById('p2b-navbar-section-orders');
        const buyLink = document.getElementById('p2b-navbar-section-buy');
        const insertionPoint = ordersLink || analyzeLink || buyLink;
        if (!campaignId || !sections || !insertionPoint) return;

        let link = document.getElementById(LINK_ID);
        if (!link) {
            link = document.createElement('a');
            link.id = LINK_ID;
            link.className = 'mo-navbar-section mo-text-uppercase';
            link.textContent = 'ACTUALISE';
        }

        link.href = buildActualiseHref(campaignId, getActualiseMonth(params));
        if (link.previousElementSibling !== insertionPoint) insertionPoint.after(link);
        applyActiveState(link);
    }

    function initialize() {
        if (initialized) return;
        initialized = true;

        chrome.storage.sync.get({ [SETTING_KEY]: true }, data => {
            featureEnabled = data[SETTING_KEY] !== false;
            settingsLoaded = true;
            apply();
        });

        chrome.storage.onChanged?.addListener((changes, area) => {
            if (area !== 'sync') return;
            if (changes[SETTING_KEY]) featureEnabled = changes[SETTING_KEY].newValue !== false;
            if (changes[SETTING_KEY]) apply();
        });

        window.addEventListener('hashchange', apply);
        window.addEventListener('popstate', apply);
        window.addEventListener('pageshow', apply);
    }

    window.actualiseShortcutFeature = {
        initialize,
        apply,
        removeShortcut,
        isActualiseRoute,
        isOrderSummaryRoute,
        isInitialized: () => initialized,
        isEnabled: () => settingsLoaded && featureEnabled
    };
})();

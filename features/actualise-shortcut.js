(function() {
    'use strict';

    const SETTING_KEY = 'actualiseShortcutEnabled';
    const PARENT_SETTING_KEY = 'optimisedNewNavEnabled';
    const LINK_ID = 'p2b-navbar-section-actualise';
    const ACTUALISE_WRAPPER_ID = 'toolshed-actualise-navbar-wrapper';

    let featureEnabled = true;
    let parentEnabled = true;
    let settingsLoaded = false;
    let initialized = false;

    function getHashParams() {
        return new URLSearchParams(window.location.hash.replace(/^#/, ''));
    }

    function isActualiseRoute() {
        const params = getHashParams();
        return params.get('ptb-ctx') === 'actualize' || params.get('route') === 'actualize';
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
        const buyLink = document.getElementById('p2b-navbar-section-buy');
        if (isActualiseRoute()) {
            buyLink?.classList.remove('active');
            buyLink?.removeAttribute('aria-current');
            link.classList.add('active');
            link.setAttribute('aria-current', 'page');
        } else {
            link.classList.remove('active');
            link.removeAttribute('aria-current');
        }
    }

    function apply() {
        if (!settingsLoaded || !featureEnabled || !parentEnabled) {
            removeShortcut();
            return;
        }

        const params = getHashParams();
        const campaignId = params.get('campaign-id');
        const sections = document.querySelector('#p2b-navbar > .mo-navbar-sections');
        const analyzeLink = document.getElementById('p2b-navbar-section-analyze');
        if (!campaignId || !sections || !analyzeLink) return;

        let link = document.getElementById(LINK_ID);
        if (!link) {
            link = document.createElement('a');
            link.id = LINK_ID;
            link.className = 'mo-navbar-section mo-text-uppercase';
            link.textContent = 'ACTUALISE';
        }

        link.href = buildActualiseHref(campaignId, getActualiseMonth(params));
        const ordersLink = document.getElementById('p2b-navbar-section-orders');
        const insertionPoint = ordersLink || analyzeLink;
        if (link.previousElementSibling !== insertionPoint) insertionPoint.after(link);
        applyActiveState(link);
    }

    function initialize() {
        if (initialized) return;
        initialized = true;

        chrome.storage.sync.get({
            [SETTING_KEY]: true,
            [PARENT_SETTING_KEY]: true
        }, data => {
            featureEnabled = data[SETTING_KEY] !== false;
            parentEnabled = data[PARENT_SETTING_KEY] !== false;
            settingsLoaded = true;
            apply();
        });

        chrome.storage.onChanged?.addListener((changes, area) => {
            if (area !== 'sync') return;
            if (changes[SETTING_KEY]) featureEnabled = changes[SETTING_KEY].newValue !== false;
            if (changes[PARENT_SETTING_KEY]) parentEnabled = changes[PARENT_SETTING_KEY].newValue !== false;
            if (changes[SETTING_KEY] || changes[PARENT_SETTING_KEY]) apply();
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
        isEnabled: () => settingsLoaded && featureEnabled && parentEnabled
    };
})();

(function() {
    'use strict';

    const SETTING_KEY = 'actualiseNavbarEnabled';
    const ORDERS_SETTING_KEY = 'ordersShortcutEnabled';
    const WRAPPER_ID = 'toolshed-actualise-navbar-wrapper';

    let featureEnabled = true;
    let ordersEnabled = true;
    let settingsLoaded = false;
    let initialized = false;

    function getHashParams() {
        return new URLSearchParams(window.location.hash.replace(/^#/, ''));
    }

    function isActualiseRoute() {
        const params = getHashParams();
        return params.get('ptb-ctx') === 'actualize' || params.get('route') === 'actualize';
    }

    function isCampaignWorkspaceRoute() {
        const params = getHashParams();
        const pspId = params.get('osPspId') || '';
        const isDashboard = pspId === 'cm-dashboard' || window.location.href.includes('cm-dashboard');
        return !isDashboard && (
            Boolean(params.get('campaign-id')) || pspId.startsWith('prsm-cm-')
        );
    }

    function isPrintMediaType() {
        if (document.querySelector('#ptb-header mo-icon[name="print"], .mo-page-header mo-icon[name="print"]')) {
            return true;
        }

        return Array.from(document.querySelectorAll('.buy-details-background, .buy-details-wrapper'))
            .some(element => /\|\s*P(?:\s|\/)/i.test(element.textContent || ''));
    }

    function getNativeNavbar() {
        return Array.from(document.querySelectorAll('#p2b-navbar')).find(navbar =>
            !navbar.closest(`#${WRAPPER_ID}`)
        );
    }

    function hasNativeNavbarReadyForHandoff() {
        const navbar = getNativeNavbar();
        const sections = navbar?.querySelector(':scope > .mo-navbar-sections') ||
            navbar?.querySelector('.mo-navbar-sections');
        if (!sections) return false;

        if (!ordersEnabled) {
            return Boolean(sections.querySelector('#p2b-navbar-section-buy, #p2b-navbar-section-analyze'));
        }

        return Boolean(
            sections.querySelector('#p2b-navbar-section-orders') ||
            Array.from(sections.querySelectorAll('a')).some(link =>
                link.textContent.trim().toLowerCase() === 'orders'
            )
        );
    }

    function buildHref(entries) {
        const params = new URLSearchParams();
        entries.forEach(([key, value]) => params.set(key, value));
        return `#${params.toString()}`;
    }

    function campaignEntries(campaignId) {
        return [
            ['osAppId', 'prsm-cm-spa'],
            ['osPspId', 'prsm-cm-plan-to-buy'],
            ['campaign-id', campaignId]
        ];
    }

    function createSection(id, label, href, active = false) {
        const link = document.createElement('a');
        link.id = id;
        link.href = href;
        link.className = 'mo-navbar-section mo-text-uppercase';
        link.textContent = label;
        if (active) {
            link.classList.add('active');
            link.setAttribute('aria-current', 'page');
        }
        return link;
    }

    function createNavbar(campaignId) {
        const wrapper = document.createElement('div');
        wrapper.id = WRAPPER_ID;
        wrapper.className = 'p2b-navbar-wrapper toolshed-actualise-navbar-wrapper';
        wrapper.dataset.campaignId = campaignId;
        wrapper.dataset.ordersEnabled = String(ordersEnabled);
        const printMediaType = isPrintMediaType();
        wrapper.dataset.printMediaType = String(printMediaType);

        const navbar = document.createElement('div');
        navbar.id = 'p2b-navbar';
        navbar.className = 'mo-react mo-navbar p2b-navbar';

        const sections = document.createElement('div');
        sections.className = 'mo-navbar-sections';
        const base = campaignEntries(campaignId);
        sections.append(
            createSection(
                'p2b-navbar-section-plan',
                'Plan',
                buildHref([...base, ['ptb-mod', 'plan'], ['ptb-ctx', 'rfpSummary']])
            ),
            createSection(
                'p2b-navbar-section-buy',
                'Buy',
                buildHref([...base, ['ptb-mod', 'buy'], ['ptb-ctx', 'digital'], ['route', 'online']]),
                true
            )
        );

        if (!printMediaType) {
            sections.append(
                createSection(
                    'p2b-navbar-section-traffic',
                    'Traffic',
                    buildHref([...base, ['ptb-mod', 'traffic']])
                ),
                createSection(
                    'p2b-navbar-section-analyze',
                    'Analyse',
                    buildHref([...base, ['ptb-mod', 'analyze']])
                )
            );
        }

        if (ordersEnabled) {
            sections.appendChild(createSection(
                'p2b-navbar-section-orders',
                'ORDERS',
                buildHref([...base, ['ptb-mod', 'buy'], ['ptb-ctx', 'orderSummary'], ['showOrders', 'true']])
            ));
        }

        const triangle = document.createElement('div');
        triangle.className = 'mo-navbar-sections-triangle';
        sections.appendChild(triangle);

        const titles = document.createElement('div');
        titles.className = 'mo-navbar-titles';
        const title = document.createElement('div');
        title.textContent = 'Media plan';
        const subtitleWrapper = document.createElement('div');
        const subtitle = document.createElement('div');
        subtitle.className = 'scenario-subtitle';
        subtitle.textContent = 'Actualise';
        subtitleWrapper.appendChild(subtitle);
        titles.append(title, subtitleWrapper);

        const layouts = document.createElement('div');
        layouts.className = 'mo-navbar-layouts';
        navbar.append(sections, titles, layouts);
        wrapper.appendChild(navbar);
        return wrapper;
    }

    function removeNavbar() {
        document.getElementById(WRAPPER_ID)?.remove();
    }

    function apply() {
        if (!settingsLoaded || !featureEnabled) {
            removeNavbar();
            return;
        }

        // Prisma replaces the Actualise-only navbar asynchronously when a
        // campaign route changes. Keep the existing nav mounted until the
        // native replacement exists so the Actualise shortcut has no visible
        // gap during the handoff.
        if (!isActualiseRoute()) {
            if (isCampaignWorkspaceRoute() && !hasNativeNavbarReadyForHandoff()) return;
            if (window.actualiseShortcutFeature?.isInitialized?.()) {
                window.actualiseShortcutFeature.apply();
            }
            removeNavbar();
            return;
        }

        const campaignId = getHashParams().get('campaign-id');
        const workspace = document.querySelector('.ptb-workspace-content-container');
        const content = workspace?.querySelector(':scope > .ptb-content-with-sidebar-wrapper');
        if (!campaignId || !workspace || !content) return;

        const existing = document.getElementById(WRAPPER_ID);
        const printMediaType = isPrintMediaType();
        const needsRefresh = existing && (
            existing.dataset.campaignId !== campaignId ||
            existing.dataset.ordersEnabled !== String(ordersEnabled) ||
            existing.dataset.printMediaType !== String(printMediaType)
        );
        if (needsRefresh) existing.remove();

        const navbar = document.getElementById(WRAPPER_ID) || createNavbar(campaignId);
        if (navbar.parentElement !== workspace || navbar.nextElementSibling !== content) {
            workspace.insertBefore(navbar, content);
        }
    }

    function initialize() {
        if (initialized) return;
        initialized = true;

        chrome.storage.sync.get({
            [SETTING_KEY]: true,
            [ORDERS_SETTING_KEY]: true
        }, data => {
            featureEnabled = data[SETTING_KEY] !== false;
            ordersEnabled = data[ORDERS_SETTING_KEY] !== false;
            settingsLoaded = true;
            apply();
        });

        chrome.storage.onChanged?.addListener((changes, area) => {
            if (area !== 'sync') return;
            if (changes[SETTING_KEY]) featureEnabled = changes[SETTING_KEY].newValue !== false;
            if (changes[ORDERS_SETTING_KEY]) ordersEnabled = changes[ORDERS_SETTING_KEY].newValue !== false;
            if (changes[SETTING_KEY] || changes[ORDERS_SETTING_KEY]) apply();
        });

        window.addEventListener('hashchange', apply);
        window.addEventListener('popstate', apply);
        window.addEventListener('pageshow', apply);
    }

    window.actualiseNavbarFeature = {
        initialize,
        apply,
        removeNavbar,
        isActualiseRoute,
        isPrintMediaType,
        isInitialized: () => initialized,
        isEnabled: () => settingsLoaded && featureEnabled
    };
})();

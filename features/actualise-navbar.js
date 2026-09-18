(function() {
    'use strict';

    const SETTING_KEY = 'actualiseNavbarEnabled';
    const ORDERS_SETTING_KEY = 'ordersShortcutEnabled';
    const WRAPPER_ID = 'toolshed-actualise-navbar-wrapper';
    const NATIVE_HIDDEN_ATTRIBUTE = 'toolshedActualiseNativeHidden';
    const NATIVE_PREVIOUS_DISPLAY_ATTRIBUTE = 'toolshedActualisePreviousDisplay';
    const NATIVE_HIDDEN_SELECTOR = '[data-toolshed-actualise-native-hidden="true"]';
    const MONTH_SELECTOR_ID = 'toolshed-actualise-month-selector';
    const MONTH_SELECTOR_CLASS = 'toolshed-actualise-month-selector';
    const NATIVE_MONTH_GROUP_ATTRIBUTE = 'data-toolshed-actualise-native-month-group';
    const MONTH_NAMES = Object.freeze({
        jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
        jul: '07', aug: '08', sep: '09', sept: '09', oct: '10', nov: '11', dec: '12'
    });
    const MONTH_LABEL_PATTERN = /^([A-Za-z]{3,9})\s+(\d{2}|\d{4})$/;
    const NAMED_DATE_PATTERN = /([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/g;
    const ABBREVIATED_START_DATE_PATTERN = /([A-Za-z]{3,9})\s+\d{1,2}\s*[-–—]\s*([A-Za-z]{3,9})\s+\d{1,2},?\s+(\d{4})/i;
    const NUMERIC_DATE_PATTERN = /(\d{1,2})[/-](\d{1,2})[/-](\d{4})/g;
    const MAX_MONTH_NAVIGATION_STEPS = 36;

    let featureEnabled = true;
    let ordersEnabled = true;
    let settingsLoaded = false;
    let initialized = false;
    let pendingMonthSelection = null;
    let monthNavigationToken = 0;

    function normalizeText(value) {
        return String(value ?? '').replace(/\s+/g, ' ').trim();
    }

    function monthKey(year, month) {
        const numericYear = Number(year);
        const numericMonth = Number(month);
        if (!Number.isInteger(numericYear) || numericYear < 1900 || numericYear > 2200 ||
            !Number.isInteger(numericMonth) || numericMonth < 1 || numericMonth > 12) {
            return null;
        }
        return `${numericYear}-${String(numericMonth).padStart(2, '0')}`;
    }

    function normalizeMonth(value) {
        const text = normalizeText(value).replace(/:$/, '');
        const isoMatch = text.match(/^(\d{4})-(0[1-9]|1[0-2])(?:-\d{2})?$/);
        if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}`;

        const labelMatch = text.match(MONTH_LABEL_PATTERN);
        if (!labelMatch) return null;
        const month = MONTH_NAMES[labelMatch[1].slice(0, 3).toLowerCase()];
        const year = labelMatch[2].length === 2 ? `20${labelMatch[2]}` : labelMatch[2];
        return monthKey(year, month);
    }

    function formatMonth(month) {
        const match = String(month || '').match(/^(\d{4})-(\d{2})$/);
        if (!match) return '';
        const monthName = Object.entries(MONTH_NAMES)
            .find(([, value]) => value === match[2])?.[0] || '';
        return `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${match[1].slice(-2)}`;
    }

    function incrementMonth(month) {
        const match = String(month || '').match(/^(\d{4})-(\d{2})$/);
        if (!match) return null;
        let year = Number(match[1]);
        let numericMonth = Number(match[2]) + 1;
        if (numericMonth > 12) {
            numericMonth = 1;
            year += 1;
        }
        return monthKey(year, numericMonth);
    }

    function getCampaignMonthRange(text) {
        const normalized = normalizeText(text);
        if (!normalized) return [];

        const namedDates = [];
        for (const match of normalized.matchAll(NAMED_DATE_PATTERN)) {
            const month = MONTH_NAMES[match[1].slice(0, 3).toLowerCase()];
            const parsed = monthKey(match[3], month);
            if (parsed) namedDates.push(parsed);
        }

        const numericDates = [];
        for (const match of normalized.matchAll(NUMERIC_DATE_PATTERN)) {
            // Prisma displays campaign dates in day/month/year order on the
            // numeric fallback, matching the date fields in the grid.
            const parsed = monthKey(match[3], match[2]);
            if (parsed) numericDates.push(parsed);
        }

        let dates = namedDates.length >= 2 ? namedDates : numericDates;
        if (dates.length < 2) {
            const abbreviated = normalized.match(ABBREVIATED_START_DATE_PATTERN);
            if (abbreviated) {
                const endYear = Number(abbreviated[3]);
                const startMonth = Number(MONTH_NAMES[abbreviated[1].slice(0, 3).toLowerCase()]);
                const endMonth = Number(MONTH_NAMES[abbreviated[2].slice(0, 3).toLowerCase()]);
                const startYear = startMonth > endMonth ? endYear - 1 : endYear;
                const inferredStart = monthKey(startYear, startMonth);
                const inferredEnd = monthKey(endYear, endMonth);
                if (inferredStart && inferredEnd) dates = [inferredStart, inferredEnd];
            }
        }
        if (dates.length < 2) return [];

        const start = dates[0] <= dates[1] ? dates[0] : dates[1];
        const end = dates[0] <= dates[1] ? dates[1] : dates[0];
        const months = [];
        let cursor = start;
        while (cursor && cursor <= end && months.length <= 120) {
            months.push({ key: cursor, label: formatMonth(cursor) });
            if (cursor === end) break;
            cursor = incrementMonth(cursor);
        }
        return months;
    }

    function getCampaignDateText() {
        const dateField = document.querySelector('.mo-date-field-wrapper');
        if (!dateField) return '';
        return dateField.textContent || dateField.getAttribute('data-full-text') || '';
    }

    function getActualiseMonthsGroup() {
        return document.querySelector('#actualize-toolbar .actual-months-group') ||
            document.querySelector('.actual-months-group');
    }

    function getNativeMonthButtonGroup(group = getActualiseMonthsGroup()) {
        return group?.querySelector('.month-button-group') ||
            group?.querySelector('mo-button-group') || null;
    }

    function getNativeMonthItems(group = getNativeMonthButtonGroup()) {
        return Array.from(group?.querySelectorAll('mo-button-group-item') || []);
    }

    function getNativeMonth(item) {
        return normalizeMonth(item?.querySelector('.month-btn-label')?.textContent || item?.textContent);
    }

    function findNativeArrow(group, direction) {
        const pattern = direction === 'next' ? /next|right|forward/i : /prev|previous|left|back/i;
        return getNativeMonthItems(group).find(item => {
            const iconName = item.querySelector('mo-icon')?.getAttribute('name') || '';
            return pattern.test(`${item.getAttribute('value') || ''} ${item.getAttribute('aria-label') || ''} ${iconName}`);
        }) || null;
    }

    function triggerNativeButton(button) {
        if (!button) return false;
        if (typeof button.click === 'function') {
            button.click();
            return true;
        }
        const ownerWindow = button.ownerDocument?.defaultView;
        if (ownerWindow?.MouseEvent) {
            button.dispatchEvent(new ownerWindow.MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: ownerWindow
            }));
            return true;
        }
        return false;
    }

    function syncMonthSelectorState(selector, group) {
        if (!selector || !group) return;
        const activeItem = getNativeMonthItems(group)
            .find(item => item.getAttribute('aria-pressed') === 'true' || item.getAttribute('selected') === 'true');
        const activeMonth = getNativeMonth(activeItem);
        if (pendingMonthSelection && activeMonth !== pendingMonthSelection) return;
        if (pendingMonthSelection === activeMonth) pendingMonthSelection = null;
        selector.querySelectorAll('button[data-month]').forEach(button => {
            const selected = button.dataset.month === activeMonth;
            button.classList.toggle('is-selected', selected);
            button.setAttribute('aria-pressed', String(selected));
        });
    }

    function selectNativeMonth(month, attempt = 0, token = monthNavigationToken) {
        if (token !== monthNavigationToken) return false;
        if (!isActualiseRoute()) return false;
        const group = getNativeMonthButtonGroup();
        if (!group) return false;

        const target = getNativeMonthItems(group).find(item => getNativeMonth(item) === month);
        if (target) return triggerNativeButton(target);
        if (attempt >= MAX_MONTH_NAVIGATION_STEPS) {
            if (token === monthNavigationToken) pendingMonthSelection = null;
            return false;
        }

        const visibleMonths = getNativeMonthItems(group)
            .map(getNativeMonth)
            .filter(Boolean)
            .sort();
        const direction = visibleMonths.length && month > visibleMonths[visibleMonths.length - 1]
            ? 'next'
            : visibleMonths.length && month < visibleMonths[0] ? 'previous' : null;
        const arrow = direction ? findNativeArrow(group, direction) : null;
        if (!arrow || !triggerNativeButton(arrow)) {
            if (token === monthNavigationToken) pendingMonthSelection = null;
            return false;
        }

        window.setTimeout(() => selectNativeMonth(month, attempt + 1, token), 60);
        return true;
    }

    function removeMonthSelector() {
        pendingMonthSelection = null;
        monthNavigationToken += 1;
        document.getElementById(MONTH_SELECTOR_ID)?.remove();
        document.querySelectorAll(`[${NATIVE_MONTH_GROUP_ATTRIBUTE}]`)
            .forEach(group => group.removeAttribute(NATIVE_MONTH_GROUP_ATTRIBUTE));
    }

    function renderMonthSelector(months, group = getActualiseMonthsGroup()) {
        if (!group || !months.length) {
            removeMonthSelector();
            return null;
        }

        const nativeGroup = getNativeMonthButtonGroup(group);
        if (!nativeGroup) return null;

        let selector = document.getElementById(MONTH_SELECTOR_ID);
        const rangeKey = months.map(month => month.key).join(',');
        if (!selector || selector.parentElement !== group || selector.dataset.monthRange !== rangeKey) {
            pendingMonthSelection = null;
            monthNavigationToken += 1;
            selector?.remove();
            selector = document.createElement('div');
            selector.id = MONTH_SELECTOR_ID;
            selector.className = MONTH_SELECTOR_CLASS;
            selector.dataset.monthRange = rangeKey;
            selector.setAttribute('role', 'group');
            selector.setAttribute('aria-label', 'Actualise months');
            months.forEach(month => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'toolshed-actualise-month-button';
                button.dataset.month = month.key;
                button.textContent = month.label;
                button.setAttribute('aria-label', `Select ${month.label}`);
                button.setAttribute('aria-pressed', 'false');
                button.addEventListener('click', () => {
                    pendingMonthSelection = month.key;
                    monthNavigationToken += 1;
                    const token = monthNavigationToken;
                    selector.querySelectorAll('button[data-month]').forEach(candidate => {
                        const selected = candidate === button;
                        candidate.classList.toggle('is-selected', selected);
                        candidate.setAttribute('aria-pressed', String(selected));
                    });
                    selectNativeMonth(month.key, 0, token);
                    window.setTimeout(() => syncMonthSelectorState(selector, getActualiseMonthsGroup()), 120);
                });
                selector.appendChild(button);
            });
            group.insertBefore(selector, nativeGroup);
        }

        nativeGroup.setAttribute(NATIVE_MONTH_GROUP_ATTRIBUTE, 'true');
        syncMonthSelectorState(selector, group);
        if (!nativeGroup.dataset.toolshedMonthSelectorBound) {
            nativeGroup.dataset.toolshedMonthSelectorBound = 'true';
            nativeGroup.addEventListener('click', () => {
                window.setTimeout(() => syncMonthSelectorState(selector, getActualiseMonthsGroup()), 0);
            });
        }
        return selector;
    }

    function ensureMonthSelector() {
        if (!isActualiseRoute()) {
            removeMonthSelector();
            return null;
        }
        const months = getCampaignMonthRange(getCampaignDateText());
        return renderMonthSelector(months, getActualiseMonthsGroup());
    }

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

    function getNativeNavbarContainers() {
        const containers = new Set();

        Array.from(document.querySelectorAll('.p2b-navbar-wrapper')).forEach(wrapper => {
            if (!wrapper.closest(`#${WRAPPER_ID}`)) containers.add(wrapper);
        });

        Array.from(document.querySelectorAll('#p2b-navbar')).forEach(navbar => {
            if (navbar.closest(`#${WRAPPER_ID}`)) return;
            containers.add(navbar.closest('.p2b-navbar-wrapper') || navbar);
        });

        return Array.from(containers);
    }

    function hideNativeNavbarContainers() {
        getNativeNavbarContainers().forEach(container => {
            if (container.dataset[NATIVE_HIDDEN_ATTRIBUTE] !== 'true') {
                container.dataset[NATIVE_HIDDEN_ATTRIBUTE] = 'true';
                container.dataset[NATIVE_PREVIOUS_DISPLAY_ATTRIBUTE] = container.style.display;
            }
            container.style.display = 'none';
        });
    }

    function restoreNativeNavbarContainers() {
        document.querySelectorAll(NATIVE_HIDDEN_SELECTOR)
            .forEach(container => {
                const previousDisplay = container.dataset[NATIVE_PREVIOUS_DISPLAY_ATTRIBUTE];
                if (previousDisplay) container.style.display = previousDisplay;
                else container.style.removeProperty('display');
                delete container.dataset[NATIVE_HIDDEN_ATTRIBUTE];
                delete container.dataset[NATIVE_PREVIOUS_DISPLAY_ATTRIBUTE];
            });
    }

    function hasNativeNavbarReadyForHandoff() {
        const navbar = getNativeNavbar();
        const sections = navbar?.querySelector(':scope > .mo-navbar-sections') ||
            navbar?.querySelector('.mo-navbar-sections');
        if (!sections) return false;

        // Orders and Actualise are extension-owned additions to Prisma's
        // native bar. Any native navigation link is the handoff point; wait
        // for the native sections to contain a link before removing the
        // temporary Actualise bar, but do not wait for our own Orders shortcut
        // to exist first.
        return Boolean(sections.querySelector('a'));
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
            restoreNativeNavbarContainers();
            removeNavbar();
            removeMonthSelector();
            return;
        }

        // Prisma replaces the Actualise-only navbar asynchronously when a
        // campaign route changes. Keep the existing nav mounted until the
        // native replacement exists so the Actualise shortcut has no visible
        // gap during the handoff.
        if (!isActualiseRoute()) {
            removeMonthSelector();
            if (isCampaignWorkspaceRoute() && !hasNativeNavbarReadyForHandoff()) {
                hideNativeNavbarContainers();
                return;
            }
            if (isCampaignWorkspaceRoute()) {
                window.campaignFeature?.ensureOrdersNavigation?.();
            }
            if (window.actualiseShortcutFeature?.isInitialized?.()) {
                window.actualiseShortcutFeature.apply();
            }
            removeNavbar();
            restoreNativeNavbarContainers();
            return;
        }

        // The native Orders bar can remain mounted for a short time after the
        // hash changes. Hide it before inserting Actualise so both owners are
        // never visible in the same frame.
        hideNativeNavbarContainers();

        const campaignId = getHashParams().get('campaign-id');
        const workspace = document.querySelector('.ptb-workspace-content-container');
        const content = workspace?.querySelector(':scope > .ptb-content-with-sidebar-wrapper');
        if (!campaignId || !workspace || !content) {
            ensureMonthSelector();
            return;
        }

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
        ensureMonthSelector();
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
        ensureMonthSelector,
        getCampaignMonthRange,
        renderMonthSelector,
        isActualiseRoute,
        isPrintMediaType,
        isInitialized: () => initialized,
        isEnabled: () => settingsLoaded && featureEnabled
    };
})();

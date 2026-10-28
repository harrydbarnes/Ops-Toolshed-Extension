(function() {
    'use strict';

    const VIEW_SETTING_KEY = 'campaignHistoryEnabled';
    const LOGGING_SETTING_KEY = 'campaignHistoryLoggingEnabled';
    const STORAGE_KEY = 'campaignHistoryEntries';
    const MAX_HISTORY_ENTRIES = 2000;
    const NAVIGATION_ID = 'toolshed-campaign-history-nav';
    const PRISMA_BANNER_MODULE_CONTAINER_ID = 'mo-banner-module-container';
    const PRISMA_OVERFLOW_MENU_TAG = 'MO-BANNER-MODULE-OVERFLOW-MENU-CONTENT';
    const OVERFLOW_NAVIGATION_ID = 'toolshed-campaign-history-overflow-nav';
    const OVERFLOW_MENU_ID = 'toolshed-campaign-history-overflow-menu';
    const RESPONSIVE_HISTORY_ITEM_ID = 'toolshed-campaign-history-overflow-item';
    const SHADOW_NAVIGATION_STYLE_ID = 'toolshed-campaign-history-shadow-styles';
    const OVERFLOW_SPACING_STYLE_ID = 'toolshed-campaign-history-overflow-spacing-styles';
    const OVERFLOW_COLLAPSED_CLASS = 'toolshed-campaign-history-overflow-collapsed';
    const OVERFLOW_VISIBLE_CLASS = 'toolshed-campaign-history-overflow-visible';
    const OVERFLOW_OFFSET_PROPERTY = '--toolshed-campaign-history-overflow-offset-x';
    const EXTENSION_NAVIGATION_NODE_IDS = new Set([
        NAVIGATION_ID,
        OVERFLOW_NAVIGATION_ID,
        OVERFLOW_MENU_ID,
        RESPONSIVE_HISTORY_ITEM_ID,
        'toolshed-campaign-history-panel',
        SHADOW_NAVIGATION_STYLE_ID,
        OVERFLOW_SPACING_STYLE_ID
    ]);
    const OVERFLOW_MENU_TRIGGER_CLASS = 'toolshed-campaign-history-overflow-trigger';
    const NAVIGATION_RESIZE_SETTLE_DELAY_MS = 100;
    const RESPONSIVE_OVERFLOW_HOVER_DELAY_MS = 250;
    const PANEL_ID = 'toolshed-campaign-history-panel';
    const HISTORY_KEY_ATTRIBUTE = 'data-toolshed-history-key';
    const PANEL_TRANSITION_DURATION_MS = 240;
    const COLLAPSED_HISTORY_PAGE_SIZE = 4;
    const HISTORY_PAGE_TRANSITION_CLASSES = Object.freeze([
        'is-page-transitioning-next',
        'is-page-transitioning-previous'
    ]);
    const DEFAULT_SETTINGS = Object.freeze({
        [VIEW_SETTING_KEY]: true,
        [LOGGING_SETTING_KEY]: true
    });
    const NON_SUPPLIER_VALUE_PATTERN = /^redistribute(?: all)?$/i;

    const searchableFields = [
        'campaignName',
        'clientName',
        'campaignId',
        'cpNumber',
        'clPrCa',
        'rawClPrCa',
        'supplier',
        'location'
    ];
    const LOCATION_CODE_PATTERN = /^[A-Z][A-Z0-9._-]{3,31}$/i;

    let initialized = false;
    let extensionContextInvalidated = false;
    let settingsReady = false;
    let viewEnabled = DEFAULT_SETTINGS[VIEW_SETTING_KEY];
    let loggingEnabled = DEFAULT_SETTINGS[LOGGING_SETTING_KEY];
    let historyLoaded = false;
    let historyLoadPromise = null;
    let historyLoadError = null;
    let historyEntries = [];
    let historyPageIndex = 0;
    let historyWriteQueue = Promise.resolve();
    let activeVisitKey = '';
    let activeVisitFingerprint = '';
    let panelCloseTimer = null;
    let panelCloseTarget = null;
    let panelCloseTransitionHandler = null;
    let panelGeometryCleanupTimer = null;
    let historyOutsideClickHandler = null;
    let navigationObserver = null;
    let navigationResizeObserver = null;
    let navigationObservedRoots = new Set();
    let navigationObservedResizeTargets = new WeakSet();
    let navigationObservedResizeWidths = new WeakMap();
    let navigationObservedOverflowMenus = new WeakSet();
    let navigationMeasuredWidths = new WeakMap();
    let currentNavigationLink = null;
    let navigationReconciliationQueued = false;
    let navigationResizeReconciliationTimer = null;
    let overflowMenuInteractionsInstalled = false;
    let responsiveOverflowCloseTimer = null;
    let responsiveOverflowHoverTimer = null;
    let responsiveOverflowPointerDownOnTrigger = false;
    let responsiveOverflowOpenedByHover = false;
    let responsiveOverflowItems = [];
    let responsiveOverflowTriggerAttributes = new WeakMap();
    let campaignHistoryUsesOverflow = false;
    let campaignHistoryBlockedLayoutSignature = '';

    function normalizeWhitespace(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function normalizeSearchText(value) {
        const text = normalizeWhitespace(value).toLocaleLowerCase();
        return typeof text.normalize === 'function'
            ? text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            : text;
    }

    function getRuntimeError() {
        try {
            return chrome.runtime?.lastError || null;
        } catch (_error) {
            return null;
        }
    }

    function callStorage(storageArea, method, ...args) {
        return new Promise((resolve, reject) => {
            if (extensionContextInvalidated) {
                reject(new Error('Extension context invalidated.'));
                return;
            }
            if (!storageArea || typeof storageArea[method] !== 'function') {
                reject(new Error(`Storage method ${method} is unavailable.`));
                return;
            }

            let settled = false;
            const settle = (callback, value) => {
                if (settled) return;
                settled = true;
                if (callback === reject && /extension context invalidated/i.test(value?.message || String(value))) {
                    extensionContextInvalidated = true;
                    removeNavigationObserver();
                    removeNavigationLink();
                    closeHistoryPanel({ animate: false });
                }
                callback(value);
            };
            const callback = value => {
                const runtimeError = getRuntimeError();
                if (runtimeError) {
                    settle(reject, new Error(runtimeError.message || 'Storage request failed.'));
                    return;
                }
                settle(resolve, value);
            };

            let result;
            try {
                result = storageArea[method](...args, callback);
            } catch (error) {
                settle(reject, error);
                return;
            }

            if (result && typeof result.then === 'function') {
                result.then(
                    value => settle(resolve, value),
                    error => settle(reject, error)
                );
            }
        });
    }

    async function readSettings() {
        try {
            const result = await callStorage(
                chrome.storage?.sync,
                'get',
                DEFAULT_SETTINGS
            );
            return { ...DEFAULT_SETTINGS, ...(result || {}) };
        } catch (error) {
            if (extensionContextInvalidated) return { ...DEFAULT_SETTINGS };
            console.warn('[Campaign History] Could not read settings; using defaults.', error);
            return { ...DEFAULT_SETTINGS };
        }
    }

    function getRouteParams() {
        return new URLSearchParams(window.location.hash.replace(/^#/, ''));
    }

    function getCampaignId() {
        return normalizeWhitespace(getRouteParams().get('campaign-id') || '');
    }

    function buildHistoryKey(campaignId, url, location = '') {
        const normalizedCampaignId = normalizeSearchText(campaignId);
        const normalizedLocation = normalizeSearchText(location);
        if (normalizedCampaignId) {
            return `campaign:${normalizedCampaignId}${normalizedLocation ? `@${normalizedLocation}` : ''}`;
        }
        return `url:${normalizeSearchText(url)}`;
    }

    function isPrismaPage() {
        const hostname = window.location.hostname || '';
        return hostname.includes('prisma.mediaocean.com') ||
            hostname === 'go.demo.mediaocean.com' ||
            hostname === 'go.mediaocean.com';
    }

    function isCampaignRoute() {
        const pathname = (window.location.pathname || '').replace(/\/+$/, '');
        const params = getRouteParams();
        const isDashboard = params.get('osPspId') === 'cm-dashboard' ||
            window.location.href.includes('cm-dashboard');

        return isPrismaPage() &&
            pathname === '/campaign-management' &&
            !isDashboard &&
            Boolean(getCampaignId());
    }

    function getTextFromElement(element) {
        if (!element) return '';
        const dataText = element.getAttribute?.('data-full-text') ||
            element.getAttribute?.('data-value');
        if (dataText) return normalizeWhitespace(dataText);
        if ('value' in element && typeof element.value === 'string' && element.value.trim()) {
            return normalizeWhitespace(element.value);
        }
        return normalizeWhitespace(element.textContent || '');
    }

    function getFrameElements(frame, visited) {
        try {
            const frameDocument = frame.contentDocument;
            return frameDocument ? getElementsIncludingShadowDom(frameDocument, visited) : [];
        } catch (_error) {
            // Cross-origin frames are expected in the Mediaocean shell.
            return [];
        }
    }

    function getElementsIncludingShadowDom(root = document, visited = new Set()) {
        if (!root || visited.has(root)) return [];
        visited.add(root);

        let elements = [];
        try {
            elements = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
        } catch (_error) {
            elements = [];
        }

        const result = [];
        elements.forEach(element => {
            if (visited.has(element)) return;
            visited.add(element);
            result.push(element);
            if (element.shadowRoot) {
                result.push(...getElementsIncludingShadowDom(element.shadowRoot, visited));
            }
            if (element.tagName === 'IFRAME') {
                result.push(...getFrameElements(element, visited));
            }
        });

        return result;
    }

    function getCampaignName() {
        const elements = [
            ...document.querySelectorAll('.mo-page-header .mo-campaign-name-wrapper'),
            ...document.querySelectorAll('.mo-campaign-name-wrapper')
        ];
        return elements.map(getTextFromElement).find(value => value && value.length <= 300) || '';
    }

    function getBuyDetailsText() {
        const element = document.querySelector('.buy-details-wrapper, .buy-details-background');
        return getTextFromElement(element);
    }

    function getHeaderReferences() {
        const text = getBuyDetailsText();
        const campaignId = getCampaignId();
        const campaignMatch = text.match(/(?:^|\s)(CP[A-Z0-9-]+)(?=\s*\|)/i);
        const clPrCaMatch = text.match(/(?:^|\s)((?:[DP]\/)?[A-Z0-9]+\/\d+\/\d+)(?=\s|$)/i);
        const rawClPrCa = normalizeWhitespace(clPrCaMatch?.[1] || '');

        return {
            campaignId,
            cpNumber: normalizeWhitespace(campaignMatch?.[1] || campaignId),
            rawClPrCa,
            clPrCa: rawClPrCa.replace(/^[DP]\//i, '')
        };
    }

    function parseLocationCode(value, allowUsernameSuffix = false) {
        const text = normalizeWhitespace(value);
        if (!text) return '';

        if (LOCATION_CODE_PATTERN.test(text)) return text.toUpperCase();
        if (!allowUsernameSuffix) return '';

        const suffix = text.match(/@([A-Z][A-Z0-9._-]{3,31})$/i)?.[1] || '';
        return LOCATION_CODE_PATTERN.test(suffix) ? suffix.toUpperCase() : '';
    }

    function getActiveLocation() {
        const contextLabels = getElementsIncludingShadowDom()
            .filter(element => element.id === 'user-context-menu-label')
            .map(element => getTextFromElement(element));
        const contextLocation = contextLabels
            .map(value => parseLocationCode(value))
            .find(Boolean);
        if (contextLocation) return contextLocation;

        // banner-username may expose the active organisation as the suffix of
        // the signed-in username when the context menu is not currently open.
        return getElementsIncludingShadowDom()
            .filter(element => element.classList?.contains('user-company-name'))
            .map(element => getTextFromElement(element))
            .map(value => parseLocationCode(value, true))
            .find(Boolean) || '';
    }

    function getInlineLabelValue(text, labels) {
        if (!text) return '';
        const labelPattern = labels.join('|');
        const nextLabelPattern = [
            'client(?: name)?',
            'advertiser',
            'supplier'
        ].join('|');
        const expression = new RegExp(
            `(?:^|[\\n|])\\s*(?:${labelPattern})\\s*[:\\-]\\s*([^\\n|]+?)(?=\\s+(?:${nextLabelPattern})\\s*[:\\-]|$)`,
            'i'
        );
        return normalizeWhitespace(text.match(expression)?.[1] || '');
    }

    function getAssociatedValue(element) {
        const htmlFor = element.getAttribute?.('for');
        if (htmlFor) {
            const associated = document.getElementById(htmlFor);
            const value = getTextFromElement(associated);
            if (value) return value;
        }

        const siblingValue = getTextFromElement(element.nextElementSibling);
        if (siblingValue) return siblingValue;

        const parent = element.parentElement;
        if (!parent) return '';
        const children = Array.from(parent.children)
            .filter(child => child !== element)
            .map(getTextFromElement)
            .filter(Boolean);
        return children.sort((a, b) => a.length - b.length)[0] || '';
    }

    function isExactLabel(value, patterns) {
        return patterns.some(pattern => pattern.test(value));
    }

    function isSupplierCell(element) {
        if (!element) return false;
        if (element.matches?.('.redistribute-btn-col, button, [role="button"]')) return false;
        return !element.querySelector?.('button, [role="button"]');
    }

    function normalizeRenderedSupplierValue(value, element) {
        const normalized = normalizeWhitespace(value);
        if (!normalized) return '';

        // Actualise appends the supplier id to its visible supplier group. Keep
        // the name so it remains consistent with the Buy view's supplier row.
        const row = element?.closest?.('tr');
        if (element?.classList?.contains('hierarchical-level-group-0') &&
            element.classList.contains('hierarchical-name') &&
            row?.querySelector('.mo-row-expandcollapse')) {
            return normalizeWhitespace(normalized.replace(/\s+\|\s+\d+$/, ''));
        }
        return normalized;
    }

    function normalizeSupplierPart(value) {
        let normalized = normalizeWhitespace(value);
        if (!normalized) return '';

        // Adapted is the useful supplier name in Prisma's
        // "ADAPTED CREATIVE LIMITED:Adapted" group label.
        const adaptedMatch = normalized.match(/^ADAPTED CREATIVE LIMITED\s*:\s*(.+)$/i);
        if (adaptedMatch) normalized = normalizeWhitespace(adaptedMatch[1]);

        // Prisma appends agency descriptors and currency markers to several
        // provider names. They are not useful search/display values here.
        normalized = normalizeWhitespace(
            normalized
                .replace(/\s*\([^)]*\)/g, ' ')
                .replace(/\s+(?:GBP|EUR|USD)$/i, '')
        );

        if (/^facebook$/i.test(normalized)) return 'Facebook';
        if (/^goat(?:\s+solutions)?$/i.test(normalized)) return 'GOAT';
        if (/^adapted(?:\s+creative\s+limited)?$/i.test(normalized)) return 'Adapted';
        return normalized;
    }

    function getSupplierValueParts(value) {
        return normalizeWhitespace(value)
            .split(/\s*\|\s*/)
            .map(normalizeSupplierPart)
            .filter(part => part && !NON_SUPPLIER_VALUE_PATTERN.test(part));
    }

    function getRenderedSupplierValue() {
        const tables = [];
        [
            '#grid-container_hot .ht_master .htCore',
            '#grid-container_hot .htCore',
            '.ht_master .htCore'
        ].forEach(selector => {
            document.querySelectorAll(selector).forEach(table => {
                if (!tables.includes(table)) tables.push(table);
            });
        });

        const supplierValues = [];
        const supplierCellSelectors = [
            '.hierarchical-level-group-1.hierarchical-name',
            '.group-cell.hierarchical-level-group-1.hierarchical-name',
            '.hierarchical-level-group-1',
            '[data-field="supplier"]',
            '[data-column="supplier"]',
            '[data-testid*="supplier" i]',
            '[aria-label*="supplier" i]',
            '.supplier-cell',
            '.supplier-name'
        ];
        tables.forEach(table => {
            Array.from(table.querySelectorAll('tbody tr, tr')).forEach(row => {
                let supplierCell = supplierCellSelectors
                    .map(selector => row.querySelector(selector))
                    .find(isSupplierCell);

                // Actualise renders the supplier group at level 0 and reserves
                // level 1 for the Redistribute control. Only use the level-0
                // group when the row is the expandable supplier group, not the
                // total row or an ordinary placement row.
                if (!supplierCell && row.querySelector('.mo-row-expandcollapse')) {
                    supplierCell = row.querySelector(
                        '.group-cell.hierarchical-level-group-0.hierarchical-name:not(.table-row-total)'
                    );
                    if (!isSupplierCell(supplierCell)) supplierCell = null;
                }

                const value = normalizeRenderedSupplierValue(
                    getTextFromElement(supplierCell),
                    supplierCell
                );
                if (!value || value.length > 220 || /^supplier$/i.test(value) ||
                    NON_SUPPLIER_VALUE_PATTERN.test(value)) return;
                if (!supplierValues.includes(value)) supplierValues.push(value);
            });
        });

        return supplierValues.join(' | ');
    }

    function getMetadataValue(patterns, aliases) {
        const pageText = document.body?.innerText || document.body?.textContent || '';
        const inlineValue = getInlineLabelValue(pageText, aliases);
        if (inlineValue) return inlineValue;

        const candidates = [];
        getElementsIncludingShadowDom().forEach(element => {
            const text = getTextFromElement(element);
            const labelAttributes = [
                element.getAttribute?.('aria-label'),
                element.getAttribute?.('data-label'),
                element.getAttribute?.('data-field'),
                element.getAttribute?.('data-cy'),
                element.id,
                typeof element.className === 'string' ? element.className : ''
            ].filter(Boolean).join(' ');
            const labelText = normalizeWhitespace(labelAttributes);
            const textIsLabel = isExactLabel(text, patterns);

            if (labelText && isExactLabel(labelText, patterns)) {
                if (!text || textIsLabel) {
                    const associatedValue = getAssociatedValue(element);
                    if (associatedValue && !isExactLabel(associatedValue, patterns) && associatedValue.length <= 220) {
                        candidates.push(associatedValue);
                    }
                }
            }

            const inlineAttributeValue = [
                element.getAttribute?.('aria-label'),
                element.getAttribute?.('data-label'),
                element.getAttribute?.('data-field')
            ]
                .map(value => getInlineLabelValue(value, aliases))
                .find(Boolean) || '';
            if (inlineAttributeValue) candidates.push(inlineAttributeValue);

            const inlineElementValue = getInlineLabelValue(text, aliases);
            if (inlineElementValue) candidates.push(inlineElementValue);

            if (labelText && patterns.some(pattern => pattern.test(labelText)) &&
                text && !textIsLabel && text.length <= 220) {
                candidates.push(text);
            }
        });

        return candidates
            .map(normalizeWhitespace)
            .filter(value => value && value.length <= 220)
            .sort((a, b) => a.length - b.length)[0] || '';
    }

    function combineSupplierValues(...values) {
        const seen = new Set();
        return values
            .flatMap(getSupplierValueParts)
            .filter(value => {
                const normalized = normalizeSearchText(value);
                if (!value || !normalized || seen.has(normalized)) return false;
                seen.add(normalized);
                return true;
            })
            .join(' | ');
    }

    function getCampaignSupplierValue() {
        return combineSupplierValues(
            getRenderedSupplierValue(),
            getMetadataValue(
                [/^supplier$/i, /(?:^|[-_ ])supplier$/i],
                ['supplier']
            )
        );
    }

    function getCampaignSnapshot() {
        const references = getHeaderReferences();
        const campaignId = references.campaignId;
        const url = window.location.href;
        const location = getActiveLocation();
        const key = buildHistoryKey(campaignId, url, location);

        return {
            key,
            url,
            campaignName: getCampaignName(),
            clientName: getMetadataValue(
                [/^client(?: name)?$/i, /^advertiser$/i, /(?:^|[-_ ])client(?:[-_ ]?name)?$/i],
                ['client(?: name)?', 'advertiser']
            ),
            supplier: getCampaignSupplierValue(),
            location,
            ...references
        };
    }

    function getEntryFingerprint(snapshot) {
        return searchableFields.map(field => normalizeSearchText(snapshot[field])).join('|');
    }

    function normalizeStoredEntry(entry) {
        if (!entry || typeof entry !== 'object') return null;
        const campaignId = normalizeWhitespace(entry.campaignId);
        const url = normalizeWhitespace(entry.url);
        const location = normalizeWhitespace(
            entry.location || entry.accountLocation || entry.organisation || entry.organisationCode
        );
        const key = normalizeWhitespace(entry.key) || (campaignId || url
            ? buildHistoryKey(campaignId, url, location)
            : '');
        if (!key) return null;

        const firstVisitedAt = Number.isFinite(entry.firstVisitedAt)
            ? entry.firstVisitedAt
            : Number.isFinite(entry.lastVisitedAt) ? entry.lastVisitedAt : 0;
        const lastVisitedAt = Number.isFinite(entry.lastVisitedAt)
            ? entry.lastVisitedAt
            : firstVisitedAt;

        return {
            key,
            url,
            campaignName: normalizeWhitespace(entry.campaignName),
            clientName: normalizeWhitespace(entry.clientName),
            supplier: combineSupplierValues(entry.supplier),
            location,
            campaignId,
            cpNumber: normalizeWhitespace(entry.cpNumber || campaignId),
            clPrCa: normalizeWhitespace(entry.clPrCa),
            rawClPrCa: normalizeWhitespace(entry.rawClPrCa),
            firstVisitedAt,
            lastVisitedAt,
            visitCount: Math.max(1, Number(entry.visitCount) || 1)
        };
    }

    function normalizeStoredEntries(entries) {
        return (Array.isArray(entries) ? entries : [])
            .map(normalizeStoredEntry)
            .filter(Boolean)
            .sort((a, b) => b.lastVisitedAt - a.lastVisitedAt)
            .slice(0, MAX_HISTORY_ENTRIES);
    }

    async function readHistoryEntries() {
        const result = await callStorage(
            chrome.storage?.local,
            'get',
            { [STORAGE_KEY]: [] }
        );
        const rawEntries = result?.[STORAGE_KEY];
        const entries = normalizeStoredEntries(rawEntries);
        if (Array.isArray(rawEntries) && JSON.stringify(rawEntries) !== JSON.stringify(entries)) {
            try {
                await writeHistoryEntries(entries);
            } catch (error) {
                if (extensionContextInvalidated) throw error;
                console.warn('[Campaign History] Could not migrate stored campaign history.', error);
            }
        }
        return entries;
    }

    async function writeHistoryEntries(entries) {
        await callStorage(chrome.storage?.local, 'set', {
            [STORAGE_KEY]: normalizeStoredEntries(entries)
        });
    }

    function enqueueHistoryWrite(task) {
        historyWriteQueue = historyWriteQueue
            .catch(() => {})
            .then(task);
        return historyWriteQueue;
    }

    function mergeSnapshot(existing, snapshot, now, incrementVisit) {
        const next = {
            ...(existing || {}),
            key: buildHistoryKey(
                snapshot.campaignId || existing?.campaignId || '',
                snapshot.url || existing?.url || '',
                snapshot.location || existing?.location || ''
            ),
            url: snapshot.url || existing?.url || '',
            campaignName: snapshot.campaignName || existing?.campaignName || '',
            clientName: snapshot.clientName || existing?.clientName || '',
            supplier: snapshot.supplier || existing?.supplier || '',
            location: snapshot.location || existing?.location || '',
            campaignId: snapshot.campaignId || existing?.campaignId || '',
            cpNumber: snapshot.cpNumber || existing?.cpNumber || snapshot.campaignId || '',
            clPrCa: snapshot.clPrCa || existing?.clPrCa || '',
            rawClPrCa: snapshot.rawClPrCa || existing?.rawClPrCa || '',
            firstVisitedAt: existing?.firstVisitedAt || now,
            lastVisitedAt: incrementVisit ? now : Math.max(existing?.lastVisitedAt || 0, now),
            visitCount: incrementVisit ? (existing?.visitCount || 0) + 1 : (existing?.visitCount || 1)
        };
        return normalizeStoredEntry(next);
    }

    function recordCampaignVisit(snapshot, incrementVisit) {
        if (extensionContextInvalidated || !loggingEnabled || !snapshot?.key) return;

        const fingerprint = getEntryFingerprint(snapshot);
        if (snapshot.key === activeVisitKey && fingerprint === activeVisitFingerprint) return;

        activeVisitKey = snapshot.key;
        activeVisitFingerprint = fingerprint;

        enqueueHistoryWrite(async () => {
            const entries = await readHistoryEntries();
            const existingIndex = entries.findIndex(entry =>
                entry.key === snapshot.key || (
                    snapshot.campaignId &&
                    entry.campaignId === snapshot.campaignId &&
                    (!entry.location || !snapshot.location ||
                        normalizeSearchText(entry.location) === normalizeSearchText(snapshot.location))
                )
            );
            const now = Date.now();
            const nextEntry = mergeSnapshot(
                existingIndex >= 0 ? entries[existingIndex] : null,
                snapshot,
                now,
                incrementVisit || existingIndex < 0
            );

            if (existingIndex >= 0) entries.splice(existingIndex, 1);
            entries.push(nextEntry);
            const nextEntries = normalizeStoredEntries(entries);
            await writeHistoryEntries(nextEntries);
            historyEntries = nextEntries;
            historyLoaded = true;
            historyLoadError = null;
            renderHistoryResults();
        }).catch(error => {
            if (extensionContextInvalidated) return;
            console.warn('[Campaign History] Could not save campaign visit.', error);
            if (snapshot.key === activeVisitKey && fingerprint === activeVisitFingerprint) {
                activeVisitKey = '';
                activeVisitFingerprint = '';
            }
        });
    }

    function createSvgIcon(name) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        svg.classList.add(`toolshed-campaign-history-icon-${name}`);

        if (name === 'search') {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', '11');
            circle.setAttribute('cy', '11');
            circle.setAttribute('r', '6.5');
            const handle = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            handle.setAttribute('d', 'm16 16 4.5 4.5');
            svg.append(circle, handle);
        } else if (name === 'history') {
            const arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            arc.setAttribute('d', 'M4.4 10.4a8.5 8.5 0 1 1 2.3 7.2');
            const arrowhead = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            arrowhead.dataset.historyArrowhead = 'true';
            arrowhead.setAttribute('d', 'M2.3 8.8 4.4 12.6 6.7 8.8Z');
            const hands = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            hands.setAttribute('d', 'M11.8 6.8v4.5l2.8 1.9');
            svg.append(arc, arrowhead, hands);
        } else if (name === 'close') {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', 'M6 6l12 12M18 6 6 18');
            svg.appendChild(path);
        } else if (name === 'expand') {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', 'M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5');
            svg.appendChild(path);
        } else if (name === 'collapse') {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', 'M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6');
            svg.appendChild(path);
        } else if (name === 'arrow') {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', 'm9 18 6-6-6-6');
            svg.appendChild(path);
        } else if (name === 'new-tab') {
            const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path1.setAttribute('d', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6');
            const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path2.setAttribute('d', 'M15 3h6v6');
            const path3 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path3.setAttribute('d', 'm10 14 11-11');
            svg.append(path1, path2, path3);
        } else if (name === 'copy') {
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('x', '9');
            rect.setAttribute('y', '9');
            rect.setAttribute('width', '13');
            rect.setAttribute('height', '13');
            rect.setAttribute('rx', '2');
            rect.setAttribute('ry', '2');
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1');
            svg.append(rect, path);
        } else if (name === 'link') {
            const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path1.setAttribute('d', 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71');
            const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path2.setAttribute('d', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71');
            svg.append(path1, path2);
        } else if (name === 'text') {
            const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path1.setAttribute('d', 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z');
            const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path2.setAttribute('d', 'M14 2v6h6');
            const path3 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path3.setAttribute('d', 'M16 13H8M16 17H8M10 9H8');
            svg.append(path1, path2, path3);
        }

        svg.querySelectorAll('circle, path, rect').forEach(shape => {
            shape.setAttribute('fill', 'none');
            shape.setAttribute('stroke', 'currentColor');
            shape.setAttribute('stroke-width', '1.8');
            shape.setAttribute('stroke-linecap', 'round');
            shape.setAttribute('stroke-linejoin', 'round');
        });
        if (name === 'history') {
            const arrowhead = svg.querySelector('[data-history-arrowhead]');
            arrowhead?.setAttribute('fill', 'currentColor');
            arrowhead?.setAttribute('stroke', 'none');
        }
        return svg;
    }

    function createTextElement(tagName, className, text) {
        const element = document.createElement(tagName);
        if (className) element.className = className;
        element.textContent = text || '';
        return element;
    }

    function getParentElement(element) {
        if (!element) return null;
        if (element.parentElement) return element.parentElement;
        return element.getRootNode?.().host || null;
    }

    function getElementLabel(element) {
        return normalizeWhitespace(
            getTextFromElement(element) || element?.getAttribute?.('aria-label') || ''
        );
    }

    function hasExactLabel(element, label) {
        return normalizeSearchText(getElementLabel(element)) === normalizeSearchText(label);
    }

    function containsExactLabel(element, label) {
        if (hasExactLabel(element, label)) return true;
        return getElementsIncludingShadowDom(element).some(child => hasExactLabel(child, label));
    }

    function getDirectChildren(element) {
        return element?.children ? Array.from(element.children) : [];
    }

    function hasDistinctDirectNavigationLabels(element) {
        const children = getDirectChildren(element);
        const campaignsChild = children.find(child => containsExactLabel(child, 'Campaigns'));
        const reportsChild = children.find(child => containsExactLabel(child, 'Reports'));
        return Boolean(campaignsChild && reportsChild && campaignsChild !== reportsChild);
    }

    function isNavigationContainer(element) {
        const tagName = String(element?.tagName || '').toLowerCase();
        const role = element?.getAttribute?.('role');
        const signature = [
            element?.id,
            typeof element?.className === 'string' ? element.className : ''
        ].filter(Boolean).join(' ');
        return tagName === 'nav' || role === 'navigation' || /(?:nav|navigation|menu)/i.test(signature);
    }

    function isTopShellNavigationElement(element) {
        let current = element;
        for (let depth = 0; current && depth < 12; depth += 1) {
            const tagName = String(current?.tagName || '').toLowerCase();
            const role = current?.getAttribute?.('role');
            const signature = [
                current?.id,
                typeof current?.className === 'string' ? current.className : ''
            ].filter(Boolean).join(' ');

            if (tagName === 'header' || role === 'banner' || current?.id === 'ptb-header' ||
                /(?:global|primary|top)[ -]?(?:nav|navigation|menu|header)/i.test(signature)) {
                return true;
            }
            current = getParentElement(current);
        }
        return false;
    }

    function getNavigationCandidateSize(element) {
        return getElementsIncludingShadowDom(element).length;
    }

    function findPrismaBannerModuleContainer(elements = getElementsIncludingShadowDom()) {
        return elements.find(element => element?.id === PRISMA_BANNER_MODULE_CONTAINER_ID) || null;
    }

    function findTopNavigationContainer() {
        const elements = getElementsIncludingShadowDom();
        const bannerModuleContainer = findPrismaBannerModuleContainer(elements);
        if (bannerModuleContainer) return bannerModuleContainer;

        const candidates = elements
            .filter(element =>
                containsExactLabel(element, 'Campaigns') &&
                containsExactLabel(element, 'Reports')
            )
            .filter(element => {
                let current = element;
                for (let depth = 0; current && depth < 12; depth += 1) {
                    if (String(current.tagName || '').toUpperCase() === PRISMA_OVERFLOW_MENU_TAG ||
                        String(current.tagName || '').toUpperCase() === 'MO-BANNER-MODULE-OVERFLOW-MENU') {
                        return false;
                    }
                    current = getParentElement(current);
                }
                return true;
            })
            .filter(element =>
                isNavigationContainer(element) ||
                (hasDistinctDirectNavigationLabels(element) && isTopShellNavigationElement(element))
            );

        return candidates
            .sort((left, right) => {
                const leftInTopShell = isTopShellNavigationElement(left);
                const rightInTopShell = isTopShellNavigationElement(right);
                if (leftInTopShell !== rightInTopShell) return leftInTopShell ? -1 : 1;

                const leftDirect = hasDistinctDirectNavigationLabels(left);
                const rightDirect = hasDistinctDirectNavigationLabels(right);
                if (leftDirect !== rightDirect) return leftDirect ? -1 : 1;

                const leftStructural = isNavigationContainer(left);
                const rightStructural = isNavigationContainer(right);
                if (leftStructural !== rightStructural) return leftStructural ? -1 : 1;

                return getNavigationCandidateSize(left) - getNavigationCandidateSize(right);
            })[0] || null;
    }

    function findTopNavigationItem(container, label) {
        const directItem = getDirectChildren(container)
            .find(child => containsExactLabel(child, label));
        if (directItem) return directItem;

        const matchingElement = getElementsIncludingShadowDom(container)
            .filter(element => hasExactLabel(element, label))
            .sort((left, right) =>
                getNavigationCandidateSize(left) - getNavigationCandidateSize(right)
            )[0];
        if (!matchingElement) return null;

        let current = matchingElement;
        while (current && getParentElement(current) !== container) {
            current = getParentElement(current);
        }
        return current || matchingElement;
    }

    function findNavigationInsertionContainer(container, template) {
        let current = getParentElement(template);
        while (current && current !== container) {
            if (hasDistinctDirectNavigationLabels(current)) return current;
            current = getParentElement(current);
        }
        return container;
    }

    function shouldUseDirectAnchor(template, insertionContainer) {
        const templateTagName = String(template?.tagName || '').toLowerCase();
        const root = insertionContainer?.getRootNode?.();
        const isShadowRoot = Boolean(root?.host);
        return isShadowRoot ||
            templateTagName === 'mo-banner-module' ||
            templateTagName === 'mo-menu' ||
            Boolean(template?.shadowRoot);
    }

    function ensureShadowNavigationStyles(insertionContainer) {
        const root = insertionContainer?.getRootNode?.();
        if (!root?.host || !root.querySelector) return;
        if (root.querySelector(`#${SHADOW_NAVIGATION_STYLE_ID}`)) return;

        const style = document.createElement('style');
        style.id = SHADOW_NAVIGATION_STYLE_ID;
        style.textContent = `
            #${NAVIGATION_ID} {
                align-items: center;
                box-sizing: border-box;
                color: inherit;
                cursor: pointer;
                display: inline-flex;
                font: inherit;
                gap: 6px;
                flex: 0 0 auto;
                height: 100%;
                justify-content: center;
                min-height: 40px;
                padding: 0 12px;
                text-decoration: none;
                text-transform: none;
                white-space: nowrap;
            }
            #${NAVIGATION_ID} .toolshed-campaign-history-nav-content {
                align-items: center;
                display: inline-flex;
                gap: 6px;
            }
            #${NAVIGATION_ID} .toolshed-campaign-history-nav-label {
                transform: translateY(-0.5px);
            }
            #${NAVIGATION_ID} svg {
                display: block;
                flex: 0 0 15px;
                height: 15px;
                transform: translateY(-1px);
                width: 15px;
            }
            #${NAVIGATION_ID}:hover {
                background: rgba(8, 117, 202, 0.08);
            }
            #${NAVIGATION_ID}:focus-visible {
                outline: 2px solid #0875ca;
                outline-offset: -2px;
            }
        `;
        root.appendChild(style);
    }

    function getNavigationOverflow(style, axis) {
        const axisOverflow = style?.[axis];
        return axisOverflow && axisOverflow !== 'visible'
            ? axisOverflow
            : style?.overflow || axisOverflow;
    }

    function isNavigationItemVisible(element) {
        if (!element?.isConnected) return false;

        let current = element;
        const visibleBounds = {
            left: 0,
            top: 0,
            right: window.innerWidth,
            bottom: window.innerHeight
        };
        while (current) {
            const style = window.getComputedStyle?.(current);
            if (style?.display === 'none' || style?.visibility === 'hidden' || style?.visibility === 'collapse') {
                return false;
            }

            const currentRect = current === element ? null : current.getBoundingClientRect?.();
            if (currentRect) {
                const clientLeft = Number(current.clientLeft) || 0;
                const clientTop = Number(current.clientTop) || 0;
                const clientWidth = Number(current.clientWidth);
                const clientHeight = Number(current.clientHeight);
                const overflowX = getNavigationOverflow(style, 'overflowX');
                const overflowY = getNavigationOverflow(style, 'overflowY');

                if (['auto', 'clip', 'hidden', 'scroll'].includes(overflowX)) {
                    const clipLeft = currentRect.left + clientLeft;
                    const clipRight = clipLeft + (Number.isFinite(clientWidth) ? clientWidth : currentRect.width);
                    visibleBounds.left = Math.max(visibleBounds.left, clipLeft);
                    visibleBounds.right = Math.min(visibleBounds.right, clipRight);
                }
                if (['auto', 'clip', 'hidden', 'scroll'].includes(overflowY)) {
                    const clipTop = currentRect.top + clientTop;
                    const clipBottom = clipTop + (Number.isFinite(clientHeight) ? clientHeight : currentRect.height);
                    visibleBounds.top = Math.max(visibleBounds.top, clipTop);
                    visibleBounds.bottom = Math.min(visibleBounds.bottom, clipBottom);
                }
            }
            current = getParentElement(current);
        }

        const rect = element.getBoundingClientRect?.();
        if (!rect || (rect.width <= 0 && rect.height <= 0)) {
            const documentRect = document.documentElement?.getBoundingClientRect?.();
            return !documentRect || (documentRect.width <= 0 && documentRect.height <= 0);
        }

        const edgeTolerance = 0.5;
        return rect.left >= visibleBounds.left - edgeTolerance &&
            rect.right <= visibleBounds.right + edgeTolerance &&
            rect.top >= visibleBounds.top - edgeTolerance &&
            rect.bottom <= visibleBounds.bottom + edgeTolerance;
    }

    function isNavigationModuleCollapsed(element) {
        if (!element?.isConnected) return false;
        const style = window.getComputedStyle?.(element);
        return element.classList?.contains('hidden') ||
            element.hasAttribute?.('hidden') ||
            style?.display === 'none' ||
            style?.visibility === 'hidden' ||
            style?.visibility === 'collapse';
    }

    function getNavigationLayoutSignature(element, insertionContainer) {
        const parts = [`${window.innerWidth}x${window.innerHeight}`];
        const describeElement = candidate => {
            const rect = candidate.getBoundingClientRect?.();
            const style = window.getComputedStyle?.(candidate);
            return [
                candidate.tagName,
                candidate.id,
                rect?.left,
                rect?.top,
                rect?.right,
                rect?.bottom,
                candidate.clientWidth,
                candidate.clientHeight,
                style?.display,
                style?.visibility,
                getNavigationOverflow(style, 'overflowX'),
                getNavigationOverflow(style, 'overflowY')
            ].join(':');
        };

        const stableLayoutRoot = getElementsIncludingShadowDom()
            .find(candidate => candidate.id === 'mo-body-container') || document.documentElement;
        if (stableLayoutRoot) parts.push(describeElement(stableLayoutRoot));
        for (let current = element; current; current = getParentElement(current)) {
            parts.push(describeElement(current));
        }
        getDirectChildren(insertionContainer)
            .filter(child => child.id !== NAVIGATION_ID)
            .forEach(child => parts.push(describeElement(child)));

        return parts.join('|');
    }

    function hasRelevantNavigationMutation(mutations) {
        const isExtensionNode = node => {
            let current = node?.nodeType === 1 ? node : node?.parentNode;
            for (let depth = 0; current && depth < 12; depth += 1) {
                if (current.nodeType === 1 && (
                    EXTENSION_NAVIGATION_NODE_IDS.has(current.id) ||
                    current.classList?.contains(OVERFLOW_COLLAPSED_CLASS) ||
                    current.classList?.contains(OVERFLOW_VISIBLE_CLASS) ||
                    current.classList?.contains(OVERFLOW_MENU_TRIGGER_CLASS)
                )) return true;
                current = current.parentNode || current.host;
            }
            return false;
        };

        const isInsideCampaignNavigation = node => {
            let current = node?.host || node;
            for (let depth = 0; current && depth < 12; depth += 1) {
                const tagName = String(current.tagName || '').toUpperCase();
                if (tagName === 'MO-BANNER' ||
                    tagName === 'MO-BANNER-MODULE-OVERFLOW-MENU' ||
                    tagName === PRISMA_OVERFLOW_MENU_TAG ||
                    current.id === PRISMA_BANNER_MODULE_CONTAINER_ID ||
                    current.id === 'ptb-header' ||
                    isNavigationContainer(current)) {
                    return true;
                }
                current = getParentElement(current);
            }
            return false;
        };

        const containsCampaignNavigation = node => {
            if (node?.nodeType !== 1) return false;
            const tagName = String(node.tagName || '').toUpperCase();
            if (tagName === 'MO-BANNER' ||
                tagName === 'MO-BANNER-MODULE-OVERFLOW-MENU' ||
                tagName === PRISMA_OVERFLOW_MENU_TAG ||
                node.id === PRISMA_BANNER_MODULE_CONTAINER_ID ||
                node.id === 'ptb-header' ||
                isNavigationContainer(node)) return true;
            return tagName === 'MO-OVERLAY' && getElementsIncludingShadowDom(node).some(element =>
                String(element.tagName || '').toUpperCase() === PRISMA_OVERFLOW_MENU_TAG
            );
        };

        return mutations.some(mutation => {
            const target = mutation.target;
            const nodes = [
                ...Array.from(mutation.addedNodes || []),
                ...Array.from(mutation.removedNodes || [])
            ];
            const changedCampaignNavigation = isInsideCampaignNavigation(target) ||
                nodes.some(containsCampaignNavigation);
            if (!changedCampaignNavigation) return false;

            if (mutation.type === 'attributes' || mutation.type === 'characterData') {
                return !isExtensionNode(target);
            }

            const hasNativeChange = !isExtensionNode(target) &&
                nodes.some(node => !isExtensionNode(node));
            const removedHistoryItem = Array.from(mutation.removedNodes || []).some(node =>
                [NAVIGATION_ID, OVERFLOW_NAVIGATION_ID].includes(node?.id) && !node.isConnected
            );
            return hasNativeChange || removedHistoryItem;
        });
    }

    function scheduleNavigationReconciliation() {
        if (extensionContextInvalidated || navigationReconciliationQueued) return;
        navigationReconciliationQueued = true;
        const schedule = window.queueMicrotask || (callback => Promise.resolve().then(callback));
        schedule(() => {
            navigationReconciliationQueued = false;
            if (extensionContextInvalidated || !window.document || !settingsReady || !viewEnabled || !isPrismaPage()) return;
            ensureNavigationObserver();
            reconcileNavigationItems();
        });
    }

    function scheduleSettledNavigationReconciliation() {
        scheduleNavigationReconciliation();
        if (navigationResizeReconciliationTimer) {
            window.clearTimeout(navigationResizeReconciliationTimer);
        }
        navigationResizeReconciliationTimer = window.setTimeout(() => {
            navigationResizeReconciliationTimer = null;
            if (extensionContextInvalidated || !window.document || !settingsReady || !viewEnabled || !isPrismaPage()) return;
            ensureNavigationObserver();
            reconcileNavigationItems();
        }, NAVIGATION_RESIZE_SETTLE_DELAY_MS);
    }

    function scheduleOverflowMenuReconciliation() {
        [0, 80].forEach(delay => {
            window.setTimeout(() => {
                if (extensionContextInvalidated || !settingsReady || !viewEnabled || !isPrismaPage()) return;
                ensureNavigationObserver();
                reconcileNavigationItems();
            }, delay);
        });
    }

    function ensureNavigationObserver() {
        const Observer = window.MutationObserver ||
            (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
        if (!Observer || !document.body) return;

        if (!navigationObserver) {
            navigationObserver = new Observer(mutations => {
                if (hasRelevantNavigationMutation(mutations)) {
                    scheduleNavigationReconciliation();
                }
            });
        }

        const roots = [document.body];
        getElementsIncludingShadowDom().forEach(element => {
            if (element.shadowRoot) roots.push(element.shadowRoot);
        });
        roots.forEach(root => {
            if (navigationObservedRoots.has(root)) return;
            navigationObserver.observe(root, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class', 'hidden', 'style'],
                characterData: true
            });
            navigationObservedRoots.add(root);
        });

        getElementsIncludingShadowDom()
            .filter(element => String(element.tagName || '').toUpperCase() === 'MO-BANNER-MODULE-OVERFLOW-MENU')
            .forEach(menu => {
                if (navigationObservedOverflowMenus.has(menu)) return;
                menu.addEventListener('click', scheduleOverflowMenuReconciliation, true);
                menu.addEventListener('keydown', scheduleOverflowMenuReconciliation, true);
                navigationObservedOverflowMenus.add(menu);
            });

        const ResizeObserverConstructor = window.ResizeObserver ||
            (typeof ResizeObserver !== 'undefined' ? ResizeObserver : null);
        if (ResizeObserverConstructor && !navigationResizeObserver) {
            navigationResizeObserver = new ResizeObserverConstructor(entries => {
                const widthChanged = Array.from(entries || []).some(entry => {
                    const target = entry.target;
                    const width = Number(entry.contentRect?.width) ||
                        Number(target?.clientWidth) ||
                        Number(target?.getBoundingClientRect?.().width) || 0;
                    const previousWidth = navigationObservedResizeWidths.get(target);
                    navigationObservedResizeWidths.set(target, width);
                    return previousWidth == null || Math.abs(width - previousWidth) > 0.5;
                });
                if (widthChanged) scheduleNavigationReconciliation();
            });
        }
        if (navigationResizeObserver) {
            // The banner's module slot can shrink as its flex siblings take
            // space even while the app root stays the same width. Observe that
            // slot as well as the stable app root so overflow follows the real
            // width available to Campaigns, Reports, and History. Reconciliation
            // is idempotent, and the observer only schedules for width changes.
            const appLayoutTargets = getElementsIncludingShadowDom()
                .filter(element => element.id === 'mo-body-container');
            const navigationWidthTargets = [
                ...(appLayoutTargets.length ? appLayoutTargets : [document.documentElement]),
                findPrismaBannerModuleContainer()
            ];
            Array.from(new Set(navigationWidthTargets))
                .filter(Boolean)
                .forEach(element => {
                    if (navigationObservedResizeTargets.has(element)) return;
                    navigationResizeObserver.observe(element);
                    navigationObservedResizeTargets.add(element);
                });
        }
    }

    function removeNavigationObserver() {
        navigationObserver?.takeRecords?.();
        navigationObserver?.disconnect();
        navigationObserver = null;
        navigationResizeObserver?.disconnect();
        navigationResizeObserver = null;
        navigationObservedRoots = new Set();
        navigationObservedResizeTargets = new WeakSet();
        navigationObservedResizeWidths = new WeakMap();
        navigationReconciliationQueued = false;
        if (navigationResizeReconciliationTimer) {
            window.clearTimeout(navigationResizeReconciliationTimer);
            navigationResizeReconciliationTimer = null;
        }
    }

    function findNavigationLinks() {
        const currentDocument = typeof document === 'undefined' ? null : document;
        if (!currentDocument) return [];

        const normalLink = currentDocument.getElementById(NAVIGATION_ID);
        const shadowLinks = getElementsIncludingShadowDom()
            .filter(element => element.id === NAVIGATION_ID);
        return Array.from(new Set([normalLink, ...shadowLinks].filter(Boolean)));
    }

    function toggleHistoryPanel() {
        const panel = document.getElementById(PANEL_ID);
        if (panel && !panel.hidden && !panel.classList.contains('is-closing')) {
            closeHistoryPanel();
        } else {
            openHistoryPanel();
        }
    }

    function findOverflowReportsItem(group) {
        const matchingElement = getElementsIncludingShadowDom(group)
            .filter(element => hasExactLabel(element, 'Reports'))
            .sort((left, right) =>
                getNavigationCandidateSize(left) - getNavigationCandidateSize(right)
            )[0];
        if (!matchingElement) return null;

        let item = matchingElement;
        while (item && getParentElement(item) !== group) item = getParentElement(item);
        return item || null;
    }

    function findOverflowNavigationGroups() {
        return getElementsIncludingShadowDom()
            .filter(element => String(element.tagName || '').toUpperCase() === PRISMA_OVERFLOW_MENU_TAG)
            .flatMap(menu =>
                getElementsIncludingShadowDom(menu.shadowRoot || menu)
                    .filter(element => String(element.tagName || '').toUpperCase() === 'MO-MENU-ITEM-GROUP')
            );
    }

    function createOverflowNavigationItem(templateItem) {
        const item = templateItem.cloneNode(true);
        item.id = OVERFLOW_NAVIGATION_ID;
        item.setAttribute('tabindex', '0');
        item.setAttribute('aria-label', 'Open campaign history');
        item.setAttribute('data-toolshed-menu-template', 'prisma-menu-item');
        item.removeAttribute('data-module-id');

        const descendants = getElementsIncludingShadowDom(item);
        descendants.forEach(element => {
            if (element.id) element.removeAttribute('id');
            if (element.hasAttribute?.('data-module-id')) element.removeAttribute('data-module-id');
        });

        const textElement = descendants.find(element => element.classList?.contains('module-label-text')) ||
            descendants
                .filter(element => hasExactLabel(element, 'Reports'))
                .sort((left, right) =>
                    getNavigationCandidateSize(left) - getNavigationCandidateSize(right)
                )[0];
        if (textElement) {
            if (textElement.textContent !== 'History') textElement.textContent = 'History';
        } else if (item.textContent !== 'History') {
            item.textContent = 'History';
        }

        descendants
            .filter(element => String(element.tagName || '').toUpperCase() === 'A')
            .forEach(link => {
                link.setAttribute('href', '#');
                link.setAttribute('aria-label', 'Open campaign history');
                link.removeAttribute('target');
            });

        // Keep a native menu row structure so History shares the same icon slot,
        // left padding, and text alignment as the other overflow items.
        item.addEventListener('click', event => {
            event.preventDefault();
            toggleHistoryPanel();
        });
        return item;
    }

    function alignOverflowNavigationItem(item, templateItem) {
        const templateIcon = getElementsIncludingShadowDom(templateItem)
            .find(element => String(element.tagName || '').toUpperCase() === 'MO-ICON' &&
                element.getAttribute('slot') === 'left');
        const historyIcon = getElementsIncludingShadowDom(item)
            .find(element => String(element.tagName || '').toUpperCase() === 'MO-ICON' &&
                element.getAttribute('slot') === 'left');
        if (!templateIcon || !historyIcon) return;

        const templateIconWidth = Number(templateIcon.getBoundingClientRect?.().width) ||
            Number.parseFloat(window.getComputedStyle?.(templateIcon)?.width || '') ||
            Number.parseFloat(templateIcon.style?.width || '');
        if (!Number.isFinite(templateIconWidth) || templateIconWidth <= 0) return;

        // Prisma sizes its empty custom icons wider than named icons. Keep the
        // cloned row's left slot at the template width so History text aligns.
        const width = `${templateIconWidth}px`;
        if (historyIcon.style.width !== width) historyIcon.style.width = width;
        if (historyIcon.style.minWidth !== width) historyIcon.style.minWidth = width;
        if (historyIcon.style.maxWidth !== width) historyIcon.style.maxWidth = width;
        const flexBasis = `0 0 ${width}`;
        if (historyIcon.style.flex !== flexBasis) historyIcon.style.flex = flexBasis;
    }

    function ensureOverflowNavigationItems() {
        findOverflowNavigationGroups().forEach(group => {
            const reportsItem = findOverflowReportsItem(group);
            const nativeItems = getDirectChildren(group).filter(item =>
                String(item.tagName || '').toUpperCase() === 'MO-MENU-ITEM' &&
                item.id !== OVERFLOW_NAVIGATION_ID
            );
            const templateItem = reportsItem || nativeItems[0];
            if (!templateItem) return;

            let existing = getElementsIncludingShadowDom(group)
                .find(element => element.id === OVERFLOW_NAVIGATION_ID);
            const isNativeClone = existing?.getAttribute('data-toolshed-menu-template') === 'prisma-menu-item';
            if (existing && (!isNativeClone || existing.parentElement !== group)) {
                existing.remove();
                existing = null;
            }
            if (!existing) existing = createOverflowNavigationItem(templateItem);
            alignOverflowNavigationItem(existing, templateItem);

            const insertionItem = reportsItem || nativeItems[nativeItems.length - 1];
            if (insertionItem?.nextElementSibling !== existing) {
                group.insertBefore(existing, insertionItem?.nextElementSibling || null);
            }
        });
    }

    function updateLegacyOverflowMenuItemCount() {
        const groups = findOverflowNavigationGroups();
        const menuItemCount = groups.reduce((total, group) => total + getDirectChildren(group)
            .filter(item => String(item.tagName || '').toUpperCase() === 'MO-MENU-ITEM').length, 0);
        const moduleContainer = findPrismaBannerModuleContainer();
        if (!groups.length && !moduleContainer) return;

        // Prisma mounts the overflow rows only while the three-dot menu is
        // open. Until then, count modules Prisma explicitly marks hidden and
        // include History whenever its full header item does not fit.
        const hiddenModuleCount = moduleContainer
            ? getDirectChildren(moduleContainer).filter(module =>
                String(module.tagName || '').toUpperCase() === 'MO-BANNER-MODULE' &&
                module.classList?.contains('hidden')
            ).length
            : 0;
        const historyItemExists = getElementsIncludingShadowDom()
            .some(element => element.id === OVERFLOW_NAVIGATION_ID);
        const inferredMenuItemCount = hiddenModuleCount +
            (campaignHistoryUsesOverflow || historyItemExists ? 1 : 0);
        // Once Prisma mounts the menu, its actual rows are authoritative. Use
        // collapsed modules only as a fallback while the menu is still lazy.
        const itemCount = menuItemCount || inferredMenuItemCount;

        getElementsIncludingShadowDom()
            .filter(element => String(element.tagName || '').toUpperCase() === 'MO-BANNER-MODULE-OVERFLOW-MENU')
            .forEach(menu => {
                getElementsIncludingShadowDom(menu.shadowRoot || menu)
                    .filter(element => String(element.tagName || '').toUpperCase() === 'MO-BANNER-WIDGET')
                    .forEach(widget => {
                        const layout = getElementsIncludingShadowDom(widget.shadowRoot || widget)
                            .find(element => element.classList?.contains('overflow-label-layout'));
                        const countLabel = getDirectChildren(layout)
                            .find(child => /^\d+$/.test(String(child.textContent || '').trim()));
                        if (countLabel && countLabel.textContent !== String(itemCount)) {
                            countLabel.textContent = String(itemCount);
                        }
                    });
            });
    }

    function ensureOverflowSpacingStyle(menuOrContainer) {
        const root = menuOrContainer?.getRootNode?.();
        if (!root?.host || !root.querySelector || root.querySelector(`#${OVERFLOW_SPACING_STYLE_ID}`)) return;

        const style = document.createElement('style');
        style.id = OVERFLOW_SPACING_STYLE_ID;
        style.textContent = `
            #${PRISMA_BANNER_MODULE_CONTAINER_ID} > mo-banner-module.${OVERFLOW_COLLAPSED_CLASS},
            #${PRISMA_BANNER_MODULE_CONTAINER_ID} > #${NAVIGATION_ID}.${OVERFLOW_COLLAPSED_CLASS} {
                display: none !important;
                visibility: hidden !important;
            }
            #${PRISMA_BANNER_MODULE_CONTAINER_ID} > mo-banner-module.${OVERFLOW_VISIBLE_CLASS} {
                display: flex !important;
                visibility: visible !important;
            }
            #${PRISMA_BANNER_MODULE_CONTAINER_ID} > #${NAVIGATION_ID}.${OVERFLOW_VISIBLE_CLASS} {
                display: inline-flex !important;
                visibility: visible !important;
            }
            mo-banner-module-overflow-menu.${OVERFLOW_MENU_TRIGGER_CLASS} {
                display: block !important;
                visibility: visible !important;
                transform: translateX(var(${OVERFLOW_OFFSET_PROPERTY}, 0px)) !important;
            }
        `;
        root.appendChild(style);
    }

    function syncOverflowMenuPresentation() {
        const overflowMenus = getElementsIncludingShadowDom()
            .filter(element => String(element.tagName || '').toUpperCase() === 'MO-BANNER-MODULE-OVERFLOW-MENU');

        overflowMenus.forEach(menu => {
            if (campaignHistoryUsesOverflow) {
                if (!menu.classList.contains(OVERFLOW_MENU_TRIGGER_CLASS)) {
                    menu.classList.add(OVERFLOW_MENU_TRIGGER_CLASS);
                }
                ensureOverflowSpacingStyle(menu);
            } else if (menu.classList.contains(OVERFLOW_MENU_TRIGGER_CLASS)) {
                menu.classList.remove(OVERFLOW_MENU_TRIGGER_CLASS);
            }
        });

        const visibleMenus = getElementsIncludingShadowDom()
            .filter(element =>
                String(element.tagName || '').toUpperCase() === 'MO-BANNER-MODULE-OVERFLOW-MENU' &&
                (isNavigationItemVisible(element) || element.classList?.contains(OVERFLOW_MENU_TRIGGER_CLASS))
            );
        const visibleRoots = new Set(visibleMenus
            .map(menu => menu.getRootNode?.())
            .filter(root => root?.host));

        getElementsIncludingShadowDom()
            .filter(element => element.id === OVERFLOW_SPACING_STYLE_ID)
            .forEach(style => {
                if (!visibleRoots.has(style.getRootNode?.())) style.remove();
            });

        visibleMenus.forEach(ensureOverflowSpacingStyle);
        updateLegacyOverflowMenuItemCount();
    }

    function ensureNavigationLink() {
        const container = findTopNavigationContainer();
        const reportsItem = container ? findTopNavigationItem(container, 'Reports') : null;
        const moduleContainer = findPrismaBannerModuleContainer();
        const isPrismaBannerNavigation = Boolean(moduleContainer && container === moduleContainer);
        const reportsInOverflowMenu = findOverflowNavigationGroups()
            .some(group => Boolean(findOverflowReportsItem(group)));

        if (!container) {
            campaignHistoryUsesOverflow = false;
            campaignHistoryBlockedLayoutSignature = '';
            removeTopLevelNavigationLink();
            return false;
        }

        if (!reportsItem) {
            campaignHistoryUsesOverflow = isPrismaBannerNavigation && reportsInOverflowMenu;
            campaignHistoryBlockedLayoutSignature = '';
            removeTopLevelNavigationLink();
            return false;
        }

        const reportsWasCollapsed = isPrismaBannerNavigation
            ? isNavigationModuleCollapsed(reportsItem)
            : !isNavigationItemVisible(reportsItem);
        if (reportsWasCollapsed) {
            campaignHistoryUsesOverflow = true;
            campaignHistoryBlockedLayoutSignature = '';
            removeTopLevelNavigationLink();
            return false;
        }

        const insertionContainer = findNavigationInsertionContainer(container, reportsItem);
        const layoutSignature = getNavigationLayoutSignature(reportsItem, insertionContainer);
        if (campaignHistoryUsesOverflow &&
            campaignHistoryBlockedLayoutSignature === layoutSignature) {
            return false;
        }

        let link = findNavigationLinks()
            .find(link => getParentElement(link) === insertionContainer);
        if (link) {
            currentNavigationLink = link;
            if (reportsItem.nextElementSibling !== link) {
                insertionContainer.insertBefore(link, reportsItem.nextElementSibling);
            }
        } else {
            findNavigationLinks().forEach(existingLink => existingLink.remove());

            link = shouldUseDirectAnchor(reportsItem, insertionContainer)
                ? document.createElement('a')
                : reportsItem.cloneNode(false);
            ensureShadowNavigationStyles(insertionContainer);
            link.id = NAVIGATION_ID;
            currentNavigationLink = link;
            link.classList.add('toolshed-campaign-history-nav');
            link.classList.remove('active', 'selected', 'is-active', 'disabled', 'mo-disabled');
            link.removeAttribute('aria-current');
            link.removeAttribute('disabled');
            link.removeAttribute('aria-disabled');
            link.setAttribute('href', '#');
            link.setAttribute('role', 'button');
            link.setAttribute('aria-label', 'Open campaign history');
            link.setAttribute('aria-controls', PANEL_ID);
            link.textContent = '';

            const content = document.createElement('span');
            content.className = 'toolshed-campaign-history-nav-content';
            content.appendChild(createTextElement('span', 'toolshed-campaign-history-nav-label', 'History'));
            content.appendChild(createSvgIcon('history'));
            link.appendChild(content);

            link.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                toggleHistoryPanel();
            });
            link.addEventListener('keydown', event => {
                if (event.key !== ' ') return;
                event.preventDefault();
                toggleHistoryPanel();
            });

            insertionContainer.insertBefore(link, reportsItem.nextElementSibling);
        }

        if (!isNavigationItemVisible(link)) {
            campaignHistoryUsesOverflow = true;
            campaignHistoryBlockedLayoutSignature = layoutSignature;
            removeTopLevelNavigationLink();
            return false;
        }

        campaignHistoryUsesOverflow = false;
        campaignHistoryBlockedLayoutSignature = '';
        return true;
    }

    function createPrismaHistoryNavigationLink(insertionContainer) {
        let link = findNavigationLinks()
            .find(candidate => getParentElement(candidate) === insertionContainer);
        if (link) {
            currentNavigationLink = link;
            return link;
        }

        findNavigationLinks().forEach(existingLink => existingLink.remove());
        ensureShadowNavigationStyles(insertionContainer);
        link = document.createElement('a');
        link.id = NAVIGATION_ID;
        link.className = 'toolshed-campaign-history-nav';
        link.setAttribute('href', '#');
        link.setAttribute('role', 'button');
        link.setAttribute('aria-label', 'Open campaign history');
        link.setAttribute('aria-controls', PANEL_ID);

        const content = document.createElement('span');
        content.className = 'toolshed-campaign-history-nav-content';
        content.appendChild(createTextElement('span', 'toolshed-campaign-history-nav-label', 'History'));
        content.appendChild(createSvgIcon('history'));
        link.appendChild(content);
        link.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            toggleHistoryPanel();
        });
        link.addEventListener('keydown', event => {
            if (event.key !== ' ') return;
            event.preventDefault();
            toggleHistoryPanel();
        });

        insertionContainer.appendChild(link);
        currentNavigationLink = link;
        return link;
    }

    function measureNavigationElementWidth(element, label = '') {
        if (!element?.isConnected) return 0;
        const cached = navigationMeasuredWidths.get(element);
        if (cached?.label === label && cached.width > 0) return cached.width;

        const measuredRect = element.getBoundingClientRect?.();
        const currentWidth = Number(measuredRect?.width) || 0;
        const currentStyle = window.getComputedStyle?.(element);
        if (currentWidth > 0 && currentStyle?.display !== 'none') {
            navigationMeasuredWidths.set(element, { label, width: currentWidth });
            return currentWidth;
        }

        const hadCollapsedClass = element.classList?.contains(OVERFLOW_COLLAPSED_CLASS);
        const hadVisibleClass = element.classList?.contains(OVERFLOW_VISIBLE_CLASS);
        const originalStyle = element.getAttribute?.('style');
        try {
            element.classList?.remove(OVERFLOW_COLLAPSED_CLASS);
            element.classList?.add(OVERFLOW_VISIBLE_CLASS);
            element.style?.setProperty('position', 'absolute', 'important');
            element.style?.setProperty('visibility', 'hidden', 'important');
            element.style?.setProperty('width', 'max-content', 'important');
            element.style?.setProperty('flex', '0 0 auto', 'important');
            element.style?.setProperty('left', '0', 'important');
            element.style?.setProperty('top', '0', 'important');
            const rect = element.getBoundingClientRect?.();
            const width = Number(rect?.width) || Number(element.scrollWidth) || 0;
            if (width > 0) navigationMeasuredWidths.set(element, { label, width });
            return width;
        } finally {
            element.classList?.toggle(OVERFLOW_COLLAPSED_CLASS, Boolean(hadCollapsedClass));
            element.classList?.toggle(OVERFLOW_VISIBLE_CLASS, Boolean(hadVisibleClass));
            if (originalStyle == null) element.removeAttribute?.('style');
            else element.setAttribute?.('style', originalStyle);
        }
    }

    function getPrismaModuleNavigationRecord(module, index) {
        const moduleElements = getElementsIncludingShadowDom(module.shadowRoot || module);
        const link = moduleElements.find(element =>
            String(element.tagName || '').toUpperCase() === 'A' &&
            (element.classList?.contains('module-label') || hasExactLabel(element, 'Campaigns') || hasExactLabel(element, 'Reports'))
        );
        const labelElement = moduleElements.find(element => element.classList?.contains('module-label-text'));
        const label = normalizeWhitespace(
            getTextFromElement(labelElement || link) ||
            module.getAttribute?.('aria-label') ||
            module.getAttribute?.('data-module-id') ||
            module.id.replace(/^mo-banner-module-/, '')
        );
        const moduleId = normalizeSearchText(module.getAttribute?.('data-module-id') || module.id);
        return {
            element: module,
            index,
            id: moduleId,
            label,
            href: link?.href || link?.getAttribute?.('href') || '#',
            width: measureNavigationElementWidth(module, label),
            kind: 'module'
        };
    }

    function getResponsiveNavigationGap(container) {
        const style = window.getComputedStyle?.(container);
        const gap = Number.parseFloat(style?.columnGap || style?.gap || '0');
        return Number.isFinite(gap) && gap > 0 ? gap : 0;
    }

    function getResponsiveNavigationUsedWidth(records, gap) {
        const visibleRecords = records.filter(record =>
            !record.element.classList?.contains(OVERFLOW_COLLAPSED_CLASS)
        );
        return visibleRecords.reduce((total, record) => total + record.width, 0) +
            Math.max(0, visibleRecords.length - 1) * gap;
    }

    function getResponsiveNavigationCollapseOrder(records, historyRecord) {
        const campaigns = records.find(record => /(?:^|\b)campaigns(?:\b|$)/i.test(record.label));
        const reports = records.find(record => /(?:^|\b)reports(?:\b|$)/i.test(record.label));
        const known = new Set([campaigns, reports].filter(Boolean));
        return [
            historyRecord,
            reports,
            campaigns,
            ...records.filter(record => !known.has(record)).reverse()
        ].filter(Boolean);
    }

    function getResponsiveNavigationMenuItems(records, historyRecord) {
        const items = [];
        if (historyRecord.element.classList.contains(OVERFLOW_COLLAPSED_CLASS)) {
            items.push({
                id: RESPONSIVE_HISTORY_ITEM_ID,
                kind: 'history',
                label: 'History',
                href: '#'
            });
        }

        const hiddenModules = records.filter(record =>
            record.element.classList?.contains(OVERFLOW_COLLAPSED_CLASS)
        );
        const rank = record => {
            if (/(?:^|\b)reports(?:\b|$)/i.test(record.label)) return 0;
            if (/(?:^|\b)campaigns(?:\b|$)/i.test(record.label)) return 1;
            return 2 + record.index;
        };
        hiddenModules.sort((left, right) => rank(left) - rank(right) || left.index - right.index);
        hiddenModules.forEach(record => items.push({
            id: '',
            kind: 'module',
            label: record.label,
            href: record.href || '#'
        }));
        return items;
    }

    function hasResponsiveNavigationOverflow(moduleContainer, records, availableWidth) {
        const containerRect = moduleContainer.getBoundingClientRect?.();
        if (!containerRect) return false;

        const containerLeft = Number(containerRect.left) || 0;
        const containerRight = containerLeft + availableWidth;
        return records.some(record => {
            if (record.element.classList?.contains(OVERFLOW_COLLAPSED_CLASS)) return false;
            const rect = record.element.getBoundingClientRect?.();
            if (!rect || (rect.width <= 0 && rect.height <= 0)) return false;
            return rect.left < containerLeft - 0.5 || rect.right > containerRight + 0.5;
        });
    }

    function getOverflowTrigger() {
        return getElementsIncludingShadowDom()
            .find(element => String(element.tagName || '').toUpperCase() === 'MO-BANNER-MODULE-OVERFLOW-MENU') || null;
    }

    function updateOverflowMenuItemCount(itemCount) {
        getElementsIncludingShadowDom()
            .filter(element => String(element.tagName || '').toUpperCase() === 'MO-BANNER-MODULE-OVERFLOW-MENU')
            .forEach(menu => {
                getElementsIncludingShadowDom(menu.shadowRoot || menu)
                    .filter(element => element.classList?.contains('overflow-label-layout'))
                    .forEach(layout => {
                        const countLabel = getDirectChildren(layout)
                            .find(child => /^\d+$/.test(String(child.textContent || '').trim()));
                        if (countLabel && countLabel.textContent !== String(itemCount)) {
                            countLabel.textContent = String(itemCount);
                        }
                    });
            });
    }

    function ensureResponsiveOverflowMenuMarkup(items) {
        let menu = document.getElementById(OVERFLOW_MENU_ID);
        if (!items.length) {
            closeResponsiveOverflowMenu();
            menu?.remove();
            return null;
        }

        if (!menu) {
            menu = document.createElement('div');
            menu.id = OVERFLOW_MENU_ID;
            menu.className = 'toolshed-campaign-history-overflow-menu';
            menu.setAttribute('role', 'menu');
            menu.setAttribute('aria-label', 'Campaign navigation');
            menu.hidden = true;
            document.body.appendChild(menu);
        }

        const signature = JSON.stringify(items.map(item => [item.kind, item.label, item.href]));
        if (menu.dataset.toolshedItemsSignature !== signature) {
            menu.replaceChildren();
            items.forEach(item => {
                const link = document.createElement('a');
                link.className = 'module-label toolshed-campaign-history-overflow-item';
                link.setAttribute('role', 'menuitem');
                link.setAttribute('tabindex', '-1');
                link.href = item.href || '#';
                link.textContent = item.label;
                if (item.id) link.id = item.id;
                if (item.kind === 'history') {
                    link.setAttribute('aria-label', 'Open campaign history');
                    link.addEventListener('click', event => {
                        event.preventDefault();
                        closeResponsiveOverflowMenu();
                        toggleHistoryPanel();
                    });
                } else {
                    link.addEventListener('click', closeResponsiveOverflowMenu);
                }
                menu.appendChild(link);
            });
            menu.dataset.toolshedItemsSignature = signature;
        }
        return menu;
    }

    function positionResponsiveOverflowMenu(trigger, menu) {
        if (!trigger || !menu || menu.hidden) return;
        const triggerRect = trigger.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        const menuWidth = menuRect.width || menu.offsetWidth || 200;
        const menuHeight = menuRect.height || menu.offsetHeight || menu.children.length * 40 + 8;
        const left = Math.max(8, Math.min(triggerRect.left, window.innerWidth - menuWidth - 8));
        let top = triggerRect.bottom;
        if (top + menuHeight > window.innerHeight - 8) {
            top = Math.max(8, triggerRect.top - menuHeight);
        }
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
    }

    function configureResponsiveOverflowTrigger(trigger) {
        if (!responsiveOverflowTriggerAttributes.has(trigger)) {
            responsiveOverflowTriggerAttributes.set(trigger, {
                ariaHaspopup: trigger.getAttribute('aria-haspopup'),
                ariaControls: trigger.getAttribute('aria-controls'),
                ariaExpanded: trigger.getAttribute('aria-expanded')
            });
        }
        trigger.setAttribute('aria-haspopup', 'menu');
        trigger.setAttribute('aria-controls', OVERFLOW_MENU_ID);
    }

    function restoreResponsiveOverflowTrigger(trigger) {
        const original = responsiveOverflowTriggerAttributes.get(trigger);
        if (!original) return;
        [
            ['aria-haspopup', original.ariaHaspopup],
            ['aria-controls', original.ariaControls],
            ['aria-expanded', original.ariaExpanded]
        ].forEach(([name, value]) => {
            if (value == null) trigger.removeAttribute(name);
            else trigger.setAttribute(name, value);
        });
        responsiveOverflowTriggerAttributes.delete(trigger);
    }

    function closeResponsiveOverflowMenu({ restoreFocus = false } = {}) {
        responsiveOverflowPointerDownOnTrigger = false;
        if (responsiveOverflowHoverTimer != null) {
            window.clearTimeout(responsiveOverflowHoverTimer);
            responsiveOverflowHoverTimer = null;
        }
        if (responsiveOverflowCloseTimer != null) {
            window.clearTimeout(responsiveOverflowCloseTimer);
            responsiveOverflowCloseTimer = null;
        }
        const menu = document.getElementById(OVERFLOW_MENU_ID);
        if (menu) menu.hidden = true;
        const trigger = getOverflowTrigger();
        trigger?.setAttribute('aria-expanded', 'false');
        responsiveOverflowOpenedByHover = false;
        if (restoreFocus) trigger?.focus?.();
    }

    function openResponsiveOverflowMenu(trigger = getOverflowTrigger(), { focusFirst = false, byHover = false } = {}) {
        if (!trigger || !responsiveOverflowItems.length) return false;
        if (responsiveOverflowHoverTimer != null) {
            window.clearTimeout(responsiveOverflowHoverTimer);
            responsiveOverflowHoverTimer = null;
        }
        if (responsiveOverflowCloseTimer != null) {
            window.clearTimeout(responsiveOverflowCloseTimer);
            responsiveOverflowCloseTimer = null;
        }
        const menu = ensureResponsiveOverflowMenuMarkup(responsiveOverflowItems);
        if (!menu) return false;
        menu.hidden = false;
        positionResponsiveOverflowMenu(trigger, menu);
        configureResponsiveOverflowTrigger(trigger);
        trigger.setAttribute('aria-expanded', 'true');
        responsiveOverflowOpenedByHover = Boolean(byHover);
        if (focusFirst) menu.querySelector('[role="menuitem"]')?.focus();
        return true;
    }

    function scheduleResponsiveOverflowClose() {
        if (responsiveOverflowCloseTimer != null) window.clearTimeout(responsiveOverflowCloseTimer);
        responsiveOverflowCloseTimer = window.setTimeout(() => {
            responsiveOverflowCloseTimer = null;
            closeResponsiveOverflowMenu();
        }, 180);
    }

    function scheduleResponsiveOverflowOpen(trigger) {
        if (responsiveOverflowHoverTimer != null) return;
        responsiveOverflowHoverTimer = window.setTimeout(() => {
            responsiveOverflowHoverTimer = null;
            if (!trigger?.isConnected || !responsiveOverflowItems.length) return;
            openResponsiveOverflowMenu(trigger, { byHover: true });
        }, RESPONSIVE_OVERFLOW_HOVER_DELAY_MS);
    }

    function getEventPath(event) {
        return typeof event?.composedPath === 'function'
            ? event.composedPath()
            : [event?.target].filter(Boolean);
    }

    function getEventOverflowTrigger(event) {
        return getEventPath(event).find(element =>
            String(element?.tagName || '').toUpperCase() === 'MO-BANNER-MODULE-OVERFLOW-MENU'
        ) || null;
    }

    function eventIsResponsiveOverflowMenu(event) {
        return getEventPath(event).some(element => element?.id === OVERFLOW_MENU_ID);
    }

    function interceptResponsiveOverflowHover(event) {
        if (eventIsResponsiveOverflowMenu(event)) {
            if (responsiveOverflowHoverTimer != null) {
                window.clearTimeout(responsiveOverflowHoverTimer);
                responsiveOverflowHoverTimer = null;
            }
            if (responsiveOverflowCloseTimer != null) {
                window.clearTimeout(responsiveOverflowCloseTimer);
                responsiveOverflowCloseTimer = null;
            }
            return;
        }
        const trigger = getEventOverflowTrigger(event);
        if (!trigger || !responsiveOverflowItems.length) return;
        event.stopImmediatePropagation?.();
        const menu = document.getElementById(OVERFLOW_MENU_ID);
        if (!menu || menu.hidden) scheduleResponsiveOverflowOpen(trigger);
    }

    function interceptResponsiveOverflowPointerOut(event) {
        const path = getEventPath(event);
        const trigger = path.find(element =>
            String(element?.tagName || '').toUpperCase() === 'MO-BANNER-MODULE-OVERFLOW-MENU'
        );
        const menu = path.find(element => element?.id === OVERFLOW_MENU_ID);
        if (!trigger && !menu) return;
        const relatedTarget = event.relatedTarget;
        const popup = document.getElementById(OVERFLOW_MENU_ID);
        if (relatedTarget && (trigger?.contains?.(relatedTarget) || popup?.contains?.(relatedTarget))) return;
        if (trigger && responsiveOverflowHoverTimer != null) {
            window.clearTimeout(responsiveOverflowHoverTimer);
            responsiveOverflowHoverTimer = null;
        }
        if (responsiveOverflowItems.length) event.stopImmediatePropagation?.();
        scheduleResponsiveOverflowClose();
    }

    function handleResponsiveOverflowPointerDown(event) {
        const trigger = getEventOverflowTrigger(event);
        if (trigger && responsiveOverflowItems.length) {
            responsiveOverflowPointerDownOnTrigger = true;
            event.stopImmediatePropagation?.();
            return;
        }
        if (eventIsResponsiveOverflowMenu(event)) return;
        closeResponsiveOverflowMenu();
    }

    function clearResponsiveOverflowPointerDown() {
        responsiveOverflowPointerDownOnTrigger = false;
    }

    function handleResponsiveOverflowClick(event) {
        const trigger = getEventOverflowTrigger(event);
        if (trigger && responsiveOverflowItems.length) {
            event.preventDefault?.();
            event.stopImmediatePropagation?.();
            responsiveOverflowPointerDownOnTrigger = false;
            if (responsiveOverflowHoverTimer != null) {
                window.clearTimeout(responsiveOverflowHoverTimer);
                responsiveOverflowHoverTimer = null;
            }
            const menu = document.getElementById(OVERFLOW_MENU_ID);
            const isOpen = Boolean(menu && !menu.hidden);
            if (isOpen && !responsiveOverflowOpenedByHover) closeResponsiveOverflowMenu();
            else openResponsiveOverflowMenu(trigger, { byHover: false });
            responsiveOverflowOpenedByHover = false;
            return;
        }
        if (!eventIsResponsiveOverflowMenu(event)) closeResponsiveOverflowMenu();
    }

    function handleResponsiveOverflowFocus(event) {
        const trigger = getEventOverflowTrigger(event);
        if (trigger && responsiveOverflowItems.length) {
            // Pointer clicks focus the custom element before the click event.
            // Leave the current hover state alone so the click can keep an
            // already-open menu open or open a closed menu immediately.
            if (responsiveOverflowPointerDownOnTrigger) return;
            if (responsiveOverflowHoverTimer != null) {
                window.clearTimeout(responsiveOverflowHoverTimer);
                responsiveOverflowHoverTimer = null;
            }
            openResponsiveOverflowMenu(trigger, { byHover: false });
        }
    }

    function handleResponsiveOverflowKeydown(event) {
        const trigger = getEventOverflowTrigger(event);
        const menu = document.getElementById(OVERFLOW_MENU_ID);
        if (trigger && responsiveOverflowItems.length) {
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                event.stopImmediatePropagation?.();
                openResponsiveOverflowMenu(trigger, { focusFirst: true });
            } else if (event.key === 'Escape' && menu && !menu.hidden) {
                event.preventDefault();
                event.stopImmediatePropagation?.();
                closeResponsiveOverflowMenu({ restoreFocus: true });
            }
            return;
        }

        if (!menu || menu.hidden || !menu.contains(event.target)) {
            if (event.key === 'Escape') closeResponsiveOverflowMenu();
            return;
        }
        const links = Array.from(menu.querySelectorAll('[role="menuitem"]'));
        if (!links.length) return;
        const currentIndex = links.indexOf(document.activeElement);
        let nextIndex = -1;
        if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1 + links.length) % links.length;
        else if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + links.length) % links.length;
        else if (event.key === 'Home') nextIndex = 0;
        else if (event.key === 'End') nextIndex = links.length - 1;
        else if (event.key === 'Escape') {
            event.preventDefault();
            closeResponsiveOverflowMenu({ restoreFocus: true });
            return;
        }
        if (nextIndex >= 0) {
            event.preventDefault();
            links[nextIndex].focus();
        }
    }

    function ensureResponsiveOverflowInteractions() {
        if (overflowMenuInteractionsInstalled || !document) return;
        document.addEventListener('pointerover', interceptResponsiveOverflowHover, true);
        document.addEventListener('mouseover', interceptResponsiveOverflowHover, true);
        document.addEventListener('pointerout', interceptResponsiveOverflowPointerOut, true);
        document.addEventListener('mouseout', interceptResponsiveOverflowPointerOut, true);
        document.addEventListener('pointerdown', handleResponsiveOverflowPointerDown, true);
        document.addEventListener('mousedown', handleResponsiveOverflowPointerDown, true);
        document.addEventListener('pointerup', clearResponsiveOverflowPointerDown, true);
        document.addEventListener('mouseup', clearResponsiveOverflowPointerDown, true);
        document.addEventListener('click', handleResponsiveOverflowClick, true);
        document.addEventListener('focusin', handleResponsiveOverflowFocus, true);
        document.addEventListener('keydown', handleResponsiveOverflowKeydown, true);
        overflowMenuInteractionsInstalled = true;
    }

    function getResponsiveOverflowTriggerOffset(container, trigger, visibleRecords) {
        const containerRect = container.getBoundingClientRect?.();
        // The current rect includes our previous translateX value. Clear that
        // owned transform before measuring so repeated resize reconciliations
        // calculate from the trigger's natural flex position instead of
        // accumulating offsets from earlier viewport widths.
        if (trigger.style?.getPropertyValue(OVERFLOW_OFFSET_PROPERTY)) {
            trigger.style.removeProperty(OVERFLOW_OFFSET_PROPERTY);
        }
        const triggerRect = trigger.getBoundingClientRect?.();
        if (!containerRect || !triggerRect || triggerRect.width <= 0) return 0;
        const visibleRights = visibleRecords
            .map(record => Number(record.element.getBoundingClientRect?.().right) || 0)
            .filter(right => right > 0);
        const desiredLeft = visibleRights.length
            ? Math.max(...visibleRights)
            : containerRect.left;
        return desiredLeft - triggerRect.left;
    }

    function reconcilePrismaBannerNavigation(moduleContainer) {
        const insertionContainer = moduleContainer;
        const modules = getDirectChildren(moduleContainer)
            .filter(element => String(element.tagName || '').toUpperCase() === 'MO-BANNER-MODULE');
        if (!modules.length) return false;
        const availableWidth = Number(moduleContainer.clientWidth) ||
            Number(moduleContainer.getBoundingClientRect?.().width) || 0;
        if (availableWidth <= 0) return false;

        ensureShadowNavigationStyles(insertionContainer);
        const trigger = getOverflowTrigger();
        ensureOverflowSpacingStyle(trigger || insertionContainer);
        const historyLink = createPrismaHistoryNavigationLink(insertionContainer);
        const moduleRecords = modules.map(getPrismaModuleNavigationRecord);
        const historyRecord = {
            element: historyLink,
            index: moduleRecords.length,
            id: 'campaign-history',
            label: 'History',
            href: '#',
            width: measureNavigationElementWidth(historyLink, 'History'),
            kind: 'history'
        };
        const allRecords = [...moduleRecords, historyRecord];
        if (allRecords.every(record => record.width <= 0)) return false;

        const gap = getResponsiveNavigationGap(moduleContainer);
        let usedWidth = getResponsiveNavigationUsedWidth(allRecords, gap);
        const collapseOrder = getResponsiveNavigationCollapseOrder(moduleRecords, historyRecord);
        collapseOrder.forEach(record => {
            if (usedWidth <= availableWidth + 0.5) return;
            if (record.element.classList.contains(OVERFLOW_COLLAPSED_CLASS)) return;
            record.element.classList.remove(OVERFLOW_VISIBLE_CLASS);
            record.element.classList.add(OVERFLOW_COLLAPSED_CLASS);
            usedWidth = getResponsiveNavigationUsedWidth(allRecords, gap);
        });

        const expandOrder = [...collapseOrder].reverse();
        expandOrder.forEach(record => {
            if (!record.element.classList.contains(OVERFLOW_COLLAPSED_CLASS)) return;
            const currentCount = allRecords.filter(candidate =>
                !candidate.element.classList.contains(OVERFLOW_COLLAPSED_CLASS)
            ).length;
            const addedGap = currentCount > 0 ? gap : 0;
            if (usedWidth + record.width + addedGap > availableWidth - 8) return;
            record.element.classList.remove(OVERFLOW_COLLAPSED_CLASS);
            record.element.classList.add(OVERFLOW_VISIBLE_CLASS);
            usedWidth = getResponsiveNavigationUsedWidth(allRecords, gap);
        });

        // Prisma can reflow its module slots after the width was first measured.
        // Check the rendered bounds as well so a stale cached width cannot leave
        // a link clipped or underneath the three-dot trigger.
        for (const record of collapseOrder) {
            if (!hasResponsiveNavigationOverflow(insertionContainer, allRecords, availableWidth)) break;
            if (record.element.classList.contains(OVERFLOW_COLLAPSED_CLASS)) continue;
            record.element.classList.remove(OVERFLOW_VISIBLE_CLASS);
            record.element.classList.add(OVERFLOW_COLLAPSED_CLASS);
        }

        // Keep Prisma's built-in hidden state from overriding the measured,
        // priority-based layout while this feature owns these module slots.
        allRecords.forEach(record => {
            if (record.element.classList.contains(OVERFLOW_COLLAPSED_CLASS)) {
                record.element.classList.remove(OVERFLOW_VISIBLE_CLASS);
                if (record.kind === 'module') record.element.classList.add('hidden');
            } else {
                record.element.classList.add(OVERFLOW_VISIBLE_CLASS);
                if (record.kind === 'module') record.element.classList.remove('hidden');
            }
        });

        campaignHistoryUsesOverflow = historyLink.classList.contains(OVERFLOW_COLLAPSED_CLASS);
        campaignHistoryBlockedLayoutSignature = '';
        responsiveOverflowItems = getResponsiveNavigationMenuItems(moduleRecords, historyRecord);
        ensureResponsiveOverflowInteractions();
        ensureResponsiveOverflowMenuMarkup(responsiveOverflowItems);

        if (trigger) {
            if (responsiveOverflowItems.length) {
                trigger.classList.add(OVERFLOW_MENU_TRIGGER_CLASS);
                configureResponsiveOverflowTrigger(trigger);
                updateOverflowMenuItemCount(responsiveOverflowItems.length);
                const visibleRecords = allRecords.filter(record =>
                    !record.element.classList.contains(OVERFLOW_COLLAPSED_CLASS)
                );
                const offset = getResponsiveOverflowTriggerOffset(moduleContainer, trigger, visibleRecords);
                if (Math.abs(offset) > 0.5) trigger.style.setProperty(OVERFLOW_OFFSET_PROPERTY, `${offset}px`);
                else trigger.style.removeProperty(OVERFLOW_OFFSET_PROPERTY);
                if (document.getElementById(OVERFLOW_MENU_ID) && !document.getElementById(OVERFLOW_MENU_ID).hidden) {
                    positionResponsiveOverflowMenu(trigger, document.getElementById(OVERFLOW_MENU_ID));
                }
            } else {
                if (trigger.classList.contains(OVERFLOW_MENU_TRIGGER_CLASS)) {
                    trigger.classList.remove(OVERFLOW_MENU_TRIGGER_CLASS);
                }
                if (trigger.style.getPropertyValue(OVERFLOW_OFFSET_PROPERTY)) {
                    trigger.style.removeProperty(OVERFLOW_OFFSET_PROPERTY);
                }
                closeResponsiveOverflowMenu();
                restoreResponsiveOverflowTrigger(trigger);
            }
        }

        removeOverflowNavigationItems();
        return true;
    }

    function reconcileNavigationItems() {
        const moduleContainer = findPrismaBannerModuleContainer();
        if (moduleContainer && reconcilePrismaBannerNavigation(moduleContainer)) return;

        if (ensureNavigationLink()) {
            removeOverflowNavigationItems();
        } else {
            ensureOverflowNavigationItems();
        }
        syncOverflowMenuPresentation();
    }

    function removeTopLevelNavigationLink() {
        findNavigationLinks().forEach(element => element.remove());
        currentNavigationLink = null;
        getElementsIncludingShadowDom()
            .filter(element => element.id === SHADOW_NAVIGATION_STYLE_ID)
            .forEach(element => element.remove());
    }

    function removeOverflowNavigationItems() {
        getElementsIncludingShadowDom()
            .filter(element => element.id === OVERFLOW_NAVIGATION_ID)
            .forEach(element => element.remove());
    }

    function resetResponsiveOverflowNavigation() {
        responsiveOverflowItems = [];
        closeResponsiveOverflowMenu();
        getElementsIncludingShadowDom().forEach(element => {
            if (String(element.tagName || '').toUpperCase() === 'MO-BANNER-MODULE' &&
                (element.classList?.contains(OVERFLOW_COLLAPSED_CLASS) ||
                    element.classList?.contains(OVERFLOW_VISIBLE_CLASS))) {
                element.classList.remove('hidden');
            }
            element.classList?.remove(OVERFLOW_COLLAPSED_CLASS, OVERFLOW_VISIBLE_CLASS);
            if (element.classList?.contains(OVERFLOW_MENU_TRIGGER_CLASS)) {
                element.classList.remove(OVERFLOW_MENU_TRIGGER_CLASS);
                element.style?.removeProperty(OVERFLOW_OFFSET_PROPERTY);
                restoreResponsiveOverflowTrigger(element);
            }
        });
        document.getElementById(OVERFLOW_MENU_ID)?.remove();
    }

    function removeNavigationLink() {
        campaignHistoryUsesOverflow = false;
        campaignHistoryBlockedLayoutSignature = '';
        resetResponsiveOverflowNavigation();
        removeTopLevelNavigationLink();
        removeOverflowNavigationItems();
        syncOverflowMenuPresentation();
    }

    function createButton(className, label, iconName) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = className;
        button.setAttribute('aria-label', label);
        if (iconName) button.appendChild(createSvgIcon(iconName));
        return button;
    }

    let activeContextMenu = null;

    function closeContextMenu() {
        if (!activeContextMenu) return;
        activeContextMenu.remove();
        activeContextMenu = null;
        document.removeEventListener('pointerdown', handleContextMenuOutsideInteraction);
        document.removeEventListener('keydown', handleContextMenuKeydown);
    }

    function handleContextMenuOutsideInteraction(event) {
        if (activeContextMenu && !activeContextMenu.contains(event.target)) {
            closeContextMenu();
        }
    }

    function handleContextMenuKeydown(event) {
        if (event.key === 'Escape') {
            closeContextMenu();
        }
    }

    function findResultEntryFromEvent(event) {
        const target = event.target;
        if (!target) return null;
        const button = target.closest?.(`button[${HISTORY_KEY_ATTRIBUTE}]`) ||
            target.closest?.('.toolshed-campaign-history-result')?.querySelector?.(`button[${HISTORY_KEY_ATTRIBUTE}]`);
        if (!button) return null;
        const key = button.getAttribute(HISTORY_KEY_ATTRIBUTE);
        return historyEntries.find(item => item.key === key) || null;
    }

    function getCopyCampaignUrl(url) {
        if (!url) return '';
        if (url.includes('prsm-cm-cmpcopy')) return url;
        if (url.includes('osModalId=')) {
            return url.replace(/osModalId=[^&]*/, 'osModalId=prsm-cm-cmpcopy');
        }
        return url + '&osModalId=prsm-cm-cmpcopy';
    }

    async function copyToClipboard(text, action) {
        if (!text || !chrome.runtime?.sendMessage) return false;
        try {
            const response = await chrome.runtime.sendMessage({ action, text });
            return response?.status === 'success';
        } catch (_error) {
            return false;
        }
    }

    function createContextMenuItem(label, iconName, onClick) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'toolshed-campaign-history-context-item';
        item.setAttribute('role', 'menuitem');
        if (iconName) {
            item.appendChild(createSvgIcon(iconName));
        }
        const span = document.createElement('span');
        span.textContent = label;
        item.appendChild(span);

        item.addEventListener('click', event => {
            if (!event.isTrusted) return;
            event.stopPropagation();
            onClick(event, item);
        });
        return item;
    }

    function openContextMenu(entry, x, y) {
        closeContextMenu();

        const menu = document.createElement('div');
        menu.id = 'toolshed-campaign-history-context-menu';
        menu.className = 'toolshed-campaign-history-context-menu';
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', `Options for ${entry.campaignName || entry.cpNumber || 'campaign'}`);

        // 1. Open in new tab
        const newTabItem = createContextMenuItem('Open in new tab', 'new-tab', () => {
            closeContextMenu();
            window.open(entry.url, '_blank');
        });
        menu.appendChild(newTabItem);

        // 2. Copy campaign (opens Prisma copy modal)
        const copyCampaignItem = createContextMenuItem('Copy campaign', 'copy', event => {
            const copyUrl = getCopyCampaignUrl(entry.url);
            closeContextMenu();
            if (event.ctrlKey || event.metaKey) {
                window.open(copyUrl, '_blank');
                return;
            }
            closeHistoryPanel();
            if (copyUrl !== window.location.href) {
                window.location.href = copyUrl;
            }
        });
        copyCampaignItem.title = 'Start a campaign copy in Prisma';
        menu.appendChild(copyCampaignItem);

        // Divider
        const divider = document.createElement('div');
        divider.className = 'toolshed-campaign-history-context-divider';
        divider.setAttribute('role', 'separator');
        menu.appendChild(divider);

        // 3. Copy campaign link (to clipboard)
        const copyLinkItem = createContextMenuItem('Copy campaign link', 'link', async (_event, btn) => {
            const success = await copyToClipboard(entry.url, 'copyCampaignUrlToClipboard');
            const labelSpan = btn.querySelector('span');
            if (labelSpan) labelSpan.textContent = success ? 'Copied link!' : 'Failed to copy';
            window.setTimeout(() => closeContextMenu(), 500);
        });
        menu.appendChild(copyLinkItem);

        // 4. Copy campaign name (to clipboard)
        const copyNameItem = createContextMenuItem('Copy campaign name', 'text', async (_event, btn) => {
            const nameToCopy = entry.campaignName || entry.cpNumber || entry.campaignId || '';
            const success = await copyToClipboard(nameToCopy, 'copyCampaignHeaderToClipboard');
            const labelSpan = btn.querySelector('span');
            if (labelSpan) labelSpan.textContent = success ? 'Copied name!' : 'Failed to copy';
            window.setTimeout(() => closeContextMenu(), 500);
        });
        menu.appendChild(copyNameItem);

        document.body.appendChild(menu);
        activeContextMenu = menu;

        // Viewport bounds calculation
        const menuRect = menu.getBoundingClientRect();
        const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 800;
        const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 600;

        let posX = x;
        let posY = y;

        if (posX + menuRect.width > viewportWidth - 8) {
            posX = Math.max(8, viewportWidth - menuRect.width - 8);
        }
        if (posY + menuRect.height > viewportHeight - 8) {
            posY = Math.max(8, viewportHeight - menuRect.height - 8);
        }

        menu.style.left = `${posX}px`;
        menu.style.top = `${posY}px`;

        newTabItem.focus();

        window.setTimeout(() => {
            document.addEventListener('pointerdown', handleContextMenuOutsideInteraction);
            document.addEventListener('keydown', handleContextMenuKeydown);
        }, 0);
    }

    function createHistoryPageButton(className, label, symbol, pageDelta) {
        const button = createButton(className, label);
        button.appendChild(createTextElement(
            'span',
            'toolshed-campaign-history-page-symbol',
            symbol
        ));
        button.addEventListener('click', () => changeHistoryPage(pageDelta));
        return button;
    }

    function ensurePanel() {
        let panel = document.getElementById(PANEL_ID);
        if (panel) return panel;
        if (!document.body) return null;

        panel = document.createElement('section');
        panel.id = PANEL_ID;
        panel.className = 'toolshed-campaign-history-panel';
        panel.hidden = true;
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'false');
        panel.setAttribute('aria-hidden', 'true');
        panel.setAttribute('aria-labelledby', 'toolshed-campaign-history-title');

        const header = document.createElement('header');
        header.className = 'toolshed-campaign-history-header';
        const headingGroup = document.createElement('div');
        headingGroup.className = 'toolshed-campaign-history-heading-group';
        headingGroup.appendChild(createTextElement('h2', '', 'Campaign History'));
        headingGroup.lastElementChild.id = 'toolshed-campaign-history-title';
        const count = createTextElement('span', 'toolshed-campaign-history-count', '');
        count.id = 'toolshed-campaign-history-count';
        headingGroup.appendChild(count);
        header.appendChild(headingGroup);

        const headerActions = document.createElement('div');
        headerActions.className = 'toolshed-campaign-history-header-actions';
        const expandButton = createButton(
            'toolshed-campaign-history-expand',
            'Expand campaign history',
            'expand'
        );
        expandButton.dataset.expanded = 'false';
        expandButton.setAttribute('aria-expanded', 'false');
        const expandLabel = createTextElement('span', 'toolshed-campaign-history-button-label', 'Expand');
        expandButton.appendChild(expandLabel);
        expandButton.addEventListener('mousedown', event => {
            // Keep the search field focused when the user expands or minimises
            // the panel with a pointer click.
            if (event.button === 0) event.preventDefault();
        });
        expandButton.addEventListener('click', () => toggleExpanded(panel));
        const closeButton = createButton(
            'toolshed-campaign-history-close',
            'Close campaign history',
            'close'
        );
        closeButton.addEventListener('click', closeHistoryPanel);
        headerActions.append(expandButton, closeButton);
        header.appendChild(headerActions);
        panel.appendChild(header);

        const search = document.createElement('div');
        search.className = 'toolshed-campaign-history-search';
        search.setAttribute('role', 'search');
        search.appendChild(createSvgIcon('search'));
        const input = document.createElement('input');
        input.type = 'search';
        input.id = 'toolshed-campaign-history-search-input';
        input.placeholder = 'Search campaign, client, CP, CL/PR/CA or supplier';
        input.setAttribute('aria-label', 'Search campaign history');
        input.autocomplete = 'off';
        input.spellcheck = false;
        search.appendChild(input);
        const clearButton = createButton(
            'toolshed-campaign-history-clear',
            'Clear campaign history search',
            'close'
        );
        clearButton.hidden = true;
        clearButton.addEventListener('click', () => {
            closeContextMenu();
            input.value = '';
            clearButton.hidden = true;
            historyPageIndex = 0;
            renderHistoryResults();
            input.focus();
        });
        search.appendChild(clearButton);
        input.addEventListener('input', () => {
            closeContextMenu();
            clearButton.hidden = !input.value;
            historyPageIndex = 0;
            renderHistoryResults();
        });
        input.addEventListener('keydown', event => {
            if (event.key !== 'Escape') return;
            if (input.value) {
                input.value = '';
                clearButton.hidden = true;
                historyPageIndex = 0;
                renderHistoryResults();
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            event.stopPropagation();
            closeHistoryPanel();
        });
        panel.appendChild(search);

        const helper = createTextElement(
            'p',
            'toolshed-campaign-history-helper',
            'Search the campaigns you have visited by campaign name, client name, CP number, CL/PR/CA reference or supplier.'
        );
        panel.appendChild(helper);

        const status = createTextElement('div', 'toolshed-campaign-history-status', '');
        status.id = 'toolshed-campaign-history-status';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        panel.appendChild(status);

        const resultList = document.createElement('div');
        resultList.id = 'toolshed-campaign-history-results';
        resultList.className = 'toolshed-campaign-history-results';
        resultList.setAttribute('role', 'list');

        resultList.addEventListener('mousedown', event => {
            if (event.button === 1) {
                // Prevent browser autoscroll cursor on middle click
                event.preventDefault();
            }
        });

        resultList.addEventListener('auxclick', event => {
            if (event.button !== 1) return; // Middle click only
            const entry = findResultEntryFromEvent(event);
            if (!entry?.url) return;
            event.preventDefault();
            event.stopPropagation();
            closeContextMenu();
            window.open(entry.url, '_blank');
        });

        resultList.addEventListener('click', event => {
            const entry = findResultEntryFromEvent(event);
            if (!entry?.url) return;

            if (event.ctrlKey || event.metaKey) {
                event.preventDefault();
                closeContextMenu();
                window.open(entry.url, '_blank');
                return;
            }

            closeContextMenu();
            closeHistoryPanel();
            if (entry.url !== window.location.href) window.location.href = entry.url;
        });

        resultList.addEventListener('contextmenu', event => {
            const entry = findResultEntryFromEvent(event);
            if (!entry?.url) return;
            event.preventDefault();
            event.stopPropagation();
            openContextMenu(entry, event.clientX, event.clientY);
        });

        resultList.addEventListener('scroll', () => {
            closeContextMenu();
        });
        panel.appendChild(resultList);

        const pagination = document.createElement('nav');
        pagination.id = 'toolshed-campaign-history-pagination';
        pagination.className = 'toolshed-campaign-history-pagination';
        pagination.setAttribute('aria-label', 'Campaign history pages');
        pagination.hidden = true;
        const previousButton = createHistoryPageButton(
            'toolshed-campaign-history-page-button toolshed-campaign-history-page-previous',
            'Previous campaign history page',
            '<',
            -1
        );
        const pageIndicator = createTextElement(
            'span',
            'toolshed-campaign-history-page-indicator',
            ''
        );
        pageIndicator.id = 'toolshed-campaign-history-page-indicator';
        pageIndicator.setAttribute('aria-live', 'polite');
        const nextButton = createHistoryPageButton(
            'toolshed-campaign-history-page-button toolshed-campaign-history-page-next',
            'Next campaign history page',
            '>',
            1
        );
        pagination.append(previousButton, pageIndicator, nextButton);
        panel.appendChild(pagination);

        document.body.appendChild(panel);
        return panel;
    }

    function getPanelTransitionDuration() {
        try {
            if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 0;
        } catch (_error) {
            // Fall back to the normal transition when matchMedia is unavailable.
            return PANEL_TRANSITION_DURATION_MS;
        }
        return PANEL_TRANSITION_DURATION_MS;
    }

    function clearPanelCloseAnimation() {
        if (panelCloseTimer !== null) {
            window.clearTimeout(panelCloseTimer);
            panelCloseTimer = null;
        }
        if (panelCloseTarget && panelCloseTransitionHandler) {
            panelCloseTarget.removeEventListener('transitionend', panelCloseTransitionHandler);
        }
        panelCloseTarget = null;
        panelCloseTransitionHandler = null;
    }

    function clearPanelGeometryCleanup() {
        if (panelGeometryCleanupTimer !== null) {
            window.clearTimeout(panelGeometryCleanupTimer);
            panelGeometryCleanupTimer = null;
        }
    }

    function clearInlinePanelGeometry(panel) {
        ['top', 'right', 'bottom', 'left', 'width', 'height', 'max-height']
            .forEach(property => panel.style.removeProperty(property));
    }

    function setInlinePanelGeometry(panel, rect) {
        panel.style.top = `${Math.max(0, rect.top)}px`;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        panel.style.left = `${Math.max(0, rect.left)}px`;
        panel.style.width = `${Math.max(0, rect.width)}px`;
        panel.style.height = `${Math.max(0, rect.height)}px`;
        panel.style.maxHeight = 'none';
    }

    function measureCollapsedPanelGeometry(panel, currentRect, prepareCollapsedPanel) {
        const previousTransition = panel.style.getPropertyValue('transition');
        const previousTransitionPriority = panel.style.getPropertyPriority('transition');
        let targetRect;

        // Removing the expanded class normally starts the CSS geometry
        // transition immediately. Disable it while measuring so the target
        // is the native right-anchored panel, rather than the first frame of
        // the collapse animation (which leaves the expanded right inset).
        panel.style.setProperty('transition', 'none');
        try {
            panel.classList.remove('is-expanded');
            clearInlinePanelGeometry(panel);
            prepareCollapsedPanel?.();
            void panel.offsetWidth;
            targetRect = panel.getBoundingClientRect();

            // Restore the current geometry while transitions are still off.
            // This gives the browser a committed start point before the
            // normal transition is restored and the measured target applied.
            setInlinePanelGeometry(panel, currentRect);
            void panel.offsetWidth;
        } finally {
            if (previousTransition) {
                panel.style.setProperty(
                    'transition',
                    previousTransition,
                    previousTransitionPriority
                );
            } else {
                panel.style.removeProperty('transition');
            }
        }

        return targetRect;
    }

    function getExpandedPanelGeometry() {
        const viewportWidth = Math.max(window.innerWidth || document.documentElement?.clientWidth || 0, 0);
        const viewportHeight = Math.max(window.innerHeight || document.documentElement?.clientHeight || 0, 0);
        const left = viewportWidth * 0.05;
        const top = Math.max(56, viewportHeight * 0.05);
        const right = left;
        const bottom = viewportHeight * 0.05;

        return {
            left,
            top,
            width: Math.max(0, viewportWidth - left - right),
            height: Math.max(0, viewportHeight - top - bottom)
        };
    }

    function animatePanelGeometry(panel, expanded, prepareCollapsedPanel) {
        clearPanelGeometryCleanup();
        const currentRect = panel.getBoundingClientRect();
        setInlinePanelGeometry(panel, currentRect);

        let targetRect;
        if (expanded) {
            panel.classList.add('is-expanded');
            targetRect = getExpandedPanelGeometry();
        } else {
            targetRect = measureCollapsedPanelGeometry(
                panel,
                currentRect,
                prepareCollapsedPanel
            );
        }

        // Force the current dimensions to be committed before applying the
        // target dimensions so the browser interpolates the geometry.
        void panel.offsetWidth;
        setInlinePanelGeometry(panel, targetRect);

        const duration = getPanelTransitionDuration();
        if (duration === 0) {
            clearInlinePanelGeometry(panel);
            return;
        }

        panelGeometryCleanupTimer = window.setTimeout(() => {
            panelGeometryCleanupTimer = null;
            if (!panel.hidden && expanded) {
                clearInlinePanelGeometry(panel);
            }
            // Keep the measured collapsed geometry in place. Removing the
            // pixel-based left/width values here lets the CSS right anchor
            // reflow after the transition, which causes a visible jump at the
            // end of minimising.
        }, duration + 40);
    }

    function finishPanelClose(panel) {
        if (!panel || panel.classList.contains('is-open')) return;
        clearPanelGeometryCleanup();
        panel.hidden = true;
        panel.classList.remove('is-closing');
        clearInlinePanelGeometry(panel);
        panel.setAttribute('aria-hidden', 'true');
    }

    function hidePanelImmediately(panel) {
        if (!panel) return;
        clearPanelCloseAnimation();
        clearPanelGeometryCleanup();
        panel.hidden = true;
        panel.classList.remove('is-open', 'is-closing');
        clearInlinePanelGeometry(panel);
        panel.setAttribute('aria-hidden', 'true');
    }

    function startPanelOpen(panel) {
        clearPanelCloseAnimation();
        panel.hidden = false;
        panel.classList.remove('is-closing');
        panel.setAttribute('aria-hidden', 'false');

        if (panel.classList.contains('is-open')) return;

        // Ensure the browser paints the off-screen state before revealing the
        // panel, otherwise the opening transition can be skipped.
        void panel.offsetWidth;
        const reveal = () => {
            if (!panel.hidden && !panel.classList.contains('is-closing')) {
                panel.classList.add('is-open');
            }
        };
        if (typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(reveal);
        } else {
            window.setTimeout(reveal, 0);
        }
    }

    function startPanelClose(panel) {
        clearPanelCloseAnimation();
        clearPanelGeometryCleanup();
        panel.classList.remove('is-open');
        panel.classList.add('is-closing');
        panel.setAttribute('aria-hidden', 'true');

        const duration = getPanelTransitionDuration();
        if (duration === 0) {
            finishPanelClose(panel);
            return;
        }

        const onTransitionEnd = event => {
            if (event.target !== panel || event.propertyName !== 'transform') return;
            clearPanelCloseAnimation();
            finishPanelClose(panel);
        };
        panelCloseTarget = panel;
        panelCloseTransitionHandler = onTransitionEnd;
        panel.addEventListener('transitionend', onTransitionEnd);
        panelCloseTimer = window.setTimeout(() => {
            clearPanelCloseAnimation();
            finishPanelClose(panel);
        }, duration + 40);
    }

    function setExpanded(panel, expanded, prepareCollapsedPanel) {
        if (!panel) return;
        const expandButton = panel.querySelector('.toolshed-campaign-history-expand');
        const label = expandButton?.querySelector('.toolshed-campaign-history-button-label');
        animatePanelGeometry(panel, expanded, prepareCollapsedPanel);
        panel.setAttribute('aria-modal', String(expanded));
        if (expandButton) {
            expandButton.dataset.expanded = String(expanded);
            expandButton.setAttribute('aria-pressed', String(expanded));
            expandButton.setAttribute('aria-expanded', String(expanded));
            expandButton.setAttribute('aria-label', expanded
                ? 'Minimise campaign history'
                : 'Expand campaign history');
            const icon = expandButton.querySelector('svg');
            if (icon) icon.replaceWith(createSvgIcon(expanded ? 'collapse' : 'expand'));
        }
        if (label) label.textContent = expanded ? 'Minimise' : 'Expand';
    }

    function toggleExpanded(panel) {
        if (!panel) return;
        closeContextMenu();
        const searchInput = panel?.querySelector('#toolshed-campaign-history-search-input');
        const shouldRestoreSearchFocus = document.activeElement === searchInput;
        const expanded = !panel.classList.contains('is-expanded');
        setExpanded(panel, expanded, expanded ? null : () => renderHistoryResults());
        if (expanded) renderHistoryResults();
        if (shouldRestoreSearchFocus) searchInput.focus();
    }

    const { getSearchTokens, appendHighlightedText } = window.OpsToolshedSearchHighlight;

    function createHighlightedTextElement(tagName, className, value, query) {
        const element = document.createElement(tagName);
        if (className) element.className = className;
        appendHighlightedText(element, value, query);
        return element;
    }

    function getSearchableEntryText(entry) {
        return normalizeSearchText([
            ...searchableFields.map(field => entry[field]),
            'campaign client cp cl/pr/ca supplier location'
        ].join(' '));
    }

    function filterHistoryEntries(query) {
        const tokens = getSearchTokens(query);
        if (tokens.length === 0) return historyEntries;
        return historyEntries.filter(entry => {
            const searchableText = getSearchableEntryText(entry);
            return tokens.every(token => searchableText.includes(token));
        });
    }

    function formatLastVisited(timestamp) {
        if (!Number.isFinite(timestamp) || timestamp <= 0) return 'Visit time unavailable';
        try {
            return `Last visited ${new Intl.DateTimeFormat(undefined, {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }).format(new Date(timestamp))}`;
        } catch (_error) {
            return 'Last visited recently';
        }
    }

    function formatCampaignCount(count) {
        return `${count} campaign${count === 1 ? '' : 's'} visited`;
    }

    function getHistoryPageCount(totalCount) {
        return Math.max(1, Math.ceil(totalCount / COLLAPSED_HISTORY_PAGE_SIZE));
    }

    function updateHistoryPagination(panel, totalCount, hasResults) {
        const pagination = panel.querySelector('#toolshed-campaign-history-pagination');
        const previousButton = panel.querySelector('.toolshed-campaign-history-page-previous');
        const nextButton = panel.querySelector('.toolshed-campaign-history-page-next');
        const pageIndicator = panel.querySelector('#toolshed-campaign-history-page-indicator');
        if (!pagination || !previousButton || !nextButton || !pageIndicator) return;

        const shouldShow = !panel.classList.contains('is-expanded') &&
            hasResults && totalCount > COLLAPSED_HISTORY_PAGE_SIZE;
        const pageCount = getHistoryPageCount(totalCount);
        historyPageIndex = Math.min(Math.max(historyPageIndex, 0), pageCount - 1);
        const previousDisabled = !shouldShow || historyPageIndex === 0;
        const nextDisabled = !shouldShow || historyPageIndex >= pageCount - 1;

        pagination.hidden = !shouldShow;
        previousButton.disabled = previousDisabled;
        previousButton.setAttribute('aria-disabled', String(previousDisabled));
        nextButton.disabled = nextDisabled;
        nextButton.setAttribute('aria-disabled', String(nextDisabled));
        pageIndicator.textContent = shouldShow
            ? `${historyPageIndex * COLLAPSED_HISTORY_PAGE_SIZE + 1}–${Math.min(
                (historyPageIndex + 1) * COLLAPSED_HISTORY_PAGE_SIZE,
                totalCount
            )} of ${totalCount}`
            : '';
    }

    function getVisibleHistoryEntries(panel, filteredEntries) {
        if (panel.classList.contains('is-expanded')) return filteredEntries;
        const pageCount = getHistoryPageCount(filteredEntries.length);
        historyPageIndex = Math.min(Math.max(historyPageIndex, 0), pageCount - 1);
        const start = historyPageIndex * COLLAPSED_HISTORY_PAGE_SIZE;
        return filteredEntries.slice(start, start + COLLAPSED_HISTORY_PAGE_SIZE);
    }

    function animateHistoryPage(resultList, direction) {
        if (!resultList || getPanelTransitionDuration() === 0) return;
        HISTORY_PAGE_TRANSITION_CLASSES.forEach(className => resultList.classList.remove(className));
        void resultList.offsetWidth;
        resultList.classList.add(direction === 'previous'
            ? 'is-page-transitioning-previous'
            : 'is-page-transitioning-next');
    }

    function changeHistoryPage(delta) {
        if (!Number.isInteger(delta) || delta === 0 || typeof document === 'undefined') return;
        closeContextMenu();
        const panel = document.getElementById(PANEL_ID);
        const input = panel?.querySelector('#toolshed-campaign-history-search-input');
        if (!panel || panel.hidden || panel.classList.contains('is-expanded') ||
            !input || !historyLoaded || historyLoadError) return;

        const filteredEntries = filterHistoryEntries(input.value);
        const pageCount = getHistoryPageCount(filteredEntries.length);
        const currentPageIndex = Math.min(Math.max(historyPageIndex, 0), pageCount - 1);
        const nextPageIndex = Math.min(
            Math.max(currentPageIndex + delta, 0),
            pageCount - 1
        );
        if (nextPageIndex === currentPageIndex) return;

        historyPageIndex = nextPageIndex;
        renderHistoryResults({
            pageTransitionDirection: delta > 0 ? 'next' : 'previous'
        });
    }

    function appendMetadata(parent, label, value, query) {
        if (!value) return;
        const item = document.createElement('span');
        item.className = 'toolshed-campaign-history-metadata-item';
        item.appendChild(createHighlightedTextElement(
            'span',
            'toolshed-campaign-history-metadata-label',
            label,
            query
        ));
        item.appendChild(createHighlightedTextElement(
            'span',
            'toolshed-campaign-history-metadata-value',
            value,
            query
        ));
        parent.appendChild(item);
    }

    function createHistoryResult(entry, query = '') {
        const article = document.createElement('article');
        article.className = 'toolshed-campaign-history-result';
        article.setAttribute('role', 'listitem');

        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute(HISTORY_KEY_ATTRIBUTE, entry.key);
        const displayName = entry.campaignName || entry.cpNumber || entry.campaignId || 'Unnamed campaign';
        button.setAttribute('aria-label', `Open ${displayName}`);

        const copy = document.createElement('span');
        copy.className = 'toolshed-campaign-history-result-copy';
        copy.appendChild(createHighlightedTextElement(
            'strong',
            'toolshed-campaign-history-result-title',
            displayName,
            query
        ));

        const metadata = document.createElement('span');
        metadata.className = 'toolshed-campaign-history-result-metadata';
        appendMetadata(metadata, 'Client', entry.clientName, query);
        const supplierLabel = getSupplierValueParts(entry.supplier).length > 1
            ? 'Suppliers'
            : 'Supplier';
        appendMetadata(metadata, supplierLabel, entry.supplier, query);
        appendMetadata(metadata, 'Location', entry.location, query);
        appendMetadata(metadata, 'CP', entry.cpNumber || entry.campaignId, query);
        appendMetadata(metadata, 'CL/PR/CA', entry.clPrCa, query);
        copy.appendChild(metadata);

        const footer = document.createElement('span');
        footer.className = 'toolshed-campaign-history-result-footer';
        footer.appendChild(createTextElement('span', '', formatLastVisited(entry.lastVisitedAt)));
        if (entry.visitCount > 1) {
            footer.appendChild(createTextElement(
                'span',
                'toolshed-campaign-history-visits',
                `${entry.visitCount} visits`
            ));
        }
        copy.appendChild(footer);

        button.append(copy, createSvgIcon('arrow'));
        article.appendChild(button);
        return article;
    }

    function renderHistoryResults({ pageTransitionDirection = '' } = {}) {
        if (typeof document === 'undefined') return;
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;

        const status = panel.querySelector('#toolshed-campaign-history-status');
        const resultList = panel.querySelector('#toolshed-campaign-history-results');
        const count = panel.querySelector('#toolshed-campaign-history-count');
        const input = panel.querySelector('#toolshed-campaign-history-search-input');
        if (!status || !resultList || !count || !input) return;

        resultList.replaceChildren();
        HISTORY_PAGE_TRANSITION_CLASSES.forEach(className => resultList.classList.remove(className));

        if (historyLoadError) {
            count.textContent = '';
            status.textContent = 'Campaign History is temporarily unavailable. Try again after reloading Prisma.';
            updateHistoryPagination(panel, 0, false);
            return;
        }

        if (!historyLoaded) {
            count.textContent = '';
            status.textContent = 'Loading Campaign History…';
            updateHistoryPagination(panel, 0, false);
            return;
        }

        const filteredEntries = filterHistoryEntries(input.value);
        count.textContent = formatCampaignCount(filteredEntries.length);
        status.textContent = '';

        if (historyEntries.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'toolshed-campaign-history-empty';
            empty.appendChild(createTextElement('strong', '', 'No Campaign History yet'));
            empty.appendChild(createTextElement('p', '', loggingEnabled
                ? 'Visit a campaign and it will appear here for later searching.'
                : 'Campaign visit logging is turned off in Settings.'));
            resultList.appendChild(empty);
            updateHistoryPagination(panel, 0, false);
            return;
        }

        if (filteredEntries.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'toolshed-campaign-history-empty';
            empty.appendChild(createTextElement('strong', '', 'No matching campaigns'));
            empty.appendChild(createTextElement('p', '', 'Try a campaign name, client name, CP number, CL/PR/CA reference or supplier.'));
            resultList.appendChild(empty);
            updateHistoryPagination(panel, 0, false);
            return;
        }

        updateHistoryPagination(panel, filteredEntries.length, true);
        getVisibleHistoryEntries(panel, filteredEntries)
            .forEach(entry => resultList.appendChild(createHistoryResult(entry, input.value)));
        if (pageTransitionDirection) {
            animateHistoryPage(resultList, pageTransitionDirection);
        }
    }

    async function loadHistory() {
        if (historyLoaded) {
            renderHistoryResults();
            return historyEntries;
        }
        if (historyLoadPromise) return historyLoadPromise;

        historyLoadPromise = readHistoryEntries()
            .then(entries => {
                historyEntries = entries;
                historyLoaded = true;
                historyLoadError = null;
                renderHistoryResults();
                return entries;
            })
            .catch(error => {
                historyLoaded = true;
                historyLoadError = error;
                renderHistoryResults();
                return [];
            })
            .finally(() => {
                historyLoadPromise = null;
            });
        return historyLoadPromise;
    }

    function openHistoryPanel() {
        if (extensionContextInvalidated || !viewEnabled || !isPrismaPage()) return false;
        const panel = ensurePanel();
        if (!panel) return false;
        startPanelOpen(panel);
        document.documentElement.classList.add('toolshed-campaign-history-open');
        renderHistoryResults();
        loadHistory();
        panel.querySelector('#toolshed-campaign-history-search-input')?.focus();

        if (historyOutsideClickHandler) {
            document.removeEventListener('click', historyOutsideClickHandler);
            historyOutsideClickHandler = null;
        }
        const handleOutsideClick = event => {
            const currentPanel = document.getElementById(PANEL_ID);
            if (!currentPanel || currentPanel.hidden || currentPanel.classList.contains('is-closing')) return;
            if (currentPanel.contains(event.target)) return;
            if (activeContextMenu && activeContextMenu.contains(event.target)) return;
            if (event.composedPath?.().some(target =>
                target?.id === NAVIGATION_ID || target?.id === OVERFLOW_NAVIGATION_ID ||
                target?.id === RESPONSIVE_HISTORY_ITEM_ID || target?.id === OVERFLOW_MENU_ID
            )) return;
            const navLinks = findNavigationLinks();
            if (navLinks.some(link => link.contains(event.target))) return;
            closeHistoryPanel({ animate: true });
        };
        historyOutsideClickHandler = handleOutsideClick;
        window.setTimeout(() => {
            const currentPanel = document.getElementById(PANEL_ID);
            if (currentPanel && !currentPanel.hidden && historyOutsideClickHandler === handleOutsideClick) {
                document.addEventListener('click', handleOutsideClick);
            }
        }, 10);

        return true;
    }

    function closeHistoryPanel({ animate = true } = {}) {
        if (historyOutsideClickHandler) {
            document.removeEventListener('click', historyOutsideClickHandler);
            historyOutsideClickHandler = null;
        }
        closeContextMenu();
        const panel = document.getElementById(PANEL_ID);
        if (!panel || panel.hidden) return;
        if (animate) startPanelClose(panel);
        else hidePanelImmediately(panel);
        document.documentElement.classList.remove('toolshed-campaign-history-open');
    }

    function handleDocumentKeydown(event) {
        if (event.key !== 'Escape') return;
        const panel = document.getElementById(PANEL_ID);
        if (panel && !panel.hidden) closeHistoryPanel();
    }

    function handleRouteChange() {
        const currentCampaignId = getCampaignId();
        const currentVisitKey = currentCampaignId
            ? `campaign:${normalizeSearchText(currentCampaignId)}`
            : '';
        if (!currentVisitKey || currentVisitKey !== activeVisitKey) {
            activeVisitKey = '';
            activeVisitFingerprint = '';
        }
        if (!isPrismaPage()) closeHistoryPanel({ animate: false });
    }

    function handlePageShow() {
        if (extensionContextInvalidated || !settingsReady || !viewEnabled || !isPrismaPage()) return;
        ensureNavigationObserver();
        reconcileNavigationItems();
    }

    function handleVisibilityChange() {
        if (document.visibilityState === 'visible') scheduleNavigationReconciliation();
    }

    function apply() {
        if (extensionContextInvalidated) return;
        if (!settingsReady || !isPrismaPage()) {
            removeNavigationLink();
            removeNavigationObserver();
            if (!isPrismaPage()) closeHistoryPanel({ animate: false });
            return;
        }

        if (viewEnabled) {
            ensureNavigationObserver();
            reconcileNavigationItems();
        }
        else {
            removeNavigationLink();
            removeNavigationObserver();
            closeHistoryPanel({ animate: false });
        }

        if (loggingEnabled && isCampaignRoute()) {
            const snapshot = getCampaignSnapshot();
            const campaignKeyChanged = snapshot.key !== activeVisitKey;
            recordCampaignVisit(snapshot, campaignKeyChanged);
        }
    }

    function initialize() {
        if (initialized) return;
        initialized = true;

        document.addEventListener('keydown', handleDocumentKeydown);
        window.addEventListener('hashchange', handleRouteChange);
        window.addEventListener('popstate', handleRouteChange);
        window.addEventListener('resize', scheduleSettledNavigationReconciliation);
        window.addEventListener('pagehide', removeNavigationObserver);
        window.addEventListener('pageshow', handlePageShow);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        readSettings().then(settings => {
            viewEnabled = settings[VIEW_SETTING_KEY] !== false;
            loggingEnabled = settings[LOGGING_SETTING_KEY] !== false;
            settingsReady = true;
            apply();
        });

        chrome.storage?.onChanged?.addListener((changes, areaName) => {
            if (areaName !== 'sync') return;
            let shouldApply = false;

            if (changes[VIEW_SETTING_KEY]) {
                viewEnabled = changes[VIEW_SETTING_KEY].newValue !== false;
                shouldApply = true;
            }
            if (changes[LOGGING_SETTING_KEY]) {
                loggingEnabled = changes[LOGGING_SETTING_KEY].newValue !== false;
                if (loggingEnabled) {
                    activeVisitKey = '';
                    activeVisitFingerprint = '';
                }
                shouldApply = true;
            }
            if (shouldApply) apply();
        });
    }

    window.campaignHistoryFeature = {
        initialize,
        apply,
        open: openHistoryPanel,
        close: closeHistoryPanel,
        handleRouteChange,
        isCampaignRoute,
        filterHistoryEntries,
        getCampaignSnapshot,
        getCopyCampaignUrl,
        openContextMenu,
        closeContextMenu
    };
})();

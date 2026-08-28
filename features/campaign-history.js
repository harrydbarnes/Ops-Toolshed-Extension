(function() {
    'use strict';

    const VIEW_SETTING_KEY = 'campaignHistoryEnabled';
    const LOGGING_SETTING_KEY = 'campaignHistoryLoggingEnabled';
    const STORAGE_KEY = 'campaignHistoryEntries';
    const MAX_HISTORY_ENTRIES = 2000;
    const NAVIGATION_ID = 'toolshed-campaign-history-nav';
    const PANEL_ID = 'toolshed-campaign-history-panel';
    const HISTORY_KEY_ATTRIBUTE = 'data-toolshed-history-key';
    const PANEL_TRANSITION_DURATION_MS = 240;
    const DEFAULT_SETTINGS = Object.freeze({
        [VIEW_SETTING_KEY]: true,
        [LOGGING_SETTING_KEY]: true
    });

    const searchableFields = [
        'campaignName',
        'clientName',
        'campaignId',
        'cpNumber',
        'clPrCa',
        'rawClPrCa',
        'supplier'
    ];

    let initialized = false;
    let settingsReady = false;
    let viewEnabled = DEFAULT_SETTINGS[VIEW_SETTING_KEY];
    let loggingEnabled = DEFAULT_SETTINGS[LOGGING_SETTING_KEY];
    let historyLoaded = false;
    let historyLoadPromise = null;
    let historyLoadError = null;
    let historyEntries = [];
    let historyWriteQueue = Promise.resolve();
    let activeVisitKey = '';
    let activeVisitFingerprint = '';
    let panelCloseTimer = null;
    let panelCloseTarget = null;
    let panelCloseTransitionHandler = null;
    let panelGeometryCleanupTimer = null;

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
            if (!storageArea || typeof storageArea[method] !== 'function') {
                reject(new Error(`Storage method ${method} is unavailable.`));
                return;
            }

            let settled = false;
            const settle = (callback, value) => {
                if (settled) return;
                settled = true;
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

    function isPrismaPage() {
        const hostname = window.location.hostname || '';
        return hostname.includes('prisma.mediaocean.com') ||
            hostname.includes('go.demo.mediaocean.com');
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
                try {
                    if (element.contentDocument) {
                        result.push(...getElementsIncludingShadowDom(element.contentDocument, visited));
                    }
                } catch (_error) {
                    // Cross-origin frames are expected in the Mediaocean shell.
                }
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
        tables.forEach(table => {
            Array.from(table.querySelectorAll('tbody tr, tr')).forEach(row => {
                const supplierCell = row.querySelector('.hierarchical-level-group-1.hierarchical-name') ||
                    row.querySelector('.group-cell.hierarchical-level-group-1.hierarchical-name') ||
                    row.querySelector('.hierarchical-level-group-1');
                const value = normalizeWhitespace(getTextFromElement(supplierCell));
                if (!value || value.length > 220 || /^supplier$/i.test(value)) return;
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

    function getCampaignSnapshot() {
        const references = getHeaderReferences();
        const campaignId = references.campaignId;
        const url = window.location.href;
        const key = campaignId
            ? `campaign:${normalizeSearchText(campaignId)}`
            : `url:${normalizeSearchText(url)}`;

        return {
            key,
            url,
            campaignName: getCampaignName(),
            clientName: getMetadataValue(
                [/^client(?: name)?$/i, /^advertiser$/i, /(?:^|[-_ ])client(?:[-_ ]?name)?$/i],
                ['client(?: name)?', 'advertiser']
            ),
            supplier: getMetadataValue(
                [/^supplier$/i, /(?:^|[-_ ])supplier$/i],
                ['supplier']
            ) || getRenderedSupplierValue(),
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
        const key = normalizeWhitespace(entry.key) || (campaignId
            ? `campaign:${normalizeSearchText(campaignId)}`
            : url ? `url:${normalizeSearchText(url)}` : '');
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
            supplier: normalizeWhitespace(entry.supplier),
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
        return normalizeStoredEntries(result?.[STORAGE_KEY]);
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
            key: snapshot.key,
            url: snapshot.url || existing?.url || '',
            campaignName: snapshot.campaignName || existing?.campaignName || '',
            clientName: snapshot.clientName || existing?.clientName || '',
            supplier: snapshot.supplier || existing?.supplier || '',
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
        if (!loggingEnabled || !snapshot?.key) return;

        const fingerprint = getEntryFingerprint(snapshot);
        if (snapshot.key === activeVisitKey && fingerprint === activeVisitFingerprint) return;

        activeVisitKey = snapshot.key;
        activeVisitFingerprint = fingerprint;

        enqueueHistoryWrite(async () => {
            const entries = await readHistoryEntries();
            const existingIndex = entries.findIndex(entry => entry.key === snapshot.key);
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
        }

        svg.querySelectorAll('circle, path').forEach(shape => {
            shape.setAttribute('fill', 'none');
            shape.setAttribute('stroke', 'currentColor');
            shape.setAttribute('stroke-width', '1.8');
            shape.setAttribute('stroke-linecap', 'round');
            shape.setAttribute('stroke-linejoin', 'round');
        });
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

    function findTopNavigationContainer() {
        const header = document.querySelector('#ptb-header');
        if (!header) return null;

        const elements = getElementsIncludingShadowDom(header);
        const reports = elements.filter(element => hasExactLabel(element, 'Reports'));
        const containers = [];

        reports.forEach(report => {
            let current = report;
            let distance = 0;
            while (current && distance < 12) {
                if (hasDistinctDirectNavigationLabels(current)) {
                    containers.push({ element: current, distance });
                    break;
                }
                current = getParentElement(current);
                distance += 1;
            }
        });

        if (containers.length > 0) {
            containers.sort((a, b) => a.distance - b.distance);
            return containers[0].element;
        }

        const structuralCandidates = [header, ...elements]
            .filter(element => isNavigationContainer(element))
            .filter(element => containsExactLabel(element, 'Campaigns') && containsExactLabel(element, 'Reports'))
            .sort((a, b) => {
                const aSize = getElementsIncludingShadowDom(a).length;
                const bSize = getElementsIncludingShadowDom(b).length;
                return aSize - bSize;
            });

        return structuralCandidates[0] || null;
    }

    function findTopNavigationItem(container, label) {
        return getDirectChildren(container)
            .find(child => containsExactLabel(child, label)) || null;
    }

    function findNavigationLinks() {
        const normalLink = document.getElementById(NAVIGATION_ID);
        const shadowLinks = getElementsIncludingShadowDom()
            .filter(element => element.id === NAVIGATION_ID);
        return Array.from(new Set([normalLink, ...shadowLinks].filter(Boolean)));
    }

    function ensureNavigationLink() {
        const container = findTopNavigationContainer();
        if (!container) {
            removeNavigationLink();
            return null;
        }

        const existing = findNavigationLinks()
            .find(link => getParentElement(link) === container);
        if (existing) return existing;
        findNavigationLinks().forEach(link => link.remove());

        const template = findTopNavigationItem(container, 'Reports') ||
            findTopNavigationItem(container, 'Campaigns');
        const link = template?.cloneNode(false) || document.createElement('a');
        link.id = NAVIGATION_ID;
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
        content.appendChild(createSvgIcon('search'));
        content.appendChild(createTextElement('span', 'toolshed-campaign-history-nav-label', 'History'));
        link.appendChild(content);

        link.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            openHistoryPanel();
        });
        link.addEventListener('keydown', event => {
            if (event.key !== ' ') return;
            event.preventDefault();
            openHistoryPanel();
        });

        // Append after the current native options. This keeps History as the
        // furthest-right option even when a user rearranges Campaigns/Reports.
        container.appendChild(link);
        return link;
    }

    function removeNavigationLink() {
        findNavigationLinks().forEach(element => element.remove());
    }

    function createButton(className, label, iconName) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = className;
        button.setAttribute('aria-label', label);
        if (iconName) button.appendChild(createSvgIcon(iconName));
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
        headingGroup.appendChild(createTextElement('h2', '', 'Campaign history'));
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
            input.value = '';
            clearButton.hidden = true;
            renderHistoryResults();
            input.focus();
        });
        search.appendChild(clearButton);
        input.addEventListener('input', () => {
            clearButton.hidden = !input.value;
            renderHistoryResults();
        });
        input.addEventListener('keydown', event => {
            if (event.key !== 'Escape') return;
            if (input.value) {
                input.value = '';
                clearButton.hidden = true;
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
        resultList.addEventListener('click', event => {
            const resultButton = event.target.closest?.(`button[${HISTORY_KEY_ATTRIBUTE}]`);
            if (!resultButton) return;
            const key = resultButton.getAttribute(HISTORY_KEY_ATTRIBUTE);
            const entry = historyEntries.find(item => item.key === key);
            if (!entry?.url) return;
            closeHistoryPanel();
            if (entry.url !== window.location.href) window.location.href = entry.url;
        });
        panel.appendChild(resultList);

        document.body.appendChild(panel);
        return panel;
    }

    function getPanelTransitionDuration() {
        try {
            if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 0;
        } catch (_error) {
            // Fall back to the normal transition when matchMedia is unavailable.
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

    function animatePanelGeometry(panel, expanded) {
        clearPanelGeometryCleanup();
        const currentRect = panel.getBoundingClientRect();
        setInlinePanelGeometry(panel, currentRect);

        let targetRect;
        if (expanded) {
            panel.classList.add('is-expanded');
            targetRect = getExpandedPanelGeometry();
        } else {
            panel.classList.remove('is-expanded');
            clearInlinePanelGeometry(panel);
            targetRect = panel.getBoundingClientRect();
            setInlinePanelGeometry(panel, currentRect);
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
            if (!panel.hidden) clearInlinePanelGeometry(panel);
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

    function setExpanded(panel, expanded) {
        if (!panel) return;
        const expandButton = panel.querySelector('.toolshed-campaign-history-expand');
        const label = expandButton?.querySelector('.toolshed-campaign-history-button-label');
        animatePanelGeometry(panel, expanded);
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
        const searchInput = panel?.querySelector('#toolshed-campaign-history-search-input');
        const shouldRestoreSearchFocus = document.activeElement === searchInput;
        setExpanded(panel, !panel.classList.contains('is-expanded'));
        if (shouldRestoreSearchFocus) searchInput.focus();
    }

    function getSearchableEntryText(entry) {
        return normalizeSearchText([
            entry.campaignName,
            entry.clientName,
            entry.campaignId,
            entry.cpNumber,
            entry.clPrCa,
            entry.rawClPrCa,
            entry.supplier,
            'campaign client cp cl/pr/ca supplier'
        ].join(' '));
    }

    function filterHistoryEntries(query) {
        const tokens = normalizeSearchText(query).split(' ').filter(Boolean);
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

    function appendMetadata(parent, label, value) {
        if (!value) return;
        const item = document.createElement('span');
        item.className = 'toolshed-campaign-history-metadata-item';
        item.appendChild(createTextElement('span', 'toolshed-campaign-history-metadata-label', label));
        item.appendChild(createTextElement('span', 'toolshed-campaign-history-metadata-value', value));
        parent.appendChild(item);
    }

    function createHistoryResult(entry) {
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
        copy.appendChild(createTextElement('strong', 'toolshed-campaign-history-result-title', displayName));

        const metadata = document.createElement('span');
        metadata.className = 'toolshed-campaign-history-result-metadata';
        appendMetadata(metadata, 'Client', entry.clientName);
        appendMetadata(metadata, 'Supplier', entry.supplier);
        appendMetadata(metadata, 'CP', entry.cpNumber || entry.campaignId);
        appendMetadata(metadata, 'CL/PR/CA', entry.clPrCa);
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

    function renderHistoryResults() {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;

        const status = panel.querySelector('#toolshed-campaign-history-status');
        const resultList = panel.querySelector('#toolshed-campaign-history-results');
        const count = panel.querySelector('#toolshed-campaign-history-count');
        const input = panel.querySelector('#toolshed-campaign-history-search-input');
        if (!status || !resultList || !count || !input) return;

        resultList.replaceChildren();

        if (historyLoadError) {
            count.textContent = '';
            status.textContent = 'Campaign history is temporarily unavailable. Try again after reloading Prisma.';
            return;
        }

        if (!historyLoaded) {
            count.textContent = '';
            status.textContent = 'Loading campaign history…';
            return;
        }

        const filteredEntries = filterHistoryEntries(input.value);
        count.textContent = historyEntries.length === 0
            ? ''
            : `${filteredEntries.length} of ${historyEntries.length}`;
        status.textContent = '';

        if (historyEntries.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'toolshed-campaign-history-empty';
            empty.appendChild(createTextElement('strong', '', 'No campaign history yet'));
            empty.appendChild(createTextElement('p', '', loggingEnabled
                ? 'Visit a campaign and it will appear here for later searching.'
                : 'Campaign visit logging is turned off in Settings.'));
            resultList.appendChild(empty);
            return;
        }

        if (filteredEntries.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'toolshed-campaign-history-empty';
            empty.appendChild(createTextElement('strong', '', 'No matching campaigns'));
            empty.appendChild(createTextElement('p', '', 'Try a campaign name, client name, CP number, CL/PR/CA reference or supplier.'));
            resultList.appendChild(empty);
            return;
        }

        filteredEntries.forEach(entry => resultList.appendChild(createHistoryResult(entry)));
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
        if (!viewEnabled || !isPrismaPage()) return false;
        const panel = ensurePanel();
        if (!panel) return false;
        startPanelOpen(panel);
        document.documentElement.classList.add('toolshed-campaign-history-open');
        renderHistoryResults();
        loadHistory();
        panel.querySelector('#toolshed-campaign-history-search-input')?.focus();
        return true;
    }

    function closeHistoryPanel({ animate = true } = {}) {
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

    function apply() {
        if (!settingsReady || !isPrismaPage()) {
            removeNavigationLink();
            if (!isPrismaPage()) closeHistoryPanel({ animate: false });
            return;
        }

        if (viewEnabled) ensureNavigationLink();
        else {
            removeNavigationLink();
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
        getCampaignSnapshot
    };
})();

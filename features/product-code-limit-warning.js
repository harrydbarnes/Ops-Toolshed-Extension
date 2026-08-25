(function() {
    'use strict';

    const FEATURE_CLASS = 'toolshed-product-code-limit-warning';
    const PRODUCT_CAMPAIGN_CLASS = `${FEATURE_CLASS}-product-campaign`;
    const ADD_CAMPAIGN_CLASS = `${FEATURE_CLASS}-add-campaign`;
    const TOOLTIP_CLASS = `${FEATURE_CLASS}-tooltip`;
    const IGNORE_BUTTON_CLASS = `${FEATURE_CLASS}-ignore`;
    const FRAME_STYLE_ID = `${FEATURE_CLASS}-frame-styles`;
    const MAX_CAMPAIGNS = 254;
    const YELLOW_THRESHOLD = 200;
    const ORANGE_THRESHOLD = 220;
    const RED_THRESHOLD = 250;
    const USER_ENDPOINT = '/agency-service/secure/user';
    const SETTING_KEY = 'productCodeLimitWarningEnabled';
    const IGNORE_STORAGE_KEY = 'productCodeLimitWarningIgnored';
    const TOOLTIP_DISMISS_DELAY_MS = 800;
    const PINNED_TOOLTIP_DISMISS_DELAY_MS = 2000;

    const FRAME_STYLES = `
        .${ADD_CAMPAIGN_CLASS} {
            display: block;
            width: max-content;
            max-width: min(360px, calc(100% - 16px));
            box-sizing: border-box;
            margin-top: 4px;
            padding: 3px 6px;
            border: 1px solid transparent;
            border-radius: 3px;
            font: inherit;
            font-size: 12px;
            font-weight: 600;
            line-height: 1.35;
            white-space: normal;
            overflow-wrap: anywhere;
            cursor: help;
            outline-offset: 2px;
        }
        .${FEATURE_CLASS}--yellow {
            background: #fef3c7 !important;
            border-color: #fcd34d;
            color: #92400e !important;
        }
        .${FEATURE_CLASS}--orange {
            background: #ffedd5 !important;
            border-color: #fb923c;
            color: #9a3412 !important;
        }
        .${FEATURE_CLASS}--red {
            background: #fee2e2 !important;
            border-color: #f87171;
            color: #991b1b !important;
        }
        .${TOOLTIP_CLASS} {
            position: fixed;
            top: 0;
            left: 0;
            z-index: 2147483647;
            display: block;
            width: max-content;
            max-width: min(360px, calc(100vw - 16px));
            box-sizing: border-box;
            padding: 7px 9px 5px;
            border: 1px solid rgba(15, 23, 42, 0.35);
            border-radius: 4px;
            background: #172033;
            color: #fff;
            font: 13px/1.3 Arial, sans-serif;
            text-align: left;
            white-space: normal;
            overflow-wrap: anywhere;
            pointer-events: auto;
        }
        .${IGNORE_BUTTON_CLASS} {
            display: block;
            margin: 4px 0 0;
            padding: 3px 9px;
            border: 1px solid rgba(255, 255, 255, 0.45);
            border-radius: 3px;
            background: rgba(255, 255, 255, 0.12);
            color: inherit;
            font: inherit;
            font-size: 12px;
            line-height: 1.3;
            cursor: pointer;
        }
        .${IGNORE_BUTTON_CLASS}:hover,
        .${IGNORE_BUTTON_CLASS}:focus-visible {
            background: rgba(255, 255, 255, 0.24);
        }
        .${IGNORE_BUTTON_CLASS}:focus-visible {
            outline: 2px solid #fff;
            outline-offset: 1px;
        }
        .${TOOLTIP_CLASS}[hidden] {
            display: none;
        }
    `;

    let initialized = false;
    let observer = null;
    let refreshQueued = false;
    let activeRequestVersion = 0;
    let activeLastRequestKey = '';
    let activeRequestInFlight = null;
    let renderedActiveAssessment = null;
    let agencyIdPromise = null;
    let tooltipSequence = 0;
    let addRefreshVersion = 0;
    let featureEnabled = true;
    let settingReadyPromise = null;
    let ignoredProductCodes = new Set();
    let ignoredReadyPromise = null;

    const addFrameStates = new WeakMap();
    const knownAddFrameDocuments = new Set();

    function normalizeText(value) {
        return String(value ?? '').replace(/\s+/g, ' ').trim();
    }

    function getHashParams(windowRef = window) {
        return new URLSearchParams(windowRef.location.hash.replace(/^#/, ''));
    }

    function getCampaignId(windowRef = window) {
        return getHashParams(windowRef).get('campaign-id') || '';
    }

    function isAddCampaignRoute(windowRef = window) {
        return getHashParams(windowRef).get('osModalId') === 'prsm-cm-cmpadd';
    }

    function getHeaderTextElements(documentRef = document) {
        const wrapper = documentRef.querySelector('.buy-details-wrapper');
        if (!wrapper) return [];

        return [
            wrapper.querySelector('.buy-details-full'),
            wrapper.querySelector('.buy-details-collapsed')
        ].filter(Boolean);
    }

    function getHeaderText(element) {
        return normalizeText(element?.getAttribute('data-full-text') || element?.textContent);
    }

    function getHeaderProductParts(text) {
        const match = normalizeText(text).match(
            /\|\s*([^/|]+)\/([^/|]+)\/(?:\(([^)]+)\)|([^/|]+))\/([^/|]+)/i
        );
        if (!match) return null;

        const productCode = normalizeText(match[3] || match[4]);
        const campaignCode = normalizeText(match[5]);
        const rawProductCode = normalizeText(match[3] ? `(${match[3]})` : match[4]);

        return {
            mediaCode: normalizeText(match[1]),
            clientCode: normalizeText(match[2]),
            productCode,
            campaignCode,
            highlightRaw: `${rawProductCode}/${campaignCode}`,
            highlightText: `${productCode}/${campaignCode}`
        };
    }

    function getHeaderState(documentRef = document) {
        const elements = getHeaderTextElements(documentRef);
        if (!elements.length) return null;

        const fullText = getHeaderText(elements[0]);
        return {
            elements,
            text: fullText || getHeaderText(elements[1]),
            productParts: getHeaderProductParts(fullText || getHeaderText(elements[1]))
        };
    }

    function getProductCodeIgnoreKey(parts) {
        if (!parts?.mediaCode || !parts?.clientCode || !parts?.productCode) return '';
        return [parts.mediaCode, parts.clientCode, parts.productCode]
            .map(normalizeText)
            .join('|')
            .toLowerCase();
    }

    function isProductCodeIgnored(parts) {
        const key = getProductCodeIgnoreKey(parts);
        return Boolean(key && ignoredProductCodes.has(key));
    }

    function getLevel(count) {
        if (!Number.isFinite(count) || count <= YELLOW_THRESHOLD) return null;
        if (count > RED_THRESHOLD) return 'red';
        if (count > ORANGE_THRESHOLD) return 'orange';
        return 'yellow';
    }

    function getBuyDetail(campaign, headerParts) {
        const buyDetails = Array.isArray(campaign?.campaignBuyDetails)
            ? campaign.campaignBuyDetails
            : [];
        if (!buyDetails.length) return null;

        const matchesHeader = buyDetail => {
            if (!headerParts) return false;
            const mediaCode = normalizeText(buyDetail?.agencyMedia?.mediaCode);
            const clientCode = normalizeText(
                buyDetail?.client?.clientCode || buyDetail?.client?.clientShortName
            );
            const productCode = normalizeText(
                buyDetail?.product?.productCode || buyDetail?.product?.productShortName
            );
            return mediaCode.toLowerCase() === headerParts.mediaCode.toLowerCase() &&
                clientCode.toLowerCase() === headerParts.clientCode.toLowerCase() &&
                productCode.toLowerCase() === headerParts.productCode.toLowerCase();
        };

        return buyDetails.find(matchesHeader) || buyDetails.find(buyDetail =>
            buyDetail?.client && buyDetail?.product && buyDetail?.agencyMedia
        ) || null;
    }

    function getEstimateCode(estimate) {
        const directCode = [
            estimate?.estimateCode,
            estimate?.estimateShortName
        ].map(normalizeText).find(value => /^\d+$/.test(value));
        if (directCode) return Number(directCode);

        const businessKeyParts = normalizeText(estimate?.businessKey).split('|');
        const businessKeyCode = normalizeText(businessKeyParts[businessKeyParts.length - 1]);
        return /^\d+$/.test(businessKeyCode) ? Number(businessKeyCode) : null;
    }

    function getEstimateAssessment(estimates, details) {
        if (!Array.isArray(estimates)) return null;

        const numericCodes = estimates
            .map(getEstimateCode)
            .filter(code => Number.isFinite(code));
        const estimateKeys = new Set();
        estimates.forEach((estimate, index) => {
            const key = normalizeText(
                estimate?.businessKey || estimate?.estimateCode || estimate?.estimateShortName
            ) || `estimate-${index}`;
            estimateKeys.add(key);
        });

        // Prisma exposes the last campaign/estimate code in the estimate list.
        // Use it as the authoritative limit signal; retain the record-count
        // fallback for older responses that do not expose a numeric code.
        const count = numericCodes.length
            ? Math.max(...numericCodes)
            : estimateKeys.size;
        const level = getLevel(count);
        return {
            ...details,
            count,
            level
        };
    }

    async function fetchJson(url, windowRef = window) {
        const fetchImpl = windowRef.fetch;
        if (typeof fetchImpl !== 'function') throw new Error('Prisma fetch is unavailable.');

        const response = await fetchImpl(url, {
            credentials: 'include',
            headers: { Accept: 'application/json' }
        });
        if (!response || response.ok === false) {
            throw new Error(`Prisma request failed: ${response?.status || 'unknown status'}`);
        }
        return response.json();
    }

    function buildEstimateUrl(agencyId, parts) {
        const query = new URLSearchParams({
            searchString: '',
            useShortName: 'true',
            systemCode: parts.systemCode,
            mediaCode: parts.mediaCode,
            clientCode: parts.clientCode,
            productCode: parts.productCode,
            productShortName: parts.productShortName || parts.productCode
        });
        return `/agency-service/secure/estimate/v2/${encodeURIComponent(agencyId)}?${query.toString()}`;
    }

    async function loadAssessmentForParts(parts, agencyId, windowRef = window) {
        if (!Number.isFinite(Number(agencyId))) return null;

        const estimates = await fetchJson(buildEstimateUrl(agencyId, parts), windowRef);
        return getEstimateAssessment(estimates, {
            systemCode: parts.systemCode,
            clientCode: parts.clientCode,
            mediaCode: parts.mediaCode,
            productCode: parts.productCode,
            productShortName: parts.productShortName
        });
    }

    async function loadActiveAssessment(campaignId, headerParts, windowRef = window) {
        const campaign = await fetchJson(
            `/campaign-service/secure/campaign/publicforui/${encodeURIComponent(campaignId)}`,
            windowRef
        );
        const buyDetail = getBuyDetail(campaign, headerParts);
        const agencyId = Number(campaign?.agencyId);
        const parts = {
            systemCode: normalizeText(buyDetail?.agencyMedia?.systemCode),
            mediaCode: normalizeText(buyDetail?.agencyMedia?.mediaCode),
            clientCode: normalizeText(
                buyDetail?.client?.clientCode || buyDetail?.client?.clientShortName
            ),
            productCode: normalizeText(
                buyDetail?.product?.productCode || buyDetail?.product?.productShortName
            ),
            productShortName: normalizeText(
                buyDetail?.product?.productShortName || buyDetail?.product?.productCode
            )
        };

        if (!Number.isFinite(agencyId) || !parts.systemCode || !parts.mediaCode ||
            !parts.clientCode || !parts.productCode) {
            return null;
        }

        return loadAssessmentForParts(parts, agencyId, windowRef);
    }

    function positionTooltip(badge, tooltip, documentRef = badge.ownerDocument, windowRef = documentRef.defaultView || window) {
        const badgeRect = badge.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        const viewportWidth = documentRef.documentElement.clientWidth || windowRef.innerWidth || 0;
        const margin = 8;
        let left = badgeRect.left + (badgeRect.width - tooltipRect.width) / 2;

        if (viewportWidth > 0 && tooltipRect.width > 0) {
            left = Math.min(
                Math.max(margin, left),
                Math.max(margin, viewportWidth - tooltipRect.width - margin)
            );
        }

        tooltip.style.top = `${Math.round(badgeRect.bottom + 8)}px`;
        tooltip.style.left = `${Math.round(left)}px`;
    }

    function getTooltipInteractionBounds(badge, tooltip) {
        const badgeRect = badge.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        return {
            left: Math.min(badgeRect.left, tooltipRect.left),
            right: Math.max(badgeRect.right, tooltipRect.right),
            top: Math.min(badgeRect.top, tooltipRect.top),
            bottom: Math.max(badgeRect.bottom, tooltipRect.bottom)
        };
    }

    function isPointInTooltipInteractionArea(badge, tooltip, clientX, clientY) {
        if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return false;

        const bounds = getTooltipInteractionBounds(badge, tooltip);
        return clientX >= bounds.left && clientX <= bounds.right &&
            clientY >= bounds.top && clientY <= bounds.bottom;
    }

    function createTooltipController(badge, documentRef, windowRef) {
        const view = documentRef.defaultView || windowRef;
        const tooltip = documentRef.createElement('div');
        const message = documentRef.createElement('div');
        const ignoreButton = documentRef.createElement('button');
        tooltip.className = TOOLTIP_CLASS;
        tooltip.id = `${TOOLTIP_CLASS}-${++tooltipSequence}`;
        tooltip.setAttribute('role', 'tooltip');
        tooltip.hidden = true;
        message.className = `${TOOLTIP_CLASS}-message`;
        ignoreButton.className = IGNORE_BUTTON_CLASS;
        ignoreButton.type = 'button';
        ignoreButton.textContent = 'Ignore';
        ignoreButton.setAttribute('aria-label', 'Ignore this product code warning');
        tooltip.append(message, ignoreButton);
        (documentRef.body || documentRef.documentElement).appendChild(tooltip);

        let dismissTimer = null;
        let isPinned = false;
        let currentParts = null;

        const clearDismissTimer = () => {
            if (dismissTimer === null || !view) return;
            view.clearTimeout(dismissTimer);
            dismissTimer = null;
        };
        const setExpanded = expanded => {
            badge.setAttribute('aria-expanded', String(expanded));
        };
        const show = () => {
            clearDismissTimer();
            tooltip.hidden = false;
            positionTooltip(badge, tooltip, documentRef, windowRef);
            setExpanded(true);
        };
        const hide = () => {
            clearDismissTimer();
            isPinned = false;
            tooltip.hidden = true;
            setExpanded(false);
        };
        const scheduleDismiss = () => {
            clearDismissTimer();
            if (tooltip.hidden || !view) return;
            const delay = isPinned ? PINNED_TOOLTIP_DISMISS_DELAY_MS : TOOLTIP_DISMISS_DELAY_MS;
            dismissTimer = view.setTimeout(hide, delay);
        };
        const pin = event => {
            event?.preventDefault?.();
            isPinned = true;
            show();
        };
        const handleBadgeMouseLeave = event => {
            if (isPointInTooltipInteractionArea(badge, tooltip, event.clientX, event.clientY)) {
                clearDismissTimer();
            } else {
                scheduleDismiss();
            }
        };
        const handleTooltipMouseEnter = () => {
            clearDismissTimer();
        };
        const handleTooltipMouseLeave = event => {
            if (isPointInTooltipInteractionArea(badge, tooltip, event.clientX, event.clientY)) {
                clearDismissTimer();
            } else {
                scheduleDismiss();
            }
        };
        const handleBadgeBlur = () => {
            scheduleDismiss();
        };
        const handleTooltipFocusIn = () => {
            clearDismissTimer();
        };
        const handleTooltipFocusOut = () => {
            scheduleDismiss();
        };
        const handleDocumentMouseMove = event => {
            if (tooltip.hidden) return;

            if (isPointInTooltipInteractionArea(badge, tooltip, event.clientX, event.clientY)) {
                clearDismissTimer();
            } else {
                scheduleDismiss();
            }
        };
        const handleIgnore = event => {
            event.preventDefault();
            event.stopPropagation();
            ignoreProductCode(currentParts);
        };

        badge.addEventListener('mouseenter', show);
        badge.addEventListener('mouseleave', handleBadgeMouseLeave);
        badge.addEventListener('focus', show);
        badge.addEventListener('blur', handleBadgeBlur);
        badge.addEventListener('click', pin);
        tooltip.addEventListener('mouseenter', handleTooltipMouseEnter);
        tooltip.addEventListener('mouseleave', handleTooltipMouseLeave);
        tooltip.addEventListener('focusin', handleTooltipFocusIn);
        tooltip.addEventListener('focusout', handleTooltipFocusOut);
        ignoreButton.addEventListener('click', handleIgnore);
        documentRef.addEventListener('mousemove', handleDocumentMouseMove);

        // The Add Campaign warning lives in a disposable child frame. Its
        // tooltip is positioned when shown; avoiding a persistent resize
        // listener there lets Prisma/JSDOM dispose the frame cleanly.
        const handleResize = () => {
            if (!tooltip.hidden) positionTooltip(badge, tooltip, documentRef, windowRef);
        };
        if (windowRef === window) windowRef.addEventListener('resize', handleResize);

        return {
            tooltip,
            update(text, parts) {
                message.textContent = text;
                currentParts = parts;
            },
            destroy() {
                clearDismissTimer();
                badge.removeEventListener('mouseenter', show);
                badge.removeEventListener('mouseleave', handleBadgeMouseLeave);
                badge.removeEventListener('focus', show);
                badge.removeEventListener('blur', handleBadgeBlur);
                badge.removeEventListener('click', pin);
                tooltip.removeEventListener('mouseenter', handleTooltipMouseEnter);
                tooltip.removeEventListener('mouseleave', handleTooltipMouseLeave);
                tooltip.removeEventListener('focusin', handleTooltipFocusIn);
                tooltip.removeEventListener('focusout', handleTooltipFocusOut);
                ignoreButton.removeEventListener('click', handleIgnore);
                documentRef.removeEventListener('mousemove', handleDocumentMouseMove);
                if (windowRef === window) windowRef.removeEventListener('resize', handleResize);
                tooltip.remove();
            }
        };
    }

    function ensureTooltip(
        badge,
        text,
        parts,
        documentRef = badge.ownerDocument,
        windowRef = documentRef.defaultView || window
    ) {
        let controller = badge._toolshedProductCodeLimitTooltipController;
        if (!controller || !controller.tooltip.isConnected) {
            controller?.destroy?.();
            controller = createTooltipController(badge, documentRef, windowRef);
            badge._toolshedProductCodeLimitTooltipController = controller;
            badge.setAttribute('aria-expanded', 'false');
        }

        controller.update(text, parts);
        badge.setAttribute('aria-describedby', controller.tooltip.id);
        badge.setAttribute('aria-controls', controller.tooltip.id);
        badge.setAttribute('aria-label', `${badge.textContent}. ${text}`);
    }

    function removeTooltip(badge) {
        badge._toolshedProductCodeLimitTooltipController?.destroy?.();
        delete badge._toolshedProductCodeLimitTooltipController;
        badge.removeAttribute('aria-describedby');
        badge.removeAttribute('aria-controls');
        badge.removeAttribute('aria-expanded');
    }

    function restoreHeaderText(textElement) {
        const fullText = textElement?.getAttribute('data-full-text');
        if (fullText) textElement.textContent = fullText;
    }

    function removeActiveWarnings(documentRef = document) {
        documentRef.querySelectorAll(`.${PRODUCT_CAMPAIGN_CLASS}`).forEach(badge => {
            removeTooltip(badge);
            restoreHeaderText(badge.parentElement);
        });
        documentRef.querySelectorAll(`.${TOOLTIP_CLASS}`).forEach(tooltip => tooltip.remove());
    }

    function clearAddWarnings(frameDocument) {
        if (!frameDocument) return;
        frameDocument.querySelectorAll(`.${ADD_CAMPAIGN_CLASS}`).forEach(warning => {
            removeTooltip(warning);
            warning.remove();
        });
        frameDocument.querySelectorAll(`.${TOOLTIP_CLASS}`).forEach(tooltip => tooltip.remove());
    }

    function disableFeature() {
        activeRequestVersion += 1;
        activeLastRequestKey = '';
        activeRequestInFlight = null;
        renderedActiveAssessment = null;
        addRefreshVersion += 1;
        knownAddFrameDocuments.forEach(frameDocument => {
            clearAddWarnings(frameDocument);
            const state = addFrameStates.get(frameDocument);
            if (state) {
                state.lastPartsKey = '';
                state.inFlight = null;
                state.renderedWarnings = [];
            }
        });
        removeActiveWarnings();
    }

    function setFeatureEnabled(value) {
        featureEnabled = value !== false;
        if (!featureEnabled) {
            disableFeature();
            return;
        }
        if (initialized) void refresh();
    }

    function registerSettingListener() {
        if (typeof chrome === 'undefined' || !chrome.storage?.onChanged?.addListener) return;
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace !== 'sync' || !changes[SETTING_KEY]) return;
            setFeatureEnabled(changes[SETTING_KEY].newValue);
        });
    }

    function readFeatureSetting() {
        if (typeof chrome === 'undefined' || !chrome.storage?.sync?.get) {
            featureEnabled = true;
            return Promise.resolve(true);
        }

        return new Promise(resolve => {
            let settled = false;
            const finish = data => {
                if (settled) return;
                settled = true;
                featureEnabled = data?.[SETTING_KEY] !== false;
                resolve(featureEnabled);
            };

            try {
                const result = chrome.storage.sync.get(SETTING_KEY, finish);
                if (result && typeof result.then === 'function') {
                    result.then(finish).catch(() => finish({}));
                }
            } catch (error) {
                finish({});
            }
        });
    }

    function readIgnoredProductCodes() {
        if (typeof chrome === 'undefined' || !chrome.storage?.local?.get) {
            ignoredProductCodes = new Set();
            return Promise.resolve(ignoredProductCodes);
        }

        return new Promise(resolve => {
            let settled = false;
            const finish = data => {
                if (settled) return;
                settled = true;
                const stored = data?.[IGNORE_STORAGE_KEY];
                ignoredProductCodes = new Set(Array.isArray(stored) ? stored.map(normalizeText).filter(Boolean) : []);
                resolve(ignoredProductCodes);
            };

            try {
                const result = chrome.storage.local.get(IGNORE_STORAGE_KEY, finish);
                if (result && typeof result.then === 'function') {
                    result.then(finish).catch(() => finish({}));
                }
            } catch (error) {
                finish({});
            }
        });
    }

    function persistIgnoredProductCodes() {
        if (typeof chrome === 'undefined' || !chrome.storage?.local?.set) return;

        try {
            const result = chrome.storage.local.set({
                [IGNORE_STORAGE_KEY]: Array.from(ignoredProductCodes)
            }, () => {});
            if (result && typeof result.catch === 'function') result.catch(() => {});
        } catch (error) {
            // The in-memory set still prevents the warning for this page.
        }
    }

    function ignoreProductCode(parts) {
        const key = getProductCodeIgnoreKey(parts);
        if (!key) return;

        ignoredProductCodes.add(key);
        persistIgnoredProductCodes();
        removeActiveWarnings();
        knownAddFrameDocuments.forEach(frameDocument => {
            const state = addFrameStates.get(frameDocument);
            if (state) {
                state.lastPartsKey = '';
                state.renderedWarnings = [];
            }
            clearAddWarnings(frameDocument);
        });
        if (initialized) void refresh();
    }

    function resetIgnoredProductCodes() {
        ignoredProductCodes = new Set();
        removeActiveWarnings();
        knownAddFrameDocuments.forEach(frameDocument => {
            const state = addFrameStates.get(frameDocument);
            if (state) {
                state.lastPartsKey = '';
                state.renderedWarnings = [];
            }
            clearAddWarnings(frameDocument);
        });
        return initialized ? refresh() : Promise.resolve(null);
    }

    function getTooltipText(assessment) {
        const countText = assessment.count > MAX_CAMPAIGNS
            ? `${assessment.count} campaigns, above the maximum of ${MAX_CAMPAIGNS}`
            : `${assessment.count} of ${MAX_CAMPAIGNS} campaigns`;
        const urgency = assessment.count > RED_THRESHOLD
            ? 'This product code is near its limit.'
            : 'This product code is approaching its limit.';

        return `Product code ${assessment.productCode} (${assessment.mediaCode}/${assessment.clientCode}) ` +
            `has last known campaign code ${countText}. ${urgency} ` +
            'Ask your planner to submit an EasyVista form ahead of time to request a new product code.';
    }

    function highlightProductCampaign(textElement, productParts, level, tooltipText) {
        const fullText = getHeaderText(textElement);
        const highlightRaw = normalizeText(productParts?.highlightRaw);
        const highlightText = normalizeText(productParts?.highlightText);
        if (!fullText || !highlightRaw || !highlightText) return;

        const highlightIndex = fullText.lastIndexOf(highlightRaw);
        if (highlightIndex < 0) return;

        let badge = textElement.querySelector(`.${PRODUCT_CAMPAIGN_CLASS}`);
        if (!badge) {
            const before = fullText.slice(0, highlightIndex);
            const after = fullText.slice(highlightIndex + highlightRaw.length);
            textElement.textContent = '';
            if (before) textElement.appendChild(textElement.ownerDocument.createTextNode(before));
            badge = textElement.ownerDocument.createElement('span');
            textElement.appendChild(badge);
            if (after) textElement.appendChild(textElement.ownerDocument.createTextNode(after));
        }

        badge.className = `${PRODUCT_CAMPAIGN_CLASS} ${FEATURE_CLASS}--${level}`;
        badge.textContent = highlightText;
        badge.setAttribute('tabindex', '0');
        badge.setAttribute('role', 'status');
        ensureTooltip(badge, tooltipText, productParts);
    }

    function renderActiveWarning(campaignId, assessment, headerState) {
        if (!assessment?.level || !headerState) {
            removeActiveWarnings();
            return;
        }

        const tooltipText = getTooltipText(assessment);
        headerState.elements.forEach(textElement => {
            highlightProductCampaign(textElement, headerState.productParts, assessment.level, tooltipText);
        });
    }

    async function refreshActiveCampaign() {
        if (!featureEnabled) {
            removeActiveWarnings();
            return null;
        }

        const campaignId = getCampaignId();
        const headerState = campaignId ? getHeaderState() : null;
        if (!campaignId || !headerState?.text) {
            activeRequestVersion += 1;
            activeLastRequestKey = '';
            activeRequestInFlight = null;
            renderedActiveAssessment = null;
            removeActiveWarnings();
            return null;
        }

        if (isProductCodeIgnored(headerState.productParts)) {
            activeRequestVersion += 1;
            activeLastRequestKey = '';
            activeRequestInFlight = null;
            renderedActiveAssessment = null;
            removeActiveWarnings();
            return null;
        }

        const requestKey = `${campaignId}|${headerState.text}`;
        if (requestKey === activeLastRequestKey) {
            if (activeRequestInFlight) return activeRequestInFlight;
            if (renderedActiveAssessment) return renderedActiveAssessment;
        }

        activeLastRequestKey = requestKey;
        renderedActiveAssessment = null;
        removeActiveWarnings();
        const version = ++activeRequestVersion;
        activeRequestInFlight = loadActiveAssessment(campaignId, headerState.productParts)
            .then(assessment => {
                if (version !== activeRequestVersion || getCampaignId() !== campaignId) return null;
                if (isProductCodeIgnored(assessment)) {
                    renderedActiveAssessment = null;
                    removeActiveWarnings();
                    return null;
                }
                renderedActiveAssessment = assessment;
                renderActiveWarning(campaignId, assessment, getHeaderState());
                return assessment;
            })
            .catch(() => {
                if (version === activeRequestVersion) {
                    renderedActiveAssessment = null;
                    removeActiveWarnings();
                }
                return null;
            });

        const activeRequest = activeRequestInFlight;
        activeRequestInFlight = activeRequest.finally(() => {
            if (activeRequestInFlight === activeRequest) activeRequestInFlight = null;
        });
        return activeRequestInFlight;
    }

    function getAddCampaignFrame(documentRef = document) {
        return Array.from(documentRef.querySelectorAll('iframe')).find(frame => {
            const id = normalizeText(frame.id);
            const src = normalizeText(frame.getAttribute('src'));
            return id === 'os-c-34' || id.startsWith('os-c-') ||
                src.includes('/idesk/prisma-campaign-details/');
        }) || null;
    }

    function getFrameDocument(frame) {
        try {
            return frame?.contentDocument || null;
        } catch (error) {
            return null;
        }
    }

    function ensureFrameStyles(frameDocument) {
        if (!frameDocument?.head || frameDocument.getElementById(FRAME_STYLE_ID)) return;
        const style = frameDocument.createElement('style');
        style.id = FRAME_STYLE_ID;
        style.textContent = FRAME_STYLES;
        frameDocument.head.appendChild(style);
    }

    function getSelectedMediaMix(frameDocument) {
        const select = frameDocument.querySelector('[id^="debug-mediaMix-mediaType"]');
        if (!select) return null;

        const selectedOption = select.options?.[select.selectedIndex] ||
            select.querySelector('option:checked');
        const value = normalizeText(select.value || selectedOption?.value).toLowerCase();
        const label = normalizeText(selectedOption?.textContent).toLowerCase();
        return value === 'media_digital' || value === 'digital' ||
            /online|digital/.test(label);
    }

    function getFinancialField(row, prefix) {
        return row.querySelector(`[id^="${prefix}"]`);
    }

    function getCodeFromFinancialValue(value) {
        const finalPart = normalizeText(value).split('|').pop();
        if (!finalPart) return '';
        const pieces = finalPart.split('-').map(normalizeText).filter(Boolean);
        return pieces[pieces.length - 1] || finalPart;
    }

    function getProductShortName(row, productField, productCode) {
        const selectedName = productField
            ? row.querySelector('[id^="s2id_gwt-debug-bd-product"] .select2-chosen')
            : null;
        return normalizeText(selectedName?.textContent) || productCode;
    }

    function getAddCampaignParts(frameDocument) {
        if (getSelectedMediaMix(frameDocument) !== true) return [];

        const rows = Array.from(frameDocument.querySelectorAll(
            '.sectionFinancial tr.mcpe-row, #financial-section-table tr.mcpe-row'
        ));
        return rows.map(row => {
            const mediaField = getFinancialField(row, 'gwt-debug-bd-mediaType');
            const clientField = getFinancialField(row, 'gwt-debug-bd-client');
            const productField = getFinancialField(row, 'gwt-debug-bd-product');
            const estimateField = getFinancialField(row, 'gwt-debug-bd-estimate');
            const mediaParts = normalizeText(mediaField?.value).split('_');
            const clientCode = getCodeFromFinancialValue(clientField?.value);
            const productCode = getCodeFromFinancialValue(productField?.value);
            const campaignCell = estimateField?.closest('td') || row.querySelector('td:nth-child(4)') || row;
            const productShortName = getProductShortName(row, productField, productCode);

            if (!mediaParts[0] || !mediaParts[1] || !clientCode || !productCode) return null;
            return {
                row,
                campaignCell,
                systemCode: mediaParts[0],
                mediaCode: mediaParts[1],
                clientCode,
                productCode,
                productShortName
            };
        }).filter(Boolean);
    }

    function getAddPartsKey(parts) {
        return [
            parts.systemCode,
            parts.mediaCode,
            parts.clientCode,
            parts.productCode,
            parts.productShortName
        ].map(normalizeText).join('|').toLowerCase();
    }

    function getAddFrameState(frameDocument) {
        let state = addFrameStates.get(frameDocument);
        if (!state) {
            state = {
                observer: null,
                lastPartsKey: '',
                inFlight: null,
                renderedWarnings: []
            };
            addFrameStates.set(frameDocument, state);
            knownAddFrameDocuments.add(frameDocument);
        }
        return state;
    }

    function isFeatureOwnedNode(node) {
        return node?.nodeType === 1 && (
            node.matches?.(`.${ADD_CAMPAIGN_CLASS}, .${TOOLTIP_CLASS}`) ||
            node.closest?.(`.${ADD_CAMPAIGN_CLASS}, .${TOOLTIP_CLASS}`)
        );
    }

    function isRelevantFrameMutation(mutation) {
        if (mutation.type === 'attributes') {
            if (mutation.target?.closest?.(`.${ADD_CAMPAIGN_CLASS}, .${TOOLTIP_CLASS}`)) return false;
            return mutation.target?.matches?.('[id^="debug-mediaMix-mediaType"], [id^="gwt-debug-bd-"]') ||
                mutation.target?.closest?.('.sectionFinancial, #financial-section-table');
        }
        if (mutation.type !== 'childList') return false;
        if (mutation.target?.closest?.('.sectionFinancial, #financial-section-table')) {
            const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes];
            return changedNodes.length === 0 || changedNodes.some(node => !isFeatureOwnedNode(node));
        }
        return false;
    }

    function bindAddFrame(frame, frameDocument) {
        const state = getAddFrameState(frameDocument);
        if (state.observer) return state;

        state.observer = new frameDocument.defaultView.MutationObserver(mutations => {
            if (mutations.some(isRelevantFrameMutation)) scheduleRefresh();
        });
        if (frameDocument.body) {
            state.observer.observe(frameDocument.body, {
                attributes: true,
                attributeFilter: ['class', 'disabled', 'value'],
                childList: true,
                subtree: true
            });
        }
        frameDocument.addEventListener('change', scheduleRefresh);
        frameDocument.addEventListener('input', scheduleRefresh);
        frame.addEventListener('load', scheduleRefresh);
        return state;
    }

    function getAgencyId(windowRef = window) {
        if (!agencyIdPromise) {
            agencyIdPromise = fetchJson(USER_ENDPOINT, windowRef)
                .then(user => Number(user?.agencyLocation?.agencyId || user?.agencyId))
                .then(agencyId => Number.isFinite(agencyId) ? agencyId : null)
                .catch(() => null);
        }
        return agencyIdPromise;
    }

    function getCachedAddAssessment(parts, agencyId, windowRef = window) {
        const key = `${agencyId}|${getAddPartsKey(parts)}`;
        if (!addAssessmentCache.has(key)) {
            addAssessmentCache.set(key, loadAssessmentForParts(parts, agencyId, windowRef));
        }
        return addAssessmentCache.get(key);
    }

    const addAssessmentCache = new Map();

    function hasRenderedAddWarnings(frameDocument, state, partsKey) {
        if (state.lastPartsKey !== partsKey || !state.renderedWarnings.length) return false;
        return state.renderedWarnings.every(({ text, warning }) =>
            warning.isConnected && warning.textContent === text && warning.ownerDocument === frameDocument
        );
    }

    function renderAddWarnings(frameDocument, state, partsAndAssessments) {
        clearAddWarnings(frameDocument);
        state.renderedWarnings = [];

        partsAndAssessments.forEach(({ parts, assessment }) => {
            if (!assessment?.level || !parts.campaignCell) return;
            const warning = frameDocument.createElement('span');
            const warningText = getTooltipText(assessment);
            warning.className = `${ADD_CAMPAIGN_CLASS} ${FEATURE_CLASS}--${assessment.level}`;
            warning.textContent = warningText;
            warning.setAttribute('tabindex', '0');
            warning.setAttribute('role', 'status');
            warning.setAttribute('data-product-code-limit-key', getAddPartsKey(parts));
            parts.campaignCell.appendChild(warning);
            ensureTooltip(
                warning,
                warningText,
                parts,
                frameDocument,
                frameDocument.defaultView || window
            );
            state.renderedWarnings.push({ text: warningText, warning });
        });
    }

    async function refreshAddCampaign() {
        if (!featureEnabled) {
            knownAddFrameDocuments.forEach(clearAddWarnings);
            return null;
        }

        if (!isAddCampaignRoute()) {
            addRefreshVersion += 1;
            knownAddFrameDocuments.forEach(clearAddWarnings);
            return null;
        }

        const frame = getAddCampaignFrame();
        const frameDocument = getFrameDocument(frame);
        if (!frameDocument) return null;

        ensureFrameStyles(frameDocument);
        const state = bindAddFrame(frame, frameDocument);
        const parts = getAddCampaignParts(frameDocument)
            .filter(part => !isProductCodeIgnored(part));
        const partsKey = parts.map(getAddPartsKey).join('||');

        if (!parts.length) {
            clearAddWarnings(frameDocument);
            state.lastPartsKey = '';
            state.renderedWarnings = [];
            return null;
        }

        if (hasRenderedAddWarnings(frameDocument, state, partsKey)) {
            return state.renderedWarnings;
        }
        if (state.lastPartsKey === partsKey && state.inFlight) return state.inFlight;

        state.lastPartsKey = partsKey;
        state.renderedWarnings = [];
        clearAddWarnings(frameDocument);
        const version = ++addRefreshVersion;
        state.inFlight = getAgencyId()
            .then(agencyId => Promise.all(parts.map(part =>
                getCachedAddAssessment(part, agencyId)
                    .then(assessment => ({ parts: part, assessment }))
            )))
            .then(partsAndAssessments => {
                if (version !== addRefreshVersion || getFrameDocument(frame) !== frameDocument) {
                    return null;
                }
                renderAddWarnings(frameDocument, state, partsAndAssessments);
                return state.renderedWarnings;
            })
            .catch(() => {
                if (version === addRefreshVersion) {
                    clearAddWarnings(frameDocument);
                    state.renderedWarnings = [];
                }
                return null;
            });

        const addRequest = state.inFlight;
        state.inFlight = addRequest.finally(() => {
            if (state.inFlight === addRequest) state.inFlight = null;
        });
        return state.inFlight;
    }

    async function refresh() {
        const results = await Promise.all([
            refreshActiveCampaign(),
            refreshAddCampaign()
        ]);
        return results[0] || results[1] || null;
    }

    function isRelevantMutation(mutation) {
        if (mutation.type !== 'childList') return false;
        if (mutation.target?.closest?.('.buy-details-wrapper, .mo-page-header')) return true;

        return Array.from(mutation.addedNodes || []).some(node =>
            node.nodeType === Node.ELEMENT_NODE && (
                node.matches?.('.buy-details-wrapper, .mo-page-header, iframe') ||
                node.querySelector?.('.buy-details-wrapper, .mo-page-header, iframe')
            )
        );
    }

    function scheduleRefresh() {
        if (refreshQueued) return;
        refreshQueued = true;
        window.setTimeout(() => {
            refreshQueued = false;
            refresh();
        }, 0);
    }

    function initialize() {
        if (initialized) return settingReadyPromise?.then?.(() => refresh()) || refresh();
        initialized = true;

        observer = new MutationObserver(mutations => {
            if (mutations.some(isRelevantMutation)) scheduleRefresh();
        });
        if (document.body) observer.observe(document.body, { childList: true, subtree: true });

        window.addEventListener('hashchange', scheduleRefresh);
        window.addEventListener('popstate', scheduleRefresh);
        registerSettingListener();
        settingReadyPromise = Promise.all([
            readFeatureSetting(),
            readIgnoredProductCodes()
        ]);
        return settingReadyPromise.then(() => refresh());
    }

    window.productCodeLimitWarningFeature = {
        initialize,
        refresh,
        resetIgnoredProductCodes
    };
})();

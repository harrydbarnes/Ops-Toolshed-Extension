(function() {
    'use strict';

    const SOURCE = 'ops-toolshed-actualise-month-bridge';
    const EVENT_TYPE = 'ops-toolshed-actualise-month-data';
    const REQUEST_TYPE = 'ops-toolshed-actualise-month-request-latest';
    const INSTALL_FLAG = '__opsToolshedActualiseMonthBridgeInstalled';
    const ACTUALISE_ENDPOINT_PATTERN =
        /\/campaign-service\/secure\/campaign\/[^/]+\/queryservice\/mediaplan\/hybrid\/actualize(?:$|[?])/i;
    const ISO_MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])(?:-\d{2})?$/;
    const MONTH_NAMES = Object.freeze({
        jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
        jul: '07', aug: '08', sep: '09', sept: '09', oct: '10', nov: '11', dec: '12'
    });
    const MONTH_LABEL_PATTERN = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{2}|\d{4})$/i;

    if (window[INSTALL_FLAG]) return;
    window[INSTALL_FLAG] = true;
    let latestEvidence = null;

    function normalizeMonth(value) {
        const text = String(value ?? '').trim();
        const isoMatch = text.match(ISO_MONTH_PATTERN);
        if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}`;

        const labelMatch = text.match(MONTH_LABEL_PATTERN);
        if (!labelMatch) return null;
        const month = MONTH_NAMES[labelMatch[1].toLowerCase()];
        const year = labelMatch[2].length === 2 ? `20${labelMatch[2]}` : labelMatch[2];
        return month ? `${year}-${month}` : null;
    }

    function getCampaignId() {
        try {
            return new URLSearchParams(window.location.hash.replace(/^#/, '')).get('campaign-id') || '';
        } catch (error) {
            return '';
        }
    }

    function parseRequestBody(body) {
        if (!body) return null;
        if (typeof body === 'string') {
            try {
                return JSON.parse(body);
            } catch (error) {
                return null;
            }
        }
        return typeof body === 'object' ? body : null;
    }

    function getRequestMonth(body) {
        const payload = parseRequestBody(body);
        const findMonthField = value => {
            if (!value || typeof value !== 'object') return null;
            if (Array.isArray(value)) {
                for (const item of value) {
                    const match = findMonthField(item);
                    if (match) return match;
                }
                return null;
            }
            if (value.id === 'month' && (value.value || value.displayValue)) return value;
            for (const child of Object.values(value)) {
                const match = findMonthField(child);
                if (match) return match;
            }
            return null;
        };

        const monthField = findMonthField(payload);
        return normalizeMonth(monthField?.value || monthField?.displayValue);
    }

    function getResponseMonthValues(payload) {
        const values = [];
        const addValue = value => {
            const month = normalizeMonth(value);
            if (month && !values.includes(month)) values.push(month);
        };

        const visitNode = node => {
            if (!node || typeof node !== 'object') return;
            (node.fields || []).forEach(field => {
                if (field?.id === 'month') addValue(field.value);
            });
            (node.nodes || []).forEach(visitNode);
        };

        (payload?.nodes || []).forEach(visitNode);

        // Empty result sets still carry the requested month in the field
        // metadata. Use it only when no row-level value is available.
        if (values.length === 0) {
            (payload?.fields || [])
                .filter(field => field?.id === 'month')
                .forEach(field => addValue(field.key));
        }

        return values;
    }

    function publishEvidence(requestMonth, responseText) {
        let payload;
        try {
            payload = JSON.parse(responseText);
        } catch (error) {
            return;
        }

        const responseMonths = getResponseMonthValues(payload);
        latestEvidence = {
            campaignId: getCampaignId(),
            requestMonth,
            responseMonths,
            rowCount: Number.isFinite(Number(payload?.total)) ? Number(payload.total) : null
        };
        window.postMessage({
            source: SOURCE,
            type: EVENT_TYPE,
            detail: latestEvidence
        }, window.location.origin);
    }

    window.addEventListener('message', event => {
        if (event.source !== window || event.origin !== window.location.origin ||
            event.data?.source !== SOURCE || event.data.type !== REQUEST_TYPE || !latestEvidence) return;
        window.postMessage({
            source: SOURCE,
            type: EVENT_TYPE,
            detail: latestEvidence
        }, window.location.origin);
    });

    function isActualiseRequest(url) {
        return ACTUALISE_ENDPOINT_PATTERN.test(String(url || ''));
    }

    function getXhrResponseText(xhr) {
        try {
            if (xhr.responseType === 'json') return JSON.stringify(xhr.response);
            return xhr.responseText || '';
        } catch (error) {
            return '';
        }
    }

    const XHR = window.XMLHttpRequest;
    if (XHR?.prototype) {
        const originalOpen = XHR.prototype.open;
        const originalSend = XHR.prototype.send;
        const xhrStates = new WeakMap();

        XHR.prototype.open = function(method, url, ...rest) {
            xhrStates.set(this, { method, url });
            return originalOpen.call(this, method, url, ...rest);
        };

        XHR.prototype.send = function(body) {
            const state = xhrStates.get(this);
            if (state && isActualiseRequest(state.url)) {
                const requestMonth = getRequestMonth(body);
                if (!requestMonth) return originalSend.call(this, body);
                this.addEventListener('load', () => {
                    if (this.status >= 200 && this.status < 300) {
                        publishEvidence(requestMonth, getXhrResponseText(this));
                    }
                }, { once: true });
            }
            return originalSend.call(this, body);
        };
    }

    const originalFetch = window.fetch;
    if (typeof originalFetch === 'function') {
        window.fetch = function(input, init) {
            const url = typeof input === 'string' ? input : input?.url;
            if (!isActualiseRequest(url)) return originalFetch.apply(this, arguments);

            const requestMonth = getRequestMonth(init?.body);
            const responsePromise = originalFetch.apply(this, arguments);
            if (!requestMonth) return responsePromise;
            return Promise.resolve(responsePromise).then(response => {
                const responseClone = response?.clone?.();
                if (responseClone?.text) {
                    Promise.resolve(responseClone.text())
                        .then(responseText => publishEvidence(requestMonth, responseText))
                        .catch(() => {});
                }
                return response;
            });
        };
    }
})();

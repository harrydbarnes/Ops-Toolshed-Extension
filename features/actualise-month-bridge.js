(function() {
    'use strict';

    const SOURCE = 'ops-toolshed-actualise-month-bridge';
    const EVENT_TYPE = 'ops-toolshed-actualise-month-data';
    const REQUEST_TYPE = 'ops-toolshed-actualise-month-request-latest';
    const EXPORT_CAPTURE_START = 'ops-toolshed-actualise-export-capture-start';
    const EXPORT_CAPTURE_STOP = 'ops-toolshed-actualise-export-capture-stop';
    const EXPORT_CAPTURED = 'ops-toolshed-actualise-export-captured';
    const ACTUALIZATION_CSV_NAME_PATTERN =
        /^Actualization-.+-\d{4}-(0[1-9]|1[0-2])(?: \(\d+\))?\.csv$/i;
    const INSTALL_FLAG = '__opsToolshedActualiseMonthBridgeInstalled';
    const MASTER_EVENT = 'ops-toolshed:master-feature-state';
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
    let featureModeActive = document.documentElement?.getAttribute('data-ops-toolshed-features-active') === 'true';
    let xhrPatch = null;
    let fetchPatch = null;
    let exportCaptureToken = null;
    const trackedBlobUrls = new Map();
    let exportCapturePatch = null;

    document.addEventListener(MASTER_EVENT, event => {
        featureModeActive = event.detail === true;
        updateInterceptors();
    });

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

    function isActualiseRoute() {
        try {
            const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
            return params.get('ptb-ctx') === 'actualize' || params.get('route') === 'actualize';
        } catch (error) {
            return false;
        }
    }

    function isBridgeActive() {
        return featureModeActive && isActualiseRoute();
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

    function getBuyStatusRows(payload) {
        const rows = [];
        const visitNodes = nodes => {
            for (const node of nodes || []) {
                const fields = Object.fromEntries((node.fields || []).map(field => [field.id, field.value]));
                if (fields.placementNumber && fields.buyStatus) {
                    rows.push({
                        placementNumber: String(fields.placementNumber),
                        buyStatus: String(fields.buyStatus)
                    });
                }
                if (Array.isArray(node.nodes)) visitNodes(node.nodes);
            }
        };

        visitNodes(payload?.nodes);
        return rows;
    }

    function publishEvidence(requestMonth, responseText) {
        if (!isBridgeActive()) return;

        let payload;
        try {
            payload = JSON.parse(responseText);
        } catch (error) {
            return;
        }

        const responseMonths = getResponseMonthValues(payload);
        latestEvidence = {
            observedAt: Date.now(),
            campaignId: getCampaignId(),
            requestMonth,
            responseMonths,
            rowCount: Number.isFinite(Number(payload?.total)) ? Number(payload.total) : null,
            buyStatusRows: getBuyStatusRows(payload)
        };
        window.postMessage({
            source: SOURCE,
            type: EVENT_TYPE,
            detail: latestEvidence
        }, window.location.origin);
    }

    function readBlobText(blob) {
        if (typeof blob?.text === 'function') return blob.text();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(reader.error || new Error('Failed to read exported CSV blob.'));
            reader.readAsText(blob);
        });
    }

    function readDataUrlText(href) {
        const commaIndex = href.indexOf(',');
        if (commaIndex === -1) return '';
        const meta = href.slice(0, commaIndex);
        const payload = href.slice(commaIndex + 1);
        if (/;base64/i.test(meta)) {
            const binary = window.atob(payload);
            const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
            return new TextDecoder('utf-8').decode(bytes);
        }
        return decodeURIComponent(payload);
    }

    function isCapturedCsvAnchor(anchor, href, downloadName, trackedBlob) {
        if (ACTUALIZATION_CSV_NAME_PATTERN.test(downloadName)) return true;
        if (trackedBlob && (/\.csv$/i.test(downloadName) || /csv/i.test(trackedBlob.type || ''))) {
            return true;
        }
        if (/^data:text\/csv/i.test(href)) return true;
        return false;
    }

    function installExportCapture() {
        if (exportCapturePatch || !isBridgeActive() || !exportCaptureToken) return;
        const anchorProto = window.HTMLAnchorElement?.prototype;
        if (!anchorProto || typeof anchorProto.click !== 'function') return;

        const originalCreateObjectURL = typeof window.URL?.createObjectURL === 'function'
            ? window.URL.createObjectURL
            : null;
        const wrappedCreateObjectURL = originalCreateObjectURL
            ? function(object) {
                const url = originalCreateObjectURL.apply(this, arguments);
                if (typeof url === 'string' && object instanceof window.Blob) {
                    trackedBlobUrls.set(url, object);
                }
                return url;
            }
            : null;

        if (wrappedCreateObjectURL) {
            window.URL.createObjectURL = wrappedCreateObjectURL;
        }

        const originalClick = anchorProto.click;
        const wrappedClick = function() {
            const token = exportCaptureToken;
            if (!token || !isBridgeActive()) {
                return originalClick.apply(this, arguments);
            }

            const downloadName = String(this.getAttribute?.('download') || this.download || '').trim();
            const href = String(this.getAttribute?.('href') || this.href || '').trim();
            const trackedBlob = trackedBlobUrls.get(href) || null;
            if (!isCapturedCsvAnchor(this, href, downloadName, trackedBlob)) {
                return originalClick.apply(this, arguments);
            }

            const name = downloadName || 'Actualization.csv';
            let textPromise;
            if (trackedBlob) {
                textPromise = readBlobText(trackedBlob);
            } else if (/^data:/i.test(href)) {
                textPromise = Promise.resolve().then(() => readDataUrlText(href));
            } else {
                const resolvedUrl = new URL(href, window.location.href);
                if (resolvedUrl.origin !== window.location.origin) {
                    return originalClick.apply(this, arguments);
                }
                textPromise = window.fetch(resolvedUrl.href, { credentials: 'include' })
                    .then(response => {
                        if (!response.ok) throw new Error(`HTTP ${response.status}`);
                        return response.text();
                    });
            }

            Promise.resolve(textPromise)
                .then(text => {
                    window.postMessage({
                        source: SOURCE,
                        type: EXPORT_CAPTURED,
                        detail: {
                            token,
                            name,
                            text,
                            size: trackedBlob ? trackedBlob.size : text.length
                        }
                    }, window.location.origin);
                })
                .catch(() => {});
            return undefined;
        };

        anchorProto.click = wrappedClick;
        exportCapturePatch = {
            anchorProto,
            originalClick,
            wrappedClick,
            originalCreateObjectURL,
            wrappedCreateObjectURL
        };
    }

    function removeExportCapture() {
        exportCaptureToken = null;
        trackedBlobUrls.clear();
        if (!exportCapturePatch) return;
        const {
            anchorProto,
            originalClick,
            wrappedClick,
            originalCreateObjectURL,
            wrappedCreateObjectURL
        } = exportCapturePatch;
        if (anchorProto.click === wrappedClick) {
            anchorProto.click = originalClick;
        }
        if (wrappedCreateObjectURL && window.URL?.createObjectURL === wrappedCreateObjectURL) {
            window.URL.createObjectURL = originalCreateObjectURL;
        }
        exportCapturePatch = null;
    }

    window.addEventListener('message', event => {
        if (event.source !== window || event.origin !== window.location.origin ||
            event.data?.source !== SOURCE) return;

        if (event.data.type === EXPORT_CAPTURE_START) {
            const token = String(event.data?.detail?.token || '');
            if (!token || !isBridgeActive()) return;
            exportCaptureToken = token;
            installExportCapture();
            return;
        }

        if (event.data.type === EXPORT_CAPTURE_STOP) {
            const token = String(event.data?.detail?.token || '');
            if (!token || token === exportCaptureToken) {
                removeExportCapture();
            }
            return;
        }

        if (event.data.type !== REQUEST_TYPE || !isBridgeActive() || !latestEvidence) return;
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

    function installXhrBridge() {
        const XHR = window.XMLHttpRequest;
        if (!XHR?.prototype) return;
        const prototype = XHR.prototype;
        if (xhrPatch?.prototype === prototype) return;
        removeXhrBridge();

        const originalOpen = prototype.open;
        const originalSend = prototype.send;
        const xhrStates = new WeakMap();
        const wrappedOpen = function(method, url, ...rest) {
            if (isBridgeActive() && isActualiseRequest(url)) {
                xhrStates.set(this, { method, url });
            } else {
                xhrStates.delete(this);
            }
            return originalOpen.call(this, method, url, ...rest);
        };

        const wrappedSend = function(body) {
            const state = xhrStates.get(this);
            if (isBridgeActive() && state && isActualiseRequest(state.url)) {
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

        prototype.open = wrappedOpen;
        prototype.send = wrappedSend;
        xhrPatch = { prototype, originalOpen, originalSend, wrappedOpen, wrappedSend };
    }

    function removeXhrBridge() {
        if (!xhrPatch) return;
        if (xhrPatch.prototype.open === xhrPatch.wrappedOpen) {
            xhrPatch.prototype.open = xhrPatch.originalOpen;
        }
        if (xhrPatch.prototype.send === xhrPatch.wrappedSend) {
            xhrPatch.prototype.send = xhrPatch.originalSend;
        }
        xhrPatch = null;
    }

    function handleUnhandledRejection(event) {
        if (event.reason instanceof TypeError && event.reason.message === 'Failed to fetch') {
            const stack = String(event.reason?.stack || '');
            if (stack.includes('actualise-month-bridge.js')) {
                event.preventDefault();
            }
        }
    }

    function installFetchBridge() {
        if (typeof window.fetch !== 'function') return;
        if (fetchPatch?.wrappedFetch === window.fetch) return;
        removeFetchBridge();

        const originalFetch = window.fetch;
        const wrappedFetch = function(input, init) {
            const url = typeof input === 'string'
                ? input
                : (input instanceof URL ? input.href : input?.url);
            if (!isBridgeActive() || !isActualiseRequest(url)) {
                const responsePromise = originalFetch.apply(this, arguments);
                if (responsePromise && typeof responsePromise.catch === 'function') {
                    responsePromise.catch(() => {});
                }
                return responsePromise;
            }

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

        window.fetch = wrappedFetch;
        window.addEventListener('unhandledrejection', handleUnhandledRejection);
        fetchPatch = { originalFetch, wrappedFetch };
    }

    function removeFetchBridge() {
        if (!fetchPatch) return;
        window.removeEventListener('unhandledrejection', handleUnhandledRejection);
        if (window.fetch === fetchPatch.wrappedFetch) window.fetch = fetchPatch.originalFetch;
        fetchPatch = null;
    }

    function updateInterceptors() {
        if (isBridgeActive()) {
            installXhrBridge();
            installFetchBridge();
            return;
        }

        latestEvidence = null;
        removeExportCapture();
        removeXhrBridge();
        removeFetchBridge();
    }

    window.addEventListener('hashchange', updateInterceptors);
    window.addEventListener('popstate', updateInterceptors);
    window.navigation?.addEventListener?.('currententrychange', updateInterceptors);
    updateInterceptors();
})();

(function() {
    'use strict';

    const NAME_CELL_SELECTOR = '#grid-container_hot .ht_clone_left td[id^="placementName-"]';
    const PLACEMENT_CELL_SELECTOR = '#grid-container_hot .ht_clone_left td[id^="placementNumber-"]';
    const STATUS_CELL_SELECTOR = '#grid-container_hot .ht_master .htCore td[id^="buyStatus-"]';
    const INDICATOR_CLASS = 'toolshed-actualise-buy-status-indicator';
    const INDICATOR_SELECTOR = `.${INDICATOR_CLASS}`;
    const INDICATOR_ICON_CLASS = 'toolshed-actualise-buy-status-icon';
    const PRIVATE_USE_GLYPH_PATTERN = /[\uE000-\uF8FF]/g;
    const BRIDGE_SOURCE = 'ops-toolshed-actualise-month-bridge';
    const BRIDGE_EVENT_TYPE = 'ops-toolshed-actualise-month-data';
    const BRIDGE_REQUEST_TYPE = 'ops-toolshed-actualise-month-request-latest';

    const STATUS_PRESENTATIONS = Object.freeze({
        SUCCESSFUL: { label: 'Successful', icon: 'fa-check-circle', className: 'successful', color: '--mo-success-dark-color' },
        SUCCESS: { label: 'Successful', icon: 'fa-check-circle', className: 'successful', color: '--mo-success-dark-color' },
        PENDING: { label: 'Pending', icon: 'fa-clock-o', className: 'pending', color: '--mo-alert-color' },
        PROCESSING: { label: 'Pending', icon: 'fa-clock-o', className: 'pending', color: '--mo-alert-color' },
        IN_PROGRESS: { label: 'Pending', icon: 'fa-clock-o', className: 'pending', color: '--mo-alert-color' },
        FAILED: { label: 'Failed', icon: 'fa-times-circle', className: 'failed', color: '--mo-error-dark-color' },
        ERROR: { label: 'Error', icon: 'fa-times-circle', className: 'failed', color: '--mo-error-dark-color' },
        UNSUCCESSFUL: { label: 'Failed', icon: 'fa-times-circle', className: 'failed', color: '--mo-error-dark-color' }
    });

    let initialized = false;
    let contextKey = '';
    let statusesByPlacementNumber = new Map();
    const statusSnapshotsByRow = new Map();

    function getRouteParams() {
        return new URLSearchParams(window.location.hash.replace(/^#/, ''));
    }

    function isActualiseRoute() {
        const params = getRouteParams();
        return params.get('ptb-ctx') === 'actualize' || params.get('route') === 'actualize';
    }

    function getRowKey(cell, prefix) {
        return cell.id.startsWith(prefix) ? cell.id.slice(prefix.length) : '';
    }

    function getStatusLabel(statusCell) {
        return String(statusCell?.textContent || '')
            .replace(PRIVATE_USE_GLYPH_PATTERN, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function getContextKey() {
        const params = getRouteParams();
        return [params.get('campaign-id') || '', params.get('mos') || '', params.get('ptb-ctx') || params.get('route') || ''].join('|');
    }

    function requestLatestStatusRows() {
        if (!isActualiseRoute()) return;
        window.postMessage({ source: BRIDGE_SOURCE, type: BRIDGE_REQUEST_TYPE }, window.location.origin);
    }

    function resetStatusContext() {
        const nextContextKey = getContextKey();
        if (nextContextKey === contextKey) return;
        contextKey = nextContextKey;
        statusSnapshotsByRow.clear();
        statusesByPlacementNumber = new Map();
        requestLatestStatusRows();
    }

    function cloneNativeIcon(sourceIcon) {
        const icon = sourceIcon.cloneNode(true);
        const color = window.getComputedStyle(sourceIcon).color;
        if (color) icon.style.color = color;
        return icon;
    }

    function captureStatusCells(statusCells) {
        statusCells.forEach((statusCell, rowKey) => {
            const sourceIcon = statusCell.querySelector('i.buy-status, img, svg');
            statusSnapshotsByRow.set(rowKey, {
                icon: sourceIcon ? cloneNativeIcon(sourceIcon) : null,
                label: getStatusLabel(statusCell)
            });
        });
    }

    function getStatusSnapshot(statusValue) {
        const normalizedStatus = String(statusValue || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
        const presentation = STATUS_PRESENTATIONS[normalizedStatus];
        if (!presentation) return null;

        const icon = document.createElement('i');
        icon.className = `buy-status fa ${presentation.icon} ${presentation.className}`;
        icon.style.color = `var(${presentation.color})`;
        return { icon, label: presentation.label };
    }

    function handleNativeStatusRows(event) {
        if (event.source !== window || event.origin !== window.location.origin) return;
        const message = event.data;
        if (message?.source !== BRIDGE_SOURCE || message.type !== BRIDGE_EVENT_TYPE) return;

        const detail = message.detail;
        const params = getRouteParams();
        const expectedMonth = (params.get('mos') || '').slice(0, 7);
        if (!isActualiseRoute() || !detail ||
            detail.campaignId !== (params.get('campaign-id') || '') ||
            detail.requestMonth !== expectedMonth ||
            !Array.isArray(detail.buyStatusRows)) return;

        statusesByPlacementNumber = new Map();
        detail.buyStatusRows.forEach(row => {
            const placementNumber = String(row?.placementNumber || '').trim();
            if (!placementNumber || placementNumber.length > 64) return;
            statusesByPlacementNumber.set(placementNumber, getStatusSnapshot(row?.buyStatus));
        });
        // Forward only observed pending rows. A previous successful status is
        // never evidence that a newly submitted finance update has finished.
        const pendingRows = detail.buyStatusRows.filter(row =>
            ['PENDING', 'PROCESSING', 'IN_PROGRESS'].includes(String(row?.buyStatus || '').trim().toUpperCase())
        ).map(row => ({ placementNumber: row.placementNumber }));
        if (pendingRows.length && window.chrome?.runtime?.sendMessage) {
            try {
                const sent = chrome.runtime.sendMessage({ action: 'financeTimingObserve', campaignId: detail.campaignId,
                    month: expectedMonth, observedAt: detail.observedAt, rows: pendingRows });
                sent?.catch?.(() => {});
            } catch (_) { /* Extension may be reloading. */ }
        }
        statusSnapshotsByRow.clear();
        apply();
    }

    function getPlacementNumber(nameCell, rowKey) {
        const rowCell = nameCell.closest('tr')?.querySelector(`[id="placementNumber-${rowKey}"]`);
        const placementCell = rowCell || document.querySelector(`${PLACEMENT_CELL_SELECTOR}[id="placementNumber-${rowKey}"]`);
        return String(placementCell?.textContent || '').trim();
    }

    function removeIndicator(indicator) {
        indicator.remove();
    }

    function removeIndicators(root = document) {
        root.querySelectorAll(INDICATOR_SELECTOR).forEach(removeIndicator);
    }

    function updateIndicator(indicator, sourceIcon, statusLabel) {
        const iconSignature = [
            sourceIcon.tagName,
            sourceIcon.getAttribute('class') || '',
            sourceIcon.getAttribute('src') || '',
            sourceIcon.getAttribute('style') || '',
            sourceIcon.innerHTML || ''
        ].join('\u001f');

        indicator.setAttribute('role', 'img');
        indicator.setAttribute('aria-label', statusLabel ? `Buy status: ${statusLabel}` : 'Buy status');
        indicator.dataset.iconSignature = iconSignature;
        indicator.dataset.status = statusLabel;

        if (indicator.firstElementChild?.dataset?.sourceSignature === iconSignature) return;

        const icon = sourceIcon.cloneNode(true);
        icon.removeAttribute('id');
        icon.removeAttribute('title');
        icon.setAttribute('aria-hidden', 'true');
        icon.classList.add(INDICATOR_ICON_CLASS);
        icon.dataset.sourceSignature = iconSignature;
        indicator.replaceChildren(icon);
    }

    function apply() {
        if (!initialized) return 0;

        if (!isActualiseRoute()) {
            contextKey = '';
            statusSnapshotsByRow.clear();
            statusesByPlacementNumber = new Map();
            removeIndicators();
            return 0;
        }

        resetStatusContext();

        const statusCells = new Map(
            Array.from(document.querySelectorAll(STATUS_CELL_SELECTOR))
                .map(cell => [getRowKey(cell, 'buyStatus-'), cell])
                .filter(([rowKey]) => rowKey)
        );
        captureStatusCells(statusCells);

        const nameCells = Array.from(document.querySelectorAll(NAME_CELL_SELECTOR));
        const retainedIndicators = new Set();

        nameCells.forEach(nameCell => {
            const rowKey = getRowKey(nameCell, 'placementName-');
            const placementNumber = getPlacementNumber(nameCell, rowKey);
            const status = statusSnapshotsByRow.has(rowKey)
                ? statusSnapshotsByRow.get(rowKey)
                : statusesByPlacementNumber.get(placementNumber);
            let indicator = nameCell.querySelector(INDICATOR_SELECTOR);

            if (!status?.icon) {
                if (indicator) removeIndicator(indicator);
                return;
            }

            if (!indicator) {
                indicator = document.createElement('span');
                indicator.className = INDICATOR_CLASS;
                nameCell.appendChild(indicator);
            }

            updateIndicator(indicator, status.icon, status.label);
            retainedIndicators.add(indicator);
        });

        document.querySelectorAll(INDICATOR_SELECTOR).forEach(indicator => {
            if (!retainedIndicators.has(indicator)) removeIndicator(indicator);
        });

        return retainedIndicators.size;
    }

    function handleNavigation() {
        if (!isActualiseRoute()) {
            contextKey = '';
            statusSnapshotsByRow.clear();
            statusesByPlacementNumber = new Map();
            removeIndicators();
            return;
        }
        resetStatusContext();
        apply();
    }

    function initialize() {
        if (initialized) return;
        initialized = true;
        window.addEventListener('message', handleNativeStatusRows);
        window.addEventListener('hashchange', handleNavigation);
        window.addEventListener('popstate', handleNavigation);
        resetStatusContext();
        apply();
    }

    window.actualiseBuyStatusFeature = {
        initialize,
        apply,
        isActualiseRoute
    };
})();

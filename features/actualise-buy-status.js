(function() {
    'use strict';

    const NAME_CELL_SELECTOR = '#grid-container_hot .ht_clone_left td[id^="placementName-"]';
    const STATUS_CELL_SELECTOR = '#grid-container_hot .ht_master .htCore td[id^="buyStatus-"]';
    const INDICATOR_CLASS = 'toolshed-actualise-buy-status-indicator';
    const INDICATOR_SELECTOR = `.${INDICATOR_CLASS}`;
    const INDICATOR_ICON_CLASS = 'toolshed-actualise-buy-status-icon';
    const PRIVATE_USE_GLYPH_PATTERN = /[\uE000-\uF8FF]/g;
    const STATUS_SCROLLER_SELECTOR = '#grid-container_hot .ht_master > .wtHolder';
    const STATUS_SCAN_RETRY_DELAY_MS = 1200;

    let initialized = false;
    let contextKey = '';
    let lastStatusScanAt = 0;
    let statusScanFrame = null;
    let statusRestoreFrame = null;
    let statusScanInProgress = false;
    const statusSnapshots = new Map();

    function isActualiseRoute() {
        const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
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
        const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        return [params.get('campaign-id') || '', params.get('mos') || '', params.get('ptb-ctx') || params.get('route') || ''].join('|');
    }

    function resetStatusContext() {
        const nextContextKey = getContextKey();
        if (nextContextKey === contextKey) return;
        contextKey = nextContextKey;
        statusSnapshots.clear();
        lastStatusScanAt = 0;
    }

    function captureStatusCells(statusCells) {
        statusCells.forEach((statusCell, rowKey) => {
            const sourceIcon = statusCell.querySelector('i.buy-status, img, svg');
            const icon = sourceIcon?.cloneNode(true) || null;
            if (icon && sourceIcon) {
                const color = window.getComputedStyle(sourceIcon).color;
                if (color) icon.style.color = color;
            }
            statusSnapshots.set(rowKey, {
                icon,
                label: getStatusLabel(statusCell)
            });
        });
    }

    function scheduleStatusScan(nameCells) {
        if (statusScanInProgress || statusScanFrame !== null || !nameCells.length) return;

        const hasUnseenRows = nameCells.some(cell => !statusSnapshots.has(getRowKey(cell, 'placementName-')));
        if (!hasUnseenRows || Date.now() - lastStatusScanAt < STATUS_SCAN_RETRY_DELAY_MS) return;

        const scroller = document.querySelector(STATUS_SCROLLER_SELECTOR);
        if (!scroller || !scroller.isConnected) return;

        const originalScrollLeft = scroller.scrollLeft;
        const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
        if (maxScrollLeft <= originalScrollLeft + 1) return;

        lastStatusScanAt = Date.now();
        statusScanInProgress = true;
        statusScanFrame = window.requestAnimationFrame(() => {
            statusScanFrame = null;
            if (!isActualiseRoute() || !scroller.isConnected) {
                statusScanInProgress = false;
                return;
            }

            // Handsontable only creates cells for columns near the horizontal viewport.
            // Visit the far edge once to let Prisma render its native status cells.
            scroller.scrollLeft = maxScrollLeft;
            statusRestoreFrame = window.requestAnimationFrame(() => {
                statusRestoreFrame = null;
                const renderedStatusCells = new Map(
                    Array.from(document.querySelectorAll(STATUS_CELL_SELECTOR))
                        .map(cell => [getRowKey(cell, 'buyStatus-'), cell])
                        .filter(([rowKey]) => rowKey)
                );
                captureStatusCells(renderedStatusCells);
                scroller.scrollLeft = originalScrollLeft;
                statusRestoreFrame = window.requestAnimationFrame(() => {
                    statusRestoreFrame = null;
                    statusScanInProgress = false;
                    apply();
                });
            });
        });
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
            statusSnapshots.clear();
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
            const status = statusSnapshots.get(rowKey);
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

        scheduleStatusScan(nameCells);
        return retainedIndicators.size;
    }

    function initialize() {
        if (initialized) return;
        initialized = true;
        resetStatusContext();
        apply();
    }

    window.actualiseBuyStatusFeature = {
        initialize,
        apply,
        isActualiseRoute
    };
})();

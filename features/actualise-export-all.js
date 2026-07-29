(function() {
    'use strict';

    const MENU_ID = 'toolshed-export-all-actuals';
    const STATUS_ID = 'toolshed-export-all-actuals-status';
    const MONTH_SELECTOR = '#mos-paginator li > a';
    const ACTIVE_MONTH_SELECTOR = '#mos-paginator li.active > a';
    const IMPORT_EXPORT_BUTTON_SELECTOR = '#btn-importExportPlacements';
    const IMPORT_EXPORT_CONTAINER_SELECTOR = '#btn-importExportPlacements-container';
    const NATIVE_EXPORT_ITEM_SELECTOR = '#btn-2';
    const timing = window.__OPS_TOOLSHED_ACTUALISE_EXPORT_TEST_TIMING__ || {};
    const MONTH_CHANGE_TIMEOUT_MS = timing.monthChangeTimeoutMs || 30000;
    const READY_STABLE_MS = timing.readyStableMs || 750;
    const EXPORT_TRIGGER_GAP_MS = timing.exportTriggerGapMs || 1200;
    const MENU_OPEN_TIMEOUT_MS = timing.menuOpenTimeoutMs || 3000;
    const STATUS_DURATION_MS = timing.statusDurationMs || 6000;

    let initialized = false;
    let running = false;
    let cancelRequested = false;
    let statusRemovalTimer = null;

    function getHashParams() {
        return new URLSearchParams(window.location.hash.replace(/^#/, ''));
    }

    function isActualiseRoute() {
        const params = getHashParams();
        return params.get('ptb-ctx') === 'actualize' || params.get('route') === 'actualize';
    }

    function getCampaignId() {
        return getHashParams().get('campaign-id') || '';
    }

    function getVisibleMonths() {
        const links = Array.from(document.querySelectorAll(MONTH_SELECTOR));
        const layoutIsAvailable = links.some(link => link.getClientRects().length > 0);
        return links
            .filter(link => !layoutIsAvailable || link.getClientRects().length > 0)
            .map(link => link.textContent.trim())
            .filter((label, index, labels) => label && labels.indexOf(label) === index);
    }

    function getActiveMonth() {
        return document.querySelector(ACTIVE_MONTH_SELECTOR)?.textContent.trim() || '';
    }

    function updateMenuItem() {
        const item = document.getElementById(MENU_ID);
        if (!item) return;

        item.classList.toggle('mo-disabled', running);
        item.setAttribute('aria-disabled', String(running));
        const link = item.querySelector('a');
        if (link) link.textContent = running
            ? 'Exporting every month\u2019s actuals view\u2026'
            : 'Export every month\u2019s actuals view';
    }

    function handleMenuClick(event) {
        event.preventDefault();
        event.stopPropagation();
        exportAllMonths();
    }

    function apply() {
        if (!isActualiseRoute()) {
            document.getElementById(MENU_ID)?.remove();
            return;
        }

        const nativeExportItem = document.querySelector(NATIVE_EXPORT_ITEM_SELECTOR);
        const menu = nativeExportItem?.parentElement;
        if (!menu || getVisibleMonths().length < 2) {
            document.getElementById(MENU_ID)?.remove();
            return;
        }

        let item = document.getElementById(MENU_ID);
        if (!item) {
            item = document.createElement('li');
            item.id = MENU_ID;

            const link = document.createElement('a');
            link.href = '#';
            link.addEventListener('click', handleMenuClick);
            item.appendChild(link);
            nativeExportItem.after(item);
        } else if (item.previousElementSibling !== nativeExportItem) {
            nativeExportItem.after(item);
        }

        updateMenuItem();
    }

    function showStatus(message, state = 'running') {
        window.clearTimeout(statusRemovalTimer);

        let status = document.getElementById(STATUS_ID);
        if (!status) {
            status = document.createElement('div');
            status.id = STATUS_ID;
            status.setAttribute('role', 'status');
            status.setAttribute('aria-live', 'polite');

            const messageElement = document.createElement('span');
            messageElement.className = 'toolshed-export-all-actuals-message';
            status.appendChild(messageElement);

            const cancelButton = document.createElement('button');
            cancelButton.type = 'button';
            cancelButton.className = 'toolshed-export-all-actuals-cancel';
            cancelButton.textContent = 'Cancel';
            cancelButton.addEventListener('click', () => {
                cancelRequested = true;
                cancelButton.disabled = true;
                messageElement.textContent = 'Stopping after the current export\u2026';
            });
            status.appendChild(cancelButton);
            document.body.appendChild(status);
        }

        status.dataset.state = state;
        status.querySelector('.toolshed-export-all-actuals-message').textContent = message;
        const cancelButton = status.querySelector('.toolshed-export-all-actuals-cancel');
        cancelButton.hidden = state !== 'running';
        cancelButton.disabled = false;

        if (state !== 'running') {
            statusRemovalTimer = window.setTimeout(() => status.remove(), STATUS_DURATION_MS);
        }
    }

    function wait(ms) {
        return new Promise(resolve => window.setTimeout(resolve, ms));
    }

    function waitForCondition(predicate, timeoutMs, description) {
        return new Promise((resolve, reject) => {
            const startedAt = Date.now();
            const check = () => {
                if (predicate()) {
                    resolve();
                    return;
                }
                if (Date.now() - startedAt >= timeoutMs) {
                    reject(new Error(`Timed out waiting for ${description}.`));
                    return;
                }
                window.setTimeout(check, 100);
            };
            check();
        });
    }

    function findMonthLink(label) {
        return Array.from(document.querySelectorAll(MONTH_SELECTOR))
            .find(link => link.textContent.trim() === label) || null;
    }

    function hasVisibleLoadingSpinner() {
        return Boolean(window.utils?.findVisibleLoadingSpinners?.().length);
    }

    async function waitForMonthReady(label) {
        let stableSince = 0;
        await waitForCondition(() => {
            const nativeExportItem = document.querySelector(NATIVE_EXPORT_ITEM_SELECTOR);
            const importExportButton = document.querySelector(IMPORT_EXPORT_BUTTON_SELECTOR);
            const ready =
                getActiveMonth() === label &&
                nativeExportItem &&
                !nativeExportItem.classList.contains('mo-disabled') &&
                importExportButton &&
                !importExportButton.disabled &&
                !hasVisibleLoadingSpinner();

            if (!ready) {
                stableSince = 0;
                return false;
            }
            if (!stableSince) stableSince = Date.now();
            return Date.now() - stableSince >= READY_STABLE_MS;
        }, MONTH_CHANGE_TIMEOUT_MS, `${label} Actualise data`);
    }

    async function selectMonth(label) {
        if (getActiveMonth() !== label) {
            const link = findMonthLink(label);
            if (!link) throw new Error(`${label} is no longer available.`);
            link.click();
        }
        await waitForMonthReady(label);
    }

    async function triggerNativeExport() {
        const importExportButton = document.querySelector(IMPORT_EXPORT_BUTTON_SELECTOR);
        if (!importExportButton) throw new Error('Import/Export is unavailable.');

        const container = document.querySelector(IMPORT_EXPORT_CONTAINER_SELECTOR);
        if (!container?.classList.contains('open')) importExportButton.click();

        await waitForCondition(() => {
            const exportItem = document.querySelector(NATIVE_EXPORT_ITEM_SELECTOR);
            return document.querySelector(IMPORT_EXPORT_CONTAINER_SELECTOR)?.classList.contains('open') &&
                exportItem &&
                !exportItem.classList.contains('mo-disabled');
        }, MENU_OPEN_TIMEOUT_MS, 'the Export actuals view option');

        const exportItem = document.querySelector(NATIVE_EXPORT_ITEM_SELECTOR);
        const exportControl = exportItem.querySelector('a') || exportItem;
        exportControl.click();
        await wait(EXPORT_TRIGGER_GAP_MS);
    }

    async function restoreMonth(label, campaignId) {
        if (!label || getCampaignId() !== campaignId || !isActualiseRoute() || getActiveMonth() === label) return;
        try {
            await selectMonth(label);
        } catch (error) {
            console.warn('[Ops Toolshed] Could not restore the original Actualise month:', error);
        }
    }

    async function exportAllMonths() {
        if (running) return;

        const months = getVisibleMonths();
        if (months.length < 2) return;

        running = true;
        cancelRequested = false;
        updateMenuItem();

        const originalMonth = getActiveMonth();
        const campaignId = getCampaignId();
        let completed = 0;

        try {
            for (let index = 0; index < months.length; index += 1) {
                if (cancelRequested) break;
                if (!isActualiseRoute() || getCampaignId() !== campaignId) {
                    throw new Error('The campaign changed while exports were running.');
                }

                const month = months[index];
                showStatus(
                    `Exporting ${index + 1} of ${months.length}: ${month}. Keep this tab open; Chrome may ask to allow multiple downloads.`
                );
                await selectMonth(month);
                if (cancelRequested) break;
                await triggerNativeExport();
                completed += 1;
            }

            await restoreMonth(originalMonth, campaignId);
            if (cancelRequested) {
                showStatus(`Stopped after starting ${completed} of ${months.length} exports.`, 'info');
            } else {
                showStatus(`Started actuals view exports for all ${completed} months.`, 'success');
            }
        } catch (error) {
            await restoreMonth(originalMonth, campaignId);
            console.error('[Ops Toolshed] Export every month failed:', error);
            showStatus(`Bulk export stopped: ${error.message}`, 'error');
        } finally {
            running = false;
            cancelRequested = false;
            updateMenuItem();
        }
    }

    function initialize() {
        if (initialized) return;
        initialized = true;

        window.addEventListener('hashchange', apply);
        window.addEventListener('pageshow', apply);
        apply();
    }

    window.actualiseExportAllFeature = {
        initialize,
        apply,
        exportAllMonths,
        isRunning: () => running
    };
})();

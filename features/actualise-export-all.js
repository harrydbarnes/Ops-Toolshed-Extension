(function() {
    'use strict';

    const MENU_ID = 'toolshed-export-all-actuals';
    const COMBINE_MENU_ID = 'toolshed-combine-actuals';
    const STATUS_ID = 'toolshed-export-all-actuals-status';
    const FILE_INPUT_ID = 'toolshed-combine-actuals-input';
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
    const COMBINE_STATUS_DURATION_MS = timing.combineStatusDurationMs || 30000;
    const MAX_COMBINE_FILES = 36;
    const MAX_CSV_FILE_SIZE = 10 * 1024 * 1024;

    let initialized = false;
    let running = false;
    let cancelRequested = false;
    let statusRemovalTimer = null;
    let lastExportedMonthCount = 0;

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

    function updateMenuItemState(item, disabled, desiredText) {
        if (!item) return;

        if (item.classList.contains('mo-disabled') !== disabled) {
            item.classList.toggle('mo-disabled', disabled);
        }
        const ariaDisabled = String(disabled);
        if (item.getAttribute('aria-disabled') !== ariaDisabled) {
            item.setAttribute('aria-disabled', ariaDisabled);
        }
        const link = item.querySelector('a');
        if (link && link.textContent !== desiredText) link.textContent = desiredText;
    }

    function updateMenuItems() {
        updateMenuItemState(
            document.getElementById(MENU_ID),
            running,
            running
            ? 'Exporting every month\u2019s actuals view\u2026'
            : 'Export every month\u2019s actuals view'
        );
        updateMenuItemState(
            document.getElementById(COMBINE_MENU_ID),
            running,
            'Combine downloaded actuals views'
        );
    }

    function handleMenuClick(event) {
        event.preventDefault();
        event.stopPropagation();
        exportAllMonths();
    }

    function handleCombineMenuClick(event) {
        event.preventDefault();
        event.stopPropagation();
        if (!running) chooseCsvFiles();
    }

    function createMenuItem(id, handler) {
        const item = document.createElement('li');
        item.id = id;

        const link = document.createElement('a');
        link.href = '#';
        link.addEventListener('click', handler);
        item.appendChild(link);
        return item;
    }

    function apply() {
        if (!isActualiseRoute()) {
            document.getElementById(MENU_ID)?.remove();
            document.getElementById(COMBINE_MENU_ID)?.remove();
            return;
        }

        const nativeExportItem = document.querySelector(NATIVE_EXPORT_ITEM_SELECTOR);
        const menu = nativeExportItem?.parentElement;
        if (!menu || getVisibleMonths().length < 2) {
            document.getElementById(MENU_ID)?.remove();
            document.getElementById(COMBINE_MENU_ID)?.remove();
            return;
        }

        let item = document.getElementById(MENU_ID);
        if (!item) {
            item = createMenuItem(MENU_ID, handleMenuClick);
            nativeExportItem.after(item);
        } else if (item.previousElementSibling !== nativeExportItem) {
            nativeExportItem.after(item);
        }

        let combineItem = document.getElementById(COMBINE_MENU_ID);
        if (!combineItem) {
            combineItem = createMenuItem(COMBINE_MENU_ID, handleCombineMenuClick);
            item.after(combineItem);
        } else if (combineItem.previousElementSibling !== item) {
            item.after(combineItem);
        }

        updateMenuItems();
    }

    function showStatus(message, state = 'running', action = 'cancel') {
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

            const combineButton = document.createElement('button');
            combineButton.type = 'button';
            combineButton.className =
                'toolshed-export-all-actuals-cancel toolshed-export-all-actuals-combine';
            combineButton.textContent = 'Combine CSVs';
            combineButton.addEventListener('click', () => {
                chooseCsvFiles(lastExportedMonthCount);
            });
            status.appendChild(combineButton);
            document.body.appendChild(status);
        }

        status.dataset.state = state;
        status.querySelector('.toolshed-export-all-actuals-message').textContent = message;
        const cancelButton = status.querySelector('.toolshed-export-all-actuals-cancel');
        const combineButton = status.querySelector('.toolshed-export-all-actuals-combine');
        cancelButton.hidden = action !== 'cancel';
        cancelButton.disabled = false;
        combineButton.hidden = action !== 'combine';
        combineButton.disabled = false;

        if (state !== 'running') {
            const duration = action === 'combine' ? COMBINE_STATUS_DURATION_MS : STATUS_DURATION_MS;
            statusRemovalTimer = window.setTimeout(() => status.remove(), duration);
        }
    }

    function parseCsvRows(text) {
        const input = String(text || '').replace(/^\uFEFF/, '');
        const rows = [];
        let row = [];
        let field = '';
        let inQuotes = false;

        for (let index = 0; index < input.length; index += 1) {
            const character = input[index];
            if (character === '"') {
                if (inQuotes && input[index + 1] === '"') {
                    field += '"';
                    index += 1;
                } else {
                    inQuotes = !inQuotes;
                }
                continue;
            }
            if (character === ',' && !inQuotes) {
                row.push(field);
                field = '';
                continue;
            }
            if ((character === '\r' || character === '\n') && !inQuotes) {
                row.push(field);
                rows.push(row);
                row = [];
                field = '';
                if (character === '\r' && input[index + 1] === '\n') index += 1;
                continue;
            }
            field += character;
        }

        if (inQuotes) throw new Error('A selected CSV has an unclosed quoted field.');
        if (field || row.length) {
            row.push(field);
            rows.push(row);
        }
        return rows.filter(candidate => !candidate.every(value => value === ''));
    }

    function escapeCsvField(value) {
        const text = String(value ?? '');
        return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }

    function parseActualizationFilename(name) {
        const match = String(name || '').match(
            /^(Actualization-.+)-(\d{4})-(0[1-9]|1[0-2])(?: \(\d+\))?\.csv$/i
        );
        if (!match) return null;
        return {
            prefix: match[1],
            month: `${match[2]}-${match[3]}`
        };
    }

    async function mergeActualizationCsvFiles(files, expectedCount = 0) {
        const selectedFiles = Array.from(files || []);
        if (selectedFiles.length < 2) {
            throw new Error('Select at least two Prisma Actualization CSV files.');
        }
        if (selectedFiles.length > MAX_COMBINE_FILES) {
            throw new Error(`Select no more than ${MAX_COMBINE_FILES} CSV files.`);
        }
        if (expectedCount && selectedFiles.length !== expectedCount) {
            throw new Error(`Select all ${expectedCount} CSV files from this export run.`);
        }

        const describedFiles = selectedFiles.map(file => {
            const description = parseActualizationFilename(file.name);
            if (!description) {
                throw new Error('Select only Prisma Actualization CSV files.');
            }
            if (Number(file.size || 0) > MAX_CSV_FILE_SIZE) {
                throw new Error(`${file.name} is unexpectedly large.`);
            }
            return { file, ...description };
        });

        const prefixes = new Set(describedFiles.map(item => item.prefix.toLowerCase()));
        if (prefixes.size !== 1) {
            throw new Error('Select Actualization CSVs from one campaign and user only.');
        }

        const months = new Set();
        describedFiles.forEach(item => {
            if (months.has(item.month)) {
                throw new Error(`More than one CSV was selected for ${item.month}.`);
            }
            months.add(item.month);
        });
        describedFiles.sort((left, right) => left.month.localeCompare(right.month));

        let header = null;
        const combinedRows = [];
        for (const item of describedFiles) {
            const rows = parseCsvRows(await item.file.text());
            if (rows.length === 0) throw new Error(`${item.file.name} is empty.`);

            if (!header) {
                header = rows[0];
            } else if (
                rows[0].length !== header.length ||
                rows[0].some((value, index) => value !== header[index])
            ) {
                throw new Error(`${item.file.name} has different columns.`);
            }

            rows.slice(1).forEach((dataRow, rowIndex) => {
                const normalizedRow = [...dataRow];
                while (normalizedRow.length > header.length && normalizedRow.at(-1) === '') {
                    normalizedRow.pop();
                }
                if (normalizedRow.length !== header.length) {
                    throw new Error(`${item.file.name} row ${rowIndex + 2} has a different column count.`);
                }
                combinedRows.push(normalizedRow);
            });
        }

        const allRows = [header, ...combinedRows];
        const csv = `\uFEFF${allRows
            .map(row => row.map(escapeCsvField).join(','))
            .join('\r\n')}\r\n`;
        const firstMonth = describedFiles[0].month;
        const lastMonth = describedFiles[describedFiles.length - 1].month;
        return {
            csv,
            filename: `${describedFiles[0].prefix}-${firstMonth}-to-${lastMonth}.csv`,
            fileCount: describedFiles.length,
            rowCount: combinedRows.length
        };
    }

    function downloadCombinedCsv(result) {
        const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = result.filename;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function chooseCsvFiles(expectedCount = 0) {
        document.getElementById(FILE_INPUT_ID)?.remove();

        const input = document.createElement('input');
        input.id = FILE_INPUT_ID;
        input.type = 'file';
        input.accept = '.csv,text/csv';
        input.multiple = true;
        input.hidden = true;

        input.addEventListener('cancel', () => input.remove(), { once: true });
        input.addEventListener('change', async () => {
            const files = Array.from(input.files || []);
            if (files.length === 0) {
                input.remove();
                return;
            }

            showStatus('Combining downloaded Actualization CSVs\u2026', 'running', 'none');
            try {
                const result = await mergeActualizationCsvFiles(files, expectedCount);
                downloadCombinedCsv(result);
                showStatus(
                    `Combined ${result.fileCount} months and ${result.rowCount} data rows into ${result.filename}.`,
                    'success',
                    'none'
                );
            } catch (error) {
                console.error('[Ops Toolshed] Could not combine Actualization CSVs:', error);
                showStatus(`CSV combine stopped: ${error.message}`, 'error', 'none');
            } finally {
                input.remove();
            }
        }, { once: true });

        document.body.appendChild(input);
        input.click();
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
        lastExportedMonthCount = 0;
        updateMenuItems();

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
                showStatus(`Stopped after starting ${completed} of ${months.length} exports.`, 'info', 'none');
            } else {
                lastExportedMonthCount = months.length;
                showStatus(
                    `Started actuals view exports for all ${completed} months. Select the downloaded CSVs to combine them.`,
                    'success',
                    'combine'
                );
            }
        } catch (error) {
            await restoreMonth(originalMonth, campaignId);
            console.error('[Ops Toolshed] Export every month failed:', error);
            showStatus(`Bulk export stopped: ${error.message}`, 'error', 'none');
        } finally {
            running = false;
            cancelRequested = false;
            updateMenuItems();
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
        mergeActualizationCsvFiles,
        parseCsvRows,
        chooseCsvFiles,
        isRunning: () => running
    };
})();

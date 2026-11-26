(function() {
    'use strict';

    const MENU_ID = 'toolshed-export-all-actuals';
    const COMBINE_MENU_ID = 'toolshed-combine-actuals';
    const SETTING_KEY = 'actualiseBulkExportEnabled';
    const STATUS_ID = 'toolshed-export-all-actuals-status';
    const FILE_INPUT_ID = 'toolshed-combine-actuals-input';
    const MONTH_SELECTOR = '#mos-paginator li > a, .actual-months-group mo-button-group-item';
    const ACTIVE_MONTH_SELECTOR = '#mos-paginator li.active > a, .actual-months-group mo-button-group-item[aria-pressed="true"], .actual-months-group mo-button-group-item[selected="true"]';
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
    const CAPTURE_SETTLE_TIMEOUT_MS = timing.captureSettleTimeoutMs ?? 2000;
    const BRIDGE_SOURCE = 'ops-toolshed-actualise-month-bridge';
    const EXPORT_CAPTURE_START = 'ops-toolshed-actualise-export-capture-start';
    const EXPORT_CAPTURE_STOP = 'ops-toolshed-actualise-export-capture-stop';
    const EXPORT_CAPTURED = 'ops-toolshed-actualise-export-captured';
    const MAX_COMBINE_FILES = 36;
    const MAX_CSV_FILE_SIZE = 10 * 1024 * 1024;

    let initialized = false;
    let settingsLoaded = false;
    let featureEnabled = true;
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
        const links = getMonthLinks();
        const layoutIsAvailable = links.some(link => link.getClientRects().length > 0);
        return links
            .filter(link => !layoutIsAvailable || link.getClientRects().length > 0)
            .map(link => link.textContent.trim())
            .filter((label, index, labels) => label && labels.indexOf(label) === index);
    }

    function getMonthLinks() {
        const expanded = Array.from(document.querySelectorAll('#toolshed-actualise-month-selector .toolshed-actualise-month-button'));
        return expanded.length ? expanded : Array.from(document.querySelectorAll(MONTH_SELECTOR));
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
        if (item.localName === 'mo-menu-item' && item.getAttribute('label') !== desiredText) {
            item.setAttribute('label', desiredText);
        }
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

    function createMenuItem(id, handler, nativeItem) {
        const item = document.createElement(nativeItem.localName === 'mo-menu-item' ? 'mo-menu-item' : 'li');
        item.id = id;

        if (item.localName === 'mo-menu-item') {
            item.addEventListener('click', handler);
            return item;
        }

        const link = document.createElement('a');
        link.href = '#';
        link.addEventListener('click', handler);
        item.appendChild(link);
        return item;
    }

    function apply() {
        if (!settingsLoaded || !featureEnabled || !isActualiseRoute()) {
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
            item = createMenuItem(MENU_ID, handleMenuClick, nativeExportItem);
            nativeExportItem.after(item);
        } else if (item.previousElementSibling !== nativeExportItem) {
            nativeExportItem.after(item);
        }

        let combineItem = document.getElementById(COMBINE_MENU_ID);
        if (!combineItem) {
            combineItem = createMenuItem(COMBINE_MENU_ID, handleCombineMenuClick, nativeExportItem);
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

    const PLAIN_SIGNED_NUMBER = /^\s*[+-]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?\s*$/i;

    function neutralizeSpreadsheetFormula(value) {
        const text = String(value ?? '');
        const isFormulaLike = /^\s*[=+\-@]/.test(text);
        return isFormulaLike && !PLAIN_SIGNED_NUMBER.test(text) ? `'${text}` : text;
    }

    function escapeCsvField(value) {
        const text = neutralizeSpreadsheetFormula(value);
        return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }

    const D_NUMBER_MONTH_HEADER = 'D Number Month';
    const D_NUMBER_HEADER_PATTERN = /^d[\s_-]*(?:number|no\.?|#|id)$/i;
    const D_NUMBER_VALUE_PATTERN = /^D(?=.*\d)[A-Z0-9]{3,}$/i;

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

    function findDNumberColumnIndex(header, rows) {
        const headerIndex = header.findIndex(name =>
            D_NUMBER_HEADER_PATTERN.test(String(name || '').trim())
        );
        if (headerIndex !== -1) return headerIndex;

        for (let columnIndex = 0; columnIndex < header.length; columnIndex += 1) {
            const hasDNumberValue = rows.some(row =>
                D_NUMBER_VALUE_PATTERN.test(String(row[columnIndex] ?? '').trim())
            );
            if (hasDNumberValue) return columnIndex;
        }
        return -1;
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
        const combinedEntries = [];
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
                combinedEntries.push({ row: normalizedRow, month: item.month });
            });
        }

        const existingMonthIndex = header.findIndex(
            name => String(name || '').trim().toLowerCase() === D_NUMBER_MONTH_HEADER.toLowerCase()
        );

        let outputHeader;
        let outputRows;
        if (existingMonthIndex !== -1) {
            outputHeader = [...header];
            outputRows = combinedEntries.map(({ row, month }) => {
                const nextRow = [...row];
                if (String(nextRow[existingMonthIndex] ?? '').trim() === '') {
                    nextRow[existingMonthIndex] = month;
                }
                return nextRow;
            });
        } else {
            const dNumberIndex = findDNumberColumnIndex(
                header,
                combinedEntries.map(entry => entry.row)
            );
            const insertIndex = dNumberIndex === -1 ? 0 : dNumberIndex + 1;
            outputHeader = [
                ...header.slice(0, insertIndex),
                D_NUMBER_MONTH_HEADER,
                ...header.slice(insertIndex)
            ];
            outputRows = combinedEntries.map(({ row, month }) => [
                ...row.slice(0, insertIndex),
                month,
                ...row.slice(insertIndex)
            ]);
        }

        const allRows = [outputHeader, ...outputRows];
        const csv = `\uFEFF${allRows
            .map(row => row.map(escapeCsvField).join(','))
            .join('\r\n')}\r\n`;
        const firstMonth = describedFiles[0].month;
        const lastMonth = describedFiles[describedFiles.length - 1].month;
        return {
            csv,
            filename: `${describedFiles[0].prefix}-${firstMonth}-to-${lastMonth}.csv`,
            fileCount: describedFiles.length,
            rowCount: outputRows.length
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
        return getMonthLinks()
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
            const modern = Boolean(importExportButton?.shadowRoot?.querySelector('mo-menu'));
            const assessment = window.actualiseMonthAssuranceFeature?.assessActualiseMonth?.();
            const ready =
                getActiveMonth() === label &&
                (nativeExportItem ? !nativeExportItem.classList.contains('mo-disabled') && !nativeExportItem.hasAttribute('disabled') :
                    modern) &&
                (!modern || assessment?.status === 'correct') &&
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
        const modernMenu = importExportButton.shadowRoot?.querySelector('mo-menu');
        if (modernMenu) {
            for (let attempt = 0; !document.querySelector(NATIVE_EXPORT_ITEM_SELECTOR) && attempt < 2; attempt += 1) {
                modernMenu.dispatchEvent(new MouseEvent('mousedown', {
                    bubbles: true, composed: true, button: 0, buttons: 1
                }));
                try {
                    await waitForCondition(() => document.querySelector(NATIVE_EXPORT_ITEM_SELECTOR),
                        MENU_OPEN_TIMEOUT_MS / 2, 'the Export actuals view option');
                } catch (error) {
                    if (attempt === 1) throw error;
                }
            }
        } else if (!container?.classList.contains('open')) importExportButton.click();

        await waitForCondition(() => {
            const exportItem = document.querySelector(NATIVE_EXPORT_ITEM_SELECTOR);
            return (modernMenu ? true :
                document.querySelector(IMPORT_EXPORT_CONTAINER_SELECTOR)?.classList.contains('open')) &&
                exportItem &&
                !exportItem.classList.contains('mo-disabled') && !exportItem.hasAttribute('disabled');
        }, MENU_OPEN_TIMEOUT_MS, 'the Export actuals view option');

        const exportItem = document.querySelector(NATIVE_EXPORT_ITEM_SELECTOR);
        const exportControl = exportItem.shadowRoot?.querySelector('a') || exportItem.querySelector('a') || exportItem;
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
        const captureToken = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const capturedFiles = [];
        let captureStopped = false;
        let completed = 0;

        const handleCapturedMessage = event => {
            if (event.source !== window || event.origin !== window.location.origin ||
                event.data?.source !== BRIDGE_SOURCE || event.data?.type !== EXPORT_CAPTURED) {
                return;
            }
            const detail = event.data.detail;
            if (!detail || detail.token !== captureToken) return;
            const csvText = String(detail.text || '');
            const fileName = String(detail.name || 'Actualization.csv');
            capturedFiles.push({
                name: fileName,
                size: Number.isFinite(Number(detail.size)) ? Number(detail.size) : csvText.length,
                text: async () => csvText
            });
        };

        const stopCapture = () => {
            if (captureStopped) return;
            captureStopped = true;
            window.removeEventListener('message', handleCapturedMessage);
            window.postMessage({
                source: BRIDGE_SOURCE,
                type: EXPORT_CAPTURE_STOP,
                detail: { token: captureToken }
            }, window.location.origin);
        };

        window.addEventListener('message', handleCapturedMessage);
        window.postMessage({
            source: BRIDGE_SOURCE,
            type: EXPORT_CAPTURE_START,
            detail: { token: captureToken }
        }, window.location.origin);

        try {
            for (let index = 0; index < months.length; index += 1) {
                if (cancelRequested) break;
                if (!isActualiseRoute() || getCampaignId() !== campaignId) {
                    throw new Error('The campaign changed while exports were running.');
                }

                const month = months[index];
                showStatus(
                    `Exporting ${index + 1} of ${months.length}: ${month}. Keep this tab open.`
                );
                await selectMonth(month);
                if (cancelRequested) break;
                await triggerNativeExport();
                completed += 1;
            }

            if (!cancelRequested && completed >= 2 && capturedFiles.length < completed &&
                CAPTURE_SETTLE_TIMEOUT_MS > 0) {
                try {
                    await waitForCondition(
                        () => capturedFiles.length >= completed,
                        CAPTURE_SETTLE_TIMEOUT_MS,
                        'exported CSVs'
                    );
                } catch (error) {
                    // Fall back to the manual Combine CSVs picker when downloads were not intercepted.
                }
            }

            stopCapture();
            await restoreMonth(originalMonth, campaignId);
            if (cancelRequested) {
                showStatus(`Stopped after starting ${completed} of ${months.length} exports.`, 'info', 'none');
            } else if (capturedFiles.length === completed && completed >= 2) {
                const result = await mergeActualizationCsvFiles(capturedFiles, completed);
                downloadCombinedCsv(result);
                showStatus(
                    `Combined ${result.fileCount} months and ${result.rowCount} data rows into ${result.filename}.`,
                    'success',
                    'none'
                );
            } else {
                lastExportedMonthCount = months.length;
                showStatus(
                    `Started actuals view exports for all ${completed} months. Select the downloaded CSVs to combine them.`,
                    'success',
                    'combine'
                );
            }
        } catch (error) {
            stopCapture();
            await restoreMonth(originalMonth, campaignId);
            console.error('[Ops Toolshed] Export every month failed:', error);
            showStatus(`Bulk export stopped: ${error.message}`, 'error', 'none');
        } finally {
            stopCapture();
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
        // Modern Prisma creates its menu in a detached overlay only when opened.
        new MutationObserver(records => {
            if (records.some(record => Array.from(record.addedNodes).some(node =>
                node.nodeType === 1 && (node.matches?.(NATIVE_EXPORT_ITEM_SELECTOR) ||
                    node.querySelector?.(NATIVE_EXPORT_ITEM_SELECTOR))
            ))) apply();
        }).observe(document.body, { childList: true, subtree: true });
        if (!chrome.storage?.sync) {
            settingsLoaded = true;
            apply();
            return;
        }

        chrome.storage.sync.get({ [SETTING_KEY]: true }, data => {
            featureEnabled = data[SETTING_KEY] !== false;
            settingsLoaded = true;
            apply();
        });
        chrome.storage.onChanged?.addListener((changes, area) => {
            if (area !== 'sync' || !changes[SETTING_KEY]) return;
            featureEnabled = changes[SETTING_KEY].newValue !== false;
            settingsLoaded = true;
            apply();
        });
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

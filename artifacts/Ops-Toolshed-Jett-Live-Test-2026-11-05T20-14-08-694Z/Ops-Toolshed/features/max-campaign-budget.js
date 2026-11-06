(function() {
    'use strict';

    const FLOATING_PANEL_ID = 'toolshed-max-budget-panel';
    const ACTUALISE_BUTTON_ID = 'toolshed-max-budget-actualise';
    const ACTUALISE_STATUS_ID = 'toolshed-max-budget-actualise-status';
    const SETTING_KEY = 'maxCampaignBudgetEnabled';
    const INSERTED_VALUE_ATTRIBUTE = 'data-toolshed-max-budget-inserted';
    const NATIVE_NOTE_CLASS = 'toolshed-max-budget-native-note';
    const BUDGET_CONTAINER_ID = 'campaign-budget-overview-container';
    const BUY_COST_CELL_SELECTOR = 'td[id^="plannedCost-"]';
    const ACTUALISE_COST_CELL_SELECTOR = 'td[id^="payableActualCost"]';
    const MAX_SOLVE_ATTEMPTS = 4;
    const BUDGET_READ_TIMEOUT_MS = 1800;
    const CELL_COMMIT_TIMEOUT_MS = 1800;

    let initialized = false;
    let settingsLoaded = false;
    let featureEnabled = true;
    let selectedCellId = '';
    let busy = false;
    let cachedBudgetMetadata = null;

    function getHashParams() {
        return new URLSearchParams(window.location.hash.substring(1));
    }

    function isBuyRoute() {
        const params = getHashParams();
        return params.get('ptb-mod') === 'buy' &&
            params.get('ptb-ctx') === 'digital' &&
            params.get('route') === 'online';
    }

    function isActualiseRoute() {
        const params = getHashParams();
        return params.get('ptb-ctx') === 'actualize' ||
            params.get('route') === 'actualize';
    }

    function parseCurrency(value) {
        if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;

        const source = String(value || '').trim();
        if (!source) return NaN;

        const negative = /^\(.*\)$/.test(source);
        const multiplier = /m\b/i.test(source) ? 1000000 : (/k\b/i.test(source) ? 1000 : 1);
        const number = Number.parseFloat(source.replace(/[^0-9.-]/g, ''));
        if (!Number.isFinite(number)) return NaN;
        return (negative ? -Math.abs(number) : number) * multiplier;
    }

    function roundCurrency(value) {
        return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
    }

    function formatCurrency(value) {
        return new Intl.NumberFormat('en-GB', {
            style: 'currency',
            currency: 'GBP',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value);
    }

    function getTargetCell() {
        if (!selectedCellId) return null;
        return document.getElementById(selectedCellId);
    }

    function isEditableTargetCell(cell) {
        if (!(cell instanceof Element) || !cell.id) return false;
        const matchesRoute = (isBuyRoute() && cell.matches(BUY_COST_CELL_SELECTOR)) ||
            (isActualiseRoute() && cell.matches(ACTUALISE_COST_CELL_SELECTOR));
        return matchesRoute &&
            !cell.classList.contains('cell-read-only') &&
            !cell.classList.contains('group-cell');
    }

    function createFloatingPanel() {
        const panel = document.createElement('div');
        panel.id = FLOATING_PANEL_ID;
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'Max Campaign Budget');

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'toolshed-max-budget-button';
        button.textContent = 'Max Campaign Budget';
        button.addEventListener('pointerdown', event => event.stopPropagation());
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            maxSelectedCell();
        });

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'toolshed-max-budget-close';
        closeButton.setAttribute('aria-label', 'Close Max Campaign Budget');
        closeButton.title = 'Close';
        closeButton.textContent = '\u00d7';
        for (const eventName of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
            closeButton.addEventListener(eventName, event => {
                event.preventDefault();
                event.stopPropagation();
            });
        }
        closeButton.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            const panel = closeButton.closest(`#${FLOATING_PANEL_ID}`);
            const restoreNativeMenu =
                panel?.dataset.toolshedPreserveNativeMenu === 'true' ||
                Boolean(findOpenRevertMenus().length);
            const cell = getTargetCell();
            removeFloatingPanel();

            if (restoreNativeMenu && cell) {
                window.setTimeout(() => {
                    if (findOpenRevertMenus().length || !cell.isConnected) return;
                    cell.querySelector('.mo-menu-caret.has-action, .mo-menu-caret')?.click();
                }, 0);
            }
        });

        const actions = document.createElement('div');
        actions.className = 'toolshed-max-budget-actions';
        actions.append(button, closeButton);

        const status = document.createElement('div');
        status.className = 'toolshed-max-budget-status';
        status.setAttribute('aria-live', 'polite');
        status.textContent =
            'Enters the calculated value only. Review it, then use Prisma’s normal Save action.';

        panel.append(actions, status);
        document.body.appendChild(panel);
        return panel;
    }

    function positionFloatingPanel(cell) {
        const panel = document.getElementById(FLOATING_PANEL_ID) || createFloatingPanel();
        const rect = cell.getBoundingClientRect();
        const panelWidth = panel.offsetWidth || 230;
        const left = Math.min(
            Math.max(8, rect.left),
            Math.max(8, window.innerWidth - panelWidth - 8)
        );
        panel.style.left = `${left}px`;
        panel.style.top = `${Math.min(window.innerHeight - 80, rect.bottom + 6)}px`;
        panel.hidden = false;
        return panel;
    }

    function removeFloatingPanel() {
        document.getElementById(FLOATING_PANEL_ID)?.remove();
    }

    function removeFeatureControls() {
        removeFloatingPanel();
        document.getElementById(ACTUALISE_BUTTON_ID)?.remove();
        document.getElementById(ACTUALISE_STATUS_ID)?.remove();
        document.querySelectorAll(`.${NATIVE_NOTE_CLASS}`).forEach(note => note.remove());
        selectedCellId = '';
    }

    function setPanelStatus(message, state = '') {
        const panel = document.getElementById(FLOATING_PANEL_ID);
        const status = panel?.querySelector('.toolshed-max-budget-status');
        if (status) {
            status.textContent = message;
            status.dataset.state = state;
        }
        const actualiseStatus = document.getElementById(ACTUALISE_STATUS_ID);
        if (actualiseStatus) {
            actualiseStatus.textContent = message;
            actualiseStatus.dataset.state = state;
        }
    }

    function findOpenRevertMenus() {
        return Array.from(document.querySelectorAll('ul.dropdown-menu.show'))
            .map(menu => ({
                menu,
                revertLink: Array.from(menu.querySelectorAll('a[role="menuitem"]'))
                    .find(link => link.textContent.trim() === 'Revert change')
            }))
            .filter(item => item.revertLink);
    }

    function ensureNativeRevertNote() {
        const openRevertMenus = findOpenRevertMenus();
        const panel = document.getElementById(FLOATING_PANEL_ID);
        if (panel) {
            panel.dataset.toolshedPreserveNativeMenu =
                openRevertMenus.length > 0 ? 'true' : 'false';
        }

        const cell = getTargetCell();
        if (!cell?.hasAttribute(INSERTED_VALUE_ATTRIBUTE)) return;

        for (const { menu, revertLink } of openRevertMenus) {
            if (!revertLink || menu.querySelector(`.${NATIVE_NOTE_CLASS}`)) continue;

            const note = document.createElement('li');
            note.className = `disabled ${NATIVE_NOTE_CLASS}`;
            note.setAttribute('role', 'presentation');

            const text = document.createElement('span');
            text.textContent = 'Max value inserted by Toolshed';
            note.appendChild(text);
            revertLink.closest('li')?.after(note);

            revertLink.addEventListener('click', () => {
                cell.removeAttribute(INSERTED_VALUE_ATTRIBUTE);
                note.remove();
            }, { once: true });
        }
    }

    function finishSuccessfulMax(message) {
        const cell = getTargetCell();
        if (cell) cell.setAttribute(INSERTED_VALUE_ATTRIBUTE, 'true');
        setPanelStatus(message, 'success');
        window.utils?.showToast?.(
            'value inputted, now review and apply as needed',
            'success'
        );
        ensureNativeRevertNote();

        if (isBuyRoute()) {
            removeFloatingPanel();
        }
    }

    function updateButtonState() {
        const enabled = !busy && isEditableTargetCell(getTargetCell());
        const panelButton = document.querySelector(`#${FLOATING_PANEL_ID} .toolshed-max-budget-button`);
        if (panelButton) panelButton.disabled = !enabled;

        const actualiseButton = document.getElementById(ACTUALISE_BUTTON_ID);
        if (actualiseButton) {
            actualiseButton.disabled = !enabled;
            actualiseButton.classList.toggle('mo-disabled', !enabled);
            actualiseButton.title = enabled
                ? 'Set the selected month Gross payable to use the remaining campaign budget'
                : 'Select an editable Gross payable cell for this month first';
        }
    }

    function ensureActualiseButton() {
        if (!isActualiseRoute()) {
            document.getElementById(ACTUALISE_BUTTON_ID)?.remove();
            document.getElementById(ACTUALISE_STATUS_ID)?.remove();
            return;
        }
        if (document.getElementById(ACTUALISE_BUTTON_ID)) {
            updateButtonState();
            return;
        }

        const redistributeButton = document.getElementById('redistributeAllButton');
        if (!redistributeButton) return;

        const button = redistributeButton.cloneNode(false);
        button.id = ACTUALISE_BUTTON_ID;
        button.type = 'button';
        button.textContent = 'Max Campaign Budget';
        button.removeAttribute('data-toggle');
        button.removeAttribute('data-original-title');
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            maxSelectedCell();
        });

        const status = document.createElement('span');
        status.id = ACTUALISE_STATUS_ID;
        status.className = 'toolshed-max-budget-actualise-status';
        status.setAttribute('aria-live', 'polite');

        redistributeButton.after(button, status);
        updateButtonState();
    }

    function getBuyGridTotal() {
        if (!isBuyRoute()) return NaN;

        const totalNameCells = Array.from(document.querySelectorAll(
            'td[id^="placementName-"].table-row-total'
        ));
        const totalRows = Array.from(new Set(totalNameCells.map(nameCell =>
            nameCell.getAttribute('data-row') || nameCell.id.split('-').pop()
        )));
        const total = totalRows.reduce((sum, row) => {
            const amount = parseCurrency(
                document.getElementById(`budgetTotalClientCostBillable-${row}`)?.textContent
            );
            return Number.isFinite(amount) ? sum + amount : sum;
        }, 0);
        return totalRows.length > 0 ? roundCurrency(total) : NaN;
    }

    function getAbbreviatedBudgetStep(label) {
        const match = String(label || '').match(/([0-9]+(?:\.[0-9]+)?)\s*([km])\b/i);
        if (!match) return NaN;

        const decimalPlaces = (match[1].split('.')[1] || '').length;
        const scale = match[2].toLowerCase() === 'm' ? 1000000 : 1000;
        return scale / (10 ** decimalPlaces);
    }

    function getCollapsedBudget(gridBuyTotal) {
        const label = document.querySelector('[data-cy="total-budget"]')?.textContent?.trim() || '';
        const displayedBudget = parseCurrency(label);
        if (!Number.isFinite(displayedBudget)) return NaN;

        if (!/[km]\b/i.test(label)) {
            return roundCurrency(displayedBudget);
        }
        if (!Number.isFinite(gridBuyTotal) || gridBuyTotal < 0) return NaN;

        const progressFill = document.querySelector('[data-cy="budget-progress-bar"] > *');
        const widthText = progressFill?.style?.width || '';
        const displayedPercentage = Number.parseFloat(widthText);
        if (
            !Number.isFinite(displayedPercentage) ||
            displayedPercentage <= 0 ||
            displayedPercentage >= 100
        ) {
            return NaN;
        }

        const inferredBudget = (gridBuyTotal * 100) / displayedPercentage;
        const wholePoundCandidate = Math.round(inferredBudget);
        if (wholePoundCandidate <= 0) return NaN;

        const percentageDecimals = (widthText.match(/\.(\d+)/)?.[1] || '').length;
        const percentageScale = 10 ** Math.min(4, percentageDecimals);
        const candidatePercentage = Math.round(
            ((gridBuyTotal / wholePoundCandidate) * 100) * percentageScale
        ) / percentageScale;
        const percentageTolerance = 0.5 / percentageScale;
        if (Math.abs(candidatePercentage - displayedPercentage) > percentageTolerance) {
            return NaN;
        }

        const abbreviationStep = getAbbreviatedBudgetStep(label);
        if (
            !Number.isFinite(abbreviationStep) ||
            Math.abs(wholePoundCandidate - displayedBudget) > (abbreviationStep / 2)
        ) {
            return NaN;
        }

        return wholePoundCandidate;
    }

    function getBudgetSnapshot() {
        const budgetElement = document.querySelector('[data-cy="budget-amount"]');
        const purchasedElement = document.querySelector('[data-cy="budget-purchased"]');
        const typeElement = document.querySelector('[data-cy="budget-type-label"]');
        const popoverBudget = parseCurrency(budgetElement?.textContent);
        const popoverBuyTotal = parseCurrency(purchasedElement?.textContent);
        const gridBuyTotal = getBuyGridTotal();
        const collapsedBudget = getCollapsedBudget(gridBuyTotal);
        const popoverBudgetType = typeElement?.textContent?.trim() || '';

        if (Number.isFinite(popoverBudget)) {
            cachedBudgetMetadata = {
                budget: popoverBudget,
                budgetType: popoverBudgetType
            };
        } else if (!cachedBudgetMetadata && Number.isFinite(collapsedBudget)) {
            cachedBudgetMetadata = {
                budget: collapsedBudget,
                budgetType: ''
            };
        }

        const budget = Number.isFinite(popoverBudget)
            ? popoverBudget
            : (cachedBudgetMetadata?.budget ?? collapsedBudget);
        const buyTotal = Number.isFinite(gridBuyTotal) ? gridBuyTotal : popoverBuyTotal;
        const budgetType = popoverBudgetType || cachedBudgetMetadata?.budgetType || '';

        if (!Number.isFinite(budget) || !Number.isFinite(buyTotal)) return null;
        return {
            budget,
            buyTotal,
            budgetType
        };
    }

    function dispatchBudgetHover() {
        const container = document.getElementById(BUDGET_CONTAINER_ID);
        if (!container) return false;

        const hoverTarget = container.closest('mo-popover') || container;
        const rect = container.getBoundingClientRect();
        const eventOptions = {
            bubbles: true,
            cancelable: true,
            composed: true,
            clientX: rect.left + (rect.width / 2),
            clientY: rect.top + (rect.height / 2)
        };

        const MouseEventConstructor = hoverTarget.ownerDocument.defaultView?.MouseEvent || MouseEvent;
        const PointerEventConstructor = hoverTarget.ownerDocument.defaultView?.PointerEvent;
        if (PointerEventConstructor) {
            hoverTarget.dispatchEvent(new PointerEventConstructor('pointerover', eventOptions));
            hoverTarget.dispatchEvent(new PointerEventConstructor('pointerenter', {
                ...eventOptions,
                bubbles: false
            }));
        }
        hoverTarget.dispatchEvent(new MouseEventConstructor('mouseover', eventOptions));
        hoverTarget.dispatchEvent(new MouseEventConstructor('mouseenter', {
            ...eventOptions,
            bubbles: false
        }));
        return true;
    }

    async function readBudgetSnapshot(previousBuyTotal = null) {
        dispatchBudgetHover();
        const deadline = Date.now() + BUDGET_READ_TIMEOUT_MS;
        let latest = null;

        while (Date.now() < deadline) {
            latest = getBudgetSnapshot() || latest;
            if (latest && (
                previousBuyTotal === null ||
                Math.abs(latest.buyTotal - previousBuyTotal) >= 0.005
            )) {
                return latest;
            }
            await new Promise(resolve => window.setTimeout(resolve, 60));
        }
        return previousBuyTotal === null ? latest : null;
    }

    function getVisibleEditor() {
        const editors = Array.from(document.querySelectorAll(
            'textarea.handsontableInput, input.handsontableInput'
        ));
        return editors.find(editor => {
            const style = window.getComputedStyle(editor);
            const holder = editor.closest('.handsontableInputHolder');
            const holderStyle = holder ? window.getComputedStyle(holder) : null;
            return style.display !== 'none' &&
                style.visibility !== 'hidden' &&
                (!holderStyle || Number.parseFloat(holderStyle.opacity || '1') > 0);
        }) || null;
    }

    function setNativeValue(input, value) {
        const prototype = input instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        if (setter) {
            setter.call(input, value);
        } else {
            input.value = value;
        }
    }

    async function waitForEditor(timeoutMs = 350) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const editor = getVisibleEditor();
            if (editor) return editor;
            await new Promise(resolve => window.setTimeout(resolve, 30));
        }
        return null;
    }

    async function commitCellValue(cellId, value) {
        const cell = document.getElementById(cellId);
        if (!isEditableTargetCell(cell)) {
            throw new Error('This Prisma cell is not currently editable.');
        }

        const eventOptions = {
            bubbles: true,
            cancelable: true,
            composed: true,
            button: 0
        };
        const enterOptions = {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
            composed: true
        };
        const MouseEventConstructor = cell.ownerDocument.defaultView?.MouseEvent || MouseEvent;
        const KeyboardEventConstructor = cell.ownerDocument.defaultView?.KeyboardEvent || KeyboardEvent;

        let editor = getVisibleEditor();
        for (let attempt = 0; !editor && attempt < 2; attempt += 1) {
            if (attempt > 0 || !cell.classList.contains('current')) {
                cell.dispatchEvent(new MouseEventConstructor('mousedown', eventOptions));
                cell.dispatchEvent(new MouseEventConstructor('mouseup', eventOptions));
                cell.dispatchEvent(new MouseEventConstructor('click', eventOptions));
                await new Promise(resolve => window.setTimeout(resolve, 0));
            }
            cell.dispatchEvent(new KeyboardEventConstructor('keydown', enterOptions));
            editor = await waitForEditor();
        }

        if (!editor) throw new Error('Prisma did not open the cell editor.');

        const nextValue = roundCurrency(value).toFixed(2);
        editor.focus();
        setNativeValue(editor, nextValue);
        editor.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        editor.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

        editor.dispatchEvent(new KeyboardEventConstructor('keydown', enterOptions));

        const deadline = Date.now() + CELL_COMMIT_TIMEOUT_MS;
        while (Date.now() < deadline) {
            const rendered = parseCurrency(document.getElementById(cellId)?.textContent);
            if (Number.isFinite(rendered) && Math.abs(rendered - value) < 0.011) return;
            await new Promise(resolve => window.setTimeout(resolve, 60));
        }
        throw new Error('Prisma did not commit the new cell value.');
    }

    function calculateProjectedTarget({
        originalValue,
        currentTotal,
        budget,
        components
    }) {
        if (
            !Number.isFinite(originalValue) ||
            originalValue <= 0 ||
            !Number.isFinite(currentTotal) ||
            currentTotal <= 0 ||
            !Number.isFinite(budget) ||
            budget <= currentTotal ||
            !Array.isArray(components) ||
            components.length === 0 ||
            components.some(value => !Number.isFinite(value) || value < 0)
        ) {
            return null;
        }

        const roundProjectedCurrency = value => (
            Math.round((Number(value) + 1e-9) * 100) / 100
        );
        const componentTotal = roundProjectedCurrency(
            components.reduce((sum, value) => sum + value, 0)
        );
        if (Math.abs(componentTotal - currentTotal) >= 0.011) return null;

        const project = value => roundProjectedCurrency(components.reduce((sum, component) => (
            sum + roundProjectedCurrency(value * (component / originalValue))
        ), 0));

        let low = Math.round(originalValue * 100);
        let high = Math.max(
            low + 1,
            Math.ceil(((originalValue * budget) / currentTotal) * 100) + 100
        );
        let expansionCount = 0;
        while (project(high / 100) <= budget && expansionCount < 8) {
            high *= 2;
            expansionCount += 1;
        }
        if (project(high / 100) <= budget) return null;

        while (low + 1 < high) {
            const middle = Math.floor((low + high) / 2);
            if (project(middle / 100) <= budget) {
                low = middle;
            } else {
                high = middle;
            }
        }

        const targetValue = roundCurrency(low / 100);
        const projectedTotal = project(targetValue);
        return {
            targetValue,
            projectedTotal,
            remaining: roundCurrency(budget - projectedTotal)
        };
    }

    function getSingleBookingProjection(base, originalValue) {
        if (!isBuyRoute() || !selectedCellId.startsWith('plannedCost-')) return null;

        const row = selectedCellId.split('-').pop();
        const currentRowTotal = parseCurrency(
            document.getElementById(`budgetTotalClientCostBillable-${row}`)?.textContent
        );
        const currentBillableCost = parseCurrency(
            document.getElementById(`billableCost-${row}`)?.textContent
        );
        if (
            !Number.isFinite(currentRowTotal) ||
            Math.abs(currentRowTotal - base.buyTotal) >= 0.011 ||
            !Number.isFinite(currentBillableCost) ||
            Math.abs(currentBillableCost - originalValue) >= 0.011
        ) {
            return null;
        }

        const components = [
            `budgetClientCost-${row}`,
            `budgetCommissionAmount-${row}`,
            `budgetAsbof-${row}`,
            `budgetOrigin-${row}`
        ].map(id => parseCurrency(document.getElementById(id)?.textContent));

        return calculateProjectedTarget({
            originalValue,
            currentTotal: currentRowTotal,
            budget: base.budget,
            components
        });
    }

    function calculateTargetFromProbe({
        originalValue,
        baseBuyTotal,
        probeValue,
        probeBuyTotal,
        budget
    }) {
        const probeDelta = probeValue - originalValue;
        const buyDelta = probeBuyTotal - baseBuyTotal;
        const responseRate = buyDelta / probeDelta;
        if (!Number.isFinite(responseRate) || responseRate <= 0) return null;

        return {
            responseRate,
            targetValue: roundCurrency(
                originalValue + ((budget - baseBuyTotal) / responseRate)
            )
        };
    }

    async function restoreOriginalValue(originalValue) {
        try {
            await commitCellValue(selectedCellId, originalValue);
            await readBudgetSnapshot();
            return true;
        } catch (_error) {
            return false;
        }
    }

    function withRestoreResult(message, restored) {
        return restored
            ? `${message} The original value was restored.`
            : `${message} Prisma could not restore the original value; review the cell before continuing.`;
    }

    async function maxSelectedCell() {
        if (busy) return;

        const cell = getTargetCell();
        if (!isEditableTargetCell(cell)) {
            setPanelStatus(
                isActualiseRoute()
                    ? 'Select an editable Gross payable cell for the active month first.'
                    : 'Select an editable Cost cell first.',
                'error'
            );
            return;
        }

        const originalValue = parseCurrency(cell.textContent);
        if (!Number.isFinite(originalValue) || originalValue < 0) {
            setPanelStatus('Prisma did not expose a valid value for this cell.', 'error');
            return;
        }

        busy = true;
        updateButtonState();
        setPanelStatus('Reading the exact campaign budget…', 'busy');

        try {
            const base = await readBudgetSnapshot();
            if (!base) {
                throw new Error('Prisma did not expose an exact campaign budget on this view.');
            }
            if (base.budgetType && !/total client cost/i.test(base.budgetType)) {
                throw new Error(`This campaign uses ${base.budgetType}; Total client cost is required.`);
            }

            const headroom = roundCurrency(base.budget - base.buyTotal);
            if (headroom <= 0) {
                throw new Error(
                    headroom === 0
                        ? 'The campaign is already at its budget.'
                        : `The campaign is already ${formatCurrency(Math.abs(headroom))} over budget.`
                );
            }

            const probeDelta = roundCurrency(Math.max(0.01, Math.min(1, headroom / 2)));
            const probeValue = roundCurrency(originalValue + probeDelta);
            setPanelStatus('Measuring Prisma’s billable response…', 'busy');
            await commitCellValue(selectedCellId, probeValue);

            const probe = await readBudgetSnapshot(base.buyTotal);
            if (!probe || Math.abs(probe.buyTotal - base.buyTotal) < 0.005) {
                const restored = await restoreOriginalValue(originalValue);
                const projection = restored
                    ? getSingleBookingProjection(base, originalValue)
                    : null;
                if (projection && projection.targetValue > originalValue) {
                    setPanelStatus(
                        `Prisma does not recalculate this single booking before save. ` +
                        `Setting projected Cost ${formatCurrency(projection.targetValue)}…`,
                        'busy'
                    );
                    try {
                        await commitCellValue(selectedCellId, projection.targetValue);
                    } catch (_error) {
                        const projectedRestore = await restoreOriginalValue(originalValue);
                        throw new Error(withRestoreResult(
                            'Prisma could not enter the projected Cost.',
                            projectedRestore
                        ));
                    }
                    finishSuccessfulMax(
                        `Set Cost to ${formatCurrency(projection.targetValue)}. ` +
                        `Projected Buy total after Prisma recalculates: ` +
                        `${formatCurrency(projection.projectedTotal)}; ` +
                        `${formatCurrency(projection.remaining)} remains. ` +
                        `Review, then use Prisma’s normal Save action.`
                    );
                    return;
                }
                throw new Error(withRestoreResult(
                    'Prisma did not recalculate Total client cost from this Cost cell. ' +
                    'The booking may use a separate billable driver.',
                    restored
                ));
            }

            if (Math.abs(probe.budget - probe.buyTotal) < 0.005) {
                finishSuccessfulMax(
                    `Set to ${formatCurrency(probeValue)}. Projected Buy total ${formatCurrency(probe.buyTotal)}; ` +
                    `${formatCurrency(0)} remains. Review and save in Prisma when ready.`
                );
                return;
            }

            const solved = calculateTargetFromProbe({
                originalValue,
                baseBuyTotal: base.buyTotal,
                probeValue,
                probeBuyTotal: probe.buyTotal,
                budget: base.budget
            });
            if (!solved || solved.targetValue < 0) {
                const restored = await restoreOriginalValue(originalValue);
                throw new Error(withRestoreResult(
                    'The selected cell did not increase the billable Buy total predictably.',
                    restored
                ));
            }

            let candidate = solved.targetValue;
            let previousValue = probeValue;
            let previous = probe;
            let finalSnapshot = probe;
            let responseRate = solved.responseRate;

            for (let attempt = 0; attempt < MAX_SOLVE_ATTEMPTS; attempt += 1) {
                setPanelStatus(
                    attempt === 0
                        ? `Setting ${formatCurrency(candidate)}…`
                        : 'Correcting for Prisma rounding…',
                    'busy'
                );
                await commitCellValue(selectedCellId, candidate);
                finalSnapshot = await readBudgetSnapshot(previous.buyTotal);
                if (!finalSnapshot) break;

                const remaining = roundCurrency(finalSnapshot.budget - finalSnapshot.buyTotal);
                if (Math.abs(remaining) < 0.005) break;

                const valueDelta = candidate - previousValue;
                const buyDelta = finalSnapshot.buyTotal - previous.buyTotal;
                if (Math.abs(valueDelta) >= 0.005 && Math.abs(buyDelta) >= 0.005) {
                    const observedRate = buyDelta / valueDelta;
                    if (Number.isFinite(observedRate) && observedRate > 0) {
                        responseRate = observedRate;
                    }
                }

                const rawCorrection = remaining / responseRate;
                const pennyCorrection = remaining > 0
                    ? Math.floor(rawCorrection * 100) / 100
                    : Math.ceil(rawCorrection * 100) / 100;
                if (Math.abs(pennyCorrection) < 0.01) break;

                previousValue = candidate;
                previous = finalSnapshot;
                candidate = roundCurrency(Math.max(0, candidate + pennyCorrection));
            }

            if (!finalSnapshot) {
                const restored = await restoreOriginalValue(originalValue);
                throw new Error(withRestoreResult(
                    'Prisma stopped exposing the exact Buy total.',
                    restored
                ));
            }

            let remaining = roundCurrency(finalSnapshot.budget - finalSnapshot.buyTotal);
            if (remaining < 0) {
                for (let attempt = 0; attempt < 10 && remaining < 0; attempt += 1) {
                    candidate = roundCurrency(Math.max(0, candidate - 0.01));
                    await commitCellValue(selectedCellId, candidate);
                    finalSnapshot = await readBudgetSnapshot(finalSnapshot.buyTotal) || finalSnapshot;
                    remaining = roundCurrency(finalSnapshot.budget - finalSnapshot.buyTotal);
                }
            }

            if (remaining < 0) {
                const restored = await restoreOriginalValue(originalValue);
                throw new Error(withRestoreResult(
                    'Prisma could not reach the budget without exceeding it.',
                    restored
                ));
            }

            finishSuccessfulMax(
                `Set to ${formatCurrency(candidate)}. Projected Buy total ${formatCurrency(finalSnapshot.buyTotal)}; ` +
                `${formatCurrency(remaining)} remains. Review and save in Prisma when ready.`
            );
        } catch (error) {
            setPanelStatus(error?.message || 'The campaign budget could not be calculated safely.', 'error');
        } finally {
            busy = false;
            updateButtonState();
        }
    }

    function handlePointerDown(event) {
        if (!settingsLoaded || !featureEnabled || busy) return;

        const path = event.composedPath?.() || [];
        const featureControl = path.find(node =>
            node instanceof Element &&
            (
                node.id === FLOATING_PANEL_ID ||
                node.id === ACTUALISE_BUTTON_ID ||
                node.closest?.(`#${FLOATING_PANEL_ID}, #${ACTUALISE_BUTTON_ID}`)
            )
        );
        if (featureControl) return;

        const cell = path.find(node =>
            node instanceof Element &&
            node.matches(`${BUY_COST_CELL_SELECTOR}, ${ACTUALISE_COST_CELL_SELECTOR}`)
        ) || event.target.closest?.(`${BUY_COST_CELL_SELECTOR}, ${ACTUALISE_COST_CELL_SELECTOR}`);
        if (!cell) {
            if (isBuyRoute()) {
                selectedCellId = '';
                removeFloatingPanel();
            }
            updateButtonState();
            return;
        }

        selectedCellId = cell.id;
        if (isBuyRoute()) {
            if (isEditableTargetCell(cell)) {
                window.setTimeout(() => {
                    if (featureEnabled && document.getElementById(selectedCellId)) positionFloatingPanel(cell);
                    updateButtonState();
                }, 0);
            } else {
                removeFloatingPanel();
            }
        } else {
            removeFloatingPanel();
        }
        updateButtonState();
    }

    function handleViewportChange() {
        if (!settingsLoaded || !featureEnabled) {
            removeFeatureControls();
            return;
        }
        const cell = getTargetCell();
        if (isBuyRoute() && isEditableTargetCell(cell)) {
            positionFloatingPanel(cell);
        } else {
            removeFloatingPanel();
        }
    }

    function apply() {
        if (!settingsLoaded || !featureEnabled) {
            removeFeatureControls();
            return;
        }
        if (!isBuyRoute()) removeFloatingPanel();
        ensureActualiseButton();
        ensureNativeRevertNote();
        updateButtonState();
    }

    function initialize() {
        if (initialized) {
            apply();
            return;
        }
        initialized = true;

        document.addEventListener('pointerdown', handlePointerDown, true);
        window.addEventListener('resize', handleViewportChange);
        window.addEventListener('scroll', handleViewportChange, true);
        window.addEventListener('hashchange', () => {
            selectedCellId = '';
            cachedBudgetMetadata = null;
            removeFloatingPanel();
            apply();
        });
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

    window.maxCampaignBudgetFeature = {
        initialize,
        apply,
        parseCurrency,
        roundCurrency,
        calculateTargetFromProbe,
        calculateProjectedTarget,
        commitCellValue,
        finishSuccessfulMax,
        readBudgetSnapshot,
        maxSelectedCell
    };
})();

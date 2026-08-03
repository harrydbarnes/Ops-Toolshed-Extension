const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const featureCode = fs.readFileSync(
    path.resolve(__dirname, '../../features/max-campaign-budget.js'),
    'utf8'
);

describe('Max Campaign Budget', () => {
    function createFeature({
        url = 'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=CP123&ptb-mod=buy&ptb-ctx=digital&route=online',
        body = '',
        enabled = true
    } = {}) {
        const dom = new JSDOM(`<!doctype html><html><body>${body}</body></html>`, {
            runScripts: 'dangerously',
            url
        });
        let storageListener;
        dom.window.chrome = {
            storage: {
                sync: {
                    get: jest.fn((_keys, callback) => callback({ maxCampaignBudgetEnabled: enabled }))
                },
                onChanged: {
                    addListener: jest.fn(listener => { storageListener = listener; })
                }
            }
        };
        dom.window.eval(featureCode);
        return {
            dom,
            window: dom.window,
            document: dom.window.document,
            setEnabled(value) {
                storageListener({ maxCampaignBudgetEnabled: { newValue: value } }, 'sync');
            }
        };
    }

    test('responds to the Settings feature and removes its visible controls when disabled', () => {
        jest.useFakeTimers();
        const feature = createFeature({
            enabled: false,
            body: '<table><tr><td id="plannedCost-1">Â£25.00</td></tr></table>'
        });
        feature.window.maxCampaignBudgetFeature.initialize();
        feature.document.getElementById('plannedCost-1').dispatchEvent(
            new feature.window.Event('pointerdown', { bubbles: true, composed: true })
        );
        jest.runOnlyPendingTimers();
        expect(feature.document.getElementById('toolshed-max-budget-panel')).toBeNull();

        feature.setEnabled(true);
        feature.document.getElementById('plannedCost-1').dispatchEvent(
            new feature.window.Event('pointerdown', { bubbles: true, composed: true })
        );
        jest.runOnlyPendingTimers();
        expect(feature.document.getElementById('toolshed-max-budget-panel')).not.toBeNull();

        feature.setEnabled(false);
        expect(feature.document.getElementById('toolshed-max-budget-panel')).toBeNull();
        jest.useRealTimers();
        feature.dom.window.close();
    });

    test('parses exact, abbreviated, and accounting-style currency values', () => {
        const { dom, window } = createFeature();
        const { parseCurrency } = window.maxCampaignBudgetFeature;

        expect(parseCurrency('£8,376.32 buy total')).toBe(8376.32);
        expect(parseCurrency('£1.2k budget')).toBe(1200);
        expect(parseCurrency('£1.5m')).toBe(1500000);
        expect(parseCurrency('(£25.10)')).toBe(-25.1);
        expect(Number.isNaN(parseCurrency(''))).toBe(true);
        dom.window.close();
    });

    test('solves the new Cost from Prisma billable probe response', () => {
        const { dom, window } = createFeature();
        const result = window.maxCampaignBudgetFeature.calculateTargetFromProbe({
            originalValue: 7684.69,
            baseBuyTotal: 8376.32,
            probeValue: 7685.69,
            probeBuyTotal: 8377.41,
            budget: 8384
        });

        expect(result.responseRate).toBeCloseTo(1.09, 8);
        expect(result.targetValue).toBe(7691.74);
        dom.window.close();
    });

    test('projects a safe single-booking Cost from its current billable components', () => {
        const { dom, window } = createFeature();
        const result = window.maxCampaignBudgetFeature.calculateProjectedTarget({
            originalValue: 750,
            currentTotal: 638.14,
            budget: 1000,
            components: [637.5, 0, 0.64, 0]
        });

        expect(result).toEqual({
            targetValue: 1175.29,
            projectedTotal: 1000,
            remaining: 0
        });
        dom.window.close();
    });

    test('shows the matching action below an editable Buy Cost cell only', () => {
        jest.useFakeTimers();
        const { dom, window, document } = createFeature({
            body: `
                <table>
                    <tr><td id="plannedCost-0" class="cell-read-only group-cell">£100.00</td></tr>
                    <tr><td id="plannedCost-1">£25.00</td></tr>
                </table>
            `
        });
        window.maxCampaignBudgetFeature.initialize();

        document.getElementById('plannedCost-1').dispatchEvent(
            new window.Event('pointerdown', { bubbles: true, composed: true })
        );
        jest.runOnlyPendingTimers();

        const panel = document.getElementById('toolshed-max-budget-panel');
        expect(panel).not.toBeNull();
        expect(panel.querySelector('.toolshed-max-budget-button').textContent).toBe('Max Campaign Budget');
        expect(panel.querySelector('.toolshed-max-budget-button').disabled).toBe(false);
        expect(panel.querySelector('.toolshed-max-budget-close')).not.toBeNull();

        document.body.dispatchEvent(
            new window.Event('pointerdown', { bubbles: true, composed: true })
        );
        expect(document.getElementById('toolshed-max-budget-panel')).toBeNull();

        document.getElementById('plannedCost-1').dispatchEvent(
            new window.Event('pointerdown', { bubbles: true, composed: true })
        );
        jest.runOnlyPendingTimers();
        expect(document.getElementById('toolshed-max-budget-panel')).not.toBeNull();

        panel.remove();
        document.getElementById('plannedCost-0').dispatchEvent(
            new window.Event('pointerdown', { bubbles: true, composed: true })
        );
        jest.runOnlyPendingTimers();
        expect(document.getElementById('toolshed-max-budget-panel')).toBeNull();

        jest.useRealTimers();
        dom.window.close();
    });

    test('lets the user close the Buy action panel', () => {
        jest.useFakeTimers();
        const { dom, window, document } = createFeature({
            body: `
                <table><tr>
                    <td id="plannedCost-1">
                        Â£25.00
                        <i class="mo-menu-caret has-action"></i>
                    </td>
                </tr></table>
                <ul class="dropdown-menu show">
                    <li><a role="menuitem">Revert change</a></li>
                </ul>
            `
        });
        const cell = document.getElementById('plannedCost-1');
        const caret = cell.querySelector('.mo-menu-caret');
        caret.addEventListener('click', () => {
            document.body.insertAdjacentHTML('beforeend', `
                <ul class="dropdown-menu show">
                    <li><a role="menuitem">Revert change</a></li>
                </ul>
            `);
        });
        window.maxCampaignBudgetFeature.initialize();

        cell.dispatchEvent(
            new window.Event('pointerdown', { bubbles: true, composed: true })
        );
        jest.runOnlyPendingTimers();
        window.maxCampaignBudgetFeature.apply();

        const nativeMenu = document.querySelector('.dropdown-menu.show');
        const dismissNativeMenu = () => nativeMenu.remove();
        document.addEventListener('click', dismissNativeMenu, true);

        const closeButton = document.querySelector('.toolshed-max-budget-close');
        closeButton.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
        closeButton.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }));
        closeButton.click();
        jest.runOnlyPendingTimers();

        expect(document.getElementById('toolshed-max-budget-panel')).toBeNull();
        expect(document.querySelector('.dropdown-menu.show')).not.toBeNull();
        expect(document.querySelector('.dropdown-menu.show')).not.toBe(nativeMenu);

        jest.useRealTimers();
        dom.window.close();
    });

    test('labels Prisma Revert change after Toolshed inserts a max value', () => {
        const { dom, window, document } = createFeature({
            body: `
                <table><tr>
                    <td id="plannedCost-1" data-toolshed-max-budget-inserted="true">Â£42.50</td>
                </tr></table>
                <ul class="dropdown-menu show">
                    <li role="presentation">
                        <a role="menuitem" href="JavaScript: void(0)">Revert change</a>
                    </li>
                </ul>
            `
        });
        window.maxCampaignBudgetFeature.initialize();
        document.getElementById('plannedCost-1').dispatchEvent(
            new window.Event('pointerdown', { bubbles: true, composed: true })
        );
        window.maxCampaignBudgetFeature.apply();

        const note = document.querySelector('.toolshed-max-budget-native-note');
        expect(note.textContent).toBe('Max value inserted by Toolshed');

        document.querySelector('a[role="menuitem"]').click();
        expect(document.querySelector('.toolshed-max-budget-native-note')).toBeNull();
        expect(document.getElementById('plannedCost-1')
            .hasAttribute('data-toolshed-max-budget-inserted')).toBe(false);
        dom.window.close();
    });

    test('shows a confirmation toast after a max value is inserted', () => {
        jest.useFakeTimers();
        const { dom, window, document } = createFeature({
            body: '<table><tr><td id="plannedCost-1">Â£25.00</td></tr></table>'
        });
        window.utils = { showToast: jest.fn() };
        window.maxCampaignBudgetFeature.initialize();
        document.getElementById('plannedCost-1').dispatchEvent(
            new window.Event('pointerdown', { bubbles: true, composed: true })
        );
        jest.runOnlyPendingTimers();

        window.maxCampaignBudgetFeature.finishSuccessfulMax('Inserted successfully.');

        expect(window.utils.showToast).toHaveBeenCalledWith(
            'value inputted, now review and apply as needed',
            'success'
        );
        expect(document.getElementById('toolshed-max-budget-panel')).toBeNull();

        jest.useRealTimers();
        dom.window.close();
    });

    test('adds a disabled month action until an editable Actualise Gross payable cell is selected', () => {
        const { dom, window, document } = createFeature({
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP123&ptb-mod=buy&ptb-ctx=actualize&route=actualize&mos=2026-07-01',
            body: `
                <div id="toolbar-group-left">
                    <button id="redistributeAllButton" class="mo-btn mo-btn-primary mo-disabled">Redistribute all</button>
                </div>
                <table><tr><td id="payableActualCostJul26-2">£100.00</td></tr></table>
            `
        });
        window.maxCampaignBudgetFeature.initialize();

        const button = document.getElementById('toolshed-max-budget-actualise');
        expect(button).not.toBeNull();
        expect(button.textContent).toBe('Max Campaign Budget');
        expect(button.classList).toContain('mo-btn');
        expect(button.classList).toContain('mo-btn-primary');
        expect(button.classList).not.toContain('toolshed-max-budget-month-button');
        expect(button.disabled).toBe(true);

        document.getElementById('payableActualCostJul26-2').dispatchEvent(
            new window.Event('pointerdown', { bubbles: true, composed: true })
        );
        expect(button.disabled).toBe(false);
        expect(button.classList).not.toContain('mo-disabled');
        dom.window.close();
    });

    test('reads exact budget values after opening the native budget popover', async () => {
        const { dom, window, document } = createFeature({
            body: '<div id="campaign-budget-overview-container"></div>'
        });
        const container = document.getElementById('campaign-budget-overview-container');
        container.addEventListener('mouseover', () => {
            if (document.querySelector('[data-cy="budget-amount"]')) return;
            document.body.insertAdjacentHTML('beforeend', `
                <div data-cy="budget-amount">£8,384.00 budget</div>
                <div data-cy="budget-purchased">£8,376.32 buy total (billable amount)</div>
                <div data-cy="budget-type-label">Total client cost (budget type)</div>
            `);
        });

        const snapshot = await window.maxCampaignBudgetFeature.readBudgetSnapshot();
        expect(snapshot).toEqual({
            budget: 8384,
            buyTotal: 8376.32,
            budgetType: 'Total client cost (budget type)'
        });
        dom.window.close();
    });

    test('reads a whole-pound budget from the collapsed label and live progress without hovering', async () => {
        const { dom, window } = createFeature({
            body: `
                <mo-popover>
                    <div id="campaign-budget-overview-container">
                        <div data-cy="budget-progress-bar"><div style="width: 63.81%"></div></div>
                        <span data-cy="total-budget">£1k</span>
                    </div>
                </mo-popover>
                <table>
                    <tr>
                        <td id="placementName-0" data-row="0" class="table-row-total">Media total</td>
                        <td id="budgetTotalClientCostBillable-0">£638.14</td>
                    </tr>
                </table>
            `
        });

        const snapshot = await window.maxCampaignBudgetFeature.readBudgetSnapshot();
        expect(snapshot).toEqual({
            budget: 1000,
            buyTotal: 638.14,
            budgetType: ''
        });
        dom.window.close();
    });

    test('recovers the exact whole-pound budget behind a rounded thousands label', async () => {
        const { dom, window } = createFeature({
            body: `
                <div id="campaign-budget-overview-container">
                    <div data-cy="budget-progress-bar"><div style="width: 99.91%"></div></div>
                    <span data-cy="total-budget">£8.4k</span>
                </div>
                <table>
                    <tr>
                        <td id="placementName-0" data-row="0" class="table-row-total">Media total</td>
                        <td id="budgetTotalClientCostBillable-0">£8,376.32</td>
                    </tr>
                </table>
            `
        });

        const snapshot = await window.maxCampaignBudgetFeature.readBudgetSnapshot();
        expect(snapshot.budget).toBe(8384);
        expect(snapshot.buyTotal).toBe(8376.32);
        dom.window.close();
    });

    test('uses section Total client cost rows after the popover supplies exact budget metadata', async () => {
        const { dom, window, document } = createFeature({
            body: `
                <div id="campaign-budget-overview-container"></div>
                <table>
                    <tr>
                        <td id="placementName-0" data-row="0" class="table-row-total">Media total</td>
                        <td id="budgetTotalClientCostBillable-0">£8,222.62</td>
                    </tr>
                    <tr>
                        <td id="placementName-4" data-row="4" class="table-row-total">Fee</td>
                        <td id="budgetTotalClientCostBillable-4">£153.70</td>
                    </tr>
                </table>
            `
        });
        const container = document.getElementById('campaign-budget-overview-container');
        container.addEventListener('mouseover', () => {
            if (document.querySelector('[data-cy="budget-amount"]')) return;
            document.body.insertAdjacentHTML('beforeend', `
                <div data-cy="budget-amount">£8,384.00 budget</div>
                <div data-cy="budget-purchased">£1.00 stale popover total</div>
                <div data-cy="budget-type-label">Total client cost (budget type)</div>
            `);
        });

        const snapshot = await window.maxCampaignBudgetFeature.readBudgetSnapshot();
        expect(snapshot.buyTotal).toBe(8376.32);
        dom.window.close();
    });

    test('commits a value through the Handsontable editor contract', async () => {
        const { dom, window, document } = createFeature({
            body: '<table><tr><td id="plannedCost-1">£25.00</td></tr></table>'
        });
        const cell = document.getElementById('plannedCost-1');
        let keyupDispatched = false;
        let doubleClickDispatched = false;
        let cellEnterCount = 0;
        cell.addEventListener('dblclick', () => {
            doubleClickDispatched = true;
        });
        cell.addEventListener('keydown', event => {
            if (event.key !== 'Enter') return;
            cellEnterCount += 1;
            if (cellEnterCount === 1) return;
            const editor = document.createElement('textarea');
            editor.className = 'handsontableInput';
            editor.addEventListener('keydown', event => {
                if (event.key !== 'Enter') return;
                cell.textContent = `£${Number(editor.value).toFixed(2)}`;
                editor.remove();
            });
            editor.addEventListener('keyup', () => {
                keyupDispatched = true;
                cell.textContent = '£25.00';
            });
            document.body.appendChild(editor);
        });

        await window.maxCampaignBudgetFeature.commitCellValue('plannedCost-1', 42.5);
        expect(cell.textContent).toBe('£42.50');
        expect(keyupDispatched).toBe(false);
        expect(doubleClickDispatched).toBe(false);
        expect(cellEnterCount).toBe(2);
        dom.window.close();
    });
});

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const featureScript = fs.readFileSync(path.resolve(__dirname, '../../features/order-id-copy.js'), 'utf8');

describe('Order ID Copy Feature', () => {
    let dom, window, document, storageListener;

    beforeEach(() => {
        jest.useFakeTimers();
        dom = new JSDOM('<!DOCTYPE html><html><body><table><tbody><tr><td class="pad"><a href="#">O-12345-R0</a></td></tr></tbody></table></body></html>', {
            url: "https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=CP123&ptb-mod=buy&ptb-ctx=orderSummary&showOrders=true",
            runScripts: "dangerously"
        });
        window = dom.window;
        document = window.document;
        storageListener = null;

        // Mock Chrome API
        window.chrome = {
            runtime: {
                id: 'test-extension',
                sendMessage: jest.fn().mockResolvedValue({ status: 'success' })
            },
            storage: {
                sync: {
                    get: jest.fn((key, cb) => cb({ orderIdCopyEnabled: true }))
                },
                onChanged: {
                    addListener: jest.fn(listener => { storageListener = listener; })
                }
            }
        };

        // Mock utils (though we replaced it, keeping just in case)
        window.utils = {};

        // Inject script
        const scriptEl = document.createElement('script');
        scriptEl.textContent = featureScript;
        document.body.appendChild(scriptEl);
    });

    afterEach(() => {
        dom?.window.close();
        jest.useRealTimers();
    });

    test('should add copy button and apply flexbox to cell', () => {
        window.orderIdCopyFeature.checkAndAddCopyButtons();

        const cell = document.querySelector('td.pad');
        const button = document.querySelector('.order-id-copy-btn');

        expect(button).not.toBeNull();
        expect(cell.contains(button)).toBe(true);
        expect(cell.classList.contains('order-id-copy-cell')).toBe(true);
    });

    test('does not scan or add Copy buttons in the new Order UI', () => {
        document.body.insertAdjacentHTML('afterbegin', `
            <div id="cm-buy-sidebar-order-revisions-header">
                <div class="mo-nav-list-item-accessory-content"><mo-menu></mo-menu></div>
            </div>
        `);

        const querySelectorAll = jest.spyOn(document, 'querySelectorAll');
        window.orderIdCopyFeature.checkAndAddCopyButtons();

        expect(document.querySelector('.order-id-copy-btn')).toBeNull();
        expect(document.querySelector('td.pad').classList).not.toContain('order-id-copy-cell');
        expect(querySelectorAll.mock.calls.some(([selector]) => selector === 'td.pad')).toBe(false);
    });

    test('removes stale legacy controls when Prisma changes to the new Order UI in place', () => {
        window.orderIdCopyFeature.checkAndAddCopyButtons();
        expect(document.querySelector('.order-id-copy-btn')).not.toBeNull();
        expect(document.querySelector('td.pad').classList).toContain('order-id-copy-cell');

        document.body.insertAdjacentHTML('afterbegin', `
            <div id="cm-buy-sidebar-order-revisions-header">
                <div class="mo-nav-list-item-accessory-content"><mo-menu></mo-menu></div>
            </div>
        `);
        const querySelectorAll = jest.spyOn(document, 'querySelectorAll');

        window.orderIdCopyFeature.checkAndAddCopyButtons();

        expect(document.querySelector('.order-id-copy-btn')).toBeNull();
        expect(document.querySelector('td.pad').classList).not.toContain('order-id-copy-cell');
        expect(querySelectorAll.mock.calls.some(([selector]) => selector === 'td.pad')).toBe(false);
    });

    test('copies only a clicked Order ID header from the new UI sidebar', async () => {
        document.body.insertAdjacentHTML('afterbegin', `
            <div id="cm-buy-sidebar-order-revisions-header">
                <div class="mo-nav-list-item-accessory-content"><mo-menu></mo-menu></div>
            </div>
            <div id="cm-buy-sidebar-nav-list">
                <div class="mo-nav-list-item mo-header3" id="0-0-0-O-D30UV6T-order-header">
                    <div class="mo-nav-list-item-content">O-D30UV6T</div>
                    <div class="mo-nav-list-item-accessory-content"></div>
                </div>
                <div class="mo-nav-list-item" id="order-revision-O-D30UV6T-1-0-order-details">
                    <div class="mo-nav-list-item-content">
                        <a class="document-drawer-order-details">Order 1</a>
                    </div>
                </div>
            </div>
        `);

        window.orderIdCopyFeature.checkAndAddCopyButtons();
        window.orderIdCopyFeature.checkAndAddCopyButtons();
        const orderIdTarget = document.querySelector(
            '#cm-buy-sidebar-nav-list [id$="-order-header"] > .mo-nav-list-item-content'
        );
        orderIdTarget.getBoundingClientRect = () => ({ left: 12, width: 80, bottom: 30 });
        orderIdTarget.click();
        await Promise.resolve();

        expect(window.chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
        expect(window.chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'copyOrderIdToClipboard',
            text: 'O-D30UV6T'
        });
        const toast = document.querySelector('.order-id-copy-toast');
        expect(toast.textContent).toBe('Order ID Copied to Clipboard!');
        expect(toast.style.left).toBe('52px');
        expect(toast.style.top).toBe('38px');
        const styles = document.getElementById('order-id-copy-styles').textContent;
        expect(styles).toMatch(/\[id\$="-order-header"\][\s\S]*cursor:\s*pointer/);
        expect(styles).not.toMatch(/cursor:\s*copy/);

        window.chrome.runtime.sendMessage.mockClear();
        document.querySelector('.document-drawer-order-details').click();
        await Promise.resolve();
        expect(window.chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });

    test('copies a clicked Order ID header from the new UI sidebar on the Buy route', async () => {
        window.history.replaceState(
            {},
            '',
            '#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=CP123&ptb-mod=buy&ptb-ctx=digital&route=online'
        );
        document.body.insertAdjacentHTML('afterbegin', `
            <div id="cm-buy-sidebar-order-revisions-header">
                <div class="mo-nav-list-item-accessory-content"><mo-menu></mo-menu></div>
            </div>
            <div id="cm-buy-sidebar-nav-list">
                <div class="mo-nav-list-item mo-header3" id="0-0-0-O-D38JVJUS-order-header">
                    <div class="mo-nav-list-item-content">O-D38JVJUS</div>
                    <div class="mo-nav-list-item-accessory-content"></div>
                </div>
            </div>
        `);

        window.orderIdCopyFeature.checkAndAddCopyButtons();
        const orderIdTarget = document.querySelector(
            '#cm-buy-sidebar-nav-list [id$="-order-header"] > .mo-nav-list-item-content'
        );
        orderIdTarget.click();
        await Promise.resolve();

        expect(window.chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'copyOrderIdToClipboard',
            text: 'O-D38JVJUS'
        });
        expect(document.querySelector('.order-id-copy-toast').textContent)
            .toBe('Order ID Copied to Clipboard!');
    });

    test('keeps the sidebar copy toast inside a narrow viewport', async () => {
        Object.defineProperty(window, 'innerWidth', {
            configurable: true,
            value: 220
        });
        const toastBounds = jest.spyOn(window.HTMLElement.prototype, 'getBoundingClientRect')
            .mockImplementation(function() {
                if (this.classList?.contains('order-id-copy-toast')) {
                    return { left: 0, top: 0, right: 180, bottom: 18, width: 180, height: 18 };
                }
                return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
            });

        document.body.insertAdjacentHTML('afterbegin', `
            <div id="cm-buy-sidebar-order-revisions-header">
                <div class="mo-nav-list-item-accessory-content"><mo-menu></mo-menu></div>
            </div>
            <div id="cm-buy-sidebar-nav-list">
                <div class="mo-nav-list-item" id="0-0-0-O-D38JVJUS-order-header">
                    <div class="mo-nav-list-item-content">O-D38JVJUS</div>
                </div>
            </div>
        `);
        window.orderIdCopyFeature.checkAndAddCopyButtons();
        const orderIdTarget = document.querySelector(
            '#cm-buy-sidebar-nav-list [id$="-order-header"] > .mo-nav-list-item-content'
        );
        orderIdTarget.getBoundingClientRect = () => ({ left: 0, width: 30, bottom: 30 });
        orderIdTarget.click();
        await Promise.resolve();

        const toast = document.querySelector('.order-id-copy-toast');
        expect(Number.parseFloat(toast.style.left)).toBeGreaterThanOrEqual(102);
        expect(document.getElementById('order-id-copy-styles').textContent)
            .toMatch(/max-width:\s*calc\(100vw - 24px\)/);
        toastBounds.mockRestore();
    });

    test('does not run the new-UI check for unrelated page clicks', () => {
        window.orderIdCopyFeature.checkAndAddCopyButtons();
        const newUiSelector = '#cm-buy-sidebar-order-revisions-header .mo-nav-list-item-accessory-content mo-menu';
        const querySelector = jest.spyOn(document, 'querySelector');
        const unrelatedButton = document.createElement('button');
        document.body.appendChild(unrelatedButton);

        unrelatedButton.click();

        expect(querySelector.mock.calls.filter(([selector]) => selector === newUiSelector)).toHaveLength(0);
    });

    test('should copy cleaned ID and show toast on click', async () => {
        window.orderIdCopyFeature.checkAndAddCopyButtons();
        const button = document.querySelector('.order-id-copy-btn');

        button.click();

        expect(window.chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'copyOrderIdToClipboard',
            text: 'O-12345'
        });

        // Check for toast
        await Promise.resolve(); // Wait for promise resolution

        const toast = document.querySelector('.order-id-copy-toast');
        expect(toast).not.toBeNull();
        expect(toast.textContent).toBe('Order ID Copied to Clipboard!');

        // Fast forward for animation class
        jest.advanceTimersByTime(20);
        expect(toast.classList.contains('show')).toBe(true);
    });

    test('should change button style temporarily on click', async () => {
        window.orderIdCopyFeature.checkAndAddCopyButtons();
        const button = document.querySelector('.order-id-copy-btn');
        const originalText = button.textContent;

        button.click();
        await Promise.resolve();

        expect(button.textContent).toBe('Copied!');
        expect(button.classList.contains('copied')).toBe(true);

        jest.advanceTimersByTime(2000);
        expect(button.textContent).toBe(originalText);
        expect(button.classList.contains('copied')).toBe(false);
    });

    test('removes visible legacy controls when disabled from Settings', () => {
        window.orderIdCopyFeature.initialize();
        expect(document.querySelector('.order-id-copy-btn')).not.toBeNull();

        storageListener({ orderIdCopyEnabled: { newValue: false } }, 'sync');

        expect(document.querySelector('.order-id-copy-btn')).toBeNull();
        expect(document.querySelector('td.pad').classList).not.toContain('order-id-copy-cell');
    });
});

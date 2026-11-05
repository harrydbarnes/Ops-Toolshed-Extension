const { JSDOM } = require('jsdom');
const fs = require('fs');
const { readScript } = require('../helpers/read-script');
const path = require('path');

const featureScript = readScript(path.resolve(__dirname, '../../features/order-view-toggle.js'));
const contentStyles = fs.readFileSync(
    path.resolve(__dirname, '../../content.css'),
    'utf8'
);

function createPage(enabled = true) {
    const dom = new JSDOM(`<!doctype html><html><body>
        <div id="cm-buy-sidebar-order-revisions-header">
            <span>ORDERS</span>
            <div class="mo-nav-list-item-accessory-content">
                <mo-popover><mo-menu aria-expanded="false"></mo-menu></mo-popover>
            </div>
        </div>
    </body></html>`, { runScripts: 'dangerously' });

    const nativeSelections = [];
    let storageListener;
    const menu = dom.window.document.querySelector('mo-menu');
    menu.addEventListener('mousedown', () => {
        menu.setAttribute('aria-expanded', 'true');
        ['all', 'latest'].forEach(view => {
            const item = dom.window.document.createElement('mo-menu-item');
            item.id = `ptb-orders-view-${view}`;
            item.addEventListener('click', () => {
                nativeSelections.push(view);
                menu.setAttribute('aria-expanded', 'false');
                dom.window.document.querySelectorAll('mo-menu-item').forEach(el => el.remove());
            });
            dom.window.document.body.appendChild(item);
        });
    });

    dom.window.chrome = {
        storage: {
            sync: {
                get: (_key, callback) => callback({
                    newOrderUiOptimisationEnabled: enabled
                })
            },
            onChanged: {
                addListener: listener => {
                    storageListener = listener;
                }
            }
        }
    };
    dom.window.eval(featureScript);

    return {
        dom,
        nativeSelections,
        setEnabled(value) {
            storageListener({
                newOrderUiOptimisationEnabled: { newValue: value }
            }, 'sync');
        }
    };
}

const flushAsync = () => new Promise(resolve => setTimeout(resolve, 0));

describe('new order UI optimisation', () => {
    test('keeps the native menu hidden when Prisma reparents it after selection', () => {
        expect(contentStyles).toMatch(
            /\.mo-nav-list-item-accessory-content\s*>\s*:is\(mo-popover, mo-menu\)/
        );
    });

    test('defaults to Latest and uses Prisma native menu actions', async () => {
        const page = createPage();
        page.dom.window.orderViewToggleFeature.initialize();
        await flushAsync();

        const toggle = page.dom.window.document.querySelector('.order-view-toggle');
        expect(toggle).not.toBeNull();
        expect(toggle.getAttribute('aria-label')).toBe('Order versions shown');
        expect(toggle.querySelector('[data-order-view="latest"]').getAttribute('aria-pressed')).toBe('true');
        expect(page.nativeSelections).toEqual(['latest']);

        toggle.querySelector('[data-order-view="all"]').click();
        await flushAsync();

        expect(page.nativeSelections).toEqual(['latest', 'all']);
        expect(toggle.querySelector('[data-order-view="all"]').getAttribute('aria-pressed')).toBe('true');
        expect(toggle.querySelector('[data-order-view="latest"]').getAttribute('aria-pressed')).toBe('false');
        page.dom.window.close();
    });

    test('restores the native menu when the setting is disabled', async () => {
        const page = createPage();
        page.dom.window.orderViewToggleFeature.initialize();
        await flushAsync();

        page.setEnabled(false);

        const document = page.dom.window.document;
        expect(document.querySelector('.order-view-toggle')).toBeNull();
        expect(document.getElementById('cm-buy-sidebar-order-revisions-header').classList.contains('order-view-toggle-active')).toBe(false);
        expect(document.querySelector('mo-popover')).not.toBeNull();
        page.dom.window.close();
    });

    test('reopens the native menu when aria-expanded is stale and its overlay is gone', async () => {
        const page = createPage();
        const { document } = page.dom.window;
        page.dom.window.orderViewToggleFeature.initialize();
        await flushAsync();
        document.querySelector('mo-menu').setAttribute('aria-expanded', 'true');

        document.querySelector('[data-order-view="all"]').click();
        await flushAsync();

        expect(page.nativeSelections).toEqual(['latest', 'all']);
        expect(document.querySelector('[data-order-view="all"]').getAttribute('aria-pressed')).toBe('true');
        page.dom.window.close();
    });

    test('retries if the first menu trigger only clears a stale open state', async () => {
        const page = createPage();
        const { document } = page.dom.window;
        page.dom.window.orderViewToggleFeature.initialize();
        await flushAsync();
        const menu = document.querySelector('mo-menu');
        // Model a component that consumes the first trigger to close its stale state.
        menu.addEventListener('mousedown', event => {
            event.stopImmediatePropagation();
        }, { capture: true, once: true });
        menu.setAttribute('aria-expanded', 'true');

        await page.dom.window.orderViewToggleFeature.selectOrderView(
            'all', document.querySelector('.order-view-toggle')
        );

        expect(page.nativeSelections).toEqual(['latest', 'all']);
        expect(document.querySelector('[data-order-view="all"]').getAttribute('aria-pressed')).toBe('true');
        page.dom.window.close();
    });

    test('does not select an option from a replacement campaign while a retry is pending', async () => {
        const page = createPage();
        const { document } = page.dom.window;
        page.dom.window.orderViewToggleFeature.initialize();
        await flushAsync();
        const menu = document.querySelector('mo-menu');
        menu.addEventListener('mousedown', event => event.stopImmediatePropagation(),
            { capture: true, once: true });

        const pending = page.dom.window.orderViewToggleFeature.selectOrderView(
            'all', document.querySelector('.order-view-toggle')
        );
        document.getElementById('cm-buy-sidebar-order-revisions-header').remove();
        const replacement = document.createElement('mo-menu-item');
        replacement.id = 'ptb-orders-view-all';
        const onSelect = jest.fn();
        replacement.addEventListener('click', onSelect);
        document.body.appendChild(replacement);

        expect(await pending).toBe(false);
        expect(onSelect).not.toHaveBeenCalled();
        expect(page.nativeSelections).toEqual(['latest']);
        page.dom.window.close();
    });

    test('does not render when disabled in Settings', async () => {
        const page = createPage(false);
        page.dom.window.orderViewToggleFeature.initialize();
        await flushAsync();

        expect(page.dom.window.document.querySelector('.order-view-toggle')).toBeNull();
        expect(page.nativeSelections).toEqual([]);
        page.dom.window.close();
    });

    test('does not retain Latest or All controls in the legacy Order UI', () => {
        const page = createPage();
        const { document } = page.dom.window;
        document.querySelector('mo-menu').remove();
        const staleToggle = document.createElement('div');
        staleToggle.className = 'order-view-toggle';
        document.getElementById('cm-buy-sidebar-order-revisions-header').appendChild(staleToggle);

        page.dom.window.orderViewToggleFeature.initialize();

        expect(document.querySelector('.order-view-toggle')).toBeNull();
        expect(page.dom.window.orderViewToggleFeature.isNewOrderUi()).toBe(false);
        page.dom.window.close();
    });

    test('removes Latest and All when Prisma changes from the new UI to legacy in place', async () => {
        const page = createPage();
        const { document } = page.dom.window;
        page.dom.window.orderViewToggleFeature.initialize();
        await flushAsync();
        expect(document.querySelector('.order-view-toggle')).not.toBeNull();

        document.querySelector('mo-menu').remove();
        page.dom.window.orderViewToggleFeature.reconcile();

        expect(document.querySelector('.order-view-toggle')).toBeNull();
        expect(document.getElementById('cm-buy-sidebar-order-revisions-header').classList)
            .not.toContain('order-view-toggle-active');
        page.dom.window.close();
    });
});

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const featureScript = fs.readFileSync(
    path.resolve(__dirname, '../../features/order-view-toggle.js'),
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

    test('does not render when disabled in Settings', async () => {
        const page = createPage(false);
        page.dom.window.orderViewToggleFeature.initialize();
        await flushAsync();

        expect(page.dom.window.document.querySelector('.order-view-toggle')).toBeNull();
        expect(page.nativeSelections).toEqual([]);
        page.dom.window.close();
    });
});

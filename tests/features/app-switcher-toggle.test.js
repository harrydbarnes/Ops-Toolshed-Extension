/**
 * @jest-environment node
 */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { readScript } = require('../helpers/read-script');

const featureScript = readScript(path.resolve(__dirname, '../../features/app-switcher-toggle.js'));
const contentStyles = fs.readFileSync(path.resolve(__dirname, '../../content.css'), 'utf8');

function createPage({
    enabled = true,
    brandingKey = 'prisma',
    menuLabel = 'Media',
    includeMainMenu = true
} = {}) {
    const menuHtml = includeMainMenu
        ? `<mo-menu class="main-menu pad hydrated" aria-expanded="false">
                <mo-text bold="" type="inherit" class="hydrated" data-full-text="${menuLabel}">${menuLabel}</mo-text>
           </mo-menu>`
        : '';

    const dom = new JSDOM(`<!doctype html><html><body>
        <mo-banner class="hydrated" branding-key="${brandingKey}">
            <div class="banner">
                <div class="left">
                    <a><i class="logo"></i></a>
                    ${menuHtml}
                </div>
            </div>
        </mo-banner>
    </body></html>`, {
        url: 'https://go.mediaocean.com/campaign-management/',
        runScripts: 'dangerously'
    });

    let storageListener;
    dom.window.chrome = {
        storage: {
            sync: {
                get: (_keys, callback) => callback({
                    appSwitcherToggleEnabled: enabled
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
    const navigateSpy = jest.fn();
    dom.window.appSwitcherToggleFeature.navigate = navigateSpy;

    return {
        dom,
        navigateSpy,
        setEnabled(value) {
            storageListener({
                appSwitcherToggleEnabled: { newValue: value }
            }, 'sync');
        }
    };
}

const flushAsync = () => new Promise(resolve => setTimeout(resolve, 0));

describe('Media / Production app switcher toggle', () => {
    test('defines dark-navy segmented toggle styles and hides native mo-menu.main-menu', () => {
        expect(contentStyles).toMatch(
            /mo-banner \.banner \.left\.app-switcher-toggle-active\s*>\s*mo-menu\.main-menu/
        );
        expect(contentStyles).toMatch(/\.app-switcher-toggle\s*\{/);
        expect(contentStyles).toMatch(/\.app-switcher-toggle button\[aria-pressed="true"\]/);
    });

    test('renders on Media (Prisma) with Media pressed', async () => {
        const page = createPage({ brandingKey: 'prisma', menuLabel: 'Media' });
        await page.dom.window.appSwitcherToggleFeature.initialize();
        await flushAsync();

        const { document } = page.dom.window;
        const left = document.querySelector('mo-banner .banner .left');
        const toggle = document.querySelector('.app-switcher-toggle');
        expect(left.classList.contains('app-switcher-toggle-active')).toBe(true);
        expect(toggle).not.toBeNull();
        expect(toggle.getAttribute('role')).toBe('group');
        expect(toggle.getAttribute('aria-label')).toBe('Switch between Media and Production');
        expect(toggle.querySelector('[data-app-switcher-target="media"]').getAttribute('aria-pressed')).toBe('true');
        expect(toggle.querySelector('[data-app-switcher-target="production"]').getAttribute('aria-pressed')).toBe('false');
        page.dom.window.close();
    });

    test('renders on Production (Aura) with Production pressed', async () => {
        const page = createPage({ brandingKey: 'rodick', menuLabel: 'Production' });
        await page.dom.window.appSwitcherToggleFeature.initialize();
        await flushAsync();

        const { document } = page.dom.window;
        const toggle = document.querySelector('.app-switcher-toggle');
        expect(toggle).not.toBeNull();
        expect(toggle.querySelector('[data-app-switcher-target="media"]').getAttribute('aria-pressed')).toBe('false');
        expect(toggle.querySelector('[data-app-switcher-target="production"]').getAttribute('aria-pressed')).toBe('true');
        page.dom.window.close();
    });

    test('falls back to branding-key when mo-text is absent', async () => {
        const page = createPage({ brandingKey: 'rodick', menuLabel: '' });
        const moText = page.dom.window.document.querySelector('mo-menu.main-menu mo-text');
        moText.remove();

        await page.dom.window.appSwitcherToggleFeature.initialize();
        await flushAsync();

        const toggle = page.dom.window.document.querySelector('.app-switcher-toggle');
        expect(toggle).not.toBeNull();
        expect(toggle.querySelector('[data-app-switcher-target="production"]').getAttribute('aria-pressed')).toBe('true');
        page.dom.window.close();
    });

    test('clicking the inactive button navigates to the target workflow URL and sets aria-busy', async () => {
        const page = createPage({ brandingKey: 'prisma', menuLabel: 'Media' });
        await page.dom.window.appSwitcherToggleFeature.initialize();
        await flushAsync();

        const toggle = page.dom.window.document.querySelector('.app-switcher-toggle');
        const productionBtn = toggle.querySelector('[data-app-switcher-target="production"]');
        const mediaBtn = toggle.querySelector('[data-app-switcher-target="media"]');

        productionBtn.click();

        expect(page.navigateSpy).toHaveBeenCalledTimes(1);
        expect(page.navigateSpy).toHaveBeenCalledWith('/ideskos-viewport/launchapp/?workflowid=estimates-and-costs');
        expect(toggle.getAttribute('aria-busy')).toBe('true');
        expect(productionBtn.disabled).toBe(true);
        expect(mediaBtn.disabled).toBe(true);
        expect(productionBtn.getAttribute('aria-pressed')).toBe('true');
        expect(mediaBtn.getAttribute('aria-pressed')).toBe('false');
        page.dom.window.close();
    });

    test('clicking the active button is a no-op', async () => {
        const page = createPage({ brandingKey: 'prisma', menuLabel: 'Media' });
        await page.dom.window.appSwitcherToggleFeature.initialize();
        await flushAsync();

        const toggle = page.dom.window.document.querySelector('.app-switcher-toggle');
        const mediaBtn = toggle.querySelector('[data-app-switcher-target="media"]');

        mediaBtn.click();

        expect(page.navigateSpy).not.toHaveBeenCalled();
        expect(toggle.hasAttribute('aria-busy')).toBe(false);
        expect(mediaBtn.disabled).toBe(false);
        page.dom.window.close();
    });

    test('disabling appSwitcherToggleEnabled via storage.onChanged removes toggle and active class', async () => {
        const page = createPage({ brandingKey: 'prisma', menuLabel: 'Media' });
        await page.dom.window.appSwitcherToggleFeature.initialize();
        await flushAsync();

        expect(page.dom.window.document.querySelector('.app-switcher-toggle')).not.toBeNull();

        page.setEnabled(false);

        const { document } = page.dom.window;
        expect(document.querySelector('.app-switcher-toggle')).toBeNull();
        expect(document.querySelector('mo-banner .banner .left').classList.contains('app-switcher-toggle-active')).toBe(false);
        expect(document.querySelector('mo-menu.main-menu')).not.toBeNull();
        page.dom.window.close();
    });

    test('does not activate for unrelated banner menu labels', async () => {
        const page = createPage({ brandingKey: 'other', menuLabel: 'Settings' });
        await page.dom.window.appSwitcherToggleFeature.initialize();
        await flushAsync();

        const { document } = page.dom.window;
        expect(document.querySelector('.app-switcher-toggle')).toBeNull();
        expect(document.querySelector('mo-banner .banner .left').classList.contains('app-switcher-toggle-active')).toBe(false);
        page.dom.window.close();
    });
});

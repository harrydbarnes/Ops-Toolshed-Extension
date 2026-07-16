const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const featureCode = fs.readFileSync(
    path.resolve(__dirname, '../../features/banner-username.js'),
    'utf8'
);

describe('Prisma banner username feature', () => {
    function createPage({ enabled = true, deferBannerParts = false } = {}) {
        const dom = new JSDOM('<!doctype html><html><body></body></html>', {
            runScripts: 'dangerously',
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/'
        });
        const { window } = dom;
        const listeners = [];
        let triggerClicks = 0;

        const userMenu = window.document.createElement('mo-banner-user-menu');
        const menuShadow = userMenu.attachShadow({ mode: 'open' });
        const menuLabel = window.document.createElement('div');
        menuLabel.className = 'user-menu-label';
        const accountLabel = window.document.createElement('div');
        accountLabel.className = 'user-company-name';
        accountLabel.textContent = 'GROUPM UK (OWNER)';
        accountLabel.getBoundingClientRect = () => ({ width: 132, height: 24 });
        menuLabel.appendChild(accountLabel);
        const menuTrigger = window.document.createElement('mo-menu');
        menuTrigger.setAttribute('aria-expanded', 'false');
        const attachBannerParts = () => menuShadow.append(menuTrigger, menuLabel);
        if (!deferBannerParts) attachBannerParts();
        window.document.body.appendChild(userMenu);

        menuLabel.addEventListener('click', () => {
            triggerClicks += 1;
            const isOpening = menuTrigger.getAttribute('aria-expanded') !== 'true';
            menuTrigger.setAttribute('aria-expanded', String(isOpening));
            window.document.getElementById('test-account-overlay')?.remove();
            if (!isOpening) return;

            const overlay = window.document.createElement('div');
            overlay.id = 'test-account-overlay';
            const overlayShadow = overlay.attachShadow({ mode: 'open' });
            const username = window.document.createElement('mo-text');
            username.id = 'mo-user-name';
            username.setAttribute('data-full-text', 'HBARN@NGMCLON');
            username.textContent = 'HBARN@NGMCLON';
            overlayShadow.appendChild(username);
            window.document.body.appendChild(overlay);
        });

        window.chrome = {
            storage: {
                sync: {
                    get: jest.fn((defaults, callback) => callback({ ...defaults, bannerUsernameEnabled: enabled }))
                },
                onChanged: {
                    addListener: jest.fn(listener => listeners.push(listener))
                }
            }
        };
        window.eval(featureCode);

        return {
            dom,
            window,
            listeners,
            accountLabel,
            attachBannerParts,
            menuTrigger,
            getTriggerClicks: () => triggerClicks
        };
    }

    async function settleDiscovery(window) {
        await Promise.resolve();
        await new Promise(resolve => window.setTimeout(resolve, 0));
        await Promise.resolve();
    }

    test('replaces the organisation with the username and closes its discovery menu', async () => {
        const page = createPage();

        page.window.bannerUsernameFeature.initialize();
        await settleDiscovery(page.window);

        expect(page.accountLabel.textContent).toBe('HBARN');
        expect(page.accountLabel.getAttribute('data-ops-toolshed-original-account-label')).toBe('GROUPM UK (OWNER)');
        expect(page.accountLabel.style.minWidth).toBe('132px');
        expect(page.menuTrigger.getAttribute('aria-expanded')).toBe('false');
        expect(page.getTriggerClicks()).toBe(2);
        expect(page.window.bannerUsernameFeature.getResolvedUsername()).toBe('HBARN');
        page.dom.window.close();
    });

    test('leaves the banner untouched when the setting is disabled', async () => {
        const page = createPage({ enabled: false });

        page.window.bannerUsernameFeature.initialize();
        await settleDiscovery(page.window);

        expect(page.accountLabel.textContent).toBe('GROUPM UK (OWNER)');
        expect(page.getTriggerClicks()).toBe(0);
        page.dom.window.close();
    });

    test('restores and reapplies the organisation label when the setting changes', async () => {
        const page = createPage();
        page.window.bannerUsernameFeature.initialize();
        await settleDiscovery(page.window);

        page.listeners[0]({ bannerUsernameEnabled: { oldValue: true, newValue: false } }, 'sync');
        expect(page.accountLabel.textContent).toBe('GROUPM UK (OWNER)');
        expect(page.accountLabel.hasAttribute('data-ops-toolshed-original-account-label')).toBe(false);
        expect(page.accountLabel.style.minWidth).toBe('');

        page.listeners[0]({ bannerUsernameEnabled: { oldValue: false, newValue: true } }, 'sync');
        expect(page.accountLabel.textContent).toBe('HBARN');
        expect(page.getTriggerClicks()).toBe(2);
        page.dom.window.close();
    });

    test('applies when Prisma renders the banner label inside Shadow DOM after initialization', async () => {
        const page = createPage({ deferBannerParts: true });

        page.window.bannerUsernameFeature.initialize();
        page.attachBannerParts();
        await settleDiscovery(page.window);
        await settleDiscovery(page.window);

        expect(page.accountLabel.textContent).toBe('HBARN');
        expect(page.getTriggerClicks()).toBe(2);
        page.dom.window.close();
    });

    test('applies the cached username when Prisma replaces the banner', async () => {
        const page = createPage();
        page.window.bannerUsernameFeature.initialize();
        await settleDiscovery(page.window);

        const replacementMenu = page.window.document.createElement('mo-banner-user-menu');
        const replacementShadow = replacementMenu.attachShadow({ mode: 'open' });
        const replacementLabel = page.window.document.createElement('div');
        replacementLabel.className = 'user-company-name';
        replacementLabel.textContent = 'ANOTHER ACCOUNT (OWNER)';
        replacementShadow.appendChild(replacementLabel);
        page.window.document.querySelector('mo-banner-user-menu').replaceWith(replacementMenu);

        page.window.bannerUsernameFeature.apply();

        expect(replacementLabel.textContent).toBe('HBARN');
        expect(replacementLabel.getAttribute('data-ops-toolshed-original-account-label')).toBe('ANOTHER ACCOUNT (OWNER)');
        page.dom.window.close();
    });

    test('only accepts Mediaocean-style username identifiers', () => {
        const page = createPage({ enabled: false });

        expect(page.window.bannerUsernameFeature.parseUsername('HBARN@NGMCLON')).toBe('HBARN');
        expect(page.window.bannerUsernameFeature.parseUsername('not an account')).toBeNull();
        expect(page.window.bannerUsernameFeature.parseUsername('Harry Barnes')).toBeNull();
        page.dom.window.close();
    });
});

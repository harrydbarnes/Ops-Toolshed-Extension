const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const featureCode = fs.readFileSync(
    path.resolve(__dirname, '../../features/banner-username.js'),
    'utf8'
);

describe('Prisma banner username feature', () => {
    function createPage({
        enabled = true,
        deferBannerParts = false,
        deferOverlayUsername = false,
        nestedOverlayUsername = false,
        cachedUsername = null,
        includePidOptions = false,
        pidOptionText = 'Alternative PID',
        initialAccountLabel = 'GROUPM UK (OWNER)'
    } = {}) {
        const dom = new JSDOM('<!doctype html><html><body></body></html>', {
            runScripts: 'dangerously',
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/'
        });
        const { window } = dom;
        const listeners = [];
        let triggerClicks = 0;
        let lastOpenedOverlay = null;

        const organisationMenu = window.document.createElement('mo-banner-sub-context-menu');
        const organisationShadow = organisationMenu.attachShadow({ mode: 'open' });
        const organisationLabel = window.document.createElement('div');
        organisationLabel.id = 'user-context-menu-label';
        organisationLabel.textContent = 'NGMCLON';
        organisationShadow.appendChild(organisationLabel);
        window.document.body.appendChild(organisationMenu);

        const userMenu = window.document.createElement('mo-banner-user-menu');
        const menuShadow = userMenu.attachShadow({ mode: 'open' });
        const menuLabel = window.document.createElement('div');
        menuLabel.className = 'user-menu-label';
        const accountLabel = window.document.createElement('div');
        accountLabel.className = 'user-company-name';
        accountLabel.textContent = initialAccountLabel;
        accountLabel.getBoundingClientRect = () => ({ width: 132, height: 24 });
        Object.defineProperty(menuLabel, 'offsetLeft', { value: 9 });
        Object.defineProperty(accountLabel, 'offsetLeft', { value: 45 });
        menuLabel.appendChild(accountLabel);
        const menuTrigger = window.document.createElement('mo-menu');
        menuTrigger.setAttribute('aria-expanded', 'false');
        menuTrigger.setAttribute('aria-controls', 'test-account-overlay');
        const attachBannerParts = () => menuShadow.append(menuTrigger, menuLabel);
        if (!deferBannerParts) attachBannerParts();
        window.document.body.appendChild(userMenu);

        menuLabel.addEventListener('click', event => {
            if (event.target !== accountLabel) return;
            triggerClicks += 1;
            const isOpening = menuTrigger.getAttribute('aria-expanded') !== 'true';
            menuTrigger.setAttribute('aria-expanded', String(isOpening));
            window.document.getElementById('test-account-overlay')?.remove();
            if (!isOpening) return;

            const overlay = window.document.createElement('div');
            overlay.id = 'test-account-overlay';
            lastOpenedOverlay = overlay;
            const overlayShadow = overlay.attachShadow({ mode: 'open' });
            const username = window.document.createElement('mo-text');
            username.id = 'mo-user-name';
            username.setAttribute('data-full-text', 'HBARN@NGMCLON');
            username.textContent = 'HBARN@NGMCLON';
            window.document.body.appendChild(overlay);
            const appendUsername = () => {
                if (!nestedOverlayUsername) {
                    overlayShadow.appendChild(username);
                    return;
                }
                const contentHost = window.document.createElement('mo-banner-user-menu-content');
                const contentShadow = contentHost.attachShadow({ mode: 'open' });
                contentShadow.appendChild(username);
                overlay.appendChild(contentHost);
            };
            if (deferOverlayUsername) {
                window.setTimeout(appendUsername, 0);
            } else {
                appendUsername();
            }
        });

        let pidOption = null;
        if (includePidOptions) {
            const pidOptions = window.document.createElement('div');
            pidOptions.className = 'pid-options';
            pidOption = window.document.createElement('button');
            pidOption.textContent = pidOptionText;
            pidOptions.appendChild(pidOption);
            window.document.body.appendChild(pidOptions);
        }

        const localStorage = {
            get: jest.fn((defaults, callback) => callback({
                ...defaults,
                ...(cachedUsername ? { opsToolshed_bannerUsername: cachedUsername } : {})
            })),
            set: jest.fn(),
            remove: jest.fn()
        };

        window.chrome = {
            storage: {
                sync: {
                    get: jest.fn((defaults, callback) => callback({ ...defaults, bannerUsernameEnabled: enabled }))
                },
                local: localStorage,
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
            organisationLabel,
            attachBannerParts,
            menuTrigger,
            pidOption,
            localStorage,
            getTriggerClicks: () => triggerClicks,
            getLastOpenedOverlay: () => lastOpenedOverlay
        };
    }

    async function settleDiscovery(window) {
        await Promise.resolve();
        await new Promise(resolve => window.setTimeout(resolve, 0));
        await Promise.resolve();
    }

    test('replaces the organisation with the username and closes its discovery menu', async () => {
        const page = createPage({ deferOverlayUsername: true });

        page.window.bannerUsernameFeature.initialize();
        await Promise.resolve();
        expect(page.getLastOpenedOverlay().style.getPropertyValue('visibility')).toBe('hidden');
        expect(page.getLastOpenedOverlay().style.getPropertyPriority('visibility')).toBe('important');
        await settleDiscovery(page.window);

        expect(page.accountLabel.textContent).toBe('HBARN@NGMCLON');
        expect(page.accountLabel.getAttribute('data-ops-toolshed-original-account-label')).toBe('GROUPM UK (OWNER)');
        expect(page.accountLabel.style.minWidth).toBe('132px');
        expect(page.accountLabel.style.textAlign).toBe('left');
        expect(page.accountLabel.style.left).toBe('');
        expect(page.menuTrigger.getAttribute('aria-expanded')).toBe('false');
        expect(page.getTriggerClicks()).toBe(2);
        expect(page.getLastOpenedOverlay().style.getPropertyValue('visibility')).toBe('');
        expect(page.window.bannerUsernameFeature.getResolvedUsername()).toBe('HBARN@NGMCLON');
        expect(page.localStorage.set).toHaveBeenCalledWith({ opsToolshed_bannerUsername: 'HBARN@NGMCLON' });
        page.dom.window.close();
    });

    test('reads the username from Prisma banner menu content Shadow DOM', async () => {
        const page = createPage({ nestedOverlayUsername: true });

        page.window.bannerUsernameFeature.initialize();
        await settleDiscovery(page.window);

        try {
            expect(page.accountLabel.textContent).toBe('HBARN@NGMCLON');
            expect(page.getTriggerClicks()).toBe(2);
        } finally {
            page.dom.window.close();
        }
    });

    test('leaves the banner untouched when the setting is disabled', async () => {
        const page = createPage({ enabled: false });

        page.window.bannerUsernameFeature.initialize();
        await settleDiscovery(page.window);

        expect(page.accountLabel.textContent).toBe('GROUPM UK (OWNER)');
        expect(page.getTriggerClicks()).toBe(0);

        const pageScan = jest.spyOn(page.window.document.documentElement, 'querySelectorAll');
        page.window.document.body.appendChild(page.window.document.createElement('div'));
        await settleDiscovery(page.window);
        expect(pageScan).not.toHaveBeenCalled();
        page.dom.window.close();
    });

    test('shows the remembered username immediately while silently verifying it', async () => {
        const page = createPage({ cachedUsername: 'HBARN2@NGMCLON', deferOverlayUsername: true });

        page.window.bannerUsernameFeature.initialize();
        await Promise.resolve();

        expect(page.accountLabel.textContent).toBe('HBARN2@NGMCLON');
        expect(page.getLastOpenedOverlay().style.getPropertyValue('visibility')).toBe('hidden');
        await settleDiscovery(page.window);
        expect(page.accountLabel.textContent).toBe('HBARN@NGMCLON');
        expect(page.getTriggerClicks()).toBe(2);
        page.dom.window.close();
    });

    test('uses the top-left organisation while silently verifying a remembered username', async () => {
        const page = createPage({ cachedUsername: 'HBARN2@OLDORG', deferOverlayUsername: true });

        page.window.bannerUsernameFeature.initialize();
        await Promise.resolve();

        expect(page.accountLabel.textContent).toBe('HBARN2@NGMCLON');
        expect(page.localStorage.set).toHaveBeenCalledWith({ opsToolshed_bannerUsername: 'HBARN2@NGMCLON' });
        await settleDiscovery(page.window);
        expect(page.accountLabel.textContent).toBe('HBARN@NGMCLON');
        expect(page.getTriggerClicks()).toBe(2);
        page.dom.window.close();
    });

    test('combines the native banner username with the organisation while silently verifying it', async () => {
        const page = createPage({ initialAccountLabel: 'HBARN2', deferOverlayUsername: true });

        page.window.bannerUsernameFeature.initialize();
        await Promise.resolve();

        expect(page.accountLabel.textContent).toBe('HBARN2@NGMCLON');
        await settleDiscovery(page.window);
        expect(page.accountLabel.textContent).toBe('HBARN@NGMCLON');
        expect(page.getTriggerClicks()).toBe(2);
        page.dom.window.close();
    });

    test('forgets the username when a PID option is selected', async () => {
        const page = createPage({ cachedUsername: 'HBARN2@NGMCLON', includePidOptions: true });

        page.window.bannerUsernameFeature.initialize();
        await Promise.resolve();
        page.pidOption.click();

        expect(page.localStorage.remove).toHaveBeenCalledWith('opsToolshed_bannerUsername');
        expect(page.window.bannerUsernameFeature.getResolvedUsername()).toBeNull();
        page.dom.window.close();
    });

    test('uses the selected PID and organisation without reopening the account menu', async () => {
        const page = createPage({ includePidOptions: true, pidOptionText: 'SECONDARYPID' });
        const selectedPid = page.pidOption.textContent.trim();
        const organisation = page.organisationLabel.textContent.trim();
        const expectedUsername = `${selectedPid}@${organisation}`;

        page.window.bannerUsernameFeature.initialize();
        await settleDiscovery(page.window);
        page.pidOption.click();
        page.accountLabel.textContent = 'GROUPM UK (OWNER)';
        await settleDiscovery(page.window);

        expect(page.accountLabel.textContent).toBe(expectedUsername);
        expect(page.window.bannerUsernameFeature.getResolvedUsername()).toBe(expectedUsername);
        expect(page.localStorage.set).toHaveBeenLastCalledWith({
            opsToolshed_bannerUsername: expectedUsername
        });
        expect(page.getTriggerClicks()).toBe(2);
        page.dom.window.close();
    });

    test('rediscovers the signed-in username after an account switch reuses the banner menu', async () => {
        const page = createPage({ includePidOptions: true });

        page.window.bannerUsernameFeature.initialize();
        await settleDiscovery(page.window);
        page.pidOption.click();

        page.accountLabel.textContent = 'GROUPM UK (OWNER)';
        await settleDiscovery(page.window);
        await settleDiscovery(page.window);

        expect(page.accountLabel.textContent).toBe('HBARN@NGMCLON');
        expect(page.getTriggerClicks()).toBe(4);
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
        expect(page.accountLabel.style.textAlign).toBe('');
        expect(page.accountLabel.style.left).toBe('');

        page.listeners[0]({ bannerUsernameEnabled: { oldValue: false, newValue: true } }, 'sync');
        expect(page.accountLabel.textContent).toBe('HBARN@NGMCLON');
        expect(page.getTriggerClicks()).toBe(2);
        page.dom.window.close();
    });

    test('applies when Prisma renders the banner label inside Shadow DOM after initialization', async () => {
        const page = createPage({ deferBannerParts: true });

        page.window.bannerUsernameFeature.initialize();
        page.attachBannerParts();
        await settleDiscovery(page.window);
        await settleDiscovery(page.window);

        expect(page.accountLabel.textContent).toBe('HBARN@NGMCLON');
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

        await settleDiscovery(page.window);
        await settleDiscovery(page.window);

        expect(replacementLabel.textContent).toBe('HBARN@NGMCLON');
        expect(replacementLabel.getAttribute('data-ops-toolshed-original-account-label')).toBe('ANOTHER ACCOUNT (OWNER)');
        page.dom.window.close();
    });

    test('keeps discovery scoped to banner hosts instead of scanning every page element', async () => {
        const page = createPage();
        page.window.bannerUsernameFeature.initialize();
        await settleDiscovery(page.window);

        const bodyScan = jest.spyOn(page.window.document.body, 'querySelectorAll');
        const unrelatedHost = page.window.document.createElement('div');
        const unrelatedShadow = unrelatedHost.attachShadow({ mode: 'open' });
        const unrelatedLabel = page.window.document.createElement('div');
        unrelatedLabel.className = 'user-company-name';
        unrelatedShadow.appendChild(unrelatedLabel);
        page.window.document.body.appendChild(unrelatedHost);
        await settleDiscovery(page.window);

        expect(bodyScan).not.toHaveBeenCalledWith('*');
        expect(unrelatedLabel.textContent).toBe('');
        page.dom.window.close();
    });

    test('only accepts Mediaocean-style username identifiers', () => {
        const page = createPage({ enabled: false });

        expect(page.window.bannerUsernameFeature.parseUsername('HBARN@NGMCLON')).toBe('HBARN@NGMCLON');
        expect(page.window.bannerUsernameFeature.parseUsername('not an account')).toBeNull();
        expect(page.window.bannerUsernameFeature.parseUsername('Harry Barnes')).toBeNull();
        page.dom.window.close();
    });
});

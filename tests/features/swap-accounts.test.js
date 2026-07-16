const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const featureScript = fs.readFileSync(path.resolve(__dirname, '../../features/swap-accounts.js'), 'utf8');

describe('Switch Accounts feature', () => {
    let dom;
    let window;
    let document;
    let waitForElementToDisappear;
    let pendingReturnUrl;

    async function createPage({
        url = 'https://groupmuk-prisma.mediaocean.com/',
        swapAccountsEnabled = true,
        rememberAccountSwitchUrlEnabled = true,
        pendingUrl = null
    } = {}) {
        pendingReturnUrl = pendingUrl;
        dom = new JSDOM(`<!DOCTYPE html><html><body>
            <div class="center" id="mo-banner-module-container"><div>Ready</div></div>
            <div id="banner-controls">
                <mo-banner-user-menu></mo-banner-user-menu>
            </div>
            <mo-menu-item>User profile</mo-menu-item>
            <div class="pid-options">
                <button class="mo-btn mo-active">Current account</button>
                <button class="mo-btn">Alternative account</button>
            </div>
            <button id="saveButton">Save</button>
            <div id="userRegistrationDialog"></div>
        </body></html>`, {
            url,
            runScripts: 'dangerously'
        });

        window = dom.window;
        document = window.document;

        const userMenu = document.querySelector('mo-banner-user-menu');
        const shadowRoot = userMenu.attachShadow({ mode: 'open' });
        shadowRoot.appendChild(document.createElement('mo-menu'));

        waitForElementToDisappear = jest.fn().mockResolvedValue();
        window.utils = {
            waitForElementInShadow: jest.fn().mockResolvedValue(userMenu),
            waitForElement: jest.fn().mockResolvedValue(document.getElementById('saveButton')),
            waitForElementToDisappear,
            showToast: jest.fn()
        };
        window.chrome = {
            runtime: {
                getURL: jest.fn(() => 'switch-accounts.css'),
                sendMessage: jest.fn(async message => {
                    if (message.action === 'rememberAccountSwitchUrl') {
                        pendingReturnUrl = message.url;
                        return { status: 'success' };
                    }
                    if (message.action === 'getAccountSwitchUrl') {
                        return { status: 'success', url: pendingReturnUrl };
                    }
                    if (message.action === 'clearAccountSwitchUrl') {
                        pendingReturnUrl = null;
                        return { status: 'success' };
                    }
                    return { status: 'error' };
                })
            },
            storage: {
                sync: {
                    get: jest.fn((defaults, callback) => callback({
                        ...defaults,
                        swapAccountsEnabled,
                        rememberAccountSwitchUrlEnabled
                    }))
                }
            }
        };
        window.fetch = jest.fn().mockResolvedValue({
            ok: true,
            text: jest.fn().mockResolvedValue('')
        });

        const script = document.createElement('script');
        script.textContent = featureScript;
        document.body.appendChild(script);
        window.swapAccountsFeature.initialize();

        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
    }

    beforeEach(async () => {
        await createPage();
    });

    afterEach(() => {
        dom.window.close();
        jest.useRealTimers();
    });

    test('allows 15 seconds for the account dialog to disappear after saving', async () => {
        const swapButton = document.querySelector('.switch-account-button');
        expect(swapButton).not.toBeNull();

        swapButton.click();
        await new Promise(resolve => window.setTimeout(resolve, 450));
        await Promise.resolve();

        expect(waitForElementToDisappear).toHaveBeenCalledWith('#userRegistrationDialog', 15000);
    });

    test('captures the current Prisma URL when the native User profile flow starts', async () => {
        window.history.replaceState({}, '', '/campaign-management/#osPspId=prsm-cm-plan-to-buy&campaign-id=CP123&route=online');

        document.querySelector('mo-menu-item').click();
        await Promise.resolve();

        expect(window.chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'rememberAccountSwitchUrl',
            url: window.location.href
        });
        expect(pendingReturnUrl).toBe(window.location.href);
    });

    test('reasserts the remembered campaign if Prisma forces Home after the first restore', async () => {
        dom.window.close();
        const target = 'https://groupmuk-prisma.mediaocean.com/campaign-management/#osPspId=prsm-cm-plan-to-buy&campaign-id=CP123&ptb-mod=buy&route=online';
        await createPage({
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#osPspId=cm-dashboard&route=campaigns',
            pendingUrl: target
        });
        await window.swapAccountsFeature.restorePendingUrl();

        await new Promise(resolve => window.setTimeout(resolve, 1400));
        expect(window.location.href).toBe(target);
        expect(pendingReturnUrl).toBe(target);

        window.location.hash = '#osAppId=prsm-cm-spa&osPspId=cm-dashboard&route=campaigns';
        await new Promise(resolve => window.setTimeout(resolve, 1400));

        expect(window.location.href).toBe(target);

        await new Promise(resolve => window.setTimeout(resolve, 5200));
        expect(pendingReturnUrl).toBeNull();
    }, 15000);

    test('does not clear a remembered URL before a delayed forced-Home transition', async () => {
        dom.window.close();
        const target = 'https://groupmuk-prisma.mediaocean.com/campaign-management/#osPspId=prsm-cm-plan-to-buy&campaign-id=CP123&ptb-mod=buy&route=online';
        await createPage({ url: target, pendingUrl: target });
        await window.swapAccountsFeature.restorePendingUrl();

        await new Promise(resolve => window.setTimeout(resolve, 5200));
        expect(pendingReturnUrl).toBe(target);

        window.location.hash = '#osAppId=prsm-cm-spa&osPspId=cm-dashboard&route=campaigns';
        await new Promise(resolve => window.setTimeout(resolve, 1400));

        expect(window.location.href).toBe(target);
    }, 10000);

    test('does not capture or restore URLs when remembering is disabled', async () => {
        dom.window.close();
        await createPage({ rememberAccountSwitchUrlEnabled: false });

        document.getElementById('saveButton').click();
        await Promise.resolve();

        expect(window.chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
            expect.objectContaining({ action: 'rememberAccountSwitchUrl' })
        );
    });

    test('still captures native account switches when the custom button is disabled', async () => {
        dom.window.close();
        await createPage({ swapAccountsEnabled: false });

        document.querySelector('mo-menu-item').click();
        await Promise.resolve();

        expect(document.querySelector('.switch-account-button')).toBeNull();
        expect(pendingReturnUrl).toBe(window.location.href);
    });
});

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const featureScript = fs.readFileSync(path.resolve(__dirname, '../../features/swap-accounts.js'), 'utf8');

describe('Switch Accounts feature', () => {
    let dom;
    let window;
    let document;
    let waitForElementToDisappear;

    async function createPage({
        url = 'https://groupmuk-prisma.mediaocean.com/',
        swapAccountsEnabled = true,
        rememberAccountSwitchUrlEnabled = true
    } = {}) {
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
            runtime: { getURL: jest.fn(() => 'switch-accounts.css') },
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
    });

    test('allows 15 seconds for the account dialog to disappear after saving', async () => {
        const swapButton = document.querySelector('.switch-account-button');
        expect(swapButton).not.toBeNull();

        swapButton.click();
        await new Promise(resolve => window.setTimeout(resolve, 450));
        await Promise.resolve();

        expect(waitForElementToDisappear).toHaveBeenCalledWith('#userRegistrationDialog', 15000);
    });

    test('captures the current Prisma URL when the native account dialog is saved', () => {
        window.history.replaceState({}, '', '/campaign-management/#osPspId=prsm-cm-plan-to-buy&campaign-id=CP123&route=online');

        document.getElementById('saveButton').click();

        const pending = JSON.parse(window.sessionStorage.getItem('opsToolshedAccountSwitchReturn'));
        expect(pending.url).toBe(window.location.href);
        expect(pending.createdAt).toEqual(expect.any(Number));
    });

    test('restores the remembered campaign after the switched account reaches Home', async () => {
        dom.window.close();
        const target = 'https://groupmuk-prisma.mediaocean.com/campaign-management/#osPspId=prsm-cm-plan-to-buy&campaign-id=CP123&ptb-mod=buy&route=online';
        await createPage({
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#osPspId=cm-dashboard&route=campaigns'
        });
        window.sessionStorage.setItem('opsToolshedAccountSwitchReturn', JSON.stringify({
            url: target,
            createdAt: Date.now()
        }));

        window.swapAccountsFeature.restorePendingUrl();
        await new Promise(resolve => window.setTimeout(resolve, 250));

        expect(window.location.href).toBe(target);
        expect(window.sessionStorage.getItem('opsToolshedAccountSwitchReturn')).toBeNull();
    });

    test('does not capture or restore URLs when remembering is disabled', async () => {
        dom.window.close();
        await createPage({ rememberAccountSwitchUrlEnabled: false });

        document.getElementById('saveButton').click();

        expect(window.sessionStorage.getItem('opsToolshedAccountSwitchReturn')).toBeNull();
    });

    test('still captures native account switches when the custom button is disabled', async () => {
        dom.window.close();
        await createPage({ swapAccountsEnabled: false });

        document.getElementById('saveButton').click();

        expect(document.querySelector('.switch-account-button')).toBeNull();
        expect(window.sessionStorage.getItem('opsToolshedAccountSwitchReturn')).not.toBeNull();
    });
});

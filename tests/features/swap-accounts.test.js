const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const featureScript = fs.readFileSync(path.resolve(__dirname, '../../features/swap-accounts.js'), 'utf8');

describe('Switch Accounts feature', () => {
    let dom;
    let window;
    let document;
    let waitForElementToDisappear;

    beforeEach(async () => {
        dom = new JSDOM(`<!DOCTYPE html><html><body>
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
            url: 'https://groupmuk-prisma.mediaocean.com/',
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
            storage: { sync: { get: jest.fn((key, callback) => callback({ swapAccountsEnabled: true })) } }
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
});

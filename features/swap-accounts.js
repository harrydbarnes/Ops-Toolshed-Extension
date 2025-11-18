(function() {
    'use strict';

    async function handleSwap(swapButton) {
        swapButton.disabled = true;
        swapButton.textContent = 'Swapping...';

        try {
            // 1. Find and click the user menu to open it.
            const userMenu = await utils.waitForElementInShadow('mo-banner-user-menu');
            if (!userMenu) throw new Error('Could not find user menu component.');

            // The actual clickable element is deeper in the shadow DOM.
            const clickableMenu = utils.queryShadowDom('mo-menu', userMenu.shadowRoot);
            if(!clickableMenu) throw new Error('Could not find clickable menu element.');
            clickableMenu.click();


            // 2. Wait for the menu content, then find and click "User Registration".
            const userMenuContent = await utils.waitForElement('mo-banner-user-menu-content', document, 5000);
            if (!userMenuContent) throw new Error('User menu content not found.');

            // The items are in the light DOM of the content element, not a shadow root.
            const labels = userMenuContent.querySelectorAll('.user-menu-item-label');
            const userRegistrationButton = Array.from(labels).find(el => el.textContent.trim() === 'User Registration');
            if (!userRegistrationButton) throw new Error('"User Registration" button not found in menu.');
            userRegistrationButton.click();

            // 3. Wait for the dialog and find the PID buttons.
            const pidOptionsContainer = await utils.waitForElement('div.pid-options', 5000);
            if (!pidOptionsContainer) throw new Error('PID options container not found in dialog.');

            // 4. Find the inactive PID button and click it.
            const inactiveButton = pidOptionsContainer.querySelector('button.mo-btn:not(.active)');
            if (!inactiveButton) throw new Error('Could not find an alternative PID to swap to.');
            inactiveButton.click();

            // 5. Find and click the Save button.
            const saveButton = await utils.waitForElement('#saveButton');
            if (!saveButton) throw new Error('Save button not found.');
            saveButton.click();

            utils.showToast('Accounts swapped! Page will reload.', 'success');

            // Wait for the dialog to disappear and then reload.
            await utils.waitForElementToDisappear('#userRegistrationDialog', 5000);
            setTimeout(() => window.location.reload(), 500); // Brief delay before reload.

        } catch (error) {
            console.error('Error during account swap:', error);
            utils.showToast(`Swap failed: ${error.message}`, 'error');
            swapButton.disabled = false;
            swapButton.textContent = 'Swap Accounts';
        }
    }

    async function addSwapAccountsButton() {
        try {
            const userMenu = await utils.waitForElementInShadow('mo-banner-user-menu', document, 15000);
            if (!userMenu) return; // Fail silently if element isn't there

            const parentContainer = userMenu.parentElement;
            if (!parentContainer || parentContainer.querySelector('.swap-accounts-button')) return;

            const swapButton = document.createElement('button');
            swapButton.textContent = 'Swap Accounts';
            swapButton.title = 'Swap Accounts';
            swapButton.className = 'filter-button prisma-paste-button gmi-chat-button swap-accounts-button';
            swapButton.style.marginRight = '8px';
            swapButton.style.alignSelf = 'center';

            swapButton.addEventListener('click', () => handleSwap(swapButton));

            parentContainer.insertBefore(swapButton, userMenu);

        } catch (error) {
            console.error('Could not add Swap Accounts button:', error);
        }
    }

    function initialize() {
        chrome.storage.sync.get('swapAccountsEnabled', (data) => {
            if (data.swapAccountsEnabled !== false) {
                addSwapAccountsButton();
            }
        });
    }

    window.swapAccountsFeature = {
        initialize
    };
})();

(function() {
    'use strict';

    async function handleSwap(swapButton) {
        swapButton.disabled = true;
        swapButton.textContent = 'Swapping...';

        try {
            // 1. Find the user menu component.
            const userMenu = await utils.waitForElementInShadow('mo-banner-user-menu');
            if (!userMenu || !userMenu.shadowRoot) throw new Error('Could not find user menu component or its shadow root.');

            // 2. Traverse the first shadow root to find the widget.
            const bannerWidget = userMenu.shadowRoot.querySelector('mo-banner-widget');
            if(!bannerWidget || !bannerWidget.shadowRoot) throw new Error('Could not find banner widget or its shadow root.');

            // 3. Traverse the second shadow root to find the clickable menu.
            const clickableMenu = bannerWidget.shadowRoot.querySelector('mo-menu');
            if(!clickableMenu) throw new Error('Could not find clickable menu element.');
            clickableMenu.click();


            // 4. Wait for the menu content, then find and click "User Registration".
            const userMenuContent = await utils.waitForElementInShadow('mo-banner-user-menu-content', document, 5000);
            if (!userMenuContent) throw new Error('User menu content not found.');

            // The items are in the light DOM of the content element, not a shadow root.
            const labels = userMenuContent.querySelectorAll('.user-menu-item-label');
            const userRegistrationButton = Array.from(labels).find(el => el.textContent.trim() === 'User Registration');
            if (!userRegistrationButton) throw new Error('"User Registration" button not found in menu.');
            userRegistrationButton.click();

            // 5. Wait for the dialog and find the PID buttons.
            const pidOptionsContainer = await utils.waitForElement('div.pid-options', 5000);
            if (!pidOptionsContainer) throw new Error('PID options container not found in dialog.');

            // 6. Find the inactive PID button and click it.
            const inactiveButton = pidOptionsContainer.querySelector('button.mo-btn:not(.active)');
            if (!inactiveButton) throw new Error('Could not find an alternative PID to swap to.');
            inactiveButton.click();

            // 7. Find and click the Save button.
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

            const parentContainer = userMenu.parentElement;
            if (!parentContainer) return;

            const swapButton = document.createElement('button');
            swapButton.textContent = 'Swap Accounts';
            swapButton.title = 'Swap Accounts';
            swapButton.className = 'filter-button prisma-paste-button gmi-chat-button swap-accounts-button';

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

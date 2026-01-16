(function() {
    'use strict';

    async function handleSwap(swapButton) {
        const textSpan = swapButton.querySelector('.switch-account-text');
        swapButton.disabled = true;
        if (textSpan) textSpan.textContent = 'Swapping...';

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
            if (textSpan) textSpan.textContent = 'Switch Accounts';
        }
    }

    async function addSwapAccountsButton() {
        try {
            const userMenu = await utils.waitForElementInShadow('mo-banner-user-menu', document, 15000);

            const parentContainer = userMenu.parentElement;
            if (!parentContainer) return;

            // Inject styles for the button (crucial if inside a Shadow DOM)
            const styleId = 'switch-account-styles';
            if (!parentContainer.querySelector(`#${styleId}`)) {
                const style = document.createElement('style');
                style.id = styleId;
                const styleURL = chrome.runtime.getURL('features/swap-accounts.css');
                const response = await fetch(styleURL);
                if (response.ok) {
                    style.textContent = await response.text();
                    parentContainer.appendChild(style);
                } else {
                    throw new Error(`Failed to load switch account styles: ${response.status} ${response.statusText}`);
                }
            }

            const swapButton = document.createElement('button');
            swapButton.title = 'Switch Accounts';
            swapButton.className = 'switch-account-button';

            const iconSpan = document.createElement('span');
            iconSpan.className = 'switch-account-icon';
            // Updated SVG to match requested design: Circle outline with solid user inside
            iconSpan.append(new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="none" stroke="white" stroke-width="1.5"/><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="white" transform="matrix(0.7 0 0 0.7 3.6 3.6)"/></svg>', 'image/svg+xml').documentElement);
            swapButton.appendChild(iconSpan);

            const textSpan = document.createElement('span');
            textSpan.className = 'switch-account-text';
            textSpan.textContent = 'Switch Accounts';
            swapButton.appendChild(textSpan);

            swapButton.addEventListener('click', () => handleSwap(swapButton));

            parentContainer.insertBefore(swapButton, userMenu);

        } catch (error) {
            console.error('Could not add Switch Account button:', error);
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

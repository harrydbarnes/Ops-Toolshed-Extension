(function() {
    'use strict';

    const TOAST_ID = 'ops-toolshed-toast';
    const RESTORE_WINDOW_MS = 60 * 1000;
    const TARGET_STABLE_MS = 5000;
    const RESTORE_POLL_MS = 150;
    let rememberReturnUrlEnabled = true;
    let accountSaveCaptureBound = false;
    let storageListenerBound = false;
    let restoreTimer = null;
    let restoreRunId = 0;

    function getText(element) {
        return (element?.innerText || element?.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function queryAllDeep(root = document) {
        const results = [];
        const visit = (currentRoot) => {
            if (!currentRoot?.querySelectorAll) return;

            currentRoot.querySelectorAll('*').forEach(element => {
                results.push(element);
                if (element.shadowRoot) visit(element.shadowRoot);
            });
        };

        visit(root);
        return results;
    }

    function waitForDeepElement(predicate, timeout = 5000, description = 'element') {
        return new Promise((resolve, reject) => {
            const intervalTime = 100;
            const startedAt = Date.now();

            const interval = setInterval(() => {
                const element = queryAllDeep().find(predicate);
                if (element) {
                    clearInterval(interval);
                    resolve(element);
                    return;
                }

                if (Date.now() - startedAt >= timeout) {
                    clearInterval(interval);
                    reject(new Error(`${description} not found within ${timeout}ms`));
                }
            }, intervalTime);
        });
    }

    function clickElement(element) {
        if (!element) return;

        const rect = element.getBoundingClientRect();
        const view = element.ownerDocument?.defaultView || window;
        const clientX = rect.left + Math.min(Math.max(rect.width / 2, 8), rect.width - 1);
        const clientY = rect.top + Math.min(Math.max(rect.height / 2, 8), rect.height - 1);
        const baseOptions = {
            bubbles: true,
            cancelable: true,
            composed: true,
            clientX,
            clientY,
            button: 0,
            view
        };

        if (view.PointerEvent) {
            element.dispatchEvent(new view.PointerEvent('pointerdown', {
                ...baseOptions,
                buttons: 1,
                pointerId: 1,
                pointerType: 'mouse',
                isPrimary: true
            }));
        }

        element.dispatchEvent(new view.MouseEvent('mousedown', { ...baseOptions, buttons: 1 }));

        if (view.PointerEvent) {
            element.dispatchEvent(new view.PointerEvent('pointerup', {
                ...baseOptions,
                buttons: 0,
                pointerId: 1,
                pointerType: 'mouse',
                isPrimary: true
            }));
        }

        element.dispatchEvent(new view.MouseEvent('mouseup', { ...baseOptions, buttons: 0 }));
        element.dispatchEvent(new view.MouseEvent('click', { ...baseOptions, buttons: 0 }));
    }

    function getHashParams(url) {
        return new URLSearchParams(url.hash.replace(/^#/, ''));
    }

    function isPrismaHome(url) {
        const params = getHashParams(url);
        const app = (params.get('osPspId') || '').toLowerCase();
        return app === 'prsm-cm-home' || app === 'cm-dashboard' ||
            (params.get('route') || '').toLowerCase() === 'campaigns';
    }

    async function getPendingReturnUrl() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getAccountSwitchUrl' });
            if (response?.status !== 'success' || !response.url) return null;
            const target = new URL(response.url);
            if (target.origin !== window.location.origin || target.protocol !== 'https:') return null;
            return target;
        } catch {
            return null;
        }
    }

    async function rememberCurrentUrl() {
        if (!rememberReturnUrlEnabled) return false;
        try {
            const current = new URL(window.location.href);
            const isMediaoceanHost = current.hostname === 'mediaocean.com' ||
                current.hostname.endsWith('.mediaocean.com');
            if (current.protocol !== 'https:' || !isMediaoceanHost) return false;
            const response = await chrome.runtime.sendMessage({
                action: 'rememberAccountSwitchUrl',
                url: current.href
            });
            return response?.status === 'success';
        } catch (error) {
            console.debug('Switch Accounts: Could not remember the current URL.', error);
            return false;
        }
    }

    async function rememberAndArmRestore() {
        const remembered = await rememberCurrentUrl();
        if (remembered) void restorePendingUrl();
        return remembered;
    }

    function navigateToRememberedUrl(target) {
        const current = new URL(window.location.href);
        if (current.origin === target.origin &&
            current.pathname === target.pathname &&
            current.search === target.search) {
            window.location.hash = target.hash;
            return;
        }
        window.location.replace(target.href);
    }

    async function clearPendingReturnUrl() {
        try {
            await chrome.runtime.sendMessage({ action: 'clearAccountSwitchUrl' });
        } catch {
            // Pending worker state expires automatically if this message cannot be delivered.
        }
    }

    async function restorePendingUrl() {
        clearTimeout(restoreTimer);
        const runId = ++restoreRunId;
        if (!rememberReturnUrlEnabled) return;

        const target = await getPendingReturnUrl();
        if (!target || runId !== restoreRunId || !document.documentElement?.isConnected) return;
        const restoreStartedAt = Date.now();
        let targetStableSince = null;
        let hasObservedForcedHome = false;
        const check = () => {
            if (runId !== restoreRunId || !document.documentElement?.isConnected) return;
            const current = new URL(window.location.href);
            const now = Date.now();
            if (current.href === target.href) {
                targetStableSince ??= now;
                if (hasObservedForcedHome && now - targetStableSince >= TARGET_STABLE_MS) {
                    void clearPendingReturnUrl();
                    return;
                }
            } else {
                targetStableSince = null;
                if (isPrismaHome(current)) {
                    hasObservedForcedHome = true;
                    navigateToRememberedUrl(target);
                }
            }

            if (now - restoreStartedAt < RESTORE_WINDOW_MS) {
                restoreTimer = window.setTimeout(check, RESTORE_POLL_MS);
            }
        };

        check();
    }

    function isAccountSwitchIntent(event) {
        const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
        const clickedSave = path.find(element => element?.id === 'saveButton') ||
            event.target?.closest?.('#saveButton');
        if (clickedSave &&
            (document.getElementById('userRegistrationDialog') || document.querySelector('.pid-options'))) {
            return true;
        }

        return path.some(element => {
            if (!element?.tagName || !['BUTTON', 'A', 'MO-MENU-ITEM'].includes(element.tagName)) return false;
            return /^(switch accounts?|user profile)$/i.test(getText(element));
        });
    }

    function bindAccountSaveCapture() {
        if (accountSaveCaptureBound) return;
        accountSaveCaptureBound = true;
        document.addEventListener('click', event => {
            if (isAccountSwitchIntent(event)) void rememberAndArmRestore();
        }, true);
    }

    function bindSettingChanges() {
        if (storageListenerBound || !chrome.storage?.onChanged) return;
        storageListenerBound = true;
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== 'sync' || !changes.rememberAccountSwitchUrlEnabled) return;
            rememberReturnUrlEnabled = changes.rememberAccountSwitchUrlEnabled.newValue !== false;
            if (!rememberReturnUrlEnabled) {
                clearTimeout(restoreTimer);
                restoreRunId += 1;
                void clearPendingReturnUrl();
            }
        });
    }

    function removeExistingToast() {
        document.getElementById(TOAST_ID)?.remove();
    }

    async function openUserProfileMenuItem() {
        const userMenu = await waitForDeepElement(
            element => element.tagName === 'MO-BANNER-USER-MENU',
            10000,
            'Account menu'
        );

        const accountMenu = queryAllDeep(userMenu.shadowRoot || userMenu).find(element =>
            element.tagName === 'MO-MENU'
        );
        if (!accountMenu) throw new Error('Account menu trigger not found');

        clickElement(accountMenu);

        const userProfileItem = await waitForDeepElement(
            element => element.tagName === 'MO-MENU-ITEM' && /^User profile$/i.test(getText(element)),
            5000,
            'User profile menu option'
        );
        clickElement(userProfileItem);
    }

    async function selectAlternativePid() {
        const pidOptionsContainer = await waitForDeepElement(
            element => element.matches?.('div.pid-options'),
            10000,
            'PID options container'
        );

        const pidButtons = Array.from(pidOptionsContainer.querySelectorAll('button.mo-btn'));
        const inactiveButton = pidButtons.find(button =>
            !button.classList.contains('mo-active') &&
            !button.classList.contains('active') &&
            button.getAttribute('aria-pressed') !== 'true' &&
            !button.disabled
        );

        if (!inactiveButton) throw new Error('Could not find an alternative PID to swap to.');
        clickElement(inactiveButton);
    }

    async function handleSwap(swapButton) {
        const textSpan = swapButton.querySelector('.switch-account-text');
        swapButton.disabled = true;
        if (textSpan) textSpan.textContent = 'Swapping...';

        try {
            removeExistingToast();
            await rememberAndArmRestore();
            await openUserProfileMenuItem();
            await selectAlternativePid();

            const saveButton = await utils.waitForElement('#saveButton');
            if (!saveButton) throw new Error('Save button not found.');
            await rememberAndArmRestore();
            clickElement(saveButton);

            utils.showToast('Accounts swapped! Page will reload.', 'success');

            // Wait for the dialog to disappear and then reload.
            await utils.waitForElementToDisappear('#userRegistrationDialog', 15000);
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
const swapIconSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="none" stroke="white" stroke-width="1.5"/><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="white" transform="matrix(0.7 0 0 0.7 3.6 3.6)"/></svg>';
            iconSpan.append(new DOMParser().parseFromString(swapIconSvg, 'image/svg+xml').documentElement);
            swapButton.appendChild(iconSpan);

            const textSpan = document.createElement('span');
            textSpan.className = 'switch-account-text';
            textSpan.textContent = 'Switch Accounts';
            swapButton.appendChild(textSpan);

            swapButton.addEventListener('click', () => handleSwap(swapButton));

            parentContainer.insertBefore(swapButton, userMenu);

        } catch (error) {
            if (error.message && (error.message.includes('not found') || error.message.includes('timeout'))) {
                console.debug('Swap Accounts: User menu not found, skipping.');
                return;
            }
            console.error('Could not add Switch Accounts button:', error);
        }
    }

    function initialize() {
        chrome.storage.sync.get({
            swapAccountsEnabled: true,
            rememberAccountSwitchUrlEnabled: true
        }, (data) => {
            rememberReturnUrlEnabled = data.rememberAccountSwitchUrlEnabled !== false;
            bindAccountSaveCapture();
            bindSettingChanges();
            if (rememberReturnUrlEnabled) {
                void restorePendingUrl();
            } else {
                void clearPendingReturnUrl();
            }
            if (data.swapAccountsEnabled !== false) {
                addSwapAccountsButton();
            }
        });
    }

    window.swapAccountsFeature = {
        initialize,
        restorePendingUrl
    };
})();

(function() {
    'use strict';

    const SETTING_KEY = 'newOrderUiOptimisationEnabled';
    const HEADER_ID = 'cm-buy-sidebar-order-revisions-header';
    const TOGGLE_CLASS = 'order-view-toggle';
    const NATIVE_OPTION_IDS = {
        all: 'ptb-orders-view-all',
        latest: 'ptb-orders-view-latest'
    };

    let featureEnabled = true;
    let settingsLoaded = false;
    let selectedView = 'latest';
    let hasAppliedDefault = false;

    function getNewOrderUiElements() {
        const header = document.getElementById(HEADER_ID);
        const accessory = header?.querySelector('.mo-nav-list-item-accessory-content');
        const nativeMenu = accessory?.querySelector('mo-menu');
        return { header, accessory, nativeMenu };
    }

    function isNewOrderUi() {
        return Boolean(getNewOrderUiElements().nativeMenu);
    }

    function updateToggleState(toggle, view) {
        if (!toggle) return;

        selectedView = view;
        toggle.querySelectorAll('button[data-order-view]').forEach(button => {
            const isSelected = button.dataset.orderView === view;
            button.setAttribute('aria-pressed', String(isSelected));
        });
    }

    function waitForNativeOption(optionId, attemptsRemaining = 10) {
        return new Promise(resolve => {
            const option = document.getElementById(optionId);
            if (option || attemptsRemaining <= 0) {
                resolve(option);
                return;
            }

            window.setTimeout(() => {
                waitForNativeOption(optionId, attemptsRemaining - 1).then(resolve);
            }, 50);
        });
    }

    async function selectOrderView(view, toggle) {
        const optionId = NATIVE_OPTION_IDS[view];
        const header = document.getElementById(HEADER_ID);
        const nativeMenu = header?.querySelector('mo-menu');
        if (!optionId || !nativeMenu) return false;

        toggle?.setAttribute('aria-busy', 'true');
        toggle?.querySelectorAll('button').forEach(button => {
            button.disabled = true;
        });

        try {
            if (nativeMenu.getAttribute('aria-expanded') !== 'true') {
                nativeMenu.dispatchEvent(new MouseEvent('mousedown', {
                    bubbles: true,
                    composed: true,
                    button: 0,
                    buttons: 1
                }));
            }

            const option = await waitForNativeOption(optionId);
            if (!option) return false;

            option.click();
            updateToggleState(toggle, view);
            return true;
        } finally {
            toggle?.removeAttribute('aria-busy');
            toggle?.querySelectorAll('button').forEach(button => {
                button.disabled = false;
            });
        }
    }

    function createViewButton(view, label) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.orderView = view;
        button.textContent = label;
        button.setAttribute('aria-pressed', String(view === selectedView));
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            selectOrderView(view, button.closest(`.${TOGGLE_CLASS}`));
        });
        return button;
    }

    function removeOrderViewToggle() {
        document.querySelectorAll(`.${TOGGLE_CLASS}`).forEach(toggle => toggle.remove());
        document.querySelectorAll(`#${HEADER_ID}.order-view-toggle-active`).forEach(header => {
            header.classList.remove('order-view-toggle-active');
        });
    }

    function handleOrderViewToggle() {
        if (!settingsLoaded || !featureEnabled) {
            removeOrderViewToggle();
            return;
        }

        const { header, accessory, nativeMenu } = getNewOrderUiElements();
        if (!header || !accessory || !nativeMenu) {
            removeOrderViewToggle();
            return;
        }

        header.classList.add('order-view-toggle-active');
        let toggle = accessory.querySelector(`.${TOGGLE_CLASS}`);
        if (toggle) {
            updateToggleState(toggle, selectedView);
            return;
        }

        toggle = document.createElement('div');
        toggle.className = TOGGLE_CLASS;
        toggle.setAttribute('role', 'group');
        toggle.setAttribute('aria-label', 'Order versions shown');
        toggle.append(
            createViewButton('latest', 'Latest'),
            createViewButton('all', 'All')
        );
        accessory.appendChild(toggle);

        if (!hasAppliedDefault) {
            hasAppliedDefault = true;
            selectOrderView('latest', toggle);
        }
    }

    function initialize() {
        chrome.storage.sync.get([SETTING_KEY], data => {
            featureEnabled = data[SETTING_KEY] !== false;
            settingsLoaded = true;
            handleOrderViewToggle();
        });
    }

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync' || !changes[SETTING_KEY]) return;
        if (changes[SETTING_KEY]) featureEnabled = changes[SETTING_KEY].newValue !== false;
        settingsLoaded = true;
        handleOrderViewToggle();
    });

    window.orderViewToggleFeature = {
        handleOrderViewToggle,
        initialize,
        isNewOrderUi,
        removeOrderViewToggle,
        selectOrderView
    };
})();

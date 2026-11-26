(function() {
    'use strict';

    const SETTING_KEY = 'appSwitcherToggleEnabled';
    const TOGGLE_CLASS = 'app-switcher-toggle';
    const ACTIVE_CLASS = 'app-switcher-toggle-active';
    const WORKFLOW_URLS = Object.freeze({
        media: '/ideskos-viewport/launchapp/?workflowid=buyers-workflow',
        production: '/ideskos-viewport/launchapp/?workflowid=estimates-and-costs'
    });
    const BRANDING_KEY_APPS = Object.freeze({
        prisma: 'media',
        rodick: 'production'
    });

    let featureEnabled = true;
    let settingsLoaded = false;

    function getBannerSwitcherElements() {
        const banner = document.querySelector('mo-banner');
        const leftContainer = banner?.querySelector('.banner .left');
        const nativeMenu = leftContainer?.querySelector('mo-menu.main-menu');
        return { banner, leftContainer, nativeMenu };
    }

    function getCurrentApp(banner, nativeMenu) {
        const labelEl = nativeMenu?.querySelector('mo-text');
        const labelText = (labelEl?.getAttribute('data-full-text') || labelEl?.textContent || '')
            .trim()
            .toLowerCase();
        if (labelText === 'media' || labelText === 'production') {
            return labelText;
        }

        const brandingKey = (banner?.getAttribute('branding-key') || '').trim().toLowerCase();
        return BRANDING_KEY_APPS[brandingKey] || null;
    }

    function updateToggleState(toggle, currentApp) {
        if (!toggle) return;

        toggle.querySelectorAll('button[data-app-switcher-target]').forEach(button => {
            const isSelected = button.dataset.appSwitcherTarget === currentApp;
            button.setAttribute('aria-pressed', String(isSelected));
        });
    }

    function switchApp(target, toggle, navigateFn) {
        const url = WORKFLOW_URLS[target];
        if (!url) return false;

        const { banner, nativeMenu } = getBannerSwitcherElements();
        const currentApp = getCurrentApp(banner, nativeMenu);
        if (target === currentApp) return false;

        if (toggle) {
            toggle.setAttribute('aria-busy', 'true');
            toggle.querySelectorAll('button').forEach(button => {
                button.disabled = true;
            });
            updateToggleState(toggle, target);
        }

        const navigate = typeof navigateFn === 'function'
            ? navigateFn
            : window.appSwitcherToggleFeature?.navigate;
        if (typeof navigate === 'function') {
            navigate(url);
        } else {
            window.location.assign(url);
        }
        return true;
    }

    function createSwitcherButton(target, label, currentApp) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.appSwitcherTarget = target;
        button.textContent = label;
        button.setAttribute('aria-pressed', String(target === currentApp));
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            switchApp(target, button.closest(`.${TOGGLE_CLASS}`));
        });
        return button;
    }

    function removeAppSwitcherToggle() {
        document.querySelectorAll(`.${TOGGLE_CLASS}`).forEach(toggle => toggle.remove());
        document.querySelectorAll(`mo-banner .banner .left.${ACTIVE_CLASS}`).forEach(container => {
            container.classList.remove(ACTIVE_CLASS);
        });
    }

    function handleAppSwitcherToggle() {
        if (!settingsLoaded || !featureEnabled) {
            removeAppSwitcherToggle();
            return;
        }

        const { banner, leftContainer, nativeMenu } = getBannerSwitcherElements();
        const currentApp = getCurrentApp(banner, nativeMenu);
        if (!leftContainer || !nativeMenu || !currentApp) {
            removeAppSwitcherToggle();
            return;
        }

        leftContainer.classList.add(ACTIVE_CLASS);
        let toggle = leftContainer.querySelector(`.${TOGGLE_CLASS}`);
        if (toggle) {
            updateToggleState(toggle, currentApp);
            return;
        }

        toggle = document.createElement('div');
        toggle.className = TOGGLE_CLASS;
        toggle.setAttribute('role', 'group');
        toggle.setAttribute('aria-label', 'Switch between Media and Production');
        toggle.append(
            createSwitcherButton('media', 'Media', currentApp),
            createSwitcherButton('production', 'Production', currentApp)
        );
        leftContainer.appendChild(toggle);
    }

    function reconcile() {
        if (
            document.querySelector('mo-banner .banner .left mo-menu.main-menu') ||
            document.querySelector(`.${TOGGLE_CLASS}, .${ACTIVE_CLASS}`)
        ) {
            handleAppSwitcherToggle();
        }
    }

    function initialize() {
        return new Promise((resolve, reject) => {
            chrome.storage.sync.get([SETTING_KEY], data => {
                try {
                    if (chrome.runtime?.lastError) throw new Error(chrome.runtime.lastError.message);
                    featureEnabled = data?.[SETTING_KEY] !== false;
                    settingsLoaded = true;
                    handleAppSwitcherToggle();
                    resolve();
                } catch (error) {
                    settingsLoaded = false;
                    reject(error);
                }
            });
        });
    }

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync' || !changes[SETTING_KEY]) return;
        featureEnabled = changes[SETTING_KEY].newValue !== false;
        settingsLoaded = true;
        handleAppSwitcherToggle();
    });

    window.appSwitcherToggleFeature = {
        reconcile,
        handleAppSwitcherToggle,
        initialize,
        removeAppSwitcherToggle,
        switchApp,
        getCurrentApp,
        WORKFLOW_URLS,
        navigate: url => window.location.assign(url)
    };
})();

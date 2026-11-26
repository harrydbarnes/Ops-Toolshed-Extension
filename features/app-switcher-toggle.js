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

    const SWITCHER_STYLES = `
.banner .left.app-switcher-toggle-active {
    min-inline-size: max-content;
    display: flex;
    align-items: center;
}

.banner .left.app-switcher-toggle-active > mo-menu.main-menu {
    display: none;
}

.app-switcher-toggle {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    height: 28px;
    padding: 3px;
    margin-inline: 8px;
    box-sizing: border-box;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.08);
    white-space: nowrap;
}

.app-switcher-toggle button {
    height: 20px;
    padding: 0 10px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: rgba(240, 241, 244, 0.78);
    font: 600 11px/20px Montserrat, Arial, sans-serif;
    letter-spacing: 0.01em;
    cursor: pointer;
    transition: background-color 140ms ease, color 140ms ease;
}

.app-switcher-toggle button[aria-pressed="true"] {
    background: #286ce9;
    color: #ffffff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
}

.app-switcher-toggle button:hover:not([aria-pressed="true"]):not(:disabled) {
    background: rgba(255, 255, 255, 0.14);
    color: #ffffff;
}

.app-switcher-toggle button:focus-visible {
    outline: 2px solid #60a5fa;
    outline-offset: 1px;
}

.app-switcher-toggle button:disabled {
    cursor: wait;
    opacity: 0.75;
}

@media (prefers-reduced-motion: reduce) {
    .app-switcher-toggle button {
        transition: none;
    }
}
    `;

    let mountedContainer;
    let observedRoot;
    const bannerObserver = new MutationObserver(() => handleAppSwitcherToggle());

    let featureEnabled = true;
    let settingsLoaded = false;

    function getBannerSwitcherElements() {
        const banner = document.querySelector('mo-banner');
        const root = banner?.shadowRoot || banner;
        const leftContainer = root?.querySelector('.banner .left');
        const nativeMenu = leftContainer?.querySelector('mo-menu.main-menu');
        return { banner, root, leftContainer, nativeMenu };
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
        mountedContainer?.querySelector(`.${TOGGLE_CLASS}`)?.remove();
        mountedContainer?.querySelector('style[data-app-switcher-styles]')?.remove();
        mountedContainer?.classList.remove(ACTIVE_CLASS);
        mountedContainer = null;
    }

    function handleAppSwitcherToggle() {
        if (!settingsLoaded || !featureEnabled) {
            bannerObserver.disconnect();
            observedRoot = null;
            removeAppSwitcherToggle();
            return;
        }

        const { banner, root, leftContainer, nativeMenu } = getBannerSwitcherElements();
        if (root !== observedRoot) {
            bannerObserver.disconnect();
            if (root) bannerObserver.observe(root, { childList: true, subtree: true });
            observedRoot = root;
        }
        const currentApp = getCurrentApp(banner, nativeMenu);
        if (!leftContainer || !nativeMenu || !currentApp) {
            removeAppSwitcherToggle();
            return;
        }

        if (mountedContainer !== leftContainer) removeAppSwitcherToggle();
        mountedContainer = leftContainer;
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
        const style = document.createElement('style');
        style.dataset.appSwitcherStyles = '';
        style.textContent = SWITCHER_STYLES;
        leftContainer.append(style, toggle);
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
        reconcile: handleAppSwitcherToggle,
        handleAppSwitcherToggle,
        initialize,
        removeAppSwitcherToggle,
        switchApp,
        getCurrentApp,
        WORKFLOW_URLS,
        navigate: url => window.location.assign(url)
    };
})();

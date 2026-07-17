(function() {
    'use strict';

    const SETTING_KEY = 'bannerUsernameEnabled';
    const ORIGINAL_LABEL_ATTRIBUTE = 'data-ops-toolshed-original-account-label';
    const ORIGINAL_MIN_WIDTH_ATTRIBUTE = 'data-ops-toolshed-original-account-min-width';
    const ORIGINAL_TEXT_ALIGN_ATTRIBUTE = 'data-ops-toolshed-original-account-text-align';
    const DISCOVERY_TIMEOUT_MS = 2500;

    let isEnabled = true;
    let settingsLoaded = false;
    let resolvedUsername = null;
    let discoveryPromise = null;
    let discoveryCheckForUsername = null;
    let storageListenerBound = false;
    let overlayLifecycleBound = false;
    const attemptedMenus = new WeakSet();
    const lifecycleObservers = new Map();
    const overlayObservers = new Map();
    let lifecycleApplyScheduled = false;

    function queryAllDeep(root = document) {
        const results = [];
        const visit = currentRoot => {
            if (!currentRoot?.querySelectorAll) return;
            currentRoot.querySelectorAll('*').forEach(element => {
                results.push(element);
                if (element.shadowRoot) visit(element.shadowRoot);
            });
        };
        visit(root);
        return results;
    }

    function findDeep(selector, root = document) {
        if (!root?.querySelector) return null;
        const directMatch = root.querySelector(selector);
        if (directMatch) return directMatch;

        for (const element of root.querySelectorAll('*')) {
            if (!element.shadowRoot) continue;
            const shadowMatch = findDeep(selector, element.shadowRoot);
            if (shadowMatch) return shadowMatch;
        }
        return null;
    }

    function parseUsername(value) {
        const match = String(value || '').trim().match(/^([a-z0-9._-]+)@[^\s@]+$/i);
        return match ? match[1] : null;
    }

    function readUsernameFromMenu() {
        const usernameElement = findDeep('#mo-user-name');
        if (!usernameElement) return null;
        return parseUsername(
            usernameElement.getAttribute('data-full-text') || usernameElement.textContent
        );
    }

    function getBannerParts() {
        const userMenu = findDeep('mo-banner-user-menu');
        if (!userMenu) return {};
        const menuRoot = userMenu.shadowRoot || userMenu;
        return {
            userMenu,
            accountLabel: findDeep('.user-company-name', menuRoot),
            menuTrigger: findDeep('mo-menu', menuRoot),
            menuActivator: findDeep('.user-company-name', menuRoot)
        };
    }

    function replaceAccountLabel(accountLabel) {
        if (!accountLabel || !resolvedUsername) return;
        if (!accountLabel.hasAttribute(ORIGINAL_LABEL_ATTRIBUTE)) {
            const originalLabel = (accountLabel.textContent || '').replace(/\s+/g, ' ').trim();
            if (!originalLabel) return;
            accountLabel.setAttribute(
                ORIGINAL_LABEL_ATTRIBUTE,
                originalLabel
            );
            accountLabel.setAttribute(
                ORIGINAL_MIN_WIDTH_ATTRIBUTE,
                accountLabel.style.minWidth || ''
            );
            accountLabel.setAttribute(
                ORIGINAL_TEXT_ALIGN_ATTRIBUTE,
                accountLabel.style.textAlign || ''
            );
            const originalWidth = accountLabel.getBoundingClientRect().width;
            if (originalWidth > 0) accountLabel.style.minWidth = `${originalWidth}px`;
        }
        if (accountLabel.textContent !== resolvedUsername) {
            accountLabel.textContent = resolvedUsername;
        }
        accountLabel.style.textAlign = 'center';
    }

    function restoreAccountLabels() {
        queryAllDeep().forEach(element => {
            if (!element.matches?.(`.user-company-name[${ORIGINAL_LABEL_ATTRIBUTE}]`)) return;
            element.textContent = element.getAttribute(ORIGINAL_LABEL_ATTRIBUTE) || '';
            const originalMinWidth = element.getAttribute(ORIGINAL_MIN_WIDTH_ATTRIBUTE) || '';
            if (originalMinWidth) element.style.minWidth = originalMinWidth;
            else element.style.removeProperty('min-width');
            const originalTextAlign = element.getAttribute(ORIGINAL_TEXT_ALIGN_ATTRIBUTE) || '';
            if (originalTextAlign) element.style.textAlign = originalTextAlign;
            else element.style.removeProperty('text-align');
            element.removeAttribute(ORIGINAL_LABEL_ATTRIBUTE);
            element.removeAttribute(ORIGINAL_MIN_WIDTH_ATTRIBUTE);
            element.removeAttribute(ORIGINAL_TEXT_ALIGN_ATTRIBUTE);
        });
    }

    function clickMenuTrigger(menuTrigger, menuActivator) {
        const clickTarget = menuActivator || menuTrigger;
        if (!clickTarget) return;
        clickTarget.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window
        }));
    }

    function getObservableRoots() {
        if (typeof document === 'undefined' || !document.documentElement) return [];
        const roots = [document.documentElement];
        queryAllDeep().forEach(element => {
            if (element.shadowRoot) roots.push(element.shadowRoot);
        });
        return roots.filter(Boolean);
    }

    function getBannerLifecycleRoots() {
        if (typeof document === 'undefined') return [];
        const userMenu = findDeep('mo-banner-user-menu');
        if (!userMenu) return [];
        const menuRoot = userMenu.shadowRoot || userMenu;
        const roots = [menuRoot];
        queryAllDeep(menuRoot).forEach(element => {
            if (element.shadowRoot) roots.push(element.shadowRoot);
        });
        return roots;
    }

    function scheduleLifecycleApply() {
        if (lifecycleApplyScheduled) return;
        lifecycleApplyScheduled = true;
        Promise.resolve().then(() => {
            lifecycleApplyScheduled = false;
            if (typeof document === 'undefined' || !document.documentElement) return;
            discoveryCheckForUsername?.();
            observeLifecycleRoots();
            apply();
        });
    }

    function observeControlledAccountOverlay() {
        if (typeof document === 'undefined') return;
        const { menuTrigger } = getBannerParts();
        const overlayId = menuTrigger?.getAttribute('aria-controls');
        const overlay = overlayId ? document.getElementById(overlayId) : null;

        overlayObservers.forEach((record, observedOverlay) => {
            if (observedOverlay.isConnected && observedOverlay === overlay) return;
            record.observer.disconnect();
            overlayObservers.delete(observedOverlay);
        });

        if (!overlay) return;
        const root = overlay.shadowRoot || overlay;
        const existing = overlayObservers.get(overlay);
        if (existing?.root === root) {
            scheduleLifecycleApply();
            return;
        }
        existing?.observer.disconnect();

        const observer = new MutationObserver(scheduleLifecycleApply);
        observer.observe(root, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['data-full-text']
        });
        overlayObservers.set(overlay, { root, observer });
        scheduleLifecycleApply();
    }

    function bindOverlayLifecycle() {
        if (overlayLifecycleBound || typeof document === 'undefined' || !document.body) return;
        overlayLifecycleBound = true;
        const observer = new MutationObserver(() => {
            observeControlledAccountOverlay();
            Promise.resolve().then(observeControlledAccountOverlay);
        });
        observer.observe(document.body, { childList: true });
        observeControlledAccountOverlay();
    }

    function observeLifecycleRoots() {
        lifecycleObservers.forEach((observer, root) => {
            const isConnected = root.host ? root.host.isConnected : root.isConnected;
            if (isConnected) return;
            observer.disconnect();
            lifecycleObservers.delete(root);
        });

        getBannerLifecycleRoots().forEach(root => {
            if (!root?.querySelectorAll || lifecycleObservers.has(root)) return;
            const observer = new MutationObserver(scheduleLifecycleApply);
            observer.observe(root, { childList: true, subtree: true, characterData: true });
            lifecycleObservers.set(root, observer);
        });
    }

    function discoverUsername(userMenu, menuTrigger, menuActivator) {
        if (!userMenu || !menuTrigger || discoveryPromise || attemptedMenus.has(userMenu)) return;
        attemptedMenus.add(userMenu);

        const menuWasOpen = menuTrigger.getAttribute('aria-expanded') === 'true';
        discoveryPromise = new Promise(resolve => {
            const observers = [];
            let timeoutId = null;
            let finished = false;

            const finish = username => {
                if (finished) return;
                finished = true;
                discoveryCheckForUsername = null;
                observers.forEach(observer => observer.disconnect());
                if (timeoutId) clearTimeout(timeoutId);
                if (username) resolvedUsername = username;
                if (!menuWasOpen && menuTrigger.getAttribute('aria-expanded') === 'true') {
                    clickMenuTrigger(menuTrigger, menuActivator);
                }
                resolve(username);
            };

            const checkForUsername = () => {
                const username = readUsernameFromMenu();
                if (username) finish(username);
            };
            discoveryCheckForUsername = checkForUsername;

            getObservableRoots().forEach(root => {
                const observer = new MutationObserver(checkForUsername);
                observer.observe(root, { childList: true, subtree: true, attributes: true });
                observers.push(observer);
            });

            timeoutId = setTimeout(() => finish(null), DISCOVERY_TIMEOUT_MS);
            if (!menuWasOpen) clickMenuTrigger(menuTrigger, menuActivator);
            checkForUsername();
        }).finally(() => {
            discoveryPromise = null;
            apply();
        });
    }

    function apply() {
        observeLifecycleRoots();
        if (!settingsLoaded) return;
        if (!isEnabled) {
            restoreAccountLabels();
            return;
        }

        const { userMenu, accountLabel, menuTrigger, menuActivator } = getBannerParts();
        if (!userMenu || !accountLabel) return;

        const visibleUsername = readUsernameFromMenu();
        if (visibleUsername) resolvedUsername = visibleUsername;
        if (resolvedUsername) {
            replaceAccountLabel(accountLabel);
            return;
        }

        discoverUsername(userMenu, menuTrigger, menuActivator);
    }

    function initialize() {
        observeLifecycleRoots();
        bindOverlayLifecycle();
        chrome.storage.sync.get({ [SETTING_KEY]: true }, data => {
            isEnabled = data[SETTING_KEY] !== false;
            settingsLoaded = true;
            apply();
        });

        if (!storageListenerBound && chrome.storage.onChanged) {
            storageListenerBound = true;
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area !== 'sync' || !changes[SETTING_KEY]) return;
                isEnabled = changes[SETTING_KEY].newValue !== false;
                apply();
            });
        }
    }

    window.bannerUsernameFeature = {
        initialize,
        apply,
        parseUsername,
        isEnabled: () => settingsLoaded && isEnabled,
        getResolvedUsername: () => resolvedUsername
    };
})();

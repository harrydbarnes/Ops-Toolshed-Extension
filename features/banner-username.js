(function() {
    'use strict';

    const SETTING_KEY = 'bannerUsernameEnabled';
    const USERNAME_CACHE_KEY = 'opsToolshed_bannerUsername';
    const ORIGINAL_LABEL_ATTRIBUTE = 'data-ops-toolshed-original-account-label';
    const ORIGINAL_MIN_WIDTH_ATTRIBUTE = 'data-ops-toolshed-original-account-min-width';
    const ORIGINAL_TEXT_ALIGN_ATTRIBUTE = 'data-ops-toolshed-original-account-text-align';
    const ORIGINAL_LEFT_ATTRIBUTE = 'data-ops-toolshed-original-account-left';
    const DISCOVERY_TIMEOUT_MS = 2500;
    const ORGANISATION_CODE_PATTERN = /^[a-z0-9._-]+$/i;
    // The banner is composed from these known custom-element hosts.  Restrict
    // recursive discovery to them so unrelated page components and Shadow DOM
    // trees are never scanned while resolving the account label.
    const KNOWN_BANNER_HOST_SELECTOR = [
        'mo-banner',
        'mo-banner-user-menu',
        'mo-banner-sub-context-menu',
        'mo-banner-widget',
        'mo-menu',
        'mo-popover'
    ].join(',');

    let isEnabled = true;
    let settingsLoaded = false;
    let cacheLoaded = false;
    let resolvedUsername = null;
    let cachedUsername = null;
    let discoveryPromise = null;
    let discoveryCheckForUsername = null;
    let storageListenerBound = false;
    let pidSelectionListenerBound = false;
    let overlayLifecycleBound = false;
    let overlayLifecycleObserver = null;
    const bannerDiscoveryObservers = new Map();
    let cachedBannerParts = null;
    let lifecycleStarted = false;
    const attemptedMenus = new WeakSet();
    const lifecycleObservers = new Map();
    const overlayObservers = new Map();
    let lifecycleApplyScheduled = false;

    function getKnownBannerRoots(root = document) {
        const roots = [];
        const visited = new Set();

        const visit = currentRoot => {
            if (!currentRoot || visited.has(currentRoot)) return;
            visited.add(currentRoot);
            roots.push(currentRoot);

            if (currentRoot.shadowRoot) visit(currentRoot.shadowRoot);
            currentRoot.querySelectorAll?.(KNOWN_BANNER_HOST_SELECTOR).forEach(host => {
                if (host.shadowRoot) visit(host.shadowRoot);
            });
        };

        visit(root);
        return roots;
    }

    function queryKnownDeep(selector, root = document) {
        for (const currentRoot of getKnownBannerRoots(root)) {
            const directMatch = currentRoot.nodeType === Node.ELEMENT_NODE &&
                currentRoot.matches?.(selector)
                ? currentRoot
                : currentRoot.querySelector?.(selector);
            if (directMatch) return directMatch;
        }
        return null;
    }

    function queryAllKnownDeep(selector, root = document) {
        const results = [];
        const seenElements = new Set();
        getKnownBannerRoots(root).forEach(currentRoot => {
            if (currentRoot.nodeType === Node.ELEMENT_NODE && currentRoot.matches?.(selector) &&
                !seenElements.has(currentRoot)) {
                seenElements.add(currentRoot);
                results.push(currentRoot);
            }
            currentRoot.querySelectorAll?.(selector).forEach(element => {
                if (seenElements.has(element)) return;
                seenElements.add(element);
                results.push(element);
            });
        });
        return results;
    }

    function findDeep(selector, root = document) {
        return queryKnownDeep(selector, root);
    }

    function parseUsername(value) {
        const username = String(value || '').trim();
        return /^[a-z0-9._-]+@[^\s@]+$/i.test(username) ? username : null;
    }

    function parseCachedUsername(value) {
        return parseUsername(value);
    }

    function parseUsernamePrefix(value) {
        const prefix = String(value || '').trim().split('@')[0];
        return ORGANISATION_CODE_PATTERN.test(prefix) ? prefix : null;
    }

    function parseOrganisationCode(value) {
        const organisation = String(value || '').replace(/\s+/g, ' ').trim();
        return ORGANISATION_CODE_PATTERN.test(organisation) &&
            organisation === organisation.toUpperCase() && !organisation.includes('@')
            ? organisation
            : null;
    }

    function buildUsername(prefix, organisation) {
        const parsedPrefix = parseUsernamePrefix(prefix);
        const parsedOrganisation = parseOrganisationCode(organisation);
        return parsedPrefix && parsedOrganisation
            ? parseUsername(`${parsedPrefix}@${parsedOrganisation}`)
            : null;
    }

    function rememberUsername(username) {
        const parsedUsername = parseCachedUsername(username);
        if (!parsedUsername) return;
        resolvedUsername = parsedUsername;
        if (cachedUsername === parsedUsername) return;
        cachedUsername = parsedUsername;
        chrome.storage?.local?.set?.({ [USERNAME_CACHE_KEY]: parsedUsername });
    }

    function clearRememberedUsername() {
        // Prisma can reuse the same banner menu after a PID/account switch.
        // Allow that menu to discover the newly signed-in account again.
        const { userMenu } = getBannerParts();
        if (userMenu) attemptedMenus.delete(userMenu);
        if (!resolvedUsername && !cachedUsername) return;
        resolvedUsername = null;
        cachedUsername = null;
        chrome.storage?.local?.remove?.(USERNAME_CACHE_KEY);
    }

    function loadRememberedUsername() {
        const localStorage = chrome.storage?.local;
        if (!localStorage?.get) {
            cacheLoaded = true;
            apply();
            return;
        }
        localStorage.get({ [USERNAME_CACHE_KEY]: null }, data => {
            cachedUsername = parseCachedUsername(data?.[USERNAME_CACHE_KEY]);
            if (cachedUsername) resolvedUsername = cachedUsername;
            cacheLoaded = true;
            apply();
        });
    }

    function bindPidSelectionInvalidation() {
        if (pidSelectionListenerBound || typeof document === 'undefined') return;
        pidSelectionListenerBound = true;
        document.addEventListener('click', event => {
            const eventPath = typeof event.composedPath === 'function'
                ? event.composedPath()
                : [];
            if (eventPath.some(element => element?.matches?.('div.pid-options'))) {
                clearRememberedUsername();
            }
        }, true);
    }

    function readUsernameFromMenu() {
        const { menuTrigger } = getBannerParts();
        const overlayId = menuTrigger?.getAttribute('aria-controls');
        const controlledOverlay = overlayId ? document.getElementById(overlayId) : null;
        const usernameElement = findDeep('#mo-user-name', controlledOverlay || document);
        if (!usernameElement) return null;
        return parseUsername(
            usernameElement.getAttribute('data-full-text') || usernameElement.textContent
        );
    }

    function readBannerUsernamePrefix(accountLabel) {
        if (!accountLabel || accountLabel.hasAttribute(ORIGINAL_LABEL_ATTRIBUTE)) return null;
        return parseUsernamePrefix(
            accountLabel.getAttribute('data-full-text') || accountLabel.textContent
        );
    }

    function readActiveOrganisation() {
        const contextMenu = findDeep('mo-banner-sub-context-menu');
        if (!contextMenu) return null;
        const contextRoot = contextMenu.shadowRoot || contextMenu;
        const contextLabel = findDeep('#user-context-menu-label', contextRoot);
        return parseOrganisationCode(
            contextLabel?.getAttribute('data-full-text') || contextLabel?.textContent
        );
    }

    function getBannerParts() {
        if (cachedBannerParts?.userMenu?.isConnected && cachedBannerParts?.accountLabel?.isConnected) {
            return cachedBannerParts;
        }
        const userMenu = findDeep('mo-banner-user-menu');
        if (!userMenu) {
            cachedBannerParts = null;
            return {};
        }
        const menuRoot = userMenu.shadowRoot || userMenu;
        const parts = {
            userMenu,
            accountLabel: findDeep('.user-company-name', menuRoot),
            menuTrigger: findDeep('mo-menu', menuRoot),
            menuActivator: findDeep('.user-company-name', menuRoot)
        };
        if (parts.accountLabel) cachedBannerParts = parts;
        return parts;
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
            accountLabel.setAttribute(
                ORIGINAL_LEFT_ATTRIBUTE,
                accountLabel.style.left || ''
            );
            const originalWidth = accountLabel.getBoundingClientRect().width;
            if (originalWidth > 0) accountLabel.style.minWidth = `${originalWidth}px`;
        }
        if (accountLabel.textContent !== resolvedUsername) {
            accountLabel.textContent = resolvedUsername;
        }
        // Keep the username in the native label area. Shifting it left to centre it
        // across the avatar made longer account IDs overflow the available space.
        accountLabel.style.textAlign = 'left';
        accountLabel.style.removeProperty('left');
    }

    function restoreAccountLabels() {
        queryAllKnownDeep(`.user-company-name[${ORIGINAL_LABEL_ATTRIBUTE}]`).forEach(element => {
            if (!element.matches?.(`.user-company-name[${ORIGINAL_LABEL_ATTRIBUTE}]`)) return;
            element.textContent = element.getAttribute(ORIGINAL_LABEL_ATTRIBUTE) || '';
            const originalMinWidth = element.getAttribute(ORIGINAL_MIN_WIDTH_ATTRIBUTE) || '';
            if (originalMinWidth) element.style.minWidth = originalMinWidth;
            else element.style.removeProperty('min-width');
            const originalTextAlign = element.getAttribute(ORIGINAL_TEXT_ALIGN_ATTRIBUTE) || '';
            if (originalTextAlign) element.style.textAlign = originalTextAlign;
            else element.style.removeProperty('text-align');
            const originalLeft = element.getAttribute(ORIGINAL_LEFT_ATTRIBUTE) || '';
            if (originalLeft) element.style.left = originalLeft;
            else element.style.removeProperty('left');
            element.removeAttribute(ORIGINAL_LABEL_ATTRIBUTE);
            element.removeAttribute(ORIGINAL_MIN_WIDTH_ATTRIBUTE);
            element.removeAttribute(ORIGINAL_TEXT_ALIGN_ATTRIBUTE);
            element.removeAttribute(ORIGINAL_LEFT_ATTRIBUTE);
        });
    }

    function clickMenuTrigger(menuTrigger, menuActivator) {
        const clickTarget = menuActivator || menuTrigger;
        if (!clickTarget) return;
        if (typeof clickTarget.click === 'function') {
            clickTarget.click();
            return;
        }
        clickTarget.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window
        }));
    }

    function concealControlledOverlay(menuTrigger) {
        const overlayId = menuTrigger?.getAttribute('aria-controls');
        if (!overlayId || typeof document === 'undefined' || !document.body) return () => {};

        let concealedOverlay = null;
        let originalVisibility = '';
        let originalVisibilityPriority = '';

        const concealOverlay = () => {
            if (concealedOverlay) return;
            const overlay = document.getElementById(overlayId);
            if (!overlay) return;
            concealedOverlay = overlay;
            originalVisibility = overlay.style.getPropertyValue('visibility');
            originalVisibilityPriority = overlay.style.getPropertyPriority('visibility');
            overlay.style.setProperty('visibility', 'hidden', 'important');
        };

        const observer = new MutationObserver(concealOverlay);
        observer.observe(document.body, { childList: true, subtree: true });
        concealOverlay();

        return () => {
            observer.disconnect();
            if (!concealedOverlay) return;
            if (originalVisibility) {
                concealedOverlay.style.setProperty(
                    'visibility',
                    originalVisibility,
                    originalVisibilityPriority
                );
            } else {
                concealedOverlay.style.removeProperty('visibility');
            }
        };
    }

    function getObservableRoots() {
        if (typeof document === 'undefined' || !document.body) return [];
        const roots = [document.body];
        const { userMenu } = getBannerParts();
        if (userMenu) roots.push(userMenu.shadowRoot || userMenu);
        const { menuTrigger } = getBannerParts();
        const overlayId = menuTrigger?.getAttribute('aria-controls');
        const overlay = overlayId ? document.getElementById(overlayId) : null;
        if (overlay) roots.push(overlay.shadowRoot || overlay);
        return [...new Set(roots.filter(Boolean))];
    }

    function getBannerLifecycleRoots() {
        if (typeof document === 'undefined') return [];
        const { userMenu } = getBannerParts();
        if (!userMenu) return [];
        const menuRoot = userMenu.shadowRoot || userMenu;
        return getKnownBannerRoots(menuRoot);
    }

    function scheduleLifecycleApply() {
        if (lifecycleApplyScheduled || !settingsLoaded || !isEnabled) return;
        lifecycleApplyScheduled = true;
        Promise.resolve().then(() => {
            lifecycleApplyScheduled = false;
            if (!isEnabled || typeof document === 'undefined' || !document.documentElement) return;
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
        overlayLifecycleObserver = new MutationObserver(() => {
            observeControlledAccountOverlay();
            Promise.resolve().then(observeControlledAccountOverlay);
        });
        overlayLifecycleObserver.observe(document.body, { childList: true });
        observeControlledAccountOverlay();
    }

    function addedTreeContainsBannerParts(node) {
        if (node?.nodeType !== Node.ELEMENT_NODE) return false;
        if (node.matches?.(
            'mo-banner, mo-banner-user-menu, mo-banner-sub-context-menu, mo-menu, .user-company-name, .user-menu-label'
        )) return true;
        return Boolean(
            findDeep('mo-banner-user-menu', node) ||
            findDeep('.user-company-name', node) ||
            findDeep('mo-menu', node)
        );
    }

    function observeBannerDiscoveryRoot(root) {
        if (!root?.querySelectorAll || bannerDiscoveryObservers.has(root)) return;
        const observer = new MutationObserver(records => {
            const bannerWasReplaced = cachedBannerParts?.userMenu && !cachedBannerParts.userMenu.isConnected;
            let bannerWasAdded = false;
            records.forEach(record => {
                Array.from(record.addedNodes || []).forEach(node => {
                    if (addedTreeContainsBannerParts(node)) bannerWasAdded = true;
                    if (node?.nodeType !== Node.ELEMENT_NODE) return;
                    if (node.shadowRoot) observeBannerDiscoveryRoot(node.shadowRoot);
                    node.querySelectorAll?.(KNOWN_BANNER_HOST_SELECTOR).forEach(element => {
                        if (element.shadowRoot) observeBannerDiscoveryRoot(element.shadowRoot);
                    });
                });
            });
            if (!bannerWasReplaced && !bannerWasAdded) return;
            cachedBannerParts = null;
            scheduleLifecycleApply();
        });
        observer.observe(root, { childList: true, subtree: true });
        bannerDiscoveryObservers.set(root, observer);
        root.querySelectorAll(KNOWN_BANNER_HOST_SELECTOR).forEach(element => {
            if (element.shadowRoot) observeBannerDiscoveryRoot(element.shadowRoot);
        });
    }

    function bindBannerDiscovery() {
        if (typeof document === 'undefined' || !document.body) return;
        observeBannerDiscoveryRoot(document.body);
    }

    function stopLifecycleObservers() {
        bannerDiscoveryObservers.forEach(observer => observer.disconnect());
        bannerDiscoveryObservers.clear();
        overlayLifecycleObserver?.disconnect();
        overlayLifecycleObserver = null;
        overlayLifecycleBound = false;
        lifecycleObservers.forEach(observer => observer.disconnect());
        lifecycleObservers.clear();
        overlayObservers.forEach(record => record.observer.disconnect());
        overlayObservers.clear();
        cachedBannerParts = null;
        lifecycleStarted = false;
    }

    function startLifecycleObservers() {
        if (!isEnabled || lifecycleStarted) return;
        lifecycleStarted = true;
        bindBannerDiscovery();
        bindOverlayLifecycle();
        observeLifecycleRoots();
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
            const revealControlledOverlay = menuWasOpen
                ? () => {}
                : concealControlledOverlay(menuTrigger);
            let timeoutId = null;
            let finished = false;

            const finish = username => {
                if (finished) return;
                finished = true;
                discoveryCheckForUsername = null;
                observers.forEach(observer => observer.disconnect());
                if (timeoutId) clearTimeout(timeoutId);
                if (username) rememberUsername(username);
                if (!menuWasOpen && menuTrigger.getAttribute('aria-expanded') === 'true') {
                    clickMenuTrigger(menuTrigger, menuActivator);
                }
                revealControlledOverlay();
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
        if (!settingsLoaded || !cacheLoaded) return;
        if (!isEnabled) {
            restoreAccountLabels();
            return;
        }
        startLifecycleObservers();

        const { userMenu, accountLabel, menuTrigger, menuActivator } = getBannerParts();
        if (!userMenu || !accountLabel) return;

        const visibleUsername = readUsernameFromMenu();
        if (visibleUsername) rememberUsername(visibleUsername);

        const activeOrganisation = readActiveOrganisation();
        const bannerPrefix = readBannerUsernamePrefix(accountLabel);
        const cachedPrefix = parseUsernamePrefix(resolvedUsername);
        const bannerUsername = buildUsername(bannerPrefix || cachedPrefix, activeOrganisation);
        if (bannerUsername) rememberUsername(bannerUsername);

        if (resolvedUsername) {
            replaceAccountLabel(accountLabel);
        }

        discoverUsername(userMenu, menuTrigger, menuActivator);
    }

    function initialize() {
        bindPidSelectionInvalidation();
        loadRememberedUsername();
        chrome.storage.sync.get({ [SETTING_KEY]: true }, data => {
            isEnabled = data[SETTING_KEY] !== false;
            settingsLoaded = true;
            if (isEnabled) startLifecycleObservers();
            apply();
        });

        if (!storageListenerBound && chrome.storage.onChanged) {
            storageListenerBound = true;
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area !== 'sync' || !changes[SETTING_KEY]) return;
                isEnabled = changes[SETTING_KEY].newValue !== false;
                if (isEnabled) startLifecycleObservers();
                else stopLifecycleObservers();
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

(function() {
    'use strict';

    const DIRECT_MOE_STYLE_ID = 'toolshed-direct-moe-style';
    const DIRECT_MOE_BODY_CLASS = 'toolshed-opening-moe';
    const DIRECT_MOE_HOVER_CLASS = 'toolshed-hovering-ai-chat';
    const MOE_INTRO_TEXT = 'AI-powered support assistant';
    const CONNECT_WITH_MOE_TEXT = 'Connect with Moe';
    const OPEN_MOE_EVENT = 'ops-toolshed-open-moe';
    let directMoeChatEnabled = true;
    let directMoeSettingsRequested = false;
    let directMoeStorageListenerBound = false;
    let directMoeObserver = null;
    let directMoeObservedRoots = new WeakSet();
    let currentDirectMoeRoots = {
        bannerRoot: null,
        helpRoot: null,
        menu: null,
        menuRoot: null
    };
    let boundAiChatButton = null;
    let connectRetryTimer = null;
    let discoveryRetryTimer = null;
    let hoverCleanupTimer = null;

    function normalizedText(element) {
        return (element?.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function findTextMatch(root, selector, expectedText) {
        if (!root?.querySelectorAll) return null;
        return Array.from(root.querySelectorAll(selector))
            .find(element => normalizedText(element) === expectedText) || null;
    }

    function getDirectMoeRoots() {
        const banner = document.querySelector('mo-banner');
        const bannerRoot = banner?.shadowRoot || null;
        const helpMenu = bannerRoot?.querySelector('mo-banner-help-menu') || null;
        const helpRoot = helpMenu?.shadowRoot || null;
        const menu = helpRoot?.querySelector('mo-menu') || null;
        const menuRoot = menu?.shadowRoot || null;
        return { bannerRoot, helpRoot, menu, menuRoot };
    }

    function findAiChatButton(roots = getDirectMoeRoots()) {
        return findTextMatch(roots.menuRoot, 'button, [role="button"]', 'AI Chat');
    }

    function findHelpMenuTrigger() {
        return getDirectMoeRoots().menu;
    }

    function findConnectWithMoeItem() {
        const roots = getDirectMoeRoots();
        for (const root of [document, roots.menuRoot, roots.helpRoot, roots.bannerRoot]) {
            const match = findTextMatch(root, 'mo-menu-item', CONNECT_WITH_MOE_TEXT);
            if (match) return match;
        }
        return null;
    }

    function injectDirectMoeStyles() {
        if (document.getElementById(DIRECT_MOE_STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = DIRECT_MOE_STYLE_ID;
        style.textContent = `
            body.${DIRECT_MOE_BODY_CLASS} #pendo-base,
            body.${DIRECT_MOE_BODY_CLASS} [id^="pendo-g-"],
            body.${DIRECT_MOE_HOVER_CLASS} #pendo-base,
            body.${DIRECT_MOE_HOVER_CLASS} [id^="pendo-g-"] {
                opacity: 0 !important;
                visibility: hidden !important;
                pointer-events: none !important;
            }
        `;
        document.head.appendChild(style);
    }

    function dismissMoeIntroduction(searchRoots = [document]) {
        const candidates = new Set();
        searchRoots.forEach(root => {
            if (root?.matches?.('#pendo-base, [id^="pendo-g-"]')) candidates.add(root);
            root?.querySelectorAll?.('#pendo-base, [id^="pendo-g-"]').forEach(element => {
                candidates.add(element);
            });
        });
        candidates.forEach(element => {
            const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
            if (text.includes(MOE_INTRO_TEXT) && text.includes(CONNECT_WITH_MOE_TEXT)) {
                element.remove();
            }
        });
    }

    function finishDirectMoeHandoff() {
        clearTimeout(connectRetryTimer);
        connectRetryTimer = null;
        window.setTimeout(() => document.body.classList.remove(DIRECT_MOE_BODY_CLASS), 500);
    }

    function handleDirectMoeHover(event) {
        if (!directMoeChatEnabled) return;
        event.stopImmediatePropagation();
        event.stopPropagation();
        clearTimeout(hoverCleanupTimer);
        injectDirectMoeStyles();
        document.body.classList.add(DIRECT_MOE_HOVER_CLASS);
        dismissMoeIntroduction();
    }

    function handleDirectMoeHoverEnd() {
        clearTimeout(hoverCleanupTimer);
        hoverCleanupTimer = window.setTimeout(() => {
            document.body.classList.remove(DIRECT_MOE_HOVER_CLASS);
            dismissMoeIntroduction();
        }, 750);
    }

    function chooseConnectWithMoe(attempt = 0) {
        dismissMoeIntroduction();
        const connectItem = findConnectWithMoeItem();
        if (connectItem) {
            connectItem.click();
            document.dispatchEvent(new CustomEvent(OPEN_MOE_EVENT));
            finishDirectMoeHandoff();
            return;
        }
        if (attempt >= 20) {
            finishDirectMoeHandoff();
            return;
        }
        connectRetryTimer = window.setTimeout(() => chooseConnectWithMoe(attempt + 1), 100);
    }

    function handleDirectMoeClick(event) {
        if (!directMoeChatEnabled) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        event.stopPropagation();
        clearTimeout(connectRetryTimer);
        injectDirectMoeStyles();
        document.body.classList.add(DIRECT_MOE_BODY_CLASS);
        dismissMoeIntroduction();

        const helpMenu = findHelpMenuTrigger();
        if (helpMenu?.getAttribute('aria-expanded') !== 'true') helpMenu?.click();
        chooseConnectWithMoe();
    }

    function bindDirectMoeButton(roots = getDirectMoeRoots()) {
        const nextButton = directMoeChatEnabled ? findAiChatButton(roots) : null;
        if (nextButton === boundAiChatButton) return;
        boundAiChatButton?.removeEventListener('click', handleDirectMoeClick, true);
        boundAiChatButton?.removeEventListener('pointerenter', handleDirectMoeHover, true);
        boundAiChatButton?.removeEventListener('mouseenter', handleDirectMoeHover, true);
        boundAiChatButton?.removeEventListener('mouseover', handleDirectMoeHover, true);
        boundAiChatButton?.removeEventListener('pointerleave', handleDirectMoeHoverEnd, true);
        boundAiChatButton?.removeEventListener('mouseleave', handleDirectMoeHoverEnd, true);
        boundAiChatButton = nextButton;
        boundAiChatButton?.addEventListener('click', handleDirectMoeClick, true);
        boundAiChatButton?.addEventListener('pointerenter', handleDirectMoeHover, true);
        boundAiChatButton?.addEventListener('mouseenter', handleDirectMoeHover, true);
        boundAiChatButton?.addEventListener('mouseover', handleDirectMoeHover, true);
        boundAiChatButton?.addEventListener('pointerleave', handleDirectMoeHoverEnd, true);
        boundAiChatButton?.addEventListener('mouseleave', handleDirectMoeHoverEnd, true);
    }

    function observeDirectMoeRoot(root) {
        if (!directMoeObserver || !root) return;
        if (!directMoeObservedRoots.has(root)) {
            directMoeObservedRoots.add(root);
            directMoeObserver.observe(root, { childList: true, subtree: true });
        }
    }

    function refreshDirectMoeBindings() {
        const roots = getDirectMoeRoots();
        currentDirectMoeRoots = roots;
        observeDirectMoeRoot(document.documentElement);
        observeDirectMoeRoot(roots.bannerRoot);
        observeDirectMoeRoot(roots.helpRoot);
        observeDirectMoeRoot(roots.menuRoot);
        bindDirectMoeButton(roots);
        return Boolean(boundAiChatButton?.isConnected);
    }

    function scheduleDirectMoeDiscovery(attempt = 0) {
        clearTimeout(discoveryRetryTimer);
        discoveryRetryTimer = null;
        if (!directMoeChatEnabled || boundAiChatButton?.isConnected || attempt >= 20) return;
        discoveryRetryTimer = window.setTimeout(() => {
            discoveryRetryTimer = null;
            if (!refreshDirectMoeBindings()) scheduleDirectMoeDiscovery(attempt + 1);
        }, 150);
    }

    function mutationContainsMoeHost(node) {
        if (node?.nodeType !== 1) return false;
        return node.matches?.('mo-banner, mo-banner-help-menu, mo-menu') ||
            Boolean(node.querySelector?.('mo-banner, mo-banner-help-menu, mo-menu'));
    }

    function handleDirectMoeMutations(records) {
        const addedNodes = records.flatMap(record => Array.from(record.addedNodes || []));
        const knownShadowRootChanged = records.some(record =>
            record.target === currentDirectMoeRoots.bannerRoot ||
            record.target === currentDirectMoeRoots.helpRoot ||
            record.target === currentDirectMoeRoots.menuRoot
        );
        const relevantHostAdded = addedNodes.some(mutationContainsMoeHost);

        if (!boundAiChatButton?.isConnected || knownShadowRootChanged || relevantHostAdded) {
            if (!refreshDirectMoeBindings()) scheduleDirectMoeDiscovery();
        }

        if (
            document.body.classList.contains(DIRECT_MOE_BODY_CLASS) ||
            document.body.classList.contains(DIRECT_MOE_HOVER_CLASS)
        ) {
            dismissMoeIntroduction(addedNodes);
        }
    }

    function configureDirectMoeFeature(enabled) {
        directMoeChatEnabled = enabled !== false;
        if (!directMoeChatEnabled) {
            boundAiChatButton?.removeEventListener('click', handleDirectMoeClick, true);
            boundAiChatButton?.removeEventListener('pointerenter', handleDirectMoeHover, true);
            boundAiChatButton?.removeEventListener('mouseenter', handleDirectMoeHover, true);
            boundAiChatButton?.removeEventListener('mouseover', handleDirectMoeHover, true);
            boundAiChatButton?.removeEventListener('pointerleave', handleDirectMoeHoverEnd, true);
            boundAiChatButton?.removeEventListener('mouseleave', handleDirectMoeHoverEnd, true);
            boundAiChatButton = null;
            clearTimeout(discoveryRetryTimer);
            discoveryRetryTimer = null;
            directMoeObserver?.disconnect();
            directMoeObserver = null;
            directMoeObservedRoots = new WeakSet();
            currentDirectMoeRoots = {
                bannerRoot: null,
                helpRoot: null,
                menu: null,
                menuRoot: null
            };
            document.body.classList.remove(DIRECT_MOE_BODY_CLASS);
            document.body.classList.remove(DIRECT_MOE_HOVER_CLASS);
            return;
        }

        injectDirectMoeStyles();
        if (!directMoeObserver && document.documentElement) {
            directMoeObserver = new MutationObserver(handleDirectMoeMutations);
        }
        if (!refreshDirectMoeBindings()) scheduleDirectMoeDiscovery();
    }

    function initializeDirectMoeFeature() {
        if (!directMoeSettingsRequested) {
            directMoeSettingsRequested = true;
            chrome.storage.sync.get({ directMoeChatEnabled: true }, settings => {
                configureDirectMoeFeature(settings.directMoeChatEnabled);
            });
        } else {
            if (!refreshDirectMoeBindings()) scheduleDirectMoeDiscovery();
        }

        if (!directMoeStorageListenerBound && chrome.storage?.onChanged) {
            directMoeStorageListenerBound = true;
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === 'sync' && changes.directMoeChatEnabled) {
                    configureDirectMoeFeature(changes.directMoeChatEnabled.newValue);
                }
            });
        }
    }

    // Applies a smaller font size to the chat window
    function applyFontSizeChange(enabled) {
        const styleId = 'live-chat-font-style';
        let style = document.getElementById(styleId);

        if (!enabled) {
            if (style) style.remove();
            return;
        }

        if (style) return;

        style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            html[style*="font-size: 14px"] {
                font-size: 12px !important;
            }
        `;
        document.head.appendChild(style);
    }

    // Makes the chat window resizable from the top
    function makeChatResizable(enabled, webWidget) {
        const handleId = 'resizable-chat-handle';
        let handle = document.getElementById(handleId);

        // Clean up previous listener if it exists
        if (webWidget._resizeListener) {
            window.removeEventListener('resize', webWidget._resizeListener);
            delete webWidget._resizeListener;
        }

        if (!enabled) {
            if (handle) handle.remove();
            return null;
        }

        if (handle) return handle;

        handle = document.createElement('div');
        handle.id = handleId; // Styles are in content.css

        document.body.appendChild(handle);

        const updateHandlePosition = () => {
            const widgetRect = webWidget.getBoundingClientRect();
            Object.assign(handle.style, {
                width: `${widgetRect.width}px`,
                top: `${widgetRect.top}px`,
                right: `${window.innerWidth - widgetRect.right}px`,
                display: webWidget.style.display
            });
        };

        updateHandlePosition();
        window.addEventListener('resize', updateHandlePosition);

        let isResizing = false;
        let initialMouseY = 0;
        let initialWidgetTop = 0;
        let initialWidgetHeight = 0;

        const MIN_CHAT_HEIGHT = 100;
        const BOTTOM_MARGIN = 40;

        const onMouseDown = (e) => {
            isResizing = true;
            document.body.style.userSelect = 'none';

            const widgetRect = webWidget.getBoundingClientRect();
            initialMouseY = e.clientY;
            initialWidgetTop = widgetRect.top;
            initialWidgetHeight = widgetRect.height;

            webWidget.style.bottom = 'auto';

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);

            e.preventDefault();
        };

        const onMouseMove = (e) => {
            if (!isResizing) return;

            const deltaY = e.clientY - initialMouseY;
            const newTop = initialWidgetTop + deltaY;
            const newHeight = initialWidgetHeight - deltaY;

            if (newHeight > MIN_CHAT_HEIGHT && newHeight < (window.innerHeight - BOTTOM_MARGIN)) {
                webWidget.style.top = `${newTop}px`;
                webWidget.style.height = `${newHeight}px`;
                handle.style.top = `${newTop}px`;
            }
        };

        const onMouseUp = () => {
            isResizing = false;
            document.body.style.userSelect = '';
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        handle.addEventListener('mousedown', onMouseDown);

        return handle;
    }

    // Creates the chat launcher button
    function createLauncher(webWidget, resizerHandle) {
        const launcherId = 'launcher-button-container';
        if (document.getElementById(launcherId)) return document.getElementById(launcherId);

        const launcherContainer = document.createElement('div');
        launcherContainer.id = launcherId;

        const buttonHTML = `
            <button>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 15 16">
                    <path d="M1.3,16c-0.7,0-1.1-0.3-1.2-0.8c-0.3-0.8,0.5-1.3,0.8-1.5c0.6-0.4,0.9-0.7,1-1c0-0.2-0.1-0.4-0.3-0.7c0,0,0-0.1-0.1-0.1 C0.5,10.6,0,9,0,7.4C0,3.3,3.4,0,7.5,0C11.6,0,15,3.3,15,7.4s-3.4,7.4-7.5,7.4c-0.5,0-1-0.1-1.5-0.2C3.4,15.9,1.5,16,1.5,16 C1.4,16,1.4,16,1.3,16z M3.3,10.9c0.5,0.7,0.7,1.5,0.6,2.2c0,0.1-0.1,0.3-0.1,0.4c0.5-0.2,1-0.4,1.6-0.7c0.2-0.1,0.4-0.2,0.6-0.1 c0,0,0.1,0,0.1,0c0.4,0.1,0.9,0.2,1.4,0.2c3,0,5.5-2.4,5.5-5.4S10.5,2,7.5,2C4.5,2,2,4.4,2,7.4c0,1.2,0.4,2.4,1.2,3.3 C3.2,10.8,3.3,10.8,3.3,10.9z"></path>
                </svg>
                <span>Chat</span>
            </button>
        `;
        launcherContainer.innerHTML = buttonHTML;
        document.body.appendChild(launcherContainer);

        launcherContainer.querySelector('button').addEventListener('click', () => {
            launcherContainer.style.display = 'none';
            if (webWidget) {
                webWidget.style.display = 'block';
                setTimeout(() => { webWidget.style.opacity = '1'; }, 50);
            }
            if (resizerHandle) {
                const widgetRect = webWidget.getBoundingClientRect();
                resizerHandle.style.top = `${widgetRect.top}px`;
                resizerHandle.style.display = 'block';
            }
        });
        return launcherContainer;
    }

    // Handles the scheduled display of the chat widget
    function handleScheduledChat(enabled, webWidget, resizerHandle) {
        let launcher = document.getElementById('launcher-button-container');

        if (!enabled) {
            if (launcher) launcher.style.display = 'none';
            webWidget.style.display = 'block';
            if (resizerHandle) resizerHandle.style.display = 'block';
            return;
        }

        if (!launcher) {
            launcher = createLauncher(webWidget, resizerHandle);
        }

        const now = new Date();
        const currentHour = now.getHours();
        const isScheduledTime = currentHour >= 10 && currentHour < 12;

        if (isScheduledTime) {
            launcher.style.display = 'block';
            webWidget.style.display = 'none';
            if (resizerHandle) resizerHandle.style.display = 'none';
        } else {
            launcher.style.display = 'none';
            webWidget.style.display = 'none';
            if (resizerHandle) resizerHandle.style.display = 'none';
        }
    }

    // Initializes all chat enhancement features
    function initializeChatEnhancements() {
        initializeDirectMoeFeature();
        const webWidget = document.getElementById('webWidget');
        if (!webWidget || webWidget.dataset.chatEnhancementsInitialized) return;

        chrome.storage.sync.get([
            'fontSizeToggleEnabled',
            'resizableChatToggleEnabled',
            'scheduledChatToggleEnabled'
        ], (settings) => {
            applyFontSizeChange(settings.fontSizeToggleEnabled);
            const resizerHandle = makeChatResizable(settings.resizableChatToggleEnabled, webWidget);
            handleScheduledChat(settings.scheduledChatToggleEnabled, webWidget, resizerHandle);

            webWidget.dataset.chatEnhancementsInitialized = 'true';
        });
    }

    window.liveChatEnhancements = {
        initialize: initializeChatEnhancements,
        configureDirectMoeFeature,
        dismissMoeIntroduction
    };
})();

(function() {
    const BUTTON_ID = 'toolshed-help-guides-launcher';
    const STYLE_ID = 'toolshed-help-guides-launcher-styles';
    const BANNER_ID = 'mo-banner-module-container';
    const POSITION_KEY = 'helpGuidesLauncherPosition';
    const EDGE_GAP = 18;
    const CORNER_ZONE = 72;
    const SNAP_DISTANCE = 86;
    const DRAG_THRESHOLD = 8;
    const EDGE_RELEASE_DISTANCE = 34;
    const EDGE_RESISTANCE = 0.18;
    const CONTROL_GAP = 14;
    const COLLISION_SELECTOR = [
        '#launcher-button-container',
        '#webWidget',
        'iframe[title*="chat" i]',
        'iframe[title*="messag" i]',
        'button[aria-label*="chat" i]',
        '[role="button"][aria-label*="chat" i]',
        'button[title*="expand" i]',
        '[role="button"][aria-label*="expand" i]',
        'mo-icon[name*="expand" i]'
    ].join(',');
    let isEnabled = null;
    let isPanelOpen = false;
    let onboardingTourActive = false;
    let panelStateRevision = 0;
    let routeListenersBound = false;
    let bannerObserver = null;
    let collisionObserver = null;
    let collisionFrame = null;

    function isLauncherExcluded() {
        return window.location.href.toLowerCase().includes('ideskos-viewport');
    }

    function isBannerReady() {
        return Boolean(document.getElementById(BANNER_ID) || document.querySelector('mo-banner'));
    }
    let storageListenerBound = false;
    let runtimeListenerBound = false;
    let preferredPosition = null;

    function openHelpGuides(event) {
        event?.preventDefault();
        event?.stopPropagation();
        if (event?.detail > 0) event.currentTarget?.blur?.();
        if (isEnabled !== true || onboardingTourActive) return;

        const previousPanelState = isPanelOpen;
        const action = isPanelOpen ? 'closeHelpGuidesFromLauncher' : 'openHelpGuides';
        isPanelOpen = action === 'openHelpGuides';
        const requestRevision = ++panelStateRevision;
        chrome.runtime.sendMessage({ action })
            .then(response => {
                if (requestRevision !== panelStateRevision) return;
                if (response?.status !== 'success') {
                    isPanelOpen = previousPanelState;
                    return;
                }
                isPanelOpen = response.panelState === 'open';
            })
            .catch(error => {
                if (requestRevision === panelStateRevision) isPanelOpen = previousPanelState;
                console.warn('Could not toggle Help Guides:', error.message);
            });
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${BUTTON_ID} {
                position: fixed;
                right: 18px;
                bottom: 20px;
                z-index: 2147483000;
                display: inline-flex;
                align-items: center;
                gap: 8px;
                min-height: 44px;
                padding: 0 16px 0 10px;
                border: 1px solid rgba(255, 255, 255, 0.26);
                border-radius: 999px;
                background: rgba(6, 8, 141, 0.8);
                backdrop-filter: none;
                box-shadow: 0 4px 14px rgba(6, 8, 141, 0.22);
                color: #fff;
                font: 600 14px/1.2 "Outfit", "Segoe UI", sans-serif;
                letter-spacing: 0.01em;
                text-shadow: 0 1px 2px rgba(0, 0, 35, 0.45);
                cursor: grab;
                touch-action: none;
                user-select: none;
                transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease, opacity 180ms ease, left 220ms cubic-bezier(0.22, 1, 0.36, 1), top 220ms cubic-bezier(0.22, 1, 0.36, 1);
            }
            #${BUTTON_ID}:hover {
                background: rgba(5, 6, 111, 0.88);
                box-shadow: 0 6px 18px rgba(6, 8, 141, 0.28);
                transform: translateY(-1px);
            }
            #${BUTTON_ID}:active,
            #${BUTTON_ID}.is-dragging {
                cursor: grabbing;
                box-shadow: 0 8px 22px rgba(6, 8, 141, 0.3);
                transform: scale(1.02);
            }
            #${BUTTON_ID}.is-pressed:not(.is-dragging) {
                cursor: grabbing;
                transform: scale(0.98);
            }
            #${BUTTON_ID}.is-dragging {
                transition: none;
            }
            #${BUTTON_ID}.is-positioning {
                transition: none;
            }
            #${BUTTON_ID}.is-resisting {
                transition: left 80ms ease-out, top 80ms ease-out, transform 120ms ease;
            }
            #${BUTTON_ID}:focus-visible {
                outline: 2px solid rgba(255, 255, 255, 0.95);
                outline-offset: 3px;
                box-shadow: 0 0 0 5px rgba(6, 8, 141, 0.3), 0 5px 16px rgba(6, 8, 141, 0.22);
            }
            #${BUTTON_ID} .toolshed-help-guides-icon {
                display: grid;
                width: 26px;
                height: 26px;
                place-items: center;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.14);
                color: #fff;
                pointer-events: none;
            }
            #${BUTTON_ID} .toolshed-help-guides-icon svg {
                width: 16px;
                height: 16px;
                fill: none;
                stroke: currentColor;
                stroke-linecap: round;
                stroke-linejoin: round;
                stroke-width: 1.8;
            }
            #${BUTTON_ID} > span:last-child {
                pointer-events: none;
                white-space: nowrap;
            }
            @media (prefers-reduced-motion: reduce) {
                #${BUTTON_ID} { transition-duration: 0.01ms !important; }
            }
        `;
        document.head.appendChild(style);
    }

    function clampPosition(button, left, top) {
        const maxLeft = Math.max(EDGE_GAP, window.innerWidth - button.offsetWidth - EDGE_GAP);
        const maxTop = Math.max(EDGE_GAP, window.innerHeight - button.offsetHeight - EDGE_GAP);
        return {
            left: Math.min(Math.max(left, EDGE_GAP), maxLeft),
            top: Math.min(Math.max(top, EDGE_GAP), maxTop),
            maxLeft,
            maxTop
        };
    }

    function placeButton(button, left, top) {
        const position = clampPosition(button, left, top);
        button.style.right = 'auto';
        button.style.bottom = 'auto';
        button.style.left = `${position.left}px`;
        button.style.top = `${position.top}px`;
        return position;
    }

    function isVisibleCornerControl(element, button) {
        if (!element || element === button || button.contains(element)) return false;
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0 || rect.width > 220 || rect.height > 220) return false;
        const styles = window.getComputedStyle?.(element);
        const opacity = Number.parseFloat(styles?.opacity);
        if (styles?.display === 'none' || styles?.visibility === 'hidden' ||
            (Number.isFinite(opacity) && opacity === 0)) return false;
        return rect.right > window.innerWidth - 220 && rect.bottom > window.innerHeight - 180;
    }

    function overlapsWithGap(buttonPosition, button, obstacleRect) {
        const left = buttonPosition.left - CONTROL_GAP;
        const top = buttonPosition.top - CONTROL_GAP;
        const right = buttonPosition.left + button.offsetWidth + CONTROL_GAP;
        const bottom = buttonPosition.top + button.offsetHeight + CONTROL_GAP;
        return left < obstacleRect.right && right > obstacleRect.left &&
            top < obstacleRect.bottom && bottom > obstacleRect.top;
    }

    function findUnderlyingCornerControls(buttonPosition, button) {
        if (typeof document.elementsFromPoint !== 'function') return [];
        const left = buttonPosition.left;
        const top = buttonPosition.top;
        const right = left + button.offsetWidth;
        const bottom = top + button.offsetHeight;
        const points = [
            [left + 4, top + 4],
            [right - 4, top + 4],
            [left + 4, bottom - 4],
            [right - 4, bottom - 4],
            [(left + right) / 2, (top + bottom) / 2]
        ];
        const candidates = new Set();
        points.forEach(([x, y]) => document.elementsFromPoint(x, y).forEach(element => {
            if (element === button || button.contains(element)) return;
            const styles = window.getComputedStyle?.(element);
            if (element.matches?.('button, a, iframe, [role="button"], mo-icon') || styles?.cursor === 'pointer') {
                candidates.add(element);
            }
        }));
        return Array.from(candidates).filter(element => isVisibleCornerControl(element, button));
    }

    function reconcileLauncherPosition(button = document.getElementById(BUTTON_ID)) {
        if (!button || !preferredPosition || button.classList.contains('is-dragging')) return;
        const basePosition = clampPosition(button, preferredPosition.left, preferredPosition.top);
        const obstacleElements = new Set([
            ...document.querySelectorAll(COLLISION_SELECTOR),
            ...findUnderlyingCornerControls(basePosition, button)
        ]);
        const obstacles = Array.from(obstacleElements)
            .filter(element => isVisibleCornerControl(element, button))
            .map(element => element.getBoundingClientRect())
            .filter(rect => overlapsWithGap(basePosition, button, rect));

        if (obstacles.length === 0) {
            button.classList.remove('is-avoiding-control');
            placeButton(button, basePosition.left, basePosition.top);
            return;
        }

        const obstacleLeft = Math.min(...obstacles.map(rect => rect.left));
        const safeLeft = obstacleLeft - button.offsetWidth - CONTROL_GAP;
        button.classList.add('is-avoiding-control');
        placeButton(button, safeLeft, basePosition.top);
    }

    function scheduleCollisionCheck() {
        if (collisionFrame !== null) return;
        const nextFrame = window.requestAnimationFrame || (callback => window.setTimeout(callback, 0));
        collisionFrame = nextFrame(() => {
            collisionFrame = null;
            reconcileLauncherPosition();
        });
    }

    function startCollisionObserver() {
        if (collisionObserver || !document.documentElement) return;
        collisionObserver = new MutationObserver(records => {
            const shouldCheck = records.some(record => {
                if (record.type === 'childList') return true;
                const target = record.target;
                return target?.id !== BUTTON_ID && target?.matches?.(COLLISION_SELECTOR);
            });
            if (shouldCheck) scheduleCollisionCheck();
        });
        collisionObserver.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class', 'aria-hidden']
        });
    }

    function savePosition(position) {
        preferredPosition = { left: position.left, top: position.top };
        chrome.storage?.local?.set?.({
            [POSITION_KEY]: { left: Math.round(position.left), top: Math.round(position.top) }
        });
    }

    function snapToEdge(button) {
        const rect = button.getBoundingClientRect();
        const position = clampPosition(button, rect.left, rect.top);
        const distances = {
            left: position.left,
            right: position.maxLeft - position.left,
            top: position.top,
            bottom: position.maxTop - position.top
        };
        const nearestEdge = Object.entries(distances).sort((a, b) => a[1] - b[1])[0][0];
        if (distances[nearestEdge] > SNAP_DISTANCE) {
            const restingPosition = placeButton(button, position.left, position.top);
            savePosition(restingPosition);
            return;
        }
        let { left, top } = position;

        if (nearestEdge === 'left') left = EDGE_GAP;
        if (nearestEdge === 'right') left = position.maxLeft;
        if (nearestEdge === 'top') top = EDGE_GAP;
        if (nearestEdge === 'bottom') top = position.maxTop;

        if (top < CORNER_ZONE) top = EDGE_GAP;
        if (position.maxTop - top < CORNER_ZONE) top = position.maxTop;
        if (left < CORNER_ZONE) left = EDGE_GAP;
        if (position.maxLeft - left < CORNER_ZONE) left = position.maxLeft;

        const snapped = placeButton(button, left, top);
        savePosition(snapped);
    }

    function restorePosition(callback) {
        if (!chrome.storage?.local?.get) {
            callback(null);
            return;
        }
        chrome.storage.local.get({ [POSITION_KEY]: null }, data => {
            const saved = data?.[POSITION_KEY];
            if (!saved || !Number.isFinite(saved.left) || !Number.isFinite(saved.top)) {
                callback(null);
                return;
            }
            preferredPosition = { left: saved.left, top: saved.top };
            callback(preferredPosition);
        });
    }

    function animateLauncherIn(button, target) {
        const position = clampPosition(button, target.left, target.top);
        const distances = {
            left: position.left,
            right: position.maxLeft - position.left,
            top: position.top,
            bottom: position.maxTop - position.top
        };
        const nearestEdge = Object.entries(distances).sort((a, b) => a[1] - b[1])[0][0];
        let startLeft = position.left;
        let startTop = position.top;

        if (nearestEdge === 'left') startLeft = -button.offsetWidth - 12;
        if (nearestEdge === 'right') startLeft = window.innerWidth + 12;
        if (nearestEdge === 'top') startTop = -button.offsetHeight - 12;
        if (nearestEdge === 'bottom') startTop = window.innerHeight + 12;

        button.style.right = 'auto';
        button.style.bottom = 'auto';
        button.style.left = `${startLeft}px`;
        button.style.top = `${startTop}px`;
        button.style.opacity = '0';

        const nextFrame = window.requestAnimationFrame || (callback => callback());
        nextFrame(() => nextFrame(() => {
            button.classList.remove('is-positioning');
            button.style.opacity = '1';
            placeButton(button, position.left, position.top);
            scheduleCollisionCheck();
        }));
    }

    function makeDraggable(button) {
        let dragState = null;
        let suppressNextClick = false;

        button.addEventListener('pointerdown', event => {
            if (event.button !== undefined && event.button !== 0) return;
            const rect = button.getBoundingClientRect();
            const edgeDistances = [
                Math.abs(rect.left - EDGE_GAP),
                Math.abs(window.innerWidth - EDGE_GAP - rect.right),
                Math.abs(rect.top - EDGE_GAP),
                Math.abs(window.innerHeight - EDGE_GAP - rect.bottom)
            ];
            dragState = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                left: rect.left,
                top: rect.top,
                moved: false,
                nudged: false,
                edgeHeld: Math.min(...edgeDistances) <= 12
            };
            button.classList.add('is-pressed');
            button.setPointerCapture?.(event.pointerId);
        });

        button.addEventListener('pointermove', event => {
            if (!dragState || event.pointerId !== dragState.pointerId) return;
            const deltaX = event.clientX - dragState.startX;
            const deltaY = event.clientY - dragState.startY;
            const distance = Math.hypot(deltaX, deltaY);
            if (!dragState.moved && dragState.edgeHeld && distance < EDGE_RELEASE_DISTANCE) {
                dragState.nudged = distance >= 2;
                button.classList.add('is-resisting');
                placeButton(
                    button,
                    dragState.left + deltaX * EDGE_RESISTANCE,
                    dragState.top + deltaY * EDGE_RESISTANCE
                );
                return;
            }
            if (!dragState.moved && distance < DRAG_THRESHOLD) return;
            dragState.moved = true;
            button.classList.remove('is-resisting');
            button.classList.add('is-dragging');
            if (dragState.edgeHeld) {
                const releasedDistance = EDGE_RELEASE_DISTANCE * EDGE_RESISTANCE + Math.max(0, distance - EDGE_RELEASE_DISTANCE);
                const releaseRatio = distance ? releasedDistance / distance : 0;
                placeButton(button, dragState.left + deltaX * releaseRatio, dragState.top + deltaY * releaseRatio);
            } else {
                placeButton(button, dragState.left + deltaX, dragState.top + deltaY);
            }
        });

        const finishDrag = event => {
            if (!dragState || event.pointerId !== dragState.pointerId) return;
            button.releasePointerCapture?.(event.pointerId);
            button.classList.remove('is-pressed');
            button.classList.remove('is-resisting');
            if (dragState.moved) {
                suppressNextClick = true;
                button.classList.remove('is-dragging');
                snapToEdge(button);
                scheduleCollisionCheck();
            } else if (dragState.nudged) {
                placeButton(button, dragState.left, dragState.top);
            }
            dragState = null;
        };
        button.addEventListener('pointerup', finishDrag);
        button.addEventListener('pointercancel', finishDrag);

        button.addEventListener('click', event => {
            if (suppressNextClick) {
                suppressNextClick = false;
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            openHelpGuides(event);
        });
    }

    function createBookIcon() {
        const svgNamespace = 'http://www.w3.org/2000/svg';
        const icon = document.createElement('span');
        icon.className = 'toolshed-help-guides-icon';
        icon.setAttribute('aria-hidden', 'true');
        const iconSvg = document.createElementNS(svgNamespace, 'svg');
        iconSvg.setAttribute('viewBox', '0 0 24 24');
        const iconPath = document.createElementNS(svgNamespace, 'path');
        iconPath.setAttribute('d', 'M4 5.5A2.5 2.5 0 0 1 6.5 3H11a2 2 0 0 1 2 2v15a2 2 0 0 0-2-2H6.5A2.5 2.5 0 0 0 4 20.5v-15Zm16 0A2.5 2.5 0 0 0 17.5 3H15a2 2 0 0 0-2 2v15a2 2 0 0 1 2-2h2.5a2.5 2.5 0 0 1 2.5 2.5v-15Z');
        iconSvg.appendChild(iconPath);
        icon.appendChild(iconSvg);
        return icon;
    }

    function removeLauncher() {
        document.getElementById(BUTTON_ID)?.remove();
    }

    function stopWaitingForBanner() {
        bannerObserver?.disconnect();
        bannerObserver = null;
    }

    function waitForBannerAndEnsureLauncher() {
        if (window.top !== window.self || isEnabled !== true || isLauncherExcluded()) {
            stopWaitingForBanner();
            removeLauncher();
            return;
        }

        if (isBannerReady()) {
            stopWaitingForBanner();
            ensureLauncher();
            return;
        }

        removeLauncher();
        if (bannerObserver || !document.documentElement) return;

        bannerObserver = new MutationObserver(() => {
            if (!isBannerReady()) return;
            stopWaitingForBanner();
            ensureLauncher();
        });
        bannerObserver.observe(document.documentElement, { childList: true, subtree: true });
    }

    function ensureLauncher() {
        if (window.top !== window.self || isEnabled !== true || isLauncherExcluded() || !isBannerReady() || document.getElementById(BUTTON_ID)) return;

        injectStyles();
        const button = document.createElement('button');
        button.id = BUTTON_ID;
        button.type = 'button';
        button.setAttribute('aria-label', 'Open Help Guides');
        button.classList.add('is-positioning');
        button.style.opacity = '0';

        const label = document.createElement('span');
        label.textContent = 'Help Guides';
        button.append(createBookIcon(), label);
        makeDraggable(button);
        document.body.appendChild(button);
        startCollisionObserver();
        restorePosition(savedPosition => {
            const rect = button.getBoundingClientRect();
            const target = savedPosition || { left: rect.left, top: rect.top };
            if (!savedPosition) preferredPosition = { left: target.left, top: target.top };
            animateLauncherIn(button, target);
        });
    }

    function initialize() {
        if (!chrome.storage?.sync) {
            console.warn('Help Guides: chrome.storage.sync not available.');
            return;
        }

        chrome.storage.sync.get({ helpGuidesEnabled: true }, data => {
            isEnabled = data.helpGuidesEnabled !== false;
            waitForBannerAndEnsureLauncher();
            window.appLearnFeature?.applyTransparency();
        });
        chrome.storage.local?.get?.({ onboardingTourActive: false }, data => {
            onboardingTourActive = data.onboardingTourActive === true;
        });

        const stateRequestRevision = panelStateRevision;
        chrome.runtime?.sendMessage?.({ action: 'getHelpGuidesPanelState' })
            .then(response => {
                if (response?.status === 'success' && stateRequestRevision === panelStateRevision) {
                    isPanelOpen = response.open === true;
                }
            })
            .catch(() => {
                // The service worker can still be starting during page load.
            });

        if (!storageListenerBound && chrome.storage.onChanged) {
            storageListenerBound = true;
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === 'local' && changes.onboardingTourActive) {
                    onboardingTourActive = changes.onboardingTourActive.newValue === true;
                    return;
                }
                if (area === 'sync' && changes.helpGuidesEnabled) {
                    isEnabled = changes.helpGuidesEnabled.newValue !== false;
                    waitForBannerAndEnsureLauncher();
                    window.appLearnFeature?.applyTransparency();
                }
            });
        }

        if (!runtimeListenerBound && chrome.runtime?.onMessage) {
            runtimeListenerBound = true;
            chrome.runtime.onMessage.addListener(message => {
                if (message?.action !== 'helpGuidesPanelState') return;
                panelStateRevision += 1;
                isPanelOpen = message.open === true;
            });
        }

        if (!routeListenersBound) {
            routeListenersBound = true;
            const syncLauncherForRoute = () => {
                waitForBannerAndEnsureLauncher();
            };
            window.addEventListener('hashchange', syncLauncherForRoute);
            window.addEventListener('popstate', syncLauncherForRoute);
            window.addEventListener('pageshow', syncLauncherForRoute);
        }

        window.addEventListener('resize', () => {
            const button = document.getElementById(BUTTON_ID);
            if (!button || !preferredPosition) return;
            reconcileLauncherPosition(button);
        }, { passive: true });
    }

    window.helpGuidesLauncherFeature = {
        initialize,
        ensureLauncher,
        removeLauncher,
        openHelpGuides,
        isEnabled: () => isEnabled === true,
        isPanelOpen: () => isPanelOpen,
        isLauncherExcluded,
        isBannerReady,
        snapToEdge,
        reconcileLauncherPosition
    };
})();

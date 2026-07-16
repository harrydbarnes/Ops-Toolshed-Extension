(function() {
    const BUTTON_ID = 'toolshed-help-guides-launcher';
    const STYLE_ID = 'toolshed-help-guides-launcher-styles';
    const POSITION_KEY = 'helpGuidesLauncherPosition';
    const EDGE_GAP = 18;
    const CORNER_ZONE = 72;
    const SNAP_DISTANCE = 86;
    let isEnabled = null;
    let storageListenerBound = false;
    let preferredPosition = null;

    function openHelpGuides(event) {
        event?.preventDefault();
        event?.stopPropagation();
        if (isEnabled !== true) return;

        chrome.runtime.sendMessage({ action: 'openHelpGuides' })
            .catch(error => console.warn('Could not toggle Help Guides:', error.message));
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
                background: rgba(6, 8, 141, 0.88);
                backdrop-filter: blur(6px);
                box-shadow: 0 4px 14px rgba(6, 8, 141, 0.22);
                color: #fff;
                font: 600 14px/1.2 "Outfit", "Segoe UI", sans-serif;
                letter-spacing: 0.01em;
                cursor: grab;
                touch-action: none;
                user-select: none;
                transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease, left 220ms cubic-bezier(0.22, 1, 0.36, 1), top 220ms cubic-bezier(0.22, 1, 0.36, 1);
            }
            #${BUTTON_ID}:hover {
                background: rgba(5, 6, 111, 0.98);
                box-shadow: 0 6px 18px rgba(6, 8, 141, 0.28);
                transform: translateY(-1px);
            }
            #${BUTTON_ID}:active,
            #${BUTTON_ID}.is-dragging {
                cursor: grabbing;
                box-shadow: 0 8px 22px rgba(6, 8, 141, 0.3);
                transform: scale(1.02);
            }
            #${BUTTON_ID}.is-dragging {
                transition: none;
            }
            #${BUTTON_ID}:focus-visible {
                outline: 3px solid #ff4087;
                outline-offset: 2px;
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

    function restorePosition(button) {
        if (!chrome.storage?.local?.get) return;
        chrome.storage.local.get({ [POSITION_KEY]: null }, data => {
            const saved = data?.[POSITION_KEY];
            if (!saved || !Number.isFinite(saved.left) || !Number.isFinite(saved.top)) return;
            preferredPosition = { left: saved.left, top: saved.top };
            placeButton(button, saved.left, saved.top);
        });
    }

    function makeDraggable(button) {
        let dragState = null;
        let suppressNextClick = false;

        button.addEventListener('pointerdown', event => {
            if (event.button !== undefined && event.button !== 0) return;
            const rect = button.getBoundingClientRect();
            dragState = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                left: rect.left,
                top: rect.top,
                moved: false
            };
            button.setPointerCapture?.(event.pointerId);
        });

        button.addEventListener('pointermove', event => {
            if (!dragState || event.pointerId !== dragState.pointerId) return;
            const deltaX = event.clientX - dragState.startX;
            const deltaY = event.clientY - dragState.startY;
            if (!dragState.moved && Math.hypot(deltaX, deltaY) < 5) return;
            dragState.moved = true;
            button.classList.add('is-dragging');
            placeButton(button, dragState.left + deltaX, dragState.top + deltaY);
        });

        const finishDrag = event => {
            if (!dragState || event.pointerId !== dragState.pointerId) return;
            button.releasePointerCapture?.(event.pointerId);
            if (dragState.moved) {
                suppressNextClick = true;
                button.classList.remove('is-dragging');
                snapToEdge(button);
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

    function ensureLauncher() {
        if (window.top !== window.self || isEnabled !== true || document.getElementById(BUTTON_ID)) return;

        injectStyles();
        const button = document.createElement('button');
        button.id = BUTTON_ID;
        button.type = 'button';
        button.setAttribute('aria-label', 'Open Help Guides');

        const label = document.createElement('span');
        label.textContent = 'Help Guides';
        button.append(createBookIcon(), label);
        makeDraggable(button);
        document.body.appendChild(button);
        restorePosition(button);
    }

    function initialize() {
        if (!chrome.storage?.sync) {
            console.warn('Help Guides: chrome.storage.sync not available.');
            return;
        }

        chrome.storage.sync.get({ helpGuidesEnabled: true }, data => {
            isEnabled = data.helpGuidesEnabled !== false;
            if (isEnabled) ensureLauncher();
            else removeLauncher();
            window.appLearnFeature?.applyTransparency();
        });

        if (!storageListenerBound && chrome.storage.onChanged) {
            storageListenerBound = true;
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area !== 'sync' || !changes.helpGuidesEnabled) return;
                isEnabled = changes.helpGuidesEnabled.newValue !== false;
                if (isEnabled) ensureLauncher();
                else removeLauncher();
                window.appLearnFeature?.applyTransparency();
            });
        }

        window.addEventListener('resize', () => {
            const button = document.getElementById(BUTTON_ID);
            if (!button || !preferredPosition) return;
            placeButton(button, preferredPosition.left, preferredPosition.top);
        }, { passive: true });
    }

    window.helpGuidesLauncherFeature = {
        initialize,
        ensureLauncher,
        removeLauncher,
        openHelpGuides,
        isEnabled: () => isEnabled === true,
        snapToEdge
    };
})();

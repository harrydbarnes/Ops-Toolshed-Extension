(function() {
    'use strict';
    if (window.top !== window.self) return;

    const OVERLAY_ID = 'ops-toolshed-onboarding-highlight';
    const BACKDROP_ID = 'ops-toolshed-onboarding-backdrop';
    const STYLE_ID = 'ops-toolshed-onboarding-highlight-styles';
    let activeTarget = null;
    let resizeObserver = null;

    function findDeep(selector, root = document) {
        if (!root?.querySelector) return null;
        const direct = root.querySelector(selector);
        if (direct) return direct;
        for (const element of root.querySelectorAll('*')) {
            if (!element.shadowRoot) continue;
            const match = findDeep(selector, element.shadowRoot);
            if (match) return match;
        }
        return null;
    }

    const targetFinders = {
        helpGuides: () => document.getElementById('toolshed-help-guides-launcher'),
        account: () => findDeep('.user-menu-label') || findDeep('mo-banner-user-menu'),
        campaignActions: () => document.getElementById('mo-extracted-actions-toolbar'),
        campaignNavigation: () => document.getElementById('toolshed-actualise-navbar-wrapper') || document.getElementById('p2b-navbar')
    };

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${OVERLAY_ID} {
                position: fixed;
                z-index: 2147483646;
                pointer-events: none;
                border: 3px solid #f33d87;
                border-radius: 12px;
                box-shadow: 0 8px 30px rgba(189, 29, 91, 0.38);
                transition: left 180ms cubic-bezier(.16, 1, .3, 1), top 180ms cubic-bezier(.16, 1, .3, 1), width 180ms cubic-bezier(.16, 1, .3, 1), height 180ms cubic-bezier(.16, 1, .3, 1), opacity 160ms ease;
            }
            #${BACKDROP_ID} {
                position: fixed;
                inset: 0;
                z-index: 2147483645;
                pointer-events: none;
            }
            #${BACKDROP_ID} > span {
                position: fixed;
                background: rgba(23, 24, 31, 0.54);
            }
            #${OVERLAY_ID}::after {
                position: absolute;
                inset: -8px;
                border: 2px solid rgba(243, 61, 135, .48);
                border-radius: 16px;
                content: "";
                animation: ops-toolshed-tour-pulse 1.8s ease-out infinite;
            }
            @keyframes ops-toolshed-tour-pulse {
                0%, 45% { opacity: .8; transform: scale(1); }
                100% { opacity: 0; transform: scale(1.05); }
            }
            @media (prefers-reduced-motion: reduce) {
                #${OVERLAY_ID}, #${OVERLAY_ID}::after { animation: none !important; transition: none !important; }
            }
        `;
        document.head.appendChild(style);
    }

    function removeHighlight() {
        resizeObserver?.disconnect();
        resizeObserver = null;
        window.removeEventListener('resize', positionOverlay);
        window.removeEventListener('scroll', positionOverlay, true);
        activeTarget = null;
        document.getElementById(OVERLAY_ID)?.remove();
        document.getElementById(BACKDROP_ID)?.remove();
    }

    function setMaskBounds(mask, left, top, width, height) {
        mask.style.left = `${Math.max(0, left)}px`;
        mask.style.top = `${Math.max(0, top)}px`;
        mask.style.width = `${Math.max(0, width)}px`;
        mask.style.height = `${Math.max(0, height)}px`;
    }

    function positionOverlay() {
        const overlay = document.getElementById(OVERLAY_ID);
        const backdrop = document.getElementById(BACKDROP_ID);
        if (!overlay || !backdrop || !activeTarget?.isConnected) return false;
        const rect = activeTarget.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        const gap = 7;
        const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
        const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
        const left = Math.max(0, rect.left - gap);
        const top = Math.max(0, rect.top - gap);
        const rectRight = Number.isFinite(rect.right) ? rect.right : rect.left + rect.width;
        const rectBottom = Number.isFinite(rect.bottom) ? rect.bottom : rect.top + rect.height;
        const right = Math.min(viewportWidth, rectRight + gap);
        const bottom = Math.min(viewportHeight, rectBottom + gap);
        const width = Math.max(0, right - left);
        const height = Math.max(0, bottom - top);
        if (width <= 0 || height <= 0) return false;
        overlay.style.left = `${left}px`;
        overlay.style.top = `${top}px`;
        overlay.style.width = `${width}px`;
        overlay.style.height = `${height}px`;

        const [topMask, rightMask, bottomMask, leftMask] = backdrop.children;
        setMaskBounds(topMask, 0, 0, viewportWidth, top);
        setMaskBounds(rightMask, right, top, viewportWidth - right, height);
        setMaskBounds(bottomMask, 0, bottom, viewportWidth, viewportHeight - bottom);
        setMaskBounds(leftMask, 0, top, left, height);
        return true;
    }

    function showHighlight(targetKey) {
        removeHighlight();
        const target = targetFinders[targetKey]?.();
        if (!target) return false;
        activeTarget = target;
        injectStyles();
        const backdrop = document.createElement('div');
        backdrop.id = BACKDROP_ID;
        for (let index = 0; index < 4; index += 1) backdrop.appendChild(document.createElement('span'));
        document.body.appendChild(backdrop);
        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.setAttribute('aria-hidden', 'true');
        document.body.appendChild(overlay);
        target.scrollIntoView?.({ behavior: 'auto', block: 'center', inline: 'center' });
        const positioned = positionOverlay();
        if (!positioned) {
            removeHighlight();
            return false;
        }
        requestAnimationFrame(() => positionOverlay());
        window.addEventListener('resize', positionOverlay);
        window.addEventListener('scroll', positionOverlay, true);
        if (typeof ResizeObserver === 'function') {
            resizeObserver = new ResizeObserver(positionOverlay);
            resizeObserver.observe(target);
        }
        return positioned;
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request?.action === 'showOnboardingHighlight') {
            const found = showHighlight(request.target);
            sendResponse({ status: 'success', found });
            return false;
        }
        if (request?.action === 'hideOnboardingHighlight') {
            removeHighlight();
            sendResponse({ status: 'success' });
            return false;
        }
        return false;
    });

    window.onboardingTourFeature = { showHighlight, removeHighlight };
})();

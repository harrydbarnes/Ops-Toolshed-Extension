(function() {
    'use strict';
    if (window.top !== window.self) return;

    const OVERLAY_ID = 'ops-toolshed-onboarding-highlight';
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
                box-shadow: 0 0 0 9999px rgba(23, 24, 31, 0.54), 0 8px 30px rgba(189, 29, 91, 0.28);
                transition: transform 180ms cubic-bezier(.16, 1, .3, 1), width 180ms cubic-bezier(.16, 1, .3, 1), height 180ms cubic-bezier(.16, 1, .3, 1), opacity 160ms ease;
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
        activeTarget = null;
        document.getElementById(OVERLAY_ID)?.remove();
    }

    function positionOverlay() {
        const overlay = document.getElementById(OVERLAY_ID);
        if (!overlay || !activeTarget?.isConnected) return;
        const rect = activeTarget.getBoundingClientRect();
        const gap = 7;
        overlay.style.width = `${Math.max(0, rect.width + gap * 2)}px`;
        overlay.style.height = `${Math.max(0, rect.height + gap * 2)}px`;
        overlay.style.transform = `translate(${Math.max(3, rect.left - gap)}px, ${Math.max(3, rect.top - gap)}px)`;
    }

    function showHighlight(targetKey) {
        removeHighlight();
        const target = targetFinders[targetKey]?.();
        if (!target) return false;
        activeTarget = target;
        injectStyles();
        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.setAttribute('aria-hidden', 'true');
        document.body.appendChild(overlay);
        const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
        target.scrollIntoView?.({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center', inline: 'center' });
        positionOverlay();
        requestAnimationFrame(() => positionOverlay());
        if (typeof ResizeObserver === 'function') {
            resizeObserver = new ResizeObserver(positionOverlay);
            resizeObserver.observe(target);
        }
        return true;
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

(function() {
    'use strict';
    if (window.top !== window.self) return;

    const OVERLAY_ID = 'ops-toolshed-onboarding-highlight';
    const BACKDROP_ID = 'ops-toolshed-onboarding-backdrop';
    const MASK_ID = 'ops-toolshed-onboarding-mask';
    const STYLE_ID = 'ops-toolshed-onboarding-highlight-styles';
    const BLOCKED_EVENTS = ['pointerdown', 'mousedown', 'touchstart', 'click'];
    let activeTarget = null;
    let resizeObserver = null;
    let blockedTarget = null;
    let guardedLauncher = null;
    let guardObserver = null;
    let tourInteractionGuardEnabled = false;

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

    function findDeepMatching(predicate, root = document) {
        if (!root?.querySelectorAll) return null;
        for (const element of root.querySelectorAll('*')) {
            if (predicate(element)) return element;
            if (!element.shadowRoot) continue;
            const match = findDeepMatching(predicate, element.shadowRoot);
            if (match) return match;
        }
        return null;
    }

    function findInteractiveByText(pattern) {
        return findDeepMatching(element => {
            if (!element.matches?.('a, button, mo-button, [role="button"], [role="link"]')) return false;
            return pattern.test((element.textContent || element.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim());
        });
    }

    function findCampaignListTarget() {
        const link = findDeep('a[href*="campaign-id="]');
        return document.getElementById('dashboard-campaigns-grid') ||
            findDeep('[data-testid*="campaign-list"], [class*="campaign-list"], [class*="campaign-grid"]') ||
            link?.closest?.('[role="row"], tr, article, .mo-card, [class*="campaign-card"]') || link;
    }

    function findActionTarget(label) {
        const icon = findDeep(`[aria-label="${label}"]`);
        return icon?.closest?.('#mo-extracted-actions-toolbar > div') || icon;
    }

    function findExpandedApproverWidget() {
        const control = document.querySelector('.workflow-widget-wrapper .select2-choices .select2-input') ||
            document.querySelector('.workflow-widget-wrapper .prisma-paste-button');
        return control?.closest?.('.workflow-widget-wrapper') || null;
    }

    const targetFinders = {
        helpGuides: () => document.getElementById('toolshed-help-guides-launcher'),
        campaignList: findCampaignListTarget,
        account: () => findDeep('.user-menu-label') || findDeep('mo-banner-user-menu'),
        switchAccounts: () => findInteractiveByText(/^switch accounts$/i),
        campaignHeader: () => document.querySelector('.buy-details-wrapper, .mo-campaign-name-wrapper, [class*="campaign-header"]'),
        campaignActions: () => document.getElementById('mo-extracted-actions-toolbar'),
        campaignDetailsAction: () => findActionTarget('Campaign details'),
        campaignCopyAction: () => findActionTarget('Copy campaign'),
        campaignHistoryAction: () => findActionTarget('Campaign history'),
        campaignName: () => document.querySelector('.mo-campaign-name-wrapper'),
        campaignIdentifiers: () => document.querySelector('.buy-details-wrapper'),
        campaignDates: () => document.querySelector('.mo-date-field-wrapper'),
        campaignBudget: () => document.getElementById('campaign-budget-overview-container'),
        campaignNavigation: () => document.getElementById('toolshed-actualise-navbar-wrapper') || document.getElementById('p2b-navbar'),
        ordersNav: () => document.getElementById('p2b-navbar-section-orders'),
        actualiseNav: () => document.getElementById('p2b-navbar-section-actualise'),
        placementGrid: () => document.getElementById('grid-container_hot'),
        campaignWorkspace: () => document.getElementById('grid-container_hot') || document.getElementById('cm-buy-sidebar-order-revisions-header') || document.querySelector('[class*="placement-grid"], [class*="buy-workspace"]'),
        approverWidget: () => document.querySelector('.workflow-widget-wrapper') || document.querySelector('[class*="workflow-widget"]'),
        approverWidgetExpanded: findExpandedApproverWidget,
        addCampaign: () => findInteractiveByText(/^add campaign$/i),
        campaignSetup: () => document.getElementById('campaign-details-flight')?.closest('.well, form, section') ||
            findInteractiveByText(/^(enter full details|campaign details)$/i)?.closest?.('form, section, main, [role="dialog"]') ||
            document.querySelector('[class*="campaign-details"], [class*="campaign-setup"]')
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
                width: 100vw;
                height: 100vh;
                z-index: 2147483645;
                pointer-events: none;
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
        if (blockedTarget) {
            BLOCKED_EVENTS.forEach(eventName => blockedTarget.removeEventListener(eventName, preventHighlightedAction, true));
            blockedTarget = null;
        }
        activeTarget = null;
        document.getElementById(OVERLAY_ID)?.remove();
        document.getElementById(BACKDROP_ID)?.remove();
    }

    function preventHighlightedAction(event) {
        event.preventDefault();
        event.stopImmediatePropagation();
        event.stopPropagation();
    }

    function preventTourLauncherAction(event) {
        preventHighlightedAction(event);
    }

    function applyTourInteractionGuard() {
        if (!tourInteractionGuardEnabled) return;
        const launcher = document.getElementById('toolshed-help-guides-launcher');
        if (!launcher || launcher === guardedLauncher) return;
        if (guardedLauncher) {
            BLOCKED_EVENTS.forEach(eventName => guardedLauncher.removeEventListener(eventName, preventTourLauncherAction, true));
        }
        guardedLauncher = launcher;
        BLOCKED_EVENTS.forEach(eventName => launcher.addEventListener(eventName, preventTourLauncherAction, true));
    }

    function setTourInteractionGuard(enabled) {
        tourInteractionGuardEnabled = enabled === true;
        if (!tourInteractionGuardEnabled) {
            guardObserver?.disconnect();
            guardObserver = null;
            if (guardedLauncher) {
                BLOCKED_EVENTS.forEach(eventName => guardedLauncher.removeEventListener(eventName, preventTourLauncherAction, true));
                guardedLauncher = null;
            }
            return;
        }

        applyTourInteractionGuard();
        if (!guardObserver && typeof MutationObserver === 'function') {
            guardObserver = new MutationObserver(applyTourInteractionGuard);
            guardObserver.observe(document.documentElement, { childList: true, subtree: true });
        }
    }

    function blockTargetInteraction(target) {
        blockedTarget = target;
        BLOCKED_EVENTS.forEach(eventName => target.addEventListener(eventName, preventHighlightedAction, true));
    }

    function createBackdrop() {
        const namespace = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(namespace, 'svg');
        svg.id = BACKDROP_ID;
        svg.setAttribute('aria-hidden', 'true');

        const defs = document.createElementNS(namespace, 'defs');
        const mask = document.createElementNS(namespace, 'mask');
        mask.id = MASK_ID;
        mask.setAttribute('maskUnits', 'userSpaceOnUse');

        const canvas = document.createElementNS(namespace, 'rect');
        canvas.dataset.tourMask = 'canvas';
        canvas.setAttribute('x', '0');
        canvas.setAttribute('y', '0');
        canvas.setAttribute('fill', '#fff');

        const hole = document.createElementNS(namespace, 'rect');
        hole.dataset.tourMask = 'hole';
        hole.setAttribute('fill', '#000');
        hole.setAttribute('rx', '12');
        hole.setAttribute('ry', '12');

        mask.append(canvas, hole);
        defs.appendChild(mask);

        const shade = document.createElementNS(namespace, 'rect');
        shade.dataset.tourMask = 'shade';
        shade.setAttribute('x', '0');
        shade.setAttribute('y', '0');
        shade.setAttribute('fill', 'rgba(23, 24, 31, 0.54)');
        shade.setAttribute('mask', `url(#${MASK_ID})`);

        svg.append(defs, shade);
        return svg;
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

        backdrop.setAttribute('viewBox', `0 0 ${viewportWidth} ${viewportHeight}`);
        const canvas = backdrop.querySelector('[data-tour-mask="canvas"]');
        const hole = backdrop.querySelector('[data-tour-mask="hole"]');
        const shade = backdrop.querySelector('[data-tour-mask="shade"]');
        [canvas, shade].forEach(element => {
            element?.setAttribute('width', String(viewportWidth));
            element?.setAttribute('height', String(viewportHeight));
        });
        hole?.setAttribute('x', String(left));
        hole?.setAttribute('y', String(top));
        hole?.setAttribute('width', String(width));
        hole?.setAttribute('height', String(height));
        return true;
    }

    function showHighlight(targetKey, options = {}) {
        removeHighlight();
        const target = targetFinders[targetKey]?.();
        if (!target) return false;
        activeTarget = target;
        injectStyles();
        const backdrop = createBackdrop();
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
        if (options.blockInteraction === true) blockTargetInteraction(target);
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
            const found = showHighlight(request.target, { blockInteraction: request.blockInteraction === true });
            sendResponse({ status: 'success', found });
            return false;
        }
        if (request?.action === 'hideOnboardingHighlight') {
            removeHighlight();
            sendResponse({ status: 'success' });
            return false;
        }
        if (request?.action === 'setOnboardingInteractionGuard') {
            setTourInteractionGuard(request.enabled === true);
            sendResponse({ status: 'success' });
            return false;
        }
        return false;
    });

    window.onboardingTourFeature = { showHighlight, removeHighlight, setTourInteractionGuard };
})();

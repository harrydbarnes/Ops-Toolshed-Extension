(function() {
    'use strict';

    const SETTING_KEY = 'actualiseScrollRestoreEnabled';
    const PARENT_SETTING_KEY = 'optimisedNewNavEnabled';
    // Prisma's save cycle can take several seconds before it replaces the grid.
    // Keep the captured position available long enough to cover that delayed
    // soft refresh without persisting it beyond the current action.
    const RESTORE_WINDOW_MS = 15000;

    let featureEnabled = true;
    let parentEnabled = true;
    let settingsLoaded = false;
    let initialized = false;
    let trackedScroller = null;
    let trackedScrollerKey = '';
    let savedScrollLeft = 0;
    let actionScrollLeft = 0;
    let actionScrollerKey = '';
    let restoreUntil = 0;
    let restoreQueued = false;

    function isActualiseRoute() {
        const params = new URLSearchParams(window.location.hash.substring(1));
        return params.get('ptb-ctx') === 'actualize' ||
            params.get('route') === 'actualize' ||
            window.location.href.includes('actualize');
    }

    function isActive() {
        return settingsLoaded && featureEnabled && parentEnabled && isActualiseRoute();
    }

    function isHorizontalScroller(element) {
        return element instanceof Element &&
            element.scrollWidth > element.clientWidth + 1;
    }

    function getScrollerKey(element) {
        if (element.id) return `id:${element.id}`;

        for (const attribute of ['data-cy', 'data-testid', 'role']) {
            const value = element.getAttribute(attribute);
            if (value) return `${attribute}:${value}`;
        }

        const classes = Array.from(element.classList).sort().join('.');
        return `${element.tagName.toLowerCase()}.${classes}`;
    }

    function rememberScroller(element) {
        if (!isActive() || !isHorizontalScroller(element)) return;

        trackedScroller = element;
        trackedScrollerKey = getScrollerKey(element);
        savedScrollLeft = Math.max(0, element.scrollLeft);
    }

    function findMatchingScrollers() {
        const candidates = Array.from(document.querySelectorAll('*'))
            .filter(isHorizontalScroller);
        if (candidates.length === 0) return [];

        const exactMatches = candidates.filter(candidate => getScrollerKey(candidate) === trackedScrollerKey);
        if (exactMatches.length > 0) return exactMatches;

        return [candidates.sort((a, b) => b.scrollWidth - a.scrollWidth)[0]];
    }

    function freezeActionPosition() {
        if (!isActive()) return;

        if (trackedScroller?.isConnected && trackedScroller.scrollLeft > 0) {
            rememberScroller(trackedScroller);
        }
        if (savedScrollLeft > 0) {
            actionScrollLeft = savedScrollLeft;
            actionScrollerKey = trackedScrollerKey;
        }
    }

    function armRestoration() {
        if (!isActive()) return;
        if (actionScrollLeft <= 0) freezeActionPosition();
        if (actionScrollLeft <= 0) return;

        savedScrollLeft = actionScrollLeft;
        trackedScrollerKey = actionScrollerKey;
        restoreUntil = Date.now() + RESTORE_WINDOW_MS;
        const armedUntil = restoreUntil;
        window.setTimeout(() => {
            if (restoreUntil === armedUntil) clearActionState();
        }, RESTORE_WINDOW_MS);
    }

    function captureBeforeAction() {
        freezeActionPosition();
        armRestoration();
    }

    function clearActionState() {
        actionScrollLeft = 0;
        actionScrollerKey = '';
        restoreUntil = 0;
    }

    function handleActionPointerDown(event) {
        if (!isActive()) return;
        const control = event.target.closest('button, [role="button"]');
        if (!control) return;

        const label = control.textContent.trim().toLowerCase();
        if (label === 'cancel') {
            clearActionState();
            return;
        }
        if (label === 'save') {
            armRestoration();
            return;
        }
        if (['yes', 'no', 'reviewing'].includes(label) && actionScrollLeft <= 0) {
            freezeActionPosition();
        }
    }

    function restoreScrollPosition() {
        if (!isActive() || savedScrollLeft <= 0 || Date.now() > restoreUntil) return false;

        const candidates = findMatchingScrollers();
        if (candidates.length === 0) return false;

        candidates.forEach(candidate => {
            candidate.scrollLeft = Math.min(
                savedScrollLeft,
                Math.max(0, candidate.scrollWidth - candidate.clientWidth)
            );
        });
        trackedScroller = candidates[0];
        trackedScrollerKey = getScrollerKey(candidates[0]);
        return true;
    }

    function queueRestore() {
        if (restoreQueued || Date.now() > restoreUntil) return;
        restoreQueued = true;
        const schedule = window.requestAnimationFrame || (callback => window.setTimeout(callback, 0));
        schedule(() => {
            restoreQueued = false;
            restoreScrollPosition();
        });
    }

    function handleScroll(event) {
        const element = event.target === document ? document.scrollingElement : event.target;
        if (!isActive() || !isHorizontalScroller(element)) return;

        if (actionScrollLeft > 0) {
            if (Date.now() <= restoreUntil && element.scrollLeft === 0 && getScrollerKey(element) === trackedScrollerKey) {
                queueRestore();
            }
            return;
        }
        rememberScroller(element);
    }

    function initialize() {
        if (initialized) return;
        initialized = true;

        chrome.storage.sync.get([SETTING_KEY, PARENT_SETTING_KEY], data => {
            featureEnabled = data[SETTING_KEY] !== false;
            parentEnabled = data[PARENT_SETTING_KEY] !== false;
            settingsLoaded = true;
        });

        document.addEventListener('scroll', handleScroll, true);
        document.addEventListener('pointerdown', handleActionPointerDown, true);
        document.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') handleActionPointerDown(event);
        }, true);

        const observer = new MutationObserver(() => {
            if (Date.now() <= restoreUntil) queueRestore();
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync' || (!changes[SETTING_KEY] && !changes[PARENT_SETTING_KEY])) return;
        if (changes[SETTING_KEY]) featureEnabled = changes[SETTING_KEY].newValue !== false;
        if (changes[PARENT_SETTING_KEY]) parentEnabled = changes[PARENT_SETTING_KEY].newValue !== false;
        settingsLoaded = true;
        if (!featureEnabled || !parentEnabled) clearActionState();
    });

    window.actualiseScrollRestoreFeature = {
        initialize,
        captureBeforeAction,
        restoreScrollPosition
    };
})();

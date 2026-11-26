(function() {
    'use strict';

    const SETTING_KEY = 'actualiseScrollRestoreEnabled';
    // Prisma's save cycle can take several seconds before it replaces the grid.
    // Keep the captured position available long enough to cover that delayed
    // soft refresh without persisting it beyond the current action.
    const RESTORE_WINDOW_MS = 15000;
    const FALLBACK_SCROLLER_SELECTOR = [
        '#grid-container_hot .wtHolder',
        '.handsontable .wtHolder',
        '.ht_master .wtHolder',
        '.wtHolder',
        '#actualise-grid'
    ].join(', ');

    let featureEnabled = true;
    let settingsLoaded = false;
    let initialized = false;
    let trackedScroller = null;
    let trackedScrollerKey = '';
    let trackedScrollerSelector = '';
    let savedScrollLeft = 0;
    let actionScrollLeft = 0;
    let actionScrollerKey = '';
    let actionScrollerSelector = '';
    let restoreUntil = 0;
    let restoreQueued = false;

    function isActualiseRoute() {
        const params = new URLSearchParams(window.location.hash.substring(1));
        return params.get('ptb-ctx') === 'actualize' ||
            params.get('route') === 'actualize' ||
            window.location.href.includes('actualize');
    }

    function isActive() {
        return settingsLoaded && featureEnabled && isActualiseRoute();
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

    function escapeCssIdentifier(value) {
        if (window.CSS?.escape) return window.CSS.escape(value);
        return value.replace(/(^-?\d)|[^a-zA-Z0-9_-]/g, match =>
            `\\${match.codePointAt(0).toString(16)} `
        );
    }

    function getScrollerSelector(element) {
        if (element.id) return '';

        for (const attribute of ['data-cy', 'data-testid', 'role']) {
            const value = element.getAttribute(attribute);
            if (value) {
                const escapedValue = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                return `[${attribute}="${escapedValue}"]`;
            }
        }

        const classes = Array.from(element.classList).sort();
        if (classes.length === 0) return '';
        return `${element.tagName.toLowerCase()}${classes.map(name => `.${escapeCssIdentifier(name)}`).join('')}`;
    }

    function rememberScroller(element) {
        if (!isActive() || !isHorizontalScroller(element)) return;

        trackedScroller = element;
        trackedScrollerKey = getScrollerKey(element);
        trackedScrollerSelector = getScrollerSelector(element);
        savedScrollLeft = Math.max(0, element.scrollLeft);
    }

    function findMatchingScrollers() {
        let candidates = [];
        if (trackedScrollerKey.startsWith('id:')) {
            const identifiedScroller = document.getElementById(trackedScrollerKey.slice(3));
            if (identifiedScroller) candidates.push(identifiedScroller);
        } else if (trackedScrollerSelector) {
            try {
                candidates = Array.from(document.querySelectorAll(trackedScrollerSelector));
            } catch (error) {
                candidates = [];
            }
        }

        const exactMatches = candidates.filter(candidate =>
            isHorizontalScroller(candidate) && getScrollerKey(candidate) === trackedScrollerKey
        );
        if (exactMatches.length > 0) return exactMatches;

        const fallbackCandidates = Array.from(document.querySelectorAll(FALLBACK_SCROLLER_SELECTOR))
            .filter(isHorizontalScroller);
        let widestCandidate = null;
        fallbackCandidates.forEach(candidate => {
            if (!widestCandidate || candidate.scrollWidth > widestCandidate.scrollWidth) {
                widestCandidate = candidate;
            }
        });
        return widestCandidate ? [widestCandidate] : [];
    }

    function freezeActionPosition() {
        if (!isActive()) return;

        if (trackedScroller?.isConnected && trackedScroller.scrollLeft > 0) {
            rememberScroller(trackedScroller);
        }
        if (savedScrollLeft > 0) {
            actionScrollLeft = savedScrollLeft;
            actionScrollerKey = trackedScrollerKey;
            actionScrollerSelector = trackedScrollerSelector;
        }
    }

    function armRestoration() {
        if (!isActive()) return;
        if (actionScrollLeft <= 0) freezeActionPosition();
        if (actionScrollLeft <= 0) return;

        savedScrollLeft = actionScrollLeft;
        trackedScrollerKey = actionScrollerKey;
        trackedScrollerSelector = actionScrollerSelector;
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
        actionScrollerSelector = '';
        restoreUntil = 0;
    }

    function handleActionPointerDown(event) {
        if (!isActive()) return;
        const control = event.target.closest('button, [role="button"]');
        if (!control) {
            cancelRestoreForManualScroll(event.target);
            return;
        }

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

    function findClosestScroller(element) {
        let current = element;
        while (current && current !== document.documentElement) {
            if (isHorizontalScroller(current)) return current;
            current = current.parentElement;
        }
        return null;
    }

    function cancelRestoreForManualScroll(target) {
        if (actionScrollLeft <= 0 && Date.now() > restoreUntil) return;

        const scroller = findClosestScroller(target);
        if (!scroller) return;

        clearActionState();
        rememberScroller(scroller);
    }

    function handleWheel(event) {
        if (!isActive()) return;
        if (Math.abs(event.deltaX) <= 0 && !event.shiftKey) return;
        cancelRestoreForManualScroll(event.target);
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
        trackedScrollerSelector = getScrollerSelector(candidates[0]);
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

        chrome.storage.sync.get([SETTING_KEY], data => {
            featureEnabled = data[SETTING_KEY] !== false;
            settingsLoaded = true;
        });

        document.addEventListener('scroll', handleScroll, true);
        document.addEventListener('pointerdown', handleActionPointerDown, true);
        document.addEventListener('wheel', handleWheel, true);
        document.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') handleActionPointerDown(event);
        }, true);

        const observer = new MutationObserver(() => {
            if (Date.now() <= restoreUntil) queueRestore();
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync' || !changes[SETTING_KEY]) return;
        if (changes[SETTING_KEY]) featureEnabled = changes[SETTING_KEY].newValue !== false;
        settingsLoaded = true;
        if (!featureEnabled) clearActionState();
    });

    window.actualiseScrollRestoreFeature = {
        initialize,
        captureBeforeAction,
        restoreScrollPosition
    };
})();

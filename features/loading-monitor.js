(function() {
    'use strict';

    const SPINNER_SELECTOR = [
        '#vp-block > i.fa.fa-circle-o-notch.fa-spin',
        'mo-spinner',
        '.mo-spinner',
        'svg.spinner'
    ].join(', ');
    // Prisma renders the approver workflow in a sidebar-like region without
    // using its native <mo-side-panel> host. Treat that region as side-panel
    // work so approval-only spinners do not look like page loading.
    const SIDE_PANEL_ANCESTOR_SELECTOR = 'mo-side-panel, .mo-side-panel, .workflow-widget-wrapper';
    const candidates = new Set();
    const listeners = new Set();
    const observedRoots = new WeakSet();
    const pendingRoots = new Set();
    const candidateIds = new WeakMap();
    let nextCandidateId = 1;
    let initialized = false;
    let refreshScheduled = false;
    let lastSignature = '';
    let currentState = Object.freeze({
        visibleSpinners: Object.freeze([]),
        pageVisibleSpinners: Object.freeze([]),
        sidePanelVisibleSpinners: Object.freeze([])
    });

    function isInsideSidePanel(element) {
        let current = element;
        while (current) {
            if (current.matches?.(SIDE_PANEL_ANCESTOR_SELECTOR)) return true;
            const root = current.getRootNode?.();
            current = current.parentElement || root?.host || null;
        }
        return false;
    }

    function registerCandidate(element) {
        if (!element?.matches?.(SPINNER_SELECTOR)) return;
        candidates.add(element);
        if (!candidateIds.has(element)) candidateIds.set(element, nextCandidateId++);
    }

    function inspectRoot(root) {
        if (!root) return;
        if (root.nodeType === Node.ELEMENT_NODE) registerCandidate(root);
        if (!root.querySelectorAll) return;

        root.querySelectorAll(SPINNER_SELECTOR).forEach(registerCandidate);
        root.querySelectorAll('*').forEach(element => {
            if (element.shadowRoot) observeRoot(element.shadowRoot);
        });
        if (root.shadowRoot) observeRoot(root.shadowRoot);
    }

    function handleMutations(records) {
        records.forEach(record => {
            if (record.type === 'attributes') {
                pendingRoots.add(record.target);
            }
            record.addedNodes?.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
                    pendingRoots.add(node);
                }
            });
        });
        scheduleRefresh();
    }

    function observeRoot(root) {
        if (!root?.querySelectorAll || observedRoots.has(root)) return;
        observedRoots.add(root);
        const observer = new MutationObserver(handleMutations);
        observer.observe(root, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style', 'hidden']
        });
        inspectRoot(root);
    }

    function buildState() {
        pendingRoots.forEach(inspectRoot);
        pendingRoots.clear();

        const visibleSpinners = [];
        const pageVisibleSpinners = [];
        const sidePanelVisibleSpinners = [];
        candidates.forEach(candidate => {
            if (!candidate.isConnected) {
                candidates.delete(candidate);
                return;
            }
            if (!window.utils.isElementVisible(candidate)) return;
            visibleSpinners.push(candidate);
            if (isInsideSidePanel(candidate)) sidePanelVisibleSpinners.push(candidate);
            else pageVisibleSpinners.push(candidate);
        });

        return Object.freeze({
            visibleSpinners: Object.freeze(visibleSpinners),
            pageVisibleSpinners: Object.freeze(pageVisibleSpinners),
            sidePanelVisibleSpinners: Object.freeze(sidePanelVisibleSpinners)
        });
    }

    function getSignature(state) {
        return state.visibleSpinners
            .map(spinner => `${candidateIds.get(spinner)}:${isInsideSidePanel(spinner) ? 'side' : 'page'}`)
            .join('|');
    }

    function refreshNow({ forceNotify = false } = {}) {
        if (!initialized) initialize();
        const nextState = buildState();
        const nextSignature = getSignature(nextState);
        currentState = nextState;
        if (forceNotify || nextSignature !== lastSignature) {
            lastSignature = nextSignature;
            listeners.forEach(listener => listener(currentState));
        }
        return currentState;
    }

    function scheduleRefresh(forceNotify = false) {
        if (refreshScheduled) return;
        refreshScheduled = true;
        const schedule = window.requestAnimationFrame || (callback => window.setTimeout(callback, 0));
        schedule(() => {
            refreshScheduled = false;
            refreshNow({ forceNotify });
        });
    }

    function initialize() {
        if (initialized || !document.documentElement) return;
        initialized = true;
        observeRoot(document.documentElement);
        currentState = buildState();
        lastSignature = getSignature(currentState);
        window.addEventListener('resize', () => scheduleRefresh(true));
        window.addEventListener('pageshow', () => scheduleRefresh(true));
    }

    function subscribe(listener) {
        if (typeof listener !== 'function') return () => {};
        initialize();
        listeners.add(listener);
        listener(currentState);
        return () => listeners.delete(listener);
    }

    function getState() {
        initialize();
        return currentState;
    }

    window.loadingMonitor = {
        initialize,
        subscribe,
        getState,
        refreshNow,
        scheduleRefresh,
        isInsideSidePanel,
        spinnerSelector: SPINNER_SELECTOR
    };
})();

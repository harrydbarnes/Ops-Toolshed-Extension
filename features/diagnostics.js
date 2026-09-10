(function() {
    'use strict';

    let enabled = false;
    const lastRecordedAt = new Map();
    const FEATURE_ACTIONS = [[
        '#toolshed-help-guides-launcher', 'help-guides', 'open'
    ], [
        '.gmi-chat-button', 'gmi-chat', 'open'
    ], [
        '.order-id-copy-btn', 'order-id-copy', 'copy'
    ], [
        '.prisma-paste-button', 'approver-tools', 'paste'
    ], [
        '.toolshed-max-budget-button', 'max-campaign-budget', 'open'
    ], [
        '.toolshed-export-all-actuals-combine', 'actualise-export', 'combine'
    ], [
        '.toolshed-approval-header-btn', 'approval-tracking', 'check-now'
    ], [
        '.toolshed-approval-track-current-btn', 'approval-tracking', 'track-current'
    ], [
        '.toolshed-campaign-history-nav', 'campaign-history', 'open'
    ], [
        '.switch-account-button', 'switch-accounts', 'open'
    ]];

    chrome.storage.sync.get({ diagnosticsModeEnabled: false }, data => {
        enabled = data.diagnosticsModeEnabled === true;
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes.diagnosticsModeEnabled) {
            enabled = changes.diagnosticsModeEnabled.newValue === true;
        }
    });

    function getArea() {
        try {
            const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
            const module = (params.get('ptb-mod') || '').toLowerCase();
            const context = (params.get('ptb-ctx') || '').toLowerCase();
            const route = (params.get('route') || '').toLowerCase();
            if (route === 'campaigns' || (params.get('osPspId') || '').toLowerCase() === 'cm-dashboard') return 'home';
            if (context === 'actualize' || route === 'actualize') return 'actualise';
            if (params.get('showOrders') === 'true' || context === 'ordersummary') return 'orders';
            if (['plan', 'buy', 'traffic', 'analyse'].includes(module)) return module;
            return params.get('campaign-id') ? 'campaign' : 'other';
        } catch {
            return 'other';
        }
    }

    function record(event) {
        if (!enabled) return;
        try {
            Promise.resolve(chrome.runtime.sendMessage({
                action: 'RECORD_DIAGNOSTIC_EVENT',
                event: { ...event, area: event?.area || getArea() }
            })).catch(() => {});
        } catch {
            // Diagnostics must never affect the feature being measured.
        }
    }

    function recordRateLimited(key, event, intervalMs = 1000) {
        if (!enabled) return;
        const now = Date.now();
        if (now - (lastRecordedAt.get(key) || 0) < intervalMs) return;
        lastRecordedAt.set(key, now);
        record(event);
    }

    document.addEventListener('click', event => {
        if (!enabled || !event.target?.closest) return;
        const action = FEATURE_ACTIONS.find(([selector]) => event.target.closest(selector));
        if (!action) return;
        record({ source: action[1], operation: action[2], outcome: 'invoked' });
    }, true);

    window.opsDiagnostics = {
        isEnabled: () => enabled,
        now: () => window.performance?.now?.() ?? Date.now(),
        record,
        recordRateLimited
    };
})();

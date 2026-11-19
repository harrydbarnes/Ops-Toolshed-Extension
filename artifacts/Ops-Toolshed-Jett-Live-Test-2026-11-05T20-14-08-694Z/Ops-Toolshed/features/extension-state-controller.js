(function() {
    'use strict';

    if (window.opsToolshedExtensionState) return;

    const MASTER_KEY = 'allFeaturesDisabled';
    const STATE_EVENT = 'ops-toolshed:master-feature-state';
    const subscribers = new Set();
    let resolveReady;
    let readySettled = false;

    const state = {
        disabled: true,
        ready: new Promise(resolve => { resolveReady = resolve; }),
        isActive: () => state.disabled !== true,
        subscribe(listener) {
            if (typeof listener !== 'function') return () => {};
            subscribers.add(listener);
            if (readySettled) listener(state.disabled !== true);
            return () => subscribers.delete(listener);
        }
    };

    window.opsToolshedExtensionState = state;
    document.documentElement?.classList.add('ops-toolshed-features-disabled');
    document.documentElement?.setAttribute('data-ops-toolshed-features-active', 'false');

    function publish(disabled) {
        state.disabled = disabled === true;
        document.documentElement?.classList.toggle('ops-toolshed-features-disabled', state.disabled);
        document.documentElement?.setAttribute('data-ops-toolshed-features-active', String(!state.disabled));
        document.dispatchEvent(new CustomEvent(STATE_EVENT, { detail: !state.disabled }));
        if (!readySettled) {
            readySettled = true;
            resolveReady(!state.disabled);
        }
        subscribers.forEach(listener => listener(!state.disabled));
    }

    try {
        const result = chrome.storage.sync.get({ [MASTER_KEY]: false }, data => {
            if (chrome.runtime?.lastError) publish(true);
            else publish(data?.[MASTER_KEY] === true);
        });
        result?.catch?.(() => publish(true));
    } catch (_error) {
        publish(true);
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'sync' || !changes[MASTER_KEY]) return;
        publish(changes[MASTER_KEY].newValue === true);
    });
})();

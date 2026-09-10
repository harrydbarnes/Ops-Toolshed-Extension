(function() {
    'use strict';

    const MASTER_KEY = 'allFeaturesDisabled';
    const gateScript = document.currentScript;
    const scriptsToLoad = (gateScript?.dataset.scripts || '').split(',').map(value => value.trim()).filter(Boolean);
    const moduleScripts = new Set((gateScript?.dataset.modules || '').split(',').map(value => value.trim()).filter(Boolean));
    let resolveReady;
    let settled = false;
    let enabled = false;

    document.documentElement.hidden = true;
    document.documentElement.style.visibility = 'hidden';

    const gate = {
        ready: new Promise(resolve => { resolveReady = resolve; }),
        isEnabled: () => settled && enabled,
        async allow() {
            return gate.ready;
        }
    };
    window.opsToolshedPageGate = gate;

    function showDisabledPage() {
        document.documentElement.hidden = false;
        document.documentElement.style.visibility = 'visible';
        const render = () => {
            document.body.replaceChildren();
            document.body.style.cssText = 'margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f7f8;color:#202124;font:15px/1.5 system-ui,sans-serif';
            const card = document.createElement('main');
            card.style.cssText = 'max-width:440px;margin:24px;padding:28px;border-radius:16px;background:white;box-shadow:0 8px 30px rgba(0,0,0,.12);text-align:center';
            const title = document.createElement('h1');
            title.textContent = 'Ops Toolshed features are off';
            title.style.cssText = 'margin:0 0 10px;font-size:22px';
            const copy = document.createElement('p');
            copy.textContent = 'Click the Ops Toolshed Chrome extension icon and switch Features on to use this page.';
            copy.style.margin = '0';
            card.append(title, copy);
            document.body.appendChild(card);
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, { once: true });
        else render();
    }

    function domReady() {
        if (document.readyState !== 'loading') return Promise.resolve();
        return new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    }

    function loadScript(source) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = source;
            if (moduleScripts.has(source)) script.type = 'module';
            script.addEventListener('load', resolve, { once: true });
            script.addEventListener('error', () => reject(new Error(`Could not load ${source}`)), { once: true });
            document.body.appendChild(script);
        });
    }

    async function activatePage() {
        await domReady();
        for (const source of scriptsToLoad) await loadScript(source);
        document.documentElement.hidden = false;
        document.documentElement.style.visibility = 'visible';
        document.dispatchEvent(new Event('DOMContentLoaded'));
    }

    function finish(isEnabled) {
        if (settled) return;
        enabled = isEnabled === true;
        settled = true;
        resolveReady(enabled);
        if (enabled) activatePage().catch(error => {
            console.error('Could not activate extension page:', error);
            showDisabledPage();
        });
        else showDisabledPage();
    }

    try {
        const result = chrome.storage.sync.get({ [MASTER_KEY]: false }, data => {
            if (chrome.runtime?.lastError) finish(false);
            else finish(data?.[MASTER_KEY] !== true);
        });
        result?.catch?.(() => finish(false));
    } catch (_error) {
        finish(false);
    }

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'sync' || !changes[MASTER_KEY]) return;
        const nextEnabled = changes[MASTER_KEY].newValue !== true;
        if (settled && nextEnabled !== enabled) window.location.reload();
    });
})();

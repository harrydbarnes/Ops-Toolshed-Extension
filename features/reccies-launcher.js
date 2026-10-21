(function() {
    'use strict';
    if (window.top !== window || window.opsRecciesLauncher) return;
    let button = null, timer = null, tracker = null, preferences = {};
    const active = () => window.opsToolshedExtensionState?.isActive() && location.hostname === 'go.mediaocean.com' && location.pathname.startsWith('/campaign-management/');
    function reconcile() {
        if (!active()) { button?.remove(); button = null; return; }
        const roots = [document]; let approval, menu;
        for (let i = 0; i < roots.length; i++) {
            approval ||= roots[i].querySelector('.toolshed-approval-banner-button');
            menu ||= roots[i].querySelector('mo-banner-user-menu');
            roots[i].querySelectorAll('mo-banner,mo-banner-user-menu,mo-banner-user-menu-content').forEach(host => { if (host.shadowRoot) roots.push(host.shadowRoot); });
        }
        const anchor = approval || menu;
        if (!anchor?.parentElement) { button?.remove(); button = null; return; }
        if (!button?.isConnected || button.parentElement !== anchor.parentElement) {
            button?.remove(); button = document.createElement('button');
            button.id = 'ops-reccies-launcher'; button.type = 'button';
            button.style.cssText = 'display:inline-flex;align-items:center;padding:4px 8px;margin:0 4px;border:0;border-radius:4px;background:transparent;color:inherit;font:inherit;font-size:12px;white-space:nowrap;cursor:pointer;pointer-events:auto';
            button.addEventListener('click', async () => {
                try {
                    const result = await chrome.runtime.sendMessage({ action: 'openReccies' });
                    if (result?.status !== 'success') throw new Error(result?.message || 'Could not open Reccies.');
                } catch (error) { button.textContent = 'Reccies · try again'; button.setAttribute('aria-label', error.message); }
            });
            anchor.parentElement.insertBefore(button, anchor);
        }
        const role = preferences.assignment || 'ops';
        const count = preferences.person ? (tracker?.rows || []).filter(row => row.reccied.toLowerCase() !== 'yes' &&
            (role === 'any' ? ['ops','buyer','group'] : [role]).some(key => row[key]?.toLowerCase() === preferences.person.toLowerCase())).length : null;
        button.textContent = `Reccies${count == null ? '' : ` · ${count}`}`;
        button.setAttribute('aria-label', count == null ? 'Open read-only Reccies sidebar' : `Open Reccies sidebar: ${count} tracker rows not marked Yes`);
    }
    window.opsRecciesLauncher = { reconcile };
    window.opsToolshedExtensionState?.subscribe(enabled => {
        clearInterval(timer); timer = null; reconcile();
        if (enabled) timer = setInterval(reconcile, 1500);
    });
    chrome.storage.local.get(['reccieTracker','recciePreferences']).then(data => {
        tracker = data.reccieTracker || null; preferences = data.recciePreferences || {}; reconcile();
    }).catch(() => {});
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.reccieTracker) tracker = changes.reccieTracker.newValue || null;
        if (changes.recciePreferences) preferences = changes.recciePreferences.newValue || {};
        if (changes.reccieTracker || changes.recciePreferences) reconcile();
    });
})();

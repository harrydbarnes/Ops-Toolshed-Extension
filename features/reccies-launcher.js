(function() {
    'use strict';
    if (window.top !== window || window.opsRecciesLauncher) return;
    let button = null, timer = null, tracker = null, preferences = {}, launch = null;
    let outstandingCount = null;
    const active = () => window.opsToolshedExtensionState?.isActive() && location.hostname === 'go.mediaocean.com' && location.pathname.startsWith('/campaign-management/');
    function updateCount() {
        const role = preferences.assignment || 'ops';
        const person = preferences.person?.toLowerCase();
        outstandingCount = person ? 0 : null;
        if (!person) return;
        const roles = role === 'any' ? ['ops','buyer','group'] : [role];
        for (const row of tracker?.rows || []) {
            if (row.reccied.toLowerCase() !== 'yes' && roles.some(key => row[key]?.toLowerCase() === person)) outstandingCount++;
        }
    }
    function renderLaunch() {
        if (!button) return;
        const count = outstandingCount;
        const preparing = !launch?.ready && !!launch?.pending;
        if (button.disabled !== preparing) button.disabled = preparing;
        const label = preparing ? 'Reccies · starting…' : launch?.message ? 'Reccies · unavailable' : `Reccies${count == null ? '' : ` · ${count}`}`;
        const accessibleLabel = preparing ? 'Preparing Reccies' : launch?.message || launch?.hint || (count == null ? 'Open read-only Reccies sidebar' : `Open Reccies sidebar: ${count} tracker rows not marked Yes`);
        if (button.textContent !== label) button.textContent = label;
        if (button.getAttribute('aria-busy') !== String(preparing)) button.setAttribute('aria-busy', String(preparing));
        if (button.getAttribute('aria-label') !== accessibleLabel) button.setAttribute('aria-label', accessibleLabel);
    }
    function prepare(recovering = false) {
        const current = launch, target = button;
        if (!current || current.pending) return current?.pending;
        current.pending = Promise.resolve().then(() => chrome.runtime.sendMessage({ action: 'prepareReccies' })).then(result => {
            if (result?.status !== 'success') throw new Error(result?.message || 'Could not prepare Reccies.');
            current.ready = true;
            current.message = '';
            current.hint = recovering ? 'Reccies is ready. Click to open the sidebar.' : '';
        }).catch(error => { current.ready = false; current.message = error.message; })
            .finally(() => {
                current.pending = null;
                if (button === target) renderLaunch();
            });
        renderLaunch();
        return current.pending;
    }
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
            launch = { ready: false, pending: null, message: '' };
            button.style.cssText = 'display:inline-flex;align-items:center;padding:4px 8px;margin:0 4px;border:0;border-radius:4px;background:transparent;color:inherit;font:inherit;font-size:12px;white-space:nowrap;cursor:pointer;pointer-events:auto';
            button.addEventListener('click', async () => {
                if (!launch.ready) { prepare(); return; }
                const target = button, current = launch;
                try {
                    const result = await chrome.runtime.sendMessage({ action: 'openReccies' });
                    if (button !== target || launch !== current) return;
                    if (result?.code === 'FEATURES_STARTING') {
                        launch.ready = false;
                        prepare(true);
                        return;
                    }
                    if (result?.status !== 'success') throw new Error(result?.message || 'Could not open Reccies.');
                    launch.message = '';
                    renderLaunch();
                } catch (error) { if (button === target && launch === current) { current.message = error.message; renderLaunch(); } }
            });
            button.addEventListener('pointerenter', () => prepare());
            button.addEventListener('focus', () => prepare());
            anchor.parentElement.insertBefore(button, anchor);
            prepare();
        }
        renderLaunch();
    }
    window.opsRecciesLauncher = { reconcile };
    window.opsToolshedExtensionState?.subscribe(enabled => {
        clearInterval(timer); timer = null; reconcile();
        if (enabled) timer = setInterval(reconcile, 1500);
    });
    chrome.storage.local.get(['reccieTracker','recciePreferences']).then(data => {
        tracker = data.reccieTracker || null; preferences = data.recciePreferences || {}; updateCount(); reconcile();
    }).catch(() => {});
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.reccieTracker) tracker = changes.reccieTracker.newValue || null;
        if (changes.recciePreferences) preferences = changes.recciePreferences.newValue || {};
        if (changes.reccieTracker || changes.recciePreferences) { updateCount(); reconcile(); }
    });
})();

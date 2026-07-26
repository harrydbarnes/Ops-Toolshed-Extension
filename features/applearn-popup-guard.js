(() => {
    const SETTING_EVENT = 'ops-toolshed:applearn-popup-setting';
    let enabled = true;

    function isBlockedUrl(rawUrl) {
        if (!rawUrl) return false;

        try {
            const url = new URL(String(rawUrl), window.location.href);
            if (url.hostname === 'splitscreen-adopt.applearn.tv') return true;

            return url.hostname === 'wpp.okta.com' &&
                url.pathname.toLowerCase().startsWith('/app/wpp_groupmapplearndev_1');
        } catch {
            return false;
        }
    }

    const nativeOpen = window.open;
    window.open = function guardedAppLearnOpen(url, ...args) {
        if (enabled && isBlockedUrl(url)) return null;
        return Reflect.apply(nativeOpen, this, [url, ...args]);
    };

    function stopBlockedNavigation(event, rawUrl) {
        if (!enabled || !isBlockedUrl(rawUrl)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
    }

    function blockMatchingLink(event) {
        const link = event.composedPath().find(node => node?.tagName === 'A' && node.href);
        if (link) stopBlockedNavigation(event, link.href);
    }

    window.addEventListener('click', blockMatchingLink, true);
    window.addEventListener('auxclick', blockMatchingLink, true);
    window.addEventListener('submit', event => {
        const form = event.target;
        if (form?.tagName === 'FORM') {
            stopBlockedNavigation(event, form.action);
        }
    }, true);
    document.addEventListener(SETTING_EVENT, event => {
        enabled = event.detail !== false;
    });
})();

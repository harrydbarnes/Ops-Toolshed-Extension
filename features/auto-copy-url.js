(function() {
    'use strict';

    let linkIconFound = null;

    function handleAutoCopy() {
        if (linkIconFound && linkIconFound.isConnected) {
             return;
        }

        const banner = utils.queryShadowDom('.banner');
        if (!banner) return;

        if (!banner.shadowRoot) {
            return;
        }

        const linkIcon = utils.queryShadowDom('mo-icon[name="link"]', banner.shadowRoot);

        if (linkIcon && linkIcon !== linkIconFound) {
             linkIconFound = linkIcon;
             linkIcon.addEventListener('click', () => {
                 navigator.clipboard.writeText(window.location.href)
                     .then(() => utils.showToast('URL copied to clipboard!', 'success'))
                     .catch(err => console.error('Failed to copy URL', err));
             });
             // Visual cue
             linkIcon.style.cursor = 'pointer';
        }
    }

    function initialize() {
        handleAutoCopy();
    }

    window.autoCopyUrlFeature = {
        initialize,
        handleAutoCopy
    };

})();

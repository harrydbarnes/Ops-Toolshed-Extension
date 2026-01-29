(function() {
    'use strict';

    let linkIconFound = null;
    let isEnabled = true;

    chrome.storage.sync.get('autoCopyUrlEnabled', (data) => {
        isEnabled = data.autoCopyUrlEnabled !== false;
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes.autoCopyUrlEnabled) {
            isEnabled = changes.autoCopyUrlEnabled.newValue !== false;
            // If disabled, we might want to remove the listener or visual cue, 
            // but the original code just adds a listener to an existing icon. 
            // We can't easily "remove" the listener without a reference to the wrapper function 
            // if we didn't store it, but we can just stop the action inside the listener 
            // or remove the visual cue class.
            if (!isEnabled && linkIconFound) {
                linkIconFound.classList.remove('auto-copy-icon');
                // Note: The click listener will still be attached but we can check isEnabled inside it
            }
        }
    });

    function handleAutoCopy() {
        if (!isEnabled) return;

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
             linkIcon.addEventListener('click', (e) => {
                 if (!isEnabled) return; // Double check inside event
                 
                 // Check if it's already handled by site or other logic? 
                 // Assuming this is an override or enhancement.
                 
                 navigator.clipboard.writeText(window.location.href)
                     .then(() => utils.showToast('URL copied to clipboard!', 'success'))
                     .catch(err => console.error('Failed to copy URL', err));
             });
             // Visual cue
             linkIcon.classList.add('auto-copy-icon');
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

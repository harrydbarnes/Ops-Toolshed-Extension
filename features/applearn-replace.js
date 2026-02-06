(function() {
    let isEnabled = true;

    function removeTransparency() {
        // Find the image that we previously tagged.
        // Note: queryShadowDom might need to be adjusted if we want to find *any* tagged image,
        // but looking for the specific target URL + the tag is safer.
        const appLearnImg = window.utils.queryShadowDom(`img[src="${window.appLearnFeature.targetUrl}"]`);
        if (appLearnImg && appLearnImg.dataset.toolshedTranslucent) {
            delete appLearnImg.dataset.toolshedTranslucent;
            console.log("[Ops Toolshed] AppLearn icon transparency removed.");
        }
    }

    if (chrome.storage && chrome.storage.sync) {
        // Initialize state from storage
        chrome.storage.sync.get({ appLearnReplaceEnabled: true }, (data) => {
            isEnabled = data.appLearnReplaceEnabled;
        });

        // Listen for changes to the setting
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'sync' && changes.appLearnReplaceEnabled) {
                isEnabled = changes.appLearnReplaceEnabled.newValue;
                if (!isEnabled) {
                    removeTransparency();
                } else {
                    // When re-enabled, trigger the logic again.
                    if (window.appLearnFeature) {
                        window.appLearnFeature.applyTransparency();
                    }
                }
            }
        });
    }

    window.appLearnFeature = {
        targetUrl: 'https://cdn.applearn.tv/GroupM/Images/split_screen_icon.png',

        initialize: function() {
            // The initial check is async and self-contained.
            chrome.storage.sync.get('appLearnReplaceEnabled', (data) => {
                if (data.appLearnReplaceEnabled) {
                    this.injectStyles();
                    this.applyTransparency();
                }
            });
        },

        injectStyles: function() {
            if (document.getElementById('toolshed-applearn-styles')) return;
            const style = document.createElement('style');
            style.id = 'toolshed-applearn-styles';
            style.textContent = `
                img[data-toolshed-translucent="true"] {
                    opacity: 0.5 !important;
                    transition: opacity 0.3s ease;
                }
                img[data-toolshed-translucent="true"]:hover {
                    opacity: 1 !important;
                }
            `;
            document.head.appendChild(style);
        },

        applyTransparency: function() {
            // This is called from the MutationObserver and needs to be fast.
            // It now checks the cached `isEnabled` flag.
            if (!isEnabled) {
                return;
            }

            // Ensure styles are present if feature was just re-enabled.
            this.injectStyles();

            // Locate the original AppLearn image, even if in Shadow DOM
            const appLearnImg = window.utils.queryShadowDom(`img[src="${this.targetUrl}"]`);

            if (appLearnImg && !appLearnImg.dataset.toolshedTranslucent) {
                appLearnImg.dataset.toolshedTranslucent = "true";
                console.log("[Ops Toolshed] AppLearn icon transparency applied.");
            }
        }
    };
})();

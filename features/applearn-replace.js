(function() {
    const TARGET_URL = 'https://cdn.applearn.tv/GroupM/Images/split_screen_icon.png';
    const STYLE_ID = 'toolshed-applearn-styles';
    let isEnabled = null;

    function removeTransparency() {
        const appLearnImg = window.utils.queryShadowDom(`img[src="${TARGET_URL}"]`);
        if (appLearnImg && appLearnImg.dataset.toolshedTranslucent) {
            delete appLearnImg.dataset.toolshedTranslucent;
        }
    }

    const appLearnFeature = {
        targetUrl: TARGET_URL,

        initialize: function() {
            if (!chrome.storage || !chrome.storage.sync) {
                console.warn("AppLearn Feature: chrome.storage.sync not available.");
                return;
            }
            // The initial check is async and self-contained.
            chrome.storage.sync.get({ appLearnReplaceEnabled: true }, (data) => {
                isEnabled = data.appLearnReplaceEnabled;
                if (isEnabled) {
                    this.applyTransparency();
                }
            });
        },

        injectStyles: function(root = document) {
            const styleHost = root === document ? document.head : root;
            if (!styleHost || root.querySelector(`#${STYLE_ID}`)) return;

            const style = document.createElement('style');
            style.id = STYLE_ID;
            style.textContent = `
                img[data-toolshed-translucent="true"] {
                    opacity: 0.5 !important;
                    transition: opacity 0.3s ease;
                }
                img[data-toolshed-translucent="true"]:hover {
                    opacity: 1 !important;
                }
            `;
            styleHost.appendChild(style);
        },

        applyTransparency: function() {
            // This is called from the MutationObserver and needs to be fast.
            // It now checks the cached `isEnabled` flag.
            if (isEnabled === null || isEnabled === false) {
                return;
            }

            // Locate the original AppLearn image, even if in Shadow DOM
            const appLearnImg = window.utils.queryShadowDom(`img[src="${this.targetUrl}"]`);

            if (appLearnImg && !appLearnImg.dataset.toolshedTranslucent) {
                // Styles from document.head do not cross a Shadow DOM boundary, so
                // install the rule in the same root as the AppLearn image.
                this.injectStyles(appLearnImg.getRootNode());
                appLearnImg.dataset.toolshedTranslucent = "true";
            }
        }
    };

    if (chrome.storage && chrome.storage.sync) {
        // Listen for changes to the setting
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'sync' && changes.appLearnReplaceEnabled) {
                isEnabled = changes.appLearnReplaceEnabled.newValue;
                if (!isEnabled) {
                    removeTransparency();
                } else {
                    // When re-enabled, trigger the logic again.
                    appLearnFeature.applyTransparency();
                }
            }
        });
    }

    window.appLearnFeature = appLearnFeature;
})();

(function() {
    const TARGET_URL = 'https://cdn.applearn.tv/GroupM/Images/split_screen_icon.png';
    const STYLE_ID = 'toolshed-applearn-styles';
    let isEnabled = null;

    function handleHelpGuidesClick(event) {
        event.preventDefault();
        event.stopImmediatePropagation();
        window.helpGuidesLauncherFeature?.openHelpGuides(event);
    }

    function handleHelpGuidesKeydown(event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        handleHelpGuidesClick(event);
    }

    function removeHelpGuidesLauncher(appLearnImg) {
        if (!appLearnImg?.dataset.toolshedHelpGuides) return;
        appLearnImg.removeEventListener('click', handleHelpGuidesClick, true);
        appLearnImg.removeEventListener('keydown', handleHelpGuidesKeydown, true);
        delete appLearnImg.dataset.toolshedHelpGuides;
        appLearnImg.removeAttribute('role');
        appLearnImg.removeAttribute('tabindex');
        appLearnImg.removeAttribute('aria-label');
        appLearnImg.removeAttribute('title');
    }

    function removeTransparency() {
        const appLearnImg = window.utils.queryShadowDom(`img[src="${TARGET_URL}"]`);
        if (appLearnImg && appLearnImg.dataset.toolshedTranslucent) {
            delete appLearnImg.dataset.toolshedTranslucent;
        }
        removeHelpGuidesLauncher(appLearnImg);
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
                    cursor: pointer !important;
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

            const helpGuidesEnabled = window.helpGuidesLauncherFeature?.isEnabled() === true;
            if (appLearnImg && !helpGuidesEnabled) {
                removeHelpGuidesLauncher(appLearnImg);
            } else if (appLearnImg && !appLearnImg.dataset.toolshedHelpGuides) {
                appLearnImg.dataset.toolshedHelpGuides = 'true';
                appLearnImg.setAttribute('role', 'button');
                appLearnImg.setAttribute('tabindex', '0');
                appLearnImg.setAttribute('aria-label', 'Open Help Guides');
                appLearnImg.setAttribute('title', 'Help Guides');
                appLearnImg.addEventListener('click', handleHelpGuidesClick, true);
                appLearnImg.addEventListener('keydown', handleHelpGuidesKeydown, true);
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

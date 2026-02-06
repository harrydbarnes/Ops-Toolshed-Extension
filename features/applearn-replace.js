(function() {
    window.appLearnFeature = {
        targetUrl: 'https://cdn.applearn.tv/GroupM/Images/split_screen_icon.png',
        _isEnabled: false,

        initialize: function() {
            chrome.storage.sync.get('appLearnReplaceEnabled', (data) => {
                this._isEnabled = !!data.appLearnReplaceEnabled;
                if (this._isEnabled) {
                    this.injectStyles();
                    this.checkAndReplace();
                }
            });
        },

        injectStyles: function() {
            if (document.getElementById('toolshed-applearn-styles')) return;
            const style = document.createElement('style');
            style.id = 'toolshed-applearn-styles';
            style.textContent = `
                img[data-toolshed-replaced="true"].ALSS_bubble-btn-logo {
                    opacity: 0.5 !important;
                    transition: opacity 0.3s ease;
                }
                /* Optional: Full opacity on hover */
                img[data-toolshed-replaced="true"].ALSS_bubble-btn-logo:hover {
                    opacity: 1 !important;
                }
            `;
            document.head.appendChild(style);
        },

        checkAndReplace: function() {
            if (!this._isEnabled) {
                return;
            }
            // AppLearn icon is often injected into the Shadow DOM
            const appLearnImg = window.utils.queryShadowDom(`img[src="${this.targetUrl}"]`);

            if (appLearnImg && !appLearnImg.dataset.toolshedReplaced) {
                appLearnImg.src = chrome.runtime.getURL('AppLearn-Transparent.png');
                appLearnImg.dataset.toolshedReplaced = "true";
                console.log("[Ops Toolshed] AppLearn icon replaced with translucent version.");
            }
        }
    };
})();

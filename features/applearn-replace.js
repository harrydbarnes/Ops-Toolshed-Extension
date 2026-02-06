(function() {
    window.appLearnFeature = {
        targetUrl: 'https://cdn.applearn.tv/GroupM/Images/split_screen_icon.png',

        initialize: function() {
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
            // Locate the original AppLearn image, even if in Shadow DOM
            const appLearnImg = window.utils.queryShadowDom(`img[src="${this.targetUrl}"]`);

            if (appLearnImg && !appLearnImg.dataset.toolshedTranslucent) {
                appLearnImg.dataset.toolshedTranslucent = "true";
                console.log("[Ops Toolshed] AppLearn icon transparency applied.");
            }
        }
    };
})();

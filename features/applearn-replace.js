(function() {
    window.appLearnFeature = {
        targetUrl: 'https://cdn.applearn.tv/GroupM/Images/split_screen_icon.png',

        initialize: function() {
            chrome.storage.sync.get('appLearnReplaceEnabled', (data) => {
                if (data.appLearnReplaceEnabled) {
                    this.checkAndReplace();
                }
            });
        },

        checkAndReplace: function() {
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

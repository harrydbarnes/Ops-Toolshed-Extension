(() => {
    const SETTING_EVENT = 'ops-toolshed:applearn-popup-setting';
    let featureEnabled = true;
    let masterEnabled = false;

    function publishSetting() {
        document.documentElement?.setAttribute(
            'data-ops-toolshed-applearn-popup-active',
            String(masterEnabled && featureEnabled)
        );
        document.dispatchEvent(new CustomEvent(SETTING_EVENT, {
            detail: masterEnabled && featureEnabled
        }));
    }

    chrome.storage.sync.get({ blockAppLearnPopupsEnabled: true, allFeaturesDisabled: false }, settings => {
        if (chrome.runtime.lastError) {
            publishSetting();
            return;
        }
        featureEnabled = settings.blockAppLearnPopupsEnabled !== false;
        masterEnabled = settings.allFeaturesDisabled !== true;
        publishSetting();
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'sync') return;
        if (changes.blockAppLearnPopupsEnabled) {
            featureEnabled = changes.blockAppLearnPopupsEnabled.newValue !== false;
        }
        if (changes.allFeaturesDisabled) {
            masterEnabled = changes.allFeaturesDisabled.newValue !== true;
        }
        if (changes.blockAppLearnPopupsEnabled || changes.allFeaturesDisabled) publishSetting();
    });
})();

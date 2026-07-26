(() => {
    const SETTING_EVENT = 'ops-toolshed:applearn-popup-setting';

    function publishSetting(enabled) {
        document.dispatchEvent(new CustomEvent(SETTING_EVENT, {
            detail: enabled !== false
        }));
    }

    chrome.storage.sync.get({ blockAppLearnPopupsEnabled: true }, settings => {
        if (chrome.runtime.lastError) {
            publishSetting(true);
            return;
        }
        publishSetting(settings.blockAppLearnPopupsEnabled);
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'sync' || !changes.blockAppLearnPopupsEnabled) return;
        publishSetting(changes.blockAppLearnPopupsEnabled.newValue);
    });
})();

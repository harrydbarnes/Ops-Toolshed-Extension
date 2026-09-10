require('./mocks/chrome');

describe('Features master-mode boundary', () => {
    beforeEach(() => {
        jest.resetModules();
        resetMocks();
        chrome.tabs.query.mockResolvedValue([]);
    });

    function setMasterState(disabled) {
        chrome.storage.sync.get.mockImplementation((_keys, callback) => {
            const result = { allFeaturesDisabled: disabled };
            callback?.(result);
            return Promise.resolve(result);
        });
    }

    test('registers every owned content bundle when Features is on', async () => {
        setMasterState(false);
        const mode = require('../background/feature-mode');

        await expect(mode.featureModeReady).resolves.toBe(true);
        expect(mode.isFeatureModeActive()).toBe(true);
        expect(chrome.scripting.registerContentScripts).toHaveBeenCalledTimes(1);
        const registrations = chrome.scripting.registerContentScripts.mock.calls[0][0];
        expect(registrations.map(item => item.id)).toEqual(
            mode.CONTENT_SCRIPT_DEFINITIONS.map(item => item.id)
        );
        expect(registrations.every(item => item.persistAcrossSessions === false)).toBe(true);
    });

    test('remains fail-closed and does not register content bundles when Features is off', async () => {
        setMasterState(true);
        const mode = require('../background/feature-mode');

        await expect(mode.featureModeReady).resolves.toBe(false);
        expect(mode.isFeatureModeActive()).toBe(false);
        expect(chrome.scripting.registerContentScripts).not.toHaveBeenCalled();
    });

    test('unregisters owned bundles and reloads matching pages on an Off transition', async () => {
        setMasterState(false);
        chrome.scripting.getRegisteredContentScripts.mockResolvedValue([
            { id: 'ops-toolshed-mediaocean-features' },
            { id: 'ops-toolshed-stale-registration' },
            { id: 'third-party-registration' }
        ]);
        chrome.tabs.query.mockResolvedValue([{ id: 12 }, { id: 34 }, { id: undefined }]);
        const mode = require('../background/feature-mode');
        await mode.featureModeReady;
        chrome.scripting.unregisterContentScripts.mockClear();

        await expect(mode.reconcileFeatureMode(true, { reloadTabs: true })).resolves.toBe(false);

        expect(chrome.scripting.unregisterContentScripts).toHaveBeenCalledWith({
            ids: ['ops-toolshed-mediaocean-features', 'ops-toolshed-stale-registration']
        });
        expect(chrome.tabs.query).toHaveBeenCalledWith({ url: ['https://*.mediaocean.com/*'] });
        expect(chrome.tabs.reload.mock.calls.map(call => call[0])).toEqual([12, 34]);
        expect(mode.isFeatureModeActive()).toBe(false);
    });

    test('becomes inactive immediately and remains off when unregistration fails', async () => {
        setMasterState(false);
        const mode = require('../background/feature-mode');
        await mode.featureModeReady;
        chrome.scripting.getRegisteredContentScripts.mockRejectedValue(new Error('registration API failed'));

        const transition = mode.reconcileFeatureMode(true);
        expect(mode.isFeatureModeActive()).toBe(false);
        await expect(transition).resolves.toBe(false);
        expect(mode.isFeatureModeActive()).toBe(false);
    });

    test('allows only the toolbar popup through the disabled background message boundary', async () => {
        setMasterState(true);
        const mode = require('../background/feature-mode');
        await mode.featureModeReady;

        expect(mode.isPopupSender({ url: 'mock-url/popup.html' })).toBe(true);
        expect(mode.isPopupSender({ url: 'mock-url/settings.html' })).toBe(false);
        expect(mode.isPopupSender({ url: 'mock-url/popup.html', tab: { id: 1 } })).toBe(false);
    });

    test('fails closed when the master setting cannot be read', async () => {
        chrome.storage.sync.get.mockImplementation(() => {
            throw new Error('storage unavailable');
        });
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const mode = require('../background/feature-mode');

        await expect(mode.featureModeReady).resolves.toBe(false);
        expect(mode.isFeatureModeActive()).toBe(false);
        expect(chrome.scripting.registerContentScripts).not.toHaveBeenCalled();
        consoleSpy.mockRestore();
    });
});

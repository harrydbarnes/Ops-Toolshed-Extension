const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { FEATURE_SETTINGS_DEFAULTS } = require('../settings');

const settingsHtml = fs.readFileSync(path.resolve(__dirname, '../settings.html'), 'utf8');
const settingsScript = fs.readFileSync(path.resolve(__dirname, '../settings.js'), 'utf8');
const utilsScript = fs.readFileSync(path.resolve(__dirname, '../utils.js'), 'utf8');

const FEATURE_TOGGLE_KEYS = {
    logoToggle: 'logoReplaceEnabled',
    appLearnReplaceToggle: 'appLearnReplaceEnabled',
    bannerUsernameToggle: 'bannerUsernameEnabled',
    loadingFactsToggle: 'loadingFactsEnabled',
    helpGuidesToggle: 'helpGuidesEnabled',
    countPlacementsSelectedToggle: 'countPlacementsSelectedEnabled',
    approverSidebarEnhancementsToggle: 'approverSidebarEnhancementsEnabled',
    actualiseBulkExportToggle: 'actualiseBulkExportEnabled',
    campaignTabTitleToggle: 'campaignTabTitleEnabled',
    ordersShortcutToggle: 'ordersShortcutEnabled',
    actualiseShortcutToggle: 'actualiseShortcutEnabled',
    actualiseNavbarToggle: 'actualiseNavbarEnabled',
    quickCampaignActionsToggle: 'quickCampaignActionsEnabled',
    campaignNameQuickCopyToggle: 'campaignNameQuickCopyEnabled',
    campaignHeaderQuickCopyToggle: 'campaignHeaderQuickCopyEnabled',
    campaignDateShortcutToggle: 'campaignDateShortcutEnabled',
    orderIdCopyToggle: 'orderIdCopyEnabled',
    maxCampaignBudgetToggle: 'maxCampaignBudgetEnabled',
    swapAccountsToggle: 'swapAccountsEnabled',
    autoCopyUrlToggle: 'autoCopyUrlEnabled',
    addCampaignShortcutToggle: 'addCampaignShortcutEnabled',
    hidingSectionsToggle: 'hidingSectionsEnabled',
    automateFormFieldsToggle: 'automateFormFieldsEnabled',
    rememberAccountSwitchUrlToggle: 'rememberAccountSwitchUrlEnabled',
    approverWidgetPlacementToggle: 'approverWidgetPlacementEnabled',
    dstAssuranceToggle: 'dstAssuranceEnabled',
    budgetWidgetOptimisedToggle: 'budgetWidgetOptimisedEnabled',
    newOrderUiOptimisationToggle: 'newOrderUiOptimisationEnabled',
    seeCommentsOnLockedBuysToggle: 'alwaysShowCommentsEnabled',
    gmiChatShortcutToggle: 'gmiChatShortcutEnabled',
    fontSizeToggle: 'fontSizeToggleEnabled',
    resizableChatToggle: 'resizableChatToggleEnabled',
    scheduledChatToggle: 'scheduledChatToggleEnabled',
    directMoeChatToggle: 'directMoeChatEnabled',
    blockAppLearnPopupsToggle: 'blockAppLearnPopupsEnabled',
    actualiseScrollRestoreToggle: 'actualiseScrollRestoreEnabled',
    orderGridScrollSyncToggle: 'orderGridScrollSyncEnabled',
    statsCollectorToggle: 'statsCollectorEnabled'
};

function readStorage(store, keys) {
    if (Array.isArray(keys)) {
        return Object.fromEntries(keys.filter(key => key in store).map(key => [key, store[key]]));
    }
    if (typeof keys === 'string') return keys in store ? { [keys]: store[keys] } : {};
    if (keys && typeof keys === 'object') return { ...keys, ...store };
    return { ...store };
}

async function createSettingsPage() {
    const dom = new JSDOM(settingsHtml, {
        url: 'chrome-extension://test/settings.html#features',
        runScripts: 'outside-only'
    });
    const { window } = dom;
    const syncStore = { ...FEATURE_SETTINGS_DEFAULTS };
    const localStore = {};

    window.chrome = {
        runtime: {
            id: 'test-extension',
            lastError: null,
            getURL: value => `chrome-extension://test/${value}`,
            onMessage: { addListener: jest.fn() },
            sendMessage: jest.fn().mockResolvedValue({ status: 'success' })
        },
        storage: {
            sync: {
                get: jest.fn((keys, callback) => {
                    const result = readStorage(syncStore, keys);
                    callback?.(result);
                    return Promise.resolve(result);
                }),
                set: jest.fn((values, callback) => {
                    Object.assign(syncStore, values);
                    callback?.();
                    return Promise.resolve();
                })
            },
            local: {
                get: jest.fn((keys, callback) => {
                    const result = readStorage(localStore, keys);
                    callback?.(result);
                    return Promise.resolve(result);
                }),
                set: jest.fn((values, callback) => {
                    Object.assign(localStore, values);
                    callback?.();
                    return Promise.resolve();
                }),
                remove: jest.fn((_keys, callback) => callback?.())
            },
            onChanged: { addListener: jest.fn() }
        },
        tabs: {
            create: jest.fn(),
            query: jest.fn((_query, callback) => callback([])),
            sendMessage: jest.fn().mockResolvedValue({})
        },
        sidePanel: { open: jest.fn().mockResolvedValue(undefined) },
        windows: { WINDOW_ID_CURRENT: -2 }
    };
    window.alert = jest.fn();
    window.console.log = jest.fn();
    window.eval(utilsScript);
    window.eval(settingsScript);
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
    for (let index = 0; index < 10; index += 1) await Promise.resolve();
    window.chrome.storage.sync.set.mockClear();

    return { dom, window };
}

describe('Settings feature toggle contract', () => {
    test('every visible Features checkbox has a default and persists from its real UI control', async () => {
        const { dom, window } = await createSettingsPage();
        const toggles = Array.from(
            window.document.querySelectorAll('#features input[type="checkbox"]')
        );
        const visibleToggleIds = toggles.map(toggle => toggle.id).sort();

        expect(visibleToggleIds).toEqual(Object.keys(FEATURE_TOGGLE_KEYS).sort());

        for (const toggle of toggles) {
            const storageKey = FEATURE_TOGGLE_KEYS[toggle.id];
            expect(FEATURE_SETTINGS_DEFAULTS).toHaveProperty(storageKey);

            window.chrome.storage.sync.set.mockClear();
            toggle.checked = false;
            toggle.click();

            expect(window.chrome.storage.sync.set).toHaveBeenCalledWith(
                { [storageKey]: true },
                expect.any(Function)
            );
        }

        for (let index = 0; index < 5; index += 1) await Promise.resolve();
        dom.window.close();
    });
});

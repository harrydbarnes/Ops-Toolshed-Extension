const fs = require('fs');
const path = require('path');

const settingsHtml = fs.readFileSync(path.resolve(__dirname, '../settings.html'), 'utf8');
const settingsScript = fs.readFileSync(path.resolve(__dirname, '../settings.js'), 'utf8');
const popupHtml = fs.readFileSync(path.resolve(__dirname, '../popup.html'), 'utf8');
const popupScript = fs.readFileSync(path.resolve(__dirname, '../popup.js'), 'utf8');
const legacyScraper = fs.readFileSync(path.resolve(__dirname, '../background/meta-billing-scraper.js'), 'utf8');

const { getMetaFinanceToolConfig, launchMetaFinanceTool } = require('../popup');

describe('Meta finance tool selection', () => {
    test('offers a Settings segmented control with the Social Booking Report as default', () => {
        expect(settingsHtml).toContain('id="metaFinanceToolSegmented"');
        expect(settingsHtml).toContain('data-value="social" aria-pressed="true">Social report</button>');
        expect(settingsHtml).toContain('data-value="legacy" aria-pressed="false">Billing check</button>');
        expect(settingsScript).toContain("initializeSegmentedControl('metaFinanceToolSegmented', 'metaFinanceToolMode', 'social')");
    });

    test('keeps the popup on the new report when the setting is absent or invalid', () => {
        expect(getMetaFinanceToolConfig()).toEqual({
            mode: 'social',
            label: 'Social Booking Report',
            extensionPage: 'social-finance.html'
        });
        expect(getMetaFinanceToolConfig('unexpected').mode).toBe('social');
        expect(popupHtml).toContain('id="socialFinanceReportButton"');
        expect(popupScript).toContain("chrome.storage.sync.get({ metaFinanceToolMode: 'social' }");
    });

    test('restores the legacy Meta Billing Check through the existing background action', () => {
        expect(getMetaFinanceToolConfig('legacy')).toEqual({
            mode: 'legacy',
            label: 'Meta Billing Check',
            action: 'metaBillingCheck'
        });

        const runtime = {
            getURL: jest.fn(),
            sendMessage: jest.fn((message, callback) => callback({ status: 'success' })),
            lastError: undefined
        };
        const tabs = { create: jest.fn() };
        const alertUser = jest.fn();

        launchMetaFinanceTool('legacy', { runtime, tabs, alertUser });

        expect(runtime.sendMessage).toHaveBeenCalledWith(
            { action: 'metaBillingCheck' },
            expect.any(Function)
        );
        expect(tabs.create).not.toHaveBeenCalled();
        expect(alertUser).not.toHaveBeenCalled();
    });

    test('opens the Social Booking Report for the default selection', () => {
        const runtime = {
            getURL: jest.fn(pathname => `mock-url/${pathname}`),
            sendMessage: jest.fn(),
            lastError: undefined
        };
        const tabs = { create: jest.fn() };

        launchMetaFinanceTool(undefined, { runtime, tabs, alertUser: jest.fn() });

        expect(runtime.getURL).toHaveBeenCalledWith('social-finance.html');
        expect(tabs.create).toHaveBeenCalledWith({ url: 'mock-url/social-finance.html' });
        expect(runtime.sendMessage).not.toHaveBeenCalled();
    });

    test('keeps the restored legacy CSV export inert in spreadsheet software', () => {
        expect(legacyScraper).toContain("/^\\s*[=+\\-@]/");
        expect(legacyScraper).toContain("cellStr = `'${cellStr}`");
    });
});

describe('legacy Meta Billing Check availability', () => {
    let metaBillingCheck;

    beforeEach(() => {
        resetMocks();
        jest.resetModules();
        ({ metaBillingCheck } = require('../background/message-handlers').messageHandlers);
    });

    test('injects the legacy scraper into the active Meta campaigns tab', async () => {
        chrome.tabs.query.mockResolvedValue([{
            id: 42,
            url: 'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=123'
        }]);
        chrome.scripting.executeScript.mockResolvedValue([]);
        const sendResponse = jest.fn();

        await metaBillingCheck({}, {}, sendResponse);

        expect(chrome.scripting.executeScript).toHaveBeenCalledWith({
            target: { tabId: 42 },
            func: expect.any(Function)
        });
        expect(sendResponse).toHaveBeenCalledWith({
            status: 'success',
            message: 'Scraping process initiated.'
        });
    });

    test('returns the existing guidance when the active tab is not Meta Ads Manager', async () => {
        chrome.tabs.query.mockResolvedValue([{ id: 42, url: 'https://example.test/' }]);
        const sendResponse = jest.fn();

        await metaBillingCheck({}, {}, sendResponse);

        expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
        expect(sendResponse).toHaveBeenCalledWith({
            status: 'error',
            message: 'You need to be on the Meta Ads Manager campaigns page for this to work.'
        });
    });
});

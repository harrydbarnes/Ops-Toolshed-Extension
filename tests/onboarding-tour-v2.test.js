const fs = require('fs');
const { readScript } = require('./helpers/read-script');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.resolve(__dirname, '../onboarding-tour-v2.html'), 'utf8');
const script = readScript(path.resolve(__dirname, '../onboarding-tour-v2.js'));

function setup(settings = {}, startingUrl = 'https://groupmuk-prisma.mediaocean.com/campaign-management/#route=campaigns', progress = {}) {
    const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'chrome-extension://test/onboarding-tour-v2.html' });
    let activeUrl = startingUrl;
    const chrome = {
        runtime: {},
        storage: { sync: { get: jest.fn((defaults, callback) => callback({ ...defaults, ...settings })) }, local: { get: jest.fn((defaults, callback) => callback({ ...defaults, ...progress })), set: jest.fn((values, callback) => callback()) } },
        tabs: {
            query: jest.fn(async () => [{ id: 12, url: activeUrl }]),
            sendMessage: jest.fn(async (tabId, message) => ({ status: 'success', found: message.action === 'showOnboardingHighlight' })),
            update: jest.fn(async (tabId, values) => { activeUrl = values.url; return { id: tabId, url: activeUrl }; })
        },
        sidePanel: { close: jest.fn(async () => {}) }
    };
    dom.window.chrome = chrome;
    dom.window.eval(script);
    return { dom, chrome, setActiveUrl: value => { activeUrl = value; } };
}

describe('Onboarding side-panel v2', () => {
    test.each(['throw', 'reject', 'callback', 'missing'])('keeps progress and permits retry after a %s save failure', async failure => {
        const { dom, chrome } = setup({}, undefined, { onboardingTourVersion: 'v2', onboardingTourChapter: 4 });
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
        const title = dom.window.document.getElementById('tour-title').textContent;
        const save = chrome.storage.local.set;
        if (failure === 'missing') delete chrome.storage.local.set;
        else save.mockImplementation(() => {
            if (failure === 'throw') throw new Error('Storage unavailable');
            if (failure === 'reject') return Promise.reject(new Error('Storage unavailable'));
        });
        if (failure === 'callback') save.mockImplementation((values, callback) => {
            chrome.runtime.lastError = { message: 'Storage unavailable' };
            callback();
            delete chrome.runtime.lastError;
        });
        await dom.window.onboardingTourPanelV2.finishTour(false);
        expect(chrome.sidePanel.close).not.toHaveBeenCalled();
        expect(dom.window.document.getElementById('tour-title').textContent).toBe(title);
        expect(dom.window.document.getElementById('tour-status').textContent).toContain('Could not save');
        expect(dom.window.document.getElementById('tour-next').disabled).toBe(false);
        chrome.storage.local.set = save.mockImplementation((values, callback) => callback());
        await dom.window.onboardingTourPanelV2.finishTour(false);
        expect(chrome.sidePanel.close).toHaveBeenCalledTimes(1);
        dom.window.close();
    });

    test('waits for persistence and suppresses duplicate completion requests', async () => {
        const { dom, chrome } = setup();
        await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
        let complete;
        chrome.storage.local.set.mockClear().mockImplementation(() => new Promise(resolve => { complete = resolve; }));
        const pending = dom.window.onboardingTourPanelV2.finishTour(true);
        await dom.window.onboardingTourPanelV2.finishTour(true);
        expect(chrome.sidePanel.close).not.toHaveBeenCalled();
        expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
        expect(dom.window.document.getElementById('skip-tour').disabled).toBe(true);
        complete();
        await pending;
        expect(chrome.sidePanel.close).toHaveBeenCalledTimes(1);
        dom.window.close();
    });

    test('groups enabled campaign features into a small set of chapters', async () => {
        const { dom } = setup();
        await Promise.resolve();
        await Promise.resolve();

        const chapters = dom.window.onboardingTourPanelV2.buildChapters();
        expect(chapters).toHaveLength(5);
        expect(chapters[2].features).toEqual(expect.arrayContaining(['Campaign actions beside the campaign name', 'Direct Orders access']));
        expect(chapters[3].features).toEqual(expect.arrayContaining(['Approver controls beside your campaign']));
        dom.window.close();
    });

    test('waits for a campaign before moving from the campaign chapter to workspace guidance', async () => {
        jest.useFakeTimers();
        const { dom, setActiveUrl } = setup();
        await Promise.resolve();
        await Promise.resolve();

        dom.window.document.getElementById('tour-next').click();
        expect(dom.window.document.getElementById('tour-title').textContent).toContain('Open any campaign');
        expect(dom.window.document.getElementById('tour-next').disabled).toBe(true);

        setActiveUrl('https://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP3GH64&route=online');
        await jest.advanceTimersByTimeAsync(900);
        expect(dom.window.document.getElementById('tour-title').textContent).toContain('campaign workspace');
        dom.window.close();
        jest.useRealTimers();
    });

    test('waits with an accurate Prisma-opening status when launched away from Prisma', async () => {
        jest.useFakeTimers();
        const { dom } = setup({}, 'chrome-extension://test/settings.html');
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await jest.advanceTimersByTimeAsync(0);
        await Promise.resolve();
        await Promise.resolve();

        expect(dom.window.document.getElementById('tour-status').textContent).toBe('Opening Prisma for the tour…');
        expect(dom.window.document.getElementById('tour-status').classList).toContain('is-waiting');
        dom.window.close();
        jest.useRealTimers();
    });

    test('finishing preserves the campaign and records the v2 tour', async () => {
        const campaignUrl = 'https://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP3GH64&route=online';
        const { dom, chrome } = setup({}, campaignUrl);
        await Promise.resolve();
        await dom.window.onboardingTourPanelV2.finishTour(false);

        expect(chrome.tabs.update).not.toHaveBeenCalled();
        expect(chrome.sidePanel.close).toHaveBeenCalledWith({ tabId: 12 });
        expect(chrome.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({ onboardingTourVersion: 'v2', onboardingTourCompleted: true }), expect.any(Function));
        dom.window.close();
    });

    test('skipping closes the panel without navigating away from the active Prisma page', async () => {
        const { dom, chrome } = setup();
        await Promise.resolve();
        await dom.window.onboardingTourPanelV2.finishTour(true);

        expect(chrome.tabs.update).not.toHaveBeenCalled();
        expect(chrome.sidePanel.close).toHaveBeenCalledWith({ tabId: 12 });
        expect(chrome.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({ onboardingTourSkipped: true, onboardingTourCompleted: false }), expect.any(Function));
        dom.window.close();
    });
});


test('resumes an unfinished chapter and lets a user skip waiting for a campaign', async () => {
    const { dom } = setup({}, undefined, { onboardingTourVersion: 'v2', onboardingTourChapter: 1 });
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(dom.window.document.getElementById('tour-count').textContent).toBe('Chapter 2 of 5');
    dom.window.document.getElementById('skip-chapter').click();
    expect(dom.window.document.getElementById('tour-count').textContent).toBe('Chapter 3 of 5');
    expect(dom.window.document.activeElement.id).toBe('tour-title');
    dom.window.close();
});

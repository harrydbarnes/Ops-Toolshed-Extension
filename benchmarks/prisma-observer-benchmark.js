const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const { JSDOM } = require('jsdom');

const repoRoot = path.resolve(__dirname, '..');
const contentScript = fs.readFileSync(path.join(repoRoot, 'content.js'), 'utf8');
const campaignScript = fs.readFileSync(path.join(repoRoot, 'features', 'campaign.js'), 'utf8');

function createChromeMock() {
    return {
        runtime: {
            id: 'benchmark-extension',
            onMessage: { addListener() {} },
            sendMessage: () => Promise.resolve({ status: 'success' })
        },
        storage: {
            sync: {
                get(keys, callback) {
                    const defaults = typeof keys === 'object' && !Array.isArray(keys) ? keys : {};
                    callback?.(defaults);
                    return Promise.resolve(defaults);
                }
            },
            onChanged: { addListener() {} }
        }
    };
}

async function benchmarkCentralObserver() {
    const benchNodes = Array.from({ length: 400 }, (_, index) => (
        `<div data-bench-node="${index}"><span>${index}</span></div>`
    )).join('');
    const dom = new JSDOM(`<!doctype html><html><body>${benchNodes}</body></html>`, {
        url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=CPBENCH&ptb-mod=buy&ptb-ctx=actualize&route=actualize',
        runScripts: 'dangerously'
    });
    const { window } = dom;
    const counters = Object.create(null);
    const timers = new Map();
    const frames = new Map();
    let nextTaskId = 1;
    let observerCallback = null;
    let scheduledTimerCount = 0;
    let scheduledFrameCount = 0;

    Object.defineProperty(window.document, 'readyState', { configurable: true, value: 'complete' });
    window.console.log = () => {};
    window.chrome = createChromeMock();
    window.setInterval = () => 1;
    window.setTimeout = (callback, delay = 0) => {
        const id = nextTaskId++;
        scheduledTimerCount += 1;
        timers.set(id, { callback, delay });
        return id;
    };
    window.clearTimeout = id => timers.delete(id);
    window.requestAnimationFrame = callback => {
        const id = nextTaskId++;
        scheduledFrameCount += 1;
        frames.set(id, callback);
        return id;
    };
    window.cancelAnimationFrame = id => frames.delete(id);
    window.MutationObserver = class {
        constructor(callback) {
            observerCallback = callback;
        }
        observe() {}
        disconnect() {}
    };

    const work = name => {
        counters[name] = (counters[name] || 0) + 1;
        window.document.querySelectorAll('[data-bench-node]');
    };
    const feature = methods => Object.fromEntries(methods.map(method => [method, () => work(method)]));

    window.statsCollector = {
        initialize: () => {},
        trackCampaignId: () => work('trackCampaignId')
    };
    window.appLearnFeature = { initialize: () => {}, applyTransparency: () => work('applyTransparency') };
    window.helpGuidesLauncherFeature = { initialize: () => {}, ensureLauncher: () => work('ensureLauncher') };
    window.bannerUsernameFeature = { initialize: () => {} };
    window.placementCounterFeature = { initialize: () => {}, checkSelection: () => work('checkSelection') };
    window.dstAssuranceFeature = { initialize: () => {}, apply: () => work('dstAssuranceApply') };
    window.swapAccountsFeature = { initialize: () => {} };
    window.autoCopyUrlFeature = { initialize: () => {}, handleAutoCopy: () => work('handleAutoCopy') };
    window.orderIdCopyFeature = { initialize: () => {}, checkAndAddCopyButtons: () => work('checkAndAddCopyButtons') };
    window.orderViewToggleFeature = { initialize: () => {}, handleOrderViewToggle: () => work('handleOrderViewToggle') };
    window.actualiseScrollRestoreFeature = { initialize: () => {} };
    window.actualiseNavbarFeature = {
        initialize: () => {},
        isInitialized: () => true,
        apply: () => work('actualiseNavbarApply')
    };
    window.actualiseShortcutFeature = { initialize: () => {}, apply: () => work('actualiseShortcutApply') };
    window.actualiseExportAllFeature = { initialize: () => {}, apply: () => work('actualiseExportApply') };
    window.maxCampaignBudgetFeature = { initialize: () => {}, apply: () => work('maxCampaignBudgetApply') };
    window.campaignTabTitleFeature = { initialize: () => {} };
    window.loadingFactsFeature = { initialize: () => {} };
    window.liveChatEnhancements = { initialize: () => {} };
    window.logoFeature = {
        shouldReplaceLogoOnThisPage: () => true,
        checkAndReplaceLogo: () => work('checkAndReplaceLogo')
    };
    window.remindersFeature = {
        fetchCustomReminders: () => Promise.resolve(),
        checkForMetaConditions: () => work('checkForMetaConditions'),
        checkForIASConditions: () => work('checkForIASConditions'),
        checkCustomReminders: () => work('checkCustomReminders'),
        resetReminderDismissalFlags: () => {}
    };
    window.campaignFeature = {
        resetCampaignFlags: () => {},
        handleCampaignManagementFeatures: () => work('handleCampaignManagementFeatures'),
        handleAlwaysShowComments: () => work('handleAlwaysShowComments'),
        handleCampaignNavigationOptimisation: () => work('handleCampaignNavigationOptimisation')
    };
    window.approverPastingFeature = feature([
        'initialize',
        'handleApproverPasting',
        'handleManageFavouritesButton',
        'addRecipientHistoryControls'
    ]);
    window.gmiChatFeature = { handleGmiChatButton: () => work('handleGmiChatButton') };

    window.eval(contentScript);
    for (let attempt = 0; attempt < 10 && !observerCallback; attempt += 1) {
        await Promise.resolve();
    }
    if (!observerCallback) throw new Error('Content observer did not initialize.');

    const flushScheduledWork = () => {
        while (frames.size > 0) {
            const queued = Array.from(frames.values());
            frames.clear();
            queued.forEach(callback => callback(performance.now()));
        }
        while (timers.size > 0) {
            const queued = Array.from(timers.values());
            timers.clear();
            queued.forEach(task => task.callback());
        }
    };

    // Drain the one-time initial pass before measuring observer work. This
    // prevents its queued frame/timer flags from suppressing the first test
    // mutation batch.
    flushScheduledWork();

    // Exclude initialization work from the mutation-path measurement.
    Object.keys(counters).forEach(key => { counters[key] = 0; });
    timers.clear();
    frames.clear();
    scheduledTimerCount = 0;
    scheduledFrameCount = 0;

    const iterations = 80;
    const mutation = [{ type: 'childList', target: window.document.body, addedNodes: [] }];
    const started = performance.now();
    for (let index = 0; index < iterations; index += 1) observerCallback(mutation);

    flushScheduledWork();
    const elapsedMs = performance.now() - started;
    const totalFeatureCalls = Object.values(counters).reduce((sum, count) => sum + count, 0);
    const genericCalls = { ...counters };
    const genericScheduledTimers = scheduledTimerCount;
    const genericScheduledFrames = scheduledFrameCount;

    // Measure extension-owned DOM churn separately. Dirty reconciliation should
    // ignore these mutations because they cannot make native Prisma targets appear.
    Object.keys(counters).forEach(key => { counters[key] = 0; });
    timers.clear();
    frames.clear();
    scheduledTimerCount = 0;
    scheduledFrameCount = 0;
    const extensionNoiseNode = window.document.createElement('div');
    extensionNoiseNode.className = 'toolshed-benchmark-noise';
    const extensionMutation = [{
        type: 'childList',
        target: window.document.body,
        addedNodes: [extensionNoiseNode]
    }];
    const extensionStarted = performance.now();
    for (let index = 0; index < iterations; index += 1) observerCallback(extensionMutation);

    flushScheduledWork();
    const extensionNoiseElapsedMs = performance.now() - extensionStarted;
    const extensionNoiseFeatureCalls = Object.values(counters).reduce((sum, count) => sum + count, 0);
    const extensionNoiseScheduledTimers = scheduledTimerCount;
    const extensionNoiseScheduledFrames = scheduledFrameCount;

    dom.window.close();
    return {
        mutationBatches: iterations,
        totalFeatureCalls,
        scheduledTimers: genericScheduledTimers,
        scheduledFrames: genericScheduledFrames,
        elapsedMs: Number(elapsedMs.toFixed(2)),
        calls: genericCalls,
        extensionNoise: {
            totalFeatureCalls: extensionNoiseFeatureCalls,
            scheduledTimers: extensionNoiseScheduledTimers,
            scheduledFrames: extensionNoiseScheduledFrames,
            elapsedMs: Number(extensionNoiseElapsedMs.toFixed(2))
        }
    };
}

function benchmarkCampaignNavigation() {
    const unrelatedSlots = Array.from({ length: 120 }, (_, index) => (
        `<div slot="right" data-unrelated-slot="${index}"><span>Other ${index}</span></div>`
    )).join('');
    const dom = new JSDOM(`<!doctype html><html><head></head><body>
        ${unrelatedSlots}
        <div id="native-header"><div slot="right"><div class="workflow-widget-wrapper">Approvers</div></div></div>
        <div class="p2b-navbar-wrapper">
            <div id="p2b-navbar"><div class="mo-navbar-sections">
                <a id="p2b-navbar-section-analyze" href="#campaign-id=CPBENCH&ptb-mod=analyze">ANALYSE</a>
            </div></div>
        </div>
    </body></html>`, {
        url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=CPBENCH&ptb-mod=plan&ptb-ctx=rfpSummary',
        runScripts: 'dangerously'
    });
    const { window } = dom;
    const { document } = window;
    window.chrome = createChromeMock();
    window.HTMLCanvasElement.prototype.getContext = () => null;

    let broadSlotQueries = 0;
    let broadSlotCandidates = 0;
    const originalQuerySelectorAll = document.querySelectorAll.bind(document);
    document.querySelectorAll = selector => {
        const result = originalQuerySelectorAll(selector);
        if (selector === 'div[slot="right"]') {
            broadSlotQueries += 1;
            broadSlotCandidates += result.length;
        }
        return result;
    };

    window.eval(campaignScript);
    const iterations = 200;
    const started = performance.now();
    for (let index = 0; index < iterations; index += 1) {
        window.campaignFeature.handleCampaignNavigationOptimisation();
    }
    const elapsedMs = performance.now() - started;

    dom.window.close();
    return {
        reconciliations: iterations,
        broadSlotQueries,
        broadSlotCandidates,
        elapsedMs: Number(elapsedMs.toFixed(2))
    };
}

(async () => {
    const result = {
        centralObserver: await benchmarkCentralObserver(),
        campaignNavigation: benchmarkCampaignNavigation()
    };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

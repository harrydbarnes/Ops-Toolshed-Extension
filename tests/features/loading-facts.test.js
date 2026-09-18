const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const loadingFactsScript = fs.readFileSync(
    path.resolve(__dirname, '../../features/loading-facts.js'),
    'utf8'
);
const contentCss = fs.readFileSync(
    path.resolve(__dirname, '../../content.css'),
    'utf8'
);

function runScheduledTimer(timers, delay) {
    const timerIndex = timers.findIndex(timer => timer.delay === delay);
    if (timerIndex === -1) throw new Error(`No ${delay}ms timer was scheduled.`);
    const [{ callback }] = timers.splice(timerIndex, 1);
    callback();
}

describe('Loading Facts behaviour', () => {
    test('uses responsive bottom spacing for short and tall viewports', () => {
        expect(contentCss).toContain('--toast-bottom-position: clamp(20px, 4.762vh, 55px);');
    });

    test('does not show a loading fact for campaign search activity', async () => {
        const dom = new JSDOM('<!doctype html><html><body><mo-overlay role="menu"><mo-banner-recent-menu-content><mo-search-box><span class="search-spinner"></span></mo-search-box></mo-banner-recent-menu-content></mo-overlay></body></html>', {
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=cm-dashboard&route=campaigns',
            runScripts: 'outside-only'
        });
        const { window } = dom;
        const { document } = window;
        const spinner = document.querySelector('.search-spinner');
        spinner.getBoundingClientRect = () => ({
            left: 570,
            top: 80,
            width: 20,
            height: 20,
            right: 590,
            bottom: 100
        });
        window.requestAnimationFrame = callback => callback();
        window.IntersectionObserver = jest.fn(() => ({ observe: jest.fn(), disconnect: jest.fn() }));
        window.utils = {
            queryShadowDom: jest.fn(() => null),
            isElementVisible: jest.fn(() => true),
            findVisibleLoadingSpinners: jest.fn(() => [spinner])
        };
        window.chrome = {
            storage: {
                local: {
                    get: jest.fn((_keys, callback) => callback({})),
                    set: jest.fn()
                },
                onChanged: { addListener: jest.fn() }
            }
        };

        window.eval(loadingFactsScript);
        window.loadingFactsFeature.ui = 'old';
        const feature = window.loadingFactsFeature;
        feature.isEnabled = true;
        feature.isIntersecting = true;
        feature.observedSpinner = spinner;

        await feature.showToast(spinner);

        const toast = document.getElementById('ops-toolshed-loading-toast');
        if (toast) feature.hideToast({ force: true });
        expect(toast).toBeNull();
        dom.window.close();
    });

    test('dismisses an existing loading fact when campaign search starts', async () => {
        const dom = new JSDOM('<!doctype html><html><body><div class="mo-spinner"></div></body></html>', {
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=cm-dashboard&route=online',
            runScripts: 'outside-only'
        });
        const { window } = dom;
        const { document } = window;
        const normalSpinner = document.querySelector('.mo-spinner');
        const scheduledTimers = [];
        let nextTimerId = 1;
        normalSpinner.getBoundingClientRect = () => ({
            left: 100,
            top: 200,
            width: 40,
            height: 40,
            right: 140,
            bottom: 240
        });
        window.setTimeout = (callback, delay) => {
            scheduledTimers.push({ callback, delay });
            return nextTimerId++;
        };
        window.clearTimeout = jest.fn();
        window.requestAnimationFrame = callback => callback();
        window.IntersectionObserver = jest.fn(() => ({ observe: jest.fn(), disconnect: jest.fn() }));
        window.utils = {
            queryShadowDom: jest.fn(() => null),
            isElementVisible: jest.fn(() => true),
            findVisibleLoadingSpinners: jest.fn(() => [normalSpinner])
        };
        window.chrome = {
            storage: {
                local: {
                    get: jest.fn((_keys, callback) => callback({})),
                    set: jest.fn()
                },
                onChanged: { addListener: jest.fn() }
            }
        };

        window.eval(loadingFactsScript);
        window.loadingFactsFeature.ui = 'old';
        const feature = window.loadingFactsFeature;
        feature.isEnabled = true;
        feature.isIntersecting = true;
        feature.observedSpinner = normalSpinner;

        await feature.showToast(normalSpinner);
        const toast = document.getElementById('ops-toolshed-loading-toast');
        expect(toast).not.toBeNull();

        const overlay = document.createElement('mo-overlay');
        overlay.setAttribute('role', 'menu');
        const searchContent = document.createElement('mo-banner-recent-menu-content');
        const searchSpinner = document.createElement('span');
        searchSpinner.className = 'search-spinner';
        searchContent.appendChild(searchSpinner);
        overlay.appendChild(searchContent);
        document.body.appendChild(overlay);

        feature.settingsLoaded = true;
        feature.checkForLoading({
            visibleSpinners: [searchSpinner],
            pageVisibleSpinners: [searchSpinner],
            sidePanelVisibleSpinners: []
        });
        runScheduledTimer(scheduledTimers, 200);

        expect(toast.classList).toContain('slide-down');
        runScheduledTimer(scheduledTimers, 500);
        expect(document.getElementById('ops-toolshed-loading-toast')).toBeNull();
        dom.window.close();
    });

    test('falls back to defaults when Chrome storage is unavailable', async () => {
        const dom = new JSDOM('<!doctype html><html><body></body></html>', {
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP123&route=online',
            runScripts: 'outside-only'
        });
        const { window } = dom;
        window.chrome = {};
        window.IntersectionObserver = jest.fn(function() {
            return { observe: jest.fn(), disconnect: jest.fn() };
        });
        window.utils = {
            findVisibleLoadingSpinners: jest.fn(() => []),
            queryShadowDom: jest.fn(() => null),
            isElementVisible: jest.fn(() => false)
        };

        window.eval(loadingFactsScript);
        window.loadingFactsFeature.ui = 'old';
        await expect(window.loadingFactsFeature.initialize()).resolves.toBeUndefined();
        expect(window.loadingFactsFeature.isEnabled).toBe(true);
        expect(window.loadingFactsFeature.settingsLoaded).toBe(true);
        dom.window.close();
    });

    test('keeps one fact visible while campaign loading replaces spinner elements', async () => {
        const dom = new JSDOM('<!doctype html><html><body><div class="mo-spinner"></div></body></html>', {
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP123&route=online',
            runScripts: 'outside-only'
        });
        const { window } = dom;
        const { document } = window;
        let activeSpinner = document.querySelector('.mo-spinner');
        const scheduledTimers = [];
        let nextTimerId = 1;
        let intersectionCallback;

        const makeVisible = (spinner, left) => {
            spinner.getBoundingClientRect = () => ({
                left, top: 200, width: 40, height: 40, right: left + 40, bottom: 240
            });
            return spinner;
        };
        makeVisible(activeSpinner, 100);
        window.setTimeout = (callback, delay) => {
            const id = nextTimerId++;
            scheduledTimers.push({ id, callback, delay });
            return id;
        };
        window.clearTimeout = id => {
            const index = scheduledTimers.findIndex(timer => timer.id === id);
            if (index !== -1) scheduledTimers.splice(index, 1);
        };
        window.requestAnimationFrame = callback => callback();
        const observe = jest.fn();
        window.IntersectionObserver = jest.fn(function(callback) {
            intersectionCallback = callback;
            return { observe, disconnect: jest.fn() };
        });
        window.utils = {
            queryShadowDom: jest.fn(() => null),
            isElementVisible: jest.fn(element => element === activeSpinner && element.isConnected),
            findVisibleLoadingSpinners: jest.fn(() => activeSpinner?.isConnected ? [activeSpinner] : [])
        };
        window.chrome = {
            storage: {
                sync: { get: jest.fn((_keys, callback) => callback({ loadingFactsEnabled: true, loadingFactsUI: 'old' })) },
                local: { get: jest.fn((_keys, callback) => callback({ legacyStats: { totalLoadingTime: 1 } })) },
                onChanged: { addListener: jest.fn() }
            }
        };

        window.eval(loadingFactsScript);
        window.loadingFactsFeature.ui = 'old';
        await window.loadingFactsFeature.initialize();
        runScheduledTimer(scheduledTimers, 200);
        intersectionCallback([{ target: activeSpinner, isIntersecting: true }]);
        await Promise.resolve();
        await Promise.resolve();

        const originalToast = document.getElementById('ops-toolshed-loading-toast');
        expect(originalToast).not.toBeNull();

        activeSpinner.remove();
        intersectionCallback([{ target: activeSpinner, isIntersecting: false }]);
        expect(originalToast.classList).not.toContain('slide-down');
        activeSpinner = null;
        window.loadingFactsFeature.checkForLoading();
        runScheduledTimer(scheduledTimers, 200);

        expect(originalToast.classList).not.toContain('slide-down');

        activeSpinner = makeVisible(document.createElement('mo-spinner'), 300);
        document.body.appendChild(activeSpinner);
        window.loadingFactsFeature.checkForLoading();
        runScheduledTimer(scheduledTimers, 200);
        intersectionCallback([{ target: activeSpinner, isIntersecting: true }]);

        expect(document.getElementById('ops-toolshed-loading-toast')).toBe(originalToast);
        expect(originalToast.classList).not.toContain('slide-down');
        expect(originalToast.style.left).toBe('320px');

        activeSpinner.remove();
        activeSpinner = null;
        window.loadingFactsFeature.checkForLoading();
        runScheduledTimer(scheduledTimers, 200);
        expect(scheduledTimers.some(timer => timer.delay === 2500)).toBe(true);

        activeSpinner = makeVisible(document.createElement('mo-spinner'), 500);
        document.body.appendChild(activeSpinner);
        window.loadingFactsFeature.checkForLoading();
        runScheduledTimer(scheduledTimers, 200);
        intersectionCallback([{ target: activeSpinner, isIntersecting: true }]);

        expect(document.getElementById('ops-toolshed-loading-toast')).toBe(originalToast);
        expect(originalToast.classList).not.toContain('slide-down');
        expect(originalToast.style.left).toBe('520px');

        const completedGrid = document.createElement('div');
        completedGrid.className = 'ht_master';
        completedGrid.innerHTML = `
            <table class="htCore mediaocean worksheet">
                <tbody><tr><td id="placementName-0">Media total</td></tr></tbody>
            </table>
        `;
        document.body.appendChild(completedGrid);
        activeSpinner.remove();
        activeSpinner = null;
        window.loadingFactsFeature.checkForLoading();
        runScheduledTimer(scheduledTimers, 200);
        expect(originalToast.classList).not.toContain('slide-down');
        expect(scheduledTimers.some(timer => timer.delay === 2500)).toBe(true);
        runScheduledTimer(scheduledTimers, 2500);
        expect(originalToast.classList).toContain('slide-down');
        runScheduledTimer(scheduledTimers, 500);

        expect(document.getElementById('ops-toolshed-loading-toast')).toBeNull();
        dom.window.close();
    });

    test('ignores loading spinners inside a mo-side-panel shadow tree', async () => {
        const dom = new JSDOM('<!doctype html><html><body><mo-side-panel></mo-side-panel></body></html>', {
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP123&route=online',
            runScripts: 'outside-only'
        });
        const { window } = dom;
        const panel = window.document.querySelector('mo-side-panel');
        const spinner = panel.attachShadow({ mode: 'open' }).appendChild(window.document.createElement('mo-spinner'));
        const scheduledTimers = [];
        spinner.getBoundingClientRect = () => ({ left: 0, top: 0, width: 40, height: 40, right: 40, bottom: 40 });
        window.setTimeout = (callback, delay) => {
            scheduledTimers.push({ callback, delay });
            return scheduledTimers.length;
        };
        window.clearTimeout = jest.fn();
        const observe = jest.fn();
        window.IntersectionObserver = jest.fn(() => ({ observe, disconnect: jest.fn() }));
        window.utils = {
            queryShadowDom: jest.fn(() => null),
            isElementVisible: jest.fn(() => true),
            findVisibleLoadingSpinners: jest.fn(() => [spinner])
        };
        window.chrome = {
            storage: {
                sync: { get: jest.fn((_keys, callback) => callback({ loadingFactsEnabled: true, loadingFactsUI: 'old' })) },
                local: { get: jest.fn((_keys, callback) => callback({ legacyStats: { totalLoadingTime: 1 } })) },
                onChanged: { addListener: jest.fn() }
            }
        };

        window.eval(loadingFactsScript);
        window.loadingFactsFeature.ui = 'old';
        await window.loadingFactsFeature.initialize();
        runScheduledTimer(scheduledTimers, 200);

        expect(observe).not.toHaveBeenCalled();
        expect(window.document.getElementById('ops-toolshed-loading-toast')).toBeNull();
        dom.window.close();
    });

    test('ignores the class-based workflow panel busy icon', async () => {
        const dom = new JSDOM('<!doctype html><html><body><div class="mo-workflow-panel"><div class="mo-side-panel"><div id="vp-block"><i id="vp-busy-icon" class="fa fa-circle-o-notch fa-spin"></i></div></div></div></body></html>', {
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP123&route=online',
            runScripts: 'outside-only'
        });
        const { window } = dom;
        const spinner = window.document.getElementById('vp-busy-icon');
        const scheduledTimers = [];
        spinner.getBoundingClientRect = () => ({ left: 0, top: 0, width: 40, height: 40, right: 40, bottom: 40 });
        window.setTimeout = (callback, delay) => {
            scheduledTimers.push({ callback, delay });
            return scheduledTimers.length;
        };
        window.clearTimeout = jest.fn();
        const observe = jest.fn();
        window.IntersectionObserver = jest.fn(() => ({ observe, disconnect: jest.fn() }));
        window.utils = {
            queryShadowDom: jest.fn(() => null),
            isElementVisible: jest.fn(() => true),
            findVisibleLoadingSpinners: jest.fn(() => [spinner])
        };
        window.chrome = {
            storage: {
                sync: { get: jest.fn((_keys, callback) => callback({ loadingFactsEnabled: true, loadingFactsUI: 'old' })) },
                local: { get: jest.fn((_keys, callback) => callback({ legacyStats: { totalLoadingTime: 1 } })) },
                onChanged: { addListener: jest.fn() }
            }
        };

        window.eval(loadingFactsScript);
        window.loadingFactsFeature.ui = 'old';
        await window.loadingFactsFeature.initialize();
        runScheduledTimer(scheduledTimers, 200);

        expect(observe).not.toHaveBeenCalled();
        expect(window.document.getElementById('ops-toolshed-loading-toast')).toBeNull();
        dom.window.close();
    });

    test('shows a fact for a visible spinner and removes it after loading finishes', async () => {
        const dom = new JSDOM('<!doctype html><html><body><div class="mo-spinner"></div></body></html>', {
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/',
            runScripts: 'outside-only'
        });
        const { window } = dom;
        const { document } = window;
        const spinner = document.querySelector('.mo-spinner');
        const scheduledTimers = [];
        let intersectionCallback;

        spinner.getBoundingClientRect = () => ({
            left: 100,
            top: 200,
            width: 40,
            height: 40,
            right: 140,
            bottom: 240
        });
        window.setTimeout = (callback, delay) => {
            scheduledTimers.push({ callback, delay });
            return scheduledTimers.length;
        };
        window.clearTimeout = jest.fn();
        window.requestAnimationFrame = callback => callback();
        window.IntersectionObserver = jest.fn(function(callback) {
            intersectionCallback = callback;
            return {
                observe: jest.fn(),
                disconnect: jest.fn()
            };
        });
        window.utils = {
            queryShadowDom: jest.fn(() => null),
            isElementVisible: jest.fn(element => element === spinner && element.isConnected),
            findVisibleLoadingSpinners: jest.fn(() => spinner.isConnected ? [spinner] : [])
        };
        window.chrome = {
            storage: {
                sync: {
                    get: jest.fn((keys, callback) => callback({ loadingFactsEnabled: true, loadingFactsUI: 'old' }))
                },
                local: {
                    get: jest.fn((keys, callback) => callback({
                        legacyStats: { totalLoadingTime: 3600 },
                        dailyStats: { '2026-07-16': { loadingTime: 65 } }
                    }))
                },
                onChanged: { addListener: jest.fn() }
            }
        };

        window.eval(loadingFactsScript);
        window.loadingFactsFeature.ui = 'old';
        await window.loadingFactsFeature.initialize();
        runScheduledTimer(scheduledTimers, 200);
        intersectionCallback([{ target: spinner, isIntersecting: true }]);
        await Promise.resolve();
        await Promise.resolve();

        const toast = document.getElementById('ops-toolshed-loading-toast');
        expect(toast).not.toBeNull();
        expect(toast.textContent).toContain('Did you know?');
        expect(toast.style.left).toBe('120px');
        expect(toast.querySelector('.loading-fact-action--not-sure')).not.toBeNull();
        expect(toast.querySelector('.loading-fact-action--remove')).not.toBeNull();

        spinner.remove();
        window.loadingFactsFeature.checkForLoading();
        runScheduledTimer(scheduledTimers, 200);
        runScheduledTimer(scheduledTimers, 500);

        expect(document.getElementById('ops-toolshed-loading-toast')).toBeNull();
        dom.window.close();
    });

    test('uses migrated legacy and daily loading totals in time-based facts', async () => {
        const dom = new JSDOM('<!doctype html><html><body></body></html>', {
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/',
            runScripts: 'outside-only'
        });
        const { window } = dom;
        window.Math.random = () => 0.999;
        window.utils = {
            queryShadowDom: jest.fn(() => null),
            isElementVisible: jest.fn(() => false),
            findVisibleLoadingSpinners: jest.fn(() => [])
        };
        window.IntersectionObserver = jest.fn(() => ({ observe: jest.fn(), disconnect: jest.fn() }));
        window.chrome = {
            storage: {
                sync: { get: jest.fn((_keys, callback) => callback({ loadingFactsEnabled: true, loadingFactsUI: 'old' })) },
                local: {
                    get: jest.fn((_keys, callback) => callback({
                        legacyStats: { totalLoadingTime: 3600 },
                        dailyStats: {
                            '2026-07-15': { loadingTime: 5 },
                            '2026-07-16': { loadingTime: 60 }
                        }
                    }))
                },
                onChanged: { addListener: jest.fn() }
            }
        };

        window.eval(loadingFactsScript);
        window.loadingFactsFeature.ui = 'old';
        await window.loadingFactsFeature.initialize();
        await expect(window.loadingFactsFeature.getProcessedFact())
            .resolves.toContain('1h 1m 5s');
        dom.window.close();
    });

    test('avoids facts shown recently and records the newly selected fact', async () => {
        const dom = new JSDOM('<!doctype html><html><body></body></html>', {
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/',
            runScripts: 'outside-only'
        });
        const { window } = dom;
        const firstFact = 'The average person spends 6 months of their life waiting in queues';
        const secondFact = 'The longest traffic jam in history lasted 12 days in Beijing (2010)';
        const stored = { loadingFactHistory: [firstFact] };
        window.Math.random = () => 0;
        window.utils = {
            queryShadowDom: jest.fn(() => null),
            isElementVisible: jest.fn(() => false),
            findVisibleLoadingSpinners: jest.fn(() => [])
        };
        window.IntersectionObserver = jest.fn(() => ({ observe: jest.fn(), disconnect: jest.fn() }));
        window.chrome = {
            storage: {
                sync: { get: jest.fn((_keys, callback) => callback({ loadingFactsEnabled: true, loadingFactsUI: 'old' })) },
                local: {
                    get: jest.fn((_keys, callback) => callback(stored)),
                    set: jest.fn(update => Object.assign(stored, update))
                },
                onChanged: { addListener: jest.fn() }
            }
        };

        window.eval(loadingFactsScript);
        window.loadingFactsFeature.ui = 'old';
        const feature = window.loadingFactsFeature;

        await expect(feature.getProcessedFact()).resolves.toBe(secondFact);
        expect(stored.loadingFactHistory).toEqual([secondFact, firstFact]);
        dom.window.close();
    });

    test('shows a fact for a wide Actualise loader without a Shadow Root', async () => {
        const dom = new JSDOM('<!doctype html><html><body><mo-spinner></mo-spinner></body></html>', {
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#ptb-ctx=actualize&route=actualize',
            runScripts: 'outside-only'
        });
        const { window } = dom;
        const spinner = window.document.querySelector('mo-spinner');
        Object.defineProperty(spinner, 'offsetWidth', { value: 500 });
        spinner.getBoundingClientRect = () => ({
            left: 0, top: 0, width: 500, height: 300, right: 500, bottom: 300
        });
        window.utils = {
            queryShadowDom: jest.fn((_selector, root) => {
                if (!root) throw new TypeError('Cannot read properties of null');
                return null;
            }),
            isElementVisible: jest.fn(() => true),
            findVisibleLoadingSpinners: jest.fn(() => [spinner])
        };
        window.IntersectionObserver = jest.fn(() => ({ observe: jest.fn(), disconnect: jest.fn() }));
        window.chrome = {
            storage: {
                sync: { get: jest.fn((_keys, callback) => callback({ loadingFactsEnabled: true, loadingFactsUI: 'old' })) },
                local: { get: jest.fn((_keys, callback) => callback({ legacyStats: { totalLoadingTime: 1 } })) },
                onChanged: { addListener: jest.fn() }
            }
        };

        window.eval(loadingFactsScript);
        window.loadingFactsFeature.ui = 'old';
        const feature = window.loadingFactsFeature;
        feature.isEnabled = true;
        feature.isIntersecting = true;
        feature.observedSpinner = spinner;

        await expect(feature.showToast(spinner)).resolves.toBeUndefined();
        expect(window.document.getElementById('ops-toolshed-loading-toast')).not.toBeNull();
        expect(window.utils.queryShadowDom).not.toHaveBeenCalled();
        dom.window.close();
    });

    test('records not-sure and remove ratings, then excludes removed facts from the rotation', async () => {
        const dom = new JSDOM('<!doctype html><html><body></body></html>', {
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/',
            runScripts: 'outside-only'
        });
        const { window } = dom;
        const stored = { loadingFactRatings: {} };
        window.utils = { queryShadowDom: jest.fn(), isElementVisible: jest.fn(), findVisibleLoadingSpinners: jest.fn(() => []) };
        window.IntersectionObserver = jest.fn(() => ({ observe: jest.fn(), disconnect: jest.fn() }));
        window.chrome = {
            storage: {
                sync: { get: jest.fn((_keys, callback) => callback({ loadingFactsEnabled: true, loadingFactsUI: 'old' })) },
                local: {
                    get: jest.fn((_keys, callback) => callback(stored)),
                    set: jest.fn(update => Object.assign(stored, update))
                },
                onChanged: { addListener: jest.fn() }
            }
        };

        window.eval(loadingFactsScript);
        window.loadingFactsFeature.ui = 'old';
        const feature = window.loadingFactsFeature;
        const fact = window.LOADING_FACTS[0];

        await feature.rateFact(fact, 'notSure');
        expect(stored.loadingFactRatings[fact]).toBe('notSure');

        await feature.rateFact(fact, 'remove');
        expect(stored.loadingFactRatings[fact]).toBe('remove');

        await expect(feature.getProcessedFact()).resolves.not.toBe(fact);
        dom.window.close();
    });

    test('holds a toast while hovered, then dismisses it two seconds after pointer leave', () => {
        const dom = new JSDOM('<!doctype html><html><body></body></html>', {
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/',
            runScripts: 'outside-only'
        });
        const { window } = dom;
        const scheduledTimers = [];
        window.setTimeout = (callback, delay) => {
            scheduledTimers.push({ callback, delay });
            return scheduledTimers.length;
        };
        window.clearTimeout = jest.fn();
        window.IntersectionObserver = jest.fn(() => ({ observe: jest.fn(), disconnect: jest.fn() }));
        window.chrome = {
            storage: {
                sync: { get: jest.fn() },
                local: { get: jest.fn() },
                onChanged: { addListener: jest.fn() }
            }
        };

        window.eval(loadingFactsScript);
        window.loadingFactsFeature.ui = 'old';
        const feature = window.loadingFactsFeature;
        const toast = window.document.createElement('div');
        toast.id = feature.toastId;
        toast.className = 'loading-fact-toast slide-up';
        window.document.body.appendChild(toast);
        feature.isVisible = true;
        toast.addEventListener('pointerenter', () => { feature.isToastHovered = true; });
        toast.addEventListener('pointerleave', () => {
            feature.isToastHovered = false;
            if (feature.pendingToastHide) {
                feature.hoverExitTimer = window.setTimeout(() => feature.hideToast(), 2000);
            }
        });

        toast.dispatchEvent(new window.Event('pointerenter'));
        feature.hideToast();
        expect(toast.classList).not.toContain('slide-down');
        expect(feature.pendingToastHide).toBe(true);

        toast.dispatchEvent(new window.Event('pointerleave'));
        runScheduledTimer(scheduledTimers, 2000);
        expect(toast.classList).toContain('slide-down');
        dom.window.close();
    });
});


test('new loading UI defaults on, delays appearance, and cancels short loads', async () => {
    const dom = new JSDOM('<span id="spinner"></span>', { runScripts: 'outside-only' });
    const w = dom.window;
    try {
        const timers = new Map(); let id = 0;
        w.setTimeout = (fn, delay) => { timers.set(++id, {fn, delay}); return id; };
        w.clearTimeout = key => timers.delete(key);
        w.requestAnimationFrame = fn => fn();
        w.utils = { isElementVisible: () => true };
        w.eval(loadingFactsScript);
        const f = w.loadingFactsFeature, spinner = w.document.getElementById('spinner');
        spinner.getBoundingClientRect = () => ({left: 400, bottom: 250, width: 20, height: 20});
        f.observedSpinner = spinner; f.isIntersecting = true;
        expect(f.ui).toBe('new');
        await f.showToast(spinner);
        expect(w.document.getElementById(f.toastId)).toBeNull();
        expect([...timers.values()].some(t => t.delay === 750)).toBe(true);
        f.handleNoVisibleSpinner();
        expect(timers.size).toBe(0);
        await f.showToast(spinner);
        const timer = [...timers.values()].find(t => t.delay === 750);
        timer.fn();
        for(let i=0;i<8;i++) await Promise.resolve();
        const toast = w.document.getElementById(f.toastId);
        expect(toast.classList.contains('loading-fact-toast--new')).toBe(true);
        expect(toast.style.top).toBe('');
        expect(toast.style.bottom).toBe('');
        expect(toast.querySelector('summary').getAttribute('aria-label')).toBe('Loading fact options');
        expect(toast.querySelector('details').textContent).toContain('Flag for review');
        f.hideToast({force:true});
    } finally { w.close(); }
});

test.each(['new', 'old'])('%s UI keeps the same fact through homepage spinner and skeleton handoff', async ui => {
    const dom = new JSDOM('<body><mo-spinner></mo-spinner></body>', {runScripts:'outside-only',url:'https://go.mediaocean.com/campaign-management/#route=campaigns'});
    const w=dom.window;
    try {
        let id=0;const timers=new Map();
        w.setTimeout=(fn,delay)=>{timers.set(++id,{fn,delay});return id;};
        w.clearTimeout=key=>timers.delete(key);
        const run=delay=>{const entry=[...timers].find(([,t])=>t.delay===delay);expect(entry).toBeDefined();timers.delete(entry[0]);entry[1].fn();};
        w.requestAnimationFrame=fn=>fn();
        w.utils={isElementVisible:e=>Boolean(e?.isConnected)};
        let state={pageVisibleSpinners:[],pageVisibleSkeletons:[],visibleSpinners:[],sidePanelVisibleSpinners:[]};
        w.loadingMonitor={getState:()=>state};
        w.eval(loadingFactsScript);
        const f=w.loadingFactsFeature;f.ui=ui;f.settingsLoaded=true;
        f.intersectionObserver={disconnect:()=>{},observe:()=>{}};
        const spinner=w.document.querySelector('mo-spinner');
        spinner.getBoundingClientRect=()=>({left:500,width:24,height:24});
        f.observedSpinner=spinner;f.isIntersecting=true;
        await f.showToast(spinner,true);
        const original=w.document.getElementById(f.toastId);
        const copy=original.textContent;
        spinner.remove();f.observedSpinner=null;f.isIntersecting=false;
        f.handleNoVisibleSpinner();
        expect(original.classList.contains('slide-down')).toBe(false);
        const skeleton=w.document.createElement('mo-skeleton');skeleton.className='mo-grid-skeleton';
        skeleton.getBoundingClientRect=()=>({left:220,width:1000,height:500});
        w.document.body.append(skeleton);
        state={...state,pageVisibleSkeletons:[skeleton]};
        f.checkForLoading(state);run(200);
        expect(w.document.getElementById(f.toastId)).toBe(original);
        expect(original.textContent).toBe(copy);
        expect(original.classList.contains('slide-down')).toBe(false);
        expect([...timers.values()].some(t=>t.delay===800)).toBe(false);
        skeleton.remove();state={...state,pageVisibleSkeletons:[]};
        f.checkForLoading(state);run(200);run(800);
        expect(original.classList.contains('slide-down')).toBe(true);
        run(500);
        expect(w.document.getElementById(f.toastId)).toBeNull();
    } finally {w.close();}
});

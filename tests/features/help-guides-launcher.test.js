const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const featureCode = fs.readFileSync(
    path.resolve(__dirname, '../../features/help-guides-launcher.js'),
    'utf8'
);

describe('Help Guides page launcher', () => {
    function createFeature({
        enabled = true,
        position = null,
        panelInitiallyOpen = false,
        onboardingTourActive = false,
        bannerReady = true,
        url = 'https://groupmuk-prisma.mediaocean.com/campaign-management/'
    } = {}) {
        const listeners = [];
        const bannerMarkup = bannerReady
            ? '<div class="center" id="mo-banner-module-container"></div>'
            : '';
        const dom = new JSDOM(`<!doctype html><html><head></head><body>${bannerMarkup}</body></html>`, {
            runScripts: 'dangerously',
            url
        });
        dom.window.chrome = {
            runtime: {
                sendMessage: jest.fn(({ action }) => Promise.resolve(
                    action === 'getHelpGuidesPanelState'
                        ? { status: 'success', open: panelInitiallyOpen }
                        : { status: 'success', panelState: action === 'openHelpGuides' ? 'open' : 'closed' }
                ))
            },
            storage: {
                sync: {
                    get: jest.fn((defaults, callback) => callback({ ...defaults, helpGuidesEnabled: enabled }))
                },
                local: {
                    get: jest.fn((defaults, callback) => callback({ ...defaults, helpGuidesLauncherPosition: position, onboardingTourActive })),
                    set: jest.fn((values, callback) => callback?.())
                },
                onChanged: {
                    addListener: jest.fn(listener => listeners.push(listener))
                }
            }
        };
        dom.window.eval(featureCode);
        return { dom, listeners };
    }

    test('waits for the Mediaocean banner before showing the launcher', async () => {
        const { dom } = createFeature({ bannerReady: false });
        const { window } = dom;

        window.helpGuidesLauncherFeature.initialize();
        expect(window.helpGuidesLauncherFeature.isBannerReady()).toBe(false);
        expect(window.document.getElementById('toolshed-help-guides-launcher')).toBeNull();

        const banner = window.document.createElement('div');
        banner.id = 'mo-banner-module-container';
        banner.className = 'center';
        window.document.body.appendChild(banner);
        await new Promise(resolve => window.setTimeout(resolve, 0));

        expect(window.helpGuidesLauncherFeature.isBannerReady()).toBe(true);
        expect(window.document.getElementById('toolshed-help-guides-launcher')).not.toBeNull();
        dom.window.close();
    });

    test('recognises the current mo-banner shell as ready', async () => {
        const { dom } = createFeature({ bannerReady: false });
        const { window } = dom;

        window.helpGuidesLauncherFeature.initialize();
        expect(window.document.getElementById('toolshed-help-guides-launcher')).toBeNull();

        window.document.body.appendChild(window.document.createElement('mo-banner'));
        await new Promise(resolve => window.setTimeout(resolve, 0));

        expect(window.helpGuidesLauncherFeature.isBannerReady()).toBe(true);
        expect(window.document.getElementById('toolshed-help-guides-launcher')).not.toBeNull();
        dom.window.close();
    });

    test('adds one accessible translucent launcher and opens the side panel on click', () => {
        const { dom } = createFeature();
        const { window } = dom;

        window.helpGuidesLauncherFeature.initialize();
        window.helpGuidesLauncherFeature.ensureLauncher();
        const buttons = window.document.querySelectorAll('#toolshed-help-guides-launcher');

        expect(buttons).toHaveLength(1);
        expect(buttons[0].getAttribute('aria-label')).toBe('Open Help Guides');
        expect(buttons[0].querySelector('.toolshed-help-guides-icon svg')).not.toBeNull();
        const launcherStyles = window.document.getElementById('toolshed-help-guides-launcher-styles').textContent;
        expect(launcherStyles).toContain('min-height: 44px');
        expect(launcherStyles).toContain('rgba(6, 8, 141, 0.8)');
        expect(launcherStyles).toContain('backdrop-filter: none');
        expect(launcherStyles).toContain('touch-action: none');
        expect(launcherStyles).toContain('transition: none');
        expect(launcherStyles).toContain('white-space: nowrap');
        expect(launcherStyles).not.toContain('#ff4087');
        expect(launcherStyles).toContain('"Outfit"');
        buttons[0].click();
        expect(window.chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'openHelpGuides' });
        dom.window.close();
    });

    test('does not show the launcher inside an ideskos viewport URL', () => {
        const { dom } = createFeature({
            url: 'https://groupmuk-prisma.mediaocean.com/ideskos-viewport/campaign-management/'
        });

        dom.window.helpGuidesLauncherFeature.initialize();
        dom.window.helpGuidesLauncherFeature.ensureLauncher();

        expect(dom.window.helpGuidesLauncherFeature.isLauncherExcluded()).toBe(true);
        expect(dom.window.document.getElementById('toolshed-help-guides-launcher')).toBeNull();
        dom.window.close();
    });

    test('uses a second launcher click to close the open side panel', async () => {
        const { dom } = createFeature();
        const { window } = dom;
        window.helpGuidesLauncherFeature.initialize();
        const launcher = window.document.getElementById('toolshed-help-guides-launcher');

        launcher.click();
        await Promise.resolve();
        expect(window.helpGuidesLauncherFeature.isPanelOpen()).toBe(true);

        launcher.click();
        await Promise.resolve();
        expect(window.chrome.runtime.sendMessage).toHaveBeenLastCalledWith({ action: 'closeHelpGuidesFromLauncher' });
        expect(window.helpGuidesLauncherFeature.isPanelOpen()).toBe(false);
        dom.window.close();
    });

    test('does not replace the onboarding panel when the tour is active', () => {
        const { dom } = createFeature({ onboardingTourActive: true });
        const { window } = dom;
        window.helpGuidesLauncherFeature.initialize();
        window.chrome.runtime.sendMessage.mockClear();

        window.document.getElementById('toolshed-help-guides-launcher').click();

        expect(window.chrome.runtime.sendMessage).not.toHaveBeenCalled();
        dom.window.close();
    });

    test('restores panel state after a page reload so the next click closes it', async () => {
        const { dom } = createFeature({ panelInitiallyOpen: true });
        const { window } = dom;
        window.helpGuidesLauncherFeature.initialize();
        await Promise.resolve();

        window.document.getElementById('toolshed-help-guides-launcher').click();
        await Promise.resolve();

        expect(window.chrome.runtime.sendMessage).toHaveBeenLastCalledWith({ action: 'closeHelpGuidesFromLauncher' });
        expect(window.helpGuidesLauncherFeature.isPanelOpen()).toBe(false);
        dom.window.close();
    });

    test.each([
        ['left', { left: 18, top: 300 }, 'left', value => value < 0],
        ['right', { left: 982, top: 300 }, 'left', value => value > 1000],
        ['top', { left: 400, top: 18 }, 'top', value => value < 0],
        ['bottom', { left: 400, top: 680 }, 'top', value => value > 700]
    ])('enters from the saved nearest %s edge', (edge, position, property, isOutside) => {
        const { dom } = createFeature({ position });
        const { window } = dom;
        const frames = [];
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 });
        window.requestAnimationFrame = callback => frames.push(callback);

        window.helpGuidesLauncherFeature.initialize();
        const launcher = window.document.getElementById('toolshed-help-guides-launcher');
        expect(isOutside(parseFloat(launcher.style[property]))).toBe(true);

        frames.shift()();
        frames.shift()();
        expect(launcher.style.left).toBe(position.left > 982 ? '982px' : `${position.left}px`);
        expect(launcher.style.top).toBe(position.top > 682 ? '682px' : `${position.top}px`);
        dom.window.close();
    });

    test('does not render when disabled and responds to the synced setting', () => {
        const { dom, listeners } = createFeature({ enabled: false });
        const { window } = dom;

        window.helpGuidesLauncherFeature.initialize();
        expect(window.document.getElementById('toolshed-help-guides-launcher')).toBeNull();

        listeners[0]({ helpGuidesEnabled: { oldValue: false, newValue: true } }, 'sync');
        expect(window.document.getElementById('toolshed-help-guides-launcher')).not.toBeNull();

        listeners[0]({ helpGuidesEnabled: { oldValue: true, newValue: false } }, 'sync');
        expect(window.document.getElementById('toolshed-help-guides-launcher')).toBeNull();
        dom.window.close();
    });

    test('restores a persisted snapped position', () => {
        const { dom } = createFeature({ position: { left: 24, top: 28 } });
        dom.window.helpGuidesLauncherFeature.initialize();
        const launcher = dom.window.document.getElementById('toolshed-help-guides-launcher');

        expect(launcher.style.left).toBe('24px');
        expect(launcher.style.top).toBe('28px');
        expect(launcher.style.right).toBe('auto');
        expect(launcher.style.bottom).toBe('auto');
        dom.window.close();
    });

    test('temporarily clamps on viewport resize and returns to its saved position', () => {
        const { dom } = createFeature({ position: { left: 900, top: 200 } });
        const { window } = dom;
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
        window.helpGuidesLauncherFeature.initialize();
        const launcher = window.document.getElementById('toolshed-help-guides-launcher');

        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 700 });
        window.dispatchEvent(new window.Event('resize'));
        expect(parseFloat(launcher.style.left)).toBeLessThan(900);

        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
        window.dispatchEvent(new window.Event('resize'));
        expect(launcher.style.left).toBe('900px');
        dom.window.close();
    });

    test('keeps a bottom-right launcher anchored when the viewport grows', () => {
        const { dom } = createFeature({ position: { left: 842, top: 638 } });
        const { window } = dom;
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 });
        Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', {
            configurable: true,
            get() { return this.id === 'toolshed-help-guides-launcher' ? 140 : 0; }
        });
        Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', {
            configurable: true,
            get() { return this.id === 'toolshed-help-guides-launcher' ? 44 : 0; }
        });
        window.helpGuidesLauncherFeature.initialize();
        const launcher = window.document.getElementById('toolshed-help-guides-launcher');

        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
        window.dispatchEvent(new window.Event('resize'));

        expect(launcher.style.left).toBe('1442px');
        expect(launcher.style.top).toBe('838px');
        dom.window.close();
    });

    test.each([
        [
            'bottom-left',
            {
                left: 18,
                top: 638,
                horizontalAnchor: 'left',
                verticalAnchor: 'bottom',
                horizontalRatio: 0,
                verticalRatio: 1
            },
            '18px'
        ],
        [
            'bottom-right',
            {
                left: 842,
                top: 638,
                horizontalAnchor: 'right',
                verticalAnchor: 'bottom',
                horizontalRatio: 1,
                verticalRatio: 1
            },
            '1442px'
        ]
    ])('restores a stored %s anchor against a larger startup viewport', (_label, position, expectedLeft) => {
        const { dom } = createFeature({ position });
        const { window } = dom;
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
        Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', {
            configurable: true,
            get() { return this.id === 'toolshed-help-guides-launcher' ? 140 : 0; }
        });
        Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', {
            configurable: true,
            get() { return this.id === 'toolshed-help-guides-launcher' ? 44 : 0; }
        });

        window.helpGuidesLauncherFeature.initialize();
        const launcher = window.document.getElementById('toolshed-help-guides-launcher');

        expect(launcher.style.left).toBe(expectedLeft);
        expect(launcher.style.top).toBe('838px');
        dom.window.close();
    });

    test('keeps a middle-page launcher at the same relative viewport position', () => {
        const { dom } = createFeature({ position: { left: 430, top: 328 } });
        const { window } = dom;
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 });
        Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', {
            configurable: true,
            get() { return this.id === 'toolshed-help-guides-launcher' ? 140 : 0; }
        });
        Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', {
            configurable: true,
            get() { return this.id === 'toolshed-help-guides-launcher' ? 44 : 0; }
        });
        window.helpGuidesLauncherFeature.initialize();
        const launcher = window.document.getElementById('toolshed-help-guides-launcher');

        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
        window.dispatchEvent(new window.Event('resize'));

        expect(launcher.style.left).toBe('730px');
        expect(launcher.style.top).toBe('428px');
        dom.window.close();
    });

    test('temporarily shifts left of a live-chat launcher and returns when it disappears', () => {
        const { dom } = createFeature({ position: { left: 840, top: 638 } });
        const { window } = dom;
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 });
        Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', {
            configurable: true,
            get() { return this.id === 'toolshed-help-guides-launcher' ? 140 : 0; }
        });
        Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', {
            configurable: true,
            get() { return this.id === 'toolshed-help-guides-launcher' ? 44 : 0; }
        });
        window.helpGuidesLauncherFeature.initialize();
        const launcher = window.document.getElementById('toolshed-help-guides-launcher');

        const chatLauncher = window.document.createElement('iframe');
        chatLauncher.id = 'launcher';
        chatLauncher.getBoundingClientRect = () => ({
            left: 850, top: 620, right: 918, bottom: 688, width: 68, height: 68
        });
        window.document.body.appendChild(chatLauncher);

        window.helpGuidesLauncherFeature.reconcileLauncherPosition(launcher);
        expect(launcher.style.left).toBe('696px');
        expect(launcher.classList).toContain('is-avoiding-control');

        window.helpGuidesLauncherFeature.reconcileLauncherPosition(launcher);
        expect(launcher.style.left).toBe('696px');
        expect(launcher.classList).toContain('is-avoiding-control');

        chatLauncher.remove();
        window.helpGuidesLauncherFeature.reconcileLauncherPosition(launcher);
        expect(launcher.style.left).toBe('840px');
        expect(launcher.classList).not.toContain('is-avoiding-control');
        dom.window.close();
    });

    test('only snaps when released near an edge, allowing a middle-page resting position', () => {
        const { dom } = createFeature();
        const { window } = dom;
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 });
        window.helpGuidesLauncherFeature.initialize();
        const launcher = window.document.getElementById('toolshed-help-guides-launcher');
        Object.defineProperty(launcher, 'offsetWidth', { configurable: true, value: 140 });
        Object.defineProperty(launcher, 'offsetHeight', { configurable: true, value: 44 });
        launcher.getBoundingClientRect = () => ({ left: 400, top: 300 });

        window.helpGuidesLauncherFeature.snapToEdge(launcher);
        expect(launcher.style.left).toBe('400px');
        expect(launcher.style.top).toBe('300px');
        dom.window.close();
    });

    test('elastically resists a small pull from an edge before breaking free', () => {
        const { dom } = createFeature();
        const { window } = dom;
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
        Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 });
        window.helpGuidesLauncherFeature.initialize();
        const launcher = window.document.getElementById('toolshed-help-guides-launcher');
        launcher.getBoundingClientRect = () => ({ left: 18, right: 158, top: 300, bottom: 344 });

        const pointerEvent = (type, values) => {
            const event = new window.Event(type, { bubbles: true, cancelable: true });
            Object.entries(values).forEach(([key, value]) => Object.defineProperty(event, key, { value }));
            launcher.dispatchEvent(event);
        };

        pointerEvent('pointerdown', { button: 0, pointerId: 1, clientX: 80, clientY: 320 });
        pointerEvent('pointermove', { pointerId: 1, clientX: 100, clientY: 320 });
        expect(parseFloat(launcher.style.left)).toBeCloseTo(21.6, 1);
        expect(launcher.classList).toContain('is-resisting');
        expect(launcher.classList).not.toContain('is-dragging');

        pointerEvent('pointermove', { pointerId: 1, clientX: 140, clientY: 320 });
        expect(parseFloat(launcher.style.left)).toBeGreaterThan(45);
        expect(launcher.classList).toContain('is-dragging');
        pointerEvent('pointercancel', { pointerId: 1 });
        dom.window.close();
    });
});

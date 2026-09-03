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

    test('adds one accessible translucent launcher and opens the side panel on click', async () => {
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
        expect(launcherStyles).toContain('right 180ms ease');
        expect(launcherStyles).toContain('width 180ms ease');
        expect(launcherStyles).toContain('white-space: nowrap');
        expect(launcherStyles).not.toContain('#ff4087');
        expect(launcherStyles).toContain('"Outfit"');
        await Promise.resolve();
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

        await Promise.resolve();
        launcher.click();
        await Promise.resolve();
        expect(window.helpGuidesLauncherFeature.isPanelOpen()).toBe(true);

        launcher.click();
        await Promise.resolve();
        expect(window.chrome.runtime.sendMessage).toHaveBeenLastCalledWith({ action: 'closeHelpGuidesFromLauncher' });
        expect(window.helpGuidesLauncherFeature.isPanelOpen()).toBe(false);
        dom.window.close();
    });

    test('does not leave the launcher inert when a stale onboarding flag remains', async () => {
        const { dom } = createFeature({ onboardingTourActive: true });
        const { window } = dom;
        window.helpGuidesLauncherFeature.initialize();
        window.chrome.runtime.sendMessage.mockClear();

        await Promise.resolve();
        window.document.getElementById('toolshed-help-guides-launcher').click();
        await Promise.resolve();

        expect(window.chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'openHelpGuides' });
        expect(window.helpGuidesLauncherFeature.isPanelOpen()).toBe(true);
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

    test('does not reopen the sidebar while a launcher close request is still settling', async () => {
        const { dom } = createFeature({ panelInitiallyOpen: true });
        const { window } = dom;
        window.helpGuidesLauncherFeature.initialize();
        await Promise.resolve();
        window.chrome.runtime.sendMessage.mockClear();

        let resolveClose;
        window.chrome.runtime.sendMessage.mockImplementation(({ action }) => {
            if (action === 'closeHelpGuidesFromLauncher') {
                return new Promise(resolve => {
                    resolveClose = resolve;
                });
            }
            return Promise.resolve({ status: 'success', panelState: 'open' });
        });

        const launcher = window.document.getElementById('toolshed-help-guides-launcher');
        launcher.click();
        launcher.click();

        const actions = window.chrome.runtime.sendMessage.mock.calls.map(([message]) => message.action);
        expect(actions).toEqual(['closeHelpGuidesFromLauncher']);

        resolveClose({ status: 'success', panelState: 'closed' });
        await Promise.resolve();
        expect(window.helpGuidesLauncherFeature.isPanelOpen()).toBe(false);
        dom.window.close();
    });

    test('does not expose a stale open action while the initial panel state is pending', async () => {
        const { dom } = createFeature({ panelInitiallyOpen: true });
        const { window } = dom;
        window.helpGuidesLauncherFeature.initialize();
        const launcher = window.document.getElementById('toolshed-help-guides-launcher');

        launcher.click();
        await Promise.resolve();

        expect(window.chrome.runtime.sendMessage).toHaveBeenLastCalledWith({ action: 'getHelpGuidesPanelState' });
        launcher.click();
        expect(window.chrome.runtime.sendMessage).toHaveBeenLastCalledWith({ action: 'closeHelpGuidesFromLauncher' });
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

    test('stacks the persistent chat controls above a bottom-right Help Guides launcher', () => {
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

        const chatFrame = window.document.createElement('iframe');
        chatFrame.id = 'launcher';
        chatFrame.style.position = 'fixed';
        chatFrame.style.inset = 'auto 40px 40px auto';
        chatFrame.style.right = '40px';
        chatFrame.style.bottom = '40px';
        chatFrame.getBoundingClientRect = () => ({
            left: 850, top: 620, right: 918, bottom: 688, width: 68, height: 68
        });
        window.document.body.appendChild(chatFrame);

        const moeWrapper = window.document.createElement('div');
        moeWrapper.id = 'moe-wrapper';
        moeWrapper.getBoundingClientRect = () => ({
            left: 880, top: 630, right: 916, bottom: 666, width: 36, height: 36
        });
        const moeRestore = window.document.createElement('button');
        moeRestore.id = 'moe-restore';
        moeRestore.setAttribute('aria-label', 'Open Moe');
        moeRestore.getBoundingClientRect = () => ({
            left: 866, top: 616, right: 902, bottom: 652, width: 36, height: 36
        });
        moeWrapper.appendChild(moeRestore);
        window.document.body.appendChild(moeWrapper);

        window.helpGuidesLauncherFeature.reconcileLauncherPosition(launcher);

        expect(launcher.style.left).toBe('842px');
        expect(launcher.style.top).toBe('638px');
        expect(launcher.classList).not.toContain('is-avoiding-control');
        expect(chatFrame.style.position).toBe('fixed');
        expect(chatFrame.style.right).toBe('18px');
        expect(chatFrame.style.bottom).toBe('76px');
        expect(chatFrame.classList).toContain('toolshed-help-guides-stacked-chat');
        expect(moeWrapper.style.position).toBe('fixed');
        expect(moeWrapper.style.right).toBe('4px');
        expect(moeWrapper.style.bottom).toBe('62px');
        expect(moeWrapper.classList).toContain('toolshed-help-guides-stacked-chat');
        dom.window.close();
    });

    test('keeps the chat right edge and gap aligned as Moe grows and shrinks', () => {
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

        const moeWrapper = window.document.createElement('div');
        moeWrapper.id = 'moe-wrapper';
        let wrapperRect = { left: 880, top: 630, right: 916, bottom: 666, width: 36, height: 36 };
        moeWrapper.getBoundingClientRect = () => wrapperRect;
        const moeControl = window.document.createElement('button');
        moeControl.id = 'moe-restore';
        moeControl.setAttribute('aria-label', 'Open Moe');
        let controlRect = { left: 866, top: 616, right: 902, bottom: 652, width: 36, height: 36 };
        moeControl.getBoundingClientRect = () => controlRect;
        moeWrapper.appendChild(moeControl);
        window.document.body.appendChild(moeWrapper);

        window.helpGuidesLauncherFeature.reconcileLauncherPosition(launcher);
        expect(moeWrapper.style.right).toBe('4px');
        expect(moeWrapper.style.bottom).toBe('62px');

        moeControl.id = 'launch-moe-btn';
        moeControl.setAttribute('aria-label', 'Connect with Moe');
        wrapperRect = { left: 850, top: 550, right: 914, bottom: 614, width: 64, height: 64 };
        controlRect = { left: 853.2, top: 553.2, right: 910.8, bottom: 610.8, width: 57.6, height: 57.6 };
        window.helpGuidesLauncherFeature.reconcileLauncherPosition(launcher);
        expect(moeWrapper.style.right).toBe('14.8px');
        expect(moeWrapper.style.bottom).toBe('72.8px');
        expect(moeWrapper.classList).toContain('toolshed-help-guides-stacked-chat');

        moeControl.id = 'moe-restore';
        moeControl.setAttribute('aria-label', 'Open Moe');
        wrapperRect = { left: 880, top: 630, right: 916, bottom: 666, width: 36, height: 36 };
        controlRect = { left: 866, top: 616, right: 902, bottom: 652, width: 36, height: 36 };
        window.helpGuidesLauncherFeature.reconcileLauncherPosition(launcher);
        expect(moeWrapper.style.right).toBe('4px');
        expect(moeWrapper.style.bottom).toBe('62px');
        dom.window.close();
    });

    test('keeps chat stacked during transient reload visibility changes', () => {
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
        const chatFrame = window.document.createElement('iframe');
        chatFrame.id = 'launcher';
        chatFrame.style.position = 'fixed';
        chatFrame.style.inset = 'auto 40px 40px auto';
        chatFrame.style.right = '40px';
        chatFrame.style.bottom = '40px';
        chatFrame.getBoundingClientRect = () => ({
            left: 850, top: 620, right: 918, bottom: 688, width: 68, height: 68
        });
        window.document.body.appendChild(chatFrame);

        window.helpGuidesLauncherFeature.reconcileLauncherPosition(launcher);
        expect(chatFrame.style.right).toBe('18px');
        expect(chatFrame.style.bottom).toBe('76px');

        chatFrame.style.opacity = '0';
        window.helpGuidesLauncherFeature.reconcileLauncherPosition(launcher);

        expect(chatFrame.style.position).toBe('fixed');
        expect(chatFrame.style.inset).toBe('auto 18px 76px auto');
        expect(chatFrame.style.right).toBe('18px');
        expect(chatFrame.style.bottom).toBe('76px');
        expect(chatFrame.classList).toContain('toolshed-help-guides-stacked-chat');

        chatFrame.style.opacity = '1';
        window.helpGuidesLauncherFeature.reconcileLauncherPosition(launcher);
        expect(chatFrame.style.right).toBe('18px');
        expect(chatFrame.style.bottom).toBe('76px');
        dom.window.close();
    });

    test('restores native chat positioning when Help Guides leaves the bottom-right corner', () => {
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
        const chatFrame = window.document.createElement('iframe');
        chatFrame.id = 'launcher';
        chatFrame.style.position = 'fixed';
        chatFrame.style.inset = 'auto 40px 40px auto';
        chatFrame.style.right = '40px';
        chatFrame.style.bottom = '40px';
        chatFrame.getBoundingClientRect = () => ({
            left: 850, top: 620, right: 918, bottom: 688, width: 68, height: 68
        });
        window.document.body.appendChild(chatFrame);

        window.helpGuidesLauncherFeature.reconcileLauncherPosition(launcher);
        expect(chatFrame.style.right).toBe('18px');

        launcher.getBoundingClientRect = () => ({ left: 400, top: 300, width: 140, height: 44 });
        window.helpGuidesLauncherFeature.snapToEdge(launcher);
        window.helpGuidesLauncherFeature.reconcileLauncherPosition(launcher);

        expect(chatFrame.style.position).toBe('fixed');
        expect(chatFrame.style.inset).toBe('auto 40px 40px auto');
        expect(chatFrame.style.right).toBe('40px');
        expect(chatFrame.style.bottom).toBe('40px');
        expect(chatFrame.classList).not.toContain('toolshed-help-guides-stacked-chat');
        dom.window.close();
    });

    test('keeps clear of Prisma\'s persistent Moe chat bubble', () => {
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

        const moeWrapper = window.document.createElement('div');
        moeWrapper.id = 'moe-wrapper';
        moeWrapper.getBoundingClientRect = () => ({
            left: 850, top: 620, right: 914, bottom: 684, width: 64, height: 64
        });
        const moeRestore = window.document.createElement('button');
        moeRestore.id = 'moe-restore';
        moeRestore.setAttribute('aria-label', 'Open Moe');
        moeWrapper.appendChild(moeRestore);
        window.document.body.appendChild(moeWrapper);

        window.helpGuidesLauncherFeature.reconcileLauncherPosition(launcher);

        expect(launcher.style.left).toBe('696px');
        expect(launcher.classList).toContain('is-avoiding-control');

        moeWrapper.remove();
        window.helpGuidesLauncherFeature.reconcileLauncherPosition(launcher);
        expect(launcher.style.left).toBe('840px');
        expect(launcher.classList).not.toContain('is-avoiding-control');
        dom.window.close();
    });

    test('does not mistake an interactive table cell for a floating corner control', () => {
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
        const tableControl = window.document.createElement('button');
        tableControl.style.cursor = 'pointer';
        tableControl.getBoundingClientRect = () => ({
            left: 850, top: 620, right: 918, bottom: 688, width: 68, height: 68
        });
        window.document.body.appendChild(tableControl);
        window.document.elementsFromPoint = () => [tableControl];

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

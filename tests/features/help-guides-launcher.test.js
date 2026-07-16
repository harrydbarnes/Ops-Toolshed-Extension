const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const featureCode = fs.readFileSync(
    path.resolve(__dirname, '../../features/help-guides-launcher.js'),
    'utf8'
);

describe('Help Guides page launcher', () => {
    function createFeature({ enabled = true, position = null } = {}) {
        const listeners = [];
        const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
            runScripts: 'dangerously',
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/'
        });
        dom.window.chrome = {
            runtime: {
                sendMessage: jest.fn().mockResolvedValue({ status: 'success' })
            },
            storage: {
                sync: {
                    get: jest.fn((defaults, callback) => callback({ ...defaults, helpGuidesEnabled: enabled }))
                },
                local: {
                    get: jest.fn((defaults, callback) => callback({ ...defaults, helpGuidesLauncherPosition: position })),
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
        expect(launcherStyles).toContain('rgba(6, 8, 141, 0.88)');
        expect(launcherStyles).toContain('touch-action: none');
        expect(launcherStyles).toContain('transition: none');
        expect(launcherStyles).toContain('white-space: nowrap');
        expect(launcherStyles).toContain('"Outfit"');
        buttons[0].click();
        expect(window.chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'openHelpGuides' });
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
});

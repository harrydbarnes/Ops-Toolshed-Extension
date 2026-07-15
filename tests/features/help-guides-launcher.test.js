const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const featureCode = fs.readFileSync(
    path.resolve(__dirname, '../../features/help-guides-launcher.js'),
    'utf8'
);

describe('Help Guides page launcher', () => {
    function createFeature() {
        const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
            runScripts: 'dangerously',
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/'
        });
        dom.window.chrome = {
            runtime: {
                sendMessage: jest.fn().mockResolvedValue({ status: 'success' })
            }
        };
        dom.window.eval(featureCode);
        return dom;
    }

    test('adds one accessible launcher and opens the side panel on click', async () => {
        const dom = createFeature();
        const { window } = dom;

        window.helpGuidesLauncherFeature.initialize();
        window.helpGuidesLauncherFeature.ensureLauncher();
        const buttons = window.document.querySelectorAll('#toolshed-help-guides-launcher');

        expect(buttons).toHaveLength(1);
        expect(buttons[0].getAttribute('aria-label')).toBe('Open Help Guides');
        buttons[0].click();
        expect(window.chrome.runtime.sendMessage).toHaveBeenCalledWith({ action: 'openHelpGuides' });
        dom.window.close();
    });
});

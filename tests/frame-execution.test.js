const fs = require('fs');
const path = require('path');

const manifest = require('../manifest.json');
const { CONTENT_SCRIPT_DEFINITIONS } = require('../background/content-script-definitions');
const contentScript = fs.readFileSync(path.resolve(__dirname, '../content.js'), 'utf8');
const campaignFeature = fs.readFileSync(path.resolve(__dirname, '../features/campaign.js'), 'utf8');

describe('Mediaocean frame execution boundary', () => {
    test('keeps the complete enhancement bundle in the top frame only', () => {
        const registration = CONTENT_SCRIPT_DEFINITIONS.find(entry =>
            entry.js?.includes('content.js')
        );

        expect(registration.allFrames).not.toBe(true);
        expect(registration.js).toContain('features/campaign.js');
        expect(campaignFeature).toContain('if (window.top === window.self)');
    });

    test('retains a dedicated child-frame script for Campaign Details Basic focus', () => {
        const registration = CONTENT_SCRIPT_DEFINITIONS.find(entry =>
            entry.js?.includes('features/campaign-details-focus.js')
        );

        expect(registration).toMatchObject({
            matches: ['https://*.mediaocean.com/idesk/prisma-campaign-details/*'],
            allFrames: true,
            js: [
                'features/extension-state-controller.js',
                'features/campaign-details-focus.js',
                'features/campaign-add-sections.js'
            ]
        });
        expect(campaignFeature).not.toContain("request?.action !== 'focusCampaignDetailsBasic'");
    });

    test('stops page-level content orchestration before it starts in child frames', () => {
        const frameGuard = 'if (window.top !== window.self) return;';
        const routeListener = "window.addEventListener('hashchange', handleUrlChange);";

        expect(contentScript).toContain(frameGuard);
        expect(contentScript.indexOf(frameGuard)).toBeLessThan(
            contentScript.indexOf(routeListener)
        );
        expect(contentScript.indexOf(frameGuard)).toBeLessThan(
            contentScript.indexOf('new MutationObserver')
        );
    });
});

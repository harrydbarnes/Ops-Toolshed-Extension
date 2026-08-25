const fs = require('fs');
const path = require('path');

const manifest = require('../manifest.json');
const contentScript = fs.readFileSync(path.resolve(__dirname, '../content.js'), 'utf8');
const campaignFeature = fs.readFileSync(path.resolve(__dirname, '../features/campaign.js'), 'utf8');

describe('Mediaocean frame execution boundary', () => {
    test('keeps the complete enhancement bundle in the top frame only', () => {
        const registration = manifest.content_scripts.find(entry =>
            entry.js?.includes('content.js')
        );

        expect(registration.all_frames).not.toBe(true);
        expect(registration.js).toContain('features/campaign.js');
        expect(campaignFeature).toContain('if (window.top === window.self)');
    });

    test('retains a dedicated child-frame script for Campaign Details Basic focus', () => {
        const registration = manifest.content_scripts.find(entry =>
            entry.js?.includes('features/campaign-details-focus.js')
        );

        expect(registration).toMatchObject({
            matches: ['https://*.mediaocean.com/idesk/prisma-campaign-details/*'],
            all_frames: true,
            js: [
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

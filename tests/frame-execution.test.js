const fs = require('fs');
const path = require('path');

const manifest = require('../manifest.json');
const contentScript = fs.readFileSync(path.resolve(__dirname, '../content.js'), 'utf8');
const campaignFeature = fs.readFileSync(path.resolve(__dirname, '../features/campaign.js'), 'utf8');

describe('Mediaocean frame execution boundary', () => {
    test('retains child-frame injection for the Campaign Details focus workflow', () => {
        const registration = manifest.content_scripts[0];

        expect(registration.all_frames).toBe(true);
        expect(registration.js).toContain('features/campaign.js');
        expect(campaignFeature).toContain("request?.action !== 'focusCampaignDetailsBasic'");
        expect(campaignFeature).toContain('isCampaignDetailsFrame()');
        expect(campaignFeature).toContain('if (window.top === window.self)');
    });

    test('stops page-level content orchestration before it starts in child frames', () => {
        const frameGuard = 'if (window.top !== window.self) return;';

        expect(contentScript).toContain(frameGuard);
        expect(contentScript.indexOf(frameGuard)).toBeLessThan(
            contentScript.indexOf('setInterval(() =>')
        );
        expect(contentScript.indexOf(frameGuard)).toBeLessThan(
            contentScript.indexOf('new MutationObserver')
        );
    });
});

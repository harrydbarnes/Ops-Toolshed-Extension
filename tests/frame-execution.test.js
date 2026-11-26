const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { readScript } = require('./helpers/read-script');

const manifest = require('../manifest.json');
const { CONTENT_SCRIPT_DEFINITIONS } = require('../background/content-script-definitions');
const contentScript = readScript(path.resolve(__dirname, '../content.js'));
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
                'features/campaign-add-sections.js',
                'features/campaign-po-autofill.js'
            ]
        });
        expect(campaignFeature).not.toContain("request?.action !== 'focusCampaignDetailsBasic'");
    });

    test('does not start page orchestration when executed in a child frame', async () => {
        const dom = new JSDOM('<iframe></iframe>', {
            url: 'https://agency.mediaocean.com/idesk/prisma-campaign-details/',
            runScripts: 'dangerously'
        });
        try {
            const child = dom.window.document.querySelector('iframe').contentWindow;
            expect(child.top).not.toBe(child.self);
            const subscribe = jest.fn();
            child.opsToolshedExtensionState = { subscribe, ready: Promise.resolve(true) };
            const observe = jest.spyOn(child, 'MutationObserver');
            const listen = jest.spyOn(child, 'addEventListener');
            const schedule = jest.spyOn(child, 'setTimeout');
            child.eval(contentScript);
            await Promise.resolve();
            await Promise.resolve();
            expect(subscribe).not.toHaveBeenCalled();
            expect(observe).not.toHaveBeenCalled();
            expect(listen).not.toHaveBeenCalled();
            expect(schedule).not.toHaveBeenCalled();
            expect(child.document.body.children).toHaveLength(0);
        } finally {
            dom.window.close();
        }
    });
});

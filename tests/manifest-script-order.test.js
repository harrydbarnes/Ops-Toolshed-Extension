const fs = require('fs');
const path = require('path');

const manifest = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../manifest.json'), 'utf8')
);
const helpGuidesHtml = fs.readFileSync(path.resolve(__dirname, '../help-guides.html'), 'utf8');

describe('Manifest content-script order', () => {

    test('loads utils before feature scripts and content.js last', () => {
        const mediaoceanRegistration = manifest.content_scripts.find(entry =>
            entry.js?.includes('content.js')
        );

        expect(mediaoceanRegistration).toBeDefined();
        const scripts = mediaoceanRegistration.js;
        const utilsIndex = scripts.indexOf('utils.js');
        const featureScripts = scripts.filter(script => script.startsWith('features/'));

        expect(utilsIndex).toBeGreaterThanOrEqual(0);
        expect(featureScripts.length).toBeGreaterThan(0);
        featureScripts.forEach(featureScript => {
            expect(scripts.indexOf(featureScript)).toBeGreaterThan(utilsIndex);
        });
        expect(scripts[scripts.length - 1]).toBe('content.js');
        expect(mediaoceanRegistration.all_frames).not.toBe(true);

        const loadingMonitorIndex = scripts.indexOf('features/loading-monitor.js');
        expect(loadingMonitorIndex).toBeGreaterThan(utilsIndex);
        expect(loadingMonitorIndex).toBeLessThan(scripts.indexOf('features/stats-collector.js'));
        expect(loadingMonitorIndex).toBeLessThan(scripts.indexOf('features/loading-facts.js'));
    });

    test('limits child-frame enhancement injection to Campaign Details focus', () => {
        const frameRegistration = manifest.content_scripts.find(entry =>
            entry.js?.includes('features/campaign-details-focus.js')
        );

        expect(frameRegistration.js).toEqual([
            'features/campaign-details-focus.js',
            'features/campaign-add-sections.js'
        ]);
        expect(frameRegistration.css).toBeUndefined();
        expect(frameRegistration.all_frames).toBe(true);
        expect(frameRegistration.matches).toEqual([
            'https://*.mediaocean.com/idesk/prisma-campaign-details/*'
        ]);
    });

    test('loads the lightweight Moe launcher bridge in the main page only', () => {
        const registration = manifest.content_scripts.find(entry =>
            entry.js?.includes('features/moe-launcher-bridge.js')
        );

        expect(registration).toMatchObject({
            run_at: 'document_start',
            world: 'MAIN'
        });
        expect(registration.all_frames).not.toBe(true);
        expect(registration.js).toEqual(['features/moe-launcher-bridge.js']);
    });

    test('declares the Help Guides side panel and launcher wiring', () => {
        expect(manifest.permissions).toContain('sidePanel');
        expect(manifest.side_panel).toEqual({ default_path: 'help-guides.html' });
        expect(manifest.host_permissions).toContain('https://insidemedia.sharepoint.com/*');

        const mediaoceanRegistration = manifest.content_scripts.find(entry =>
            entry.js?.includes('content.js')
        );
        expect(mediaoceanRegistration.js).toContain('features/help-guides-launcher.js');
        expect(mediaoceanRegistration.js).toContain('features/banner-username.js');
        expect(mediaoceanRegistration.js).toContain('features/actualise-navbar.js');
        expect(mediaoceanRegistration.js).toContain('features/actualise-shortcut.js');
        expect(mediaoceanRegistration.js).toContain('features/actualise-export-all.js');
        expect(mediaoceanRegistration.js).toContain('features/actualise-month-assurance.js');
        expect(mediaoceanRegistration.js).toContain('features/order-grid-scroll-sync.js');
        expect(mediaoceanRegistration.js).toContain('features/max-campaign-budget.js');
        expect(mediaoceanRegistration.js).toContain('features/onboarding-tour.js');
    });

    test('loads the Actualise month response bridge in the page world before the isolated content script', () => {
        const bridgeRegistration = manifest.content_scripts.find(entry =>
            entry.js?.includes('features/actualise-month-bridge.js')
        );

        expect(bridgeRegistration).toMatchObject({
            run_at: 'document_start',
            world: 'MAIN',
            js: ['features/actualise-month-bridge.js']
        });
        const isolatedRegistration = manifest.content_scripts.find(entry =>
            entry.js?.includes('content.js')
        );
        expect(manifest.content_scripts.indexOf(bridgeRegistration))
            .toBeLessThan(manifest.content_scripts.indexOf(isolatedRegistration));
    });

    test('ships the first-run onboarding and guided side-panel pages', () => {
        [
            'onboarding.html',
            'onboarding.css',
            'onboarding.js',
            'onboarding-tour.html',
            'onboarding-tour.css',
            'onboarding-tour.js',
            'onboarding-tour-v2.html',
            'onboarding-tour-v2.css',
            'onboarding-tour-v2.js'
        ].forEach(file => {
            expect(fs.existsSync(path.resolve(__dirname, `../${file}`))).toBe(true);
        });
    });

    test('loads the custom PDF viewer before the Help Guides application', () => {
        const viewerIndex = helpGuidesHtml.indexOf('features/help-guide-pdf-viewer.js');
        const appIndex = helpGuidesHtml.indexOf('help-guides.js');

        expect(viewerIndex).toBeGreaterThanOrEqual(0);
        expect(appIndex).toBeGreaterThan(viewerIndex);
        expect(fs.existsSync(path.resolve(__dirname, '../vendor/pdfjs/pdf.min.mjs'))).toBe(true);
        expect(fs.existsSync(path.resolve(__dirname, '../vendor/pdfjs/pdf.worker.min.mjs'))).toBe(true);
    });
});

const fs = require('fs');
const path = require('path');

const manifest = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../manifest.json'), 'utf8')
);
const helpGuidesHtml = fs.readFileSync(path.resolve(__dirname, '../help-guides.html'), 'utf8');

describe('Manifest content-script order', () => {
    test('loads utils before feature scripts and content.js last', () => {
        const mediaoceanRegistration = manifest.content_scripts.find(entry =>
            entry.matches.includes('*://*.mediaocean.com/*')
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
    });

    test('declares the Help Guides side panel and launcher wiring', () => {
        expect(manifest.permissions).toContain('sidePanel');
        expect(manifest.side_panel).toEqual({ default_path: 'help-guides.html' });
        expect(manifest.host_permissions).toContain('https://insidemedia.sharepoint.com/*');

        const mediaoceanRegistration = manifest.content_scripts.find(entry =>
            entry.matches.includes('*://*.mediaocean.com/*')
        );
        expect(mediaoceanRegistration.js).toContain('features/help-guides-launcher.js');
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

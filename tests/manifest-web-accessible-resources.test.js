const fs = require('fs');
const path = require('path');

const manifest = require('../manifest.json');
const { CONTENT_SCRIPT_DEFINITIONS } = require('../background/content-script-definitions');
const logoFeature = fs.readFileSync(path.resolve(__dirname, '../features/logo.js'), 'utf8');

describe('web-accessible resource scope', () => {
    test('exposes runtime assets only to Mediaocean pages', () => {
        expect(manifest.web_accessible_resources).toEqual([{
            resources: ['icon.png'],
            matches: ['https://*.mediaocean.com/*']
        }]);
    });

    test('keeps every exposed asset tied to its current Mediaocean consumer', () => {
        expect(logoFeature).toContain("chrome.runtime.getURL('icon.png')");
        expect(CONTENT_SCRIPT_DEFINITIONS.every(registration =>
            registration.matches.every(match => match.startsWith('https://*.mediaocean.com/'))
        )).toBe(true);
    });
});

const fs = require('fs');
const path = require('path');

const manifest = require('../manifest.json');
const logoFeature = fs.readFileSync(path.resolve(__dirname, '../features/logo.js'), 'utf8');
const swapAccountsFeature = fs.readFileSync(path.resolve(__dirname, '../features/swap-accounts.js'), 'utf8');

describe('web-accessible resource scope', () => {
    test('exposes runtime assets only to Mediaocean pages', () => {
        expect(manifest.web_accessible_resources).toEqual([{
            resources: ['icon.png', 'features/swap-accounts.css'],
            matches: ['https://*.mediaocean.com/*']
        }]);
    });

    test('keeps every exposed asset tied to its current Mediaocean consumer', () => {
        expect(logoFeature).toContain("chrome.runtime.getURL('icon.png')");
        expect(swapAccountsFeature).toContain("chrome.runtime.getURL('features/swap-accounts.css')");
        expect(manifest.content_scripts.every(registration =>
            registration.matches.every(match => match.startsWith('https://*.mediaocean.com/'))
        )).toBe(true);
    });
});

const fs = require('fs');
const path = require('path');

const settingsHtml = fs.readFileSync(path.resolve(__dirname, '../settings.html'), 'utf8');
const settingsScript = fs.readFileSync(path.resolve(__dirname, '../settings.js'), 'utf8');

describe('AppLearn popup blocking setting', () => {
    test('exposes an enabled-by-default Settings toggle', () => {
        expect(settingsHtml).toContain('id="blockAppLearnPopupsToggle"');
        expect(settingsHtml).toContain('Block broken AppLearn login popups:');
        expect(settingsScript).toContain(
            "setupToggle('blockAppLearnPopupsToggle', 'blockAppLearnPopupsEnabled'"
        );
    });
});

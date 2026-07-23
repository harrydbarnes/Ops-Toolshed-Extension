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

    test('exposes the enabled-by-default Help Guides feature toggle', () => {
        expect(settingsHtml).toContain('id="helpGuidesToggle"');
        expect(settingsHtml).toContain('Help Guides launcher:');
        expect(settingsScript).toContain('helpGuidesEnabled: true');
        expect(settingsScript).toContain(
            "setupToggle('helpGuidesToggle', 'helpGuidesEnabled'"
        );
    });

    test('offers a Features-tab launch for first-run onboarding and both side-panel versions', () => {
        expect(settingsHtml).toContain('id="launchOnboardingButton"');
        expect(settingsHtml).toContain('Launch user onboarding');
        expect(settingsHtml).toContain('id="launchOnboardingTourV1Button"');
        expect(settingsHtml).toContain('Open side panel v1');
        expect(settingsHtml).toContain('id="launchOnboardingTourV2Button"');
        expect(settingsHtml).toContain('Open side panel v2');
        expect(settingsScript).toContain("chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') })");
        expect(settingsScript).toContain("openOnboardingSidePanel('onboarding-tour.html')");
        expect(settingsScript).toContain("openOnboardingSidePanel('onboarding-tour-v2.html')");
        expect(settingsScript).toContain("chrome.tabs.create({ url: ONBOARDING_PRISMA_HOME })");
        expect(settingsScript).toContain("const ONBOARDING_PRISMA_HOME = 'https://groupmuk-prisma.mediaocean.com/campaign-management/");
    });
});

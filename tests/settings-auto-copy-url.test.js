const fs = require('fs');
const path = require('path');

const settingsHtml = fs.readFileSync(path.resolve(__dirname, '../settings.html'), 'utf8');
const settingsScript = fs.readFileSync(path.resolve(__dirname, '../settings.js'), 'utf8');
const toolshedHtml = fs.readFileSync(path.resolve(__dirname, '../toolshed.html'), 'utf8');

describe('Auto Copy Campaign URL settings', () => {
    test('offers Short URL and Full URL modes below the main toggle', () => {
        expect(settingsHtml).toContain('id="autoCopyUrlSubOptions"');
        expect(settingsHtml).toContain('id="autoCopyUrlModeSegmented"');
        expect(settingsHtml).toContain('data-value="short" aria-pressed="true">Short</button>');
        expect(settingsHtml).toContain('data-value="full" aria-pressed="false">Full</button>');
        expect(settingsScript).toContain("initializeSegmentedControl('autoCopyUrlModeSegmented', 'autoCopyUrlMode', 'short')");
    });

    test('disables the URL mode control with the main toggle and syncs live changes', () => {
        expect(settingsScript).toContain("autoCopyUrlModeSegmented.classList.toggle('is-disabled', !enabled)");
        expect(settingsScript).toContain('changes.autoCopyUrlMode.newValue');
        expect(settingsScript).toContain('setAutoCopyUrlSubOptionsEnabled(changes.autoCopyUrlEnabled.newValue !== false)');
    });

    test('uses the same segmented interaction for Popup UI Theme', () => {
        expect(settingsHtml).toContain('id="uiThemeSegmented"');
        expect(settingsHtml).toContain('data-value="pink" aria-pressed="true"');
        expect(settingsHtml).toContain('data-value="black" aria-pressed="false"');
        expect(settingsHtml).toContain('class="segment-color-swatch pink"');
        expect(settingsHtml).toContain('class="segment-color-swatch black"');
        expect(settingsScript).toContain("initializeSegmentedControl('uiThemeSegmented', 'uiTheme', 'pink')");
    });

    test('keeps documented rollback instructions for both previous dropdowns', () => {
        expect(settingsHtml).toContain('DROPDOWN ROLLBACK (Popup UI Theme)');
        expect(settingsHtml).toContain('DROPDOWN ROLLBACK (URL format)');
        expect(settingsScript).toContain("initializeCustomDropdown('uiThemeDropdown', 'uiTheme', 'pink')");
        expect(settingsScript).toContain("initializeCustomDropdown('autoCopyUrlModeDropdown', 'autoCopyUrlMode', 'short')");
    });

    test('removes the completed PID quick-swap item from the roadmap', () => {
        expect(toolshedHtml).not.toContain('Quick swap button for your PIDs');
    });
});

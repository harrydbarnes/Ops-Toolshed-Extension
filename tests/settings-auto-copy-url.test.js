const fs = require('fs');
const path = require('path');

const settingsHtml = fs.readFileSync(path.resolve(__dirname, '../settings.html'), 'utf8');
const settingsScript = fs.readFileSync(path.resolve(__dirname, '../settings.js'), 'utf8');
const toolshedHtml = fs.readFileSync(path.resolve(__dirname, '../toolshed.html'), 'utf8');

describe('Auto Copy Campaign URL settings', () => {
    test('offers Short URL and Full URL modes below the main toggle', () => {
        expect(settingsHtml).toContain('id="autoCopyUrlSubOptions"');
        expect(settingsHtml).toContain('id="autoCopyUrlModeDropdown"');
        expect(settingsHtml).toContain('class="custom-dropdown compact-custom-dropdown"');
        expect(settingsHtml).toContain('class="dropdown-option" data-value="short">Short URL</div>');
        expect(settingsHtml).toContain('class="dropdown-option" data-value="full">Full URL</div>');
        expect(settingsScript).toContain("initializeCustomDropdown('autoCopyUrlModeDropdown', 'autoCopyUrlMode', 'short')");
    });

    test('disables the URL mode control with the main toggle and syncs live changes', () => {
        expect(settingsScript).toContain("autoCopyUrlModeDropdown.classList.toggle('is-disabled', !enabled)");
        expect(settingsScript).toContain('changes.autoCopyUrlMode.newValue');
        expect(settingsScript).toContain('setAutoCopyUrlSubOptionsEnabled(changes.autoCopyUrlEnabled.newValue !== false)');
    });

    test('removes the completed PID quick-swap item from the roadmap', () => {
        expect(toolshedHtml).not.toContain('Quick swap button for your PIDs');
    });
});

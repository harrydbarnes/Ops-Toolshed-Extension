const fs = require('fs');
const path = require('path');

const contentCss = fs.readFileSync(path.resolve(__dirname, '../../content.css'), 'utf8');
const settingsCss = fs.readFileSync(path.resolve(__dirname, '../../settings.css'), 'utf8');

function cssRule(css, selector) {
    const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1] || '';
}

describe('Reminder popup and editor styles', () => {
    test('uses a white button for custom reminders and a blue button for built-in reminders', () => {
        const customButtonRule = cssRule(contentCss, '.custom-reminder-close-button');
        const builtInButtonRule = cssRule(contentCss, '.reminder-close-button');

        expect(customButtonRule).toMatch(/background-color:\s*(?:white|#fff(?:fff)?)/i);
        expect(customButtonRule).toMatch(/color:\s*#ff3d80/i);
        expect(builtInButtonRule).toMatch(/background-color:\s*#07009a/i);
        expect(builtInButtonRule).toMatch(/color:\s*#fff(?:fff)?/i);
    });

    test('keeps URL controls aligned and gives Match Logic breathing room', () => {
        expect(cssRule(settingsCss, '.reminder-url-label-row')).toMatch(/justify-content:\s*flex-start/i);
        expect(cssRule(settingsCss, '.reminder-url-input-row input')).toMatch(/margin-bottom:\s*0/i);
        expect(cssRule(settingsCss, '.reminder-match-logic')).toMatch(/margin-top:\s*18px/i);
    });

    test('blurs edit mode and locks background scrolling while a reminder modal is open', () => {
        const editingOverlayRule = cssRule(settingsCss, '.reminder-modal-overlay.reminder-modal-overlay--editing');
        expect(editingOverlayRule).toMatch(/backdrop-filter:\s*blur\(4px\)/i);
        expect(editingOverlayRule).toMatch(/animation:\s*reminder-modal-overlay-in\s+0\.2s\s+ease-out/i);
        expect(cssRule(settingsCss, '.reminder-modal.reminder-modal--editing')).toMatch(/animation:\s*reminder-modal-zoom-in\s+0\.2s\s+ease-out/i);
        expect(cssRule(settingsCss, '.reminder-modal-overlay.reminder-modal-overlay--closing')).toMatch(/animation:\s*reminder-modal-overlay-out\s+0\.2s\s+ease-in\s+forwards/i);
        expect(cssRule(settingsCss, '.reminder-modal.reminder-modal--closing')).toMatch(/animation:\s*reminder-modal-zoom-out\s+0\.2s\s+ease-in\s+forwards/i);
        expect(settingsCss).toContain('@keyframes reminder-modal-overlay-in');
        expect(settingsCss).toContain('@keyframes reminder-modal-overlay-out');
        const scrollLockRule = cssRule(settingsCss, 'body.reminder-modal-open');
        expect(scrollLockRule).toMatch(/overflow:\s*hidden\s*!important/i);
        expect(scrollLockRule).toMatch(/padding-right:\s*calc\(20px\s*\+\s*var\(--reminder-scrollbar-compensation,\s*0px\)\)\s*!important/i);
    });
});

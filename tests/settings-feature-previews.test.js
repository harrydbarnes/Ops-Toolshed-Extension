const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const {
    addFeatureSettingPreviews,
    FEATURE_SETTING_PREVIEWS,
    setupFeaturePreviewInteractions,
    ensureFeaturePreviewTooltip
} = require('../settings');

const settingsHtml = fs.readFileSync(path.resolve(__dirname, '../settings.html'), 'utf8');

describe('Settings feature previews', () => {
    test('adds an accessible visual preview and concise description to every Features setting control', () => {
        const dom = new JSDOM(settingsHtml);
        const { document } = dom.window;
        global.document = document;

        addFeatureSettingPreviews(document);

        const controls = Array.from(document.querySelectorAll(
            '#features input[type="checkbox"], #features .segmented-control'
        ));
        expect(Object.keys(FEATURE_SETTING_PREVIEWS).sort()).toEqual(controls.map(control => control.id).sort());

        controls.forEach(control => {
            expect(control.closest('.toggle-container').dataset.featurePreviewControl).toBe(control.id);
            expect(control.getAttribute('aria-describedby')).toBe('feature-settings-tooltip-description');
            const indicator = control.closest('.toggle-container').querySelector('.feature-tooltip-indicator');
            expect(indicator).not.toBeNull();
            expect(indicator.getAttribute('aria-hidden')).toBe('true');
        });
        expect(document.querySelectorAll('#feature-settings-tooltip')).toHaveLength(1);
        expect(document.querySelector('#feature-settings-tooltip img')).not.toBeNull();
        dom.window.close();
        delete global.document;
    });
});

describe('Settings feature preview interactions', () => {
    test('delays mouse previews from the left third and keeps a hovered tooltip open for one second after leaving it', () => {
        jest.useFakeTimers();
        const dom = new JSDOM(settingsHtml);
        const { document, MouseEvent } = dom.window;
        global.document = document;
        addFeatureSettingPreviews(document);
        setupFeaturePreviewInteractions(document, 300);

        const container = document.getElementById('loadingFactsToggle').closest('.toggle-container');
        const tooltip = ensureFeaturePreviewTooltip(document);
        container.getBoundingClientRect = () => ({ left: 100, width: 300, top: 100, bottom: 140 });

        container.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 250 }));
        jest.advanceTimersByTime(350);
        expect(tooltip.classList).not.toContain('is-preview-open');

        container.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 150 }));
        jest.advanceTimersByTime(299);
        expect(tooltip.classList).not.toContain('is-preview-open');
        jest.advanceTimersByTime(1);
        expect(tooltip.classList).toContain('is-preview-open');
        expect(tooltip.querySelector('img').getAttribute('src')).toContain('prisma-navigation.png');
        expect(tooltip.dataset.placement).toBe('below');

        container.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 350 }));
        jest.advanceTimersByTime(900);
        expect(tooltip.classList).toContain('is-preview-open');

        container.dispatchEvent(new MouseEvent('pointerleave', { bubbles: true }));
        tooltip.dispatchEvent(new MouseEvent('pointerenter', { bubbles: true }));
        jest.advanceTimersByTime(750);
        expect(tooltip.classList).toContain('is-preview-open');

        tooltip.dispatchEvent(new MouseEvent('pointerleave', { bubbles: true }));
        jest.advanceTimersByTime(799);
        expect(tooltip.classList).toContain('is-preview-open');
        jest.advanceTimersByTime(1);
        expect(tooltip.classList).not.toContain('is-preview-open');
        dom.window.close();
        delete global.document;
        jest.useRealTimers();
    });
});

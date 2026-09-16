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
            expect(indicator.tagName).toBe('BUTTON');
            expect(indicator.getAttribute('aria-label')).toMatch(/^Preview /);
        });
        expect(document.querySelectorAll('#feature-settings-tooltip')).toHaveLength(1);
        expect(document.querySelector('#feature-settings-tooltip img')).not.toBeNull();
        dom.window.close();
        delete global.document;
    });
});

describe('Settings feature preview interactions', () => {
    test('click and keyboard focus show the relevant asset; Escape cancels pending reveals', () => {
        jest.useFakeTimers();
        const dom = new JSDOM(settingsHtml);
        const { document } = dom.window;
        global.document = document;
        addFeatureSettingPreviews(document);
        setupFeaturePreviewInteractions(document, 300);
        const help = document.getElementById('helpGuidesToggle').closest('.toggle-container');
        const loading = document.getElementById('loadingFactsToggle').closest('.toggle-container');
        help.querySelector('button.feature-tooltip-indicator').click();
        const tooltip = ensureFeaturePreviewTooltip(document);
        expect(tooltip.querySelector('img').hidden).toBe(false);
        expect(tooltip.querySelector('img').getAttribute('src')).toContain('prisma-help-guides.png');
        loading.dispatchEvent(new dom.window.MouseEvent('pointermove', { bubbles: true }));
        document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
        jest.advanceTimersByTime(400);
        expect(tooltip.getAttribute('aria-hidden')).toBe('true');
        document.getElementById('loadingFactsToggle').focus();
        expect(tooltip.querySelector('strong').textContent).toBe('Loading Facts');
        expect(tooltip.querySelector('img').hidden).toBe(true);
        expect(document.getElementById('loadingFactsToggle').checked).toBe(false);
        dom.window.close();
        delete global.document;
        jest.useRealTimers();
    });

    test('delays previews across the whole row and retains them while moving into the tooltip', () => {
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
        jest.advanceTimersByTime(299);
        expect(tooltip.classList).not.toContain('is-preview-open');
        jest.advanceTimersByTime(1);
        expect(tooltip.classList).toContain('is-preview-open');
        expect(tooltip.querySelector('img').hidden).toBe(true);
        expect(tooltip.querySelector('img').hasAttribute('src')).toBe(false);
        expect(tooltip.textContent).toContain('Screenshot not yet available.');
        expect(tooltip.dataset.placement).toBe('below');
        expect(tooltip.style.top).toBe('148px');
        container.getBoundingClientRect = () => ({ left: 100, width: 300, top: 300, bottom: 340 });
        document.dispatchEvent(new dom.window.Event('scroll'));
        expect(tooltip.style.top).toBe('348px');
        container.getBoundingClientRect = () => ({ left: 100, width: 300, top: 400, bottom: 440 });
        tooltip.querySelector('img').dispatchEvent(new dom.window.Event('load'));
        expect(tooltip.style.top).toBe('448px');

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

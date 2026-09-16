const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { FEATURE_CATALOGUE, BOOLEAN_DEFAULTS } = require('../feature-settings-registry');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('catalogue covers every feature setting and every boolean preference without a generic image fallback', () => {
    const dom = new JSDOM(read('settings.html'));
    const controls = [...dom.window.document.querySelectorAll('#features input[type="checkbox"], #features .segmented-control')];
    expect(new Set(FEATURE_CATALOGUE.map(item => item.id)).size).toBe(FEATURE_CATALOGUE.length);
    for (const control of controls) expect(FEATURE_CATALOGUE.some(item => item.id === control.id)).toBe(true);
    for (const key of Object.keys(BOOLEAN_DEFAULTS)) expect(FEATURE_CATALOGUE.some(item => item.setting === key)).toBe(true);
    for (const feature of FEATURE_CATALOGUE) {
        if (feature.image) {
            expect(fs.existsSync(path.join(__dirname, '..', feature.image.src))).toBe(true);
            expect(feature.image.alt.length).toBeGreaterThan(10);
            expect(feature.image.src).not.toContain('prisma-navigation');
        } else expect(feature.previewNote.length).toBeGreaterThan(0);
        if (feature.href.startsWith('settings.html?')) expect(dom.window.document.getElementById(feature.id)).not.toBeNull();
    }
    dom.window.close();
});

test('explorer searches all features, filters groups, exposes current settings and updates without writing preferences', async () => {
    const dom = new JSDOM(read('feature-explorer.html'), { runScripts: 'outside-only', url: 'https://example.test/feature-explorer.html' });
    let onChange;
    const set = jest.fn();
    dom.window.chrome = {
        runtime: {}, storage: {
            sync: { get: (defaults, callback) => callback({ ...defaults, actualiseBulkExportEnabled: false }), set },
            onChanged: { addListener: callback => { onChange = callback; } }
        }
    };
    dom.window.eval(read('feature-settings-registry.js'));
    dom.window.eval(read('feature-explorer.js'));
    await Promise.resolve(); await Promise.resolve();
    const doc = dom.window.document;
    expect(doc.querySelectorAll('.explorer-feature')).toHaveLength(FEATURE_CATALOGUE.length);
    const search = doc.getElementById('feature-search');
    search.value = 'bulk export';
    search.dispatchEvent(new dom.window.Event('input'));
    expect([...doc.querySelectorAll('.explorer-feature')].filter(el => !el.hidden)).toHaveLength(1);
    expect(doc.querySelector('#actualiseBulkExportToggle .feature-state').textContent).toBe('Off');
    onChange({ actualiseBulkExportEnabled: { newValue: true } }, 'sync');
    expect(doc.querySelector('#actualiseBulkExportToggle .feature-state').textContent).toBe('On');
    expect(doc.querySelector('#actualiseBulkExportToggle a').href).toContain('settings.html?feature=actualiseBulkExportToggle#features');
    search.value = 'no-such-feature';
    search.dispatchEvent(new dom.window.Event('input'));
    expect(doc.getElementById('explorer-empty').hidden).toBe(false);
    search.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
    [...doc.querySelectorAll('#feature-groups button')].find(button => button.textContent === 'Help').click();
    expect([...doc.querySelectorAll('.explorer-feature')].filter(el => !el.hidden).length).toBe(FEATURE_CATALOGUE.filter(item => item.group === 'help').length);
    expect(set).not.toHaveBeenCalled();
    dom.window.close();
});

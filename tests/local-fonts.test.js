const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

test('extension font stylesheets and every declared WOFF2 subset ship locally', () => {
    const pages = fs.readdirSync(root).filter(file => file.endsWith('.html'));
    let fontPages = 0;
    for (const page of pages) {
        const html = fs.readFileSync(path.join(root, page), 'utf8');
        expect(html).not.toMatch(/(?:href|src)=["']https:\/\/fonts\.(?:googleapis|gstatic)\.com/);
        if (html.includes('assets/fonts/fonts.css')) fontPages++;
    }
    expect(fontPages).toBe(11);

    const css = fs.readFileSync(path.join(root, 'assets/fonts/fonts.css'), 'utf8');
    // jsdom drops font-face descriptors it does not implement. Check the
    // packaged resource graph here; real Chrome verifies font loading.
    const rules = Array.from(css.matchAll(/@font-face\s*\{([^}]+)\}/g), match => match[1]);
    expect(rules).toHaveLength(7);
    for (const rule of rules) {
        const file = rule.match(/src:\s*url\(([^)]+)\)/)[1];
        expect(file).not.toMatch(/[:/\\]/);
        const bytes = fs.readFileSync(path.join(root, 'assets/fonts', file));
        expect(bytes.subarray(0, 4).toString()).toBe('wOF2');
        expect(bytes.readUInt32BE(8)).toBe(bytes.length);
        expect(rule).toMatch(/font-display:\s*swap;/);
        expect(rule).toMatch(/unicode-range:\s*U\+/);
    }
    for (const family of ['outfit', 'montserrat']) {
        expect(fs.readFileSync(path.join(root, `assets/fonts/${family}-OFL.txt`), 'utf8'))
            .toContain('SIL OPEN FONT LICENSE');
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
    expect(manifest.content_security_policy.extension_pages).not.toContain('fonts.googleapis.com');
});

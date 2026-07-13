const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');

describe('r1.6 release metadata', () => {
    test('keeps the manifest and README version aligned', () => {
        const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
        const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

        expect(manifest.version).toBe('1.6');
        expect(readme).toContain('**Current version: 1.6**');
        expect(readme).toContain("## What's new in 1.6");
    });

    test('lists r1.6 first while preserving r1.5 release history', () => {
        const toolshed = fs.readFileSync(path.join(root, 'toolshed.html'), 'utf8');
        const document = new JSDOM(toolshed).window.document;
        const releases = Array.from(document.querySelectorAll('#release-notes .release h2'))
            .map(heading => heading.textContent.trim());

        expect(releases.slice(0, 2)).toEqual(['r1.6', 'r1.5']);
        expect(document.querySelector('#release-notes .release').textContent).toContain('Custom Reminders');
    });
});

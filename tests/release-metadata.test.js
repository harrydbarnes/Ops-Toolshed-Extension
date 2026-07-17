const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const expectedRelease = `r${manifest.version}`;

describe('release metadata', () => {
    test('keeps the manifest and README version aligned', () => {
        const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

        expect(readme).toContain(`**Current version: ${manifest.version}**`);
        expect(readme).toContain(`## What's new in ${manifest.version}`);
    });

    test('lists the manifest version first in the release history', () => {
        const toolshed = fs.readFileSync(path.join(root, 'toolshed.html'), 'utf8');
        const dom = new JSDOM(toolshed);

        try {
            const releases = Array.from(dom.window.document.querySelectorAll('#release-notes .release h2'))
                .map(heading => heading.textContent.trim());

            expect(releases[0]).toBe(expectedRelease);
            expect(new Set(releases).size).toBe(releases.length);
        } finally {
            dom.window.close();
        }
    });

    test('labels and orders every release item as New, Improved, then Fixed', () => {
        const toolshed = fs.readFileSync(path.join(root, 'toolshed.html'), 'utf8');
        const dom = new JSDOM(toolshed);
        const priority = { new: 0, improved: 1, fixed: 2 };

        try {
            const releases = Array.from(dom.window.document.querySelectorAll('#release-notes .release'));
            expect(releases.length).toBeGreaterThan(0);

            releases.forEach(release => {
                const badges = Array.from(release.querySelectorAll('li .release-badge'));
                expect(badges).toHaveLength(release.querySelectorAll('li').length);

                const types = badges.map(badge => badge.dataset.releaseType);
                expect(types.every(type => Object.hasOwn(priority, type))).toBe(true);
                expect(types.map(type => priority[type]))
                    .toEqual([...types].map(type => priority[type]).sort((a, b) => a - b));
            });
        } finally {
            dom.window.close();
        }
    });
});

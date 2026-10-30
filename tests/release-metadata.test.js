const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { findPackedRef } = require('../update-build-info');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const expectedRelease = `r${manifest.version}`;

describe('release metadata', () => {
    test('finds a branch commit in packed Git references', () => {
        const packedRefs = [
            '# pack-refs with: peeled fully-peeled sorted',
            'a30d8d900000000000000000000000000000000 refs/heads/r1.9'
        ].join('\n');

        expect(findPackedRef(packedRefs, 'refs/heads/r1.9'))
            .toBe('a30d8d900000000000000000000000000000000');
    });

    test('keeps the manifest and README version aligned', () => {
        const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
        const packageMetadata = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

        expect(readme).toContain(`**Current version: ${manifest.version}**`);
        expect(readme).toContain(`## What's new in ${manifest.version}`);
        expect(packageMetadata.name).toBe('ops-toolshed-extension');
        expect(packageMetadata.version).toBe(`${manifest.version}.0`);
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

    test('documents the current release capabilities without fixing editorial positions', () => {
        const toolshed = fs.readFileSync(path.join(root, 'toolshed.html'), 'utf8');
        const dom = new JSDOM(toolshed);
        try {
            const release = dom.window.document.querySelector('#release-notes .release');
            const items = Array.from(release.querySelectorAll('li'));
            const required = [
                ['My Reccies:', 'new', ['Verification keeps the tracker unchanged', 'preview and confirmation', 'save receipts']],
                ['Timesheet Helper:', 'new', ['review proportional estimates', 'Read visible rows']],
                ['Annual Leave Calendar Helper:', 'new', ['Apple or Google Calendar', 'AM/PM']],
                ['Stats Insights:', 'improved', []],
                ['Setup recovery:', 'improved', []],
                ['Feature startup:', 'fixed', []],
                ['Product Code Warnings:', 'fixed', []],
                ['Saved feedback and settings:', 'fixed', []],
                ['Moe Chat recovery:', 'fixed', []],
                ['Internal request checks:', 'fixed', []]
            ];
            for (const [title, type, details] of required) {
                const matches = items.filter(item => item.querySelector('strong')?.textContent === title);
                expect(matches).toHaveLength(1);
                expect(matches[0].querySelector('.release-badge').dataset.releaseType).toBe(type);
                for (const detail of details) expect(matches[0].textContent).toContain(detail);
            }
            const texts = items.map(item => item.textContent.trim());
            expect(new Set(texts).size).toBe(texts.length);
            expect(items.filter(item => item.querySelector('strong')?.textContent.startsWith('Other minor fixes')))
                .toHaveLength(1);
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

    test('uses a connected timeline without card containers for release items', () => {
        const css = fs.readFileSync(path.join(root, 'toolshed.css'), 'utf8');
        const itemRule = css.match(/#release-notes \.release li\s*{([^}]*)}/s)?.[1] || '';

        expect(css).toMatch(/\.release::before\s*{/);
        expect(css).toMatch(/#release-notes \.release li::before\s*{/);
        expect(css).toMatch(/#release-notes \.release li::after\s*{/);
        expect(css).toMatch(/\.release-badge\s*{[^}]*width:\s*68px;/s);
        expect(css).toMatch(/#release-notes \.release li::before\s*{[^}]*top:\s*13px;/s);
        expect(css).toMatch(/#release-notes \.release li::after\s*{[^}]*top:\s*13px;/s);
        expect(itemRule).not.toMatch(/\bborder\s*:/);
        expect(itemRule).not.toMatch(/\bbackground\s*:/);
    });
});

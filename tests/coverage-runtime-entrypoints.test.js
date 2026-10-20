const fs = require('fs');
const path = require('path');
const { globsToMatcher } = require('jest-util');
const config = require('../jest.config');
const manifest = require('../manifest.json');
const { CONTENT_SCRIPT_DEFINITIONS } = require('../background/content-script-definitions');

test('coverage includes runtime entry scripts even when no test executes them', () => {
    const root = path.resolve(__dirname, '..');
    const runtimeScripts = new Set([
        manifest.background.service_worker,
        ...CONTENT_SCRIPT_DEFINITIONS.flatMap(entry => entry.js || []),
        ...(manifest.content_scripts || []).flatMap(entry => entry.js || [])
    ]);
    for (const file of fs.readdirSync(root).filter(file => file.endsWith('.html'))) {
        const html = fs.readFileSync(path.join(root, file), 'utf8');
        for (const match of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
            if (!/^(?:https?:)?\/\//.test(match[1])) runtimeScripts.add(match[1]);
        }
        for (const match of html.matchAll(/\bdata-scripts=["']([^"']+)["']/gi)) {
            for (const script of match[1].split(',')) runtimeScripts.add(script.trim());
        }
    }
    const isCovered = globsToMatcher(config.collectCoverageFrom);
    for (const script of runtimeScripts) {
        // Build metadata is generated data, and vendor libraries are not owned here.
        if (script === 'build-info.js' || script.startsWith('vendor/')) continue;
        expect({ script, included: isCovered(script) }).toEqual({ script, included: true });
    }
});

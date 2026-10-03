const path = require('path');
const { JSDOM } = require('jsdom');
const { readScript } = require('./helpers/read-script');

test('tracks windows even when a test leaves one open', () => {
    const dom = new JSDOM('');
    expect(dom.window.navigator.userAgent).toContain(`jsdom/${require('jsdom/package.json').version}`);
    expect(globalThis.__activeTestDoms.has(dom)).toBe(true);
});

test('closes windows left open by the previous test', () => {
    expect(globalThis.__activeTestDoms.size).toBe(0);
});

test('captures executed statements from scripts loaded as text', () => {
    const previousFlag = globalThis.__collectScriptCoverage;
    const previousCoverage = globalThis.__coverage__;
    const filename = path.resolve(__dirname, 'fixtures/dom-coverage.js');
    try {
        globalThis.__collectScriptCoverage = true;
        const dom = new JSDOM('', { runScripts: 'dangerously' });
        dom.window.eval(readScript(filename));
        expect(dom.window.coverageFixtureResult).toBe(42);
        expect(dom.window.__coverage__).toBe(globalThis.__coverage__);
        expect(Object.values(globalThis.__coverage__[filename].s).every(count => count > 0)).toBe(true);
    } finally {
        globalThis.__collectScriptCoverage = previousFlag;
        globalThis.__coverage__ = previousCoverage;
    }
});

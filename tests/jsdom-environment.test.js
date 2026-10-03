/**
 * @jest-environment ./tests/jsdom-environment.cjs
 */
const { version } = require('jsdom/package.json');

test('uses the same jsdom release for Jest and manual windows', () => {
    expect(window.navigator.userAgent).toMatch(/jsdom\/30\./);
    expect(window.navigator.userAgent).toContain(`jsdom/${version}`);
});

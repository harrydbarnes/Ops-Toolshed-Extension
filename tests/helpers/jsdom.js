const jsdom = require('../../node_modules/jsdom');

// Keep the registry across jest.resetModules(), which several suites use.
const activeDoms = globalThis.__activeTestDoms ||= new Set();

class ManagedJSDOM extends jsdom.JSDOM {
    constructor(html, options = {}) {
        const beforeParse = options.beforeParse;
        super(html, {
            ...options,
            beforeParse(window) {
                if (globalThis.__collectScriptCoverage) {
                    window.__coverage__ = globalThis.__coverage__ ||= {};
                }
                beforeParse?.(window);
            }
        });
        activeDoms.add(this);
        const close = this.window.close.bind(this.window);
        this.window.close = () => {
            activeDoms.delete(this);
            close();
        };
    }
}

module.exports = { ...jsdom, JSDOM: ManagedJSDOM };

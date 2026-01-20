const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

function setupTestEnvironment(featureScriptContent, options = {}) {
    const utilsScript = fs.readFileSync(path.resolve(__dirname, '../utils.js'), 'utf8');
    const url = options.url || "https://groupmuk-prisma.mediaocean.com/campaign-management/";

    const dom = new JSDOM('<!DOCTYPE html><html><body><div id="content">Content</div></body></html>', {
        url: url,
        runScripts: "dangerously",
        resources: "usable"
    });
    const window = dom.window;
    const document = window.document;

    // Mock innerText for JSDOM if missing (useful for text content checks)
    if (!('innerText' in window.HTMLElement.prototype)) {
        Object.defineProperty(window.HTMLElement.prototype, 'innerText', {
            get() {
                return this.textContent || "";
            },
            configurable: true
        });
    }

    // Mock Chrome API
    window.chrome = {
        runtime: {
            id: 'mock-extension-id',
            lastError: null,
            sendMessage: jest.fn().mockResolvedValue({})
        },
        storage: {
            sync: {
                get: jest.fn((key, cb) => {
                    // Default behavior, can be overridden by individual tests
                    cb({});
                })
            },
            local: {
                get: jest.fn((keys, cb) => {
                    const res = {};
                    if (Array.isArray(keys)) keys.forEach(k => res[k] = null);
                    else res[keys] = null;
                    cb(res);
                }),
                set: jest.fn()
            },
            onChanged: {
                addListener: jest.fn()
            }
        }
    };

    // Inject utils
    const utilsScriptEl = document.createElement('script');
    utilsScriptEl.textContent = utilsScript;
    document.body.appendChild(utilsScriptEl);

    // Inject feature script if provided
    if (featureScriptContent) {
        const scriptEl = document.createElement('script');
        scriptEl.textContent = featureScriptContent;
        document.body.appendChild(scriptEl);
    }

    return { window, document, dom };
}

module.exports = { setupTestEnvironment };

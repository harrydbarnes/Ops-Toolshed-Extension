const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const utilsScript = fs.readFileSync(path.resolve(__dirname, '../../utils.js'), 'utf8');
const logoScript = fs.readFileSync(path.resolve(__dirname, '../../features/logo.js'), 'utf8');
const prismaLogoPath = 'M9.23616 0C4.13364 0 0 3.78471 0 8.455C0 13.1253 4.13364 16.91 9.23616 16.91';

function setupLogoFeature() {
    const dom = new JSDOM(`<!doctype html><html><body>
        <div id="prisma-shell"></div>
    </body></html>`, {
        url: 'https://groupmuk-prisma.mediaocean.com/',
        runScripts: 'dangerously'
    });
    const { window } = dom;
    const shadowRoot = window.document.getElementById('prisma-shell').attachShadow({ mode: 'open' });
    shadowRoot.innerHTML = `<div class="current-prisma-brand">
        <svg width="20" height="28"><path d="${prismaLogoPath}"></path></svg>
    </div>`;
    const storageListeners = [];
    window.chrome = {
        runtime: {
            id: 'test-extension',
            lastError: null,
            getURL: jest.fn(file => `chrome-extension://test/${file}`)
        },
        storage: {
            sync: {
                get: jest.fn((key, callback) => callback({ logoReplaceEnabled: true }))
            },
            onChanged: {
                addListener: jest.fn(listener => storageListeners.push(listener))
            }
        }
    };

    window.eval(utilsScript);
    window.eval(logoScript);
    return { window, document: window.document, shadowRoot, storageListeners };
}

describe('Prisma logo replacement', () => {
    let window;

    afterEach(() => {
        window?.close();
    });

    test('restores the original SVG when the setting is disabled without requiring an i.logo parent', () => {
        const environment = setupLogoFeature();
        window = environment.window;
        const { shadowRoot, storageListeners } = environment;
        expect(shadowRoot.querySelector('.custom-prisma-logo')).not.toBeNull();
        expect(shadowRoot.querySelector('.current-prisma-brand svg')).toBeNull();

        storageListeners[0]({
            logoReplaceEnabled: { oldValue: true, newValue: false }
        }, 'sync');

        expect(shadowRoot.querySelector('.custom-prisma-logo')).toBeNull();
        expect(shadowRoot.querySelector('.current-prisma-brand svg')).not.toBeNull();
    });
});

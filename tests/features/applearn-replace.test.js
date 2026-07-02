const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const featureCode = fs.readFileSync(
    path.resolve(__dirname, '../../features/applearn-replace.js'),
    'utf8'
);

function createFeature({ enabled = true, inShadowRoot = false } = {}) {
    const dom = new JSDOM('<!doctype html><html><head></head><body><div id="host"></div></body></html>', {
        runScripts: 'dangerously'
    });
    const { window } = dom;
    const root = inShadowRoot
        ? window.document.getElementById('host').attachShadow({ mode: 'open' })
        : window.document.body;
    const image = window.document.createElement('img');
    image.src = 'https://cdn.applearn.tv/GroupM/Images/split_screen_icon.png';
    root.appendChild(image);

    let storageListener;
    window.chrome = {
        storage: {
            sync: {
                get: jest.fn((_defaults, callback) => callback({ appLearnReplaceEnabled: enabled }))
            },
            onChanged: {
                addListener: jest.fn(listener => { storageListener = listener; })
            }
        }
    };
    window.utils = {
        queryShadowDom: jest.fn(() => image)
    };
    window.eval(featureCode);

    return { dom, image, root, storageListener, feature: window.appLearnFeature };
}

describe('AppLearn transparency feature', () => {
    test('injects transparency styles into the image shadow root when enabled', () => {
        const context = createFeature({ enabled: true, inShadowRoot: true });
        context.feature.initialize();

        expect(context.image.dataset.toolshedTranslucent).toBe('true');
        expect(context.root.querySelector('#toolshed-applearn-styles')).not.toBeNull();
        expect(context.dom.window.document.head.querySelector('#toolshed-applearn-styles')).toBeNull();
        context.dom.window.close();
    });

    test('does not apply transparency when disabled', () => {
        const context = createFeature({ enabled: false });
        context.feature.initialize();
        context.feature.applyTransparency();

        expect(context.image.dataset.toolshedTranslucent).toBeUndefined();
        expect(context.dom.window.document.querySelector('#toolshed-applearn-styles')).toBeNull();
        context.dom.window.close();
    });

    test('removes and reapplies transparency when the setting changes', () => {
        const context = createFeature({ enabled: true });
        context.feature.initialize();
        expect(context.image.dataset.toolshedTranslucent).toBe('true');

        context.storageListener(
            { appLearnReplaceEnabled: { oldValue: true, newValue: false } },
            'sync'
        );
        expect(context.image.dataset.toolshedTranslucent).toBeUndefined();

        context.storageListener(
            { appLearnReplaceEnabled: { oldValue: false, newValue: true } },
            'sync'
        );
        expect(context.image.dataset.toolshedTranslucent).toBe('true');
        context.dom.window.close();
    });
});

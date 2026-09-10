const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const guardPath = path.resolve(__dirname, '../../features/applearn-popup-guard.js');
const controllerPath = path.resolve(__dirname, '../../features/applearn-popup-guard-controller.js');
const manifest = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../../manifest.json'), 'utf8')
);
const { CONTENT_SCRIPT_DEFINITIONS } = require('../../background/content-script-definitions');

describe('AppLearn popup guard', () => {
    test('runs in the page world at document_start on every Mediaocean frame', () => {
        const registration = CONTENT_SCRIPT_DEFINITIONS.find(entry =>
            entry.js?.includes('features/applearn-popup-guard.js')
        );

        expect(registration).toMatchObject({
            matches: ['https://*.mediaocean.com/*'],
            runAt: 'document_start',
            allFrames: true,
            world: 'MAIN'
        });
        expect(fs.existsSync(controllerPath)).toBe(true);
    });

    test('prevents matching popup launches before a tab is created and updates live', () => {
        const dom = new JSDOM('<!doctype html><a id="blocked" target="_blank" href="https://splitscreen-adopt.applearn.tv/">Open</a>', {
            runScripts: 'outside-only',
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/'
        });
        const { window } = dom;
        window.document.documentElement.setAttribute('data-ops-toolshed-applearn-popup-active', 'true');
        const nativeOpen = jest.fn(() => ({ opened: true }));
        window.open = nativeOpen;
        window.eval(fs.readFileSync(guardPath, 'utf8'));

        expect(window.open('https://splitscreen-adopt.applearn.tv/')).toBeNull();
        expect(window.open('https://wpp.okta.com/app/wpp_groupmapplearndev_1/example/sso/saml')).toBeNull();
        expect(nativeOpen).not.toHaveBeenCalled();

        const click = new window.MouseEvent('click', { bubbles: true, cancelable: true });
        expect(window.document.getElementById('blocked').dispatchEvent(click)).toBe(false);

        window.document.dispatchEvent(new window.CustomEvent(
            'ops-toolshed:applearn-popup-setting',
            { detail: false }
        ));

        expect(window.open('https://splitscreen-adopt.applearn.tv/')).toEqual({ opened: true });
        expect(nativeOpen).toHaveBeenCalledTimes(1);
        dom.window.close();
    });

    test('does not block lookalike hosts or unrelated destinations', () => {
        const dom = new JSDOM('<!doctype html>', {
            runScripts: 'outside-only',
            url: 'https://groupmuk-prisma.mediaocean.com/'
        });
        const { window } = dom;
        window.document.documentElement.setAttribute('data-ops-toolshed-applearn-popup-active', 'true');
        const nativeOpen = jest.fn(() => ({ opened: true }));
        window.open = nativeOpen;
        window.eval(fs.readFileSync(guardPath, 'utf8'));

        expect(window.open('https://splitscreen-adopt.applearn.tv.example.com/')).toEqual({ opened: true });
        expect(window.open('https://example.com/')).toEqual({ opened: true });
        expect(nativeOpen).toHaveBeenCalledTimes(2);
        dom.window.close();
    });
});

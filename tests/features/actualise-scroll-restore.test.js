const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const featureScript = fs.readFileSync(
    path.resolve(__dirname, '../../features/actualise-scroll-restore.js'),
    'utf8'
);

function makeScrollable(element, scrollLeft = 0) {
    Object.defineProperty(element, 'scrollWidth', { configurable: true, value: 1600 });
    Object.defineProperty(element, 'clientWidth', { configurable: true, value: 500 });
    element.scrollLeft = scrollLeft;
    return element;
}

function createPage(enabled = true, parentEnabled = true) {
    const dom = new JSDOM('<!doctype html><html><body><div id="actualise-grid" class="actualise-grid"></div><button id="save">Save</button></body></html>', {
        url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#ptb-ctx=actualize&route=actualize',
        runScripts: 'dangerously'
    });

    dom.window.chrome = {
        storage: {
            sync: {
                get: (_keys, callback) => callback({
                    actualiseScrollRestoreEnabled: enabled,
                    optimisedNewNavEnabled: parentEnabled
                })
            },
            onChanged: { addListener: () => {} }
        }
    };
    dom.window.eval(featureScript);
    return dom;
}

describe('Actualise horizontal scroll restoration', () => {
    test('restores the interacted grid after Prisma replaces it during an action', () => {
        const dom = createPage();
        const { document } = dom.window;
        const original = makeScrollable(document.getElementById('actualise-grid'), 640);

        dom.window.actualiseScrollRestoreFeature.initialize();
        original.dispatchEvent(new dom.window.Event('scroll'));
        dom.window.actualiseScrollRestoreFeature.captureBeforeAction();

        const replacement = makeScrollable(original.cloneNode(), 0);
        original.replaceWith(replacement);
        dom.window.actualiseScrollRestoreFeature.restoreScrollPosition();

        expect(replacement.scrollLeft).toBe(640);
        dom.window.close();
    });

    test('restores the same grid when a soft reload resets it to zero', () => {
        const dom = createPage();
        const grid = makeScrollable(dom.window.document.getElementById('actualise-grid'), 420);

        dom.window.actualiseScrollRestoreFeature.initialize();
        grid.dispatchEvent(new dom.window.Event('scroll'));
        dom.window.actualiseScrollRestoreFeature.captureBeforeAction();
        grid.scrollLeft = 0;
        dom.window.actualiseScrollRestoreFeature.restoreScrollPosition();

        expect(grid.scrollLeft).toBe(420);
        dom.window.close();
    });

    test('restores all synchronized Handsontable scrollers after Save', () => {
        const dom = createPage();
        const master = makeScrollable(dom.window.document.getElementById('actualise-grid'), 346);
        master.className = 'wtHolder';
        const headerClone = makeScrollable(master.cloneNode(), 346);
        master.after(headerClone);

        dom.window.actualiseScrollRestoreFeature.initialize();
        headerClone.dispatchEvent(new dom.window.Event('scroll'));
        dom.window.actualiseScrollRestoreFeature.captureBeforeAction();
        master.scrollLeft = 0;
        dom.window.actualiseScrollRestoreFeature.restoreScrollPosition();

        expect(master.scrollLeft).toBe(346);
        expect(headerClone.scrollLeft).toBe(346);
        dom.window.close();
    });

    test('keeps the position through Prisma save cycles lasting up to fifteen seconds', () => {
        const dom = createPage();
        const grid = makeScrollable(dom.window.document.getElementById('actualise-grid'), 510);
        let now = 0;
        dom.window.Date.now = () => now;

        dom.window.actualiseScrollRestoreFeature.initialize();
        grid.dispatchEvent(new dom.window.Event('scroll'));
        dom.window.actualiseScrollRestoreFeature.captureBeforeAction();
        now = 12000;
        grid.scrollLeft = 0;
        dom.window.actualiseScrollRestoreFeature.restoreScrollPosition();

        expect(grid.scrollLeft).toBe(510);
        dom.window.close();
    });

    test('does nothing when disabled', () => {
        const dom = createPage(false);
        const grid = makeScrollable(dom.window.document.getElementById('actualise-grid'), 300);

        dom.window.actualiseScrollRestoreFeature.initialize();
        grid.dispatchEvent(new dom.window.Event('scroll'));
        dom.window.actualiseScrollRestoreFeature.captureBeforeAction();
        grid.scrollLeft = 0;
        dom.window.actualiseScrollRestoreFeature.restoreScrollPosition();

        expect(grid.scrollLeft).toBe(0);
        dom.window.close();
    });

    test('does nothing while the optimised navigation parent is disabled', () => {
        const dom = createPage(true, false);
        const grid = makeScrollable(dom.window.document.getElementById('actualise-grid'), 300);

        dom.window.actualiseScrollRestoreFeature.initialize();
        grid.dispatchEvent(new dom.window.Event('scroll'));
        dom.window.actualiseScrollRestoreFeature.captureBeforeAction();
        grid.scrollLeft = 0;
        dom.window.actualiseScrollRestoreFeature.restoreScrollPosition();

        expect(grid.scrollLeft).toBe(0);
        dom.window.close();
    });
});

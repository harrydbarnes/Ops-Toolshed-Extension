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

function createPage(enabled = true) {
    const dom = new JSDOM('<!doctype html><html><body><div id="actualise-grid" class="actualise-grid"></div><button id="approval">Yes</button><button id="save">Save</button><button id="cancel">Cancel</button></body></html>', {
        url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#ptb-ctx=actualize&route=actualize',
        runScripts: 'dangerously'
    });

    dom.window.chrome = {
        storage: {
            sync: {
                get: (_keys, callback) => callback({ actualiseScrollRestoreEnabled: enabled })
            },
            onChanged: { addListener: () => {} }
        }
    };
    dom.window.setTimeout = () => 0;
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

    test('targets matching Handsontable scrollers without scanning every page element', () => {
        const dom = createPage();
        const { document } = dom.window;
        document.body.insertAdjacentHTML(
            'beforeend',
            Array.from({ length: 1000 }, (_, index) => `<div class="unrelated-${index}"></div>`).join('')
        );
        const master = makeScrollable(document.getElementById('actualise-grid'), 280);
        master.removeAttribute('id');
        master.className = 'wtHolder';
        const headerClone = makeScrollable(master.cloneNode(), 280);
        master.after(headerClone);

        dom.window.actualiseScrollRestoreFeature.initialize();
        master.dispatchEvent(new dom.window.Event('scroll'));
        dom.window.actualiseScrollRestoreFeature.captureBeforeAction();
        master.scrollLeft = 0;
        headerClone.scrollLeft = 0;
        const querySelectorAll = jest.spyOn(document, 'querySelectorAll');

        dom.window.actualiseScrollRestoreFeature.restoreScrollPosition();

        expect(master.scrollLeft).toBe(280);
        expect(headerClone.scrollLeft).toBe(280);
        expect(querySelectorAll.mock.calls.some(([selector]) => selector === '*')).toBe(false);
        dom.window.close();
    });

    test('uses direct ID lookup when Prisma replaces an identified scroller', () => {
        const dom = createPage();
        const { document } = dom.window;
        const original = makeScrollable(document.getElementById('actualise-grid'), 375);

        dom.window.actualiseScrollRestoreFeature.initialize();
        original.dispatchEvent(new dom.window.Event('scroll'));
        dom.window.actualiseScrollRestoreFeature.captureBeforeAction();
        const replacement = makeScrollable(original.cloneNode(), 0);
        original.replaceWith(replacement);
        const querySelectorAll = jest.spyOn(document, 'querySelectorAll');

        dom.window.actualiseScrollRestoreFeature.restoreScrollPosition();

        expect(replacement.scrollLeft).toBe(375);
        expect(querySelectorAll).not.toHaveBeenCalled();
        dom.window.close();
    });

    test('falls back to the live Handsontable grid if Prisma changes the scroller identity', () => {
        const dom = createPage();
        const { document } = dom.window;
        const original = makeScrollable(document.getElementById('actualise-grid'), 515);

        dom.window.actualiseScrollRestoreFeature.initialize();
        original.dispatchEvent(new dom.window.Event('scroll'));
        dom.window.actualiseScrollRestoreFeature.captureBeforeAction();
        const replacement = makeScrollable(document.createElement('div'), 0);
        replacement.className = 'wtHolder';
        original.replaceWith(replacement);

        dom.window.actualiseScrollRestoreFeature.restoreScrollPosition();

        expect(replacement.scrollLeft).toBe(515);
        dom.window.close();
    });

    test('ignores a matching ID that is no longer horizontally scrollable', () => {
        const dom = createPage();
        const { document } = dom.window;
        const original = makeScrollable(document.getElementById('actualise-grid'), 455);

        dom.window.actualiseScrollRestoreFeature.initialize();
        original.dispatchEvent(new dom.window.Event('scroll'));
        dom.window.actualiseScrollRestoreFeature.captureBeforeAction();

        const collapsedReplacement = original.cloneNode();
        Object.defineProperty(collapsedReplacement, 'scrollWidth', { configurable: true, value: 500 });
        Object.defineProperty(collapsedReplacement, 'clientWidth', { configurable: true, value: 500 });
        original.replaceWith(collapsedReplacement);
        const liveGrid = makeScrollable(document.createElement('div'), 0);
        liveGrid.className = 'wtHolder';
        collapsedReplacement.after(liveGrid);

        dom.window.actualiseScrollRestoreFeature.restoreScrollPosition();

        expect(collapsedReplacement.scrollLeft).toBe(0);
        expect(liveGrid.scrollLeft).toBe(455);
        dom.window.close();
    });

    test('preserves the pre-editor position when Prisma scrolls before Save', () => {
        const dom = createPage();
        const { document } = dom.window;
        const grid = makeScrollable(document.getElementById('actualise-grid'), 346);

        dom.window.actualiseScrollRestoreFeature.initialize();
        grid.dispatchEvent(new dom.window.Event('scroll'));
        document.getElementById('approval').dispatchEvent(
            new dom.window.MouseEvent('pointerdown', { bubbles: true })
        );

        grid.scrollLeft = 20;
        grid.dispatchEvent(new dom.window.Event('scroll'));
        document.getElementById('save').dispatchEvent(
            new dom.window.MouseEvent('pointerdown', { bubbles: true })
        );
        grid.scrollLeft = 0;
        dom.window.actualiseScrollRestoreFeature.restoreScrollPosition();

        expect(grid.scrollLeft).toBe(346);
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

    test('allows a manual horizontal scroll during the restore window', () => {
        const dom = createPage();
        const grid = makeScrollable(dom.window.document.getElementById('actualise-grid'), 640);

        dom.window.actualiseScrollRestoreFeature.initialize();
        grid.dispatchEvent(new dom.window.Event('scroll'));
        dom.window.actualiseScrollRestoreFeature.captureBeforeAction();
        grid.scrollLeft = 0;
        dom.window.actualiseScrollRestoreFeature.restoreScrollPosition();

        grid.dispatchEvent(new dom.window.WheelEvent('wheel', {
            bubbles: true,
            deltaX: -180
        }));
        grid.scrollLeft = 260;
        grid.dispatchEvent(new dom.window.Event('scroll'));
        dom.window.actualiseScrollRestoreFeature.restoreScrollPosition();

        expect(grid.scrollLeft).toBe(260);
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

});

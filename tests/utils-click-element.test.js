const { JSDOM } = require('jsdom');
const path = require('path');
const { readScript } = require('./helpers/read-script');
const source = readScript(path.resolve(__dirname, '../utils.js'));

describe('shared Prisma click helper', () => {
    let dom;
    beforeEach(() => {
        dom = new JSDOM('<iframe></iframe>', { runScripts: 'outside-only' });
        dom.window.eval(source);
    });
    afterEach(() => dom.window.close());

    test.each([false, true])('dispatches mouse events in the target frame with pointer support %s', pointers => {
        const view = dom.window.document.querySelector('iframe').contentWindow;
        view.PointerEvent = pointers ? view.MouseEvent : undefined;
        const button = view.document.createElement('button');
        view.document.body.append(button);
        button.getBoundingClientRect = () => ({ left: 10, top: 20, width: 100, height: 40 });
        const events = [];
        for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
            button.addEventListener(type, event => {
                events.push({ type: event.type, buttons: event.buttons });
                expect(event).toBeInstanceOf(view.MouseEvent);
                expect(event.view).toBe(view);
                expect([event.clientX, event.clientY]).toEqual([60, 40]);
                expect(event.bubbles && event.cancelable && event.composed).toBe(true);
            });
        }
        dom.window.utils.clickElement(button);
        expect(events).toEqual([
            ...(pointers ? [{ type: 'pointerdown', buttons: 1 }] : []),
            { type: 'mousedown', buttons: 1 },
            ...(pointers ? [{ type: 'pointerup', buttons: 0 }] : []),
            { type: 'mouseup', buttons: 0 },
            { type: 'click', buttons: 0 }
        ]);
    });
});

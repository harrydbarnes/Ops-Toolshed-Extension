// jsdom cannot construct trusted DOM events. Capture the listener and invoke it
// with the same event shape a browser supplies, while separate tests dispatch
// real synthetic events to verify that the trust gate rejects page scripts.
function captureTrustedListener(window, root, type) {
    const listeners = [];
    const original = root.addEventListener.bind(root);
    root.addEventListener = (eventType, listener, options) => {
        if (eventType === type) listeners.push(listener);
        return original(eventType, listener, options);
    };
    return (target, properties = {}) => {
        const path = [];
        for (let node = target; node; node = node.parentNode || node.host) path.push(node);
        path.push(window, window.document);
        const event = {
            isTrusted: true,
            target,
            composedPath: () => path,
            preventDefault: jest.fn(),
            stopPropagation: jest.fn(),
            stopImmediatePropagation: jest.fn(),
            clientX: 0,
            clientY: 0,
            ...properties
        };
        listeners.forEach(listener => listener.call(root, event));
        return event;
    };
}

module.exports = { captureTrustedListener };

function captureTrustedClicks(window) {
    const listeners = new WeakMap();
    const original = window.EventTarget.prototype.addEventListener;
    window.EventTarget.prototype.addEventListener = function(type, listener, options) {
        if (type === 'click') {
            const entries = listeners.get(this) || [];
            entries.push(listener);
            listeners.set(this, entries);
        }
        return original.call(this, type, listener, options);
    };
    return target => {
        const path = [];
        for (let node = target; node; node = node.parentNode || node.host) path.push(node);
        const event = {
            isTrusted: true,
            target,
            composedPath: () => path,
            preventDefault: jest.fn(),
            stopPropagation: jest.fn(),
            stopImmediatePropagation: jest.fn()
        };
        for (const node of path) {
            for (const listener of listeners.get(node) || []) listener.call(node, event);
        }
        return event;
    };
}

module.exports.captureTrustedClicks = captureTrustedClicks;

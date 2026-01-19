const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const remindersScript = fs.readFileSync(path.resolve(__dirname, '../../features/reminders.js'), 'utf8');

describe('Reminders Feature Logic', () => {
    let window, document;

    beforeEach(() => {
        const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
            runScripts: "dangerously",
            resources: "usable",
            url: "https://example.com/test"
        });
        window = dom.window;
        document = window.document;

        // Mock innerText for JSDOM (simplistic)
        Object.defineProperty(window.HTMLElement.prototype, 'innerText', {
            get() {
                return this.textContent || "";
            },
            configurable: true
        });

        // Mock utils
        window.utils = {
            escapeHTML: (str) => str
        };

        // Mock Chrome API
        window.chrome = {
            runtime: { id: 'test-id', lastError: null },
            storage: {
                sync: {
                    get: jest.fn((keys, cb) => cb({})),
                },
                onChanged: {
                    addListener: jest.fn()
                },
                local: {
                    get: jest.fn((keys, cb) => cb({})),
                    set: jest.fn()
                }
            }
        };

        // Inject script
        const scriptEl = document.createElement('script');
        scriptEl.textContent = remindersScript;
        document.body.appendChild(scriptEl);
    });

    test('should match OR logic (default)', () => {
        const reminder = {
            id: '1',
            name: 'Test OR',
            urlPattern: '*://example.com/*',
            textTrigger: 'foo, bar',
            triggerLogic: 'OR',
            enabled: true,
            popupMessage: 'popup'
        };

        window.chrome.storage.sync.get = jest.fn((keys, cb) => {
             // In fetchCustomReminders it calls get({customReminders: []}, cb)
             cb({ customReminders: [reminder] });
        });

        return window.remindersFeature.fetchCustomReminders().then(() => {
             document.body.textContent = "This page contains foo only.";
             window.remindersFeature.checkCustomReminders();
             const popup = document.getElementById('custom-reminder-display-popup');
             expect(popup).not.toBeNull();
             expect(popup.innerHTML).toContain('Test OR');
        });
    });

    test('should match OR logic implicit (backward compatibility)', () => {
        const reminder = {
            id: '1b',
            name: 'Test OR Implicit',
            urlPattern: '*://example.com/*',
            textTrigger: 'foo, bar',
            // triggerLogic is undefined
            enabled: true,
            popupMessage: 'popup'
        };

        window.chrome.storage.sync.get = jest.fn((keys, cb) => {
             cb({ customReminders: [reminder] });
        });

        return window.remindersFeature.fetchCustomReminders().then(() => {
             document.body.textContent = "This page contains bar only.";
             window.remindersFeature.checkCustomReminders();
             const popup = document.getElementById('custom-reminder-display-popup');
             expect(popup).not.toBeNull();
             expect(popup.innerHTML).toContain('Test OR Implicit');
        });
    });

    test('should match ALL logic', () => {
        const reminder = {
            id: '2',
            name: 'Test ALL',
            urlPattern: '*://example.com/*',
            textTrigger: 'foo, bar',
            triggerLogic: 'ALL',
            enabled: true,
            popupMessage: 'popup'
        };

        window.chrome.storage.sync.get = jest.fn((keys, cb) => {
             cb({ customReminders: [reminder] });
        });

        return window.remindersFeature.fetchCustomReminders().then(() => {
             // Case 1: Only foo present -> Fail
             document.body.textContent = "This page contains foo only.";
             window.remindersFeature.checkCustomReminders();
             let popup = document.getElementById('custom-reminder-display-popup');
             expect(popup).toBeNull();

             // Case 2: foo and bar present -> Pass
             document.body.textContent = "This page contains foo and bar.";
             window.remindersFeature.checkCustomReminders();
             popup = document.getElementById('custom-reminder-display-popup');
             expect(popup).not.toBeNull();
             expect(popup.innerHTML).toContain('Test ALL');
        });
    });

    test('should fail ALL logic if one missing', () => {
         const reminder = {
            id: '3',
            name: 'Test ALL Fail',
            urlPattern: '*://example.com/*',
            textTrigger: 'foo, bar, baz',
            triggerLogic: 'ALL',
            enabled: true,
            popupMessage: 'popup'
        };

        window.chrome.storage.sync.get = jest.fn((keys, cb) => {
             cb({ customReminders: [reminder] });
        });

        return window.remindersFeature.fetchCustomReminders().then(() => {
             document.body.textContent = "This page contains foo and bar but not the third one.";
             window.remindersFeature.checkCustomReminders();
             const popup = document.getElementById('custom-reminder-display-popup');
             expect(popup).toBeNull();
        });
    });
});

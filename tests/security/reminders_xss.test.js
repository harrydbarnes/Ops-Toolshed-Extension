const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const utilsScript = fs.readFileSync(path.resolve(__dirname, '../../utils.js'), 'utf8');
const featureScript = fs.readFileSync(path.resolve(__dirname, '../../features/reminders.js'), 'utf8');

describe('Reminders Feature Security (XSS)', () => {
    let window, document;

    beforeEach(() => {
        jest.useFakeTimers();
        const dom = new JSDOM('<!DOCTYPE html><html><body><div id="content">Content</div></body></html>', {
            url: "https://groupmuk-prisma.mediaocean.com/campaign-management/",
            runScripts: "dangerously",
            resources: "usable"
        });
        window = dom.window;
        document = window.document;

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
                        cb({
                            metaReminderEnabled: true,
                            iasReminderEnabled: true,
                            customReminders: []
                        });
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

        // Inject feature script
        const scriptEl = document.createElement('script');
        scriptEl.textContent = featureScript;
        document.body.appendChild(scriptEl);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('should NOT execute XSS in custom reminder popupMessage', () => {
        const maliciousPayload = '<img src=x onerror=alert(1)>';
        const maliciousReminder = {
            id: 'malicious_1',
            name: 'Malicious Reminder',
            urlPattern: '*',
            textTrigger: [],
            enabled: true,
            popupMessage: `<h3>Title</h3><p>Body ${maliciousPayload}</p>`
        };

        window.chrome.storage.sync.get = jest.fn((key, cb) => {
             cb({
                customReminders: [maliciousReminder]
            });
        });

        return window.remindersFeature.fetchCustomReminders().then(() => {
            window.remindersFeature.checkCustomReminders();

            const popup = document.getElementById('custom-reminder-display-popup');
            expect(popup).not.toBeNull();

            // If vulnerable, innerHTML will contain the img tag
            const imgTag = popup.querySelector('img');

            // We expect XSS to be prevented, so imgTag should be null (or sanitized)
            expect(imgTag).toBeNull();

            const pTag = popup.querySelector('p');
            expect(pTag).not.toBeNull();
            // JSDOM textContent of <p>Body <img...></p> is "Body "
            expect(pTag.textContent).toContain('Body');
        });
    });

    test('should render valid custom reminder content correctly', () => {
        const validReminder = {
            id: 'valid_1',
            name: 'Valid Reminder',
            urlPattern: '*',
            textTrigger: [],
            enabled: true,
            popupMessage: `<h3>Valid Title</h3><p>This is a valid reminder.</p><ul><li>Step 1</li><li>Step 2</li></ul>`
        };

        window.chrome.storage.sync.get = jest.fn((key, cb) => {
             cb({
                customReminders: [validReminder]
            });
        });

        return window.remindersFeature.fetchCustomReminders().then(() => {
            window.remindersFeature.checkCustomReminders();

            const popup = document.getElementById('custom-reminder-display-popup');
            expect(popup).not.toBeNull();

            expect(popup.querySelector('h3').textContent).toBe('Valid Reminder'); // The outer name
            const headers = popup.querySelectorAll('h3');
            expect(headers.length).toBe(2);
            expect(headers[1].textContent).toBe('Valid Title');

            expect(popup.querySelector('p').textContent).toBe('This is a valid reminder.');

            const listItems = popup.querySelectorAll('li');
            expect(listItems.length).toBe(2);
            expect(listItems[0].textContent).toBe('Step 1');
            expect(listItems[1].textContent).toBe('Step 2');
        });
    });

    test('should render plain text and multiple paragraphs', () => {
        const complexReminder = {
            id: 'complex_1',
            name: 'Complex Reminder',
            urlPattern: '*',
            textTrigger: [],
            enabled: true,
            popupMessage: `Just some text.<p>Para 1</p><p>Para 2</p>`
        };

        window.chrome.storage.sync.get = jest.fn((key, cb) => {
             cb({
                customReminders: [complexReminder]
            });
        });

        return window.remindersFeature.fetchCustomReminders().then(() => {
            window.remindersFeature.checkCustomReminders();

            const popup = document.getElementById('custom-reminder-display-popup');
            expect(popup).not.toBeNull();

            expect(popup.textContent).toContain('Just some text.');

            const paragraphs = popup.querySelectorAll('p');
            expect(paragraphs.length).toBe(2);
            expect(paragraphs[0].textContent).toBe('Para 1');
            expect(paragraphs[1].textContent).toBe('Para 2');
        });
    });
});

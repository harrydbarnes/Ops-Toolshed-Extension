const fs = require('fs');
const path = require('path');
const { setupTestEnvironment } = require('../test-utils');

const featureScript = fs.readFileSync(path.resolve(__dirname, '../../features/reminders.js'), 'utf8');

describe('Reminders Feature Security (XSS)', () => {
    let window, document;

    beforeEach(() => {
        jest.useFakeTimers();
        const env = setupTestEnvironment(featureScript);
        window = env.window;
        document = env.document;
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('should NOT execute XSS in custom reminder popupMessage', async () => {
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

        await window.remindersFeature.fetchCustomReminders();
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

    test('should render valid custom reminder content correctly', async () => {
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

        await window.remindersFeature.fetchCustomReminders();
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

    test('should render plain text and multiple paragraphs', async () => {
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

        await window.remindersFeature.fetchCustomReminders();
        window.remindersFeature.checkCustomReminders();

        const popup = document.getElementById('custom-reminder-display-popup');
        expect(popup).not.toBeNull();

        expect(popup.textContent).toContain('Just some text.');

        const paragraphs = popup.querySelectorAll('p');
        expect(paragraphs.length).toBe(2);
        expect(paragraphs[0].textContent).toBe('Para 1');
        expect(paragraphs[1].textContent).toBe('Para 2');
    });

    test('should support nested allowed tags', async () => {
        const nestedReminder = {
            id: 'nested_1',
            name: 'Nested Reminder',
            urlPattern: '*',
            textTrigger: [],
            enabled: true,
            popupMessage: '<p><b>Bold and <i>Italic</i></b></p><ul><li><b>Bold Item</b></li></ul>'
        };

        window.chrome.storage.sync.get = jest.fn((key, cb) => {
             cb({
                customReminders: [nestedReminder]
            });
        });

        await window.remindersFeature.fetchCustomReminders();
        window.remindersFeature.checkCustomReminders();

        const popup = document.getElementById('custom-reminder-display-popup');
        expect(popup).not.toBeNull();

        // Check for nested structure
        const bold = popup.querySelector('b');
        expect(bold).not.toBeNull();
        expect(bold.textContent).toContain('Bold and Italic');

        const italic = bold.querySelector('i');
        expect(italic).not.toBeNull();
        expect(italic.textContent).toBe('Italic');

        const listItem = popup.querySelector('li');
        expect(listItem).not.toBeNull();
        expect(listItem.innerHTML).toContain('<b>Bold Item</b>');
    });
});

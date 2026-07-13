const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const settingsHtml = fs.readFileSync(path.resolve(__dirname, '../settings.html'), 'utf8');
const settingsScript = fs.readFileSync(path.resolve(__dirname, '../settings.js'), 'utf8');
const utilsScript = fs.readFileSync(path.resolve(__dirname, '../utils.js'), 'utf8');
let activeDom;

function setupSettings(customReminders = []) {
    const dom = new JSDOM(settingsHtml, {
        url: 'chrome-extension://test/settings.html',
        runScripts: 'outside-only'
    });
    activeDom = dom;
    const { window } = dom;
    const store = { customReminders };

    const readStorage = (keys) => {
        if (Array.isArray(keys)) {
            return Object.fromEntries(keys.map(key => [key, store[key]]));
        }
        if (typeof keys === 'string') return { [keys]: store[keys] };
        if (keys && typeof keys === 'object') return { ...keys, ...store };
        return { ...store };
    };

    window.chrome = {
        runtime: {
            id: 'test-extension',
            lastError: null,
            onMessage: { addListener: jest.fn() },
            sendMessage: jest.fn().mockResolvedValue({ status: 'success' })
        },
        storage: {
            sync: {
                get: jest.fn((keys, callback) => callback(readStorage(keys))),
                set: jest.fn((items, callback) => {
                    Object.assign(store, items);
                    if (callback) callback();
                })
            },
            local: {
                get: jest.fn((keys, callback) => callback(readStorage(keys))),
                remove: jest.fn((keys, callback) => callback && callback())
            },
            onChanged: { addListener: jest.fn() }
        },
        tabs: {
            query: jest.fn((query, callback) => callback([])),
            sendMessage: jest.fn().mockResolvedValue({})
        }
    };
    window.alert = jest.fn();
    window.eval(utilsScript);
    window.eval(settingsScript);
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));

    return { window, document: window.document, store };
}

describe('Custom reminder settings', () => {
    afterEach(() => {
        activeDom?.window.close();
        activeDom = undefined;
        jest.useRealTimers();
    });

    test('identifies the missing URL field and pre-fills a new popup title from the reminder name', () => {
        const { document } = setupSettings();
        document.getElementById('reminderName').value = 'CRUK RFL';
        document.getElementById('reminderUrlPattern').value = '';

        document.getElementById('nextButton').click();
        expect(document.getElementById('customReminderStatus').textContent).toBe('URL match is required.');

        document.getElementById('reminderUrlPattern').value = 'mediaocean.com';
        document.querySelector('.trigger-input').value = 'RFL';
        document.getElementById('nextButton').click();

        expect(document.getElementById('modalInputReminderTitle').value).toBe('⚠️ CRUK RFL ⚠️');
        expect(document.getElementById('modalReminderUrlPatternDisplay').textContent).toBe('*mediaocean.com*');
    });

    test('opens a clearly labelled overlay containing all editable reminder fields', () => {
        jest.useFakeTimers();
        const reminder = {
            id: 'custom_1',
            name: 'CRUK RFL',
            urlPattern: '*mediaocean.com*',
            textTrigger: ['RFL'],
            triggerLogic: 'OR',
            popupMessage: '<h3>⚠️ CRUK RFL ⚠️</h3><p>Old intro</p>',
            enabled: true
        };
        const { window, document, store } = setupSettings([reminder]);
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
        Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 983 });
        const editButton = Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Edit');

        editButton.click();
        expect(document.getElementById('reminderModalEditor').style.display).toBe('block');
        expect(document.getElementById('reminderModalEditor').classList).toContain('reminder-modal--editing');
        expect(document.getElementById('reminderModalOverlay').classList).toContain('reminder-modal-overlay--editing');
        expect(document.body.classList).toContain('reminder-modal-open');
        expect(document.body.style.getPropertyValue('--reminder-scrollbar-compensation')).toBe('17px');
        expect(document.getElementById('reminderModalEditor').getAttribute('role')).toBe('dialog');
        expect(document.getElementById('modalEditorTitle').textContent).toBe('Edit Custom Reminder');
        expect(document.getElementById('modalEditReminderName').value).toBe('CRUK RFL');
        expect(document.getElementById('modalEditUrlMatchType').value).toBe('contains');
        expect(document.getElementById('modalEditUrlPattern').value).toBe('mediaocean.com');
        expect(document.querySelector('.modal-trigger-input').value).toBe('RFL');

        document.getElementById('modalEditReminderName').value = 'CRUK RFL updated';
        document.querySelector('#modalEditUrlMatchTypeSegmented [data-value="pattern"]').click();
        document.getElementById('modalEditUrlPattern').value = '*://*.mediaocean.com/campaign-management/*';
        document.querySelector('.modal-trigger-input').value = 'Relay For Life';
        document.getElementById('modalEditTriggerLogic').value = 'ALL';
        document.getElementById('modalInputReminderTitle').value = '⚠️ Updated title ⚠️';
        document.getElementById('modalInputIntroSentence').value = 'Updated intro';
        document.getElementById('modalSaveButton').click();

        expect(document.getElementById('reminderModalEditor').classList).toContain('reminder-modal--closing');
        expect(document.getElementById('reminderModalOverlay').classList).toContain('reminder-modal-overlay--closing');
        expect(document.body.classList).toContain('reminder-modal-open');
        jest.advanceTimersByTime(200);

        expect(store.customReminders).toHaveLength(1);
        expect(store.customReminders[0]).toMatchObject({
            id: 'custom_1',
            name: 'CRUK RFL updated',
            urlPattern: '*://*.mediaocean.com/campaign-management/*',
            textTrigger: ['Relay For Life'],
            triggerLogic: 'ALL',
            enabled: true
        });
        expect(store.customReminders[0].popupMessage).toContain('Updated title');
        expect(store.customReminders[0].popupMessage).toContain('Updated intro');
        expect(document.body.classList).not.toContain('reminder-modal-open');
        expect(document.body.style.getPropertyValue('--reminder-scrollbar-compensation')).toBe('');
    });

    test('reduces a pasted long URL to its site in simple contains mode', () => {
        const { document } = setupSettings();
        document.getElementById('reminderUrlPattern').value = 'https://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP36746';

        document.getElementById('useReminderSiteOnly').click();

        expect(document.getElementById('reminderUrlMatchType').value).toBe('contains');
        expect(document.getElementById('reminderUrlPattern').value).toBe('groupmuk-prisma.mediaocean.com');
    });

    test('uses the shared segmented-control appearance for URL matching mode', () => {
        const { document } = setupSettings();
        const control = document.getElementById('reminderUrlMatchTypeSegmented');
        const buttons = control.querySelectorAll('button[data-value]');

        expect(control.classList).toContain('segmented-control');
        expect(buttons).toHaveLength(2);
        expect(buttons[0].textContent.trim()).toBe('Simple');
        expect(buttons[0].classList).toContain('is-selected');
        expect(buttons[1].textContent.trim()).toBe('Advanced');
    });
});

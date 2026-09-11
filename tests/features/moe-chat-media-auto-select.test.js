const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const featureCode = fs.readFileSync(
    path.resolve(__dirname, '../../features/moe-chat-media-auto-select.js'),
    'utf8'
);

describe('Moe chat media auto-select', () => {
    function createPage({ enabled = true, media = 'digital', options = ['Digital', 'Print'] } = {}) {
        const dom = new JSDOM(`<!doctype html><html><body>
            <div id="ptb-header"><mo-icon name="${media}"></mo-icon></div>
            <iframe name="Messaging window"></iframe>
        </body></html>`, {
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP123',
            runScripts: 'outside-only'
        });
        const { window } = dom;
        const frame = window.document.querySelector('iframe');
        const chatDocument = frame.contentDocument;
        chatDocument.body.innerHTML = `
            <div data-garden-id="containers.field">
                <div id="media-label">Media</div>
                <div id="media-trigger" data-garden-id="dropdowns.combobox.trigger" aria-controls="media-listbox">
                    <input id="media-input" role="combobox" aria-labelledby="media-label" aria-controls="media-listbox" value="-">
                </div>
            </div>
            <button id="send" type="button">Send</button>
        `;

        let storageListener;
        let sendCount = 0;
        const sendButton = chatDocument.getElementById('send');
        sendButton.addEventListener('click', () => { sendCount += 1; });

        const trigger = chatDocument.getElementById('media-trigger');
        trigger.addEventListener('click', () => {
            if (chatDocument.getElementById('media-listbox')) return;
            const listbox = chatDocument.createElement('ul');
            listbox.id = 'media-listbox';
            listbox.setAttribute('role', 'listbox');
            options.forEach((label, index) => {
                const option = chatDocument.createElement('li');
                option.id = `media-option-${index}`;
                option.setAttribute('role', 'option');
                option.textContent = label;
                option.addEventListener('click', () => {
                    chatDocument.getElementById('media-input').value = label;
                });
                listbox.appendChild(option);
            });
            chatDocument.body.appendChild(listbox);
        });

        window.chrome = {
            storage: {
                sync: {
                    get: jest.fn((defaults, callback) => callback({ ...defaults, moeChatMediaAutoSelectEnabled: enabled }))
                },
                onChanged: {
                    addListener: jest.fn(listener => { storageListener = listener; })
                }
            }
        };
        window.opsDiagnostics = { record: jest.fn() };
        window.eval(featureCode);
        window.moeChatMediaAutoSelectFeature.initialize();

        return {
            dom,
            window,
            chatDocument,
            sendButton,
            get sendCount() { return sendCount; },
            storageListener
        };
    }

    afterEach(() => {
        jest.useRealTimers();
    });

    test('detects the campaign media icon, selects the matching custom option, and sends once', () => {
        jest.useFakeTimers();
        const page = createPage();

        expect(page.window.moeChatMediaAutoSelectFeature.getCampaignMediaType()).toBe('Digital');
        page.window.moeChatMediaAutoSelectFeature.scan();
        jest.runAllTimers();

        expect(page.chatDocument.getElementById('media-input').value).toBe('Digital');
        expect(page.sendCount).toBe(1);
        expect(page.window.opsDiagnostics.record).toHaveBeenCalledWith(expect.objectContaining({
            source: 'moe-chat-media',
            operation: 'auto-select-media',
            outcome: 'success'
        }));
        page.dom.window.close();
    });

    test('sends on the next task instead of waiting on a fixed delay', () => {
        jest.useFakeTimers();
        const page = createPage();

        page.chatDocument.getElementById('media-trigger').click();
        page.window.moeChatMediaAutoSelectFeature.scan();

        expect(page.sendCount).toBe(0);
        jest.advanceTimersByTime(0);

        expect(page.sendCount).toBe(1);
        page.dom.window.close();
    });

    test('does not send when the campaign media is unavailable in Moe', () => {
        jest.useFakeTimers();
        const page = createPage({ options: ['Print'] });

        page.window.moeChatMediaAutoSelectFeature.scan();
        jest.runAllTimers();

        expect(page.sendCount).toBe(0);
        expect(page.chatDocument.getElementById('media-input').value).toBe('-');
        page.dom.window.close();
    });

    test('stops pending work when the setting is switched off', () => {
        jest.useFakeTimers();
        const page = createPage({ enabled: false });

        page.window.moeChatMediaAutoSelectFeature.scan();
        jest.runOnlyPendingTimers();
        expect(page.sendCount).toBe(0);
        expect(page.chatDocument.getElementById('media-input').value).toBe('-');

        page.storageListener({ moeChatMediaAutoSelectEnabled: { newValue: true } }, 'sync');
        page.window.moeChatMediaAutoSelectFeature.scan();
        page.storageListener({ moeChatMediaAutoSelectEnabled: { newValue: false } }, 'sync');
        jest.runAllTimers();

        expect(page.sendCount).toBe(0);
        page.dom.window.close();
    });
});

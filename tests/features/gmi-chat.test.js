const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const gmiChatScript = fs.readFileSync(
    path.resolve(__dirname, '../../features/gmi-chat.js'),
    'utf8'
);
const contentStyles = fs.readFileSync(
    path.resolve(__dirname, '../../content.css'),
    'utf8'
);

describe('GMI Chat behaviour', () => {
    test('applies its layout while enabled and removes its button when disabled', () => {
        const dom = new JSDOM(`<!doctype html>
            <html>
                <head><style>${contentStyles}</style></head>
                <body class="approver-widget-placement-enabled">
                    <div class="workflow-widget-wrapper"></div>
                </body>
            </html>`, {
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/',
            runScripts: 'outside-only'
        });
        const { window } = dom;
        let storageListener;

        window.chrome = {
            storage: {
                sync: {
                    get: jest.fn((key, callback) => callback({ gmiChatShortcutEnabled: true }))
                },
                onChanged: {
                    addListener: jest.fn(listener => {
                        storageListener = listener;
                    })
                }
            }
        };

        window.eval(gmiChatScript);
        window.gmiChatFeature.handleGmiChatButton();

        const workflowWidget = window.document.querySelector('.workflow-widget-wrapper');
        expect(window.document.body.classList).toContain('gmi-chat-enabled');
        expect(window.getComputedStyle(workflowWidget).minWidth).toBe('260px');
        expect(workflowWidget.querySelectorAll('.gmi-chat-button')).toHaveLength(1);

        storageListener({ gmiChatShortcutEnabled: { newValue: false } }, 'sync');

        expect(window.document.body.classList).not.toContain('gmi-chat-enabled');
        expect(window.getComputedStyle(workflowWidget).minWidth).toBe('');
        expect(workflowWidget.querySelector('.gmi-chat-button')).toBeNull();
        dom.window.close();
    });

    test('builds the Teams message from the current campaign header without guessing a client', () => {
        const dom = new JSDOM(`<!doctype html><html><body>
            <div class="workflow-widget-wrapper"></div>
            <mo-text class="mo-campaign-name-wrapper">CRUK_Display_RFL_Jan_2026_1164704</mo-text>
        </body></html>`, {
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP36746',
            runScripts: 'outside-only'
        });
        const { window } = dom;

        window.chrome = {
            storage: {
                sync: {
                    get: jest.fn((key, callback) => callback({ gmiChatShortcutEnabled: true }))
                },
                onChanged: { addListener: jest.fn() }
            }
        };
        window.open = jest.fn();

        window.eval(gmiChatScript);
        window.gmiChatFeature.handleGmiChatButton();
        window.document.querySelector('.gmi-chat-button').click();

        expect(window.open).toHaveBeenCalledTimes(1);
        const teamsUrl = new URL(window.open.mock.calls[0][0]);
        expect(teamsUrl.searchParams.get('message')).toBe(
            `CRUK_Display_RFL_Jan_2026_1164704 ${window.location.href}`
        );
        dom.window.close();
    });
});

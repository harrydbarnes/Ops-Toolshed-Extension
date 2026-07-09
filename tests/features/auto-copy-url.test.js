const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const featureScript = fs.readFileSync(path.resolve(__dirname, '../../features/auto-copy-url.js'), 'utf8');

describe('Auto Copy Campaign URL Feature', () => {
    let window, document, storageState, showToast;

    function setupDom(autoCopyUrlEnabled = true) {
        jest.useFakeTimers();
        storageState = { autoCopyUrlEnabled };
        showToast = jest.fn();

        const dom = new JSDOM(`<!DOCTYPE html><html><body>
            <mo-banner>
                <mo-popover>
                    <mo-banner-widget>
                        <mo-icon name="link"></mo-icon>
                    </mo-banner-widget>
                </mo-popover>
            </mo-banner>
            <div class="grid-container">
                <mo-text>Page link</mo-text>
                <mo-input value="https://tiny.mediaocean.com/abc123"></mo-input>
                <mo-button class="copy-button">Copy</mo-button>
            </div>
        </body></html>`, {
            url: 'https://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP123',
            runScripts: 'dangerously',
            resources: 'usable'
        });

        window = dom.window;
        document = window.document;

        window.chrome = {
            storage: {
                sync: {
                    get: jest.fn((key, callback) => callback(storageState))
                },
                onChanged: {
                    addListener: jest.fn()
                }
            }
        };

        window.utils = { showToast };

        document.querySelectorAll('mo-icon, mo-button, mo-input').forEach(element => {
            element.getBoundingClientRect = () => ({
                left: 10,
                top: 10,
                right: 110,
                bottom: 40,
                width: 100,
                height: 30,
                x: 10,
                y: 10
            });
        });

        const copyButton = document.querySelector('mo-button.copy-button');
        const copyHandler = jest.fn();
        copyButton.addEventListener('click', copyHandler);

        const scriptEl = document.createElement('script');
        scriptEl.textContent = featureScript;
        document.body.appendChild(scriptEl);

        window.autoCopyUrlFeature.initialize();

        return { copyHandler };
    }

    function clickPageLinkIcon() {
        const icon = document.querySelector('mo-icon[name="link"]');
        icon.dispatchEvent(new window.MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            composed: true
        }));
    }

    async function flushAutomation() {
        jest.advanceTimersByTime(0);
        await Promise.resolve();
        jest.advanceTimersByTime(100);
        await Promise.resolve();
    }

    afterEach(() => {
        jest.useRealTimers();
    });

    test('clicks the native Prisma Copy button after the page-link icon is clicked', async () => {
        const { copyHandler } = setupDom(true);

        clickPageLinkIcon();
        await flushAutomation();

        expect(copyHandler).toHaveBeenCalled();
        expect(showToast).toHaveBeenCalledWith('Campaign URL copied to clipboard!', 'success');
    });

    test('does not automate the copy button when the setting is disabled', async () => {
        const { copyHandler } = setupDom(false);

        clickPageLinkIcon();
        await flushAutomation();

        expect(copyHandler).not.toHaveBeenCalled();
        expect(showToast).not.toHaveBeenCalled();
    });
});

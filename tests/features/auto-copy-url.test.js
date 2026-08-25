const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const featureScript = fs.readFileSync(path.resolve(__dirname, '../../features/auto-copy-url.js'), 'utf8');

describe('Auto Copy Campaign URL Feature', () => {
    let dom, window, document, storageState, showToast;

    function setupDom(autoCopyUrlEnabled = true, autoCopyUrlMode = 'short') {
        jest.useFakeTimers();
        storageState = { autoCopyUrlEnabled, autoCopyUrlMode };
        showToast = jest.fn(() => {
            if (!document.getElementById('ops-toolshed-toast')) {
                const toast = document.createElement('div');
                toast.id = 'ops-toolshed-toast';
                document.body.appendChild(toast);
            }
        });

        dom = new JSDOM(`<!DOCTYPE html><html><body>
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
            runScripts: 'dangerously'
        });

        window = dom.window;
        document = window.document;

        window.chrome = {
            runtime: {
                sendMessage: jest.fn().mockResolvedValue({ status: 'success' })
            },
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

    function clickPageLinkControl() {
        const popover = document.querySelector('mo-popover');
        popover.dispatchEvent(new window.MouseEvent('click', {
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
        dom?.window.close();
        jest.useRealTimers();
    });

    test('clicks the native Prisma Copy button after the page-link icon is clicked', async () => {
        const { copyHandler } = setupDom(true);

        clickPageLinkIcon();
        await flushAutomation();

        expect(copyHandler).toHaveBeenCalled();
        expect(showToast).toHaveBeenCalledWith('Campaign URL copied to clipboard!', 'success');
        expect(document.getElementById('ops-toolshed-toast')?.classList.contains('toast-offset-native')).toBe(true);
        expect(document.querySelector('.grid-container').style.visibility).toBe('hidden');
    });

    test('recognises clicks on the surrounding Prisma page-link control', async () => {
        const { copyHandler } = setupDom(true);

        clickPageLinkControl();
        await flushAutomation();

        expect(copyHandler).toHaveBeenCalled();
        expect(showToast).toHaveBeenCalledWith('Campaign URL copied to clipboard!', 'success');
    });

    test('copies the current full URL without opening or using Prisma page-link UI', async () => {
        const { copyHandler } = setupDom(true, 'full');

        clickPageLinkIcon();
        await window.chrome.runtime.sendMessage.mock.results[0].value;
        await jest.advanceTimersByTimeAsync(0);

        expect(window.chrome.runtime.sendMessage).toHaveBeenCalledWith({
            action: 'copyCampaignUrlToClipboard',
            text: window.location.href
        });
        expect(copyHandler).not.toHaveBeenCalled();
        expect(showToast).toHaveBeenCalledWith('Campaign URL copied to clipboard!', 'success');
    });

    test('does not automate the copy button when the setting is disabled', async () => {
        const { copyHandler } = setupDom(false);

        clickPageLinkIcon();
        await flushAutomation();

        expect(copyHandler).not.toHaveBeenCalled();
        expect(showToast).not.toHaveBeenCalled();
        expect(document.querySelector('mo-icon[name="link"]').classList).not.toContain('auto-copy-icon');
    });

    test('starts cue tracking only when the disabled feature is enabled', async () => {
        setupDom(false);
        const storageListener = window.chrome.storage.onChanged.addListener.mock.calls[0][0];
        storageListener({ autoCopyUrlEnabled: { newValue: true } }, 'sync');

        const replacementPopover = document.createElement('mo-popover');
        const replacementIcon = document.createElement('mo-icon');
        replacementIcon.setAttribute('name', 'link');
        replacementPopover.appendChild(replacementIcon);
        document.querySelector('mo-banner').appendChild(replacementPopover);

        await Promise.resolve();
        jest.runOnlyPendingTimers();

        expect(replacementIcon.classList).toContain('auto-copy-icon');
    });

    test('does not rescan the page when the global content refresh calls it again', () => {
        setupDom(true);
        const pageScan = jest.spyOn(document.documentElement, 'querySelectorAll');

        window.autoCopyUrlFeature.handleAutoCopy();
        window.autoCopyUrlFeature.handleAutoCopy();

        expect(pageScan).not.toHaveBeenCalled();
    });

    test('tracks a newly rendered Prisma page-link icon without a whole-page refresh', async () => {
        setupDom(true);
        const replacementPopover = document.createElement('mo-popover');
        const replacementIcon = document.createElement('mo-icon');
        replacementIcon.setAttribute('name', 'link');
        replacementPopover.appendChild(replacementIcon);
        document.querySelector('mo-banner').appendChild(replacementPopover);

        await Promise.resolve();
        jest.runOnlyPendingTimers();

        expect(replacementIcon.classList).toContain('auto-copy-icon');
        expect(window.autoCopyUrlFeature._test.getTrackedLinkIconCount()).toBe(2);
    });

    test('removes the cue when a tracked icon is no longer a page-link icon', async () => {
        setupDom(true);
        const icon = document.querySelector('mo-icon[name="link"]');
        expect(icon.classList).toContain('auto-copy-icon');

        icon.setAttribute('name', 'close');
        await Promise.resolve();
        jest.runOnlyPendingTimers();

        expect(icon.classList).not.toContain('auto-copy-icon');
        expect(window.autoCopyUrlFeature._test.getTrackedLinkIconCount()).toBe(0);
    });

    test('discovers link icons through known Prisma hosts without traversing unrelated Shadow DOM', async () => {
        setupDom(true);
        const pageScan = jest.spyOn(document.documentElement, 'querySelectorAll');

        const nestedPopover = document.createElement('mo-popover');
        const nestedShadow = nestedPopover.attachShadow({ mode: 'open' });
        const nestedIcon = document.createElement('mo-icon');
        nestedIcon.setAttribute('name', 'link');
        nestedShadow.appendChild(nestedIcon);
        document.querySelector('mo-banner').appendChild(nestedPopover);

        const unrelatedHost = document.createElement('div');
        const unrelatedShadow = unrelatedHost.attachShadow({ mode: 'open' });
        const unrelatedIcon = document.createElement('mo-icon');
        unrelatedIcon.setAttribute('name', 'link');
        unrelatedShadow.appendChild(unrelatedIcon);
        document.body.appendChild(unrelatedHost);

        await Promise.resolve();
        jest.runOnlyPendingTimers();

        expect(nestedIcon.classList).toContain('auto-copy-icon');
        expect(unrelatedIcon.classList).not.toContain('auto-copy-icon');
        expect(pageScan).not.toHaveBeenCalledWith('*');
    });

    test('ignores large unrelated Prisma render batches', async () => {
        setupDom(true);
        const unrelatedRoot = document.createElement('div');
        const querySpy = jest.spyOn(unrelatedRoot, 'querySelectorAll');
        document.body.appendChild(unrelatedRoot);

        for (let index = 0; index < 250; index += 1) {
            unrelatedRoot.appendChild(document.createElement('div'));
        }

        await Promise.resolve();
        jest.runOnlyPendingTimers();

        expect(querySpy).not.toHaveBeenCalled();
    });
});

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const featureScript = fs.readFileSync(path.resolve(__dirname, '../../features/order-id-copy.js'), 'utf8');

describe('Order ID Copy Feature', () => {
    let window, document;

    beforeEach(() => {
        jest.useFakeTimers();
        const dom = new JSDOM('<!DOCTYPE html><html><body><table><tbody><tr><td class="pad"><a href="#">O-12345-R0</a></td></tr></tbody></table></body></html>', {
            url: "https://example.com/page?type=prsm-cm-ord&campaign-id=999",
            runScripts: "dangerously",
            resources: "usable"
        });
        window = dom.window;
        document = window.document;

        // Mock Chrome API
        window.chrome = {
            storage: {
                sync: {
                    get: jest.fn((key, cb) => cb({ orderIdCopyEnabled: true }))
                }
            }
        };

        // Mock Clipboard
        Object.defineProperty(window.navigator, 'clipboard', {
            value: {
                writeText: jest.fn().mockResolvedValue()
            },
            writable: true
        });

        // Mock utils (though we replaced it, keeping just in case)
        window.utils = {};

        // Inject script
        const scriptEl = document.createElement('script');
        scriptEl.textContent = featureScript;
        document.body.appendChild(scriptEl);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('should add copy button and apply flexbox to cell', () => {
        window.orderIdCopyFeature.checkAndAddCopyButtons();

        const cell = document.querySelector('td.pad');
        const button = document.querySelector('.order-id-copy-btn');

        expect(button).not.toBeNull();
        expect(cell.contains(button)).toBe(true);
        expect(cell.classList.contains('order-id-copy-cell')).toBe(true);
    });

    test('should copy cleaned ID and show toast on click', async () => {
        window.orderIdCopyFeature.checkAndAddCopyButtons();
        const button = document.querySelector('.order-id-copy-btn');

        button.click();

        expect(window.navigator.clipboard.writeText).toHaveBeenCalledWith('O-12345');

        // Check for toast
        await Promise.resolve(); // Wait for promise resolution

        const toast = document.querySelector('.order-id-copy-toast');
        expect(toast).not.toBeNull();
        expect(toast.textContent).toContain('Copied Order ID: O-12345');

        // Fast forward for animation class
        jest.advanceTimersByTime(20);
        expect(toast.classList.contains('show')).toBe(true);
    });

    test('should change button style temporarily on click', async () => {
        window.orderIdCopyFeature.checkAndAddCopyButtons();
        const button = document.querySelector('.order-id-copy-btn');
        const originalText = button.textContent;

        button.click();
        await Promise.resolve();

        expect(button.textContent).toBe('Copied!');
        expect(button.classList.contains('copied')).toBe(true);

        jest.advanceTimersByTime(2000);
        expect(button.textContent).toBe(originalText);
        expect(button.classList.contains('copied')).toBe(false);
    });
});

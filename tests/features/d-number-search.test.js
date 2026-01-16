const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const scriptContent = fs.readFileSync(path.resolve(__dirname, '../../features/d-number-search.js'), 'utf8');

describe('D-Number Search Feature', () => {
    let window, document;

    beforeEach(() => {
        const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
            runScripts: "dangerously",
            resources: "usable"
        });
        window = dom.window;
        document = window.document;

        // Mock window.utils
        window.utils = {
            waitForElementInShadow: jest.fn(),
            showToast: jest.fn()
        };

        // Inject script
        const scriptEl = document.createElement('script');
        scriptEl.textContent = scriptContent;
        document.body.appendChild(scriptEl);
    });

    test('should click search icon, input text, and find result link', async () => {
        const dNumber = 'D12345678';

        // Mocks for DOM elements
        const mockSearchIcon = { click: jest.fn(), dispatchEvent: jest.fn() };
        const mockInput = {
            focus: jest.fn(),
            dispatchEvent: jest.fn(),
            value: ''
        };
        const mockLink = {
            click: jest.fn(),
            textContent: `Campaign ${dNumber}`
        };

        // Sequence of mock returns for waitForElementInShadow
        window.utils.waitForElementInShadow
            .mockResolvedValueOnce(mockSearchIcon) // 1. Icon
            .mockResolvedValueOnce(mockInput)      // 2. Input
            .mockResolvedValueOnce(mockLink);      // 3. Result Link

        await window.dNumberSearchFeature.handleDNumberSearch(dNumber);

        // Verification
        expect(mockSearchIcon.click).toHaveBeenCalled();
        expect(mockInput.value).toBe(dNumber);
        expect(mockLink.click).toHaveBeenCalled(); // Success!
    });

    test('should fallback to history toggle if immediate link not found', async () => {
        const dNumber = 'D12345678';

        const mockSearchIcon = { click: jest.fn(), dispatchEvent: jest.fn() };
        const mockInput = { focus: jest.fn(), dispatchEvent: jest.fn(), value: '' };
        const mockToggle = { click: jest.fn(), dispatchEvent: jest.fn() };
        const mockFinalButton = { click: jest.fn(), dispatchEvent: jest.fn() };

        window.utils.waitForElementInShadow
            .mockResolvedValueOnce(mockSearchIcon) // 1. Icon
            .mockResolvedValueOnce(mockInput)      // 2. Input
            .mockRejectedValueOnce(new Error('No link')) // 3. Link not found immediately
            .mockResolvedValueOnce(mockToggle)     // 4. Toggle switch
            .mockResolvedValueOnce(mockFinalButton); // 5. Final button

        await window.dNumberSearchFeature.handleDNumberSearch(dNumber);

        expect(mockToggle.click).toHaveBeenCalled();
        expect(mockFinalButton.click).toHaveBeenCalled();
    });
});

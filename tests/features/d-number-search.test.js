const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const scriptContent = fs.readFileSync(path.resolve(__dirname, '../../features/d-number-search.js'), 'utf8');

describe('D-Number Search Feature', () => {
    let window, document;
    const dNumber = 'D12345678';
    let mockSearchIcon, mockInput, mockLink, mockToggle, mockFinalButton;

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

        // Common mocks
        mockSearchIcon = { click: jest.fn(), dispatchEvent: jest.fn() };
        mockInput = { focus: jest.fn(), dispatchEvent: jest.fn(), value: '' };

        // Common sequence
        window.utils.waitForElementInShadow
            .mockResolvedValueOnce(mockSearchIcon) // 1. Icon
            .mockResolvedValueOnce(mockInput);     // 2. Input
    });

    describe('when result link is found immediately', () => {
        beforeEach(() => {
            mockLink = { click: jest.fn(), textContent: `Campaign ${dNumber}` };

            // Sequence specific to success
            window.utils.waitForElementInShadow
                .mockResolvedValueOnce(mockLink);      // 3. Result Link
        });

        test('should click search icon, input text, and find result link', async () => {
            await window.dNumberSearchFeature.handleDNumberSearch(dNumber);

            // Verification
            expect(mockSearchIcon.click).toHaveBeenCalled();
            expect(mockInput.value).toBe(dNumber);
            expect(mockLink.click).toHaveBeenCalled(); // Success!
        });
    });

    describe('when falling back to history toggle', () => {
        beforeEach(() => {
            mockToggle = { click: jest.fn(), dispatchEvent: jest.fn() };
            mockFinalButton = { click: jest.fn(), dispatchEvent: jest.fn() };

            // Sequence specific to fallback
            window.utils.waitForElementInShadow
                .mockRejectedValueOnce(new Error('No link')) // 3. Link not found immediately
                .mockResolvedValueOnce(mockToggle)     // 4. Toggle switch
                .mockResolvedValueOnce(mockFinalButton); // 5. Final button
        });

        test('should fallback to history toggle if immediate link not found', async () => {
            await window.dNumberSearchFeature.handleDNumberSearch(dNumber);

            expect(mockSearchIcon.click).toHaveBeenCalled();
            expect(mockInput.value).toBe(dNumber);
            expect(mockToggle.click).toHaveBeenCalled();
            expect(mockFinalButton.click).toHaveBeenCalled();
        });
    });
});

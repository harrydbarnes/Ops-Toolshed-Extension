(function() {
    'use strict';

    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    // Helper function to simulate a complete, robust click event sequence
    function robustClick(element) {
        if (!element) return;
        element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
        element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, composed: true }));
        element.click();
    }

    async function handleDNumberSearch(dNumber) {
        console.log(`[DNumberSearch] Starting search for: ${dNumber}`);
        try {
            // 1. Click the main search icon to open the quick search menu.
            const searchIcon = await window.utils.waitForElementInShadow('mo-icon[name="search"]');
            console.log('[DNumberSearch] Found search icon. Performing robust click...');
            robustClick(searchIcon);

            // 2. Wait a very brief moment, then immediately find the final native input field.
            // Since the input field is instantly ready and focused, we don't need a long wait/complex search chain.
            await delay(100); 
            
            // Search for the input globally and quickly (max 1 sec wait is enough if it's "instant")
            const searchInput = await window.utils.waitForElementInShadow('input[data-is-native-input]', document, 1000);
            console.log('[DNumberSearch] Found final and correct search input field immediately.');
            
            // 3. Force the value into the field 
            searchInput.focus();
            searchInput.value = dNumber;
            console.log(`[DNumberSearch] Manually set input value to: ${dNumber}`);

            // 4. Dispatch ALL possible relevant events to ensure the framework runs the search filter.
            const eventConfig = { bubbles: true, composed: true };

            searchInput.dispatchEvent(new Event('paste', eventConfig));
            searchInput.dispatchEvent(new Event('input', eventConfig));
            searchInput.dispatchEvent(new Event('change', eventConfig));
            // We use 'Enter' here to finalize and often trigger the result display.
            searchInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', ...eventConfig }));
            
            console.log(`[DNumberSearch] Dispatched robust input and key events.`);
            
            // Give time for search results to populate
            await delay(1500);

            // 5. Click the correct result link.
            const resultLinkSelector = `a.item-row`;
            
            // Search for the link inside the entire DOM/Shadow DOM (the utility does the heavy lifting).
            const correctLink = await window.utils.waitForElementInShadow(resultLinkSelector, document, 5000);
            
            if (correctLink && correctLink.textContent.includes(dNumber)) {
                console.log('[DNumberSearch] Found correct result link. Clicking it.');
                correctLink.click();
            } else {
                throw new Error(`Could not find a campaign result link containing D-Number "${dNumber}" after search.`);
            }

            console.log('[DNumberSearch] Search action complete.');

        } catch (error) {
            console.error('[DNumberSearch] Automation failed:', error);
            const errorMessage = error.message || "An unknown error occurred during D-Number search.";
            
            // Show alert to the user
            alert(`Ops Toolshed Error:\nFailed to complete D-Number search.\n\nDetails: ${errorMessage}`);
            
            throw error;
        }
    }

    window.dNumberSearchFeature = {
        handleDNumberSearch
    };
})();

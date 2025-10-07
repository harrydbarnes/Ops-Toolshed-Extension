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

            // Give a short time for the initial quick search menu to appear
            await delay(500);
            
            // 2. Click the intermediary menu element to trigger the full search overlay/input activation.
            const intermediarySelector = 'mo-banner-recent-menu-content.hydrated';
            const intermediaryElement = await window.utils.waitForElementInShadow(intermediarySelector, document, 5000); 
            console.log(`[DNumberSearch] Found intermediary menu element. Clicking to activate search input...`);
            robustClick(intermediaryElement);
            
            // Wait for the full search UI to stabilize
            await delay(500); 

            // --- CRITICAL FIX ---
            // 3. Find the definitive parent container (mo-search-box) and then the input inside its shadow DOM.
            const searchBoxContainer = await window.utils.waitForElementInShadow('mo-search-box.search-box-container', document, 5000);
            console.log('[DNumberSearch] Found definitive mo-search-box container.');

            // Now search for the native input *only* within the shadow DOM of the specific search container.
            // The utility function automatically looks inside nested shadow roots (mo-input inside mo-search-box).
            const searchInput = await window.utils.waitForElementInShadow('input[data-is-native-input]', searchBoxContainer, 2000); 
            console.log('[DNumberSearch] Found final and correct search input field.');
            
            // 4. (Optional) Ensure D-Number is on the clipboard
            console.log(`[DNumberSearch] Ensuring "${dNumber}" is on the clipboard.`);
            await chrome.runtime.sendMessage({ action: 'copyToClipboard', text: dNumber });
            
            // --- Robust Input Strategy: Manually set value and dispatch every event ---
            
            // 5. Force the value into the field 
            searchInput.focus(); 
            searchInput.value = dNumber; 
            console.log(`[DNumberSearch] Manually set input value to: ${dNumber}`);

            // 6. Dispatch ALL possible relevant events to ensure the framework runs the search filter.
            const eventConfig = { bubbles: true, composed: true };

            searchInput.dispatchEvent(new Event('paste', eventConfig));
            searchInput.dispatchEvent(new Event('input', eventConfig));
            searchInput.dispatchEvent(new Event('change', eventConfig));
            searchInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', ...eventConfig }));
            
            console.log(`[DNumberSearch] Dispatched robust input and key events.`);
            
            // Give time for search results to populate
            await delay(1500); 

            // 7. Click the correct result link.
            const resultLinkSelector = `a.item-row`;
            // Search for the link again inside the specific search container
            await window.utils.waitForElementInShadow(resultLinkSelector, searchBoxContainer, 5000);

            // Find the link whose content includes the D-Number
            const allResultLinks = Array.from(searchBoxContainer.shadowRoot.querySelectorAll(resultLinkSelector));
            const correctLink = allResultLinks.find(link => link.textContent.includes(dNumber));

            if (correctLink) {
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

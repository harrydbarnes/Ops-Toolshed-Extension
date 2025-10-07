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

            // Give a short, necessary time for the quick search menu/overlay to appear after the click.
            await delay(500); 
            console.log('[DNumberSearch] Initial 500ms delay complete. Searching for search box...');

            // --- CORRECTED STEP ---
            // 2. Find the definitive parent mo-search-box container immediately.
            const searchBoxContainer = await window.utils.waitForElementInShadow('mo-search-box.search-box-container', document, 5000);
            console.log('[DNumberSearch] Found definitive mo-search-box container.');

            // 3. Now search for the native input *only* within the shadow DOM of the specific search container.
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
            
            // Find the link whose content includes the D-Number (we'll look in the container's shadow root directly for better scope)
            let finalLink = null;

            // Search for the link inside the hierarchy started by searchBoxContainer.
            const shadowLinks = Array.from(searchBoxContainer.shadowRoot.querySelectorAll(resultLinkSelector));
            finalLink = shadowLinks.find(link => link.textContent.includes(dNumber));
            
            // Fallback: Use the utility to search the entire document/shadow DOM as the element might be outside the container's shadow.
            if (!finalLink) {
                 finalLink = await window.utils.waitForElementInShadow(`a.item-row`, document, 1000);
                 // If found generally, re-check content:
                 if(finalLink && !finalLink.textContent.includes(dNumber)) finalLink = null;
            }


            if (finalLink) {
                console.log('[DNumberSearch] Found correct result link. Clicking it.');
                finalLink.click();
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

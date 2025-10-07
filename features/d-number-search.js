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

            // Give a brief moment for the UI to start rendering the menu.
            await delay(100); 
            console.log('[DNumberSearch] Initial 100ms delay complete. Searching for input globally...');

            // --- REVERTED FIX: SIMPLE, GLOBAL INPUT SEARCH ---
            // 2. Find the native input element *globally and quickly* (The successful previous method).
            // This relies on the input being instantly ready and accessible anywhere in the Shadow DOM.
            const searchInput = await window.utils.waitForElementInShadow('input[data-is-native-input]', document, 1000);
            console.log('[DNumberSearch] Found correct search input field quickly.');
            
            // 3. Force the value into the field 
            searchInput.focus();
            searchInput.value = dNumber;
            console.log(`[DNumberSearch] Manually set input value to: ${dNumber}`);

            // 4. Dispatch ALL possible relevant events to ensure the framework runs the search filter.
            const eventConfig = { bubbles: true, composed: true };

            // Dispatch a full suite of events (retaining the robust event setup)
            searchInput.dispatchEvent(new Event('paste', eventConfig));
            searchInput.dispatchEvent(new Event('input', eventConfig));
            searchInput.dispatchEvent(new Event('change', eventConfig));
            searchInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', ...eventConfig }));
            
            console.log(`[DNumberSearch] Dispatched robust input and key events.`);
            
            // Give time for search results to populate
            await delay(1500);

            // 5. CONDITIONAL CHECK: ATTEMPT to find the correct result link immediately.
            const resultLinkSelector = `a.item-row`;
            let finalLink = null;
            
            // Search globally for the link that contains the D-number
            try {
                // Find a result link anywhere in the DOM/Shadow DOM that matches the D-number
                const foundLink = await window.utils.waitForElementInShadow(resultLinkSelector, document, 500); 
                
                // If a link is found, check if it contains the D-number text
                if (foundLink && foundLink.textContent.includes(dNumber)) {
                    finalLink = foundLink;
                }
            } catch (e) {
                console.log('[DNumberSearch] No immediate result found in quick check.');
            }

            if (finalLink) {
                // SCENARIO A: Immediate Match Found
                console.log('[DNumberSearch] Found correct result link immediately. Clicking it.');
                finalLink.click();
            } else {
                console.log('[DNumberSearch] No immediate result found. Executing fallback steps.');

                // --- FALLBACK SEQUENCE (Toggle + Final Search Button) ---

                // 6. Click the "Older Than 2 Years" toggle switch.
                const toggleSelector = 'mo-toggle-switch[size="sm"].hydrated';
                const toggleElement = await window.utils.waitForElementInShadow(toggleSelector, document, 3000);
                
                if (toggleElement) {
                    console.log('[DNumberSearch] Found history search toggle. Activating...');
                    robustClick(toggleElement); 
                    await delay(500); 
                } else {
                    console.warn('[DNumberSearch] WARNING: Could not find history search toggle. Proceeding to final button.');
                }

                // 7. Click the final search/open button.
                const finalButtonSelector = 'mo-button[type="secondary"]';
                const finalButton = await window.utils.waitForElementInShadow(finalButtonSelector, document, 5000);
                
                if (finalButton) {
                    console.log('[DNumberSearch] Found final search button. Clicking it to perform deep search.');
                    finalButton.click();
                } else {
                    throw new Error(`Fallback failed: Could not find the final search/open button (${finalButtonSelector}).`);
                }
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

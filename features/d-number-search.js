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
        try {
            // 1. Click the main search icon to open the quick search menu.
            const searchIcon = await window.utils.waitForElementInShadow('mo-icon[name="search"]');
            robustClick(searchIcon);

            // Give a brief moment for the UI to start rendering the menu.
            await delay(100); 

            // Prisma mounts the native input in Shadow DOM outside the trigger.
            const searchInput = await window.utils.waitForElementInShadow('input[data-is-native-input]', 1000);
            
            // 3. Force the value into the field 
            searchInput.focus();
            searchInput.value = dNumber;

            // 4. Dispatch ALL possible relevant events to ensure the framework runs the search filter.
            const eventConfig = { bubbles: true, composed: true };

            // Dispatch a full suite of events (retaining the robust event setup)
            searchInput.dispatchEvent(new Event('paste', eventConfig));
            searchInput.dispatchEvent(new Event('input', eventConfig));
            searchInput.dispatchEvent(new Event('change', eventConfig));
            searchInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', ...eventConfig }));
            
            
            // Give time for search results to populate
            await delay(1500);

            // 5. CONDITIONAL CHECK: ATTEMPT to find the correct result link immediately.
            const resultLinkSelector = `a.item-row`;
            let finalLink = null;
            
            // Search globally for the link that contains the D-number
            try {
                // Find a result link anywhere in the DOM/Shadow DOM that matches the D-number
                const foundLink = await window.utils.waitForElementInShadow(resultLinkSelector, 500);
                
                // If a link is found, check if it contains the D-number text
                if (foundLink && foundLink.textContent.includes(dNumber)) {
                    finalLink = foundLink;
                }
            } catch {
                finalLink = null; // A missing quick result selects the older-campaign fallback.
            }

            if (finalLink) {
                // SCENARIO A: Immediate Match Found
                finalLink.click();
            } else {

                // --- FALLBACK SEQUENCE (Toggle + Final Search Button) ---

                // 6. Click the "Older Than 2 Years" toggle switch.
                const toggleSelector = 'mo-toggle-switch[size="sm"].hydrated';
                const toggleElement = await window.utils.waitForElementInShadow(toggleSelector, 3000);
                
                if (toggleElement) {
                    robustClick(toggleElement); 
                    await delay(500); 
                } else {
                    console.warn('[DNumberSearch] WARNING: Could not find history search toggle. Proceeding to final button.');
                }

                // 7. Click the final search/open button.
                const finalButtonSelector = 'mo-button[type="secondary"]';
                const finalButton = await window.utils.waitForElementInShadow(finalButtonSelector, 5000);
                
                if (finalButton) {
                    robustClick(finalButton);
                } else {
                    throw new Error(`Fallback failed: Could not find the final search/open button (${finalButtonSelector}).`);
                }
            }


        } catch (error) {
            console.error('[DNumberSearch] Automation failed:', error);
            const errorMessage = error.message || "An unknown error occurred during D-Number search.";
            
            // Use the centralized toast utility for error reporting
            window.utils.showToast(`D-Number Search Failed: ${errorMessage}`, 'error');
            
            throw error;
        }
    }

    window.dNumberSearchFeature = {
        handleDNumberSearch
    };
})();

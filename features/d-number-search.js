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

            // Give a brief, initial moment for the UI to start rendering the menu.
            await delay(500);
            console.log('[DNumberSearch] Initial 500ms delay complete. Searching for search box...');

            // 2. Find the definitive parent mo-search-box container.
            const searchBoxContainer = await window.utils.waitForElementInShadow('mo-search-box.search-box-container', document, 5000);
            console.log('[DNumberSearch] Found definitive mo-search-box container.');

            // 3. Find the native input element *inside* the mo-search-box.
            const searchInput = await window.utils.waitForElementInShadow('input[data-is-native-input]', searchBoxContainer, 5000);
            console.log('[DNumberSearch] Found final and correct search input field.');
            
            // 4. Force the value into the field (PRIORITIZE TEXT INPUT)
            searchInput.focus();
            searchInput.value = dNumber;
            console.log(`[DNumberSearch] Manually set input value to: ${dNumber}`);

            // 5. Dispatch ALL possible relevant events to ensure the framework runs the search filter.
            const eventConfig = { bubbles: true, composed: true };

            searchInput.dispatchEvent(new Event('paste', eventConfig));
            searchInput.dispatchEvent(new Event('input', eventConfig));
            searchInput.dispatchEvent(new Event('change', eventConfig));
            // Trigger filtering now
            searchInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', ...eventConfig }));
            
            console.log(`[DNumberSearch] Dispatched robust input and key events.`);
            
            // Give a brief moment for immediate search results to populate
            await delay(1000);

            // 6. CONDITIONAL CHECK: ATTEMPT to find the correct result link immediately.
            const resultLinkSelector = `a.item-row`;
            let finalLink = null;
            
            // Use a quick check (500ms) to see if a result is already visible.
            try {
                const resultElement = await window.utils.waitForElementInShadow(resultLinkSelector, searchBoxContainer, 500);
                if (resultElement) {
                    const shadowLinks = Array.from(searchBoxContainer.shadowRoot.querySelectorAll(resultLinkSelector));
                    finalLink = shadowLinks.find(link => link.textContent.includes(dNumber));
                }
            } catch (e) {
                // Expected if no result is found immediately. Ignore the timeout error.
                console.log('[DNumberSearch] No immediate result found in quick check.');
            }

            if (finalLink) {
                // SCENARIO A: Immediate Match Found
                console.log('[DNumberSearch] Found correct result link immediately. Clicking it.');
                finalLink.click();
            } else {
                // SCENARIO B: No immediate match, trigger fallback deep search
                console.log('[DNumberSearch] No immediate result found. Executing fallback steps.');

                // --- FALLBACK SEQUENCE (Toggle + Final Search Button) ---

                // 7. Click the "Older Than 2 Years" toggle switch.
                const toggleSelector = 'mo-toggle-switch[size="sm"].hydrated';
                const toggleElement = await window.utils.waitForElementInShadow(toggleSelector, document, 3000);

                if (toggleElement) {
                    console.log('[DNumberSearch] Found history search toggle. Activating...');
                    robustClick(toggleElement);
                    await delay(500); // Small delay after toggle click
                } else {
                    console.warn('[DNumberSearch] WARNING: Could not find history search toggle. Proceeding to final button.');
                }

                // 8. Click the final search/open button.
                // Selector matches the structure: mo-button[type="secondary"]
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
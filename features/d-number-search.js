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
            
            // --- CRUCIAL NEW STEP ---
            // 2. Click the intermediary menu element to trigger the full search overlay/input activation.
            // This mirrors the behavior observed in the user recording (Click 2 @ relativeTime: 2920)
            const intermediarySelector = 'mo-banner-recent-menu-content.hydrated';
            const intermediaryElement = await window.utils.waitForElementInShadow(intermediarySelector, document, 5000); // Look in the main document (or any Shadow DOM)
            console.log(`[DNumberSearch] Found intermediary menu element. Clicking to activate search input...`);
            robustClick(intermediaryElement); // Use robust click for reliability
            
            // Wait for the full search UI (the target input is now ready/exposed)
            await delay(500); 

            // 3. Find the definitive search input field.
            // The selector mo-overlay[role="dialog"] is still used here for robustness, 
            // but the search input itself might appear before the overlay is fully visible to the DOM searcher.
            // Let's rely on finding the input directly now that the menu is activated.

            const searchInput = await window.utils.waitForElementInShadow('input[data-is-native-input]', document, 5000); 
            console.log('[DNumberSearch] Found final search input field.');
            
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

            // 7. Wait for the correct result link to appear and click it.
            const resultLinkSelector = `a.item-row`;
            // Search for the link again inside the document (we no longer have the exact searchOverlay reference easily)
            const correctLinkElement = await window.utils.waitForElementInShadow(resultLinkSelector, document, 5000);

            // Find the link whose content includes the D-Number
            // Since the original approach relied on finding the correct link inside the overlay,
            // we will search the entire DOM/Shadow DOM for the specific link containing the D-number text.
            const allResultLinks = Array.from(document.querySelectorAll(resultLinkSelector));
            const correctLink = allResultLinks.find(link => link.textContent.includes(dNumber));

            if (correctLink) {
                console.log('[DNumberSearch] Found correct result link. Clicking it.');
                correctLink.click();
            } else {
                // Final fallback: try searching inside any known overlay location if the initial query fails
                const finalLink = await window.utils.waitForElementInShadow(`a.item-row:contains("${dNumber}")`, document, 1000);

                if (finalLink) {
                    finalLink.click();
                } else {
                    throw new Error(`Could not find a campaign result link containing D-Number "${dNumber}" after search.`);
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

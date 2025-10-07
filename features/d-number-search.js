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
            // 1. Click the main search icon to open the search overlay (using robust click).
            const searchIcon = await window.utils.waitForElementInShadow('mo-icon[name="search"]');
            console.log('[DNumberSearch] Found search icon. Performing robust click...');
            robustClick(searchIcon);

            // FIX: Increase delay to allow complex overlay component to initialize.
            await delay(1000); 
            console.log('[DNumberSearch] Initial 1000ms delay complete. Waiting for overlay...');

            // 2. Wait for the search overlay and input field to become available.
            const searchOverlay = await window.utils.waitForElementInShadow('mo-overlay[role="dialog"]', document, 10000); 
            // The input field is confirmed to be inside the Shadow DOM: input[data-is-native-input]
            const searchInput = await window.utils.waitForElementInShadow('input[data-is-native-input]', searchOverlay.shadowRoot, 1000); 
            console.log('[DNumberSearch] Found search overlay and input field.');

            // 3. (Optional) Ensure D-Number is on the clipboard (retained for external app paste compatibility)
            console.log(`[DNumberSearch] Ensuring "${dNumber}" is on the clipboard.`);
            await chrome.runtime.sendMessage({ action: 'copyToClipboard', text: dNumber });
            
            // --- NEW Robust Input Strategy: Manually set value and dispatch events ---
            
            // 4. Force the value into the field and dispatch events (bypassing unreliable paste command)
            searchInput.focus(); 
            searchInput.value = dNumber; 
            console.log(`[DNumberSearch] Manually set input value to: ${dNumber}`);

            // 5. Dispatch ALL possible relevant events. The 'composed: true' flag allows them to cross the Shadow DOM boundary.
            const eventConfig = { bubbles: true, composed: true };

            searchInput.dispatchEvent(new Event('paste', eventConfig)); // Simulate a paste event directly
            searchInput.dispatchEvent(new Event('input', eventConfig));
            searchInput.dispatchEvent(new Event('change', eventConfig));
            console.log(`[DNumberSearch] Dispatched robust input events.`);
            
            // Give time for search results to populate
            await delay(1500); 

            // 6. Wait for the correct result link to appear and click it.
            const resultLinkSelector = `a.item-row`;
            // Wait for the presence of the result row inside the shadow DOM
            await window.utils.waitForElementInShadow(resultLinkSelector, searchOverlay.shadowRoot, 5000);

            // Find the link whose content includes the D-Number
            const allResultLinks = Array.from(searchOverlay.shadowRoot.querySelectorAll(resultLinkSelector));
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

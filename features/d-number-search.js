(function() {
    'use strict';

    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    // Helper function to simulate a complete, robust click event sequence
    function robustClick(element) {
        if (!element) return;
        // Dispatching mousedown and mouseup events often ensures complex components register the click
        element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
        element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, composed: true }));
        // Follow up with a native click
        element.click();
    }

    async function handleDNumberSearch(dNumber) {
        console.log(`[DNumberSearch] Starting search for: ${dNumber}`);
        try {
            // 1. Click the main search icon to open the search overlay (using robust click).
            const searchIcon = await window.utils.waitForElementInShadow('mo-icon[name="search"]');
            console.log('[DNumberSearch] Found search icon. Performing robust click...');
            
            robustClick(searchIcon);

            // Wait briefly for the overlay UI to initialize after the click
            await delay(500);

            // 2. Wait for the search overlay and input field to become available.
            const searchOverlay = await window.utils.waitForElementInShadow('mo-overlay[role="dialog"]');
            const searchInput = await window.utils.waitForElementInShadow('input[data-is-native-input]', searchOverlay.shadowRoot);
            console.log('[DNumberSearch] Found search overlay and input field.');

            // 3. Copy D-Number to clipboard (handled by background script)
            console.log(`[DNumberSearch] Copying "${dNumber}" to clipboard.`);
            await chrome.runtime.sendMessage({ action: 'copyToClipboard', text: dNumber });

            // 4. Prepare the input for paste/input
            searchInput.focus();
            searchInput.select(); // Ensure the input is ready to accept clipboard data
            await delay(50); // Small delay to let focus/select settle

            // 5. Attempt Paste via execCommand
            console.log('[DNumberSearch] Attempting paste via document.execCommand...');
            document.execCommand('paste');

            // --- Robustness Check: Fallback if paste fails ---
            // Check if the value is correct immediately after attempting paste
            let isPasted = searchInput.value.toUpperCase() === dNumber.toUpperCase();
            
            // If the paste failed, manually set the value and console log the fallback
            if (!isPasted) {
                console.log('[DNumberSearch] Paste failed. Manually setting input value and dispatching events.');
                searchInput.value = dNumber; 
            } else {
                console.log('[DNumberSearch] Paste successful.');
            }
            
            // 6. Dispatch input/change events to notify the framework to run the search filter
            searchInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            searchInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            
            // Give time for search results to populate after the change event fires
            await delay(1000);

            // 7. Wait for the correct result link to appear and click it.
            const resultLinkSelector = `a.item-row`;
            // Wait for the presence of at least one result
            await window.utils.waitForElementInShadow(resultLinkSelector, searchOverlay.shadowRoot);

            // Find the link whose content includes the D-Number
            const allResultLinks = Array.from(searchOverlay.shadowRoot.querySelectorAll(resultLinkSelector));
            const correctLink = allResultLinks.find(link => link.textContent.includes(dNumber));

            if (correctLink) {
                console.log('[DNumberSearch] Found correct result link. Clicking it.');
                correctLink.click();
            } else {
                throw new Error(`Could not find a campaign result link containing D-Number "${dNumber}".`);
            }

            console.log('[DNumberSearch] Search action complete.');

        } catch (error) {
            console.error('[DNumberSearch] Automation failed:', error);
            // Re-throw the error so the background script can catch and report it.
            throw error;
        }
    }

    window.dNumberSearchFeature = {
        handleDNumberSearch
    };
})();

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
            // 1. Click the main search icon to open the search overlay.
            const searchIcon = await window.utils.waitForElementInShadow('mo-icon[name="search"]');
            console.log('[DNumberSearch] Found search icon. Performing robust click...');
            
            // Use the robust click method to ensure the click is registered
            robustClick(searchIcon);

            // Wait briefly for the overlay UI to initialize after the click
            await delay(500);

            // 2. Wait for the search overlay to become available.
            const searchOverlay = await window.utils.waitForElementInShadow('mo-overlay[role="dialog"]');
            console.log('[DNumberSearch] Found search overlay.');

            // 3. Find the search input within the overlay's shadow DOM structure.
            const searchInput = await window.utils.waitForElementInShadow('input[data-is-native-input]', searchOverlay.shadowRoot);
            console.log('[DNumberSearch] Found search input field.');

            // 4. Copy D-Number to clipboard and paste it to trigger the search.
            console.log(`[DNumberSearch] Copying "${dNumber}" to clipboard.`);
            await chrome.runtime.sendMessage({ action: 'copyToClipboard', text: dNumber });

            searchInput.focus();

            console.log('[DNumberSearch] Pasting from clipboard into search input.');
            document.execCommand('paste');

            // Manually dispatch input/change events to notify the framework that the value has changed.
            searchInput.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
            searchInput.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
            console.log(`[DNumberSearch] Dispatched paste and input/change events for "${dNumber}".`);

            // Give time for search results to populate after the change event fires
            await delay(1000);

            // 5. Wait for the correct result link to appear and click it.
            const resultLinkSelector = `a.item-row`;
            // Wait for at least one result to appear
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

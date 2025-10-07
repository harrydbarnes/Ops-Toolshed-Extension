(function() {
    'use strict';

    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    async function handleDNumberSearch(dNumber) {
        console.log(`[DNumberSearch] Starting search for: ${dNumber}`);
        try {
            // 1. Click the main search icon to open the search overlay.
            const searchIcon = await window.utils.waitForElementInShadow('mo-icon[name="search"]');
            console.log('[DNumberSearch] Found search icon. Clicking...');
            searchIcon.click();

            // FIX: Wait briefly for the overlay UI to initialize after the click
            await delay(500);

            // 2. Wait for the search overlay to become available.
            const searchOverlay = await window.utils.waitForElementInShadow('mo-overlay[role="dialog"]');
            console.log('[DNumberSearch] Found search overlay.');

            // 3. Find the search input within the overlay's shadow DOM structure.
            const searchInput = await window.utils.waitForElementInShadow('input[data-is-native-input]', searchOverlay.shadowRoot);
            console.log('[DNumberSearch] Found search input field.');

            // 4. Copy D-Number to clipboard and paste it to trigger the search.
            console.log(`[DNumberSearch] Copying "${dNumber}" to clipboard.`);
            // NOTE: This relies on a successful implementation of copyToClipboard in background/offscreen scripts
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
            // Search for all result links containing the D-Number in the text
            const allResultLinks = Array.from(searchOverlay.shadowRoot.querySelectorAll(resultLinkSelector));

            // Find the link whose content includes the D-Number
            const correctLink = allResultLinks.find(link => link.textContent.includes(dNumber));

            if (correctLink) {
                console.log('[DNumberSearch] Found correct result link. Clicking it.');
                // Simulate the full click behavior that leads to navigation
                correctLink.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
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

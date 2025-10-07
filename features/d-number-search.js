(function() {
    'use strict';

    async function handleDNumberSearch(dNumber) {
        console.log(`[DNumberSearch] Starting search for: ${dNumber}`);
        try {
            // 1. Click the main search icon to open the search overlay.
            const searchIcon = await window.utils.waitForElementInShadow('mo-icon[name="search"]');
            console.log('[DNumberSearch] Found search icon.');
            searchIcon.click();

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

            // Dispatching key events after pasting can help ensure the framework's event listeners fire.
            searchInput.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true, composed: true }));
            console.log(`[DNumberSearch] Dispatched paste and Enter key event for "${dNumber}".`);

            // 5. Wait for the correct result link to appear.
            const resultLinkSelector = `a.item-row`;
            await window.utils.waitForElementInShadow(resultLinkSelector, searchOverlay.shadowRoot);

            // We need to be more specific if multiple links appear.
            const allResultLinks = Array.from(searchOverlay.shadowRoot.querySelectorAll(resultLinkSelector));
            const correctLink = allResultLinks.find(link => link.textContent.includes(dNumber));

            if (correctLink) {
                console.log('[DNumberSearch] Found correct result link. Clicking it.');
                correctLink.click();
            } else {
                throw new Error(`Could not find a result link containing "${dNumber}".`);
            }

        } catch (error) {
            console.error('[DNumberSearch] Automation failed:', error);
            alert(`D-Number search automation failed: ${error.message}`);
        }
    }

    window.dNumberSearchFeature = {
        handleDNumberSearch
    };
})();
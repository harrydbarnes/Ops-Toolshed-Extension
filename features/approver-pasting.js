(function() {
    'use strict';

    function handleApproverPasting() {
        const selectors = {
            toLabel: 'label',
            selectContainer: '.select2-choices',
            firstResult: '.select2-result-selectable'
        };

        const toLabel = Array.from(document.querySelectorAll(selectors.toLabel)).find(label => label.textContent.trim() === 'To');
        if (!toLabel) return;

        const buttonContainer = toLabel.parentNode;
        if (buttonContainer.querySelector('.prisma-paste-button')) return;

        const pasteButton = document.createElement('button');
        pasteButton.textContent = 'Paste Approvers';
        pasteButton.className = 'filter-button prisma-paste-button';
        pasteButton.style.marginLeft = '10px';

        const pasteFavouritesButton = document.createElement('button');
        pasteFavouritesButton.textContent = 'Favourites';
        pasteFavouritesButton.className = 'filter-button prisma-paste-button';
        pasteFavouritesButton.style.marginLeft = '5px';

        pasteButton.addEventListener('click', async () => {
            pasteButton.disabled = true;
            pasteButton.textContent = 'Pasting...';
            let originalClipboard = '';

            try {
                const initialResponse = await chrome.runtime.sendMessage({ action: 'getClipboardText' });
                if (initialResponse.status !== 'success' || !initialResponse.text) {
                    console.error('Could not read clipboard.');
                    return;
                }
                originalClipboard = initialResponse.text;

                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                const emails = originalClipboard.split(/[\n,;]+/).map(e => e.trim()).filter(e => emailRegex.test(e));

                if (emails.length > 0) {
                    await pasteEmails(emails, selectors);
                }
            } catch (error) {
                console.error('[Paste Logic] Error during paste operation:', error);
            } finally {
                if (originalClipboard) {
                    await chrome.runtime.sendMessage({ action: 'copyToClipboard', text: originalClipboard });
                }
                pasteButton.disabled = false;
                pasteButton.textContent = 'Paste Approvers';
            }
        });

        pasteFavouritesButton.addEventListener('click', async () => {
            pasteFavouritesButton.disabled = true;
            pasteFavouritesButton.textContent = 'Pasting...';
            try {
                const response = await chrome.runtime.sendMessage({ action: 'getFavouriteApprovers' });
                if (response.status === 'success') {
                    await pasteEmails(response.emails, selectors);
                }
            } catch (error) {
                console.error('Error pasting favourite approvers:', error);
            } finally {
                pasteFavouritesButton.disabled = false;
                pasteFavouritesButton.textContent = 'Favourites';
            }
        });

        toLabel.parentNode.insertBefore(pasteButton, toLabel.nextSibling);
        toLabel.parentNode.insertBefore(pasteFavouritesButton, pasteButton.nextSibling);
    }

    async function pasteEmails(emails, selectors) {
        for (const email of emails) {
            await chrome.runtime.sendMessage({ action: 'copyToClipboard', text: email });
            const selectContainer = document.querySelector(selectors.selectContainer);
            if (selectContainer) {
                selectContainer.click();
            } else {
                break;
            }
            try {
                await window.utils.waitForElement('.select2-search-field input', 500);
                document.execCommand('paste');
                const firstResult = await window.utils.waitForElement(selectors.firstResult);
                firstResult.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                await window.utils.waitForElementToDisappear(selectors.firstResult);
            } catch (error) {
                console.warn(`[Paste Logic] Could not complete paste for ${email}:`, error);
            }
        }
    }

    function handleManageFavouritesButton() {
        const clearButton = Array.from(document.querySelectorAll('button.btn-link.mo-btn-link')).find(btn => btn.textContent.trim() === 'Clear');
        if (!clearButton) return;

        const buttonContainer = clearButton.parentNode;
        if (buttonContainer.querySelector('.manage-favourites-button')) return;

        const manageFavouritesButton = document.createElement('button');
        manageFavouritesButton.textContent = 'Manage Favourites';
        manageFavouritesButton.className = 'btn-link mo-btn-link manage-favourites-button';

        manageFavouritesButton.addEventListener('click', () => {
            if (chrome.runtime && chrome.runtime.id) {
                chrome.runtime.sendMessage({ action: 'openApproversPage' });
            } else {
                console.warn('Extension context invalidated. Please refresh the page.');
            }
        });

        clearButton.parentNode.insertBefore(manageFavouritesButton, clearButton.nextSibling);
    }

    window.approverPastingFeature = {
        handleApproverPasting,
        handleManageFavouritesButton
    };
})();
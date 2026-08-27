(function() {
    'use strict';

    const SETTING_KEY = 'approverSidebarEnhancementsEnabled';
    const REMOVED_RECIPIENTS_STORAGE_KEY = 'removedInternalApprovalRecipients';
    const RECIPIENT_TOOLTIP_CLASS = 'ops-toolshed-recipient-history-tooltip';
    const RECIPIENT_TOOLTIP_TEXT = 'Hide this recipient from history';
    let initialized = false;
    let featureEnabled = true;
    let removedRecipients = new Set();
    let removedRecipientsReady;
    let recipientTooltipSequence = 0;
    let recipientTooltip;

    function getRemovedRecipients() {
        if (!removedRecipientsReady) {
            removedRecipientsReady = chrome.storage.local
                .get({ [REMOVED_RECIPIENTS_STORAGE_KEY]: [] })
                .then(data => {
                    removedRecipients = new Set(data[REMOVED_RECIPIENTS_STORAGE_KEY] || []);
                })
                .catch(error => {
                    console.warn('Could not load removed internal-approval recipients:', error);
                });
        }
        return removedRecipientsReady;
    }

    function saveRemovedRecipients() {
        return chrome.storage.local
            .set({ [REMOVED_RECIPIENTS_STORAGE_KEY]: [...removedRecipients] })
            .catch(error => console.warn('Could not save removed internal-approval recipients:', error));
    }

    function normalizeRecipientEmail(email) {
        return String(email ?? '').trim().toLowerCase();
    }

    function findRemovedRecipient(email) {
        const normalizedEmail = normalizeRecipientEmail(email);
        if (!normalizedEmail) return undefined;

        return [...removedRecipients].find(removedEmail =>
            normalizeRecipientEmail(removedEmail) === normalizedEmail
        );
    }

    function isRemovedRecipient(email) {
        return findRemovedRecipient(email) !== undefined;
    }

    function restoreRecipientFromHistory(email) {
        const storedEmail = findRemovedRecipient(email);
        if (storedEmail === undefined) return false;

        removedRecipients.delete(storedEmail);
        saveRemovedRecipients();
        return true;
    }

    function getInternalApprovalRecipientInput() {
        const toLabel = Array.from(document.querySelectorAll('label'))
            .find(label => label.textContent.trim() === 'To');
        return toLabel?.parentElement?.querySelector('.select2-choices .select2-input');
    }

    function getVisibleRecipientDropdown(toInput) {
        if (document.activeElement !== toInput) return null;

        return Array.from(document.querySelectorAll('.select2-drop-active'))
            .find(dropdown => dropdown.style.display !== 'none' && dropdown.querySelector('.select2-results'));
    }

    function getRecipientEmail(result) {
        const label = result?.querySelector('.select2-result-label');
        return label?.querySelector('.ops-toolshed-recipient-history-email')?.textContent.trim() ||
            label?.textContent.trim() ||
            '';
    }

    function getExactRemovedRecipient(toInput, results) {
        const typedEmail = normalizeRecipientEmail(toInput?.value);
        if (!typedEmail) return null;

        return Array.from(results?.querySelectorAll('.select2-result-selectable') || [])
            .map(result => ({ result, email: getRecipientEmail(result) }))
            .find(({ email }) => normalizeRecipientEmail(email) === typedEmail && isRemovedRecipient(email)) ||
            null;
    }

    function positionRecipientTooltip(button, tooltip) {
        const buttonRect = button.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        const ownerDocument = button.ownerDocument;
        const view = ownerDocument.defaultView;
        const viewportWidth = ownerDocument.documentElement.clientWidth || view?.innerWidth || 0;
        const viewportHeight = ownerDocument.documentElement.clientHeight || view?.innerHeight || 0;
        const margin = 8;

        let left = buttonRect.left + (buttonRect.width - tooltipRect.width) / 2;
        if (viewportWidth > 0 && tooltipRect.width > 0) {
            left = Math.min(
                Math.max(margin, left),
                Math.max(margin, viewportWidth - tooltipRect.width - margin)
            );
        }

        let top = buttonRect.bottom + margin;
        if (viewportHeight > 0 && tooltipRect.height > 0 &&
            top + tooltipRect.height > viewportHeight - margin) {
            top = buttonRect.top - tooltipRect.height - margin;
        }

        tooltip.style.top = `${Math.round(Math.max(margin, top))}px`;
        tooltip.style.left = `${Math.round(Math.max(margin, left))}px`;
    }

    function destroyRecipientTooltip(button) {
        button?._opsToolshedRecipientHistoryTooltip?.destroy?.();
        if (button) delete button._opsToolshedRecipientHistoryTooltip;
    }

    function hideRecipientTooltip() {
        if (!recipientTooltip) return;
        recipientTooltip.hidden = true;
        delete recipientTooltip._opsToolshedRecipientHistoryTooltipOwner;
    }

    function installRecipientTooltip(button) {
        const ownerDocument = button.ownerDocument;
        const view = ownerDocument.defaultView;
        if (recipientTooltip &&
            (recipientTooltip.ownerDocument !== ownerDocument || !recipientTooltip.isConnected)) {
            recipientTooltip.remove();
            recipientTooltip = null;
        }
        if (!recipientTooltip) {
            recipientTooltip = ownerDocument.createElement('div');
            recipientTooltip.className = RECIPIENT_TOOLTIP_CLASS;
            recipientTooltip.id = `${RECIPIENT_TOOLTIP_CLASS}-${++recipientTooltipSequence}`;
            recipientTooltip.setAttribute('role', 'tooltip');
            recipientTooltip.hidden = true;
            recipientTooltip.textContent = RECIPIENT_TOOLTIP_TEXT;
            (ownerDocument.body || ownerDocument.documentElement).appendChild(recipientTooltip);
        }
        const tooltip = recipientTooltip;

        const show = () => {
            tooltip._opsToolshedRecipientHistoryTooltipOwner = button;
            tooltip.hidden = false;
            positionRecipientTooltip(button, tooltip);
        };
        const hide = () => {
            if (tooltip._opsToolshedRecipientHistoryTooltipOwner !== button) return;
            tooltip.hidden = true;
            delete tooltip._opsToolshedRecipientHistoryTooltipOwner;
        };
        const handleResize = () => {
            if (!tooltip.hidden && tooltip._opsToolshedRecipientHistoryTooltipOwner === button) {
                positionRecipientTooltip(button, tooltip);
            }
        };

        button.setAttribute('aria-describedby', tooltip.id);
        button.addEventListener('mouseenter', show);
        button.addEventListener('mouseleave', hide);
        button.addEventListener('focus', show);
        button.addEventListener('blur', hide);
        view?.addEventListener('resize', handleResize);

        button._opsToolshedRecipientHistoryTooltip = {
            destroy() {
                button.removeEventListener('mouseenter', show);
                button.removeEventListener('mouseleave', hide);
                button.removeEventListener('focus', show);
                button.removeEventListener('blur', hide);
                view?.removeEventListener('resize', handleResize);
                hide();
                button.removeAttribute('aria-describedby');
            }
        };
    }

    function installRecipientSelectionRestorer(result, email) {
        if (result._opsToolshedRecipientSelectionRestorer) return;

        const restoreOnSelection = event => {
            if (event.target.closest?.('.ops-toolshed-recipient-history-remove')) return;
            restoreRecipientFromHistory(email);
        };
        result.addEventListener('mouseup', restoreOnSelection, true);
        result.addEventListener('click', restoreOnSelection, true);
        result._opsToolshedRecipientSelectionRestorer = true;
    }

    function handleRecipientEnter(event) {
        if (!featureEnabled || (event.key !== 'Enter' && event.keyCode !== 13)) return;

        const toInput = event.currentTarget;
        const dropdown = getVisibleRecipientDropdown(toInput);
        const results = dropdown?.querySelector('.select2-results');
        const exactMatch = getExactRemovedRecipient(toInput, results);
        if (!exactMatch) return;

        // Capture phase runs before Select2's own keydown handler. The result
        // can therefore be selected normally while the history exclusion is
        // removed in time for this recipient to remain available later.
        restoreRecipientFromHistory(exactMatch.email);
    }

    function installRecipientHistoryVisibilityGuard() {
        const toInput = getInternalApprovalRecipientInput();
        if (!toInput || toInput.dataset.opsToolshedRecipientHistoryGuarded) return;

        toInput.dataset.opsToolshedRecipientHistoryGuarded = 'true';
        const hideUntilFiltered = () => {
            if (featureEnabled) document.body.classList.add('ops-toolshed-recipient-history-pending');
        };
        toInput.addEventListener('mousedown', hideUntilFiltered);
        toInput.addEventListener('focus', hideUntilFiltered);
        toInput.addEventListener('keydown', handleRecipientEnter, true);
        toInput.addEventListener('blur', () => {
            document.body.classList.remove('ops-toolshed-recipient-history-pending');
        });
    }

    function removeEnhancements() {
        document.querySelectorAll('.prisma-paste-button, .manage-favourites-button, .ops-toolshed-recipient-history-actions')
            .forEach(control => control.remove());
        document.querySelectorAll('.ops-toolshed-recipient-history-remove').forEach(button => {
            destroyRecipientTooltip(button);
        });
        recipientTooltip?.remove();
        recipientTooltip = null;
        document.querySelectorAll(`.${RECIPIENT_TOOLTIP_CLASS}`).forEach(tooltip => tooltip.remove());
        document.querySelectorAll('.select2-result-label[data-ops-toolshed-recipient-history-handled]')
            .forEach(label => {
                const email = label.querySelector('.ops-toolshed-recipient-history-email')?.textContent || label.textContent;
                label.replaceChildren(document.createTextNode(email.trim()));
                delete label.dataset.opsToolshedRecipientHistoryHandled;
            });
        document.body?.classList.remove('ops-toolshed-recipient-history-pending');
    }

    function apply() {
        if (!featureEnabled) {
            removeEnhancements();
            return;
        }
        handleApproverPasting();
        handleManageFavouritesButton();
        addRecipientHistoryControls();
    }

    function removeRecipientFromHistory(email, result) {
        removedRecipients.add(email);
        destroyRecipientTooltip(result.querySelector('.ops-toolshed-recipient-history-remove'));
        result.remove();
        saveRemovedRecipients();
    }

    function addRecipientHistoryControls() {
        if (!featureEnabled) {
            removeEnhancements();
            return;
        }
        const toInput = getInternalApprovalRecipientInput();
        if (!toInput) return;
        installRecipientHistoryVisibilityGuard();

        getRemovedRecipients().then(() => {
            if (!featureEnabled) return;
            const dropdown = getVisibleRecipientDropdown(toInput);
            if (!dropdown) {
                hideRecipientTooltip();
                return;
            }

            const results = dropdown.querySelector('.select2-results');
            const recipientResults = Array.from(results.querySelectorAll('.select2-result-selectable'));
            const visibleEmails = [];

            recipientResults.forEach(result => {
                const label = result.querySelector('.select2-result-label');
                if (!label || label.dataset.opsToolshedRecipientHistoryHandled) return;

                const email = label.textContent.trim();
                if (!email) return;

                label.dataset.opsToolshedRecipientHistoryHandled = 'true';
                if (isRemovedRecipient(email) &&
                    normalizeRecipientEmail(toInput.value) !== normalizeRecipientEmail(email)) {
                    result.remove();
                    return;
                }

                visibleEmails.push(email);
                const removeButton = document.createElement('button');
                removeButton.type = 'button';
                removeButton.className = 'ops-toolshed-recipient-history-remove';
                removeButton.setAttribute('aria-label', `Remove ${email} from recipient history`);
                removeButton.textContent = '×';
                installRecipientTooltip(removeButton);
                const preventSelect2Selection = event => {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                };
                // Select2 selects a result on mouseup, before a click handler has a
                // chance to help. Stop every pointer phase on the remove control.
                ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend']
                    .forEach(eventName => removeButton.addEventListener(eventName, preventSelect2Selection));
                removeButton.addEventListener('click', event => {
                    preventSelect2Selection(event);
                    removeRecipientFromHistory(email, result);
                });

                const emailText = document.createElement('span');
                emailText.className = 'ops-toolshed-recipient-history-email';
                emailText.textContent = email;
                label.replaceChildren(emailText, removeButton);

                if (isRemovedRecipient(email)) {
                    installRecipientSelectionRestorer(result, email);
                }
            });

            if (visibleEmails.length === 0 || results.querySelector('.ops-toolshed-recipient-history-clear')) {
                document.body.classList.remove('ops-toolshed-recipient-history-pending');
                return;
            }

            const clearItem = document.createElement('li');
            clearItem.className = 'ops-toolshed-recipient-history-actions';
            const clearButton = document.createElement('button');
            clearButton.type = 'button';
            clearButton.className = 'ops-toolshed-recipient-history-clear';
            clearButton.textContent = 'Clear history';
            clearButton.addEventListener('mousedown', event => event.stopPropagation());
            clearButton.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                visibleEmails.forEach(email => removedRecipients.add(email));
                results.querySelectorAll('.select2-result-selectable').forEach(result => result.remove());
                clearItem.remove();
                saveRemovedRecipients();
            });
            clearItem.appendChild(clearButton);
            results.appendChild(clearItem);
            document.body.classList.remove('ops-toolshed-recipient-history-pending');
        });
    }

    function handleApproverPasting() {
        if (!featureEnabled) {
            removeEnhancements();
            return;
        }
        const selectors = {
            toLabel: 'label',
            selectContainer: '.select2-choices',
            firstResult: '.select2-result-selectable'
        };

        const toLabel = Array.from(document.querySelectorAll(selectors.toLabel)).find(label => label.textContent.trim() === 'To');
        if (!toLabel) return;

        installRecipientHistoryVisibilityGuard();

        const buttonContainer = toLabel.parentNode;
        if (buttonContainer.querySelector('.prisma-paste-button')) return;

        const pasteButton = document.createElement('button');
        pasteButton.textContent = 'Paste Approvers';
        // Removed 'filter-button' class to separate styling
        pasteButton.className = 'prisma-paste-button';
        pasteButton.style.marginLeft = '10px';

        const pasteFavouritesButton = document.createElement('button');
        pasteFavouritesButton.textContent = 'Favourites';
        // Removed 'filter-button' class to separate styling
        pasteFavouritesButton.className = 'prisma-paste-button';
        pasteFavouritesButton.style.marginLeft = '5px';

        pasteButton.addEventListener('click', async (event) => {
            // Page scripts can synthesize clicks on injected DOM controls. Only a
            // real user gesture may cross the privileged clipboard-read boundary.
            if (!event.isTrusted) return;

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
        if (!featureEnabled) {
            removeEnhancements();
            return;
        }
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

    function initialize() {
        if (initialized) return;
        initialized = true;

        if (typeof chrome === 'undefined' || !chrome.storage?.sync) {
            apply();
            return;
        }

        chrome.storage.sync.get({ [SETTING_KEY]: true }, data => {
            featureEnabled = data[SETTING_KEY] !== false;
            apply();
        });
        chrome.storage.onChanged?.addListener((changes, area) => {
            if (area !== 'sync' || !changes[SETTING_KEY]) return;
            featureEnabled = changes[SETTING_KEY].newValue !== false;
            apply();
        });
    }

    window.approverPastingFeature = {
        initialize,
        apply,
        handleApproverPasting,
        handleManageFavouritesButton,
        addRecipientHistoryControls
    };
})();

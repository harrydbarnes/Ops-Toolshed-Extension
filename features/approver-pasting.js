(function() {
    'use strict';

    const SETTING_KEY = 'approverSidebarEnhancementsEnabled';
    const SUBMITTED_RECIPIENT_DISPLAY_SETTING_KEY = 'approverSubmittedRecipientDisplayEnabled';
    const REMOVED_RECIPIENTS_STORAGE_KEY = 'removedInternalApprovalRecipients';
    const SUBMITTED_RECIPIENTS_STORAGE_KEY = 'internalApprovalSubmittedRecipients';
    const RECIPIENT_TOOLTIP_CLASS = 'ops-toolshed-recipient-history-tooltip';
    const RECIPIENT_TOOLTIP_TEXT = 'Hide this recipient from history';
    const SUBMITTED_RECIPIENTS_CLASS = 'ops-toolshed-submitted-recipients';
    const EMAIL_PATTERN = /[^\s,;<>]+@[^\s,;<>]+\.[^\s,;<>]+/gi;
    let initialized = false;
    let featureEnabled = true;
    let submittedRecipientDisplayEnabled = true;
    let removedRecipients = new Set();
    let removedRecipientsReady;
    let recipientTooltipSequence = 0;
    let recipientTooltip;
    let submittedRecipientsByCampaign = {};
    let submittedRecipientsReady;
    let submissionTrackingInstalled = false;
    let recipientCaptureObserver;
    let recipientCaptureObserverRoot;
    const pendingRecipientEmailsByCampaign = {};
    const submittedWorkflowStateByCampaign = {};

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

    function normalizeExtractedEmail(email) {
        return normalizeRecipientEmail(email).replace(/[.,;:)\]}]+$/, '');
    }

    function uniqueRecipientEmails(emails) {
        const seen = new Set();
        return (emails || [])
            .map(normalizeExtractedEmail)
            .filter(email => {
                if (!email || seen.has(email)) return false;
                seen.add(email);
                return true;
            });
    }

    function extractRecipientEmails(text) {
        return uniqueRecipientEmails(String(text ?? '').match(EMAIL_PATTERN) || []);
    }

    function getCampaignId() {
        return new URLSearchParams(window.location.hash.replace(/^#/, '')).get('campaign-id') || '';
    }

    function normalizeSubmittedRecipientRecord(record) {
        const emails = Array.isArray(record) ? record : record?.emails;
        const normalizedEmails = uniqueRecipientEmails(emails);
        if (normalizedEmails.length === 0) return null;

        return {
            emails: normalizedEmails,
            capturedAt: Number(record?.capturedAt) || 0
        };
    }

    function loadSubmittedRecipients() {
        if (!submittedRecipientsReady) {
            const storage = typeof chrome !== 'undefined' ? chrome.storage?.local : null;
            if (!storage?.get) {
                submittedRecipientsReady = Promise.resolve();
            } else {
                submittedRecipientsReady = Promise.resolve()
                    .then(() => storage.get({ [SUBMITTED_RECIPIENTS_STORAGE_KEY]: {} }))
                    .then(data => {
                        const stored = data?.[SUBMITTED_RECIPIENTS_STORAGE_KEY];
                        if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return;

                        const loadedRecipients = {};
                        Object.entries(stored).forEach(([campaignId, record]) => {
                            const normalizedRecord = normalizeSubmittedRecipientRecord(record);
                            if (normalizedRecord) loadedRecipients[campaignId] = normalizedRecord;
                        });
                        // A submission can be captured while the initial storage
                        // read is still pending. Keep that newer in-memory value.
                        submittedRecipientsByCampaign = {
                            ...loadedRecipients,
                            ...submittedRecipientsByCampaign
                        };
                    })
                    .catch(error => {
                        console.warn('Could not load submitted internal-approval recipients:', error);
                    });
            }
        }
        return submittedRecipientsReady;
    }

    function saveSubmittedRecipients() {
        const storage = typeof chrome !== 'undefined' ? chrome.storage?.local : null;
        if (!storage?.set) return Promise.resolve();

        return loadSubmittedRecipients()
            .then(() => storage.set({
                [SUBMITTED_RECIPIENTS_STORAGE_KEY]: submittedRecipientsByCampaign
            }))
            .catch(error => console.warn('Could not save submitted internal-approval recipients:', error));
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

    function getInternalApprovalRecipientInput(root = document) {
        const toLabel = Array.from(root.querySelectorAll?.('label') || [])
            .find(label => label.textContent.trim().replace(/:$/, '') === 'To');
        if (!toLabel) return null;

        return toLabel.parentElement?.querySelector('.select2-choices .select2-input') ||
            toLabel.closest?.('.control-group, .form-group, .field, .row')
                ?.querySelector?.('.select2-choices .select2-input') ||
            root.querySelector?.('.select2-choices .select2-input');
    }

    function getWorkflowRoot(element) {
        const workflowWidget = element?.closest?.('.workflow-widget-wrapper');
        if (workflowWidget) return workflowWidget;

        const sidePanel = element?.closest?.('mo-side-panel, .mo-side-panel');
        if (sidePanel) return sidePanel;

        return document.querySelector('.workflow-widget-wrapper, mo-side-panel, .mo-side-panel');
    }

    function getElementAttributeText(element) {
        return [
            element?.getAttribute?.('data-email'),
            element?.getAttribute?.('data-recipient-email'),
            element?.getAttribute?.('data-value'),
            element?.getAttribute?.('aria-label'),
            element?.getAttribute?.('title'),
            element?.getAttribute?.('name'),
            element?.getAttribute?.('value')
        ].filter(Boolean).join(' ');
    }

    function getRecipientChoiceText(choice) {
        return [
            getElementAttributeText(choice),
            ...Array.from(choice?.querySelectorAll?.(
                '[data-email], [data-recipient-email], [data-value], [aria-label], [title], [value]'
            ) || []).map(getElementAttributeText),
            choice?.textContent
        ].filter(Boolean).join(' ');
    }

    function getSelectedRecipientEmails(root = document) {
        const toInput = getInternalApprovalRecipientInput(root);
        const choices = toInput?.closest('.select2-choices');
        if (!choices) return [];

        const emails = [];
        choices.querySelectorAll('.select2-search-choice, [data-select2-tag]').forEach(choice => {
            emails.push(...extractRecipientEmails(getRecipientChoiceText(choice)));
        });

        if (emails.length === 0) {
            choices.querySelectorAll('input[type="hidden"]').forEach(input => {
                emails.push(...extractRecipientEmails(input.value || getElementAttributeText(input)));
            });
        }

        return uniqueRecipientEmails(emails);
    }

    function areRecipientListsEqual(left, right) {
        return left.length === right.length && left.every((email, index) => email === right[index]);
    }

    function rememberCurrentRecipientEmails(workflowRoot) {
        if (!isSubmittedRecipientDisplayEnabled() || !workflowRoot) return [];

        const campaignId = getCampaignId();
        const emails = getSelectedRecipientEmails(workflowRoot);
        if (!campaignId || emails.length === 0) return emails;

        const previous = pendingRecipientEmailsByCampaign[campaignId] || [];
        if (!areRecipientListsEqual(previous, emails)) {
            pendingRecipientEmailsByCampaign[campaignId] = emails;
        }
        return emails;
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

    function getSubmittedStatusElement(root) {
        if (!root?.querySelectorAll) return null;

        const candidates = [root, ...root.querySelectorAll('*')]
            .filter(element => {
                if (element.classList?.contains(SUBMITTED_RECIPIENTS_CLASS)) return false;
                return element.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() === 'submitted';
            })
            .sort((left, right) =>
                (left.querySelectorAll?.('*').length || 0) -
                (right.querySelectorAll?.('*').length || 0)
            );

        return candidates[0] || null;
    }

    function getNativeSubmittedRecipientEmails(statusElement) {
        let current = statusElement;
        for (let depth = 0; current && depth < 2; depth += 1) {
            const emails = uniqueRecipientEmails([
                ...extractRecipientEmails(getElementAttributeText(current)),
                ...extractRecipientEmails(current.textContent)
            ]);
            if (emails.length > 0) return emails;
            current = current.parentElement;
        }
        return [];
    }

    function renderSubmittedRecipientDisplay(root = getWorkflowRoot()) {
        if (!isSubmittedRecipientDisplayEnabled()) {
            removeSubmittedRecipientDisplay();
            return;
        }

        const workflowRoot = root || getWorkflowRoot();
        if (!workflowRoot) {
            document.querySelectorAll(`.${SUBMITTED_RECIPIENTS_CLASS}`).forEach(display => display.remove());
            return;
        }

        const existingDisplays = Array.from(
            workflowRoot.querySelectorAll(`.${SUBMITTED_RECIPIENTS_CLASS}`)
        );
        const statusElement = getSubmittedStatusElement(workflowRoot);
        if (!statusElement) {
            existingDisplays.forEach(display => display.remove());
            return;
        }

        const nativeEmails = getNativeSubmittedRecipientEmails(statusElement);
        const campaignId = getCampaignId();
        const storedEmails = submittedRecipientsByCampaign[campaignId]?.emails || [];
        const selectedEmails = getSelectedRecipientEmails(workflowRoot);
        const emails = nativeEmails.length > 0
            ? nativeEmails
            : storedEmails.length > 0
                ? storedEmails
                : selectedEmails;
        if (emails.length === 0) {
            existingDisplays.forEach(display => display.remove());
            return;
        }

        const display = existingDisplays.shift() || document.createElement('span');
        existingDisplays.forEach(otherDisplay => otherDisplay.remove());
        display.className = SUBMITTED_RECIPIENTS_CLASS;
        display.textContent = `to: ${emails.join(', ')}`;
        display.setAttribute('aria-label', `Submitted to ${emails.join(', ')}`);
        display.dataset.campaignId = campaignId;
        display.dataset.source = nativeEmails.length > 0
            ? 'native'
            : storedEmails.length > 0
                ? 'captured'
                : 'current';

        if (display.parentNode !== statusElement.parentNode ||
            display.previousElementSibling !== statusElement) {
            statusElement.parentNode?.insertBefore(display, statusElement.nextSibling);
        }
    }

    function captureSubmittedRecipients(workflowRoot) {
        if (!isSubmittedRecipientDisplayEnabled() || !workflowRoot) return;

        const campaignId = getCampaignId();
        const emails = rememberCurrentRecipientEmails(workflowRoot);
        if (!campaignId || emails.length === 0) return;

        submittedRecipientsByCampaign[campaignId] = {
            emails,
            capturedAt: Date.now()
        };
        saveSubmittedRecipients();
        renderSubmittedRecipientDisplay(workflowRoot);
    }

    function isSubmittedRecipientDisplayEnabled() {
        return featureEnabled && submittedRecipientDisplayEnabled;
    }

    function isSubmittedWorkflow(workflowRoot) {
        return Boolean(getSubmittedStatusElement(workflowRoot));
    }

    function promotePendingRecipientCapture(workflowRoot) {
        if (!isSubmittedRecipientDisplayEnabled() || !workflowRoot) return;

        const campaignId = getCampaignId();
        if (!campaignId) return;

        const isSubmitted = isSubmittedWorkflow(workflowRoot);
        const pendingEmails = pendingRecipientEmailsByCampaign[campaignId] || [];
        const wasSubmitted = submittedWorkflowStateByCampaign[campaignId];
        submittedWorkflowStateByCampaign[campaignId] = isSubmitted;
        if (!isSubmitted || wasSubmitted !== false || pendingEmails.length === 0) return;

        const previousRecord = submittedRecipientsByCampaign[campaignId];
        if (previousRecord?.emails && areRecipientListsEqual(previousRecord.emails, pendingEmails)) return;

        submittedRecipientsByCampaign[campaignId] = {
            emails: pendingEmails,
            capturedAt: Date.now()
        };
        saveSubmittedRecipients();
    }

    function isApprovalSubmissionTrigger(element) {
        if (!element) return false;

        const label = [
            element.textContent,
            getElementAttributeText(element),
            element.getAttribute?.('data-action'),
            element.getAttribute?.('data-testid'),
            typeof element.className === 'string' ? element.className : ''
        ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

        return /\bsubmit\b/i.test(label) ||
            /\b(?:send|request)\b.*\bapproval\b/i.test(label);
    }

    function getWorkflowRootFromEventTarget(target) {
        return target?.closest?.('.workflow-widget-wrapper, mo-side-panel, .mo-side-panel') || null;
    }

    function handleApprovalSubmissionClick(event) {
        if (!isSubmittedRecipientDisplayEnabled()) return;

        const eventPath = event.composedPath?.() || [];
        const interactiveElements = [event.target, ...eventPath]
            .filter(element => element?.closest || element?.getAttribute);
        const trigger = interactiveElements
            .map(element => element?.closest?.(
                'button, [role="button"], [role="menuitem"], a, mo-button, [data-action], [data-testid], [aria-label], [class*="submit"], [class*="approval"]'
            ) || element)
            .find(element => isApprovalSubmissionTrigger(element));
        const workflowRoot = getWorkflowRootFromEventTarget(trigger || event.target) || getWorkflowRoot();
        if (!workflowRoot) return;

        // Keep a lightweight in-memory candidate even when Prisma's custom
        // submit control does not expose a useful label to the document.
        rememberCurrentRecipientEmails(workflowRoot);
        if (!trigger || !isApprovalSubmissionTrigger(trigger)) return;

        // This capture-phase listener runs before Prisma replaces the form with
        // the submitted state, so the selected recipient chips are still read.
        captureSubmittedRecipients(workflowRoot);
    }

    function handleApprovalFormSubmit(event) {
        if (!isSubmittedRecipientDisplayEnabled()) return;

        const workflowRoot = getWorkflowRootFromEventTarget(event.target) || getWorkflowRoot();
        if (workflowRoot) captureSubmittedRecipients(workflowRoot);
    }

    function handleRecipientSelectionChange(event) {
        if (!isSubmittedRecipientDisplayEnabled()) return;

        const workflowRoot = getWorkflowRootFromEventTarget(event.target) || getWorkflowRoot();
        if (workflowRoot) rememberCurrentRecipientEmails(workflowRoot);
    }

    function installRecipientCaptureObserver(workflowRoot) {
        if (!isSubmittedRecipientDisplayEnabled() || !workflowRoot) return;
        if (recipientCaptureObserverRoot === workflowRoot && recipientCaptureObserver) return;

        recipientCaptureObserver?.disconnect();
        const Observer = workflowRoot.ownerDocument?.defaultView?.MutationObserver ||
            (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
        if (!Observer) return;

        recipientCaptureObserver = new Observer(() => {
            rememberCurrentRecipientEmails(workflowRoot);
        });
        recipientCaptureObserver.observe(workflowRoot, { childList: true, subtree: true });
        recipientCaptureObserverRoot = workflowRoot;
    }

    function installSubmissionRecipientTracking() {
        if (submissionTrackingInstalled) return;

        document.addEventListener('click', handleApprovalSubmissionClick, true);
        document.addEventListener('submit', handleApprovalFormSubmit, true);
        document.addEventListener('change', handleRecipientSelectionChange, true);
        document.addEventListener('input', handleRecipientSelectionChange, true);
        submissionTrackingInstalled = true;
    }

    function removeSubmissionRecipientTracking() {
        if (!submissionTrackingInstalled) return;

        document.removeEventListener('click', handleApprovalSubmissionClick, true);
        document.removeEventListener('submit', handleApprovalFormSubmit, true);
        document.removeEventListener('change', handleRecipientSelectionChange, true);
        document.removeEventListener('input', handleRecipientSelectionChange, true);
        submissionTrackingInstalled = false;
    }

    function removeSubmittedRecipientDisplay() {
        document.querySelectorAll(`.${SUBMITTED_RECIPIENTS_CLASS}`).forEach(display => display.remove());
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
        removeSubmissionRecipientTracking();
        recipientCaptureObserver?.disconnect();
        recipientCaptureObserver = null;
        recipientCaptureObserverRoot = null;
        removeSubmittedRecipientDisplay();
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
        if (isSubmittedRecipientDisplayEnabled()) {
            handleSubmittedRecipientDisplay();
        } else {
            removeSubmissionRecipientTracking();
            removeSubmittedRecipientDisplay();
            recipientCaptureObserver?.disconnect();
            recipientCaptureObserver = null;
            recipientCaptureObserverRoot = null;
        }
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

    function handleSubmittedRecipientDisplay() {
        if (!featureEnabled) {
            removeEnhancements();
            return;
        }
        if (!submittedRecipientDisplayEnabled) {
            removeSubmissionRecipientTracking();
            removeSubmittedRecipientDisplay();
            recipientCaptureObserver?.disconnect();
            recipientCaptureObserver = null;
            recipientCaptureObserverRoot = null;
            return;
        }

        installSubmissionRecipientTracking();
        const workflowRoot = getWorkflowRoot();
        if (!workflowRoot) {
            removeSubmittedRecipientDisplay();
            return;
        }

        installRecipientCaptureObserver(workflowRoot);
        rememberCurrentRecipientEmails(workflowRoot);

        return loadSubmittedRecipients().then(() => {
            if (isSubmittedRecipientDisplayEnabled()) {
                promotePendingRecipientCapture(workflowRoot);
                renderSubmittedRecipientDisplay(workflowRoot);
            }
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

        chrome.storage.sync.get({
            [SETTING_KEY]: true,
            [SUBMITTED_RECIPIENT_DISPLAY_SETTING_KEY]: true
        }, data => {
            featureEnabled = data[SETTING_KEY] !== false;
            submittedRecipientDisplayEnabled = data[SUBMITTED_RECIPIENT_DISPLAY_SETTING_KEY] !== false;
            apply();
        });
        chrome.storage.onChanged?.addListener((changes, area) => {
            if (area !== 'sync') return;
            if (changes[SETTING_KEY]) featureEnabled = changes[SETTING_KEY].newValue !== false;
            if (changes[SUBMITTED_RECIPIENT_DISPLAY_SETTING_KEY]) {
                submittedRecipientDisplayEnabled = changes[SUBMITTED_RECIPIENT_DISPLAY_SETTING_KEY].newValue !== false;
            }
            if (!changes[SETTING_KEY] && !changes[SUBMITTED_RECIPIENT_DISPLAY_SETTING_KEY]) return;
            apply();
        });
    }

    window.approverPastingFeature = {
        initialize,
        apply,
        handleApproverPasting,
        handleManageFavouritesButton,
        addRecipientHistoryControls,
        handleSubmittedRecipientDisplay
    };
})();

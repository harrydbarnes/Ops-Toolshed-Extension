(function() {
    'use strict';

    let mediaMixAutomated = false;
    let budgetTypeAutomated = false;

    // Cached settings
    let hidingSectionsEnabled = true;
    let automateFormFieldsEnabled = true;
    let alwaysShowCommentsEnabled = true;
    let ordersShortcutEnabled = true;
    let approverWidgetPlacementEnabled = true;
    let quickCampaignActionsEnabled = true;
    let budgetWidgetOptimisedEnabled = true;
    let campaignNameQuickCopyEnabled = true;
    let campaignHeaderQuickCopyEnabled = true;
    let campaignDateShortcutEnabled = true;
    let relocatedWorkflowSlot = null;
    let cachedNavbarWrapper = null;
    let cachedActualiseMonthRow = null;
    const cachedNavigationElements = Object.create(null);
    let campaignNameToastTimeout = null;
    let campaignNameCopyListenerAttached = false;
    let campaignDetailsRequestAttempt = 0;
    let campaignDetailsRequestTimeout = null;

    // Class selectors for Budget UI
    const BUDGET_CONTAINER_ID = 'campaign-budget-overview-container';
    const BUDGET_VALUE_SELECTOR_DATA = '[data-cy="total-budget"]';
    const BUDGET_VALUE_SELECTOR_CLASS = '.xb1phb\\+xdUqb87KZK3L\\+Sw\\=\\=';
    const BUDGET_VALUE_SELECTOR = `${BUDGET_VALUE_SELECTOR_DATA}, ${BUDGET_VALUE_SELECTOR_CLASS}`;
    const BUDGET_LABEL_SELECTOR = '.cbjS\\+XIoeuDmb-oqpXOJpw\\=\\=';   // Escaped for JS querySelector
    const PROGRESS_BAR_CLASS = '.gDndZofhX67JYdRMGJEFTw\\=\\=';
    const BUDGET_STYLE_ID = 'optimised-budget-styles';
    const ACTUALISE_WORKFLOW_CLASS = 'actualise-workflow-slot';
    const ACTUALISE_MONTH_ROW_CLASS = 'toolshed-actualise-month-row';
    const APPROVER_WIDGET_PLACEMENT_CLASS = 'approver-widget-placement-enabled';
    const ACTUALISE_NAVBAR_WRAPPER_ID = 'toolshed-actualise-navbar-wrapper';
    const ACTUALISE_HEADER_HIDDEN_CLASS = 'toolshed-actualise-header-hidden';
    const ACTUALISE_MONTHS_GROUP_CLASS = 'toolshed-actualise-months-group';
    const ACTUALISE_NATIVE_CLOSE_CLASS = 'toolshed-actualise-native-close';
    const ACTUALISE_CLOSE_BUTTON_CLASS = 'toolshed-actualise-close-button';
    const ACTUALISE_NATIVE_CLOSE_SLOT_ATTRIBUTE = 'data-toolshed-actualise-original-slot';
    const CAMPAIGN_DATE_EDITABLE_CLASS = 'toolshed-campaign-date-editable';
    const CAMPAIGN_DATE_EDIT_HOST_CLASS = 'toolshed-campaign-date-edit-host';
    const CAMPAIGN_DATE_EDIT_MARKER_CLASS = 'toolshed-campaign-date-edit-marker';
    const CAMPAIGN_DATE_EDIT_ICON_CLASS = `${CAMPAIGN_DATE_EDIT_MARKER_CLASS}-icon`;
    const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
    const campaignDateTooltipState = new WeakMap();

    function syncApproverWidgetPlacementClass() {
        document.body?.classList.toggle(
            APPROVER_WIDGET_PLACEMENT_CLASS,
            approverWidgetPlacementEnabled
        );
    }

    // Initialize settings
    if (chrome.runtime && chrome.runtime.id) {
        chrome.storage.sync.get([
            'hidingSectionsEnabled',
            'automateFormFieldsEnabled',
            'alwaysShowCommentsEnabled',
            'ordersShortcutEnabled',
            'approverWidgetPlacementEnabled',
            'quickCampaignActionsEnabled',
            'budgetWidgetOptimisedEnabled',
            'campaignNameQuickCopyEnabled',
            'campaignHeaderQuickCopyEnabled',
            'campaignDateShortcutEnabled'
        ], (data) => {
            if (chrome.runtime.lastError) return;
            if (data.hidingSectionsEnabled !== undefined) hidingSectionsEnabled = data.hidingSectionsEnabled;
            if (data.automateFormFieldsEnabled !== undefined) automateFormFieldsEnabled = data.automateFormFieldsEnabled;
            if (data.alwaysShowCommentsEnabled !== undefined) alwaysShowCommentsEnabled = data.alwaysShowCommentsEnabled;
            if (data.ordersShortcutEnabled !== undefined) ordersShortcutEnabled = data.ordersShortcutEnabled;
            if (data.approverWidgetPlacementEnabled !== undefined) approverWidgetPlacementEnabled = data.approverWidgetPlacementEnabled;
            if (data.quickCampaignActionsEnabled !== undefined) quickCampaignActionsEnabled = data.quickCampaignActionsEnabled;
            if (data.budgetWidgetOptimisedEnabled !== undefined) budgetWidgetOptimisedEnabled = data.budgetWidgetOptimisedEnabled;
            if (data.campaignNameQuickCopyEnabled !== undefined) campaignNameQuickCopyEnabled = data.campaignNameQuickCopyEnabled;
            if (data.campaignHeaderQuickCopyEnabled !== undefined) campaignHeaderQuickCopyEnabled = data.campaignHeaderQuickCopyEnabled;
            if (data.campaignDateShortcutEnabled !== undefined) campaignDateShortcutEnabled = data.campaignDateShortcutEnabled;
            syncApproverWidgetPlacementClass();
            syncCampaignDateEditMarker();
        });

        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace !== 'sync') return;
            if (changes.hidingSectionsEnabled) hidingSectionsEnabled = changes.hidingSectionsEnabled.newValue;
            if (changes.automateFormFieldsEnabled) automateFormFieldsEnabled = changes.automateFormFieldsEnabled.newValue;
            if (changes.alwaysShowCommentsEnabled) alwaysShowCommentsEnabled = changes.alwaysShowCommentsEnabled.newValue;
            if (changes.ordersShortcutEnabled) ordersShortcutEnabled = changes.ordersShortcutEnabled.newValue;
            if (changes.approverWidgetPlacementEnabled) approverWidgetPlacementEnabled = changes.approverWidgetPlacementEnabled.newValue;
            if (changes.quickCampaignActionsEnabled) quickCampaignActionsEnabled = changes.quickCampaignActionsEnabled.newValue;
            if (changes.budgetWidgetOptimisedEnabled) budgetWidgetOptimisedEnabled = changes.budgetWidgetOptimisedEnabled.newValue;
            if (changes.campaignNameQuickCopyEnabled) campaignNameQuickCopyEnabled = changes.campaignNameQuickCopyEnabled.newValue;
            if (changes.campaignHeaderQuickCopyEnabled) campaignHeaderQuickCopyEnabled = changes.campaignHeaderQuickCopyEnabled.newValue;
            if (changes.campaignDateShortcutEnabled) {
                campaignDateShortcutEnabled = changes.campaignDateShortcutEnabled.newValue;
                if (!campaignDateShortcutEnabled) cancelCampaignDetailsRequest();
                syncCampaignDateEditMarker();
            }
            if (changes.approverWidgetPlacementEnabled) {
                syncApproverWidgetPlacementClass();
            }
        });
    }

    function handleCampaignManagementFeatures() {
        if (!window.location.href.includes('osModalId=prsm-cm-cmpadd')) {
            return;
        }

        // Use cached settings
        if (hidingSectionsEnabled !== false) {
            const objectiveSection = document.querySelector('fieldset.sectionObjective');
            if (objectiveSection) objectiveSection.style.display = 'none';

            const targetingSection = document.querySelector('fieldset.sectionTargeting');
            if (targetingSection) targetingSection.style.display = 'none';

            const flightingSelect = document.querySelector('#gwt-debug-distribution');
            if (flightingSelect) {
                const controlGroupDiv = flightingSelect.parentElement;
                if (controlGroupDiv && controlGroupDiv.parentElement) {
                    controlGroupDiv.parentElement.style.display = 'none';
                }
            }
        }

        if (automateFormFieldsEnabled !== false) {
            // Refactored to find by label text for robustness
            const mediaMixLabel = Array.from(document.querySelectorAll('label')).find(label => label.textContent.trim() === 'Media Mix');
            if (mediaMixLabel) {
                const mediaTypeId = mediaMixLabel.getAttribute('for');
                const mediaTypeSelect = document.getElementById(mediaTypeId);
                if (mediaTypeSelect && !mediaMixAutomated) {
                    const onlineOption = mediaTypeSelect.querySelector('option[value="media_digital"]');
                    if (onlineOption) {
                        mediaTypeSelect.value = 'media_digital';
                        mediaTypeSelect.dispatchEvent(new Event('change', { bubbles: true }));
                        mediaTypeSelect.dispatchEvent(new Event('input', { bubbles: true }));
                        mediaMixAutomated = true;
                    }
                }
            }

            const budgetTypeLabel = Array.from(document.querySelectorAll('label')).find(label => label.textContent.trim() === 'Budget Type');
            if (budgetTypeLabel) {
                const budgetTypeId = budgetTypeLabel.getAttribute('for');
                const budgetTypeSelect = document.getElementById(budgetTypeId);
                if (budgetTypeSelect && !budgetTypeAutomated) {
                    const totalCostOption = budgetTypeSelect.querySelector('option[value="3"]');
                    if (totalCostOption) {
                        budgetTypeSelect.value = '3';
                        budgetTypeSelect.dispatchEvent(new Event('change', { bubbles: true }));
                        budgetTypeSelect.dispatchEvent(new Event('input', { bubbles: true }));
                        budgetTypeAutomated = true;
                    }
                }
            }
        }
    }

    function resetCampaignFlags() {
        mediaMixAutomated = false;
        budgetTypeAutomated = false;
        cachedNavbarWrapper = null;
        cachedActualiseMonthRow = null;
        Object.keys(cachedNavigationElements).forEach(key => {
            delete cachedNavigationElements[key];
        });
    }

    function getCachedNavigationElement(key, selector) {
        const cached = cachedNavigationElements[key];
        if (cached?.isConnected && cached.matches(selector)) return cached;

        const next = document.querySelector(selector);
        if (next) cachedNavigationElements[key] = next;
        else delete cachedNavigationElements[key];
        return next;
    }

    function getNavbarWrapper() {
        const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const isActualise = params.get('ptb-ctx') === 'actualize' || params.get('route') === 'actualize';
        const wrappers = Array.from(document.querySelectorAll('.p2b-navbar-wrapper'));
        const injectedWrapper = wrappers.find(wrapper => wrapper.id === ACTUALISE_NAVBAR_WRAPPER_ID);
        const nativeWrapper = wrappers.find(wrapper => wrapper.id !== ACTUALISE_NAVBAR_WRAPPER_ID);
        const expectedWrapper = isActualise ? injectedWrapper || nativeWrapper : nativeWrapper;

        if (cachedNavbarWrapper?.isConnected && cachedNavbarWrapper === expectedWrapper) {
            return cachedNavbarWrapper;
        }

        cachedNavbarWrapper = expectedWrapper || null;
        return cachedNavbarWrapper;
    }

    function isPrintMediaType() {
        if (document.querySelector('#ptb-header mo-icon[name="print"], .mo-page-header mo-icon[name="print"]')) {
            return true;
        }

        return Array.from(document.querySelectorAll('.buy-details-background, .buy-details-wrapper'))
            .some(element => /\|\s*P(?:\s|\/)/i.test(element.textContent || ''));
    }

    function syncPrintNavigationSections() {
        if (!isPrintMediaType()) return;

        // Create the Orders shortcut before removing Analyse, since Prisma's
        // native Analyse link is the usual template for that shortcut.
        handleOrdersNavigationLink();
        const sections = getNavbarSectionsForCurrentWrapper();
        sections?.querySelector('#p2b-navbar-section-traffic')?.remove();
        sections?.querySelector('#p2b-navbar-section-analyze')?.remove();
    }

    function getNavbarSectionsForCurrentWrapper() {
        const wrapper = getNavbarWrapper();
        const navbar = wrapper?.querySelector('#p2b-navbar');
        return navbar?.querySelector(':scope > .mo-navbar-sections') ||
            navbar?.querySelector('.mo-navbar-sections') ||
            wrapper?.querySelector('.mo-navbar-sections') ||
            wrapper;
    }

    function getConnectedWorkflowSlot() {
        if (
            relocatedWorkflowSlot?.isConnected &&
            relocatedWorkflowSlot.querySelector('.workflow-widget-wrapper')
        ) {
            return relocatedWorkflowSlot;
        }

        const workflowWidget = document.querySelector('div[slot="right"] .workflow-widget-wrapper');
        return workflowWidget?.closest('div[slot="right"]') || null;
    }

    function findActualiseMonthRow() {
        const nativeMonthRow = document.getElementById('month-filter-toolbar');
        if (nativeMonthRow) {
            cachedActualiseMonthRow = nativeMonthRow;
            return cachedActualiseMonthRow;
        }
        if (cachedActualiseMonthRow?.isConnected) return cachedActualiseMonthRow;

        const monthPattern = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d{2,4}$/i;
        const controlSelector = 'a, button, mo-button, mo-tab, [role="button"], [role="tab"]';
        const matchingControls = Array.from(document.querySelectorAll(controlSelector))
            .filter(element => monthPattern.test(element.textContent.trim()));
        const matchingSet = new Set(matchingControls);
        const monthButtons = matchingControls.filter(element => {
            let ancestor = element.parentElement;
            while (ancestor && ancestor !== document.body) {
                if (matchingSet.has(ancestor)) return false;
                ancestor = ancestor.parentElement;
            }
            return true;
        });

        if (monthButtons.length === 0) return null;
        if (monthButtons.length === 1) {
            cachedActualiseMonthRow = monthButtons[0].parentElement;
            return cachedActualiseMonthRow;
        }

        let candidate = monthButtons[0].parentElement;
        while (candidate && candidate !== document.body) {
            if (monthButtons.filter(button => candidate.contains(button)).length >= 2) {
                cachedActualiseMonthRow = candidate;
                return cachedActualiseMonthRow;
            }
            candidate = candidate.parentElement;
        }
        return null;
    }

    function getActualiseToolbar() {
        return document.getElementById('actualize-toolbar');
    }

    function getActualiseMonthsGroup(toolbar = getActualiseToolbar()) {
        return toolbar?.querySelector(':scope > .actual-months-group') ||
            toolbar?.querySelector('.actual-months-group') ||
            document.querySelector('.actual-months-group');
    }

    function getActualiseNativeCloseButton(header, monthsGroup) {
        const closeSelector = 'mo-button[icon-name="close"], mo-button[iconname="close"]';
        return header?.querySelector(closeSelector) ||
            monthsGroup?.querySelector(`.${ACTUALISE_NATIVE_CLOSE_CLASS}`) ||
            null;
    }

    function restoreActualiseHeaderLayout() {
        document.querySelectorAll(`.${ACTUALISE_CLOSE_BUTTON_CLASS}`).forEach(button => button.remove());
        document.querySelectorAll(`.${ACTUALISE_MONTHS_GROUP_CLASS}`).forEach(group => {
            group.classList.remove(ACTUALISE_MONTHS_GROUP_CLASS);
        });
        document.querySelectorAll(`.${ACTUALISE_HEADER_HIDDEN_CLASS}`).forEach(header => {
            header.classList.remove(ACTUALISE_HEADER_HIDDEN_CLASS);
        });

        document.querySelectorAll(`.${ACTUALISE_NATIVE_CLOSE_CLASS}`).forEach(closeButton => {
            const toolbar = closeButton.closest('#actualize-toolbar');
            const headerToolbar = toolbar?.querySelector('.actual-header .actualize-header');
            if (headerToolbar && closeButton.parentElement !== headerToolbar) {
                const originalSlot = closeButton.getAttribute(ACTUALISE_NATIVE_CLOSE_SLOT_ATTRIBUTE);
                if (originalSlot) closeButton.setAttribute('slot', originalSlot);
                else closeButton.removeAttribute('slot');
                headerToolbar.appendChild(closeButton);
            }
            closeButton.classList.remove(ACTUALISE_NATIVE_CLOSE_CLASS);
            closeButton.removeAttribute(ACTUALISE_NATIVE_CLOSE_SLOT_ATTRIBUTE);
        });
    }

    function handleActualiseHeaderLayout(isActualise) {
        if (!isActualise) {
            restoreActualiseHeaderLayout();
            return;
        }

        const toolbar = getActualiseToolbar();
        const header = toolbar?.querySelector('.actual-header');
        const monthsGroup = getActualiseMonthsGroup(toolbar);
        if (!header || !monthsGroup) return;

        const nativeClose = getActualiseNativeCloseButton(header, monthsGroup);
        if (!nativeClose) return;

        header.classList.add(ACTUALISE_HEADER_HIDDEN_CLASS);
        monthsGroup.classList.add(ACTUALISE_MONTHS_GROUP_CLASS);

        if (nativeClose.parentElement !== monthsGroup) {
            if (!nativeClose.hasAttribute(ACTUALISE_NATIVE_CLOSE_SLOT_ATTRIBUTE)) {
                nativeClose.setAttribute(
                    ACTUALISE_NATIVE_CLOSE_SLOT_ATTRIBUTE,
                    nativeClose.getAttribute('slot') || ''
                );
            }
            nativeClose.removeAttribute('slot');
            monthsGroup.appendChild(nativeClose);
        }
        nativeClose.classList.add(ACTUALISE_NATIVE_CLOSE_CLASS);

        let closeButton = monthsGroup.querySelector(`.${ACTUALISE_CLOSE_BUTTON_CLASS}`);
        if (!closeButton) {
            closeButton = document.createElement('button');
            closeButton.type = 'button';
            closeButton.className = ACTUALISE_CLOSE_BUTTON_CLASS;
            closeButton.textContent = '× Close';
            closeButton.setAttribute('aria-label', 'Close Actualisation');
            closeButton.addEventListener('click', () => {
                getActualiseNativeCloseButton(
                    toolbar.querySelector('.actual-header'),
                    getActualiseMonthsGroup(toolbar)
                )?.click();
            });
            monthsGroup.appendChild(closeButton);
        }
        closeButton.removeAttribute('title');
    }

    function handleAlwaysShowComments() {
        const href = window.location.href;
        // Check for specific URL components
        const params = new URLSearchParams(window.location.hash.substring(1));
        if (!href.includes('groupmuk-prisma.mediaocean.com/campaign-management/') ||
            params.get('osAppId') !== 'prsm-cm-spa' ||
            params.get('osPspId') !== 'prsm-cm-buy' ||
            params.get('route') !== 'actualize') {
            return;
        }

        // Use cached settings
        if (alwaysShowCommentsEnabled) {
            // Define constants once per execution of the feature check
            const BUTTON_GROUP_SELECTOR = '.mo.toggle-btn-wrapper.mo-btn-group';
            const ACTION_GROUP_SELECTOR = '.action-group';
            const LOCKED_BUY_MESSAGE = 'Please note this buy is locked';

            // Modified selector to target both Yes and No buttons that are locked
            const lockedButtons = document.querySelectorAll('button.btn.btn-mini.ok-to-pay.disabled[data-is-buy-locked="true"][data-row-comment]');

            lockedButtons.forEach(btn => {
                // Check if the comment attribute exists and is not empty
                const comment = btn.getAttribute('data-row-comment');
                if (comment.trim() === '') return;

                btn.setAttribute('data-is-buy-locked', 'false');
                btn.classList.remove('disabled'); // Remove disabled class to allow interaction

                // Ensure we don't attach multiple listeners
                if (!btn.dataset.hasAlwaysShowListener) {
                    btn.dataset.hasAlwaysShowListener = 'true';
                    btn.addEventListener('click', async function() {
                        // 1. Inject a temporary style element to hide elements and prevent flashing.
                        // A new element is created for each click to avoid race conditions and ensure cleanup.
                        const style = document.createElement('style');
                        style.textContent = `
                            ${BUTTON_GROUP_SELECTOR},
                            ${ACTION_GROUP_SELECTOR} {
                                display: none !important;
                            }
                        `;
                        document.head.appendChild(style);

                        try {
                            // 2. Perform DOM manipulations once elements appear.
                            const removalPromises = [
                                // Replace the button group with the message text.
                                utils.waitForElement(BUTTON_GROUP_SELECTOR, 2000).then(el => {
                                    const messageDiv = document.createElement('div');
                                    messageDiv.textContent = LOCKED_BUY_MESSAGE;
                                    // Add a CSS class for styling to separate concerns.
                                    // A corresponding '.locked-buy-message' class should be added to a CSS file.
                                    messageDiv.classList.add('locked-buy-message');
                                    el.replaceWith(messageDiv);
                                }),
                                // Remove the action group (Save/Cancel) completely.
                                utils.waitForElement(ACTION_GROUP_SELECTOR, 2000).then(el => el.remove())
                            ];

                            await Promise.allSettled(removalPromises);
                        } finally {
                            // 3. Always remove the temporary style element to clean up the DOM.
                            style.remove();
                        }
                    });
                }
            });
        }
    }

    function handleCampaignNavigationOptimisation() {
        syncApproverWidgetPlacementClass();
        syncCampaignDateEditMarker();
        if (window.location.href.includes('cm-dashboard')) {
            document.getElementById(BUDGET_STYLE_ID)?.remove();
            return;
        }

        const navbarWrapper = getNavbarWrapper();
        const connectedWorkflowSlot = getConnectedWorkflowSlot();
        if (connectedWorkflowSlot && connectedWorkflowSlot !== relocatedWorkflowSlot) {
            relocatedWorkflowSlot?.classList.remove('ai-style-change-1', ACTUALISE_WORKFLOW_CLASS);
            relocatedWorkflowSlot?.parentElement?.classList.remove(ACTUALISE_MONTH_ROW_CLASS);
            relocatedWorkflowSlot = connectedWorkflowSlot;
        }
        const rightSlotDiv = connectedWorkflowSlot ||
            (relocatedWorkflowSlot?.querySelector('.workflow-widget-wrapper') ? relocatedWorkflowSlot : null);
        const previewLinkContainer = navbarWrapper ? navbarWrapper.querySelector('.omni-navigation-preview-link-container') : null;
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const isActualise = hashParams.get('ptb-ctx') === 'actualize' || hashParams.get('route') === 'actualize';

        handleActualiseHeaderLayout(isActualise);

        if (approverWidgetPlacementEnabled && navbarWrapper && rightSlotDiv) {
            rightSlotDiv.classList.remove(ACTUALISE_WORKFLOW_CLASS);
            rightSlotDiv.parentElement?.classList.remove(ACTUALISE_MONTH_ROW_CLASS);
            // Check if already moved to avoid redundancy
            if (rightSlotDiv.parentElement !== navbarWrapper || !rightSlotDiv.classList.contains('ai-style-change-1')) {
                if (previewLinkContainer) {
                    navbarWrapper.insertBefore(rightSlotDiv, previewLinkContainer);
                } else {
                    navbarWrapper.appendChild(rightSlotDiv);
                }
                rightSlotDiv.classList.add('ai-style-change-1');
            }
        } else if (approverWidgetPlacementEnabled && isActualise && rightSlotDiv) {
            const actualiseMonthRow = findActualiseMonthRow();
            if (actualiseMonthRow && rightSlotDiv.parentElement !== actualiseMonthRow) {
                actualiseMonthRow.appendChild(rightSlotDiv);
            }
            if (actualiseMonthRow) {
                actualiseMonthRow.classList.add(ACTUALISE_MONTH_ROW_CLASS);
                rightSlotDiv.classList.add(ACTUALISE_WORKFLOW_CLASS);
            }
        }

        handleCampaignMenuRelocation();
        handleCampaignNameCopy();
        handleOrdersNavigationLink();
        syncPrintNavigationSections();
        handleBudgetDisplayOptimisation(); // Trigger budget display changes
    }

    function showCampaignNameCopiedToast(nameElement, message = 'Campaign Name Copied to Clipboard!') {
        let toast = document.getElementById('campaign-name-copy-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'campaign-name-copy-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;

        const rect = typeof nameElement.getBoundingClientRect === 'function'
            ? nameElement.getBoundingClientRect()
            : nameElement;
        toast.style.left = `${rect.left + (rect.width / 2)}px`;
        toast.style.top = `${rect.bottom + 8}px`;
        toast.classList.add('show');

        window.clearTimeout(campaignNameToastTimeout);
        campaignNameToastTimeout = window.setTimeout(() => {
            toast?.classList.remove('show');
        }, 2500);
    }

    function getCampaignIdFromUrl() {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        return hashParams.get('campaign-id') || '';
    }

    function parseBuyDetails(text) {
        const normalized = (text || '').replace(/\s+/g, ' ').trim();
        if (!normalized) return null;

        const campaignId = getCampaignIdFromUrl();
        const pattern = campaignId
            ? new RegExp(`(${campaignId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\s*\\|\\s*((?:[DP]/)?[A-Z0-9]+/\\d+/\\d+)`, 'i')
            : /([A-Z0-9]{5,})\s*\|\s*((?:[DP]\/)?[A-Z0-9]+\/\d+\/\d+)/i;
        const match = normalized.match(pattern);
        if (!match) return null;

        const rawClPrCa = match[2];
        return {
            campaignId: match[1],
            rawClPrCa,
            clPrCa: rawClPrCa.replace(/^[DP]\//i, '')
        };
    }

    function copyHeaderValue(value, target, message) {
        if (!value) return;

        chrome.runtime.sendMessage({ action: 'copyCampaignHeaderToClipboard', text: value })
            .then(response => {
                if (response?.status !== 'success') {
                    throw new Error(response?.message || 'Clipboard service did not confirm the copy.');
                }
                showCampaignNameCopiedToast(target, message);
            })
            .catch(error => console.error('Failed to copy campaign header value:', error));
    }

    function findBuyDetailsTextElement(buyDetails, parsed) {
        const textElements = Array.from(buyDetails.querySelectorAll('[data-full-text], mo-text'));
        return textElements.find(element => {
            const rect = element.getBoundingClientRect();
            const text = element.getAttribute('data-full-text') || element.textContent || '';
            return rect.width > 0 &&
                rect.height > 0 &&
                text.includes(parsed.campaignId) &&
                text.includes(parsed.rawClPrCa);
        }) || buyDetails;
    }

    function getTextWidth(text, element) {
        const canvas = getTextWidth.canvas || document.createElement('canvas');
        getTextWidth.canvas = canvas;
        let context = null;
        try {
            context = canvas.getContext?.('2d') || null;
        } catch (_error) {
            context = null;
        }
        if (!context) return null;

        const style = window.getComputedStyle(element);
        context.font = style.font || `${style.fontStyle} ${style.fontVariant} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        return context.measureText(text).width;
    }

    function getBuyDetailsCopyTarget(event, buyDetails, parsed) {
        const textElement = findBuyDetailsTextElement(buyDetails, parsed);
        const displayText = textElement.getAttribute?.('data-full-text') || textElement.textContent || buyDetails.textContent || '';
        const pipeIndex = displayText.indexOf('|');
        if (pipeIndex < 0) return null;

        const rect = textElement.getBoundingClientRect();
        const beforePipeWidth = getTextWidth(displayText.slice(0, pipeIndex), textElement);
        if (!rect.width || event.clientX <= rect.left) return null;

        const pipeRatio = displayText.length > 0 ? pipeIndex / displayText.length : 0.5;
        const pipeX = rect.left + (beforePipeWidth !== null ? beforePipeWidth : rect.width * pipeRatio);
        const copyClPrCa = event.clientX > pipeX;
        const anchorRect = copyClPrCa
            ? {
                left: pipeX,
                width: Math.max(1, (rect.left + rect.width) - pipeX),
                bottom: rect.bottom
            }
            : {
                left: rect.left,
                width: Math.max(1, pipeX - rect.left),
                bottom: rect.bottom
            };

        return {
            value: copyClPrCa ? parsed.clPrCa : parsed.campaignId,
            message: copyClPrCa ? 'CL/PR/CA Copied to Clipboard!' : 'Campaign ID Copied to Clipboard!',
            anchorRect
        };
    }

    function handleBuyDetailsCopy(event) {
        const buyDetails = event.target.closest?.('.buy-details-wrapper');
        if (!buyDetails) return false;

        const parsed = parseBuyDetails(buyDetails.textContent);
        if (!parsed) return false;

        const copyTarget = getBuyDetailsCopyTarget(event, buyDetails, parsed);
        if (!copyTarget) return false;

        copyHeaderValue(copyTarget.value, copyTarget.anchorRect, copyTarget.message);
        return true;
    }

    function getRouteUrlWithParams(params) {
        const [baseUrl, hash = ''] = window.location.href.split('#');
        const routeParams = new URLSearchParams(hash);
        Object.entries(params).forEach(([key, value]) => routeParams.set(key, value));
        return `${baseUrl}#${routeParams.toString()}`;
    }

    function getCampaignDetailsUrl() {
        return getRouteUrlWithParams({ osModalId: 'prsm-cm-cmpdtls' });
    }

    function dispatchWindowEvent(type) {
        try {
            window.dispatchEvent(new Event(type));
            return;
        } catch (error) {
            // Older embedded browser contexts can lack constructable Events.
        }

        try {
            const event = document.createEvent('Event');
            event.initEvent(type, true, true);
            window.dispatchEvent(event);
        } catch (error) {
            // Best effort only; direct navigation still happens below.
        }
    }

    function nudgePrismaRouter() {
        dispatchWindowEvent('hashchange');
        dispatchWindowEvent('popstate');
    }

    function openCampaignDetails() {
        const detailsUrl = getCampaignDetailsUrl();
        const wasAlreadyThere = window.location.href === detailsUrl;
        if (!wasAlreadyThere) {
            window.location.href = detailsUrl;
        }

        window.setTimeout(nudgePrismaRouter, 0);
        window.setTimeout(nudgePrismaRouter, 250);
        return !wasAlreadyThere;
    }

    function findBasicCampaignDetailsSection() {
        const anchoredBasicSection = document.getElementById('campaign-details-flight')?.closest('.well.editable') ||
            document.getElementById('campaign-details-basics-pencil-icon')?.closest('.well.editable');
        if (anchoredBasicSection) return anchoredBasicSection;

        const allElements = getElementsIncludingShadowDom();
        const basicHeadings = allElements.filter(element =>
            element.matches?.('h1, h2, h3, h4, .panel-heading, .card-header')
        );
        const matchingHeading = basicHeadings.find(element =>
            /^Basic\b/i.test((element.textContent || '').replace(/\s+/g, ' ').trim())
        );
        if (matchingHeading) {
            let section = matchingHeading.parentElement;
            while (section && section !== document.body) {
                const rect = section.getBoundingClientRect();
                const text = (section.textContent || '').replace(/\s+/g, ' ').trim();
                if (
                    rect.width > 100 &&
                    rect.height > 80 &&
                    /^Basic\b/i.test(text) &&
                    /\bStart and end\b/i.test(text) &&
                    /\bAdvertiser\b/i.test(text)
                ) {
                    return section;
                }
                section = section.parentElement;
            }
        }

        const candidates = allElements.filter(element =>
            element.matches?.('section, article, div, mo-card, mo-panel, mo-accordion, h1, h2, h3, h4')
        );
        const visibleCandidates = candidates.map(element => {
            const rect = element.getBoundingClientRect();
            const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
            return { element, rect, text, area: rect.width * rect.height };
        }).filter(candidate => candidate.rect.width > 100 && candidate.rect.height > 80);

        const bestCard = visibleCandidates
            .filter(candidate =>
                /^Basic\b/i.test(candidate.text) &&
                /\bStart and end\b/i.test(candidate.text) &&
                /\bAdvertiser\b/i.test(candidate.text)
            )
            .sort((a, b) => a.area - b.area)[0] || visibleCandidates
            .filter(candidate =>
                /^Basic\b/i.test(candidate.text) &&
                /\bStart and end\b/i.test(candidate.text)
            )
            .sort((a, b) => a.area - b.area)[0];

        return bestCard?.element || null;
    }

    function getElementsIncludingShadowDom(root = document, visited = new Set()) {
        if (!root || visited.has(root)) return [];
        visited.add(root);

        const elements = [];
        const queryRoot = root.nodeType === Node.DOCUMENT_NODE && root.body ? root.body : root;
        let rootElements = [];
        try {
            rootElements = queryRoot.querySelectorAll ? Array.from(queryRoot.querySelectorAll('*')) : [];
        } catch (error) {
            const stack = Array.from(queryRoot.childNodes || []).filter(node => node.nodeType === Node.ELEMENT_NODE);
            while (stack.length) {
                const element = stack.shift();
                rootElements.push(element);
                if (element.tagName !== 'IFRAME') {
                    stack.push(...Array.from(element.childNodes || []).filter(node => node.nodeType === Node.ELEMENT_NODE));
                }
            }
        }

        rootElements.forEach(element => {
            if (visited.has(element)) return;
            visited.add(element);
            elements.push(element);
            if (element.shadowRoot) {
                elements.push(...getElementsIncludingShadowDom(element.shadowRoot, visited));
            }
            if (element.tagName === 'IFRAME') {
                try {
                    if (element.contentDocument) {
                        elements.push(...getElementsIncludingShadowDom(element.contentDocument, visited));
                    }
                } catch (error) {
                    // Cross-origin frames are expected in some Mediaocean shells.
                }
            }
        });

        return elements;
    }

    function getDeepElementFromPoint(x, y, root = document) {
        let element = root.elementFromPoint?.(x, y) || document.elementFromPoint?.(x, y);

        if (element?.tagName === 'IFRAME') {
            try {
                const frameRect = element.getBoundingClientRect();
                const frameDocument = element.contentDocument;
                if (frameDocument?.elementFromPoint) {
                    const frameElement = getDeepElementFromPoint(x - frameRect.left, y - frameRect.top, frameDocument);
                    if (frameElement) return frameElement;
                }
            } catch (error) {
                return element;
            }
        }

        while (element?.shadowRoot?.elementFromPoint) {
            const nestedElement = element.shadowRoot.elementFromPoint(x, y);
            if (!nestedElement || nestedElement === element) break;
            element = nestedElement;
        }

        return element;
    }

    function activateElement(element, point = {}) {
        const rect = element.getBoundingClientRect?.();
        const clientX = rect
            ? rect.left + Math.min(Math.max(point.x ?? rect.width / 2, 1), Math.max(rect.width - 1, 1))
            : 0;
        const clientY = rect
            ? rect.top + Math.min(Math.max(point.y ?? rect.height / 2, 1), Math.max(rect.height - 1, 1))
            : 0;
        const eventView = element.ownerDocument?.defaultView || window;
        const MouseEventConstructor = eventView.MouseEvent || MouseEvent;
        const eventOptions = {
            bubbles: true,
            cancelable: true,
            composed: true,
            clientX,
            clientY,
            button: 0,
            buttons: 1,
            view: eventView
        };
        const target = point.deep
            ? getDeepElementFromPoint(clientX, clientY, element.ownerDocument || document) || element
            : element;

        target.dispatchEvent?.(new MouseEventConstructor('mousedown', eventOptions));
        target.dispatchEvent?.(new MouseEventConstructor('mouseup', { ...eventOptions, buttons: 0 }));
        target.click?.();
    }

    function isCampaignDetailsOpen() {
        const [, hash = ''] = window.location.href.split('#');
        return new URLSearchParams(hash).get('osModalId') === 'prsm-cm-cmpdtls';
    }

    function cancelCampaignDetailsRequest() {
        campaignDetailsRequestAttempt += 1;
        if (campaignDetailsRequestTimeout !== null) {
            window.clearTimeout(campaignDetailsRequestTimeout);
            campaignDetailsRequestTimeout = null;
        }
    }

    function requestCampaignDetailsBasicFocus(attemptId, deadline) {
        if (attemptId !== campaignDetailsRequestAttempt || !isCampaignDetailsOpen()) return;

        Promise.resolve(chrome.runtime.sendMessage({
            action: 'requestCampaignDetailsBasicFocus'
        })).then(response => {
            if (attemptId !== campaignDetailsRequestAttempt || response?.status === 'accepted') return;
            if (Date.now() < deadline && isCampaignDetailsOpen()) {
                campaignDetailsRequestTimeout = window.setTimeout(
                    () => requestCampaignDetailsBasicFocus(attemptId, deadline),
                    400
                );
            }
        }).catch(() => {
            if (attemptId !== campaignDetailsRequestAttempt) return;
            if (Date.now() < deadline && isCampaignDetailsOpen()) {
                campaignDetailsRequestTimeout = window.setTimeout(
                    () => requestCampaignDetailsBasicFocus(attemptId, deadline),
                    400
                );
            }
        });
    }

    function activateCampaignDetailsShortcut() {
        const shortcut = document.querySelector('[data-toolshed-action="campaign-details"]');
        if (!shortcut) return false;

        activateElement(shortcut);
        return true;
    }

    function createCampaignDateEditIcon() {
        const icon = document.createElementNS(SVG_NAMESPACE, 'svg');
        icon.classList.add(CAMPAIGN_DATE_EDIT_ICON_CLASS);
        icon.setAttribute('viewBox', '-0.5 0 24 24');
        icon.setAttribute('data-orientation', 'tip-bottom-left');
        icon.setAttribute('aria-hidden', 'true');
        icon.setAttribute('focusable', 'false');

        const outline = document.createElementNS(SVG_NAMESPACE, 'path');
        outline.setAttribute('d', 'M4 20h3.5L19 8.5 15.5 5 4 16.5V20Z');
        outline.setAttribute('fill', 'none');
        outline.setAttribute('stroke', 'currentColor');
        outline.setAttribute('stroke-linecap', 'round');
        outline.setAttribute('stroke-linejoin', 'round');
        outline.setAttribute('stroke-width', '1.7');

        const seam = document.createElementNS(SVG_NAMESPACE, 'path');
        seam.setAttribute('d', 'M13.5 7 17 10.5');
        seam.setAttribute('fill', 'none');
        seam.setAttribute('stroke', 'currentColor');
        seam.setAttribute('stroke-linecap', 'round');
        seam.setAttribute('stroke-width', '1.7');

        icon.append(outline, seam);
        return icon;
    }

    function suppressCampaignDateTooltip(dateElement) {
        if (!dateElement) return;

        if (!campaignDateTooltipState.has(dateElement)) {
            campaignDateTooltipState.set(dateElement, {
                dataFullText: dateElement.getAttribute('data-full-text'),
                title: dateElement.getAttribute('title')
            });
        }

        dateElement.removeAttribute('data-full-text');
        dateElement.removeAttribute('title');
    }

    function restoreCampaignDateTooltip(dateElement) {
        const originalState = campaignDateTooltipState.get(dateElement);
        if (!originalState) return;

        if (originalState.dataFullText === null) {
            dateElement.removeAttribute('data-full-text');
        } else {
            dateElement.setAttribute('data-full-text', originalState.dataFullText);
        }
        if (originalState.title === null) {
            dateElement.removeAttribute('title');
        } else {
            dateElement.setAttribute('title', originalState.title);
        }
        campaignDateTooltipState.delete(dateElement);
    }

    function unwrapCampaignDateEditHost(host) {
        const dateElement = host.querySelector('.mo-date-field-wrapper');
        if (dateElement && host.parentElement) {
            host.parentElement.insertBefore(dateElement, host);
        }
        host.remove();
    }

    function syncCampaignDateEditMarker() {
        const dateElement = document.querySelector('.mo-date-field-wrapper');
        let host = dateElement?.parentElement?.classList.contains(CAMPAIGN_DATE_EDIT_HOST_CLASS)
            ? dateElement.parentElement
            : null;

        document.querySelectorAll(`.${CAMPAIGN_DATE_EDIT_HOST_CLASS}`).forEach(candidate => {
            if (candidate !== host) unwrapCampaignDateEditHost(candidate);
        });

        document.querySelectorAll(`.${CAMPAIGN_DATE_EDIT_MARKER_CLASS}`).forEach(candidate => {
            if (!campaignDateShortcutEnabled || !host || candidate.parentElement !== host) {
                candidate.remove();
            }
        });

        if (!dateElement) return;

        dateElement.classList.toggle(CAMPAIGN_DATE_EDITABLE_CLASS, campaignDateShortcutEnabled);
        if (!campaignDateShortcutEnabled) {
            restoreCampaignDateTooltip(dateElement);
            if (host) unwrapCampaignDateEditHost(host);
            return;
        }

        suppressCampaignDateTooltip(dateElement);

        if (!host) {
            const parent = dateElement.parentElement;
            if (!parent) return;
            host = document.createElement('span');
            host.className = CAMPAIGN_DATE_EDIT_HOST_CLASS;
            parent.insertBefore(host, dateElement);
            host.appendChild(dateElement);
        }

        let marker = host.querySelector(`.${CAMPAIGN_DATE_EDIT_MARKER_CLASS}`);
        if (!marker) {
            marker = document.createElement('button');
            marker.type = 'button';
            marker.className = CAMPAIGN_DATE_EDIT_MARKER_CLASS;
            marker.setAttribute('aria-label', 'Edit campaign dates');
            marker.addEventListener('click', handleCampaignDateShortcut);
            host.appendChild(marker);
        }

        if (!marker.querySelector(`.${CAMPAIGN_DATE_EDIT_ICON_CLASS}`)) {
            marker.replaceChildren(createCampaignDateEditIcon());
        }
    }

    function handleCampaignDateShortcut(event) {
        const dateElement = event.target.closest?.('.mo-date-field-wrapper') ||
            event.target.closest?.(`.${CAMPAIGN_DATE_EDIT_MARKER_CLASS}`)
                ?.closest(`.${CAMPAIGN_DATE_EDIT_HOST_CLASS}`)
                ?.querySelector('.mo-date-field-wrapper');
        if (!dateElement) return false;

        event.preventDefault();
        event.stopPropagation();

        if (!activateCampaignDetailsShortcut()) {
            openCampaignDetails();
        }
        cancelCampaignDetailsRequest();
        requestCampaignDetailsBasicFocus(
            campaignDetailsRequestAttempt,
            Date.now() + 12000
        );
        return true;
    }

    function handleCampaignNameCopy() {
        if (campaignNameCopyListenerAttached) return;
        campaignNameCopyListenerAttached = true;

        document.addEventListener('pointerdown', event => {
            if (campaignDateShortcutEnabled && handleCampaignDateShortcut(event)) return;
            if (campaignHeaderQuickCopyEnabled && handleBuyDetailsCopy(event)) return;
            if (!campaignNameQuickCopyEnabled) return;

            const eventPath = event.composedPath();
            const nameElement = eventPath.find(node =>
                node instanceof Element &&
                node.matches('.mo-campaign-name-wrapper[contenteditable="true"]')
            ) || eventPath.find(node =>
                node instanceof Element && node.matches('.mo-campaign-name-popover')
            )?.querySelector('.mo-campaign-name-wrapper');
            if (!nameElement) return;

            const campaignName = nameElement.textContent.trim();
            if (!campaignName) return;

            copyHeaderValue(campaignName, nameElement, 'Campaign Name Copied to Clipboard!');
        }, true);

    }

    function handleBudgetDisplayOptimisation() {
        if (!budgetWidgetOptimisedEnabled) {
            document.getElementById(BUDGET_STYLE_ID)?.remove();
            return;
        }

        if (window.location.href.includes('cm-dashboard')) {
            document.getElementById(BUDGET_STYLE_ID)?.remove();
            return;
        }

        const budgetContainer = document.getElementById(BUDGET_CONTAINER_ID);
        if (!budgetContainer) return;

        // Inject CSS for budget container alignment and progress bar tweaks only.
        if (!document.getElementById(BUDGET_STYLE_ID)) {
            const style = document.createElement('style');
            style.id = BUDGET_STYLE_ID;
            style.textContent = `
                /* 1. CONTAINER RESET & ALIGNMENT */
                #${BUDGET_CONTAINER_ID} {
                    display: flex !important;
                    align-items: center !important;
                    gap: 4px !important;
                    min-height: 0 !important;
                    padding-right: 0 !important;
                    white-space: nowrap !important;
                }

                /* 2. LARGE SCREEN VIEW (> 1300px) */
                @media (min-width: 1301px) {
                    /* Shrink bar width */
                    ${PROGRESS_BAR_CLASS} {
                        width: 80px !important;
                        height: 10px !important;
                        margin-right: 4px !important;
                        display: flex !important;
                        align-items: center !important;
                        overflow: visible !important;
                    }

                    ${PROGRESS_BAR_CLASS} div,
                    ${PROGRESS_BAR_CLASS} span {
                        height: 100% !important;
                        border-radius: 5px !important;
                    }

                    /* Ensure Action Toolbar (Copy/History) is visible */
                    #mo-extracted-actions-toolbar {
                        display: flex !important;
                    }
                }

                /* 3. SMALL SCREEN VIEW (<= 1300px) */
                @media (max-width: 1300px) {
                    /* Slim 15px bar */
                    ${PROGRESS_BAR_CLASS} {
                        width: 15px !important;
                        min-width: 15px !important;
                        height: 10px !important;
                        margin-right: 4px !important;
                        display: flex !important;
                        align-items: center !important;
                    }

                    /* Hide Toolbar to save space */
                    #mo-extracted-actions-toolbar {
                        display: none !important;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        // Below 1300px, remove the leading "Budget" label text from the total
        // budget display label to save space on small screens.
        if (window.innerWidth <= 1300) {
            const labels = budgetContainer.querySelectorAll(BUDGET_LABEL_SELECTOR);
            labels.forEach(label => {
                const original = label.textContent || '';
                const updated = original.replace(/^\s*Budget\s*/i, '').trimStart();
                if (updated !== original) {
                    label.textContent = updated;
                }
            });
        }
    }

    function syncOrdersNavigationActiveState(ordersBtn) {
        const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const isActualise = params.get('ptb-ctx') === 'actualize' || params.get('route') === 'actualize';
        const isOrderSummary = params.get('ptb-ctx') === 'orderSummary' && params.get('showOrders') === 'true';
        const isBuy = !isActualise && !isOrderSummary && params.get('ptb-mod') === 'buy';
        const sections = ordersBtn.closest('.mo-navbar-sections') ||
            ordersBtn.closest('.p2b-navbar-wrapper') ||
            ordersBtn.parentElement;
        const buyBtn = sections?.querySelector('#p2b-navbar-section-buy');

        ordersBtn.classList.toggle('active', isOrderSummary);
        if (isOrderSummary) ordersBtn.setAttribute('aria-current', 'page');
        else ordersBtn.removeAttribute('aria-current');

        if (buyBtn) {
            buyBtn.classList.toggle('active', isBuy);
            if (isBuy) buyBtn.setAttribute('aria-current', 'page');
            else buyBtn.removeAttribute('aria-current');
        }
    }

    function getOrderSummaryHref(templateHref = '') {
        const campaignId = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('campaign-id');
        const sidebarLink = Array.from(document.querySelectorAll('a[href]')).find(link => {
            if (link.id === 'p2b-navbar-section-orders') return false;
            const href = link.getAttribute('href') || '';
            return href.includes('ptb-ctx=orderSummary') &&
                href.includes('showOrders=true') &&
                (!campaignId || href.includes(`campaign-id=${campaignId}`));
        });
        if (sidebarLink) return sidebarLink.getAttribute('href');

        const baseUrlMatch = templateHref.match(/^(.*campaign-id=[^&]*)/);
        if (baseUrlMatch) {
            return `${baseUrlMatch[1]}&ptb-mod=buy&ptb-ctx=orderSummary&showOrders=true`;
        }

        if (!campaignId) return '';
        return `#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=${encodeURIComponent(campaignId)}&ptb-mod=buy&ptb-ctx=orderSummary&showOrders=true`;
    }

    function syncOrdersNavigationHref(ordersBtn, templateHref = '') {
        const ordersHref = getOrderSummaryHref(templateHref || ordersBtn.getAttribute('href') || '');
        if (!ordersHref) return false;
        ordersBtn.setAttribute('href', ordersHref);
        return true;
    }

    function enableOrdersNavigationButton(ordersBtn) {
        if (!ordersBtn) return;
        ordersBtn.classList.remove('disabled', 'mo-disabled');
        ordersBtn.removeAttribute('disabled');
        ordersBtn.removeAttribute('aria-disabled');
    }

    function handleOrdersNavigationLink() {
        if (!ordersShortcutEnabled) return;

        const sections = getNavbarSectionsForCurrentWrapper();
        if (!sections) return;

        const existingOrdersBtn = sections.querySelector('#p2b-navbar-section-orders');
        if (existingOrdersBtn) {
            syncOrdersNavigationActiveState(existingOrdersBtn);
            if (syncOrdersNavigationHref(existingOrdersBtn)) {
                enableOrdersNavigationButton(existingOrdersBtn);
            }
            return;
        }

        const analyzeBtn = sections.querySelector('#p2b-navbar-section-analyze');
        const templateBtn = analyzeBtn || (
            isPrintMediaType() ? sections.querySelector('#p2b-navbar-section-buy') : null
        );
        if (templateBtn) {
            // 1. Create the Orders button based on the native navigation structure
            const ordersBtn = templateBtn.cloneNode(true);
            ordersBtn.id = 'p2b-navbar-section-orders';

            // Text content handling
            ordersBtn.textContent = 'ORDERS';

            // 2. Update the href dynamically to point to the orders module
            const templateHref = templateBtn.getAttribute('href') || '';
            const baseUrlMatch = templateHref.match(/^(.*campaign-id=[^&]*)/);

            if (baseUrlMatch) {
                const newParams = "&ptb-mod=buy&ptb-ctx=orderSummary&showOrders=true";
                const ordersHref = baseUrlMatch[1] + newParams;
                ordersBtn.setAttribute('href', ordersHref);
            } else {
                const ordersHref = templateHref.replace(/ptb-mod=[^&]*/, 'ptb-mod=orders');
                ordersBtn.setAttribute('href', ordersHref);
            }

            // 3. Ensure visual state handling
            syncOrdersNavigationHref(ordersBtn, templateHref);
            enableOrdersNavigationButton(ordersBtn);

            // 4. Insert into the DOM
            templateBtn.after(ordersBtn);
            syncOrdersNavigationActiveState(ordersBtn);
        }
    }

    function ensureOrdersNavigation() {
        handleOrdersNavigationLink();
    }

    function handleCampaignMenuRelocation() {
        if (!quickCampaignActionsEnabled) return;

        // 1. Find the native menu position and hide its original components.
        const originalToolbarItem = getCachedNavigationElement(
            'campaignMenuIcon',
            'mo-toolbar-item#campaign-menu-icon'
        );
        const originalOverlay = getCachedNavigationElement(
            'campaignMenuOverlay',
            'mo-overlay#mo-overlay-8'
        );
        const campaignNamePopover = getCachedNavigationElement(
            'campaignNamePopover',
            '.mo-campaign-name-popover'
        );
        if (originalOverlay) originalOverlay.style.display = 'none';

        // Keep an existing extracted toolbar anchored to a newly rendered native
        // cog when Prisma rebuilds the campaign header.
        const existingToolbar = document.getElementById('mo-extracted-actions-toolbar');
        if (existingToolbar) {
            if (campaignNamePopover && existingToolbar.previousElementSibling !== campaignNamePopover) {
                campaignNamePopover.insertAdjacentElement('afterend', existingToolbar);
            } else if (!campaignNamePopover && originalToolbarItem && existingToolbar.nextElementSibling !== originalToolbarItem) {
                originalToolbarItem.insertAdjacentElement('beforebegin', existingToolbar);
            }
            if (originalToolbarItem) originalToolbarItem.style.display = 'none';
            return;
        }

        // 2. Create the new icon container
        const buyDetails = getCachedNavigationElement('buyDetails', '.buy-details-wrapper');
        if (!originalToolbarItem && !buyDetails) return;

        const iconContainer = document.createElement('div');
        iconContainer.id = 'mo-extracted-actions-toolbar';

        const actions = [
            { modalId: "prsm-cm-cmpdtls", label: "Campaign details", icon: 'details' },
            { urlParam: "&osModalId=prsm-cm-cmpcopy", label: "Copy campaign", icon: 'copy' },
            { urlParam: "&osModalId=prsm-cm-hfrm&prsmForm=prsm-cm-hist", label: "Campaign history", icon: 'history' }
        ];

        actions.forEach(action => {
            const wrapper = document.createElement('div');
            if (action.modalId === 'prsm-cm-cmpdtls') {
                wrapper.dataset.toolshedAction = 'campaign-details';
            }
            // Styles handled by CSS #mo-extracted-actions-toolbar > div

            // Create Icon
            const icon = document.createElement('mo-icon');
            icon.setAttribute('name', action.icon);
            icon.setAttribute('size', 'm');
            // Prevent double tooltip
            icon.removeAttribute('title');
            icon.setAttribute('aria-label', action.label);
            icon.setAttribute('role', 'button');
            icon.setAttribute('tabindex', '0');

            // Handle Click Navigation
            const handleClick = () => {
                if (action.modalId === 'prsm-cm-cmpdtls') {
                    openCampaignDetails();
                    return;
                }

                const currentUrl = window.location.href;
                if (!currentUrl.includes(action.urlParam)) {
                    window.location.href = currentUrl + action.urlParam;
                }
            };

            wrapper.addEventListener('click', handleClick);

            // Handle Keyboard Support
            wrapper.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') handleClick();
            });

            // Create Custom Tooltip (styles handled by CSS class)
            const tooltip = document.createElement('div');
            tooltip.className = 'extracted-action-tooltip';
            tooltip.appendChild(document.createTextNode(action.label));

            const arrow = document.createElement('div');
            arrow.className = 'tooltip-arrow-custom';
            tooltip.appendChild(arrow);

            wrapper.appendChild(icon);
            wrapper.appendChild(tooltip);
            iconContainer.appendChild(wrapper);
        });

        // Keep the extracted actions immediately to the right of the campaign
        // name. Fall back to the native cog position while the name renders.
        if (campaignNamePopover) {
            campaignNamePopover.insertAdjacentElement('afterend', iconContainer);
        } else if (originalToolbarItem) {
            originalToolbarItem.insertAdjacentElement('beforebegin', iconContainer);
        } else {
            buyDetails.insertAdjacentElement('beforebegin', iconContainer);
        }
        if (originalToolbarItem) originalToolbarItem.style.display = 'none';
    }

    // Use document-level delegation so Prisma can replace the editable name
    // during the first click without losing the copy handler.
    if (window.top === window.self) {
        handleCampaignNameCopy();
    }

    window.campaignFeature = {
        handleCampaignManagementFeatures,
        handleAlwaysShowComments,
        handleCampaignNavigationOptimisation,
        ensureOrdersNavigation,
        isPrintMediaType,
        syncPrintNavigationSections,
        resetCampaignFlags
    };
})();

(function() {
    'use strict';

    let mediaMixAutomated = false;
    let budgetTypeAutomated = false;

    // Cached settings
    let hidingSectionsEnabled = true;
    let automateFormFieldsEnabled = true;
    let alwaysShowCommentsEnabled = true;
    let campaignNavStyle = 'old';
    let optimisedNewNavEnabled = true;

    // Class selectors for Budget UI
    const BUDGET_CONTAINER_ID = 'campaign-budget-overview-container';
    const BUDGET_VALUE_CLASS = '.xb1phb\\+xdUqb87KZK3L\\+Sw\\=\\='; // Escaped for JS querySelector
    const BUDGET_LABEL_CLASS = '.cbjS\\+XIoeuDmb-oqpXOJpw\\=\\=';   // Escaped for JS querySelector
    const PROGRESS_BAR_CLASS = '.gDndZofhX67JYdRMGJEFTw\\=\\=';

    // Initialize settings
    if (chrome.runtime && chrome.runtime.id) {
        chrome.storage.sync.get(['hidingSectionsEnabled', 'automateFormFieldsEnabled', 'alwaysShowCommentsEnabled', 'campaignNavStyle', 'optimisedNewNavEnabled'], (data) => {
            if (chrome.runtime.lastError) return;
            if (data.hidingSectionsEnabled !== undefined) hidingSectionsEnabled = data.hidingSectionsEnabled;
            if (data.automateFormFieldsEnabled !== undefined) automateFormFieldsEnabled = data.automateFormFieldsEnabled;
            if (data.alwaysShowCommentsEnabled !== undefined) alwaysShowCommentsEnabled = data.alwaysShowCommentsEnabled;
            if (data.campaignNavStyle !== undefined) {
                // Handle legacy boolean if present
                if (typeof data.campaignNavStyle === 'boolean') {
                    campaignNavStyle = data.campaignNavStyle ? 'new' : 'old';
                } else {
                    campaignNavStyle = data.campaignNavStyle;
                }
            }
            if (data.optimisedNewNavEnabled !== undefined) optimisedNewNavEnabled = data.optimisedNewNavEnabled;
        });

        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace !== 'sync') return;
            if (changes.hidingSectionsEnabled) hidingSectionsEnabled = changes.hidingSectionsEnabled.newValue;
            if (changes.automateFormFieldsEnabled) automateFormFieldsEnabled = changes.automateFormFieldsEnabled.newValue;
            if (changes.alwaysShowCommentsEnabled) alwaysShowCommentsEnabled = changes.alwaysShowCommentsEnabled.newValue;
            if (changes.campaignNavStyle) {
                // Handle legacy boolean on change if somehow triggered
                if (typeof changes.campaignNavStyle.newValue === 'boolean') {
                    campaignNavStyle = changes.campaignNavStyle.newValue ? 'new' : 'old';
                } else {
                    campaignNavStyle = changes.campaignNavStyle.newValue;
                }
            }
            if (changes.optimisedNewNavEnabled) optimisedNewNavEnabled = changes.optimisedNewNavEnabled.newValue;
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
        if (campaignNavStyle !== 'new' || !optimisedNewNavEnabled) return;

        const navbarWrapper = document.querySelector('.p2b-navbar-wrapper');
        const rightSlotDiv = document.querySelector('div[slot="right"]');
        const previewLinkContainer = navbarWrapper ? navbarWrapper.querySelector('.omni-navigation-preview-link-container') : null;

        if (navbarWrapper && rightSlotDiv) {
            // Check if already moved to avoid redundancy
            if (rightSlotDiv.parentElement !== navbarWrapper || !rightSlotDiv.classList.contains('ai-style-change-1')) {
                if (previewLinkContainer) {
                    navbarWrapper.insertBefore(rightSlotDiv, previewLinkContainer);
                } else {
                    navbarWrapper.appendChild(rightSlotDiv);
                }
                rightSlotDiv.classList.add('ai-style-change-1');
            }
        }

        handleCampaignMenuRelocation();
        handleOrdersNavigationLink();
        handleBudgetDisplayOptimisation(); // Trigger budget display changes
    }

    function handleBudgetDisplayOptimisation() {
        const budgetContainer = document.getElementById(BUDGET_CONTAINER_ID);
        if (!budgetContainer) return;

        // 1. Inject CSS for Budget Optimisation if not already present
        const STYLE_ID = 'optimised-budget-styles';
        if (!document.getElementById(STYLE_ID)) {
            const style = document.createElement('style');
            style.id = STYLE_ID;
            style.textContent = `
                /* 1. CONTAINER RESET & ALIGNMENT */
                #${BUDGET_CONTAINER_ID} {
                    display: flex !important;
                    align-items: center !important;
                    gap: 0 !important;
                    min-height: 0 !important;
                    padding-right: 0 !important;
                    white-space: nowrap !important;
                }

                /* 2. LARGE SCREEN VIEW (Expanded View >= 1200px) */
                @media (min-width: 1200px) {
                    /* Shrink bar width to 80px */
                    ${PROGRESS_BAR_CLASS} {
                        width: 80px !important;
                        height: 10px !important;
                        margin-right: 4px !important;
                        display: flex !important;
                        align-items: center !important;
                        overflow: visible !important;
                    }

                    /* Ensure inner bar fills height and stays rounded */
                    ${PROGRESS_BAR_CLASS} div,
                    ${PROGRESS_BAR_CLASS} span {
                        height: 100% !important;
                        border-radius: 5px !important;
                    }

                    /* Merge Billable and Budget: Prepend the value */
                    ${BUDGET_VALUE_CLASS}::before {
                        content: var(--billable-prepend, "");
                        font-weight: 600;
                        color: #333;
                    }

                    /* Fix vertical positioning and font size */
                    ${BUDGET_VALUE_CLASS} {
                        font-size: 13px !important;
                        line-height: 1 !important;
                        display: inline-flex !important;
                        align-items: center !important;
                    }

                    /* Hide the word 'Budget' on large screens */
                    ${BUDGET_LABEL_CLASS} {
                        font-size: 0 !important;
                    }

                    /* Ensure Action Toolbar (Copy/History) is visible */
                    #mo-extracted-actions-toolbar {
                        display: flex !important;
                    }
                }

                /* 3. SMALL SCREEN VIEW (Compact View < 1200px) */
                @media (max-width: 1199px) {
                    /* Slim 15px bar */
                    ${PROGRESS_BAR_CLASS} {
                        width: 15px !important;
                        min-width: 15px !important;
                        height: 10px !important;
                        margin-right: 4px !important;
                        display: flex !important;
                        align-items: center !important;
                    }

                    /* Show Compact Rounded Budget (£60k) */
                    ${BUDGET_VALUE_CLASS} {
                        font-size: 0 !important;
                        background-color: transparent !important;
                    }
                    ${BUDGET_VALUE_CLASS}::after {
                        content: var(--rounded-budget, "£0k");
                        font-size: 13px !important;
                        font-weight: 600;
                        line-height: 1 !important;
                    }

                    /* Restore original text nodes (e.g. 'Budget') */
                    ${BUDGET_LABEL_CLASS} {
                        font-size: inherit !important;
                    }

                    /* Hide Toolbar to save space */
                    #mo-extracted-actions-toolbar {
                        display: none !important;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        // 2. Data Logic: Format Numbers and Update CSS Variables
        const allValues = budgetContainer.querySelectorAll(BUDGET_VALUE_CLASS);
        const allLabels = budgetContainer.querySelectorAll(BUDGET_LABEL_CLASS);

        // Assumption based on typical Prisma DOM: [Billable Label, Billable Value, Budget Label, Budget Value]
        // or just [Value, Value] if labels are separate.
        // We will assume the LAST value is the "Budget" which we want to act as the primary container.

        let budgetValueSpan = null;
        let billableValueSpan = null;

        if (allValues.length > 0) {
            // Target the last value span as the main "Budget" span
            budgetValueSpan = allValues[allValues.length - 1];

            // If there's more than one value, assume the first one is "Billable"
            if (allValues.length > 1) {
                billableValueSpan = allValues[0];
            }
        }

        if (budgetValueSpan) {
            // Update Rounded Budget (for Small Screens)
            const rawText = budgetValueSpan.textContent.trim();
            const rawNumber = parseFloat(rawText.replace(/[^0-9.-]+/g, ""));

            if (!isNaN(rawNumber)) {
                budgetValueSpan.style.setProperty('--rounded-budget', `"${formatCompact(rawNumber)}"`);
            }

            // Update Billable Prepend (for Large Screens)
            if (billableValueSpan) {
                const billableText = billableValueSpan.textContent.trim();
                budgetValueSpan.style.setProperty('--billable-prepend', `"${billableText} / "`);

                // Hide the original Billable elements to avoid duplication since we merged them
                // We assume the first label corresponds to the first value (Billable)
                billableValueSpan.style.setProperty('display', 'none', 'important');
                if (allLabels.length > 0) {
                    allLabels[0].style.setProperty('display', 'none', 'important');
                }
            } else {
                // If no billable found, clear the prepend
                budgetValueSpan.style.setProperty('--billable-prepend', `""`);
            }
        }
    }

    function formatCompact(num) {
        if (num >= 1000000) return '£' + (num / 1000000).toFixed(num % 1000000 === 0 ? 0 : 1) + 'm';
        if (num >= 1000) return '£' + (num / 1000).toFixed(0) + 'k';
        return '£' + num;
    }

    function handleOrdersNavigationLink() {
        if (campaignNavStyle !== 'new' || !optimisedNewNavEnabled) return;

        // Avoid duplicates
        if (document.getElementById('p2b-navbar-section-orders')) return;

        const analyzeBtn = document.querySelector('#p2b-navbar-section-analyze');
        if (analyzeBtn) {
            // 1. Create the Orders button based on the Analyze button structure
            const ordersBtn = analyzeBtn.cloneNode(true);
            ordersBtn.id = 'p2b-navbar-section-orders';

            // Text content handling
            ordersBtn.textContent = 'ORDERS';

            // 2. Update the href dynamically to point to the orders module
            const analyzeHref = analyzeBtn.getAttribute('href') || '';
            const baseUrlMatch = analyzeHref.match(/^(.*campaign-id=[^&]*)/);

            if (baseUrlMatch) {
                const newParams = "&ptb-mod=buy&ptb-ctx=orderSummary&showOrders=true";
                const ordersHref = baseUrlMatch[1] + newParams;
                ordersBtn.setAttribute('href', ordersHref);
            } else {
                const ordersHref = analyzeHref.replace('ptb-mod=analyze', 'ptb-mod=orders');
                ordersBtn.setAttribute('href', ordersHref);
            }

            // 3. Ensure visual state handling
            ordersBtn.classList.remove('active');

            // 4. Insert into the DOM
            analyzeBtn.after(ordersBtn);
        }
    }

    function handleCampaignMenuRelocation() {
        if (campaignNavStyle !== 'new' || !optimisedNewNavEnabled) return;

        // 1. Hide original menu components
        const originalToolbarItem = document.querySelector('mo-toolbar-item#campaign-menu-icon');
        const originalOverlay = document.querySelector('mo-overlay#mo-overlay-8');
        if (originalToolbarItem) originalToolbarItem.style.display = 'none';
        if (originalOverlay) originalOverlay.style.display = 'none';

        // Check if already created
        if (document.getElementById('mo-extracted-actions-toolbar')) return;

        // 2. Create the new icon container
        const buyDetails = document.querySelector('.buy-details-wrapper');
        if (!buyDetails) return; // Wait until buyDetails exists

        const iconContainer = document.createElement('div');
        iconContainer.id = 'mo-extracted-actions-toolbar';
        Object.assign(iconContainer.style, {
            display: 'flex',
            gap: '12px',
            marginLeft: '12px',
            alignItems: 'center'
        });

        const actions = [
            { urlParam: "&osModalId=prsm-cm-cmpdtls", label: "Campaign details", icon: 'details' },
            { urlParam: "&osModalId=prsm-cm-cmpcopy", label: "Copy campaign", icon: 'copy' },
            { urlParam: "&osModalId=prsm-cm-hfrm&prsmForm=prsm-cm-hist", label: "Campaign history", icon: 'history' }
        ];

        actions.forEach(action => {
            const wrapper = document.createElement('div');
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

        // Insert into header
        buyDetails.insertAdjacentElement('afterend', iconContainer);
    }

    window.campaignFeature = {
        handleCampaignManagementFeatures,
        handleAlwaysShowComments,
        handleCampaignNavigationOptimisation,
        resetCampaignFlags
    };
})();
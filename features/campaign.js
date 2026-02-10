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

            // Text content handling - careful not to wipe out children if any structure exists,
            // though analyze button is usually simple text or text node.
            // cloneNode(true) copies children. Analyze usually has text.
            // Let's safe-set the text node if possible or just textContent.
            // Requirement says: Content: The text string "ORDERS".
            ordersBtn.textContent = 'ORDERS';

            // 2. Update the href dynamically to point to the orders module
            const analyzeHref = analyzeBtn.getAttribute('href') || '';

            // Use regex to keep everything up to and including the campaign-id value
            // This handles dynamic campaign IDs
            const baseUrlMatch = analyzeHref.match(/^(.*campaign-id=[^&]*)/);

            if (baseUrlMatch) {
                const newParams = "&ptb-mod=buy&ptb-ctx=orderSummary&showOrders=true";
                const ordersHref = baseUrlMatch[1] + newParams;
                ordersBtn.setAttribute('href', ordersHref);
            } else {
                // Fallback if match fails (though structurally it should match if analyze link is standard)
                const ordersHref = analyzeHref.replace('ptb-mod=analyze', 'ptb-mod=orders');
                ordersBtn.setAttribute('href', ordersHref);
            }

            // 3. Ensure visual state handling (remove active class if cloned from an active button)
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
            // Use text node to avoid overwriting with innerHTML if we wanted to be stricter,
            // but here we append children.
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

(function() {
    'use strict';

    let mediaMixAutomated = false;
    let budgetTypeAutomated = false;

    function handleCampaignManagementFeatures() {
        if (!window.location.href.includes('osModalId=prsm-cm-cmpadd')) {
            return;
        }

        if (!chrome.runtime || !chrome.runtime.id) return;

        chrome.storage.sync.get(['hidingSectionsEnabled', 'automateFormFieldsEnabled'], (data) => {
            if (chrome.runtime.lastError) return;

            if (data.hidingSectionsEnabled !== false) {
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

            if (data.automateFormFieldsEnabled !== false) {
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
        });
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

        chrome.storage.sync.get('alwaysShowCommentsEnabled', (data) => {
            if (data.alwaysShowCommentsEnabled) {
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
                            // 1. Inject temporary style to hide elements immediately to prevent flashing
                            const styleId = 'ts-hide-locked-popup';
                            let style = document.getElementById(styleId);
                            if (!style) {
                                style = document.createElement('style');
                                style.id = styleId;
                                style.textContent = `
                                    .mo.toggle-btn-wrapper.mo-btn-group,
                                    .action-group {
                                        display: none !important;
                                    }
                                `;
                                document.head.appendChild(style);
                            }

                            // 2. Perform DOM manipulations once elements appear
                            const removalPromises = [
                                // Replace the button group with the message text
                                utils.waitForElement('.mo.toggle-btn-wrapper.mo-btn-group', 2000).then(el => {
                                    const messageDiv = document.createElement('div');
                                    messageDiv.textContent = "Please note this buy is locked";
                                    messageDiv.style.padding = "5px";
                                    messageDiv.style.fontStyle = "italic";
                                    el.replaceWith(messageDiv);
                                }),
                                // Remove the action group (Save/Cancel) completely
                                utils.waitForElement('.action-group', 2000).then(el => el.remove())
                            ];

                            await Promise.allSettled(removalPromises);

                            // 3. Remove the temporary style.
                            // The new "messageDiv" doesn't have the hidden class, so it will show up.
                            // The action-group is gone, so it won't show up.
                            if (style) style.remove();
                        });
                    }
                });
            }
        });
    }

    window.campaignFeature = {
        handleCampaignManagementFeatures,
        handleAlwaysShowComments,
        resetCampaignFlags
    };
})();
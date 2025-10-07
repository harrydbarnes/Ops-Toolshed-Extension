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

    window.campaignFeature = {
        handleCampaignManagementFeatures,
        resetCampaignFlags
    };
})();
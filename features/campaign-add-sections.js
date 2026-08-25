(function() {
    'use strict';

    const CAMPAIGN_DETAILS_PATH = '/idesk/prisma-campaign-details/';
    const ADD_CAMPAIGN_MODAL_ID = 'prsm-cm-cmpadd';
    const HIDDEN_MARKER = 'data-toolshed-add-campaign-hidden';

    let hidingSectionsEnabled = true;
    let observerStarted = false;
    let reconciliationQueued = false;

    function isAddCampaignFrame() {
        if (!window.location.pathname.includes(CAMPAIGN_DETAILS_PATH)) return false;
        return new URLSearchParams(window.location.search).get('osModalId') === ADD_CAMPAIGN_MODAL_ID;
    }

    function getSections() {
        const sections = Array.from(document.querySelectorAll(
            'fieldset.sectionObjective, fieldset.sectionTargeting'
        ));
        const flightingSelect = document.querySelector('#gwt-debug-distribution');
        const controlGroup = flightingSelect?.parentElement;
        const flightingRow = controlGroup?.parentElement;
        if (flightingRow) sections.push(flightingRow);
        return sections;
    }

    function setSectionVisibility(section, shouldHide) {
        if (shouldHide) {
            if (!section.hasAttribute(HIDDEN_MARKER)) {
                section.setAttribute(HIDDEN_MARKER, section.style.display);
            }
            section.style.display = 'none';
            return;
        }

        if (!section.hasAttribute(HIDDEN_MARKER)) return;
        const originalDisplay = section.getAttribute(HIDDEN_MARKER);
        if (originalDisplay) section.style.display = originalDisplay;
        else section.style.removeProperty('display');
        section.removeAttribute(HIDDEN_MARKER);
    }

    function apply() {
        const trackedSections = Array.from(document.querySelectorAll(`[${HIDDEN_MARKER}]`));
        const sections = [...new Set([...trackedSections, ...getSections()])];
        const shouldHide = isAddCampaignFrame() && hidingSectionsEnabled !== false;
        sections.forEach(section => setSectionVisibility(section, shouldHide));
    }

    function scheduleApply() {
        if (reconciliationQueued) return;
        reconciliationQueued = true;
        const run = () => {
            reconciliationQueued = false;
            apply();
        };
        if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(run);
        else window.setTimeout(run, 0);
    }

    function startObserver() {
        if (observerStarted) return;
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', startObserver, { once: true });
            return;
        }

        observerStarted = true;
        apply();
        new MutationObserver(scheduleApply).observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    if (chrome.storage?.sync?.get) {
        chrome.storage.sync.get(['hidingSectionsEnabled'], data => {
            if (!chrome.runtime?.lastError && data.hidingSectionsEnabled !== undefined) {
                hidingSectionsEnabled = data.hidingSectionsEnabled;
            }
            startObserver();
        });
    } else {
        startObserver();
    }

    chrome.storage?.onChanged?.addListener((changes, namespace) => {
        if (namespace !== 'sync' || !changes.hidingSectionsEnabled) return;
        hidingSectionsEnabled = changes.hidingSectionsEnabled.newValue;
        apply();
    });

    window.campaignAddSectionsFeature = { apply };
})();

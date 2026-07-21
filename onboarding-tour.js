(function() {
    'use strict';

    const PRISMA_HOME = 'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=cm-dashboard&route=campaigns';
    const RETRY_DELAY = 900;
    const settingsDefaults = {
        helpGuidesEnabled: true,
        bannerUsernameEnabled: true,
        swapAccountsEnabled: true,
        rememberAccountSwitchUrlEnabled: true,
        optimisedNewNavEnabled: true,
        ordersShortcutEnabled: true,
        actualiseShortcutEnabled: true,
        actualiseNavbarEnabled: true,
        actualiseScrollRestoreEnabled: true,
        quickCampaignActionsEnabled: true,
        budgetWidgetOptimisedEnabled: true,
        campaignNameQuickCopyEnabled: true,
        campaignHeaderQuickCopyEnabled: true,
        campaignDateShortcutEnabled: true,
        newOrderUiOptimisationEnabled: true,
        countPlacementsSelectedEnabled: true,
        approverWidgetPlacementEnabled: true,
        gmiChatShortcutEnabled: true,
        approverWidgetOptimiseEnabled: true,
        addCampaignShortcutEnabled: true,
        hidingSectionsEnabled: true,
        automateFormFieldsEnabled: true
    };

    let steps = [];
    let settings = { ...settingsDefaults };
    let activeStep = 0;
    let retryTimer = null;
    let renderToken = 0;
    let homeNavigationRequested = false;
    const guardedTabIds = new Set();

    const elements = {
        content: document.querySelector('.tour-content'),
        section: document.getElementById('tour-section'),
        title: document.getElementById('tour-title'),
        description: document.getElementById('tour-description'),
        tip: document.getElementById('tour-tip'),
        status: document.getElementById('tour-status'),
        progress: document.getElementById('tour-progress-fill'),
        popupAction: document.getElementById('tour-popup-action'),
        back: document.getElementById('tour-back'),
        next: document.getElementById('tour-next'),
        skip: document.getElementById('skip-tour')
    };

    function storageGet(area, defaults) {
        return new Promise(resolve => {
            if (!area?.get) return resolve({ ...defaults });
            let settled = false;
            const finish = value => {
                if (settled) return;
                settled = true;
                resolve({ ...defaults, ...(value || {}) });
            };
            try {
                const result = area.get(defaults, finish);
                result?.then?.(finish, () => finish(defaults));
            } catch {
                finish(defaults);
            }
        });
    }

    function storageSet(values) {
        try { chrome.storage?.local?.set?.(values); } catch { /* The tour remains usable without persistence. */ }
    }

    function isEnabled(key) {
        return settings[key] !== false;
    }

    function anyEnabled(keys) {
        return keys.some(isEnabled);
    }

    function listEnabled(labels) {
        return labels.filter(([key]) => isEnabled(key)).map(([, label]) => label);
    }

    function joinFeatures(items) {
        if (items.length <= 1) return items[0] || '';
        if (items.length === 2) return `${items[0]} and ${items[1]}`;
        return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
    }

    function buildSteps() {
        const result = [];
        if (isEnabled('helpGuidesEnabled')) {
            result.push({
                id: 'help-guides', section: 'Help beside your work', title: 'Guidance stays one click away.',
                description: 'The Help Guides launcher opens searchable training without taking you away from Prisma.',
                tip: '<strong>Protected during this tour</strong> The launcher is highlighted but temporarily paused so it cannot replace the onboarding panel.',
                target: 'helpGuides', blockInteraction: true,
                missingStatus: 'Waiting for the Help Guides launcher to finish loading…'
            });
        }

        result.push({
            id: 'open-campaign', section: 'See it in context', title: 'Open any campaign to continue.',
            description: 'Choose any campaign from the Prisma home screen. The tour will continue automatically when its workspace opens.',
            tip: '<strong>Your choice</strong> Nothing in the campaign will be changed by the walkthrough.',
            target: 'campaignList', mode: 'waitForCampaign'
        });

        if (isEnabled('swapAccountsEnabled')) {
            result.push({
                id: 'switch-accounts', section: 'Account switching', title: 'Swap accounts in one click.',
                description: 'The Switch Accounts button gives you one-click access to swap between your Prisma accounts.',
                tip: isEnabled('rememberAccountSwitchUrlEnabled')
                    ? '<strong>Stay in context</strong> After the switch, Ops Toolshed returns you to the campaign page you were using.'
                    : '<strong>One-click access</strong> Use this button instead of opening the user profile menu.',
                target: 'switchAccounts', missingStatus: 'The Switch Accounts button is still loading…'
            });
        }

        if (isEnabled('quickCampaignActionsEnabled')) {
            [
                ['campaign-details-action', 'Campaign details', 'Open campaign details without hunting through a menu.', 'campaignDetailsAction'],
                ['campaign-copy-action', 'Copy campaign', 'Start a campaign copy directly from the header.', 'campaignCopyAction'],
                ['campaign-history-action', 'Campaign history', 'Open campaign history from the same compact action group.', 'campaignHistoryAction']
            ].forEach(([id, title, description, target]) => result.push({
                id, section: 'Repeat actions', title: `${title} stays within reach.`, description,
                tip: '<strong>Less menu hunting</strong> The action is kept beside the campaign name.',
                target, fallbackTarget: 'campaignActions', missingStatus: `${title} is still loading…`
            }));
        }

        [
            ['campaignNameQuickCopyEnabled', 'campaign-name-copy', 'Copy the campaign name.', 'Click the campaign name to copy it in one step.', 'campaignName'],
            ['campaignHeaderQuickCopyEnabled', 'campaign-id-copy', 'Copy campaign identifiers.', 'Click either side of the header identifier to copy the Campaign ID or CL/PR/CA value.', 'campaignIdentifiers'],
            ['campaignDateShortcutEnabled', 'campaign-date-shortcut', 'Jump straight to campaign dates.', 'Click the campaign date area to open the relevant campaign details field.', 'campaignDates'],
            ['budgetWidgetOptimisedEnabled', 'campaign-budget', 'Read the budget at a glance.', 'The compact budget summary keeps the important total visible without wasting header space.', 'campaignBudget']
        ].forEach(([setting, id, title, description, target]) => {
            if (!isEnabled(setting)) return;
            result.push({
                id, section: 'Repeat actions', title, description,
                tip: '<strong>Right where you work</strong> This shortcut is attached to the value it acts on.',
                target, fallbackTarget: 'campaignHeader', missingStatus: 'This campaign header control is still loading…'
            });
        });

        if (isEnabled('optimisedNewNavEnabled')) {
            result.push({
                id: 'campaign-navigation', section: 'Campaign navigation', title: 'Keep the working areas close together.',
                description: 'The sleeker navigation removes unused space while keeping campaign sections easy to reach.',
                tip: '<strong>More room to work</strong> The compact header leaves more height for campaign content.',
                target: 'campaignNavigation', missingStatus: 'The campaign navigation is still loading…'
            });
        }

        if (isEnabled('ordersShortcutEnabled')) result.push({
            id: 'orders-navigation', section: 'Orders', title: 'Open Orders directly from the navigation.',
            description: isEnabled('newOrderUiOptimisationEnabled')
                ? 'Orders is available beside the other campaign areas, with Latest and All controls once you open it.'
                : 'Orders is available beside the other campaign areas for direct access.',
            tip: '<strong>Order versions</strong> In Orders, switch quickly between the latest version and all versions.',
            target: 'ordersNav', missingStatus: 'The Orders navigation item is still loading…'
        });

        if (isEnabled('actualiseShortcutEnabled')) result.push({
            id: 'actualise-navigation', section: 'Actualise', title: 'Open Actualise directly from the navigation.',
            description: 'Actualise sits immediately beside Orders, so there is no detour through another campaign view.',
            tip: isEnabled('actualiseScrollRestoreEnabled')
                ? '<strong>Pick up where you left off</strong> Your working scroll position is restored when you return.'
                : '<strong>Direct access</strong> Move from Buy to Actualise in one click.',
            target: 'actualiseNav', missingStatus: 'The Actualise navigation item is still loading…'
        });

        if (isEnabled('actualiseNavbarEnabled')) result.push({
            id: 'actualise-navbar', section: 'Actualise navigation', title: 'The navigation remains visible in Actualise.',
            description: 'The same campaign navigation stays available while you actualise, making it easier to move back to another area.',
            tip: '<strong>No dead end</strong> The campaign sections remain within reach from Actualise.',
            target: 'actualiseNav', fallbackTarget: 'campaignNavigation', missingStatus: 'The Actualise navigation control is still loading…'
        });

        if (isEnabled('countPlacementsSelectedEnabled')) result.push({
            id: 'placement-counter', section: 'Placement selection', title: 'Know exactly what you have selected.',
            description: 'As you select rows, the counter separates packages from their underlying placements instead of showing one ambiguous total.',
            tip: '<strong>Live breakdown</strong> Select placements or packages in this grid to see both counts update.',
            target: 'placementGrid', missingStatus: 'The placement grid is still loading…'
        });

        if (anyEnabled(['approverWidgetPlacementEnabled', 'gmiChatShortcutEnabled'])) {
            const approverFeatures = listEnabled([
                ['approverWidgetPlacementEnabled', 'the approver widget beside your campaign navigation'],
                ['gmiChatShortcutEnabled', 'a ready-made GMI support message containing this campaign']
            ]);
            result.push({
                id: 'approver-widget', section: 'Approvals and support', title: 'Approvers and GMI support stay close to the campaign.',
                description: `This location provides ${joinFeatures(approverFeatures)}.`,
                tip: '<strong>Campaign-aware</strong> The GMI shortcut includes the campaign name and URL automatically.',
                target: 'approverWidget', missingStatus: 'The approver widget is still loading for this campaign…'
            });
        }

        if (isEnabled('approverWidgetOptimiseEnabled')) {
            result.push({
                id: 'open-approver-widget', section: 'Approver management', title: 'Open the approver widget to continue.',
                description: 'Open the highlighted widget fully so the To field and approver controls are visible.',
                tip: '<strong>Your turn</strong> The walkthrough will continue automatically once the approver form is open.',
                target: 'approverWidget', mode: 'waitForApproverExpanded'
            });
            result.push({
                id: 'approver-management', section: 'Approver management', title: 'Keep the recipient list tidy and reusable.',
                description: 'Remove people you no longer want in recipient history, manage favourites, and paste saved approvers into the workflow quickly.',
                tip: '<strong>Two levels of control</strong> Clean the Prisma history here, then maintain your preferred approvers from the dedicated list.',
                target: 'approverWidgetExpanded', missingStatus: 'Waiting for the To field and approver controls to become visible…'
            });
        }

        result.push({
            id: 'popup-approvers', section: 'Ops Toolshed popup', title: 'There is also a dedicated Prisma Approvers tool.',
            description: 'Open the extension popup to find Prisma Approvers. It gives you a separate place to search, favourite and copy the people you use.',
            tip: '<strong>Chrome UI stays separate</strong> A web-page spotlight cannot draw over the browser toolbar, so use the button below to open the real popup.',
            mode: 'popup', popupAction: 'Open Ops Toolshed popup', status: 'Choose Prisma Approvers in the popup, then return here to continue.'
        });

        if (anyEnabled(['addCampaignShortcutEnabled', 'hidingSectionsEnabled', 'automateFormFieldsEnabled'])) {
            result.push({
                id: 'add-campaign', section: 'Faster campaign setup', title: 'Return home, then choose Add Campaign.',
                description: 'The tour is returning Prisma to the home screen. Open the Ops Toolshed popup and click Add Campaign when it is ready.',
                tip: '<strong>Watch what changes</strong> Quick Add is skipped, unused sections stay hidden and common setup fields can be selected for you.',
                mode: 'waitForAddCampaign', target: 'addCampaign', popupAction: 'Open Ops Toolshed popup'
            });
            result.push({
                id: 'campaign-setup', section: 'Setup streamlined', title: 'Add Campaign starts in the useful form.',
                description: 'You can add a campaign from the Ops Toolshed popup, which also houses other key features. Wherever you launch Add Campaign, Ops Toolshed skips unused areas and takes you to the useful form.',
                tip: '<strong>Tour complete</strong> Nothing has been submitted. Finishing returns you to the Prisma home screen.',
                target: 'campaignSetup', missingStatus: 'Campaign setup is still loading; Quick Add has already been skipped.'
            });
        }

        return result;
    }

    async function getActiveTab() {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        return tabs?.[0] || null;
    }

    async function sendToTab(tabId, message) {
        if (!tabId) return { status: 'error', found: false };
        try {
            return await chrome.tabs.sendMessage(tabId, message);
        } catch {
            return { status: 'error', found: false };
        }
    }

    async function guardActivePage() {
        const tab = await getActiveTab();
        if (!tab?.id) return tab;
        guardedTabIds.add(tab.id);
        await sendToTab(tab.id, { action: 'setOnboardingInteractionGuard', enabled: true });
        return tab;
    }

    function isCampaignUrl(url = '') {
        return url.includes('mediaocean.com/campaign-management/') && /(?:#|&)campaign-id=[^&]+/i.test(url);
    }

    function isCampaignSetupUrl(url = '') {
        return /(?:#|&)osModalId=prsm-cm-cmpadd(?:&|$)/i.test(url) || /(?:#|&)route=(?:add|create)[^&]*/i.test(url);
    }

    function isHomeUrl(url = '') {
        return /(?:#|&)route=campaigns(?:&|$)/i.test(url) && !isCampaignUrl(url) && !isCampaignSetupUrl(url);
    }

    function updateStatus(message, state = '') {
        elements.status.className = `tour-status${state ? ` is-${state}` : ''}`;
        elements.status.textContent = message || '';
    }

    function scheduleRetry(token) {
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => {
            if (token === renderToken) void updateLiveStep(token);
        }, RETRY_DELAY);
    }

    async function requestHighlight(tab, step) {
        if (!tab?.id || !step.target) return false;
        let response = await sendToTab(tab.id, {
            action: 'showOnboardingHighlight',
            target: step.target,
            blockInteraction: step.blockInteraction === true
        });
        if (response?.found !== true && step.fallbackTarget) {
            response = await sendToTab(tab.id, {
                action: 'showOnboardingHighlight',
                target: step.fallbackTarget,
                blockInteraction: step.blockInteraction === true
            });
        }
        return response?.status === 'success' && response.found === true;
    }

    async function updateLiveStep(token) {
        if (token !== renderToken) return;
        const step = steps[activeStep];
        const tab = await guardActivePage();
        if (token !== renderToken || !step) return;

        if (step.mode === 'waitForCampaign') {
            if (isCampaignUrl(tab?.url)) {
                renderStep(activeStep + 1);
                return;
            }
            const found = await requestHighlight(tab, step);
            updateStatus(found ? 'Choose any highlighted campaign to continue.' : 'Waiting for the Prisma campaign list to finish loading…', 'waiting');
            scheduleRetry(token);
            return;
        }

        if (step.mode === 'waitForAddCampaign') {
            if (isCampaignSetupUrl(tab?.url)) {
                renderStep(activeStep + 1);
                return;
            }
            if (!homeNavigationRequested && !isHomeUrl(tab?.url)) {
                homeNavigationRequested = true;
                await sendToTab(tab?.id, { action: 'hideOnboardingHighlight' });
                try { await chrome.tabs.update(tab.id, { url: PRISMA_HOME }); } catch { /* Retry against the current page. */ }
                updateStatus('Returning to the Prisma home screen…', 'waiting');
                scheduleRetry(token);
                return;
            }
            const found = await requestHighlight(tab, step);
            updateStatus(found
                ? 'Open the Ops Toolshed popup and click Add Campaign.'
                : 'Home is ready. Open the Ops Toolshed popup and click Add Campaign.', 'waiting');
            scheduleRetry(token);
            return;
        }

        if (step.mode === 'waitForApproverExpanded') {
            const expanded = await requestHighlight(tab, { ...step, target: 'approverWidgetExpanded' });
            if (expanded) {
                renderStep(activeStep + 1);
                return;
            }
            const found = await requestHighlight(tab, step);
            updateStatus(found
                ? 'Open the highlighted approver widget to continue.'
                : 'Waiting for the approver widget to load…', 'waiting');
            scheduleRetry(token);
            return;
        }

        if (!step.target) {
            await sendToTab(tab?.id, { action: 'hideOnboardingHighlight' });
            updateStatus(step.status || '', step.mode === 'popup' ? 'waiting' : '');
            return;
        }

        const found = await requestHighlight(tab, step);
        updateStatus(found ? 'Highlighted on the Prisma page' : step.missingStatus, found ? 'found' : 'waiting');
        if (!found) scheduleRetry(token);
    }

    function renderStep(index) {
        clearTimeout(retryTimer);
        activeStep = Math.max(0, Math.min(steps.length - 1, index));
        homeNavigationRequested = false;
        renderToken += 1;
        const token = renderToken;
        const step = steps[activeStep];

        elements.content.classList.remove('is-changing');
        void elements.content.offsetWidth;
        elements.content.classList.add('is-changing');
        elements.section.textContent = step.section;
        elements.title.textContent = step.title;
        elements.description.textContent = step.description;
        elements.tip.innerHTML = step.tip;
        elements.progress.style.width = `${((activeStep + 1) / steps.length) * 100}%`;
        elements.back.hidden = activeStep === 0;
        elements.next.disabled = ['waitForCampaign', 'waitForAddCampaign', 'waitForApproverExpanded'].includes(step.mode);
        elements.next.textContent = step.mode === 'waitForCampaign'
            ? 'Waiting for campaign…'
            : step.mode === 'waitForAddCampaign'
                ? 'Waiting for Add Campaign…'
                : step.mode === 'waitForApproverExpanded'
                    ? 'Waiting for approver form…'
                : activeStep === steps.length - 1 ? 'Finish tour' : 'Next';
        elements.popupAction.hidden = !step.popupAction;
        if (step.popupAction) elements.popupAction.textContent = step.popupAction;
        updateStatus('Finding this feature on Prisma…', 'waiting');
        storageSet({ onboardingTourStep: activeStep, onboardingTourStepId: step.id });
        void updateLiveStep(token);
    }

    async function disablePageGuards() {
        await Promise.all(Array.from(guardedTabIds, tabId => sendToTab(tabId, {
            action: 'setOnboardingInteractionGuard', enabled: false
        })));
        guardedTabIds.clear();
    }

    async function finishTour(skipped = false) {
        clearTimeout(retryTimer);
        const tab = await getActiveTab();
        await sendToTab(tab?.id, { action: 'hideOnboardingHighlight' });
        await disablePageGuards();
        storageSet({
            onboardingTourActive: false,
            onboardingTourCompleted: !skipped,
            onboardingTourSkipped: skipped,
            onboardingTourCompletedAt: Date.now()
        });
        if (!skipped && tab?.id && !isHomeUrl(tab.url)) {
            try { await chrome.tabs.update(tab.id, { url: PRISMA_HOME }); } catch { /* Closing the tour still takes priority. */ }
        }
        try {
            if (tab?.id && chrome.sidePanel?.close) await chrome.sidePanel.close({ tabId: tab.id });
        } catch { /* The completion state is already persisted. */ }
    }

    elements.back.addEventListener('click', () => renderStep(activeStep - 1));
    elements.next.addEventListener('click', () => {
        if (activeStep === steps.length - 1) void finishTour(false);
        else renderStep(activeStep + 1);
    });
    elements.popupAction.addEventListener('click', async () => {
        try {
            await chrome.action?.openPopup?.();
        } catch {
            updateStatus('Click the Ops Toolshed extension icon in Chrome to open the popup.', 'waiting');
        }
    });
    elements.skip.addEventListener('click', () => void finishTour(true));
    window.addEventListener('pagehide', () => {
        clearTimeout(retryTimer);
        void disablePageGuards();
        void getActiveTab().then(tab => sendToTab(tab?.id, { action: 'hideOnboardingHighlight' }));
    }, { once: true });

    storageGet(chrome.storage?.sync, settingsDefaults).then(value => {
        settings = value;
        steps = buildSteps();
        renderStep(0);
    });

    window.onboardingTourPanel = { buildSteps, finishTour, isCampaignUrl, isCampaignSetupUrl, isHomeUrl };
})();

(function() {
    'use strict';

    const steps = [
        {
            section: 'Help beside your work',
            title: 'Open guidance without leaving Prisma.',
            description: 'The Help Guides launcher opens a searchable library in this side panel.',
            tip: '<strong>Try it later</strong> Drag the launcher to any screen edge and it will remember the position.',
            target: 'helpGuides'
        },
        {
            section: 'Account context',
            title: 'Know which account is active.',
            description: 'The banner can show your full username and location, while Switch Accounts keeps PID changes close by.',
            tip: '<strong>Your saved choice</strong> The identifier is remembered between pages and refreshed after a PID switch.',
            target: 'account'
        },
        {
            section: 'Campaign actions',
            title: 'Common campaign tasks stay within reach.',
            description: 'Campaign details, copy and history actions are brought into a compact toolbar on campaign pages.',
            tip: '<strong>Open any campaign</strong> If the toolbar is not on this page yet, the highlight will appear when a campaign is available.',
            target: 'campaignActions'
        },
        {
            section: 'Campaign navigation',
            title: 'Move through Plan, Buy and Actualise with less friction.',
            description: 'Navigation improvements add useful routes and preserve access to campaign areas while you work.',
            tip: '<strong>Still in control</strong> Every tour feature can be changed later from the Features tab in Settings.',
            target: 'campaignNavigation'
        }
    ];
    let activeStep = 0;
    let retryTimer = null;
    let retryCount = 0;

    const elements = {
        section: document.getElementById('tour-section'),
        title: document.getElementById('tour-title'),
        description: document.getElementById('tour-description'),
        tip: document.getElementById('tour-tip'),
        status: document.getElementById('tour-status'),
        progress: document.getElementById('tour-progress-fill'),
        back: document.getElementById('tour-back'),
        next: document.getElementById('tour-next'),
        skip: document.getElementById('skip-tour')
    };

    function storageSet(values) {
        try { chrome.storage?.local?.set?.(values); } catch { /* Tour remains usable without persistence. */ }
    }

    async function getActiveTab() {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        return tabs?.[0] || null;
    }

    async function sendToPage(message) {
        const tab = await getActiveTab();
        if (!tab?.id) return { status: 'error', found: false };
        try {
            return await chrome.tabs.sendMessage(tab.id, message);
        } catch {
            return { status: 'error', found: false };
        }
    }

    function updateStatus(found) {
        elements.status.className = `tour-status ${found ? 'is-found' : 'is-missing'}`;
        elements.status.textContent = found
            ? 'Highlighted on the Prisma page'
            : 'This element is not on the current page yet';
    }

    async function highlightCurrentStep() {
        clearTimeout(retryTimer);
        const response = await sendToPage({ action: 'showOnboardingHighlight', target: steps[activeStep].target });
        const found = response?.status === 'success' && response.found === true;
        updateStatus(found);
        if (!found && retryCount < 12) {
            retryCount += 1;
            retryTimer = setTimeout(highlightCurrentStep, 1000);
        }
    }

    function renderStep(index) {
        activeStep = Math.max(0, Math.min(steps.length - 1, index));
        retryCount = 0;
        const step = steps[activeStep];
        elements.section.textContent = step.section;
        elements.title.textContent = step.title;
        elements.description.textContent = step.description;
        elements.tip.innerHTML = step.tip;
        elements.progress.style.width = `${((activeStep + 1) / steps.length) * 100}%`;
        elements.back.hidden = activeStep === 0;
        elements.next.textContent = activeStep === steps.length - 1 ? 'Finish tour' : 'Next';
        storageSet({ onboardingTourStep: activeStep });
        void highlightCurrentStep();
    }

    async function finishTour(skipped = false) {
        clearTimeout(retryTimer);
        await sendToPage({ action: 'hideOnboardingHighlight' });
        storageSet({
            onboardingTourActive: false,
            onboardingTourCompleted: !skipped,
            onboardingTourSkipped: skipped,
            onboardingTourCompletedAt: Date.now()
        });
        const tab = await getActiveTab();
        try {
            await chrome.sidePanel?.setOptions?.({ path: 'help-guides.html', enabled: true });
            if (tab?.id && chrome.sidePanel?.close) await chrome.sidePanel.close({ tabId: tab.id });
        } catch {
            window.location.href = chrome.runtime.getURL('help-guides.html');
        }
    }

    elements.back.addEventListener('click', () => renderStep(activeStep - 1));
    elements.next.addEventListener('click', () => {
        if (activeStep === steps.length - 1) void finishTour(false);
        else renderStep(activeStep + 1);
    });
    elements.skip.addEventListener('click', () => void finishTour(true));
    window.addEventListener('pagehide', () => {
        clearTimeout(retryTimer);
        void sendToPage({ action: 'hideOnboardingHighlight' });
    }, { once: true });

    renderStep(0);
})();

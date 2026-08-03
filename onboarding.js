(function() {
    'use strict';

    const PRISMA_HOME = 'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=cm-dashboard&route=campaigns';
    const defaults = {
        uiTheme: 'pink',
        bannerUsernameEnabled: true,
        helpGuidesEnabled: true,
        blockAppLearnPopupsEnabled: true,
        campaignNameQuickCopyEnabled: true,
        campaignHeaderQuickCopyEnabled: true,
        swapAccountsEnabled: true,
        rememberAccountSwitchUrlEnabled: true,
        loadingFactsEnabled: true,
        prismaReminderFrequency: 'daily',
        metaReminderEnabled: true,
        iasReminderEnabled: true,
        timesheetReminderEnabled: true
    };
    const stepCopy = [
        ['Choose your defaults', 'Start with the tools you’ll notice every day.', 'We’ve picked a practical starting set for navigating campaigns, keeping account context visible, and finding help without leaving Prisma.'],
        ['Fine-tune your workflow', 'Choose the shortcuts that fit your day.', 'Set up useful copy actions, reminders and account switching before you open Prisma.'],
        ['See it in Prisma', 'Your setup is ready.', 'Open Prisma and follow the focused side-panel guide to see the most useful areas in context.']
    ];
    let activeStep = 0;
    let currentSettings = { ...defaults };

    const elements = {
        pages: Array.from(document.querySelectorAll('.onboarding-page')),
        progressCount: document.getElementById('progress-count'),
        progressFill: document.getElementById('progress-fill'),
        progressLabel: document.getElementById('progress-label'),
        title: document.getElementById('stage-title'),
        description: document.getElementById('stage-description'),
        previous: document.getElementById('previous-step'),
        next: document.getElementById('next-step'),
        start: document.getElementById('start-tour'),
        skip: document.getElementById('skip-onboarding'),
        status: document.getElementById('save-status'),
        summary: document.getElementById('setup-summary'),
        error: document.getElementById('onboarding-error')
    };

    function storageGet(area, values) {
        return new Promise(resolve => {
            if (!area?.get) return resolve({ ...values });
            let settled = false;
            const finish = result => {
                if (settled) return;
                settled = true;
                resolve({ ...values, ...(result || {}) });
            };
            try {
                const response = area.get(values, finish);
                if (response?.then) response.then(finish, () => finish(values));
            } catch {
                finish(values);
            }
        });
    }

    function storageSet(area, values) {
        return new Promise((resolve, reject) => {
            if (!area?.set) return resolve();
            let settled = false;
            const finish = () => {
                if (settled) return;
                settled = true;
                if (chrome.runtime?.lastError) reject(new Error(chrome.runtime.lastError.message));
                else resolve();
            };
            try {
                const response = area.set(values, finish);
                if (response?.then) response.then(finish, reject);
            } catch (error) {
                reject(error);
            }
        });
    }

    function showSavedStatus() {
        elements.status.textContent = 'Saved';
        clearTimeout(showSavedStatus.timer);
        showSavedStatus.timer = setTimeout(() => {
            elements.status.textContent = 'Settings are saved as you go';
        }, 1500);
    }

    async function saveSetting(key, value) {
        currentSettings[key] = value;
        try {
            await storageSet(chrome.storage?.sync, { [key]: value });
            showSavedStatus();
        } catch {
            elements.status.textContent = 'Could not save this setting';
        }
    }

    function syncControls() {
        document.querySelectorAll('[data-setting]').forEach(control => {
            const value = currentSettings[control.dataset.setting];
            if (control.type === 'checkbox') control.checked = value !== false;
            else control.value = value;
        });
        document.querySelectorAll('[data-setting-choice]').forEach(button => {
            button.setAttribute('aria-pressed', String(currentSettings[button.dataset.settingChoice] === button.dataset.value));
        });
        document.querySelectorAll('[data-pid-choice]').forEach(button => {
            button.setAttribute('aria-pressed', String((currentSettings.swapAccountsEnabled !== false) === (button.dataset.pidChoice === 'true')));
        });
    }

    function updateSummary() {
        const toggleKeys = Object.keys(defaults).filter(key => typeof defaults[key] === 'boolean');
        const enabled = toggleKeys.filter(key => currentSettings[key] !== false).length;
        elements.summary.textContent = `${enabled} recommended features enabled. You can change every choice later in Settings.`;
    }

    function renderStep(index, focusTab = false) {
        activeStep = Math.max(0, Math.min(stepCopy.length - 1, index));
        const [label, title, description] = stepCopy[activeStep];
        elements.progressCount.textContent = `${activeStep + 1} of ${stepCopy.length}`;
        elements.progressFill.style.width = `${((activeStep + 1) / stepCopy.length) * 100}%`;
        elements.progressLabel.textContent = label;
        elements.title.textContent = title;
        elements.description.textContent = description;
        elements.pages.forEach((page, pageIndex) => {
            const active = pageIndex === activeStep;
            page.hidden = !active;
            page.classList.toggle('active', active);
        });
        elements.previous.hidden = activeStep === 0;
        elements.next.hidden = activeStep === stepCopy.length - 1;
        elements.next.textContent = activeStep === stepCopy.length - 2 ? 'Review setup' : 'Continue';
        elements.start.hidden = activeStep !== stepCopy.length - 1;
        if (activeStep === stepCopy.length - 1) updateSummary();
    }

    async function markComplete(values = {}) {
        await storageSet(chrome.storage?.local, {
            onboardingCompleted: true,
            onboardingCompletedAt: Date.now(),
            ...values
        });
    }

    function startGuidedTour() {
        elements.error.hidden = true;
        void markComplete({ onboardingTourActive: true, onboardingTourStep: 0, onboardingTourVersion: 'v2' });
        try {
            const optionsResult = chrome.sidePanel?.setOptions?.({ path: 'onboarding-tour-v2.html', enabled: true });
            optionsResult?.catch?.(() => {
                elements.error.textContent = 'The guided panel could not be prepared. Prisma will still open, and you can return to Settings at any time.';
                elements.error.hidden = false;
            });
            const windowId = chrome.windows?.WINDOW_ID_CURRENT ?? -2;
            const openResult = chrome.sidePanel?.open?.({ windowId });
            if (openResult?.catch) {
                openResult.catch(() => {
                    elements.error.textContent = 'The side panel could not open. Prisma will still open, and you can return to Settings at any time.';
                    elements.error.hidden = false;
                });
            }
            chrome.tabs?.update?.({ url: PRISMA_HOME });
        } catch {
            elements.error.textContent = 'The side panel is not available in this browser. Open Settings to review all features.';
            elements.error.hidden = false;
        }
    }

    document.querySelectorAll('[data-setting]').forEach(control => {
        control.addEventListener('change', () => {
            const value = control.type === 'checkbox' ? control.checked : control.value;
            void saveSetting(control.dataset.setting, value);
        });
    });

    document.querySelectorAll('[data-setting-choice]').forEach(button => {
        button.addEventListener('click', () => {
            const key = button.dataset.settingChoice;
            currentSettings[key] = button.dataset.value;
            syncControls();
            void saveSetting(key, button.dataset.value);
        });
    });

    document.querySelectorAll('[data-pid-choice]').forEach(button => {
        button.addEventListener('click', async () => {
            const hasMultiplePids = button.dataset.pidChoice === 'true';
            currentSettings.swapAccountsEnabled = hasMultiplePids;
            currentSettings.rememberAccountSwitchUrlEnabled = hasMultiplePids;
            syncControls();
            try {
                await storageSet(chrome.storage?.sync, {
                    swapAccountsEnabled: hasMultiplePids,
                    rememberAccountSwitchUrlEnabled: hasMultiplePids
                });
                showSavedStatus();
            } catch {
                elements.status.textContent = 'Could not save this setting';
            }
        });
    });

    elements.previous.addEventListener('click', () => renderStep(activeStep - 1));
    elements.next.addEventListener('click', () => renderStep(activeStep + 1));
    elements.start.addEventListener('click', startGuidedTour);
    elements.skip.addEventListener('click', () => {
        void markComplete({ onboardingTourActive: false, onboardingSkipped: true });
        window.location.href = chrome.runtime.getURL('settings.html');
    });

    storageGet(chrome.storage?.sync, defaults).then(settings => {
        currentSettings = settings;
        syncControls();
        renderStep(0);
    });
})();

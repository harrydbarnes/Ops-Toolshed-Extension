(function() {
    'use strict';

    const SETTINGS = Object.freeze({
        enabled: 'prismaLoginAssistantEnabled',
        enabledLocal: 'prismaLoginAssistantEnabledLocal',
        email: 'prismaLoginAssistantEmail',
        organisation: 'prismaLoginAssistantOrganisation',
        promptStartedAt: 'prismaLoginAssistantPromptStartedAt',
        promptDismissed: 'prismaLoginAssistantPromptDismissed'
    });
    const DEFAULT_ORGANISATION = 'WPP Media UK Agency Owner United Kingdom';
    const PROMPT_DURATION_MS = 2 * 24 * 60 * 60 * 1000;
    const TOAST_ID = 'ops-toolshed-prisma-login-toast';
    const TOAST_STYLE_ID = 'ops-toolshed-prisma-login-toast-style';
    let settings = {
        enabled: false,
        email: '',
        organisation: DEFAULT_ORGANISATION,
        promptStartedAt: 0,
        promptDismissed: false
    };
    let observer;
    let reconcileQueued = false;
    let usernameSubmitted = false;
    let organisationSubmitted = false;
    let organisationDropdownOpened = false;
    let organisationOptionChosen = false;
    let suppressAutomationForCurrentPage = false;
    let promptVisible = false;
    let settingsLoaded = false;

    function isActiveDocument() {
        return document.visibilityState === 'visible' && document.hasFocus();
    }

    function normalise(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function isEmail(value) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalise(value));
    }

    function pageText() {
        return normalise(document.body?.textContent).toLowerCase();
    }

    function hasPrismaSignInPage() {
        const text = pageText();
        return text.includes('enter username to continue') || text.includes('select your organisation to sign in');
    }

    function isUsernameStage() {
        return pageText().includes('enter username to continue');
    }

    function isOrganisationStage() {
        return pageText().includes('select your organisation to sign in');
    }

    function queryButton(label) {
        const target = label.toLowerCase();
        return Array.from(document.querySelectorAll('button, input[type="submit"]')).find(element =>
            normalise(element.textContent || element.value).toLowerCase() === target &&
            !element.disabled
        ) || null;
    }

    function getUsernameInput() {
        return document.querySelector(
            'input[type="email"], input[name*="username" i], input[id*="username" i], input[autocomplete="username"]'
        );
    }

    function getRememberMeInput() {
        return document.querySelector(
            'input[type="checkbox"][name*="remember" i], input[type="checkbox"][id*="remember" i], input[type="checkbox"]'
        );
    }

    function setInputValue(input, value) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        descriptor?.set?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function injectToastStyles() {
        if (document.getElementById(TOAST_STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = TOAST_STYLE_ID;
        style.textContent = `
            #${TOAST_ID} {
                position: fixed;
                z-index: 2147483647;
                right: 20px;
                bottom: 20px;
                max-width: min(360px, calc(100vw - 40px));
                padding: 14px 16px;
                border-radius: 10px;
                background: #102c72;
                color: #fff;
                box-shadow: 0 10px 26px rgba(0, 0, 0, .24);
                font: 500 14px/1.4 Arial, sans-serif;
            }
            #${TOAST_ID} strong { display: block; margin-bottom: 4px; }
            #${TOAST_ID} p { margin: 0; }
            #${TOAST_ID} .ops-toolshed-login-actions { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
            #${TOAST_ID} button { border: 0; border-radius: 5px; padding: 7px 12px; background: #fff; color: #102c72; font: inherit; font-weight: 700; cursor: pointer; }
            #${TOAST_ID} button.ops-toolshed-login-dismiss { margin-left: auto; padding: 2px 7px; background: transparent; color: #fff; font-size: 20px; line-height: 1; }
        `;
        document.documentElement.appendChild(style);
    }

    function showToast(message) {
        injectToastStyles();
        let toast = document.getElementById(TOAST_ID);
        if (!toast) {
            toast = document.createElement('div');
            toast.id = TOAST_ID;
            toast.setAttribute('role', 'status');
            document.body.appendChild(toast);
        }
        toast.replaceChildren();
        const title = document.createElement('strong');
        title.textContent = 'Prisma sign-in';
        const text = document.createElement('span');
        text.textContent = message;
        toast.append(title, text);
    }

    function removeToast() {
        document.getElementById(TOAST_ID)?.remove();
        promptVisible = false;
    }

    function showSignInPrompt(input) {
        promptVisible = true;
        injectToastStyles();
        let toast = document.getElementById(TOAST_ID);
        if (!toast) {
            toast = document.createElement('div');
            toast.id = TOAST_ID;
            toast.setAttribute('role', 'status');
            document.body.appendChild(toast);
        }
        toast.replaceChildren();
        const title = document.createElement('strong');
        title.textContent = 'Prisma sign-in';
        const text = document.createElement('p');
        text.textContent = "Enter your work email, tick 'Remember me', then click 'Next'. Then select your organisation from the drop down. Would you like this to be done automatically next time for you?";
        const actions = document.createElement('div');
        actions.className = 'ops-toolshed-login-actions';
        const accept = document.createElement('button');
        accept.type = 'button';
        accept.textContent = 'Yes';
        accept.addEventListener('click', () => {
            const email = normalise(input.value);
            if (isEmail(email)) {
                settings.email = email;
                chrome.storage.local.set({ [SETTINGS.email]: email });
            }
            settings.enabled = true;
            suppressAutomationForCurrentPage = true;
            chrome.storage.sync.set({ [SETTINGS.enabled]: true });
            chrome.storage.local.set({ [SETTINGS.enabledLocal]: true });
            removeToast();
        });
        const dismiss = document.createElement('button');
        dismiss.type = 'button';
        dismiss.className = 'ops-toolshed-login-dismiss';
        dismiss.setAttribute('aria-label', 'Do not show this sign-in prompt again');
        dismiss.textContent = '×';
        dismiss.addEventListener('click', () => {
            settings.promptDismissed = true;
            chrome.storage.local.set({ [SETTINGS.promptDismissed]: true });
            showToast('You can enable Prisma sign-in assistant at any time in Settings.');
        });
        actions.append(accept, dismiss);
        toast.append(title, text, actions);
    }

    function shouldShowSignInPrompt() {
        if (settings.enabled || settings.promptDismissed) return false;
        if (!settings.promptStartedAt) {
            settings.promptStartedAt = Date.now();
            chrome.storage.local.set({ [SETTINGS.promptStartedAt]: settings.promptStartedAt });
        }
        return Date.now() - settings.promptStartedAt < PROMPT_DURATION_MS;
    }

    function selectNativeOrganisation(select, organisation) {
        const option = Array.from(select.options).find(candidate =>
            normalise(candidate.textContent) === organisation
        );
        if (!option) return false;
        select.value = option.value;
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }

    function findOrganisationOption(organisation) {
        return Array.from(document.querySelectorAll('[role="option"], li, button, div')).find(element =>
            normalise(element.textContent) === organisation &&
            element.offsetParent !== null
        ) || null;
    }

    function tryOrganisationStage() {
        if (!isActiveDocument() || !settings.enabled || !settings.organisation) return;
        const nativeSelect = document.querySelector('select');
        if (nativeSelect && !selectNativeOrganisation(nativeSelect, settings.organisation)) return;

        if (!nativeSelect) {
            const option = findOrganisationOption(settings.organisation);
            if (option && !organisationOptionChosen) {
                organisationOptionChosen = true;
                option.click();
                window.setTimeout(scheduleReconcile, 0);
                return;
            }
            if (!option) {
                const selector = document.querySelector('[role="combobox"], [aria-haspopup="listbox"], select + button');
                if (!organisationDropdownOpened && selector) {
                    organisationDropdownOpened = true;
                    selector.click();
                }
                return;
            }
            const selector = document.querySelector('[role="combobox"], [aria-haspopup="listbox"]');
            if (selector && !normalise(selector.textContent).includes(settings.organisation)) return;
        }

        const submit = queryButton('submit');
        if (submit && isActiveDocument() && !organisationSubmitted) {
            organisationSubmitted = true;
            submit.click();
        }
    }

    function tryUsernameStage() {
        if (!isActiveDocument()) return;
        const input = getUsernameInput();
        if (!input) return;

        if (shouldShowSignInPrompt() && !promptVisible) showSignInPrompt(input);

        if (!settings.enabled || suppressAutomationForCurrentPage || !isEmail(settings.email)) return;
        if (input.value !== settings.email) setInputValue(input, settings.email);
        const rememberMe = getRememberMeInput();
        if (rememberMe && !rememberMe.checked && isActiveDocument()) rememberMe.click();
        const next = queryButton('next');
        if (next && isActiveDocument() && !usernameSubmitted) {
            usernameSubmitted = true;
            next.click();
        }
    }

    function reconcile() {
        reconcileQueued = false;
        if (!settingsLoaded) return;
        if (!hasPrismaSignInPage()) return;
        if (isUsernameStage()) tryUsernameStage();
        if (isOrganisationStage()) tryOrganisationStage();
    }

    function scheduleReconcile() {
        if (reconcileQueued) return;
        reconcileQueued = true;
        queueMicrotask(reconcile);
    }

    function captureManualEmail(event) {
        if (!settings.enabled || !isActiveDocument()) return;
        const input = event.target;
        if (!(input instanceof HTMLInputElement) || input !== getUsernameInput()) return;
        const email = normalise(input.value);
        if (!isEmail(email)) return;
        settings.email = email;
        chrome.storage.local.set({ [SETTINGS.email]: email });
    }

    function initialize() {
        if (observer || !chrome.storage?.sync || !chrome.storage?.local) return;
        Promise.all([
            chrome.storage.sync.get({ [SETTINGS.enabled]: false }),
            chrome.storage.local.get({
                [SETTINGS.enabledLocal]: null,
                [SETTINGS.email]: '',
                [SETTINGS.organisation]: DEFAULT_ORGANISATION,
                [SETTINGS.promptStartedAt]: 0,
                [SETTINGS.promptDismissed]: false
            })
        ]).then(([sync, local]) => {
            settings = {
                enabled: local[SETTINGS.enabledLocal] === null
                    ? sync[SETTINGS.enabled] === true
                    : local[SETTINGS.enabledLocal] === true,
                email: normalise(local[SETTINGS.email]),
                organisation: normalise(local[SETTINGS.organisation]) || DEFAULT_ORGANISATION,
                promptStartedAt: Number(local[SETTINGS.promptStartedAt]) || 0,
                promptDismissed: local[SETTINGS.promptDismissed] === true
            };
            settingsLoaded = true;
            scheduleReconcile();
        }).catch(() => undefined);

        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'sync' && changes[SETTINGS.enabled]) settings.enabled = changes[SETTINGS.enabled].newValue === true;
            if (areaName === 'local') {
                if (changes[SETTINGS.email]) settings.email = normalise(changes[SETTINGS.email].newValue);
                if (changes[SETTINGS.organisation]) settings.organisation = normalise(changes[SETTINGS.organisation].newValue) || DEFAULT_ORGANISATION;
                if (changes[SETTINGS.enabledLocal]) settings.enabled = changes[SETTINGS.enabledLocal].newValue === true;
                if (changes[SETTINGS.promptDismissed]) settings.promptDismissed = changes[SETTINGS.promptDismissed].newValue === true;
            }
            scheduleReconcile();
        });

        document.addEventListener('input', captureManualEmail, true);
        window.addEventListener('focus', scheduleReconcile);
        document.addEventListener('visibilitychange', scheduleReconcile);
        window.addEventListener('pagehide', dispose, { once: true });
        observer = new MutationObserver(scheduleReconcile);
        observer.observe(document.documentElement, { childList: true, subtree: true });
        scheduleReconcile();
    }

    function dispose() {
        observer?.disconnect();
        observer = null;
        settingsLoaded = false;
    }

    window.prismaLoginAssistantFeature = { initialize, isActiveDocument, reconcile, dispose };
    window.opsToolshedExtensionState?.subscribe?.(active => {
        if (active) initialize();
    });
})();

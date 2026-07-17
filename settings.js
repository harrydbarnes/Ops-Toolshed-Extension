// Prepend to settings.js or ensure it's within DOMContentLoaded 
 
// Utility to escape HTML for display 
function escapeHTML(str) { 
    if (str === null || str === undefined) return ''; 
    const div = document.createElement('div'); 
    div.appendChild(document.createTextNode(str)); 
    return div.innerHTML; 
} 

function isMissingContentScriptReceiverError(error) {
    const message = error?.message || String(error || '');
    return /could not establish connection|receiving end does not exist|message port closed before a response was received/i.test(message);
}

const SETTINGS_DEFAULTS = Object.freeze({
    uiTheme: 'pink',
    reminderTheme: 'pink',
    autoCopyUrlMode: 'short',
    metaFinanceToolMode: 'social',
    logoReplaceEnabled: true,
    appLearnReplaceEnabled: true,
    blockAppLearnPopupsEnabled: true,
    helpGuidesEnabled: true,
    prismaReminderFrequency: 'daily',
    prismaCountdownDuration: '5',
    metaReminderEnabled: true,
    iasReminderEnabled: true,
    fontSizeToggleEnabled: true,
    resizableChatToggleEnabled: true,
    scheduledChatToggleEnabled: true,
    addCampaignShortcutEnabled: true,
    hidingSectionsEnabled: true,
    automateFormFieldsEnabled: true,
    countPlacementsSelectedEnabled: true,
    approverWidgetOptimiseEnabled: true,
    swapAccountsEnabled: true,
    rememberAccountSwitchUrlEnabled: true,
    bannerUsernameEnabled: true,
    alwaysShowCommentsEnabled: true,
    orderIdCopyEnabled: true,
    newOrderUiOptimisationEnabled: true,
    ordersShortcutEnabled: true,
    actualiseShortcutEnabled: true,
    approverWidgetPlacementEnabled: true,
    quickCampaignActionsEnabled: true,
    budgetWidgetOptimisedEnabled: true,
    campaignNameQuickCopyEnabled: true,
    campaignHeaderQuickCopyEnabled: true,
    campaignDateShortcutEnabled: true,
    actualiseScrollRestoreEnabled: true,
    actualiseNavbarEnabled: true,
    campaignTabTitleEnabled: true,
    gmiChatShortcutEnabled: true,
    autoCopyUrlEnabled: true,
    loadingFactsEnabled: true,
    optimisedNewNavEnabled: true,
    statsCollectorEnabled: true,
    timesheetReminderEnabled: true,
    reminderDay: 'Friday',
    reminderTime: '14:30',
    customReminders: Object.freeze([])
});

async function loadSettingsWithDefaults(storageArea, defaults = SETTINGS_DEFAULTS) {
    const callStorage = (method, ...args) => new Promise((resolve, reject) => {
        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };

        try {
            const result = storageArea[method](...args, finish);
            if (result?.then) {
                result.then(finish, reject);
            }
        } catch (error) {
            reject(error);
        }
    });

    const storedSettings = await callStorage('get', Object.keys(defaults));
    const missingDefaults = {};

    Object.entries(defaults).forEach(([key, defaultValue]) => {
        if (storedSettings[key] === undefined) missingDefaults[key] = defaultValue;
    });

    if (Object.keys(missingDefaults).length > 0) {
        await callStorage('set', missingDefaults);
    }

    return { ...defaults, ...storedSettings };
}
 
 
// Function to show a test custom reminder on the settings page 
function showTestCustomReminderOnSettingsPage(reminder) { 
    const existingGenericPopup = document.getElementById('custom-reminder-display-popup'); 
    if (existingGenericPopup) existingGenericPopup.remove(); 
    const existingTestOverlays = document.querySelectorAll('[id^="settings-custom-reminder-overlay-"]'); 
    existingTestOverlays.forEach(ov => ov.remove()); 
 
    const overlayId = `settings-custom-reminder-overlay-${reminder.id}`; 
    const overlay = document.createElement('div'); 
    overlay.className = 'reminder-overlay'; // Ensure this class exists and provides basic overlay styling 
    overlay.id = overlayId; 
    document.body.appendChild(overlay); 
 
    const popup = document.createElement('div'); 
    popup.id = 'custom-reminder-display-popup'; // Ensure this ID is styled in settings.css or style.css 
 
    // Safely parse and append the reminder's HTML content 
    popup.innerHTML = window.utils.buildReminderPopupHTML(reminder);
 
    const closeButton = document.createElement('button'); 
    closeButton.id = 'custom-reminder-display-close'; 
    closeButton.className = 'settings-button custom-reminder-close-button';
    closeButton.textContent = 'Got it!'; 
    popup.appendChild(closeButton); 
 
    document.body.appendChild(popup); 
 
    closeButton.addEventListener('click', () => { 
        popup.remove(); 
        overlay.remove(); 
        console.log(`[Settings] Test custom reminder popup for ${reminder.name} closed.`); 
    }); 
    console.log(`[Settings] Test custom reminder popup created for: ${reminder.name}`); 
} 
 
 
// Generic function to show a test reminder popup on the settings page 
function showTestReminderPopup({ popupId, overlayId, content, closeButtonId, hasCountdown, storageKey, countdownSeconds = 5 }) { 
    // Remove existing popups to prevent duplicates 
    const existingPopup = document.getElementById(popupId); 
    if (existingPopup) existingPopup.remove(); 
    const existingOverlay = document.getElementById(overlayId); 
    if (existingOverlay) existingOverlay.remove(); 
 
    const overlay = document.createElement('div'); 
    overlay.className = 'reminder-overlay'; 
    overlay.id = overlayId; 
    document.body.appendChild(overlay); 
 
    const popup = document.createElement('div'); 
    popup.id = popupId; 
 
    if (content.title) { 
        const h3 = document.createElement('h3'); 
        h3.textContent = content.title; 
        popup.appendChild(h3); 
    } 
    if (content.message) { 
        const p = document.createElement('p'); 
        p.textContent = content.message; 
        popup.appendChild(p); 
    } 
    if (content.list && content.list.length > 0) { 
        const ul = document.createElement('ul'); 
        content.list.forEach(itemText => { 
            const li = document.createElement('li'); 
            li.textContent = itemText; 
            ul.appendChild(li); 
        }); 
        popup.appendChild(ul); 
    } 
 
    const closeButton = document.createElement('button'); 
    closeButton.id = closeButtonId; 
    closeButton.className = 'reminder-close-button'; 
    closeButton.textContent = 'Got it!'; 
    popup.appendChild(closeButton); 
 
    document.body.appendChild(popup); 
    console.log(`[Settings] Test ${popupId} CREATED.`); 
 
    let countdownInterval; 
 
    const cleanupPopup = () => { 
        popup.remove(); 
        overlay.remove(); 
        clearInterval(countdownInterval); 
        console.log(`[Settings] Test ${popupId} and overlay removed.`); 
    }; 
 
    if (closeButton) { 
        if (hasCountdown && countdownSeconds > 0) { 
            // Disable the button and start the countdown immediately for test popups. 
            closeButton.disabled = true; 
            let secondsLeft = countdownSeconds; 
            closeButton.textContent = `Got it! (${secondsLeft}s)`; 
 
            countdownInterval = setInterval(() => { 
                secondsLeft--; 
                if (secondsLeft > 0) { 
                    closeButton.textContent = `Got it! (${secondsLeft}s)`; 
                } else { 
                    clearInterval(countdownInterval); 
                    closeButton.textContent = 'Got it!'; 
                    closeButton.disabled = false; 
                } 
            }, 1000); 
        } 
        closeButton.addEventListener('click', cleanupPopup); 
    } 
} 
 
// Function to show a confirmation popup with custom actions 
function showConfirmationPopup({ title, message, confirmText, cancelText, onConfirm, onCancel }) { 
    const popupId = 'confirmation-popup'; 
    const overlayId = 'confirmation-overlay'; 
 
    // Remove existing 
    const existingPopup = document.getElementById(popupId); 
    if (existingPopup) existingPopup.remove(); 
    const existingOverlay = document.getElementById(overlayId); 
    if (existingOverlay) existingOverlay.remove(); 
 
    const overlay = document.createElement('div'); 
    overlay.className = 'reminder-overlay'; 
    overlay.id = overlayId; 
    document.body.appendChild(overlay); 
 
    const popup = document.createElement('div'); 
    popup.id = popupId; 
     
    // UPDATED: Matches Reminder UI (Pink Theme with White Buttons) 
    // Construct DOM elements programmatically to avoid style string issues

    const h3 = document.createElement('h3');
    h3.textContent = title;
    popup.appendChild(h3);

    const p = document.createElement('p');
    p.textContent = message;
    popup.appendChild(p);

    const buttonGroup = document.createElement('div');
    buttonGroup.className = 'button-group';
    buttonGroup.style.display = 'flex';
    buttonGroup.style.justifyContent = 'center';
    buttonGroup.style.gap = '15px';
    buttonGroup.style.marginTop = '20px';

    const confirmBtn = document.createElement('button');
    confirmBtn.id = 'confirm-action-btn';
    confirmBtn.className = 'reminder-close-button';
    confirmBtn.style.margin = '0';
    confirmBtn.textContent = confirmText;
    buttonGroup.appendChild(confirmBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.id = 'cancel-action-btn';
    cancelBtn.className = 'reminder-close-button';
    cancelBtn.style.margin = '0';
    cancelBtn.textContent = cancelText;
    buttonGroup.appendChild(cancelBtn);

    popup.appendChild(buttonGroup);
    document.body.appendChild(popup); 
 
    const cleanup = () => { 
        popup.remove(); 
        overlay.remove(); 
    }; 
 
    confirmBtn.addEventListener('click', () => { 
        if (onConfirm) onConfirm(); 
        cleanup(); 
    }); 
 
    cancelBtn.addEventListener('click', () => { 
        if (onCancel) onCancel(); 
        cleanup(); 
    }); 
} 
 
const syncedToggleInputs = new Map();
let settingsPageInitialized = false;

// Helper function to set up a toggle switch 
function setupToggle(toggleId, storageKey, logMessage, settings) {
    const toggle = document.getElementById(toggleId); 
    if (toggle) { 
        syncedToggleInputs.set(storageKey, toggle);
        toggle.checked = settings[storageKey];
        toggle.addEventListener('change', function() { 
            const isEnabled = this.checked; 
            chrome.storage.sync.set({ [storageKey]: isEnabled }, () => { 
                console.log(logMessage, isEnabled); 
            }); 
        }); 
    } 
} 
 
 
document.addEventListener('DOMContentLoaded', async function() {
    if (settingsPageInitialized) return;
    settingsPageInitialized = true;

    let settings;
    try {
        settings = await loadSettingsWithDefaults(chrome.storage.sync);
    } catch (error) {
        console.error('Failed to load Settings preferences; using defaults for this page:', error);
        settings = { ...SETTINGS_DEFAULTS };
    }
    // --- Feedback Modal Logic --- 
    const feedbackLink = document.getElementById('open-feedback-modal'); 
    if (feedbackLink) { 
        feedbackLink.addEventListener('click', (e) => { 
            e.preventDefault(); 
            if (window.feedbackModalFeature) { 
                window.feedbackModalFeature.open(); 
            } 
        }); 
    } 

    const launchOnboardingButton = document.getElementById('launchOnboardingButton');
    if (launchOnboardingButton) {
        launchOnboardingButton.addEventListener('click', () => {
            chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') })
                .catch(error => console.error('Could not launch user onboarding:', error));
        });
    }
 
    // Tab switching logic 
    const tabContainer = document.querySelector('.tab-container'); 
    if (tabContainer) { 
        const tabButtons = Array.from(tabContainer.querySelectorAll('.tab-button'));
        const tabPanels = Array.from(document.querySelectorAll('[role="tabpanel"]'));
        const defaultTab = tabButtons.find(tab => tab.classList.contains('active'))?.dataset.tab
            || tabButtons[0]?.dataset.tab;

        const getTabFromUrl = () => {
            const requestedTab = window.location.hash.slice(1);
            return tabButtons.some(tab => tab.dataset.tab === requestedTab)
                ? requestedTab
                : defaultTab;
        };

        const activateTab = (tabName, { updateUrl = false, focus = false } = {}) => {
            const activeButton = tabButtons.find(tab => tab.dataset.tab === tabName);
            const activePanel = document.getElementById(tabName);
            if (!activeButton || !activePanel) return;

            tabButtons.forEach(tab => {
                tab.classList.remove('active');
                tab.setAttribute('aria-selected', 'false');
                tab.setAttribute('tabindex', '-1');
            });
            tabPanels.forEach(panel => {
                panel.classList.remove('active');
                panel.hidden = true;
            });

            activeButton.classList.add('active');
            activeButton.setAttribute('aria-selected', 'true');
            activeButton.removeAttribute('tabindex');
            activePanel.classList.add('active');
            activePanel.hidden = false;

            if (updateUrl && window.location.hash !== `#${tabName}`) {
                window.history.pushState({}, document.title, `#${tabName}`);
            }
            if (focus) activeButton.focus();
        };

        tabContainer.addEventListener('click', function(event) {
            const clickedButton = event.target.closest('.tab-button');
            if (!clickedButton) return;
            activateTab(clickedButton.dataset.tab, { updateUrl: true, focus: true });
        }); 

        const syncTabFromUrl = () => activateTab(getTabFromUrl());
        window.addEventListener('popstate', syncTabFromUrl);
        window.addEventListener('hashchange', syncTabFromUrl);
        syncTabFromUrl();
    } 
 
    // --- Time-Bomb Disablement --- 
    chrome.storage.local.get('timeBombActive', (data) => { 
        if (data.timeBombActive) { 
            // Show permanent toast 
            const toast = document.getElementById('toast-notification'); 
            const message = toast.querySelector('.toast-message'); 
            message.textContent = 'Please note all features are disabled, except for exporting custom reminders. Contact Harry for re-install.'; 
            toast.classList.add('show', 'permanent'); // 'permanent' class can be styled to ensure it stays 
 
            // Disable all interactive elements except for the export functionality 
        document.querySelectorAll('input, button:not(.tab-button), select, textarea, a').forEach(el => { 
                // IDs of elements to keep enabled 
                const allowedIds = ['generateExportData', 'exportDataTextarea', 'resetRemindersButton']; 
                if (!allowedIds.includes(el.id)) { 
                    el.disabled = true; 
                    el.style.pointerEvents = 'none'; 
                    el.style.opacity = '0.6'; 
                    el.classList.add('disabled-by-time-bomb'); 
                } 
            }); 
             // Specifically re-enable the export textarea if it got disabled 
            const exportTextarea = document.getElementById('exportDataTextarea'); 
            if (exportTextarea) { 
                exportTextarea.disabled = false; 
            } 
        } 
    }); 
    // --- End Time-Bomb Disablement --- 
 
    console.log('Settings page loaded'); 
 
    // Toast Notification 
    function showToast(message) { 
        const toastNotification = document.getElementById('toast-notification'); 
        const toastMessage = toastNotification.querySelector('.toast-message'); 
        if (!toastNotification || !toastMessage) return; 
 
        toastMessage.textContent = message; 
        toastNotification.classList.add('show'); 
 
        setTimeout(() => { 
            toastNotification.classList.remove('show'); 
            toastNotification.classList.add('hide'); 
            setTimeout(() => { 
                toastNotification.classList.remove('hide'); 
            }, 500); // Cleanup hide class after animation 
        }, 3000); // Show for 3 seconds 
    } 
 
    // General Settings 
    // Theme Settings - Custom Dropdown Logic 
    function initializeCustomDropdown(dropdownId, storageKey, defaultValue = 'pink', onChange = null) {
        const dropdown = document.getElementById(dropdownId); 
        if (!dropdown) return; 
 
        const trigger = dropdown.querySelector('.dropdown-trigger'); 
        const triggerText = trigger.querySelector('.selected-text'); 
        const triggerColor = trigger.querySelector('.color-preview-rect'); 
        const optionsContainer = dropdown.querySelector('.dropdown-options'); 
        const options = dropdown.querySelectorAll('.dropdown-option'); 
 
        // Accessibility Initialization 
        trigger.setAttribute('aria-expanded', 'false'); 
        trigger.setAttribute('aria-haspopup', 'listbox'); 
        trigger.setAttribute('role', 'combobox'); 
        optionsContainer.setAttribute('role', 'listbox'); 
 
        options.forEach(option => { 
            option.setAttribute('role', 'option'); 
            option.setAttribute('tabindex', '-1'); 
            option.setAttribute('aria-selected', 'false'); 
        }); 
 
        // Helper to update the UI 
        function updateUI(value) { 
            // Find the option element with this value 
            const selectedOption = Array.from(options).find(opt => opt.dataset.value === value); 
            if (selectedOption) { 
                const text = selectedOption.textContent.trim(); 
                triggerText.textContent = text; 
 
                // Update trigger color class (CSP safe) 
                if (triggerColor) triggerColor.className = 'color-preview-rect ' + value;
 
                // Update selected state in options 
                options.forEach(opt => { 
                    opt.classList.remove('selected'); 
                    opt.setAttribute('aria-selected', 'false'); 
                }); 
                selectedOption.classList.add('selected'); 
                selectedOption.setAttribute('aria-selected', 'true'); 
            } 
        } 
 
        function closeDropdown() { 
            dropdown.classList.remove('active'); 
            trigger.setAttribute('aria-expanded', 'false'); 
            trigger.focus(); 
        } 
 
        function openDropdown() { 
            if (dropdown.classList.contains('is-disabled')) return;
            // Close other dropdowns first 
            document.querySelectorAll('.custom-dropdown.active').forEach(d => { 
                if (d !== dropdown) { 
                    d.classList.remove('active'); 
                    const otherTrigger = d.querySelector('.dropdown-trigger'); 
                    if (otherTrigger) otherTrigger.setAttribute('aria-expanded', 'false'); 
                } 
            }); 
            dropdown.classList.add('active'); 
            trigger.setAttribute('aria-expanded', 'true'); 
 
            // Focus current selection or first option 
            const selected = dropdown.querySelector('.dropdown-option.selected') || options[0]; 
            if (selected) selected.focus(); 
        } 
 
        function toggleDropdown() { 
            if (dropdown.classList.contains('active')) { 
                closeDropdown(); 
            } else { 
                openDropdown(); 
            } 
        } 
 
        // Initialize from storage 
        chrome.storage.sync.get(storageKey, (data) => { 
            let storedValue = data[storageKey];
            if (storedValue === undefined) {
                // If specific default needs to be saved
                storedValue = defaultValue;
                chrome.storage.sync.set({ [storageKey]: storedValue });
            }
            updateUI(storedValue);
            if (onChange) onChange(storedValue);
        }); 
 
        // Toggle dropdown open/close on click 
        trigger.addEventListener('click', (e) => { 
            e.stopPropagation(); 
            if (dropdown.classList.contains('is-disabled')) return;
            toggleDropdown(); 
        }); 
 
        // Trigger Keyboard Events 
        trigger.addEventListener('keydown', (e) => { 
            if (dropdown.classList.contains('is-disabled')) return;
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') { 
                e.preventDefault(); 
                openDropdown(); 
            } 
        }); 
 
        // Handle option selection 
        options.forEach((option, index) => { 
            const selectOption = () => { 
                if (dropdown.classList.contains('is-disabled')) return;
                const value = option.dataset.value; 
                updateUI(value); 
                chrome.storage.sync.set({ [storageKey]: value }, () => { 
                    console.log(`${storageKey} saved:`, value); 
                    if (onChange) onChange(value);
                }); 
                closeDropdown(); 
            }; 
 
            option.addEventListener('click', (e) => { 
                e.stopPropagation(); 
                selectOption(); 
            }); 
 
            option.addEventListener('keydown', (e) => { 
                if (e.key === 'Enter' || e.key === ' ') { 
                    e.preventDefault(); 
                    selectOption(); 
                } else if (e.key === 'Escape') { 
                    e.preventDefault(); 
                    closeDropdown(); 
                } else if (e.key === 'ArrowDown') { 
                    e.preventDefault(); 
                    const nextIndex = (index + 1) % options.length; 
                    options[nextIndex].focus(); 
                } else if (e.key === 'ArrowUp') { 
                    e.preventDefault(); 
                    const prevIndex = (index - 1 + options.length) % options.length; 
                    options[prevIndex].focus(); 
                } 
            }); 
        }); 

        dropdown.addEventListener('custom-dropdown:set-value', (event) => {
            updateUI(event.detail);
        });
    } 

    function initializeSegmentedControl(controlId, storageKey, defaultValue, initialSettings) {
        const control = document.getElementById(controlId);
        if (!control) return;

        const buttons = Array.from(control.querySelectorAll('button[data-value]'));
        const updateUI = (value) => {
            const validValue = buttons.some(button => button.dataset.value === value) ? value : defaultValue;
            buttons.forEach(button => {
                const selected = button.dataset.value === validValue;
                button.classList.toggle('is-selected', selected);
                button.setAttribute('aria-pressed', String(selected));
                button.tabIndex = selected ? 0 : -1;
            });
        };

        const selectValue = (value) => {
            if (control.classList.contains('is-disabled')) return;
            updateUI(value);
            chrome.storage.sync.set({ [storageKey]: value }, () => {
                console.log(`${storageKey} saved:`, value);
            });
        };

        updateUI(initialSettings[storageKey] ?? defaultValue);

        buttons.forEach((button, index) => {
            button.addEventListener('click', () => selectValue(button.dataset.value));
            button.addEventListener('keydown', (event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                const offset = event.key === 'ArrowRight' ? 1 : -1;
                const nextIndex = (index + offset + buttons.length) % buttons.length;
                selectValue(buttons[nextIndex].dataset.value);
                buttons[nextIndex].focus();
            });
        });

        control.addEventListener('segmented-control:set-value', (event) => {
            updateUI(event.detail);
        });
    }
 
    // Close dropdown when clicking outside (Global Listener) 
    document.addEventListener('click', (e) => { 
        document.querySelectorAll('.custom-dropdown.active').forEach(dropdown => { 
            if (!dropdown.contains(e.target)) { 
                dropdown.classList.remove('active'); 
                const trigger = dropdown.querySelector('.dropdown-trigger'); 
                if (trigger) trigger.setAttribute('aria-expanded', 'false'); 
            } 
        }); 
    }); 
 
    // Initialize theme and two-choice settings controls.
    // DROPDOWN ROLLBACK:
    // 1. Restore the commented dropdown markup beside each segmented control in settings.html.
    // 2. Replace the uiThemeSegmented call with:
    //    initializeCustomDropdown('uiThemeDropdown', 'uiTheme', 'pink');
    // 3. Replace the autoCopyUrlModeSegmented call with:
    //    initializeCustomDropdown('autoCopyUrlModeDropdown', 'autoCopyUrlMode', 'short');
    // 4. In the URL enable/sync block below, rename autoCopyUrlModeSegmented to
    //    autoCopyUrlModeDropdown and restore the dropdown is-disabled/custom-dropdown:set-value handling.
    initializeSegmentedControl('uiThemeSegmented', 'uiTheme', 'pink', settings);
    initializeSegmentedControl('reminderThemeSegmented', 'reminderTheme', 'pink', settings);
    initializeSegmentedControl('autoCopyUrlModeSegmented', 'autoCopyUrlMode', 'short', settings);
    initializeSegmentedControl('metaFinanceToolSegmented', 'metaFinanceToolMode', 'social', settings);

    const logoToggle = document.getElementById('logoToggle'); 
    if (logoToggle) { 
        logoToggle.checked = settings.logoReplaceEnabled;
        logoToggle.addEventListener('change', function() { 
            const isEnabled = this.checked; 
            chrome.storage.sync.set({logoReplaceEnabled: isEnabled}, () => { 
                console.log('Logo replacement setting saved:', isEnabled); 
                chrome.tabs.query({url: ["*://*.mediaocean.com/*"]}, (tabs) => { 
                    tabs.forEach(tab => { 
                        if (tab.id) chrome.tabs.sendMessage(tab.id, { action: "checkLogoReplaceEnabled", enabled: isEnabled }) 
                            .catch(error => {
                                if (!isMissingContentScriptReceiverError(error)) {
                                    console.error("Unexpected error sending logo toggle message to tab ID " + tab.id + ":", error);
                                }
                            });
                    }); 
                }); 
            }); 
        }); 
    } 

    setupToggle('appLearnReplaceToggle', 'appLearnReplaceEnabled', 'AppLearn transparency setting saved:', settings);
    setupToggle('blockAppLearnPopupsToggle', 'blockAppLearnPopupsEnabled', 'AppLearn popup blocking setting saved:', settings);
    setupToggle('helpGuidesToggle', 'helpGuidesEnabled', 'Help Guides setting saved:', settings);
 
    // Prisma Reminders 
    const prismaReminderFrequency = document.getElementById('prismaReminderFrequency'); 
    const prismaCountdownDuration = document.getElementById('prismaCountdownDuration'); 
 
    // Load and save settings for Prisma Reminders 
    if (prismaReminderFrequency && prismaCountdownDuration) { 
        prismaReminderFrequency.value = settings.prismaReminderFrequency;
        prismaCountdownDuration.value = settings.prismaCountdownDuration;
 
        prismaReminderFrequency.addEventListener('change', () => { 
            chrome.storage.sync.set({ prismaReminderFrequency: prismaReminderFrequency.value }, () => { 
                console.log('Prisma reminder frequency saved:', prismaReminderFrequency.value); 
            }); 
        }); 
 
        prismaCountdownDuration.addEventListener('change', () => { 
            chrome.storage.sync.set({ prismaCountdownDuration: prismaCountdownDuration.value }, () => { 
                console.log('Prisma countdown duration saved:', prismaCountdownDuration.value); 
            }); 
        }); 
    } 
 
    const resetRemindersButton = document.getElementById('resetRemindersButton'); 
    if (resetRemindersButton) { 
        let clickCount = 0; 
        let clickTimer = null; 
        const originalButtonText = resetRemindersButton.textContent; 
 
        const resetClickCount = () => { 
            clickCount = 0; 
            resetRemindersButton.textContent = originalButtonText; 
        }; 
 
        resetRemindersButton.addEventListener('click', () => { 
            chrome.storage.local.get('timeBombActive', (data) => { 
                if (data.timeBombActive) { 
                    clickCount++; 
                    clearTimeout(clickTimer); 
                    clickTimer = setTimeout(resetClickCount, 3000); // 3-second window to click 
 
                    if (clickCount >= 10) { 
                        clearTimeout(clickTimer); 
                        chrome.runtime.sendMessage({ action: "disableTimeBomb" }, (response) => { 
                            if (response && response.status === 'success') { 
                                alert('Time bomb disabled! The page will now reload.'); 
                                window.location.reload(); 
                            } else { 
                                alert('Failed to disable time bomb. Please try again.'); 
                                resetClickCount(); 
                            } 
                        }); 
                    } else if (clickCount > 7) { // Only show the countdown for the last 3 clicks 
                        resetRemindersButton.textContent = `Click ${10 - clickCount} more times to override`; 
                    } 
                } else { 
                    // Original reset logic if time bomb is not active 
                    chrome.storage.local.remove(['metaReminderLastShown', 'iasReminderLastShown'], () => { 
                        if (chrome.runtime.lastError) { 
                            console.error('Error clearing reminder timestamps:', chrome.runtime.lastError); 
                        } else { 
                            console.log('Reminder timestamps cleared from local storage.'); 
                        } 
                    }); 
                    const defaultSettings = { 
                        prismaReminderFrequency: 'daily', 
                        prismaCountdownDuration: '5' 
                    }; 
                    chrome.storage.sync.set(defaultSettings, () => { 
                        if (chrome.runtime.lastError) { 
                            showToast('An error occurred while resetting reminder settings.'); 
                        } else { 
                            if (prismaReminderFrequency) prismaReminderFrequency.value = 'daily'; 
                            if (prismaCountdownDuration) prismaCountdownDuration.value = '5'; 
                            showToast('Prisma reminders have been reset.'); 
                        } 
                    }); 
                } 
            }); 
        }); 
    } 
 
    setupToggle('metaReminderToggle', 'metaReminderEnabled', 'Meta reminder setting saved:', settings);
    setupToggle('iasReminderToggle', 'iasReminderEnabled', 'IAS reminder setting saved:', settings);
 
    const triggerMetaReminderButton = document.getElementById('triggerMetaReminder'); 
    if (triggerMetaReminderButton) { 
        triggerMetaReminderButton.addEventListener('click', () => { 
            const countdownDuration = parseInt(prismaCountdownDuration.value, 10); 
            showTestReminderPopup({ 
                popupId: 'meta-reminder-popup', 
                overlayId: 'meta-reminder-overlay', 
                content: { 
                    title: '⚠️ Meta Reconciliation Reminder ⚠️', 
                    message: 'When reconciling Meta, please:', 
                    list: [ 
                        "Actualise to the 'Supplier' option", 
                        "Self-accept the IO", 
                        "Push through on trafficking tab to Meta", 
                        "Verify success of the push, every time", 
                        "Do not just leave the page!" 
                    ] 
                }, 
                closeButtonId: 'meta-reminder-close', 
                hasCountdown: countdownDuration > 0, 
                // No storageKey, so the test button countdown runs every time. 
                // The actual reminder in content.js will still respect the frequency setting. 
                countdownSeconds: countdownDuration 
            }); 
        }); 
    } 
 
    const triggerIasReminderButton = document.getElementById('triggerIasReminder'); 
    if (triggerIasReminderButton) { 
        triggerIasReminderButton.addEventListener('click', () => { 
            const countdownDuration = parseInt(prismaCountdownDuration.value, 10); 
            showTestReminderPopup({ 
                popupId: 'ias-reminder-popup', 
                overlayId: 'ias-reminder-overlay', 
                content: { 
                    title: '⚠️ IAS Booking Reminder ⚠️', 
                    message: 'Please ensure you book as CPM', 
                    list: [ 
                        'With correct rate for media type', 
                        'Check the plan', 
                        'Ensure what is planned is what goes live' 
                    ] 
                }, 
                closeButtonId: 'ias-reminder-close', 
                hasCountdown: countdownDuration > 0, 
                // No storageKey for this one, it should countdown every time if enabled 
                countdownSeconds: countdownDuration 
            }); 
        }); 
    } 
 
 
    // Live Chat Enhancements 
    setupToggle('fontSizeToggle', 'fontSizeToggleEnabled', 'Font Size Toggle setting saved:', settings);
    setupToggle('resizableChatToggle', 'resizableChatToggleEnabled', 'Resizable Chat setting saved:', settings);
    setupToggle('scheduledChatToggle', 'scheduledChatToggleEnabled', 'Scheduled Chat setting saved:', settings);
 
    // Campaign Management Settings 
    setupToggle('addCampaignShortcutToggle', 'addCampaignShortcutEnabled', 'Add Campaign shortcut setting saved:', settings);
    setupToggle('hidingSectionsToggle', 'hidingSectionsEnabled', 'Hiding Sections setting saved:', settings);
    setupToggle('automateFormFieldsToggle', 'automateFormFieldsEnabled', 'Automate Form Fields setting saved:', settings);
    setupToggle('countPlacementsSelectedToggle', 'countPlacementsSelectedEnabled', 'Count Placements Selected setting saved:', settings);
    setupToggle('approverWidgetOptimiseToggle', 'approverWidgetOptimiseEnabled', 'Approver Widget Optimise setting saved:', settings);
    setupToggle('swapAccountsToggle', 'swapAccountsEnabled', 'Switch Accounts setting saved:', settings);
    setupToggle('rememberAccountSwitchUrlToggle', 'rememberAccountSwitchUrlEnabled', 'Remember page after account switch setting saved:', settings);
    setupToggle('bannerUsernameToggle', 'bannerUsernameEnabled', 'Prisma banner username setting saved:', settings);
    setupToggle('seeCommentsOnLockedBuysToggle', 'alwaysShowCommentsEnabled', 'See Comments on Locked Buys setting saved:', settings);
    setupToggle('orderIdCopyToggle', 'orderIdCopyEnabled', 'Order ID Copy setting saved:', settings);
    setupToggle('newOrderUiOptimisationToggle', 'newOrderUiOptimisationEnabled', 'New Order UI Optimisation setting saved:', settings);
    setupToggle('ordersShortcutToggle', 'ordersShortcutEnabled', 'Orders shortcut setting saved:', settings);
    setupToggle('actualiseShortcutToggle', 'actualiseShortcutEnabled', 'Actualise shortcut setting saved:', settings);
    setupToggle('approverWidgetPlacementToggle', 'approverWidgetPlacementEnabled', 'Approver Widget placement setting saved:', settings);
    setupToggle('quickCampaignActionsToggle', 'quickCampaignActionsEnabled', 'Quick campaign actions setting saved:', settings);
    setupToggle('budgetWidgetOptimisedToggle', 'budgetWidgetOptimisedEnabled', 'Budget widget optimisation setting saved:', settings);
    setupToggle('campaignNameQuickCopyToggle', 'campaignNameQuickCopyEnabled', 'Campaign name quick copy setting saved:', settings);
    setupToggle('campaignHeaderQuickCopyToggle', 'campaignHeaderQuickCopyEnabled', 'Campaign header quick copy setting saved:', settings);
    setupToggle('campaignDateShortcutToggle', 'campaignDateShortcutEnabled', 'Campaign date shortcut setting saved:', settings);
    setupToggle('actualiseScrollRestoreToggle', 'actualiseScrollRestoreEnabled', 'Actualise scroll restoration setting saved:', settings);
    setupToggle('actualiseNavbarToggle', 'actualiseNavbarEnabled', 'Actualise navigation bar setting saved:', settings);
    setupToggle('campaignTabTitleToggle', 'campaignTabTitleEnabled', 'Campaign tab title setting saved:', settings);
    setupToggle('gmiChatShortcutToggle', 'gmiChatShortcutEnabled', 'GMI Chat Shortcut setting saved:', settings);
    setupToggle('autoCopyUrlToggle', 'autoCopyUrlEnabled', 'Auto Copy URL setting saved:', settings);
    setupToggle('loadingFactsToggle', 'loadingFactsEnabled', 'Show Loading Facts setting saved:', settings);

    const autoCopyUrlToggle = document.getElementById('autoCopyUrlToggle');
    const autoCopyUrlModeSegmented = document.getElementById('autoCopyUrlModeSegmented');
    const autoCopyUrlSubOptions = document.getElementById('autoCopyUrlSubOptions');
    const setAutoCopyUrlSubOptionsEnabled = (enabled) => {
        if (autoCopyUrlModeSegmented) {
            autoCopyUrlModeSegmented.classList.toggle('is-disabled', !enabled);
            autoCopyUrlModeSegmented.setAttribute('aria-disabled', String(!enabled));
            autoCopyUrlModeSegmented.querySelectorAll('button').forEach(button => {
                button.disabled = !enabled;
            });
        }
        if (autoCopyUrlSubOptions) {
            autoCopyUrlSubOptions.classList.toggle('is-disabled', !enabled);
            autoCopyUrlSubOptions.setAttribute('aria-disabled', String(!enabled));
        }
    };

    if (autoCopyUrlModeSegmented) {
        setAutoCopyUrlSubOptionsEnabled(settings.autoCopyUrlEnabled);
    }

    autoCopyUrlToggle?.addEventListener('change', () => {
        setAutoCopyUrlSubOptionsEnabled(autoCopyUrlToggle.checked);
    });

    // Optimised campaign navigation master toggle. Child preferences remain
    // stored while the parent is off, so they return exactly as configured.
    const optimisedNewNavToggle = document.getElementById('optimisedNewNavToggle');
    const optimisedNewNavSubOptions = document.getElementById('optimisedNewNavSubOptions');
    const navigationSubOptionInputs = optimisedNewNavSubOptions
        ? Array.from(optimisedNewNavSubOptions.querySelectorAll('input[type="checkbox"]'))
        : [];

    const setNavigationSubOptionsEnabled = (isEnabled) => {
        navigationSubOptionInputs.forEach(input => {
            input.disabled = !isEnabled;
        });
        if (optimisedNewNavSubOptions) {
            optimisedNewNavSubOptions.classList.toggle('is-disabled', !isEnabled);
            optimisedNewNavSubOptions.setAttribute('aria-disabled', String(!isEnabled));
        }
    };

    if (optimisedNewNavToggle) {
        syncedToggleInputs.set('optimisedNewNavEnabled', optimisedNewNavToggle);
        optimisedNewNavToggle.checked = settings.optimisedNewNavEnabled;
        setNavigationSubOptionsEnabled(settings.optimisedNewNavEnabled);

        optimisedNewNavToggle.addEventListener('change', function() {
            const isEnabled = this.checked;
            setNavigationSubOptionsEnabled(isEnabled);
            chrome.storage.sync.set({ optimisedNewNavEnabled: isEnabled }, () => {
                 console.log('Optimised New Nav saved:', isEnabled);
            });
        });
    }

    // Keep an already-open Settings page in sync with changes made by the
    // popup kill switch or any other extension surface.
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync') return;

        syncedToggleInputs.forEach((input, storageKey) => {
            if (!changes[storageKey]) return;
            input.checked = changes[storageKey].newValue !== false;
        });

        if (changes.optimisedNewNavEnabled) {
            setNavigationSubOptionsEnabled(changes.optimisedNewNavEnabled.newValue !== false);
        }
        if (changes.autoCopyUrlEnabled) {
            setAutoCopyUrlSubOptionsEnabled(changes.autoCopyUrlEnabled.newValue !== false);
        }
        if (changes.autoCopyUrlMode && autoCopyUrlModeSegmented) {
            autoCopyUrlModeSegmented.dispatchEvent(new CustomEvent('segmented-control:set-value', {
                detail: changes.autoCopyUrlMode.newValue === 'full' ? 'full' : 'short'
            }));
        }
        if (changes.uiTheme) {
            document.getElementById('uiThemeSegmented')?.dispatchEvent(new CustomEvent('segmented-control:set-value', {
                detail: changes.uiTheme.newValue === 'black' ? 'black' : 'pink'
            }));
        }
        if (changes.reminderTheme) {
            document.getElementById('reminderThemeSegmented')?.dispatchEvent(new CustomEvent('segmented-control:set-value', {
                detail: changes.reminderTheme.newValue === 'black' ? 'black' : 'pink'
            }));
        }
        if (changes.metaFinanceToolMode) {
            document.getElementById('metaFinanceToolSegmented')?.dispatchEvent(new CustomEvent('segmented-control:set-value', {
                detail: changes.metaFinanceToolMode.newValue === 'legacy' ? 'legacy' : 'social'
            }));
        }
    });
 
    // Stats Collector with Confirmation 
    const statsCollectorToggle = document.getElementById('statsCollectorToggle'); 
    if (statsCollectorToggle) { 
        syncedToggleInputs.set('statsCollectorEnabled', statsCollectorToggle);
        statsCollectorToggle.checked = settings.statsCollectorEnabled;
        statsCollectorToggle.addEventListener('click', function(e) { 
            if (!this.checked) { 
                // User trying to disable 
                e.preventDefault();  
                this.checked = true; // Visually stay checked 
 
                showConfirmationPopup({ 
                    title: 'Wait!', 
                    message: 'Keeping this setting on allows us to advocate for improvements to Prisma, and showcase how we are power users of the software! Changed your mind?', 
                    confirmText: 'Disable', 
                    cancelText: 'Keep Enabled', 
                    onConfirm: () => { 
                        statsCollectorToggle.checked = false; 
                        chrome.storage.sync.set({ 'statsCollectorEnabled': false }, () => { 
                            console.log('Stats Collector disabled.'); 
                        }); 
                    }, 
                    onCancel: () => { 
                        // Do nothing, just close 
                        console.log('Stats Collector kept enabled.'); 
                    } 
                }); 
            } else { 
                // User re-enabling 
                chrome.storage.sync.set({ 'statsCollectorEnabled': true }, () => { 
                    console.log('Stats Collector enabled.'); 
                }); 
            } 
        }); 
    } 
 
    // Aura Reminders (Timesheet) 
    const timesheetReminderToggle = document.getElementById('timesheetReminderToggle'); 
    const timesheetReminderSettingsDiv = document.getElementById('timesheetReminderSettings'); 
    const reminderDaySelect = document.getElementById('reminderDay'); 
    const reminderTimeSelect = document.getElementById('reminderTime'); 
    const saveTimesheetReminderSettingsButton = document.getElementById('saveTimesheetReminderSettings'); 
    const timesheetReminderUpdateMessage = document.getElementById('timesheetReminderUpdateMessage'); 
    const triggerTimesheetReminderButton = document.getElementById('triggerTimesheetReminder'); 
 
    function updateTimesheetTimeOptions(day, preferredTime = null) {
        if (!reminderTimeSelect) return; 
        const currentSelectedTime = reminderTimeSelect.value; 
        reminderTimeSelect.innerHTML = ''; 
        let startTime, endTime; 
        if (day === 'Friday') { startTime = 12 * 60; endTime = 17 * 60; } 
        else { startTime = 9 * 60; endTime = 17 * 60 + 30; } 
 
        for (let i = startTime; i <= endTime; i += 15) { 
            const hour = Math.floor(i / 60); 
            const minute = i % 60; 
            const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`; 
            const option = new Option(timeString, timeString); 
            reminderTimeSelect.add(option); 
        } 
 
        if (preferredTime && Array.from(reminderTimeSelect.options).some(o => o.value === preferredTime)) {
            reminderTimeSelect.value = preferredTime;
        } else if (currentSelectedTime && Array.from(reminderTimeSelect.options).some(o => o.value === currentSelectedTime)) {
            reminderTimeSelect.value = currentSelectedTime;
        } else {
            const defaultTime = (day === 'Friday') ? "14:30" : "09:00";
            if (Array.from(reminderTimeSelect.options).some(o => o.value === defaultTime)) reminderTimeSelect.value = defaultTime;
            else if (reminderTimeSelect.options.length > 0) reminderTimeSelect.value = reminderTimeSelect.options[0].value;
        }
    } 
 
    function updateTimesheetAlarm(showMsg = true) { 
        if (!reminderDaySelect || !reminderTimeSelect || !reminderDaySelect.value || !reminderTimeSelect.value) return; 
        const dayValue = reminderDaySelect.value; 
        const timeValue = reminderTimeSelect.value; 
 
        chrome.storage.sync.set({reminderDay: dayValue, reminderTime: timeValue}, () => { 
            if (chrome.runtime.lastError) { 
                console.error("[Settings] Error setting timesheet reminderDay/Time:", chrome.runtime.lastError.message); 
                return; 
            } 
            chrome.runtime.sendMessage({action: "createTimesheetAlarm", day: dayValue, time: timeValue}, (response) => { 
                const messageEl = timesheetReminderUpdateMessage; 
                if (!messageEl || !showMsg) return; 
                if (chrome.runtime.lastError) { 
                    messageEl.textContent = "Error updating alarm."; messageEl.style.color = "red"; 
                } else { 
                    messageEl.textContent = `Reminder updated for ${dayValue} at ${timeValue}.`; messageEl.style.color = "green"; 
                } 
                messageEl.classList.remove('hidden-initially'); 
                setTimeout(() => messageEl.classList.add('hidden-initially'), 3000); 
            }); 
        }); 
    } 
 
    if (timesheetReminderToggle) { 
        timesheetReminderToggle.checked = settings.timesheetReminderEnabled;
        if (timesheetReminderSettingsDiv) timesheetReminderSettingsDiv.style.display = timesheetReminderToggle.checked ? 'block' : 'none';
        if (reminderDaySelect) reminderDaySelect.value = settings.reminderDay;
        updateTimesheetTimeOptions(
            reminderDaySelect ? reminderDaySelect.value : settings.reminderDay,
            settings.reminderTime
        );
 
        timesheetReminderToggle.addEventListener('change', function() { 
            const isEnabled = this.checked; 
            if (timesheetReminderSettingsDiv) timesheetReminderSettingsDiv.style.display = isEnabled ? 'block' : 'none'; 
            chrome.storage.sync.set({timesheetReminderEnabled: isEnabled}, () => { 
                console.log('Timesheet reminder setting saved:', isEnabled); 
                if (isEnabled) updateTimesheetAlarm(); 
                else { 
                    chrome.runtime.sendMessage({action: "removeTimesheetAlarm"}, (response) => { 
                        const messageEl = timesheetReminderUpdateMessage; 
                        if (!messageEl) return; 
                        if (chrome.runtime.lastError) console.error("[Settings] Error sending removeTimesheetAlarm:", chrome.runtime.lastError.message); 
                        else messageEl.textContent = "Timesheet reminder disabled."; messageEl.style.color = "orange"; 
                        messageEl.classList.remove('hidden-initially'); 
                        setTimeout(() => messageEl.classList.add('hidden-initially'), 3000); 
                    }); 
                } 
            }); 
        }); 
    } 
    if (reminderDaySelect) reminderDaySelect.addEventListener('change', () => updateTimesheetTimeOptions(reminderDaySelect.value)); 
    if (saveTimesheetReminderSettingsButton) saveTimesheetReminderSettingsButton.addEventListener('click', () => { 
        if (timesheetReminderToggle && timesheetReminderToggle.checked) updateTimesheetAlarm(); 
        else if (timesheetReminderUpdateMessage) { 
            timesheetReminderUpdateMessage.textContent = "Enable timesheet reminder first to save."; 
            timesheetReminderUpdateMessage.style.color = "orange"; 
            timesheetReminderUpdateMessage.classList.remove('hidden-initially'); 
            setTimeout(() => timesheetReminderUpdateMessage.classList.add('hidden-initially'), 3000); 
        } 
    }); 
    if (triggerTimesheetReminderButton) triggerTimesheetReminderButton.addEventListener('click', () => { 
        chrome.runtime.sendMessage({action: "showTimesheetNotification"}, response => { 
            if (chrome.runtime.lastError) alert("Error triggering reminder: " + chrome.runtime.lastError.message); 
            else alert("Test timesheet reminder notification sent!"); 
        }); 
    }); 
 
    // --- Custom Reminders - Modal Workflow --- 
    const createReminderInitialStepDiv = document.getElementById('createReminderInitialStep'); 
    const reminderFormHeading = document.getElementById('reminderFormHeading');
    const reminderNameInput = document.getElementById('reminderName'); 
    const reminderUrlPatternInput = document.getElementById('reminderUrlPattern'); 
    const reminderUrlMatchType = document.getElementById('reminderUrlMatchType');
    const reminderUrlMatchTypeSegmented = document.getElementById('reminderUrlMatchTypeSegmented');
    const reminderUrlPatternLabel = document.getElementById('reminderUrlPatternLabel');
    const reminderUrlHelp = document.getElementById('reminderUrlHelp');
    const useReminderSiteOnlyButton = document.getElementById('useReminderSiteOnly');
    // REMOVED: const reminderTextTriggerInput = document.getElementById('reminderTextTrigger'); 
    const nextButton = document.getElementById('nextButton'); 
    const customReminderStatus = document.getElementById('customReminderStatus'); 
    const customRemindersListDiv = document.getElementById('customRemindersList'); 
 
    // Helper: Dynamic Trigger Inputs 
    function renderTriggerInput(value = '', options = {}) {
        const containerId = options.containerId || 'reminderTriggersContainer';
        const inputClass = options.inputClass || 'trigger-input';
        const container = document.getElementById(containerId);
        if (!container) return; 
 
        const wrapper = document.createElement('div'); 
        wrapper.className = 'trigger-input-wrapper'; 
 
        const input = document.createElement('input'); 
        input.type = 'text'; 
        input.className = inputClass;
        input.value = value; 
        input.placeholder = "e.g., Order Complete"; 
 
        const removeBtn = document.createElement('button'); 
        removeBtn.type = 'button'; 
        removeBtn.textContent = 'X'; 
        removeBtn.className = 'settings-button settings-button-secondary remove-trigger-btn'; 
        removeBtn.setAttribute('aria-label', 'Remove keyword'); 
        // Allow removing, but user can always add more 
        removeBtn.addEventListener('click', () => { 
            wrapper.remove(); 
        }); 
 
        wrapper.appendChild(input); 
        wrapper.appendChild(removeBtn); 
        container.appendChild(wrapper); 
    } 
 
    const addTriggerBtn = document.getElementById('addTriggerBtn'); 
    if (addTriggerBtn) { 
        addTriggerBtn.addEventListener('click', () => renderTriggerInput()); 
    } 
    // Initialize with one empty input if none exist 
    const container = document.getElementById('reminderTriggersContainer'); 
    if (container && container.children.length === 0) { 
        renderTriggerInput(); 
    } 
 
    // Modal elements 
    const reminderModalOverlay = document.getElementById('reminderModalOverlay'); 
    const reminderModalEditor = document.getElementById('reminderModalEditor'); 
    const modalEditorTitle = document.getElementById('modalEditorTitle'); // h2 title of modal 
    const modalEditorSubtitle = document.getElementById('modalEditorSubtitle');
    const modalCloseButton = document.getElementById('modalCloseButton'); // X button 
    const modalReminderSummary = document.getElementById('modalReminderSummary');
    const modalEditConditions = document.getElementById('modalEditConditions');
    const modalReminderNameDisplay = document.getElementById('modalReminderNameDisplay'); 
    const modalReminderUrlPatternDisplay = document.getElementById('modalReminderUrlPatternDisplay'); 
    const modalReminderTextTriggerDisplay = document.getElementById('modalReminderTextTriggerDisplay'); 
    const modalInputReminderTitle = document.getElementById('modalInputReminderTitle'); 
    const modalInputIntroSentence = document.getElementById('modalInputIntroSentence'); 
    const modalInputBulletPoints = document.getElementById('modalInputBulletPoints'); 
    const modalEditReminderName = document.getElementById('modalEditReminderName');
    const modalEditUrlMatchType = document.getElementById('modalEditUrlMatchType');
    const modalEditUrlMatchTypeSegmented = document.getElementById('modalEditUrlMatchTypeSegmented');
    const modalEditUrlPatternLabel = document.getElementById('modalEditUrlPatternLabel');
    const modalEditUrlPattern = document.getElementById('modalEditUrlPattern');
    const modalUseReminderSiteOnly = document.getElementById('modalUseReminderSiteOnly');
    const modalAddTriggerBtn = document.getElementById('modalAddTriggerBtn');
    const modalEditTriggerLogic = document.getElementById('modalEditTriggerLogic');
    const modalSaveButton = document.getElementById('modalSaveButton'); 
    const modalCancelButton = document.getElementById('modalCancelButton'); 
 
    let currentReminderData = {}; // Holds data for modal (name, url, textTrigger) 
    let editingReminderId = null; // Used to distinguish between create and edit 
    let previousReminderModalFocus = null;

    function getUrlEditorState(urlPattern = '') {
        const trimmedPattern = urlPattern.trim();
        const isSimpleContainsPattern = trimmedPattern.startsWith('*') &&
            trimmedPattern.endsWith('*') &&
            !trimmedPattern.slice(1, -1).includes('*');

        if (isSimpleContainsPattern) {
            return { matchType: 'contains', value: trimmedPattern.slice(1, -1) };
        }
        if (!trimmedPattern.includes('*')) {
            return { matchType: 'contains', value: trimmedPattern };
        }
        return { matchType: 'pattern', value: trimmedPattern };
    }

    function serializeUrlPattern(value, matchType) {
        const trimmedValue = value.trim();
        if (matchType !== 'contains') return trimmedValue;
        const unwrappedValue = trimmedValue.replace(/^\*+|\*+$/g, '');
        return `*${unwrappedValue}*`;
    }

    function initializeLocalSegmentedControl(control, valueInput, defaultValue, onChange) {
        if (!control || !valueInput) return { setValue: () => {} };
        const buttons = Array.from(control.querySelectorAll('button[data-value]'));
        const setValue = (value) => {
            const nextValue = buttons.some(button => button.dataset.value === value) ? value : defaultValue;
            valueInput.value = nextValue;
            buttons.forEach(button => {
                const selected = button.dataset.value === nextValue;
                button.classList.toggle('is-selected', selected);
                button.setAttribute('aria-pressed', String(selected));
            });
            if (onChange) onChange(nextValue);
        };
        buttons.forEach(button => button.addEventListener('click', () => setValue(button.dataset.value)));
        control.addEventListener('segmented-control:set-value', event => setValue(event.detail));
        setValue(valueInput.value || defaultValue);
        return { setValue };
    }

    function updateUrlMatchHelp() {
        const isContainsMode = !reminderUrlMatchType || reminderUrlMatchType.value === 'contains';
        if (reminderUrlPatternLabel) {
            reminderUrlPatternLabel.textContent = isContainsMode ? 'URL text to match:' : 'URL wildcard pattern:';
        }
        if (reminderUrlPatternInput) {
            reminderUrlPatternInput.placeholder = isContainsMode ? 'e.g., mediaocean.com' : 'e.g., *://*.example.com/path*';
        }
        if (reminderUrlHelp) {
            reminderUrlHelp.textContent = isContainsMode
                ? 'Simple mode matches this text anywhere in the page URL. Paste a full URL and choose “Use site only” to match every page on that site.'
                : 'Advanced mode supports * as a wildcard. For example, *://*.example.com/path* matches that path and anything after it.';
        }
    }

    function updateModalUrlMatchHelp() {
        const isContainsMode = modalEditUrlMatchType.value === 'contains';
        modalEditUrlPatternLabel.textContent = isContainsMode ? 'URL text to match:' : 'URL wildcard pattern:';
        modalEditUrlPattern.placeholder = isContainsMode ? 'e.g., mediaocean.com' : 'e.g., *://*.example.com/path*';
    }

    const reminderMatchControl = initializeLocalSegmentedControl(
        reminderUrlMatchTypeSegmented,
        reminderUrlMatchType,
        'contains',
        updateUrlMatchHelp
    );
    const modalReminderMatchControl = initializeLocalSegmentedControl(
        modalEditUrlMatchTypeSegmented,
        modalEditUrlMatchType,
        'contains',
        updateModalUrlMatchHelp
    );

    function useSiteOnly(input, matchControl, onInvalid) {
        const rawValue = input.value.trim();
        if (!rawValue) return;
        try {
            const parsedUrl = new URL(/^https?:\/\//i.test(rawValue) ? rawValue : `https://${rawValue}`);
            input.value = parsedUrl.hostname;
            matchControl.setValue('contains');
        } catch (error) {
            onInvalid();
        }
    }

    function resetReminderForm() {
        if (reminderNameInput) reminderNameInput.value = '';
        reminderMatchControl.setValue('contains');
        if (reminderUrlPatternInput) reminderUrlPatternInput.value = 'mediaocean.com';
        const triggersContainer = document.getElementById('reminderTriggersContainer');
        if (triggersContainer) {
            triggersContainer.replaceChildren();
            renderTriggerInput();
        }
        const triggerLogicSelect = document.getElementById('reminderTriggerLogic');
        if (triggerLogicSelect) triggerLogicSelect.value = 'OR';
        if (reminderFormHeading) reminderFormHeading.textContent = 'Create Custom Reminder';
        if (nextButton) nextButton.textContent = 'Next';
    }

    function beginReminderEdit(reminder) {
        openReminderModal(true, reminder);
    }

    if (useReminderSiteOnlyButton) {
        useReminderSiteOnlyButton.addEventListener('click', () => {
            useSiteOnly(reminderUrlPatternInput, reminderMatchControl, () => {
                customReminderStatus.textContent = 'Enter a valid full URL before choosing “Use site only”.';
                customReminderStatus.style.color = 'red';
                customReminderStatus.classList.remove('hidden-initially');
            });
        });
    }
    if (modalUseReminderSiteOnly) {
        modalUseReminderSiteOnly.addEventListener('click', () => {
            useSiteOnly(modalEditUrlPattern, modalReminderMatchControl, () => {
                modalEditorSubtitle.textContent = 'Enter a valid full URL before choosing “Use site only”.';
            });
        });
    }
    if (modalAddTriggerBtn) {
        modalAddTriggerBtn.addEventListener('click', () => renderTriggerInput('', {
            containerId: 'modalReminderTriggersContainer',
            inputClass: 'modal-trigger-input'
        }));
    }

    function lockReminderModalBackground() {
        const documentWidth = document.documentElement.clientWidth;
        const scrollbarWidth = documentWidth > 0 ? Math.max(0, window.innerWidth - documentWidth) : 0;
        document.body.style.setProperty('--reminder-scrollbar-compensation', `${scrollbarWidth}px`);
        document.body.classList.add('reminder-modal-open');
    }

    function unlockReminderModalBackground() {
        document.body.classList.remove('reminder-modal-open');
        document.body.style.removeProperty('--reminder-scrollbar-compensation');
    }
 
    function openReminderModal(isEditMode = false, reminderDataForEdit = null) {
        previousReminderModalFocus = document.activeElement;
        reminderModalEditor.classList.remove('reminder-modal--closing');
        reminderModalOverlay.classList.remove('reminder-modal-overlay--closing');
        if (isEditMode && reminderDataForEdit) {
            editingReminderId = reminderDataForEdit.id;
            currentReminderData = {
                name: reminderDataForEdit.name,
                urlPattern: reminderDataForEdit.urlPattern,
                textTrigger: reminderDataForEdit.textTrigger,
                triggerLogic: reminderDataForEdit.triggerLogic
            };
            reminderModalEditor.classList.add('reminder-modal--editing');
            reminderModalOverlay.classList.add('reminder-modal-overlay--editing');
            modalEditorTitle.textContent = 'Edit Custom Reminder';
            modalEditorSubtitle.textContent = `Editing “${reminderDataForEdit.name}”. Update the matching rules and popup content below.`;
            modalReminderSummary.style.display = 'none';
            modalEditConditions.classList.remove('hidden-initially');
            modalEditReminderName.value = reminderDataForEdit.name;

            const urlState = getUrlEditorState(reminderDataForEdit.urlPattern);
            modalReminderMatchControl.setValue(urlState.matchType);
            modalEditUrlPattern.value = urlState.value;
            modalEditTriggerLogic.value = reminderDataForEdit.triggerLogic || 'OR';

            const container = document.getElementById('modalReminderTriggersContainer');
            if (container) {
                container.replaceChildren();
                const editTriggers = window.utils.normalizeTriggers(reminderDataForEdit.textTrigger);
                const triggersToRender = editTriggers.length > 0 ? editTriggers : [''];
                triggersToRender.forEach(trigger => renderTriggerInput(trigger, {
                    containerId: 'modalReminderTriggersContainer',
                    inputClass: 'modal-trigger-input'
                }));
            }

            const parser = new DOMParser();
            const doc = parser.parseFromString(reminderDataForEdit.popupMessage, 'text/html');
            const titleElem = doc.querySelector('h3');
            const introElem = doc.querySelector('p');
            const bulletsElems = doc.querySelectorAll('ul li');

            modalInputReminderTitle.value = titleElem ? titleElem.textContent : '';
            modalInputIntroSentence.value = introElem ? introElem.textContent : '';
            modalInputBulletPoints.value = Array.from(bulletsElems).map(li => `• ${li.textContent.trim()}`).join('\n');
        } else {
            editingReminderId = null;
            reminderModalEditor.classList.remove('reminder-modal--editing');
            reminderModalOverlay.classList.remove('reminder-modal-overlay--editing');
            modalEditorTitle.textContent = 'Create Custom Reminder';
            modalEditorSubtitle.textContent = 'Review the popup content before saving.';
            modalReminderSummary.style.display = 'block';
            modalEditConditions.classList.add('hidden-initially');
            modalReminderNameDisplay.textContent = currentReminderData.name || 'N/A';
            modalReminderUrlPatternDisplay.textContent = currentReminderData.urlPattern || 'N/A';

            const triggers = window.utils.normalizeTriggers(currentReminderData.textTrigger);
            modalReminderTextTriggerDisplay.textContent = triggers.length > 0 ? triggers.join(', ') : 'N/A';

            modalInputReminderTitle.value = `⚠️ ${currentReminderData.name} ⚠️`;
            modalInputIntroSentence.value = 'This is a reminder to...';
            modalInputBulletPoints.value = '• Step 1\n• Step 2\n• Step 3';
        }

        modalSaveButton.textContent = isEditMode ? 'Save Changes' : 'Save Reminder';
        if (reminderModalOverlay) reminderModalOverlay.style.display = 'block';
        if (reminderModalEditor) reminderModalEditor.style.display = 'block';
        lockReminderModalBackground();
        if (!isEditMode && createReminderInitialStepDiv) createReminderInitialStepDiv.style.display = 'none';
        (isEditMode ? modalEditReminderName : modalInputReminderTitle).focus();
    }

    function finishClosingReminderModal(wasEditing) {
        if (reminderModalOverlay) reminderModalOverlay.style.display = 'none';
        if (reminderModalEditor) reminderModalEditor.style.display = 'none';
        if (createReminderInitialStepDiv) createReminderInitialStepDiv.style.display = 'block';
        reminderModalEditor.classList.remove('reminder-modal--editing');
        reminderModalEditor.classList.remove('reminder-modal--closing');
        reminderModalOverlay.classList.remove('reminder-modal-overlay--editing');
        reminderModalOverlay.classList.remove('reminder-modal-overlay--closing');
        unlockReminderModalBackground();
        modalEditConditions.classList.add('hidden-initially');
        modalReminderSummary.style.display = 'block';
        modalEditorSubtitle.textContent = '';
        modalSaveButton.textContent = 'Save Reminder';

        if (modalInputReminderTitle) modalInputReminderTitle.value = '';
        if (modalInputIntroSentence) modalInputIntroSentence.value = '';
        if (modalInputBulletPoints) modalInputBulletPoints.value = '';
        if (modalReminderNameDisplay) modalReminderNameDisplay.textContent = '';
        if (modalReminderUrlPatternDisplay) modalReminderUrlPatternDisplay.textContent = '';
        if (modalReminderTextTriggerDisplay) modalReminderTextTriggerDisplay.textContent = '';

        currentReminderData = {};
        editingReminderId = null;
        if (!wasEditing) resetReminderForm();
        if (previousReminderModalFocus?.isConnected) previousReminderModalFocus.focus();
        previousReminderModalFocus = null;
    }

    function closeReminderModal() {
        if (reminderModalEditor.classList.contains('reminder-modal--closing')) return;

        const wasEditing = Boolean(editingReminderId);
        if (!wasEditing) {
            finishClosingReminderModal(false);
            return;
        }

        reminderModalEditor.classList.add('reminder-modal--closing');
        reminderModalOverlay.classList.add('reminder-modal-overlay--closing');
        setTimeout(() => finishClosingReminderModal(true), 200);
    }
 
    if (nextButton) { 
        nextButton.addEventListener('click', function() { 
            const name = reminderNameInput.value.trim(); 
            const urlValue = reminderUrlPatternInput.value.trim();
 
            if (!name || !urlValue) {
                const missingFields = [];
                if (!name) missingFields.push('Reminder Name');
                if (!urlValue) missingFields.push('URL match');
                customReminderStatus.textContent = `${missingFields.join(' and ')} ${missingFields.length === 1 ? 'is' : 'are'} required.`;
                customReminderStatus.style.color = 'red'; 
                customReminderStatus.classList.remove('hidden-initially'); 
                setTimeout(() => customReminderStatus.classList.add('hidden-initially'), 3000); 
                return; 
            } 
 
            // Gather triggers from dynamic inputs 
            const triggerInputs = document.querySelectorAll('.trigger-input'); 
            const textTrigger = Array.from(triggerInputs).map(i => i.value.trim()).filter(v => v !== ''); 
            const urlPattern = serializeUrlPattern(urlValue, reminderUrlMatchType.value);
 
            currentReminderData = { 
                name, 
                urlPattern, 
                textTrigger, // Array of strings 
                triggerLogic: document.getElementById('reminderTriggerLogic').value 
            }; 
            openReminderModal(false);
        }); 
    } 
 
    if (modalCloseButton) modalCloseButton.addEventListener('click', closeReminderModal); 
    if (modalCancelButton) modalCancelButton.addEventListener('click', closeReminderModal); 
    if (reminderModalOverlay) reminderModalOverlay.addEventListener('click', closeReminderModal);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && reminderModalEditor?.style.display === 'block') closeReminderModal();
    });
 
    if (modalSaveButton) { 
        modalSaveButton.addEventListener('click', function() { 
            let reminderName;
            let urlPattern;
            let textTrigger;
            let triggerLogic;

            if (editingReminderId) {
                reminderName = modalEditReminderName.value.trim();
                const urlValue = modalEditUrlPattern.value.trim();
                if (!reminderName || !urlValue) {
                    alert('Reminder Name and URL match are required.');
                    return;
                }
                urlPattern = serializeUrlPattern(urlValue, modalEditUrlMatchType.value);
                textTrigger = Array.from(document.querySelectorAll('#modalReminderTriggersContainer .modal-trigger-input'))
                    .map(input => input.value.trim())
                    .filter(Boolean);
                triggerLogic = modalEditTriggerLogic.value || 'OR';
            } else {
                reminderName = currentReminderData.name;
                urlPattern = currentReminderData.urlPattern;
                textTrigger = currentReminderData.textTrigger;
                triggerLogic = currentReminderData.triggerLogic || 'OR';
            }
 
            const title = modalInputReminderTitle.value.trim(); 
            const intro = modalInputIntroSentence.value.trim(); 
            const bulletsText = modalInputBulletPoints.value.trim(); 
 
            if (!title || !intro) { 
                alert('Reminder Title and Intro Sentence are required.'); 
                return; 
            } 
 
            let popupMessageHtml = `<h3>${escapeHTML(title)}</h3>`; 
            if (intro) popupMessageHtml += `<p>${escapeHTML(intro)}</p>`; 
            if (bulletsText) { 
                popupMessageHtml += '<ul>'; 
                bulletsText.split('\n').forEach(bullet => { 
                    let trimmedBullet = bullet.trim(); 
                    if (trimmedBullet) { 
                        if (trimmedBullet.startsWith('• ')) { // Remove leading bullet if user typed it 
                            trimmedBullet = trimmedBullet.substring(2); 
                        } 
                        popupMessageHtml += `<li>${escapeHTML(trimmedBullet)}</li>`; 
                    } 
                }); 
                popupMessageHtml += '</ul>'; 
            } 
 
            chrome.storage.sync.get({customReminders: []}, function(data) { 
                let reminders = data.customReminders; 
                let statusMessage = ''; 
 
                if (editingReminderId) { // EDIT MODE 
                    const reminderIndex = reminders.findIndex(r => r.id === editingReminderId); 
                    if (reminderIndex !== -1) { 
                        reminders[reminderIndex].name = reminderName; 
                        reminders[reminderIndex].urlPattern = urlPattern; 
                        reminders[reminderIndex].textTrigger = textTrigger; 
                        reminders[reminderIndex].triggerLogic = triggerLogic; 
                        reminders[reminderIndex].popupMessage = popupMessageHtml; 
                        // .enabled state is preserved as it's not editable here 
                        statusMessage = 'Custom reminder updated!'; 
                    } else { 
                        customReminderStatus.textContent = 'Error: Reminder not found for editing.'; 
                        customReminderStatus.style.color = 'red'; 
                        customReminderStatus.classList.remove('hidden-initially'); 
                        setTimeout(() => customReminderStatus.classList.add('hidden-initially'), 3000); 
                        return; 
                    } 
                } else { // CREATE NEW MODE 
                    const newReminder = { 
                        id: 'custom_' + Date.now(), 
                        name: reminderName, 
                        urlPattern: urlPattern, 
                        textTrigger: textTrigger, 
                        triggerLogic: triggerLogic, 
                        popupMessage: popupMessageHtml, 
                        enabled: true 
                    }; 
                    reminders.push(newReminder); 
                    statusMessage = 'Custom reminder saved!'; 
                } 
 
                chrome.storage.sync.set({customReminders: reminders}, function() { 
                    if (chrome.runtime.lastError) { 
                        customReminderStatus.textContent = 'Error saving: ' + chrome.runtime.lastError.message; 
                        customReminderStatus.style.color = 'red'; 
                    } else { 
                        customReminderStatus.textContent = statusMessage; 
                        customReminderStatus.style.color = 'green'; 
 
                    } 
                    customReminderStatus.classList.remove('hidden-initially'); 
                    setTimeout(() => customReminderStatus.classList.add('hidden-initially'), 3000); 
 
                    closeReminderModal(); 
                    displayCustomReminders(); 
                }); 
            }); 
        }); 
    } 
 
    function displayCustomReminders(initialReminders) {
        const renderReminders = (data) => {
            const reminders = data.customReminders; 
            if (!customRemindersListDiv) return; 
            customRemindersListDiv.textContent = ''; // Clear previous content safely 
 
            if (reminders.length === 0) { 
                const p = document.createElement('p'); 
                p.textContent = 'No custom reminders saved yet.'; 
                customRemindersListDiv.appendChild(p); 
                return; 
            } 
 
            const ul = document.createElement('ul'); 
            ul.style.listStyleType = 'none'; 
            ul.style.paddingLeft = '0'; 
 
            reminders.forEach(reminder => { 
                const li = document.createElement('li'); 
                li.style.padding = '10px'; 
                li.style.border = '1px solid #eee'; 
                li.style.marginBottom = '5px'; 
                li.style.borderRadius = '4px'; 
                li.style.display = 'flex'; 
                li.style.justifyContent = 'space-between'; 
                li.style.alignItems = 'center'; 
 
                const textDiv = document.createElement('div'); 
                textDiv.style.flexGrow = '1'; 
 
                const nameStrong = document.createElement('strong'); 
                nameStrong.textContent = 'Name:'; 
                textDiv.appendChild(nameStrong); 
                textDiv.appendChild(document.createTextNode(` ${reminder.name || 'N/A'}`)); 
                textDiv.appendChild(document.createElement('br')); 
 
                const urlStrong = document.createElement('strong'); 
                urlStrong.textContent = 'URL Pattern:'; 
                textDiv.appendChild(urlStrong); 
                textDiv.appendChild(document.createTextNode(` ${reminder.urlPattern}`)); 
                textDiv.appendChild(document.createElement('br')); 
 
                const triggerStrong = document.createElement('strong'); 
                triggerStrong.textContent = 'Trigger Text:'; 
                textDiv.appendChild(triggerStrong); 
 
                const normalizedTriggers = window.utils.normalizeTriggers(reminder.textTrigger); 
                if (normalizedTriggers.length > 0) { 
                    textDiv.appendChild(document.createTextNode(' ' + normalizedTriggers.join(', '))); 
                } else { 
                    const em = document.createElement('em'); 
                    em.textContent = ' N/A'; 
                    textDiv.appendChild(em); 
                } 
 
 
                const controlsDiv = document.createElement('div'); 
                controlsDiv.style.display = 'flex'; 
                controlsDiv.style.alignItems = 'center'; 
                controlsDiv.style.marginLeft = '10px'; 
 
                const toggleLabel = document.createElement('label'); 
                toggleLabel.className = 'toggle'; 
                const toggleInput = document.createElement('input'); 
                toggleInput.type = 'checkbox'; 
                toggleInput.checked = reminder.enabled; 
                toggleInput.dataset.reminderId = reminder.id; 
                const sliderSpan = document.createElement('span'); 
                sliderSpan.className = 'slider'; 
                toggleLabel.append(toggleInput, sliderSpan); 
 
                toggleInput.addEventListener('change', function() { 
                    const reminderIdToToggle = this.dataset.reminderId; 
                    const isEnabled = this.checked; 
                    chrome.storage.sync.get({customReminders: []}, (storageData) => { 
                        const updatedReminders = storageData.customReminders.map(r => { 
                            if (r.id === reminderIdToToggle) r.enabled = isEnabled; 
                            return r; 
                        }); 
                        chrome.storage.sync.set({customReminders: updatedReminders}, () => { 
                            if (chrome.runtime.lastError) console.error("Error updating reminder state:", chrome.runtime.lastError); 
                            else console.log('Reminder state updated for ID:', reminderIdToToggle, 'to', isEnabled); 
                        }); 
                    }); 
                }); 
 
                const testButton = document.createElement('button'); 
                testButton.textContent = 'Test'; 
                testButton.classList.add('settings-button', 'settings-button-test'); 
                testButton.style.marginLeft = '10px'; 
                testButton.addEventListener('click', () => showTestCustomReminderOnSettingsPage(reminder)); 
 
                const editButton = document.createElement('button'); 
                editButton.textContent = 'Edit'; 
                editButton.classList.add('settings-button', 'settings-button-edit'); // Added class 
                // editButton.style.backgroundColor = '#ffc107'; // Using class instead 
                editButton.style.marginLeft = '10px'; 
                editButton.addEventListener('click', () => { 
                    beginReminderEdit(reminder);
                }); 
 
                const deleteButton = document.createElement('button'); 
                deleteButton.textContent = 'Delete'; 
                deleteButton.className = 'settings-button'; 
                deleteButton.style.backgroundColor = '#dc3545'; 
                deleteButton.style.marginLeft = '10px'; 
                deleteButton.dataset.reminderId = reminder.id; 
                deleteButton.addEventListener('click', deleteCustomReminderById); 
 
                controlsDiv.append(toggleLabel, testButton, editButton, deleteButton); 
                li.append(textDiv, controlsDiv); 
                ul.appendChild(li); 
            }); 
            customRemindersListDiv.appendChild(ul); 
        };

        if (initialReminders !== undefined) {
            renderReminders({ customReminders: initialReminders });
            return;
        }
        chrome.storage.sync.get({customReminders: []}, renderReminders);
    } 
 
    function deleteCustomReminderById(event) { 
        const idToDelete = event.target.dataset.reminderId; 
        chrome.storage.sync.get({customReminders: []}, (data) => { 
            const reminders = data.customReminders.filter(r => r.id !== idToDelete); 
            chrome.storage.sync.set({customReminders: reminders}, () => { 
                if (chrome.runtime.lastError) console.error("Error deleting reminder:", chrome.runtime.lastError); 
                else console.log('Custom reminder deleted by ID:', idToDelete); 
                displayCustomReminders(); 
            }); 
        }); 
    } 
 
    displayCustomReminders(settings.customReminders); // Initial display from the batched settings read.
 
    // Export Settings 
    const generateExportDataButton = document.getElementById('generateExportData'); 
    const exportDataTextarea = document.getElementById('exportDataTextarea'); 
    if (generateExportDataButton && exportDataTextarea) { 
        generateExportDataButton.addEventListener('click', () => { 
            chrome.storage.sync.get({customReminders: []}, (data) => { 
                if (data.customReminders.length === 0) { 
                    exportDataTextarea.value = "No custom reminders to export."; 
                    return; 
                } 
                try { 
                    exportDataTextarea.value = JSON.stringify(data.customReminders, null, 2); 
                    exportDataTextarea.select(); 
                    alert("Custom reminder data generated. You can now copy it."); 
                } catch (error) { 
                    console.error("Error stringifying reminders for export:", error); 
                    exportDataTextarea.value = "Error generating export data."; 
                } 
            }); 
        }); 
    } 
 
    // Listener for external updates (e.g., from background script) 
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => { 
        if (request.action === "refreshCustomRemindersDisplay") { 
            displayCustomReminders(); 
            sendResponse({status: "Custom reminders display refreshed"}); 
            return true; 
        } 
    }); 
 
    // Display Build Info 
    if (window.buildInfo) { 
        const buildInfoDiv = document.getElementById('build-info'); 
        if (buildInfoDiv) { 
            buildInfoDiv.textContent = `Build Date: ${window.buildInfo.buildDate} | Commit: ${window.buildInfo.commitId}`; 
        } 
    } 
}); 
 
if (typeof module !== 'undefined' && module.exports) { 
    module.exports = { 
        escapeHTML,
        isMissingContentScriptReceiverError,
        SETTINGS_DEFAULTS,
        loadSettingsWithDefaults,
    }; 
}

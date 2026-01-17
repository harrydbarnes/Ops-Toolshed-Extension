// Prepend to settings.js or ensure it's within DOMContentLoaded

// Utility to escape HTML for display
function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
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
    const parser = new DOMParser();
    const doc = parser.parseFromString(reminder.popupMessage, 'text/html');
    Array.from(doc.body.childNodes).forEach(node => {
        popup.appendChild(node.cloneNode(true));
    });

    const closeButton = document.createElement('button');
    closeButton.id = 'custom-reminder-display-close';
    closeButton.className = 'settings-button';
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

// Helper function to set up a toggle switch
function setupToggle(toggleId, storageKey, logMessage) {
    const toggle = document.getElementById(toggleId);
    if (toggle) {
        chrome.storage.sync.get(storageKey, function(data) {
            toggle.checked = data[storageKey] === undefined ? true : data[storageKey];
            if (data[storageKey] === undefined) {
                chrome.storage.sync.set({ [storageKey]: true });
            }
        });
        toggle.addEventListener('change', function() {
            const isEnabled = this.checked;
            chrome.storage.sync.set({ [storageKey]: isEnabled }, () => {
                console.log(logMessage, isEnabled);
            });
        });
    }
}


document.addEventListener('DOMContentLoaded', function() {
    // Tab switching logic
    const tabContainer = document.querySelector('.tab-container');
    if (tabContainer) {
        tabContainer.addEventListener('click', function(event) {
            const clickedButton = event.target.closest('.tab-button');
            if (!clickedButton) return;

            const tabName = clickedButton.dataset.tab;

            // Deactivate all tabs and panels
            document.querySelectorAll('[role="tab"]').forEach(tab => {
                tab.classList.remove('active');
                tab.setAttribute('aria-selected', 'false');
                tab.setAttribute('tabindex', '-1');
            });
            document.querySelectorAll('[role="tabpanel"]').forEach(panel => {
                panel.classList.remove('active');
                panel.hidden = true;
            });

            // Activate the clicked tab and corresponding panel
            clickedButton.classList.add('active');
            clickedButton.setAttribute('aria-selected', 'true');
            clickedButton.removeAttribute('tabindex');

            const newActiveContent = document.getElementById(tabName);
            if (newActiveContent) {
                newActiveContent.classList.add('active');
                newActiveContent.hidden = false;
            }
            clickedButton.focus();
        });
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
    function initializeCustomDropdown(dropdownId, storageKey, defaultValue = 'pink') {
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
                const color = selectedOption.dataset.color;
                const text = selectedOption.textContent.trim();
                triggerText.textContent = text;
                triggerColor.style.backgroundColor = color;

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
            const storedValue = data[storageKey] || defaultValue;
            updateUI(storedValue);
        });

        // Toggle dropdown open/close on click
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleDropdown();
        });

        // Trigger Keyboard Events
        trigger.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                openDropdown();
            }
        });

        // Handle option selection
        options.forEach((option, index) => {
            const selectOption = () => {
                const value = option.dataset.value;
                updateUI(value);
                chrome.storage.sync.set({ [storageKey]: value }, () => {
                    console.log(`${storageKey} saved:`, value);
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

    // Initialize the two theme dropdowns
    initializeCustomDropdown('uiThemeDropdown', 'uiTheme', 'pink');
    initializeCustomDropdown('reminderThemeDropdown', 'reminderTheme', 'pink');

    const logoToggle = document.getElementById('logoToggle');
    if (logoToggle) {
        chrome.storage.sync.get('logoReplaceEnabled', function(data) {
            logoToggle.checked = data.logoReplaceEnabled === undefined ? true : data.logoReplaceEnabled;
            if (data.logoReplaceEnabled === undefined) chrome.storage.sync.set({logoReplaceEnabled: true});
        });
        logoToggle.addEventListener('change', function() {
            const isEnabled = this.checked;
            chrome.storage.sync.set({logoReplaceEnabled: isEnabled}, () => {
                console.log('Logo replacement setting saved:', isEnabled);
                chrome.tabs.query({url: ["*://*.mediaocean.com/*"]}, (tabs) => {
                    tabs.forEach(tab => {
                        if (tab.id) chrome.tabs.sendMessage(tab.id, { action: "checkLogoReplaceEnabled", enabled: isEnabled })
                            .catch(e => console.warn("Error sending logo toggle message to tab ID " + tab.id + ":", e.message));
                    });
                });
            });
        });
    }

    // Prisma Reminders
    const prismaReminderFrequency = document.getElementById('prismaReminderFrequency');
    const prismaCountdownDuration = document.getElementById('prismaCountdownDuration');

    // Load and save settings for Prisma Reminders
    if (prismaReminderFrequency && prismaCountdownDuration) {
        const settingsToGet = ['prismaReminderFrequency', 'prismaCountdownDuration'];
        chrome.storage.sync.get(settingsToGet, (data) => {
            prismaReminderFrequency.value = data.prismaReminderFrequency || 'daily';
            prismaCountdownDuration.value = data.prismaCountdownDuration || '5';
        });

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

    setupToggle('metaReminderToggle', 'metaReminderEnabled', 'Meta reminder setting saved:');
    setupToggle('iasReminderToggle', 'iasReminderEnabled', 'IAS reminder setting saved:');

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
    setupToggle('fontSizeToggle', 'fontSizeToggleEnabled', 'Font Size Toggle setting saved:');
    setupToggle('resizableChatToggle', 'resizableChatToggleEnabled', 'Resizable Chat setting saved:');
    setupToggle('scheduledChatToggle', 'scheduledChatToggleEnabled', 'Scheduled Chat setting saved:');

    // Campaign Management Settings
    setupToggle('addCampaignShortcutToggle', 'addCampaignShortcutEnabled', 'Add Campaign shortcut setting saved:');
    setupToggle('hidingSectionsToggle', 'hidingSectionsEnabled', 'Hiding Sections setting saved:');
    setupToggle('automateFormFieldsToggle', 'automateFormFieldsEnabled', 'Automate Form Fields setting saved:');
    setupToggle('countPlacementsSelectedToggle', 'countPlacementsSelectedEnabled', 'Count Placements Selected setting saved:');
    setupToggle('approverWidgetOptimiseToggle', 'approverWidgetOptimiseEnabled', 'Approver Widget Optimise setting saved:');
    setupToggle('swapAccountsToggle', 'swapAccountsEnabled', 'Switch Accounts setting saved:');
    setupToggle('seeCommentsOnLockedBuysToggle', 'alwaysShowCommentsEnabled', 'See Comments on Locked Buys setting saved:');
    setupToggle('orderIdCopyToggle', 'orderIdCopyEnabled', 'Order ID Copy setting saved:');

    // Aura Reminders (Timesheet)
    const timesheetReminderToggle = document.getElementById('timesheetReminderToggle');
    const timesheetReminderSettingsDiv = document.getElementById('timesheetReminderSettings');
    const reminderDaySelect = document.getElementById('reminderDay');
    const reminderTimeSelect = document.getElementById('reminderTime');
    const saveTimesheetReminderSettingsButton = document.getElementById('saveTimesheetReminderSettings');
    const timesheetReminderUpdateMessage = document.getElementById('timesheetReminderUpdateMessage');
    const triggerTimesheetReminderButton = document.getElementById('triggerTimesheetReminder');

    function updateTimesheetTimeOptions(day) {
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

        chrome.storage.sync.get('reminderTime', (data) => {
            if (data.reminderTime && Array.from(reminderTimeSelect.options).some(o => o.value === data.reminderTime)) {
                reminderTimeSelect.value = data.reminderTime;
            } else if (currentSelectedTime && Array.from(reminderTimeSelect.options).some(o => o.value === currentSelectedTime)) {
                reminderTimeSelect.value = currentSelectedTime;
            } else {
                const defaultTime = (day === 'Friday') ? "14:30" : "09:00";
                if (Array.from(reminderTimeSelect.options).some(o => o.value === defaultTime)) reminderTimeSelect.value = defaultTime;
                else if (reminderTimeSelect.options.length > 0) reminderTimeSelect.value = reminderTimeSelect.options[0].value;
            }
        });
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
        chrome.storage.sync.get(['timesheetReminderEnabled', 'reminderDay'], (data) => {
            timesheetReminderToggle.checked = data.timesheetReminderEnabled !== false;
            if (timesheetReminderSettingsDiv) timesheetReminderSettingsDiv.style.display = timesheetReminderToggle.checked ? 'block' : 'none';
            if (reminderDaySelect) reminderDaySelect.value = data.reminderDay || "Friday";
            updateTimesheetTimeOptions(reminderDaySelect ? reminderDaySelect.value : 'Friday');
        });

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
    const reminderNameInput = document.getElementById('reminderName');
    const reminderUrlPatternInput = document.getElementById('reminderUrlPattern');
    const reminderTextTriggerInput = document.getElementById('reminderTextTrigger');
    const nextButton = document.getElementById('nextButton');
    const customReminderStatus = document.getElementById('customReminderStatus');
    const customRemindersListDiv = document.getElementById('customRemindersList');

    // Modal elements
    const reminderModalOverlay = document.getElementById('reminderModalOverlay');
    const reminderModalEditor = document.getElementById('reminderModalEditor');
    const modalEditorTitle = document.getElementById('modalEditorTitle'); // h2 title of modal
    const modalCloseButton = document.getElementById('modalCloseButton'); // X button
    const modalReminderNameDisplay = document.getElementById('modalReminderNameDisplay');
    const modalReminderUrlPatternDisplay = document.getElementById('modalReminderUrlPatternDisplay');
    const modalReminderTextTriggerDisplay = document.getElementById('modalReminderTextTriggerDisplay');
    const modalInputReminderTitle = document.getElementById('modalInputReminderTitle');
    const modalInputIntroSentence = document.getElementById('modalInputIntroSentence');
    const modalInputBulletPoints = document.getElementById('modalInputBulletPoints');
    const modalSaveButton = document.getElementById('modalSaveButton');
    const modalCancelButton = document.getElementById('modalCancelButton');

    let currentReminderData = {}; // Holds data for modal (name, url, textTrigger)
    let editingReminderId = null; // Used to distinguish between create and edit

    function openReminderModal(isEditMode = false, reminderDataForEdit = null) {
        if (isEditMode && reminderDataForEdit) {
            editingReminderId = reminderDataForEdit.id;
            currentReminderData = { // Store the non-popupMessage parts
                name: reminderDataForEdit.name,
                urlPattern: reminderDataForEdit.urlPattern,
                textTrigger: reminderDataForEdit.textTrigger
            };
            modalEditorTitle.textContent = 'Edit Custom Reminder';
            modalReminderNameDisplay.textContent = reminderDataForEdit.name;
            modalReminderUrlPatternDisplay.textContent = reminderDataForEdit.urlPattern;
            modalReminderTextTriggerDisplay.textContent = reminderDataForEdit.textTrigger || 'N/A';

            // Parse reminderDataForEdit.popupMessage to fill modal inputs
            const parser = new DOMParser();
            const doc = parser.parseFromString(reminderDataForEdit.popupMessage, 'text/html');
            const titleElem = doc.querySelector('h3');
            const introElem = doc.querySelector('p');
            const bulletsElems = doc.querySelectorAll('ul li');

            modalInputReminderTitle.value = titleElem ? titleElem.textContent : '';
            modalInputIntroSentence.value = introElem ? introElem.textContent : '';
            modalInputBulletPoints.value = Array.from(bulletsElems).map(li => `• ${li.textContent.trim()}`).join('\n');

        } else { // This is for creating a new reminder
            editingReminderId = null;
            // currentReminderData should have been set by the "Next" button logic
            modalEditorTitle.textContent = 'Create Custom Reminder';
            modalReminderNameDisplay.textContent = currentReminderData.name || 'N/A';
            modalReminderUrlPatternDisplay.textContent = currentReminderData.urlPattern || 'N/A';
            modalReminderTextTriggerDisplay.textContent = currentReminderData.textTrigger || 'N/A';

            // Pre-fill with defaults for new reminder
            modalInputReminderTitle.value = "⚠️ Reminder Title ⚠️";
            modalInputIntroSentence.value = "This is a reminder to...";
            modalInputBulletPoints.value = "• Step 1\n• Step 2\n• Step 3";
        }

        if (reminderModalOverlay) reminderModalOverlay.style.display = 'block';
        if (reminderModalEditor) reminderModalEditor.style.display = 'block';
        if (createReminderInitialStepDiv) createReminderInitialStepDiv.style.display = 'none'; // Hide step 1
    }

    function closeReminderModal() {
        if (reminderModalOverlay) reminderModalOverlay.style.display = 'none';
        if (reminderModalEditor) reminderModalEditor.style.display = 'none';
        if (createReminderInitialStepDiv) createReminderInitialStepDiv.style.display = 'block'; // Show step 1

        // Clear modal form fields
        if(modalInputReminderTitle) modalInputReminderTitle.value = '';
        if(modalInputIntroSentence) modalInputIntroSentence.value = '';
        if(modalInputBulletPoints) modalInputBulletPoints.value = '';
        // Reset display fields in modal
        if(modalReminderNameDisplay) modalReminderNameDisplay.textContent = '';
        if(modalReminderUrlPatternDisplay) modalReminderUrlPatternDisplay.textContent = '';
        if(modalReminderTextTriggerDisplay) modalReminderTextTriggerDisplay.textContent = '';

        currentReminderData = {}; // Clear intermediate data
        editingReminderId = null; // Reset editing state
    }

    if (nextButton) {
        nextButton.addEventListener('click', function() {
            const name = reminderNameInput.value.trim();
            const urlPattern = reminderUrlPatternInput.value.trim();

            if (!name || !urlPattern) {
                customReminderStatus.textContent = 'Reminder Name and URL Pattern are required.';
                customReminderStatus.style.color = 'red';
                customReminderStatus.classList.remove('hidden-initially');
                setTimeout(() => customReminderStatus.classList.add('hidden-initially'), 3000);
                return;
            }

            currentReminderData = {
                name,
                urlPattern,
                textTrigger: reminderTextTriggerInput.value.trim()
            };
            // editingReminderId = null; // This is set in openReminderModal
            openReminderModal(false); // Open for new reminder
        });
    }

    if (modalCloseButton) modalCloseButton.addEventListener('click', closeReminderModal);
    if (modalCancelButton) modalCancelButton.addEventListener('click', closeReminderModal);

    if (modalSaveButton) {
        modalSaveButton.addEventListener('click', function() {
            // These are from currentReminderData, set when modal was opened (for new or edit)
            const reminderName = currentReminderData.name;
            const urlPattern = currentReminderData.urlPattern;
            const textTrigger = currentReminderData.textTrigger;

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

                        if (!editingReminderId) { // Clear initial step inputs only for new reminders
                           if(reminderNameInput) reminderNameInput.value = '';
                           if(reminderUrlPatternInput) reminderUrlPatternInput.value = '';
                           if(reminderTextTriggerInput) reminderTextTriggerInput.value = '';
                        }
                    }
                    customReminderStatus.classList.remove('hidden-initially');
                    setTimeout(() => customReminderStatus.classList.add('hidden-initially'), 3000);

                    closeReminderModal();
                    displayCustomReminders();
                    chrome.runtime.sendMessage({ action: "customRemindersUpdated" }).catch(e => console.warn("Error sending customRemindersUpdated message:", e.message));
                });
            });
        });
    }

    function displayCustomReminders() {
        chrome.storage.sync.get({customReminders: []}, (data) => {
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
                if (reminder.textTrigger) {
                    textDiv.appendChild(document.createTextNode(` ${reminder.textTrigger}`));
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
                            chrome.runtime.sendMessage({ action: "customRemindersUpdated" }).catch(e => console.warn("Error sending update message:", e.message));
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
                    openReminderModal(true, reminder); // Pass true for isEditMode and the reminder object
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
        });
    }

    function deleteCustomReminderById(event) {
        const idToDelete = event.target.dataset.reminderId;
        chrome.storage.sync.get({customReminders: []}, (data) => {
            const reminders = data.customReminders.filter(r => r.id !== idToDelete);
            chrome.storage.sync.set({customReminders: reminders}, () => {
                if (chrome.runtime.lastError) console.error("Error deleting reminder:", chrome.runtime.lastError);
                else console.log('Custom reminder deleted by ID:', idToDelete);
                displayCustomReminders();
                chrome.runtime.sendMessage({ action: "customRemindersUpdated" }).catch(e => console.warn("Error sending update message:", e.message));
            });
        });
    }

    displayCustomReminders(); // Initial display

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
    };
}

(function() {
    'use strict';

    // State variables specific to the reminder feature
    let metaReminderDismissed = false;
    let iasReminderDismissed = false;
    let metaCheckInProgress = false;
    let activeCustomReminders = [];
    let shownCustomReminderIds = new Set();

    // Cached settings
    let metaReminderEnabled = true;
    let iasReminderEnabled = true;
    let prismaReminderFrequency = 'daily';
    let prismaCountdownDuration = 0;
    // Reminder Theme State
    let reminderTheme = 'pink';

    // Initialize settings
    if (chrome.runtime && chrome.runtime.id) {
        chrome.storage.sync.get(['metaReminderEnabled', 'iasReminderEnabled', 'prismaReminderFrequency', 'prismaCountdownDuration', 'customReminders', 'reminderTheme'], (settings) => {
            if (chrome.runtime.lastError) {
                console.error('Error retrieving reminder settings:', chrome.runtime.lastError);
                return;
            }
            metaReminderEnabled = settings.metaReminderEnabled !== false;
            iasReminderEnabled = settings.iasReminderEnabled !== false;
            prismaReminderFrequency = settings.prismaReminderFrequency || 'daily';
            prismaCountdownDuration = parseInt(settings.prismaCountdownDuration, 10) || 0;
            reminderTheme = settings.reminderTheme || 'pink';

            // Apply theme class
            if (reminderTheme === 'black') {
                document.body.classList.add('reminder-theme-black');
            } else {
                document.body.classList.remove('reminder-theme-black');
            }

            if (settings.customReminders) {
                activeCustomReminders = settings.customReminders.filter(r => r.enabled);
            }
        });

        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace !== 'sync') return;

            if (changes.metaReminderEnabled) metaReminderEnabled = changes.metaReminderEnabled.newValue !== false;
            if (changes.iasReminderEnabled) iasReminderEnabled = changes.iasReminderEnabled.newValue !== false;
            if (changes.prismaReminderFrequency) prismaReminderFrequency = changes.prismaReminderFrequency.newValue || 'daily';
            if (changes.prismaCountdownDuration) prismaCountdownDuration = parseInt(changes.prismaCountdownDuration.newValue, 10) || 0;
            if (changes.customReminders) {
                const newReminders = changes.customReminders.newValue || [];
                activeCustomReminders = newReminders.filter(r => r.enabled);
            }
            // Listen for theme changes
            if (changes.reminderTheme) {
                reminderTheme = changes.reminderTheme.newValue || 'pink';
                if (reminderTheme === 'black') {
                    document.body.classList.add('reminder-theme-black');
                } else {
                    document.body.classList.remove('reminder-theme-black');
                }
            }
        });
    }

    function shouldShowReminder(storageKey, frequency, callback) {
        chrome.storage.local.get([storageKey], (data) => {
            const lastShownTimestamp = data[storageKey];
            if (!lastShownTimestamp) {
                callback(true);
                return;
            }

            const now = new Date();
            const lastShown = new Date(lastShownTimestamp);
            let show = false;

            switch (frequency) {
                case 'daily':
                    if (now.toDateString() !== lastShown.toDateString()) show = true;
                    break;
                case 'weekly':
                    const oneWeek = 7 * 24 * 60 * 60 * 1000;
                    if (now.getTime() - lastShown.getTime() > oneWeek) show = true;
                    break;
                case 'monthly':
                    if (now.getMonth() !== lastShown.getMonth() || now.getFullYear() !== lastShown.getFullYear()) show = true;
                    break;
                case 'once':
                    show = false;
                    break;
                default:
                    if (now.toDateString() !== lastShown.toDateString()) show = true;
                    break;
            }
            callback(show);
        });
    }

    function setReminderShown(storageKey) {
        chrome.storage.local.set({ [storageKey]: Date.now() });
    }

    function createPrismaReminderPopup({ popupId, content, countdownSeconds, storageKey }) {
        if (document.getElementById(popupId)) return;

        const overlay = document.createElement('div');
        overlay.className = 'reminder-overlay';
        overlay.id = `${popupId}-overlay`;
        document.body.appendChild(overlay);

        const popup = document.createElement('div');
        popup.id = popupId;

        popup.innerHTML = `
            <h3>${window.utils.escapeHTML(content.title)}</h3>
            <p>${window.utils.escapeHTML(content.message)}</p>
            <ul>
                ${content.list.map(item => `<li>${window.utils.escapeHTML(item)}</li>`).join('')}
            </ul>
            <button id="${popupId}-close" class="reminder-close-button">Got it!</button>
        `;
        document.body.appendChild(popup);
        console.log(`[ContentScript Prisma] ${content.title} popup CREATED.`);

        const closeButton = document.getElementById(`${popupId}-close`);

        let countdownInterval;
        const cleanupPopup = () => {
            popup.remove();
            overlay.remove();
            clearInterval(countdownInterval);
            setReminderShown(storageKey);
            if (popupId === 'meta-reminder-popup') {
                metaReminderDismissed = true;
                metaCheckInProgress = false;
            }
            if (popupId === 'ias-reminder-popup') iasReminderDismissed = true;
        };

        if (countdownSeconds > 0) {
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

    function checkForMetaConditions() {
        if (metaReminderDismissed || metaCheckInProgress) return;
        const currentUrl = window.location.href;
        if (!currentUrl.includes('groupmuk-prisma.mediaocean.com/') || !currentUrl.includes('actualize')) return;

        // Use cached settings
        if (!metaReminderEnabled) return;

        shouldShowReminder('metaReminderLastShown', prismaReminderFrequency, (show) => {
            if (!show) return;
            metaCheckInProgress = true;
            let attempts = 0;
            const maxAttempts = 15;
            const intervalId = setInterval(() => {
                const pageText = document.body.textContent || "";
                const conditionsMet = pageText.includes('000770') && pageText.includes('Redistribute all');
                if (conditionsMet) {
                    clearInterval(intervalId);
                    if (!document.getElementById('meta-reminder-popup')) {
                        createPrismaReminderPopup({
                            popupId: 'meta-reminder-popup',
                            content: {
                                title: '⚠️ Meta Reconciliation Reminder ⚠️',
                                message: 'When reconciling Meta, please:',
                                list: ["Actualise to the 'Supplier' option", "Self-accept the IO", "Push through on trafficking tab to Meta", "Verify success of the push, every time", "Do not just leave the page!"]
                            },
                            countdownSeconds: prismaCountdownDuration,
                            storageKey: 'metaReminderLastShown'
                        });
                    }
                } else if (attempts >= maxAttempts) {
                    clearInterval(intervalId);
                    metaCheckInProgress = false;
                }
                attempts++;
            }, 2000);
        });
    }

    function checkForIASConditions() {
        if (iasReminderDismissed) return;

        // Use cached settings
        if (!iasReminderEnabled) return;

        const pageText = document.body.innerText;
        if (pageText.includes('001148') && pageText.includes('Flat') && pageText.includes('Unit type')) {
            shouldShowReminder('iasReminderLastShown', prismaReminderFrequency, (show) => {
                if (show && !document.getElementById('ias-reminder-popup')) {
                    createPrismaReminderPopup({
                        popupId: 'ias-reminder-popup',
                        content: {
                            title: '⚠️ IAS Booking Reminder ⚠️',
                            message: 'Please ensure you book as CPM',
                            list: ['With correct rate for media type', 'Check the plan', 'Ensure what is planned is what goes live']
                        },
                        countdownSeconds: prismaCountdownDuration,
                        storageKey: 'iasReminderLastShown'
                    });
                }
            });
        }
    }

    function fetchCustomReminders() {
        return new Promise((resolve) => {
            if (!chrome.runtime || !chrome.runtime.id) {
                activeCustomReminders = [];
                resolve();
                return;
            }
            chrome.storage.sync.get({customReminders: []}, function(data) {
                if (chrome.runtime.lastError) {
                    activeCustomReminders = [];
                } else {
                    activeCustomReminders = data.customReminders.filter(r => r.enabled);
                }
                resolve();
            });
        });
    }

    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function wildcardToRegex(pattern) {
        let escapedPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
        if (!pattern.includes('*')) {
            escapedPattern = '.*' + escapedPattern + '.*';
        } else {
            escapedPattern = escapedPattern.replace(/\*/g, '.*');
        }
        return new RegExp('^' + escapedPattern + '$', 'i');
    }

    function createCustomReminderPopup(reminder) {
        if (document.getElementById('custom-reminder-display-popup')) return;

        const overlay = document.createElement('div');
        overlay.className = 'reminder-overlay';
        overlay.id = 'custom-reminder-overlay-' + reminder.id;
        document.body.appendChild(overlay);

        const popup = document.createElement('div');
        popup.id = 'custom-reminder-display-popup';

        popup.innerHTML = `
            <h3>${window.utils.escapeHTML(reminder.name)}</h3>
            ${reminder.popupMessage}
            <button id="custom-reminder-display-close">Got it!</button>
        `;
        document.body.appendChild(popup);

        const closeButton = document.getElementById('custom-reminder-display-close');
        closeButton.addEventListener('click', () => {
            popup.remove();
            overlay.remove();
        });
    }

    function checkCustomReminders() {
        if (activeCustomReminders.length === 0) return;
        if (document.getElementById('custom-reminder-display-popup')) return;

        const currentUrl = window.location.href;
        const pageText = document.body.innerText; // Keep original case for display, but regex will be case-insensitive

        for (const reminder of activeCustomReminders) {
            if (shownCustomReminderIds.has(reminder.id)) continue;

            const urlRegex = wildcardToRegex(reminder.urlPattern);
            if (urlRegex.test(currentUrl)) {
                let textMatch = true;

                // Normalize Data: Handle legacy string or new Array
                let triggers = reminder.textTrigger;
                if (typeof triggers === 'string') {
                    triggers = triggers.split(',').map(t => t.trim()).filter(Boolean);
                } else if (!Array.isArray(triggers)) {
                    triggers = [];
                } else {
                    triggers = triggers.filter(Boolean);
                }

                if (triggers.length > 0) {
                    const logic = (reminder.triggerLogic || 'OR').toUpperCase();

                    const checkTrigger = (trigger) => {
                         try {
                             // Whole word matching (\b), case insensitive (i)
                             const regex = new RegExp('\\b' + escapeRegExp(trigger) + '\\b', 'i');
                             return regex.test(pageText);
                         } catch (e) {
                             console.warn('[Reminders] Invalid regex for trigger:', trigger, e);
                             return false;
                         }
                     };

                    if (logic === 'ALL') {
                        textMatch = triggers.every(checkTrigger);
                    } else {
                        // OR
                        textMatch = triggers.some(checkTrigger);
                    }
                } else {
                    // Empty State: If no text triggers, treat as URL-only match (Issue 3)
                    textMatch = true;
                }

                if (textMatch) {
                    createCustomReminderPopup(reminder);
                    shownCustomReminderIds.add(reminder.id);
                    break;
                }
            }
        }
    }

    function resetReminderDismissalFlags() {
        metaReminderDismissed = false;
        iasReminderDismissed = false;
        shownCustomReminderIds.clear();
    }

    function forceShowMetaReminder() {
        metaReminderDismissed = false;
        metaCheckInProgress = false;
        checkForMetaConditions();
    }

    // Expose public functions
    window.remindersFeature = {
        checkForMetaConditions,
        checkForIASConditions,
        fetchCustomReminders,
        checkCustomReminders,
        resetReminderDismissalFlags,
        forceShowMetaReminder,

        // Expose for message listener
        getShownCustomReminderIds: () => shownCustomReminderIds
    };
})();

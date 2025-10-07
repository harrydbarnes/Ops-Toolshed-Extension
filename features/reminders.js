(function() {
    'use strict';

    // State variables specific to the reminder feature
    let metaReminderDismissed = false;
    let iasReminderDismissed = false;
    let metaCheckInProgress = false;
    let activeCustomReminders = [];
    let shownCustomReminderIds = new Set();

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
        if (!chrome.runtime || !chrome.runtime.id) return;

        chrome.storage.sync.get(['metaReminderEnabled', 'prismaReminderFrequency', 'prismaCountdownDuration'], (settings) => {
            if (chrome.runtime.lastError || settings.metaReminderEnabled === false) return;

            const frequency = settings.prismaReminderFrequency || 'daily';
            shouldShowReminder('metaReminderLastShown', frequency, (show) => {
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
                                countdownSeconds: parseInt(settings.prismaCountdownDuration, 10) || 0,
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
        });
    }

    function checkForIASConditions() {
        if (iasReminderDismissed) return;
        if (!chrome.runtime || !chrome.runtime.id) return;

        chrome.storage.sync.get(['iasReminderEnabled', 'prismaReminderFrequency', 'prismaCountdownDuration'], (settings) => {
            if (chrome.runtime.lastError || settings.iasReminderEnabled === false) return;

            const pageText = document.body.innerText;
            if (pageText.includes('001148') && pageText.includes('Flat') && pageText.includes('Unit type')) {
                const frequency = settings.prismaReminderFrequency || 'daily';
                shouldShowReminder('iasReminderLastShown', frequency, (show) => {
                    if (show && !document.getElementById('ias-reminder-popup')) {
                        createPrismaReminderPopup({
                            popupId: 'ias-reminder-popup',
                            content: {
                                title: '⚠️ IAS Booking Reminder ⚠️',
                                message: 'Please ensure you book as CPM',
                                list: ['With correct rate for media type', 'Check the plan', 'Ensure what is planned is what goes live']
                            },
                            countdownSeconds: parseInt(settings.prismaCountdownDuration, 10) || 0,
                            storageKey: 'iasReminderLastShown'
                        });
                    }
                });
            }
        });
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
        const pageText = document.body.innerText.toLowerCase();

        for (const reminder of activeCustomReminders) {
            if (shownCustomReminderIds.has(reminder.id)) continue;

            const urlRegex = wildcardToRegex(reminder.urlPattern);
            if (urlRegex.test(currentUrl)) {
                let textMatch = true;
                if (reminder.textTrigger && reminder.textTrigger.trim() !== '') {
                    const triggerTexts = reminder.textTrigger.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
                    textMatch = triggerTexts.length > 0 && triggerTexts.some(text => pageText.includes(text));
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
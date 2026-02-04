(function() {
    'use strict';

    const FACTS = [
        "The average person spends 6 months of their life waiting in queues.",
        "The longest traffic jam in history lasted 12 days in Beijing (2010).",
        "The word 'queue' comes from the Latin 'cauda', meaning 'tail'.",
        "Occupied time feels shorter than unoccupied time—that's why mirrors are by elevators.",
        "Disney deliberately snakes their queues to make them look shorter.",
        "The longest ever sausage roll was 111ft long... quite a queue of pastry.",
        "A 'ji-gong' is a professional line waiter you can hire in China.",
        "The average person spends 2 days a year waiting at traffic lights.",
        "The 'wait' for the first photo ever taken was 8 hours (1826).",
        "Studies show waiting for a website to load raises your heart pressure.",
        "The Eiffel Tower has one of the longest average wait times: over 2 hours.",
        "You are currently part of the elite club of people waiting for this specific page."
    ];

    const DEBOUNCE_DELAY_MS = 200;
    const ANIMATION_DURATION_MS = 500;

    class LoadingFactsFeature {
        constructor() {
            this.toastId = 'ops-toolshed-loading-toast';
            this.isVisible = false;
            this.debounceTimer = null;
            this.isEnabled = true; // Default to enabled

            // State for managing async settings load
            this.settingsLoaded = false;

            // Listen for changes
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === 'sync' && changes.loadingFactsEnabled) {
                    this.isEnabled = changes.loadingFactsEnabled.newValue !== false;
                    // If disabled while visible, hide immediately
                    if (!this.isEnabled && this.isVisible) {
                        this.hideToast();
                    }
                }
            });
        }

        initialize() {
            chrome.storage.sync.get('loadingFactsEnabled', (data) => {
                this.isEnabled = data.loadingFactsEnabled !== false;
                this.settingsLoaded = true;
                // Initial check in case the page loaded with a spinner
                this.checkForLoading();
            });
        }

        checkForLoading() {
            // Debounce the check to prevent flickering if the spinner pulses
            if (this.debounceTimer) clearTimeout(this.debounceTimer);

            this.debounceTimer = setTimeout(() => {
                // Don't run until settings are loaded
                if (!this.settingsLoaded) {
                    return;
                }

                // If feature is disabled, ensure toast is hidden and return
                if (!this.isEnabled) {
                    if (this.isVisible) this.hideToast();
                    return;
                }

                // MATCHING STATS-COLLECTOR LOGIC:
                // We use the util to pierce Shadow DOM for 'svg.spinner'
                // OR check for the standard font-awesome spinner.
                const spinner = window.utils.queryShadowDom('svg.spinner') || document.querySelector('i.fa-spin');

                const isLoading = !!spinner;

                if (isLoading && !this.isVisible) {
                    this.showToast();
                } else if (!isLoading && this.isVisible) {
                    this.hideToast();
                }
            }, DEBOUNCE_DELAY_MS);
        }

        getRandomFact() {
            const index = Math.floor(Math.random() * FACTS.length);
            return FACTS[index];
        }

        showToast() {
            if (document.getElementById(this.toastId)) return;

            this.isVisible = true;
            const fact = this.getRandomFact();

            const toast = document.createElement('div');
            toast.id = this.toastId;
            toast.className = 'loading-fact-toast slide-up';

            // Create inner content structure
            const iconDiv = document.createElement('div');
            iconDiv.className = 'loading-fact-icon';
            iconDiv.textContent = '⏳';
            toast.appendChild(iconDiv);

            const contentDiv = document.createElement('div');
            contentDiv.className = 'loading-fact-content';

            const strong = document.createElement('strong');
            strong.textContent = 'Did you know?';
            contentDiv.appendChild(strong);

            const span = document.createElement('span');
            span.innerHTML = window.utils.escapeHTML(fact);
            contentDiv.appendChild(span);

            toast.appendChild(contentDiv);

            document.body.appendChild(toast);
        }

        hideToast() {
            const toast = document.getElementById(this.toastId);
            if (!toast) {
                this.isVisible = false;
                return;
            }

            // Replace slide-up class with slide-down for exit animation
            toast.classList.remove('slide-up');
            toast.classList.add('slide-down');

            // Wait for animation to finish before removing
            setTimeout(() => {
                if (toast && toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
                this.isVisible = false;
            }, ANIMATION_DURATION_MS); // Match CSS animation duration
        }
    }

    // Expose the feature globally
    window.loadingFactsFeature = new LoadingFactsFeature();
})();

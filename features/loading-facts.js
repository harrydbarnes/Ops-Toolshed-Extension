(function() {
    'use strict';

    const FACTS = [
        "The average person spends 6 months of their life waiting in queues",
        "The longest traffic jam in history lasted 12 days in Beijing (2010)",
        "The word 'queue' comes from the Latin 'cauda', meaning 'tail'",
        "Occupied time feels shorter than unoccupied time - that's why mirrors are by elevators",
        "Disney deliberately snakes their queues to make them look shorter",
        "The longest ever sausage roll was 111ft long... quite a queue of pastry",
        "A 'ji-gong' is a professional line waiter you can hire in China",
        "The average person spends 2 days a year waiting at traffic lights",
        "The 'wait' for the first photo ever taken was 8 hours (1826)",
        "The Eiffel Tower has one of the longest average wait times: over 2 hours",
        "You are currently part of the elite club of people waiting for this specific page",
        "The coding for Prisma references the Yes/No field for Actualisation as 'Ok to Pay'",
        "The first computer bug was an actual real-life moth found in a relay",
        "The first computer mouse was made of wood",
        "Technically, the loading spinner is known as a 'throbber' in UI design",
        "Domain names were free until 1995",
        "Once upon a time, someone in Ops during their first week was caught chain smoking outside whilst 15 minutes late for work",
        "In total, you have seen this spinning wheel for {{TIME}}. Share this with Harry to help speed up Prisma!"
    ];

    // Pre-calculate non-time facts for fallback optimization
    const NON_TIME_FACTS = FACTS.filter(f => !f.includes('{{TIME}}'));

    const DEBOUNCE_DELAY_MS = 200;
    const ANIMATION_DURATION_MS = 500;

    // Helper to promisify chrome.storage.local.get
    const getStorageData = keys => new Promise(resolve => chrome.storage.local.get(keys, resolve));

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

        async initialize() {
            // Use promise wrapper or direct promise if available (using simple wrap here for consistency)
            const getSyncData = keys => new Promise(resolve => chrome.storage.sync.get(keys, resolve));
            const data = await getSyncData('loadingFactsEnabled');

            this.isEnabled = data.loadingFactsEnabled !== false;
            this.settingsLoaded = true;
            // Initial check in case the page loaded with a spinner
            this.checkForLoading();
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
                // Prioritize mo-spinner (tag or class), then Shadow DOM 'svg.spinner', then standard FA spinner.
                const spinner = document.querySelector('mo-spinner') ||
                                document.querySelector('.mo-spinner') ||
                                window.utils.queryShadowDom('svg.spinner') ||
                                document.querySelector('i.fa-spin');

                const isLoading = !!spinner;

                if (isLoading && !this.isVisible) {
                    this.showToast(spinner);
                } else if (!isLoading && this.isVisible) {
                    // Check if the spinner we used is actually gone
                    // (Here we rely on isLoading being false if no spinner is found)
                    this.hideToast();
                }
            }, DEBOUNCE_DELAY_MS);
        }

        getRandomFact() {
            const index = Math.floor(Math.random() * FACTS.length);
            return FACTS[index];
        }

        formatTime(seconds) {
            if (!seconds) return '0s';
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = Math.floor(seconds % 60);

            const parts = [];
            if (h > 0) parts.push(`${h}h`);
            if (m > 0) parts.push(`${m}m`);
            if (s > 0 || parts.length === 0) parts.push(`${s}s`);

            return parts.join(' ');
        }

        async getProcessedFact() {
            // Use a bounded loop to prevent infinite execution
            for (let i = 0; i < FACTS.length * 2; i++) {
                const fact = this.getRandomFact();

                if (fact.includes('{{TIME}}')) {
                    const data = await getStorageData(['prismaUserStats']);
                    const time = data.prismaUserStats ? data.prismaUserStats.totalLoadingTime : 0;

                    if (time > 0) {
                        const timeStr = this.formatTime(time);
                        return fact.replace('{{TIME}}', timeStr);
                    }
                    // If time is 0, continue loop to get another fact.
                } else {
                    return fact; // Return non-special fact immediately.
                }
            }

            // Fallback: use pre-calculated non-time facts
            if (NON_TIME_FACTS.length > 0) {
                return NON_TIME_FACTS[Math.floor(Math.random() * NON_TIME_FACTS.length)];
            }

            return "Loading..."; // Ultimate fallback
        }

        async showToast(spinner) {
            if (document.getElementById(this.toastId)) return;
            if (!spinner) return;

            this.isVisible = true;
            const fact = await this.getProcessedFact();

            // Revert Wrapper Logic: Do NOT wrap the spinner.
            // Use sibling injection with absolute positioning.

            // Smart Target Logic: Find the visual center of the spinner
            let targetElement = spinner;
            // If the spinner container is wide, look for the actual graphic
            if (spinner.offsetWidth > 100) {
                const innerSvg = spinner.querySelector('svg') || window.utils.queryShadowDom('svg', spinner.shadowRoot);
                if (innerSvg) targetElement = innerSvg;
            }

            const updatePosition = () => {
                const rect = targetElement.getBoundingClientRect();
                const centerX = rect.left + (rect.width / 2);
                const toastEl = document.getElementById(this.toastId);
                if (toastEl) {
                    toastEl.style.left = `${centerX}px`;
                }
            };

            const toast = document.createElement('div');
            toast.id = this.toastId;
            toast.className = 'loading-fact-toast slide-up';

            // Initial positioning
            // We need to append first or use the calculated value immediately?
            // The logic below appends at the end. We can calculate now.
            const rect = targetElement.getBoundingClientRect();
            const centerX = rect.left + (rect.width / 2);
            toast.style.left = `${centerX}px`;

            // Add resize listener to track window changes
            this.resizeHandler = () => requestAnimationFrame(updatePosition);
            window.addEventListener('resize', this.resizeHandler);

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
            span.textContent = fact;
            contentDiv.appendChild(span);

            toast.appendChild(contentDiv);

            // Append to document.body to ensure it floats above all other content
            document.body.appendChild(toast);
        }

        hideToast() {
            const toast = document.getElementById(this.toastId);
            if (!toast) {
                this.isVisible = false;
                return;
            }

            // Cleanup resize listener
            if (this.resizeHandler) {
                window.removeEventListener('resize', this.resizeHandler);
                this.resizeHandler = null;
            }

            // Replace slide-up class with slide-down for exit animation
            toast.classList.remove('slide-up');
            toast.classList.add('slide-down');

            // Wait for animation to finish before removing
            setTimeout(() => {
                // Simply remove the toast element
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

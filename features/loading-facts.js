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

    const getStorageData = (area, keys) => new Promise(resolve => chrome.storage[area].get(keys, resolve));

    class LoadingFactsFeature {
        constructor() {
            this.toastId = 'ops-toolshed-loading-toast';
            this.isVisible = false;
            this.debounceTimer = null;
            this.isEnabled = true; // Default to enabled
            this.isIntersecting = false; // Track viewport visibility
            this.observedSpinner = null;
            this.pendingShow = false;
            this.requestId = 0;

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
            const data = await getStorageData('sync', 'loadingFactsEnabled');

            this.isEnabled = data.loadingFactsEnabled !== false;
            this.settingsLoaded = true;

            // MutationObserver removed as per optimization request (content.js handles it)

            // IntersectionObserver for visibility tracking
            this.intersectionObserver = new IntersectionObserver((entries) => {
                const entry = entries.find(item => item.target === this.observedSpinner);
                if (!entry) return;

                this.isIntersecting = entry.isIntersecting;
                if (this.isIntersecting && this.isElementVisible(this.observedSpinner)) {
                    this.showToast(this.observedSpinner);
                } else {
                    this.hideToast();
                }
            }, { threshold: 0.1 }); // Trigger when at least 10% visible

            // Initial check in case the page loaded with a spinner
            this.checkForLoading();
        }

        isElementVisible(element) {
            return window.utils.isElementVisible(element);
        }

        checkForLoading() {
            // Debounce the check to prevent flickering
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

                const spinner = window.utils.findVisibleLoadingSpinners()[0] || null;

                // Strict Visibility Check
                // We check if it exists AND is visually perceptible
                // NOTE: 'isIntersecting' is updated asynchronously by the observer callback.
                // We must attach the observer first to get updates.
                const domVisible = spinner && this.isElementVisible(spinner);

                if (domVisible) {
                    if (spinner !== this.observedSpinner) {
                        this.intersectionObserver.disconnect();
                        this.observedSpinner = spinner;
                        this.isIntersecting = false;
                        this.hideToast();
                        this.intersectionObserver.observe(spinner);
                    } else if (this.isIntersecting) {
                        this.showToast(spinner);
                    }
                } else {
                    this.intersectionObserver.disconnect();
                    this.observedSpinner = null;
                    this.isIntersecting = false;
                    this.hideToast();
                }
            }, DEBOUNCE_DELAY_MS);
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
            const data = await getStorageData('local', ['legacyStats', 'dailyStats', 'prismaUserStats']);
            const historicTime = data.legacyStats?.totalLoadingTime ??
                data.prismaUserStats?.totalLoadingTime ??
                0;
            const dailyTime = Object.values(data.dailyStats || {}).reduce(
                (total, stats) => total + (Number(stats?.loadingTime) || 0),
                0
            );
            const time = historicTime + dailyTime;

            // If time is available (>0), we can pick from ALL facts (including {{TIME}} ones).
            // If time is 0, we must restrict selection to NON_TIME_FACTS only.
            const factPool = (time > 0) ? FACTS : NON_TIME_FACTS;

            if (factPool.length > 0) {
                const fact = factPool[Math.floor(Math.random() * factPool.length)];

                // If we picked a time-based fact, format and replace the placeholder
                if (fact.includes('{{TIME}}')) {
                    const timeStr = this.formatTime(time);
                    return fact.replace('{{TIME}}', timeStr);
                }
                return fact;
            }

            return "Loading..."; // Ultimate fallback
        }

        async showToast(spinner) {
            if (document.getElementById(this.toastId) || this.pendingShow || !spinner) return;

            this.pendingShow = true;
            const requestId = ++this.requestId;
            const fact = await this.getProcessedFact();
            this.pendingShow = false;

            if (requestId !== this.requestId ||
                !this.isEnabled ||
                !this.isIntersecting ||
                spinner !== this.observedSpinner ||
                !spinner.isConnected ||
                !this.isElementVisible(spinner) ||
                document.getElementById(this.toastId)) {
                return;
            }

            // Revert Wrapper Logic: Do NOT wrap the spinner.
            // Use sibling injection with absolute positioning.

            // Smart Target Logic: Find the visual center of the spinner
            let targetElement = spinner;
            // If the spinner container is wide, look for the actual graphic
            if (spinner.offsetWidth > 100) {
                const innerSvg = spinner.querySelector('svg') ||
                    (spinner.shadowRoot ? window.utils.queryShadowDom('svg', spinner.shadowRoot) : null);
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
            this.isVisible = true;
        }

        hideToast() {
            this.requestId += 1;
            this.pendingShow = false;
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

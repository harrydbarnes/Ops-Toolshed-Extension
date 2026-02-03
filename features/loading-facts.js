(function() {
    'use strict';

    class LoadingFactsFeature {
        constructor() {
            this.facts = [
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

            // TODO: Verify the specific class name of the Prisma loading wheel.
            // Common Prisma/ExtJS loading classes are listed below.
            this.loadingSelectors = [
                '.x-mask-msg',
                '.x-mask-loading',
                '.loading-spinner',
                '.spinner',
                '[data-ref="loadMask"]'
            ];

            this.toastId = 'ops-toolshed-loading-toast';
            this.isVisible = false;
            this.debounceTimer = null;
        }

        initialize() {
            // Initial check in case the page loaded with a spinner
            this.checkForLoading();
        }

        checkForLoading() {
            // Debounce the check to prevent flickering if the spinner pulses
            if (this.debounceTimer) clearTimeout(this.debounceTimer);

            this.debounceTimer = setTimeout(() => {
                const isLoading = this.loadingSelectors.some(selector => document.querySelector(selector));

                if (isLoading && !this.isVisible) {
                    this.showToast();
                } else if (!isLoading && this.isVisible) {
                    this.hideToast();
                }
            }, 200);
        }

        getRandomFact() {
            const index = Math.floor(Math.random() * this.facts.length);
            return this.facts[index];
        }

        showToast() {
            if (document.getElementById(this.toastId)) return;

            this.isVisible = true;
            const fact = this.getRandomFact();

            const toast = document.createElement('div');
            toast.id = this.toastId;
            toast.className = 'loading-fact-toast slide-up';

            // Create inner content structure
            toast.innerHTML = `
                <div class="loading-fact-icon">⏳</div>
                <div class="loading-fact-content">
                    <strong>Did you know?</strong>
                    <span>${window.utils.escapeHTML(fact)}</span>
                </div>
            `;

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
            }, 500); // Match CSS animation duration
        }
    }

    // Expose the feature globally
    window.loadingFactsFeature = new LoadingFactsFeature();
})();

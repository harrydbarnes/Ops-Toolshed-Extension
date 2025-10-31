// features/placement-counter.js

(function() {
    let toastTimeout;
    let currentToast = null;
    const SETTING_KEY = 'countPlacementsSelectedEnabled';

    // --- Toast Logic (No Change) ---

    function showToast(message) {
        if (currentToast) {
            document.body.removeChild(currentToast);
        }

        currentToast = document.createElement('div');
        currentToast.className = 'placement-toast show'; // Immediately show
        currentToast.textContent = message;
        document.body.appendChild(currentToast);

        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            if (currentToast) {
                currentToast.classList.remove('show');
                // Use a short delay for animation before removing from DOM
                setTimeout(() => {
                    if (currentToast && currentToast.parentElement) {
                        document.body.removeChild(currentToast);
                    }
                    currentToast = null;
                }, 300);
            }
        }, 3000);
    }

    function hideToast() {
        if (currentToast) {
            currentToast.classList.remove('show');
            setTimeout(() => {
                if (currentToast && currentToast.parentElement) {
                    document.body.removeChild(currentToast);
                }
                currentToast = null;
            }, 300);
        }
    }

    // --- Core Logic with Runtime Setting Check (FIXED) ---

    function countSelectedPlacements() {
        // 1. Check the user's setting in real-time
        chrome.storage.sync.get(SETTING_KEY, (data) => {
            // Exit immediately if the feature is disabled
            if (!data[SETTING_KEY]) {
                hideToast();
                return;
            }

            // 2. Find the grid and selected boxes
            // This selector is fine because the relevant elements are in the light DOM,
            // not inside a shadow root.
            const gridContainer = document.querySelector('#grid-container_hot');
            if (!gridContainer) {
                 hideToast();
                 return;
            }

            // This query efficiently finds all checked checkboxes inside the grid.
            const selectedCheckboxes = gridContainer.querySelectorAll('input.mo-row-checkbox[type="checkbox"]:checked');
            const count = selectedCheckboxes.length;

            // 3. Display the toast
            if (count > 0) {
                const message = `${count} Placement${count > 1 ? 's' : ''} Selected`;
                showToast(message);
            } else {
                hideToast();
            }
        });
    }

    function initializePlacementCounter() {
        // Add basic styling for the toast once
        const styleId = 'placement-counter-style';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            // The style code for .placement-toast is the same as before
            style.textContent = `
                .placement-toast {
                    position: fixed;
                    bottom: 20px;
                    left: 20px;
                    background-color: #333;
                    color: white;
                    padding: 10px 20px;
                    border-radius: 5px;
                    z-index: 2147444444;
                    font-family: 'Outfit', sans-serif;
                    font-size: 14px;
                    font-weight: 500;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    opacity: 0;
                    transform: translateY(20px);
                    transition: opacity 0.3s ease, transform 0.3s ease;
                    visibility: hidden;
                }

                .placement-toast.show {
                    opacity: 1;
                    transform: translateY(0);
                    visibility: visible;
                }
            `;
            document.head.appendChild(style);
        }

        // Attach the listener once, unconditionally.
        // It checks the setting inside the event handler (see above).
        document.body.addEventListener('change', (event) => {
            // Check if the event target is the desired checkbox class
            if (event.target.classList.contains('mo-row-checkbox')) {
                // Check if the checkbox is inside the main placement grid container
                const isInsideTargetGrid = event.target.closest('#grid-container_hot');
                if (isInsideTargetGrid) {
                    countSelectedPlacements();
                }
            }
        }, { once: false });
    }

    // Expose the interface to be managed by content.js
    window.placementCounterFeature = {
        initialize: initializePlacementCounter
    };
})();
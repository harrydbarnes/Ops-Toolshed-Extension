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
        currentToast.className = 'placement-toast show';
        currentToast.textContent = message;
        document.body.appendChild(currentToast);

        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            if (currentToast) {
                currentToast.classList.remove('show');
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

    // --- Core Logic for Counting and Displaying ---

    function checkSelectionAndDisplay() {
        // Since this function is called from the MutationObserver loop,
        // we must check the setting inside the function on every call.
        chrome.storage.sync.get(SETTING_KEY, (data) => {
            if (!data[SETTING_KEY]) {
                hideToast();
                return;
            }

            // Target the grid container directly for counting
            const gridContainer = document.querySelector('#grid-container_hot');
            if (!gridContainer) {
                 hideToast();
                 return;
            }

            // Query only checked checkboxes within the grid
            const selectedCheckboxes = gridContainer.querySelectorAll('input.mo-row-checkbox[type="checkbox"]:checked');
            const count = selectedCheckboxes.length;

            if (count > 0) {
                const message = `${count} Placement${count > 1 ? 's' : ''} Selected`;
                showToast(message);
            } else {
                hideToast();
            }
        });
    }

    function initializePlacementCounter() {
        // --- Inject Styles (Guard against duplicates) ---
        const styleId = 'placement-counter-style';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                .placement-toast {
                    position: fixed;
                    bottom: 20px;
                    left: 20px;
                    background-color: #333;
                    color: white;
                    padding: 10px 20px;
                    border-radius: 5px;
                    z-index: 2147483647;
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

        // We keep the native listener as a fallback, but rely mostly on the MutationObserver
        document.body.addEventListener('change', (event) => {
            if (event.target.classList.contains('mo-row-checkbox') && event.target.closest('#grid-container_hot')) {
                // Manually trigger the check when a change event *does* bubble up
                window.placementCounterFeature.checkSelection();
            }
        }, { once: false });

        // Initial check on load
        checkSelectionAndDisplay();
    }

    // Expose two functions: initialize (for initial setup) and checkSelection (for MutationObserver)
    window.placementCounterFeature = {
        initialize: initializePlacementCounter,
        checkSelection: checkSelectionAndDisplay
    };
})();
// features/placement-counter.js

(function() {
    let toastTimeout;
    let currentToast = null;
    const SETTING_KEY = 'countPlacementsSelectedEnabled';

    // --- Toast Logic (Animation Updated) ---

    function showToast(message) {
        // If a toast is already showing, remove it immediately to prevent overlap
        if (currentToast && currentToast.parentElement) {
            document.body.removeChild(currentToast);
        }
        clearTimeout(toastTimeout);

        currentToast = document.createElement('div');
        currentToast.className = 'placement-toast show';
        currentToast.textContent = message;
        document.body.appendChild(currentToast);

        // Set a timeout to hide the toast after 3 seconds
        toastTimeout = setTimeout(hideToast, 3000);
    }

    function hideToast() {
        if (currentToast) {
            currentToast.classList.remove('show');
            currentToast.classList.add('hide'); // Trigger the hide animation

            // Remove the element from the DOM after the animation completes (500ms)
            setTimeout(() => {
                if (currentToast && currentToast.parentElement) {
                    document.body.removeChild(currentToast);
                }
                currentToast = null;
            }, 500);
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
        // --- Inject Styles (Guard against duplicates and add animation) ---
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
                    visibility: hidden;
                    opacity: 0;
                }
                .placement-toast.show {
                    visibility: visible;
                    animation: slide-in-up 0.5s forwards;
                }
                .placement-toast.hide {
                    visibility: visible; /* Keep visible during hide animation */
                    animation: slide-out-left 0.5s forwards;
                }
                @keyframes slide-in-up {
                    from {
                        transform: translateY(100px);
                        opacity: 0;
                    }
                    to {
                        transform: translateY(0);
                        opacity: 1;
                    }
                }
                @keyframes slide-out-left {
                    from {
                        transform: translateX(0);
                        opacity: 1;
                    }
                    to {
                        transform: translateX(-100%);
                        opacity: 0;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        // Initial check on load
        checkSelectionAndDisplay();
    }

    // Expose two functions: initialize (for initial setup) and checkSelection (for MutationObserver)
    window.placementCounterFeature = {
        initialize: initializePlacementCounter,
        checkSelection: checkSelectionAndDisplay
    };
})();
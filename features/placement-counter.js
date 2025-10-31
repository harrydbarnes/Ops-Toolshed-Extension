// features/placement-counter.js

(function() {
    let toastTimeout;
    let currentToast = null;
    let debounceTimeout = null; // Timeout for debouncing the check
    const SETTING_KEY = 'countPlacementsSelectedEnabled';

    // --- Toast Logic (Animation Updated) ---

    function showToast(message) {
        if (currentToast && currentToast.parentElement) {
            document.body.removeChild(currentToast);
        }
        clearTimeout(toastTimeout);

        currentToast = document.createElement('div');
        currentToast.className = 'placement-toast show';
        currentToast.textContent = message;
        document.body.appendChild(currentToast);

        toastTimeout = setTimeout(hideToast, 3000);
    }

    function hideToast() {
        if (currentToast) {
            currentToast.classList.remove('show');
            currentToast.classList.add('hide');

            setTimeout(() => {
                if (currentToast && currentToast.parentElement) {
                    document.body.removeChild(currentToast);
                }
                currentToast = null;
            }, 500);
        }
    }

    // --- Core Logic with Debounce and Safety Check ---

    function checkSelectionAndDisplay() {
        // Clear the previous timeout to debounce the function
        clearTimeout(debounceTimeout);

        // Set a new timeout
        debounceTimeout = setTimeout(() => {
            // Check the setting inside the debounced function
            chrome.storage.sync.get(SETTING_KEY, (data) => {
                // Defensive check to prevent errors if storage fails or data is malformed
                if (!data || !data.hasOwnProperty(SETTING_KEY)) {
                    hideToast();
                    return;
                }

                if (!data[SETTING_KEY]) {
                    hideToast();
                    return;
                }

                const gridContainer = document.querySelector('#grid-container_hot');
                if (!gridContainer) {
                    hideToast();
                    return;
                }

                const selectedCheckboxes = gridContainer.querySelectorAll('input.mo-row-checkbox[type="checkbox"]:checked');
                const count = selectedCheckboxes.length;

                if (count > 0) {
                    const message = `${count} Placement${count > 1 ? 's' : ''} Selected`;
                    showToast(message);
                } else {
                    hideToast();
                }
            });
        }, 150); // Debounce for 150ms to wait for UI to settle
    }

    function initializePlacementCounter() {
        const styleId = 'placement-counter-style';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                /* ... [previous CSS styles remain unchanged] ... */
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
                    visibility: visible;
                    animation: slide-out-left 0.5s forwards;
                }
                @keyframes slide-in-up {
                    from { transform: translateY(100px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                @keyframes slide-out-left {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(-100%); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }

        checkSelectionAndDisplay();
    }

    window.placementCounterFeature = {
        initialize: initializePlacementCounter,
        checkSelection: checkSelectionAndDisplay
    };
})();
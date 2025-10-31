// features/placement-counter.js

(function() {
    let toastTimeout;
    let currentToast = null; // This will hold the DOM element
    let debounceTimeout = null;
    const SETTING_KEY = 'countPlacementsSelectedEnabled';

    // --- Toast Logic (Refactored to Update In-Place) ---

    function showToast(message) {
        clearTimeout(toastTimeout);

        // If the toast element doesn't exist, create it and animate it in.
        if (!currentToast) {
            currentToast = document.createElement('div');
            currentToast.className = 'placement-toast';
            document.body.appendChild(currentToast);
            // Add 'show' after a brief delay to ensure the animation plays
            setTimeout(() => {
                if(currentToast) currentToast.classList.add('show');
            }, 10);
        }

        // ALWAYS update the text content.
        currentToast.textContent = message;

        // Set a new timeout to hide the toast.
        toastTimeout = setTimeout(hideToast, 3000);
    }

    function hideToast() {
        if (currentToast) {
            currentToast.classList.remove('show');
            currentToast.classList.add('hide');

            // Set the element to null AFTER the animation is complete
            setTimeout(() => {
                if (currentToast && currentToast.parentElement) {
                    document.body.removeChild(currentToast);
                }
                currentToast = null;
            }, 500); // Corresponds to animation duration
        }
    }

    // --- Core Logic with Debounce ---

    function checkSelectionAndDisplay() {
        clearTimeout(debounceTimeout);

        debounceTimeout = setTimeout(() => {
            chrome.storage.sync.get(SETTING_KEY, (data) => {
                if (!data || !data.hasOwnProperty(SETTING_KEY)) {
                    hideToast(); // Hide if setting is missing
                    return;
                }

                if (!data[SETTING_KEY]) {
                    hideToast(); // Hide if feature is disabled
                    return;
                }

                const gridContainer = document.querySelector('#grid-container_hot');
                if (!gridContainer) {
                    hideToast(); // Hide if the grid is not on the page
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
        }, 150);
    }

    function initializePlacementCounter() {
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
                    transform: translateY(20px); /* Start off-screen */
                    transition: visibility 0s 0.5s, opacity 0.5s ease, transform 0.5s ease;
                }
                .placement-toast.show {
                    visibility: visible;
                    opacity: 1;
                    transform: translateY(0);
                    transition-delay: 0s;
                }
                .placement-toast.hide {
                    /* The hide animation is now handled by the transition */
                    opacity: 0;
                    transform: translateX(-100%);
                    transition: visibility 0s 0.5s, opacity 0.5s ease, transform 0.5s ease;
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
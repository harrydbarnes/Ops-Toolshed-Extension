// features/placement-counter.js

(function() {
    let toastTimeout;
    let currentToast = null;
    let debounceTimeout = null;
    const SETTING_KEY = 'countPlacementsSelectedEnabled';

    // --- Toast Logic (ShowToast and HideToast functions remain unchanged) ---

    function showToast(message) {
        clearTimeout(toastTimeout);
        if (!currentToast) {
            currentToast = document.createElement('div');
            currentToast.className = 'placement-toast';
            document.body.appendChild(currentToast);
            setTimeout(() => {
                if(currentToast) currentToast.classList.add('show');
            }, 10);
        }
        currentToast.textContent = message;
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

    // --- Core Logic with Debounce ---

    function checkSelectionAndDisplay() {
        clearTimeout(debounceTimeout);

        debounceTimeout = setTimeout(() => {
            chrome.storage.sync.get(SETTING_KEY, (data) => {
                if (!data || !data.hasOwnProperty(SETTING_KEY) || !data[SETTING_KEY]) {
                    hideToast();
                    return;
                }

                const gridContainer = document.querySelector('#grid-container_hot');
                if (!gridContainer) {
                    hideToast();
                    return;
                }

                const selectedCheckboxes = gridContainer.querySelectorAll('input.mo-row-checkbox[type="checkbox"]:checked');

                // Use a Set for de-duplication (fixes the double-counting issue).
                const validPlacementRows = new Set();

                Array.from(selectedCheckboxes).forEach(checkbox => {
                    const row = checkbox.closest('tr');
                    if (!row) return;

                    // Skip if we've already processed this row (due to duplicate internal checkboxes).
                    if (validPlacementRows.has(row)) return;

                    // The core identifying element is in the name column (aria-colindex="4" or data-col="3").
                    // We need to check the row for the elements that identify exclusions.

                    // Check for the Campaign Header (Level 0)
                    const isLevel0 = row.querySelector('.hierarchical-level-0');

                    // Check for the Package icon/class
                    const isPackage = row.querySelector('.mi-package');

                    // A row is a valid, countable item (Placement, Fee) if it is NOT the Campaign Header (Level 0)
                    // AND it is NOT an explicit Package (has the package icon).
                    const isValidCountableItem = !isLevel0 && !isPackage;

                    if (isValidCountableItem) {
                        validPlacementRows.add(row);
                    }
                });

                const count = validPlacementRows.size; // Count the number of unique valid rows

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
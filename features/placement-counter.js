// features/placement-counter.js

(function() {
    let toastTimeout;
    let currentToast = null;
    let debounceTimeout = null;
    const SETTING_KEY = 'countPlacementsSelectedEnabled';

    // Define the list of text snippets that, if found in the placement name, should exclude the item.
    // The dynamic supplier name "amazon (gbp" has been removed, as the structural checks below
    // already correctly exclude those rows marked as headers (Level 0).
    const EXCLUSION_TEXTS = [
        "display", // User requested exclusion
        "media total" // User requested exclusion
    ];

    // --- Toast Logic (Functions showToast and hideToast remain unchanged) ---
    // ... [ShowToast and HideToast functions omitted for brevity] ...
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

                // Use a Set to store UNIQUE ROW IDs (data-row value) to fix double counting.
                const countableRowIds = new Set();

                selectedCheckboxes.forEach(checkbox => {
                    const row = checkbox.closest('tr');
                    if (!row) return;

                    // 1. Get the unique ID from the checkbox itself for de-duplication.
                    const rowId = checkbox.dataset.row;
                    if (!rowId || countableRowIds.has(rowId)) return;

                    // 2. Identify the placement name cell for content checks.
                    // We target the column that holds the row ID in its ID, e.g., id="placementName-37"
                    const nameCell = row.querySelector(`#placementName-${rowId}`);
                    const nameText = (nameCell ? nameCell.textContent : '').toLowerCase();

                    // --- Exclusion Logic ---

                    // A. Check for Campaign/Category/Supplier Headers (Level 0) - RELIABLE structural check
                    const isLevel0 = row.querySelector('.hierarchical-level-0');

                    // B. Check for Packages (mi-package icon) - RELIABLE structural check
                    const isPackage = row.querySelector('.mi-package');

                    // C. Check for explicit remaining text exclusions (case-insensitive)
                    const isTextExcluded = EXCLUSION_TEXTS.some(exclusion => nameText.includes(exclusion));

                    // Final Decision: Count if NOT an excluded type
                    // The dynamic supplier line is excluded here by the isLevel0 check
                    const isCountable = !isLevel0 && !isPackage && !isTextExcluded;

                    if (isCountable) {
                        countableRowIds.add(rowId);
                    }
                });

                const count = countableRowIds.size; // Count the number of unique valid row IDs

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
                    transform: translateX(-110%); /* Start off-screen to the left */
                    transition: visibility 0s 0.5s, opacity 0.5s ease, transform 0.5s ease;
                }
                .placement-toast.show {
                    visibility: visible;
                    opacity: 1;
                    transform: translateX(0); /* Slide into view from left */
                    transition-delay: 0s;
                }
                .placement-toast.hide {
                    opacity: 0;
                    transform: translateX(-110%); /* Slide out to the left */
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
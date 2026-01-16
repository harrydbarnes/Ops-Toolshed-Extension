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
            currentToast.classList.remove('show'); // Animation is triggered by removing 'show'
            setTimeout(() => {
                if (currentToast && currentToast.parentElement) {
                    document.body.removeChild(currentToast);
                }
                currentToast = null;
            }, 500); // Wait for the transition to finish (500ms)
        }
    }


    // --- Core Logic with Debounce ---

    function checkSelectionAndDisplay() {
        clearTimeout(debounceTimeout);

        debounceTimeout = setTimeout(() => {
            // Before making an async call, check if the context is still valid.
            if (!chrome.runtime || !chrome.runtime.id) {
                // If the extension context is invalidated (e.g., during a page reload),
                // chrome.runtime will be undefined or its id will be gone.
                // Silently skipping the check is the correct behavior here.
                return;
            }

            chrome.storage.sync.get(SETTING_KEY, (data) => {
                if (chrome.runtime.lastError) {
                    // This will catch cases where the context becomes invalid *during* the async call.
                    // The warning is kept here as it's a slightly different race condition.
                    console.warn("Placement counter: Extension context invalidated during async operation. Skipping check.");
                    return;
                }

                // If the setting is disabled, hide any existing toast and exit.
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
                const countableRowIds = new Set();

                selectedCheckboxes.forEach(checkbox => {
                    const row = checkbox.closest('tr');
                    if (!row) return;

                    const rowId = checkbox.dataset.row;
                    if (!rowId || countableRowIds.has(rowId)) return;

                    const nameCell = row.querySelector(`#placementName-${rowId}`);
                    const nameText = (nameCell ? nameCell.textContent : '').toLowerCase();

                    const isLevel0 = row.querySelector('.hierarchical-level-0');
                    const isPackage = row.querySelector('.mi-package');
                    const isTextExcluded = EXCLUSION_TEXTS.some(exclusion => nameText.includes(exclusion));

                    const isCountable = !isLevel0 && !isPackage && !isTextExcluded;
                    if (isCountable) {
                        countableRowIds.add(rowId);
                    }
                });

                const count = countableRowIds.size;
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
                    background-color: #ff3d80; /* Default Pink */
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
                    transform: translateY(100%); /* Start off-screen */
                    transition: visibility 0s 0.5s, opacity 0.5s ease, transform 0.5s ease;
                }
                /* Theme Override */
                body.ui-theme-black .placement-toast {
                    background-color: #333;
                }
                .placement-toast.show {
                    visibility: visible;
                    opacity: 1;
                    transform: translateY(0);
                    transition-delay: 0s;
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
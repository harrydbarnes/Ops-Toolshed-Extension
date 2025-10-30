// features/placement-counter.js

(function() {
    let toastTimeout;
    let currentToast = null;

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

    function countSelectedPlacements() {
        // Query the document directly, as the checkboxes are inputs
        const selectedCheckboxes = document.querySelectorAll('input.mo-row-checkbox[type="checkbox"]:checked');
        const count = selectedCheckboxes.length;

        if (count > 0) {
            const message = `${count} Placement${count > 1 ? 's' : ''} Selected`;
            showToast(message);
        } else {
            hideToast();
        }
    }

    function initPlacementCounter() {
        chrome.storage.sync.get('countPlacementsSelectedEnabled', (data) => {
            if (data.countPlacementsSelectedEnabled) {
                // FIX: Attach listener to the document body for robust delegation
                // and check if the originating element is a target checkbox within the correct grid.
                document.body.addEventListener('change', (event) => {
                    // 1. Check if the target is the correct checkbox class
                    if (event.target.classList.contains('mo-row-checkbox')) {
                        // 2. Check if the checkbox is inside the main placement grid
                        const isInsideTargetGrid = event.target.closest('#grid-container_hot');
                        if (isInsideTargetGrid) {
                            countSelectedPlacements();
                        }
                    }
                });
            }
        });
    }

    // Add some basic styling for the toast
    const style = document.createElement('style');
    style.textContent = `
        .placement-toast {
            position: fixed;
            bottom: 20px;
            left: 20px;
            background-color: #333;
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            z-index: 9999;
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

    initPlacementCounter();
})();

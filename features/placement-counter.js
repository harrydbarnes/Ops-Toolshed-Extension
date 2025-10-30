// features/placement-counter.js

(function() {
    let toastTimeout;
    let currentToast = null;

    function showToast(message) {
        if (currentToast) {
            document.body.removeChild(currentToast);
        }

        currentToast = document.createElement('div');
        currentToast.className = 'placement-toast';
        currentToast.textContent = message;
        document.body.appendChild(currentToast);

        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            if (currentToast) {
                document.body.removeChild(currentToast);
                currentToast = null;
            }
        }, 3000);
    }

    function hideToast() {
        if (currentToast) {
            document.body.removeChild(currentToast);
            currentToast = null;
        }
    }

    function countSelectedPlacements() {
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
                const gridContainer = document.getElementById('grid-container_hot');
                if (gridContainer) {
                    gridContainer.addEventListener('change', (event) => {
                        if (event.target.classList.contains('mo-row-checkbox')) {
                            countSelectedPlacements();
                        }
                    });
                }
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

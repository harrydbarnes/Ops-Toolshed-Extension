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

    function countSelectedPlacements() {
        const selectedCheckboxes = document.querySelectorAll('input.mo-row-checkbox[type="checkbox"]:checked');
        const count = selectedCheckboxes.length;

        if (count > 0) {
            const message = `${count} Placement${count > 1 ? 's' : ''} Selected`;
            showToast(message);
        } else {
            if (currentToast) {
                document.body.removeChild(currentToast);
                currentToast = null;
            }
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
            right: 20px;
            background-color: #333;
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            z-index: 9999;
        }
    `;
    document.head.appendChild(style);

    initPlacementCounter();
})();

document.addEventListener('DOMContentLoaded', () => {
    const tabContainer = document.querySelector('.tab-container');
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const resetButton = document.getElementById('reset-stats-button');
    const statsTabButton = document.querySelector('.tab-button[data-tab="stats"]');

    // --- Tab Switching Logic ---
    if (tabContainer) {
        tabContainer.addEventListener('click', (e) => {
            const clickedButton = e.target.closest('.tab-button');
            if (!clickedButton) return;

            const tabId = clickedButton.dataset.tab;
            const targetContent = document.getElementById(tabId);

            tabButtons.forEach(button => button.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            clickedButton.classList.add('active');
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    }

    // --- Stats Display Logic ---
    function formatLoadingTime(totalSeconds) {
        if (totalSeconds < 60) {
            return `${totalSeconds.toFixed(2)}s`;
        } else {
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            return `${minutes} min and ${seconds.toFixed(2)}s`;
        }
    }

    function displayStats() {
        chrome.storage.local.get(['prismaUserStats', 'installDate'], (data) => {
            const stats = data.prismaUserStats || {
                visitedCampaigns: [],
                totalLoadingTime: 0,
                placementsAdded: 0
            };

            const campaignsVisitedEl = document.getElementById('campaigns-visited-stat');
            const loadingTimeEl = document.getElementById('loading-time-stat');
            const placementsAddedEl = document.getElementById('placements-added-stat');

            if (campaignsVisitedEl) campaignsVisitedEl.textContent = stats.visitedCampaigns.length;
            if (loadingTimeEl) loadingTimeEl.textContent = formatLoadingTime(stats.totalLoadingTime);
            if (placementsAddedEl) placementsAddedEl.textContent = stats.placementsAdded;

            const statsTitle = document.querySelector('#stats h2');
            if (statsTitle && data.installDate) {
                const installDate = new Date(data.installDate);
                const now = new Date();
                const oneWeek = 7 * 24 * 60 * 60 * 1000;
                const showTime = now - installDate < oneWeek;

                const dateString = installDate.toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });

                const timeString = showTime ? installDate.toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit'
                }) : '';

                const sinceText = `(since ${dateString}${showTime ? ' at ' + timeString : ''})`;

                // Avoid re-adding the span if it already exists
                let sinceSpan = statsTitle.querySelector('.since-date');
                if (!sinceSpan) {
                    sinceSpan = document.createElement('span');
                    sinceSpan.className = 'since-date';
                    statsTitle.appendChild(document.createTextNode(' ')); // Add a space
                    statsTitle.appendChild(sinceSpan);
                }
                sinceSpan.textContent = sinceText;
            }
        });
    }

    // --- Modal Logic ---
    const modalOverlay = document.getElementById('confirmation-modal-overlay');
    const modal = document.getElementById('confirmation-modal');
    const confirmButton = document.getElementById('modal-confirm-button');
    const cancelButton = document.getElementById('modal-cancel-button');

    const showModal = () => {
        modalOverlay.style.display = 'block';
        modal.style.display = 'block';
    };

    const hideModal = () => {
        modalOverlay.style.display = 'none';
        modal.style.display = 'none';
    };

    // --- Stats Reset Logic ---
    function resetStats() {
        const defaultStats = {
            visitedCampaigns: [],
            totalLoadingTime: 0,
            placementsAdded: 0
        };
        chrome.storage.local.set({ 'prismaUserStats': defaultStats }, () => {
            console.log('Prisma user stats have been reset.');
            displayStats(); // Refresh the display to show zeros
        });
        hideModal();
    }

    if (resetButton) {
        resetButton.addEventListener('click', showModal);
    }
    if (confirmButton) {
        confirmButton.addEventListener('click', resetStats);
    }
    if (cancelButton) {
        cancelButton.addEventListener('click', hideModal);
    }
    if (modalOverlay) {
        modalOverlay.addEventListener('click', hideModal);
    }

    // --- Real-Time Update Listener ---
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.prismaUserStats) {
            console.log('Detected a change in prismaUserStats, updating display.');
            displayStats();
        }
    });

    // Display stats on initial load
    displayStats();
});
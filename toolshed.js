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
    function displayStats() {
        chrome.storage.local.get('prismaUserStats', (data) => {
            const stats = data.prismaUserStats || {
                visitedCampaigns: [],
                totalLoadingTime: 0,
                placementsAdded: 0
            };

            const campaignsVisitedEl = document.getElementById('campaigns-visited-stat');
            const loadingTimeEl = document.getElementById('loading-time-stat');
            const placementsAddedEl = document.getElementById('placements-added-stat');

            if (campaignsVisitedEl) campaignsVisitedEl.textContent = stats.visitedCampaigns.length;
            if (loadingTimeEl) loadingTimeEl.textContent = `${stats.totalLoadingTime.toFixed(2)}s`;
            if (placementsAddedEl) placementsAddedEl.textContent = stats.placementsAdded;
        });
    }

    // --- Stats Reset Logic ---
    function resetStats() {
        if (confirm('Are you sure you want to reset all your stats? This cannot be undone.')) {
            const defaultStats = {
                visitedCampaigns: [],
                totalLoadingTime: 0,
                placementsAdded: 0
            };
            chrome.storage.local.set({ 'prismaUserStats': defaultStats }, () => {
                console.log('Prisma user stats have been reset.');
                displayStats(); // Refresh the display to show zeros
            });
        }
    }

    if (resetButton) {
        resetButton.addEventListener('click', resetStats);
    }

    // Refresh stats when the stats tab is clicked
    if (statsTabButton) {
        statsTabButton.addEventListener('click', displayStats);
    }

    // Display stats on initial load
    displayStats();
});
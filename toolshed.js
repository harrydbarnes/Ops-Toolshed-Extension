document.addEventListener('DOMContentLoaded', () => {
    // --- Feedback Modal Logic ---
    const feedbackLink = document.getElementById('open-feedback-modal');
    
    // Function to open modal (reusing the class from features/feedback-modal.js)
    const openFeedback = (e) => {
        if (e) e.preventDefault();
        if (window.feedbackModalFeature) {
            window.feedbackModalFeature.open();
        }
    };

    if (feedbackLink) {
        feedbackLink.addEventListener('click', openFeedback);
    }

    // Check URL params
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('feedback') === 'true') {
        openFeedback();
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    const tabContainer = document.querySelector('.tab-container');
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const resetButton = document.getElementById('reset-stats-button');

    let previousTotalPlacements = null;

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
            if (totalSeconds > 0 && totalSeconds < 0.01) {
                return '<0.01s';
            }
            return `${Math.floor(totalSeconds * 10) / 10}s`;
        } else {
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = Math.floor((totalSeconds % 60) * 10) / 10;
            return `${minutes} min and ${seconds}s`;
        }
    }

    function renderHeatmap(dailyStats) {
        const heatmapContainer = document.getElementById('heatmap');
        if (!heatmapContainer) return;
        heatmapContainer.innerHTML = '';

        // Generate dates for the last 52 weeks (approx 365 days)
        const today = new Date();
        // Adjust start date to align with the grid (start on Sunday or consistent day)
        // For simplicity, just last 365 days
        const startDate = new Date(today);
        startDate.setDate(today.getDate() - 364);

        // Map daily stats to date strings
        const statsMap = dailyStats || {};

        for (let i = 0; i < 365; i++) {
            const date = new Date(startDate);
            date.setDate(startDate.getDate() + i);
            // Local date string construction to avoid UTC shifting
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;

            const stat = statsMap[dateStr];
            const placements = stat ? stat.placements : 0;

            // Determine level (0-4)
            let level = 0;
            if (placements > 0) level = 1;
            if (placements > 5) level = 2;
            if (placements > 15) level = 3;
            if (placements > 30) level = 4;

            const dayEl = document.createElement('div');
            dayEl.className = 'heatmap-day';
            dayEl.dataset.level = level;
            dayEl.title = `${dateStr}: ${placements} placements`;

            heatmapContainer.appendChild(dayEl);
        }
    }

    function renderCharts(dailyStats) {
        // Day of Week Chart
        const dayCounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }; // Sun-Sat
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        Object.keys(dailyStats || {}).forEach(dateStr => {
            // Parse YYYY-MM-DD as local date
            const [y, m, d] = dateStr.split('-').map(Number);
            const date = new Date(y, m - 1, d);
            const day = date.getDay();
            if (dailyStats[dateStr].placements) {
                dayCounts[day] += dailyStats[dateStr].placements;
            }
        });

        const maxCount = Math.max(...Object.values(dayCounts));
        const chartContainer = document.getElementById('day-of-week-chart');
        if (chartContainer) {
            chartContainer.innerHTML = '';
            days.forEach((day, index) => {
                const count = dayCounts[index];
                const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;

                const bar = document.createElement('div');
                bar.className = 'chart-bar';
                bar.style.height = `${percentage}%`;

                const label = document.createElement('span');
                label.className = 'chart-bar-label';
                label.textContent = day;
                bar.appendChild(label);

                bar.title = `${day}: ${count} placements`;
                chartContainer.appendChild(bar);
            });
        }

        // Most Active Month
        const monthCounts = {};
        Object.keys(dailyStats || {}).forEach(dateStr => {
            // Parse YYYY-MM-DD as local date
            const [y, m, d] = dateStr.split('-').map(Number);
            const date = new Date(y, m - 1, d);
            const month = date.toLocaleString('default', { month: 'long', year: 'numeric' });
            if (dailyStats[dateStr].placements) {
                monthCounts[month] = (monthCounts[month] || 0) + dailyStats[dateStr].placements;
            }
        });

        let mostActiveMonth = '-';
        let maxMonthCount = 0;
        Object.entries(monthCounts).forEach(([month, count]) => {
            if (count > maxMonthCount) {
                maxMonthCount = count;
                mostActiveMonth = month;
            }
        });

        const monthEl = document.getElementById('most-active-month');
        if (monthEl) monthEl.textContent = `Most Active Month: ${mostActiveMonth}`;
    }

    function renderFunStats(dailyStats, totalLoadingTime, totalPlacements) {
        // Kettle Index
        const kettleIndex = Math.floor(totalLoadingTime / 180);
        const kettleEl = document.getElementById('kettle-index');
        if (kettleEl) kettleEl.textContent = kettleIndex;

        // Beat Your Week
        const today = new Date();
        let currentWeekCount = 0;
        let previousWeekCount = 0;

        for (let i = 0; i < 7; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const ds = `${year}-${month}-${day}`;
            if (dailyStats[ds]) currentWeekCount += dailyStats[ds].placements || 0;
        }

        for (let i = 7; i < 14; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const ds = `${year}-${month}-${day}`;
            if (dailyStats[ds]) previousWeekCount += dailyStats[ds].placements || 0;
        }

        const beatWeekEl = document.getElementById('beat-your-week');
        if (beatWeekEl) {
            if (previousWeekCount === 0) {
                beatWeekEl.textContent = currentWeekCount > 0 ? "First Week!" : "-";
            } else {
                const diff = currentWeekCount - previousWeekCount;
                const percent = Math.round((diff / previousWeekCount) * 100);
                const arrow = percent > 0 ? '⬆️' : (percent < 0 ? '⬇️' : '➖');
                beatWeekEl.textContent = `${arrow} ${Math.abs(percent)}%`;
            }
        }

        // Milestones
        const milestones = [100, 500, 1000, 5000, 10000];
        if (window.confetti) {
            if (previousTotalPlacements === null) {
                // Initial Load
                if (milestones.includes(totalPlacements)) {
                    window.confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
                }
            } else {
                // Check Crossing
                const crossed = milestones.some(m => previousTotalPlacements < m && totalPlacements >= m);
                if (crossed) {
                    window.confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
                }
            }
        }

        previousTotalPlacements = totalPlacements;
    }

    function displayStats() {
        chrome.storage.local.get(['legacyStats', 'dailyStats', 'statsStartDate'], (data) => {
            const legacyStats = data.legacyStats || {
                visitedCampaigns: [],
                totalLoadingTime: 0,
                placementsAdded: 0
            };
            const dailyStats = data.dailyStats || {};

            // Calculate Totals
            let totalLoadingTime = legacyStats.totalLoadingTime || 0;
            let totalPlacements = legacyStats.placementsAdded || 0;

            // For campaigns, we try to merge
            const allCampaigns = new Set(legacyStats.visitedCampaigns || []);

            Object.values(dailyStats).forEach(stat => {
                totalLoadingTime += stat.loadingTime || 0;
                totalPlacements += stat.placements || 0;
                if (stat.visitedCampaigns) {
                    stat.visitedCampaigns.forEach(c => allCampaigns.add(c));
                }
            });

            // Update DOM
            const campaignsVisitedEl = document.getElementById('campaigns-visited-stat');
            const loadingTimeEl = document.getElementById('loading-time-stat');
            const avgLoadingTimeEl = document.getElementById('avg-loading-time-stat');
            const placementsAddedEl = document.getElementById('placements-added-stat');

            if (campaignsVisitedEl) campaignsVisitedEl.textContent = allCampaigns.size;
            if (loadingTimeEl) loadingTimeEl.textContent = formatLoadingTime(totalLoadingTime);
            if (placementsAddedEl) placementsAddedEl.textContent = totalPlacements;

            // Render Visualizations
            renderHeatmap(dailyStats);
            renderCharts(dailyStats);
            renderFunStats(dailyStats, totalLoadingTime, totalPlacements);

            // Start Date
            const statsTitle = document.querySelector('#stats h2');
            let sinceSpan = statsTitle.querySelector('.since-date');
            if (data.statsStartDate) {
                const startDate = new Date(data.statsStartDate);
                 const dateString = startDate.toLocaleString(undefined, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
                const totalDays = Math.max(1, Math.floor((new Date() - startDate) / (1000 * 60 * 60 * 24)));

                 // Calculate average loading time
                 if (avgLoadingTimeEl && totalLoadingTime > 0) {
                     const avg = totalLoadingTime / totalDays;
                     avgLoadingTimeEl.textContent = `Avg per day: ${formatLoadingTime(avg)}`;
                     avgLoadingTimeEl.style.display = 'inline';
                 }
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
        chrome.storage.local.set({
            'legacyStats': { visitedCampaigns: [], totalLoadingTime: 0, placementsAdded: 0 },
            'dailyStats': {},
            'statsStartDate': new Date().toISOString()
        }, () => {
            console.log('Stats have been reset.');
            displayStats();
        });
        hideModal();
    }

    if (resetButton) resetButton.addEventListener('click', showModal);
    if (confirmButton) confirmButton.addEventListener('click', resetStats);
    if (cancelButton) cancelButton.addEventListener('click', hideModal);
    if (modalOverlay) modalOverlay.addEventListener('click', hideModal);

    // --- Real-Time Update Listener ---
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && (changes.legacyStats || changes.dailyStats)) {
            displayStats();
        }
    });

    // --- Refresh Button Logic ---
    const refreshButton = document.getElementById('refresh-stats-button');
    if (refreshButton) {
        refreshButton.addEventListener('click', () => {
            const icon = refreshButton.querySelector('svg');
            if (icon) {
                icon.classList.add('spin');
                setTimeout(() => {
                    icon.classList.remove('spin');
                }, 1000); // 1s animation
            }
            displayStats();
        });
    }

    // Display stats on initial load
    displayStats();

    // Display Build Info
    if (window.buildInfo) {
        const buildInfoDiv = document.getElementById('build-info');
        if (buildInfoDiv) {
            buildInfoDiv.textContent = `Build Date: ${window.buildInfo.buildDate} | Commit: ${window.buildInfo.commitId}`;
        }
    }
});

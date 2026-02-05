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

        // Ensure JS Tooltip element exists
        let tooltip = document.getElementById('heatmap-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'heatmap-tooltip';
            document.body.appendChild(tooltip);
        }

        // Logic to start on Sunday 52 weeks ago
        const today = new Date();
        const startDate = new Date(today);
        startDate.setDate(today.getDate() - (52 * 7)); // Go back 52 weeks
        // Adjust to previous Sunday (if not already Sunday)
        const dayOfWeek = startDate.getDay(); // 0 is Sunday
        startDate.setDate(startDate.getDate() - dayOfWeek);

        // Map daily stats to date strings
        const statsMap = dailyStats || {};

        // Calculate number of days from startDate to today (inclusive)
        const timeDiff = today.getTime() - startDate.getTime();
        const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
        // Add 1 to include today
        const totalDays = daysDiff + 1;

        for (let i = 0; i < totalDays; i++) {
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

            // Format for display: dd.mm.yy
            const yy = String(year).slice(-2);
            const displayDate = `${day}.${month}.${yy}`;
            // Store text for tooltip
            dayEl.dataset.tooltipText = `${displayDate}: ${placements} placements`;

            // JS Tooltip Events
            dayEl.addEventListener('mouseover', (e) => {
                tooltip.textContent = e.target.dataset.tooltipText;
                tooltip.style.display = 'block';
            });

            dayEl.addEventListener('mousemove', (e) => {
                const offsetX = 10;
                const offsetY = 10;
                tooltip.style.left = (e.clientX + offsetX) + 'px';
                tooltip.style.top = (e.clientY + offsetY) + 'px';
            });

            dayEl.addEventListener('mouseleave', () => {
                tooltip.style.display = 'none';
            });

            heatmapContainer.appendChild(dayEl);
        }
    }

    function renderCharts(dailyStats) {
        const parseDateStr = (dateStr) => {
            const [y, m, d] = dateStr.split('-').map(Number);
            return new Date(y, m - 1, d);
        };

        // Day of Week Chart
        const dayCounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 }; // Sun-Sat
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

        Object.keys(dailyStats || {}).forEach(dateStr => {
            // Parse YYYY-MM-DD as local date
            const date = parseDateStr(dateStr);
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
            const date = parseDateStr(dateStr);
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

    // --- Helper for UK Bank Holidays (2024-2026) ---
    function isUKBankHoliday(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        // List of known UK Bank Holidays
        const bankHolidays = [
            // 2024
            "2024-01-01", "2024-03-29", "2024-04-01", "2024-05-06",
            "2024-05-27", "2024-08-26", "2024-12-25", "2024-12-26",
            // 2025
            "2025-01-01", "2025-04-18", "2025-04-21", "2025-05-05",
            "2025-05-26", "2025-08-25", "2025-12-25", "2025-12-26",
            // 2026
            "2026-01-01", "2026-04-03", "2026-04-06", "2026-05-04",
            "2026-05-25", "2026-08-31", "2026-12-25", "2026-12-28", // 26th is Sat
            // 2027 (Estimated)
            "2027-01-01", "2027-03-26", "2027-03-29", "2027-05-03",
            "2027-05-31", "2027-08-30", "2027-12-27", "2027-12-28",
            // 2028 (Estimated)
            "2028-01-03", "2028-04-14", "2028-04-17", "2028-05-01",
            "2028-05-29", "2028-08-28", "2028-12-25", "2028-12-26",
            // 2029 (Estimated)
            "2029-01-01", "2029-03-30", "2029-04-02", "2029-05-07",
            "2029-05-28", "2029-08-27", "2029-12-25", "2029-12-26"
        ];

        // TODO: Update bank holidays for 2030 and beyond. Source: https://www.gov.uk/bank-holidays

        return bankHolidays.includes(dateStr);
    }

    function renderFunStats(dailyStats, totalLoadingTime, totalPlacements) {
        // Kettle Index
        const kettleIndex = Math.floor(totalLoadingTime / 180);
        const kettleEl = document.getElementById('kettle-index');
        if (kettleEl) kettleEl.textContent = kettleIndex;

        // Beat Your Week
        const today = new Date();

        const getPlacementsForPastDays = (endDate, startOffset, numDays) => {
            let count = 0;
            for (let i = 0; i < numDays; i++) {
                const d = new Date(endDate);
                d.setDate(d.getDate() - (startOffset + i));
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                const ds = `${year}-${month}-${day}`;
                if (dailyStats[ds]) {
                    count += dailyStats[ds].placements || 0;
                }
            }
            return count;
        };

        const currentWeekCount = getPlacementsForPastDays(today, 0, 7);
        const previousWeekCount = getPlacementsForPastDays(today, 7, 7);

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

        // Streak Counter
        const streakEl = document.getElementById('streak-counter');
        if (streakEl) {
            let streak = 0;
            const now = new Date();
            const yesterday = new Date(now);
            yesterday.setDate(now.getDate() - 1);

            // Format for lookup
            const getDS = (d) => {
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${y}-${m}-${day}`;
            };

            const todayStr = getDS(now);
            const yesterdayStr = getDS(yesterday);

            // Determine anchor date
            let anchorDate = null;
            if (dailyStats[todayStr] && dailyStats[todayStr].placements > 0) {
                anchorDate = new Date(now);
            } else if (dailyStats[yesterdayStr] && dailyStats[yesterdayStr].placements > 0) {
                anchorDate = new Date(yesterday);
            }

            if (anchorDate) {
                // Count backwards from anchor (inclusive)
                // Limit to prevent infinite loops (e.g. 1000 days)
                for (let i = 0; i < 1000; i++) {
                    const d = new Date(anchorDate);
                    d.setDate(anchorDate.getDate() - i);
                    const ds = getDS(d);

                    const stat = dailyStats[ds];
                    const placements = stat ? (stat.placements || 0) : 0;

                    if (placements > 0) {
                        streak++;
                    } else {
                        // Check if we should skip (Weekend or Bank Holiday)
                        const dayOfWeek = d.getDay(); // 0=Sun, 6=Sat
                        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                        if (isWeekend || isUKBankHoliday(d)) {
                            // Don't increment streak, but continue searching backwards
                            continue;
                        } else {
                            // Break streak
                            break;
                        }
                    }
                }
            }

            if (streak > 0) {
                streakEl.textContent = `🔥 ${streak} Day Streak`;
                streakEl.parentElement.parentElement.style.display = 'flex'; // Show if hidden
            } else {
                streakEl.textContent = '';
                // Optional: Hide element or show placeholder
                // For now, leaving empty
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

            if (data.statsStartDate && statsTitle) {
                const startDate = new Date(data.statsStartDate);
                const dateString = startDate.toLocaleString(undefined, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });

                let sinceSpan = statsTitle.querySelector('.since-date');
                if (!sinceSpan) {
                    sinceSpan = document.createElement('span');
                    sinceSpan.className = 'since-date';
                    statsTitle.appendChild(document.createTextNode(' '));
                    statsTitle.appendChild(sinceSpan);
                }
                sinceSpan.textContent = `(since ${dateString})`;

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

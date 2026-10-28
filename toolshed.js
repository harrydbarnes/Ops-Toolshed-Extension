document.addEventListener('DOMContentLoaded', async () => {
    if (window.opsToolshedPageGate && !(await window.opsToolshedPageGate.allow())) return;
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
        window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.hash}`);
    }

    const tabContainer = document.querySelector('.tab-container');
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const resetButton = document.getElementById('reset-stats-button');

    let previousTotalPlacements = null;
    const weeklyInfo = document.getElementById('weekly-productivity-info');
    if (weeklyInfo) {
        const tooltip = document.createElement('div');
        tooltip.id = 'weekly-productivity-tooltip';
        tooltip.className = 'stats-info-tooltip';
        tooltip.setAttribute('role', 'tooltip');
        tooltip.textContent = 'Totals for each weekday across all recorded weeks, including this week — not last week or a weekly average. Actions include placement save clicks, reconciliations and unique campaigns visited each day. Repeat visits on different days count again. Legacy totals without dates are excluded. Most Active Month counts placement saves only.';
        tooltip.hidden = true;
        document.body.append(tooltip);
        const hide = () => { tooltip.hidden = true; weeklyInfo.removeAttribute('aria-describedby'); };
        const show = () => {
            tooltip.hidden = false;
            weeklyInfo.setAttribute('aria-describedby', tooltip.id);
            const rect = weeklyInfo.getBoundingClientRect();
            const width = tooltip.getBoundingClientRect().width;
            tooltip.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, rect.left + rect.width / 2 - width / 2))}px`;
            const height = tooltip.getBoundingClientRect().height;
            tooltip.style.top = `${rect.bottom + 8 + height <= window.innerHeight - 8 ? rect.bottom + 8 : Math.max(8, rect.top - height - 8)}px`;
        };
        weeklyInfo.addEventListener('mouseenter', show);
        weeklyInfo.addEventListener('mouseleave', hide);
        weeklyInfo.addEventListener('focus', show);
        weeklyInfo.addEventListener('blur', hide);
        weeklyInfo.addEventListener('click', show);
        document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
        window.addEventListener('scroll', hide, true);
        window.addEventListener('resize', hide);
        window.addEventListener('hashchange', hide);
        tabContainer?.addEventListener('click', hide);
    }

    // --- Tab Switching Logic ---
    if (tabContainer) {
        const defaultTab = Array.from(tabButtons)
            .find(button => button.classList.contains('active'))?.dataset.tab
            || tabButtons[0]?.dataset.tab;

        const getTabFromUrl = () => {
            const requestedTab = window.location.hash.slice(1);
            return Array.from(tabButtons).some(button => button.dataset.tab === requestedTab)
                ? requestedTab
                : defaultTab;
        };

        const activateTab = (tabId, { updateUrl = false } = {}) => {
            const activeButton = Array.from(tabButtons)
                .find(button => button.dataset.tab === tabId);
            const activeContent = document.getElementById(tabId);
            if (!activeButton || !activeContent) return;

            tabButtons.forEach(button => button.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            activeButton.classList.add('active');
            activeContent.classList.add('active');

            if (updateUrl && window.location.hash !== `#${tabId}`) {
                window.history.pushState({}, document.title, `#${tabId}`);
            }
        };

        tabContainer.addEventListener('click', (e) => {
            const clickedButton = e.target.closest('.tab-button');
            if (!clickedButton) return;
            activateTab(clickedButton.dataset.tab, { updateUrl: true });
        });

        const syncTabFromUrl = () => activateTab(getTabFromUrl());
        window.addEventListener('popstate', syncTabFromUrl);
        window.addEventListener('hashchange', syncTabFromUrl);
        syncTabFromUrl();
    }

    // --- Stats Display Logic ---
    function formatLoadingTime(totalSeconds) {
        if (totalSeconds < 60) {
            // Case A: < 60s
            if (totalSeconds > 0 && totalSeconds < 0.01) {
                return '<0.01s';
            }
            return `${Math.floor(totalSeconds * 10) / 10}s`;
        } else if (totalSeconds < 600) {
            // Case B: 60s <= t < 600s (Under 10 mins)
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = Math.floor((totalSeconds % 60) * 10) / 10;
            const minUnit = minutes === 1 ? 'min' : 'mins';
            return `${minutes} ${minUnit} &<br> ${seconds}s`;
        } else {
            // Case C: t >= 600s (10 mins+)
            const hours = Math.floor(totalSeconds / 3600);
            const remainingSeconds = totalSeconds % 3600;
            const minutes = Math.floor(remainingSeconds / 60);
            const seconds = Math.floor(remainingSeconds % 60); // Whole number

            if (hours > 0) {
                return `${hours}h,<br> ${minutes}m & ${seconds}s`;
            } else {
                return `${minutes}m &<br> ${seconds}s`;
            }
        }
    }

    const LOADING_AREA_CONFIG = [
        { key: 'home', label: 'Home', color: '#06088d' },
        { key: 'buy', label: 'Buy', color: '#ff4087' },
        { key: 'actualise', label: 'Actualise', color: '#d92768' },
        { key: 'traffic', label: 'Traffic', color: '#008f8c' },
        { key: 'orders', label: 'Orders', color: '#c77b00' },
        { key: 'other', label: 'Other', color: '#64748b' }
    ];

    const OTHER_AREA_CONFIG = [
        { key: 'plan', label: 'Plan' },
        { key: 'analyse', label: 'Analyse' },
        { key: 'other', label: 'Other areas' }
    ];

    function formatCompactLoadingTime(totalSeconds) {
        const seconds = Math.max(0, Number(totalSeconds) || 0);
        if (seconds < 60) return `${Math.floor(seconds * 10) / 10}s`;
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m ${remainingSeconds}s`;
    }

    function formatAreaTrackingContext(totalSeconds) {
        if (totalSeconds <= 0) return 'Area tracking starts with this update';
        if (totalSeconds < 60) return `${formatCompactLoadingTime(totalSeconds)} tracked by area`;
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = Math.floor(totalSeconds % 60);
        const minuteLabel = minutes === 1 ? 'min' : 'mins';
        return `${minutes} ${minuteLabel}${seconds ? ` ${seconds}s` : ''} tracked by area`;
    }

    function renderLoadingAreaBreakdown(dailyStats) {
        const container = document.getElementById('loading-area-breakdown');
        const context = document.getElementById('loading-area-context');
        if (!container || !context) return;

        const totals = Object.fromEntries(LOADING_AREA_CONFIG.map(area => [area.key, 0]));
        const otherTotals = Object.fromEntries(OTHER_AREA_CONFIG.map(area => [area.key, 0]));
        Object.values(dailyStats || {}).forEach(day => {
            Object.entries(day.loadingByArea || {}).forEach(([area, seconds]) => {
                const value = Number(seconds) || 0;
                if (Object.prototype.hasOwnProperty.call(otherTotals, area)) {
                    otherTotals[area] += value;
                    totals.other += value;
                } else if (Object.prototype.hasOwnProperty.call(totals, area)) {
                    totals[area] += value;
                }
            });
        });

        const trackedTotal = Object.values(totals).reduce((sum, seconds) => sum + seconds, 0);
        const largestTotal = Math.max(1, ...Object.values(totals));
        context.textContent = formatAreaTrackingContext(trackedTotal);
        container.replaceChildren();

        LOADING_AREA_CONFIG.forEach(area => {
            const item = document.createElement('div');
            item.className = 'loading-area-item';
            item.dataset.loadingArea = area.key;
            item.style.setProperty('--area-color', area.color);
            if (area.key !== 'other') {
                item.title = `${area.label}: ${formatCompactLoadingTime(totals[area.key])}`;
            }

            const label = document.createElement('span');
            label.className = 'loading-area-label';
            label.textContent = area.label;

            const time = document.createElement('strong');
            time.className = 'loading-area-time';
            time.textContent = formatCompactLoadingTime(totals[area.key]);

            const meter = document.createElement('span');
            meter.className = 'loading-area-meter';
            meter.setAttribute('aria-hidden', 'true');
            const fill = document.createElement('span');
            fill.style.width = totals[area.key] > 0
                ? `${Math.max(4, (totals[area.key] / largestTotal) * 100)}%`
                : '0%';
            meter.appendChild(fill);

            item.append(label, time, meter);
            if (area.key === 'other') {
                const tooltipId = 'loading-area-other-tooltip';
                const tooltip = document.createElement('span');
                tooltip.id = tooltipId;
                tooltip.className = 'loading-area-tooltip';
                tooltip.setAttribute('role', 'tooltip');

                const heading = document.createElement('strong');
                heading.className = 'loading-area-tooltip-title';
                heading.textContent = 'Other breakdown';
                tooltip.appendChild(heading);

                OTHER_AREA_CONFIG.forEach(detail => {
                    const row = document.createElement('span');
                    row.className = 'loading-area-tooltip-row';
                    const detailLabel = document.createElement('span');
                    detailLabel.textContent = detail.label;
                    const detailTime = document.createElement('strong');
                    detailTime.textContent = formatCompactLoadingTime(otherTotals[detail.key]);
                    row.append(detailLabel, detailTime);
                    tooltip.appendChild(row);
                });

                item.classList.add('has-breakdown-tooltip');
                item.tabIndex = 0;
                item.setAttribute('aria-describedby', tooltipId);
                item.appendChild(tooltip);
            }
            container.appendChild(item);
        });
    }

    function renderCampaignInsights(entries) {
        const snapshots = Array.isArray(entries) ? entries : [];
        const money = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
        const format = value => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value);
        const budgets = snapshots.filter(entry => money(entry.budget));
        const bookings = snapshots.filter(entry => money(entry.booked));
        document.getElementById('average-campaign-budget').textContent = budgets.length ? format(budgets.reduce((sum, entry) => sum + entry.budget, 0) / budgets.length) : '—';
        document.getElementById('total-campaign-booked').textContent = bookings.length ? format(bookings.reduce((sum, entry) => sum + entry.booked, 0)) : '—';
        document.getElementById('campaign-insights-coverage').textContent = snapshots.length
            ? `${snapshots.length} campaigns · Budgets ${budgets.length}/${snapshots.length} · Booked ${bookings.length}/${snapshots.length}`
            : 'Visit campaigns in Prisma to start collecting insights.';
        for (const [field, id] of [['clientName', 'top-clients'], ['supplier', 'top-suppliers']]) {
            const counts = new Map();
            snapshots.forEach(entry => {
                const names = String(entry[field] || '').split(field === 'supplier' ? '|' : /$^/);
                const unique = new Map(names.map(name => [name.trim().toLowerCase(), name.trim()]).filter(([key]) => key));
                unique.forEach((name, key) => {
                    const existing = counts.get(key);
                    counts.set(key, { name: existing?.name || name, count: (existing?.count || 0) + 1 });
                });
            });
            const list = document.getElementById(id);
            list.replaceChildren();
            [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 5).forEach(entry => {
                const row = document.createElement('li');
                const name = document.createElement('span');
                name.textContent = entry.name;
                const count = document.createElement('strong');
                count.textContent = `${entry.count} campaign${entry.count === 1 ? '' : 's'}`;
                row.append(name, count);
                list.append(row);
            });
            if (!list.children.length) {
                const empty = document.createElement('li');
                empty.textContent = 'Visit campaigns in Prisma to build your top five.';
                list.append(empty);
            }
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

        // Logic to start on the Monday 52 weeks ago
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const startDate = new Date(today);
        startDate.setDate(today.getDate() - (52 * 7));

        // Adjust to previous Monday (0=Sun, 1=Mon, ..., 6=Sat)
        // We want Mon(1) to be offset 0, Tue(2) offset 1... Sun(0) offset 6.
        const dayOfWeek = startDate.getDay();
        const daysToMonday = (dayOfWeek + 6) % 7;
        startDate.setDate(startDate.getDate() - daysToMonday);

        // Map daily stats to date strings
        const statsMap = dailyStats || {};
        const weekendContainer = document.getElementById('heatmap-weekends');
        weekendContainer.replaceChildren();
        weekendContainer.hidden = true;
        heatmapContainer.style.gridTemplateRows = 'repeat(5, 12px)';

        // Calculate number of days from startDate to today (inclusive)
        const timeDiff = today.getTime() - startDate.getTime();
        const daysDiff = Math.round(timeDiff / (1000 * 3600 * 24));
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
            const placements = stat ? (stat.placements || 0) : 0;
            const reconciliations = stat ? (stat.reconciliations || 0) : 0;
            const campaigns = (stat?.visitedCampaigns || []).length;
            const activityCount = placements + reconciliations + campaigns;
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            if (isWeekend && activityCount <= 0) continue;

            // Determine level (0-4) based on Activity
            let level = 0;
            if (activityCount > 0) level = 1;
            if (activityCount > 5) level = 2;
            if (activityCount > 15) level = 3;
            if (activityCount > 30) level = 4;

            const dayEl = document.createElement('div');
            dayEl.className = 'heatmap-day';
            dayEl.dataset.date = dateStr;
            if (!isWeekend) {
                dayEl.style.gridColumn = String(Math.floor(i / 7) + 1);
                dayEl.style.gridRow = String(date.getDay());
            }
            dayEl.dataset.level = level;

            // Format for display: dd.mm.yy
            const yy = String(year).slice(-2);
            const displayDate = `${day}.${month}.${yy}`;
            // Store text for tooltip
            dayEl.dataset.tooltipText = `${displayDate}: ${activityCount} actions (${placements} placements, ${reconciliations} reconciliations, ${campaigns} campaigns)${stat?.loadingTime > 0 ? ` · ${formatCompactLoadingTime(stat.loadingTime)} waiting` : ''}`;

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

            if (isWeekend) {
                if (weekendContainer.hidden) {
                    const heading = document.createElement('strong');
                    heading.textContent = 'Weekend activity';
                    weekendContainer.append(heading);
                    weekendContainer.hidden = false;
                }
                const item = document.createElement('span');
                item.className = 'heatmap-weekend-item';
                const label = document.createElement('span');
                label.textContent = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
                dayEl.setAttribute('aria-label', dayEl.dataset.tooltipText);
                item.append(dayEl, label);
                weekendContainer.append(item);
            } else heatmapContainer.appendChild(dayEl);
        }
    }

    function renderCharts(dailyStats) {
        const parseDateStr = (dateStr) => {
            const [y, m, d] = dateStr.split('-').map(Number);
            return new Date(y, m - 1, d);
        };

        // Day of Week Chart
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        // Store detailed stats per day
        const dayStats = days.map(() => ({ total: 0, placements: 0, reconciliations: 0, campaigns: 0 }));

        Object.keys(dailyStats || {}).forEach(dateStr => {
            // Parse YYYY-MM-DD as local date
            const date = parseDateStr(dateStr);
            const dayIndex = date.getDay();
            const stat = dailyStats[dateStr];

            const placements = stat.placements || 0;
            const reconciliations = stat.reconciliations || 0;
            const campaigns = (stat.visitedCampaigns || []).length;

            const dayStat = dayStats[dayIndex];
            dayStat.placements += placements;
            dayStat.reconciliations += reconciliations;
            dayStat.campaigns += campaigns;
            dayStat.total += (placements + reconciliations + campaigns);
        });

        const maxCount = Math.max(...dayStats.map(s => s.total));
        const chartContainer = document.getElementById('day-of-week-chart');

        // Ensure shared tooltip element exists (reusing the heatmap tooltip for visual consistency)
        let tooltip = document.getElementById('heatmap-tooltip');
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.id = 'heatmap-tooltip';
            document.body.appendChild(tooltip);
        }

        if (chartContainer) {
            chartContainer.innerHTML = '';
            days.forEach((day, index) => {
                const stats = dayStats[index];
                const percentage = maxCount > 0 ? (stats.total / maxCount) * 100 : 0;

                const bar = document.createElement('div');
                bar.className = 'chart-bar';
                bar.style.height = `${percentage}%`;

                const label = document.createElement('span');
                label.className = 'chart-bar-label';
                label.textContent = day;
                bar.appendChild(label);

                // Detailed Tooltip - Replaced native 'title' attribute with custom tooltip events
                bar.dataset.tooltipText = `${day}: ${stats.total} actions (${stats.placements} placements, ${stats.reconciliations} reconciliations, ${stats.campaigns} campaigns)`;

                // Event Listeners for Custom Tooltip
                bar.addEventListener('mouseover', (e) => {
                    // Use currentTarget to ensure we get data from the bar, not the child label
                    tooltip.textContent = e.currentTarget.dataset.tooltipText;
                    tooltip.style.display = 'block';
                });

                bar.addEventListener('mousemove', (e) => {
                    const offsetX = 10;
                    const offsetY = 10;
                    tooltip.style.left = (e.clientX + offsetX) + 'px';
                    tooltip.style.top = (e.clientY + offsetY) + 'px';
                });

                bar.addEventListener('mouseleave', () => {
                    tooltip.style.display = 'none';
                });

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
        // Kettle Index (1 kettle per 45s)
        const kettleIndex = Math.floor(totalLoadingTime / 45);
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
            const beatWeekLabel = beatWeekEl.nextElementSibling;
            if (previousWeekCount === 0) {
                beatWeekEl.textContent = "First Week!";
                if (beatWeekLabel) beatWeekLabel.style.display = 'none';
            } else {
                const diff = currentWeekCount - previousWeekCount;
                const percent = Math.round((diff / previousWeekCount) * 100);
                const arrow = percent > 0 ? '⬆️' : (percent < 0 ? '⬇️' : '➖');
                beatWeekEl.textContent = `${arrow} ${Math.abs(percent)}%`;
                if (beatWeekLabel) beatWeekLabel.style.display = '';
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
                streakEl.textContent = `${streak} Day Streak`;
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
        chrome.storage.local.get(['legacyStats', 'dailyStats', 'statsStartDate', 'appLearnPopupsBlocked', 'campaignStatsSnapshots'], (data) => {
            const legacyStats = data.legacyStats || {
                visitedCampaigns: [],
                totalLoadingTime: 0,
                placementsAdded: 0,
                reconciliations: 0
            };
            const dailyStats = data.dailyStats || {};

            // Calculate Totals
            let totalLoadingTime = legacyStats.totalLoadingTime || 0;
            let totalPlacements = legacyStats.placementsAdded || 0;
            let totalReconciliations = legacyStats.reconciliations || 0;

            // For campaigns, we try to merge
            const allCampaigns = new Set(legacyStats.visitedCampaigns || []);

            Object.values(dailyStats).forEach(stat => {
                totalLoadingTime += stat.loadingTime || 0;
                totalPlacements += stat.placements || 0;
                totalReconciliations += stat.reconciliations || 0;
                if (stat.visitedCampaigns) {
                    stat.visitedCampaigns.forEach(c => allCampaigns.add(c));
                }
            });

            // Update DOM
            const campaignsVisitedEl = document.getElementById('campaigns-visited-stat');
            const loadingTimeEl = document.getElementById('loading-time-stat');
            const avgLoadingTimeEl = document.getElementById('avg-loading-time-stat');
            const placementsAddedEl = document.getElementById('placements-added-stat');
            const reconciliationsEl = document.getElementById('reconciliations-stat');
            const appLearnPopupsBlockedEl = document.getElementById('applearn-popups-blocked-stat');

            if (campaignsVisitedEl) campaignsVisitedEl.textContent = allCampaigns.size;
            if (loadingTimeEl) loadingTimeEl.innerHTML = formatLoadingTime(totalLoadingTime);
            if (placementsAddedEl) placementsAddedEl.textContent = totalPlacements;
            if (reconciliationsEl) reconciliationsEl.textContent = totalReconciliations;
            if (appLearnPopupsBlockedEl) appLearnPopupsBlockedEl.textContent = Number(data.appLearnPopupsBlocked) || 0;

            // Render Visualizations
            renderLoadingAreaBreakdown(dailyStats);
            renderCampaignInsights(data.campaignStatsSnapshots);
            renderHeatmap(dailyStats);
            renderCharts(dailyStats);
            renderFunStats(dailyStats, totalLoadingTime, totalPlacements);

            // Start Date
            const statsTitle = document.querySelector('#stats h2');

            const earliestRecordedDate = Object.keys(dailyStats)
                .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date))
                .sort()[0];
            const statsStartDate = data.statsStartDate
                || (earliestRecordedDate ? `${earliestRecordedDate}T00:00:00` : null);

            if (statsStartDate && statsTitle) {
                const startDate = new Date(statsStartDate);
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
                     avgLoadingTimeEl.innerHTML = `Avg per day: ${formatLoadingTime(avg)}`;
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
            'legacyStats': { visitedCampaigns: [], totalLoadingTime: 0, placementsAdded: 0, reconciliations: 0 },
            'dailyStats': {},
            'campaignStatsSnapshots': [],
            'appLearnPopupsBlocked': 0,
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
        if (namespace === 'local' && (changes.legacyStats || changes.dailyStats || changes.appLearnPopupsBlocked || changes.campaignStatsSnapshots)) {
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

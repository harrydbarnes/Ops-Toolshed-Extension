(function() {
    'use strict';

    const BADGE_CLASS = 'toolshed-actualise-month-assurance';
    const CORRECT_BADGE_CLASS = `${BADGE_CLASS}--correct`;
    const INCORRECT_BADGE_CLASS = `${BADGE_CLASS}--incorrect`;
    const SOURCE = 'ops-toolshed-actualise-month-bridge';
    const EVENT_TYPE = 'ops-toolshed-actualise-month-data';
    const REQUEST_TYPE = 'ops-toolshed-actualise-month-request-latest';
    const MONTH_SELECTOR = '#mos-paginator li > a';
    const ACTIVE_MONTH_SELECTOR = '#mos-paginator li.active > a';
    const CAPTION_SELECTOR = '#month-filter-toolbar .mo-caption';
    const GRID_SELECTOR = '#grid-container_hot .htCore';
    const MONTH_NAMES = Object.freeze({
        jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
        jul: '07', aug: '08', sep: '09', sept: '09', oct: '10', nov: '11', dec: '12'
    });
    const ISO_MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])(?:-\d{2})?$/;
    const MONTH_LABEL_PATTERN = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{2}|\d{4})$/i;
    const timing = window.__OPS_TOOLSHED_ACTUALISE_MONTH_TEST_TIMING__ || {};
    const RECOVERY_TIMEOUT_MS = timing.recoveryTimeoutMs || 5000;
    const POLL_MS = timing.pollMs || 100;
    const READY_STABLE_MS = timing.readyStableMs || 250;

    let initialized = false;
    let latestNativeEvidence = null;
    let recoveryPromise = null;
    let recoveryTargetKey = null;
    let lastObservedMonthKey = null;

    function normalizeText(value) {
        return String(value ?? '').replace(/\s+/g, ' ').trim();
    }

    function normalizeMonth(value) {
        const text = normalizeText(value).replace(/:$/, '').trim();
        const isoMatch = text.match(ISO_MONTH_PATTERN);
        if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}`;

        const labelMatch = text.match(MONTH_LABEL_PATTERN);
        if (!labelMatch) return null;
        const month = MONTH_NAMES[labelMatch[1].toLowerCase()];
        const year = labelMatch[2].length === 2 ? `20${labelMatch[2]}` : labelMatch[2];
        return month ? `${year}-${month}` : null;
    }

    function formatMonth(monthKey) {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey || '')) return monthKey || 'unknown month';
        const [, year, month] = monthKey.match(/^(\d{4})-(\d{2})$/);
        const monthName = Object.entries(MONTH_NAMES).find(([, value]) => value === month)?.[0] || '';
        return `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${year.slice(-2)}`;
    }

    function getHashParams() {
        return new URLSearchParams(window.location.hash.replace(/^#/, ''));
    }

    function isActualiseRoute() {
        const params = getHashParams();
        return params.get('ptb-ctx') === 'actualize' || params.get('route') === 'actualize';
    }

    function getCampaignId() {
        return getHashParams().get('campaign-id') || '';
    }

    function getExpectedMonth() {
        return normalizeMonth(getHashParams().get('mos'));
    }

    function getActiveMonth() {
        return normalizeMonth(document.querySelector(ACTIVE_MONTH_SELECTOR)?.textContent);
    }

    function getCaptionMonth() {
        return normalizeMonth(document.querySelector(CAPTION_SELECTOR)?.textContent);
    }

    function getMonthLinks() {
        return Array.from(document.querySelectorAll(MONTH_SELECTOR))
            .map(link => ({ link, month: normalizeMonth(link.textContent) }))
            .filter(item => item.month);
    }

    function getGridEvidence() {
        const tables = Array.from(document.querySelectorAll(GRID_SELECTOR));
        if (!tables.length) return { ready: false, signature: '' };

        // Handsontable keeps frozen columns in a separate clone while the
        // main table is horizontally scrolled. Combine the header evidence
        // from all table instances so horizontal scrolling does not look like
        // an unfinished month load.
        const headers = Array.from(new Set(tables.flatMap(table =>
            Array.from(table.querySelectorAll('thead th'))
                .map(cell => normalizeText(cell.textContent).toLowerCase())
        )));
        const hasActualiseHeaders = headers.includes('name') &&
            headers.includes('start date') && headers.includes('end date');
        const table = document.querySelector('#grid-container_hot .ht_master .htCore') ||
            tables.find(candidate => candidate.querySelector('tbody tr')) || tables[0];
        const rows = Array.from(table.querySelectorAll('tbody tr'));
        const signature = rows.map(row => Array.from(row.children)
            .map(cell => normalizeText(cell.textContent))
            .join('\u001f'))
            .join('\u001e');

        return {
            ready: hasActualiseHeaders,
            signature,
            rowCount: rows.length
        };
    }

    function getNativeEvidenceAssessment(expectedMonth) {
        const evidence = latestNativeEvidence;
        if (!evidence || evidence.campaignId !== getCampaignId() || evidence.requestMonth !== expectedMonth) {
            return { status: 'pending', responseMonths: evidence?.responseMonths || [] };
        }

        const responseMonths = Array.from(new Set(evidence.responseMonths || []));
        if (responseMonths.length !== 1 || responseMonths[0] !== expectedMonth) {
            return { status: 'incorrect', responseMonths };
        }
        return { status: 'correct', responseMonths };
    }

    function assessActualiseMonth() {
        if (!isActualiseRoute()) return { status: 'hidden' };

        const expectedMonth = getExpectedMonth();
        const activeMonth = getActiveMonth();
        const captionMonth = getCaptionMonth();
        const grid = getGridEvidence();
        const base = {
            expectedMonth,
            activeMonth,
            captionMonth,
            responseMonths: latestNativeEvidence?.responseMonths || [],
            gridReady: grid.ready,
            gridRowCount: grid.rowCount,
            gridSignature: grid.signature
        };

        if (!expectedMonth) {
            return {
                ...base,
                status: 'incorrect',
                reason: 'The Actualise URL has no valid mos month.'
            };
        }
        if (!activeMonth || activeMonth !== expectedMonth) {
            return {
                ...base,
                status: 'incorrect',
                reason: `URL is ${formatMonth(expectedMonth)} but the selected month is ${formatMonth(activeMonth)}.`
            };
        }
        if (captionMonth && captionMonth !== expectedMonth) {
            return {
                ...base,
                status: 'incorrect',
                reason: `URL is ${formatMonth(expectedMonth)} but the grid caption is ${formatMonth(captionMonth)}.`
            };
        }
        if (!grid.ready) {
            return {
                ...base,
                status: 'checking',
                reason: 'Waiting for the Actualise data grid.'
            };
        }

        const nativeEvidence = getNativeEvidenceAssessment(expectedMonth);
        if (nativeEvidence.status === 'incorrect') {
            return {
                ...base,
                status: 'incorrect',
                responseMonths: nativeEvidence.responseMonths,
                reason: `The native grid response is for ${nativeEvidence.responseMonths.map(formatMonth).join(', ') || 'an unreadable month'}, not ${formatMonth(expectedMonth)}.`
            };
        }
        if (nativeEvidence.status === 'pending') {
            return {
                ...base,
                status: 'checking',
                reason: 'Waiting for the native Actualise response to confirm the grid month.'
            };
        }

        return {
            ...base,
            status: 'correct',
            reason: `URL, selected month, grid and native response all confirm ${formatMonth(expectedMonth)}.`
        };
    }

    function removeBadges(root = document) {
        root.querySelectorAll(`.${BADGE_CLASS}`).forEach(badge => badge.remove());
    }

    function renderActualiseMonth(assessment, root = document) {
        const workflowWidget = root.querySelector('.workflow-widget-wrapper');
        if (!isActualiseRoute() || !workflowWidget || assessment.status === 'hidden') {
            removeBadges(root);
            return null;
        }

        const badges = Array.from(root.querySelectorAll(`.${BADGE_CLASS}`));
        const badge = workflowWidget.querySelector(`.${BADGE_CLASS}`) ||
            workflowWidget.ownerDocument.createElement('span');
        badges.forEach(existingBadge => {
            if (existingBadge !== badge) existingBadge.remove();
        });

        const isCorrect = assessment.status === 'correct';
        badge.className = `${BADGE_CLASS} ${isCorrect ? CORRECT_BADGE_CLASS : INCORRECT_BADGE_CLASS}`;
        badge.textContent = isCorrect
            ? 'Correct Month'
            : assessment.status === 'checking' ? 'Checking Month' : 'Check Month';
        badge.title = assessment.reason || '';
        badge.setAttribute('role', 'status');
        badge.setAttribute('aria-label', badge.textContent);
        badge.dataset.toolshedActualiseMonthStatus = assessment.status;
        if (assessment.expectedMonth) badge.dataset.toolshedActualiseMonth = assessment.expectedMonth;

        const dstBadge = workflowWidget.querySelector('.toolshed-dst-assurance');
        const gmiChatButton = workflowWidget.querySelector('.gmi-chat-button');
        const insertionAnchor = dstBadge || gmiChatButton;
        if (insertionAnchor && insertionAnchor.nextElementSibling !== badge) {
            workflowWidget.insertBefore(badge, insertionAnchor.nextSibling);
        } else if (!insertionAnchor && badge.parentElement !== workflowWidget) {
            workflowWidget.appendChild(badge);
        }

        return badge;
    }

    function waitForMonthReady(month, campaignId) {
        return new Promise((resolve, reject) => {
            const startedAt = Date.now();
            let stableSince = 0;

            const check = () => {
                const assessment = assessActualiseMonth();
                const nativeEvidence = getNativeEvidenceAssessment(month);
                const ready = isActualiseRoute() &&
                    getCampaignId() === campaignId &&
                    getExpectedMonth() === month &&
                    getActiveMonth() === month &&
                    (!getCaptionMonth() || getCaptionMonth() === month) &&
                    getGridEvidence().ready &&
                    nativeEvidence.status === 'correct';

                if (!ready) {
                    stableSince = 0;
                } else {
                    if (!stableSince) stableSince = Date.now();
                    if (Date.now() - stableSince >= READY_STABLE_MS) {
                        resolve(assessment);
                        return;
                    }
                }

                if (Date.now() - startedAt >= RECOVERY_TIMEOUT_MS) {
                    reject(new Error(`Timed out waiting for ${formatMonth(month)} Actualise data.`));
                    return;
                }
                window.setTimeout(check, POLL_MS);
            };
            check();
        });
    }

    async function recoverMonth(assessment) {
        const expectedMonth = assessment.expectedMonth;
        const campaignId = getCampaignId();
        const links = getMonthLinks();
        const target = links.find(item => item.month === expectedMonth);
        if (!target) return;

        const activeMonth = getActiveMonth();
        const alternate = activeMonth !== expectedMonth
            ? links.find(item => item.month === activeMonth) || links.find(item => item.month !== expectedMonth)
            : links.find(item => item.month !== expectedMonth);
        if (!alternate) return;

        if (getActiveMonth() !== alternate.month) alternate.link.click();
        if (getActiveMonth() === alternate.month) {
            await waitForMonthReady(alternate.month, campaignId);
        }

        if (getActiveMonth() !== expectedMonth) target.link.click();
        await waitForMonthReady(expectedMonth, campaignId);
    }

    function scheduleRecovery(assessment) {
        if (assessment.status !== 'incorrect' || !assessment.expectedMonth || recoveryPromise) return;

        const links = getMonthLinks();
        const target = links.find(item => item.month === assessment.expectedMonth);
        const activeMonth = getActiveMonth();
        const alternate = activeMonth !== assessment.expectedMonth
            ? links.find(item => item.month === activeMonth) || links.find(item => item.month !== assessment.expectedMonth)
            : links.find(item => item.month !== assessment.expectedMonth);
        if (!target || !alternate) return;

        const recoveryKey = `${getCampaignId()}|${assessment.expectedMonth}`;
        if (recoveryTargetKey === recoveryKey) return;
        recoveryTargetKey = recoveryKey;

        recoveryPromise = (async () => {
            try {
                await recoverMonth(assessment);
            } catch (error) {
                console.warn('[Ops Toolshed] Actualise month recovery did not complete:', error);
            } finally {
                recoveryPromise = null;
                apply();
            }
        })();
    }

    function handleNativeEvidence(event) {
        if (event.source !== window || event.origin !== window.location.origin) return;
        const message = event.data;
        if (message?.source !== SOURCE || message.type !== EVENT_TYPE) return;

        const detail = message.detail;
        if (!detail || typeof detail.requestMonth !== 'string' ||
            !Array.isArray(detail.responseMonths) || typeof detail.campaignId !== 'string') return;

        latestNativeEvidence = {
            campaignId: detail.campaignId,
            requestMonth: normalizeMonth(detail.requestMonth),
            responseMonths: detail.responseMonths.map(normalizeMonth).filter(Boolean),
            rowCount: Number.isFinite(Number(detail.rowCount)) ? Number(detail.rowCount) : null
        };
        apply();
    }

    function handleNavigation() {
        if (!recoveryPromise && lastObservedMonthKey && lastObservedMonthKey !== getExpectedMonth()) {
            recoveryTargetKey = null;
        }
        lastObservedMonthKey = getExpectedMonth();
        apply();
    }

    function apply() {
        const assessment = assessActualiseMonth();
        renderActualiseMonth(assessment);
        scheduleRecovery(assessment);
        return assessment;
    }

    function initialize() {
        if (initialized) return;
        initialized = true;
        window.addEventListener('message', handleNativeEvidence);
        window.addEventListener('hashchange', handleNavigation);
        window.addEventListener('popstate', handleNavigation);
        window.addEventListener('pageshow', apply);
        lastObservedMonthKey = getExpectedMonth();
        apply();
        // The page-world bridge can receive the native request before this
        // isolated content script is ready. Ask it to replay its latest
        // response so a valid first render is not lost.
        window.postMessage({ source: SOURCE, type: REQUEST_TYPE }, window.location.origin);
    }

    window.actualiseMonthAssuranceFeature = {
        initialize,
        apply,
        assessActualiseMonth,
        renderActualiseMonth
    };
})();

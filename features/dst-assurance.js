(function() {
    'use strict';

    const BADGE_CLASS = 'toolshed-dst-assurance';
    const CORRECT_BADGE_CLASS = `${BADGE_CLASS}--correct`;
    const INCORRECT_BADGE_CLASS = `${BADGE_CLASS}--incorrect`;
    const WARNING_CELL_CLASS = `${BADGE_CLASS}-warning-cell`;
    const WARNING_CELL_ATTRIBUTE = 'data-toolshed-dst-assurance-warning';
    const DST_FEE_PATTERN = /(?:^|:)\s*meta\s+digital\s+service\s+charge(?:\b|_)/i;
    const FACEBOOK_SUPPLIER_PATTERN = /^facebook(?:\s|[(:]|$)/i;
    const EXPECTED_DST_SUPPLIER_PATTERN = /^meta\s+digital\s+service\s+charge(?:\s|[(:]|$)/i;
    const GOOGLE_DST_MAPPINGS = Object.freeze([
        { mediaSupplier: 'GOOGLE ADS (EUR)', feeSupplier: 'GOOGLE DIGITAL SERVICE CHARGE (EUR)' },
        { mediaSupplier: 'DV360 (EUR)', feeSupplier: 'DV360 DIGITAL SERVICE CHARGE (EUR)' },
        { mediaSupplier: 'GOOGLE ADS (GBP)', feeSupplier: 'GOOGLE DIGITAL SERVICE CHARGE (GBP)' },
        { mediaSupplier: 'GOOGLE ADS-YOU TUBE (GBP)', feeSupplier: 'GOOGLE DIGITAL SERVICE CHARGE (GBP)' },
        { mediaSupplier: 'SEARCH ADS 360 (GBP)', feeSupplier: 'GOOGLE DIGITAL SERVICE CHARGE (GBP)' },
        { mediaSupplier: 'YOUTUBE GOOGLE PREFERRED', feeSupplier: 'GOOGLE DIGITAL SERVICE CHARGE (GBP)' },
        { mediaSupplier: 'DV360 (GBP)', feeSupplier: 'DV360 DIGITAL SERVICE CHARGE (GBP)' },
        { mediaSupplier: 'GOOGLE ADS (USD)', feeSupplier: 'GOOGLE DIGITAL SERVICE CHARGE (USD)' },
        { mediaSupplier: 'DV360 (USD)', feeSupplier: 'DV360 DIGITAL SERVICE CHARGE (USD)' }
    ]);
    const AMAZON_DST_MAPPINGS = Object.freeze([
        { mediaSupplier: 'AMAZON (EUR)', feeSupplier: 'AMAZON REG. ADVERTISING FEE (EUR)' },
        { mediaSupplier: 'AMAZON DSP (EUR)', feeSupplier: 'AMAZON REG. ADVERTISING FEE (EUR)' },
        { mediaSupplier: 'AMAZON (GBP)', feeSupplier: 'AMAZON REG. ADVERTISING FEE (GBP)' },
        { mediaSupplier: 'AMAZON DSP (GBP)', feeSupplier: 'AMAZON REG. ADVERTISING FEE (GBP)' },
        { mediaSupplier: 'AMAZON - TWITCH (GBP)', feeSupplier: 'AMAZON REG. ADVERTISING FEE (GBP)' },
        { mediaSupplier: 'IMDB', feeSupplier: 'AMAZON REG. ADVERTISING FEE (GBP)' },
        { mediaSupplier: 'AMAZON (USD)', feeSupplier: 'AMAZON REG. ADVERTISING FEE (USD)' }
    ]);
    const DST_RATE = 0.02;
    const AMOUNT_TOLERANCE = 0.01;
    const TOOLTIP_CLASS = `${BADGE_CLASS}-tooltip`;
    const TOOLTIP_GAP_PX = 8;
    const TOOLTIP_DISMISS_DELAY_MS = 800;
    const PINNED_TOOLTIP_DISMISS_DELAY_MS = 2000;
    const WRONG_SUPPLIER_TOOLTIP =
        'Check Meta Location Fee is booked to the correct supplier, and not the standard Facebook media supplier';
    const GOOGLE_COST_ADVISORY_TOOLTIP =
        'Please verify Google DST cost is correct, as that is not checked currently';
    const AMAZON_COST_ADVISORY_TOOLTIP =
        'Please verify Amazon DST cost is correct, as that is not checked currently';

    let enabled = true;
    let initialized = false;
    let tooltipSequence = 0;

    function normalizeText(value) {
        return String(value ?? '').replace(/\s+/g, ' ').trim();
    }

    function parseAmount(value) {
        const text = normalizeText(value);
        if (!text) return null;

        const isParenthesized = /^\(.*\)$/.test(text);
        const match = text.replace(/[£$€,,\s]/g, '').match(/-?\d+(?:\.\d+)?/);
        if (!match) return null;

        const amount = Number(match[0]);
        if (!Number.isFinite(amount)) return null;
        return isParenthesized ? -amount : amount;
    }

    function roundToPence(amount) {
        return Math.round((amount + Number.EPSILON) * 100) / 100;
    }

    function formatAmount(amount) {
        return Number.isFinite(amount) ? `£${amount.toFixed(2)}` : 'an unreadable amount';
    }

    function getCanonicalTable(root = document) {
        return root.querySelector('#grid-container_hot .ht_master .htCore') ||
            root.querySelector('.ht_master .htCore');
    }

    function getNumericClassValue(element, pattern) {
        const matchingClass = Array.from(element?.classList || [])
            .map(className => className.match(pattern))
            .find(Boolean);
        return matchingClass ? Number(matchingClass[1]) : null;
    }

    function getColumnIndexes(table) {
        const headerRow = Array.from(table.querySelectorAll('tr')).find(row =>
            Array.from(row.children).some(cell => normalizeText(cell.textContent).toLowerCase() === 'cost')
        );
        if (!headerRow) return { nameIndex: 3, costIndex: 8 };

        const headerCells = Array.from(headerRow.children);
        const findHeaderIndex = headerName => headerCells.findIndex(cell =>
            normalizeText(cell.textContent).toLowerCase() === headerName
        );

        return {
            nameIndex: findHeaderIndex('name') >= 0 ? findHeaderIndex('name') : 3,
            costIndex: findHeaderIndex('cost') >= 0 ? findHeaderIndex('cost') : 8
        };
    }

    function getRows(table) {
        const { nameIndex, costIndex } = getColumnIndexes(table);
        return Array.from(table.querySelectorAll('tr')).map((row, index) => {
            const nameCell = row.children[nameIndex] || row.querySelector('.hierarchical-name');
            const name = normalizeText(nameCell?.textContent);
            const groupLevel = getNumericClassValue(nameCell, /^hierarchical-level-group-(\d+)$/);
            const hierarchyLevel = getNumericClassValue(nameCell, /^hierarchical-level-(\d+)$/);
            const isGroup = Boolean(
                nameCell?.classList.contains('group-cell') || groupLevel !== null
            );

            return {
                index,
                name,
                amount: parseAmount(row.children[costIndex]?.textContent),
                nameCell,
                costCell: row.children[costIndex] || null,
                groupLevel,
                hierarchyLevel,
                isGroup
            };
        });
    }

    function isTopLevelGroup(row) {
        return row.isGroup && row.groupLevel === 0;
    }

    function getSectionRange(rows, sectionName) {
        const start = rows.findIndex(row =>
            isTopLevelGroup(row) && row.name.toLowerCase() === sectionName
        );
        if (start < 0) return null;

        const nextTopLevelGroup = rows.findIndex((row, index) =>
            index > start && isTopLevelGroup(row)
        );

        return {
            start,
            end: nextTopLevelGroup >= 0 ? nextTopLevelGroup : rows.length
        };
    }

    function isFacebookSupplier(name) {
        return FACEBOOK_SUPPLIER_PATTERN.test(normalizeText(name));
    }

    function isExpectedDstSupplier(name) {
        return EXPECTED_DST_SUPPLIER_PATTERN.test(normalizeText(name));
    }

    function createHiddenAssessment() {
        return {
            eligible: false,
            status: 'hidden',
            mediaBooked: null,
            feeBooked: null,
            expectedFee: null,
            supplierCorrect: false,
            amountCorrect: false,
            dstFeeRows: [],
            dstCount: 0,
            tooltip: '',
            checks: []
        };
    }

    function escapeRegExp(value) {
        return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function matchesSupplierPrefix(name, supplier) {
        const pattern = new RegExp(
            `^${escapeRegExp(normalizeText(supplier))}(?:\\s|:|_|$)`,
            'i'
        );
        return pattern.test(normalizeText(name));
    }

    function containsSupplierDescription(name, supplier) {
        const pattern = new RegExp(
            `(?:^|:)\\s*${escapeRegExp(normalizeText(supplier))}(?:\\s|:|_|$)`,
            'i'
        );
        return pattern.test(normalizeText(name));
    }

    function assessMetaDst(rows, displayRange, feeRange) {
        if (!displayRange) return createHiddenAssessment();

        const facebookSupplierRows = rows
            .slice(displayRange.start + 1, displayRange.end)
            .filter(row => row.isGroup && row.groupLevel === 1 && isFacebookSupplier(row.name));

        const mediaAmounts = facebookSupplierRows.map(row => row.amount);
        if (!facebookSupplierRows.length || mediaAmounts.some(amount => !Number.isFinite(amount))) {
            return createHiddenAssessment();
        }

        const mediaBooked = roundToPence(mediaAmounts.reduce((total, amount) => total + amount, 0));
        const expectedFee = roundToPence(mediaBooked * DST_RATE);
        const dstFeeRows = [];

        if (feeRange) {
            rows.slice(feeRange.start + 1, feeRange.end).forEach(row => {
                // The fee supplier/group row carries the authoritative DST
                // description and cost. The child booking name can vary
                // (for example, "Meta Location Fee 2%") and is irrelevant.
                if (row.isGroup && row.groupLevel === 1 && DST_FEE_PATTERN.test(row.name)) {
                    dstFeeRows.push({
                        ...row,
                        supplier: row.name,
                        supplierCorrect: isExpectedDstSupplier(row.name)
                    });
                }
            });
        }

        const feeAmounts = dstFeeRows.map(row => row.amount);
        const feeAmountsReadable = feeAmounts.every(amount => Number.isFinite(amount));
        const feeBooked = feeAmountsReadable
            ? roundToPence(feeAmounts.reduce((total, amount) => total + amount, 0))
            : null;
        const supplierCorrect = dstFeeRows.length > 0 && dstFeeRows.every(row => row.supplierCorrect);
        const amountCorrect = dstFeeRows.length > 0 && feeAmountsReadable &&
            Math.abs(feeBooked - expectedFee) <= AMOUNT_TOLERANCE + Number.EPSILON;

        const tooltipParts = [];
        if (!dstFeeRows.length) {
            tooltipParts.push('Meta Location Fee has not been booked for the Facebook media supplier.');
        } else {
            if (!supplierCorrect) tooltipParts.push(WRONG_SUPPLIER_TOOLTIP);
            if (!amountCorrect) {
                tooltipParts.push(
                    `Check Meta Location Fee is 2% of Facebook media booked ` +
                    `(${formatAmount(expectedFee)} expected; ${formatAmount(feeBooked)} booked).`
                );
            }
        }

        return {
            kind: 'meta',
            eligible: true,
            status: supplierCorrect && amountCorrect ? 'correct' : 'incorrect',
            mediaBooked,
            feeBooked,
            expectedFee,
            supplierCorrect,
            amountCorrect,
            dstFeeRows: dstFeeRows.map(row => ({
                ...row,
                kind: 'meta',
                amountCheck: true,
                amountCorrect
            })),
            tooltip: tooltipParts.join(' ')
        };
    }

    function assessMappedSupplierDst(rows, feeRange, {
        kind,
        mappings,
        platformName,
        costAdvisoryTooltip
    }) {
        const mediaEnd = feeRange?.start ?? rows.length;
        const mediaRows = rows
            .slice(0, mediaEnd)
            .filter(row => row.isGroup && row.groupLevel === 1);
        const bookedMappings = [];

        mediaRows.forEach(row => {
            const mapping = mappings.find(candidate =>
                matchesSupplierPrefix(row.name, candidate.mediaSupplier)
            );
            if (mapping && !bookedMappings.includes(mapping)) bookedMappings.push(mapping);
        });

        if (!bookedMappings.length) return createHiddenAssessment();

        const expectedFeeSuppliers = Array.from(new Set(
            bookedMappings.map(mapping => mapping.feeSupplier)
        ));
        const feeSupplierRows = feeRange
            ? rows.slice(feeRange.start + 1, feeRange.end)
                .filter(row => row.isGroup && row.groupLevel === 1)
            : [];
        const feeChecks = expectedFeeSuppliers.map(expectedSupplier => {
            const matchingRows = feeSupplierRows.filter(row =>
                containsSupplierDescription(row.name, expectedSupplier)
            );
            return {
                expectedSupplier,
                matchingRows,
                supplierCorrect: matchingRows.length > 0 && matchingRows.every(row =>
                    matchesSupplierPrefix(row.name, expectedSupplier)
                )
            };
        });
        const dstFeeRows = feeChecks.flatMap(check => check.matchingRows.map(row => ({
            ...row,
            kind,
            supplier: row.name,
            expectedSupplier: check.expectedSupplier,
            supplierCorrect: matchesSupplierPrefix(row.name, check.expectedSupplier),
            amountCheck: false,
            amountCorrect: true
        })));
        const supplierCorrect = feeChecks.every(check => check.supplierCorrect);
        const tooltipParts = [];

        feeChecks.forEach(check => {
            if (!check.matchingRows.length) {
                tooltipParts.push(
                    `${check.expectedSupplier} has not been booked for the related ${platformName} media supplier.`
                );
            } else if (!check.supplierCorrect) {
                tooltipParts.push(
                    `Check ${check.expectedSupplier} is booked to the correct supplier for the related ${platformName} media booking.`
                );
            }
        });
        tooltipParts.push(costAdvisoryTooltip);

        return {
            kind,
            eligible: true,
            status: supplierCorrect ? 'correct' : 'incorrect',
            mediaBooked: null,
            feeBooked: null,
            expectedFee: null,
            supplierCorrect,
            amountCorrect: true,
            dstFeeRows,
            tooltip: tooltipParts.join(' '),
            mediaRows,
            expectedFeeSuppliers
        };
    }

    function assessGoogleDst(rows, feeRange) {
        return assessMappedSupplierDst(rows, feeRange, {
            kind: 'google',
            mappings: GOOGLE_DST_MAPPINGS,
            platformName: 'Google',
            costAdvisoryTooltip: GOOGLE_COST_ADVISORY_TOOLTIP
        });
    }

    function assessAmazonDst(rows, feeRange) {
        return assessMappedSupplierDst(rows, feeRange, {
            kind: 'amazon',
            mappings: AMAZON_DST_MAPPINGS,
            platformName: 'Amazon',
            costAdvisoryTooltip: AMAZON_COST_ADVISORY_TOOLTIP
        });
    }

    function combineAssessments(checks) {
        const eligibleChecks = checks.filter(check => check?.eligible);
        if (!eligibleChecks.length) return createHiddenAssessment();

        const metaCheck = eligibleChecks.find(check => check.kind === 'meta');
        const supplierCorrect = eligibleChecks.every(check => check.supplierCorrect);
        const amountCorrect = eligibleChecks.every(check => check.amountCorrect);

        const dstFeeRows = eligibleChecks.flatMap(check => check.dstFeeRows || []);

        return {
            eligible: true,
            status: supplierCorrect && amountCorrect ? 'correct' : 'incorrect',
            mediaBooked: metaCheck?.mediaBooked ?? null,
            feeBooked: metaCheck?.feeBooked ?? null,
            expectedFee: metaCheck?.expectedFee ?? null,
            supplierCorrect,
            amountCorrect,
            dstFeeRows,
            dstCount: dstFeeRows.length,
            tooltip: eligibleChecks
                .map(check => check.tooltip)
                .filter(Boolean)
                .join(' '),
            checks: eligibleChecks
        };
    }

    function assessDstAssurance(root = document) {
        const table = getCanonicalTable(root);
        if (!table) return createHiddenAssessment();

        const rows = getRows(table);
        const displayRange = getSectionRange(rows, 'display');
        const feeRange = getSectionRange(rows, 'fee');
        return combineAssessments([
            assessMetaDst(rows, displayRange, feeRange),
            assessGoogleDst(rows, feeRange),
            assessAmazonDst(rows, feeRange)
        ]);
    }

    function positionDstTooltip(badge, tooltip) {
        const view = badge.ownerDocument.defaultView;
        if (!view) return;

        const badgeRect = badge.getBoundingClientRect();
        tooltip.style.top = `${Math.round(badgeRect.bottom + TOOLTIP_GAP_PX)}px`;

        const tooltipRect = tooltip.getBoundingClientRect();
        const viewportWidth = Number(view.innerWidth) || badge.ownerDocument.documentElement.clientWidth || 0;
        const viewportMargin = 12;
        let left = badgeRect.left + (badgeRect.width - tooltipRect.width) / 2;

        if (viewportWidth > 0 && tooltipRect.width > 0) {
            const maxLeft = Math.max(viewportMargin, viewportWidth - tooltipRect.width - viewportMargin);
            left = Math.min(Math.max(viewportMargin, left), maxLeft);
        }

        tooltip.style.left = `${Math.round(left)}px`;
    }

    function getDstInteractionBounds(badge, tooltip) {
        const badgeRect = badge.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        return {
            left: Math.min(badgeRect.left, tooltipRect.left),
            right: Math.max(badgeRect.right, tooltipRect.right),
            top: Math.min(badgeRect.top, tooltipRect.top),
            bottom: Math.max(badgeRect.bottom, tooltipRect.bottom)
        };
    }

    function isPointInDstInteractionArea(badge, tooltip, clientX, clientY) {
        if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return false;

        const bounds = getDstInteractionBounds(badge, tooltip);
        return clientX >= bounds.left && clientX <= bounds.right &&
            clientY >= bounds.top && clientY <= bounds.bottom;
    }

    function createDstTooltip(badge) {
        const ownerDocument = badge.ownerDocument;
        const view = ownerDocument.defaultView;
        const tooltip = ownerDocument.createElement('div');
        tooltip.className = TOOLTIP_CLASS;
        tooltip.id = `${TOOLTIP_CLASS}-${++tooltipSequence}`;
        tooltip.setAttribute('role', 'tooltip');
        tooltip.hidden = true;
        (ownerDocument.body || ownerDocument.documentElement).appendChild(tooltip);

        let dismissTimer = null;
        let isPinned = false;

        const clearDismissTimer = () => {
            if (dismissTimer === null || !view) return;
            view.clearTimeout(dismissTimer);
            dismissTimer = null;
        };
        const setExpanded = expanded => {
            badge.setAttribute('aria-expanded', String(expanded));
        };
        const show = () => {
            clearDismissTimer();
            tooltip.hidden = false;
            positionDstTooltip(badge, tooltip);
            setExpanded(true);
        };
        const hide = () => {
            clearDismissTimer();
            isPinned = false;
            tooltip.hidden = true;
            setExpanded(false);
        };
        const scheduleDismiss = () => {
            clearDismissTimer();
            if (tooltip.hidden || !view) return;
            const delay = isPinned ? PINNED_TOOLTIP_DISMISS_DELAY_MS : TOOLTIP_DISMISS_DELAY_MS;
            dismissTimer = view.setTimeout(hide, delay);
        };
        const pin = event => {
            event?.preventDefault?.();
            isPinned = true;
            show();
        };
        const handleBadgeMouseLeave = event => {
            if (isPointInDstInteractionArea(badge, tooltip, event.clientX, event.clientY)) {
                clearDismissTimer();
            } else {
                scheduleDismiss();
            }
        };
        const handleTooltipMouseEnter = () => {
            clearDismissTimer();
        };
        const handleTooltipMouseLeave = event => {
            if (isPointInDstInteractionArea(badge, tooltip, event.clientX, event.clientY)) {
                clearDismissTimer();
            } else {
                scheduleDismiss();
            }
        };
        const handleBadgeBlur = () => {
            scheduleDismiss();
        };
        const handleDocumentMouseMove = event => {
            if (tooltip.hidden) return;

            if (isPointInDstInteractionArea(badge, tooltip, event.clientX, event.clientY)) {
                clearDismissTimer();
            } else {
                scheduleDismiss();
            }
        };
        const handleKeyDown = event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            pin(event);
        };

        badge.addEventListener('mouseenter', show);
        badge.addEventListener('mouseleave', handleBadgeMouseLeave);
        badge.addEventListener('focus', show);
        badge.addEventListener('blur', handleBadgeBlur);
        badge.addEventListener('click', pin);
        badge.addEventListener('keydown', handleKeyDown);
        tooltip.addEventListener('mouseenter', handleTooltipMouseEnter);
        tooltip.addEventListener('mouseleave', handleTooltipMouseLeave);
        ownerDocument.addEventListener('mousemove', handleDocumentMouseMove);

        return {
            tooltip,
            updatePosition: () => {
                if (!tooltip.hidden) positionDstTooltip(badge, tooltip);
            },
            destroy: () => {
                clearDismissTimer();
                badge.removeEventListener('mouseenter', show);
                badge.removeEventListener('mouseleave', handleBadgeMouseLeave);
                badge.removeEventListener('focus', show);
                badge.removeEventListener('blur', handleBadgeBlur);
                badge.removeEventListener('click', pin);
                badge.removeEventListener('keydown', handleKeyDown);
                tooltip.removeEventListener('mouseenter', handleTooltipMouseEnter);
                tooltip.removeEventListener('mouseleave', handleTooltipMouseLeave);
                ownerDocument.removeEventListener('mousemove', handleDocumentMouseMove);
                tooltip.remove();
            }
        };
    }

    function ensureDstTooltip(badge, text) {
        let controller = badge._toolshedDstTooltipController;
        if (!controller || !controller.tooltip.isConnected) {
            controller?.destroy?.();
            controller = createDstTooltip(badge);
            badge._toolshedDstTooltipController = controller;
            badge.setAttribute('aria-expanded', 'false');
        }
        if (controller.tooltip.textContent !== text) {
            controller.tooltip.textContent = text;
        }
        badge.setAttribute('aria-describedby', controller.tooltip.id);
        badge.setAttribute('aria-controls', controller.tooltip.id);
        controller.updatePosition();
        return controller.tooltip;
    }

    function removeDstTooltip(badge) {
        badge._toolshedDstTooltipController?.destroy?.();
        delete badge._toolshedDstTooltipController;
        badge.removeAttribute('aria-describedby');
        badge.removeAttribute('aria-controls');
        badge.removeAttribute('aria-expanded');
    }

    function removeBadge(badge) {
        removeDstTooltip(badge);
        badge.remove();
    }

    function removeBadges(root = document) {
        root.querySelectorAll(`.${BADGE_CLASS}`).forEach(removeBadge);
    }

    function getEquivalentGridCells(cell, root) {
        if (!cell) return [];

        const grid = cell.closest('#grid-container_hot');
        const rowIndex = cell.getAttribute('data-row');
        const columnIndex = cell.getAttribute('data-col');
        if (!grid || rowIndex === null || columnIndex === null) return [cell];

        const escapeSelectorValue = value => String(value)
            .replace(/\\/g, '\\\\')
            .replace(/"/g, '\\"');
        const selector = `td[data-row="${escapeSelectorValue(rowIndex)}"]` +
            `[data-col="${escapeSelectorValue(columnIndex)}"]`;

        try {
            const copies = Array.from(grid.querySelectorAll(selector));
            return copies.length ? copies : [cell];
        } catch (error) {
            return [cell];
        }
    }

    function getDstWarningTargets(assessment, root) {
        const targets = new Set();
        if (!assessment?.eligible) return targets;

        assessment.dstFeeRows?.forEach(row => {
            if (!row.supplierCorrect) {
                getEquivalentGridCells(row.nameCell, root).forEach(cell => targets.add(cell));
            }
            if (row.amountCheck && !row.amountCorrect) {
                getEquivalentGridCells(row.costCell, root).forEach(cell => targets.add(cell));
            }
        });

        return targets;
    }

    function markDstWarningCell(cell) {
        cell.classList.add(WARNING_CELL_CLASS);
        cell.setAttribute(WARNING_CELL_ATTRIBUTE, 'true');
    }

    function clearDstWarningCell(cell) {
        cell.classList.remove(WARNING_CELL_CLASS);
        cell.removeAttribute(WARNING_CELL_ATTRIBUTE);
    }

    function renderDstCellHighlights(assessment, root = document) {
        const targets = getDstWarningTargets(assessment, root);
        const hasExistingWarnings = root.querySelector(
            `.${WARNING_CELL_CLASS}, [${WARNING_CELL_ATTRIBUTE}]`
        );
        const hasAuthoritativeDstRows = assessment?.eligible &&
            Array.isArray(assessment.dstFeeRows) && assessment.dstFeeRows.length > 0;

        // Prisma can briefly expose the Facebook rows before the Fee rows are
        // authoritative. Keep a visible warning through that intermediate
        // pass; the next complete assessment will either retarget or clear it.
        if (assessment?.eligible && !hasAuthoritativeDstRows && hasExistingWarnings) return;

        root.querySelectorAll(`.${WARNING_CELL_CLASS}, [${WARNING_CELL_ATTRIBUTE}]`).forEach(cell => {
            if (!targets.has(cell)) clearDstWarningCell(cell);
        });

        targets.forEach(markDstWarningCell);
    }

    function renderDstAssurance(assessment, root = document) {
        const workflowWidget = root.querySelector('.workflow-widget-wrapper');
        if (!enabled || !workflowWidget || !assessment?.eligible) {
            removeBadges(root);
            return null;
        }

        const badges = Array.from(root.querySelectorAll(`.${BADGE_CLASS}`));
        const badge = workflowWidget.querySelector(`.${BADGE_CLASS}`) ||
            workflowWidget.ownerDocument.createElement('span');
        badges.forEach(existingBadge => {
            if (existingBadge !== badge) removeBadge(existingBadge);
        });

        const badgeText = Number(assessment.dstCount) > 1
            ? 'DSTs Booked'
            : 'DST Booked';
        badge.className = `${BADGE_CLASS} ${assessment.status === 'correct'
            ? CORRECT_BADGE_CLASS
            : INCORRECT_BADGE_CLASS}`;
        badge.textContent = badgeText;
        badge.removeAttribute('title');
        badge.dataset.toolshedDstAssurance = assessment.status;

        const tooltipText = normalizeText(assessment.tooltip);
        const hasTooltip = tooltipText && tooltipText !== 'DST Booked';
        if (hasTooltip) {
            badge.setAttribute('role', 'button');
            badge.setAttribute('tabindex', '0');
            badge.setAttribute('aria-label', `${badgeText}: check; click for details`);
            ensureDstTooltip(badge, tooltipText);
        } else {
            badge.setAttribute('role', 'status');
            badge.removeAttribute('tabindex');
            badge.setAttribute('aria-label', badgeText);
            removeDstTooltip(badge);
        }

        const gmiChatButton = workflowWidget.querySelector('.gmi-chat-button');
        if (gmiChatButton && gmiChatButton.nextElementSibling !== badge) {
            workflowWidget.insertBefore(badge, gmiChatButton.nextSibling);
        } else if (badge.parentElement !== workflowWidget) {
            workflowWidget.appendChild(badge);
        }

        return badge;
    }

    function apply() {
        const assessment = assessDstAssurance();
        renderDstCellHighlights(assessment);
        renderDstAssurance(assessment);
        return assessment;
    }

    function initialize() {
        if (initialized) return;
        initialized = true;
        apply();

        if (typeof chrome === 'undefined' || !chrome.storage?.sync?.get) return;

        try {
            chrome.storage.sync.get('dstAssuranceEnabled', data => {
                enabled = data?.dstAssuranceEnabled !== false;
                apply();
            });
        } catch (error) {
            console.warn('DST Assurance: Could not load setting:', error);
        }

        chrome.storage.onChanged?.addListener((changes, namespace) => {
            if (namespace !== 'sync' || !changes.dstAssuranceEnabled) return;
            enabled = changes.dstAssuranceEnabled.newValue !== false;
            apply();
        });
    }

    window.dstAssuranceFeature = {
        initialize,
        apply,
        assessDstAssurance,
        renderDstAssurance
    };
})();

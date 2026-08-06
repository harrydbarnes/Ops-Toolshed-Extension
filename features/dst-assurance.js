(function() {
    'use strict';

    const BADGE_CLASS = 'toolshed-dst-assurance';
    const CORRECT_BADGE_CLASS = `${BADGE_CLASS}--correct`;
    const INCORRECT_BADGE_CLASS = `${BADGE_CLASS}--incorrect`;
    const DST_FEE_PATTERN = /\bmeta\s+digital\s+service\s+charge(?:\b|_)/i;
    const FACEBOOK_SUPPLIER_PATTERN = /^facebook(?:\s|[(:]|$)/i;
    const EXPECTED_DST_SUPPLIER_PATTERN = /^meta\s+digital\s+service\s+charge(?:\s|[(:]|$)/i;
    const DST_RATE = 0.02;
    const AMOUNT_TOLERANCE = 0.01;
    const TOOLTIP_CLASS = `${BADGE_CLASS}-tooltip`;
    const TOOLTIP_GAP_PX = 8;
    const TOOLTIP_DISMISS_DELAY_MS = 800;
    const PINNED_TOOLTIP_DISMISS_DELAY_MS = 2000;
    const WRONG_SUPPLIER_TOOLTIP =
        'Check Meta Location Fee is booked to the correct supplier, and not the standard Facebook media supplier';

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

    function assessDstAssurance(root = document) {
        const table = getCanonicalTable(root);
        if (!table) {
            return {
                eligible: false,
                status: 'hidden',
                mediaBooked: null,
                feeBooked: null,
                expectedFee: null,
                supplierCorrect: false,
                amountCorrect: false,
                tooltip: ''
            };
        }

        const rows = getRows(table);
        const displayRange = getSectionRange(rows, 'display');
        if (!displayRange) {
            return {
                eligible: false,
                status: 'hidden',
                mediaBooked: null,
                feeBooked: null,
                expectedFee: null,
                supplierCorrect: false,
                amountCorrect: false,
                tooltip: ''
            };
        }

        const facebookSupplierRows = rows
            .slice(displayRange.start + 1, displayRange.end)
            .filter(row => row.isGroup && row.groupLevel === 1 && isFacebookSupplier(row.name));

        const mediaAmounts = facebookSupplierRows.map(row => row.amount);
        if (!facebookSupplierRows.length || mediaAmounts.some(amount => !Number.isFinite(amount))) {
            return {
                eligible: false,
                status: 'hidden',
                mediaBooked: null,
                feeBooked: null,
                expectedFee: null,
                supplierCorrect: false,
                amountCorrect: false,
                tooltip: ''
            };
        }

        const mediaBooked = roundToPence(mediaAmounts.reduce((total, amount) => total + amount, 0));
        const expectedFee = roundToPence(mediaBooked * DST_RATE);
        const feeRange = getSectionRange(rows, 'fee');
        const dstFeeRows = [];
        let activeFeeSupplier = null;

        if (feeRange) {
            rows.slice(feeRange.start + 1, feeRange.end).forEach(row => {
                if (row.isGroup && row.groupLevel === 1) {
                    activeFeeSupplier = row.name;
                    return;
                }

                if (row.isGroup && row.groupLevel !== null && row.groupLevel <= 0) {
                    activeFeeSupplier = null;
                    return;
                }

                if (!row.isGroup && DST_FEE_PATTERN.test(row.name)) {
                    dstFeeRows.push({ ...row, supplier: activeFeeSupplier });
                }
            });
        }

        const feeAmounts = dstFeeRows.map(row => row.amount);
        const feeAmountsReadable = feeAmounts.every(amount => Number.isFinite(amount));
        const feeBooked = feeAmountsReadable
            ? roundToPence(feeAmounts.reduce((total, amount) => total + amount, 0))
            : null;
        const supplierCorrect = dstFeeRows.length > 0 && dstFeeRows.every(row =>
            isExpectedDstSupplier(row.supplier)
        );
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
            eligible: true,
            status: supplierCorrect && amountCorrect ? 'correct' : 'incorrect',
            mediaBooked,
            feeBooked,
            expectedFee,
            supplierCorrect,
            amountCorrect,
            tooltip: tooltipParts.join(' ')
        };
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

        badge.className = `${BADGE_CLASS} ${assessment.status === 'correct'
            ? CORRECT_BADGE_CLASS
            : INCORRECT_BADGE_CLASS}`;
        badge.textContent = 'DST Booked';
        badge.removeAttribute('title');
        badge.dataset.toolshedDstAssurance = assessment.status;

        const tooltipText = normalizeText(assessment.tooltip);
        const hasTooltip = tooltipText && tooltipText !== 'DST Booked';
        if (hasTooltip) {
            badge.setAttribute('role', 'button');
            badge.setAttribute('tabindex', '0');
            badge.setAttribute('aria-label', 'DST Booked: check; click for details');
            ensureDstTooltip(badge, tooltipText);
        } else {
            badge.setAttribute('role', 'status');
            badge.removeAttribute('tabindex');
            badge.setAttribute('aria-label', 'DST Booked: correct');
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

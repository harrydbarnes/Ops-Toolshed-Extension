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
    const DST_START_MONTH = '2026-07';
    const DST_START_DATE = Date.UTC(2026, 6, 1);
    const MONTH_NUMBERS = Object.freeze({
        jan: 1,
        january: 1,
        feb: 2,
        february: 2,
        mar: 3,
        march: 3,
        apr: 4,
        april: 4,
        may: 5,
        jun: 6,
        june: 6,
        jul: 7,
        july: 7,
        aug: 8,
        august: 8,
        sep: 9,
        sept: 9,
        september: 9,
        oct: 10,
        october: 10,
        nov: 11,
        november: 11,
        dec: 12,
        december: 12
    });
    const MONTH_HEADER_PATTERN = /\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(\d{2}|\d{4})\b/i;
    const TOOLTIP_CLASS = `${BADGE_CLASS}-tooltip`;
    const TOOLTIP_GAP_PX = 8;
    const TOOLTIP_DISMISS_DELAY_MS = 800;
    const PINNED_TOOLTIP_DISMISS_DELAY_MS = 2000;
    const WRONG_SUPPLIER_TOOLTIP =
        'Check Meta Location Fee is booked to the correct supplier, and not the standard Facebook media supplier';
    const STRADDLING_META_TOOLTIP =
        'This booking straddles the Meta DST introduction period from July 2026. ' +
        'Please verify the Meta Location Fee is booked correctly in Flighting Layout.';
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

    function parseDateValue(value) {
        const text = normalizeText(value);
        if (!text) return null;

        const match = text.match(/^(?:(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})|(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2}))(?:\b|$)/);
        if (!match) return null;

        const day = Number(match[1] || match[6]);
        const month = Number(match[2] || match[5]);
        const year = Number(match[3] || match[4]);
        if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) {
            return null;
        }

        const timestamp = Date.UTC(year, month - 1, day);
        const date = new Date(timestamp);
        return date.getUTCFullYear() === year &&
            date.getUTCMonth() === month - 1 &&
            date.getUTCDate() === day
            ? timestamp
            : null;
    }

    function roundToPence(amount) {
        return Math.round((amount + Number.EPSILON) * 100) / 100;
    }

    function formatAmount(amount) {
        return Number.isFinite(amount) ? `£${amount.toFixed(2)}` : 'an unreadable amount';
    }

    function parseMonthKey(value) {
        const match = normalizeText(value).match(MONTH_HEADER_PATTERN);
        if (!match) return null;

        const monthNumber = MONTH_NUMBERS[match[1].toLowerCase()];
        let year = Number(match[2]);
        if (!monthNumber || !Number.isFinite(year)) return null;
        if (year < 100) year += 2000;

        return `${year}-${String(monthNumber).padStart(2, '0')}`;
    }

    function getFlightingMonthColumns(table, tableRows = null) {
        const rows = tableRows || Array.from(table.querySelectorAll('tr'));
        const monthHeaderRowIndex = rows.findIndex((row, rowIndex) => {
            const followingRow = rows[rowIndex + 1];
            if (!followingRow) return false;

            return Array.from(row.children).some((cell, columnIndex) => {
                const monthKey = parseMonthKey(cell.textContent);
                const subHeader = followingRow.children[columnIndex];
                return monthKey && normalizeText(subHeader?.textContent).toLowerCase() === 'planned cost';
            });
        });
        if (monthHeaderRowIndex < 0) return [];

        const monthHeaderRow = rows[monthHeaderRowIndex];
        const plannedCostHeaderRow = rows[monthHeaderRowIndex + 1];

        return Array.from(monthHeaderRow.children).map((cell, columnIndex) => {
            const monthKey = parseMonthKey(cell.textContent);
            const subHeader = plannedCostHeaderRow.children[columnIndex];
            if (!monthKey || normalizeText(subHeader?.textContent).toLowerCase() !== 'planned cost') {
                return null;
            }

            return { monthKey, columnIndex };
        }).filter(Boolean);
    }

    function summarizePlannedCosts(monthCostCells, minimumMonthKey = null) {
        const applicableCells = monthCostCells.filter(month =>
            !minimumMonthKey || month.monthKey >= minimumMonthKey
        );
        const plannedAmountsReadable = applicableCells.every(month => Number.isFinite(month.amount));

        return {
            plannedAmount: plannedAmountsReadable && applicableCells.length > 0
                ? roundToPence(applicableCells.reduce((total, month) => total + month.amount, 0))
                : null,
            hasPlannedValue: applicableCells.some(month => normalizeText(month.cell?.textContent)),
            monthCostCells: applicableCells
        };
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

    function getColumnIndexes(table, tableRows = null) {
        const rows = tableRows || Array.from(table.querySelectorAll('tr'));
        const headerRow = rows.find(row =>
            Array.from(row.children).some(cell => normalizeText(cell.textContent).toLowerCase() === 'cost')
        );
        if (!headerRow) {
            return { nameIndex: 3, costIndex: 8, startDateIndex: 5, endDateIndex: 6 };
        }

        const headerCells = Array.from(headerRow.children);
        const findHeaderIndex = headerName => headerCells.findIndex(cell =>
            normalizeText(cell.textContent).toLowerCase() === headerName
        );

        return {
            nameIndex: findHeaderIndex('name') >= 0 ? findHeaderIndex('name') : 3,
            costIndex: findHeaderIndex('cost') >= 0 ? findHeaderIndex('cost') : 8,
            startDateIndex: findHeaderIndex('start date') >= 0 ? findHeaderIndex('start date') : 5,
            endDateIndex: findHeaderIndex('end date') >= 0 ? findHeaderIndex('end date') : 6
        };
    }

    function getRows(table, monthColumns = [], tableRows = null) {
        const rows = tableRows || Array.from(table.querySelectorAll('tr'));
        const { nameIndex, costIndex, startDateIndex, endDateIndex } = getColumnIndexes(table, rows);
        return rows.map((row, index) => {
            const nameCell = row.children[nameIndex] || row.querySelector('.hierarchical-name');
            const name = normalizeText(nameCell?.textContent);
            const groupLevel = getNumericClassValue(nameCell, /^hierarchical-level-group-(\d+)$/);
            const hierarchyLevel = getNumericClassValue(nameCell, /^hierarchical-level-(\d+)$/);
            const isGroup = Boolean(
                nameCell?.classList.contains('group-cell') || groupLevel !== null
            );
            // Only supplier/group rows participate in the DST checks. Avoid
            // reading every monthly cell for every placement row in a large
            // Handsontable; the row names and hierarchy are still collected so
            // section ranges remain correct.
            const monthCostCells = groupLevel === 1
                ? monthColumns.map(month => {
                    const cell = row.children[month.columnIndex] || null;
                    const text = normalizeText(cell?.textContent);
                    return {
                        monthKey: month.monthKey,
                        cell,
                        amount: text ? parseAmount(text) : 0
                    };
                })
                : [];
            const plannedCosts = monthCostCells.length
                ? summarizePlannedCosts(monthCostCells)
                : { plannedAmount: null, hasPlannedValue: false, monthCostCells };

            return {
                index,
                name,
                amount: parseAmount(row.children[costIndex]?.textContent),
                startDate: parseDateValue(row.children[startDateIndex]?.textContent),
                endDate: parseDateValue(row.children[endDateIndex]?.textContent),
                ...plannedCosts,
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

    function getDescendantRows(rows, groupRow, rangeEnd) {
        const descendants = [groupRow];

        for (let index = groupRow.index + 1; index < rangeEnd; index += 1) {
            const row = rows[index];
            if (row.isGroup && row.groupLevel !== null && row.groupLevel <= groupRow.groupLevel) {
                break;
            }
            descendants.push(row);
        }

        return descendants;
    }

    function getFacebookDateCoverage(rows, facebookSupplierRows, displayRange) {
        const starts = [];
        const ends = [];

        facebookSupplierRows.forEach(supplierRow => {
            const descendants = getDescendantRows(rows, supplierRow, displayRange.end);
            descendants.forEach(row => {
                if (Number.isFinite(row.startDate)) starts.push(row.startDate);
                if (Number.isFinite(row.endDate)) ends.push(row.endDate);
            });
        });

        if (!starts.length || !ends.length) return null;

        return {
            start: Math.min(...starts),
            end: Math.max(...ends)
        };
    }

    function getMetaDateCoverageStatus(coverage) {
        if (!coverage) return 'unknown';
        if (coverage.end < DST_START_DATE) return 'pre-july';
        if (coverage.start >= DST_START_DATE) return 'post-july';
        return 'straddling';
    }

    function getMetaFeeRows(rows, feeRange) {
        if (!feeRange) return [];

        return rows.slice(feeRange.start + 1, feeRange.end)
            .filter(row => row.isGroup && row.groupLevel === 1 && DST_FEE_PATTERN.test(row.name))
            .map(row => ({
                ...row,
                supplier: row.name,
                supplierCorrect: isExpectedDstSupplier(row.name)
            }));
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

    function assessMetaDst(rows, displayRange, feeRange, monthColumns = []) {
        if (!displayRange) return createHiddenAssessment();

        const facebookSupplierRows = rows
            .slice(displayRange.start + 1, displayRange.end)
            .filter(row => row.isGroup && row.groupLevel === 1 && isFacebookSupplier(row.name));
        if (!facebookSupplierRows.length) return createHiddenAssessment();

        const dateCoverage = getFacebookDateCoverage(rows, facebookSupplierRows, displayRange);
        const dateCoverageStatus = getMetaDateCoverageStatus(dateCoverage);
        if (dateCoverageStatus === 'unknown' || dateCoverageStatus === 'pre-july') {
            return createHiddenAssessment();
        }

        const baseDstFeeRows = getMetaFeeRows(rows, feeRange);
        if (dateCoverageStatus === 'straddling' && monthColumns.length === 0) {
            const supplierCorrect = baseDstFeeRows.length > 0 &&
                baseDstFeeRows.every(row => row.supplierCorrect);
            const tooltipParts = [];

            if (!baseDstFeeRows.length) {
                tooltipParts.push('Meta Location Fee has not been booked for the Facebook media supplier.');
            } else if (!supplierCorrect) {
                tooltipParts.push(WRONG_SUPPLIER_TOOLTIP);
            }
            tooltipParts.push(STRADDLING_META_TOOLTIP);

            return {
                kind: 'meta',
                eligible: true,
                status: 'incorrect',
                mediaBooked: null,
                feeBooked: null,
                expectedFee: null,
                supplierCorrect,
                amountCorrect: false,
                dstFeeRows: baseDstFeeRows.map(row => ({
                    ...row,
                    kind: 'meta',
                    amountCheck: false,
                    amountCorrect: false
                })),
                tooltip: tooltipParts.join(' ')
            };
        }

        const mediaAmounts = monthColumns.length
            ? facebookSupplierRows.map(row =>
                summarizePlannedCosts(row.monthCostCells, DST_START_MONTH).plannedAmount
            )
            : facebookSupplierRows.map(row => row.amount);
        if (mediaAmounts.some(amount => !Number.isFinite(amount)) ||
            mediaAmounts.every(amount => amount <= 0)) {
            return createHiddenAssessment();
        }

        const mediaBooked = roundToPence(mediaAmounts.reduce((total, amount) => total + amount, 0));
        const expectedFee = roundToPence(mediaBooked * DST_RATE);
        const dstFeeRows = monthColumns.length
            ? baseDstFeeRows.flatMap(row => {
                // The fee supplier/group row carries the authoritative DST
                // description and cost. The child booking name can vary
                // (for example, "Meta Location Fee 2%") and is irrelevant.
                const metaPlannedCosts = summarizePlannedCosts(row.monthCostCells, DST_START_MONTH);
                return metaPlannedCosts.hasPlannedValue
                    ? [{ ...row, ...metaPlannedCosts }]
                    : [];
            })
            : baseDstFeeRows;

        const feeAmounts = dstFeeRows.map(row => monthColumns.length ? row.plannedAmount : row.amount);
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
                    `Check Meta Location Fee is 2% of Facebook media booked from July 2026 onwards ` +
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

        const tableRows = Array.from(table.querySelectorAll('tr'));
        const monthColumns = getFlightingMonthColumns(table, tableRows);
        const rows = getRows(table, monthColumns, tableRows);
        const displayRange = getSectionRange(rows, 'display');
        const feeRange = getSectionRange(rows, 'fee');
        return combineAssessments([
            assessMetaDst(rows, displayRange, feeRange, monthColumns),
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
        root.querySelectorAll(`.workflow-widget-wrapper .${BADGE_CLASS}`).forEach(removeBadge);
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
                const monthlyCostCells = (row.monthCostCells || [])
                    .map(month => month.cell)
                    .filter(Boolean);
                const costCells = monthlyCostCells.length ? monthlyCostCells : [row.costCell];
                costCells.forEach(costCell => {
                    getEquivalentGridCells(costCell, root).forEach(cell => targets.add(cell));
                });
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
        const gridRoot = root.matches?.('#grid-container_hot')
            ? root
            : root.querySelector?.('#grid-container_hot');
        if (!gridRoot) return;

        const hasExistingWarnings = gridRoot.querySelector(
            `.${WARNING_CELL_CLASS}, [${WARNING_CELL_ATTRIBUTE}]`
        );
        const hasAuthoritativeDstRows = assessment?.eligible &&
            Array.isArray(assessment.dstFeeRows) && assessment.dstFeeRows.length > 0;

        // Prisma can briefly expose the Facebook rows before the Fee rows are
        // authoritative. Keep a visible warning through that intermediate
        // pass; the next complete assessment will either retarget or clear it.
        if (assessment?.eligible && !hasAuthoritativeDstRows && hasExistingWarnings) return;

        gridRoot.querySelectorAll(`.${WARNING_CELL_CLASS}, [${WARNING_CELL_ATTRIBUTE}]`).forEach(cell => {
            if (!targets.has(cell)) clearDstWarningCell(cell);
        });

        targets.forEach(markDstWarningCell);
    }

    function renderDstAssurance(assessment, root = document) {
        const workflowWidget = root.matches?.('.workflow-widget-wrapper')
            ? root
            : root.querySelector?.('.workflow-widget-wrapper');
        if (!enabled || !workflowWidget || !assessment?.eligible) {
            removeBadges(root);
            return null;
        }

        const badges = Array.from(workflowWidget.querySelectorAll(`.${BADGE_CLASS}`));
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
        if (!enabled) {
            renderDstCellHighlights({ eligible: false });
            const hiddenAssessment = createHiddenAssessment();
            renderDstAssurance(hiddenAssessment);
            return hiddenAssessment;
        }
        const assessment = assessDstAssurance();
        renderDstCellHighlights(assessment);
        renderDstAssurance(assessment);
        return assessment;
    }

    function initialize() {
        if (initialized) return;
        initialized = true;

        if (typeof chrome === 'undefined' || !chrome.storage?.sync?.get) {
            apply();
            return;
        }

        try {
            chrome.storage.sync.get('dstAssuranceEnabled', data => {
                enabled = data?.dstAssuranceEnabled !== false;
                // Do not parse a potentially large Prisma grid until the
                // setting has confirmed the feature is enabled.
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

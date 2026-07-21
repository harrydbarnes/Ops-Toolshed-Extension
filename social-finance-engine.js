(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.socialFinanceEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const META_ALIASES = {
        accountId: ['account id', 'account_id'],
        campaignId: ['campaign id', 'campaign_id'],
        campaignName: ['campaign name', 'campaign'],
        account: ['account name', 'account'],
        month: ['month', 'reporting month'],
        reportingStart: ['reporting starts', 'report start'],
        spend: ['amount spent (gbp)', 'amount spent', 'spend'],
        budget: ['campaign budget', 'ad set budget', 'budget'],
        budgetType: ['campaign budget type', 'budget type'],
        status: ['delivery', 'delivery status', 'effective status', 'status'],
        start: ['ad set start', 'ad set start date', 'scheduled start', 'starts'],
        end: ['ad set end', 'ad set end date', 'scheduled end', 'ends'],
        adSetId: ['ad set id', 'adset id'],
        adSetName: ['ad set name', 'adset name']
    };

    const PRISMA_ALIASES = {
        accountId: ['partner account id', 'partner account id.', 'partner id'],
        campaignId: ['partner line id', 'partner line id.'],
        month: ['period', 'month'],
        planned: ['planned_amount', 'planned amount', 'gross amount', 'gross planned amount'],
        campaignName: ['campaign name', 'plan name', 'order name'],
        client: ['client name', 'client'],
        partner: ['partner'],
        integratedStatus: ['integrated status'],
        owner: ['placement creator', 'owner'],
        start: ['days in flight start date', 'placement start date', 'booked start date', 'start date'],
        end: ['days in flight end date', 'flight end date', 'placement end date', 'booked end date', 'end date']
    };

    function parseCsv(text) {
        const source = String(text || '').replace(/^\uFEFF/, '');
        const matrix = [];
        let row = [];
        let field = '';
        let quoted = false;
        for (let index = 0; index < source.length; index++) {
            const char = source[index];
            if (quoted) {
                if (char === '"' && source[index + 1] === '"') {
                    field += '"';
                    index++;
                } else if (char === '"') quoted = false;
                else field += char;
            } else if (char === '"') quoted = true;
            else if (char === ',') {
                row.push(field);
                field = '';
            } else if (char === '\n') {
                row.push(field);
                if (row.some(value => String(value).trim() !== '')) matrix.push(row);
                row = [];
                field = '';
            } else if (char !== '\r') field += char;
        }
        row.push(field);
        if (row.some(value => String(value).trim() !== '')) matrix.push(row);
        if (!matrix.length) return { headers: [], rows: [] };

        const headers = matrix[0].map((value, index) => String(value || `Column_${index + 1}`).trim());
        const rows = matrix.slice(1).map(values => {
            const output = {};
            headers.forEach((header, index) => { output[header] = values[index] ?? ''; });
            return output;
        });
        return { headers, rows };
    }

    function normalizeHeader(value) {
        return String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
    }

    function resolveColumns(headers, aliases) {
        const normalized = new Map(headers.map(header => [normalizeHeader(header), header]));
        const resolved = {};
        Object.entries(aliases).forEach(([key, candidates]) => {
            resolved[key] = candidates.map(normalizeHeader).map(candidate => normalized.get(candidate)).find(Boolean) || null;
        });
        return resolved;
    }

    function cleanId(value) {
        return String(value ?? '').trim().replace(/^="(.*)"$/, '$1').replace(/\.0$/, '');
    }

    function parseMoney(value) {
        const normalized = String(value ?? '').replace(/[£$€,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
        if (!normalized || !/^-?\d+(\.\d+)?$/.test(normalized)) return null;
        const number = Number(normalized);
        return Number.isFinite(number) ? number : null;
    }

    function toIsoDate(date) {
        return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : '';
    }

    function parseDate(value, monthFirst = false) {
        const raw = String(value ?? '').trim();
        if (!raw) return null;
        const monthNames = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
        let match = raw.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/);
        if (match) return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3] || 1)));
        match = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
        if (match) {
            const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
            const first = Number(match[1]);
            const second = Number(match[2]);
            const month = monthFirst ? first : second;
            const day = monthFirst ? second : first;
            const date = new Date(Date.UTC(year, month - 1, day));
            return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
        }
        match = raw.match(/^(?:\d{1,2}\s+)?([A-Za-z]{3,9})\s+(\d{2,4})$/);
        if (match) {
            const month = monthNames[match[1].slice(0, 3).toLowerCase()];
            const year = Number(match[2]) < 100 ? 2000 + Number(match[2]) : Number(match[2]);
            if (month !== undefined) return new Date(Date.UTC(year, month, 1));
        }
        const parsed = new Date(raw);
        return Number.isNaN(parsed.getTime()) ? null : new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
    }

    function monthStart(value) {
        const date = parseDate(value);
        return date ? new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)) : null;
    }

    function endOfMonth(date) {
        return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
    }

    function addWorkingDays(date, count) {
        const output = new Date(date.getTime());
        let added = 0;
        while (added < count) {
            output.setUTCDate(output.getUTCDate() + 1);
            if (output.getUTCDay() !== 0 && output.getUTCDay() !== 6) added++;
        }
        return output;
    }

    function daysBetween(left, right) {
        if (!left || !right) return null;
        return Math.round((left.getTime() - right.getTime()) / 86400000);
    }

    function normalizeName(value) {
        const stopWords = new Set(['the', 'and', 'campaign', 'meta', 'facebook', 'instagram', 'fb', 'ig', 'paid', 'social']);
        return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/)
            .filter(token => token.length > 1 && !stopWords.has(token));
    }

    function nameSimilarity(left, right) {
        const a = new Set(normalizeName(left));
        const b = new Set(normalizeName(right));
        if (!a.size || !b.size) return 0;
        const intersection = [...a].filter(token => b.has(token)).length;
        return (2 * intersection) / (a.size + b.size);
    }

    function inferMonth(row, columns) {
        return monthStart(row[columns.month] || row[columns.reportingStart]);
    }

    function recordKey(accountId, campaignId, month) {
        return `${accountId}|${campaignId}|${toIsoDate(month)}`;
    }

    function campaignKey(accountId, campaignId) {
        return `${accountId}|${campaignId}`;
    }

    function aggregateMeta(parsed) {
        const columns = resolveColumns(parsed.headers, META_ALIASES);
        const errors = [];
        ['accountId', 'campaignId', 'spend'].forEach(key => {
            if (!columns[key]) errors.push(`Meta export is missing ${key === 'accountId' ? 'Account ID' : key === 'campaignId' ? 'Campaign ID' : 'Amount spent'}.`);
        });
        if (!columns.month && !columns.reportingStart) errors.push('Meta export is missing Month or Reporting starts.');
        if (errors.length) return { columns, records: [], errors };

        const groups = new Map();
        parsed.rows.forEach((row, rowIndex) => {
            const accountId = cleanId(row[columns.accountId]);
            const campaignId = cleanId(row[columns.campaignId]);
            const month = inferMonth(row, columns);
            if (!accountId || !campaignId || !month) return;
            const key = recordKey(accountId, campaignId, month);
            const spend = parseMoney(row[columns.spend]) || 0;
            const budgetRaw = columns.budget ? String(row[columns.budget] || '').trim() : '';
            const budget = parseMoney(budgetRaw);
            const budgetType = columns.budgetType ? String(row[columns.budgetType] || '').trim() : '';
            const start = columns.start ? parseDate(row[columns.start]) : null;
            const end = columns.end ? parseDate(row[columns.end]) : null;
            const existing = groups.get(key) || {
                key, accountId, campaignId, month, account: '', campaignName: '', status: '', spend: 0,
                budget: null, budgetRaw: '', budgetType: '', start: null, end: null, rows: 0, sourceRows: []
            };
            existing.account ||= columns.account ? String(row[columns.account] || '').trim() : '';
            existing.campaignName ||= columns.campaignName ? String(row[columns.campaignName] || '').trim() : '';
            existing.status ||= columns.status ? String(row[columns.status] || '').trim() : '';
            existing.spend += spend;
            existing.budgetRaw ||= budgetRaw;
            existing.budgetType ||= budgetType;
            if (budget !== null) existing.budget = existing.budget === null ? budget : Math.max(existing.budget, budget);
            if (start && (!existing.start || start < existing.start)) existing.start = start;
            if (end && (!existing.end || end > existing.end)) existing.end = end;
            existing.rows++;
            existing.sourceRows.push(rowIndex + 2);
            groups.set(key, existing);
        });
        return { columns, records: [...groups.values()], errors };
    }

    function extractMetaReferenceData(parsed) {
        const columns = resolveColumns(parsed.headers, META_ALIASES);
        const errors = [];
        if (!columns.accountId) errors.push('Meta export is missing Account ID.');
        if (!columns.campaignId) errors.push('Meta export is missing Campaign ID.');
        if (errors.length) return { accounts: [], campaigns: [], adSets: [], errors };

        const accounts = new Map();
        const campaigns = new Map();
        const adSets = new Map();
        parsed.rows.forEach(row => {
            const accountId = cleanId(row[columns.accountId]);
            const campaignId = cleanId(row[columns.campaignId]);
            const adSetId = columns.adSetId ? cleanId(row[columns.adSetId]) : '';
            if (accountId && !accounts.has(accountId)) accounts.set(accountId, {
                id: accountId,
                name: columns.account ? String(row[columns.account] || '').trim() || accountId : accountId,
                lastSynced: ''
            });
            if (accountId && campaignId && !campaigns.has(campaignId)) campaigns.set(campaignId, {
                id: campaignId,
                name: columns.campaignName ? String(row[columns.campaignName] || '').trim() : '',
                accountId
            });
            if (campaignId && adSetId && !adSets.has(adSetId)) adSets.set(adSetId, {
                id: adSetId,
                name: columns.adSetName ? String(row[columns.adSetName] || '').trim() : '',
                campaignId
            });
        });
        return { accounts: [...accounts.values()], campaigns: [...campaigns.values()], adSets: [...adSets.values()], errors };
    }

    function aggregatePrisma(parsed) {
        const columns = resolveColumns(parsed.headers, PRISMA_ALIASES);
        const errors = [];
        ['accountId', 'campaignId', 'month', 'planned'].forEach(key => {
            if (!columns[key]) errors.push(`Prisma export is missing ${key === 'accountId' ? 'Partner account id' : key === 'campaignId' ? 'Partner line id' : key === 'month' ? 'Period' : 'PLANNED_AMOUNT/Gross Amount'}.`);
        });
        if (errors.length) return { columns, records: [], allRows: [], errors };

        const groups = new Map();
        const allRows = [];
        parsed.rows.forEach((row, rowIndex) => {
            const accountId = cleanId(row[columns.accountId]);
            const campaignId = cleanId(row[columns.campaignId]);
            const month = monthStart(row[columns.month]);
            const partner = columns.partner ? String(row[columns.partner] || '').trim() : '';
            const normalized = {
                accountId, campaignId, month, partner,
                planned: parseMoney(row[columns.planned]) || 0,
                campaignName: columns.campaignName ? String(row[columns.campaignName] || '').trim() : '',
                client: columns.client ? String(row[columns.client] || '').trim() : '',
                integratedStatus: columns.integratedStatus ? String(row[columns.integratedStatus] || '').trim() : '',
                owner: columns.owner ? String(row[columns.owner] || '').trim() : '',
                start: columns.start ? parseDate(row[columns.start], true) : null,
                end: columns.end ? parseDate(row[columns.end], true) : null,
                sourceRow: rowIndex + 2
            };
            allRows.push(normalized);
            if (!accountId || !campaignId || !month) return;
            const key = recordKey(accountId, campaignId, month);
            const existing = groups.get(key) || {
                key, accountId, campaignId, month, planned: 0, campaignName: '', client: '', integratedStatus: '',
                owner: '', partner: '', start: null, end: null, rows: 0, sourceRows: []
            };
            existing.planned += normalized.planned;
            existing.campaignName ||= normalized.campaignName;
            existing.client ||= normalized.client;
            existing.integratedStatus ||= normalized.integratedStatus;
            existing.owner ||= normalized.owner;
            existing.partner ||= normalized.partner;
            if (normalized.start && (!existing.start || normalized.start < existing.start)) existing.start = normalized.start;
            if (normalized.end && (!existing.end || normalized.end > existing.end)) existing.end = normalized.end;
            existing.rows++;
            existing.sourceRows.push(normalized.sourceRow);
            groups.set(key, existing);
        });
        return { columns, records: [...groups.values()], allRows, errors };
    }

    function findCandidate(meta, prismaRows) {
        const sameMonth = prismaRows.filter(row => row.accountId === meta.accountId && row.month && toIsoDate(row.month) === toIsoDate(meta.month));
        let best = null;
        sameMonth.forEach(row => {
            const nameScore = nameSimilarity(meta.campaignName, row.campaignName);
            const budgetReference = meta.spend;
            const budgetScore = budgetReference > 0 && row.planned > 0
                ? Math.max(0, 1 - Math.abs(budgetReference - row.planned) / Math.max(budgetReference, row.planned))
                : 0;
            const score = (nameScore * 0.7) + (budgetScore * 0.3);
            if (!best || score > best.score) best = { row, score, nameScore, budgetScore };
        });
        return best && best.score >= 0.72 ? best : null;
    }

    function summarizeRows(rows) {
        const reportRows = rows || [];
        return {
            total: reportRows.length,
            matched: reportRows.filter(row => row.evidence === 'Matched').length,
            missingOrUnlinked: reportRows.filter(row => row.evidence === 'Missing/unlinked').length,
            needsUpdate: reportRows.filter(row => row.evidence === 'Needs update').length,
            monitor: reportRows.filter(row => row.evidence === 'Monitor').length,
            investigate: reportRows.filter(row => row.evidence === 'Investigate').length,
            outsideScope: reportRows.filter(row => row.evidence === 'Outside scope').length,
            unmatchedSpend: reportRows.filter(row => row.evidence === 'Missing/unlinked').reduce((sum, row) => sum + (row.metaSpend || 0), 0),
            metaSpend: reportRows.reduce((sum, row) => sum + (row.metaSpend || 0), 0),
            prismaPlanned: reportRows.reduce((sum, row) => sum + (row.prismaPlanned || 0), 0)
        };
    }

    function compare(metaParsed, prismaParsed, options = {}) {
        const meta = aggregateMeta(metaParsed);
        const prisma = aggregatePrisma(prismaParsed);
        const validationErrors = [...meta.errors, ...prisma.errors];
        if (validationErrors.length) return { rows: [], summary: {}, validationErrors, warnings: [] };

        const tolerance = Number.isFinite(Number(options.tolerance)) ? Number(options.tolerance) : 1;
        const accountIdScope = new Set((options.accountIdScope || []).map(cleanId).filter(Boolean));
        const metaRecords = accountIdScope.size ? meta.records.filter(record => accountIdScope.has(record.accountId)) : meta.records;
        const prismaRecords = accountIdScope.size ? prisma.records.filter(record => accountIdScope.has(record.accountId)) : prisma.records;
        const prismaAllRows = accountIdScope.size ? prisma.allRows.filter(record => accountIdScope.has(record.accountId)) : prisma.allRows;
        const asOfDate = parseDate(options.asOfDate) || new Date();
        const closedWorkingDay = Number(options.closedWorkingDay) || 5;
        const prismaByKey = new Map(prismaRecords.map(record => [record.key, record]));
        const prismaCampaigns = new Map();
        const prismaCampaignMonths = new Map();
        prismaRecords.forEach(record => {
            const idKey = campaignKey(record.accountId, record.campaignId);
            if (!prismaCampaigns.has(idKey)) prismaCampaigns.set(idKey, []);
            prismaCampaigns.get(idKey).push(record);
        });
        prisma.records.forEach(record => {
            const monthKey = `${record.campaignId}|${toIsoDate(record.month)}`;
            if (!prismaCampaignMonths.has(monthKey)) prismaCampaignMonths.set(monthKey, []);
            prismaCampaignMonths.get(monthKey).push(record);
        });
        const metaKeys = new Set(metaRecords.map(record => record.key));
        const metaMonths = new Set(metaRecords.map(record => toIsoDate(record.month).slice(0, 7)));
        const prismaMonths = new Set(prismaRecords.map(record => toIsoDate(record.month).slice(0, 7)));
        const handledPrismaKeys = new Set();
        const reportRows = [];

        metaRecords.forEach(platform => {
            const booking = prismaByKey.get(platform.key);
            const otherMonths = prismaCampaigns.get(campaignKey(platform.accountId, platform.campaignId)) || [];
            const accountMismatches = (prismaCampaignMonths.get(`${platform.campaignId}|${toIsoDate(platform.month)}`) || [])
                .filter(record => record.accountId !== platform.accountId);
            const issues = [];
            let classification = 'Matched: booking evidence valid';
            let evidence = 'Matched';
            let candidate = null;

            const monthClosed = asOfDate > addWorkingDays(endOfMonth(platform.month), closedWorkingDay);
            if (!booking) {
                if (accountMismatches.length) {
                    classification = 'Account ID mismatch: Campaign ID is booked under another Prisma partner';
                    evidence = 'Investigate';
                    issues.push(`Meta Account ID ${platform.accountId}; Prisma Partner account ID ${accountMismatches.map(item => item.accountId).join(', ')}`);
                    accountMismatches.forEach(item => handledPrismaKeys.add(item.key));
                } else if (otherMonths.length) {
                    classification = 'Month update needed: Campaign ID is booked in another month';
                    evidence = 'Needs update';
                    issues.push(`Prisma months: ${otherMonths.map(item => toIsoDate(item.month).slice(0, 7)).join(', ')}`);
                } else if (!prismaMonths.has(toIsoDate(platform.month).slice(0, 7))) {
                    classification = 'Outside Prisma reporting months';
                    evidence = 'Outside scope';
                    issues.push(`Prisma report does not include ${toIsoDate(platform.month).slice(0, 7)}`);
                } else {
                    candidate = findCandidate(platform, prismaAllRows);
                    if (candidate) {
                        classification = 'Likely booked but unlinked: add Partner line ID';
                        evidence = 'Investigate';
                        issues.push(`Possible Prisma row ${candidate.row.sourceRow}; candidate confidence ${Math.round(candidate.score * 100)}%`);
                    } else {
                        const missingLabel = options.populationConfirmed ? 'Missing from Prisma' : 'No linked Prisma booking found';
                        classification = platform.spend > tolerance
                            ? `${missingLabel}: spending`
                            : `${missingLabel}: pre-flight`;
                        evidence = 'Missing/unlinked';
                    }
                }
            } else {
                const spendVariance = platform.spend - booking.planned;
                const startVariance = daysBetween(platform.start, booking.start);
                const endVariance = daysBetween(platform.end, booking.end);
                const updateKinds = [];
                const reviewKinds = [];

                if (platform.start && booking.start && platform.start < booking.start) {
                    issues.push('Meta starts before Prisma');
                    updateKinds.push('schedule');
                } else if (startVariance !== null && startVariance !== 0) {
                    issues.push(`Start date differs by ${startVariance} day(s)`);
                    reviewKinds.push('schedule');
                }
                if (platform.end && booking.end && platform.end > booking.end) {
                    issues.push('Meta ends after Prisma');
                    updateKinds.push('schedule');
                } else if (endVariance !== null && endVariance !== 0) {
                    issues.push(`End date differs by ${endVariance} day(s)`);
                    reviewKinds.push('schedule');
                }

                if (spendVariance > tolerance) {
                    updateKinds.push('spend');
                    issues.push(`Meta spend exceeds Prisma booking by ${spendVariance.toFixed(2)}`);
                } else if (spendVariance < -tolerance && monthClosed) {
                    updateKinds.push('reconciliation');
                    issues.push(`Prisma booking exceeds closed-month Meta spend by ${Math.abs(spendVariance).toFixed(2)}`);
                } else if (spendVariance < -tolerance) {
                    reviewKinds.push('in-flight spend');
                    issues.push(`In-flight Meta spend is below Prisma booking by ${Math.abs(spendVariance).toFixed(2)}`);
                }

                if (platform.budget === null && platform.budgetRaw) issues.push(`Budget not comparable: ${platform.budgetRaw}`);

                const uniqueUpdates = [...new Set(updateKinds)];
                const uniqueReviews = [...new Set(reviewKinds)];
                if (uniqueUpdates.length > 1) {
                    classification = `Multiple updates needed: ${uniqueUpdates.join(' and ')} differ`;
                    evidence = 'Needs update';
                } else if (uniqueUpdates[0] === 'schedule') {
                    classification = 'Date update needed: Meta extends outside Prisma';
                    evidence = 'Needs update';
                } else if (uniqueUpdates[0] === 'spend') {
                    classification = 'Spend update needed: Meta spend exceeds Prisma booking';
                    evidence = 'Needs update';
                } else if (uniqueUpdates[0] === 'reconciliation') {
                    classification = 'Closed-month reconciliation needed: Prisma booking exceeds Meta spend';
                    evidence = 'Needs update';
                } else if (uniqueReviews.includes('schedule')) {
                    classification = 'Date difference: review booking coverage';
                    evidence = 'Investigate';
                } else if (uniqueReviews.includes('in-flight spend')) {
                    classification = 'In-flight spend difference: monitor';
                    evidence = 'Monitor';
                }
            }

            reportRows.push({
                accountId: platform.accountId,
                campaignId: platform.campaignId,
                month: toIsoDate(platform.month).slice(0, 7),
                account: platform.account,
                campaignName: platform.campaignName,
                status: platform.status,
                metaSpend: platform.spend,
                metaBudget: platform.budget,
                metaBudgetType: platform.budgetType,
                prismaPlanned: booking?.planned ?? null,
                variance: booking ? platform.spend - booking.planned : platform.spend,
                metaStart: toIsoDate(platform.start),
                metaEnd: toIsoDate(platform.end),
                prismaStart: toIsoDate(booking?.start),
                prismaEnd: toIsoDate(booking?.end),
                classification,
                evidence,
                issues,
                owner: booking?.owner || candidate?.row.owner || '',
                candidateScore: candidate ? Math.round(candidate.score * 100) : null
            });
        });

        prismaRecords.filter(record => !metaKeys.has(record.key) && !handledPrismaKeys.has(record.key)).forEach(booking => {
            const month = toIsoDate(booking.month).slice(0, 7);
            const outsideMetaMonths = !metaMonths.has(month);
            reportRows.push({
                accountId: booking.accountId, campaignId: booking.campaignId, month, account: booking.client,
                campaignName: booking.campaignName, status: '', metaSpend: null, metaBudget: null, metaBudgetType: '',
                prismaPlanned: booking.planned, variance: -booking.planned,
                metaStart: '', metaEnd: '', prismaStart: toIsoDate(booking.start), prismaEnd: toIsoDate(booking.end),
                classification: outsideMetaMonths ? 'Outside Meta reporting months' : 'Prisma booking absent from Meta population',
                evidence: outsideMetaMonths ? 'Outside scope' : 'Investigate',
                issues: [outsideMetaMonths ? `Meta report does not include ${month}` : 'Confirm Meta export account and reporting window are complete'], owner: booking.owner, candidateScore: null
            });
        });

        const summary = summarizeRows(reportRows);
        const warnings = [];
        if (!meta.columns.start || !meta.columns.end) warnings.push('Meta schedule dates are unavailable; month coverage is checked instead.');
        if (!prisma.columns.start || !prisma.columns.end) warnings.push('Prisma booked start/end dates are unavailable; exact-day comparison cannot be completed.');
        if (!meta.columns.status) warnings.push('Meta delivery status is unavailable; £0 rows cannot be distinguished reliably as scheduled or inactive.');
        if (meta.columns.budget) warnings.push('Meta campaign budget is context only; monthly findings compare Amount spent with Prisma PLANNED_AMOUNT.');
        if (!options.populationConfirmed) warnings.push('Population completeness is not confirmed; missing rows prove no linked booking was found, not that no Prisma booking exists anywhere.');
        const sourceAccounts = [...new Map(meta.records.map(record => [record.accountId, { id: record.accountId, name: record.account || record.accountId }])).values()]
            .sort((left, right) => left.name.localeCompare(right.name));
        return { rows: reportRows, summary, validationErrors, warnings, columns: { meta: meta.columns, prisma: prisma.columns }, sourceAccounts };
    }

    function escapeCsv(value) {
        let text = value === null || value === undefined ? '' : String(value);
        // Campaign names and other export text are untrusted spreadsheet input.
        // Prefix formula-like strings so opening the report in Excel cannot run them.
        if (typeof value === 'string' && /^\s*[=+\-@]/.test(text)) text = `'${text}`;
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }

    function reportToCsv(rows) {
        const headers = ['Account ID', 'Campaign ID', 'Month', 'Account / Client', 'Campaign Name', 'Status', 'Meta Spend', 'Meta Budget', 'Meta Budget Type', 'Prisma Planned', 'Variance', 'Meta Start', 'Meta End', 'Prisma Start', 'Prisma End', 'Classification', 'Evidence', 'Issues', 'Owner'];
        const fields = ['accountId', 'campaignId', 'month', 'account', 'campaignName', 'status', 'metaSpend', 'metaBudget', 'metaBudgetType', 'prismaPlanned', 'variance', 'metaStart', 'metaEnd', 'prismaStart', 'prismaEnd', 'classification', 'evidence', 'issues', 'owner'];
        return [headers.join(','), ...rows.map(row => fields.map(field => escapeCsv(field === 'issues' ? row.issues.join('; ') : row[field])).join(','))].join('\r\n');
    }

    return { parseCsv, resolveColumns, aggregateMeta, extractMetaReferenceData, aggregatePrisma, compare, summarizeRows, reportToCsv, nameSimilarity, parseDate, parseMoney };
});

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
        start: ['campaign start', 'campaign start date', 'ad set start', 'ad set start date', 'scheduled start', 'starts'],
        end: ['campaign end', 'campaign end date', 'ad set end', 'ad set end date', 'scheduled end', 'ends'],
        adSetId: ['ad set id', 'adset id'],
        adSetName: ['ad set name', 'adset name']
    };

    const PRISMA_ALIASES = {
        accountId: ['partner account id', 'partner account id.', 'partner id'],
        campaignId: ['partner line id', 'partner line id.'],
        month: ['period', 'month'],
        planned: ['planned_amount', 'planned amount', 'gross amount', 'gross planned amount'],
        campaignName: ['campaign name', 'plan name', 'order name'],
        placementName: ['placement name', 'prisma placement name'],
        client: ['client name', 'client'],
        product: ['product name', 'product'],
        partner: ['partner'],
        orderStatus: ['order current status', 'order status'],
        integratedStatus: ['integrated status'],
        deliveryStatus: ['delivery status'],
        flightStatus: ['flight status'],
        periodStatus: ['period status'],
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

    function usableId(value) {
        const id = cleanId(value);
        return Boolean(id) && !['none', 'n/a', 'na', 'null', 'unknown'].includes(id.toLowerCase());
    }

    function prismaWorkflowIssues(row) {
        const issues = [];
        const order = String(row.orderStatus || '').trim().toLowerCase();
        const integrated = String(row.integratedStatus || '').trim().toLowerCase();
        const delivery = String(row.deliveryStatus || '').trim().toLowerCase();
        if (order.includes('needsrevision') || order.includes('needs revision')) issues.push(`Prisma order status: ${row.orderStatus}`);
        if (integrated.includes('not integrated')) issues.push(`Prisma integration status: ${row.integratedStatus}`);
        if (delivery.includes('not received')) issues.push(`Prisma delivery status: ${row.deliveryStatus}`);
        return issues;
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

    function extractPrismaReferenceData(parsed) {
        const columns = resolveColumns(parsed.headers, PRISMA_ALIASES);
        const errors = [];
        if (!columns.accountId) {
            errors.push('Prisma export is missing Partner account id, so its client scope cannot be checked.');
            return { accounts: [], errors };
        }

        const accounts = new Map();
        const clientProducts = new Map();
        parsed.rows.forEach(row => {
            const accountId = cleanId(row[columns.accountId]);
            if (!usableId(accountId)) return;
            const existing = accounts.get(accountId) || { id: accountId, clients: new Set(), rows: 0, months: new Set() };
            const client = columns.client ? String(row[columns.client] || '').trim() : '';
            const product = columns.product ? String(row[columns.product] || '').trim() : '';
            const month = columns.month ? toIsoDate(monthStart(row[columns.month])) : '';
            if (client) existing.clients.add(client);
            if (month) existing.months.add(month);
            existing.rows++;
            accounts.set(accountId, existing);
            if (client || product) {
                const key = `${client}\u0000${product}`;
                const scope = clientProducts.get(key) || { client, product, accountIds: new Set() };
                scope.accountIds.add(accountId);
                clientProducts.set(key, scope);
            }
        });
        return {
            accounts: [...accounts.values()].map(account => ({
                id: account.id,
                clients: [...account.clients].sort(),
                rows: account.rows,
                months: [...account.months].sort()
            })),
            clientProducts: [...clientProducts.values()].map(scope => ({
                client: scope.client,
                product: scope.product,
                accountIds: [...scope.accountIds].sort()
            })).sort((left, right) => `${left.client}|${left.product}`.localeCompare(`${right.client}|${right.product}`)),
            errors
        };
    }

    function aggregatePrisma(parsed) {
        const columns = resolveColumns(parsed.headers, PRISMA_ALIASES);
        const errors = [];
        ['accountId', 'campaignId', 'month', 'planned'].forEach(key => {
            if (!columns[key]) errors.push(`Prisma export is missing ${key === 'accountId' ? 'Partner account id' : key === 'campaignId' ? 'Partner line id' : key === 'month' ? 'Period' : 'PLANNED_AMOUNT/Gross Amount'}.`);
        });
        if (errors.length) return { columns, records: [], allRows: [], unintegratedRows: [], errors };

        const groups = new Map();
        const allRows = [];
        const unintegratedRows = [];
        parsed.rows.forEach((row, rowIndex) => {
            const accountId = cleanId(row[columns.accountId]);
            const campaignId = cleanId(row[columns.campaignId]);
            const month = monthStart(row[columns.month]);
            const partner = columns.partner ? String(row[columns.partner] || '').trim() : '';
            const normalized = {
                accountId, campaignId, month, partner,
                planned: parseMoney(row[columns.planned]) || 0,
                campaignName: columns.campaignName ? String(row[columns.campaignName] || '').trim() : '',
                placementName: columns.placementName ? String(row[columns.placementName] || '').trim() : '',
                client: columns.client ? String(row[columns.client] || '').trim() : '',
                product: columns.product ? String(row[columns.product] || '').trim() : '',
                orderStatus: columns.orderStatus ? String(row[columns.orderStatus] || '').trim() : '',
                integratedStatus: columns.integratedStatus ? String(row[columns.integratedStatus] || '').trim() : '',
                deliveryStatus: columns.deliveryStatus ? String(row[columns.deliveryStatus] || '').trim() : '',
                flightStatus: columns.flightStatus ? String(row[columns.flightStatus] || '').trim() : '',
                periodStatus: columns.periodStatus ? String(row[columns.periodStatus] || '').trim() : '',
                owner: columns.owner ? String(row[columns.owner] || '').trim() : '',
                start: columns.start ? parseDate(row[columns.start], true) : null,
                end: columns.end ? parseDate(row[columns.end], true) : null,
                sourceRow: rowIndex + 2
            };
            const usableAccount = usableId(accountId);
            const usableCampaign = usableId(campaignId);
            const bookingLike = Boolean(month || normalized.planned || usableAccount || usableCampaign);
            if (!bookingLike && !usableAccount && !usableCampaign) return;
            if (usableAccount) allRows.push(normalized);
            if (!usableAccount || !usableCampaign) {
                unintegratedRows.push(normalized);
                return;
            }
            if (!month) return;
            const key = recordKey(accountId, campaignId, month);
            const existing = groups.get(key) || {
                key, accountId, campaignId, month, planned: 0, campaignName: '', placementNames: [], client: '', product: '', orderStatus: '', integratedStatus: '', deliveryStatus: '', flightStatus: '', periodStatus: '',
                owner: '', partner: '', start: null, end: null, rows: 0, sourceRows: []
            };
            existing.planned += normalized.planned;
            existing.campaignName ||= normalized.campaignName;
            if (normalized.placementName && !existing.placementNames.includes(normalized.placementName)) existing.placementNames.push(normalized.placementName);
            existing.client ||= normalized.client;
            existing.product ||= normalized.product;
            existing.orderStatus ||= normalized.orderStatus;
            existing.integratedStatus ||= normalized.integratedStatus;
            existing.deliveryStatus ||= normalized.deliveryStatus;
            existing.flightStatus ||= normalized.flightStatus;
            existing.periodStatus ||= normalized.periodStatus;
            existing.owner ||= normalized.owner;
            existing.partner ||= normalized.partner;
            if (normalized.start && (!existing.start || normalized.start < existing.start)) existing.start = normalized.start;
            if (normalized.end && (!existing.end || normalized.end > existing.end)) existing.end = normalized.end;
            existing.rows++;
            existing.sourceRows.push(normalized.sourceRow);
            groups.set(key, existing);
        });
        return { columns, records: [...groups.values()], allRows, unintegratedRows, errors };
    }

    function referenceTokens(value) {
        return new Set(String(value || '').toLowerCase().match(/\b[a-z]{2,}[-_]?\d{4,}\b|\b\d{4,}\b/g) || []);
    }

    function campaignNameScore(left, right) {
        const tokenScore = nameSimilarity(left, right);
        const leftReferences = referenceTokens(left);
        const rightReferences = referenceTokens(right);
        const sharedReferences = [...leftReferences].filter(token => rightReferences.has(token));
        return { score: sharedReferences.length ? Math.max(tokenScore, 0.94) : tokenScore, sharedReferences };
    }

    function valueSimilarity(left, right) {
        const a = Number(left);
        const b = Number(right);
        if (!(a > 0) || !(b > 0)) return null;
        return Math.max(0, 1 - Math.abs(a - b) / Math.max(a, b));
    }

    function dateSimilarity(meta, prisma) {
        if (!meta.start || !meta.end || !prisma.start || !prisma.end) return null;
        const start = Math.max(meta.start.getTime(), prisma.start.getTime());
        const end = Math.min(meta.end.getTime(), prisma.end.getTime());
        const unionStart = Math.min(meta.start.getTime(), prisma.start.getTime());
        const unionEnd = Math.max(meta.end.getTime(), prisma.end.getTime());
        if (unionEnd <= unionStart) return meta.start.getTime() === prisma.start.getTime() ? 1 : 0;
        return Math.max(0, end - start) / (unionEnd - unionStart);
    }

    function scopeSimilarity(mapping, prisma) {
        const expected = mapping || {};
        const checks = [];
        if (expected.client && prisma.client) checks.push(String(expected.client).trim().toLowerCase() === String(prisma.client).trim().toLowerCase() ? 1 : 0);
        if (expected.product && prisma.product) checks.push(String(expected.product).trim().toLowerCase() === String(prisma.product).trim().toLowerCase() ? 1 : 0);
        return checks.length ? checks.reduce((sum, value) => sum + value, 0) / checks.length : null;
    }

    function candidateKey(row) {
        if (row.key) return row.key;
        return `${row.accountId || ''}|prisma-row-${row.sourceRow || 0}|${toIsoDate(row.month)}`;
    }

    function findCandidates(meta, prismaRows, options = {}) {
        const sameMonth = prismaRows.filter(row => row.accountId === meta.accountId && row.month && toIsoDate(row.month) === toIsoDate(meta.month));
        const rejected = new Set(options.rejectedKeys || []);
        const weights = options.monthClosed
            ? { name: 0.45, dates: 0.15, scope: 0.10, amount: 0.30 }
            : { name: 0.55, dates: 0.25, scope: 0.15, amount: 0.05 };
        const limit = options.limit === Infinity ? Infinity : Number.isFinite(options.limit) ? options.limit : 3;
        const ranked = sameMonth.map(row => {
            const key = candidateKey(row);
            if (rejected.has(key)) return null;
            const placementNames = Array.isArray(row.placementNames) ? row.placementNames : row.placementName ? [row.placementName] : [];
            const candidateName = [row.campaignName, ...placementNames].filter(Boolean).join(' ');
            const name = campaignNameScore(meta.campaignName, candidateName);
            const values = {
                name: meta.campaignName && row.campaignName ? name.score : null,
                dates: dateSimilarity(meta, row),
                scope: scopeSimilarity(options.mapping, row),
                amount: valueSimilarity(meta.spend, row.planned)
            };
            const available = Object.entries(values).filter(([, value]) => value !== null);
            const totalWeight = available.reduce((sum, [feature]) => sum + weights[feature], 0);
            const score = totalWeight ? available.reduce((sum, [feature, value]) => sum + (weights[feature] * value), 0) / totalWeight : 0;
            const hasCorroboratingEvidence = (values.name || 0) > 0 || (values.dates || 0) > 0 || (values.scope || 0) > 0;
            const reasons = [];
            if (name.sharedReferences.length) reasons.push(`shared reference ${name.sharedReferences.slice(0, 2).join(', ')}`);
            else if (values.name !== null) reasons.push(`name ${Math.round(values.name * 100)}%`);
            if (values.dates !== null) reasons.push(values.dates >= 0.9 ? 'flight dates align' : `date overlap ${Math.round(values.dates * 100)}%`);
            if (values.scope !== null) reasons.push(values.scope === 1 ? 'client/product align' : 'client/product differ');
            if (values.amount !== null) reasons.push(`${options.monthClosed ? 'closed-month' : 'current-month'} amount ${Math.round(values.amount * 100)}%`);
            return {
                key,
                prismaKey: row.key || '',
                campaignId: row.campaignId || '',
                campaignName: row.campaignName || '',
                placementNames,
                client: row.client || '',
                product: row.product || '',
                planned: row.planned,
                owner: row.owner || '',
                sourceRow: row.sourceRow || row.sourceRows?.[0] || null,
                score: Math.round(score * 100),
                reasons,
                weights: { ...weights },
                hasCorroboratingEvidence
            };
        }).filter(Boolean).sort((left, right) => right.score - left.score).slice(0, limit);
        return ranked.map((candidate, index) => {
            const lead = index === 0 ? candidate.score - (ranked[1]?.score || 0) : 0;
            const level = candidate.hasCorroboratingEvidence && candidate.score >= 85 && (ranked.length === 1 || lead >= 10)
                ? 'Strong candidate'
                : candidate.hasCorroboratingEvidence && candidate.score >= 65 ? 'Possible candidate' : 'Low evidence';
            return { ...candidate, level };
        });
    }

    function summarizeRows(rows) {
        const reportRows = rows || [];
        const campaignBudgets = new Map();
        reportRows.forEach(row => {
            if (row.metaBudget === null || row.metaBudget === undefined || row.metaBudget === '') return;
            const key = `${row.accountId || ''}|${row.campaignId || ''}`;
            const budget = Number(row.metaBudget);
            if (Number.isFinite(budget)) campaignBudgets.set(key, Math.max(campaignBudgets.get(key) || 0, budget));
        });
        const metaSpend = reportRows.reduce((sum, row) => sum + (row.metaSpend || 0), 0);
        const prismaPlanned = reportRows.reduce((sum, row) => sum + (row.prismaPlanned || 0), 0);
        return {
            total: reportRows.length,
            matched: reportRows.filter(row => row.evidence === 'Matched').length,
            missingOrUnlinked: reportRows.filter(row => row.evidence === 'Missing/unlinked').length,
            needsUpdate: reportRows.filter(row => row.evidence === 'Needs update').length,
            monitor: reportRows.filter(row => row.evidence === 'Monitor').length,
            investigate: reportRows.filter(row => row.evidence === 'Investigate').length,
            outsideScope: reportRows.filter(row => row.evidence === 'Outside scope').length,
            unmatchedSpend: reportRows.filter(row => row.evidence === 'Missing/unlinked' || (row.evidence === 'Investigate' && row.candidates?.length)).reduce((sum, row) => sum + (row.metaSpend || 0), 0),
            metaBudget: [...campaignBudgets.values()].reduce((sum, budget) => sum + budget, 0),
            metaSpend,
            prismaPlanned,
            variance: metaSpend - prismaPlanned
        };
    }

    function compare(metaParsed, prismaParsed, options = {}) {
        const meta = aggregateMeta(metaParsed);
        const prisma = aggregatePrisma(prismaParsed);
        const validationErrors = [...meta.errors, ...prisma.errors];
        if (validationErrors.length) return { rows: [], summary: {}, validationErrors, warnings: [] };

        const tolerance = Number.isFinite(Number(options.tolerance)) ? Number(options.tolerance) : 1;
        const manualMatches = options.manualMatches && typeof options.manualMatches === 'object' ? options.manualMatches : {};
        const rejectedCandidates = options.rejectedCandidates && typeof options.rejectedCandidates === 'object' ? options.rejectedCandidates : {};
        const accountMappings = options.accountMappings && typeof options.accountMappings === 'object' ? options.accountMappings : {};
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
        const metaAccountMonths = new Set(metaRecords.map(record => `${record.accountId}|${toIsoDate(record.month).slice(0, 7)}`));
        const prismaAccountMonths = new Set(prismaRecords.map(record => `${record.accountId}|${toIsoDate(record.month).slice(0, 7)}`));
        const coverageGaps = [...metaAccountMonths].filter(key => !prismaAccountMonths.has(key)).map(key => {
            const [accountId, month] = key.split('|');
            return { accountId, month };
        });
        const sharedMonths = [...metaMonths].filter(month => prismaMonths.has(month)).sort();
        const coverage = {
            metaMonths: [...metaMonths].sort(),
            prismaMonths: [...prismaMonths].sort(),
            sharedMonths,
            gaps: coverageGaps,
            isComplete: Boolean(metaAccountMonths.size) && coverageGaps.length === 0
        };
        const populationConfirmed = options.populationConfirmed === true && coverage.isComplete;
        const linkedPrismaKeys = new Set(metaRecords.map(platform => {
            const manualBooking = manualMatches[platform.key] ? prismaByKey.get(manualMatches[platform.key]) : null;
            return (manualBooking || prismaByKey.get(platform.key))?.key;
        }).filter(Boolean));
        const handledPrismaKeys = new Set();
        const reportRows = [];

        metaRecords.forEach(platform => {
            const manualBooking = manualMatches[platform.key] ? prismaByKey.get(manualMatches[platform.key]) : null;
            const booking = manualBooking || prismaByKey.get(platform.key);
            const otherMonths = prismaCampaigns.get(campaignKey(platform.accountId, platform.campaignId)) || [];
            const accountMismatches = (prismaCampaignMonths.get(`${platform.campaignId}|${toIsoDate(platform.month)}`) || [])
                .filter(record => record.accountId !== platform.accountId);
            const issues = [];
            let classification = 'Matched: booking evidence valid';
            let evidence = 'Matched';
            let candidate = null;
            let candidates = [];
            let candidatePool = [];
            if (manualBooking) {
                handledPrismaKeys.add(manualBooking.key);
                issues.push(`Manual match to Prisma Partner line ID ${manualBooking.campaignId}`);
            }

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
                    const candidateRows = [...prismaRecords, ...prismaAllRows.filter(row => !row.campaignId)]
                        .filter(row => !row.key || !linkedPrismaKeys.has(row.key));
                    candidatePool = findCandidates(platform, candidateRows, {
                        monthClosed,
                        mapping: accountMappings[platform.accountId] || {},
                        rejectedKeys: rejectedCandidates[platform.key] || [],
                        limit: Infinity
                    });
                    candidates = candidatePool.slice(0, 3);
                    candidate = candidates[0] && candidates[0].level !== 'Low evidence' ? candidates[0] : null;
                    if (candidate) {
                        classification = candidate.campaignId
                            ? 'Possible Prisma campaign match: confirm link'
                            : 'Likely booked but unlinked: add Partner line ID';
                        evidence = 'Investigate';
                        issues.push(`${candidate.level}: ${candidate.score}% match score${candidate.reasons.length ? ` (${candidate.reasons.join('; ')})` : ''}`);
                    } else {
                        const missingLabel = populationConfirmed ? 'Missing from Prisma' : 'No linked Prisma booking found';
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
                const workflowIssues = prismaWorkflowIssues(booking);
                if (workflowIssues.length) {
                    issues.push(...workflowIssues);
                    if (evidence === 'Matched') {
                        classification = 'Prisma workflow review needed';
                        evidence = 'Investigate';
                    } else if (evidence === 'Needs update') {
                        classification = 'Prisma workflow and booking update needed';
                    }
                }
                if (manualBooking && evidence === 'Matched') classification = 'Matched manually: booking evidence valid';
            }

            reportRows.push({
                accountId: platform.accountId,
                campaignId: platform.campaignId,
                metaKey: platform.key,
                month: toIsoDate(platform.month).slice(0, 7),
                account: platform.account,
                campaignName: platform.campaignName,
                status: platform.status,
                metaSpend: platform.spend,
                metaBudget: platform.budget,
                metaBudgetType: platform.budgetType,
                prismaPlanned: booking?.planned ?? null,
                prismaClient: booking?.client || candidate?.client || '',
                prismaProduct: booking?.product || candidate?.product || '',
                prismaKey: booking?.key || '',
                variance: booking ? platform.spend - booking.planned : platform.spend,
                metaStart: toIsoDate(platform.start),
                metaEnd: toIsoDate(platform.end),
                prismaStart: toIsoDate(booking?.start),
                prismaEnd: toIsoDate(booking?.end),
                prismaOrderStatus: booking?.orderStatus || '',
                prismaIntegratedStatus: booking?.integratedStatus || '',
                prismaDeliveryStatus: booking?.deliveryStatus || '',
                prismaFlightStatus: booking?.flightStatus || '',
                prismaPeriodStatus: booking?.periodStatus || '',
                prismaPlacementNames: booking?.placementNames || [],
                prismaWorkflowIssues: booking ? prismaWorkflowIssues(booking) : [],
                classification,
                evidence,
                issues,
                owner: booking?.owner || candidate?.owner || '',
                candidateScore: candidate?.score ?? null,
                candidates,
                candidatePool,
                monthClosed
            });
        });

        prismaRecords.filter(record => !metaKeys.has(record.key) && !handledPrismaKeys.has(record.key)).forEach(booking => {
            const month = toIsoDate(booking.month).slice(0, 7);
            const outsideMetaMonths = !metaMonths.has(month);
            reportRows.push({
                accountId: booking.accountId, campaignId: booking.campaignId, month, account: booking.client,
                metaKey: '', prismaKey: booking.key,
                campaignName: booking.campaignName, status: '', metaSpend: null, metaBudget: null, metaBudgetType: '',
                prismaPlanned: booking.planned, variance: -booking.planned,
                prismaClient: booking.client, prismaProduct: booking.product,
                metaStart: '', metaEnd: '', prismaStart: toIsoDate(booking.start), prismaEnd: toIsoDate(booking.end),
                prismaOrderStatus: booking.orderStatus || '', prismaIntegratedStatus: booking.integratedStatus || '', prismaDeliveryStatus: booking.deliveryStatus || '', prismaFlightStatus: booking.flightStatus || '', prismaPeriodStatus: booking.periodStatus || '', prismaPlacementNames: booking.placementNames || [], prismaWorkflowIssues: prismaWorkflowIssues(booking),
                classification: outsideMetaMonths ? 'Outside Meta reporting months' : 'Prisma booking absent from Meta population',
                evidence: outsideMetaMonths ? 'Outside scope' : 'Investigate',
                issues: [outsideMetaMonths ? `Meta report does not include ${month}` : 'Confirm Meta export account and reporting window are complete'], owner: booking.owner, candidateScore: null, candidates: [], candidatePool: [], monthClosed: false
            });
        });

        const summary = summarizeRows(reportRows);
        const warnings = [];
        if (!meta.columns.start || !meta.columns.end) warnings.push('Meta campaign dates are unavailable; month coverage is checked instead. Sync through the Meta API or include campaign start and end columns in the report.');
        if (!prisma.columns.start || !prisma.columns.end) warnings.push('Prisma booked start/end dates are unavailable; exact-day comparison cannot be completed.');
        if (!meta.columns.status) warnings.push('Meta delivery status is unavailable; £0 rows cannot be distinguished reliably as scheduled or inactive.');
        if (meta.columns.budget) warnings.push('Meta campaign budget is context only; monthly findings compare Amount spent with Prisma PLANNED_AMOUNT.');
        if (!coverage.isComplete) warnings.push(`Prisma report coverage is incomplete for ${coverageGaps.length} selected Meta account-month${coverageGaps.length === 1 ? '' : 's'}; missing campaigns are not yet definitive.`);
        if (prisma.unintegratedRows.length) warnings.push(`${prisma.unintegratedRows.length} Prisma row${prisma.unintegratedRows.length === 1 ? '' : 's'} have no usable Partner account ID or Partner line ID. They are retained as unintegrated booking evidence but cannot be linked automatically.`);
        const sourceAccounts = [...new Map(meta.records.map(record => [record.accountId, { id: record.accountId, name: record.account || record.accountId }])).values()]
            .sort((left, right) => left.name.localeCompare(right.name));
        return { rows: reportRows, summary, validationErrors, warnings, coverage, prismaUnintegratedRows: prisma.unintegratedRows, columns: { meta: meta.columns, prisma: prisma.columns }, sourceAccounts };
    }

    function escapeCsv(value) {
        let text = value === null || value === undefined ? '' : String(value);
        // Campaign names and other export text are untrusted spreadsheet input.
        // Prefix formula-like strings so opening the report in Excel cannot run them.
        if (typeof value === 'string' && /^\s*[=+\-@]/.test(text)) text = `'${text}`;
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }

    function reportToCsv(rows) {
        const headers = [
            'Account ID', 'Meta account name', 'Campaign ID', 'Campaign name', 'Month', 'Meta delivery status',
            'Meta spend', 'Meta campaign budget', 'Meta budget type', 'Prisma client', 'Prisma product', 'Prisma placement name(s)', 'Prisma booked', 'Variance',
            'Meta campaign start', 'Meta campaign end', 'Prisma flight start', 'Prisma flight end',
            'Prisma order status', 'Prisma integration status', 'Prisma delivery status', 'Prisma flight status', 'Prisma period status',
            'Finding', 'Evidence', 'Supporting evidence', 'Prisma workflow issues', 'Prisma placement creator', 'Candidate match score'
        ];
        const fields = [
            'accountId', 'account', 'campaignId', 'campaignName', 'month', 'status',
            'metaSpend', 'metaBudget', 'metaBudgetType', 'prismaClient', 'prismaProduct', 'prismaPlacementNames', 'prismaPlanned', 'variance',
            'metaStart', 'metaEnd', 'prismaStart', 'prismaEnd',
            'prismaOrderStatus', 'prismaIntegratedStatus', 'prismaDeliveryStatus', 'prismaFlightStatus', 'prismaPeriodStatus',
            'classification', 'evidence', 'issues', 'prismaWorkflowIssues', 'owner', 'candidateScore'
        ];
        const valueFor = (row, field) => Array.isArray(row[field]) ? row[field].join('; ') : row[field];
        return [headers.join(','), ...rows.map(row => fields.map(field => escapeCsv(valueFor(row, field))).join(','))].join('\r\n');
    }

    return { parseCsv, resolveColumns, aggregateMeta, extractMetaReferenceData, extractPrismaReferenceData, aggregatePrisma, compare, summarizeRows, reportToCsv, nameSimilarity, findCandidates, parseDate, parseMoney };
});

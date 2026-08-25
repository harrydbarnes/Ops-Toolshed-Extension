(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.socialFinanceEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const META_ALIASES = {
        accountId: ['account id', 'account_id'],
        businessId: ['business id', 'business_id', 'business manager id', 'business manager id.'],
        campaignId: ['campaign id', 'campaign_id'],
        campaignName: ['campaign name', 'campaign'],
        account: ['account name', 'account'],
        month: ['month', 'reporting month'],
        reportingStart: ['reporting starts', 'report start'],
        spend: ['amount spent (gbp)', 'amount spent', 'spend'],
        currency: ['account currency', 'currency'],
        timezone: ['account timezone', 'timezone'],
        timezoneOffset: ['account timezone offset', 'timezone offset'],
        budget: ['campaign budget', 'ad set budget', 'budget'],
        budgetType: ['campaign budget type', 'budget type'],
        budgetLevel: ['budget level'],
        budgetSource: ['budget source'],
        budgetRemaining: ['budget remaining'],
        adSetBudget: ['ad set budget total', 'ad set budget'],
        adSetBudgetType: ['ad set budget type'],
        budgetSharing: ['ad set budget sharing enabled', 'budget sharing enabled'],
        budgetSchedule: ['budget schedule enabled'],
        status: ['delivery', 'delivery status', 'effective status', 'status'],
        effectiveStatus: ['effective status', 'delivery', 'delivery status', 'status'],
        configuredStatus: ['configured status'],
        adSetStatus: ['ad set status', 'ad set statuses'],
        start: ['ad set start', 'ad set start date', 'campaign start', 'campaign start date', 'scheduled start', 'starts'],
        end: ['ad set end', 'ad set end date', 'campaign end', 'campaign end date', 'scheduled end', 'ends'],
        campaignStart: ['campaign start', 'campaign start date'],
        campaignEnd: ['campaign end', 'campaign end date'],
        updatedTime: ['meta updated time', 'updated time'],
        campaignUpdatedTime: ['campaign updated time'],
        adSetUpdatedTime: ['ad set latest updated time', 'ad set updated time'],
        impressions: ['impressions'],
        reach: ['reach'],
        dailySpend: ['daily spend by date', 'daily spend'],
        activeSpendDays: ['active delivery days', 'active spend days'],
        firstDelivery: ['first delivery date'],
        lastDelivery: ['last delivery date'],
        adSetId: ['ad set id', 'adset id'],
        adSetName: ['ad set name', 'adset name'],
        adSetCount: ['ad set count'],
        activeAdSetCount: ['active ad set count']
    };

    const PRISMA_ALIASES = {
        accountId: ['partner account id', 'partner account id.', 'partner id'],
        campaignId: ['partner line id', 'partner line id.'],
        month: ['period', 'month'],
        planned: ['planned_amount', 'planned amount', 'gross amount', 'gross planned amount'],
        orderAmount: ['order_amount', 'order amount'],
        integratedSpend: ['integrated_spend', 'integrated spend'],
        nonIntegratedSpend: ['non_integrated_spend', 'non integrated spend'],
        opportunity: ['opportunity'],
        campaignName: ['campaign name', 'plan name', 'order name'],
        placementName: ['placement name', 'prisma placement name'],
        placementNumber: ['placement number', 'placement id'],
        buyNumber: ['buy number', 'buy no', 'd number'],
        currency: ['currency code', 'currency'],
        client: ['client name', 'client'],
        clientCode: ['client code'],
        product: ['product name', 'product'],
        productCode: ['product code'],
        partner: ['partner'],
        orderStatus: ['order current status', 'order status'],
        integratedStatus: ['integrated status'],
        deliveryStatus: ['delivery status'],
        flightStatus: ['flight status'],
        periodStatus: ['period status'],
        owner: ['placement creator', 'owner'],
        start: ['days in flight start date', 'placement start date', 'booked start date', 'start date'],
        end: ['years in flight end date', 'days in flight end date', 'flight end date', 'placement end date', 'booked end date', 'end date'],
        updatedTime: ['placement updated time', 'booking updated time', 'last updated', 'updated time', 'updated date']
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

    function prismaWorkflowIssues(row, options = {}) {
        const issues = [];
        const order = String(row.orderStatus || '').trim().toLowerCase();
        const integrated = String(row.integratedStatus || '').trim().toLowerCase();
        const delivery = String(row.deliveryStatus || '').trim().toLowerCase();
        const hasBuyNumber = Boolean(usableId(row.buyNumber) || (row.buyNumbers || []).some(usableId));
        const asOfDate = parseDate(options.asOfDate) || new Date();
        const startsInFuture = row.start instanceof Date && !Number.isNaN(row.start.getTime()) && row.start > asOfDate;
        if (row.orderStatusAvailable && !order) {
            issues.push(hasBuyNumber
                ? 'Buyer to self-accept the IO and traffic the campaign to Meta.'
                : 'Check if campaign needs approval.');
        }
        if (order.includes('needsrevision') || order.includes('needs revision')) {
            issues.push('Check whether the IO needs accepting, then traffic the campaign to Meta. If this is blocked, resolve the blocker.');
        }
        if (integrated.includes('not integrated')) {
            issues.push('Confirm this Prisma campaign matches the Meta campaign that ran or is running.');
        }
        if (delivery.includes('not received') && integrated === 'integrated' && (order.includes('needsrevision') || order.includes('needs revision')) && !startsInFuture) {
            issues.push('Check for unordered placements on the campaign before resolving Delivery status: Not Received.');
        }
        return issues;
    }

    function parseMoney(value) {
        const normalized = String(value ?? '').replace(/[£$€,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
        if (!normalized || !/^-?\d+(\.\d+)?$/.test(normalized)) return null;
        const number = Number(normalized);
        return Number.isFinite(number) ? number : null;
    }

    function parseNumber(value) {
        const number = Number(String(value ?? '').replace(/,/g, '').trim());
        return Number.isFinite(number) ? number : null;
    }

    function parseBoolean(value) {
        const normalized = String(value ?? '').trim().toLowerCase();
        if (['true', 'yes', '1'].includes(normalized)) return true;
        if (['false', 'no', '0'].includes(normalized)) return false;
        return null;
    }

    function inferCurrency(columns) {
        const header = String(columns.spend || '').toUpperCase();
        const code = header.match(/\b(GBP|USD|EUR|AUD|CAD|JPY|CHF|NZD|SEK|NOK|DKK)\b/);
        return code ? code[1] : '';
    }

    function parseDailySpend(value) {
        if (Array.isArray(value)) return value;
        const raw = String(value || '').trim();
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return raw.split('|').map(part => {
                const [date, spend] = part.split(':');
                return { date: String(date || '').trim(), spend: parseMoney(spend) || 0 };
            }).filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item.date));
        }
    }

    function latestText(left, right) {
        if (!left) return right || '';
        if (!right) return left;
        return String(left) > String(right) ? left : right;
    }

    function toIsoDate(date) {
        return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : '';
    }

    function parseTimestamp(value) {
        const raw = String(value ?? '').trim();
        if (!raw) return null;
        const timestamp = new Date(raw);
        return Number.isNaN(timestamp.getTime()) ? null : timestamp;
    }

    function displayTimestamp(date) {
        if (!date || Number.isNaN(date.getTime())) return '';
        return date.toISOString().replace('.000Z', 'Z');
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
                currency: '', timezone: '', timezoneOffset: '', effectiveStatus: '', configuredStatus: '', adSetStatus: '',
                budget: null, budgetRaw: '', budgetType: '', budgetLevel: '', budgetSource: '', budgetRemaining: null,
                adSetBudget: null, adSetBudgetType: '', budgetSharing: null, budgetSchedule: null,
                start: null, end: null, scheduleSource: /ad set/i.test(columns.start || '') ? 'Meta ad-set schedule' : 'Meta campaign schedule', campaignStart: null, campaignEnd: null,
                updatedTime: '', campaignUpdatedTime: '', adSetUpdatedTime: '',
                impressions: 0, reach: 0, dailySpendMap: new Map(), activeSpendDays: 0,
                firstDelivery: null, lastDelivery: null, adSetCount: 0, activeAdSetCount: 0,
                rows: 0, sourceRows: []
            };
            existing.account ||= columns.account ? String(row[columns.account] || '').trim() : '';
            existing.campaignName ||= columns.campaignName ? String(row[columns.campaignName] || '').trim() : '';
            existing.status ||= columns.status ? String(row[columns.status] || '').trim() : '';
            existing.currency ||= columns.currency ? String(row[columns.currency] || '').trim().toUpperCase() : inferCurrency(columns);
            existing.timezone ||= columns.timezone ? String(row[columns.timezone] || '').trim() : '';
            existing.timezoneOffset ||= columns.timezoneOffset ? String(row[columns.timezoneOffset] || '').trim() : '';
            existing.effectiveStatus ||= columns.effectiveStatus ? String(row[columns.effectiveStatus] || '').trim() : '';
            existing.configuredStatus ||= columns.configuredStatus ? String(row[columns.configuredStatus] || '').trim() : '';
            existing.adSetStatus ||= columns.adSetStatus ? String(row[columns.adSetStatus] || '').trim() : '';
            existing.spend += spend;
            existing.budgetRaw ||= budgetRaw;
            existing.budgetType ||= budgetType;
            existing.budgetLevel ||= columns.budgetLevel ? String(row[columns.budgetLevel] || '').trim() : '';
            existing.budgetSource ||= columns.budgetSource ? String(row[columns.budgetSource] || '').trim() : '';
            const remaining = columns.budgetRemaining ? parseMoney(row[columns.budgetRemaining]) : null;
            if (remaining !== null) existing.budgetRemaining = existing.budgetRemaining === null ? remaining : Math.max(existing.budgetRemaining, remaining);
            const adSetBudget = columns.adSetBudget ? parseMoney(row[columns.adSetBudget]) : null;
            if (adSetBudget !== null) existing.adSetBudget = existing.adSetBudget === null ? adSetBudget : Math.max(existing.adSetBudget, adSetBudget);
            existing.adSetBudgetType ||= columns.adSetBudgetType ? String(row[columns.adSetBudgetType] || '').trim() : '';
            if (existing.budgetSharing === null && columns.budgetSharing) existing.budgetSharing = parseBoolean(row[columns.budgetSharing]);
            if (existing.budgetSchedule === null && columns.budgetSchedule) existing.budgetSchedule = parseBoolean(row[columns.budgetSchedule]);
            if (budget !== null) existing.budget = existing.budget === null ? budget : Math.max(existing.budget, budget);
            if (start && (!existing.start || start < existing.start)) existing.start = start;
            if (end && (!existing.end || end > existing.end)) existing.end = end;
            const campaignStart = columns.campaignStart ? parseDate(row[columns.campaignStart]) : null;
            const campaignEnd = columns.campaignEnd ? parseDate(row[columns.campaignEnd]) : null;
            if (campaignStart && (!existing.campaignStart || campaignStart < existing.campaignStart)) existing.campaignStart = campaignStart;
            if (campaignEnd && (!existing.campaignEnd || campaignEnd > existing.campaignEnd)) existing.campaignEnd = campaignEnd;
            existing.updatedTime = latestText(existing.updatedTime, columns.updatedTime ? String(row[columns.updatedTime] || '').trim() : '');
            existing.campaignUpdatedTime = latestText(existing.campaignUpdatedTime, columns.campaignUpdatedTime ? String(row[columns.campaignUpdatedTime] || '').trim() : '');
            existing.adSetUpdatedTime = latestText(existing.adSetUpdatedTime, columns.adSetUpdatedTime ? String(row[columns.adSetUpdatedTime] || '').trim() : '');
            existing.impressions += columns.impressions ? (parseNumber(row[columns.impressions]) || 0) : 0;
            const reach = columns.reach ? parseNumber(row[columns.reach]) : null;
            if (reach !== null) existing.reach = Math.max(existing.reach, reach);
            parseDailySpend(columns.dailySpend ? row[columns.dailySpend] : '').forEach(day => {
                if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(String(day.date || ''))) return;
                const current = existing.dailySpendMap.get(day.date) || { date: day.date, spend: 0, impressions: 0, reach: 0 };
                current.spend += Number(day.spend || 0);
                current.impressions += Number(day.impressions || 0);
                current.reach = Math.max(current.reach, Number(day.reach || 0));
                existing.dailySpendMap.set(day.date, current);
            });
            existing.activeSpendDays = Math.max(existing.activeSpendDays, columns.activeSpendDays ? (parseNumber(row[columns.activeSpendDays]) || 0) : 0);
            const firstDelivery = columns.firstDelivery ? parseDate(row[columns.firstDelivery]) : null;
            const lastDelivery = columns.lastDelivery ? parseDate(row[columns.lastDelivery]) : null;
            if (firstDelivery && (!existing.firstDelivery || firstDelivery < existing.firstDelivery)) existing.firstDelivery = firstDelivery;
            if (lastDelivery && (!existing.lastDelivery || lastDelivery > existing.lastDelivery)) existing.lastDelivery = lastDelivery;
            existing.adSetCount = Math.max(existing.adSetCount, columns.adSetCount ? (parseNumber(row[columns.adSetCount]) || 0) : 0);
            existing.activeAdSetCount = Math.max(existing.activeAdSetCount, columns.activeAdSetCount ? (parseNumber(row[columns.activeAdSetCount]) || 0) : 0);
            existing.rows++;
            existing.sourceRows.push(rowIndex + 2);
            groups.set(key, existing);
        });
        const records = [...groups.values()].map(record => {
            const dailySpend = [...record.dailySpendMap.values()].sort((left, right) => left.date.localeCompare(right.date));
            const deliveryDays = dailySpend.filter(day => day.spend > 0 || day.impressions > 0);
            return {
                ...record,
                dailySpend,
                activeSpendDays: record.activeSpendDays || deliveryDays.length,
                firstDelivery: record.firstDelivery || (deliveryDays[0] ? parseDate(deliveryDays[0].date) : null),
                lastDelivery: record.lastDelivery || (deliveryDays.at(-1) ? parseDate(deliveryDays.at(-1).date) : null),
                dailySpendMap: undefined
            };
        });
        return { columns, records, errors };
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
        const businessId = parsed.rows.map(row => cleanId(columns.businessId ? row[columns.businessId] : '')).find(usableId) || '';
        return { accounts: [...accounts.values()], campaigns: [...campaigns.values()], adSets: [...adSets.values()], businessId, errors };
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
                const scope = clientProducts.get(key) || { client, product, accountIds: new Set(), campaignIds: new Set() };
                scope.accountIds.add(accountId);
                const campaignId = columns.campaignId ? cleanId(row[columns.campaignId]) : '';
                if (usableId(campaignId)) scope.campaignIds.add(campaignId);
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
                accountIds: [...scope.accountIds].sort(),
                campaignIds: [...scope.campaignIds].sort()
            })).sort((left, right) => `${left.client}|${left.product}`.localeCompare(`${right.client}|${right.product}`)),
            errors
        };
    }

    function aggregatePrisma(parsed, options = {}) {
        const columns = resolveColumns(parsed.headers, PRISMA_ALIASES);
        const errors = [];
        ['accountId', 'campaignId', 'month', 'planned'].forEach(key => {
            if (!columns[key]) errors.push(`Prisma export is missing ${key === 'accountId' ? 'Partner account id' : key === 'campaignId' ? 'Partner line id' : key === 'month' ? 'Period' : 'PLANNED_AMOUNT/Gross Amount'}.`);
        });
        if (options.requireStandardTemplate) {
            const required = {
                currency: 'Currency code', placementNumber: 'Placement number', buyNumber: 'Buy number',
                client: 'Client name', product: 'Product name', placementName: 'Placement name', owner: 'Placement creator',
                orderStatus: 'Order current status', integratedStatus: 'Integrated status', deliveryStatus: 'Delivery status',
                flightStatus: 'Flight status', periodStatus: 'Period status', end: 'Years in Flight end date'
            };
            Object.entries(required).forEach(([key, label]) => {
                if (!columns[key]) errors.push(`Prisma export is missing ${label}.`);
            });
        }
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
                orderAmount: columns.orderAmount ? (parseMoney(row[columns.orderAmount]) || 0) : null,
                integratedSpend: columns.integratedSpend ? (parseMoney(row[columns.integratedSpend]) || 0) : null,
                nonIntegratedSpend: columns.nonIntegratedSpend ? (parseMoney(row[columns.nonIntegratedSpend]) || 0) : null,
                opportunity: columns.opportunity ? (parseMoney(row[columns.opportunity]) || 0) : null,
                campaignName: columns.campaignName ? String(row[columns.campaignName] || '').trim() : '',
                placementName: columns.placementName ? String(row[columns.placementName] || '').trim() : '',
                placementNumber: columns.placementNumber ? cleanId(row[columns.placementNumber]) : '',
                buyNumber: columns.buyNumber ? cleanId(row[columns.buyNumber]) : '',
                currency: columns.currency ? String(row[columns.currency] || '').trim().toUpperCase() : '',
                client: columns.client ? String(row[columns.client] || '').trim() : '',
                clientCode: columns.clientCode ? String(row[columns.clientCode] || '').trim() : '',
                product: columns.product ? String(row[columns.product] || '').trim() : '',
                productCode: columns.productCode ? String(row[columns.productCode] || '').trim() : '',
                orderStatus: columns.orderStatus ? String(row[columns.orderStatus] || '').trim() : '',
                orderStatusAvailable: Boolean(columns.orderStatus),
                integratedStatus: columns.integratedStatus ? String(row[columns.integratedStatus] || '').trim() : '',
                deliveryStatus: columns.deliveryStatus ? String(row[columns.deliveryStatus] || '').trim() : '',
                flightStatus: columns.flightStatus ? String(row[columns.flightStatus] || '').trim() : '',
                periodStatus: columns.periodStatus ? String(row[columns.periodStatus] || '').trim() : '',
                owner: columns.owner ? String(row[columns.owner] || '').trim() : '',
                // Prisma exports use UK day-first dates (for example 01/05/2026).
                start: columns.start ? parseDate(row[columns.start]) : null,
                end: columns.end ? parseDate(row[columns.end]) : null,
                updatedTime: columns.updatedTime ? String(row[columns.updatedTime] || '').trim() : '',
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
            const bookingIdentifier = normalized.placementNumber || normalized.buyNumber;
            const bookingKey = bookingIdentifier ? `${normalized.placementNumber ? 'placement' : 'buy'}:${bookingIdentifier}|${toIsoDate(month).slice(0, 7)}` : '';
            const existing = groups.get(key) || {
                key, accountId, campaignId, month, planned: 0, orderAmount: 0, integratedSpend: 0, nonIntegratedSpend: 0, opportunity: 0, campaignName: '', placementNames: [], client: '', clientCode: '', product: '', productCode: '', orderStatus: '', orderStatusAvailable: Boolean(columns.orderStatus), integratedStatus: '', deliveryStatus: '', flightStatus: '', periodStatus: '',
                placementNumbers: [], buyNumbers: [], bookingKeys: [], bookingKeySet: new Set(), currency: '', currencies: [], owner: '', partner: '', start: null, end: null, updatedTime: '', rows: 0, sourceRows: []
            };
            const isDuplicateBooking = Boolean(bookingKey && existing.bookingKeySet.has(bookingKey));
            if (!isDuplicateBooking) {
                existing.planned += normalized.planned;
                existing.orderAmount += normalized.orderAmount || 0;
                existing.integratedSpend += normalized.integratedSpend || 0;
                existing.nonIntegratedSpend += normalized.nonIntegratedSpend || 0;
                existing.opportunity += normalized.opportunity || 0;
            }
            existing.campaignName ||= normalized.campaignName;
            if (normalized.placementName && !existing.placementNames.includes(normalized.placementName)) existing.placementNames.push(normalized.placementName);
            if (normalized.placementNumber && !existing.placementNumbers.includes(normalized.placementNumber)) existing.placementNumbers.push(normalized.placementNumber);
            if (normalized.buyNumber && !existing.buyNumbers.includes(normalized.buyNumber)) existing.buyNumbers.push(normalized.buyNumber);
            if (bookingKey && !existing.bookingKeySet.has(bookingKey)) {
                existing.bookingKeySet.add(bookingKey);
                existing.bookingKeys.push(bookingKey);
            }
            if (normalized.currency && !existing.currencies.includes(normalized.currency)) existing.currencies.push(normalized.currency);
            existing.currency ||= normalized.currency;
            existing.client ||= normalized.client;
            existing.clientCode ||= normalized.clientCode;
            existing.product ||= normalized.product;
            existing.productCode ||= normalized.productCode;
            existing.orderStatus ||= normalized.orderStatus;
            existing.integratedStatus ||= normalized.integratedStatus;
            existing.deliveryStatus ||= normalized.deliveryStatus;
            existing.flightStatus ||= normalized.flightStatus;
            existing.periodStatus ||= normalized.periodStatus;
            existing.owner ||= normalized.owner;
            existing.partner ||= normalized.partner;
            if (normalized.start && (!existing.start || normalized.start < existing.start)) existing.start = normalized.start;
            if (normalized.end && (!existing.end || normalized.end > existing.end)) existing.end = normalized.end;
            existing.updatedTime = latestText(existing.updatedTime, normalized.updatedTime);
            existing.rows++;
            existing.sourceRows.push(normalized.sourceRow);
            groups.set(key, existing);
        });
        return {
            columns,
            records: [...groups.values()].map(record => ({ ...record, bookingKeySet: undefined, currency: record.currencies.length === 1 ? record.currencies[0] : record.currency })),
            allRows,
            unintegratedRows,
            errors
        };
    }

    function buildMetaAccountCrossReference(metaParsed, prismaParsed) {
        const meta = aggregateMeta(metaParsed);
        const prisma = aggregatePrisma(prismaParsed);
        const errors = [...meta.errors, ...prisma.errors];
        if (errors.length) return { byClientProduct: [], byMetaAccount: [], errors };

        const metaByAccountCampaign = new Map();
        meta.records.forEach(record => {
            const key = `${record.accountId}\u0000${record.campaignId}`;
            const accounts = metaByAccountCampaign.get(key) || [];
            if (!accounts.some(account => account.id === record.accountId)) accounts.push({ id: record.accountId, name: record.account || record.accountId });
            metaByAccountCampaign.set(key, accounts);
        });
        const byClientProduct = new Map();
        prisma.allRows.forEach(row => {
            if (!row.client && !row.clientCode && !row.product && !row.productCode) return;
            const key = [row.client, row.clientCode, row.product, row.productCode].join('\u0000');
            const mapping = byClientProduct.get(key) || {
                client: row.client, clientCode: row.clientCode, product: row.product, productCode: row.productCode,
                accounts: new Map(), accountCampaignIds: new Map(), campaignIds: new Set(), placementRows: 0
            };
            mapping.placementRows++;
            const exactAccounts = metaByAccountCampaign.get(`${row.accountId}\u0000${row.campaignId}`) || [];
            exactAccounts.forEach(account => {
                mapping.accounts.set(account.id, account);
                const accountCampaignIds = mapping.accountCampaignIds.get(account.id) || new Set();
                accountCampaignIds.add(row.campaignId);
                mapping.accountCampaignIds.set(account.id, accountCampaignIds);
                mapping.campaignIds.add(row.campaignId);
            });
            byClientProduct.set(key, mapping);
        });
        const clientProducts = [...byClientProduct.values()].map(mapping => ({
            client: mapping.client, clientCode: mapping.clientCode, product: mapping.product, productCode: mapping.productCode,
            metaAccounts: [...mapping.accounts.values()].sort((left, right) => `${left.name}|${left.id}`.localeCompare(`${right.name}|${right.id}`)),
            accountCampaignIds: mapping.accountCampaignIds, campaignIds: [...mapping.campaignIds].sort(), placementRows: mapping.placementRows,
            matchStatus: mapping.accounts.size ? 'Matched' : 'No exact Meta account and campaign match'
        })).sort((left, right) => `${left.client}|${left.clientCode}|${left.product}|${left.productCode}`.localeCompare(`${right.client}|${right.clientCode}|${right.product}|${right.productCode}`));
        const byMetaAccount = new Map();
        clientProducts.forEach(product => product.metaAccounts.forEach(account => {
            const mapping = byMetaAccount.get(account.id) || { account: account.name, accountId: account.id, clientProducts: new Map(), campaignIds: new Set() };
            const productKey = [product.client, product.clientCode, product.product, product.productCode].join('\u0000');
            mapping.clientProducts.set(productKey, { client: product.client, clientCode: product.clientCode, product: product.product, productCode: product.productCode });
            (product.accountCampaignIds.get(account.id) || []).forEach(campaignId => mapping.campaignIds.add(campaignId));
            byMetaAccount.set(account.id, mapping);
        }));
        return {
            byClientProduct: clientProducts.map(({ accountCampaignIds, ...product }) => product),
            byMetaAccount: [...byMetaAccount.values()].map(mapping => ({
                account: mapping.account, accountId: mapping.accountId,
                clientProducts: [...mapping.clientProducts.values()].sort((left, right) => `${left.client}|${left.product}`.localeCompare(`${right.client}|${right.product}`)),
                campaignIds: [...mapping.campaignIds].sort()
            })).sort((left, right) => `${left.account}|${left.accountId}`.localeCompare(`${right.account}|${right.accountId}`)),
            errors
        };
    }

    function aggregateUnintegratedRows(rows) {
        const groups = new Map();
        (rows || []).forEach(row => {
            if (!row.month) return;
            const clientKey = row.clientCode || row.client || '';
            const productKey = row.productCode || row.product || '';
            const nameKey = row.campaignName || row.placementName || `row-${row.sourceRow}`;
            const key = `unintegrated|${clientKey}|${productKey}|${nameKey}|${toIsoDate(row.month)}`;
            const group = groups.get(key) || {
                key, accountId: '', campaignId: '', month: row.month, planned: 0, orderAmount: 0, integratedSpend: 0, nonIntegratedSpend: 0, opportunity: 0,
                campaignName: row.campaignName || '', placementNames: [], placementNumbers: [], buyNumbers: [], bookingKeys: [],
                client: row.client || '', clientCode: row.clientCode || '', product: row.product || '', productCode: row.productCode || '',
                currency: row.currency || '', owner: row.owner || '', start: row.start || null, end: row.end || null,
                orderStatus: row.orderStatus || '', orderStatusAvailable: row.orderStatusAvailable,
                integratedStatus: row.integratedStatus || '', deliveryStatus: row.deliveryStatus || '',
                flightStatus: row.flightStatus || '', periodStatus: row.periodStatus || '', sourceRows: []
            };
            group.planned += Number(row.planned) || 0;
            group.orderAmount += Number(row.orderAmount) || 0;
            group.integratedSpend += Number(row.integratedSpend) || 0;
            group.nonIntegratedSpend += Number(row.nonIntegratedSpend) || 0;
            group.opportunity += Number(row.opportunity) || 0;
            if (row.placementName && !group.placementNames.includes(row.placementName)) group.placementNames.push(row.placementName);
            if (row.placementNumber && !group.placementNumbers.includes(row.placementNumber)) group.placementNumbers.push(row.placementNumber);
            if (row.buyNumber && !group.buyNumbers.includes(row.buyNumber)) group.buyNumbers.push(row.buyNumber);
            group.sourceRows.push(row.sourceRow);
            groups.set(key, group);
        });
        return [...groups.values()];
    }

    function referenceTokens(value) {
        return new Set(String(value || '').toLowerCase().match(/\b(?:o|mf|po)[-_]?[a-z0-9]{3,}\b|\b[a-z]{2,}[-_]?\d{4,}\b|\b\d{4,}\b/g) || []);
    }

    function purchaseOrderTokens(value) {
        const tokens = new Set();
        const pattern = /(?:^|[^a-z0-9])po\s*[:_-]?\s*([a-z0-9][a-z0-9_-]{2,})\b/gi;
        let match;
        while ((match = pattern.exec(String(value || '')))) tokens.add(match[1].replace(/[_-]+$/g, '').toLowerCase());
        return tokens;
    }

    function manualMatchKey(value) {
        return typeof value === 'string' ? value : String(value?.prismaKey || '');
    }

    function referencesChanged(savedValue, currentValue) {
        const saved = referenceTokens(savedValue);
        if (!saved.size) return false;
        const current = referenceTokens(currentValue);
        return saved.size !== current.size || [...saved].some(reference => !current.has(reference));
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
        if (expected.clientCode && prisma.clientCode) checks.push(String(expected.clientCode).trim().toLowerCase() === String(prisma.clientCode).trim().toLowerCase() ? 1 : 0);
        else if (expected.client && prisma.client) checks.push(String(expected.client).trim().toLowerCase() === String(prisma.client).trim().toLowerCase() ? 1 : 0);
        if (expected.productCode && prisma.productCode) checks.push(String(expected.productCode).trim().toLowerCase() === String(prisma.productCode).trim().toLowerCase() ? 1 : 0);
        else if (expected.product && prisma.product) checks.push(String(expected.product).trim().toLowerCase() === String(prisma.product).trim().toLowerCase() ? 1 : 0);
        return checks.length ? checks.reduce((sum, value) => sum + value, 0) / checks.length : null;
    }

    function candidateKey(row) {
        if (row.key) return row.key;
        return `${row.accountId || ''}|prisma-row-${row.sourceRow || 0}|${toIsoDate(row.month)}`;
    }

    function findCandidates(meta, prismaRows, options = {}) {
        const mappingConfirmed = typeof options.mapping?.integrationExpected === 'boolean';
        const sameMonth = prismaRows.filter(row => {
            if (!row.month || toIsoDate(row.month) !== toIsoDate(meta.month)) return false;
            if (row.accountId === meta.accountId) return true;
            return options.allowUnintegrated && mappingConfirmed && !usableId(row.accountId) && scopeSimilarity(options.mapping, row) === 1;
        });
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
                placementNumbers: row.placementNumbers || [],
                buyNumbers: row.buyNumbers || [],
                bookingKeys: row.bookingKeys || [],
                client: row.client || '',
                clientCode: row.clientCode || '',
                product: row.product || '',
                productCode: row.productCode || '',
                currency: row.currency || '',
                planned: row.planned,
                orderAmount: row.orderAmount,
                integratedSpend: row.integratedSpend,
                nonIntegratedSpend: row.nonIntegratedSpend,
                opportunity: row.opportunity,
                owner: row.owner || '',
                orderStatus: row.orderStatus || '',
                integratedStatus: row.integratedStatus || '',
                deliveryStatus: row.deliveryStatus || '',
                flightStatus: row.flightStatus || '',
                periodStatus: row.periodStatus || '',
                workflowIssues: prismaWorkflowIssues(row, { asOfDate: options.asOfDate }),
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
        const currencyTotals = new Map();
        const currencyBudgets = new Map();
        let currencyMismatchCount = 0;
        reportRows.forEach(row => {
            if (row.currencyMismatch) {
                currencyMismatchCount++;
                return;
            }
            const currency = row.currency || '';
            if (!currencyTotals.has(currency)) currencyTotals.set(currency, {
                currency,
                metaBudget: 0,
                metaSpend: 0,
                prismaPlanned: 0,
                matchedMetaSpend: 0,
                matchedPrismaPlanned: 0,
                unmatchedMetaSpend: 0
            });
            const currencyTotal = currencyTotals.get(currency);
            currencyTotal.metaSpend += row.metaSpend || 0;
            currencyTotal.prismaPlanned += row.prismaPlanned || 0;
            if (row.metaKey && row.prismaKey) {
                currencyTotal.matchedMetaSpend += row.metaSpend || 0;
                currencyTotal.matchedPrismaPlanned += row.prismaPlanned || 0;
            } else if (row.metaKey && !row.prismaKey) {
                currencyTotal.unmatchedMetaSpend += row.metaSpend || 0;
            }
            if (row.metaBudget === null || row.metaBudget === undefined || row.metaBudget === '') return;
            const key = `${row.accountId || ''}|${row.campaignId || ''}`;
            const budget = Number(row.metaBudget);
            if (Number.isFinite(budget)) {
                campaignBudgets.set(key, Math.max(campaignBudgets.get(key) || 0, budget));
                if (!currencyBudgets.has(currency)) currencyBudgets.set(currency, new Map());
                const budgetMap = currencyBudgets.get(currency);
                budgetMap.set(key, Math.max(budgetMap.get(key) || 0, budget));
            }
        });
        currencyTotals.forEach((total, currency) => {
            total.metaBudget = [...(currencyBudgets.get(currency)?.values() || [])].reduce((sum, budget) => sum + budget, 0);
            total.matchedVariance = total.matchedMetaSpend - total.matchedPrismaPlanned;
        });
        const comparableRows = reportRows.filter(row => !row.currencyMismatch);
        const matchedRows = comparableRows.filter(row => row.metaKey && row.prismaKey);
        const metaSpend = comparableRows.reduce((sum, row) => sum + (row.metaSpend || 0), 0);
        const prismaPlanned = comparableRows.reduce((sum, row) => sum + (row.prismaPlanned || 0), 0);
        const matchedMetaSpend = matchedRows.reduce((sum, row) => sum + (row.metaSpend || 0), 0);
        const matchedPrismaPlanned = matchedRows.reduce((sum, row) => sum + (row.prismaPlanned || 0), 0);
        const unmatchedMetaSpend = comparableRows
            .filter(row => row.metaKey && !row.prismaKey)
            .reduce((sum, row) => sum + (row.metaSpend || 0), 0);
        const currencies = [...currencyTotals.keys()].filter(Boolean);
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
            variance: metaSpend - prismaPlanned,
            matchedMetaSpend,
            matchedPrismaPlanned,
            matchedVariance: matchedMetaSpend - matchedPrismaPlanned,
            unmatchedMetaSpend,
            currency: currencies.length === 1 ? currencies[0] : '',
            currencies,
            mixedCurrencies: currencies.length > 1 || (currencyTotals.has('') && currencyTotals.size > 1),
            currencyMismatchCount,
            currencyTotals: [...currencyTotals.values()].map(total => ({ ...total, variance: total.metaSpend - total.prismaPlanned }))
        };
    }

    function dailySpendContext(record, asOfDate) {
        const points = (record.dailySpend || []).filter(point => point.date && parseDate(point.date) <= asOfDate);
        if (!points.length) return null;
        const finalDate = parseDate(points.at(-1).date);
        const windowStart = new Date(finalDate.getTime());
        windowStart.setUTCDate(windowStart.getUTCDate() - 6);
        const recentSpend = points.filter(point => {
            const date = parseDate(point.date);
            return date && date >= windowStart && date <= finalDate;
        }).reduce((sum, point) => sum + Number(point.spend || 0), 0);
        return {
            days: points.filter(point => Number(point.spend || 0) > 0 || Number(point.impressions || 0) > 0).length,
            lastDate: toIsoDate(finalDate),
            sevenDayAverage: recentSpend / 7
        };
    }

    function isInactiveMetaRecord(record) {
        const statuses = [record.status, record.effectiveStatus, record.configuredStatus, record.adSetStatus]
            .join(' ').toUpperCase();
        return /\b(PAUSED|ARCHIVED|DELETED|CAMPAIGN_PAUSED|ADSET_PAUSED)\b/.test(statuses)
            && !/\bACTIVE\b/.test(statuses)
            && !(record.activeAdSetCount > 0);
    }

    function isFixedSingleMonthFlight(record) {
        if (!record.start || !record.end || !record.month) return false;
        const reportMonth = toIsoDate(record.month).slice(0, 7);
        return toIsoDate(record.start).slice(0, 7) === reportMonth
            && toIsoDate(record.end).slice(0, 7) === reportMonth;
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
        const prismaUnintegratedGroups = aggregateUnintegratedRows(prisma.unintegratedRows);
        const asOfDate = parseDate(options.asOfDate) || new Date();
        const scopeWords = value => String(value || '').toLowerCase().match(/[a-z0-9]+/g) || [];
        const mappedClientNames = metaRecords.flatMap(record => {
            const mapping = accountMappings[record.accountId] || {};
            return [mapping.client, mapping.clientCode].filter(Boolean).map(value => String(value).trim().toLowerCase());
        });
        const metaAccountNames = metaRecords.map(record => String(record.account || '').trim()).filter(Boolean);
        const clientAppearsInMeta = booking => {
            if (!booking.client && !booking.clientCode) return true;
            const clientValues = [booking.client, booking.clientCode].filter(Boolean).map(value => String(value).trim().toLowerCase());
            if (clientValues.some(value => mappedClientNames.includes(value))) return true;
            const clientFirstWords = new Set(clientValues.flatMap(scopeWords).slice(0, 1));
            return metaAccountNames.some(account => {
                const accountWords = scopeWords(account);
                return accountWords.some(word => clientFirstWords.has(word));
            });
        };
        const prismaRecordsInMetaClientScope = prismaRecords.filter(clientAppearsInMeta);
        const poCampaignCounts = (records, nameFor) => records.reduce((counts, record) => {
            purchaseOrderTokens(nameFor(record)).forEach(po => {
                if (!counts.has(po)) counts.set(po, new Set());
                counts.get(po).add(`${record.accountId}|${record.campaignId}`);
            });
            return counts;
        }, new Map());
        const metaPoCampaigns = poCampaignCounts(metaRecords, record => record.campaignName);
        const prismaPoCampaigns = poCampaignCounts(prismaRecordsInMetaClientScope, record => [record.campaignName, ...(record.placementNames || [])].join(' '));
        prismaUnintegratedGroups.forEach(group => { group.workflowIssues = prismaWorkflowIssues(group, { asOfDate }); });
        const closedWorkingDay = Number(options.closedWorkingDay) || 5;
        const prismaByKey = new Map(prismaRecords.map(record => [record.key, record]));
        const resolveManualMatch = platform => {
            const saved = manualMatches[platform.key];
            const key = manualMatchKey(saved);
            if (!key) return { booking: null, reviewReason: '' };
            const booking = prismaByKey.get(key) || null;
            if (!booking) return { booking: null, reviewReason: 'Saved manual match needs reconfirmation because the Prisma booking is no longer in this report.' };
            if (typeof saved === 'object' && (
                referencesChanged(saved.metaCampaignName, platform.campaignName)
                || referencesChanged(saved.prismaCampaignName, [booking.campaignName, ...(booking.placementNames || [])].join(' '))
            )) {
                return { booking: null, reviewReason: 'Saved manual match needs reconfirmation because an O, PO, or MF reference changed.' };
            }
            return { booking, reviewReason: '' };
        };
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
        const prismaMonths = new Set([...prismaRecords, ...prismaUnintegratedGroups].map(record => toIsoDate(record.month).slice(0, 7)));
        const metaAccountMonths = new Set(metaRecords.map(record => `${record.accountId}|${toIsoDate(record.month).slice(0, 7)}`));
        const prismaAccountMonths = new Set(prismaRecords.map(record => `${record.accountId}|${toIsoDate(record.month).slice(0, 7)}`));
        Object.entries(accountMappings).forEach(([accountId, mapping]) => {
            if (typeof mapping?.integrationExpected !== 'boolean' || !metaRecords.some(record => record.accountId === cleanId(accountId))) return;
            prismaUnintegratedGroups.filter(row => scopeSimilarity(mapping, row) === 1).forEach(row => {
                prismaAccountMonths.add(`${cleanId(accountId)}|${toIsoDate(row.month).slice(0, 7)}`);
            });
        });
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
        const populationConfirmationEnabled = options.populationConfirmed === true;
        const linkedPrismaKeys = new Set(metaRecords.map(platform => {
            const manualBooking = resolveManualMatch(platform).booking;
            return (manualBooking || prismaByKey.get(platform.key))?.key;
        }).filter(Boolean));
        const handledPrismaKeys = new Set();
        const reportRows = [];

        metaRecords.forEach(platform => {
            const manualMatch = resolveManualMatch(platform);
            const manualBooking = manualMatch.booking;
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
            let comparisonBasis = 'Meta spend';
            let comparisonValue = platform.spend;
            let comparisonVariance = booking ? platform.spend - booking.planned : platform.spend;
            if (manualBooking) {
                handledPrismaKeys.add(manualBooking.key);
                issues.push(`Manual match to Prisma Partner line ID ${manualBooking.campaignId}`);
            }
            if (manualMatch.reviewReason) issues.push(manualMatch.reviewReason);

            const monthClosed = asOfDate > addWorkingDays(endOfMonth(platform.month), closedWorkingDay);
            const platformAccountMonth = `${platform.accountId}|${toIsoDate(platform.month).slice(0, 7)}`;
            const accountMonthConfirmed = populationConfirmationEnabled && prismaAccountMonths.has(platformAccountMonth);
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
                    const candidateRows = [...prismaRecordsInMetaClientScope, ...prismaAllRows.filter(row => !row.campaignId && clientAppearsInMeta(row)), ...prismaUnintegratedGroups.filter(clientAppearsInMeta)]
                        .filter(row => !row.key || !linkedPrismaKeys.has(row.key));
                    candidatePool = findCandidates(platform, candidateRows, {
                        monthClosed,
                        mapping: accountMappings[platform.accountId] || {},
                        allowUnintegrated: true,
                        asOfDate,
                        rejectedKeys: rejectedCandidates[platform.key] || [],
                        limit: Infinity
                    });
                    candidates = candidatePool.slice(0, 3);
                    candidate = candidates[0] && candidates[0].level !== 'Low evidence' ? candidates[0] : null;
                    if (candidate) {
                        const sharedPo = [...purchaseOrderTokens(platform.campaignName)]
                            .find(po => purchaseOrderTokens([candidate.campaignName, ...(candidate.placementNames || [])].join(' ')).has(po));
                        const metaPoCount = sharedPo ? (metaPoCampaigns.get(sharedPo)?.size || 0) : 0;
                        const prismaPoCount = sharedPo ? (prismaPoCampaigns.get(sharedPo)?.size || 0) : 0;
                        if (sharedPo && metaPoCount === 1 && prismaPoCount === 1) {
                            classification = 'Strong PO match: confirm campaign link';
                            issues.push(`PO ${sharedPo.toUpperCase()} appears once in Meta and once in Prisma. Treat as the likely match after user confirmation.`);
                        } else if (sharedPo && prismaPoCount > metaPoCount) {
                            classification = 'Possible PO match: check for cancel/rebook';
                            issues.push(`PO ${sharedPo.toUpperCase()} links ${metaPoCount} Meta campaign${metaPoCount === 1 ? '' : 's'} to ${prismaPoCount} Prisma bookings. Confirm the intended match and check whether a Prisma booking is a cancellation/rebook.`);
                        } else {
                            classification = candidate.campaignId
                                ? 'Possible Prisma campaign match: confirm link'
                                : 'Likely booked but unlinked: add Partner line ID';
                        }
                        evidence = 'Investigate';
                        issues.push(`${candidate.level}: ${candidate.score}% match score${candidate.reasons.length ? ` (${candidate.reasons.join('; ')})` : ''}`);
                    } else {
                        const purchaseOrderReferences = [...referenceTokens(platform.campaignName)].filter(token => /^(mf|po)[-_]/.test(token));
                        if (purchaseOrderReferences.length) {
                            classification = 'PO reference needs booking confirmation';
                            evidence = 'Investigate';
                            issues.push(`Buyer to confirm whether a Prisma booking exists against PO reference ${purchaseOrderReferences[0]}.`);
                        } else {
                        const missingLabel = accountMonthConfirmed ? 'No exact Prisma campaign ID match' : 'No linked Prisma booking found';
                        const noDelivery = platform.spend <= tolerance && !(platform.impressions > 0);
                        const fixedFlightBudgetRisk = !monthClosed && noDelivery
                            && platform.budget !== null && platform.budget > tolerance
                            && isFixedSingleMonthFlight(platform);
                        if (fixedFlightBudgetRisk) {
                            classification = `${missingLabel}: fixed-flight Meta budget is unbooked`;
                            evidence = 'Missing/unlinked';
                        } else if (!monthClosed && noDelivery) {
                            classification = 'Open-month £0 campaign: monitor for booking activity';
                            evidence = 'Monitor';
                        } else if (noDelivery && isInactiveMetaRecord(platform)) {
                            classification = 'No booking action: inactive in Meta with no delivery';
                            evidence = 'Monitor';
                        } else {
                            classification = platform.spend > tolerance || platform.impressions > 0
                                ? `${missingLabel}: delivered or spending`
                                : `${missingLabel}: active or scheduled pre-flight`;
                            evidence = 'Missing/unlinked';
                        }
                        }
                    }
                }
            } else {
                const metaCurrency = platform.currency || '';
                const prismaCurrency = booking.currency || '';
                const currencyMismatch = Boolean(metaCurrency && prismaCurrency && metaCurrency !== prismaCurrency);
                const startVariance = daysBetween(platform.start, booking.start);
                const endVariance = daysBetween(platform.end, booking.end);
                const boundedBudgetComparable = !monthClosed && platform.budget !== null
                    && platform.start && platform.end && booking.start && booking.end
                    && startVariance === 0 && endVariance === 0;
                comparisonBasis = boundedBudgetComparable ? 'Meta budget' : 'Meta spend';
                comparisonValue = boundedBudgetComparable ? platform.budget : platform.spend;
                comparisonVariance = currencyMismatch ? null : comparisonValue - booking.planned;
                const updateKinds = [];
                const reviewKinds = [];

                if (currencyMismatch) {
                    classification = 'Currency check needed: Meta and Prisma differ';
                    evidence = 'Investigate';
                    issues.push(`Meta currency ${metaCurrency}; Prisma currency ${prismaCurrency}. Amounts are not compared or added together.`);
                }

                if (platform.start && booking.start && platform.start < booking.start) {
                    issues.push(`${platform.scheduleSource || 'Meta schedule'} starts before Prisma`);
                    updateKinds.push('schedule');
                } else if (startVariance !== null && startVariance > 0) {
                    issues.push(`Prisma booking covers the Meta start and begins ${startVariance} day(s) earlier`);
                }
                if (platform.end && booking.end && platform.end > booking.end) {
                    issues.push(`${platform.scheduleSource || 'Meta schedule'} ends after Prisma`);
                    updateKinds.push('schedule');
                } else if (endVariance !== null && endVariance < 0) {
                    issues.push(`Prisma booking covers the Meta end and finishes ${Math.abs(endVariance)} day(s) later`);
                }

                if (comparisonVariance !== null && comparisonVariance > tolerance) {
                    updateKinds.push(boundedBudgetComparable ? 'budget' : 'spend');
                    issues.push(`${comparisonBasis} exceeds Prisma booking by ${comparisonVariance.toFixed(2)}`);
                } else if (comparisonVariance !== null && comparisonVariance < -tolerance && monthClosed) {
                    updateKinds.push('reconciliation');
                    issues.push(`Check Prisma is reconciled correctly: its booking exceeds closed-month Meta spend by ${Math.abs(comparisonVariance).toFixed(2)} and looks high.`);
                } else if (comparisonVariance !== null && comparisonVariance < -tolerance) {
                    reviewKinds.push('in-flight spend');
                    issues.push(`${comparisonBasis} is below Prisma booking by ${Math.abs(comparisonVariance).toFixed(2)}`);
                }

                if (platform.budget === null && platform.budgetRaw) issues.push(`Budget not comparable: ${platform.budgetRaw}`);
                const metaUpdated = parseTimestamp(platform.updatedTime);
                const prismaUpdated = parseTimestamp(booking.updatedTime);
                if (metaUpdated && prismaUpdated && metaUpdated > prismaUpdated && (updateKinds.length || reviewKinds.length)) {
                    issues.push(`Meta changed after the Prisma booking (${displayTimestamp(metaUpdated)} vs ${displayTimestamp(prismaUpdated)})`);
                }

                const uniqueUpdates = [...new Set(updateKinds)];
                const uniqueReviews = [...new Set(reviewKinds)];
                if (currencyMismatch) {
                    // Date and workflow evidence remains useful, but monetary findings stay deliberately non-comparable.
                } else if (uniqueUpdates.length > 1) {
                    classification = `Multiple updates needed: ${uniqueUpdates.join(' and ')} differ`;
                    evidence = 'Needs update';
                } else if (uniqueUpdates[0] === 'schedule') {
                    classification = 'Date update needed: Meta extends outside Prisma';
                    evidence = 'Needs update';
                } else if (uniqueUpdates[0] === 'spend') {
                    classification = 'Spend update needed: Meta spend exceeds Prisma booking';
                    evidence = 'Needs update';
                } else if (uniqueUpdates[0] === 'budget') {
                    classification = 'Budget update needed: bounded Meta budget exceeds Prisma booking';
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
                const workflowIssues = prismaWorkflowIssues(booking, { asOfDate });
                if (workflowIssues.length) {
                    issues.push(...workflowIssues);
                    if (evidence === 'Matched') {
                        classification = 'Prisma workflow review needed';
                        evidence = 'Investigate';
                    } else if (evidence === 'Needs update') {
                        classification = 'Prisma workflow and booking update needed';
                    }
                }
                const metaReferences = referenceTokens(platform.campaignName);
                const prismaReferences = referenceTokens([booking.campaignName, ...(booking.placementNames || [])].join(' '));
                const referencesConflict = metaReferences.size && prismaReferences.size && ![...metaReferences].some(reference => prismaReferences.has(reference));
                if (referencesConflict) {
                    issues.push('Exact IDs match but campaign references differ; verify whether Prisma is correct or the wrong PO was used in the Meta campaign name.');
                    if (evidence === 'Matched') {
                        classification = 'Exact link has conflicting PO references: verify booking';
                        evidence = 'Investigate';
                    }
                }
                if (manualBooking && evidence === 'Matched') classification = 'Matched manually: booking evidence valid';
            }

            const dailyContext = dailySpendContext(platform, asOfDate);
            if (!monthClosed && dailyContext && (evidence === 'Monitor' || evidence === 'Needs update' || evidence === 'Investigate')) {
                issues.push(`Daily Meta pace: ${dailyContext.days} delivery day(s); last 7 calendar days average ${dailyContext.sevenDayAverage.toFixed(2)} per day to ${dailyContext.lastDate}`);
            }
            if (evidence !== 'Matched' || platform.spend === 0) {
                if (platform.impressions > 0) issues.push(`${Math.round(platform.impressions).toLocaleString('en-GB')} Meta impressions${platform.reach > 0 ? `; ${Math.round(platform.reach).toLocaleString('en-GB')} reach` : ''}`);
                else if (meta.columns.impressions) issues.push('No Meta impressions in the selected reporting range');
                if (platform.lastDelivery) issues.push(`Last Meta delivery ${toIsoDate(platform.lastDelivery)}`);
                if (platform.budgetRemaining !== null && platform.budgetRemaining !== undefined) issues.push(`Meta budget remaining: ${Number(platform.budgetRemaining).toFixed(2)}${platform.budgetSource ? ` (${platform.budgetSource})` : ''}`);
            }

            reportRows.push({
                accountId: platform.accountId,
                campaignId: platform.campaignId,
                metaKey: platform.key,
                month: toIsoDate(platform.month).slice(0, 7),
                account: platform.account,
                campaignName: platform.campaignName,
                status: platform.status,
                effectiveStatus: platform.effectiveStatus,
                configuredStatus: platform.configuredStatus,
                adSetStatus: platform.adSetStatus,
                currency: platform.currency || booking?.currency || '',
                metaCurrency: platform.currency || '',
                prismaCurrency: booking?.currency || candidate?.currency || '',
                currencyMismatch: Boolean(booking && platform.currency && booking.currency && platform.currency !== booking.currency),
                timezone: platform.timezone,
                timezoneOffset: platform.timezoneOffset,
                metaSpend: platform.spend,
                metaBudget: platform.budget,
                metaBudgetType: platform.budgetType,
                metaBudgetLevel: platform.budgetLevel,
                metaBudgetSource: platform.budgetSource,
                metaBudgetRemaining: platform.budgetRemaining,
                metaAdSetBudget: platform.adSetBudget,
                metaAdSetBudgetType: platform.adSetBudgetType,
                metaBudgetSharing: platform.budgetSharing,
                metaBudgetSchedule: platform.budgetSchedule,
                metaImpressions: platform.impressions,
                metaReach: platform.reach,
                metaActiveSpendDays: platform.activeSpendDays,
                metaFirstDelivery: toIsoDate(platform.firstDelivery),
                metaLastDelivery: toIsoDate(platform.lastDelivery),
                metaDailySpend: platform.dailySpend || [],
                metaUpdatedTime: platform.updatedTime,
                metaCampaignUpdatedTime: platform.campaignUpdatedTime,
                metaAdSetUpdatedTime: platform.adSetUpdatedTime,
                metaAdSetCount: platform.adSetCount,
                metaActiveAdSetCount: platform.activeAdSetCount,
                prismaPlanned: booking?.planned ?? null,
                prismaOrderAmount: booking?.orderAmount ?? candidate?.orderAmount ?? null,
                prismaIntegratedSpend: booking?.integratedSpend ?? candidate?.integratedSpend ?? null,
                prismaNonIntegratedSpend: booking?.nonIntegratedSpend ?? candidate?.nonIntegratedSpend ?? null,
                prismaOpportunity: booking?.opportunity ?? candidate?.opportunity ?? null,
                prismaCampaignId: booking?.campaignId || '',
                prismaClient: booking?.client || candidate?.client || '',
                prismaProduct: booking?.product || candidate?.product || '',
                prismaKey: booking?.key || '',
                prismaBookingKeys: booking?.bookingKeys || candidate?.bookingKeys || [],
                prismaPlacementNumbers: booking?.placementNumbers || candidate?.placementNumbers || [],
                prismaBuyNumbers: booking?.buyNumbers || candidate?.buyNumbers || [],
                comparisonBasis,
                comparisonValue,
                variance: booking && !(platform.currency && booking.currency && platform.currency !== booking.currency) ? comparisonVariance : (booking ? null : platform.spend),
                metaStart: toIsoDate(platform.start),
                metaEnd: toIsoDate(platform.end),
                prismaStart: toIsoDate(booking?.start),
                prismaEnd: toIsoDate(booking?.end),
                prismaUpdatedTime: booking?.updatedTime || '',
                prismaOrderStatus: booking?.orderStatus || candidate?.orderStatus || '',
                prismaIntegratedStatus: booking?.integratedStatus || candidate?.integratedStatus || '',
                prismaDeliveryStatus: booking?.deliveryStatus || candidate?.deliveryStatus || '',
                prismaFlightStatus: booking?.flightStatus || candidate?.flightStatus || '',
                prismaPeriodStatus: booking?.periodStatus || candidate?.periodStatus || '',
                prismaPlacementNames: booking?.placementNames || candidate?.placementNames || [],
                prismaWorkflowIssues: booking ? prismaWorkflowIssues(booking, { asOfDate }) : (candidate?.workflowIssues || []),
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

        prismaRecordsInMetaClientScope.filter(record => !metaKeys.has(record.key) && !handledPrismaKeys.has(record.key)).forEach(booking => {
            const month = toIsoDate(booking.month).slice(0, 7);
            const outsideMetaMonths = !metaMonths.has(month);
            reportRows.push({
                accountId: booking.accountId, campaignId: booking.campaignId, prismaCampaignId: booking.campaignId, month, account: booking.client,
                metaKey: '', prismaKey: booking.key,
                campaignName: booking.campaignName, status: '', metaSpend: null, metaBudget: null, metaBudgetType: '',
                effectiveStatus: '', configuredStatus: '', adSetStatus: '', currency: booking.currency || '', metaCurrency: '', prismaCurrency: booking.currency || '', currencyMismatch: false, timezone: '', timezoneOffset: '',
                metaBudgetLevel: '', metaBudgetSource: '', metaBudgetRemaining: null, metaAdSetBudget: null, metaAdSetBudgetType: '', metaBudgetSharing: null, metaBudgetSchedule: null,
                metaImpressions: null, metaReach: null, metaActiveSpendDays: null, metaFirstDelivery: '', metaLastDelivery: '', metaDailySpend: [],
                metaUpdatedTime: '', metaCampaignUpdatedTime: '', metaAdSetUpdatedTime: '', metaAdSetCount: null, metaActiveAdSetCount: null,
                prismaPlanned: booking.planned, prismaOrderAmount: booking.orderAmount, prismaIntegratedSpend: booking.integratedSpend, prismaNonIntegratedSpend: booking.nonIntegratedSpend, prismaOpportunity: booking.opportunity, variance: -booking.planned,
                prismaClient: booking.client, prismaProduct: booking.product, prismaBookingKeys: booking.bookingKeys || [], prismaPlacementNumbers: booking.placementNumbers || [], prismaBuyNumbers: booking.buyNumbers || [],
                metaStart: '', metaEnd: '', prismaStart: toIsoDate(booking.start), prismaEnd: toIsoDate(booking.end), prismaUpdatedTime: booking.updatedTime || '',
                prismaOrderStatus: booking.orderStatus || '', prismaIntegratedStatus: booking.integratedStatus || '', prismaDeliveryStatus: booking.deliveryStatus || '', prismaFlightStatus: booking.flightStatus || '', prismaPeriodStatus: booking.periodStatus || '', prismaPlacementNames: booking.placementNames || [], prismaWorkflowIssues: prismaWorkflowIssues(booking, { asOfDate }),
                classification: outsideMetaMonths ? 'Outside Meta reporting months' : 'Prisma booking has no exact Meta campaign in the uploaded report',
                evidence: outsideMetaMonths ? 'Outside scope' : 'Investigate',
                issues: [outsideMetaMonths ? `Meta report does not include ${month}` : 'Check whether this is a valid Prisma-only booking, a differently named/identified Meta campaign, or outside the uploaded Meta scope.'], owner: booking.owner, candidateScore: null, candidates: [], candidatePool: [], monthClosed: false
            });
        });

        const summary = summarizeRows(reportRows);
        const excludedPrismaClients = [...prismaRecords.filter(record => !clientAppearsInMeta(record) && metaMonths.has(toIsoDate(record.month).slice(0, 7)))
            .reduce((groups, record) => {
                const client = record.client || record.clientCode || 'Client not supplied';
                groups.set(client, (groups.get(client) || 0) + 1);
                return groups;
            }, new Map())]
            .map(([client, rows]) => ({ client, rows }))
            .sort((left, right) => left.client.localeCompare(right.client));
        const unintegratedInMetaMonths = prismaUnintegratedGroups.filter(row => metaMonths.has(toIsoDate(row.month).slice(0, 7)));
        summary.unintegratedPrismaPlanned = unintegratedInMetaMonths.reduce((sum, row) => sum + (Number(row.planned) || 0), 0);
        summary.prismaBookedIncludingUnintegrated = (summary.prismaPlanned || 0) + summary.unintegratedPrismaPlanned;
        const unintegratedCurrencyTotals = new Map();
        unintegratedInMetaMonths.forEach(row => unintegratedCurrencyTotals.set(row.currency || '', (unintegratedCurrencyTotals.get(row.currency || '') || 0) + (Number(row.planned) || 0)));
        summary.unintegratedCurrencyTotals = [...unintegratedCurrencyTotals].map(([currency, planned]) => ({ currency, planned }));
        const warnings = [];
        if (!meta.columns.start || !meta.columns.end) warnings.push('Meta schedule dates are unavailable; month coverage is checked instead. Sync through the Meta API to use ad-set dates, or include schedule columns in the report.');
        if (!prisma.columns.start || !prisma.columns.end) warnings.push('Prisma booked start/end dates are unavailable; exact-day comparison cannot be completed.');
        if (!meta.columns.status) warnings.push('Meta delivery status is unavailable; £0 rows cannot be distinguished reliably as scheduled or inactive.');
        if (meta.columns.budget) warnings.push('Closed months compare Meta spend with Prisma PLANNED_AMOUNT. A current campaign uses Meta budget only when its fixed Meta and Prisma flight dates align exactly; otherwise budget remains context.');
        if (!meta.columns.currency && !metaRecords.some(record => record.currency)) warnings.push('Meta account currency is unavailable. Values are shown without assuming an account currency unless it can be inferred from the spend column heading.');
        if (!prisma.columns.currency) warnings.push('Prisma Currency code is unavailable. Add it to the export so the checker can confirm Meta and Prisma amounts use the same currency.');
        const currencies = [...new Set(metaRecords.map(record => record.currency).filter(Boolean))];
        if (currencies.length > 1) warnings.push(`Selected Meta accounts use multiple currencies (${currencies.join(', ')}). Cross-account financial totals are separated by currency and must not be added together.`);
        const currencyMismatches = reportRows.filter(row => row.currencyMismatch);
        if (currencyMismatches.length) warnings.push(`${currencyMismatches.length} linked campaign-month row${currencyMismatches.length === 1 ? '' : 's'} use different Meta and Prisma currencies. Their amounts are kept separate and need a currency check before booking action.`);
        if (meta.columns.updatedTime && !prisma.columns.updatedTime) warnings.push('Meta updated time is available, but the Prisma report has no booking updated time. The checker can show when Meta changed, but cannot confirm whether that change happened after the booking.');
        if (!coverage.isComplete) warnings.push(`Prisma report coverage is incomplete for ${coverageGaps.length} selected Meta account-month${coverageGaps.length === 1 ? '' : 's'}; missing findings in those account-months remain provisional until the export scope is corrected.`);
        const prismaOnlyMonths = coverage.prismaMonths.filter(month => !metaMonths.has(month));
        if (prismaOnlyMonths.length) warnings.push(`Prisma also includes ${prismaOnlyMonths.join(', ')}. These months are kept outside reconciliation totals and actions because the Meta report does not cover them.`);
        if (prisma.unintegratedRows.length) warnings.push(`${prisma.unintegratedRows.length} Prisma row${prisma.unintegratedRows.length === 1 ? '' : 's'} have no usable Partner account ID or Partner line ID. They are retained in the unintegrated-bookings section and become eligible for fuzzy matching after the client/product integration rule is confirmed in setup.`);
        if (excludedPrismaClients.length) warnings.push(`${excludedPrismaClients.reduce((sum, item) => sum + item.rows, 0)} Prisma-only booking${excludedPrismaClients.reduce((sum, item) => sum + item.rows, 0) === 1 ? '' : 's'} were kept outside the main analysis because their client does not appear in the selected Meta population: ${excludedPrismaClients.map(item => item.client).join(', ')}.`);
        const sourceAccounts = [...new Map(meta.records.map(record => [record.accountId, { id: record.accountId, name: record.account || record.accountId }])).values()]
            .sort((left, right) => left.name.localeCompare(right.name));
        return { rows: reportRows, summary, validationErrors, warnings, coverage, excludedPrismaClients, prismaUnintegratedRows: prisma.unintegratedRows, prismaUnintegratedGroups, columns: { meta: meta.columns, prisma: prisma.columns }, sourceAccounts };
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
            'Meta effective status', 'Meta configured status', 'Meta ad set status', 'Account currency', 'Account timezone', 'Account timezone offset',
            'Meta spend', 'Meta budget', 'Meta budget type', 'Meta budget level', 'Meta budget source', 'Meta budget remaining',
            'Meta ad set budget', 'Meta ad set budget type', 'Meta ad set budget sharing', 'Meta budget schedule enabled',
            'Meta impressions', 'Meta reach', 'Meta active delivery days', 'Meta first delivery', 'Meta last delivery', 'Meta daily spend',
            'Meta updated time', 'Meta campaign updated time', 'Meta ad set updated time', 'Meta ad set count', 'Meta active ad set count',
            'Meta currency', 'Prisma currency', 'Currency mismatch', 'Prisma Partner line ID', 'Prisma client', 'Prisma product', 'Prisma placement name(s)', 'Prisma placement number(s)', 'Prisma Buy number(s)', 'Prisma booking key(s)', 'Prisma booked', 'Prisma order amount', 'Prisma integrated spend', 'Prisma non-integrated spend', 'Prisma opportunity', 'Variance',
            'Meta schedule start', 'Meta schedule end', 'Prisma flight start', 'Prisma flight end',
            'Prisma booking updated time',
            'Prisma order status', 'Prisma integration status', 'Prisma delivery status', 'Prisma flight status', 'Prisma period status',
            'Finding', 'Evidence', 'Supporting evidence', 'Prisma workflow issues', 'Prisma placement creator', 'Candidate match score'
        ];
        const fields = [
            'accountId', 'account', 'campaignId', 'campaignName', 'month', 'status',
            'effectiveStatus', 'configuredStatus', 'adSetStatus', 'currency', 'timezone', 'timezoneOffset',
            'metaSpend', 'metaBudget', 'metaBudgetType', 'metaBudgetLevel', 'metaBudgetSource', 'metaBudgetRemaining',
            'metaAdSetBudget', 'metaAdSetBudgetType', 'metaBudgetSharing', 'metaBudgetSchedule',
            'metaImpressions', 'metaReach', 'metaActiveSpendDays', 'metaFirstDelivery', 'metaLastDelivery', 'metaDailySpend',
            'metaUpdatedTime', 'metaCampaignUpdatedTime', 'metaAdSetUpdatedTime', 'metaAdSetCount', 'metaActiveAdSetCount',
            'metaCurrency', 'prismaCurrency', 'currencyMismatch', 'prismaCampaignId', 'prismaClient', 'prismaProduct', 'prismaPlacementNames', 'prismaPlacementNumbers', 'prismaBuyNumbers', 'prismaBookingKeys', 'prismaPlanned', 'prismaOrderAmount', 'prismaIntegratedSpend', 'prismaNonIntegratedSpend', 'prismaOpportunity', 'variance',
            'metaStart', 'metaEnd', 'prismaStart', 'prismaEnd',
            'prismaUpdatedTime',
            'prismaOrderStatus', 'prismaIntegratedStatus', 'prismaDeliveryStatus', 'prismaFlightStatus', 'prismaPeriodStatus',
            'classification', 'evidence', 'issues', 'prismaWorkflowIssues', 'owner', 'candidateScore'
        ];
        const valueFor = (row, field) => {
            if (field === 'metaDailySpend') return (row[field] || []).map(day => `${day.date}:${day.spend}`).join('; ');
            return Array.isArray(row[field]) ? row[field].join('; ') : row[field];
        };
        return [headers.join(','), ...rows.map(row => fields.map(field => escapeCsv(valueFor(row, field))).join(','))].join('\r\n');
    }

    return { parseCsv, resolveColumns, aggregateMeta, extractMetaReferenceData, extractPrismaReferenceData, aggregatePrisma, buildMetaAccountCrossReference, compare, summarizeRows, reportToCsv, nameSimilarity, findCandidates, parseDate, parseMoney };
});

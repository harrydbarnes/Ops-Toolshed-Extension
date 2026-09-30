(function(root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.socialCampaignCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function() {
    'use strict';
    const number = value => value === '' || value == null || !Number.isFinite(Number(value)) ? null : Number(value);
    const date = value => /^\d{4}-\d{2}-\d{2}/.test(String(value || '')) ? String(value).slice(0, 10) : '';
    function extractBookings(grid) {
        if (!Array.isArray(grid.nodes) || grid.status === 'error') throw new Error('Prisma did not return a booking grid.');
        const bookings = [], unmatched = [], seen = new Set();
        let count = 0;
        function visit(node, parent = {}) {
            count++;
            const own = Object.fromEntries((node.fields || []).map(field => [field.id, field.value]));
            const inherited = { ...parent, ...Object.fromEntries(Object.entries(own).filter(([,value]) => value !== '' && value != null)) };
            const packageBudget = number(own.programmaticPackageBudget);
            if (packageBudget !== null) {
                inherited.packageBudget = packageBudget;
                inherited.packageId = String(own.id || '');
                inherited.packagePlacementNumber = String(own.placementNumber || '');
            }
            if (node.nodes?.length) { node.nodes.forEach(child => visit(child, inherited)); return; }
            const supplier = String(inherited.supplier || inherited.supplierSite || '').toUpperCase();
            const isMeta = String(inherited.providerTypeId) === '3';
            const looksLikeUnlinkedMeta = /(?:^|\|)FACEBOOK$/.test(supplier);
            if (String(own.placementType) === '2' || (!isMeta && !looksLikeUnlinkedMeta)) return;
            const placementId = String(own.id || '');
            if (!placementId || seen.has(placementId)) return;
            seen.add(placementId);
            const booking = {
                placementId, placementNumber: String(own.placementNumber || ''), name: String(own.placementName || ''),
                campaignId: String(own.campaignIdOnExternalProvider || ''), accountId: String(inherited.accountCode || ''),
                providerId: String(inherited.adserverInstanceId || inherited.searchEngineInstanceId || ''),
                currency: String(inherited.placementCurrencyCode || ''), budget: number(own.budgetPayableAmount),
                start: date(own.flightStart), end: date(own.flightEnd),
                packageId: inherited.packageId || '', packagePlacementNumber: inherited.packagePlacementNumber || '', packageBudget: inherited.packageBudget ?? null
            };
            if (!isMeta || !/^\d+$/.test(booking.campaignId) || !/^\d+$/.test(booking.accountId) || booking.budget === null || !booking.start || !booking.end || booking.start > booking.end) unmatched.push(booking);
            else bookings.push(booking);
        }
        grid.nodes.forEach(node => visit(node));
        if (number(grid.total) === null || Number(grid.total) !== count) throw new Error('Prisma returned a partial booking grid. No comparison was made.');
        return { bookings, unmatched };
    }
    function groupBookings(bookings) {
        const groups = new Map();
        bookings.forEach(booking => {
            const key = `${booking.accountId}:${booking.campaignId}`;
            if (!groups.has(key)) groups.set(key, { accountId: booking.accountId, campaignId: booking.campaignId, bookings: [] });
            groups.get(key).bookings.push(booking);
        });
        return [...groups.values()];
    }
    function configuration(snapshot) {
        const fields = entity => ({ id: entity.id, start: entity.start_time || '', end: entity.stop_time || entity.end_time || '', daily: entity.daily_budget ?? null, lifetime: entity.lifetime_budget ?? null, schedule: entity.is_budget_schedule_enabled || false, sharing: entity.is_adset_budget_sharing_enabled || false });
        return JSON.stringify([fields(snapshot.campaign), ...snapshot.adSets.slice().sort((a,b) => String(a.id).localeCompare(String(b.id))).map(fields)]);
    }
    function compare(group, snapshot, linkedPlacements, previous) {
        const { campaign, account, adSets, dailySpend } = snapshot;
        if (String(campaign.id) !== group.campaignId || String(campaign.account_id) !== group.accountId || String(account.id).replace(/^act_/, '') !== group.accountId) throw new Error('Meta returned a different campaign or account.');
        const warnings = [], findings = [], notes = [];
        notes.push('Checks cover this Prisma campaign only; other linked campaigns are excluded.');
        if (!account.timezone_name) warnings.push('Meta account timezone is unavailable. Flight dates need manual review.');
        const metaDate = value => {
            if (!value || !account.timezone_name || !String(value).includes('T')) return date(value);
            const timestamp = new Date(value);
            if (!Number.isFinite(timestamp.getTime())) throw new Error('Meta returned an unreadable flight date.');
            const parts = new Intl.DateTimeFormat('en-GB', { timeZone: account.timezone_name, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(timestamp);
            const get = type => parts.find(part => part.type === type).value;
            return `${get('year')}-${get('month')}-${get('day')}`;
        };
        const currencies = [...new Set(group.bookings.map(item => item.currency))];
        // Monetary comparisons are limited to currencies verified to use Meta's two-decimal minor units.
        const comparable = currencies.length === 1 && currencies[0] === account.currency && ['GBP','USD','EUR','AUD','CAD','NZD'].includes(account.currency);
        if (!comparable) warnings.push('Currency mismatch or unsupported currency: monetary differences have not been calculated.');
        const refs = new Set(group.bookings.map(item => item.placementNumber));
        const coverage = Array.isArray(linkedPlacements) && linkedPlacements.length > 0 && linkedPlacements.every(ref => refs.has(String(ref))) && [...refs].every(ref => linkedPlacements.includes(ref));
        if (!coverage) warnings.push('Linked Prisma placement coverage is incomplete or unverified. Differences may relate to other bookings.');
        const budget = currencies.length === 1 ? group.bookings.reduce((sum,item) => sum + item.budget, 0) : null;
        const packages = new Map(group.bookings.filter(item => item.packageBudget !== null).map(item => [item.packageId, item.packageBudget]));
        const packageBudget = packages.size ? [...packages.values()].reduce((sum,item) => sum + item, 0) : null;
        const entities = number(campaign.lifetime_budget) > 0 || number(campaign.daily_budget) > 0 ? [campaign] : adSets;
        const lifetime = entities.length > 0 && entities.every(entity => number(entity.lifetime_budget) > 0 && !entity.is_budget_schedule_enabled) && !campaign.is_adset_budget_sharing_enabled;
        const metaBudget = lifetime ? entities.reduce((sum,entity) => sum + Number(entity.lifetime_budget) / 100, 0) : null;
        if (!lifetime) warnings.push('Meta uses daily, mixed, scheduled or unavailable budgets. No lifetime budget comparison is possible; configuration changes are still checked.');
        const ranges = adSets.length ? adSets.map(item => ({ start: metaDate(item.start_time), end: metaDate(item.end_time) })) : [{ start: metaDate(campaign.start_time), end: metaDate(campaign.stop_time) }];
        const booked = value => group.bookings.some(item => value >= item.start && value <= item.end);
        const coveredRange = range => {
            if (!range.start || !range.end) return false;
            let cursor = range.start;
            for (const item of group.bookings.slice().sort((a,b) => a.start.localeCompare(b.start))) {
                if (item.end < cursor) continue;
                if (item.start > cursor) return false;
                if (item.end >= range.end) return true;
                cursor = new Date(Date.parse(`${item.end}T00:00:00Z`) + 86400000).toISOString().slice(0,10);
            }
            return false;
        };
        if (ranges.some(range => !range.start || !range.end)) findings.push('Meta has a missing or open-ended flight date.');
        if (ranges.some(range => range.start && range.end && !coveredRange(range))) findings.push('Meta flight extends outside booked dates or crosses a gap between bookings.');
        const metaStarts = ranges.map(item => item.start).filter(Boolean).sort(), metaEnds = ranges.map(item => item.end).filter(Boolean).sort();
        const bookingStarts = group.bookings.map(item => item.start).sort(), bookingEnds = group.bookings.map(item => item.end).sort();
        if (metaStarts.length && metaEnds.length && (metaStarts[0] !== bookingStarts[0] || metaEnds.at(-1) !== bookingEnds.at(-1))) {
            const format = value => new Intl.DateTimeFormat('en-GB', {day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(`${value}T00:00:00Z`));
            const offset = (meta, prisma) => Math.round((Date.parse(`${meta}T00:00:00Z`) - Date.parse(`${prisma}T00:00:00Z`)) / 86400000);
            const difference = (verb, days) => days === 0 ? `${verb} on the same day` : `${verb} ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ${days > 0 ? 'later' : 'earlier'}`;
            const dateMessage = `Flight dates differ: Prisma ${format(bookingStarts[0])} to ${format(bookingEnds.at(-1))}; Meta ${format(metaStarts[0])} to ${format(metaEnds.at(-1))}. Meta ${difference('starts',offset(metaStarts[0],bookingStarts[0]))} and ${difference('ends',offset(metaEnds.at(-1),bookingEnds.at(-1)))}.`;
            (ranges.every(coveredRange) ? notes : findings).push(dateMessage);
        }
        let totalSpend = 0, outsideSpend = 0;
        const outsideDays = [];
        dailySpend.forEach(row => {
            const amount = number(row.spend), day = date(row.date_start);
            if (amount === null || amount < 0 || !day || date(row.date_stop) !== day) throw new Error('Meta returned incomplete daily spend.');
            totalSpend += amount;
            if (amount > 0 && !booked(day)) { outsideSpend += amount; outsideDays.push({ date: day, spend: amount }); }
        });
        if (comparable && outsideSpend > 0.01) findings.push('Meta has spend outside the selected Prisma booking dates.');
        if (comparable && metaBudget !== null && Math.abs(metaBudget - budget) > 0.01) findings.push(metaBudget > budget ? 'Meta lifetime budget is higher than booked net media.' : 'Meta lifetime budget is lower than booked net media.');
        if (comparable && totalSpend > budget + 0.01) findings.push('Meta spend exceeds the selected Prisma net media budget.');
        if (packageBudget !== null) notes.push('Package budget is a soft limit. Checks use placement net cost.');
        const packageSources = [...new Map(group.bookings.filter(item => item.packageBudget !== null).map(item => [item.packageId, { placementNumber: item.packagePlacementNumber || item.packageId, field: 'programmaticPackageBudget', value: item.packageBudget }])).values()];
        const fingerprint = configuration(snapshot);
        let lastChange = previous?.lastChange || null;
        if (previous?.fingerprint && previous.fingerprint !== fingerprint) {
            findings.push('Meta budget or dates changed since the last successful check.');
            lastChange = { detectedAt: new Date().toISOString(), previousLifetimeBudget: previous.metaBudget, previousDailyBudgets: previous.dailyBudgets || [], previousRanges: previous.metaRanges || [] };
        }
        return { campaignId: group.campaignId, accountId: group.accountId, name: campaign.name, currency: account.currency, prismaCurrency: currencies.length === 1 ? currencies[0] : '', timezone: account.timezone_name, budget, packageBudget: currencies.length === 1 ? packageBudget : null, packageSources, metaBudget: comparable ? metaBudget : null, totalSpend, outsideSpend, outsideDays, findings, warnings, notes, comparisonBasis: 'Prisma allocated net media', coverage, fingerprint, lastChange, bookings: group.bookings, metaRanges: ranges, dailyBudgets: comparable ? entities.map(entity => number(entity.daily_budget)).filter(value => value !== null && value > 0).map(value => value / 100) : [], insightScope: 'Meta maximum available history, daily in the ad account timezone. Older unavailable history is not verified.' };
    }
    return { extractBookings, groupBookings, compare, configuration };
});

(function(root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.reccieCore = api;
    if (typeof globalThis !== 'undefined') globalThis.reccieCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function() {
    'use strict';
    const validMonth = value => /^(20\d{2})-(0[1-9]|1[0-2])$/.test(String(value || ''));
    const clean = value => String(value ?? '').trim();
    const missingDMessage = 'D number not found for this month — please check in case of tracker issues, likely deleted.';
    const verificationMethods = Object.freeze(Object.fromEntries(Array.from({length:20}, (_,index) => index+1).map(concurrency => {
        const id = `workers-${concurrency}`;
        return [id, Object.freeze({ id, label: `${concurrency} concurrent campaign checks`, concurrency,
            scheduler: 'continuous-queue-v1', maxCampaigns: 50, maxRows: 500,
            requestTimeoutMs: 30000, retryLimit: 1, runBudgetMs: 240000 })];
    })));
    function verificationMethod(id = 'workers-8') {
        if (!Object.prototype.hasOwnProperty.call(verificationMethods, id)) throw new Error('Choose a whole number of workers from 1 to 20.');
        return verificationMethods[id];
    }
    function parseCsv(text) {
        if (typeof text !== 'string' || text.length > 5000000) throw new Error('Choose a CSV smaller than 5 MB.');
        const rows = []; let row = [], cell = '', quoted = false;
        text = text.replace(/^\uFEFF/, '');
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (char === '"') {
                if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
                else quoted = !quoted;
            } else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
            else if ((char === '\n' || char === '\r') && !quoted) {
                if (char === '\r' && text[i + 1] === '\n') i++;
                row.push(cell); if (row.some(value => clean(value))) rows.push(row);
                row = []; cell = '';
            } else cell += char;
        }
        if (quoted) throw new Error('The CSV has an unclosed quoted cell.');
        row.push(cell); if (row.some(value => clean(value))) rows.push(row);
        if (rows.length > 10001) throw new Error('Import up to 10,000 tracker rows at a time.');
        return rows;
    }
    function importCsv(text, month) {
        if (!validMonth(month)) throw new Error('Choose the report month, including for rows without booking dates.');
        const table = parseCsv(text);
        const headers = (table.shift() || []).map(value => clean(value).toLowerCase());
        if (!headers.includes('campaign id mediaocean') && headers.includes('campaign id')) headers[headers.indexOf('campaign id')] = 'campaign id mediaocean';
        const required = ['serial number', 'campaign id mediaocean', 'buyer name', 'ops assigned', 'group', 'reccied'];
        for (const header of required) {
            if (headers.filter(value => value === header).length !== 1) throw new Error(`CSV needs one ${header} column. Export the Reccie report tab.`);
        }
        const get = (row, name) => clean(row[headers.indexOf(name)]);
        const rows = table.map((row, index) => ({
            sourceRow: index + 2, dNumber: get(row, 'serial number').toUpperCase(),
            campaignId: get(row, 'campaign id mediaocean').toUpperCase(), month,
            buyer: get(row, 'buyer name'), ops: get(row, 'ops assigned'), group: get(row, 'group'),
            client: get(row, 'client name'), campaignName: get(row, 'campaign description'),
            supplier: get(row, 'supplier name'), order: get(row, 'order'), gross: get(row, 'gross'),
            bookingEndDate: get(row, 'booking end date'), comments: get(row, 'comments'), reccied: get(row, 'reccied')
        })).filter(row => row.dNumber);
        if (!rows.length) throw new Error('No D numbers were found in this report.');
        const counts = new Map();
        rows.forEach(row => counts.set(row.dNumber, (counts.get(row.dNumber) || 0) + 1));
        rows.forEach(row => {
            row.issue = !/^D\d{5,15}$/.test(row.dNumber) ? 'Invalid D number' :
                !/^CP[A-Z0-9]{3,20}$/.test(row.campaignId) ? 'Missing or invalid campaign ID' :
                    counts.get(row.dNumber) > 1 ? 'Duplicate D number in report' : '';
        });
        return rows;
    }
    function currentMonth() {
        const parts = new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/London',year:'numeric',month:'2-digit'}).formatToParts(new Date());
        return `${parts.find(part=>part.type==='year').value}-${parts.find(part=>part.type==='month').value}`;
    }
    function trackerKey(mode = 'main', month) {
        if (!['main','early','automatic'].includes(mode)) throw new Error('Choose a valid Reccies mode.');
        if (mode === 'main') return 'reccieTracker';
        if (!validMonth(month)) throw new Error('Choose a valid report month.');
        return `reccieTracker:${mode}:${month}`;
    }
    function bookingMonth(value) {
        const text = clean(value);
        if (!text) return '';
        let match = text.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})(?:T.*)?$/), year, month, day;
        if (match) [,year,month,day] = match;
        else if ((match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4}|\d{2})$/))) { [,day,month,year] = match; if (year.length === 2) year = `20${year}`; }
        else if ((match = text.match(/^(\d{1,2})[- ]([A-Za-z]{3,9})[- ,]+(20\d{2})$/))) { [,day,month,year] = match; month = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(month.slice(0,3).toLowerCase())+1; }
        else return null;
        const date = new Date(Date.UTC(Number(year), Number(month)-1, Number(day)));
        return date.getUTCFullYear()===Number(year) && date.getUTCMonth()===Number(month)-1 && date.getUTCDate()===Number(day) ? `${year}-${String(month).padStart(2,'0')}` : null;
    }
    function earlyRows(csv, month) {
        if (month !== currentMonth()) throw new Error('Early Recs uses the current month.');
        const headers = parseCsv(csv)[0]?.map(value=>clean(value).toLowerCase()) || [];
        if (headers.filter(value=>value==='booking end date').length !== 1) throw new Error('Early Recs needs one Booking End Date column.');
        if (parseCsv(csv).length < 2) return {rows:[],reason:'Early Reccie report has no current-month rows.'};
        const all = importCsv(csv, month), dated = all.map(row=>bookingMonth(row.bookingEndDate));
        const months = new Set(dated.filter(Boolean));
        if (!months.has(month)) return {rows:[],reason:'Early Reccie report has no confirmed current-month booking dates.'};
        const canInfer = months.size===1 && !dated.includes(null);
        const rows = all.filter((row,index)=>{
            const date = dated[index];
            if (date && date!==month) return false;
            if (date===null || (!date && !canInfer)) row.issue = row.issue || 'Booking End Date is invalid or ambiguous; confirm the month manually.';
            if (!date && canInfer) row.monthInferred = true;
            return true;
        });
        return {rows,excludedRows:all.length-rows.length,ambiguousRows:rows.filter(row=>row.issue?.includes('Booking End Date')).length};
    }
    function sheetSource(input) {
        let url;
        try { url = new URL(input); } catch (_) { throw new Error('Paste the Google Sheet tab URL.'); }
        const match = url.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]{20,150})\/(?:edit|view)?$/);
        if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com' || url.port || url.username || url.password || !match) {
            throw new Error('Use an HTTPS docs.google.com spreadsheet tab URL.');
        }
        const gid = new URLSearchParams(url.hash.replace(/^#/, '')).get('gid') || url.searchParams.get('gid');
        if (!/^\d{1,20}$/.test(gid || '')) throw new Error('Open the Reccie report tab and copy its URL, including gid.');
        return { spreadsheetId: match[1], gid,
            url: `https://docs.google.com/spreadsheets/d/${match[1]}/edit?gid=${gid}`,
            csvUrl: `https://docs.google.com/spreadsheets/d/${match[1]}/gviz/tq?tqx=out:csv&gid=${gid}` };
    }
    function extractResults(data) {
        if (!data || data.status !== 0 || !Array.isArray(data.nodes)) throw new Error('Prisma did not return a valid reconciliation grid.');
        const rows = [];
        function visit(nodes) {
            for (const node of nodes) {
                const fields = Object.fromEntries((node.fields || []).map(field => [field.id, field.value]));
                if (fields.buySerialNumber) rows.push(fields);
                if (Array.isArray(node.nodes)) visit(node.nodes);
            }
        }
        visit(data.nodes);
        if (Number(data.total) > 0 && !data.nodes.length) throw new Error('Prisma returned a count without row data. Nothing was verified.');
        return rows;
    }
    function evaluateRow(row, records) {
        if (row.issue) return { state: 'review', message: row.issue };
        const matches = records.filter(record => record.buySerialNumber === row.dNumber && record.month === row.month);
        if (matches.length !== 1) return { state: 'review', message: matches.length ? 'Multiple Prisma matches' : missingDMessage };
        const record = matches[0];
        const reconciled = record.okToPay, buyStatus = record.buyStatus;
        if (!['0', '1'].includes(reconciled) || !buyStatus) return { state: 'review', message: 'Prisma status is incomplete or unrecognised', reconciled, buyStatus };
        return { state: reconciled === '1' && buyStatus === 'SUCCESSFUL' ? 'ready' : 'outstanding', reconciled, buyStatus };
    }
    function campaignUrl(row) {
        if (!/^CP[A-Z0-9]{3,20}$/.test(row.campaignId) || !validMonth(row.month)) return '';
        return `https://go.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=${row.campaignId}&ptb-mod=buy&ptb-ctx=actualize&route=actualize&mos=${row.month}-01`;
    }
    return { validMonth, parseCsv, importCsv, sheetSource, extractResults, evaluateRow, campaignUrl, missingDMessage, verificationMethod, currentMonth, trackerKey, bookingMonth, earlyRows };
});

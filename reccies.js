(function() {
    'use strict';
    const core = window.reccieCore, $ = id => document.getElementById(id);
    let tracker = null, busy = false, limit = 40, latestTiming = null;
    const labels = { ready: 'Verified ready', outstanding: 'Outstanding', review: 'Needs attention', error: 'Check failed' };
    function trackerMismatch(row, result) {
        if (row.issue || row.reccied.toLowerCase() !== 'yes' || result?.state !== 'outstanding') return '';
        const reasons = [];
        if (result.reconciled === '0') reasons.push('Not reconciled');
        if (result.buyStatus && result.buyStatus !== 'SUCCESSFUL') reasons.push('Buy not successful');
        return reasons.join(' · ');
    }
    const dateLabel = value => value ? new Date(value).toLocaleString() : 'Never';
    const text = (tag, value, className) => { const node = document.createElement(tag); node.textContent = value; if (className) node.className = className; return node; };
    const highlighted = (tag, value, className) => {
        const node = text(tag, '', className);
        window.OpsToolshedSearchHighlight.appendHighlightedText(node, value, $('search').value);
        return node;
    };
    function message(value, error = false, verifying = false) {
        const status = $('message');
        status.classList.toggle('error', error);
        status.classList.toggle('is-verifying', verifying);
        if (!verifying) { status.textContent = value; return; }
        const dot = text('span', '', 'reccie-status-dot');
        dot.setAttribute('aria-hidden', 'true');
        const split = value.lastIndexOf(' ');
        const body = text('span', value.slice(0, split + 1), 'reccie-status-text');
        const tail = text('span', value.slice(split + 1), 'reccie-status-tail');
        const dots = text('span', '', 'reccie-status-dots');
        dots.setAttribute('aria-hidden', 'true');
        for (let index = 0; index < 3; index++) dots.append(text('span', '.'));
        tail.append(dots);
        body.append(tail);
        status.replaceChildren(dot, body);
    }
    function showTiming(report) {
        latestTiming = report || null;
        $('timing-details').hidden = !report;
        $('download-timings').disabled = !report;
        $('timing-report').textContent = report ? JSON.stringify(report, null, 2) : '';
    }
    $('download-timings').addEventListener('click', () => {
        if (!latestTiming) return;
        try {
            const markdown = '# Reccie verification timings\n\n' +
                `Method: ${latestTiming.method?.label || `${latestTiming.concurrency} concurrent campaign checks (legacy report)`}${latestTiming.methodConfirmed === false ? ' — NOT CONFIRMED by background worker' : ''}\n\n` +
                'Local diagnostics. The spreadsheet was not changed. Request durations overlap when campaigns run concurrently.\n\n' +
                '```json\n' + JSON.stringify(latestTiming, null, 2) + '\n```\n';
            const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
            const link = document.createElement('a');
            link.href = url;
            const methodId = String(latestTiming.method?.id || `workers-${latestTiming.concurrency}`).replace(/[^a-z0-9-]/g, '');
            link.download = `reccie-timings-${methodId}-${String(latestTiming.startedAt || 'latest').replace(/[^0-9T-]/g, '') || 'latest'}.md`;
            try { document.body.append(link); link.click(); }
            finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
        } catch (_) { message('Could not download timings. You can still select and copy the report below.', true); }
    });
    function setBusy(value) {
        busy = value;
        ['refresh-sheet', 'csv-file', 'report-month', 'sheet-url', 'forget-report', 'assignment', 'person', 'search', 'show-by'].forEach(id => { $(id).disabled = value; });
        $('check-rows').disabled = value || !shownRows().length || tracker?.month !== $('report-month').value;
        statusInputs().forEach(input => { input.disabled = value; });
        $('clear-filters').disabled = value;
        $('debug-workers').disabled = value;
        $('debug-run').disabled = $('check-rows').disabled;
    }
    async function send(operation, args = {}) {
        const response = await chrome.runtime.sendMessage({ action: 'reccies', operation, ...args });
        if (response?.status !== 'success') throw new Error(response?.message || 'Could not reach Ops Toolshed. Reload the extension and try again.');
        tracker = response.tracker || null;
        return tracker;
    }
    function myRows() {
        const person = $('person').value.toLowerCase(), role = $('assignment').value;
        if (!person) return [];
        return (tracker?.rows || []).filter(row => (role === 'any' ? ['ops','buyer','group'] : [role]).some(key => row[key]?.toLowerCase() === person));
    }
    function campaignGroups(rows) {
        const groups = new Map();
        rows.forEach(row => {
            const key = row.campaignId ? `${row.campaignId}/${row.month}` : `no-campaign/${row.month}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(row);
        });
        return [...groups.values()];
    }
    const statusInputs = () => [...document.querySelectorAll('[data-status]')];
    const selectedStatuses = () => statusInputs().filter(input => input.checked).map(input => input.dataset.status);
    function matchesStatus(row, status) {
        const result = tracker.checks?.[row.sourceRow];
        if (status === 'outstanding') return row.reccied.toLowerCase() !== 'yes';
        if (status === 'reconciled') return row.reccied.toLowerCase() === 'yes';
        if (status === 'mismatch') return !!trackerMismatch(row, result);
        if (status === 'ready') return result?.state === 'ready';
        if (status === 'review') return !!row.issue || ['review','error'].includes(result?.state);
        return false;
    }
    function shownRows() {
        const search = $('search').value.trim().toLowerCase(), statuses = selectedStatuses();
        return myRows().filter(row => (!statuses.length || statuses.some(status => matchesStatus(row, status))) &&
            (!search || [row.dNumber,row.campaignId,row.campaignName,row.client,row.supplier,row.order].some(value => value.toLowerCase().includes(search))));
    }
    const counted = (number, singular, plural = `${singular}s`) => `${number} ${number === 1 ? singular : plural}`;
    function rowCount(rows, grouped = $('show-by').value === 'campaign') {
        return `${grouped ? `${counted(campaignGroups(rows).length, 'campaign')} · ` : ''}${counted(rows.length, 'D number')}`;
    }
    function mismatchWarning(rows, grouped = false) {
        const mismatches = rows.filter(row => trackerMismatch(row, tracker.checks?.[row.sourceRow]));
        if (!mismatches.length) return null;
        const warning = text('div', '', 'mismatch-warning');
        warning.append(text('span', 'Not reconciled in Prisma', 'badge mismatch'));
        mismatches.forEach(row => {
            const result = tracker.checks[row.sourceRow];
            const buy = result.buyStatus !== 'SUCCESSFUL' ? `Buy status: ${result.buyStatus.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, value => value.toUpperCase())}` : '';
            warning.append(text('p', `${grouped ? `${row.dNumber} · ` : ''}${result.reconciled === '0' ? 'Reconciled: No' : ''}${result.reconciled === '0' && buy ? ' · ' : ''}${buy}`, 'mismatch-detail'));
        });
        return warning;
    }
    function people(preferred = $('person').value) {
        const role = $('assignment').value;
        const names = [...new Set((tracker?.rows || []).flatMap(row => (role === 'any' ? ['ops','buyer','group'] : [role]).map(key => row[key])).filter(Boolean))].sort((a,b) => a.localeCompare(b));
        $('person').replaceChildren(new Option('Choose your name', ''), ...names.map(name => new Option(name, name)));
        if (names.includes(preferred)) $('person').value = preferred;
    }
    async function savePreferences() {
        await chrome.storage.local.set({ recciePreferences: { person: $('person').value, assignment: $('assignment').value, showBy: $('show-by').value, statuses: selectedStatuses() } });
    }
    function render() {
        const shown = shownRows(), mine = myRows();
        const grouped = $('show-by').value === 'campaign';
        const entries = grouped ? campaignGroups(shown) : shown;
        $('source-status').textContent = tracker ? `${tracker.rows.length.toLocaleString()} rows · Report ${tracker.month} · Read ${dateLabel(tracker.importedAt)} · ${tracker.source.type === 'google' ? 'Google Sheet' : 'CSV snapshot'}` : 'No tracker loaded. Tracker data and check results are stored locally in this Chrome profile.';
        $('summary').textContent = tracker ? (!$('person').value ? 'Choose your name to see your assignments.' : `${rowCount(shown, grouped)} shown · ${mine.length} assigned · ${mine.filter(row => row.reccied.toLowerCase() !== 'yes').length} not marked Yes`) : 'Connect a tracker to get started.';
        const list = $('rows'); list.replaceChildren();
        $('clear-filters').hidden = !selectedStatuses().length && !$('search').value.trim();
        statusInputs().forEach(input => input.closest('label').classList.toggle('is-selected', input.checked));
        if (!shown.length) list.append(text('p', !tracker ? 'Read a Google Sheet or import a CSV to start.' : !$('person').value ? 'Select your assignment and name above.' : selectedStatuses().length === 1 && selectedStatuses()[0] === 'mismatch' ? 'No confirmed mismatches match these filters. Select Reconciled and verify to check tracker-Yes rows. Unchecked, failed and review items are not included here.' : 'No rows match these filters. Clear filters to see all your assignments.', 'empty'));
        entries.slice(0, limit).forEach(entry => {
            const row = grouped ? entry[0] : entry;
            if (grouped) {
                const card = text('article', '', 'reccie-card campaign-card');
                const numbers = [...new Set(entry.map(item => item.dNumber))];
                const top = text('div', '', 'card-top');
                top.append(highlighted('h2', row.campaignId ? row.campaignName || row.campaignId : 'No campaign', 'campaign-title'));
                const warning = mismatchWarning(entry, true);
                if (warning) top.append(warning);
                card.append(top, text('p', counted(numbers.length, 'D number'), 'supplier'),
                    highlighted('p', numbers.join(', '), 'campaign-d-numbers'));
                const bottom = text('div', '', 'card-bottom');
                bottom.append(highlighted('span', `${row.campaignId} · ${row.month}`));
                const url = core.campaignUrl(row);
                if (url) { const link = text('a', 'Open in Prisma ↗'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; bottom.append(link); }
                card.append(bottom); list.append(card); return;
            }
            const result = tracker.checks?.[row.sourceRow];
            const state = row.issue ? 'review' : result?.state;
            const warning = mismatchWarning([row]);
            const card = text('article', '', 'reccie-card');
            const top = text('div', '', 'card-top');
            top.append(highlighted('strong', row.dNumber), warning || text('span', state ? labels[state] : 'Not checked', `badge ${state || ''}`));
            card.append(top, highlighted('p', row.client || row.campaignId, 'supplier'), highlighted('p', row.campaignName, 'campaign-name'), highlighted('p', row.supplier, 'supplier'));
            if (row.order) card.append(highlighted('p', row.order, 'campaign-name'));
            const statuses = text('div', '', 'status-lines');
            statuses.append(text('p', `Tracker Reccied: ${row.reccied || 'Blank'}`));
            if (result?.reconciled != null) statuses.append(text('p', `Prisma Reconciled: ${result.reconciled === '1' ? 'Yes' : result.reconciled === '0' ? 'No' : 'Unknown'} · Buy: ${result.buyStatus || 'Unknown'}`));
            if (row.issue || result?.message) statuses.append(text('p', row.issue || (result.message === 'D number not found for this month' ? core.missingDMessage : result.message)));
            if (result?.state === 'ready') statuses.append(text('p', row.reccied.toLowerCase() === 'yes' ? 'Matches the tracker’s Yes.' : 'Ready to mark manually in the tracker.'));
            if (result?.state === 'outstanding' && row.reccied.toLowerCase() === 'yes') statuses.append(text('p', 'Tracker says Yes, but Prisma does not meet the rule. Review manually.'));
            card.append(statuses);
            if (row.comments) card.append(text('p', row.comments, 'comment'));
            const bottom = text('div', '', 'card-bottom');
            bottom.append(highlighted('span', `${row.campaignId} · ${row.month}\nChecked: ${dateLabel(result?.checkedAt)}`));
            const url = core.campaignUrl(row);
            if (url) { const link = text('a', 'Open in Prisma ↗'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; bottom.append(link); }
            card.append(bottom); list.append(card);
        });
        if (entries.length > limit) { const more = text('button', grouped ? 'Show more campaigns' : 'Show more rows', 'more'); more.type = 'button'; more.onclick = () => { limit += 40; render(); }; list.append(more); }
        setBusy(busy);
    }
    async function loadReport(operation, args) {
        setBusy(true); message('Reading report…');
        try {
            await send(operation, { ...args, month: $('report-month').value });
            showTiming(null);
            people(); render(); $('source-details').open = false;
            message('Report loaded. Choose your name, then verify the reconciliation status.');
        } catch (error) { message(error.message, true); }
        finally { setBusy(false); }
    }
    $('refresh-sheet').addEventListener('click', async () => {
        try {
            core.sheetSource($('sheet-url').value);
            if (!core.validMonth($('report-month').value)) throw new Error('Choose the report month first.');
            const allowed = await chrome.permissions.request({ origins: ['https://docs.google.com/*'] });
            if (!allowed) throw new Error('Google access was not granted. You can import a CSV instead.');
            await loadReport('refresh', { url: $('sheet-url').value });
        } catch (error) { message(error.message, true); }
    });
    $('csv-file').addEventListener('change', async () => {
        const file = $('csv-file').files[0];
        if (!file) return;
        if (file.size > 5000000) { message('Choose a CSV smaller than 5 MB.', true); return; }
        try { await loadReport('import', { csv: await file.text(), name: file.name }); }
        catch (error) { message(error.message, true); }
        $('csv-file').value = '';
    });
    $('assignment').addEventListener('change', () => { people(); limit = 40; render(); savePreferences().catch(error => message(error.message, true)); });
    ['person','show-by'].forEach(id => $(id).addEventListener('change', () => { limit = 40; render(); savePreferences().catch(error => message(error.message, true)); }));
    $('search').addEventListener('input', () => { limit = 40; render(); });
    statusInputs().forEach(input => input.addEventListener('change', () => { limit = 40; render(); savePreferences().catch(error => message(error.message, true)); }));
    $('clear-filters').addEventListener('click', () => {
        statusInputs().forEach(input => { input.checked = false; });
        $('search').value = ''; limit = 40; render(); savePreferences().catch(error => message(error.message, true));
    });
    $('report-month').addEventListener('change', () => { render(); if (tracker && tracker.month !== $('report-month').value) message('Read or import the report again to use this month.'); });
    $('forget-report').addEventListener('click', async () => {
        setBusy(true);
        try { await send('clear'); showTiming(null); people(); $('sheet-url').value = ''; render(); $('source-details').open = true; message('Local tracker data forgotten.'); }
        catch (error) { message(error.message, true); }
        finally { setBusy(false); }
    });
    async function verifyRows(methodId) {
        if (busy || $('check-rows').disabled) return;
        const method = core.verificationMethod(methodId);
        const selected = shownRows(), revision = tracker?.revision;
        const selectedCount = rowCount(selected);
        const groups = new Map();
        selected.forEach(row => { const key = `${row.campaignId}/${row.month}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row.sourceRow); });
        const batches = [], entries = [...groups.values()];
        // All comparison methods use the same queue and limits; only concurrency changes.
        let batch = [], campaigns = 0;
        for (const ids of entries) {
            for (let offset = 0; offset < ids.length; offset += method.maxRows) {
                const part = ids.slice(offset, offset + method.maxRows);
                if (batch.length && (campaigns >= method.maxCampaigns || batch.length + part.length > method.maxRows)) { batches.push(batch); batch = []; campaigns = 0; }
                batch.push(...part); campaigns++;
            }
        }
        if (batch.length) batches.push(batch);
        const started = performance.now();
        const timing = { method, methodConfirmed: false, selection: { trackerRevision: revision, reportMonth: tracker?.month,
            person: $('person').value, assignment: $('assignment').value, showBy: $('show-by').value, statuses: selectedStatuses(), search: $('search').value,
            rowIds: selected.map(row => row.sourceRow).sort((a,b) => a-b) },
            startedAt: new Date().toISOString(), selectedRows: selected.length,
            plannedBatches: batches.length, completedBatches: 0, totalMs: 0, requests: 0,
            concurrency: method.concurrency, cacheHits: 0, retries: 0, outcome: 'running', batches: [] };
        showTiming(null);
        setBusy(true);
        $('check-rows').setAttribute('aria-busy', 'true');
        $('rows').setAttribute('aria-busy', 'true');
        try {
            for (let i = 0; i < batches.length; i++) {
                message(`Verifying reccie status · ${batches[i].length} ${batches[i].length === 1 ? 'row' : 'rows'} · ${method.concurrency} campaigns at once${batches.length > 1 ? ` · batch ${i + 1} of ${batches.length}` : ''}`, false, true);
                await send('check', { revision, rowIds: batches[i], method: method.id }); render();
                timing.completedBatches++;
                if (tracker.lastCheckTiming) {
                    timing.batches.push(tracker.lastCheckTiming);
                    timing.requests += tracker.lastCheckTiming.campaignsDetail.reduce((sum, item) => sum + item.requests.length, 0);
                    timing.retries += tracker.lastCheckTiming.retries || 0;
                    timing.cacheHits += tracker.lastCheckTiming.cacheHits || 0;
                }
                timing.methodConfirmed = tracker.lastCheckTiming?.method?.id === method.id && tracker.lastCheckTiming?.concurrency === method.concurrency;
                if (!timing.methodConfirmed) throw new Error('The background did not confirm this method. Reload Ops Toolshed and reopen Reccies before comparing timings.');
            }
            timing.outcome = 'completed';
            const failed = timing.batches.flatMap(item => item.campaignsDetail).filter(item => item.outcome === 'error').length;
            timing.failedCampaigns = failed;
            message(`Check finished in ${((performance.now() - started) / 1000).toFixed(1)} seconds using ${method.label}. Checked ${selectedCount}; ${rowCount(shownRows())} now shown.${failed ? ` ${failed} campaign checks failed.` : ''} Review each row’s result and check time. The tracker was not changed.`);
        } catch (error) { timing.outcome = 'interrupted'; message(error.message, true); }
        finally {
            $('check-rows').setAttribute('aria-busy', 'false');
            $('rows').setAttribute('aria-busy', 'false');
            timing.totalMs = Math.round(performance.now() - started);
            showTiming(timing);
            setBusy(false);
            try { await chrome.storage.local.set({ reccieLastRunTiming: { revision, report: timing } }); }
            catch (_) { /* A diagnostics persistence failure must not hide check results. */ }
        }
    }
    $('check-rows').addEventListener('click', () => verifyRows());
    $('debug-workers').addEventListener('input', () => { $('debug-worker-count').value = $('debug-workers').value; });
    $('debug-run').addEventListener('click', () => verifyRows(`workers-${$('debug-workers').value}`));
    (async () => {
        try {
            const stored = await chrome.storage.local.get(['reccieTracker','recciePreferences','reccieLastRunTiming']);
            tracker = stored.reccieTracker || null;
            const prefs = stored.recciePreferences || {};
            $('assignment').value = ['ops','buyer','group','any'].includes(prefs.assignment) ? prefs.assignment : 'ops';
            const legacyStatuses = ['outstanding','reconciled','mismatch','ready','review'];
            $('show-by').value = ['dnumber','campaign'].includes(prefs.showBy) ? prefs.showBy : prefs.view === 'campaigns' ? 'campaign' : 'dnumber';
            const statuses = Array.isArray(prefs.statuses) ? prefs.statuses : legacyStatuses.includes(prefs.view) ? [prefs.view] : [];
            statusInputs().forEach(input => { input.checked = statuses.includes(input.dataset.status); });
            const previous = new Date(); previous.setDate(1); previous.setMonth(previous.getMonth() - 1);
            $('report-month').value = tracker?.month || `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`;
            $('sheet-url').value = tracker?.source.url || '';
            people(prefs.person); $('source-details').open = !tracker; render();
            if (typeof prefs.view === 'string') await savePreferences();
            if (tracker && stored.reccieLastRunTiming?.revision === tracker.revision) showTiming(stored.reccieLastRunTiming.report);
        } catch (error) { message(error.message, true); }
    })();
})();

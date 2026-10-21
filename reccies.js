(function() {
    'use strict';
    const core = window.reccieCore, $ = id => document.getElementById(id);
    let tracker = null, busy = false, limit = 40;
    const labels = { ready: 'Verified ready', outstanding: 'Outstanding', review: 'Needs review', error: 'Check failed' };
    const dateLabel = value => value ? new Date(value).toLocaleString() : 'Never';
    const text = (tag, value, className) => { const node = document.createElement(tag); node.textContent = value; if (className) node.className = className; return node; };
    const highlighted = (tag, value, className) => {
        const node = text(tag, '', className);
        window.OpsToolshedSearchHighlight.appendHighlightedText(node, value, $('search').value);
        return node;
    };
    function message(value, error = false) { $('message').textContent = value; $('message').classList.toggle('error', error); }
    function setBusy(value) {
        busy = value;
        ['refresh-sheet', 'csv-file', 'report-month', 'sheet-url', 'forget-report', 'assignment', 'person', 'search', 'view'].forEach(id => { $(id).disabled = value; });
        $('check-rows').disabled = value || !shownRows().length || tracker?.month !== $('report-month').value;
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
            const key = row.campaignId ? `${row.campaignId}/${row.month}` : `invalid/${row.sourceRow}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(row);
        });
        return [...groups.values()];
    }
    function shownRows() {
        const search = $('search').value.trim().toLowerCase(), view = $('view').value;
        const matches = row => !search || [row.dNumber,row.campaignId,row.campaignName,row.client,row.supplier,row.order].some(value => value.toLowerCase().includes(search));
        if (view === 'campaigns') return campaignGroups(myRows()).filter(rows => rows.some(matches)).flat();
        return myRows().filter(row => {
            const result = tracker.checks?.[row.sourceRow];
            if (view === 'outstanding' && row.reccied.toLowerCase() === 'yes') return false;
            if (view === 'reconciled' && row.reccied.toLowerCase() !== 'yes') return false;
            if (view === 'ready' && result?.state !== 'ready') return false;
            if (view === 'review' && !row.issue && !['review','error'].includes(result?.state)) return false;
            return matches(row);
        });
    }
    function people(preferred = $('person').value) {
        const role = $('assignment').value;
        const names = [...new Set((tracker?.rows || []).flatMap(row => (role === 'any' ? ['ops','buyer','group'] : [role]).map(key => row[key])).filter(Boolean))].sort((a,b) => a.localeCompare(b));
        $('person').replaceChildren(new Option('Choose your name', ''), ...names.map(name => new Option(name, name)));
        if (names.includes(preferred)) $('person').value = preferred;
    }
    async function savePreferences() {
        await chrome.storage.local.set({ recciePreferences: { person: $('person').value, assignment: $('assignment').value, view: $('view').value } });
    }
    function render() {
        const shown = shownRows(), mine = myRows();
        const grouped = $('view').value === 'campaigns';
        const entries = grouped ? campaignGroups(shown) : shown;
        $('source-status').textContent = tracker ? `${tracker.rows.length.toLocaleString()} rows · Report ${tracker.month} · Read ${dateLabel(tracker.importedAt)} · ${tracker.source.type === 'google' ? 'Google Sheet' : 'CSV snapshot'}` : 'No tracker loaded. Tracker data and check results are stored locally in this Chrome profile.';
        $('summary').textContent = tracker ? (!$('person').value ? 'Choose your name to see your assignments.' : `${grouped ? `${entries.length} campaigns · ${shown.length} D numbers` : `${shown.length} shown`} · ${mine.length} assigned · ${mine.filter(row => row.reccied.toLowerCase() !== 'yes').length} not marked Yes`) : 'Connect a tracker to get started.';
        const list = $('rows'); list.replaceChildren();
        if (!shown.length) list.append(text('p', !tracker ? 'Read a Google Sheet or import a CSV to start.' : !$('person').value ? 'Select your assignment and name above.' : $('view').value === 'outstanding' ? 'No outstanding tracker rows in this view. Choose “All my D numbers” to verify completed rows too.' : 'No rows match these filters.', 'empty'));
        entries.slice(0, limit).forEach(entry => {
            const row = grouped ? entry[0] : entry;
            if (grouped) {
                const card = text('article', '', 'reccie-card campaign-card');
                const numbers = [...new Set(entry.map(item => item.dNumber))];
                card.append(highlighted('h2', row.campaignName || row.campaignId, 'campaign-title'),
                    text('p', `${numbers.length} D ${numbers.length === 1 ? 'number' : 'numbers'}`, 'supplier'),
                    highlighted('p', numbers.join(', '), 'campaign-d-numbers'));
                const bottom = text('div', '', 'card-bottom');
                bottom.append(highlighted('span', `${row.campaignId} · ${row.month}`));
                const url = core.campaignUrl(row);
                if (url) { const link = text('a', 'Open in Prisma ↗'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; bottom.append(link); }
                card.append(bottom); list.append(card); return;
            }
            const result = tracker.checks?.[row.sourceRow];
            const state = row.issue ? 'review' : result?.state;
            const card = text('article', '', 'reccie-card');
            const top = text('div', '', 'card-top');
            top.append(highlighted('strong', row.dNumber), text('span', state ? labels[state] : 'Not checked', `badge ${state || ''}`));
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
    ['person','view'].forEach(id => $(id).addEventListener('change', () => { limit = 40; render(); savePreferences().catch(error => message(error.message, true)); }));
    $('search').addEventListener('input', () => { limit = 40; render(); });
    $('report-month').addEventListener('change', () => { render(); if (tracker && tracker.month !== $('report-month').value) message('Read or import the report again to use this month.'); });
    $('forget-report').addEventListener('click', async () => {
        setBusy(true);
        try { await send('clear'); people(); $('sheet-url').value = ''; render(); $('source-details').open = true; message('Local tracker data forgotten.'); }
        catch (error) { message(error.message, true); }
        finally { setBusy(false); }
    });
    $('check-rows').addEventListener('click', async () => {
        const selected = shownRows(), revision = tracker?.revision;
        const groups = new Map();
        selected.forEach(row => { const key = `${row.campaignId}/${row.month}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row.sourceRow); });
        const batches = [], entries = [...groups.values()];
        // Bound both campaign count and row count so one request remains manageable.
        let batch = [], campaigns = 0;
        for (const ids of entries) {
            for (let offset = 0; offset < ids.length; offset += 500) {
                const part = ids.slice(offset, offset + 500);
                if (batch.length && (campaigns >= 10 || batch.length + part.length > 500)) { batches.push(batch); batch = []; campaigns = 0; }
                batch.push(...part); campaigns++;
            }
        }
        if (batch.length) batches.push(batch);
        setBusy(true);
        try {
            for (let i = 0; i < batches.length; i++) {
                message(`Verifying reconciliation status · batch ${i + 1} of ${batches.length}…`);
                await send('check', { revision, rowIds: batches[i] }); render();
            }
            message('Check finished. Review each row’s result and check time. The tracker was not changed.');
        } catch (error) { message(error.message, true); }
        finally { setBusy(false); }
    });
    (async () => {
        try {
            const stored = await chrome.storage.local.get(['reccieTracker','recciePreferences']);
            tracker = stored.reccieTracker || null;
            const prefs = stored.recciePreferences || {};
            $('assignment').value = ['ops','buyer','group','any'].includes(prefs.assignment) ? prefs.assignment : 'ops';
            $('view').value = ['all','campaigns','reconciled','ready','review','outstanding'].includes(prefs.view) ? prefs.view : 'outstanding';
            const previous = new Date(); previous.setDate(1); previous.setMonth(previous.getMonth() - 1);
            $('report-month').value = tracker?.month || `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`;
            $('sheet-url').value = tracker?.source.url || '';
            people(prefs.person); $('source-details').open = !tracker; render();
        } catch (error) { message(error.message, true); }
    })();
})();

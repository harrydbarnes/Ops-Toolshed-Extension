(function() {
    'use strict';
    const core = window.reccieCore, $ = id => document.getElementById(id);
    let tracker = null, busy = false, limit = 40, latestTiming = null, mode = 'main', mainMonth = '';
    const manualWrites = window.reccieManualWrites?.create({
        context:()=>({tracker,mode,month:$('report-month').value}),busy:()=>busy,setBusy,message,
        updated:(saved,context)=>{if(mode===context.mode&&$('report-month').value===context.month){tracker=saved;render();}}
    });
    const observed = () => tracker?.source?.type === 'automatic' || mode === 'automatic';
    const storageKey = suffix => mode === 'main' ? (suffix === 'preferences' ? 'recciePreferences' : 'reccieLastRunTiming') : `${core.trackerKey(mode, $('report-month').value)}:${suffix}`;
    const labels = { ready: 'Verified ready', outstanding: 'Outstanding', review: 'Needs attention', error: 'Check failed' };
    // Keep existing filter values and persistence; visible pills drive their native change handlers.
    const segmentBindings = [];
    function bindSegments(container, options, read, choose, disabled) {
        const buttons = options.map(option => {
            const button = document.createElement('button');
            button.type='button'; button.dataset.value=option.value; button.textContent=option.label;
            button.addEventListener('click',()=>{ if (!disabled()) choose(option.value); });
            container.append(button); return button;
        });
        buttons.forEach((button,index)=>button.addEventListener('keydown',event=>{
            if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key) || disabled()) return;
            event.preventDefault();
            const next=event.key==='Home' ? 0 : event.key==='End' ? buttons.length-1 : (index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
            buttons[next].click(); buttons[next].focus();
        }));
        segmentBindings.push(()=>buttons.forEach(button=>{
            const selected=button.dataset.value===read();
            button.classList.toggle('is-selected',selected);
            button.setAttribute('aria-pressed',String(selected));
            button.tabIndex=selected ? 0 : -1; button.disabled=disabled();
        }));
    }
    ['show-by','tracker-status'].forEach(id=>{
        const select=$(id);
        bindSegments($(`${id}-segments`),[...select.options].map(option=>({value:option.value,label:option.textContent})),()=>select.value,value=>{
            select.value=value; select.dispatchEvent(new Event('change'));
        },()=>select.disabled);
    });
    bindSegments($('source-segments'),[...document.querySelectorAll('[name=mode]')].map(input=>({value:input.value,label:input.parentElement.textContent.trim()})),
        ()=>document.querySelector('[name=mode]:checked').value,value=>document.querySelector(`[name=mode][value="${value}"]`).click(),()=>busy);
    function trackerMismatch(row, result) {
        if (row.issue || row.reccied.toLowerCase() !== 'yes' || result?.state !== 'outstanding') return '';
        const reasons = [];
        if (result.reconciled === '0') reasons.push('Not reconciled');
        if (result.buyStatus && result.buyStatus !== 'SUCCESSFUL') reasons.push('Buy not successful');
        return reasons.join(' · ');
    }
    const dateLabel = value => value ? new Date(value).toLocaleString() : 'Never';
    const text = (tag, value, className) => { const node = document.createElement(tag); node.textContent = value; if (className) node.className = className; return node; };
    const disclosureStates = new WeakMap();
    const disclosureDuration = 200;
    function prepareDisclosure(details) {
        const summary = [...details.children].find(child => child.tagName === 'SUMMARY');
        if (!summary) return;
        const content = document.createElement('div');
        content.className = 'reccie-details-content';
        [...details.childNodes].filter(node => node !== summary).forEach(node => content.append(node));
        details.append(content);
        details.classList.toggle('reccie-is-open', details.open);
        disclosureStates.set(details, { content, frame: 0, timer: 0, token: 0, targetOpen: null, animating: false, transitionEnd: null });
    }
    function revealDebugSection(details) {
        if (details.id !== 'debug') return;
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
        details.scrollIntoView?.({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'end' });
    }
    function setDisclosureOpen(details, open) {
        const state = disclosureStates.get(details);
        if (!state) { details.open = open; return; }
        if (!state.animating && details.open === open) return;
        if (state.animating && state.targetOpen === open) return;

        if (state.frame) window.cancelAnimationFrame(state.frame);
        if (state.timer) window.clearTimeout(state.timer);
        if (state.transitionEnd) state.content.removeEventListener('transitionend', state.transitionEnd);
        state.frame = 0;
        state.timer = 0;
        state.transitionEnd = null;
        const token = ++state.token;
        const content = state.content;
        const currentHeight = content.getBoundingClientRect().height;
        const currentOpacity = open && !details.open ? '0' : window.getComputedStyle(content).opacity;
        content.style.height = `${currentHeight}px`;
        content.style.opacity = currentOpacity;
        details.classList.toggle('reccie-is-open', open);
        if (open) details.open = true;
        void content.offsetHeight;

        if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
            details.open = open;
            content.style.height = '';
            content.style.opacity = '';
            state.animating = false;
            state.targetOpen = null;
            state.frame = 0;
            state.timer = 0;
            if (open) revealDebugSection(details);
            return;
        }

        state.animating = true;
        state.targetOpen = open;
        state.frame = window.requestAnimationFrame(() => {
            state.frame = 0;
            if (token !== state.token) return;
            content.style.height = open ? `${content.scrollHeight}px` : '0px';
            content.style.opacity = open ? '1' : '0';
            const finish = () => {
                if (token !== state.token) return;
                if (state.transitionEnd) content.removeEventListener('transitionend', state.transitionEnd);
                state.transitionEnd = null;
                if (state.timer) window.clearTimeout(state.timer);
                if (!open) details.open = false;
                content.style.height = '';
                content.style.opacity = '';
                state.animating = false;
                state.targetOpen = null;
                state.frame = 0;
                state.timer = 0;
                if (open) revealDebugSection(details);
            };
            state.transitionEnd = function onTransitionEnd(event) {
                if (event.target !== content || event.propertyName !== 'height') return;
                finish();
            };
            content.addEventListener('transitionend', state.transitionEnd);
            state.timer = window.setTimeout(finish, disclosureDuration + 80);
        });
    }
    document.querySelectorAll('details').forEach(prepareDisclosure);
    document.addEventListener('click', event => {
        const summary = event.target.closest?.('summary');
        const details = summary?.parentElement;
        if (!details || !disclosureStates.has(details)) return;
        event.preventDefault();
        const state = disclosureStates.get(details);
        setDisclosureOpen(details, state.animating ? !state.targetOpen : !details.open);
    });
    const highlighted = (tag, value, className) => {
        const node = text(tag, '', className);
        window.OpsToolshedSearchHighlight.appendHighlightedText(node, value, $('search').value);
        return node;
    };
    function message(value, error = false, verifying = false) {
        const status = $('message');
        status.classList.toggle('error', error);
        status.classList.toggle('is-verifying', verifying);
        window.reccieStatus.render(status, value, verifying);
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
                'Local diagnostics. Prisma verification is read-only; trackerUpdates records any enabled automatic saves. Request durations overlap when campaigns run concurrently.\n\n' +
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
        ['refresh-sheet', 'csv-file', 'report-month', 'sheet-url', 'forget-report', 'assignment', 'person', 'search', 'show-by', 'tracker-status'].forEach(id => { $(id).disabled = value; });
        document.querySelectorAll('[name=mode]').forEach(input => { input.disabled = value; });
        $('discover-campaigns').disabled = value;
        $('forget-report').disabled = value || !tracker;
        $('report-month').disabled = value || mode !== 'main';
        $('tracker-status').disabled = value || observed();
        $('check-rows').disabled = value || !shownRows().length || tracker?.month !== $('report-month').value;
        statusInputs().forEach(input => { input.disabled = value; });
        $('clear-filters').disabled = value;
        $('debug-workers').disabled = value;
        $('debug-run').disabled = $('check-rows').disabled;
        document.querySelectorAll('.tracker-mark-yes').forEach(button=>{button.disabled=value;});
        segmentBindings.forEach(sync=>sync());
    }
    async function send(operation, args = {}) {
        const context = mode === 'main' ? {} : {mode, month:$('report-month').value};
        const response = await chrome.runtime.sendMessage({ action: 'reccies', operation, ...context, ...args });
        if (response?.status !== 'success') throw new Error(response?.message || 'Could not reach Ops Toolshed. Reload the extension and try again.');
        tracker = response.tracker || null;
        return tracker;
    }
    function myRows() {
        if (observed()) return tracker?.rows || [];
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
        if (status === 'mismatch') return !!trackerMismatch(row, result);
        if (status === 'ready') return result?.state === 'ready';
        if (status === 'review') return !!row.issue || ['review','error'].includes(result?.state);
        return false;
    }
    function shownRows() {
        const search = $('search').value.trim().toLowerCase(), statuses = selectedStatuses(), trackerStatus = $('tracker-status').value;
        return myRows().filter(row => (trackerStatus === 'any' || (row.reccied.toLowerCase() === 'yes') === (trackerStatus === 'reconciled')) && (!statuses.length || statuses.some(status => matchesStatus(row, status))) &&
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
        warning.append(text('span', 'Prisma mismatch', 'badge mismatch'));
        mismatches.forEach(row => {
            const result = tracker.checks[row.sourceRow];
            const buy = result.buyStatus && result.buyStatus !== 'SUCCESSFUL' ? `Buy status: ${String(result.buyStatus).replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, value => value.toUpperCase())}` : '';
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
        await chrome.storage.local.set({ [storageKey('preferences')]: { person: $('person').value, assignment: $('assignment').value, showBy: $('show-by').value, trackerStatus: $('tracker-status').value, statuses: selectedStatuses() } });
    }
    function render() {
        renderMode();
        manualWrites?.refresh();
        const shown = shownRows(), mine = myRows();
        const grouped = $('show-by').value === 'campaign';
        const entries = grouped ? campaignGroups(shown) : shown;
        $('source-status').textContent = tracker ? `${tracker.rows.length.toLocaleString()} rows · Report ${tracker.month} · Read ${dateLabel(tracker.importedAt)} · ${tracker.source.type === 'google' ? 'Google Sheet' : 'CSV snapshot'}` : 'No tracker loaded. Tracker data and check results are stored locally in this Chrome profile.';
        if (observed() && tracker) $('source-status').textContent = `Visited campaigns · ${tracker.month} · ${tracker.rows.length} placements · Read ${dateLabel(tracker.importedAt)}${tracker.source.fallback ? ' · Early Recs fallback' : ''}. Open Campaign coverage for limitations and failures.`;
        $('summary').textContent = tracker ? (!$('person').value ? 'Choose your name to see your assignments.' : `${rowCount(shown, grouped)} shown · ${mine.length} assigned · ${mine.filter(row => row.reccied.toLowerCase() !== 'yes').length} not marked Yes`) : 'Connect a tracker to get started.';
        if (observed()) $('summary').textContent = `${rowCount(shown, grouped)} shown · ${mine.length} discovered; assignment unknown`;
        const list = $('rows'); list.replaceChildren();
        $('clear-filters').hidden = $('tracker-status').value === 'any' && !selectedStatuses().length && !$('search').value.trim();
        statusInputs().forEach(input => input.closest('label').classList.toggle('is-selected', input.checked));
        if (!shown.length) list.append(text('p', !tracker ? (mode === 'automatic' ? 'Discover placements from your locally recorded campaign visits to start.' : 'Read a Google Sheet or import a CSV to start.') : !observed() && !$('person').value ? 'Select your assignment and name above.' : selectedStatuses().length === 1 && selectedStatuses()[0] === 'mismatch' ? 'No confirmed mismatches match these filters. Select Reconciled and verify to check tracker-Yes rows. Unchecked, failed and review items are not included here.' : 'No rows match these filters. Clear filters to see all your assignments.', 'empty'));
        entries.slice(0, limit).forEach(entry => {
            const row = grouped ? entry[0] : entry;
            if (grouped) {
                const card = text('article', '', 'reccie-card campaign-card');
                const numbers = [...new Set(entry.map(item => item.dNumber))];
                const top = text('div', '', 'card-top');
                top.append(highlighted('h2', row.campaignId ? row.campaignName || row.campaignId : 'No campaign', 'campaign-title'));
                const warning = mismatchWarning(entry, true);
                card.append(top, text('p', counted(numbers.length, 'D number'), 'supplier'),
                    highlighted('p', numbers.join(', '), 'campaign-d-numbers'));
                if (warning) card.append(warning);
                const attention = entry.filter(item => matchesStatus(item, 'review'));
                if (attention.length) {
                    const details = text('div', '', 'campaign-attention');
                    details.append(text('span', 'Needs attention', 'badge review'));
                    attention.forEach(item => {
                        const result = tracker.checks?.[item.sourceRow];
                        const reason = item.issue || result?.message || (result?.state === 'error' ? 'Prisma check failed. Verify again.' : 'Prisma result needs review.');
                        details.append(text('p', `${item.dNumber} · ${reason === 'D number not found for this month' ? core.missingDMessage : reason}`, 'mismatch-detail'));
                    });
                    card.append(details);
                }
                const bottom = text('div', '', 'card-bottom');
                bottom.append(highlighted('span', `${row.campaignId} · ${row.month}`));
                const url = core.campaignUrl(row);
                if (url) { const link = text('a', 'Open in Prisma ↗'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; bottom.append(link); }
                const mark=manualWrites?.button(entry,true);if(mark)bottom.append(mark);
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
            statuses.append(text('p', observed() ? 'Tracker status: unavailable for visited-campaign placements.' : `Tracker Reccied: ${row.reccied || 'Blank'}`));
            if (result?.reconciled != null) statuses.append(text('p', `Prisma Reconciled: ${result.reconciled === '1' ? 'Yes' : result.reconciled === '0' ? 'No' : 'Unknown'} · Buy: ${result.buyStatus || 'Unknown'}`));
            if (row.issue || result?.message) statuses.append(text('p', row.issue || (result.message === 'D number not found for this month' ? core.missingDMessage : result.message)));
            if (result?.state === 'ready') statuses.append(text('p', observed() ? 'Meets the Prisma rule. Tracker assignment is unknown.' : row.reccied.toLowerCase() === 'yes' ? 'Matches the tracker’s Yes.' : 'Ready to mark manually in the tracker.'));
            if (result?.state === 'outstanding' && row.reccied.toLowerCase() === 'yes') statuses.append(text('p', 'Tracker says Yes, but Prisma does not meet the rule. Review manually.'));
            card.append(statuses);
            if (row.comments) card.append(text('p', row.comments, 'comment'));
            const bottom = text('div', '', 'card-bottom');
            bottom.append(highlighted('span', `${row.campaignId} · ${row.month}\nChecked: ${dateLabel(result?.checkedAt)}`));
            const url = core.campaignUrl(row);
            if (url) { const link = text('a', 'Open in Prisma ↗'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; bottom.append(link); }
            const mark=manualWrites?.button([row],false);if(mark)bottom.append(mark);
            card.append(bottom); list.append(card);
        });
        if (entries.length > limit) { const more = text('button', grouped ? 'Show more campaigns' : 'Show more rows', 'more'); more.type = 'button'; more.onclick = () => { limit += 40; render(); }; list.append(more); }
        setBusy(busy);
    }
    async function loadReport(operation, args) {
        setBusy(true); message('Reading report', false, true);
        $('message').scrollIntoView?.({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
        try {
            await send(operation, { ...args, month: $('report-month').value });
            showTiming(null);
            people(); render(); setDisclosureOpen($('source-details'), false);
            message(observed() ? 'Visited-campaign discovery finished. Review the coverage and results below.' : '');
            if (observed()) showTiming(tracker.lastCheckTiming);
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
    ['person','show-by','tracker-status'].forEach(id => $(id).addEventListener('change', () => { limit = 40; render(); savePreferences().catch(error => message(error.message, true)); }));
    $('search').addEventListener('input', () => { limit = 40; render(); });
    statusInputs().forEach(input => input.addEventListener('change', () => { limit = 40; render(); savePreferences().catch(error => message(error.message, true)); }));
    $('clear-filters').addEventListener('click', () => {
        statusInputs().forEach(input => { input.checked = false; });
        $('tracker-status').value = 'any'; $('search').value = ''; limit = 40; render(); savePreferences().catch(error => message(error.message, true));
    });
    $('report-month').addEventListener('change', () => { render(); if (tracker && tracker.month !== $('report-month').value) message('Read or import the report again to use this month.'); });
    $('forget-report').addEventListener('click', async () => {
        setBusy(true);
        try { await send('clear'); showTiming(null); people(); $('sheet-url').value = ''; render(); setDisclosureOpen($('source-details'), true); message('Local tracker data forgotten.'); }
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
        const timing = { method, methodConfirmed: false, selection: { mode, source: tracker?.source?.type, trackerRevision: revision, reportMonth: tracker?.month,
            person: $('person').value, assignment: $('assignment').value, showBy: $('show-by').value, trackerStatus: $('tracker-status').value, statuses: selectedStatuses(), search: $('search').value,
            rowIds: selected.map(row => row.sourceRow).sort((a,b) => a-b) },
            startedAt: new Date().toISOString(), selectedRows: selected.length,
            plannedBatches: batches.length, completedBatches: 0, totalMs: 0, requests: 0,
            concurrency: method.concurrency, cacheHits: 0, retries: 0, outcome: 'running', batches: [], trackerUpdates: [] };
        showTiming(null);
        setBusy(true);
        $('check-rows').setAttribute('aria-busy', 'true');
        $('rows').setAttribute('aria-busy', 'true');
        try {
            for (let i = 0; i < batches.length; i++) {
                message(`Verifying reccie status · ${batches[i].length} ${batches[i].length === 1 ? 'row' : 'rows'} · ${method.concurrency} campaigns at once${batches.length > 1 ? ` · batch ${i + 1} of ${batches.length}` : ''}`, false, true);
                await send('check', { revision:tracker.revision, rowIds: batches[i], method: method.id }); render();
                if(tracker.lastAutoUpdate)timing.trackerUpdates.push(tracker.lastAutoUpdate);
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
            const automaticSaved=timing.trackerUpdates.reduce((sum,item)=>sum+item.saved,0);
            const automaticPending=timing.trackerUpdates.some(item=>item.pending);
            const automaticError=timing.trackerUpdates.find(item=>item.error)?.error;
            const failed = timing.batches.flatMap(item => item.campaignsDetail).filter(item => item.outcome === 'error').length;
            timing.failedCampaigns = failed;
            message(`Check finished in ${((performance.now() - started) / 1000).toFixed(1)} seconds using ${method.label}. Checked ${selectedCount}; ${rowCount(shownRows())} now shown.${failed ? ` ${failed} campaign checks failed.` : ''} Review each row’s result and check time. ${timing.trackerUpdates.length ? `Automatic tracker updates: ${automaticSaved} saved Yes${automaticPending?' · save receipt pending':''}${automaticError?` · ${automaticError}`:''}.` : 'The tracker was not changed.'}`);
        } catch (error) { timing.outcome = 'interrupted'; message(error.message, true); }
        finally {
            $('check-rows').setAttribute('aria-busy', 'false');
            $('rows').setAttribute('aria-busy', 'false');
            timing.totalMs = Math.round(performance.now() - started);
            showTiming(timing);
            setBusy(false);
            try { await chrome.storage.local.set({ [storageKey('timing')]: { revision, report: timing } }); }
            catch (_) { /* A diagnostics persistence failure must not hide check results. */ }
        }
    }
    function restorePreferences(prefs = {}) {
            $('assignment').value = ['ops','buyer','group','any'].includes(prefs.assignment) ? prefs.assignment : 'ops';
            const legacyStatuses = ['outstanding','reconciled','mismatch','ready','review'];
            $('show-by').value = ['dnumber','campaign'].includes(prefs.showBy) ? prefs.showBy : prefs.view === 'campaigns' ? 'campaign' : 'dnumber';
            const previousStatuses = Array.isArray(prefs.statuses) ? prefs.statuses : legacyStatuses.includes(prefs.view) ? [prefs.view] : [];
            const bothTrackerStatuses = previousStatuses.includes('outstanding') && previousStatuses.includes('reconciled');
            const legacyTracker = bothTrackerStatuses ? 'any' : previousStatuses.includes('outstanding') ? 'outstanding' : previousStatuses.includes('reconciled') ? 'reconciled' : 'any';
            $('tracker-status').value = ['any','outstanding','reconciled'].includes(prefs.trackerStatus) ? prefs.trackerStatus : legacyTracker;
            const statuses = !prefs.trackerStatus && bothTrackerStatuses ? [] : previousStatuses;
            statusInputs().forEach(input => { input.checked = statuses.includes(input.dataset.status); });
        if (observed()) { $('tracker-status').value='any'; statusInputs().find(input=>input.dataset.status==='mismatch').checked=false; }
    }
    function renderMode() {
        const automatic = observed();
        document.querySelector('header .intro').textContent = automatic ? 'Placements from visited campaigns, checked against Prisma. The spreadsheet stays unchanged.' : 'Your Reccie Tracker rows, checked against Prisma. Preview and confirm any tracker updates.';
        document.querySelector('header .readonly').textContent = manualWrites?.available() ? 'Manual tracker updates' : 'Read only';
        $('mode-description').textContent = mode === 'main' ? 'Monthly tracker assignments.' : mode === 'early' ? `Early Reccie report for ${core.currentMonth()}. Current-month dates determine whether the tab can be used.` : `Current-month placements from campaigns visited this month in this Chrome profile. Not proof of who booked them. Visit campaigns with History logging on, then discover.`;
        $('sheet-connection').hidden = mode === 'automatic';
        $('source-details').hidden = mode === 'automatic';
        $('report-loaded-badge').hidden = !tracker || automatic;
        $('forget-report').disabled = busy || !tracker;
        $('discover-campaigns').hidden = mode === 'main';
        $('discover-campaigns').textContent = mode === 'early' ? 'Use visited campaigns fallback' : 'Discover / refresh visited campaigns';
        $('month-hint').textContent = mode === 'main' ? 'Applies to every row' : 'Current month only';
        $('sheet-hint').textContent = mode === 'early' ? 'Reads the Early Reccie report tab from this spreadsheet. Booking End Date determines the month; stale reports fall back to visited campaigns.' : 'Uses your signed-in Google account. Open the Reccie report tab before copying its URL.';
        $('assignment-fields').hidden = automatic;
        $('tracker-status-control').hidden = automatic;
        statusInputs().find(input=>input.dataset.status==='mismatch').closest('label').hidden=automatic;
        if (automatic) { $('tracker-status').value='any'; statusInputs().find(input=>input.dataset.status==='mismatch').checked=false; }
        $('filter-hint').textContent = automatic ? 'Any selected Prisma status matches. Nothing ticked shows all discovered placements, including failed checks.' : 'Tracker Reccie status combines with selected Prisma statuses. Any includes all tracker values; no Prisma selection includes unchecked rows.';
        const source=tracker?.source;
        $('coverage-details').hidden = !source || (!automatic && mode !== 'early');
        const coverage=$('coverage-issues'); coverage.replaceChildren();
        if (source?.issues?.length || source?.limited || source?.fallback) setDisclosureOpen($('coverage-details'), true);
        if (source && automatic) {
            coverage.append(text('p', `${source.fallback ? `Early Recs fallback: ${source.fallbackReason} ` : ''}${source.coverage || ''}`));
            coverage.append(text('p', `${source.successfulCampaigns || 0} campaigns checked of ${source.attemptedCampaigns || 0} attempted; ${source.eligibleCampaigns || 0} eligible visited campaigns.${source.limited ? ' Limited to the 50 most recently visited campaigns.' : ''}`));
            (source.issues || []).forEach(issue=>coverage.append(text('p', `${issue.campaignId}: ${issue.message}`)));
            if (!source.eligibleCampaigns) coverage.append(text('p','No eligible visits recorded this month. Visit campaigns with History logging enabled, then discover again.'));
        } else if (source && mode === 'early') coverage.append(text('p', `${source.excludedRows || 0} rows excluded from other months; ${source.ambiguousRows || 0} dates need attention. Blank dates inherit the month only when dated rows consistently establish it.`));
    }
    document.querySelectorAll('[name=mode]').forEach(input=>input.addEventListener('change', async()=>{
        if (!input.checked || busy) return;
        const previousMode=mode;
        setBusy(true);
        try {
            await savePreferences();
            if (previousMode === 'main') mainMonth=$('report-month').value;
            const mainSource=tracker?.source?.url || $('sheet-url').value;
            mode=input.value;
            $('report-month').value=mode === 'main' ? mainMonth : core.currentMonth();
            await send('load',{mode,month:$('report-month').value});
            const stored=await chrome.storage.local.get([storageKey('preferences'),storageKey('timing')]);
            restorePreferences(stored[storageKey('preferences')]);
            people(stored[storageKey('preferences')]?.person);
            $('sheet-url').value=tracker?.source?.url || mainSource;
            $('search').value=''; limit=40; showTiming(stored[storageKey('timing')]?.revision === tracker?.revision ? stored[storageKey('timing')]?.report : tracker?.lastCheckTiming);
            render(); message('');
        } catch(error) { tracker=null; showTiming(null); render(); message(error.message,true); }
        finally { setBusy(false); }
    }));
    $('discover-campaigns').addEventListener('click', async()=>{
        setBusy(true); message('Discovering current-month placements from visited campaigns',false,true);
        try { await send('discover'); showTiming(tracker.lastCheckTiming); people(); render(); message('Discovery finished. Review campaign coverage and individual results. The spreadsheet was not changed.'); }
        catch(error) {message(error.message,true);}
        finally {setBusy(false);}
    });
    $('check-rows').addEventListener('click', () => verifyRows());
    $('test-google-connection').addEventListener('click', async () => {
        const button = $('test-google-connection'), output = $('google-connection-result');
        button.disabled = true;
        output.textContent = 'Testing Google connection…';
        try {
            const allowed = await chrome.permissions.request({origins:['https://script.google.com/*','https://script.googleusercontent.com/*']});
            if (!allowed) throw new Error('Google script access was not granted.');
            const response = await chrome.runtime.sendMessage({action:'reccies',operation:'testGoogleConnection'});
            if (response?.status !== 'success' || !response.connection) throw new Error(response?.message || 'Reload Ops Toolshed before running this test.');
            output.textContent = JSON.stringify(response.connection, null, 2);
        } catch (error) { output.textContent = error.message; }
        finally { button.disabled = false; }
    });
    for(const [id,key] of [['auto-mark-tracker','autoMark'],['verify-after-financial','afterFinancial']]){
        $(id).addEventListener('change',async()=>{
            const enabled=$(id).checked;$(id).disabled=true;
            try{
                if(enabled&&key==='autoMark'&&!await chrome.permissions.request({origins:['https://script.google.com/*','https://script.googleusercontent.com/*']}))throw Error('Google script access was not granted.');
                const settings=(await chrome.storage.local.get('reccieAutomation')).reccieAutomation||{};
                settings[key]=enabled;await chrome.storage.local.set({reccieAutomation:settings});
                $('automation-status').textContent=enabled?'Enabled for this Chrome profile.':'Setting switched off.';
            }catch(error){$(id).checked=!enabled;$('automation-status').textContent=error.message;}
            finally{$(id).disabled=false;}
        });
    }
    function showAutomationResult(result){if(result)$('automation-status').textContent=`Last background check: ${result.campaignId||'save receipt'} · ${result.state}${result.message?` · ${result.message}`:''}`;}
    chrome.storage.local.get('reccieAutomationLastRun').then(data=>showAutomationResult(data.reccieAutomationLastRun)).catch(()=>{});
    chrome.storage.onChanged?.addListener?.((changes,area)=>{
        if(area!=='local')return;
        if(changes.reccieAutomationLastRun)showAutomationResult(changes.reccieAutomationLastRun.newValue);
        const key=core.trackerKey(mode,$('report-month').value);
        if(!busy&&changes[key]?.newValue?.month===$('report-month').value){tracker=changes[key].newValue;people();render();}
    });
    chrome.storage.local.get('reccieAutomation').then(data=>{ $('auto-mark-tracker').checked=data.reccieAutomation?.autoMark===true;$('verify-after-financial').checked=data.reccieAutomation?.afterFinancial===true; }).catch(()=>{});
    $('debug-workers').addEventListener('input', () => { $('debug-worker-count').value = $('debug-workers').value; });
    $('debug-run').addEventListener('click', () => verifyRows(`workers-${$('debug-workers').value}`));
    (async () => {
        try {
            const stored = await chrome.storage.local.get(['reccieTracker','recciePreferences','reccieLastRunTiming']);
            tracker = stored.reccieTracker || null;
            const prefs = stored.recciePreferences || {};
            restorePreferences(prefs);
            const previous = new Date(); previous.setDate(1); previous.setMonth(previous.getMonth() - 1);
            $('report-month').value = tracker?.month || `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`;
            $('sheet-url').value = tracker?.source.url || '';
            people(prefs.person); setDisclosureOpen($('source-details'), !tracker); render();
            if (typeof prefs.view === 'string' || !prefs.trackerStatus) {
                await savePreferences();
                if ($('tracker-status').value !== 'any' && selectedStatuses().length) message('Your filters now match both the tracker status and a selected Prisma status. Clear filters to see everything.');
            }
            if (tracker && stored.reccieLastRunTiming?.revision === tracker.revision) showTiming(stored.reccieLastRunTiming.report);
        } catch (error) { message(error.message, true); }
    })();
})();

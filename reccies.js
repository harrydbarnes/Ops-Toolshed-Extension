(function() {
    'use strict';
    const core = window.reccieCore, $ = id => document.getElementById(id);
    let tracker = null, busy = false, limit = 40, latestTiming = null, mode = 'main', mainMonth = '';
    const manualWrites = window.reccieManualWrites?.create({
        context:()=>({tracker,mode,month:$('report-month').value}),busy:()=>busy,setBusy,message,
        finished:context=>{if(mode===context.mode&&$('report-month').value===context.month&&tracker?.source?.type==='google')void loadReport('refresh',{url:tracker.source.url,expectedRevision:tracker.revision,preserveChecks:true});},
        updated:(saved,context)=>{if(mode===context.mode&&$('report-month').value===context.month){tracker=saved;render();}}
    });
    const observed = () => tracker?.source?.type === 'automatic' || mode === 'automatic';
    const storageKey = suffix => mode === 'main' ? (suffix === 'preferences' ? 'recciePreferences' : 'reccieLastRunTiming') : `${core.trackerKey(mode, $('report-month').value)}:${suffix}`;
    const verificationTooltip=$('verification-scope'),verificationButton=$('check-rows');
    let verificationTooltipTimer=null;
    function hideVerificationTooltip(){
        clearTimeout(verificationTooltipTimer);verificationTooltipTimer=null;
        verificationTooltip.hidden=true;verificationTooltip.classList.remove('is-visible');
        verificationButton.removeAttribute('aria-describedby');
    }
    function showVerificationTooltip(){
        hideVerificationTooltip();
        verificationTooltipTimer=setTimeout(()=>{
            if(!verificationButton.isConnected||document.hidden)return;
            verificationTooltip.hidden=false;
            verificationTooltip.style.maxWidth=`${Math.max(0,Math.min(320,window.innerWidth-16))}px`;
            const rect=verificationButton.getBoundingClientRect(),tip=verificationTooltip.getBoundingClientRect();
            const above=rect.top>=tip.height+18;
            verificationTooltip.style.left=`${Math.max(8,Math.min(rect.left+(rect.width-tip.width)/2,window.innerWidth-tip.width-8))}px`;
            verificationTooltip.style.top=`${above?rect.top-tip.height-10:Math.max(8,Math.min(rect.bottom+10,window.innerHeight-tip.height-8))}px`;
            verificationButton.setAttribute('aria-describedby',verificationTooltip.id);
            window.requestAnimationFrame(()=>{if(!verificationTooltip.hidden)verificationTooltip.classList.add('is-visible');});
        },350);
    }
    verificationButton.addEventListener('mouseenter',showVerificationTooltip);
    verificationButton.addEventListener('focus',showVerificationTooltip);
    for(const event of ['mouseleave','blur','click'])verificationButton.addEventListener(event,hideVerificationTooltip);
    document.addEventListener('keydown',event=>{if(event.key==='Escape')hideVerificationTooltip();});
    document.addEventListener('scroll',hideVerificationTooltip,true);
    document.addEventListener('visibilitychange',hideVerificationTooltip);
    window.addEventListener('resize',hideVerificationTooltip);
    const statusTooltip=$('status-option-tooltip');
    let statusTooltipTimer=null,activeStatusTrigger=null;
    function hideStatusTooltip(){
        clearTimeout(statusTooltipTimer);statusTooltipTimer=null;
        if(statusTooltip){statusTooltip.hidden=true;statusTooltip.classList.remove('is-visible');}
        if(activeStatusTrigger){activeStatusTrigger.removeAttribute('aria-describedby');activeStatusTrigger=null;}
    }
    function attachStatusTooltip(element,text){
        if(!element||!text||!statusTooltip)return;
        function show(){
            hideStatusTooltip();hideVerificationTooltip();
            activeStatusTrigger=element;
            statusTooltipTimer=setTimeout(()=>{
                if(!element.isConnected||document.hidden)return;
                statusTooltip.textContent=text;
                statusTooltip.hidden=false;
                statusTooltip.style.maxWidth=`${Math.max(0,Math.min(280,window.innerWidth-16))}px`;
                const rect=element.getBoundingClientRect(),tip=statusTooltip.getBoundingClientRect();
                const above=rect.top>=tip.height+14;
                statusTooltip.style.left=`${Math.max(8,Math.min(rect.left+(rect.width-tip.width)/2,window.innerWidth-tip.width-8))}px`;
                statusTooltip.style.top=`${above?rect.top-tip.height-8:Math.max(8,Math.min(rect.bottom+8,window.innerHeight-tip.height-8))}px`;
                element.setAttribute('aria-describedby',statusTooltip.id);
                window.requestAnimationFrame(()=>{if(!statusTooltip.hidden)statusTooltip.classList.add('is-visible');});
            },300);
        }
        element.addEventListener('mouseenter',show);
        element.addEventListener('focus',show);
        for(const event of ['mouseleave','blur','click'])element.addEventListener(event,hideStatusTooltip);
    }
    document.addEventListener('keydown',event=>{if(event.key==='Escape')hideStatusTooltip();});
    document.addEventListener('scroll',hideStatusTooltip,true);
    document.addEventListener('visibilitychange',hideStatusTooltip);
    window.addEventListener('resize',hideStatusTooltip);
    function formatSyncTimestamp(importedAt){
        if(!importedAt)return 'Report loaded';
        const date=new Date(importedAt);
        if(Number.isNaN(date.getTime()))return 'Report loaded';
        const diffMinutes=Math.floor((Date.now()-date.getTime())/60000);
        if(diffMinutes<1)return 'Report loaded · Synced just now';
        if(diffMinutes<60)return `Report loaded · Synced ${diffMinutes}m ago`;
        return `Report loaded · Synced ${date.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}`;
    }
    const labels = { ready: 'Reconciled in Prisma', outstanding: 'Outstanding', review: 'Needs attention', error: 'Check failed' };
    // Keep existing filter values and persistence; visible pills drive their native change handlers.
    const segmentBindings = [];
    function bindSegments(container, options, read, choose, disabled) {
        const buttons = options.map(option => {
            const button = document.createElement('button');
            button.type='button'; button.dataset.value=option.value; button.textContent=option.label;
            button.addEventListener('click',()=>{ if (!disabled()) choose(option.value); });
            if (option.tooltip) attachStatusTooltip(button, option.tooltip);
            container.append(button); return button;
        });
        buttons.forEach((button,index)=>button.addEventListener('keydown',event=>{
            if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key) || disabled()) return;
            event.preventDefault();
            const next=event.key==='Home' ? 0 : event.key==='End' ? buttons.length-1 : (index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
            buttons[next].click(); buttons[next].focus();
        }));
        segmentBindings.push(()=>{buttons.forEach(button=>{
            const selected=button.dataset.value===read();
            button.classList.toggle('is-selected',selected);
            button.setAttribute('aria-pressed',String(selected));
            button.tabIndex=selected ? 0 : -1; button.disabled=disabled();
        });window.reccieUi?.updateSegments(container);});
    }
    ['show-by','tracker-status'].forEach(id=>{
        const select=$(id);
        const trackerTooltips = { any: 'All rows regardless of sheet tracker status.', outstanding: 'Rows not marked Yes in the Google Sheet.', reconciled: 'Rows marked Yes in the Google Sheet.' };
        bindSegments($(`${id}-segments`),[...select.options].map(option=>({value:option.value,label:option.textContent,tooltip:id==='tracker-status'?trackerTooltips[option.value]:undefined})),()=>select.value,value=>{
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
        if (window.reccieUi?.reveal(details)) return;
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
        ['refresh-sheet', 'csv-file', 'report-month', 'sheet-url', 'forget-report', 'assignment', 'person', 'search', 'show-by', 'tracker-status', 'show-progress-bars'].forEach(id => { $(id).disabled = value; });
        document.querySelectorAll('[name=mode]').forEach(input => { input.disabled = value; });
        if ($('refresh-tracker')) $('refresh-tracker').disabled = value;
        $('discover-campaigns').disabled = value;
        $('forget-report').disabled = value || !tracker;
        $('report-month').disabled = value || mode !== 'main';
        $('tracker-status').disabled = value || observed();
        $('check-rows').disabled = value || !shownRows().length || tracker?.month !== $('report-month').value;
        statusInputs().forEach(input => { input.disabled = value; });
        $('clear-filters').disabled = value;
        $('debug-workers').disabled = value;
        $('debug-run').disabled = $('check-rows').disabled;
        document.querySelectorAll('.tracker-mark-yes,.tracker-note').forEach(button=>{button.disabled=value;});
        segmentBindings.forEach(sync=>sync());
        window.reccieUi?.updateFilters();
        if(!value)void syncSavedTracker();
    }
    async function syncSavedTracker(){
        const selectedMode=mode,month=$('report-month').value,key=core.trackerKey(mode,month),expectedRevision=tracker?.revision;
        try{const saved=(await chrome.storage.local.get(key))[key];if(!busy&&mode===selectedMode&&$('report-month').value===month&&tracker?.revision===expectedRevision&&saved?.month===month&&saved.revision!==expectedRevision){tracker=saved;people();render();}}catch(_){/* Keep the current view if local storage is temporarily unavailable. */}
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
    function elapsedWorkingDays(month, now = new Date()) {
        if (!core.validMonth(month)) return 0;
        const [reportYear, reportMonth] = month.split('-').map(Number);
        // Main reconciliation takes place in the month after the report.
        const period = new Date(reportYear, reportMonth - 1 + (mode === 'main' ? 1 : 0), 1);
        const year = period.getFullYear(), monthNumber = period.getMonth() + 1;
        const selectedMonth = year * 12 + monthNumber - 1;
        const currentMonth = now.getFullYear() * 12 + now.getMonth();
        if (selectedMonth < currentMonth) return 5;
        if (selectedMonth > currentMonth) return 0;

        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const fractionOfDay = (now.getHours() * 3600000 + now.getMinutes() * 60000 + now.getSeconds() * 1000 + now.getMilliseconds()) / 86400000;
        let elapsed = 0;
        for (let day = 1; day <= new Date(year, monthNumber, 0).getDate() && elapsed < 5; day++) {
            const date = new Date(year, monthNumber - 1, day);
            if (date.getDay() === 0 || date.getDay() === 6) continue;
            if (date < today) elapsed++;
            else if (date.getTime() === today.getTime()) return Math.min(5, elapsed + fractionOfDay);
            else return elapsed;
        }
        return Math.min(5, elapsed);
    }
    function renderProgressBars() {
        const panel = $('reccie-progress');
        const visible = $('show-progress-bars').checked && !!tracker && tracker.month === $('report-month').value && !observed() && !!$('person').value;
        panel.hidden = !visible;
        if (!visible) return;

        const assigned = myRows();
        const marked = assigned.filter(row => row.reccied.toLowerCase() === 'yes').length;
        const elapsed = elapsedWorkingDays($('report-month').value);
        const percent = assigned.length ? Math.round(marked / assigned.length * 100) : 0;
        $('reccie-time-progress').value = elapsed;
        $('reccie-time-progress-label').textContent = `${elapsed.toFixed(1).replace(/\.0$/, '')} / 5 working days · ${Math.round(elapsed/5*100)}%`;
        $('reccie-time-progress').setAttribute('aria-valuetext', `${elapsed.toFixed(1).replace(/\.0$/, '')} of 5 working days elapsed`);
        const trackerProgress = $('reccie-tracker-progress');
        trackerProgress.max = Math.max(1, assigned.length);
        trackerProgress.value = marked;
        trackerProgress.setAttribute('aria-valuetext', assigned.length ? `${marked} of ${assigned.length} assigned rows marked Yes` : 'No assigned rows');
        $('reccie-tracker-progress-label').textContent = assigned.length ? `${marked} / ${assigned.length} marked Yes · ${percent}%` : 'No assigned rows';
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
        await chrome.storage.local.set({ [storageKey('preferences')]: { person: $('person').value, assignment: $('assignment').value, showBy: $('show-by').value, trackerStatus: $('tracker-status').value, statuses: selectedStatuses(), search: $('search').value } });
    }
    function render() {
        const key = JSON.stringify([mode, $('report-month').value, $('show-by').value, $('tracker-status').value, selectedStatuses(), $('person').value, $('assignment').value]);
        if (window.reccieUi?.transitionContent(renderContent, key)) return;
        renderContent();
    }
    function renderContent() {
        renderMode();
        manualWrites?.refresh();
        const shown = shownRows(), mine = myRows();
        const grouped = $('show-by').value === 'campaign';
        const entries = grouped ? campaignGroups(shown) : shown;
        renderProgressBars();
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
                const mark=manualWrites?.button(entry,true);if(mark)bottom.append(mark); const note=manualWrites?.noteButton(entry,true);if(note)bottom.append(note);
                card.append(bottom); window.reccieUi?.decorateCard(card,entry,tracker.checks,observed(),true); list.append(card); return;
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
            statuses.append(text('p', observed() ? 'Tracker status: unavailable for visited-campaign placements.' : `Tracker Reccied: ${row.reccied || 'Blank'}`, 'tracker-status-line'));
            if (result?.reconciled != null) statuses.append(text('p', `Prisma Reconciled: ${result.reconciled === '1' ? 'Yes' : result.reconciled === '0' ? 'No' : 'Unknown'} · Buy: ${result.buyStatus || 'Unknown'}`, 'prisma-status-line'));
            if (row.issue || result?.message) statuses.append(text('p', row.issue || (result.message === 'D number not found for this month' ? core.missingDMessage : result.message)));
            if (result?.state === 'ready') statuses.append(text('p', observed() ? 'Meets the Prisma rule. Tracker assignment is unknown.' : row.reccied.toLowerCase() === 'yes' ? 'Matches the tracker’s Yes.' : 'Reconciled in Prisma. Mark Yes in the tracker.', 'ready-guidance'));
            if (result?.state === 'outstanding' && row.reccied.toLowerCase() === 'yes') statuses.append(text('p', 'Tracker says Yes, but Prisma does not meet the rule. Review manually.'));
            card.append(statuses);
            if (row.comments) card.append(text('p', row.comments, 'comment'));
            const bottom = text('div', '', 'card-bottom');
            bottom.append(highlighted('span', `${row.campaignId} · ${row.month}\nChecked: ${dateLabel(result?.checkedAt)}`));
            const url = core.campaignUrl(row);
            if (url) { const link = text('a', 'Open in Prisma ↗'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; bottom.append(link); }
            const mark=manualWrites?.button([row],false);if(mark)bottom.append(mark); const note=manualWrites?.noteButton([row],false);if(note)bottom.append(note);
            card.append(bottom); window.reccieUi?.decorateCard(card,[row],tracker.checks,observed(),false); list.append(card);
        });
        if (entries.length > limit) { const more = text('button', grouped ? 'Show more campaigns' : 'Show more rows', 'more'); more.type = 'button'; more.onclick = () => { limit += 40; render(); }; list.append(more); }
        setBusy(busy);
    }
    async function loadReport(operation, args) {
        if (!core.validMonth($('report-month').value)) { message('Choose the report month first.', true); $('report-month').focus(); return; }
        setBusy(true); message('Reading report', false, true);
        $('message').scrollIntoView?.({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
        try {
            await send(operation, { ...args, month: $('report-month').value });
            await chrome.storage.local.set({reccieMonthConfirmed:true});
            $('first-use-guide').hidden = true;
            showTiming(null);
            people(); render(); setDisclosureOpen($('source-details'), false);
            message(observed() ? 'Visited-campaign discovery finished. Review the coverage and results below.' : '');
            if (observed()) showTiming(tracker.lastCheckTiming);
        } catch (error) { message(error.message, true); }
        finally { setBusy(false); }
    }
    if ($('refresh-tracker')) $('refresh-tracker').addEventListener('click',()=>{if(busy)return;$('sheet-url').value=tracker?.source?.url||$('sheet-url').value;$('refresh-sheet').click();});
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
    $('tracker-mode-badge')?.addEventListener('click', () => {
        const checkbox = $('auto-mark-tracker');
        if (!checkbox || checkbox.disabled) return;
        if (!checkbox.checked && !manualWrites?.available()) { message('Connect the live Ops Reccie Tracker to enable Automatic Updates.'); return; }
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
    });
    if ($('tracker-mode-badge')) attachStatusTooltip($('tracker-mode-badge'), 'Click to toggle Automatic Updates (automatically marks Yes in Google Sheet upon verification).');
    $('assignment').addEventListener('change', () => { people(); limit = 40; render(); savePreferences().catch(error => message(error.message, true)); });
    ['person','show-by','tracker-status'].forEach(id => $(id).addEventListener('change', () => { limit = 40; render(); savePreferences().catch(error => message(error.message, true)); }));
    $('search').addEventListener('input', () => { limit = 40; render(); savePreferences().catch(error => message(error.message, true)); });
    const prismaTooltips = {
        mismatch: 'Marked Yes in the Google Sheet, but not reconciled or buy unsuccessful in Prisma.',
        ready: 'Reconciled = Yes and Buy status = Successful in Prisma for the report month.',
        review: 'Requires review (e.g. buy not successful, unmapped placements, or check errors).'
    };
    statusInputs().forEach(input => {
        const label = input.closest('label');
        if (label && prismaTooltips[input.dataset.status]) {
            attachStatusTooltip(label, prismaTooltips[input.dataset.status]);
        }
        input.addEventListener('change', () => { limit = 40; render(); savePreferences().catch(error => message(error.message, true)); });
    });
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
        setBusy(true);
        hideVerificationTooltip();
        hideStatusTooltip();
        try {
            if (tracker?.source?.type === 'google' && tracker?.source?.url) {
                $('check-rows').setAttribute('aria-busy', 'true');
                $('check-rows').classList.add('is-verifying');
                $('check-rows').innerHTML = '<span class="button-spinner" aria-hidden="true"></span><span>Syncing sheet…</span>';
                try {
                    await send('refresh', { url: tracker.source.url, month: $('report-month').value, preserveChecks: true });
                    people();
                    render();
                } catch (refreshError) {
                    message(`Google Sheet sync failed: ${refreshError.message}. Checking cached rows…`, true);
                }
            } else {
                const key = core.trackerKey(mode, $('report-month').value);
                const saved = (await chrome.storage.local.get(key))[key];
                if (saved?.month === $('report-month').value && saved.revision !== tracker?.revision) {
                    tracker = saved;
                    people();
                    render();
                }
            }
        } catch(error) {
            setBusy(false);
            $('check-rows').classList.remove('is-verifying');
            $('check-rows').textContent = 'Verify Reccie Status';
            $('check-rows').setAttribute('aria-busy', 'false');
            message(error.message, true);
            return;
        }
        if(!shownRows().length){
            setBusy(false);
            $('check-rows').classList.remove('is-verifying');
            $('check-rows').textContent = 'Verify Reccie Status';
            $('check-rows').setAttribute('aria-busy', 'false');
            message('The saved report is up to date. No rows currently match these filters. Clear filters to see your assignments.');
            return;
        }
        const method = core.verificationMethod(methodId);
        const selected = shownRows(), revision = tracker?.revision;
        const selectedCount = rowCount(selected);
        const selectedIds=new Set(selected.map(row=>row.sourceRow));
        const remaining=methodId?[]:myRows().filter(row=>!selectedIds.has(row.sourceRow));
        const batches=[],extraBatches=new Set();
        for (const [rows,extra] of [[selected,false],[remaining,true]]) {
            const groups=new Map();
            rows.forEach(row=>{const key=`${row.campaignId}/${row.month}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row.sourceRow);});
            let batch=[],campaigns=0;
            function finishBatch(){if(!batch.length)return;if(extra)extraBatches.add(batches.length);batches.push(batch);batch=[];campaigns=0;}
            for (const ids of groups.values()) {
                for (let offset=0;offset<ids.length;offset+=method.maxRows) {
                    const part=ids.slice(offset,offset+method.maxRows);
                    if(batch.length&&(campaigns>=method.maxCampaigns||batch.length+part.length>method.maxRows))finishBatch();
                    batch.push(...part);campaigns++;
                }
            }
            finishBatch();
        }
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
        $('check-rows').classList.add('is-verifying');
        try {
            for (let i = 0; i < batches.length; i++) {
                const batchLabel = extraBatches.has(i)
                    ? `Checking remaining assigned rows (${batches[i].length})…`
                    : batches.length > 1
                        ? `Verifying batch ${i + 1} of ${batches.length} (${batches[i].length} rows)…`
                        : `Verifying ${batches[i].length} ${batches[i].length === 1 ? 'row' : 'rows'}…`;
                $('check-rows').innerHTML = `<span class="button-spinner" aria-hidden="true"></span><span>${batchLabel}</span>`;
                message(`${extraBatches.has(i)?'Checking remaining assigned rows':'Verifying filtered rows'} · ${batches[i].length} ${batches[i].length === 1 ? 'row' : 'rows'} · ${method.concurrency} campaigns at once${batches.length > 1 ? ` · batch ${i + 1} of ${batches.length}` : ''}`, false, true);
                await send('check', { revision:tracker.revision, rowIds: batches[i], method: method.id, ...(extraBatches.has(i)?{readOnly:true}:{}) }); render();
                if(!extraBatches.has(i)&&tracker.lastAutoUpdate)timing.trackerUpdates.push(tracker.lastAutoUpdate);
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
            const duration = `${((performance.now() - started) / 1000).toFixed(1)}s`;
            const checkedSummary = remaining.length
                ? `${selectedCount} matching filters, then ${remaining.length} other assigned checked`
                : `${selectedCount} checked`;
            const updatesSummary = timing.trackerUpdates.length && automaticSaved ? ` · ${automaticSaved} marked Yes` : '';
            const failSummary = failed ? ` · ${failed} failed` : '';
            message(`Check finished in ${duration} · ${checkedSummary}${updatesSummary}${failSummary}.`);
        } catch (error) { timing.outcome = 'interrupted'; message(error.message, true); }
        finally {
            $('check-rows').classList.remove('is-verifying');
            $('check-rows').textContent = 'Verify Reccie Status';
            $('check-rows').setAttribute('aria-busy', 'false');
            $('rows').setAttribute('aria-busy', 'false');
            timing.totalMs = Math.round(performance.now() - started);
            showTiming(timing);
            setBusy(false);
            try { await chrome.storage.local.set({ [storageKey('timing')]: { revision: tracker?.revision, report: timing } }); }
            catch (_) { /* A diagnostics persistence failure must not hide check results. */ }
        }
    }
    function restorePreferences(prefs = {}) {
            $('search').value=typeof prefs.search==='string'?prefs.search:'';
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
    function updateModeBadge() {
        const badge = document.querySelector('header .readonly');
        if (!badge) return;
        const available = manualWrites?.available();
        const autoUpdates = $('auto-mark-tracker')?.checked === true;
        if (!available) {
            badge.textContent = 'Read only';
            badge.classList.remove('is-automatic');
        } else if (autoUpdates) {
            badge.textContent = 'Automatic Updates';
            badge.classList.add('is-automatic');
        } else {
            badge.textContent = 'Manual Mode';
            badge.classList.remove('is-automatic');
        }
    }
    function renderMode() {
        hideVerificationTooltip();
        const automatic = observed();
        const person=$('person').value;
        $('reccies-title').textContent=person&&!automatic?`${person}’s ${$('assignment').value==='group'?'Group ':''}Reccies`:'My Reccies';
        const asOf=tracker?.importedAt?`Tracker as of ${new Date(tracker.importedAt).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}`:'';
        $('reccie-progress-asof').textContent=asOf;
        $('reccie-results-asof').textContent=asOf;
        $('reccie-results-asof').hidden=!asOf;
        $('reccie-progress-month').textContent=tracker?.month?new Date(tracker.month+'-01T12:00:00').toLocaleDateString('en-GB',{month:'long',year:'numeric'}):'';
        document.querySelector('header .intro').textContent = automatic ? 'Placements from visited campaigns, checked against Prisma. The spreadsheet stays unchanged.' : 'Your Reccie Tracker rows, checked against Prisma. Preview and confirm any tracker updates.';
        updateModeBadge();
        $('mode-description').textContent = mode === 'main' ? 'Monthly tracker assignments.' : mode === 'early' ? `Early Reccie report for ${core.currentMonth()}. Current-month dates determine whether the tab can be used.` : `Uses the same saved visits as Campaign History. Refresh queries Prisma for current-month D numbers in campaigns visited this month, even if you have not opened each placement. Keep campaign visit logging enabled. A visit does not establish who booked the placements.`;
        if ($('refresh-tracker')) $('refresh-tracker').hidden = tracker?.source?.type!=='google'||automatic;
        if ($('progress-scope')) $('progress-scope').hidden=automatic;
        $('sheet-connection').hidden = mode === 'automatic';
        $('source-details').hidden = mode === 'automatic';
        $('report-loaded-badge').hidden = !tracker || automatic;
        const textSpan = $('report-loaded-text') || $('report-loaded-badge');
        if (tracker && textSpan) {
            if (tracker.source?.type === 'google' && tracker.importedAt) {
                textSpan.textContent = formatSyncTimestamp(tracker.importedAt);
            } else if (tracker.source?.type === 'csv') {
                textSpan.textContent = 'Report loaded · CSV snapshot';
            } else {
                textSpan.textContent = 'Report loaded';
            }
        }
        $('forget-report').disabled = busy || !tracker;
        $('discover-campaigns').hidden = mode === 'main';
        $('discover-campaigns').textContent = mode === 'early' ? 'Use visited campaigns fallback' : 'Refresh placements from visited campaigns';
        const hasLoaded = Boolean(tracker);
        $('month-default-hint').hidden = hasLoaded || mode !== 'main';
        $('first-use-guide').hidden = hasLoaded || mode !== 'main';
        if ($('sheet-hint')) {
            $('sheet-hint').hidden = hasLoaded;
            $('sheet-hint').textContent = mode === 'early' ? 'Open the Early Reccie report tab before copying its URL.' : 'Open the Reccie report tab before copying its URL.';
        }
        $('verification-scope').textContent = `Checks Prisma for ${$('report-month').value || 'the report month you choose'}. Checks filtered rows first, including rows below “Show more”, then the rest of your assigned rows. Additional checks do not update the tracker.`;
        $('month-hint').textContent = mode === 'main' ? 'Applies to every row' : 'Current month only';
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
            if (source.fallback) coverage.append(text('p', `Early Recs fallback: ${source.fallbackReason}`));
            coverage.append(text('p', `${tracker.rows.length} current-month placements found.`));
            if (!tracker.rows.length && source.successfulCampaigns) coverage.append(text('p', 'Prisma returned no eligible current-month D numbers from the successfully checked campaigns. Use Main Tracker for the previous month’s reconciliation report.'));
            coverage.append(text('p', `${source.successfulCampaigns || 0} campaigns checked of ${source.attemptedCampaigns || 0} attempted; ${source.eligibleCampaigns || 0} eligible visited campaigns.${source.limited ? ' Limited to the 50 most recently visited campaigns.' : ''}`));
            (source.issues || []).forEach(issue=>coverage.append(text('p', `${issue.campaignId}: ${issue.message}`)));
            if (!source.eligibleCampaigns) coverage.append(text('p','No eligible visits recorded this month. Enable campaign visit logging in Settings, open a campaign in Prisma, then select Refresh placements from visited campaigns.'));
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
            await chrome.storage.local.set({reccieViewMode:mode});
            $('report-month').value=mode === 'main' ? mainMonth : core.currentMonth();
            await send('load',{mode,month:$('report-month').value});
            const stored=await chrome.storage.local.get([storageKey('preferences'),storageKey('timing')]);
            restorePreferences(stored[storageKey('preferences')]);
            people(stored[storageKey('preferences')]?.person);
            $('sheet-url').value=tracker?.source?.url || mainSource;
            limit=40; showTiming(stored[storageKey('timing')]?.revision === tracker?.revision ? stored[storageKey('timing')]?.report : tracker?.lastCheckTiming);
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
    for(const [id,key] of [['auto-mark-tracker','autoMark'],['verify-after-financial','afterFinancial'],['auto-clear-comments','clearCommentsOnMarkYes']]){
        $(id).addEventListener('change',async()=>{
            const enabled=$(id).checked;$(id).disabled=true;
            updateModeBadge();
            try{
                if(enabled&&key==='autoMark'&&!await chrome.permissions.request({origins:['https://script.google.com/*','https://script.googleusercontent.com/*']})){ $(id).checked=false; updateModeBadge(); throw Error('Google script access was not granted.'); }
                const settings=(await chrome.storage.local.get('reccieAutomation')).reccieAutomation||{};
                settings[key]=enabled;await chrome.storage.local.set({reccieAutomation:settings});
                $('automation-status').textContent=enabled?'Enabled for this Chrome profile.':'Setting switched off.';
            }catch(error){$(id).checked=!enabled;$('automation-status').textContent=error.message;}
            finally{$(id).disabled=false;updateModeBadge();}
        });
    }
    $('show-progress-bars').addEventListener('change', async()=>{
        const enabled=$('show-progress-bars').checked;
        try { await chrome.storage.local.set({reccieProgressBarsEnabled:enabled}); renderProgressBars(); }
        catch(error) { $('show-progress-bars').checked=!enabled; renderProgressBars(); message(error.message,true); }
    });
    function showAutomationResult(result){
        if(!result)return;
        const active=['checking','saving','recovering'].includes(result.state);
        const text=`Background Reccies · ${result.campaignId||'tracker update'} · ${result.state}${result.message?` · ${result.message}`:''}${result.due?` · due ${new Date(result.due).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`:''}`;
        $('automation-status').textContent=text;
        const progress=$('background-progress');progress.hidden=false;window.reccieStatus.render(progress,text,active);
    }
    chrome.storage.local.get('reccieAutomationLastRun').then(data=>showAutomationResult(data.reccieAutomationLastRun)).catch(()=>{});
    chrome.storage.onChanged?.addListener?.((changes,area)=>{
        if(area!=='local')return;
        if(changes.reccieAutomationLastRun)showAutomationResult(changes.reccieAutomationLastRun.newValue);
        if(changes.reccieAutomation){const value=changes.reccieAutomation.newValue||{};for(const [id,key]of [['auto-mark-tracker','autoMark'],['verify-after-financial','afterFinancial'],['auto-clear-comments','clearCommentsOnMarkYes']])$(id).checked=value[key]===true;updateModeBadge();}
        const key=core.trackerKey(mode,$('report-month').value);
        if(changes[key]?.newValue?.month===$('report-month').value&&!busy){tracker=changes[key].newValue;people();render();}
    });
    chrome.storage.local.get('reccieAutomation').then(data=>{ $('auto-mark-tracker').checked=data.reccieAutomation?.autoMark===true;$('verify-after-financial').checked=data.reccieAutomation?.afterFinancial===true;$('auto-clear-comments').checked=data.reccieAutomation?.clearCommentsOnMarkYes===true;updateModeBadge(); }).catch(()=>{});
    $('debug-workers').addEventListener('input', () => { $('debug-worker-count').value = $('debug-workers').value; });
    $('debug-run').addEventListener('click', () => verifyRows(`workers-${$('debug-workers').value}`));
    document.addEventListener('reccies-ui-change', () => render());
    (async () => {
        try {
            const stored = await chrome.storage.local.get(['reccieTracker','recciePreferences','reccieLastRunTiming','reccieProgressBarsEnabled','reccieMonthConfirmed','reccieViewMode','reccieAutomation']);
            if(stored.reccieAutomation){$('auto-mark-tracker').checked=stored.reccieAutomation.autoMark===true;$('verify-after-financial').checked=stored.reccieAutomation.afterFinancial===true;$('auto-clear-comments').checked=stored.reccieAutomation.clearCommentsOnMarkYes===true;}
            tracker = stored.reccieTracker || null;
            $('show-progress-bars').checked = stored.reccieProgressBarsEnabled !== false;

            const previous = new Date(); previous.setDate(1); previous.setMonth(previous.getMonth() - 1);
            mainMonth=tracker?.month || (stored.reccieMonthConfirmed?`${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`:'');
            let prefs = stored.recciePreferences || {};
            if (['early','automatic'].includes(stored.reccieViewMode)) {
                mode=stored.reccieViewMode;
                document.querySelector(`input[name=mode][value=${mode}]`).checked=true;
                $('report-month').value=core.currentMonth();
                await send('load',{mode,month:core.currentMonth()});
                const saved=await chrome.storage.local.get(storageKey('preferences'));
                prefs=saved[storageKey('preferences')]||{};
            }
            restorePreferences(prefs);
            $('report-month').value = mode==='main'?mainMonth:core.currentMonth();
            $('sheet-url').value = tracker?.source.url || '';
            if (mode==='main' && !tracker && !stored.reccieMonthConfirmed) $('report-month').value = '';
            $('first-use-guide').hidden = !!tracker;
            people(prefs.person); setDisclosureOpen($('source-details'), !tracker); render();
            if (typeof prefs.view === 'string' || !prefs.trackerStatus) {
                await savePreferences();
                if ($('tracker-status').value !== 'any' && selectedStatuses().length) message('Your filters now match both the tracker status and a selected Prisma status. Clear filters to see everything.');
            }
            if (tracker && stored.reccieLastRunTiming?.revision === tracker.revision) showTiming(stored.reccieLastRunTiming.report);
        } catch (error) { message(error.message, true); }
    })();
    window.setInterval(renderProgressBars, 60000);
})();

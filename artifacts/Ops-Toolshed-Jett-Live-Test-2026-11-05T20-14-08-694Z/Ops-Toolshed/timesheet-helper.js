(() => {
    'use strict';
    const $ = id => document.getElementById(id);
    const iso = date => date.toISOString().slice(0, 10);
    const monday = value => { const d = new Date(`${value}T12:00:00Z`); if (Number.isNaN(d.valueOf())) return null; d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return iso(d); };
    const datesFor = start => Array.from({ length: 7 }, (_, i) => { const d = new Date(`${start}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i); return iso(d); });
    const blank = () => ({ rows: [ ['NCBAU','Non-client BAU'], ['OFFC','Office closure'], ['BHOL','Bank holiday'], ['HOL','Holiday'] ].map(([code,label]) => ({ code, label, hours: {} })) });
    const state = { weeks: {}, mappings: {}, activity: {}, summer: { 2026: ['2026-06-01', '2026-08-28'] }, week: '', revision: 0, pending: null };
    let saveQueue = Promise.resolve();
    function save() {
        const snapshot = structuredClone({ timesheetWeeks: state.weeks, timesheetMappings: state.mappings, timesheetSummer: state.summer });
        saveQueue = saveQueue.catch(() => {}).then(() => chrome.storage.local.set(snapshot)).catch(() => { $('status').textContent = 'Could not save the draft. Check extension storage and try again.'; });
        state.revision++; state.pending = null; $('estimate').replaceChildren();
    }
    function dayLabel(date) { return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); }
    function cell(tag, text) { const el = document.createElement(tag); el.textContent = text; return el; }
    function current() { return state.weeks[state.week] ||= blank(); }
    function setWeek(value) {
        const start = monday(value); if (!start) return;
        state.week = start; $('week').value = start; state.revision++; state.pending = null; $('estimate').replaceChildren();
        const year = datesFor(start)[4].slice(0, 4); const season = state.summer[year] || ['', ''];
        $('summer-start').value = season[0]; $('summer-end').value = season[1];
        const selected = $('estimate-day').value; $('estimate-day').replaceChildren();
        for (const date of datesFor(start)) $('estimate-day').add(new Option(dayLabel(date), date));
        if (datesFor(start).includes(selected)) $('estimate-day').value = selected;
        render();
    }
    function render() {
        const dates = datesFor(state.week), week = current();
        $('grid-head').replaceChildren(cell('th', 'Account / label'), ...dates.map(d => cell('th', dayLabel(d))), cell('th', 'Total'), cell('th', ''));
        const body = $('grid-body'); body.replaceChildren();
        week.rows.forEach((row, rowIndex) => {
            const tr = document.createElement('tr'); tr.append(cell('th', `${row.code} · ${row.label}`));
            dates.forEach(date => {
                const td = document.createElement('td'), input = document.createElement('input');
                input.type = 'number'; input.min = '0'; input.max = '24'; input.step = '0.01'; input.value = row.hours[date] ?? ''; input.setAttribute('aria-label', `${row.code}, ${dayLabel(date)} hours`);
                input.addEventListener('change', () => {
                    const n = Number(input.value);
                    if (input.value !== '' && (!Number.isFinite(n) || n < 0 || n > 24)) { input.setCustomValidity('Enter hours from 0 to 24'); input.reportValidity(); return; }
                    input.setCustomValidity(''); if (input.value === '') delete row.hours[date]; else row.hours[date] = Math.round(n * 100) / 100;
                    save(); render();
                }); td.append(input); tr.append(td);
            });
            tr.append(cell('td', dates.reduce((n, d) => n + Number(row.hours[d] || 0), 0).toFixed(2)));
            const td = document.createElement('td'), copyRow = document.createElement('button'), remove = document.createElement('button');
            copyRow.type = 'button'; copyRow.textContent = 'Copy hours'; copyRow.setAttribute('aria-label', `Copy seven days of hours for ${row.code}`);
            copyRow.onclick = async () => { try { await navigator.clipboard.writeText(dates.map(d => Number(row.hours[d] || 0).toFixed(2)).join('\t')); $('status').textContent = `Hours for ${row.code} copied. Check the target row and existing values before pasting.`; } catch { $('status').textContent = 'Could not copy row hours.'; } };
            td.append(copyRow); remove.type = 'button'; remove.textContent = 'Remove'; remove.setAttribute('aria-label', `Remove ${row.code}`);
            remove.onclick = () => { if (!confirm(`Remove ${row.code} and its hours from this week?`)) return; week.rows.splice(rowIndex, 1); save(); render(); }; td.append(remove); tr.append(td); body.append(tr);
        });
        const totals = dates.map(d => week.rows.reduce((n, row) => n + Number(row.hours[d] || 0), 0));
        $('grid-total').replaceChildren(cell('th','Daily total'), ...totals.map((n, index) => { const td = cell('td', n.toFixed(2)); if (index < 5 && n < 7) { td.className = 'warning'; td.title = 'Below seven hours; check working days, leave and exceptions.'; td.setAttribute('aria-label', `${n.toFixed(2)} hours, below seven hours`); } return td; }), cell('td', totals.reduce((a,b) => a+b,0).toFixed(2)), cell('td',''));
        renderMappings();
        showActivity();
    }
    function showActivity() { const activity = state.activity[$('estimate-day').value] || {}; const entries = Object.entries(activity); $('activity-summary').textContent = entries.length ? `Recorded active Prisma time: ${entries.map(([key, seconds]) => `${key}: ${seconds < 60 ? `${Math.round(seconds)} sec` : `${Math.round(seconds / 60)} min`}`).join('; ')}. This is a weighting, not total work time.` : 'No active Prisma time recorded for this day.'; }
    function renderMappings() {
        const keys = new Set(Object.keys(state.mappings)); datesFor(state.week).forEach(d => Object.keys(state.activity[d] || {}).forEach(k => keys.add(k)));
        const host = $('mappings'); host.replaceChildren();
        if (!keys.size) { host.textContent = 'No Prisma activity recorded for this week yet.'; return; }
        [...keys].sort().forEach(key => {
            const wrap = document.createElement('div'); wrap.className = 'mapping';
            const label = document.createElement('label'); label.textContent = `Prisma ${key}`;
            const select = document.createElement('select'); select.setAttribute('aria-label', `Production mapping for Prisma ${key}`); select.add(new Option('Choose a Production row', ''));
            current().rows.forEach(row => select.add(new Option(`${row.code} · ${row.label}`, row.code)));
            select.value = state.mappings[key] || ''; select.onchange = () => { if (select.value) state.mappings[key] = select.value; else delete state.mappings[key]; save(); };
            wrap.append(label, select); host.append(wrap);
        });
    }
    $('tracking').onchange = async event => { try { await chrome.storage.local.set({ timesheetTrackingEnabled: event.target.checked }); $('status').textContent = event.target.checked ? 'Prisma activity recording enabled.' : 'Prisma activity recording paused.'; } catch { event.target.checked = !event.target.checked; $('status').textContent = 'Could not change activity recording.'; } };
    $('estimate-day').onchange = () => { state.revision++; $('estimate').replaceChildren(); showActivity(); };
    $('target').oninput = () => { state.revision++; $('estimate').replaceChildren(); };
    $('clear-activity').onclick = async () => { if (!confirm('Clear recorded Prisma activity for this week? Draft hours and mappings will remain.')) return; try { const result = await chrome.runtime.sendMessage({ action: 'clearTimesheetActivity', days: datesFor(state.week) }); if (result?.status !== 'ok') throw new Error('Clear failed'); $('status').textContent = 'Activity for this week cleared.'; } catch { $('status').textContent = 'Could not clear activity.'; } };
    $('week').onchange = event => setWeek(event.target.value);
    for (const [id, delta] of [['previous',-7],['next',7]]) $(id).onclick = () => { const d = new Date(`${state.week}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+delta); setWeek(iso(d)); };
    $('add-row').onclick = () => {
        const code = $('new-code').value.trim().toUpperCase().replace(/\s*\|\s*/g, ' | '), label = $('new-label').value.trim();
        if (!code || !label) { $('status').textContent = 'Enter an account code and label.'; return; }
        if (current().rows.some(row => row.code === code)) { $('status').textContent = 'That account code is already in this week.'; return; }
        current().rows.push({ code, label, hours: {} }); $('new-code').value = ''; $('new-label').value = ''; save(); render(); $('status').textContent = 'Row added.';
    };
    $('read-production').onclick = async () => {
        const week = state.week, revision = state.revision;
        $('status').textContent = 'Reading the open Production week…';
        try {
            const tabs = await chrome.tabs.query({ url: 'https://*.mediaocean.com/*' });
            const end = datesFor(week)[6].replace(/-/g, '');
            const candidates = tabs.filter(tab => { try { const url = new URL(tab.url); const hash = new URLSearchParams(url.hash.slice(1)); return url.pathname.includes('/viewport-home/') && hash.get('route') === 'time/display/timesheet' && hash.get('end') === end; } catch { return false; } });
            if (candidates.length !== 1) throw new Error('Open exactly one Production timesheet for the selected week, then try again.');
            const frames = await chrome.scripting.executeScript({ target: { tabId: candidates[0].id, allFrames: true }, args: [week], func: (start) => {
                const grid = document.querySelector('.ht_master table.htCore tbody');
                const header = document.getElementById('timesheetHeader')?.innerText || '';
                if (!grid) return null;
                const match = header.match(/(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2})\/(\d{2})\/(\d{4})/);
                if (!match || `${match[3]}-${match[2]}-${match[1]}` !== start) return null;
                const dates = Array.from({length:7}, (_, i) => { const date = new Date(`${start}T12:00:00Z`); date.setUTCDate(date.getUTCDate()+i); return date.toISOString().slice(0,10); });
                const rows = []; let group = '';
                for (const tr of grid.querySelectorAll('tr')) {
                    const codeCell = tr.querySelector('[id^="formattedAccCode-"]');
                    if (!codeCell) { const groupCell = tr.querySelector('[id^="timeType-"]'); if (groupCell) group = groupCell.textContent.trim(); continue; }
                    const code = codeCell.textContent.trim().toUpperCase().replace(/\s*\|\s*/g, ' | ');
                    if (!code) { const groupCell = tr.querySelector('[id^="timeType-"]'); if (groupCell?.textContent.trim()) group = groupCell.textContent.trim(); continue; }
                    const name = tr.querySelector('[id^="accName-"]')?.textContent.trim() || '';
                    const cells = [...tr.querySelectorAll('[id^="hoursList.hoursJson."]')];
                    if (cells.length !== 7) return { error: 'The displayed grid is incomplete. Scroll or load the full timesheet and try again.' };
                    const hours = {};
                    const weekdays = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
                    for (let i = 0; i < 7; i++) { if (!cells[i].id.startsWith(`hoursList.hoursJson.${weekdays[i]}_${dates[i].slice(-2)}-`)) return { error: 'Production day columns do not match the selected week.' }; const text = cells[i].textContent.trim(); const value = Number(text); if (!text || !Number.isFinite(value) || value < 0 || value > 24) return { error: 'Production contains an unreadable hour value.' }; if (value) hours[dates[i]] = value; }
                    rows.push({ code, label: [group, name].filter(Boolean).join(' · ') || code, hours });
                }
                if (!rows.length || new Set(rows.map(row => row.code)).size !== rows.length) return { error: 'No rows found or duplicate account codes need manual review.' };
                return { rows };
            }});
            const results = frames.map(frame => frame.result).filter(Boolean);
            if (results.length !== 1 || results[0].error) throw new Error(results[0]?.error || 'Could not identify a single matching Production grid.');
            if (state.week !== week || state.revision !== revision) throw new Error('The draft changed while reading. Try again.');
            let added = 0, imported = 0, conflicts = 0;
            for (const incoming of results[0].rows) {
                let row = current().rows.find(item => item.code === incoming.code);
                if (!row) { row = { code: incoming.code, label: incoming.label, hours: {} }; current().rows.push(row); added++; }
                for (const [date, value] of Object.entries(incoming.hours)) {
                    if (row.hours[date] == null) { row.hours[date] = value; imported++; }
                    else if (Number(row.hours[date]) !== value) conflicts++;
                }
            }
            save(); render(); $('status').textContent = `Read ${results[0].rows.length} visible rows: ${added} added, ${imported} hour values imported, ${conflicts} conflicts left unchanged. Check the Production grid for rows not currently rendered.`;
        } catch (error) { $('status').textContent = error.message || 'Could not read Production.'; }
    };
    for (const id of ['summer-start','summer-end']) $(id).onchange = () => { state.summer[datesFor(state.week)[4].slice(0,4)] = [$('summer-start').value, $('summer-end').value]; save(); };
    $('closure').onclick = () => {
        const friday = datesFor(state.week)[4], year = friday.slice(0,4), [start,end] = state.summer[year] || [];
        if (!start || !end || start.slice(0,4) !== year || end.slice(0,4) !== year || start > end) { $('status').textContent = `Set valid summer start and end dates for ${year} first.`; return; }
        const row = current().rows.find(item => item.code === 'OFFC');
        if (!row) { $('status').textContent = 'Add an OFFC row first.'; return; }
        if (row.hours[friday] != null && !confirm('Replace the existing Friday OFFC hours?')) return;
        row.hours[friday] = timesheetAllocation.closureHours(friday, start, end); save(); render(); $('status').textContent = 'Friday closure added. Review it for leave or exceptions.';
    };
    $('preview').onclick = () => {
        const date = $('estimate-day').value, target = Number($('target').value), activity = state.activity[date] || {}, rows = current().rows;
        const host = $('estimate'); host.replaceChildren();
        if ($('target').value === '' || !Number.isFinite(target) || target < 0 || target > 24) { host.textContent = 'Enter a total from 0 to 24 hours.'; return; }
        const missing = Object.keys(activity).filter(key => !rows.some(row => row.code === state.mappings[key]));
        if (missing.length) { host.textContent = `Map these Prisma codes to rows before estimating: ${missing.join(', ')}.`; return; }
        const grouped = {}; for (const [key, seconds] of Object.entries(activity)) { const code = state.mappings[key]; grouped[code] = (grouped[code] || 0) + seconds; }
        const fixed = Object.fromEntries(rows.map(row => [row.code, Number(row.hours[date] || 0)]));
        const result = timesheetAllocation.allocateHours(target, fixed, grouped);
        if (result.overTarget) { host.textContent = `Entered hours exceed the target by ${result.overTarget.toFixed(2)} hours. Adjust the target or entries.`; return; }
        if (result.unallocated) { host.textContent = `${result.unallocated.toFixed(2)} hours remain unallocated: no recorded Prisma activity for this day.`; return; }
        if (!Object.keys(result.allocations).length) { host.textContent = 'No hours remain to allocate.'; return; }
        const p = document.createElement('p'); p.textContent = `Suggested additions for ${dayLabel(date)} (on top of existing entries):`;
        const ul = document.createElement('ul'); Object.entries(result.allocations).forEach(([code,hours]) => ul.append(cell('li', `${code}: +${hours.toFixed(2)} hours`)));
        const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Apply estimate to draft';
        const revision = state.revision, week = state.week;
        button.onclick = () => { if (state.revision !== revision || state.week !== week) { host.textContent = 'The draft changed. Preview again.'; return; } for (const [code,hours] of Object.entries(result.allocations)) { const row = current().rows.find(item => item.code === code); row.hours[date] = Math.round(((row.hours[date] || 0) + hours) * 100) / 100; } save(); render(); $('status').textContent = 'Estimate applied to draft. Review each entry before using Production.'; };
        host.append(p, ul, button);
    };
    $('copy').onclick = async () => { const dates = datesFor(state.week); const lines = [['Account code','Label',...dates], ...current().rows.map(row => [row.code,row.label,...dates.map(d => row.hours[d] ?? '')])]; try { await navigator.clipboard.writeText(lines.map(row => row.map(v => String(v).replace(/[\t\r\n]/g,' ')).join('\t')).join('\n')); $('status').textContent = 'Weekly summary copied. Enter and check the hours in Production.'; } catch { $('status').textContent = 'Could not copy. Check clipboard permission and try again.'; } };
    $('clear-week').onclick = () => { if (!confirm('Clear all rows and hours in this week’s draft? Recorded Prisma activity and mappings remain.')) return; delete state.weeks[state.week]; save(); render(); $('status').textContent = 'Week cleared.'; };
    chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.timesheetActivity) { state.activity = changes.timesheetActivity.newValue || {}; state.revision++; $('estimate').replaceChildren(); renderMappings(); showActivity(); } });
    chrome.storage.local.get({ timesheetWeeks: {}, timesheetMappings: {}, timesheetActivity: {}, timesheetSummer: { 2026: ['2026-06-01','2026-08-28'] }, timesheetTrackingEnabled: false }).then(data => {
        state.weeks = data.timesheetWeeks; state.mappings = data.timesheetMappings; state.activity = data.timesheetActivity; state.summer = data.timesheetSummer; $('tracking').checked = data.timesheetTrackingEnabled === true;
        const now = new Date(); setWeek(iso(new Date(now.getTime() - now.getTimezoneOffset()*60000)));
    }).catch(() => { $('status').textContent = 'Could not load saved timesheet data.'; });
})();

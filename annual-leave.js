(function () {
    'use strict';
    const api = AnnualLeaveCalendar;
    const $ = id => document.getElementById(id);
    let draftId = crypto.randomUUID();
    let savedFingerprint = '';
    let submitted = false;
    let dayParts = {};
    let requiredHalfDates = [];
    const keys = Object.keys(api.DEFAULTS);
    function setupSummary(collapse = false) {
        const settings = config();
        let ready = false;
        try { api.validateSettings(settings); ready = api.emails(settings.organizer).length === 1 && api.emails(settings.recipients).length > 0; } catch { /* Keep incomplete setup open. */ }
        $('setup-summary').textContent = ready ? `${api.title(settings.teamTitle, settings.name)} · ${api.emails(settings.recipients).length} work invitee(s)` : 'Set up once, reuse for every request';
        if (collapse && ready) $('calendar-setup').open = false;
    }
    function status(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error', error); }
    function config() { return Object.fromEntries(keys.map(key => [key, $(key).value.trim()])); }
    function dates() { return api.normalizeDates($('dates').value.split(/[\s,;]+/).filter(Boolean)); }
    function fingerprint(selected) { return `${$('name').value.trim()}|${selected.map(date => `${date}:${dayParts[date] || 'full'}`).join(',')}`; }
    function renderDayParts(selected) {
        requiredHalfDates = requiredHalfDates.filter(date => selected.includes(date));
        const container = $('day-parts');
        const signature = `${selected.join(',')}|${requiredHalfDates.join(',')}`;
        if (container.dataset.dates === signature) return;
        container.dataset.dates = signature;
        container.replaceChildren();
        for (const date of selected) {
            const label = document.createElement('label'); label.className = 'day-part';
            const caption = document.createElement('span'); caption.textContent = date;
            const select = document.createElement('select'); select.dataset.date = date;
            const required = requiredHalfDates.includes(date);
            const options = required ? [['', 'Choose AM or PM'], ['am', 'AM · 9am–1pm'], ['pm', 'PM · 2pm–5:30pm']] : [['full', 'Full day'], ['am', 'AM · 9am–1pm'], ['pm', 'PM · 2pm–5:30pm']];
            for (const [value, text] of options) { const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option); }
            select.value = dayParts[date] || (required ? '' : 'full');
            label.append(caption, select); container.append(label);
        }
    }
    function draft() {
        const selected = dates();
        if (requiredHalfDates.some(date => selected.includes(date) && !['am', 'pm'].includes(dayParts[date]))) throw new Error('Choose AM or PM for each half-day before preparing calendar files.');
        const current = fingerprint(selected);
        if (savedFingerprint && current !== savedFingerprint) { draftId = crypto.randomUUID(); savedFingerprint = ''; submitted = false; }
        return { id: draftId, dates: selected, dayParts: Object.fromEntries(selected.filter(date => dayParts[date] && dayParts[date] !== 'full').map(date => [date, dayParts[date]])), requiredHalfDates };
    }
    function preview() {
        const previousBlock = $('work-block').value;
        $('work-block').replaceChildren();
        try {
            const selected = dates();
            renderDayParts(selected);
            if (submitted && savedFingerprint !== fingerprint(selected)) {
                submitted = false;
                $('draft-status').textContent = 'Dates or name changed. Check these against your Workday request before adding them to your calendars.';
            }
            const blocks = api.periods(selected, dayParts);
            $('date-summary').textContent = requiredHalfDates.some(date => !dayParts[date]) ? 'Choose AM or PM for each half-day.' : `${selected.length} date${selected.length === 1 ? '' : 's'} in ${blocks.length} block${blocks.length === 1 ? '' : 's'}: ${blocks.map(block => `${block.start === block.end ? block.start : `${block.start} – ${block.end}`} (${api.timeDescription(block.part)})`).join('; ')}`;
            $('review-dates').textContent = $('date-summary').textContent;
            blocks.forEach((block, index) => {
                const option = document.createElement('option'); option.value = block.start;
                const time = requiredHalfDates.includes(block.start) && !dayParts[block.start] ? 'Choose AM or PM' : api.timeDescription(block.part);
                option.textContent = `${index + 1} of ${blocks.length}: ${block.start}${block.end === block.start ? '' : ` – ${block.end}`} · ${time}`;
                $('work-block').append(option);
            });
            if (blocks.some(block => block.start === previousBlock)) $('work-block').value = previousBlock;
        } catch {
            $('day-parts').replaceChildren(); $('day-parts').dataset.dates = '';
            if (submitted) {
                submitted = false;
                $('draft-status').textContent = 'Dates changed. Check these against your Workday request before adding them to your calendars.';
            }
            $('date-summary').textContent = $('dates').value.trim() ? 'Check your dates. Use YYYY-MM-DD, one per line.' : 'No dates selected.';
            $('review-dates').textContent = $('date-summary').textContent;
        }
        $('review-request-status').textContent = $('draft-status').textContent;
        $('review-work').textContent = `Team: ${api.title($('teamTitle').value, $('name').value)} · Free | Work blocker: ${api.title($('busyTitle').value, $('name').value)} · Busy | Personal: ${api.title($('personalTitle').value, $('name').value)} · Free`;
        $('review-recipients').textContent = $('recipients').value.trim() ? `Work invitees: ${$('recipients').value.trim()}` : 'Add your work invitees in Calendar setup.';
        try { $('prompt').value = api.prompt(draft(), config()); } catch { $('prompt').value = ''; }
        for (const kind of ['team', 'busy', 'personal']) {
            const suffix = kind === 'team' ? 'Free · Saved invitees' : kind === 'busy' ? 'Busy · No invitees' : 'Free · Apple Calendar or Google Calendar';
            $(`${kind}-preview`).textContent = `${api.title($(kind + 'Title').value, $('name').value)} · ${suffix}`;
        }
    }
    async function saveDefaults() {
        const settings = api.validateSettings(config());
        await chrome.storage.local.set({ annualLeaveSettings: settings });
        $('save-status').textContent = 'Defaults saved on this device.';
        setupSummary(true);
    }
    async function connection() {
        const [{ annualLeaveEnabled }, allowed, { allFeaturesDisabled }] = await Promise.all([
            chrome.storage.local.get({ annualLeaveEnabled: false }),
            chrome.permissions.contains({ origins: ['https://wd3.myworkday.com/*'] }),
            chrome.storage.sync.get({ allFeaturesDisabled: false })
        ]);
        const enabled = annualLeaveEnabled && allowed;
        $('connect').textContent = enabled ? 'Disable Workday helper' : 'Enable Workday helper';
        $('connect').dataset.enabled = String(Boolean(enabled));
        $('connect').disabled = false;
        $('connection-status').textContent = allFeaturesDisabled ? 'Paused by the Features switch in the toolbar.' : enabled ? 'Enabled for WPP Workday. Refresh Workday once after enabling.' : 'Optional access to WPP Workday. Your calendar defaults stay on this device.';
    }
    $('connect').addEventListener('click', async () => {
        try {
            if ($('connect').dataset.enabled === 'true') {
                await chrome.storage.local.set({ annualLeaveEnabled: false });
            } else {
                // Keep permission request in the click's user gesture.
                const allowed = await chrome.permissions.request({ origins: ['https://wd3.myworkday.com/*'] });
                if (!allowed) { status('Workday access was not granted. You can still enter dates manually.', true); return; }
                await chrome.storage.local.set({ annualLeaveEnabled: true });
            }
            await connection();
        } catch (error) { status(error.message, true); }
    });
    $('save').addEventListener('click', () => saveDefaults().catch(error => status(error.message, true)));
    $('leave-form').addEventListener('submit', event => event.preventDefault());
    $('leave-form').addEventListener('input', event => {
        if (event.target.id === 'work-block') return;
        if (event.target.matches('#day-parts select')) dayParts[event.target.dataset.date] = event.target.value;
        $('save-status').textContent = ''; preview();
    });
    $('add-range').addEventListener('click', () => {
        try {
            const start = $('range-start').value, end = $('range-end').value;
            if (!api.validDate(start) || !api.validDate(end) || end < start) throw new Error('Choose a valid start and end date, with the end on or after the start.');
            const added = [];
            for (let date = start; date <= end; date = api.nextDate(date)) {
                if (added.length >= 366) throw new Error('Add up to 366 days at a time.');
                added.push(date);
            }
            const existing = $('dates').value.trim() ? dates() : [];
            $('dates').value = api.normalizeDates([...new Set([...existing, ...added])]).join('\n');
            preview(); status('Date range added. Check the exact dates before exporting.');
        } catch (error) { status(error.message, true); }
    });
    $('clear-draft').addEventListener('click', async () => {
        try {
            await chrome.storage.local.remove('annualLeaveDraft');
            $('dates').value = ''; draftId = crypto.randomUUID(); savedFingerprint = ''; submitted = false; dayParts = {}; requiredHalfDates = [];
            $('draft-status').textContent = 'Saved leave dates cleared. Enter dates manually, or capture them from Workday.';
            preview(); status('Saved leave dates cleared. Your defaults are kept.');
        } catch (error) { status(error.message, true); }
    });
    $('download-all').addEventListener('click', async () => {
        try {
            const request = draft(), settings = config();
            // Build and validate every file before saving anything or starting the download.
            const archive = api.bundle(request, settings);
            await saveDefaults();
            await chrome.storage.local.set({ annualLeaveDraft: { ...request, name: settings.name, submitted, capturedAt: Date.now() } });
            savedFingerprint = fingerprint(request.dates);
            const url = URL.createObjectURL(archive);
            const link = document.createElement('a'); link.href = url; link.download = `annual-leave-${request.dates[0]}.zip`;
            document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
            status('Calendar files downloaded. Extract the ZIP, then review and save or send each entry.');
            $('download-checklist').hidden = false;
        } catch (error) { status(error.message, true); }
    });
    document.querySelectorAll('[data-export]').forEach(button => button.addEventListener('click', async () => {
        try {
            const kind = button.dataset.export;
            const request = draft();
            const block = api.periods(request.dates, request.dayParts).find(range => range.start === $('work-block').value);
            if (kind !== 'personal' && !block) throw new Error('Choose an Outlook date block.');
            const exportDates = kind === 'personal' ? request.dates : request.dates.filter(date => date >= block.start && date <= block.end);
            const contents = api.calendar({ ...request, dates: exportDates }, config(), kind);
            await saveDefaults();
            await chrome.storage.local.set({ annualLeaveDraft: { ...request, name: config().name, submitted, capturedAt: Date.now() } });
            savedFingerprint = fingerprint(request.dates);
            const url = URL.createObjectURL(new Blob([contents], { type: `text/calendar;charset=utf-8;method=${kind === 'team' ? 'REQUEST' : 'PUBLISH'}` }));
            const link = document.createElement('a'); link.href = url; link.download = `annual-leave-${kind}-${exportDates[0]}.ics`;
            document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
            status(kind === 'team' ? 'Outlook invite downloaded. Open it in your work account and check the recipients before sending.' : kind === 'busy' ? 'Outlook blocker downloaded. Open it in your work account and save it as Busy.' : 'Personal .ics downloaded. Import into Apple Calendar or Google Calendar and check it shows as Free.');
            $('download-checklist').hidden = false;
        } catch (error) { status(error.message, true); }
    }));
    $('copy-prompt').addEventListener('click', async () => {
        try {
            const text = api.prompt(draft(), config());
            $('prompt').value = text;
            await navigator.clipboard.writeText(text);
            status('Personal assistant prompt copied.');
        } catch (error) {
            $('prompt').closest('details').open = true;
            status(`Could not copy: ${error.message} You can select the prompt below.`, true);
        }
    });
    $('copy-work').addEventListener('click', async () => {
        try {
            const request = draft();
            const block = api.periods(request.dates, request.dayParts).find(range => range.start === $('work-block').value);
            if (!block) throw new Error('Choose an Outlook date block.');
            const text = api.workBrief({ dates: request.dates.filter(date => date >= block.start && date <= block.end), dayParts: request.dayParts }, config());
            $('work-brief').value = text;
            await navigator.clipboard.writeText(text);
            status('Outlook event details copied, including the selected dates and your invitees.');
        } catch (error) {
            $('work-fallback').open = true;
            status(`Could not copy Outlook details: ${error.message}`, true);
        }
    });
    async function initialize() {
        const { annualLeaveSettings, annualLeaveDraft } = await chrome.storage.local.get(['annualLeaveSettings', 'annualLeaveDraft']);
        const settings = { ...api.DEFAULTS, ...annualLeaveSettings };
        keys.forEach(key => { $(key).value = settings[key]; });
        if (annualLeaveDraft) {
            try {
                $('dates').value = api.normalizeDates(annualLeaveDraft.dates).join('\n');
                $('name').value = annualLeaveDraft.name || settings.name;
                draftId = annualLeaveDraft.id;
                dayParts = annualLeaveDraft.dayParts || {};
                requiredHalfDates = Array.isArray(annualLeaveDraft.requiredHalfDates) ? annualLeaveDraft.requiredHalfDates : annualLeaveDraft.needsDayPart ? dates() : [];
                api.periods(dates(), dayParts);
                submitted = annualLeaveDraft.submitted === true;
                savedFingerprint = fingerprint(dates());
                $('draft-status').textContent = annualLeaveDraft.submitted ? 'Workday request submitted. Treated as approved — check the dates, then prepare your calendars.' : annualLeaveDraft.submissionPending ? 'Dates saved when you pressed Submit. Check Workday completed the request before adding these to your calendars; no separate approval check is needed.' : 'Captured or saved dates. Submit your Workday request before adding these to your calendars.';
            } catch { status('Saved dates could not be loaded. Enter your leave dates again.', true); }
        }
        setupSummary(Boolean(annualLeaveSettings)); preview(); await connection();
    }
    initialize().catch(error => status(`Could not load Annual Leave: ${error.message}`, true));
})();

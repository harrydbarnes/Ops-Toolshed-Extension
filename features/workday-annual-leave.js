(function () {
    'use strict';
    if (window.workdayAnnualLeave || !window.AnnualLeaveCalendar) return;
    const api = window.AnnualLeaveCalendar;
    let active = false, observer, timer, requestDialog, pending, selected = new Set(), name = '', complete = false;
    let offered = false, individualEdited = false, requestsOwner = '';
    let calendarSelection = false;
    const DATE_SELECTOR = '[data-uxi-element-id="myTime-calendarDateCell"]';
    const MAIN_DATE_SELECTOR = '[data-automation-id^="calendarDateCell-"]';
    function ownCalendar() {
        return [...document.querySelectorAll('main, [role="main"]')].find(el => el.querySelector('h1')?.textContent.trim() === 'Manage Absence');
    }
    function captureCalendar(calendar) {
        const profile = document.querySelector('[aria-label^="Profile "]')?.getAttribute('aria-label')?.slice(8).trim();
        const action = requestAction(document);
        const count = (action?.getAttribute('aria-label') || action?.textContent || '').trim().match(/^(\d+)\s+Days?/i);
        if (!calendar || !profile || requestsOwner !== profile) { selected.clear(); name = ''; complete = false; calendarSelection = false; return; }
        if (!calendarSelection) selected.clear();
        name = profile;
        for (const cell of calendar.querySelectorAll(`${MAIN_DATE_SELECTOR}, ${DATE_SELECTOR}`)) {
            const date = api.parseDateLabel(cell.getAttribute('aria-label'));
            if (!date) continue;
            if (cell.getAttribute('aria-pressed') === 'true' || cell.getAttribute('data-automation-selected') === 'true') selected.add(date);
            else selected.delete(date);
        }
        complete = Boolean(count && selected.size > 0 && Number(count[1]) === selected.size);
        calendarSelection = complete;
    }
    function styleButton(button) {
        button.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;align-self:flex-start;flex:0 0 auto;box-sizing:border-box;width:max-content;max-width:100%;min-width:0;margin:8px 0;padding:7px 14px;border:1px solid #c4c7cc;border-radius:18px;background:#fff;color:#194b91;font:600 13px/18px system-ui;cursor:pointer';
    }
    function save(draft) {
        chrome.runtime.sendMessage({ action: 'annualLeave:save', draft }, () => { void chrome.runtime.lastError; });
    }
    function showNotice(request) {
        document.querySelector('#ops-annual-leave-ready')?.remove();
        const notice = document.createElement('aside'); notice.id = 'ops-annual-leave-ready';
        notice.setAttribute('aria-label', 'Annual Leave calendar helper');
        notice.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;width:340px;max-width:calc(100vw - 48px);box-sizing:border-box;padding:16px;background:white;color:#222;border:1px solid #c4c7cc;border-radius:12px;box-shadow:0 8px 24px #0003;font:14px/1.5 system-ui';
        const text = document.createElement('p'); text.style.margin = '0 0 8px';
        text.textContent = request.submitted ? 'Leave requested. Your calendar files are ready.' : 'Leave dates saved. Check Workday completed your request, then prepare your calendars.';
        if (request.needsDayPart) text.textContent += ' Choose AM or PM in the helper.';
        const review = document.createElement('p'); review.style.margin = '0 0 8px';
        if (request.submitted) {
            const periods = api.ranges(request.dates).map(block => block.start === block.end ? block.start : `${block.start} – ${block.end}`);
            const dateSummary = periods.slice(0, 3).join(', ') + (periods.length > 3 ? ` +${periods.length - 3} more` : '');
            review.textContent = `${dateSummary} · Team Free · Work Busy · Personal Free`;
            chrome.storage.local.get('annualLeaveSettings').then(({ annualLeaveSettings }) => {
                if (!notice.isConnected) return;
                const invitees = String(annualLeaveSettings?.recipients || '').split(/[;,\s]+/).filter(Boolean);
                if (invitees.length) review.textContent = `${dateSummary} · Team Free · Work Busy · Personal Free\nInvitees: ${invitees.slice(0, 3).join(', ')}${invitees.length > 3 ? ` +${invitees.length - 3} more` : ''}`;
            }).catch(() => {});
            review.style.whiteSpace = 'pre-wrap';
        }
        const button = document.createElement('button'); button.textContent = 'Open calendar helper'; button.type = 'button'; styleButton(button);
        button.addEventListener('click', event => { if (event.isTrusted) open(request, button); });
        const close = document.createElement('button'); close.textContent = 'Dismiss'; close.type = 'button'; styleButton(close); close.style.marginLeft = '8px';
        close.addEventListener('click', () => notice.remove());
        notice.append(text); if (request.submitted) notice.append(review); notice.append(button, close); document.body.append(notice);
    }
    function submittedRequests() {
        const main = [...document.querySelectorAll('main, [role="main"]')].find(el => el.querySelector('h1')?.textContent.trim() === 'Manage Absence');
        const profile = document.querySelector('[aria-label^="Profile "]')?.getAttribute('aria-label')?.slice(8).trim();
        // Require the viewed worker to match the signed-in profile before attaching personal exports.
        if (main) requestsOwner = [...main.querySelectorAll('a, [role="link"]')].some(el => el.textContent.trim() === profile) ? profile : '';
        const scope = main || [...document.querySelectorAll('main, [role="main"]')].find(el =>
            !el.querySelector('h1')?.textContent.trim() && el.querySelector('[role="tabpanel"]'));
        if (!scope || requestsOwner !== profile || !profile) {
            document.querySelectorAll('.ops-annual-leave-request').forEach(button => button.remove());
            if (!scope && [...document.querySelectorAll('main h1, [role="main"] h1')].some(el => el.textContent.trim() && el.textContent.trim() !== 'Manage Absence')) requestsOwner = '';
            return;
        }
        // Narrow Workday windows replace the owned calendar with an untitled Requests pane.
        const owner = requestsOwner;
        scope.querySelectorAll('[data-automation-id="compositeListItem"]').forEach(row => {
            const header = row.querySelector('[data-automation-id="compositeHeader"]');
            const dates = api.submittedDates(header?.textContent || '');
            let button = row.querySelector('.ops-annual-leave-request');
            if (!dates) { button?.remove(); return; }
            if (!button) {
                button = document.createElement('button'); button.className = 'ops-annual-leave-request'; button.type = 'button';
                button.textContent = 'Calendar files'; styleButton(button);
                button.addEventListener('click', event => {
                    if (!event.isTrusted) return;
                    event.stopPropagation();
                    const liveDates = api.submittedDates(row.querySelector('[data-automation-id="compositeHeader"]')?.textContent || '');
                    const liveProfile = document.querySelector('[aria-label^="Profile "]')?.getAttribute('aria-label')?.slice(8).trim();
                    const ownView = requestsOwner === owner;
                    if (row.isConnected && liveDates && ownView && liveProfile === owner) open({ name: owner, dates: liveDates, submitted: true }, button);
                });
                row.append(button);
            }
        });
    }
    function dialog() {
        return [...document.querySelectorAll('[role="dialog"]')].find(el =>
            /Request Absence/i.test(el.querySelector('[data-automation-id="header"], h2')?.textContent || ''));
    }
    function setText(el, text) { if (el.textContent !== text) el.textContent = text; }
    function requestAction(scope) {
        return [...scope.querySelectorAll('button')].find(button => /^\d+\s+Days?\s*[-–—]\s*Request Absence$/i.test((button.getAttribute('aria-label') || button.textContent).trim()));
    }
    function ensurePreviewStyles() {
        if (document.querySelector('#ops-annual-leave-footer-style')) return;
        const style = document.createElement('style'); style.id = 'ops-annual-leave-footer-style';
        style.textContent = `
            @keyframes ops-annual-leave-enter { from { opacity: 0; } to { opacity: 1; } }
            #ops-annual-leave-calendar-preview { animation: ops-annual-leave-enter 180ms ease-out; }
            @media (prefers-reduced-motion: reduce) { #ops-annual-leave-calendar-preview { animation: none; } }
            [data-automation-id="toolbarButtonContainer"]:has(> #ops-annual-leave-calendar-preview) { display: flex !important; align-items: center; flex-wrap: wrap; gap: 12px; }
            [data-automation-id="toolbarButtonContainer"] > #ops-annual-leave-calendar-preview { margin: 0 !important; align-self: center !important; white-space: nowrap; }
            [role="dialog"]:has(#ops-annual-leave-preview) { min-width: 0 !important; max-width: calc(100vw - 24px) !important; }
            [data-automation-id="my-time-container"]:has(#ops-annual-leave-preview) { width: min(530px, calc(100vw - 32px)) !important; max-height: calc(100dvh - 112px); min-height: 0 !important; }
            [data-automation-id="my-time-container"]:has(#ops-annual-leave-preview) > [data-automation-id="scrollableDiv"] { min-height: 0; flex-shrink: 1; }
            [data-automation-id="toolbar"]:has(> #ops-annual-leave-preview) { display: flex !important; align-items: center; gap: 12px; flex-wrap: wrap; flex-shrink: 0; }
            [data-automation-id="toolbar"] > #ops-annual-leave-preview { flex: 0 0 auto !important; width: max-content !important; max-width: 100%; height: 40px; margin: 0 auto 0 0 !important; padding: 6px 12px !important; white-space: nowrap !important; }
            [data-automation-id="toolbar"]:has(> #ops-annual-leave-preview) > [data-automation-id="toolbarWrapper"] { margin-left: auto; flex: 0 0 auto; }
        `;
        document.head.append(style);
    }
    function placePreview(scope, button, calendar = false) {
        const footerActions = [...scope.querySelectorAll('button')].filter(el => !el.closest('[data-automation-id="scrollableDiv"]') && /^(Cancel|Continue|Submit Request|Submit)$/i.test((el.getAttribute('aria-label') || el.textContent).trim()));
        const action = calendar ? requestAction(scope) : footerActions[0];
        if (!action) { button.remove(); return; }
        // Use the native footer's layout, outside the scrolling calendar, without a viewport overlay.
        ensurePreviewStyles();
        let parent = calendar ? (action.closest('[data-automation-id="toolbarButtonContainer"]') || action.parentElement) : action.parentElement;
        const toolbar = !calendar && action.closest('[data-automation-id="toolbar"]');
        if (!calendar) {
            const peer = footerActions.find(el => el !== action);
            while (peer && !parent.contains(peer) && parent.parentElement && parent !== scope) parent = parent.parentElement;
        }
        if (toolbar) parent = toolbar;
        let anchor = action;
        while (anchor.parentElement !== parent) anchor = anchor.parentElement;
        if (calendar) {
            if (button.parentElement !== parent || button.previousElementSibling !== anchor) parent.insertBefore(button, anchor.nextSibling);
        } else if (button.parentElement !== parent || button.nextElementSibling !== anchor) parent.insertBefore(button, anchor);
        button.style.margin = '8px auto 8px 0';
        button.style.borderRadius = '4px';
        button.style.borderColor = '#a8bac5';
        button.style.background = '#f6f9fb';
    }
    function open(draft, button) {
        button.disabled = true;
        chrome.runtime.sendMessage({ action: 'annualLeave:open', draft }, response => {
            button.disabled = false;
            if (chrome.runtime.lastError || !response?.ok) {
                setText(button, 'Could not open calendar helper — try again');
            }
        });
    }
    function capture(current) {
        const worker = current.querySelector('[data-automation-id="subheader"]')?.textContent || '';
        const myself = worker.match(/^For (.+?) \(Myself\)$/);
        if (!myself) { selected.clear(); name = ''; complete = false; return; }
        if (name && name !== myself[1]) selected.clear();
        name = myself[1];
        if (current.querySelector('[data-automation-id="simpleRequestStep"]')) {
            captureCalendar(ownCalendar());
            if (name !== myself[1]) { selected.clear(); complete = false; }
            return;
        }
        const buttons = [...current.querySelectorAll(DATE_SELECTOR)];
        if (buttons.length) {
            for (const button of buttons) {
                const date = api.parseDateLabel(button.getAttribute('aria-label'));
                if (!date) continue;
                if (button.getAttribute('aria-pressed') === 'true' || button.getAttribute('data-automation-selected') === 'true') selected.add(date);
                else selected.delete(date);
            }
            const count = current.querySelector('[data-automation-id="ariaLiveMessage"]')?.textContent.match(/^(\d+) days? selected$/);
            complete = Boolean(count && Number(count[1]) === selected.size && selected.size > 0);
        }
        // Date-range mode and edited individual amounts need manual review; never reuse old calendar dates.
        if (current.querySelector('[data-automation-id="initiationStep"]') && !buttons.length) complete = false;
    }
    function draft(submitted) { return { name, dates: [...selected].sort(), submitted }; }
    function successTexts() {
        return [...document.querySelectorAll('[role="alert"], [role="status"], [role="dialog"] h2, [data-automation-id="completedTaskPage"]')]
            .map(node => ({ node, text: node.textContent.trim() }))
            .filter(item => /(?:successfully submitted|submitted successfully|you have submitted|you[’']ve submitted|request submitted)/i.test(item.text));
    }
    function reconcile() {
        timer = undefined;
        if (!active) return;
        submittedRequests();
        const current = dialog();
        const calendar = !current && ownCalendar();
        if (calendar) {
            captureCalendar(calendar);
            let preview = document.querySelector('#ops-annual-leave-calendar-preview');
            if (!preview && complete) {
                preview = document.createElement('button'); preview.id = 'ops-annual-leave-calendar-preview'; preview.type = 'button';
                styleButton(preview); preview.textContent = 'Preview calendar files';
                preview.addEventListener('click', event => { if (event.isTrusted && complete) open(draft(false), preview); });
            }
            if (preview) {
                preview.hidden = !complete;
                preview.style.display = complete ? 'inline-flex' : 'none';
                placePreview(document, preview, true);
            }
        } else document.querySelector('#ops-annual-leave-calendar-preview')?.remove();
        if (current && current !== requestDialog && (!requestDialog || current.querySelector('[data-automation-id="initiationStep"]'))) {
            if (!calendarSelection || current.querySelector('[data-automation-id="initiationStep"]')) { selected.clear(); name = ''; complete = false; }
            calendarSelection = false; offered = false; individualEdited = false;
        }
        requestDialog = current;
        if (current) {
            capture(current);
            let button = current.querySelector('#ops-annual-leave-preview');
            if (!button) {
                button = document.createElement('button'); button.id = 'ops-annual-leave-preview'; button.type = 'button';
                styleButton(button);
                button.addEventListener('click', event => { if (event.isTrusted) open(draft(false), button); });
            }
            placePreview(current, button);
            button.hidden = !complete || !name || individualEdited;
            button.style.display = button.hidden ? 'none' : 'inline-flex';
            button.setAttribute('aria-label', 'Preview calendar files');
            setText(button, 'Preview calendar files');
        }
        if (pending && Date.now() - pending.time > 120000) pending = undefined;
        if (pending && !offered && successTexts().some(item => !pending.baseline.some(old => old.node === item.node && old.text === item.text))) {
            const ready = pending.draft;
            ready.submitted = true; ready.submissionPending = false;
            save(ready);
            pending = undefined; offered = true;
            showNotice(ready);
        }
    }
    function schedule() { if (!timer) timer = setTimeout(reconcile, 120); }
    function onClick(event) {
        if (!event.isTrusted || !active) return;
        const button = event.target.closest('button');
        if (event.target.closest('a[href], [role="link"]') || button?.getAttribute('aria-label') === 'Switch Worker' || button?.textContent.trim() === 'Switch Worker') {
            requestsOwner = '';
            if (calendarSelection) { calendarSelection = false; selected.clear(); name = ''; complete = false; }
        }
        const current = dialog();
        if (!current && button && requestAction(document) === button) {
            reconcile();
            if (complete && calendarSelection) save(draft(false));
        }
        if (!button || !current?.contains(button)) return;
        const label = (button.getAttribute('aria-label') || button.textContent).trim();
        if (/^(Cancel|Close|Back)$/i.test(label)) {
            if (pending) { save({ ...pending.draft, submissionPending: false }); document.querySelector('#ops-annual-leave-ready')?.remove(); }
            pending = undefined;
        }
        if (/^(Submit Request|Submit)$/i.test(label) || button.matches('[data-automation-id="submitButton"]')) {
            offered = false;
            document.querySelector('#ops-annual-leave-ready')?.remove();
            capture(current);
            const type = current.querySelector('[data-automation-id="timeOffTypeField"]')?.textContent || '';
            const amounts = [...current.querySelectorAll('[data-automation-id="numberInput"]')];
            if (complete && name && !individualEdited && /Annual Leave/i.test(type) && amounts.length === 1 && [0.5, 1].includes(Number(amounts[0].value))) {
                const request = { ...draft(false), submissionPending: true, needsDayPart: Number(amounts[0].value) === 0.5 };
                pending = { draft: request, baseline: successTexts(), time: Date.now() };
                save(request); showNotice(request);
            } else pending = undefined;
        }
        if (/^Continue$/i.test(label)) {
            capture(current);
            if (complete && name && !individualEdited) save(draft(false));
        }
        if (button.matches('[data-automation-id="editIndividualDaysButton"]')) { complete = false; individualEdited = true; selected.clear(); }
        schedule();
    }
    async function refresh() {
        const [local, sync] = await Promise.all([chrome.storage.local.get({ annualLeaveEnabled: false }), chrome.storage.sync.get({ allFeaturesDisabled: false })]);
        active = local.annualLeaveEnabled === true && sync.allFeaturesDisabled !== true;
        observer?.disconnect(); document.removeEventListener('click', onClick, true);
        clearTimeout(timer); timer = undefined;
        if (active) {
            observer = new MutationObserver(records => {
                if (records.some(record => !record.target.closest?.('#ops-annual-leave-preview, #ops-annual-leave-calendar-preview, #ops-annual-leave-ready, .ops-annual-leave-request'))) schedule();
            });
            observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true,
                attributeFilter: ['aria-pressed', 'data-automation-selected', 'value'] });
            document.addEventListener('click', onClick, true); reconcile();
        } else {
            document.querySelector('#ops-annual-leave-preview')?.remove(); document.querySelector('#ops-annual-leave-ready')?.remove();
            document.querySelector('#ops-annual-leave-calendar-preview')?.remove(); calendarSelection = false;
            document.querySelector('#ops-annual-leave-footer-style')?.remove();
            document.querySelectorAll('.ops-annual-leave-request').forEach(button => button.remove());
            selected.clear(); pending = undefined; complete = false; requestDialog = undefined;
            requestsOwner = '';
        }
    }
    window.workdayAnnualLeave = { refresh };
    chrome.storage.onChanged.addListener((changes, area) => {
        if ((area === 'local' && changes.annualLeaveEnabled) || (area === 'sync' && changes.allFeaturesDisabled)) refresh().catch(() => {});
    });
    refresh().catch(() => {});
})();

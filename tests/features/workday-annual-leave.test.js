const { JSDOM } = require('jsdom');
const path = require('path');
const { readScript } = require('../helpers/read-script');
const core = readScript(path.resolve(__dirname, '../../annual-leave-calendar.js'));
const source = readScript(path.resolve(__dirname, '../../features/workday-annual-leave.js'));
const tick = () => new Promise(resolve => setTimeout(resolve, 160));
function calendarDay(date, selected = true) {
    return `<button data-uxi-element-id="myTime-calendarDateCell" aria-label="${date}" aria-pressed="${selected}"></button>`;
}
const html = `<div role="dialog"><h2>Request Absence</h2><span data-automation-id="subheader">For Harry Barnes (Myself)</span>
    <div data-automation-id="scrollableDiv"><div data-automation-id="initiationStep"><output data-automation-id="ariaLiveMessage">1 day selected</output>
    <div id="calendar">${calendarDay('Tuesday, 27 October 2026')}${calendarDay('Wednesday, 28 October 2026', false)}</div></div></div>
    <footer><button id="cancel">Cancel</button><button id="continue">Continue</button></footer></div>`;

describe('Workday annual leave lifecycle', () => {
    let dom, window, clickHandler, changes;
    async function setup(body = html) {
        dom = new JSDOM(body, { url: 'https://wd3.myworkday.com/wpp/d/home.htmld', runScripts: 'dangerously' });
        window = dom.window;
        const original = window.document.addEventListener.bind(window.document);
        window.document.addEventListener = jest.fn((type, handler, options) => { if (type === 'click') clickHandler = handler; original(type, handler, options); });
        window.chrome = {
            storage: {
                local: { get: jest.fn().mockResolvedValue({ annualLeaveEnabled: true }) },
                sync: { get: jest.fn().mockResolvedValue({ allFeaturesDisabled: false }) },
                onChanged: { addListener: listener => { changes = listener; } }
            },
            runtime: { sendMessage: jest.fn((message, callback) => callback({ ok: true })) }
        };
        window.eval(core); window.eval(source); await tick();
    }
    function submit(type = 'UK GroupM Annual Leave', amount = '1') {
        const content = window.document.querySelector('[data-automation-id="scrollableDiv"]');
        content.innerHTML = `<div data-automation-id="timeOffTypeField">${type}</div><input data-automation-id="numberInput" value="${amount}"><button id="submit">Submit Request</button>`;
        clickHandler({ isTrusted: true, target: window.document.querySelector('#submit') });
    }
    afterEach(() => dom?.window.close());
    test('previews actual selected dates, excludes old Submitted dates and updates on deselection', async () => {
        await setup(html.replace('</div></div></div>', `${calendarDay('Friday, 9 October 2026 Submitted | UK GroupM Annual Leave', false)}</div></div></div>`));
        expect(window.document.querySelector('#ops-annual-leave-preview').hidden).toBe(false);
        window.document.querySelector('[aria-pressed="true"]').setAttribute('aria-pressed', 'false');
        window.document.querySelector('output').textContent = '0 days selected';
        await tick();
        expect(window.document.querySelector('#ops-annual-leave-preview').hidden).toBe(true);
    });
    test('keeps the helper available during submission without misreporting success', async () => {
        await setup();
        submit(); await tick();
        expect(window.document.querySelector('#ops-annual-leave-ready').textContent).toContain('Check Workday completed');
        window.document.querySelector('[role="dialog"]').remove(); await tick();
        expect(window.document.querySelector('#ops-annual-leave-ready').textContent).toContain('Check Workday completed');
        const alert = window.document.createElement('div'); alert.setAttribute('role', 'alert'); alert.textContent = 'Request submitted successfully'; window.document.body.append(alert);
        await tick();
        expect(window.document.querySelector('#ops-annual-leave-ready').textContent).toContain('Your calendar files are ready');
        expect(window.document.querySelector('#ops-annual-leave-ready').textContent).toContain('2026-10-27 · Team Free · Work Busy · Personal Free');
        expect(window.chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ action: 'annualLeave:save', draft: expect.objectContaining({ submitted: true }) }), expect.any(Function));
        alert.textContent = 'Request submitted successfully!'; await tick();
        expect(window.document.querySelectorAll('#ops-annual-leave-ready')).toHaveLength(1);
    });
    test.each([['UK GroupM Sick Leave', '1'], ['UK GroupM Annual Leave', '0.25']])('does not auto-offer for %s amount %s', async (type, amount) => {
        await setup(); submit(type, amount);
        const alert = window.document.createElement('div'); alert.setAttribute('role', 'status'); alert.textContent = 'Request submitted successfully'; window.document.body.append(alert);
        await tick(); expect(window.document.querySelector('#ops-annual-leave-ready')).toBeNull();
    });
    test('captures half-day requests and requires the user to choose AM or PM', async () => {
        await setup(); submit('UK GroupM Annual Leave', '0.5');
        expect(window.chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ action: 'annualLeave:save', draft: expect.objectContaining({ needsDayPart: true, submissionPending: true }) }), expect.any(Function));
    });
    test('ignores an old success but recognises a new notification with identical wording', async () => {
        await setup(html + '<div id="old-success" role="status">Request submitted successfully</div>');
        submit(); await tick();
        expect(window.document.querySelector('#ops-annual-leave-ready').textContent).toContain('Check Workday completed');
        window.document.querySelector('#old-success').remove();
        const fresh = window.document.createElement('div'); fresh.setAttribute('role', 'status'); fresh.textContent = 'Request submitted successfully'; window.document.body.append(fresh);
        await tick(); expect(window.document.querySelector('#ops-annual-leave-ready')).not.toBeNull();
    });
    test('recognises the live Workday Success! Request Submitted dialog heading', async () => {
        await setup(); submit();
        window.document.querySelector('[role="dialog"]').remove();
        const result = window.document.createElement('div'); result.setAttribute('role', 'dialog'); result.innerHTML = '<h2>Success! Request Submitted</h2><button>Go to Calendar</button>';
        window.document.body.append(result); await tick();
        expect(window.document.querySelector('#ops-annual-leave-ready').textContent).toContain('Your calendar files are ready');
        expect(window.chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ action: 'annualLeave:save', draft: expect.objectContaining({ dates: ['2026-10-27'], submitted: true, submissionPending: false }) }), expect.any(Function));
    });
    test('shows a compact submitted review with saved invitees and the three availability settings', async () => {
        await setup();
        window.chrome.storage.local.get.mockResolvedValue({ annualLeaveSettings: { recipients: 'one@work.test, two@work.test; three@work.test four@work.test' } });
        submit();
        const result = window.document.createElement('div'); result.setAttribute('role', 'status'); result.textContent = 'Request submitted successfully';
        window.document.body.append(result); await tick(); await Promise.resolve();
        const review = window.document.querySelector('#ops-annual-leave-ready').textContent;
        expect(review).toContain('2026-10-27 · Team Free · Work Busy · Personal Free');
        expect(review).toContain('Invitees: one@work.test, two@work.test, three@work.test +1 more');
        expect(review).not.toContain('four@work.test');
    });
    test('cleans up on master disable and handles replacement request DOM', async () => {
        await setup();
        window.document.body.innerHTML = html.replace('1 day selected', '0 days selected').replace('aria-pressed="true"', 'aria-pressed="false"');
        await tick(); expect(window.document.querySelector('#ops-annual-leave-preview').hidden).toBe(true);
        window.chrome.storage.sync.get.mockResolvedValue({ allFeaturesDisabled: true });
        changes({ allFeaturesDisabled: { newValue: true } }, 'sync'); await tick();
        expect(window.document.querySelector('#ops-annual-leave-preview')).toBeNull();
    });
    test('does not capture another worker or guess dates in date range mode', async () => {
        await setup(html.replace('(Myself)', '(Other Worker)'));
        expect(window.document.querySelector('#ops-annual-leave-preview').hidden).toBe(true);
        window.document.querySelector('[data-automation-id="subheader"]').textContent = 'For Harry Barnes (Myself)';
        window.document.querySelector('#calendar').remove(); await tick();
        expect(window.document.querySelector('#ops-annual-leave-preview').hidden).toBe(true);
    });
    test('invalidates old selected dates when individual day amounts are edited', async () => {
        await setup();
        const edit = window.document.createElement('button'); edit.dataset.automationId = 'editIndividualDaysButton'; edit.textContent = 'Edit Individual Days';
        window.document.querySelector('[role="dialog"]').append(edit);
        clickHandler({ isTrusted: true, target: edit }); await tick();
        expect(window.document.querySelector('#ops-annual-leave-preview').hidden).toBe(true);
        submit();
        const alert = window.document.createElement('div'); alert.setAttribute('role', 'status'); alert.textContent = 'Request submitted successfully'; window.document.body.append(alert);
        await tick(); expect(window.document.querySelector('#ops-annual-leave-ready')).toBeNull();
    });
    test('preserves selections across month changes only when Workday count matches', async () => {
        await setup();
        window.document.querySelector('#calendar').innerHTML = calendarDay('Monday, 2 November 2026');
        window.document.querySelector('output').textContent = '2 days selected'; await tick();
        expect(window.document.querySelector('#ops-annual-leave-preview').hidden).toBe(false);
        window.document.querySelector('output').textContent = '3 days selected'; await tick();
        expect(window.document.querySelector('#ops-annual-leave-preview').hidden).toBe(true);
    });
    test('saves complete selections on Continue and uses compact, non-stretching controls', async () => {
        await setup();
        clickHandler({ isTrusted: true, target: window.document.querySelector('#continue') });
        expect(window.chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ action: 'annualLeave:save', draft: expect.objectContaining({ dates: ['2026-10-27'], submitted: false }) }), expect.any(Function));
        const button = window.document.querySelector('#ops-annual-leave-preview');
        expect(button.style.alignSelf).toBe('flex-start');
        expect(button.style.width).toBe('max-content');
        expect(button.closest('[data-automation-id="scrollableDiv"]')).toBeNull();
        expect(button.parentElement.tagName).toBe('FOOTER');
        expect(button.nextElementSibling.id).toBe('cancel');
        expect(button.style.marginRight).toBe('auto');
        expect(button.style.borderRadius).toBe('4px');
    });
    test('captures the owned Manage Absence calendar and carries dates into the direct request form', async () => {
        await setup(`<button aria-label="Profile Harry Barnes"></button><main><h1>Manage Absence</h1><a>Harry Barnes</a>${calendarDay('Wednesday, 23 December 2026')}</main><footer><button id="request">1 Day - Request Absence</button></footer>`);
        const preview = window.document.querySelector('#ops-annual-leave-calendar-preview');
        expect(preview.hidden).toBe(false);
        expect(preview.parentElement.tagName).toBe('FOOTER');
        expect(preview.previousElementSibling.id).toBe('request');
        clickHandler({ isTrusted: true, target: window.document.querySelector('#request') });
        window.document.body.innerHTML = '<div role="dialog"><h2>Request Absence</h2><span data-automation-id="subheader">For Harry Barnes (Myself)</span><div data-automation-id="scrollableDiv"></div><footer><button>Cancel</button><button>Submit Request</button></footer></div>';
        await tick(); submit(); await tick();
        expect(window.chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ action: 'annualLeave:save', draft: expect.objectContaining({ dates: ['2026-12-23'], submissionPending: true }) }), expect.any(Function));
    });
    test('does not preview another worker or a mismatched calendar selection count', async () => {
        await setup(`<button aria-label="Profile Harry Barnes"></button><main><h1>Manage Absence</h1><a>Someone Else</a>${calendarDay('Wednesday, 23 December 2026')}</main><footer><button>1 Day - Request Absence</button></footer>`);
        expect(window.document.querySelector('#ops-annual-leave-calendar-preview')).toBeNull();
        window.document.querySelector('main a').textContent = 'Harry Barnes';
        window.document.querySelector('footer button').textContent = '2 Days - Request Absence';
        await tick(); expect(window.document.querySelector('#ops-annual-leave-calendar-preview')).toBeNull();
    });
    test('places the calendar preview after the native action wrapper and respects reduced motion', async () => {
        await setup(`<button aria-label="Profile Harry Barnes"></button><main><h1>Manage Absence</h1><a>Harry Barnes</a>${calendarDay('Wednesday, 23 December 2026')}</main><div data-automation-id="toolbarButtonContainer"><div id="native-wrapper"><div data-automation-id="dropDownCommandButton"><button>1 Day - Request Absence</button></div></div></div>`);
        const preview = window.document.querySelector('#ops-annual-leave-calendar-preview');
        expect(preview.previousElementSibling.id).toBe('native-wrapper');
        expect(preview.parentElement.dataset.automationId).toBe('toolbarButtonContainer');
        expect(window.document.querySelector('#ops-annual-leave-footer-style').textContent).toMatch(/prefers-reduced-motion: reduce/);
        window.chrome.storage.sync.get.mockResolvedValue({ allFeaturesDisabled: true });
        changes({ allFeaturesDisabled: { newValue: true } }, 'sync'); await tick();
        expect(window.document.querySelector('#ops-annual-leave-calendar-preview')).toBeNull();
        expect(window.document.querySelector('#ops-annual-leave-footer-style')).toBeNull();
    });
    test('recovers live large-calendar cells when the simple request dialog is already open', async () => {
        await setup(`<button aria-label="Profile Harry Barnes"></button><div role="main"><h1>Manage Absence</h1><div role="link">Harry Barnes</div><div data-automation-id="calendarMonthLarge"><div role="cell" data-automation-id="calendarDateCell-10-10" aria-label=" selected Tuesday, 10 November 2026" data-automation-selected="true"></div><div role="cell" data-automation-id="calendarDateCell-10-11" aria-label="Wednesday, 11 November 2026" data-automation-selected="false"></div></div></div><div data-automation-daycountselected="1"><button>1 Day - Request Absence</button></div><div role="dialog"><h2 data-automation-id="header">Request Absence</h2><span data-automation-id="subheader">For Harry Barnes (Myself)</span><div data-automation-id="scrollableDiv"><div data-automation-id="simpleRequestStep"><h3>Tue, 10 Nov</h3><div data-automation-id="timeOffTypeField">UK GroupM Annual Leave</div><input data-automation-id="numberInput" value="1"></div></div><div data-automation-id="toolbar"><div data-automation-id="toolbarWrapper"><button>Cancel</button><button id="submit">Submit Request</button></div></div></div>`);
        const preview = window.document.querySelector('#ops-annual-leave-preview');
        expect(preview.hidden).toBe(false);
        expect(preview.parentElement.dataset.automationId).toBe('toolbar');
        expect(preview.textContent).toBe('Preview calendar files');
        expect(preview.getAttribute('aria-label')).toBe('Preview calendar files');
        expect(preview.nextElementSibling.dataset.automationId).toBe('toolbarWrapper');
        expect(window.document.querySelector('#ops-annual-leave-footer-style').textContent).toContain('prefers-reduced-motion: reduce');
        clickHandler({ isTrusted: true, target: window.document.querySelector('#submit') });
        expect(window.chrome.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ action: 'annualLeave:save', draft: expect.objectContaining({ dates: ['2026-11-10'], submissionPending: true }) }), expect.any(Function));
        window.document.querySelector('[data-automation-selected="true"]').setAttribute('data-automation-selected', 'false');
        await tick(); expect(preview.hidden).toBe(true);
    });
    test('keeps preview before wrapped native footer controls after Workday replaces the footer', async () => {
        await setup();
        window.document.querySelector('footer').innerHTML = '<div><button id="cancel">Cancel</button></div><div><button id="continue">Continue</button></div>';
        await tick();
        const preview = window.document.querySelector('#ops-annual-leave-preview');
        expect(preview.parentElement.tagName).toBe('FOOTER');
        expect(preview.nextElementSibling.querySelector('button').id).toBe('cancel');
        expect(window.document.querySelectorAll('#ops-annual-leave-preview')).toHaveLength(1);
    });
    test('adds export actions to submitted request cards only for the signed-in worker', async () => {
        const request = '<div data-automation-id="compositeListItem"><div data-automation-id="compositeHeader">Fri, 27 Nov 2026\nMon, 30 Nov 2026\nUK GroupM Annual Leave\nTotal 2 Days\nSubmitted</div></div>';
        await setup(`<button aria-label="Profile Harry Barnes"></button><main><h1>Manage Absence</h1><a>Harry Barnes</a>${request}</main>`);
        expect(window.document.querySelectorAll('.ops-annual-leave-request')).toHaveLength(1);
        window.document.querySelector('main').innerHTML = `<h1> </h1><div role="tabpanel">${request}</div>`;
        await tick(); expect(window.document.querySelectorAll('.ops-annual-leave-request')).toHaveLength(1);
        window.document.querySelector('main').innerHTML = `<h1>Manage Absence</h1><a>Other Worker</a>${request}`;
        window.document.querySelectorAll('.ops-annual-leave-request').forEach(button => button.remove());
        await tick(); expect(window.document.querySelectorAll('.ops-annual-leave-request')).toHaveLength(0);
    });
});

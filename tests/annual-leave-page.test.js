const { JSDOM } = require('jsdom');
const { TextEncoder } = require('util');
const fs = require('fs');
const path = require('path');
const { readScript } = require('./helpers/read-script');
const html = fs.readFileSync(path.resolve(__dirname, '../annual-leave.html'), 'utf8');
const source = readScript(path.resolve(__dirname, '../annual-leave.js'));
const core = readScript(path.resolve(__dirname, '../annual-leave-calendar.js'));
const flush = () => new Promise(resolve => setImmediate(resolve));
describe('Annual Leave page controls', () => {
    test('places first-run setup before dates in source order', () => {
        expect(html.indexOf('id="calendar-setup"')).toBeLessThan(html.indexOf('id="dates-heading"'));
    });
    let dom, window, store, downloads;
    const $ = id => window.document.getElementById(id);
    async function setup(initial = {}) {
        store = { ...initial }; downloads = [];
        dom = new JSDOM(html, { url: 'https://extension.test/annual-leave.html', runScripts: 'dangerously' });
        window = dom.window; window.TextEncoder = TextEncoder; window.Blob = Blob;
        window.URL.createObjectURL = jest.fn(blob => { downloads.push(blob); return 'blob:calendar'; });
        window.URL.revokeObjectURL = jest.fn();
        window.HTMLAnchorElement.prototype.click = jest.fn();
        Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: jest.fn().mockResolvedValue() } });
        window.chrome = {
            storage: {
                local: { get: jest.fn(async () => store), set: jest.fn(async data => Object.assign(store, data)), remove: jest.fn(async key => delete store[key]) },
                sync: { get: jest.fn().mockResolvedValue({ allFeaturesDisabled: false }) }
            },
            permissions: { contains: jest.fn().mockResolvedValue(false), request: jest.fn().mockResolvedValue(false) }
        };
        window.eval(core); window.eval(source); await flush();
    }
    function fill() {
        $('name').value = 'Harry Barnes'; $('organizer').value = 'harry@example.com'; $('recipients').value = 'team@example.com'; $('dates').value = '2026-12-21\n2026-12-23';
        $('dates').dispatchEvent(new window.Event('input', { bubbles: true }));
    }
    afterEach(() => dom?.window.close());
    test('saves defaults and produces the correct three downloadable files', async () => {
        await setup(); fill(); $('save').click(); await flush();
        expect(store.annualLeaveSettings.teamTitle).toBe('{firstName} - AL');
        for (const kind of ['team', 'busy', 'personal']) {
            window.document.querySelector(`[data-export="${kind}"]`).click(); await flush();
        }
        expect(downloads).toHaveLength(3);
        const files = await Promise.all(downloads.map(blob => blob.text()));
        expect(files[0]).toContain('METHOD:REQUEST');
        expect(files[0].match(/BEGIN:VEVENT/g)).toHaveLength(1);
        expect(files[1]).toContain('TRANSP:OPAQUE');
        expect(files[2]).toContain('TRANSP:TRANSPARENT');
        expect(files[2]).not.toContain('ATTENDEE');
        expect(files[2].match(/BEGIN:VEVENT/g)).toHaveLength(2);
        expect(store.annualLeaveDraft.dates).toEqual(['2026-12-21', '2026-12-23']);
    });
    test('downloads one archive with every work block and the non-blocking personal calendar', async () => {
        await setup(); fill();
        expect($('review-dates').textContent).toContain('2 dates in 2 blocks');
        expect($('review-recipients').textContent).toContain('team@example.com');
        $('download-all').click(); await flush();
        expect(downloads).toHaveLength(1);
        expect(downloads[0].type).toBe('application/zip');
        const bytes = Buffer.from(await downloads[0].arrayBuffer());
        const files = {};
        for (let offset = 0; bytes.readUInt32LE(offset) === 0x04034b50;) {
            const size = bytes.readUInt32LE(offset + 18), nameLength = bytes.readUInt16LE(offset + 26), extraLength = bytes.readUInt16LE(offset + 28);
            const start = offset + 30 + nameLength + extraLength;
            files[bytes.subarray(offset + 30, offset + 30 + nameLength).toString()] = bytes.subarray(start, start + size).toString();
            offset = start + size;
        }
        expect(Object.keys(files)).toEqual(['outlook-team-2026-12-21.ics', 'outlook-busy-2026-12-21.ics', 'outlook-team-2026-12-23.ics', 'outlook-busy-2026-12-23.ics', 'personal-calendar.ics', 'START-HERE.txt']);
        expect(files['outlook-team-2026-12-23.ics']).toContain('DTSTART;VALUE=DATE:20261223');
        expect(files['outlook-team-2026-12-23.ics']).toContain('ATTENDEE;');
        expect(files['outlook-busy-2026-12-21.ics']).toContain('TRANSP:OPAQUE');
        expect(files['personal-calendar.ics'].match(/BEGIN:VEVENT/g)).toHaveLength(2);
        expect(files['personal-calendar.ics']).toContain('TRANSP:TRANSPARENT');
        expect(files['personal-calendar.ics']).not.toContain('ATTENDEE');
        expect(store.annualLeaveDraft.dates).toEqual(['2026-12-21', '2026-12-23']);
    });
    test('rejects a complete bundle when the team invite is missing its organizer or recipients', async () => {
        await setup(); fill(); $('recipients').value = ''; $('download-all').click(); await flush();
        expect(downloads).toHaveLength(0);
        expect($('status').textContent).toContain('at least one invitee');
    });
    test('exports the selected Outlook block without losing the other saved dates', async () => {
        await setup(); fill(); $('work-block').value = '2026-12-23';
        window.document.querySelector('[data-export="busy"]').click(); await flush();
        const file = await downloads[0].text();
        expect(file).toContain('DTSTART;VALUE=DATE:20261223');
        expect(file).not.toContain('DTSTART;VALUE=DATE:20261221');
        expect(store.annualLeaveDraft.dates).toHaveLength(2);
    });
    test('copies an Outlook fallback brief for the chosen block and saved invitees', async () => {
        await setup(); fill(); $('work-block').value = '2026-12-23'; $('copy-work').click(); await flush();
        expect(window.navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('Dates: 2026-12-23'));
        expect($('work-brief').value).toContain('Invitees: team@example.com');
        expect($('work-brief').value).toContain('Show as: Free');
        expect($('work-brief').value).not.toContain('2026-12-21');
    });
    test('copies a non-blocking personal prompt and exposes a fallback if clipboard fails', async () => {
        await setup(); fill(); $('copy-prompt').click(); await flush();
        expect(window.navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('Free/available (transparent)'));
        window.navigator.clipboard.writeText.mockRejectedValue(new Error('Clipboard denied'));
        $('copy-prompt').click(); await flush();
        expect($('prompt').closest('details').open).toBe(true);
        expect($('status').textContent).toContain('Could not copy');
    });
    test('adds explicit ranges across year boundaries, preserves gaps and clears the saved dates', async () => {
        await setup(); fill();
        $('range-start').value = '2026-12-31'; $('range-end').value = '2027-01-02'; $('add-range').click();
        expect($('dates').value).toBe('2026-12-21\n2026-12-23\n2026-12-31\n2027-01-01\n2027-01-02');
        $('clear-draft').click(); await flush(); expect($('dates').value).toBe('');
    });
    test('loads captured names and dates as submitted without an approval waiting step', async () => {
        await setup({ annualLeaveDraft: { id: 'saved-request', name: 'Harry Barnes', dates: ['2026-12-21'], submitted: true } });
        expect($('name').value).toBe('Harry Barnes');
        expect($('draft-status').textContent).toContain('Treated as approved');
        expect($('review-request-status').textContent).toContain('Treated as approved');
        expect($('team-preview').textContent).toContain('Harry - AL');
    });
    test('does not mislabel edited or cleared manual dates as a submitted Workday request', async () => {
        await setup({ annualLeaveDraft: { id: 'submitted-request', name: 'Harry Barnes', dates: ['2026-12-21'], submitted: true } });
        $('dates').value = '2026-12-24'; $('dates').dispatchEvent(new window.Event('input', { bubbles: true }));
        expect($('draft-status').textContent).toContain('Dates or name changed');
        window.document.querySelector('[data-export="personal"]').click(); await flush();
        expect(store.annualLeaveDraft.submitted).toBe(false);
        $('clear-draft').click(); await flush(); fill();
        window.document.querySelector('[data-export="personal"]').click(); await flush();
        expect(store.annualLeaveDraft.submitted).toBe(false);
    });
    test('does not export invalid dates or enable Workday after permission denial', async () => {
        await setup(); fill(); $('dates').value = '2026-02-30';
        window.document.querySelector('[data-export="personal"]').click(); await flush();
        expect(downloads).toHaveLength(0); expect($('status').classList.contains('error')).toBe(true);
        $('connect').click(); await flush(); expect(store.annualLeaveEnabled).not.toBe(true);
    });
    test('requires an AM or PM choice for captured half days and persists the choice', async () => {
        await setup({ annualLeaveDraft: { id: 'half-request', name: 'Harry Barnes', dates: ['2026-12-21'], submitted: true, needsDayPart: true } });
        window.document.querySelector('[data-export="personal"]').click(); await flush();
        expect(downloads).toHaveLength(0);
        expect($('status').textContent).toContain('Choose AM or PM');
        const select = window.document.querySelector('#day-parts select');
        select.value = 'pm'; select.dispatchEvent(new window.Event('input', { bubbles: true }));
        window.document.querySelector('[data-export="personal"]').click(); await flush();
        expect(await downloads[0].text()).toContain('DTSTART:20261221T140000Z\r\nDTEND:20261221T173000Z');
        expect(store.annualLeaveDraft.dayParts['2026-12-21']).toBe('pm');
        expect($('download-checklist').hidden).toBe(false);
    });
    test('lets a personal-only user export mixed days without work invite details', async () => {
        await setup(); fill(); $('organizer').value = ''; $('recipients').value = '';
        const select = window.document.querySelector('[data-date="2026-12-23"]');
        select.value = 'am'; select.dispatchEvent(new window.Event('input', { bubbles: true }));
        window.document.querySelector('[data-export="personal"]').click(); await flush();
        const file = await downloads[0].text();
        expect(file).toContain('DTSTART;VALUE=DATE:20261221');
        expect(file).toContain('DTSTART:20261223T090000Z\r\nDTEND:20261223T130000Z');
        expect(file).not.toContain('ATTENDEE');
    });
});

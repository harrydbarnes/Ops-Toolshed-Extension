const api = require('../annual-leave-calendar');
const settings = { ...api.DEFAULTS, name: 'Harry Barnes', organizer: 'harry@example.com', recipients: 'one@example.com; TWO@example.com\none@example.com' };
const draft = { id: 'request-123', dates: ['2026-12-21', '2026-12-22', '2026-12-24'] };
const now = new Date('2026-10-26T10:00:00Z');
const unfold = text => text.replace(/\r\n /g, '');

describe('Annual Leave calendar exports', () => {
    test('reads real submitted request cards with gaps and rejects partial or cancelled leave', () => {
        expect(api.submittedDates('Fri, 27 Nov 2026\nMon, 30 Nov 2026\nUK GroupM Annual Leave\nTotal 2 Days\nSubmitted')).toEqual(['2026-11-27', '2026-11-30']);
        expect(api.submittedDates('Mon, 14 Dec 2026 – Tue, 15 Dec 2026\nUK GroupM Annual Leave\nTotal 2 Days\nSubmitted')).toEqual(['2026-12-14', '2026-12-15']);
        expect(api.submittedDates('Wed, 23 Sept 2026 – Fri, 25 Sept 2026\nUK GroupM Annual Leave\nTotal 3 Days\nSubmitted')).toEqual(['2026-09-23', '2026-09-24', '2026-09-25']);
        expect(api.submittedDates('Mon, 14 Dec 2026\nUK GroupM Annual Leave\nTotal 0.5 Days\nSubmitted')).toBeNull();
        expect(api.submittedDates('Mon, 14 Dec 2026\nUK GroupM Annual Leave\nTotal 1 Day\nCancelled')).toBeNull();
        expect(api.submittedDates('Fri, 27 Nov 2026 – Mon, 30 Nov 2026\nUK GroupM Annual Leave\nTotal 2 Days\nSubmitted')).toBeNull();
    });
    test('preserves gaps and uses an exclusive, date-only end without timezone shifts', () => {
        const file = api.calendar(draft, settings, 'personal', now);
        expect(file.match(/BEGIN:VEVENT/g)).toHaveLength(2);
        expect(file).toContain('DTSTART;VALUE=DATE:20261221\r\nDTEND;VALUE=DATE:20261223');
        expect(file).toContain('DTSTART;VALUE=DATE:20261224\r\nDTEND;VALUE=DATE:20261225');
        expect(file).not.toMatch(/TZID|VALARM|ATTENDEE|ORGANIZER/);
        expect(file).toContain('TRANSP:TRANSPARENT');
        expect(file).toContain('X-MICROSOFT-CDO-BUSYSTATUS:FREE');
    });
    test('Outlook blocker is Busy and has no recipients or organizer', () => {
        const file = api.calendar(draft, settings, 'busy', now);
        expect(file).toContain('TRANSP:OPAQUE');
        expect(file).toContain('X-MICROSOFT-CDO-BUSYSTATUS:BUSY');
        expect(file).not.toMatch(/ATTENDEE|ORGANIZER/);
    });
    test('team meeting is Free with saved title, organizer and deduplicated invitees', () => {
        const file = unfold(api.calendar(draft, settings, 'team', now));
        expect(file).toContain('METHOD:REQUEST');
        expect(file).toContain('SUMMARY:Harry - AL');
        expect(file).toContain('ORGANIZER:mailto:harry@example.com');
        expect(file.match(/mailto:one@example.com/g)).toHaveLength(2);
        expect(file).toContain('RSVP=FALSE:mailto:two@example.com');
        expect(file).toContain('TRANSP:TRANSPARENT');
    });
    test('rejects invalid dates, injected addresses and invalid request identifiers', () => {
        expect(() => api.normalizeDates(['2026-02-30'])).toThrow();
        expect(() => api.normalizeDates(['2026-13-01'])).toThrow();
        expect(() => api.normalizeDates([])).toThrow();
        expect(() => api.emails('x@example.com\r\nATTENDEE:mailto:evil@example.com')).toThrow();
        expect(() => api.calendar({ ...draft, id: 'x\r\nSTATUS:CANCELLED' }, settings, 'personal')).toThrow();
        expect(() => api.calendar(draft, { ...settings, recipients: '' }, 'team')).toThrow();
    });
    test('escapes titles and folds UTF-8 lines at 75 octets with CRLF endings', () => {
        const file = api.calendar(draft, { ...settings, personalTitle: 'é'.repeat(90) + ',A;B\\C' }, 'personal', now);
        expect(unfold(file)).toContain(`SUMMARY:${'é'.repeat(90)}\\,A\\;B\\\\C`);
        file.split('\r\n').forEach(line => expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75));
        expect(file.replaceAll('\r\n', '')).not.toMatch(/[\r\n]/);
    });
    test('handles leap dates, year boundaries and DST without adding missing days', () => {
        expect(api.nextDate('2028-02-28')).toBe('2028-02-29');
        expect(api.nextDate('2026-12-31')).toBe('2027-01-01');
        const file = api.calendar({ ...draft, dates: ['2026-10-24', '2026-10-25', '2026-10-26'] }, settings, 'personal', now);
        expect(file).toContain('DTSTART;VALUE=DATE:20261024\r\nDTEND;VALUE=DATE:20261027');
    });
    test('keeps stable UIDs per request, separate per calendar purpose', () => {
        const uid = kind => api.calendar(draft, settings, kind, now).match(/^UID:(.+)$/m)[1];
        expect(uid('personal')).toBe(uid('personal'));
        expect(uid('personal')).not.toBe(uid('busy'));
    });
    test('parses live Workday labels and makes an exact-date personal prompt', () => {
        expect(api.parseDateLabel('selected Tuesday, 27 October 2026')).toBe('2026-10-27');
        expect(api.parseDateLabel('Friday, 9 October 2026 Submitted | UK GroupM Annual Leave')).toBe('2026-10-09');
        expect(api.parseDateLabel('30 February 2026')).toBeNull();
        const prompt = api.prompt(draft, settings);
        expect(prompt).toContain('2026-12-21 through 2026-12-22 inclusive (all day); 2026-12-24');
        expect(prompt).toContain('Free/available (transparent)');
        expect(prompt).toContain('Do not invite anyone');
    });
    test('exports mixed UK half days with daylight saving offsets and distinct availability', () => {
        const mixed = { ...draft, dates: ['2026-03-29', '2026-10-25', '2026-12-21', '2026-12-22'], dayParts: { '2026-03-29': 'pm', '2026-10-25': 'am', '2026-12-21': 'am' } };
        const personal = api.calendar(mixed, settings, 'personal', now);
        expect(personal).toContain('DTSTART:20260329T130000Z\r\nDTEND:20260329T163000Z');
        expect(personal).toContain('DTSTART:20261025T090000Z\r\nDTEND:20261025T130000Z');
        expect(personal).toContain('DTSTART:20261221T090000Z\r\nDTEND:20261221T130000Z');
        expect(personal).toContain('DTSTART;VALUE=DATE:20261222\r\nDTEND;VALUE=DATE:20261223');
        expect(personal.match(/BEGIN:VEVENT/g)).toHaveLength(4);
        expect(personal).toContain('X-MICROSOFT-CDO-ALLDAYEVENT:FALSE');
        expect(personal).toContain('TRANSP:TRANSPARENT');
        expect(api.calendar(mixed, settings, 'busy', now)).toContain('TRANSP:OPAQUE');
        expect(api.prompt(mixed, settings)).toContain('2:00pm–5:30pm UK time');
        expect(() => api.periods(mixed.dates, { '2026-12-21': 'unknown' })).toThrow();
    });
});

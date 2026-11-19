/* Shared by the extension page and the isolated Workday content script. */
(function (root) {
    'use strict';
    const DEFAULTS = Object.freeze({ name: '', teamTitle: '{firstName} - AL', busyTitle: 'Annual Leave', personalTitle: 'Annual Leave', recipients: '', organizer: '' });
    const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    function validDate(value) {
        if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
        const date = new Date(`${value}T00:00:00Z`);
        return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }
    function normalizeDates(dates) {
        if (!Array.isArray(dates) || !dates.length || dates.length > 366 || dates.some(date => !validDate(date))) {
            throw new Error('Choose between 1 and 366 valid leave dates.');
        }
        return [...new Set(dates)].sort();
    }
    function nextDate(value) {
        const date = new Date(`${value}T00:00:00Z`);
        date.setUTCDate(date.getUTCDate() + 1);
        return date.toISOString().slice(0, 10);
    }
    function ranges(dates) {
        const result = [];
        normalizeDates(dates).forEach(date => {
            const last = result[result.length - 1];
            if (last && nextDate(last.end) === date) last.end = date;
            else result.push({ start: date, end: date });
        });
        return result;
    }
    function periods(dates, dayParts = {}) {
        const result = [];
        for (const date of normalizeDates(dates)) {
            const part = dayParts[date] || 'full';
            if (!['full', 'am', 'pm'].includes(part)) throw new Error('Choose full day, AM or PM for each date.');
            const last = result[result.length - 1];
            if (part === 'full' && last?.part === 'full' && nextDate(last.end) === date) last.end = date;
            else result.push({ start: date, end: date, part });
        }
        return result;
    }
    function timeDescription(part) {
        return part === 'am' ? '9:00am–1:00pm UK time' : part === 'pm' ? '2:00pm–5:30pm UK time' : 'All day';
    }
    // Determine UK daylight-saving offset on the selected date; all requested times are after the clock change.
    function ukUtc(date, hour, minute = 0) {
        const [year, month, day] = date.split('-').map(Number);
        const label = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', timeZoneName: 'shortOffset' })
            .formatToParts(new Date(Date.UTC(year, month - 1, day, 12))).find(part => part.type === 'timeZoneName')?.value;
        const match = label?.match(/^GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?$/);
        if (!match) throw new Error('Could not determine the UK time zone for this date.');
        const offset = match[1] ? (match[1] === '+' ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3] || 0)) : 0;
        return new Date(Date.UTC(year, month - 1, day, hour, minute - offset)).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    }
    function parseDateLabel(label) {
        const match = String(label || '').match(/\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/i);
        if (!match) return null;
        const value = `${match[3]}-${String(MONTHS.indexOf(match[2].toLowerCase()) + 1).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
        return validDate(value) ? value : null;
    }
    function emails(value) {
        const result = [...new Set(String(value || '').split(/[;,\s]+/).filter(Boolean).map(email => email.toLowerCase()))];
        if (result.length > 100 || result.some(email => !/^[a-z0-9.!#$%&'*+\-/=?^_`{|}~]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(email))) {
            throw new Error('Enter valid email addresses separated by commas, semicolons or new lines (up to 100).');
        }
        return result;
    }
    // Manage Absence renders each request as newline-separated date blocks, type, total and status.
    function submittedDates(text) {
        const lines = String(text).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        const type = lines.findIndex(line => /Annual Leave$/i.test(line));
        if (type < 1 || !lines.some(line => /^(Submitted|Approved)$/i.test(line))) return null;
        const total = lines.join('\n').match(/(?:^|\n)Total (\d+) Days?(?:\n|$)/i);
        if (!total) return null;
        const dates = [];
        function parse(value) {
            const match = value.trim().match(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d{1,2}) ([A-Za-z]{3,4}) (20\d{2})$/);
            if (!match) return null;
            const month = MONTHS.findIndex(name => name.startsWith(match[2].toLowerCase()));
            const date = `${match[3]}-${String(month + 1).padStart(2, '0')}-${match[1].padStart(2, '0')}`;
            return month >= 0 && validDate(date) ? date : null;
        }
        for (const line of lines.slice(0, type)) {
            const parts = line.split(/\s+[–—-]\s+/);
            if (parts.length > 2) return null;
            const start = parse(parts[0]), end = parts[1] ? parse(parts[1]) : start;
            if (!start || !end || end < start) return null;
            for (let date = start; date <= end; date = nextDate(date)) {
                if (dates.length >= 366) return null;
                dates.push(date);
            }
        }
        // Never guess working days inside a range or turn fractional days into all-day leave.
        return dates.length === Number(total[1]) ? normalizeDates(dates) : null;
    }
    function title(template, name) {
        return String(template).replaceAll('{firstName}', name.trim().split(/\s+/)[0] || '').replaceAll('{name}', name.trim());
    }
    function escapeText(value) {
        return String(value).replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
    }
    // RFC 5545 folds at 75 UTF-8 octets, never in the middle of a code point.
    function fold(line) {
        let result = '', current = '', length = 0;
        for (const char of line) {
            const size = new TextEncoder().encode(char).length;
            if (length + size > 75) { result += `${current}\r\n`; current = ' '; length = 1; }
            current += char; length += size;
        }
        return result + current;
    }
    function validateSettings(settings) {
        const config = { ...DEFAULTS, ...settings };
        for (const key of ['name', 'teamTitle', 'busyTitle', 'personalTitle']) {
            if (typeof config[key] !== 'string' || !config[key].trim() || config[key].length > 200 || /[\r\n\x00-\x1f]/.test(config[key])) {
                throw new Error('Enter your name and a title for each calendar entry (up to 200 characters).');
            }
        }
        emails(config.recipients);
        if (config.organizer && emails(config.organizer).length !== 1) throw new Error('Enter one work email address.');
        return config;
    }
    function calendar(draft, settings, kind, now = new Date()) {
        if (!['team', 'busy', 'personal'].includes(kind)) throw new Error('Unknown calendar type.');
        const config = validateSettings(settings);
        if (!/^[a-z0-9-]{1,80}$/i.test(draft.id)) throw new Error('Invalid calendar request ID.');
        const invitees = kind === 'team' ? emails(config.recipients) : [];
        const organizers = emails(config.organizer);
        if (kind === 'team' && (!invitees.length || organizers.length !== 1)) throw new Error('Enter your work email and at least one invitee for the Outlook team invite.');
        const free = kind !== 'busy';
        const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ops Toolshed//Annual Leave//EN', 'CALSCALE:GREGORIAN', `METHOD:${kind === 'team' ? 'REQUEST' : 'PUBLISH'}`];
        periods(draft.dates, draft.dayParts).forEach(range => {
            const compact = value => value.replaceAll('-', '');
            lines.push('BEGIN:VEVENT', `UID:${draft.id}-${kind}-${compact(range.start)}@ops-toolshed.local`,
                `DTSTAMP:${now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`, 'SEQUENCE:0');
            if (range.part === 'full') lines.push(`DTSTART;VALUE=DATE:${compact(range.start)}`, `DTEND;VALUE=DATE:${compact(nextDate(range.end))}`);
            else lines.push(`DTSTART:${ukUtc(range.start, range.part === 'am' ? 9 : 14)}`, `DTEND:${ukUtc(range.start, range.part === 'am' ? 13 : 17, range.part === 'am' ? 0 : 30)}`);
            lines.push(
                `SUMMARY:${escapeText(title(config[`${kind}Title`], config.name))}`,
                `TRANSP:${free ? 'TRANSPARENT' : 'OPAQUE'}`, `X-MICROSOFT-CDO-BUSYSTATUS:${free ? 'FREE' : 'BUSY'}`,
                `X-MICROSOFT-CDO-ALLDAYEVENT:${range.part === 'full' ? 'TRUE' : 'FALSE'}`, 'STATUS:CONFIRMED');
            if (kind === 'team') {
                lines.push(`ORGANIZER:mailto:${organizers[0]}`);
                invitees.forEach(email => lines.push(`ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;RSVP=FALSE:mailto:${email}`));
                lines.push('DESCRIPTION:Annual leave notification. Please keep this event set to Free.');
            }
            lines.push('END:VEVENT');
        });
        lines.push('END:VCALENDAR');
        return lines.map(fold).join('\r\n') + '\r\n';
    }
    function prompt(draft, settings) {
        const config = validateSettings(settings);
        const dates = periods(draft.dates, draft.dayParts).map(range => `${range.start === range.end ? range.start : `${range.start} through ${range.end} inclusive`}${range.part === 'full' ? ' (all day)' : ` (${timeDescription(range.part)})`}`).join('; ');
        return `Add "${title(config.personalTitle, config.name)}" to my personal calendar on these dates: ${dates}. Use the specified all-day or UK local times, preserving any gaps. Mark every event as Free/available (transparent), so it does not block my availability. Do not invite anyone or add reminders. These are confirmed annual leave dates; no approval check is needed.`;
    }
    // Store files without compression so the archive works offline and needs no bundled library.
    function zip(files) {
        const encoder = new TextEncoder();
        const parts = [], directory = [];
        let offset = 0;
        function header(size) { const bytes = new Uint8Array(size); return { bytes, view: new DataView(bytes.buffer) }; }
        function crc32(bytes) {
            let crc = 0xffffffff;
            for (const byte of bytes) {
                crc ^= byte;
                for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
            }
            return (crc ^ 0xffffffff) >>> 0;
        }
        for (const file of files) {
            const name = encoder.encode(file.name), data = encoder.encode(file.content), crc = crc32(data);
            const local = header(30), l = local.view;
            l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x800, true);
            l.setUint16(12, 33, true); l.setUint32(14, crc, true); l.setUint32(18, data.length, true);
            l.setUint32(22, data.length, true); l.setUint16(26, name.length, true);
            parts.push(local.bytes, name, data);
            const central = header(46), c = central.view;
            c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true);
            c.setUint16(8, 0x800, true); c.setUint16(14, 33, true); c.setUint32(16, crc, true);
            c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
            c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
            directory.push(central.bytes, name);
            offset += local.bytes.length + name.length + data.length;
        }
        const directorySize = directory.reduce((sum, part) => sum + part.length, 0);
        const end = header(22), e = end.view;
        e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
        e.setUint32(12, directorySize, true); e.setUint32(16, offset, true);
        return new Blob([...parts, ...directory, end.bytes], { type: 'application/zip' });
    }
    function bundle(draft, settings, now = new Date()) {
        const dates = normalizeDates(draft.dates), files = [];
        for (const block of periods(dates, draft.dayParts)) {
            const selected = dates.filter(date => date >= block.start && date <= block.end);
            for (const kind of ['team', 'busy']) files.push({
                name: `outlook-${kind}-${block.start}.ics`,
                content: calendar({ ...draft, dates: selected }, settings, kind, now)
            });
        }
        files.push({ name: 'personal-calendar.ics', content: calendar({ ...draft, dates }, settings, 'personal', now) });
        files.push({ name: 'START-HERE.txt', content: 'Annual Leave calendar files\r\n\r\nExtract this ZIP first. Open each outlook-team file in your work Outlook account; check the invitees and Free status, then send. If it opens as a received invitation, use Copy Outlook details in the helper to create and send your own event. Open each outlook-busy file and save it to your calendar as Busy. Import personal-calendar.ics into Apple Calendar or Google Calendar and check it is Free.\r\n\r\nDownloading does not create events or send invitations. Check your Workday request was submitted before adding calendar entries. Reimporting may create duplicates. Update or remove calendar events yourself if your leave changes.\r\n' });
        return zip(files);
    }
    function workBrief(draft, settings) {
        const config = validateSettings(settings);
        const blocks = periods(draft.dates, draft.dayParts);
        if (blocks.length !== 1) throw new Error('Choose one Outlook date block.');
        const block = blocks[0];
        return `Create a new event in my work Outlook calendar.\nTitle: ${title(config.teamTitle, config.name)}\nDates: ${block.start}${block.end === block.start ? '' : ` through ${block.end} inclusive`}\nTime: ${timeDescription(block.part)}\nShow as: Free\nInvitees: ${emails(config.recipients).join('; ')}\nOrganizer: ${config.organizer}\nReview the details before sending. Add a separate Busy appointment for the same dates and time, with no invitees, titled "${title(config.busyTitle, config.name)}".`;
    }
    const api = { DEFAULTS, validDate, normalizeDates, nextDate, ranges, periods, timeDescription, parseDateLabel, submittedDates, emails, title, validateSettings, calendar, bundle, prompt, workBrief };
    root.AnnualLeaveCalendar = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

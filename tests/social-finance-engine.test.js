const { parseCsv, aggregateMeta, compare, reportToCsv, nameSimilarity } = require('../social-finance-engine');

const metaCsv = `Account name,Campaign name,Campaign ID,Month,Amount spent (GBP),Campaign budget,Delivery,Ad set start,Ad set end\nBoots,Matched campaign,120000000000000001,2026-06-01,100,100,Active,2026-06-01,2026-06-30\nBoots,Missing campaign,120000000000000002,2026-06-01,50,75,Active,2026-06-01,2026-06-30\nBoots,Wrong month,120000000000000003,2026-06-01,20,20,Active,2026-06-01,2026-06-30\nBoots,Budget exposure,120000000000000004,2026-06-01,80,120,Active,2026-06-01,2026-06-30\nBoots,Date exposure,120000000000000005,2026-06-01,60,60,Active,2026-05-29,2026-07-02\nBoots,Named unlinked campaign,120000000000000006,2026-06-01,40,40,Active,2026-06-01,2026-06-30`;

const prismaCsv = `Client name,Partner line id,Period,PLANNED_AMOUNT,Campaign name,Partner,Integrated status,Placement creator,Placement start date,Placement end date\nBoots,120000000000000001,Jun 2026,100,Matched campaign,Facebook,Integrated,Alice,2026-06-01,2026-06-30\nBoots,120000000000000003,May 2026,20,Wrong month,Facebook,Integrated,Bob,2026-05-01,2026-05-31\nBoots,120000000000000004,Jun 2026,90,Budget exposure,Facebook,Integrated,Chris,2026-06-01,2026-06-30\nBoots,120000000000000005,Jun 2026,60,Date exposure,Facebook,Integrated,Dana,2026-06-01,2026-06-30\nBoots,,Jun 2026,40,Named unlinked campaign,Facebook,Not integrated,Erin,2026-06-01,2026-06-30`;

describe('social finance comparison engine', () => {
    test('preserves quoted fields and 18-digit identifiers as text', () => {
        const parsed = parseCsv('Campaign ID,Campaign name\n120000000000000001,"Boots, Summer"');
        expect(parsed.rows[0]['Campaign ID']).toBe('120000000000000001');
        expect(parsed.rows[0]['Campaign name']).toBe('Boots, Summer');
    });

    test('aggregates duplicate Meta rows without converting IDs to numbers', () => {
        const parsed = parseCsv('Campaign ID,Month,Amount spent (GBP)\n120000000000000001,2026-06-01,10\n120000000000000001,2026-06-01,15');
        const output = aggregateMeta(parsed);
        expect(output.records).toHaveLength(1);
        expect(output.records[0].campaignId).toBe('120000000000000001');
        expect(output.records[0].spend).toBe(25);
    });

    test('classifies exact matches, missing links, month, budget, date and likely-unlinked cases', () => {
        const report = compare(parseCsv(metaCsv), parseCsv(prismaCsv), { asOfDate: '2026-07-13', tolerance: 1, closedWorkingDay: 5, populationConfirmed: true });
        const byId = id => report.rows.find(row => row.campaignId === id);
        expect(byId('120000000000000001').classification).toBe('Matched – booking evidence valid');
        expect(byId('120000000000000002').classification).toBe('Missing from Prisma – spending');
        expect(byId('120000000000000003').classification).toBe('Date/month update needed – ID booked in another month');
        expect(byId('120000000000000004').classification).toBe('Budget update needed – platform budget exceeds Prisma');
        expect(byId('120000000000000005').classification).toBe('Date update needed – Meta extends outside Prisma');
        expect(byId('120000000000000006').classification).toBe('Likely booked but unlinked – add Partner line ID');
        expect(report.summary.missingOrUnlinked).toBe(1);
        expect(report.validationErrors).toEqual([]);
    });

    test('labels unavailable date and delivery evidence without inventing it', () => {
        const report = compare(
            parseCsv('Campaign ID,Month,Amount spent (GBP)\n1,2026-06-01,0'),
            parseCsv('Partner line id,Period,PLANNED_AMOUNT\n1,Jun 2026,0'),
            { asOfDate: '2026-06-15' }
        );
        expect(report.warnings).toContain('Meta schedule dates are unavailable; month coverage is checked instead.');
        expect(report.warnings).toContain('Prisma booked start/end dates are unavailable; exact-day comparison cannot be completed.');
        expect(report.warnings).toContain('Meta delivery status is unavailable; £0 rows cannot be distinguished reliably as scheduled or inactive.');
        expect(report.warnings).toContain('Population completeness is not confirmed; missing rows prove no linked booking was found, not that no Prisma booking exists anywhere.');
    });

    test('does not overstate missing bookings until source population is confirmed', () => {
        const report = compare(
            parseCsv('Campaign ID,Month,Amount spent (GBP)\n1,2026-06-01,10'),
            parseCsv('Partner line id,Period,PLANNED_AMOUNT\n2,Jun 2026,10'),
            { asOfDate: '2026-07-13' }
        );
        expect(report.rows.find(row => row.campaignId === '1').classification).toBe('No linked Prisma booking found – spending');
    });

    test('restricts the comparison to selected Meta accounts', () => {
        const report = compare(
            parseCsv('Account name,Campaign ID,Month,Amount spent (GBP)\nBoots,1,2026-06-01,10\nOther,2,2026-06-01,500'),
            parseCsv('Client name,Partner line id,Period,PLANNED_AMOUNT\nBoots,1,Jun 2026,10'),
            { asOfDate: '2026-07-13', accountScope: ['Boots'], populationConfirmed: true }
        );
        expect(report.rows.some(row => row.campaignId === '2')).toBe(false);
        expect(report.summary.metaSpend).toBe(10);
        expect(report.sourceAccounts).toEqual(['Boots', 'Other']);
    });

    test('rejects exports without authoritative join fields', () => {
        const report = compare(parseCsv('Campaign name,Spend\nA,1'), parseCsv('Period,PLANNED_AMOUNT\nJun 2026,1'));
        expect(report.validationErrors).toEqual(expect.arrayContaining([
            'Meta export is missing Campaign ID.',
            'Prisma export is missing Partner line id.'
        ]));
    });

    test('exports findings to CSV and escapes investigation text', () => {
        const csv = reportToCsv([{ campaignId: '1', month: '2026-06', account: 'Boots', campaignName: '=HYPERLINK("https://example.test")', status: '', metaSpend: 1, metaBudget: 2, prismaPlanned: 1, variance: 0, metaStart: '', metaEnd: '', prismaStart: '', prismaEnd: '', classification: 'Matched', evidence: 'Matched', issues: ['one', 'two'], owner: 'Ops' }]);
        expect(csv).toContain('"\'=HYPERLINK(""https://example.test"")"');
        expect(csv).toContain('one; two');
    });

    test('uses token overlap for investigation candidates', () => {
        expect(nameSimilarity('Boots Summer Advantage+ Conversions', 'Boots Summer Conversions')).toBeGreaterThan(0.7);
        expect(nameSimilarity('Boots Summer', 'Unrelated Winter')).toBeLessThan(0.3);
    });
});

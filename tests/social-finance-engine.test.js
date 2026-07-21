const { parseCsv, aggregateMeta, extractMetaReferenceData, compare, reportToCsv, nameSimilarity } = require('../social-finance-engine');

const metaCsv = `Account name,Account ID,Campaign name,Campaign ID,Month,Amount spent (GBP),Campaign budget,Campaign budget type,Delivery,Ad set start,Ad set end\nBoots,999,Matched campaign,120000000000000001,2026-06-01,100,100,Lifetime,Active,2026-06-01,2026-06-30\nBoots,999,Missing campaign,120000000000000002,2026-06-01,50,75,Lifetime,Active,2026-06-01,2026-06-30\nBoots,999,Wrong month,120000000000000003,2026-06-01,20,20,Lifetime,Active,2026-06-01,2026-06-30\nBoots,999,Spend exposure,120000000000000004,2026-06-01,100,120,Lifetime,Active,2026-06-01,2026-06-30\nBoots,999,Date exposure,120000000000000005,2026-06-01,60,60,Lifetime,Active,2026-05-29,2026-07-02\nBoots,999,Named unlinked campaign,120000000000000006,2026-06-01,40,40,Lifetime,Active,2026-06-01,2026-06-30`;

const prismaCsv = `Client name,Partner account id,Partner line id,Period,PLANNED_AMOUNT,Campaign name,Partner,Integrated status,Placement creator,Days in Flight start date,Days in Flight end date\nBoots,999,120000000000000001,Jun 2026,100,Matched campaign,Facebook,Integrated,Alice,6/1/26,6/30/26\nBoots,999,120000000000000003,May 2026,20,Wrong month,Facebook,Integrated,Bob,5/1/26,5/31/26\nBoots,999,120000000000000004,Jun 2026,90,Spend exposure,Facebook,Integrated,Chris,6/1/26,6/30/26\nBoots,999,120000000000000005,Jun 2026,60,Date exposure,Facebook,Integrated,Dana,6/1/26,6/30/26\nBoots,999,,Jun 2026,40,Named unlinked campaign,Facebook,Not integrated,Erin,6/1/26,6/30/26`;

describe('social finance comparison engine', () => {
    test('preserves quoted fields and 18-digit identifiers as text', () => {
        const parsed = parseCsv('Campaign ID,Campaign name\n120000000000000001,"Boots, Summer"');
        expect(parsed.rows[0]['Campaign ID']).toBe('120000000000000001');
        expect(parsed.rows[0]['Campaign name']).toBe('Boots, Summer');
    });

    test('aggregates duplicate Meta rows without converting IDs to numbers', () => {
        const parsed = parseCsv('Account ID,Campaign ID,Month,Amount spent (GBP)\n999,120000000000000001,2026-06-01,10\n999,120000000000000001,2026-06-01,15');
        const output = aggregateMeta(parsed);
        expect(output.records).toHaveLength(1);
        expect(output.records[0].campaignId).toBe('120000000000000001');
        expect(output.records[0].spend).toBe(25);
    });

    test('extracts and deduplicates the account, campaign, and ad set reference hierarchy', () => {
        const reference = extractMetaReferenceData(parseCsv(
            'Account ID,Account name,Campaign ID,Campaign name,Ad Set ID,Ad Set name\n111,Boots,9,Summer,a,Prospecting\n111,Boots,9,Summer,a,Prospecting'
        ));
        expect(reference.errors).toEqual([]);
        expect(reference.accounts).toEqual([{ id: '111', name: 'Boots', lastSynced: '' }]);
        expect(reference.campaigns).toEqual([{ id: '9', name: 'Summer', accountId: '111' }]);
        expect(reference.adSets).toEqual([{ id: 'a', name: 'Prospecting', campaignId: '9' }]);
    });

    test('classifies exact matches, missing links, month, budget, date and likely-unlinked cases', () => {
        const report = compare(parseCsv(metaCsv), parseCsv(prismaCsv), { asOfDate: '2026-07-13', tolerance: 1, closedWorkingDay: 5, populationConfirmed: true });
        const byId = id => report.rows.find(row => row.campaignId === id);
        expect(byId('120000000000000001').classification).toBe('Matched: booking evidence valid');
        expect(byId('120000000000000002').classification).toBe('Missing from Prisma: spending');
        expect(byId('120000000000000003').classification).toBe('Month update needed: Campaign ID is booked in another month');
        expect(byId('120000000000000004').classification).toBe('Spend update needed: Meta spend exceeds Prisma booking');
        expect(byId('120000000000000005').classification).toBe('Date update needed: Meta extends outside Prisma');
        expect(byId('120000000000000006').classification).toBe('Likely booked but unlinked: add Partner line ID');
        expect(report.summary.missingOrUnlinked).toBe(1);
        expect(report.validationErrors).toEqual([]);
    });

    test('does not compare a lifetime Meta budget with one Prisma month', () => {
        const report = compare(
            parseCsv('Account name,Account ID,Campaign ID,Month,Amount spent (GBP),Campaign budget,Campaign budget type\nExample,999,1,2026-06-01,2966.93,24716.95,Lifetime'),
            parseCsv('Client name,Partner account id,Partner line id,Period,PLANNED_AMOUNT\nExample,999,1,Jun 26,2966.93'),
            { asOfDate: '2026-07-20', populationConfirmed: true }
        );
        expect(report.rows[0].classification).toBe('Matched: booking evidence valid');
        expect(report.rows[0].issues.join(' ')).not.toContain('21750.02');
    });

    test('maps account IDs and parses Prisma Days in Flight dates as month/day/year', () => {
        const report = compare(
            parseCsv('Account name,Account ID,Campaign ID,Month,Amount spent (GBP),Ad set start,Ad set end\nExample,999,1,2026-05-01,10,2026-05-01,2026-08-31'),
            parseCsv('Client name,Partner account id,Partner line id,Period,PLANNED_AMOUNT,Days in Flight start date,Days in Flight end date\nExample,999,1,May 26,10,5/1/26,8/31/26'),
            { asOfDate: '2026-05-15', populationConfirmed: true }
        );
        expect(report.rows[0].accountId).toBe('999');
        expect(report.rows[0].prismaStart).toBe('2026-05-01');
        expect(report.rows[0].prismaEnd).toBe('2026-08-31');
        expect(report.rows[0].classification).toBe('Matched: booking evidence valid');
    });

    test('does not match identical campaign IDs across different accounts', () => {
        const report = compare(
            parseCsv('Account name,Account ID,Campaign ID,Month,Amount spent (GBP)\nExample,111,1,2026-06-01,10'),
            parseCsv('Client name,Partner account id,Partner line id,Period,PLANNED_AMOUNT\nOther,222,1,Jun 26,10'),
            { asOfDate: '2026-07-20', populationConfirmed: true }
        );
        expect(report.rows.find(row => row.accountId === '111').classification).toContain('Account ID mismatch');
    });

    test('still detects an account mismatch when a Meta account scope is selected', () => {
        const report = compare(
            parseCsv('Account name,Account ID,Campaign ID,Month,Amount spent (GBP)\nExample,111,1,2026-06-01,10'),
            parseCsv('Client name,Partner account id,Partner line id,Period,PLANNED_AMOUNT\nOther,222,1,Jun 26,10'),
            { asOfDate: '2026-07-20', accountIdScope: ['111'], populationConfirmed: true }
        );
        expect(report.rows).toHaveLength(1);
        expect(report.rows[0].classification).toContain('Account ID mismatch');
    });

    test('separates rows outside the other export reporting months from true investigations', () => {
        const report = compare(
            parseCsv('Account name,Account ID,Campaign ID,Month,Amount spent (GBP)\nExample,999,1,2026-06-01,10'),
            parseCsv('Client name,Partner account id,Partner line id,Period,PLANNED_AMOUNT\nExample,999,2,May 26,10'),
            { asOfDate: '2026-07-20', populationConfirmed: true }
        );
        expect(report.rows.find(row => row.month === '2026-05').evidence).toBe('Outside scope');
        expect(report.summary.outsideScope).toBe(2);
    });

    test('labels unavailable date and delivery evidence without inventing it', () => {
        const report = compare(
            parseCsv('Account ID,Campaign ID,Month,Amount spent (GBP)\n999,1,2026-06-01,0'),
            parseCsv('Partner account id,Partner line id,Period,PLANNED_AMOUNT\n999,1,Jun 2026,0'),
            { asOfDate: '2026-06-15' }
        );
        expect(report.warnings).toContain('Meta schedule dates are unavailable; month coverage is checked instead.');
        expect(report.warnings).toContain('Prisma booked start/end dates are unavailable; exact-day comparison cannot be completed.');
        expect(report.warnings).toContain('Meta delivery status is unavailable; £0 rows cannot be distinguished reliably as scheduled or inactive.');
        expect(report.warnings).toContain('Population completeness is not confirmed; missing rows prove no linked booking was found, not that no Prisma booking exists anywhere.');
    });

    test('does not overstate missing bookings until source population is confirmed', () => {
        const report = compare(
            parseCsv('Account ID,Campaign ID,Month,Amount spent (GBP)\n999,1,2026-06-01,10'),
            parseCsv('Partner account id,Partner line id,Period,PLANNED_AMOUNT\n999,2,Jun 2026,10'),
            { asOfDate: '2026-07-13' }
        );
        expect(report.rows.find(row => row.campaignId === '1').classification).toBe('No linked Prisma booking found: spending');
    });

    test('restricts the comparison to selected Meta accounts', () => {
        const report = compare(
            parseCsv('Account name,Account ID,Campaign ID,Month,Amount spent (GBP)\nBoots,111,1,2026-06-01,10\nOther,222,2,2026-06-01,500'),
            parseCsv('Client name,Partner account id,Partner line id,Period,PLANNED_AMOUNT\nBoots,111,1,Jun 2026,10\nOther,222,2,Jun 2026,500'),
            { asOfDate: '2026-07-13', accountIdScope: ['111'], populationConfirmed: true }
        );
        expect(report.rows.some(row => row.campaignId === '2')).toBe(false);
        expect(report.summary.metaSpend).toBe(10);
        expect(report.sourceAccounts).toEqual([{ id: '111', name: 'Boots' }, { id: '222', name: 'Other' }]);
    });

    test('rejects exports without authoritative join fields', () => {
        const report = compare(parseCsv('Campaign name,Spend\nA,1'), parseCsv('Period,PLANNED_AMOUNT\nJun 2026,1'));
        expect(report.validationErrors).toEqual(expect.arrayContaining([
            'Meta export is missing Campaign ID.',
            'Meta export is missing Account ID.',
            'Prisma export is missing Partner account id.',
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

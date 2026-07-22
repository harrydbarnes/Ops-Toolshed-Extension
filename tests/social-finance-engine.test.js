const { parseCsv, aggregateMeta, extractMetaReferenceData, extractPrismaReferenceData, compare, reportToCsv, nameSimilarity, findCandidates } = require('../social-finance-engine');

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

    test('extracts Prisma client account scope using Partner account id', () => {
        const reference = extractPrismaReferenceData(parseCsv(
            'Partner account id,Client name,Product name,Period\n111,Boots,Opticians,2026-06\n111,Boots,Opticians,2026-07\n222,No7,Skincare,2026-06'
        ));

        expect(reference.errors).toEqual([]);
        expect(reference.accounts).toEqual([
            { id: '111', clients: ['Boots'], rows: 2, months: ['2026-06-01', '2026-07-01'] },
            { id: '222', clients: ['No7'], rows: 1, months: ['2026-06-01'] }
        ]);
        expect(reference.clientProducts).toEqual([
            { client: 'Boots', product: 'Opticians', accountIds: ['111'] },
            { client: 'No7', product: 'Skincare', accountIds: ['222'] }
        ]);
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

    test('uses a local manual match to reconcile an otherwise unmatched campaign', () => {
        const report = compare(
            parseCsv('Account name,Account ID,Campaign name,Campaign ID,Month,Amount spent (GBP)\nExample,999,Meta campaign,1,2026-06-01,10'),
            parseCsv('Client name,Partner account id,Partner line id,Period,PLANNED_AMOUNT,Campaign name\nExample,999,2,Jun 2026,10,Prisma campaign'),
            { asOfDate: '2026-07-20', populationConfirmed: true, manualMatches: { '999|1|2026-06-01': '999|2|2026-06-01' } }
        );

        expect(report.rows).toHaveLength(1);
        expect(report.rows[0].classification).toBe('Matched manually: booking evidence valid');
        expect(report.rows[0].prismaKey).toBe('999|2|2026-06-01');
        expect(report.rows[0].issues).toContain('Manual match to Prisma Partner line ID 2');
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
        expect(report.warnings).toContain('Meta campaign dates are unavailable; month coverage is checked instead. Sync through the Meta API or include campaign start and end columns in the report.');
        expect(report.warnings).toContain('Prisma booked start/end dates are unavailable; exact-day comparison cannot be completed.');
        expect(report.warnings).toContain('Meta delivery status is unavailable; £0 rows cannot be distinguished reliably as scheduled or inactive.');
        expect(report.coverage).toEqual(expect.objectContaining({ isComplete: true, sharedMonths: ['2026-06'] }));
    });

    test('does not overstate missing bookings until source population is confirmed', () => {
        const report = compare(
            parseCsv('Account ID,Campaign ID,Month,Amount spent (GBP)\n999,1,2026-06-01,10'),
            parseCsv('Partner account id,Partner line id,Period,PLANNED_AMOUNT\n999,2,Jun 2026,10'),
            { asOfDate: '2026-07-13' }
        );
        expect(report.rows.find(row => row.campaignId === '1').classification).toBe('No linked Prisma booking found: spending');
        expect(report.coverage.isComplete).toBe(true);
    });

    test('keeps missing findings provisional where Prisma does not cover every selected Meta account-month', () => {
        const report = compare(
            parseCsv('Account ID,Campaign ID,Month,Amount spent\n111,1,2026-06,10\n222,2,2026-06,10'),
            parseCsv('Partner account id,Partner line id,Period,PLANNED_AMOUNT\n111,3,Jun 2026,10'),
            { populationConfirmed: true }
        );
        expect(report.coverage).toEqual(expect.objectContaining({ isComplete: false, gaps: [{ accountId: '222', month: '2026-06' }] }));
        expect(report.rows.find(row => row.campaignId === '2').classification).toBe('No linked Prisma booking found: spending');
        expect(report.warnings.join(' ')).toContain('Prisma report coverage is incomplete');
    });

    test('raises Prisma workflow review for a matched booking needing revision or integration', () => {
        const report = compare(
            parseCsv('Account ID,Campaign ID,Month,Amount spent\n111,1,2026-06,10'),
            parseCsv('Partner account id,Partner line id,Period,PLANNED_AMOUNT,Order current status,Integrated status,Delivery status\n111,1,Jun 2026,10,NeedsRevision,Not Integrated,Not Received'),
            { populationConfirmed: true }
        );
        expect(report.rows[0]).toEqual(expect.objectContaining({ evidence: 'Investigate', classification: 'Prisma workflow review needed' }));
        expect(report.rows[0].prismaWorkflowIssues).toEqual(expect.arrayContaining(['Prisma order status: NeedsRevision', 'Prisma integration status: Not Integrated']));
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

    test('exports current reconciliation fields to CSV and escapes investigation text', () => {
        const csv = reportToCsv([{ accountId: '999', campaignId: '1', month: '2026-06', account: 'Boots', campaignName: '=HYPERLINK("https://example.test")', status: 'Active', metaSpend: 1, metaBudget: 2, metaBudgetType: 'Lifetime', prismaClient: 'Boots', prismaProduct: 'Opticians', prismaPlanned: 1, variance: 0, metaStart: '', metaEnd: '', prismaStart: '', prismaEnd: '', prismaOrderStatus: 'NeedsRevision', prismaIntegratedStatus: 'Not Integrated', prismaDeliveryStatus: 'Not Received', prismaFlightStatus: 'Future', prismaPeriodStatus: 'NotYetStarted', classification: 'Prisma workflow review needed', evidence: 'Investigate', issues: ['one', 'two'], prismaWorkflowIssues: ['Prisma order status: NeedsRevision'], owner: 'Ops', candidateScore: 88 }]);
        expect(csv.split('\r\n')[0]).toContain('Prisma integration status');
        expect(csv.split('\r\n')[0]).toContain('Candidate match score');
        expect(csv).toContain('"\'=HYPERLINK(""https://example.test"")"');
        expect(csv).toContain('one; two');
        expect(csv).toContain('Prisma order status: NeedsRevision');
    });

    test('uses token overlap for investigation candidates', () => {
        expect(nameSimilarity('Boots Summer Advantage+ Conversions', 'Boots Summer Conversions')).toBeGreaterThan(0.7);
        expect(nameSimilarity('Boots Summer', 'Unrelated Winter')).toBeLessThan(0.3);
    });

    test('ranks explainable candidates and reduces amount influence for an open month', () => {
        const month = new Date(Date.UTC(2026, 6, 1));
        const meta = { accountId: '111', campaignName: 'Boots FY26 P07 Summer PO4204001234', month, spend: 20, start: null, end: null };
        const rows = [
            { key: '111|2|2026-07-01', accountId: '111', campaignId: '2', campaignName: 'Boots FY26 P07 Summer PO4204001234', month, planned: 100, client: 'Boots', product: 'Retail' },
            { key: '111|3|2026-07-01', accountId: '111', campaignId: '3', campaignName: 'Unrelated campaign', month, planned: 20, client: 'Boots', product: 'Retail' }
        ];
        const current = findCandidates(meta, rows, { monthClosed: false, mapping: { client: 'Boots', product: 'Retail' } });
        const closed = findCandidates(meta, rows, { monthClosed: true, mapping: { client: 'Boots', product: 'Retail' } });

        expect(current[0]).toEqual(expect.objectContaining({ prismaKey: '111|2|2026-07-01', level: 'Strong candidate' }));
        expect(current[0].weights.amount).toBe(0.05);
        expect(closed[0].weights.amount).toBe(0.30);
        expect(current[0].reasons.join(' ')).toContain('shared reference');
        expect(findCandidates(meta, rows, { monthClosed: false, mapping: { client: 'Boots', product: 'Retail' }, rejectedKeys: ['111|2|2026-07-01'] })[0].prismaKey).toBe('111|3|2026-07-01');
    });

    test('keeps already linked Prisma bookings out of the manual matching pool', () => {
        const report = compare(
            parseCsv('Account ID,Campaign ID,Month,Amount spent,Campaign name\n111,1,2026-06,10,Matched Meta\n111,2,2026-06,20,Missing Meta'),
            parseCsv('Partner account id,Partner line id,Period,PLANNED_AMOUNT,Campaign name\n111,1,Jun 2026,10,Already linked Prisma\n111,3,Jun 2026,20,Available Prisma'),
            { populationConfirmed: true }
        );
        const missing = report.rows.find(row => row.campaignId === '2');

        expect(missing.candidatePool.map(candidate => candidate.prismaKey)).toContain('111|3|2026-06-01');
        expect(missing.candidatePool.map(candidate => candidate.prismaKey)).not.toContain('111|1|2026-06-01');
    });

    test('recognises API campaign dates and calculates non-duplicated headline totals', () => {
        const report = compare(
            parseCsv('Account ID,Campaign ID,Month,Amount spent,Campaign budget,Campaign start,Campaign end,Delivery\n111,1,2026-06,40,250,2026-06-01,2026-07-31,ACTIVE\n111,1,2026-07,60,250,2026-06-01,2026-07-31,ACTIVE'),
            parseCsv('Partner account id,Partner line id,Period,PLANNED_AMOUNT\n111,1,Jun 2026,35\n111,1,Jul 2026,55')
        );
        expect(report.warnings.join(' ')).not.toContain('Meta campaign dates are unavailable');
        expect(report.warnings.join(' ')).not.toContain('Meta delivery status is unavailable');
        expect(report.summary).toEqual(expect.objectContaining({ metaBudget: 250, metaSpend: 100, prismaPlanned: 90, variance: 10 }));
    });
});

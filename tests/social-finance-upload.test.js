const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.resolve(__dirname, '../social-finance.html'), 'utf8');
const script = fs.readFileSync(path.resolve(__dirname, '../social-finance.js'), 'utf8');

function dropFile(window, dropZone, file) {
    const event = new window.Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { files: [file], types: ['Files'] } });
    dropZone.dispatchEvent(event);
}

describe('Social Booking Checker report uploads', () => {
    let dom;
    let document;

    beforeEach(async () => {
        dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://extension.test/social-finance.html' });
        document = dom.window.document;
        const stored = {};
        dom.window.chrome = {
            runtime: {},
            storage: { local: {
                get: (key, callback) => callback({ [key]: stored[key] }),
                set: (value, callback) => { Object.assign(stored, value); callback(); },
                remove: (key, callback) => { delete stored[key]; callback(); }
            } }
        };
        dom.window.metaReportApi = {
            createClient: jest.fn(() => ({
                syncAccount: jest.fn().mockResolvedValue({
                    campaigns: [{ id: '9', name: 'Summer' }], adSets: [],
                    records: [{ accountId: '111', accountName: 'Boots', campaignId: '9', campaignName: 'Summer', month: '2026-06', spend: 10 }]
                })
            })),
            resolveDateRange: jest.fn(() => ({ since: '2026-06-01', until: '2026-06-30' })),
            mergeReferenceData: jest.fn(reference => ({ ...reference, accounts: reference.accounts.map(account => ({ ...account, lastSynced: '2026-07-21' })) })),
            reportToMetaCsv: jest.fn(() => 'Account ID,Campaign ID,Month,Amount spent\n111,9,2026-06,10')
        };
        dom.window.socialFinanceEngine = {
            parseCsv: jest.fn(() => ({ headers: [], rows: [] })),
            aggregateMeta: jest.fn(() => ({ records: [] })),
            extractMetaReferenceData: jest.fn(() => ({
                accounts: [{ id: '111', name: 'Boots', lastSynced: '' }],
                campaigns: [{ id: '9', name: 'Summer', accountId: '111' }],
                adSets: [], errors: []
            }))
        };
        dom.window.eval(script);
        if (document.readyState === 'loading') {
            await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
        }
    });

    afterEach(() => dom.window.close());

    test('loads a dropped Meta CSV through the existing account-scope flow', async () => {
        const file = { name: 'meta-report.csv', size: 2048, type: 'text/csv', text: jest.fn().mockResolvedValue('Campaign ID,Amount spent\n123,10') };

        dropFile(dom.window, document.querySelector('#metaDropZone'), file);
        await new Promise(resolve => dom.window.setTimeout(resolve, 0));

        expect(file.text).toHaveBeenCalledTimes(1);
        expect(document.querySelector('#metaFileName').textContent).toBe('meta-report.csv, 2.0 KB');
        expect(document.querySelector('#metaDropZone').classList.contains('has-file')).toBe(true);
        expect(document.querySelector('#removeMetaFile').classList.contains('hidden')).toBe(false);
        expect(dom.window.socialFinanceEngine.extractMetaReferenceData).toHaveBeenCalled();

        document.querySelector('#removeMetaFile').click();

        expect(document.querySelector('#metaFileName').textContent).toBe('No file selected');
        expect(document.querySelector('#metaDropZone').classList.contains('has-file')).toBe(false);
        expect(document.querySelector('#removeMetaFile').classList.contains('hidden')).toBe(true);
    });

    test('rejects a dropped file that is not a CSV', async () => {
        const file = { name: 'prisma-report.xlsx', size: 1024, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', text: jest.fn() };

        dropFile(dom.window, document.querySelector('#prismaDropZone'), file);
        await new Promise(resolve => dom.window.setTimeout(resolve, 0));

        expect(file.text).not.toHaveBeenCalled();
        expect(document.querySelector('#validationMessages').textContent).toContain('Choose a CSV file for the Prisma booking report.');
    });

    test('restores and updates the previously selected Meta account IDs', async () => {
        dom.window.localStorage.setItem('socialBookingMetaAccountScope', JSON.stringify(['222']));
        dom.window.socialFinanceEngine.extractMetaReferenceData.mockReturnValue({
            accounts: [{ id: '111', name: 'Boots', lastSynced: '' }, { id: '222', name: 'Other', lastSynced: '' }],
            campaigns: [], adSets: [], errors: []
        });
        const file = { name: 'meta-report.csv', size: 1024, type: 'text/csv', text: jest.fn().mockResolvedValue('Account ID,Campaign ID,Month,Amount spent\n111,1,2026-06,10') };

        dropFile(dom.window, document.querySelector('#metaDropZone'), file);
        await new Promise(resolve => dom.window.setTimeout(resolve, 0));

        const account111 = document.querySelector('.account-option input[value="111"]');
        const account222 = document.querySelector('.account-option input[value="222"]');
        expect(account111.checked).toBe(false);
        expect(account222.checked).toBe(true);
        account111.checked = true;
        account111.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        expect(JSON.parse(dom.window.localStorage.getItem('socialBookingMetaAccountScope'))).toEqual(['111', '222']);
    });

    test('filters the analysis and summary to a selected month range', async () => {
        const rows = [
            { accountId: '111', campaignId: '1', month: '2026-05', account: 'Boots', campaignName: 'May campaign', evidence: 'Needs update', classification: 'Spend update needed', metaSpend: 10, prismaPlanned: 5, variance: 5, issues: [], owner: '' },
            { accountId: '111', campaignId: '2', month: '2026-06', account: 'Boots', campaignName: 'June campaign', evidence: 'Missing/unlinked', classification: 'Missing from Prisma: spending', metaSpend: 20, prismaPlanned: null, variance: 20, issues: [], owner: '' }
        ];
        dom.window.socialFinanceEngine.compare = jest.fn(() => ({ rows, summary: {}, warnings: [], validationErrors: [] }));
        dom.window.socialFinanceEngine.summarizeRows = jest.fn(filtered => ({
            total: filtered.length,
            missingOrUnlinked: filtered.filter(row => row.evidence === 'Missing/unlinked').length,
            needsUpdate: filtered.filter(row => row.evidence === 'Needs update').length,
            monitor: 0,
            investigate: 0,
            outsideScope: 0,
            unmatchedSpend: 0
        }));
        const meta = { name: 'meta.csv', size: 10, type: 'text/csv', text: jest.fn().mockResolvedValue('meta') };
        const prisma = { name: 'prisma.csv', size: 10, type: 'text/csv', text: jest.fn().mockResolvedValue('prisma') };
        dropFile(dom.window, document.querySelector('#metaDropZone'), meta);
        dropFile(dom.window, document.querySelector('#prismaDropZone'), prisma);
        await new Promise(resolve => dom.window.setTimeout(resolve, 0));

        document.querySelector('#runComparison').click();
        expect(document.querySelector('#monthFromFilter').value).toBe('2026-05');
        expect(document.querySelector('#monthToFilter').value).toBe('2026-06');
        expect(document.querySelector('.summary-card strong').textContent).toBe('2');

        document.querySelector('#monthFromFilter').value = '2026-06';
        document.querySelector('#monthFromFilter').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        expect(document.querySelector('.summary-card strong').textContent).toBe('1');
        expect(document.querySelector('#reportBody').textContent).toContain('June campaign');
        expect(document.querySelector('#reportBody').textContent).not.toContain('May campaign');
    });

    test('stores API details locally, hides saved values, and removes them', async () => {
        document.querySelector('#metaAccessToken').value = 'private-token';
        document.querySelector('#saveMetaCredentials').click();
        await new Promise(resolve => dom.window.setTimeout(resolve, 0));

        expect(document.querySelector('#metaAccessToken').value).toBe('');
        expect(document.querySelector('#metaCredentialStatus').textContent).toContain('saved locally');
        expect(document.body.textContent).not.toContain('private-token');
        expect(document.querySelector('#removeMetaToken').classList.contains('hidden')).toBe(false);

        document.querySelector('#removeMetaToken').click();
        await new Promise(resolve => dom.window.setTimeout(resolve, 0));
        expect(document.querySelector('#removeMetaToken').classList.contains('hidden')).toBe(true);
    });

    test('imports account IDs before syncing API data for the selected scope and dates', async () => {
        const meta = { name: 'meta.csv', size: 10, type: 'text/csv', text: jest.fn().mockResolvedValue('Account ID,Campaign ID,Month,Amount spent\n111,9,2026-06,10') };
        dropFile(dom.window, document.querySelector('#metaDropZone'), meta);
        await new Promise(resolve => dom.window.setTimeout(resolve, 0));
        document.querySelector('#metaAccessToken').value = 'token';
        document.querySelector('#saveMetaCredentials').click();
        await new Promise(resolve => dom.window.setTimeout(resolve, 0));

        expect(document.querySelectorAll('.account-option')).toHaveLength(1);
        document.querySelector('.account-option input[value="111"]').checked = true;
        document.querySelector('#metaApiStartDate').value = '2026-06-01';
        document.querySelector('#metaApiEndDate').value = '2026-06-30';
        document.querySelector('#pullMetaData').click();
        await new Promise(resolve => dom.window.setTimeout(resolve, 0));

        expect(dom.window.metaReportApi.reportToMetaCsv).toHaveBeenCalled();
        expect(document.querySelector('#metaApiStatus').textContent).toContain('campaign-month row');
        expect(document.querySelector('#clearMetaApiData').classList.contains('hidden')).toBe(false);
    });
});

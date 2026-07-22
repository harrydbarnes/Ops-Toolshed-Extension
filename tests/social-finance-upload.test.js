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
            })),
            extractPrismaReferenceData: jest.fn(() => ({
                accounts: [{ id: '111', clients: ['Boots'], rows: 1, months: ['2026-06-01'] }],
                clientProducts: [{ client: 'Boots', product: 'Opticians', accountIds: ['111'] }],
                errors: []
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

    test('only offers Prisma client and product mappings belonging to each Meta Partner account', async () => {
        dom.window.socialFinanceEngine.extractMetaReferenceData.mockReturnValue({
            accounts: [{ id: '111', name: 'Boots', lastSynced: '' }, { id: '222', name: 'No7', lastSynced: '' }], campaigns: [], adSets: [], errors: []
        });
        dom.window.socialFinanceEngine.extractPrismaReferenceData.mockReturnValue({
            accounts: [{ id: '111', clients: ['Boots'], rows: 1, months: ['2026-06-01'] }, { id: '222', clients: ['No7'], rows: 1, months: ['2026-06-01'] }],
            clientProducts: [{ client: 'Boots', product: 'Opticians', accountIds: ['111'] }, { client: 'No7', product: 'Skincare', accountIds: ['222'] }], errors: []
        });
        const meta = { name: 'meta.csv', size: 10, type: 'text/csv', text: jest.fn().mockResolvedValue('meta') };
        const prisma = { name: 'prisma.csv', size: 10, type: 'text/csv', text: jest.fn().mockResolvedValue('prisma') };
        dropFile(dom.window, document.querySelector('#metaDropZone'), meta);
        dropFile(dom.window, document.querySelector('#prismaDropZone'), prisma);
        await new Promise(resolve => dom.window.setTimeout(resolve, 0));

        const bootsOptions = [...document.querySelector('select[data-mapping-account-id="111"]').options].map(option => option.textContent);
        const no7Options = [...document.querySelector('select[data-mapping-account-id="222"]').options].map(option => option.textContent);
        expect(bootsOptions.join(' ')).toContain('Boots / Opticians');
        expect(bootsOptions.join(' ')).not.toContain('No7 / Skincare');
        expect(no7Options.join(' ')).toContain('No7 / Skincare');
        expect(no7Options.join(' ')).not.toContain('Boots / Opticians');
    });

    test('filters the analysis and summary to a selected month range', async () => {
        const rows = [
            { accountId: '111', campaignId: '1', month: '2026-05', account: 'Boots', campaignName: 'May campaign', evidence: 'Needs update', classification: 'Spend update needed', metaSpend: 10, prismaPlanned: 5, variance: 5, issues: [], owner: '' },
            { accountId: '111', campaignId: '2', month: '2026-06', account: 'Boots', campaignName: 'June campaign', evidence: 'Missing/unlinked', classification: 'Missing from Prisma: spending', metaSpend: 20, prismaPlanned: null, variance: 20, issues: [], owner: '' }
        ];
        dom.window.socialFinanceEngine.compare = jest.fn(() => ({ rows, summary: {}, warnings: [], validationErrors: [], coverage: { isComplete: true, metaMonths: ['2026-06'], prismaMonths: ['2026-06'], sharedMonths: ['2026-06'], gaps: [] } }));
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
        expect(document.querySelector('#monthFromFilter').value).toBe('2026-06');
        expect(document.querySelector('#monthToFilter').value).toBe('2026-06');
        expect(document.querySelector('.summary-card strong').textContent).toBe('1');
        expect([...document.querySelectorAll('#reportHeader th')].map(cell => cell.textContent)).not.toContain('Month');

        document.querySelector('#monthFromFilter').value = '2026-05';
        document.querySelector('#monthFromFilter').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        expect(document.querySelector('.summary-card strong').textContent).toBe('2');
        expect(document.querySelector('#reportBody').textContent).toContain('June campaign');
        expect(document.querySelector('#reportBody').textContent).toContain('May campaign');
        expect([...document.querySelectorAll('#reportHeader th')].map(cell => cell.textContent)).toContain('Month');
    });

    test('masks a saved API token in place and removes it from the field control', async () => {
        document.querySelector('#metaAccessToken').value = 'private-token';
        document.querySelector('#saveMetaCredentials').click();
        await new Promise(resolve => dom.window.setTimeout(resolve, 0));

        expect(document.querySelector('#metaAccessToken').value).toBe('••••••••••••');
        expect(document.querySelector('#metaAccessToken').value).not.toBe('private-token');
        expect(document.querySelector('#metaCredentialStatus').textContent).toContain('saved locally');
        expect(document.body.textContent).not.toContain('private-token');
        expect(document.querySelector('#removeMetaToken').classList.contains('hidden')).toBe(false);
        expect(document.querySelector('#removeMetaToken').getAttribute('aria-label')).toBe('Remove saved access token');
        expect(document.querySelector('#saveMetaCredentials').classList.contains('hidden')).toBe(true);

        document.querySelector('#metaAccessToken').focus();
        expect(document.querySelector('#metaAccessToken').value).toBe('');
        expect(document.querySelector('#saveMetaCredentials').classList.contains('hidden')).toBe(false);

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

        dom.window.socialFinanceEngine.compare = jest.fn(() => ({ rows: [], summary: {}, warnings: [], validationErrors: [] }));
        dom.window.socialFinanceEngine.summarizeRows = jest.fn(() => ({ total: 0, missingOrUnlinked: 0, needsUpdate: 0, monitor: 0, investigate: 0, outsideScope: 0, unmatchedSpend: 0, metaBudget: 0, metaSpend: 0, prismaPlanned: 0, variance: 0 }));
        const prisma = { name: 'prisma.csv', size: 10, type: 'text/csv', text: jest.fn().mockResolvedValue('prisma') };
        dropFile(dom.window, document.querySelector('#prismaDropZone'), prisma);
        await new Promise(resolve => dom.window.setTimeout(resolve, 0));
        document.querySelector('#runComparison').click();
        expect(document.querySelector('#metaDataSource').textContent).toContain('Using live Meta API data');
        expect(document.querySelector('#metaDataSource').textContent).toContain('2026-06-01 to 2026-06-30');
    });

    test('checks Prisma client account scope against the selected Meta scope', async () => {
        const meta = { name: 'meta.csv', size: 10, type: 'text/csv', text: jest.fn().mockResolvedValue('Account ID,Campaign ID,Month,Amount spent\n111,9,2026-06,10') };
        const prisma = { name: 'prisma.csv', size: 10, type: 'text/csv', text: jest.fn().mockResolvedValue('Partner account id,Period,PLANNED_AMOUNT\n111,2026-06,10') };
        dropFile(dom.window, document.querySelector('#metaDropZone'), meta);
        dropFile(dom.window, document.querySelector('#prismaDropZone'), prisma);
        await new Promise(resolve => dom.window.setTimeout(resolve, 0));

        expect(dom.window.socialFinanceEngine.extractPrismaReferenceData).toHaveBeenCalled();
        expect(document.querySelector('#prismaScopePanel').classList.contains('hidden')).toBe(false);
        expect(document.querySelector('#prismaScopeStatus').textContent).toContain('1 Prisma account found');
        expect(document.querySelector('#prismaScopeComparison').textContent).toContain('Matched accounts: 1');
        expect(document.querySelector('#accountMappingOptions').textContent).toContain('Boots / Opticians');
        expect(document.querySelector('#accountMappingOptions').textContent).not.toContain('Social team or owner');
        document.querySelector('[data-show-mapping-campaigns="111"]').click();
        expect(document.querySelector('#accountMappingOptions').textContent).toContain('Imported Meta campaigns (1)');
        expect(document.querySelector('#accountMappingOptions').textContent).toContain('Summer');
        expect(document.querySelector('#accountMappingOptions').textContent).toContain('Campaign ID 9');
        document.querySelector('[data-show-matched-scope="true"]').click();
        expect(document.querySelector('#matchedScopeAccounts').classList.contains('hidden')).toBe(false);
        expect(document.querySelector('#matchedScopeAccounts').textContent).toContain('Meta Account ID 111');
        const matchedMapping = document.querySelector('#matchedScopeAccounts select[data-mapping-account-id="111"]');
        expect(matchedMapping.options[matchedMapping.selectedIndex].textContent).toBe('Boots / Opticians');
    });

    test('explains which permission is missing when Meta rejects a read-only sync', async () => {
        const meta = { name: 'meta.csv', size: 10, type: 'text/csv', text: jest.fn().mockResolvedValue('Account ID,Campaign ID,Month,Amount spent\n111,9,2026-06,10') };
        dropFile(dom.window, document.querySelector('#metaDropZone'), meta);
        await new Promise(resolve => dom.window.setTimeout(resolve, 0));
        document.querySelector('#metaAccessToken').value = 'token';
        document.querySelector('#saveMetaCredentials').click();
        await new Promise(resolve => dom.window.setTimeout(resolve, 0));
        document.querySelector('.account-option input[value="111"]').checked = true;
        dom.window.metaReportApi.createClient.mockReturnValueOnce({
            syncAccount: jest.fn().mockRejectedValue(new Error('(#200) Ad account owner has NOT grant ads_management or ads_read permission'))
        });

        document.querySelector('#pullMetaData').click();
        await new Promise(resolve => dom.window.setTimeout(resolve, 0));

        expect(document.querySelector('#metaApiStatus').textContent).toContain('Meta denied read access for Boots');
        expect(document.querySelector('#metaApiStatus').textContent).toContain('only makes read-only requests using ads_read');
        expect(document.querySelector('#pullMetaData').textContent).toBe('Retry sync');
    });

    test('opens a local matching workspace from unmatched Meta spend and applies a selected Prisma campaign', async () => {
        const rows = [
            { accountId: '111', account: 'Boots', campaignId: 'meta-1', campaignName: 'Meta campaign', month: '2026-06', metaKey: '111|meta-1|2026-06-01', prismaKey: '', metaSpend: 50, prismaPlanned: null, variance: 50, evidence: 'Missing/unlinked', classification: 'Missing', metaBudget: null, issues: [], owner: '', candidatePool: [{ key: '111|prisma-1|2026-06-01', prismaKey: '111|prisma-1|2026-06-01', campaignId: 'prisma-1', campaignName: 'Prisma campaign', planned: 48, score: 82, level: 'Possible candidate', reasons: [] }, { key: '111|prisma-2|2026-06-01', prismaKey: '111|prisma-2|2026-06-01', campaignId: 'prisma-2', campaignName: 'Alternative Prisma campaign', planned: 52, score: 68, level: 'Possible candidate', reasons: [] }] },
            { accountId: '111', account: 'Boots', campaignId: 'prisma-1', campaignName: 'Prisma campaign', month: '2026-06', metaKey: '', prismaKey: '111|prisma-1|2026-06-01', metaSpend: null, prismaPlanned: 48, variance: -48, evidence: 'Investigate', classification: 'Prisma booking absent from Meta population', metaBudget: null, issues: [], owner: '' }
        ];
        dom.window.socialFinanceEngine.compare = jest.fn(() => ({ rows, summary: {}, warnings: [], validationErrors: [], coverage: { isComplete: true, metaMonths: ['2026-06'], prismaMonths: ['2026-06'], sharedMonths: ['2026-06'], gaps: [] } }));
        dom.window.socialFinanceEngine.summarizeRows = jest.fn(() => ({ total: 2, missingOrUnlinked: 1, needsUpdate: 0, monitor: 0, investigate: 1, outsideScope: 0, unmatchedSpend: 50, metaBudget: 0, metaSpend: 50, prismaPlanned: 48, variance: 2 }));
        const meta = { name: 'meta.csv', size: 10, type: 'text/csv', text: jest.fn().mockResolvedValue('meta') };
        const prisma = { name: 'prisma.csv', size: 10, type: 'text/csv', text: jest.fn().mockResolvedValue('prisma') };
        dropFile(dom.window, document.querySelector('#metaDropZone'), meta);
        dropFile(dom.window, document.querySelector('#prismaDropZone'), prisma);
        await new Promise(resolve => dom.window.setTimeout(resolve, 0));
        document.querySelector('#runComparison').click();

        document.querySelector('[data-open-manual-match="true"]').click();
        expect(document.querySelector('[data-open-manual-match="true"]').textContent).toBe('Click To Match');
        expect(document.querySelector('#manualMatchModal').classList.contains('hidden')).toBe(false);
        expect(document.querySelector('#manualMatchBody').textContent).toContain('Meta campaign');
        const search = document.querySelector('input[data-candidate-search]');
        expect(search).not.toBeNull();
        search.value = 'Alternative';
        search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        expect(document.querySelector('#manualMatchBody').textContent).toContain('1 matching eligible Prisma campaign');
        const choices = document.querySelectorAll('#manualMatchBody .candidate-choice');
        expect(choices[0].hidden).toBe(true);
        expect(choices[1].hidden).toBe(false);
        const candidate = document.querySelector('#manualMatchBody .candidate-choice');
        expect(candidate.textContent).toContain('Prisma campaign');
        expect(candidate.textContent).toContain('£48.00 booked');
        const radio = choices[1].querySelector('input[type="radio"]');
        expect(radio.value).toBe('111|prisma-2|2026-06-01');
        radio.checked = true;
        document.querySelector('#applyManualMatches').click();
        await new Promise(resolve => dom.window.setTimeout(resolve, 0));

        expect(dom.window.socialFinanceEngine.compare.mock.calls.at(-1)[2].manualMatches).toEqual({ '111|meta-1|2026-06-01': '111|prisma-2|2026-06-01' });
    });

    test('requires and remembers a Wrike reference before recommending Prisma booking', async () => {
        const rows = [{ accountId: '111', account: 'Boots', campaignId: 'meta-1', campaignName: 'Missing campaign', month: '2026-06', monthClosed: true, metaKey: '111|meta-1|2026-06-01', prismaKey: '', metaSpend: 50, prismaPlanned: null, variance: 50, evidence: 'Missing/unlinked', classification: 'Missing from Prisma: spending', candidates: [], issues: [], owner: '' }];
        dom.window.socialFinanceEngine.compare = jest.fn(() => ({ rows, summary: {}, warnings: [], validationErrors: [], coverage: { isComplete: true, metaMonths: ['2026-06'], prismaMonths: ['2026-06'], sharedMonths: ['2026-06'], gaps: [] } }));
        dom.window.socialFinanceEngine.summarizeRows = jest.fn(() => ({ total: 1, missingOrUnlinked: 1, needsUpdate: 0, monitor: 0, investigate: 0, outsideScope: 0, unmatchedSpend: 50, metaBudget: 0, metaSpend: 50, prismaPlanned: 0, variance: 50 }));
        Object.defineProperty(dom.window.navigator, 'clipboard', { value: { writeText: jest.fn().mockResolvedValue() }, configurable: true });
        const meta = { name: 'meta.csv', size: 10, type: 'text/csv', text: jest.fn().mockResolvedValue('meta') };
        const prisma = { name: 'prisma.csv', size: 10, type: 'text/csv', text: jest.fn().mockResolvedValue('prisma') };
        dropFile(dom.window, document.querySelector('#metaDropZone'), meta);
        dropFile(dom.window, document.querySelector('#prismaDropZone'), prisma);
        await new Promise(resolve => dom.window.setTimeout(resolve, 0));
        document.querySelector('#runComparison').click();

        expect(document.querySelector('#socialActionBody').textContent).toContain('Get Wrike reference');
        const wrikeInput = document.querySelector('[data-wrike-meta-key]');
        wrikeInput.value = 'https://wrike.example/task/123';
        wrikeInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        await new Promise(resolve => dom.window.setTimeout(resolve, 0));

        expect(document.querySelector('#socialActionBody').textContent).toContain('Book in Prisma using Wrike');
        document.querySelector('#copySocialActions').click();
        await new Promise(resolve => dom.window.setTimeout(resolve, 0));
        expect(dom.window.navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('https://wrike.example/task/123'));
    });

    test('filters by evidence and account, sorts financial columns, and updates headline totals', async () => {
        const rows = [
            { accountId: '111', campaignId: '1', month: '2026-06', account: 'Boots', campaignName: 'Lower', evidence: 'Needs update', classification: 'Update', metaBudget: 100, metaSpend: 10, prismaPlanned: 8, variance: 2, issues: [], owner: '' },
            { accountId: '222', campaignId: '2', month: '2026-06', account: 'No7', campaignName: 'Higher', evidence: 'Investigate', classification: 'Investigate', metaBudget: 200, metaSpend: 30, prismaPlanned: 20, variance: 10, issues: [], owner: '' }
        ];
        dom.window.socialFinanceEngine.compare = jest.fn(() => ({ rows, summary: {}, warnings: [], validationErrors: [] }));
        dom.window.socialFinanceEngine.summarizeRows = jest.fn(filtered => ({
            total: filtered.length, missingOrUnlinked: 0, needsUpdate: 0, monitor: 0, investigate: 0, outsideScope: 0, unmatchedSpend: 0,
            metaBudget: filtered.reduce((sum, row) => sum + row.metaBudget, 0),
            metaSpend: filtered.reduce((sum, row) => sum + row.metaSpend, 0),
            prismaPlanned: filtered.reduce((sum, row) => sum + row.prismaPlanned, 0),
            variance: filtered.reduce((sum, row) => sum + row.variance, 0)
        }));
        const meta = { name: 'meta.csv', size: 10, type: 'text/csv', text: jest.fn().mockResolvedValue('meta') };
        const prisma = { name: 'prisma.csv', size: 10, type: 'text/csv', text: jest.fn().mockResolvedValue('prisma') };
        dropFile(dom.window, document.querySelector('#metaDropZone'), meta);
        dropFile(dom.window, document.querySelector('#prismaDropZone'), prisma);
        await new Promise(resolve => dom.window.setTimeout(resolve, 0));
        const mapping = document.querySelector('[data-mapping-account-id="111"]');
        mapping.value = mapping.options[1].value;
        mapping.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        await new Promise(resolve => dom.window.setTimeout(resolve, 0));
        document.querySelector('#runComparison').click();

        expect(document.querySelector('#accountFilterOptions').textContent).toContain('Boots');
        expect(document.querySelector('#accountFilterOptions').textContent).toContain('No7');
        expect(document.querySelector('#financialHeadline').textContent).toContain('£40.00');
        expect(document.querySelector('#clientBreakdownBody').textContent).toContain('Boots');
        expect(document.querySelector('#clientBreakdownBody').textContent).toContain('Opticians');
        expect(document.querySelector('[data-campaign-column="campaignName"]').style.width).toBe('190px');
        const campaignNameResizer = document.querySelector('[data-column-resize="campaignName"]');
        campaignNameResizer.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
        expect(document.querySelector('[data-campaign-column="campaignName"]').style.width).toBe('170px');
        expect(document.querySelector('.summary-card .evidence-tooltip')).not.toBeNull();
        expect(document.querySelector('.summary-card .tooltip-icon').textContent).toBe('i');
        expect(document.querySelector('#reportBody .evidence-tooltip[data-tooltip*="linked Prisma booking"]')).not.toBeNull();
        document.querySelector('[data-expand-breakdown="campaign"]').click();
        expect(document.querySelector('#campaignBreakdown').classList.contains('is-expanded')).toBe(true);
        expect(document.querySelector('[data-expand-breakdown="campaign"]').textContent).toBe('Exit expanded view');
        document.querySelector('[data-expand-breakdown="campaign"]').click();
        expect(document.querySelector('#campaignBreakdown').classList.contains('is-expanded')).toBe(false);

        document.querySelector('#accountFilterOptions input[value="222"]').checked = false;
        document.querySelector('#accountFilterOptions input[value="222"]').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        expect(document.querySelector('#reportBody').textContent).not.toContain('Higher');
        expect(document.querySelector('#financialHeadline').textContent).toContain('£10.00');

        document.querySelector('#accountFilterOptions input[value="222"]').checked = true;
        document.querySelector('#accountFilterOptions input[value="222"]').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        document.querySelector('.sort-button[data-sort="metaSpend"]').click();
        expect([...document.querySelectorAll('#reportBody .campaign-id')].map(cell => cell.textContent)).toEqual(['2', '1']);
        document.querySelector('#evidenceFilterOptions input[value="Investigate"]').checked = false;
        document.querySelector('#evidenceFilterOptions input[value="Investigate"]').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
        expect(document.querySelector('#reportBody').textContent).not.toContain('Higher');
    });

    test('searches and sorts Social actions, and sorts the client breakdown', async () => {
        const rows = [
            { accountId: '111', campaignId: '1', month: '2026-06', account: 'Boots', campaignName: 'Lower', metaKey: '111|1|2026-06-01', evidence: 'Needs update', classification: 'Update', metaSpend: 10, prismaPlanned: 8, variance: 2, issues: [], owner: '' },
            { accountId: '222', campaignId: '2', month: '2026-06', account: 'No7', campaignName: 'Higher', metaKey: '222|2|2026-06-01', evidence: 'Investigate', classification: 'Investigate', metaSpend: 30, prismaPlanned: 20, variance: 10, issues: [], owner: '' }
        ];
        dom.window.socialFinanceEngine.compare = jest.fn(() => ({ rows, summary: {}, warnings: [], validationErrors: [], coverage: { isComplete: true, metaMonths: ['2026-06'], prismaMonths: ['2026-06'], sharedMonths: ['2026-06'], gaps: [] } }));
        dom.window.socialFinanceEngine.summarizeRows = jest.fn(() => ({ total: 2, missingOrUnlinked: 0, needsUpdate: 1, monitor: 0, investigate: 1, outsideScope: 0, unmatchedSpend: 0, metaBudget: 0, metaSpend: 40, prismaPlanned: 28, variance: 12 }));
        const meta = { name: 'meta.csv', size: 10, type: 'text/csv', text: jest.fn().mockResolvedValue('meta') };
        const prisma = { name: 'prisma.csv', size: 10, type: 'text/csv', text: jest.fn().mockResolvedValue('prisma') };
        dropFile(dom.window, document.querySelector('#metaDropZone'), meta);
        dropFile(dom.window, document.querySelector('#prismaDropZone'), prisma);
        await new Promise(resolve => dom.window.setTimeout(resolve, 0));
        document.querySelector('#runComparison').click();

        document.querySelector('#socialActionHeader [data-sort-key="metaSpend"]').click();
        expect(document.querySelector('#socialActionBody').textContent.indexOf('Higher')).toBeLessThan(document.querySelector('#socialActionBody').textContent.indexOf('Lower'));
        document.querySelector('#socialActionSearch').value = 'Boots';
        document.querySelector('#socialActionSearch').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
        expect(document.querySelector('#socialActionBody').textContent).toContain('Lower');
        expect(document.querySelector('#socialActionBody').textContent).not.toContain('Higher');

        document.querySelector('#clientBreakdownHeader [data-sort-key="variance"]').click();
        expect(document.querySelector('#clientBreakdownHeader th[aria-sort="descending"]').textContent).toContain('Variance');
    });
});

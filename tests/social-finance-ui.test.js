const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.resolve(__dirname, '../social-finance.html'), 'utf8');
const css = fs.readFileSync(path.resolve(__dirname, '../social-finance.css'), 'utf8');
const script = fs.readFileSync(path.resolve(__dirname, '../social-finance.js'), 'utf8');
const apiScript = fs.readFileSync(path.resolve(__dirname, '../meta-report-api.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../manifest.json'), 'utf8'));
const popupHtml = fs.readFileSync(path.resolve(__dirname, '../popup.html'), 'utf8');
const toolshedHtml = fs.readFileSync(path.resolve(__dirname, '../toolshed.html'), 'utf8');

describe('Social Booking Checker upload guidance', () => {
    const document = new JSDOM(html).window.document;

    test('explains the shared scope and local handling before comparison', () => {
        const guidance = document.querySelector('.upload-readiness').textContent;

        expect(guidance).toContain('same selected Meta Account IDs');
        expect(guidance).toContain('same reporting months');
        expect(guidance).toContain('every selected account-month is represented in Prisma');
        expect(document.body.textContent).toContain('only in this Chrome profile');
    });

    test('uses the updated name and user-facing explanation throughout the launcher', () => {
        expect(document.title).toBe('Social Booking Checker');
        expect(document.querySelector('h1').textContent).toBe('Social Booking Checker');
        expect(document.querySelector('.report-intro p').textContent).toBe('Compare what is in Meta currently to what is booked in Prisma. The report helps break down for you any differences, guiding you on a course to 1:1 matching of bookings.');
        expect(document.body.textContent).not.toContain('Finance control');
        expect(popupHtml).toContain('id="socialFinanceReportButton" class="nav-button">Social Booking Checker</button>');
    });

    test('shows Meta as the available platform and future platforms as unavailable', () => {
        const platforms = [...document.querySelectorAll('.platform-option input')];

        expect(platforms.map(input => input.value)).toEqual(['meta', 'tiktok', 'snap', 'pinterest']);
        expect(platforms[0].checked).toBe(true);
        expect(platforms[0].disabled).toBe(false);
        expect(platforms.slice(1).every(input => input.disabled)).toBe(true);
        expect(document.querySelector('.platform-options').textContent).toContain('Coming soon');
    });

    test('styles platform choices as compact Material-style filter chips', () => {
        expect(css).toContain('min-height: 32px;');
        expect(css).toContain('border-radius: 8px;');
        expect(css).toContain('.filter-chip-icon');
        expect(document.querySelector('.platform-option .filter-chip-icon path').getAttribute('d')).toContain('M9 16.17');
    });

    test('uses the shared Ops Toolshed visual language and concise population confirmation', () => {
        expect(css).toContain('--accent: #e82f79');
        expect(css).toContain('--canvas: #f5f5f7');
        expect(css).toContain('--radius: 14px');
        expect(css).toContain('font-family: "Outfit", "Segoe UI", sans-serif');
        expect(document.querySelector('.population-check span').textContent).toBe('Missing bookings are only confirmed when Prisma includes every selected Meta account and reporting month.');
        expect(toolshedHtml).toContain('The Social Booking Checker now supports removable drag-and-drop uploads');
    });

    test('lists the required Meta report columns and scope', () => {
        const card = document.querySelector('#metaFile').closest('.file-card');
        const text = card.textContent;

        expect(text).toContain('Meta Ads Report');
        expect(text).toContain('Meta Spend Across Agency');
        expect(text).toContain('Account ID');
        expect(text).toContain('Campaign ID');
        expect(text).toContain('Amount spent');
        expect(text).toContain('Month');
        expect(text).toContain('Reporting starts');
        expect(text).toContain('every relevant Meta account and campaign');
        expect(text).toContain('Account name');
        expect(text).toContain('Campaign budget');
        expect(text).toContain('Campaign budget type');
        expect(text).toContain('Ad set ID');
        expect(text).toContain('Ad set name');
        expect(text).toContain('Ad set start');
        expect(text).toContain('Ad set end');
        const input = card.querySelector('#metaFile');
        expect(input.getAttribute('aria-label')).toBe('Choose Meta campaign CSV');
        expect(input.getAttribute('aria-describedby')).toBe('metaUploadScope');
        expect(card.querySelector('.export-source').textContent).toContain('In Meta Ads Reporting, use the');
        expect(document.querySelector('#metaAdsReportingLink').href).toBe('https://adsmanager.facebook.com/adsmanager/reporting');
    });

    test('lists the required Prisma report columns and matching scope', () => {
        const card = document.querySelector('#prismaFile').closest('.file-card');
        const text = card.textContent;

        expect(text).toContain('Prisma booking report');
        expect(text).toContain('Partner account id');
        expect(text).toContain('Partner line id');
        expect(text).toContain('Period');
        expect(text).toContain('PLANNED_AMOUNT');
        expect(text).toContain('Gross Amount');
        expect(text).toContain('same client/accounts and reporting months');
        expect(text).toContain('Campaign, Plan or Order name');
        expect(text).toContain('Client name');
        expect(text).toContain('Product name');
        expect(text).toContain('Days in Flight start date');
        expect(text).toContain('Days in Flight end date');
        expect(text).toContain('Placement creator');
        const input = card.querySelector('#prismaFile');
        expect(input.getAttribute('aria-label')).toBe('Choose Prisma booking CSV');
        expect(input.getAttribute('aria-describedby')).toBe('prismaUploadScope');
        expect(card.querySelector('.export-source').textContent).toContain('In Prisma Reporting, pull the latest report you require, for example the Meta Integration Tracker.');
        expect(document.querySelector('.file-card:nth-of-type(2) .export-source a').href).toBe('https://groupmuk-prisma.mediaocean.com/viewport-home/#osAppId=prsm-cvr&osPspId=prsm-cvr');
    });

    test('aligns upload cards and places imported-account removal at the scope footer', () => {
        expect(document.querySelector('#metaDropZone').parentElement.querySelector('#metaReferenceStatus')).toBeNull();
        expect(document.querySelector('#accountScopePanel .account-scope-footer #metaReferenceStatus')).not.toBeNull();
        expect(document.querySelector('#accountScopePanel .account-scope-footer #removeMetaReference')).not.toBeNull();
          expect(css).toContain('align-items: stretch;');
          expect(css).toContain('min-height: 128px;');
          expect(css).toContain('min-height: 38px;');
          expect(css).toContain('.account-scope-footer');
    });

    test('explains optional checks and comparison settings in plain language', () => {
        const pageText = document.body.textContent;
        const settingsText = document.querySelector('.settings-row').textContent;

        expect(pageText).not.toContain('For fuller checks');
        expect(pageText).not.toContain('PlacementDetailTable');
        expect(pageText).not.toContain('Build exception report');
        expect(document.querySelectorAll('.optional-requirements')).toHaveLength(2);
        expect(pageText).toContain('Optional reference columns');
        expect(settingsText).toContain('Check date');
        expect(settingsText).toContain('Use today unless');
        expect(settingsText).toContain('Ignore differences up to');
        expect(settingsText).toContain('differences of 1 or less in the Meta account currency');
        expect(settingsText).toContain('Month closes after (working days)');
        expect(settingsText).toContain('working days from month-end');
        expect(document.querySelector('#runComparison').textContent).toBe('Compare bookings');
    });

    test('uses an animated chevron for optional reference-column disclosures', () => {
        expect(css).toContain('.optional-columns summary::after');
        expect(css).toContain('.optional-columns[open] summary::after { transform: rotate(180deg); }');
    });

    test('offers drag and drop or file browsing for both reports', () => {
        const metaDropZone = document.querySelector('#metaDropZone');
        const prismaDropZone = document.querySelector('#prismaDropZone');

        expect(metaDropZone.textContent).toContain('Drag and drop Meta CSV here');
        expect(prismaDropZone.textContent).toContain('Drag and drop Prisma CSV here');
        expect(metaDropZone.getAttribute('role')).toBe('button');
        expect(prismaDropZone.getAttribute('tabindex')).toBe('0');
        expect(metaDropZone.querySelector('#metaFileName').textContent).toBe('No file selected');
        expect(prismaDropZone.querySelector('#prismaFileName').textContent).toBe('No file selected');
        expect(metaDropZone.querySelector('#removeMetaFile').textContent).toBe('Remove file');
        expect(prismaDropZone.querySelector('#removePrismaFile').textContent).toBe('Remove file');
    });

    test('requires report-led discovery and offers a read-only API refresh without Business credentials', () => {
        expect([...document.querySelectorAll('[data-workflow-progress] strong')].map(step => step.textContent)).toEqual(['Upload reports', 'Confirm scope', 'Compare & act']);
        expect([...document.querySelectorAll('.workflow-step-button')].map(button => button.type)).toEqual(['button', 'button', 'button']);
        expect(document.querySelector('[data-workflow-progress="scope"] .workflow-step-button').disabled).toBe(true);
        expect(document.querySelector('[data-workflow-progress="upload"]').getAttribute('aria-current')).toBe('step');
        expect(document.querySelector('#scopeStage').classList).toContain('hidden');
        expect(document.querySelector('#continueToScope').disabled).toBe(true);
        expect(css).toContain('.workflow-progress');
        expect(css).toContain('--workflow: #3d3aae');
        expect(css).toContain('.prisma-scope { position: relative;');
        expect(document.querySelector('#metaAccessToken').type).toBe('password');
        expect(document.querySelector('#metaBusinessId')).toBeNull();
        expect(document.querySelector('#removeMetaToken').textContent).toBe('×');
        expect(document.querySelector('#removeMetaToken').getAttribute('aria-label')).toBe('Remove saved access token');
        expect(document.querySelector('#removeMetaBusinessId')).toBeNull();
        expect(document.querySelector('#metaApiPanel').textContent).toContain('Optional Meta live refresh');
        expect(document.querySelector('#metaApiPanel').textContent).toContain('only reads information from Meta');
        expect(document.querySelector('#metaApiPanel').textContent).toContain('stored only in this Chrome profile');
        expect(document.querySelector('#metaApiPanel .privacy-note')).toBeNull();
        expect(document.querySelector('#metaApiPanel').classList).toContain('live-refresh-panel');
        expect(document.querySelector('#metaApiPanel').closest('#scopeStage')).not.toBeNull();
        expect(document.querySelector('#metaApiDatePreset').options).toHaveLength(8);
        expect(document.querySelector('#pullMetaData').textContent).toBe('Refresh selected Meta accounts');
        expect(document.querySelector('#prismaScopePanel').textContent).toContain('Prisma coverage and mapping');
        expect(document.querySelector('#prismaScopePanel').textContent).toContain('Prisma Partner account ID is matched to Meta Account ID');
        expect(script).toContain('Selected Meta accounts not in Prisma report');
        expect(script).toContain('Prisma accounts not selected in Meta');
        expect(css).toContain('.api-status:not(.is-loading)::before');
        expect(css).toContain('social-booking-spin');
        expect(document.body.textContent).toContain('The report supplies the Account IDs');
        expect(script).toContain("window.chrome.storage.local");
        expect(script).not.toContain('META_ACCESS_TOKEN');
        expect(apiScript).not.toContain('owned_ad_accounts');
        expect(apiScript).not.toContain('client_ad_accounts');
        expect(apiScript).not.toContain('business_management');
        expect(apiScript).not.toContain('ads_management');
        expect(manifest.host_permissions).toContain('https://graph.facebook.com/*');
    });

    test('offers month range filters and separate account and campaign columns', () => {
        const headings = [...document.querySelectorAll('.table-frame th')].map(cell => cell.textContent);

        expect(document.querySelector('#monthFromFilter')).not.toBeNull();
        expect(document.querySelector('#monthToFilter')).not.toBeNull();
        expect(headings).toContain('Account');
        expect(headings).toContain('Campaign name');
        expect(headings).toContain('Campaign ID');
        expect(headings).not.toContain('Campaign / month');
        expect(headings).not.toContain('Account and campaign');
        expect(document.querySelector('#clientBreakdown')).not.toBeNull();
        expect(document.querySelector('#clientBreakdown').textContent).toContain('Client breakdown');
        expect(document.querySelector('#campaignBreakdown').textContent).toContain('Campaign breakdown');
        expect(document.querySelector('#campaignTable')).not.toBeNull();
        expect(document.querySelector('#campaignColumnGroup')).not.toBeNull();
        expect(document.querySelector('#campaignBreakdown').textContent).toContain('Drag a column divider to resize it');
        expect(document.querySelectorAll('[data-download-breakdown]')).toHaveLength(2);
        expect(document.querySelectorAll('[data-expand-breakdown]')).toHaveLength(2);
        expect(document.querySelectorAll('[data-open-breakdown]')).toHaveLength(2);
        expect(css).toContain('.breakdown-section.is-expanded');
        expect(css).toContain('.column-resizer');
        expect(script).toContain('socialBookingCampaignColumnWidths');
    });

    test('provides multi-select evidence and account filters plus numeric sorting', () => {
        const evidence = document.querySelector('#evidenceFilterMenu');
        const account = document.querySelector('#accountFilterMenu');
        expect(evidence.querySelector('summary').textContent).toContain('Evidence');
        expect(evidence.querySelectorAll('input[type="checkbox"]')).toHaveLength(6);
        expect(account.querySelector('summary').textContent).toContain('Account');
        expect(document.querySelector('#evidenceFilter')).toBeNull();
        expect([...document.querySelectorAll('.sort-button')].map(button => button.dataset.sort)).toEqual(['metaSpend', 'prismaPlanned', 'variance']);
    });

    test('keeps campaign column resizing CSP-safe', () => {
        expect(script).not.toContain('style="width:${campaignColumnWidth(column)}px"');
        expect(script).not.toContain('column.style.width');
        expect(script).toContain('sheet.insertRule');
    });

    test('explains reconciliation evidence on hover and keyboard focus', () => {
        expect(script).toContain('EVIDENCE_EXPLANATIONS');
        expect(script).toContain('Missing/unlinked');
        expect(script).toContain('Outside scope');
        expect(css).toContain('.evidence-tooltip:hover::after');
        expect(css).toContain('.evidence-tooltip:focus-visible::after');
        expect(css).toContain('.tooltip-icon');
    });

    test('provides a large local-only workspace for matching unmatched Meta spend', () => {
        expect(document.querySelector('#manualMatchModal').getAttribute('role')).toBe('dialog');
        expect(document.querySelector('#manualMatchModal').textContent).toContain('Match unmatched Meta spend');
        expect(document.querySelector('#manualMatchModal').textContent).toContain('Ranked Prisma candidates');
        expect(document.querySelector('#applyManualMatches').textContent).toBe('Save review decisions');
        expect(script).toContain('Match unmatched spend');
        expect(script).toContain('Search eligible Prisma campaigns');
        expect(css).toContain('.manual-match-dialog');
        expect(css).toContain('.candidate-search');
        expect(script).toContain('socialBookingManualCampaignMatches');
        expect(script).toContain('socialBookingRejectedCampaignMatches');
    });

    test('provides a Wrike-aware Social action list for sharing', () => {
        expect(document.querySelector('#socialActionList').textContent).toContain('Social action list');
        expect(document.querySelector('#socialActionList').textContent).toContain('Wrike reference');
        expect(document.querySelector('#socialActionList').textContent).toContain('saved locally in this Chrome profile');
        expect(document.querySelector('#copySocialActions').textContent).toBe('Copy list');
        expect(document.querySelector('#downloadSocialActions').textContent).toBe('Download CSV');
        expect(script).toContain('socialBookingWrikeReferences');
        expect(script).toContain('Get Wrike reference');
        expect(script).toContain('Book in Prisma using Wrike');
    });

    test('uses the compact feedback-style arrow on Meta to Prisma mapping dropdowns', () => {
        expect(css).toContain('.account-mapping-row select {');
        expect(css).toContain('appearance: none;');
        expect(css).toContain('background-position: right 10px center;');
    });

    test('shows headline financial totals and API source evidence without repeating the outside-scope tooltip', () => {
        expect(document.querySelector('#financialHeadline')).not.toBeNull();
        expect(document.querySelector('#metaDataSource')).not.toBeNull();
        expect(document.querySelector('#summaryCards').classList).toContain('action-headline');
        expect(document.querySelectorAll('.summary-card')).toHaveLength(0);
        expect(document.querySelector('#dataConfidenceLink').getAttribute('href')).toBe('#dataDiagnostics');
        expect(document.querySelector('#dataDiagnostics').contains(document.querySelector('#dataDiagnosticsBadge'))).toBe(false);
        expect(document.querySelector('.scope-explanation')).toBeNull();
        expect(css).toContain('.financial-headline');
    });
});

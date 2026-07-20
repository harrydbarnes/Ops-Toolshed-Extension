const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.resolve(__dirname, '../social-finance.html'), 'utf8');
const css = fs.readFileSync(path.resolve(__dirname, '../social-finance.css'), 'utf8');
const popupHtml = fs.readFileSync(path.resolve(__dirname, '../popup.html'), 'utf8');
const toolshedHtml = fs.readFileSync(path.resolve(__dirname, '../toolshed.html'), 'utf8');

describe('Social Booking Checker upload guidance', () => {
    const document = new JSDOM(html).window.document;

    test('explains the shared scope and raw CSV requirements before upload', () => {
        const guidance = document.querySelector('.upload-readiness').textContent;

        expect(guidance).toContain('raw CSV export');
        expect(guidance).toContain('same client account(s) and reporting months');
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

    test('uses the shared Ops Toolshed visual language and concise population confirmation', () => {
        expect(css).toContain('--accent: #e82f79');
        expect(css).toContain('--canvas: #f5f5f7');
        expect(css).toContain('--radius: 14px');
        expect(css).toContain('font-family: "Outfit", "Segoe UI", sans-serif');
        expect(document.querySelector('.population-check span').textContent).toBe('I confirm the files cover the same client account(s) and reporting months');
        expect(toolshedHtml).toContain('The Social Booking Checker now matches the rest of Ops Toolshed');
    });

    test('lists the required Meta report columns and scope', () => {
        const card = document.querySelector('label[for="metaFile"]');
        const text = card.textContent;

        expect(text).toContain('Meta Ads Report');
        expect(text).toContain('Meta Spend Across Agency');
        expect(text).toContain('Campaign ID');
        expect(text).toContain('Amount spent');
        expect(text).toContain('Month');
        expect(text).toContain('Reporting starts');
        expect(text).toContain('every relevant Meta account and campaign');
        expect(text).toContain('Account name');
        expect(text).toContain('Campaign budget');
        expect(text).toContain('Ad set start');
        expect(text).toContain('Ad set end');
        const input = card.querySelector('#metaFile');
        expect(input.getAttribute('aria-label')).toBe('Choose Meta campaign CSV');
        expect(input.getAttribute('aria-describedby')).toBe('metaUploadScope');
    });

    test('lists the required Prisma report columns and matching scope', () => {
        const card = document.querySelector('label[for="prismaFile"]');
        const text = card.textContent;

        expect(text).toContain('Prisma booking report');
        expect(text).toContain('Partner line id');
        expect(text).toContain('Period');
        expect(text).toContain('PLANNED_AMOUNT');
        expect(text).toContain('Gross Amount');
        expect(text).toContain('same client/accounts and reporting months');
        expect(text).toContain('Campaign, Plan or Order name');
        expect(text).toContain('Client name');
        expect(text).toContain('Placement start date');
        expect(text).toContain('Placement creator');
        const input = card.querySelector('#prismaFile');
        expect(input.getAttribute('aria-label')).toBe('Choose Prisma booking CSV');
        expect(input.getAttribute('aria-describedby')).toBe('prismaUploadScope');
    });

    test('explains optional checks and comparison settings in plain language', () => {
        const pageText = document.body.textContent;
        const settingsText = document.querySelector('.settings-row').textContent;

        expect(pageText).not.toContain('For fuller checks');
        expect(pageText).not.toContain('PlacementDetailTable');
        expect(pageText).not.toContain('Build exception report');
        expect(document.querySelectorAll('.optional-requirements')).toHaveLength(2);
        expect(pageText).toContain('Optional columns');
        expect(settingsText).toContain('Check date');
        expect(settingsText).toContain('Use today unless');
        expect(settingsText).toContain('Ignore differences up to (£)');
        expect(settingsText).toContain('differences of £1 or less');
        expect(settingsText).toContain('Month closes after (working days)');
        expect(settingsText).toContain('working days from month-end');
        expect(document.querySelector('#runComparison').textContent).toBe('Compare bookings');
    });
});

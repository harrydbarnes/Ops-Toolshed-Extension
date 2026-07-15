const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.resolve(__dirname, '../social-finance.html'), 'utf8');

describe('Social Booking Report upload guidance', () => {
    const document = new JSDOM(html).window.document;

    test('explains the shared scope and raw CSV requirements before upload', () => {
        const guidance = document.querySelector('.upload-readiness').textContent;

        expect(guidance).toContain('raw CSV export');
        expect(guidance).toContain('same client/account population');
        expect(guidance).toContain('same reporting months');
    });

    test('lists the required Meta report columns and scope', () => {
        const card = document.querySelector('label[for="metaFile"]');
        const text = card.textContent;

        expect(text).toContain('Meta Ads Manager');
        expect(text).toContain('Campaign ID');
        expect(text).toContain('Amount spent');
        expect(text).toContain('Month');
        expect(text).toContain('Reporting starts');
        expect(text).toContain('every relevant Meta account and campaign');
        const input = card.querySelector('#metaFile');
        expect(input.getAttribute('aria-label')).toBe('Choose Meta campaign CSV');
        expect(input.getAttribute('aria-describedby')).toBe('metaUploadScope');
    });

    test('lists the required Prisma report columns and matching scope', () => {
        const card = document.querySelector('label[for="prismaFile"]');
        const text = card.textContent;

        expect(text).toContain('PlacementDetailTable');
        expect(text).toContain('Partner line id');
        expect(text).toContain('Period');
        expect(text).toContain('PLANNED_AMOUNT');
        expect(text).toContain('Gross Amount');
        expect(text).toContain('same client/accounts and reporting months');
        const input = card.querySelector('#prismaFile');
        expect(input.getAttribute('aria-label')).toBe('Choose Prisma PlacementDetailTable CSV');
        expect(input.getAttribute('aria-describedby')).toBe('prismaUploadScope');
    });
});

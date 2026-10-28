const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { readScript } = require('./helpers/read-script');

test('uploaded CSVs flow through the real comparison engine into the rendered report and CSV download', async () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../social-finance.html'), 'utf8');
    const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://extension.test/social-finance.html' });
    const w = dom.window;
    const downloads = [];
    const stored = {};
    try {
        w.chrome = { runtime: {}, storage: { local: {
            get: (key, callback) => {
                const data = typeof key === 'string' ? { [key]: stored[key] } : { ...stored };
                callback?.(data);
                return Promise.resolve(data);
            },
            set: (data, callback) => { Object.assign(stored, data); callback?.(); return Promise.resolve(); },
            remove: (key, callback) => { delete stored[key]; callback?.(); return Promise.resolve(); }
        } } };
        w.Blob = Blob;
        w.URL.createObjectURL = jest.fn(blob => { downloads.push(blob); return 'blob:report'; });
        w.URL.revokeObjectURL = jest.fn();
        w.HTMLAnchorElement.prototype.click = jest.fn();
        w.HTMLElement.prototype.scrollIntoView = jest.fn();
        for (const file of ['social-finance-engine.js', 'meta-report-api.js', 'social-finance.js']) {
            w.eval(readScript(path.resolve(__dirname, '..', file)));
        }
        if (w.document.readyState === 'loading') {
            await new Promise(resolve => w.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
        }
        const campaignId = '120000000000000099';
        const meta = `Account name,Account ID,Campaign name,Campaign ID,Month,Amount spent (GBP),Campaign budget,Campaign budget type,Ad set start,Ad set end\nBoots,111,Summer campaign,${campaignId},2026-06-01,100,100,Lifetime,2026-06-01,2026-06-30`;
        const prisma = `Client name,Partner account id,Partner line id,Period,PLANNED_AMOUNT,Campaign name,Partner,Currency code,Placement number,Buy number,Product name,Placement name,Placement creator,Order current status,Integrated status,Delivery status,Flight status,Period status,Days in Flight start date,Years in Flight end date\nBoots,111,${campaignId},Jun 2026,90,Summer campaign,Facebook,GBP,P1,B1,Opticians,Summer campaign,Alice,Approved,Integrated,Delivered,Completed,Closed,1/6/26,30/6/26`;
        const drop = (id, name, contents) => {
            const event = new w.Event('drop', { bubbles: true, cancelable: true });
            Object.defineProperty(event, 'dataTransfer', { value: { files: [{ name, size: contents.length, type: 'text/csv', text: async () => contents }], types: ['Files'] } });
            w.document.getElementById(id).dispatchEvent(event);
        };
        drop('metaDropZone', 'meta.csv', meta);
        drop('prismaDropZone', 'prisma.csv', prisma);
        await new Promise(resolve => w.setTimeout(resolve, 0));
        expect(w.document.getElementById('continueToScope').disabled).toBe(false);
        w.document.getElementById('continueToScope').click();
        w.document.getElementById('asOfDate').value = '2026-07-15';
        w.document.getElementById('runComparison').click();
        expect(w.document.getElementById('validationMessages').textContent).toBe('');
        expect(w.document.getElementById('results').classList.contains('hidden')).toBe(false);
        expect(w.document.getElementById('reportBody').textContent).toContain('Summer campaign');
        expect(w.document.getElementById('reportBody').textContent).toContain('Spend update needed');
        expect(w.document.getElementById('monthFromFilter').value).toBe('2026-06');
        w.document.getElementById('downloadReport').click();
        expect(downloads).toHaveLength(1);
        const csv = await downloads[0].text();
        expect(csv).toContain(campaignId);
        expect(csv).toContain('Spend update needed: Meta spend exceeds Prisma booking');
        expect(csv).toContain('GBP');
    } finally { w.close(); }
});

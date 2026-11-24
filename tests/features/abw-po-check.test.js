const path = require('path');
const { JSDOM } = require('jsdom');
const { readScript } = require('../helpers/read-script');

test.each([
    { references: ['1169037', '0001169037'], matched: '1169037', campaignCode: '93' },
    { references: ['0001169037'], matched: '0001169037', campaignCode: '93' },
    { references: ['1169037'], matched: '1169037', campaignCode: null },
])('checks PO $matched, prioritizing exact references and merging campaign allocations', async ({ references, matched, campaignCode }) => {
    const params = new URLSearchParams({ client:'CW7',product:'3',po:'1169037',start:'01/10/2026',end:'31/12/2026',total:'105 000',plan:'101 631,7' });
    const dom = new JSDOM('<body></body>',{url:'https://go.mediaocean.com/robots.txt#abw-check-po?'+params,runScripts:'outside-only'});
    try {
        const w = dom.window;
        w.chrome = {runtime:{sendMessage:async () => ({context:'test-context'}),getURL:path => 'chrome-extension://test/' + path}};
        const row = {reference:'1169037',serial:76349,clientCode:'CW7',productCode:'3',mediaCode:'D',amount:101631,currencyCode:'GBP',startDate:'2026-10-01',endDate:'2026-12-31',status:'Approved'};
        const rows = references.flatMap(reference => [{ ...row, reference }, { ...row, reference, estimateCode: campaignCode }]);
        w.fetch = jest.fn().mockResolvedValue({ok:true,json:async()=>[...rows,{...row,reference:'other'}]});
        w.eval(readScript(path.resolve(__dirname,'../../features/abw-po-verdict.js')));
        w.eval(readScript(path.resolve(__dirname,'../../features/abw-po-check.js')));
        const form=w.document.querySelector('form');
        expect(w.document.querySelector('link[rel="icon"]').href).toBe('chrome-extension://test/icon.png');
        expect(form.checkValidity()).toBe(true);
        expect(w.document.querySelector('.abw-po-progress').textContent).toBe('Connecting to Prisma…');
        await new Promise(resolve => setImmediate(resolve));
        expect(w.document.querySelector('.abw-po-progress')).toBeNull();
        expect(w.fetch).toHaveBeenCalledTimes(1);
        expect(w.fetch.mock.calls[0][1].headers['x-mo-context']).toBe('test-context');
        expect(JSON.parse(w.fetch.mock.calls[0][1].body)).toEqual({clientBusinessKey:'UK|A1|D|CW7',mediaCode:'D',productCode:'3',startDate:'2026-10-01',endDate:'2026-12-31'});
        expect(w.document.querySelectorAll('h2')).toHaveLength(1);
        expect(w.document.querySelector('h2').textContent).toBe('PO ' + matched);
        expect(w.document.querySelector('main > section > .abw-po-warning').textContent).toBe('Review PO');
        const approvedBooking = { media:'D',client:'CW7',product:'3',po:'1169037',start:'2026-10-01',end:'2026-12-31',total:'101631',plan:'101631' };
        expect(w.abwPoVerdict.compare([row], approvedBooking).status).toBe('checked');
        expect(w.abwPoVerdict.compare([{ ...row, isMultiline: true }], approvedBooking).status).toBe('review');
        const clientWide = { ...row, productCode: '' };
        expect(w.abwPoVerdict.compare([clientWide], approvedBooking)).toMatchObject({ status: 'checked', anyProduct: true });
        expect(w.abwPoVerdict.compare([clientWide], { ...approvedBooking, product: '' }).status).toBe('checked');
        const restricted = [row, { ...row, productCode: '8' }];
        for (const product of ['', '9']) {
            expect(w.abwPoVerdict.compare(restricted, { ...approvedBooking, product })).toMatchObject({
                status: 'review', anyProduct: false, allowedProducts: ['3', '8'],
            });
        }
        expect(w.document.body.textContent.includes('using the leading-zero variant')).toBe(matched.startsWith('0'));
        expect(w.document.querySelector('main').classList.contains('abw-po-has-result')).toBe(true);
        expect(w.document.body.textContent).not.toContain('Lookup ran in');
        const campaign = campaignCode ? 'Campaign ' + campaignCode : 'No campaign booking returned for this allocation';
        for (const text of ['✓ Exact date match','01/10/202631/12/2026','£3,369.00 below','exceeds MX PO amount by £0.70','Available balance unverified',campaign,'✓ Approved']) {
            expect(w.document.body.textContent).toContain(text);
        }
    } finally {dom.window.close();}
});

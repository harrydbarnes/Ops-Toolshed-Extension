const path = require('path');
const { JSDOM } = require('jsdom');
const { readScript } = require('../helpers/read-script');

test('checks the exact PO, flight and amounts without double-counting estimate rows', async () => {
    const params = new URLSearchParams({ media:'D',client:'CW7',product:'3',po:'1169037',start:'01/10/2026',end:'31/12/2026',total:'105 000',plan:'101 631,7' });
    const dom = new JSDOM('<body></body>',{url:'https://go.mediaocean.com/robots.txt#abw-check-po?'+params,runScripts:'outside-only'});
    try {
        const w = dom.window;
        const row = {reference:'1169037',serial:76349,clientCode:'CW7',productCode:'3',mediaCode:'D',amount:101631,currencyCode:'GBP',startDate:'2026-10-01',endDate:'2026-12-31',status:'Approved'};
        w.fetch = jest.fn().mockResolvedValue({ok:true,json:async()=>[row,{...row,estimateCode:'93'},{...row,reference:'other'}]});
        w.eval(readScript(path.resolve(__dirname,'../../features/abw-po-check.js')));
        const form=w.document.querySelector('form');
        expect(form.checkValidity()).toBe(true);
        await form.onsubmit({preventDefault(){}});
        expect(JSON.parse(w.fetch.mock.calls[0][1].body)).toEqual({clientBusinessKey:'UK|A1|D|CW7',mediaCode:'D',productCode:'3',startDate:'2026-10-01',endDate:'2026-12-31'});
        expect(w.document.querySelectorAll('h2')).toHaveLength(1);
        for (const text of ['Exact date match','£3,369.00 below','exceeds MX amount by £0.70','Available balance unverified']) expect(w.document.body.textContent).toContain(text);
    } finally {dom.window.close();}
});

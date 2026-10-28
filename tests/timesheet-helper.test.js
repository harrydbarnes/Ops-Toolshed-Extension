const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { readScript } = require('./helpers/read-script');

const html = fs.readFileSync(path.join(__dirname, '../timesheet-helper.html'), 'utf8');
const script = readScript(path.join(__dirname, '../timesheet-helper.js'));
const calculation = readScript(path.join(__dirname, '../timesheet-allocation.js'));
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

test('maps activity, preserves manual time and requires a fresh preview before applying', async () => {
    const dom = new JSDOM(html, { url: 'https://extension.test/timesheet-helper.html', runScripts: 'outside-only' });
    const d = dom.window.document;
    const store = { timesheetWeeks: {}, timesheetMappings: {}, timesheetActivity: { '2026-10-27': { 'N88 / 1': 300 } }, timesheetSummer: { 2026: ['2026-06-01','2026-08-28'] }, timesheetTrackingEnabled: false };
    dom.window.chrome = { storage: { local: { get: async defaults => ({...defaults,...store}), set: async data => Object.assign(store,data) }, onChanged: { addListener() {} } }, runtime: { sendMessage: async () => ({status:'ok'}) } };
    dom.window.confirm = () => true;
    dom.window.structuredClone = structuredClone;
    dom.window.eval(calculation); dom.window.eval(script); await flush();
    const week = d.getElementById('week'); week.value = '2026-10-26'; week.dispatchEvent(new dom.window.Event('change'));
    d.getElementById('new-code').value = 'N87 | 90'; d.getElementById('new-label').value = 'Nuffield'; d.getElementById('add-row').click();
    const map = d.querySelector('#mappings select'); map.value = 'N87 | 90'; map.dispatchEvent(new dom.window.Event('change'));
    const input = d.querySelector('input[aria-label^="NCBAU, Tue"]'); input.value = '2'; input.dispatchEvent(new dom.window.Event('change'));
    d.getElementById('estimate-day').value = '2026-10-27'; d.getElementById('estimate-day').dispatchEvent(new dom.window.Event('change'));
    d.getElementById('preview').click(); expect(d.getElementById('estimate').textContent).toContain('N87 | 90: +5.00');
    d.querySelector('#estimate button').click();
    expect(d.querySelector('input[aria-label^="N87 | 90, Tue"]').value).toBe('5');
    expect(d.querySelector('input[aria-label^="NCBAU, Tue"]').value).toBe('2');
    await flush(); expect(store.timesheetWeeks['2026-10-26'].rows.find(row => row.code === 'N87 | 90').hours['2026-10-27']).toBe(5);
    dom.window.close();
});

test('unmapped activity blocks estimates rather than distributing around it', async () => {
    const dom = new JSDOM(html, { url: 'https://extension.test/timesheet-helper.html', runScripts: 'outside-only' });
    dom.window.chrome = { storage: { local: { get: async defaults => ({...defaults, timesheetActivity: {'2026-10-27': {'N88 / 1': 15}}}), set: async () => {} }, onChanged: { addListener() {} } }, runtime: {} };
    dom.window.eval(calculation); dom.window.eval(script); await flush();
    const d = dom.window.document; d.getElementById('week').value = '2026-10-26'; d.getElementById('week').dispatchEvent(new dom.window.Event('change'));
    d.getElementById('estimate-day').value = '2026-10-27'; d.getElementById('estimate-day').dispatchEvent(new dom.window.Event('change')); d.getElementById('preview').click();
    expect(d.getElementById('activity-summary').textContent).toContain('15 sec');
    expect(d.getElementById('estimate').textContent).toMatch(/Map these Prisma codes/);
    dom.window.close();
});

test('reads group rows and leaves conflicting draft hours unchanged', async () => {
    const dom = new JSDOM(html, { url:'https://extension.test/timesheet-helper.html', runScripts:'outside-only' });
    const d = dom.window.document;
    const fixture = d.createElement('div'); fixture.innerHTML = '<div id="timesheetHeader"></div><div class="ht_master"><table class="htCore"><tbody><tr><td id="timeType-1">Example client</td><td id="formattedAccCode-1"></td></tr><tr><td id="formattedAccCode-2">ABC | 90</td><td id="accName-2">Retainer</td>' + ['Mon_26','Tue_27','Wed_28','Thu_29','Fri_30','Sat_31','Sun_01'].map((day,i) => `<td id="hoursList.hoursJson.${day}-2">${i === 1 ? '3.00' : '0.00'}</td>`).join('') + '</tr></tbody></table></div>';
    d.body.append(fixture); Object.defineProperty(d.getElementById('timesheetHeader'), 'innerText', { value:'26/10/2026 - 01/11/2026' });
    const store = { timesheetWeeks: { '2026-10-26': { rows: [{code:'ABC | 90', label:'Example', hours:{'2026-10-27':2}}] } } };
    dom.window.structuredClone = structuredClone;
    dom.window.chrome = { storage: { local: { get: async defaults => ({...defaults,...store}), set: async data => Object.assign(store,data) }, onChanged: {addListener(){}} }, tabs: {query: async () => [{id:1,url:'https://go.mediaocean.com/viewport-home/#route=time/display/timesheet&end=20261101'}]}, scripting: {executeScript: async ({func,args}) => [{result:func(...args)}]}, runtime:{} };
    dom.window.eval(calculation); dom.window.eval(script); await flush();
    d.getElementById('week').value='2026-10-26'; d.getElementById('week').dispatchEvent(new dom.window.Event('change'));
    d.getElementById('read-production').click(); await flush(); await flush();
    expect(d.getElementById('status').textContent).toContain('1 conflicts left unchanged');
    expect(d.querySelector('input[aria-label^="ABC | 90, Tue"]').value).toBe('2');
    dom.window.close();
});

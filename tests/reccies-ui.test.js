const path = require('path');
const fs = require('fs');
const {JSDOM} = require('jsdom');
const {readScript} = require('./helpers/read-script');
const core = require('../reccie-core');
const flush = () => new Promise(resolve => setImmediate(resolve));
const html = fs.readFileSync(path.resolve(__dirname,'../reccies.html'),'utf8');
const base = {sourceRow:2,dNumber:'D03120200',campaignId:'CP3G9KS',month:'2026-09',buyer:'Buyer',ops:'Harry',group:'Harry',client:'Client',campaignName:'Campaign',supplier:'Supplier',order:'Order',comments:'',gross:'10',reccied:'No',issue:''};
const initial = () => ({revision:'test',month:'2026-09',source:{type:'csv'},importedAt:'2026-10-20T12:00:00Z',rows:[{...base},{...base,sourceRow:3,dNumber:'D03144023',reccied:'Yes',supplier:'<img src=x onerror=alert(1)>'},{...base,sourceRow:4,dNumber:'D03144020',ops:'Other'}],checks:{}});
function setStatuses(win,...statuses) {
    win.document.getElementById('tracker-status').value=statuses.includes('outstanding')?'outstanding':statuses.includes('reconciled')?'reconciled':'any';
    const inputs=[...win.document.querySelectorAll('[data-status]')];
    inputs.forEach(input=>{input.checked=statuses.includes(input.dataset.status);});
    inputs[0].dispatchEvent(new win.Event('change'));
}
function setGrouping(win,value) {
    win.document.getElementById('show-by').value=value;
    win.document.getElementById('show-by').dispatchEvent(new win.Event('change'));
}
function create(preferences={}) {
    const dom = new JSDOM(html,{url:'https://extension.test/reccies.html',runScripts:'dangerously',pretendToBeVisual:true});
    const win=dom.window;
    let data={reccieTracker:initial(),recciePreferences:{person:'Harry',assignment:'ops',showBy:'dnumber',trackerStatus:'outstanding',statuses:[],...preferences}};
    if ('statuses' in preferences && !('trackerStatus' in preferences)) data.recciePreferences.trackerStatus='any';
    win.reccieCore=core;
    win.chrome={storage:{local:{get:jest.fn(async()=>data),set:jest.fn(async values=>Object.assign(data,values))}},permissions:{request:jest.fn(async()=>true)},runtime:{sendMessage:jest.fn(async request=>{
        if(request.operation==='check') {
            request.rowIds.forEach(id=>{data.reccieTracker.checks[id]={state:'ready',reconciled:'1',buyStatus:'SUCCESSFUL',checkedAt:'2026-10-20T13:00:00Z'};});
            const method=core.verificationMethod(request.method);
            data.reccieTracker.lastCheckTiming={method,concurrency:method.concurrency,campaignsDetail:[],retries:0};
        }
        return {status:'success',tracker:data.reccieTracker};
    })}};
    win.eval(readScript(path.resolve(__dirname,'../search-highlight.js')));
    win.eval(readScript(path.resolve(__dirname,'../reccies.js')));
    return {dom,win,getData:()=>data};
}
describe('Reccies sidebar',()=>{
    test('runs the private identity test through the worker only after site permission',async()=>{
        const {dom,win}=create();
        try {
            await flush();
            win.chrome.runtime.sendMessage.mockResolvedValue({status:'success',connection:{readOnly:true,email:'test@example.com',transport:'extension-service-worker'}});
            win.document.getElementById('test-google-connection').click(); await flush();
            expect(win.chrome.permissions.request).toHaveBeenCalledWith({origins:['https://script.google.com/*','https://script.googleusercontent.com/*']});
            expect(win.chrome.runtime.sendMessage).toHaveBeenLastCalledWith({action:'reccies',operation:'testGoogleConnection'});
            expect(win.document.getElementById('google-connection-result').textContent).toContain('extension-service-worker');
            win.chrome.permissions.request.mockResolvedValue(false);
            win.chrome.runtime.sendMessage.mockClear();
            win.document.getElementById('test-google-connection').click(); await flush();
            expect(win.chrome.runtime.sendMessage).not.toHaveBeenCalled();
            expect(win.document.getElementById('google-connection-result').textContent).toContain('not granted');
        } finally { dom.window.close(); }
    });
    test('switches modes without network discovery and keeps assignment preferences separate',async()=>{
        const {dom,win,getData}=create();
        try {
            await flush(); const doc=win.document, main=getData().reccieTracker;
            const auto={...initial(),revision:'automatic',month:core.currentMonth(),source:{type:'automatic',eligibleCampaigns:2,attemptedCampaigns:2,successfulCampaigns:1,issues:[{campaignId:'CPFAIL',message:'Access denied <img src=x>'}]},rows:[{...base,ops:'',buyer:'',group:'',reccied:'',month:core.currentMonth()}],checks:{2:{state:'ready',reconciled:'1',buyStatus:'SUCCESSFUL'}}};
            win.chrome.runtime.sendMessage.mockImplementation(async request=>({status:'success',tracker:request.mode==='automatic'?auto:request.mode==='early'?null:main}));
            doc.querySelector('#source-segments [data-value=automatic]').click(); await flush();
            expect(win.chrome.runtime.sendMessage).toHaveBeenLastCalledWith({action:'reccies',operation:'load',mode:'automatic',month:core.currentMonth()});
            expect(doc.getElementById('source-details').hidden).toBe(true);
            expect(doc.getElementById('sheet-connection').hidden).toBe(true);
            expect(doc.getElementById('source-summary').textContent).toBe('Reccie tracking settings');
            expect(doc.getElementById('forget-report').closest('details').id).toBe('debug');
            expect(doc.getElementById('assignment-fields').hidden).toBe(true);
            expect(doc.getElementById('tracker-status').hidden).toBe(true);
            expect(doc.querySelectorAll('.reccie-card')).toHaveLength(1);
            expect(doc.getElementById('summary').textContent).toContain('assignment unknown');
            expect(doc.getElementById('coverage-issues').textContent).toContain('CPFAIL: Access denied <img src=x>');
            expect(doc.getElementById('coverage-issues').querySelector('img')).toBeNull();
            expect(doc.getElementById('report-month').disabled).toBe(true);
            doc.querySelector('[data-status=ready]').click(); await flush();
            expect(getData()[`${core.trackerKey('automatic',core.currentMonth())}:preferences`].statuses).toEqual(['ready']);
            doc.querySelector('#source-segments [data-value=main]').click(); await flush();
            expect(doc.getElementById('person').value).toBe('Harry');
            expect(doc.getElementById('tracker-status').value).toBe('outstanding');
            expect(doc.getElementById('report-month').disabled).toBe(false);
            expect(getData().reccieTracker).toEqual(main);
            doc.querySelector('#source-segments [data-value=early]').click(); await flush();
            expect(doc.getElementById('sheet-hint').textContent).toContain('Early Reccie report');
            expect(doc.getElementById('discover-campaigns').textContent).toContain('fallback');
        } finally {dom.window.close();}
    });
    test('uses Settings pill styles for side-by-side filters, persists clicks and supports arrow keys',async()=>{
        const {dom,win,getData}=create();
        try {
            await flush(); const doc=win.document;
            expect(doc.querySelector('.view-controls #show-by-segments')).not.toBeNull();
            expect(doc.querySelector('.view-controls #tracker-status-segments')).not.toBeNull();
            expect(doc.getElementById('show-by').hidden).toBe(true);
            expect(doc.getElementById('tracker-status').hidden).toBe(true);
            expect(doc.querySelector('link[href="segmented-control.css"]')).not.toBeNull();
            const settings=fs.readFileSync(path.resolve(__dirname,'../settings.html'),'utf8');
            expect(settings).toContain('href="segmented-control.css"');
            const campaign=doc.querySelector('#show-by-segments [data-value=campaign]');
            campaign.click(); await flush();
            expect(campaign.getAttribute('aria-pressed')).toBe('true');
            expect(campaign.tabIndex).toBe(0);
            expect(getData().recciePreferences.showBy).toBe('campaign');
            expect(doc.querySelectorAll('.campaign-card')).toHaveLength(1);
            const reconciled=doc.querySelector('#tracker-status-segments [data-value=reconciled]');
            reconciled.click(); await flush();
            expect(getData().recciePreferences.trackerStatus).toBe('reconciled');
            expect(doc.querySelector('.campaign-d-numbers').textContent).toBe('D03144023');
            reconciled.dispatchEvent(new win.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})); await flush();
            const any=doc.querySelector('#tracker-status-segments [data-value=any]');
            expect(doc.activeElement).toBe(any);
            expect(any.getAttribute('aria-pressed')).toBe('true');
            expect(reconciled.tabIndex).toBe(-1);
            expect(getData().recciePreferences.trackerStatus).toBe('any');
        } finally {dom.window.close();}
    });
    test('new users start with all statuses and D number grouping',async()=>{
        const {dom,win}=create({statuses:undefined});
        try {
            await flush();expect(win.document.getElementById('forget-report').closest('details').id).toBe('debug');
            expect(win.document.getElementById('sheet-connection').hidden).toBe(false);
            expect(win.document.getElementById('source-summary').textContent).toBe('Reccie tracking settings');
            expect(win.document.getElementById('forget-report').textContent).toBe('Clear saved report data');
            expect(win.document.getElementById('debug').open).toBe(false);
            expect(win.document.querySelectorAll('[data-status]:checked')).toHaveLength(0);
            expect(win.document.getElementById('show-by').value).toBe('dnumber');
            expect(win.document.querySelectorAll('.reccie-card')).toHaveLength(2);
        } finally {dom.window.close();}
    });
    test.each(['all','campaigns','outstanding','reconciled','mismatch','ready','review'])('migrates legacy %s preferences into independent controls',async view=>{
        const {dom,win,getData}=create({view,showBy:undefined,trackerStatus:undefined,statuses:undefined});
        try {
            await flush();const statuses=['mismatch','ready','review'].includes(view)?[view]:[];
            const trackerStatus=['outstanding','reconciled'].includes(view)?view:'any';
            expect(win.document.getElementById('tracker-status').value).toBe(trackerStatus);
            expect(win.document.getElementById('show-by').value).toBe(view==='campaigns'?'campaign':'dnumber');
            expect([...win.document.querySelectorAll('[data-status]:checked')].map(input=>input.dataset.status)).toEqual(statuses);
            expect(getData().recciePreferences).toEqual({person:'Harry',assignment:'ops',showBy:view==='campaigns'?'campaign':'dnumber',trackerStatus,statuses});
        } finally {dom.window.close();}
    });
    test('combines tracker AND Prisma status, keeps Prisma chips OR and explains campaign attention issues',async()=>{
        const {dom,win,getData}=create({trackerStatus:'any',statuses:[]});
        try {
            await flush();const doc=win.document,data=getData();
            data.reccieTracker.rows=Array.from({length:5},(_,index)=>({...base,sourceRow:index+2,dNumber:`D${index}`,reccied:index?'Yes':'No',campaignId:index<2?'CPONE':index===2?'CPTWO':'',campaignName:index<2?'First':index===2?'Second':''}));
            data.reccieTracker.rows[4].issue='Missing campaign ID';
            data.reccieTracker.checks={2:{state:'ready',reconciled:'1',buyStatus:'SUCCESSFUL'},3:{state:'ready',reconciled:'1',buyStatus:'SUCCESSFUL'},4:{state:'outstanding',reconciled:'1',buyStatus:'PENDING'},5:{state:'error',message:'Access denied <img src=x onerror=alert(1)>'}};
            setGrouping(win,'campaign');
            expect(doc.querySelectorAll('.campaign-card')).toHaveLength(3);
            expect(doc.getElementById('summary').textContent).toContain('3 campaigns · 5 D numbers shown');
            expect(doc.querySelector('.badge.mismatch').textContent).toBe('Prisma mismatch');
            expect(doc.querySelector('.mismatch-warning').textContent).toContain('D2 · Buy status: Pending');
            const tracker=value=>{doc.getElementById('tracker-status').value=value;doc.getElementById('tracker-status').dispatchEvent(new win.Event('change'));};
            tracker('outstanding');doc.querySelector('[data-status="ready"]').click();
            expect(doc.querySelector('.campaign-d-numbers').textContent).toBe('D0');
            tracker('reconciled');expect(doc.querySelector('.campaign-d-numbers').textContent).toBe('D1');
            doc.querySelector('[data-status="review"]').click();
            expect(doc.querySelectorAll('.campaign-card')).toHaveLength(2);
            const attention=doc.querySelector('.campaign-attention');
            expect(attention.textContent).toContain('D3 · Access denied <img');expect(attention.textContent).toContain('D4 · Missing campaign ID');
            expect(attention.querySelector('img')).toBeNull();
            doc.getElementById('search').value='D3';doc.getElementById('search').dispatchEvent(new win.Event('input'));
            expect(doc.querySelector('.campaign-d-numbers').textContent).toBe('D3');
            doc.getElementById('clear-filters').click();
            expect(doc.getElementById('tracker-status').value).toBe('any');expect(doc.querySelectorAll('[data-status]:checked')).toHaveLength(0);
            expect(doc.getElementById('show-by').value).toBe('campaign');expect(doc.getElementById('search').value).toBe('');
            expect(doc.querySelectorAll('.campaign-card')).toHaveLength(3);expect(doc.getElementById('clear-filters').hidden).toBe(true);
            setStatuses(win,'mismatch');doc.getElementById('check-rows').click();await flush();await flush();
            expect(win.chrome.runtime.sendMessage).toHaveBeenCalledWith({action:'reccies',operation:'check',revision:'test',rowIds:[4],method:'workers-8'});
            expect(doc.getElementById('message').textContent).toContain('Checked 1 campaign · 1 D number; 0 campaigns · 0 D numbers now shown');
        } finally {dom.window.close();}
    });
    test('migrates old mixed OR filters with an explanation and treats opposite tracker filters as Any',async()=>{
        for(const statuses of [['outstanding','ready'],['outstanding','reconciled','review']]) {
            const {dom,win}=create({trackerStatus:undefined,statuses});
            try {
                await flush();const both=statuses.includes('reconciled');
                expect(win.document.getElementById('tracker-status').value).toBe(both?'any':'outstanding');
                expect(win.document.querySelector('[data-status="ready"]').checked).toBe(!both);
                expect(win.document.querySelector('[data-status="review"]').checked).toBe(false);
                if(!both) expect(win.document.getElementById('message').textContent).toContain('both the tracker status');
            } finally {dom.window.close();}
        }
    });
    test('shows only confirmed sheet-Yes mismatches, explains both conditions and removes resolved rows',async()=>{
        const {dom,win,getData}=create();
        try {
            await flush();const doc=win.document,data=getData();
            data.reccieTracker.rows=Array.from({length:11},(_,index)=>({...base,sourceRow:index+2,dNumber:`D${index}`,reccied:'Yes'}));
            data.reccieTracker.rows[1].reccied='yes';data.reccieTracker.rows[2].reccied='YES';
            data.reccieTracker.rows[4].reccied='No';data.reccieTracker.rows[8].issue='Duplicate D number in report';data.reccieTracker.rows[9].ops='Other';
            data.reccieTracker.checks={
                2:{state:'outstanding',reconciled:'0',buyStatus:'SUCCESSFUL'},
                3:{state:'outstanding',reconciled:'1',buyStatus:'PENDING'},
                4:{state:'outstanding',reconciled:'0',buyStatus:'FAILED'},
                5:{state:'ready',reconciled:'1',buyStatus:'SUCCESSFUL'},
                6:{state:'outstanding',reconciled:'0',buyStatus:'FAILED'},
                8:{state:'error'},9:{state:'review'},
                10:{state:'outstanding',reconciled:'0',buyStatus:'FAILED'},
                11:{state:'outstanding',reconciled:'0',buyStatus:'FAILED'},
                12:{state:'outstanding',reconciled:'1',buyStatus:'SUCCESSFUL'}
            };
            setStatuses(win,'mismatch');
            expect([...doc.querySelectorAll('.card-top strong')].map(node=>node.textContent)).toEqual(['D0','D1','D2']);
            expect([...doc.querySelectorAll('.badge.mismatch')].map(node=>node.textContent)).toEqual(['Prisma mismatch','Prisma mismatch','Prisma mismatch']);
            expect(win.chrome.storage.local.set).toHaveBeenCalledWith({recciePreferences:{person:'Harry',assignment:'ops',showBy:'dnumber',trackerStatus:'any',statuses:['mismatch']}});
            doc.getElementById('search').value='D1';doc.getElementById('search').dispatchEvent(new win.Event('input'));
            expect(doc.querySelectorAll('.reccie-card')).toHaveLength(1);
            doc.getElementById('search').value='';doc.getElementById('search').dispatchEvent(new win.Event('input'));
            doc.getElementById('check-rows').click();await flush();await flush();
            expect(win.chrome.runtime.sendMessage).toHaveBeenCalledWith({action:'reccies',operation:'check',revision:'test',rowIds:[2,3,4],method:'workers-8'});
            expect(doc.querySelectorAll('.reccie-card')).toHaveLength(0);
            expect(doc.getElementById('rows').textContent).toContain('Unchecked, failed and review items are not included');
            expect(data.reccieTracker.rows[0].reccied).toBe('Yes');
        } finally { dom.window.close(); }
    });
    test('restores the mismatch filter and explains how to check tracker-Yes rows first',async()=>{
        const {dom,win}=create({statuses:['mismatch']});
        try {
            await flush();expect(win.document.querySelector('[data-status="mismatch"]').checked).toBe(true);
            expect(win.document.querySelectorAll('.reccie-card')).toHaveLength(0);
            expect(win.document.getElementById('rows').textContent).toContain('Select Reconciled and verify');
        } finally { dom.window.close(); }
    });
    test('keeps Debug collapsed at the bottom with timings, download and a 1–20 slider',()=>{
        const dom=new JSDOM(html);
        try {
            const doc=dom.window.document,debug=doc.getElementById('debug'),slider=doc.getElementById('debug-workers');
            expect(doc.querySelector('main').lastElementChild).toBe(debug);
            expect(debug.open).toBe(false);
            expect(debug.querySelector('summary').textContent).toBe('Debug');
            expect(slider.type).toBe('range');expect(slider.min).toBe('1');expect(slider.max).toBe('20');expect(slider.step).toBe('1');expect(slider.value).toBe('8');
            expect(debug.contains(doc.getElementById('timing-details'))).toBe(true);
            expect(debug.contains(doc.getElementById('download-timings'))).toBe(true);
            expect(doc.querySelector('[data-verification-method]')).toBeNull();
        } finally { dom.window.close(); }
    });
    test('debug worker selection does not change the normal eight-worker default',async()=>{
        const {dom,win}=create();
        try {
            await flush();const doc=win.document;
            doc.getElementById('debug-workers').value='1';doc.getElementById('debug-run').click();await flush();await flush();
            doc.getElementById('check-rows').click();await flush();await flush();
            expect(win.chrome.runtime.sendMessage.mock.calls.map(([request])=>request.method)).toEqual(['workers-1','workers-8']);
        } finally { dom.window.close(); }
    });
    test('verification animations have a static reduced-motion alternative',()=>{
        const dom=new JSDOM(html);
        try {
            const style=dom.window.document.createElement('style');
            style.textContent=fs.readFileSync(path.resolve(__dirname,'../reccies.css'),'utf8');
            dom.window.document.head.append(style);
            const tail=dom.window.document.createElement('span');tail.className='reccie-status-tail';tail.textContent='once...';
            dom.window.document.body.append(tail);
            expect(dom.window.getComputedStyle(tail).whiteSpace).toBe('nowrap');
            expect(dom.window.getComputedStyle(tail).display).toBe('inline-block');
            const rules=[...style.sheet.cssRules];
            const animations=rules.filter(rule=>rule.name?.startsWith('reccie-status-')).map(rule=>rule.name);
            expect(animations).toEqual(expect.arrayContaining(['reccie-status-pulse','reccie-status-dot-two','reccie-status-dot-three']));
            const reduced=rules.find(rule=>rule.media?.mediaText.replace(/\s/g,'')==='(prefers-reduced-motion:reduce)');
            const overrides=[...reduced.cssRules];
            const dot=dom.window.document.createElement('span');dot.className='reccie-status-dot';
            const dots=dom.window.document.createElement('span');dots.className='reccie-status-dots';
            dots.innerHTML='<span>.</span><span>.</span><span>.</span>';
            for(const animated of [dot,...dots.querySelectorAll('span:nth-child(2),span:nth-child(3)')]) {
                expect(overrides.some(rule=>animated.matches(rule.selectorText) && rule.style.animation==='none' && rule.style.opacity==='1')).toBe(true);
            }
        } finally { dom.window.close(); }
    });
    test('does not label an older background worker as a successful four-worker comparison',async()=>{
        const {dom,win,getData}=create();
        try {
            await flush();
            win.chrome.runtime.sendMessage.mockImplementation(async()=>{
                getData().reccieTracker.lastCheckTiming={concurrency:3,campaignsDetail:[]};
                return {status:'success',tracker:getData().reccieTracker};
            });
            win.document.getElementById('debug-workers').value='4';win.document.getElementById('debug-run').click();await flush();await flush();
            expect(JSON.parse(win.document.getElementById('timing-report').textContent)).toMatchObject({methodConfirmed:false,outcome:'interrupted'});
            expect(win.document.getElementById('message').textContent).toContain('Reload Ops Toolshed');
            expect(win.document.getElementById('message').classList.contains('is-verifying')).toBe(false);
            expect(win.document.querySelector('.reccie-status-dot')).toBeNull();
            expect(win.document.getElementById('rows').getAttribute('aria-busy')).toBe('false');
        } finally { dom.window.close(); }
    });
    test.each([1,2,3,4,5,6,8,20])('debug slider uses %i workers, records the selection and prevents overlapping runs',async concurrency=>{
        const {dom,win,getData}=create();
        try {
            await flush();const doc=win.document;
            let finish;
            win.chrome.runtime.sendMessage.mockImplementation(request=>new Promise(resolve=>{finish=()=>{
                const method=core.verificationMethod(request.method);
                getData().reccieTracker.lastCheckTiming={method,concurrency:method.concurrency,campaignsDetail:[]};
                resolve({status:'success',tracker:getData().reccieTracker});
            };}));
            doc.getElementById('debug-workers').value=String(concurrency);
            doc.getElementById('debug-workers').dispatchEvent(new win.Event('input'));
            expect(doc.getElementById('debug-worker-count').value).toBe(String(concurrency));
            doc.getElementById('debug-run').click();
            expect(win.chrome.runtime.sendMessage).toHaveBeenCalledWith({action:'reccies',operation:'check',revision:'test',rowIds:[2],method:`workers-${concurrency}`});
            expect([...doc.querySelectorAll('#debug-run,#debug-workers,#check-rows,.segmented-control button')].every(button=>button.disabled)).toBe(true);
            expect(doc.getElementById('message').classList.contains('is-verifying')).toBe(true);
            expect(doc.querySelector('.reccie-status-dot').getAttribute('aria-hidden')).toBe('true');
            expect(doc.querySelector('.reccie-status-dots').getAttribute('aria-hidden')).toBe('true');
            expect(doc.querySelectorAll('.reccie-status-dots span')).toHaveLength(3);
            expect(doc.getElementById('message').textContent).toContain(`Verifying reccie status · 1 row · ${concurrency} campaigns at once`);
            expect(doc.querySelector('.reccie-status-dots').parentElement.className).toBe('reccie-status-tail');
            expect(doc.querySelector('.reccie-status-tail').firstChild.textContent).toBe('once');
            expect(doc.getElementById('check-rows').getAttribute('aria-busy')).toBe('true');
            expect(doc.getElementById('rows').getAttribute('aria-busy')).toBe('true');
            doc.getElementById('check-rows').click();
            expect(win.chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
            finish();await flush();await flush();
            expect(JSON.parse(doc.getElementById('timing-report').textContent)).toMatchObject({method:core.verificationMethod(`workers-${concurrency}`),methodConfirmed:true,concurrency,
                selection:{trackerRevision:'test',reportMonth:'2026-09',person:'Harry',assignment:'ops',showBy:'dnumber',trackerStatus:'outstanding',statuses:[],search:'',rowIds:[2]}});
            expect([...doc.querySelectorAll('#debug-run,#debug-workers')].every(button=>!button.disabled)).toBe(true);
            expect(doc.querySelector('.reccie-status-dot')).toBeNull();
            expect(doc.querySelector('.reccie-status-dots')).toBeNull();
            expect(doc.getElementById('message').classList.contains('is-verifying')).toBe(false);
            expect(doc.getElementById('rows').getAttribute('aria-busy')).toBe('false');
        } finally { dom.window.close(); }
    });
    test('checks 372 rows across more than ten campaigns in one queue and retains downloadable diagnostics',async()=>{
        const {dom,win,getData}=create();
        try {
            await flush();
            const data=getData(), doc=win.document;
            data.reccieTracker.rows=Array.from({length:372},(_,index)=>({...base,sourceRow:index+2,campaignId:`CPTEST${Math.floor(index/31)}`}));
            win.chrome.runtime.sendMessage.mockImplementation(async request=>{
                const campaigns=new Set(data.reccieTracker.rows.filter(row=>request.rowIds.includes(row.sourceRow)).map(row=>row.campaignId));
                data.reccieTracker.lastCheckTiming={method:core.verificationMethod(request.method),concurrency:core.verificationMethod(request.method).concurrency,rows:request.rowIds.length,campaigns:campaigns.size,campaignsDetail:[...campaigns].map(campaign=>({campaign,outcome:'success',requests:[{phase:'lookup'},{phase:'grid'}]}))};
                return {status:'success',tracker:data.reccieTracker};
            });
            setStatuses(win);
            doc.getElementById('check-rows').click();
            await flush();await flush();
            const calls=win.chrome.runtime.sendMessage.mock.calls.map(([request])=>request);
            expect(calls.map(request=>request.rowIds.length)).toEqual([372]);
            const report=JSON.parse(doc.getElementById('timing-report').textContent);
            expect(report).toMatchObject({selectedRows:372,plannedBatches:1,completedBatches:1,requests:24,outcome:'completed',failedCampaigns:0});
            expect(doc.getElementById('timing-details').hidden).toBe(false);
            expect(data.reccieLastRunTiming).toEqual({revision:'test',report});
            expect(doc.getElementById('message').textContent).toContain('Check finished in');
            win.URL.createObjectURL=jest.fn(()=> 'blob:timings');
            win.URL.revokeObjectURL=jest.fn();
            const click=jest.spyOn(win.HTMLAnchorElement.prototype,'click').mockImplementation(function(){
                expect(this.download).toMatch(/^reccie-timings-workers-8-[0-9T-]+\.md$/);
                expect(this.href).toBe('blob:timings');
            });
            const schedule=jest.spyOn(win,'setTimeout').mockImplementation(()=>1);
            expect(doc.getElementById('download-timings').disabled).toBe(false);
            doc.getElementById('download-timings').click();
            expect(click).toHaveBeenCalledTimes(1);
            const blob=win.URL.createObjectURL.mock.calls[0][0];
            expect(blob.type).toBe('text/markdown;charset=utf-8');
            const markdown=await new Promise((resolve,reject)=>{
                const reader=new win.FileReader();
                reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsText(blob);
            });
            expect(JSON.parse(markdown.split('```json\n')[1].split('\n```')[0])).toEqual(report);
            expect(markdown).toContain('Method: 8 concurrent campaign checks');
            expect(doc.querySelector('a[download]')).toBeNull();
            expect(schedule).toHaveBeenCalledWith(expect.any(Function),1000);
            schedule.mock.calls[0][0]();
            expect(win.URL.revokeObjectURL).toHaveBeenCalledWith('blob:timings');
        } finally { dom.window.close(); }
    });
    test('separates grouping from optional status chips with no checked HTML defaults',()=>{
        const dom=new JSDOM(html);
        try {
            const doc=dom.window.document;
            expect([...doc.querySelectorAll('#show-by option')].map(option=>option.textContent)).toEqual(['D number','Campaign']);
            expect([...doc.querySelectorAll('[data-status]')].map(input=>input.parentElement.textContent.trim())).toEqual(['Yes in sheet, not in Prisma','Ready in Prisma','Needs attention']);
            expect(doc.querySelectorAll('[data-status]:checked')).toHaveLength(0);
            expect(doc.getElementById('show-by').value).toBe('dnumber');
            expect(doc.getElementById('view')).toBeNull();
        } finally {dom.window.close();}
    });
    test('retains row limits and aggregates retry diagnostics across larger runs',async()=>{
        const {dom,win,getData}=create();
        try {
            await flush();const data=getData(),doc=win.document;
            data.reccieTracker.rows=Array.from({length:620},(_,index)=>({...base,sourceRow:index+2,campaignId:`CPTEST${Math.floor(index/10)}`}));
            win.chrome.runtime.sendMessage.mockImplementation(async request=>{
                data.reccieTracker.lastCheckTiming={method:core.verificationMethod(request.method),concurrency:core.verificationMethod(request.method).concurrency,retries:1,cacheHits:0,campaignsDetail:[{outcome:'success',requests:[{phase:'lookup'},{phase:'grid',ok:false},{phase:'grid',ok:true}]}]};
                return {status:'success',tracker:data.reccieTracker};
            });
            setStatuses(win);
            doc.getElementById('check-rows').click();await flush();await flush();
            expect(win.chrome.runtime.sendMessage.mock.calls.map(([request])=>request.rowIds.length)).toEqual([500,120]);
            expect(JSON.parse(doc.getElementById('timing-report').textContent)).toMatchObject({selectedRows:620,plannedBatches:2,completedBatches:2,requests:6,retries:2});
        } finally { dom.window.close(); }
    });
    test('groups assigned matching rows by campaign and verifies only matching D numbers',async()=>{
        const {dom,win}=create();await flush();
        const doc=win.document;
        setStatuses(win);setGrouping(win,'campaign');
        expect(doc.querySelectorAll('.campaign-card')).toHaveLength(1);
        expect(doc.querySelector('.campaign-title').textContent).toBe('Campaign');
        expect(doc.querySelector('.campaign-card').textContent).toContain('2 D numbers');
        expect(doc.querySelector('.campaign-d-numbers').textContent).toBe('D03120200, D03144023');
        doc.getElementById('search').value='d03120200';doc.getElementById('search').dispatchEvent(new win.Event('input'));
        expect(doc.querySelector('.campaign-d-numbers mark').textContent).toBe('D03120200');
        expect(doc.querySelector('.campaign-d-numbers').textContent).not.toContain('D03144023');
        expect(doc.querySelector('.campaign-card').textContent).toContain('1 D number');
        doc.getElementById('check-rows').click();await flush();await flush();
        expect(win.chrome.runtime.sendMessage).toHaveBeenCalledWith({action:'reccies',operation:'check',revision:'test',rowIds:[2],method:'workers-8'});
        dom.window.close();
    });
    test('uses the same tracker field for reconciled and unreconciled, retaining Prisma and review filters',async()=>{
        const {dom,win,getData}=create();await flush();const doc=win.document;
        getData().reccieTracker.checks={2:{state:'ready'},3:{state:'review',message:'D number not found for this month'}};
        const show=value=>setStatuses(win,value);
        show('reconciled');expect(doc.querySelectorAll('.reccie-card')).toHaveLength(1);expect(doc.getElementById('rows').textContent).toContain('D03144023');
        show('outstanding');expect(doc.getElementById('rows').textContent).toContain('D03120200');expect(doc.getElementById('rows').textContent).not.toContain('D03144023');
        show('ready');expect(doc.getElementById('rows').textContent).toContain('D03120200');
        show('review');expect(doc.getElementById('rows').textContent).toContain('please check in case of tracker issues, likely deleted');
        dom.window.close();
    });
    test('highlights search matches with the shared Campaign History helper without interpreting HTML',async()=>{
        const {dom,win}=create();await flush();const doc=win.document;
        const append=jest.spyOn(win.OpsToolshedSearchHighlight,'appendHighlightedText');
        setStatuses(win);
        doc.getElementById('search').value='<img';doc.getElementById('search').dispatchEvent(new win.Event('input'));
        expect(doc.querySelectorAll('.reccie-card')).toHaveLength(1);
        expect(doc.querySelector('.supplier mark').textContent).toBe('<img');
        expect(doc.querySelector('.reccie-card img')).toBeNull();
        expect(append).toHaveBeenCalled();
        doc.getElementById('search').value='';doc.getElementById('search').dispatchEvent(new win.Event('input'));
        expect(doc.querySelectorAll('mark')).toHaveLength(0);
        dom.window.close();
    });
    test('filters by assignment, offers completed rows, and renders imported text safely',async()=>{
        const {dom,win}=create(); await flush();
        const doc=win.document;
        expect(doc.querySelectorAll('.reccie-card')).toHaveLength(1);
        expect(doc.querySelector('.reccie-card').textContent).toContain('D03120200');
        setStatuses(win);await flush();
        expect(doc.querySelectorAll('.reccie-card')).toHaveLength(2);
        expect(doc.querySelector('.reccie-card img')).toBeNull();
        expect(doc.getElementById('rows').textContent).toContain('<img src=x');
        expect(win.chrome.storage.local.set).toHaveBeenCalledWith({recciePreferences:{person:'Harry',assignment:'ops',showBy:'dnumber',trackerStatus:'any',statuses:[]}});
        expect(doc.querySelector('.card-bottom a').href).toContain('campaign-id=CP3G9KS');
        expect(doc.querySelector('.card-bottom a').href).toContain('mos=2026-09-01');
        dom.window.close();
    });
    test('checks matching rows and keeps tracker and Prisma statuses separate',async()=>{
        const {dom,win,getData}=create();await flush();
        win.document.getElementById('check-rows').click();await flush();await flush();
        expect(win.chrome.runtime.sendMessage).toHaveBeenCalledWith({action:'reccies',operation:'check',revision:'test',rowIds:[2],method:'workers-8'});
        expect(win.document.getElementById('rows').textContent).toContain('Verified ready');
        expect(win.document.getElementById('rows').textContent).toContain('Tracker Reccied: No');
        expect(getData().reccieTracker.rows[0].reccied).toBe('No');
        dom.window.close();
    });
    test('requires reimport when report month changes and never offers a write control',async()=>{
        const {dom,win}=create();await flush();
        const month=win.document.getElementById('report-month');month.value='2026-10';month.dispatchEvent(new win.Event('change'));
        expect(win.document.getElementById('check-rows').disabled).toBe(true);
        expect(win.document.getElementById('message').textContent).toContain('again');
        expect([...win.document.querySelectorAll('button')].some(button=>/mark|write|update sheet/i.test(button.textContent))).toBe(false);
        dom.window.close();
    });
    test('aligns filter labels in filter-pair equally without vertical offset',()=>{
        const css = fs.readFileSync(path.resolve(__dirname,'../reccies.css'),'utf8');
        expect(css).toMatch(/\.filter-pair\s*label[^}]*margin-top:\s*0/);
    });
    test('centers checkbar summary with verify button and provides breathing room before verification scope',()=>{
        const css = fs.readFileSync(path.resolve(__dirname,'../reccies.css'),'utf8');
        const dom = new JSDOM(html);
        try {
            const style = dom.window.document.createElement('style');
            style.textContent = css;
            dom.window.document.head.append(style);
            const checkbar = dom.window.getComputedStyle(dom.window.document.querySelector('.checkbar'));
            expect(checkbar.display).toBe('flex');
            expect(checkbar.alignItems).toBe('center');
            expect(checkbar.marginTop).toBe('20px');
            expect(checkbar.marginBottom).toBe('16px');

            // jsdom does not apply viewport media queries; inspect the narrow-layout override separately.
            const narrow = [...style.sheet.cssRules].find(rule =>
                rule.media?.mediaText.replace(/\s/g,'') === '(max-width:330px)');
            const narrowCheckbar = [...narrow.cssRules].find(rule => rule.selectorText === '.checkbar');
            expect(narrowCheckbar.style.getPropertyValue('flex-direction')).toBe('column');
            expect(narrowCheckbar.style.getPropertyValue('align-items')).toBe('flex-start');
        } finally { dom.window.close(); }
    });
    test('renders header title and updated intro copy without redundant toolshed eyebrow or help link',()=>{
        const dom = new JSDOM(html);
        try {
            const header = dom.window.document.querySelector('header');
            expect(header.querySelector('h1').textContent).toBe('My Reccies');
            expect(header.textContent).toContain('Your Reccie Tracker rows');
            expect(header.textContent).not.toContain('OPS TOOLSHED');
            expect(header.querySelector('a[href="help-guides.html"]')).toBeNull();
        } finally { dom.window.close(); }
    });
    test('names the verification action and explains that it includes all matching rows',()=>{
        const dom = new JSDOM(html);
        try {
            const button = dom.window.document.getElementById('check-rows');
            expect(button.textContent).toBe('Verify Reccie Status');
            expect(button.getAttribute('aria-describedby')).toBe('verification-scope');
            expect(dom.window.document.getElementById('verification-scope').textContent).toContain('all rows matching your filters');
        } finally { dom.window.close(); }
    });
    test('launches the popup sidebar from a click without awaiting another API first',async()=>{
        const dom=new JSDOM('<button id="recciesButton"></button><button id="recciesPageButton"></button><p id="recciesPopupStatus"></p>',{runScripts:'dangerously'});
        dom.window.chrome={tabs:{query:jest.fn(async()=>[{id:42,windowId:7}]),create:jest.fn()},runtime:{sendMessage:jest.fn(async()=>({status:'error',message:'Test'})),getURL:path=>`chrome-extension://test/${path}`},storage:{local:{get:jest.fn(async()=>({}))}}};
        dom.window.eval(readScript(path.resolve(__dirname,'../reccie-popup.js')));
        dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));await flush();
        dom.window.document.getElementById('recciesButton').click();
        expect(dom.window.chrome.runtime.sendMessage).toHaveBeenCalledWith({action:'openReccies',tabId:42,windowId:7});
        await flush();dom.window.close();
    });
});
describe('Reccies header lifecycle',()=>{
    test('requeries replaced header roots, avoids duplicates, and removes its control when disabled',async()=>{
        const dom=new JSDOM('<mo-banner-user-menu></mo-banner-user-menu>',{url:'https://go.mediaocean.com/campaign-management/',runScripts:'dangerously'});
        let enabled=true, subscriber;
        const win=dom.window;
        win.opsToolshedExtensionState={isActive:()=>enabled,subscribe:fn=>{subscriber=fn;fn(true);}};
        win.chrome={storage:{local:{get:jest.fn(async()=>({}))},onChanged:{addListener:jest.fn()}},runtime:{sendMessage:jest.fn(async()=>({status:'success'}))}};
        win.eval(readScript(path.resolve(__dirname,'../features/reccies-launcher.js')));await flush();
        win.opsRecciesLauncher.reconcile();
        expect(win.document.querySelectorAll('#ops-reccies-launcher')).toHaveLength(1);
        win.document.getElementById('ops-reccies-launcher').click();await flush();
        expect(win.chrome.runtime.sendMessage).toHaveBeenCalledWith({action:'openReccies'});
        win.document.body.innerHTML='<section><mo-banner-user-menu></mo-banner-user-menu></section>';
        win.opsRecciesLauncher.reconcile();
        expect(win.document.querySelector('section > #ops-reccies-launcher')).not.toBeNull();
        enabled=false;subscriber(false);
        expect(win.document.getElementById('ops-reccies-launcher')).toBeNull();
        dom.window.close();
    });
});

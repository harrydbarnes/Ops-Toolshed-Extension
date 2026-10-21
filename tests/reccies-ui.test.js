const path = require('path');
const fs = require('fs');
const {JSDOM} = require('jsdom');
const {readScript} = require('./helpers/read-script');
const core = require('../reccie-core');
const flush = () => new Promise(resolve => setImmediate(resolve));
const html = fs.readFileSync(path.resolve(__dirname,'../reccies.html'),'utf8');
const base = {sourceRow:2,dNumber:'D03120200',campaignId:'CP3G9KS',month:'2026-09',buyer:'Buyer',ops:'Harry',group:'Harry',client:'Client',campaignName:'Campaign',supplier:'Supplier',order:'Order',comments:'',gross:'10',reccied:'No',issue:''};
const initial = () => ({revision:'test',month:'2026-09',source:{type:'csv'},importedAt:'2026-10-20T12:00:00Z',rows:[{...base},{...base,sourceRow:3,dNumber:'D03144023',reccied:'Yes',supplier:'<img src=x onerror=alert(1)>'},{...base,sourceRow:4,dNumber:'D03144020',ops:'Other'}],checks:{}});
function create() {
    const dom = new JSDOM(html,{url:'https://extension.test/reccies.html',runScripts:'dangerously'});
    const win=dom.window;
    let data={reccieTracker:initial(),recciePreferences:{person:'Harry',assignment:'ops',view:'outstanding'}};
    win.reccieCore=core;
    win.chrome={storage:{local:{get:jest.fn(async()=>data),set:jest.fn(async values=>Object.assign(data,values))}},permissions:{request:jest.fn(async()=>true)},runtime:{sendMessage:jest.fn(async request=>{
        if(request.operation==='check') request.rowIds.forEach(id=>{data.reccieTracker.checks[id]={state:'ready',reconciled:'1',buyStatus:'SUCCESSFUL',checkedAt:'2026-10-20T13:00:00Z'};});
        return {status:'success',tracker:data.reccieTracker};
    })}};
    win.eval(readScript(path.resolve(__dirname,'../search-highlight.js')));
    win.eval(readScript(path.resolve(__dirname,'../reccies.js')));
    return {dom,win,getData:()=>data};
}
describe('Reccies sidebar',()=>{
    test('shows all six view labels in the requested order',()=>{
        const dom = new JSDOM(html);
        try {
            expect([...dom.window.document.querySelectorAll('#view option')].map(option=>option.textContent)).toEqual([
                'All my D numbers','All my campaigns','Unreconciled','Reconciled','Verified reconciled in Prisma','Needs review'
            ]);
        } finally { dom.window.close(); }
    });
    test('groups only assigned rows by campaign, retains all D numbers during search and verifies them',async()=>{
        const {dom,win}=create();await flush();
        const doc=win.document;
        doc.getElementById('view').value='campaigns';doc.getElementById('view').dispatchEvent(new win.Event('change'));
        expect(doc.querySelectorAll('.campaign-card')).toHaveLength(1);
        expect(doc.querySelector('.campaign-title').textContent).toBe('Campaign');
        expect(doc.querySelector('.campaign-card').textContent).toContain('2 D numbers');
        expect(doc.querySelector('.campaign-d-numbers').textContent).toBe('D03120200, D03144023');
        doc.getElementById('search').value='d03120200';doc.getElementById('search').dispatchEvent(new win.Event('input'));
        expect(doc.querySelector('.campaign-d-numbers mark').textContent).toBe('D03120200');
        expect(doc.querySelector('.campaign-d-numbers').textContent).toContain('D03144023');
        doc.getElementById('check-rows').click();await flush();await flush();
        expect(win.chrome.runtime.sendMessage).toHaveBeenCalledWith({action:'reccies',operation:'check',revision:'test',rowIds:[2,3]});
        dom.window.close();
    });
    test('uses the same tracker field for reconciled and unreconciled, retaining Prisma and review filters',async()=>{
        const {dom,win,getData}=create();await flush();const doc=win.document;
        getData().reccieTracker.checks={2:{state:'ready'},3:{state:'review',message:'D number not found for this month'}};
        const show=value=>{doc.getElementById('view').value=value;doc.getElementById('view').dispatchEvent(new win.Event('change'));};
        show('reconciled');expect(doc.querySelectorAll('.reccie-card')).toHaveLength(1);expect(doc.getElementById('rows').textContent).toContain('D03144023');
        show('outstanding');expect(doc.getElementById('rows').textContent).toContain('D03120200');expect(doc.getElementById('rows').textContent).not.toContain('D03144023');
        show('ready');expect(doc.getElementById('rows').textContent).toContain('D03120200');
        show('review');expect(doc.getElementById('rows').textContent).toContain('please check in case of tracker issues, likely deleted');
        dom.window.close();
    });
    test('highlights search matches with the shared Campaign History helper without interpreting HTML',async()=>{
        const {dom,win}=create();await flush();const doc=win.document;
        const append=jest.spyOn(win.OpsToolshedSearchHighlight,'appendHighlightedText');
        doc.getElementById('view').value='all';doc.getElementById('view').dispatchEvent(new win.Event('change'));
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
        doc.getElementById('view').value='all';doc.getElementById('view').dispatchEvent(new win.Event('change'));await flush();
        expect(doc.querySelectorAll('.reccie-card')).toHaveLength(2);
        expect(doc.querySelector('.reccie-card img')).toBeNull();
        expect(doc.getElementById('rows').textContent).toContain('<img src=x');
        expect(win.chrome.storage.local.set).toHaveBeenCalledWith({recciePreferences:{person:'Harry',assignment:'ops',view:'all'}});
        expect(doc.querySelector('.card-bottom a').href).toContain('campaign-id=CP3G9KS');
        expect(doc.querySelector('.card-bottom a').href).toContain('mos=2026-09-01');
        dom.window.close();
    });
    test('checks matching rows and keeps tracker and Prisma statuses separate',async()=>{
        const {dom,win,getData}=create();await flush();
        win.document.getElementById('check-rows').click();await flush();await flush();
        expect(win.chrome.runtime.sendMessage).toHaveBeenCalledWith({action:'reccies',operation:'check',revision:'test',rowIds:[2]});
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
        expect(css).toMatch(/\.checkbar[^{}]*\{[^}]*display:\s*flex[^}]*align-items:\s*center/);
        expect(css).toMatch(/\.checkbar\s*\{margin:\s*20px 0 16px\}/);
        expect(css).toMatch(/@media\(max-width:330px\)\s*\{[\s\S]*?\.checkbar\s*\{[^}]*align-items:\s*flex-start/);
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

const fs=require('fs'),path=require('path'),{JSDOM}=require('jsdom');
const html=fs.readFileSync(path.resolve(__dirname,'../social-campaign-check.html'),'utf8');
const script=fs.readFileSync(path.resolve(__dirname,'../social-campaign-check.js'),'utf8');
const css=fs.readFileSync(path.resolve(__dirname,'../social-campaign-check.css'),'utf8');
const flush=async()=>{for(let index=0;index<20;index++)await Promise.resolve();};
describe('Live campaign check feedback',()=>{
    test.each(['social-campaign-check.html','meta-access.html'])('%s shares the booking checker shell and stylesheet',page=>{
        const view=new JSDOM(fs.readFileSync(path.resolve(__dirname,'../',page),'utf8'));
        const document=view.window.document;
        expect([...document.querySelectorAll('link[rel="stylesheet"]')].map(link=>link.getAttribute('href'))).toEqual([
            'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap','social-finance.css','social-campaign-check.css'
        ]);
        expect(document.querySelector('main.report-shell').style.maxWidth).toBe('');
        expect(document.querySelector('.report-header .brand img').getAttribute('src')).toBe('icon.png');
        expect(document.querySelector('.report-intro h1').id).toBe('page-title');
        expect(document.querySelector('.check-content form')).not.toBeNull();
        view.window.close();
    });
    let dom,storage,chrome;
    beforeEach(()=>{
        dom=new JSDOM(html,{url:'https://extension-preview.test/social-campaign-check.html',runScripts:'outside-only'});
        storage={campaignHistoryEntries:[{campaignId:'CPTEST',campaignName:'A very long campaign name'}],socialCampaignChecks:{}};
        chrome={storage:{sync:{get:jest.fn().mockResolvedValue({onboardingAudience:'prisma'})},local:{get:jest.fn(async()=>storage)},onChanged:{addListener:jest.fn()}},runtime:{sendMessage:jest.fn()}};
        dom.window.chrome=chrome;dom.window.HTMLElement.prototype.scrollIntoView=jest.fn();
    });
    afterEach(()=>dom.window.close());
    test('candidate links and creation evidence stay separate from the linked result',async()=>{
        const result={name:'Linked',campaignId:'123',accountId:'456',currency:'GBP',prismaCurrency:'GBP',budget:100,packageBudget:200,metaBudget:100,totalSpend:0,outsideSpend:0,findings:[],warnings:['No spend recorded; reason not confirmed.'],notes:[],bookings:[],metaRanges:[],outsideDays:[],deliveryReview:{},creation:{actor:'Operator',application:'Mediaocean',at:'2026-06-01'},candidates:[]};
        result.candidates=[{...result,candidates:[],name:'Possible',campaignId:'789',totalSpend:30,evidence:'Same name; unconfirmed.'}];
        chrome.runtime.sendMessage.mockResolvedValue({status:'success',record:{checkedAt:'2026-09-30T12:00:00Z',results:[result],unmatched:[]}});
        dom.window.eval(script);await flush();dom.window.document.querySelector('#saved button').click();await flush();
        const section=dom.window.document.querySelector('.candidate');expect(section.textContent).toContain('£30.00');expect(section.textContent).toContain('Unconfirmed match');
        section.querySelector('a').click();await flush();expect(chrome.runtime.sendMessage).toHaveBeenLastCalledWith({action:'socialCampaignCheck',operation:'openMeta',campaignId:'CPTEST',metaCampaignId:'789',accountId:'456'});
        expect(dom.window.document.querySelector('details').textContent).toContain('Operator · Mediaocean');
        expect(dom.window.document.querySelector('#result').textContent).not.toContain('No issues found');
    });
    test('a failed Check now visibly exposes the error instead of returning silently to Not monitored',async()=>{
        chrome.runtime.sendMessage.mockResolvedValue({status:'error',message:'Prisma session expired.'});
        dom.window.eval(script);await flush();dom.window.document.querySelector('#saved button').click();await flush();
        expect(dom.window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
        expect(dom.window.document.getElementById('status').textContent).toBe('Prisma session expired.');
        expect(dom.window.document.getElementById('result').textContent).toContain('Prisma session expired.');
        expect(dom.window.document.getElementById('saved').textContent).toContain('Last check failed');
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({action:'socialCampaignCheck',operation:'check',campaignId:'CPTEST'});
    });
    test('a successful check shows its result without enabling monitoring',async()=>{
        chrome.runtime.sendMessage.mockResolvedValue({status:'success',record:{campaignName:'Campaign',checkedAt:'2026-09-29T12:00:00Z',results:[],unmatched:[]}});
        dom.window.eval(script);await flush();dom.window.document.querySelector('#saved button').click();await flush();
        expect(dom.window.document.getElementById('result').textContent).toContain('One-off check · monitoring is off');
        const monitor=[...dom.window.document.querySelectorAll('#result button')][0];expect(monitor.disabled).toBe(false);
        expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
    });
    test('links a checked campaign to its exact Meta ad account and campaign in a new tab',async()=>{
        const result={campaignId:'123',accountId:'act_456',currency:'GBP',prismaCurrency:'GBP',budget:100,packageBudget:200,metaBudget:100,totalSpend:0,outsideSpend:0,findings:[],warnings:[],notes:[],bookings:[],metaRanges:[],outsideDays:[]};
        chrome.runtime.sendMessage.mockResolvedValue({status:'success',record:{checkedAt:'2026-09-30T12:00:00Z',results:[result],unmatched:[]}});
        dom.window.eval(script);await flush();dom.window.document.querySelector('#saved button').click();await flush();
        const link=dom.window.document.querySelector('#result a');
        const url=new URL(link.href);expect(url.searchParams.get('act')).toBe('456');expect(url.searchParams.get('selected_campaign_ids')).toBe('123');
        expect(url.searchParams.get('filter_set')).toBe('CAMPAIGN_GROUP_SELECTED-STRING_SET\u001eIN\u001e["123"]');
        expect(link.target).toBe('_blank');expect(link.rel).toBe('noopener noreferrer');
    });
    test('long campaign names cannot shrink the Check now label onto multiple lines',()=>{
        expect(css).toContain('white-space:nowrap;flex-shrink:0');expect(css).toContain('.saved-row button{min-width:110px}');
    });
    test('paginates ten campaigns, but search includes every match and resets to page one',async()=>{
        storage.campaignHistoryEntries=Array.from({length:115},(_,index)=>({campaignId:`CP${1000+index}`,campaignName:`Searchable campaign ${index}`}));
        dom.window.eval(script);await flush();const document=dom.window.document;
        expect(document.querySelectorAll('.saved-row')).toHaveLength(10);
        document.querySelector('#pagination button:last-child').click();
        expect(document.querySelector('#saved').textContent).toContain('CP1010');
        const search=document.getElementById('search');search.value='Searchable';search.dispatchEvent(new dom.window.Event('input'));
        expect(document.querySelectorAll('.saved-row')).toHaveLength(115);expect(document.getElementById('pagination').hidden).toBe(true);
        search.value='';search.dispatchEvent(new dom.window.Event('input'));
        expect(document.querySelectorAll('.saved-row')).toHaveLength(10);expect(document.querySelector('#pagination button').disabled).toBe(true);
        expect(document.querySelector('#saved').textContent).toContain('CP1000');
    });
    test('token errors quote the access section and offer a direct link next to the error',async()=>{
        chrome.runtime.sendMessage.mockResolvedValue({status:'error',message:'Choose Meta access and save a token.'});
        dom.window.eval(script);await flush();dom.window.document.querySelector('#saved button').click();await flush();
        const result=dom.window.document.getElementById('result');
        expect(result.textContent).toContain("Choose 'Meta access'");
        expect(result.querySelector('a').getAttribute('href')).toBe('meta-access.html');
        expect(result.textContent).not.toContain('Any results below are from the last successful check.');
    });
    test('missing account access does not advise renewing the token',async()=>{
        chrome.runtime.sendMessage.mockResolvedValue({status:'error',message:"Meta denied token access to ad account 88. Check the system user's ad account assignment and ads_read permissions in Meta Business Settings."});
        dom.window.eval(script);await flush();dom.window.document.querySelector('#saved button').click();await flush();
        const result=dom.window.document.getElementById('result');
        expect(result.textContent).toContain('ad account 88');expect(result.textContent).toContain('system user');
        expect(result.textContent).not.toContain('update your token');expect(result.querySelector('a[href="meta-access.html"]')).toBeNull();
    });
});

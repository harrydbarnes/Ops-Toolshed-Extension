const { readScript } = require('../helpers/read-script');
const fs=require('fs'),path=require('path');
const {JSDOM}=require('jsdom');
const script=readScript(path.resolve(__dirname,'../../features/social-campaign-check.js'));
describe('Prisma Check Meta launcher',()=>{
    let listener,active,dom,window,document,tick;
    beforeEach(()=>{
        resetMocks();active=true;
        dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://go.mediaocean.com/campaign-management/#campaign-id=CPTEST',runScripts:'dangerously'});
        window=dom.window;document=window.document;window.chrome=chrome;
        window.dstAssuranceFeature={hasFacebookBooking:jest.fn(()=>true)};
        chrome.storage.local.get.mockResolvedValue({});
        window.setInterval=jest.fn(callback=>{tick=callback;return 1;});window.clearInterval=jest.fn();
        document.body.innerHTML='<div class="workflow-widget-wrapper"></div>';
        delete window.opsSocialCampaignCheckInstalled;
        window.opsToolshedExtensionState={isActive:()=>active,subscribe:callback=>{listener=callback;callback(active);}};
    });
    afterEach(()=>{dom.window.close();});
    const resultFixture = () => ({name:'Healthy Skin',campaignId:'123',timezone:'Europe/London',currency:'GBP',prismaCurrency:'GBP',budget:8165.21,metaBudget:34278.73,totalSpend:28731.06,packageBudget:34278.73,outsideSpend:0,bookings:[{placementNumber:'PTEST',start:'2026-06-01',end:'2026-09-30',budget:8165.21,currency:'GBP'}],metaRanges:[{start:'2026-07-07',end:'2026-09-13'}],outsideDays:[],findings:['Flight dates differ: old prose','Meta lifetime budget is higher than booked net media.','Meta spend exceeds the selected Prisma net media budget.'],warnings:[],notes:[]});
    test('monitoring overview lists only opted-in campaigns and routes its actions explicitly',async()=>{
        document.body.insertAdjacentHTML('afterbegin','<nav><button class="toolshed-approval-banner-button">Campaign Approvals</button></nav>');
        chrome.storage.local.get.mockResolvedValue({socialCampaignChecks:{CPOTHER:{monitor:true,campaignName:'Other campaign',checkedAt:'2026-10-01T12:00:00Z',error:'Token expired',results:[]},CPTEST:{monitor:false}}});
        window.eval(script);for(let i=0;i<8;i++)await Promise.resolve();
        const button=document.getElementById('ops-meta-monitoring');
        expect(button.textContent).toBe('Meta Monitoring · 1 to review');
        expect(button.style.border).toBe('0px');
        expect(button.style.transform).toBe('translateY(1px)');
        button.click();const root=document.getElementById('ops-meta-monitoring-panel').shadowRoot;
        expect(root.querySelectorAll('.monitor-row')).toHaveLength(1);
        expect(root.textContent).toContain('Token expired');expect(root.textContent).toContain('saved results');
        expect(new URL(root.querySelector('a').href).hash).toContain('campaign-id=CPOTHER');
        chrome.runtime.sendMessage.mockResolvedValue({status:'success',record:{monitor:true,campaignName:'Other campaign',checkedAt:'2026-10-02T12:00:00Z',results:[]}});
        root.querySelector('.actions button').click();for(let i=0;i<8;i++)await Promise.resolve();
        expect(chrome.runtime.sendMessage).toHaveBeenLastCalledWith({action:'socialCampaignCheck',operation:'check',campaignId:'CPOTHER',fromMonitorOverview:true});
        root.querySelector('.actions .secondary').click();for(let i=0;i<8;i++)await Promise.resolve();
        expect(chrome.runtime.sendMessage).toHaveBeenLastCalledWith({action:'socialCampaignCheck',operation:'monitor',campaignId:'CPOTHER',fromMonitorOverview:true,monitor:false});
        expect(document.getElementById('ops-meta-monitoring')).toBeNull();expect(root.textContent).toContain('No campaigns are monitored');
    });
    test('recreates monitoring header after replacement and removes it when features are disabled',async()=>{
        document.body.insertAdjacentHTML('afterbegin','<nav><button class="toolshed-approval-banner-button">Campaign Approvals</button></nav>');
        chrome.storage.local.get.mockResolvedValue({socialCampaignChecks:{CPTEST:{monitor:true,results:[]}}});
        window.eval(script);for(let i=0;i<8;i++)await Promise.resolve();
        const old=document.getElementById('ops-meta-monitoring');old.parentElement.remove();
        document.body.insertAdjacentHTML('afterbegin','<nav><button class="toolshed-approval-banner-button">Campaign Approvals</button></nav>');tick();
        expect(document.getElementById('ops-meta-monitoring')).not.toBe(old);
        expect(document.getElementById('ops-meta-monitoring').textContent).toBe('Meta Monitoring');
        document.getElementById('ops-meta-monitoring').click();active=false;listener(false);
        expect(document.getElementById('ops-meta-monitoring')).toBeNull();expect(document.getElementById('ops-meta-monitoring-panel')).toBeNull();
    });
    async function showResult(result) {
        chrome.runtime.sendMessage.mockResolvedValue({status:'success',record:{checkedAt:'2026-09-29T12:00:00Z',results:[result],unmatched:[]}});
        window.eval(script);document.getElementById('ops-social-campaign-check').click();
        for(let index=0;index<8;index++)await Promise.resolve();
        return document.getElementById('ops-social-campaign-panel').shadowRoot;
    }
    test('removes excess bottom padding in shorter desktop windows while keeping the body scrollable',async()=>{
        const shadow=await showResult(resultFixture());
        const css=shadow.querySelector('style').textContent;
        expect(css).toContain('@media(min-width:700px) and (max-height:900px){.panel-body{padding-bottom:0}');
        expect(css).toContain('.panel-body{min-height:0;overflow:auto;');
        expect(shadow.querySelector('.panel > footer')).not.toBeNull();
        expect(shadow.querySelector('details').open).toBe(false);
    });
    test('selects one linked comparison at a time without refreshing or starting monitoring',async()=>{
        const first=resultFixture(),second={...resultFixture(),campaignId:'789',name:'Second linked campaign',metaBudget:50};
        chrome.runtime.sendMessage.mockResolvedValue({status:'success',record:{checkedAt:'2026-09-29T12:00:00Z',results:[first,second],unmatched:[]}});
        window.eval(script);document.getElementById('ops-social-campaign-check').click();
        for(let i=0;i<8;i++)await Promise.resolve();
        const shadow=document.getElementById('ops-social-campaign-panel').shadowRoot;
        expect(shadow.querySelectorAll('.campaign-row')).toHaveLength(2);expect(shadow.querySelectorAll('.card')).toHaveLength(1);
        const calls=chrome.runtime.sendMessage.mock.calls.length;
        shadow.querySelectorAll('.campaign-row')[1].click();
        expect(shadow.querySelector('.card').textContent).toContain('Second linked campaign');expect(shadow.querySelectorAll('.card')).toHaveLength(1);
        expect(shadow.querySelectorAll('.campaign-row')[1].getAttribute('aria-expanded')).toBe('true');expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(calls);
        shadow.querySelectorAll('.campaign-row')[1].click();expect(shadow.querySelector('.card')).toBeNull();
        expect(shadow.querySelector('.primary-actions button').textContent).toBe('Check again');
    });
    test('shows link failures separately without presenting a fresh comparison for them',async()=>{
        chrome.runtime.sendMessage.mockResolvedValue({status:'success',record:{checkedAt:'2026-09-29T12:00:00Z',results:[resultFixture()],unmatched:[],linkFailures:[{campaignId:'789',accountId:'456',message:'Token can read the account but reporting is unavailable.',checkedAt:'2026-09-28T12:00:00Z'}]}});
        window.eval(script);document.getElementById('ops-social-campaign-check').click();for(let i=0;i<8;i++)await Promise.resolve();
        const shadow=document.getElementById('ops-social-campaign-panel').shadowRoot;
        expect(shadow.querySelector('.status').textContent).toContain('Partial check');expect(shadow.querySelector('.overview').textContent).toContain('1 checked · 1 unavailable');
        expect(shadow.querySelector('.link-failure').textContent).toContain('No current comparison');expect(shadow.querySelectorAll('.card')).toHaveLength(1);
    });
    test('shows verified traffic controls and recent spend without inventing live delivery',async()=>{
        const result=resultFixture();result.delivery={status:'PAUSED',lastSpendDate:'2026-09-13'};
        result.bookings[0].integration={trafficked:false,control:'increment_budget'};
        const shadow=await showResult(result);
        expect(shadow.querySelector('.delivery').textContent).toContain('PAUSED · last recorded spend 13 Sept 2026');
        expect(shadow.querySelector('details').textContent).toContain('Not trafficked · Increment budget');
        expect(shadow.querySelector('.panel-body')).not.toBeNull();expect(shadow.querySelector('.panel > footer')).not.toBeNull();
    });
    test('projects every pending increment and highlights duplicate risk rather than assuming a cause',async()=>{
        const result={...resultFixture(),budget:150,metaComparisonBudget:100,metaBudget:150,upweightPlan:{appliedBudget:100,pending:[{placementNumber:'PNOV',start:'2026-11-01',amount:50,projectedBudget:200,expectedBudget:150,risk:true}]}};
        const shadow=await showResult(result),preview=shadow.querySelector('.upweight');
        expect(preview.classList.contains('risk')).toBe(true);expect(preview.textContent).toContain('£200.00 · £50.00 above expected £150.00');
        expect(preview.textContent).toContain('cause is not proven');expect(shadow.querySelector('.campaign-state').textContent).toBe('Possible duplicate upweight');
    });
    test('names unverifiable preflight evidence while keeping the pending amount visible',async()=>{
        const result={...resultFixture(),upweightReview:{verifiedTraffickedBudget:100,pending:[{placementNumber:'PNOV',start:'2026-11-01',amount:50}],reasons:['Starting replacement budget is unverified: PSEPT.']}};
        result.warnings=['Upweight preflight unavailable: incomplete starting evidence.'];
        const shadow=await showResult(result),preview=shadow.querySelector('.upweight');
        expect(preview.textContent).toContain('Starting replacement budget is unverified: PSEPT');expect(preview.textContent).toContain('+£50.00');
        expect(preview.textContent).toContain('Projection unavailable');expect(shadow.querySelector('.projection')).toBeNull();
        expect(shadow.querySelector('.campaign-state').textContent).toBe('Verify upweight');
    });
    test('monitoring status toggles the current campaign directly and guards repeated clicks',async()=>{
        const shadow=await showResult(resultFixture());
        let complete;
        chrome.runtime.sendMessage.mockImplementation(()=>new Promise(resolve=>{complete=resolve;}));
        const status=shadow.querySelector('.monitor-status');
        expect(status.getAttribute('aria-label')).toBe('Turn on monitoring for this campaign');
        status.click();status.click();
        expect(chrome.runtime.sendMessage).toHaveBeenLastCalledWith({action:'socialCampaignCheck',operation:'monitor',campaignId:'CPTEST',monitor:true});
        expect(status.disabled).toBe(true);expect(shadow.querySelector('.primary-actions .secondary').disabled).toBe(true);
        complete({status:'success'});for(let i=0;i<8;i++)await Promise.resolve();
        expect(shadow.querySelector('.monitor-status').textContent).toBe('Monitoring · every 30 minutes');
        expect(shadow.querySelector('.monitor-status').getAttribute('aria-label')).toBe('Turn off monitoring for this campaign');
        chrome.runtime.sendMessage.mockResolvedValue({status:'success'});
        shadow.querySelector('.monitor-status').click();for(let i=0;i<8;i++)await Promise.resolve();
        expect(chrome.runtime.sendMessage).toHaveBeenLastCalledWith({action:'socialCampaignCheck',operation:'monitor',campaignId:'CPTEST',monitor:false});
        expect(shadow.querySelector('.monitor-status').textContent).toBe('One-off · monitoring off');
    });
    test('shows an unconfirmed candidate separately with its own comparison and exact link',async()=>{
        const result=resultFixture();result.accountId='456';result.totalSpend=0;result.deliveryReview={message:'No recorded spend; reason is not confirmed.'};result.warnings=[result.deliveryReview.message];
        result.candidates=[{...resultFixture(),name:'<img src=x onerror=alert(1)>',accountId:'456',campaignId:'789',totalSpend:50,evidence:'Same name and account; replacement is not confirmed.'}];
        const shadow=await showResult(result),section=shadow.querySelector('.candidate');
        expect(section.textContent).toContain('Unconfirmed match');expect(section.querySelector('img')).toBeNull();
        expect(section.querySelector('caption').textContent).toBe('Prisma vs possible Meta campaign');expect(section.textContent).toContain('£50.00');
        expect(shadow.textContent).not.toContain('No issues found');expect(shadow.querySelector('.card > .comparison').textContent).toContain('£0.00');
        const link=section.querySelector('a');link.click();await Promise.resolve();
        expect(chrome.runtime.sendMessage).toHaveBeenLastCalledWith({action:'socialCampaignCheck',operation:'openMeta',campaignId:'CPTEST',metaCampaignId:'789',accountId:'456'});
        expect(shadow.querySelector('details').textContent).toContain('Prisma link origin: unknown');
    });
    test('shows an increment projection and compares Meta against trafficked placement cost',async()=>{
        const result={...resultFixture(),budget:150,metaComparisonBudget:100,metaBudget:100,totalSpend:50,findings:[],upweightPlan:{appliedBudget:100,pending:[{placementNumber:'PNOV',start:'2026-11-01',amount:50,projectedBudget:150,expectedBudget:150,risk:false}]}};
        const shadow=await showResult(result);
        expect(shadow.querySelector('.placement-budget-row').textContent).toContain('Trafficked placement net cost');
        expect(shadow.querySelector('.placement-budget-row').textContent).toContain('Matches');
        expect(shadow.querySelector('.candidate').textContent).toContain('PNOV · pending 1 Nov 2026');
        expect(shadow.querySelector('.candidate').textContent).toContain('£50.00');
        expect(shadow.querySelector('details').textContent).toContain('Recheck before trafficking');
    });
    test('compares source values with exact date and monetary differences instead of duplicate warnings',async()=>{
        const shadow=await showResult(resultFixture()),table=shadow.querySelector('.comparison');
        expect([...table.querySelectorAll('thead th')].map(cell=>cell.textContent)).toEqual(['Compare','Prisma','Meta','Difference']);
        const rows=[...table.querySelectorAll('tbody tr')];
        expect(rows[0].textContent).toContain('1 Jun 2026');expect(rows[0].textContent).toContain('7 Jul 2026');
        expect(rows[0].textContent).toContain('Starts 36 days later');expect(rows[0].textContent).toContain('Ends 17 days earlier');
        expect(rows[1].textContent).toContain('£26,113.52 higher');expect(rows[2].textContent).toContain('£20,565.85 over budget');
        expect(rows[1].classList.contains('placement-budget-row')).toBe(true);
        expect(table.querySelectorAll('tr.differs')).toHaveLength(2);expect(table.querySelectorAll('.informational-date')).toHaveLength(1);expect(shadow.querySelectorAll('.finding')).toHaveLength(0);
        expect([...shadow.querySelectorAll('.metric span')].map(node=>node.textContent)).toEqual(['Prisma package soft limit','Spend outside booking dates']);
    });
    test('matching dates and lifetime budget are neutral and spend below budget is not flagged',async()=>{
        const result=resultFixture();result.metaRanges=[{start:'2026-06-01',end:'2026-09-30'}];result.metaBudget=result.budget;result.totalSpend=8000;result.findings=[];
        const shadow=await showResult(result);
        expect(shadow.querySelectorAll('tr.differs')).toHaveLength(0);
        expect(shadow.querySelector('.placement-budget-row').classList.contains('differs')).toBe(false);
        expect(shadow.querySelector('.comparison').textContent).toContain('Matches');
        expect(shadow.querySelector('.comparison').textContent).toContain('£165.21 within budget');
    });
    test('keeps technical sources and history limits in the expandable details',async()=>{
        const result=resultFixture();result.packageSources=[{placementNumber:'PPARENT',field:'programmaticPackageBudget'}];
        const shadow=await showResult(result),details=shadow.querySelector('details');
        expect(details.querySelector('summary').textContent).toBe('Booking details and data sources');
        expect(details.textContent).toContain('Package limit: Prisma PPARENT (programmaticPackageBudget).');
        expect(details.textContent).toContain('Older unavailable history is not checked.');
        expect(details.hasAttribute('open')).toBe(false);
        expect([...shadow.querySelectorAll('.card > .note')].some(node=>node.textContent.includes('programmaticPackageBudget')||node.textContent.includes('Older unavailable'))).toBe(false);
    });
    test('groups status with the heading and monitoring state with the actions to save height',async()=>{
        const shadow=await showResult(resultFixture());
        expect(shadow.querySelector('header .panel-heading .status')).not.toBeNull();
        expect(shadow.querySelector('.primary-actions .monitor-status').textContent).toBe('One-off · monitoring off');
        expect(shadow.querySelector('footer').children).toHaveLength(2);
        expect(shadow.querySelector('.footer-context').textContent).toContain('nothing is monitored automatically');
        expect(shadow.querySelector('details').textContent).toContain('Monitoring requires Chrome, a Prisma session and valid Meta access.');
    });
    test('links the exact Meta campaign and account in a separate tab without adding an action row',async()=>{
        const result=resultFixture();result.accountId='act_456';
        const shadow=await showResult(result),link=shadow.querySelector('a.meta-campaign-link');
        const url=new URL(link.href);expect(url.searchParams.get('act')).toBe('456');expect(url.searchParams.get('selected_campaign_ids')).toBe('123');
        expect(url.searchParams.get('filter_set')).toBe('CAMPAIGN_GROUP_SELECTED-STRING_SET\u001eIN\u001e["123"]');
        expect(link.target).toBe('_blank');expect(link.rel).toBe('noopener noreferrer');
        expect(link.parentElement.textContent).toContain('Meta 123 · Europe/London · Open in Meta');
        link.click();await Promise.resolve();
        expect(chrome.runtime.sendMessage).toHaveBeenLastCalledWith({action:'socialCampaignCheck',operation:'openMeta',campaignId:'CPTEST',metaCampaignId:'123',accountId:'456'});
    });
    test('does not show a misleading Meta link when account IDs are missing or invalid',async()=>{
        const result=resultFixture();result.accountId='456&selected_campaign_ids=999';
        const shadow=await showResult(result);expect(shadow.querySelector('a.meta-campaign-link')).toBeNull();
    });
    test('does not calculate currency deltas or conceal gaps and missing flight dates',async()=>{
        const result=resultFixture();result.currency='USD';result.metaBudget=null;
        result.metaRanges=[{start:'2026-06-01',end:'2026-09-30'},{start:'2026-07-07',end:null}];
        result.bookings.push({...result.bookings[0],start:'2026-08-01'});
        result.findings=['Meta has a missing or open-ended flight date.','Meta flight extends outside booked dates or crosses a gap between bookings.'];
        result.warnings=['Currency mismatch or unsupported currency: monetary differences have not been calculated.'];
        const shadow=await showResult(result),rows=[...shadow.querySelectorAll('.comparison tbody tr')];
        expect(rows[0].textContent).toContain('Earliest booking');expect(rows[0].textContent).toContain('Earliest ad set');
        expect(rows[0].textContent).toContain('Missing / open');expect(rows[0].textContent).toContain('Cannot verify');
        expect(rows[1].querySelector('.difference-value').textContent).toContain('Not comparable');
        expect(rows[2].querySelector('.difference-value').textContent).toContain('Not comparable');
        expect(shadow.querySelectorAll('.finding')).toHaveLength(2);expect(shadow.querySelector('.warning').textContent).toContain('Currency mismatch');
    });
    test('shows a lower lifetime budget and earlier start with singular day wording',async()=>{
        const result=resultFixture();result.metaBudget=8000;result.metaRanges=[{start:'2026-05-31',end:'2026-10-01'}];
        const shadow=await showResult(result),text=shadow.querySelector('.comparison').textContent;
        expect(text).toContain('Starts 1 day earlier');expect(text).toContain('Ends 1 day later');expect(text).toContain('£165.21 lower');
        expect(shadow.querySelectorAll('.comparison tbody tr.differs')).toHaveLength(3);
        expect(shadow.querySelector('.informational-date')).toBeNull();
    });
    test('adds a gap after GMI Chat only when no DST badge separates it from Meta',()=>{
        const style=document.createElement('style');
        style.textContent=fs.readFileSync(path.resolve(__dirname,'../../content.css'),'utf8');
        document.head.append(style);
        const wrapper=document.querySelector('.workflow-widget-wrapper');
        wrapper.innerHTML='<button class="gmi-chat-button">GMI Chat</button>';
        window.eval(script);
        const button=document.getElementById('ops-social-campaign-check');
        expect(window.getComputedStyle(button).marginLeft).toBe('8px');
        const dst=document.createElement('span');dst.className='toolshed-dst-assurance';
        wrapper.insertBefore(dst,button);
        expect(window.getComputedStyle(button).marginLeft).not.toBe('8px');
        expect(window.getComputedStyle(dst).marginRight).toBe('8px');
        dst.remove();tick();
        expect(window.getComputedStyle(button).marginLeft).toBe('8px');
    });
    test('only shows for Facebook bookings and closes stale UI when the booking disappears',()=>{
        window.dstAssuranceFeature.hasFacebookBooking.mockReturnValue(false);window.eval(script);
        expect(document.getElementById('ops-social-campaign-check')).toBeNull();
        window.dstAssuranceFeature.hasFacebookBooking.mockReturnValue(true);tick();
        document.getElementById('ops-social-campaign-check').click();
        expect(document.getElementById('ops-social-campaign-panel')).not.toBeNull();
        window.dstAssuranceFeature.hasFacebookBooking.mockReturnValue(false);tick();
        expect(document.getElementById('ops-social-campaign-check')).toBeNull();
        expect(document.getElementById('ops-social-campaign-panel')).toBeNull();
        expect(document.getElementById('ops-social-campaign-check-tooltip')).toBeNull();
    });
    test('opens a one-off check without starting monitoring',async()=>{
        chrome.runtime.sendMessage.mockResolvedValue({status:'success',record:{checkedAt:'2026-09-29T12:00:00Z',results:[],unmatched:[]}});window.eval(script);
        document.getElementById('ops-social-campaign-check').click();await Promise.resolve();
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({action:'socialCampaignCheck',operation:'check',campaignId:'CPTEST'});
        expect(document.getElementById('ops-social-campaign-panel').shadowRoot.querySelector('[role="dialog"]')).not.toBeNull();
        for (let index=0;index<8;index++) await Promise.resolve();
        const actions=document.getElementById('ops-social-campaign-panel').shadowRoot.querySelector('.primary-actions');
        expect([...actions.querySelectorAll('button')].map(button=>button.textContent)).toEqual(['Check again','Monitor this campaign','One-off · monitoring off']);
        expect(actions.style.justifyContent).toBe('flex-start');
        expect(document.querySelectorAll('#ops-social-campaign-check')).toHaveLength(1);
        tick();expect(document.querySelectorAll('#ops-social-campaign-check')).toHaveLength(1);
    });
    test('recreates the launcher after Prisma swaps the widget and removes it on shutdown',()=>{
        window.eval(script);document.body.innerHTML='<div class="workflow-widget-wrapper"></div>';tick();
        expect(document.getElementById('ops-social-campaign-check')).not.toBeNull();active=false;listener(false);
        expect(document.getElementById('ops-social-campaign-check')).toBeNull();expect(window.clearInterval).toHaveBeenLastCalledWith(1);
    });
    test('shows the tooltip below the button and retains it for one second after leaving',async()=>{
        window.eval(script);const button=document.getElementById('ops-social-campaign-check');
        button.getBoundingClientRect=()=>({left:20,width:80,bottom:120});button.dispatchEvent(new window.Event('mouseenter'));
        const tooltip=document.getElementById('ops-social-campaign-check-tooltip');
        expect(tooltip.parentElement).toBe(document.body);expect(tooltip.style.top).toBe('128px');expect(button.title).toBe('');
        expect(tooltip.style.background).toBe('rgb(31, 41, 55)');
        button.dispatchEvent(new window.Event('mouseleave'));expect(tooltip.isConnected).toBe(true);
        await new Promise(resolve=>window.setTimeout(resolve,1100));expect(document.getElementById('ops-social-campaign-check-tooltip')).toBeNull();
    });
    test.each([[400,290],[20,8],[950,716]])('centres the tooltip for button left %s and clamps at screen edges', (left,expectedLeft)=>{
        const original=window.HTMLElement.prototype.getBoundingClientRect;
        window.HTMLElement.prototype.getBoundingClientRect=function(){
            if(this.id==='ops-social-campaign-check-tooltip')return {width:300};
            return original.call(this);
        };
        window.eval(script);const button=document.getElementById('ops-social-campaign-check');
        button.getBoundingClientRect=()=>({left,width:80,bottom:120});button.dispatchEvent(new window.Event('mouseenter'));
        expect(document.getElementById('ops-social-campaign-check-tooltip').style.left).toBe(`${expectedLeft}px`);
    });
    test('switching to DST dismisses Meta immediately and rehover cancels a pending dismiss',async()=>{
        window.eval(script);const button=document.getElementById('ops-social-campaign-check');
        button.dispatchEvent(new window.Event('mouseenter'));button.dispatchEvent(new window.Event('mouseleave'));
        button.dispatchEvent(new window.Event('mouseenter'));await new Promise(resolve=>window.setTimeout(resolve,1100));
        expect(document.getElementById('ops-social-campaign-check-tooltip')).not.toBeNull();
        document.dispatchEvent(new window.CustomEvent('ops-toolshed-header-tooltip-open',{detail:'dst'}));
        expect(document.getElementById('ops-social-campaign-check-tooltip')).toBeNull();
        button.dispatchEvent(new window.Event('mouseenter'));
        const dst=document.createElement('button');dst.className='toolshed-dst-assurance';document.body.append(dst);
        dst.dispatchEvent(new window.Event('mouseenter'));
        expect(document.getElementById('ops-social-campaign-check-tooltip')).toBeNull();
    });
    test('closes the overlay on route changes so the prior campaign cannot be monitored in a new campaign',async()=>{
        chrome.runtime.sendMessage.mockResolvedValue({status:'success',record:{checkedAt:'2026-09-29T12:00:00Z',results:[],unmatched:[]}});window.eval(script);
        document.getElementById('ops-social-campaign-check').click();await Promise.resolve();
        window.history.replaceState(null,'','/campaign-management/#campaign-id=CPNEXT');tick();
        expect(document.getElementById('ops-social-campaign-panel')).toBeNull();
    });
    test('matches approvals entrance, corners and exit before removing the panel',async()=>{
        window.eval(script);const button=document.getElementById('ops-social-campaign-check');button.click();
        const host=document.getElementById('ops-social-campaign-panel'),panel=host.shadowRoot.querySelector('.panel');
        const css=host.shadowRoot.querySelector('style').textContent;
        expect(css).toContain('border-radius:12px');expect(css).toContain('opacity 180ms ease-out,transform 200ms cubic-bezier(0.22,1,0.36,1)');
        expect(panel.classList.contains('is-open')).toBe(false);
        await new Promise(resolve=>window.setTimeout(resolve,10));
        expect(panel.classList.contains('is-open')).toBe(true);
        host.shadowRoot.querySelector('header button').click();
        expect(host.isConnected).toBe(true);expect(panel.classList.contains('is-open')).toBe(false);
        expect(panel.classList.contains('is-closing')).toBe(true);expect(host.style.pointerEvents).toBe('none');expect(host.inert).toBe(true);
        expect(button.getAttribute('aria-expanded')).toBe('false');
        const transition=new window.Event('transitionend');Object.defineProperty(transition,'propertyName',{value:'opacity'});panel.dispatchEvent(transition);
        expect(host.isConnected).toBe(false);
    });
    test('a pending exit cannot remove the newly reopened popup',async()=>{
        window.eval(script);const button=document.getElementById('ops-social-campaign-check');button.click();
        const old=document.getElementById('ops-social-campaign-panel');button.click();button.click();
        const current=document.getElementById('ops-social-campaign-panel');
        expect(old.isConnected).toBe(false);expect(current).not.toBe(old);
        await new Promise(resolve=>window.setTimeout(resolve,260));
        expect(current.isConnected).toBe(true);expect(current.shadowRoot.querySelector('.panel').classList.contains('is-open')).toBe(true);
        button.click();await new Promise(resolve=>window.setTimeout(resolve,260));expect(current.isConnected).toBe(false);
    });
    test('reduced motion closes immediately and cancels pending entrance',async()=>{
        window.matchMedia=jest.fn(()=>({matches:true}));window.eval(script);
        const button=document.getElementById('ops-social-campaign-check');button.click();button.click();
        expect(document.getElementById('ops-social-campaign-panel')).toBeNull();
        await new Promise(resolve=>window.setTimeout(resolve,10));
        expect(document.getElementById('ops-social-campaign-panel')).toBeNull();
    });
});

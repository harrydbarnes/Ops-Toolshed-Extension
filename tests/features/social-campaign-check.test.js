const fs=require('fs'),path=require('path');
const {JSDOM}=require('jsdom');
const script=fs.readFileSync(path.resolve(__dirname,'../../features/social-campaign-check.js'),'utf8');
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
    async function showResult(result) {
        chrome.runtime.sendMessage.mockResolvedValue({status:'success',record:{checkedAt:'2026-09-29T12:00:00Z',results:[result],unmatched:[]}});
        window.eval(script);document.getElementById('ops-social-campaign-check').click();
        for(let index=0;index<8;index++)await Promise.resolve();
        return document.getElementById('ops-social-campaign-panel').shadowRoot;
    }
    test('compares source values with exact date and monetary differences instead of duplicate warnings',async()=>{
        const shadow=await showResult(resultFixture()),table=shadow.querySelector('.comparison');
        expect([...table.querySelectorAll('thead th')].map(cell=>cell.textContent)).toEqual(['Compare','Prisma','Meta','Difference']);
        const rows=[...table.querySelectorAll('tbody tr')];
        expect(rows[0].textContent).toContain('1 Jun 2026');expect(rows[0].textContent).toContain('7 Jul 2026');
        expect(rows[0].textContent).toContain('Starts 36 days later');expect(rows[1].textContent).toContain('Ends 17 days earlier');
        expect(rows[2].textContent).toContain('£26,113.52 higher');expect(rows[3].textContent).toContain('£20,565.85 over budget');
        expect(rows[2].classList.contains('placement-budget-row')).toBe(true);
        expect(table.querySelectorAll('tr.differs')).toHaveLength(2);expect(table.querySelectorAll('.informational-date')).toHaveLength(2);expect(shadow.querySelectorAll('.finding')).toHaveLength(0);
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
        expect(shadow.querySelector('footer').children).toHaveLength(1);
        expect(shadow.querySelector('details').textContent).toContain('Monitoring requires Chrome, a Prisma session and valid Meta access.');
    });
    test('does not calculate currency deltas or conceal gaps and missing flight dates',async()=>{
        const result=resultFixture();result.currency='USD';result.metaBudget=null;
        result.metaRanges=[{start:'2026-06-01',end:'2026-09-30'},{start:'2026-07-07',end:null}];
        result.bookings.push({...result.bookings[0],start:'2026-08-01'});
        result.findings=['Meta has a missing or open-ended flight date.','Meta flight extends outside booked dates or crosses a gap between bookings.'];
        result.warnings=['Currency mismatch or unsupported currency: monetary differences have not been calculated.'];
        const shadow=await showResult(result),rows=[...shadow.querySelectorAll('.comparison tbody tr')];
        expect(rows[0].textContent).toContain('Earliest booking');expect(rows[0].textContent).toContain('Earliest ad set');
        expect(rows[1].textContent).toContain('Missing / open');expect(rows[1].textContent).toContain('Cannot verify');
        expect(rows[2].querySelector('.difference-value').textContent).toContain('Not comparable');
        expect(rows[3].querySelector('.difference-value').textContent).toContain('Not comparable');
        expect(shadow.querySelectorAll('.finding')).toHaveLength(2);expect(shadow.querySelector('.warning').textContent).toContain('Currency mismatch');
    });
    test('shows a lower lifetime budget and earlier start with singular day wording',async()=>{
        const result=resultFixture();result.metaBudget=8000;result.metaRanges=[{start:'2026-05-31',end:'2026-10-01'}];
        const shadow=await showResult(result),text=shadow.querySelector('.comparison').textContent;
        expect(text).toContain('Starts 1 day earlier');expect(text).toContain('Ends 1 day later');expect(text).toContain('£165.21 lower');
        expect(shadow.querySelectorAll('.comparison tbody tr.differs')).toHaveLength(4);
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
        expect([...actions.querySelectorAll('button')].map(button=>button.textContent)).toEqual(['Check again','Monitor this campaign']);
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

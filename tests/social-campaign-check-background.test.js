jest.mock('../background/feature-mode',()=>({isFeatureModeActive:jest.fn(()=>true)}));
const { isFeatureModeActive } = require('../background/feature-mode');
const manager = require('../background/social-campaign-check');
const core = require('../social-campaign-core');
const api = require('../meta-report-api');
const fields = values=>Object.entries(values).map(([id,value])=>({id,value}));
const grid = { total:1,nodes:[{fields:fields({id:'1',placementNumber:'P1',placementType:'1',providerTypeId:'3',adserverInstanceId:'123',accountCode:'88',campaignIdOnExternalProvider:'99',placementCurrencyCode:'GBP',supplierCost:'125',budgetPayableAmount:'100',flightStart:'2026-06-01',flightEnd:'2026-06-30'})}] };
const snapshot = {campaign:{id:'99',account_id:'88',name:'Campaign',lifetime_budget:'15000'},account:{id:'88',currency:'GBP',timezone_name:'Europe/London'},adSets:[{id:'a',start_time:'2026-06-01',end_time:'2026-06-30'}],dailySpend:[]};
describe('Opt-in background campaign checks',()=>{
    let storage, getSnapshot, verifyAccountAccess;
    beforeEach(()=>{
        resetMocks();isFeatureModeActive.mockReturnValue(true);
        globalThis.socialCampaignCore=core;globalThis.metaReportApi=api;
        storage={socialBookingMetaApiCredentials:{accessToken:'secret'}};
        chrome.storage.local.get.mockImplementation(async key=>typeof key==='string'?{[key]:storage[key]}:storage);
        chrome.storage.local.set.mockImplementation(async values=>Object.assign(storage,values));
        chrome.storage.sync.get.mockResolvedValue({allFeaturesDisabled:false,onboardingAudience:'prisma'});
        chrome.runtime.id='test-id';chrome.runtime.getURL.mockImplementation(path=>`chrome-extension://test-id/${path}`);
        chrome.tabs.get.mockResolvedValue({id:5,url:'https://go.mediaocean.com/campaign-management/#campaign-id=CPTEST'});
        global.fetch=jest.fn(async url=>({ok:true,status:200,json:async()=>url.includes('publicforui')?{id:1234,publicId:'CPTEST',agencyId:1,campaignName:'Prisma campaign'}:url.includes('/hybrid/rc')?grid:['P1']}));
        getSnapshot=jest.fn().mockResolvedValue(snapshot);
        verifyAccountAccess=jest.fn().mockResolvedValue({accountId:'88',name:'Ad account'});
        jest.spyOn(api,'createClient').mockReturnValue({getCampaignSnapshot:getSnapshot,verifyAccountAccess});
    });
    afterEach(()=>{jest.restoreAllMocks();delete global.fetch;});
    test.each([100,200,10])('reports account-specific access failures (%s), not a token-renewal prompt',async code=>{
        verifyAccountAccess.mockRejectedValue(Object.assign(new Error('Provider error secret'),{metaCode:code,source:'meta'}));
        await expect(manager.checkSocialCampaign('CPTEST')).rejects.toThrow(/ad account 88/);
        const saved=storage.socialCampaignChecks.CPTEST;
        expect(saved.error).toContain("system user");expect(saved.error).toContain('P1');
        expect(saved.error).not.toContain('secret');expect(saved.error).not.toContain('replace it');
        expect(saved.latestPrisma.bookings).toHaveLength(1);expect(getSnapshot).not.toHaveBeenCalled();
    });
    test('an expired token during account verification still asks to replace the token',async()=>{
        verifyAccountAccess.mockRejectedValue(Object.assign(new Error('secret'),{metaCode:190,source:'meta'}));
        await expect(manager.checkSocialCampaign('CPTEST')).rejects.toThrow(/expired or is invalid/);
        expect(getSnapshot).not.toHaveBeenCalled();
    });
    test('distinguishes a readable account from a missing campaign or denied reporting access',async()=>{
        getSnapshot.mockRejectedValue(Object.assign(new Error('secret'),{metaCode:100,source:'meta'}));
        await expect(manager.checkSocialCampaign('CPTEST')).rejects.toThrow(/Token can read Meta ad account 88, but campaign 99/);
        expect(storage.socialCampaignChecks.CPTEST.error).not.toContain('assign this ad account');
    });
    const senderPage=()=>({id:'test-id',url:'chrome-extension://test-id/social-campaign-check.html'});
    const linkRequest=()=>({operation:'openMeta',campaignId:'CPTEST',metaCampaignId:'99',accountId:'88'});
    test('opens only the checked campaign and learns the portfolio for its ad account',async()=>{
        await manager.checkSocialCampaign('CPTEST');
        chrome.tabs.query.mockResolvedValue([{url:'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=88&business_id=123',active:true},{url:'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=77&business_id=999',active:true}]);
        const response=jest.fn();await manager.handleSocialCheck(linkRequest(),senderPage(),response);
        expect(response).toHaveBeenCalledWith({status:'success'});
        const url=new URL(chrome.tabs.create.mock.calls.at(-1)[0].url);
        expect(url.searchParams.get('filter_set')).toBe('CAMPAIGN_GROUP_SELECTED-STRING_SET\u001eIN\u001e["99"]');
        expect(url.searchParams.get('selected_campaign_ids')).toBe('99');expect(url.searchParams.get('act')).toBe('88');
        expect(url.searchParams.get('business_id')).toBe('123');expect(url.searchParams.get('global_scope_id')).toBe('123');
        expect(storage.socialMetaPortfolioByAccount).toEqual({'88':'123'});
        chrome.tabs.query.mockResolvedValue([]);await manager.handleSocialCheck(linkRequest(),senderPage(),response);
        expect(new URL(chrome.tabs.create.mock.calls.at(-1)[0].url).searchParams.get('business_id')).toBe('123');
    });
    test('never borrows a different ad account portfolio or opens unverified campaigns',async()=>{
        await manager.checkSocialCampaign('CPTEST');
        chrome.tabs.query.mockResolvedValue([{url:'https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=77&business_id=999'}]);
        const response=jest.fn();await manager.handleSocialCheck(linkRequest(),senderPage(),response);
        expect(new URL(chrome.tabs.create.mock.calls.at(-1)[0].url).searchParams.has('business_id')).toBe(false);
        chrome.tabs.create.mockClear();await manager.handleSocialCheck({...linkRequest(),metaCampaignId:'333'},senderPage(),response);
        expect(chrome.tabs.create).not.toHaveBeenCalled();expect(response).toHaveBeenLastCalledWith(expect.objectContaining({status:'error'}));
    });
    test('one-off checks directly refresh Prisma without enrolling a monitor',async()=>{
        const result=await manager.checkSocialCampaign('CPTEST');
        expect(result.monitor).not.toBe(true);expect(result.results[0].budget).toBe(100);
        expect(fetch.mock.calls[1][1]).toMatchObject({method:'PUT',credentials:'include',redirect:'error'});
        expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({start:0,end:0});
        expect(chrome.notifications.create).not.toHaveBeenCalled();
    });
    test('monitoring needs a successful check; alerts repeat only when actionable state changes',async()=>{
        await expect(manager.setSocialMonitoring('CPNEW',true)).rejects.toThrow(/Complete/);
        await manager.checkSocialCampaign('CPTEST');await manager.setSocialMonitoring('CPTEST',true);
        expect(chrome.alarms.create).toHaveBeenCalledWith(manager.SOCIAL_CHECK_ALARM,{periodInMinutes:30});
        await manager.pollSocialCampaigns();await manager.pollSocialCampaigns();
        expect(chrome.notifications.create).toHaveBeenCalledTimes(1);
        getSnapshot.mockResolvedValue({...snapshot,campaign:{...snapshot.campaign,lifetime_budget:'5000'}});
        await manager.pollSocialCampaigns();expect(chrome.notifications.create).toHaveBeenCalledTimes(2);
        await manager.pollSocialCampaigns();expect(chrome.notifications.create).toHaveBeenCalledTimes(2);
        await manager.setSocialMonitoring('CPTEST',false);await manager.pollSocialCampaigns();expect(chrome.notifications.create).toHaveBeenCalledTimes(2);
    });
    test('failed checks preserve and label the last successful result, without retaining provider error secrets',async()=>{
        const original=await manager.checkSocialCampaign('CPTEST');
        getSnapshot.mockRejectedValue(new Error('Meta token secret failed'));
        await expect(manager.checkSocialCampaign('CPTEST')).rejects.toThrow(/Meta check failed/);
        expect(storage.socialCampaignChecks.CPTEST.checkedAt).toBe(original.checkedAt);
        expect(storage.socialCampaignChecks.CPTEST.results).toEqual(original.results);
        expect(storage.socialCampaignChecks.CPTEST.error).not.toContain('secret');
    });
    test('stopping monitoring during a check prevents its pending notification and stale write',async()=>{
        await manager.checkSocialCampaign('CPTEST');await manager.setSocialMonitoring('CPTEST',true);
        let finish;getSnapshot.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
        const running=manager.checkSocialCampaign('CPTEST',true);
        for(let attempt=0;attempt<30&&!finish;attempt++)await Promise.resolve();
        expect(finish).toBeDefined();await manager.setSocialMonitoring('CPTEST',false);finish(snapshot);await running;
        expect(storage.socialCampaignChecks.CPTEST.monitor).toBe(false);expect(chrome.notifications.create).not.toHaveBeenCalled();
    });
    test('feature shutdown and non-Prisma audience prevent API requests',async()=>{
        isFeatureModeActive.mockReturnValue(false);
        expect(()=>manager.checkSocialCampaign('CPTEST')).toThrow(/Enable Prisma/);
        isFeatureModeActive.mockReturnValue(true);chrome.storage.sync.get.mockResolvedValue({onboardingAudience:'non-prisma'});
        await expect(manager.checkSocialCampaign('CPTEST')).rejects.toThrow(/Enable Prisma/);
        expect(fetch).not.toHaveBeenCalled();await manager.setupSocialCheckAlarm();expect(chrome.alarms.clear).toHaveBeenCalledWith(manager.SOCIAL_CHECK_ALARM);
    });
    test('rejects callers outside the approved extension page and Prisma tab',async()=>{
        const send=jest.fn();await manager.handleSocialCheck({operation:'check',campaignId:'CPTEST'},{id:'foreign',url:'https://example.com/'},send);
        expect(send).toHaveBeenCalledWith(expect.objectContaining({status:'error'}));expect(fetch).not.toHaveBeenCalled();
    });
    test('Prisma overlays can only check or monitor the campaign open in their own tab',async()=>{
        const sender={id:'test-id',url:'https://go.mediaocean.com/campaign-management/#campaign-id=CPTEST',tab:{id:5}};
        const send=jest.fn();await manager.handleSocialCheck({operation:'check',campaignId:'CPOTHER'},sender,send);
        expect(send).toHaveBeenCalledWith(expect.objectContaining({status:'error'}));expect(fetch).not.toHaveBeenCalled();
        await manager.handleSocialCheck({operation:'check',campaignId:'CPTEST'},sender,send);
        expect(send).toHaveBeenLastCalledWith(expect.objectContaining({status:'success'}));
    });
    test('expired tokens are shown as a specific access problem',async()=>{
        getSnapshot.mockRejectedValue(Object.assign(new Error('Token expired code 190'),{metaCode:190,source:'meta'}));
        await expect(manager.checkSocialCampaign('CPTEST')).rejects.toThrow(/token has expired or is invalid/);
        expect(storage.socialCampaignChecks.CPTEST.latestPrisma.bookings[0].budget).toBe(100);
    });
    test('does not report monitoring as enabled if Chrome cannot schedule its alarm',async()=>{
        await manager.checkSocialCampaign('CPTEST');chrome.alarms.create.mockRejectedValueOnce(new Error('Alarm unavailable'));
        await expect(manager.setSocialMonitoring('CPTEST',true)).rejects.toThrow(/could not be scheduled/);
        expect(storage.socialCampaignChecks.CPTEST.monitor).toBe(false);
    });
    test('Meta access opens a standalone credential screen without a report workflow',async()=>{
        const sender={id:'test-id',url:'https://go.mediaocean.com/campaign-management/#campaign-id=CPTEST',tab:{id:5}};
        const send=jest.fn();await manager.handleSocialCheck({operation:'access',campaignId:'CPTEST'},sender,send);
        expect(chrome.tabs.create).toHaveBeenCalledWith({url:'chrome-extension://test-id/meta-access.html'});expect(fetch).not.toHaveBeenCalled();
        expect(send).toHaveBeenCalledWith({status:'success'});
    });
    test.each(['open','access','check'])('%s uses the current tab campaign after SPA navigation',async operation=>{
        const sender={id:'test-id',frameId:0,url:'https://go.mediaocean.com/campaign-management/#route=campaigns',tab:{id:5,url:'https://go.mediaocean.com/campaign-management/#campaign-id=CPOLD'}};
        const send=jest.fn();await manager.handleSocialCheck({operation,campaignId:'CPTEST',listOnly:true},sender,send);
        expect(chrome.tabs.get).toHaveBeenCalledWith(5);
        expect(send).toHaveBeenCalledWith(expect.objectContaining({status:'success'}));
        if(operation==='open')expect(chrome.tabs.create).toHaveBeenCalledWith({url:'chrome-extension://test-id/social-campaign-check.html'});
        if(operation==='access')expect(chrome.tabs.create).toHaveBeenCalledWith({url:'chrome-extension://test-id/meta-access.html'});
        if(operation==='check')expect(getSnapshot).toHaveBeenCalledWith('99');
    });
    test('a stale campaign request is rejected after the tab navigates to another campaign or site',async()=>{
        const sender={id:'test-id',url:'https://go.mediaocean.com/campaign-management/#campaign-id=CPTEST',tab:{id:5}};
        const send=jest.fn();chrome.tabs.get.mockResolvedValue({url:'https://go.mediaocean.com/campaign-management/#campaign-id=CPOTHER'});
        await manager.handleSocialCheck({operation:'check',campaignId:'CPTEST'},sender,send);
        expect(send).toHaveBeenLastCalledWith(expect.objectContaining({status:'error'}));
        chrome.tabs.get.mockResolvedValue({url:'https://example.com/#campaign-id=CPTEST'});
        await manager.handleSocialCheck({operation:'open',listOnly:true},sender,send);
        expect(send).toHaveBeenLastCalledWith(expect.objectContaining({status:'error'}));
        expect(fetch).not.toHaveBeenCalled();expect(chrome.tabs.create).not.toHaveBeenCalled();
    });
});

jest.mock('../background/feature-mode',()=>({isFeatureModeActive:()=>true}));
const {scheduleFinancialVerification,runReccieAlarm,restoreReccieAlarms}=require('../background/reccies');
const {RECCIE_ALARM}=require('../background/reccie-automation');
describe('financial verification jobs',()=>{
    let state,sender;
    beforeEach(()=>{
        state={reccieAutomation:{afterFinancial:true}};sender={id:chrome.runtime.id,tab:{id:42},frameId:0,url:'https://go.mediaocean.com/campaign-management/#campaign-id=CP3G9KS&ptb-ctx=actualize&mos=2026-09-01'};
        chrome.storage.local.get=jest.fn(async()=>structuredClone(state));chrome.storage.local.set=jest.fn(async value=>Object.assign(state,structuredClone(value)));
        chrome.storage.sync.get=jest.fn(async()=>({allFeaturesDisabled:false,onboardingAudience:'prisma'}));chrome.alarms.create=jest.fn(async()=>{});
    });
    const schedule=async(request={changes:[{month:'2026-09',placementIds:['P3FLH1P']}]},from=sender)=>{const response=jest.fn();await scheduleFinancialVerification(request,from,response);return response.mock.calls[0][0];};
    test('stores a campaign/month job three minutes ahead and repeated requests replace it',async()=>{
        const before=Date.now(),result=await schedule();expect(result).toMatchObject({status:'success',scheduled:true});expect(result.due-before).toBeGreaterThanOrEqual(180000);
        await schedule();expect(Object.keys(state.reccieFinancialJobs)).toEqual(['CP3G9KS:2026-09']);expect(chrome.alarms.create).toHaveBeenCalledWith(RECCIE_ALARM+'CP3G9KS:2026-09',expect.objectContaining({when:expect.any(Number)}));
    });
    test('multi-month confirmed changes remain campaign scoped and opt-out schedules nothing',async()=>{
        await schedule({changes:[{month:'2026-09',placementIds:['P3FLH1P']},{month:'2026-10',placementIds:['P3FLH1T']}]});expect(state.reccieFinancialJobs['CP3G9KS:2026-10'].placementIds).toEqual(['P3FLH1T']);
        state.reccieAutomation.afterFinancial=false;chrome.alarms.create.mockClear();expect(await schedule()).toMatchObject({scheduled:false});expect(chrome.alarms.create).not.toHaveBeenCalled();
    });
    test.each(['https://evil.test/#campaign-id=CP3G9KS&ptb-ctx=actualize','https://go.mediaocean.com/campaign-management/#campaign-id=CP3G9KS&ptb-ctx=digital'])('rejects untrusted context %s',async url=>{expect(await schedule({}, {...sender,url})).toMatchObject({status:'error'});expect(chrome.alarms.create).not.toHaveBeenCalled();});
    test('an early alarm defers until due; disabling the setting discards the due job',async()=>{
        const result=await schedule();await runReccieAlarm({name:RECCIE_ALARM+'CP3G9KS:2026-09'});expect(state.reccieFinancialJobs['CP3G9KS:2026-09']).toBeDefined();
        state.reccieFinancialJobs['CP3G9KS:2026-09'].due=Date.now()-1;state.reccieAutomation.afterFinancial=false;await runReccieAlarm({name:RECCIE_ALARM+'CP3G9KS:2026-09'});expect(state.reccieFinancialJobs).toEqual({});
    });
    test('restores durable pending alarms on browser startup',async()=>{await schedule();chrome.alarms.create.mockClear();await restoreReccieAlarms();expect(chrome.alarms.create).toHaveBeenCalledWith(RECCIE_ALARM+'CP3G9KS:2026-09',expect.any(Object));});
});

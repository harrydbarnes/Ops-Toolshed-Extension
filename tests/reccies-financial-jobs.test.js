jest.mock('../background/feature-mode',()=>({isFeatureModeActive:()=>true}));
jest.mock('../background/reccie-writes',()=>({dispatchTrackerWrite:jest.fn()}));
const {dispatchTrackerWrite}=require('../background/reccie-writes');
const {scheduleFinancialVerification,runReccieAlarm,restoreReccieAlarms}=require('../background/reccies');
const {RECCIE_ALARM}=require('../background/reccie-automation');
describe('financial verification jobs',()=>{
    let state,sender;
    beforeEach(()=>{
        state={reccieAutomation:{afterFinancial:true}};sender={id:chrome.runtime.id,tab:{id:42},frameId:0,url:'https://go.mediaocean.com/campaign-management/#campaign-id=CP3G9KS&ptb-ctx=actualize&mos=2026-09-01'};
        chrome.storage.local.get=jest.fn(async()=>structuredClone(state));chrome.storage.local.set=jest.fn(async value=>Object.assign(state,structuredClone(value)));
        chrome.storage.sync.get=jest.fn(async()=>({allFeaturesDisabled:false,onboardingAudience:'prisma'}));chrome.alarms.create=jest.fn(async()=>{});
        chrome.storage.local.remove=jest.fn(async key=>{delete state[key];});chrome.alarms.clear=jest.fn(async()=>{});dispatchTrackerWrite.mockReset();
    });
    afterEach(()=>{delete global.fetch;});
    const schedule=async(request={changes:[{month:'2026-09',placementIds:['P3FLH1P']}]},from=sender)=>{const response=jest.fn();await scheduleFinancialVerification(request,from,response);return response.mock.calls[0][0];};
    test('stores a campaign/month job 20 seconds ahead and repeated requests replace it',async()=>{
        const before=Date.now(),result=await schedule();expect(result).toMatchObject({status:'success',scheduled:true});expect(result.due-before).toBeGreaterThanOrEqual(20000);
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
    const record=(placementNumber,dNumber,status='SUCCESSFUL',reconciled='1')=>({fields:Object.entries({placementNumber,buySerialNumber:dNumber,month:'2026-09',okToPay:reconciled,buyStatus:status}).map(([id,value])=>({id,value}))});
    const setupCheck=(nodes, status=200)=>{
        state.reccieTracker={revision:'r1',month:'2026-09',source:{type:'google'},checks:{},rows:[
            {sourceRow:2,dNumber:'D03120200',campaignId:'CP3G9KS',month:'2026-09',ops:'Harry',reccied:'No'},
            {sourceRow:3,dNumber:'D03120201',campaignId:'CP3G9KS',month:'2026-09',ops:'Harry',reccied:'No'}]};
        state.recciePreferences={person:'Harry',assignment:'ops'};
        global.fetch=jest.fn(async url=>url.includes('publicforui')
            ? {ok:true,json:async()=>({publicId:'CP3G9KS',id:123})}
            : {ok:status===200,status,json:async()=>({status:0,nodes,total:nodes.length})});
    };
    const runDue=async()=>{state.reccieFinancialJobs['CP3G9KS:2026-09'].due=Date.now()-1;await runReccieAlarm({name:RECCIE_ALARM+'CP3G9KS:2026-09'});};
    test('retries a missing changed placement alongside a ready placement, then completes when it appears',async()=>{
        const nodes=[record('P3FLH1P','D03120200')];setupCheck(nodes);
        await schedule({changes:[{month:'2026-09',placementIds:['P3FLH1P','P3FLH1Q']}]});
        await runDue();expect(state.reccieFinancialJobs['CP3G9KS:2026-09'].attempts).toBe(1);
        expect(state.reccieAutomationLastRun.message).toContain('not found');
        nodes.push(record('P3FLH1Q','D03120201'));await runDue();
        expect(state.reccieFinancialJobs).toEqual({});expect(state.reccieAutomationLastRun.state).toBe('complete');
    });
    test('missing placements stop after three attempts and require attention',async()=>{
        setupCheck([]);await schedule();
        await runDue();await runDue();await runDue();
        expect(state.reccieFinancialJobs).toEqual({});expect(state.reccieAutomationLastRun.state).toBe('attention');
    });
    test('processing retries, but a failed placement and access errors do not',async()=>{
        setupCheck([record('P3FLH1P','D03120200','PENDING')]);await schedule();await runDue();
        expect(state.reccieFinancialJobs['CP3G9KS:2026-09'].attempts).toBe(1);
        setupCheck([record('P3FLH1P','D03120200','FAILED')]);await runDue();expect(state.reccieFinancialJobs).toEqual({});
        setupCheck([],403);await schedule();await runDue();expect(state.reccieFinancialJobs).toEqual({});expect(state.reccieAutomationLastRun.state).toBe('attention');
    });
    test('receipt polling is bounded and never repeats an uncertain commit',async()=>{
        state['reccieAutoReceipt:pending']={requestId:'pending',mode:'main',month:'2026-09',attempts:0};
        dispatchTrackerWrite.mockResolvedValue({write:{state:'pending'}});
        for(let attempt=0;attempt<4;attempt++)await runReccieAlarm({name:RECCIE_ALARM+'receipt:pending'});
        expect(dispatchTrackerWrite).toHaveBeenCalledTimes(3);
        expect(dispatchTrackerWrite.mock.calls.every(([request])=>request.operation==='trackerWriteStatus')).toBe(true);
        expect(state.reccieAutomationLastRun.state).toBe('attention');
    });
    test('completed receipt clears recovery safely when automatic updates were revoked',async()=>{
        state['reccieAutoReceipt:done']={requestId:'done',mode:'main',month:'2026-09',attempts:0,remaining:[{dNumber:'D03120200',campaignId:'CP3G9KS',month:'2026-09'}]};
        dispatchTrackerWrite.mockResolvedValue({write:{state:'complete'}});
        await runReccieAlarm({name:RECCIE_ALARM+'receipt:done'});
        expect(state['reccieAutoReceipt:done']).toBeUndefined();expect(dispatchTrackerWrite).toHaveBeenCalledTimes(1);
    });
});
test('retry policy distinguishes processing and temporary errors from access, mismatches and unreconciled lines',()=>{
    const {retryableReccieCheck}=require('../background/reccies');
    expect(retryableReccieCheck({state:'error',message:'Request timed out'})).toBe(true);
    expect(retryableReccieCheck({state:'outstanding',reconciled:'1',buyStatus:'PENDING'})).toBe(true);
    for(const check of [{state:'error',message:'Access denied (403)'},{state:'review',message:'Multiple Prisma matches'},{state:'outstanding',reconciled:'0',buyStatus:'PENDING'},{state:'outstanding',reconciled:'1',buyStatus:'FAILED'}])expect(retryableReccieCheck(check)).toBe(false);
});

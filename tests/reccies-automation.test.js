jest.mock('../background/reccie-writes',()=>({manualTrackerWrite:jest.fn()}));
const {manualTrackerWrite}=require('../background/reccie-writes');
const {autoMarkVerified,assigned}=require('../background/reccie-automation');
describe('automatic tracker updates',()=>{
    let state,tracker,context;
    beforeEach(()=>{
        tracker={revision:'r1',month:'2026-09',source:{type:'google'},rows:[{sourceRow:2,dNumber:'D03120200',campaignId:'CP3G9KS',month:'2026-09',ops:'Harry',reccied:'No'}],checks:{2:{state:'ready',reconciled:'1',buyStatus:'SUCCESSFUL',checkedAt:new Date().toISOString()}}};
        state={reccieAutomation:{autoMark:true},recciePreferences:{person:'Harry',assignment:'ops'},reccieTracker:tracker};
        chrome.storage.local.get=jest.fn(async()=>structuredClone(state));chrome.storage.local.set=jest.fn(async data=>Object.assign(state,structuredClone(data)));chrome.storage.local.remove=jest.fn(async key=>{delete state[key];});
        chrome.alarms.create=jest.fn(async()=>{});chrome.alarms.clear=jest.fn(async()=>{});
        context={queueWrite:fn=>fn(),assertActive:()=>{}};
        manualTrackerWrite.mockReset().mockImplementation(async request=>request.operation==='previewTrackerWrite'?{write:{requestId:'01234567-89ab-cdef-0123-456789abcdef'}}:{tracker,write:{state:'complete',results:[{state:'updated',confirmed:true}]}});
    });
    const run=()=>autoMarkVerified(tracker,{mode:'main',month:'2026-09',rowIds:[2]},context);
    test('pending batch preserves remaining stable identities without repeating commit',async()=>{
        const seed=tracker.rows[0];
        tracker.rows=Array.from({length:101},(_,index)=>({...seed,sourceRow:index+2,dNumber:`D${3100000+index}`}));
        tracker.checks=Object.fromEntries(tracker.rows.map(row=>[row.sourceRow,{state:'ready',reconciled:'1',buyStatus:'SUCCESSFUL',checkedAt:new Date().toISOString()}]));
        manualTrackerWrite.mockImplementation(async request=>request.operation==='previewTrackerWrite'?{write:{requestId:'pending-batch'}}:{write:{state:'pending',results:[]}});
        await autoMarkVerified(tracker,{mode:'main',month:'2026-09',rowIds:tracker.rows.map(row=>row.sourceRow)},context);
        expect(state['reccieAutoReceipt:pending-batch'].remaining).toEqual([{dNumber:'D3100100',campaignId:seed.campaignId,month:seed.month}]);
        expect(manualTrackerWrite.mock.calls.filter(([request])=>request.operation==='commitTrackerWrite')).toHaveLength(1);
    });
    test.each(['dNumber', 'campaignId', 'month'])('different %s values do not count as duplicate tracker rows', async field => {
        tracker.rows.push({ ...tracker.rows[0], sourceRow: 3, [field]: 'different' });
        await run();
        expect(manualTrackerWrite.mock.calls[0][0].rowIds).toEqual([2]);
    });
    test('duplicate keys include unselected and unassigned rows', async () => {
        tracker.rows.push({ ...tracker.rows[0], sourceRow: 3, ops: 'Other' });
        await run();
        expect(manualTrackerWrite).not.toHaveBeenCalled();
    });
    test('key fields are compared separately, without delimiter collisions', async () => {
        tracker.rows[0].dNumber = 'D/a'; tracker.rows[0].campaignId = 'b';
        tracker.rows.push({ ...tracker.rows[0], sourceRow: 3, dNumber: 'D', campaignId: 'a/b' });
        await run();
        expect(manualTrackerWrite.mock.calls[0][0].rowIds).toEqual([2]);
    });
    test('preserves strict field equality for missing and non-matching values', async () => {
        tracker.rows[0].month = undefined;
        tracker.rows.push({ ...tracker.rows[0], sourceRow: 3, month: null });
        await run();
        expect(manualTrackerWrite.mock.calls[0][0].rowIds).toEqual([2]);
        manualTrackerWrite.mockClear();
        tracker.rows[0].month = NaN;
        await run();
        expect(manualTrackerWrite).not.toHaveBeenCalled();
    });
    test('requires opt-in and uses preview/commit with an automatic audit cause',async()=>{
        state.reccieAutomation.autoMark=false;await run();expect(manualTrackerWrite).not.toHaveBeenCalled();
        state.reccieAutomation.autoMark=true;const result=await run();expect(result.lastAutoUpdate.saved).toBe(1);
        expect(manualTrackerWrite.mock.calls.map(([r])=>r.operation)).toEqual(['previewTrackerWrite','commitTrackerWrite']);
        expect(manualTrackerWrite.mock.calls[0][1].automatic).toBe(true);
        expect(chrome.storage.local.set.mock.calls.some(([data])=>Object.keys(data).some(key=>key.startsWith('reccieAutoReceipt:')))).toBe(true);
    });
    test.each(['failed','unreconciled','stale','other-person','duplicate','csv','already-yes'])('does not write %s rows',async reason=>{
        if(reason==='failed')tracker.checks[2].state='error';if(reason==='unreconciled')tracker.checks[2].reconciled='0';if(reason==='stale')tracker.checks[2].checkedAt='2020-01-01T00:00:00Z';if(reason==='other-person')tracker.rows[0].ops='Other';if(reason==='duplicate')tracker.rows.push({...tracker.rows[0],sourceRow:3});if(reason==='csv')tracker.source.type='csv';if(reason==='already-yes')tracker.rows[0].reccied='Yes';
        state.reccieTracker=tracker;await run();expect(manualTrackerWrite).not.toHaveBeenCalled();
    });
    test('turning off during preview prevents the commit',async()=>{
        manualTrackerWrite.mockImplementation(async()=>{state.reccieAutomation.autoMark=false;return {write:{requestId:'01234567-89ab-cdef-0123-456789abcdef'}};});
        const result=await run();expect(manualTrackerWrite).toHaveBeenCalledTimes(1);expect(result.lastAutoUpdate.error).toContain('switched off');
    });
    test('a timed-out commit reads status and never repeats a write',async()=>{
        manualTrackerWrite.mockImplementation(async request=>{if(request.operation==='previewTrackerWrite')return {write:{requestId:'01234567-89ab-cdef-0123-456789abcdef'}};if(request.operation==='commitTrackerWrite')throw Error('signal timed out');return {write:{state:'pending',results:[]}};});
        const result=await run();expect(result.lastAutoUpdate.pending).toBe(1);expect(manualTrackerWrite.mock.calls.map(([r])=>r.operation)).toEqual(['previewTrackerWrite','commitTrackerWrite','trackerWriteStatus']);
    });
    test('assignment matching requires a selected person and supported role',()=>{expect(assigned({ops:'Harry'},{person:'harry',assignment:'any'})).toBe(true);expect(assigned({ops:'Harry'},{assignment:'ops'})).toBe(false);});
});

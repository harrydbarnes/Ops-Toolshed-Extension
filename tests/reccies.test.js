const core = require('../reccie-core');
const { buildReccieQuery } = require('../background/reccie-query');
const headers = 'Serial Number,Campaign ID Mediaocean,Buyer Name,Ops Assigned,Group,Reccied,Client Name,Campaign Description,Supplier Name,Booking End Date';
const csv = `${headers}\r\nD03120200,CP3G9KS,Buyer,Harry,Harry,No,Client,"Campaign, with a comma",Supplier,\r\n`;
const fieldNode = (d = 'D03120200', month = '2026-09', reconciled = '1', buy = 'SUCCESSFUL') => ({ fields: [
    ['buySerialNumber',d],['month',month],['okToPay',reconciled],['buyStatus',buy]
].map(([id,value]) => ({id,value})) });

describe('Read-only reconciliation rules', () => {
    test('imports blank booking dates using the report month and preserves quoted CSV', () => {
        const [row] = core.importCsv(csv, '2026-09');
        expect(row).toMatchObject({ month:'2026-09',dNumber:'D03120200',campaignId:'CP3G9KS',campaignName:'Campaign, with a comma',issue:'' });
        expect(core.campaignUrl(row)).toContain('mos=2026-09-01');
    });
    test('flags every duplicate and refuses incomplete headers or invalid month', () => {
        const duplicate = core.importCsv(`${csv}D03120200,CP3G9KS,Buyer,Harry,Harry,No,,,,`, '2026-09');
        expect(duplicate.every(row => row.issue === 'Duplicate D number in report')).toBe(true);
        expect(() => core.importCsv('Serial Number\nD03120200', '2026-09')).toThrow('column');
        expect(() => core.importCsv(csv, '2026-13')).toThrow('month');
        expect(() => core.parseCsv('"unclosed')).toThrow('unclosed');
    });
    test('requires both conditions and the exact D number and month', () => {
        const [row] = core.importCsv(csv,'2026-09');
        const records = node => core.extractResults({status:0,nodes:[node],total:1});
        expect(core.evaluateRow(row,records(fieldNode())).state).toBe('ready');
        expect(core.evaluateRow(row,records(fieldNode(undefined,undefined,'0'))).state).toBe('outstanding');
        expect(core.evaluateRow(row,records(fieldNode(undefined,undefined,'1','FAILED'))).state).toBe('outstanding');
        expect(core.evaluateRow(row,records(fieldNode(undefined,'2026-10'))).state).toBe('review');
        expect(core.evaluateRow(row,[]).message).toBe('D number not found for this month — please check in case of tracker issues, likely deleted.');
        expect(core.evaluateRow(row,[...records(fieldNode()),...records(fieldNode())]).state).toBe('review');
        expect(core.evaluateRow(row,records(fieldNode(undefined,undefined,undefined,''))).state).toBe('review');
        expect(() => core.extractResults({status:0,total:9,nodes:[]})).toThrow('without row data');
    });
    test('only constructs Google read URLs from valid sheet tabs', () => {
        expect(core.sheetSource('https://docs.google.com/spreadsheets/d/123456789012345678901234/edit#gid=123').csvUrl).toContain('/gviz/tq?tqx=out:csv&gid=123');
        for (const url of ['https://evil.test/spreadsheets/d/123456789012345678901234/edit?gid=1','https://docs.google.com/spreadsheets/d/123456789012345678901234/edit','javascript:alert(1)']) expect(() => core.sheetSource(url)).toThrow();
    });
    test('retains the full query fields needed for actual returned records', () => {
        const query = buildReccieQuery('2026-09');
        expect(query.fields).toHaveLength(110);
        expect(query.fields).toContainEqual({ id:'actualMonthlyBuyId',hidden:true });
        expect(query.filter.filters[0].fields[1].value).toBe('2026-09');
    });
});

jest.mock('../background/feature-mode', () => ({isFeatureModeActive:jest.fn(()=>true)}));
describe('Reccies background reads', () => {
    let handleReccies, openReccies, state, sender, fetchMock;
    beforeEach(() => {
        ({handleReccies,openReccies} = require('../background/reccies'));
        const {isFeatureModeActive} = require('../background/feature-mode');
        isFeatureModeActive.mockReturnValue(true);
        state = {};
        chrome.runtime.id = 'reccie-test';
        sender = {id:chrome.runtime.id,url:chrome.runtime.getURL('reccies.html')};
        chrome.storage.local.get = jest.fn(async()=>structuredClone(state));
        chrome.storage.sync.get = jest.fn(async()=>({allFeaturesDisabled:false,onboardingAudience:'prisma'}));
        chrome.storage.local.set = jest.fn(async values=>{Object.assign(state,structuredClone(values));});
        chrome.storage.local.remove = jest.fn(async keys=>{keys.forEach(key=>delete state[key]);});
        chrome.permissions = {contains:jest.fn(async()=>true)};
        fetchMock = jest.fn(); global.fetch=fetchMock;
    });
    afterEach(()=>{delete global.fetch;delete chrome.runtime.id;});
    const call = async (handler, sender, request) => {
        const response = jest.fn(); await handler(request,sender,response); return response.mock.calls[0][0];
    };
    test('checks another campaign from the worker, preserves tracker No and uses no spreadsheet writes', async()=>{
        await call(handleReccies,sender,{operation:'import',csv,month:'2026-09'});
        fetchMock.mockResolvedValueOnce({ok:true,json:async()=>({id:3062760,publicId:'CP3G9KS',status:'Active'})})
            .mockResolvedValueOnce({ok:true,json:async()=>({status:0,total:1,nodes:[fieldNode()]})});
        const result=await call(handleReccies,sender,{operation:'check',revision:state.reccieTracker.revision,rowIds:[2]});
        expect(result.status).toBe('success');
        expect(state.reccieTracker.rows[0].reccied).toBe('No');
        expect(state.reccieTracker.checks[2].state).toBe('ready');
        expect(fetchMock.mock.calls.every(([url])=>url.startsWith('https://go.mediaocean.com/'))).toBe(true);
        expect(fetchMock.mock.calls[1][1].method).toBe('PUT');
        expect(JSON.parse(fetchMock.mock.calls[1][1].body).fields).toHaveLength(110);
    });
    test('failed access replaces ready status with an error and does not alter tracker data',async()=>{
        await call(handleReccies,sender,{operation:'import',csv,month:'2026-09'});
        state.reccieTracker.checks[2]={state:'ready'};
        fetchMock.mockResolvedValue({ok:false,status:401});
        await call(handleReccies,sender,{operation:'check',revision:state.reccieTracker.revision,rowIds:[2]});
        expect(state.reccieTracker.checks[2]).toMatchObject({state:'error',message:expect.stringContaining('401')});
        expect(state.reccieTracker.rows[0].reccied).toBe('No');
    });
    test('records when the Prisma result arrives, not when its request starts',async()=>{
        await call(handleReccies,sender,{operation:'import',csv,month:'2026-09'});
        jest.useFakeTimers({now:new Date('2026-10-21T10:00:00Z')});
        try {
            fetchMock.mockResolvedValueOnce({ok:true,json:async()=>({id:3062760,publicId:'CP3G9KS'})})
                .mockResolvedValueOnce({ok:true,json:async()=>{
                    jest.setSystemTime(new Date('2026-10-21T10:00:10Z'));
                    return {status:0,total:1,nodes:[fieldNode()]};
                }});
            await call(handleReccies,sender,{operation:'check',revision:state.reccieTracker.revision,rowIds:[2]});
            expect(state.reccieTracker.checks[2].checkedAt).toBe('2026-10-21T10:00:10.000Z');
        } finally { jest.useRealTimers(); }
    });
    test('discards results when the tracker refreshes during a check',async()=>{
        await call(handleReccies,sender,{operation:'import',csv,month:'2026-09'});
        const revision=state.reccieTracker.revision;
        fetchMock.mockImplementationOnce(async()=>{
            await call(handleReccies,sender,{operation:'import',csv,month:'2026-10'});
            return {ok:true,json:async()=>({id:3062760,publicId:'CP3G9KS'})};
        }).mockResolvedValueOnce({ok:true,json:async()=>({status:0,total:1,nodes:[fieldNode()]})});
        const result=await call(handleReccies,sender,{operation:'check',revision,rowIds:[2]});
        expect(result.status).toBe('error');
        expect(state.reccieTracker.month).toBe('2026-10');
        expect(state.reccieTracker.checks).toEqual({});
    });
    test('live Google read only uses GET and preserves old data on HTML/login failure',async()=>{
        const request={operation:'refresh',month:'2026-09',url:'https://docs.google.com/spreadsheets/d/123456789012345678901234/edit?gid=1'};
        fetchMock.mockResolvedValueOnce({ok:true,headers:{get:()=> 'text/csv; charset=utf-8'},text:async()=>csv});
        expect((await call(handleReccies,sender,request)).status).toBe('success');
        const revision=state.reccieTracker.revision;
        expect(fetchMock.mock.calls[0][1].method).toBe('GET');
        fetchMock.mockResolvedValueOnce({ok:true,headers:{get:()=> 'text/html'}});
        expect((await call(handleReccies,sender,request)).status).toBe('error');
        expect(state.reccieTracker.revision).toBe(revision);
    });
    test('rejects content-page tracker requests and feature-off checks',async()=>{
        expect((await call(handleReccies,{id:chrome.runtime.id,url:'https://go.mediaocean.com/campaign-management/'},{operation:'import',csv,month:'2026-09'})).status).toBe('error');
        require('../background/feature-mode').isFeatureModeActive.mockReturnValue(false);
        expect((await call(handleReccies,sender,{operation:'import',csv,month:'2026-09'})).status).toBe('error');
        expect(fetchMock).not.toHaveBeenCalled();
    });
    test('non-Prisma profiles cannot read or check tracker data even with shared features on',async()=>{
        chrome.storage.sync.get.mockResolvedValue({allFeaturesDisabled:false,onboardingAudience:'non-prisma'});
        expect((await call(handleReccies,sender,{operation:'import',csv,month:'2026-09'})).status).toBe('error');
        expect(fetchMock).not.toHaveBeenCalled();
    });
    test('opens the shared sidebar synchronously from the trusted Prisma sender',async()=>{
        chrome.sidePanel.open=jest.fn(async()=>{});chrome.sidePanel.setOptions=jest.fn(async()=>{});
        const reply=jest.fn();
        const pending=openReccies({}, {id:chrome.runtime.id,url:'https://go.mediaocean.com/campaign-management/',tab:{id:42,windowId:7},frameId:0},reply);
        expect(chrome.sidePanel.open).toHaveBeenCalledWith({windowId:7});
        await pending;
        expect(chrome.sidePanel.setOptions).toHaveBeenCalledWith({tabId:42,path:'reccies.html',enabled:true});
        expect(chrome.sidePanel.setOptions).toHaveBeenCalledWith({path:'reccies.html',enabled:true});
        expect(reply).toHaveBeenCalledWith({status:'success'});
    });
});

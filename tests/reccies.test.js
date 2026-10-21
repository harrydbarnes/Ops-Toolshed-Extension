const core = require('../reccie-core');
const { buildReccieQuery } = require('../background/reccie-query');
const headers = 'Serial Number,Campaign ID Mediaocean,Buyer Name,Ops Assigned,Group,Reccied,Client Name,Campaign Description,Supplier Name,Booking End Date';
const csv = `${headers}\r\nD03120200,CP3G9KS,Buyer,Harry,Harry,No,Client,"Campaign, with a comma",Supplier,\r\n`;
const fieldNode = (d = 'D03120200', month = '2026-09', reconciled = '1', buy = 'SUCCESSFUL') => ({ fields: [
    ['buySerialNumber',d],['month',month],['okToPay',reconciled],['buyStatus',buy]
].map(([id,value]) => ({id,value})) });

describe('Read-only reconciliation rules', () => {
    test('comparison methods differ only in their concurrency and retain the default',()=>{
        expect(core.verificationMethod().concurrency).toBe(8);
        const options=Array.from({length:20},(_,index)=>index+1).map(number=>core.verificationMethod(`workers-${number}`));
        const settings=options.map(({id,label,concurrency,...rest})=>rest);
        settings.forEach(setting=>expect(setting).toEqual(settings[0]));
        expect(()=>core.verificationMethod('toString')).toThrow('Choose');
    });
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
    test.each(['workers-0','workers-21','workers-1.5','workers-99','toString'])('rejects invalid worker method %s before making requests',async method=>{
        const result=await call(handleReccies,sender,{operation:'check',method});
        expect(result).toMatchObject({status:'error',message:expect.stringContaining('Choose')});
        expect(fetchMock).not.toHaveBeenCalled();
    });
    test.each([1,2,3,4,5,6,8,20])('enforces the chosen %i worker limit and records the actual method',async concurrency=>{
        await call(handleReccies,sender,{operation:'import',csv,month:'2026-09'});
        const row=state.reccieTracker.rows[0];
        state.reccieTracker.rows=Array.from({length:22},(_,index)=>({...row,sourceRow:index+2,campaignId:`CPTEST${index}`}));
        const grids=[];let active=0,maxActive=0;
        fetchMock.mockImplementation(async url=>{
            if(url.includes('publicforui')) return {ok:true,status:200,json:async()=>({id:100,publicId:url.split('/').pop()})};
            active++;maxActive=Math.max(active,maxActive);
            return await new Promise(resolve=>grids.push(()=>{
                active--;resolve({ok:true,status:200,json:async()=>({status:0,total:1,nodes:[fieldNode()]})});
            }));
        });
        const pending=call(handleReccies,sender,{operation:'check',revision:state.reccieTracker.revision,rowIds:state.reccieTracker.rows.map(item=>item.sourceRow),method:`workers-${concurrency}`,concurrency:99});
        const flush=()=>new Promise(resolve=>setImmediate(resolve));
        await flush();expect(active).toBe(concurrency);
        while(grids.length) { grids.shift()();await flush(); }
        await pending;
        expect(maxActive).toBe(concurrency);
        expect(state.reccieTracker.lastCheckTiming).toMatchObject({concurrency,method:core.verificationMethod(`workers-${concurrency}`)});
        expect(fetchMock).toHaveBeenCalledTimes(44);
    });
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
        expect(state.reccieTracker.lastCheckTiming.campaignsDetail[0]).toMatchObject({outcome:'error',requests:[{phase:'lookup',httpStatus:401,ok:false,headersMs:expect.any(Number),totalMs:expect.any(Number)}]});
    });
    test('checks 372 placements in one campaign with two requests and records phase durations',async()=>{
        await call(handleReccies,sender,{operation:'import',csv,month:'2026-09'});
        const row = state.reccieTracker.rows[0];
        state.reccieTracker.rows = Array.from({length:372},(_,index)=>({...row,sourceRow:index+2,dNumber:`D${index}`}));
        let now = 0;
        const clock = jest.spyOn(performance,'now').mockImplementation(()=>now);
        fetchMock.mockImplementation(async url=>{
            now += 25;
            return {ok:true,status:200,json:async()=>{
                now += 5;
                return url.includes('publicforui') ? {id:3062760,publicId:'CP3G9KS'} :
                    {status:0,total:372,nodes:state.reccieTracker.rows.map(item=>fieldNode(item.dNumber))};
            }};
        });
        try {
            await call(handleReccies,sender,{operation:'check',revision:state.reccieTracker.revision,rowIds:state.reccieTracker.rows.map(item=>item.sourceRow)});
            expect(fetchMock).toHaveBeenCalledTimes(2);
            expect(Object.values(state.reccieTracker.checks).every(item=>item.state==='ready')).toBe(true);
            expect(state.reccieTracker.lastCheckTiming).toMatchObject({rows:372,campaigns:1,totalMs:60,skippedRows:0,cacheHits:0,retries:0});
            expect(state.reccieTracker.lastCheckTiming.campaignsDetail[0]).toMatchObject({rows:372,queueMs:0,totalMs:60,outcome:'success',requests:[
                {phase:'lookup',headersMs:25,totalMs:30,httpStatus:200,ok:true},
                {phase:'grid',headersMs:25,totalMs:30,httpStatus:200,ok:true}
            ]});
        } finally { clock.mockRestore(); }
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
    test('keeps three workers busy across 46 campaigns without waiting at ten-campaign boundaries',async()=>{
        await call(handleReccies,sender,{operation:'import',csv,month:'2026-09'});
        const row=state.reccieTracker.rows[0];
        state.reccieTracker.rows=Array.from({length:372},(_,index)=>({...row,sourceRow:index+2,dNumber:`D${index}`,campaignId:`CPTEST${index%46}`}));
        const grids=[], started=[];
        let active=0,maxActive=0;
        fetchMock.mockImplementation(async url=>{
            if(url.includes('publicforui')) {
                const publicId=url.split('/').pop();
                return {ok:true,status:200,json:async()=>({publicId,id:Number(publicId.slice(6))+1})};
            }
            active++;maxActive=Math.max(maxActive,active);started.push(url);
            return await new Promise(resolve=>grids.push(()=>{
                active--;resolve({ok:true,status:200,json:async()=>({status:0,total:372,nodes:state.reccieTracker.rows.map(item=>fieldNode(item.dNumber))})});
            }));
        });
        const pending=call(handleReccies,sender,{operation:'check',method:'workers-3',revision:state.reccieTracker.revision,rowIds:state.reccieTracker.rows.map(item=>item.sourceRow)});
        const flush=()=>new Promise(resolve=>setImmediate(resolve));
        await flush();
        expect(started).toHaveLength(3);
        // Keep the first two campaigns blocked while the third worker crosses the old batch boundary.
        for(let index=0;index<12;index++) { grids.splice(2,1)[0]();await flush(); }
        expect(started.length).toBeGreaterThan(10);
        while(grids.length) { grids.shift()();await flush(); }
        const result=await pending;
        expect(result.status).toBe('success');
        expect(maxActive).toBe(3);
        expect(fetchMock).toHaveBeenCalledTimes(92);
        expect(state.reccieTracker.lastCheckTiming).toMatchObject({campaigns:46,retries:0});
        expect(Object.values(state.reccieTracker.checks).filter(item=>item.state==='ready')).toHaveLength(372);
    });
    test.each(['timeout','network','server'])('defers one %s retry, reusing a successful lookup and recording both attempts',async kind=>{
        await call(handleReccies,sender,{operation:'import',csv,month:'2026-09'});
        const row=state.reccieTracker.rows[0];
        state.reccieTracker.rows=Array.from({length:4},(_,index)=>({...row,sourceRow:index+2,campaignId:index ? `CPTEST${index}` : row.campaignId}));
        let failed=false;
        const events=[];
        fetchMock.mockImplementation(async url=>{
            if(url.includes('publicforui')) {
                const publicId=url.split('/').pop();events.push(publicId);
                return {ok:true,status:200,json:async()=>({publicId,id:publicId===row.campaignId ? 100 : Number(publicId.slice(6))})};
            }
            if(url.includes('/100/') && !failed) {
                failed=true;
                if(kind==='server') return {ok:false,status:500};
                if(kind==='network') throw new TypeError('Failed to fetch');
                throw new DOMException('timed out','TimeoutError');
            }
            events.push(url.includes('/100/') ? 'retried' : 'grid');
            return {ok:true,status:200,json:async()=>({status:0,total:1,nodes:[fieldNode()]})};
        });
        jest.useFakeTimers();
        try {
            const pending=call(handleReccies,sender,{operation:'check',method:'workers-3',revision:state.reccieTracker.revision,rowIds:[2,3,4,5]});
            await jest.advanceTimersByTimeAsync(1100);
            await pending;
            expect(events.indexOf('CPTEST3')).toBeLessThan(events.indexOf('retried'));
            expect(fetchMock.mock.calls.filter(([url])=>url.endsWith(`publicforui/${row.campaignId}`))).toHaveLength(1);
            const detail=state.reccieTracker.lastCheckTiming.campaignsDetail.find(item=>item.campaign===row.campaignId);
            expect(detail).toMatchObject({attempts:2,outcome:'success',requests:[{phase:'lookup',attempt:1,ok:true},{phase:'grid',attempt:1,ok:false},{phase:'grid',attempt:2,ok:true}]});
            expect(state.reccieTracker.lastCheckTiming.retries).toBe(1);
            expect(state.reccieTracker.checks[2].state).toBe('ready');
        } finally { jest.useRealTimers(); }
    });
    test('stops after one retry on repeated server failures',async()=>{
        await call(handleReccies,sender,{operation:'import',csv,month:'2026-09'});
        fetchMock.mockResolvedValue({ok:false,status:500});
        jest.useFakeTimers();
        try {
            const pending=call(handleReccies,sender,{operation:'check',revision:state.reccieTracker.revision,rowIds:[2]});
            await jest.advanceTimersByTimeAsync(1100);await pending;
            expect(fetchMock).toHaveBeenCalledTimes(2);
            expect(state.reccieTracker.checks[2]).toMatchObject({state:'error',message:expect.stringContaining('500')});
            expect(state.reccieTracker.lastCheckTiming.retries).toBe(1);
        } finally { jest.useRealTimers(); }
    });
    test('does not retry an invalid grid or access error',async()=>{
        await call(handleReccies,sender,{operation:'import',csv,month:'2026-09'});
        fetchMock.mockResolvedValueOnce({ok:true,json:async()=>({publicId:'CP3G9KS',id:100})})
            .mockResolvedValueOnce({ok:true,json:async()=>({status:0,total:9,nodes:[]})});
        await call(handleReccies,sender,{operation:'check',revision:state.reccieTracker.revision,rowIds:[2]});
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(state.reccieTracker.lastCheckTiming.retries).toBe(0);
        expect(state.reccieTracker.checks[2].state).toBe('error');
    });
    test('caps requests at the remaining run budget and marks queued rows for another check',async()=>{
        await call(handleReccies,sender,{operation:'import',csv,month:'2026-09'});
        const row=state.reccieTracker.rows[0];
        state.reccieTracker.rows=Array.from({length:4},(_,index)=>({...row,sourceRow:index+2,campaignId:`CPTEST${index}`}));
        let now=0;
        const clock=jest.spyOn(performance,'now').mockImplementation(()=>now);
        fetchMock.mockImplementation(async url=>{
            if(url.includes('publicforui')) {
                now=239900;
                const publicId=url.split('/').pop();
                return {ok:true,status:200,json:async()=>({publicId,id:Number(publicId.slice(6))+1})};
            }
            now=240000;
            throw new DOMException('timed out','TimeoutError');
        });
        try {
            await call(handleReccies,sender,{operation:'check',method:'workers-3',revision:state.reccieTracker.revision,rowIds:[2,3,4,5]});
            const report=state.reccieTracker.lastCheckTiming;
            expect(report.retries).toBe(0);
            expect(report.totalMs).toBe(240000);
            expect(report.campaignsDetail.flatMap(item=>item.requests).find(item=>item.phase==='grid').timeoutMs).toBe(100);
            expect(state.reccieTracker.checks[5]).toMatchObject({state:'error',message:expect.stringContaining('time limit')});
            expect(fetchMock.mock.calls.some(([url])=>url.endsWith('publicforui/CPTEST3'))).toBe(false);
        } finally { clock.mockRestore(); }
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

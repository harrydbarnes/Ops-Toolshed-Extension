const core=require('../reccie-core');
const url='https://docs.google.com/spreadsheets/d/1QxX7yZvfh75ENyvPG7xD_5ldLuoLwUsTZ6z0edkpORU/edit?gid=405487495';
const requestId='01234567-89ab-cdef-0123-456789abcdef';
describe('manual Reccies worker writes',()=>{
    let state,manual,fetchMock;
    const context={queueWrite:fn=>fn(),assertActive:()=>{}};
    const row=(id,d)=>({sourceRow:id,dNumber:d,campaignId:'CP3G9KS',month:'2026-09',reccied:'No',issue:''});
    const response=data=>({ok:true,url:'https://script.googleusercontent.com/echo',headers:{get:()=> 'application/json'},json:async()=>({ok:true,service:'ops-toolshed-reccies-writer',protocol:1,...data})});
    beforeEach(()=>{
        chrome.storage.session.__resetStore();
        jest.resetModules();({dispatchTrackerWrite:manual}=require('../background/reccie-writes'));
        state={reccieTracker:{revision:'original',month:'2026-09',source:{type:'google',url},rows:[row(2,'D03120200'),row(3,'D03120201')],checks:{2:{state:'ready'}}}};
        chrome.permissions={contains:jest.fn(async()=>true)};
        chrome.storage.local.get=jest.fn(async()=>structuredClone(state));chrome.storage.local.set=jest.fn(async values=>Object.assign(state,structuredClone(values)));
        fetchMock=jest.fn(async()=>response({requestId,mode:'main',month:'2026-09',token:'secret-token',results:[{dNumber:'D03120200',campaignId:'CP3G9KS',month:'2026-09',state:'eligible',before:'No'}]}));global.fetch=fetchMock;
    });
    afterEach(()=>{delete global.fetch;jest.dontMock('../reccie-writer-mode');});
    const preview=()=>manual({operation:'previewTrackerWrite',mode:'main',month:'2026-09',revision:'original',rowIds:[2]},context);
    const commit=()=>manual({operation:'commitTrackerWrite',mode:'main',month:'2026-09',revision:'original',requestId},context);
    test('per-user connection binds the real account and sends no owner fallback request',async()=>{
        jest.resetModules();jest.doMock('../reccie-writer-mode',()=>{globalThis.opsReccieWriterMode={perUser:true,endpoint:'https://script.google.com/macros/s/per-user-test/exec'};});
        ({dispatchTrackerWrite:manual}=require('../background/reccie-writes'));
        fetchMock.mockResolvedValue(response({email:'jett@example.com',effectiveEmail:'jett@example.com',perUser:true,ready:true,enforced:false}));
        await manual({operation:'trackerWriteConnection',mode:'main'},context);
        expect((await chrome.storage.session.get('recciePerUserWriterIdentity')).recciePerUserWriterIdentity).toBe('jett@example.com');
        fetchMock.mockResolvedValue(response({email:'jett@example.com',effectiveEmail:'jett@example.com',perUser:true,ready:true,enforced:true}));
        await manual({operation:'activatePerUserWriter',mode:'main'},context);
        expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({operation:'activatePerUser',requirePerUser:true,expectedEmail:'jett@example.com'});
        expect(fetchMock.mock.calls.every(([url])=>url==='https://script.google.com/macros/s/per-user-test/exec')).toBe(true);
    });
    test('comment clearing fails closed against a service without that capability',async()=>{
        await expect(manual({operation:'previewTrackerWrite',mode:'main',month:'2026-09',revision:'original',rowIds:[2],clearComments:true},context)).rejects.toThrow('comment-removal update');
        expect(JSON.parse(fetchMock.mock.calls[0][1].body).clearComments).toBe(true);
        await expect(commit()).rejects.toThrow('expired');
    });
    test('preview survives a worker restart and uses the service expiry',async()=>{
        const item={dNumber:'D03120200',campaignId:'CP3G9KS',month:'2026-09',state:'eligible',before:'No'};
        fetchMock.mockResolvedValueOnce(response({requestId,mode:'main',month:'2026-09',token:'secret-token',expiresInSeconds:600,results:[item]}));
        await preview();
        const values=await chrome.storage.session.get('reccieWritePreview:'+requestId);
        expect(values['reccieWritePreview:'+requestId].expires-Date.now()).toBeGreaterThan(580000);
        jest.resetModules();({dispatchTrackerWrite:manual}=require('../background/reccie-writes'));
        fetchMock.mockResolvedValue(response({requestId,mode:'main',month:'2026-09',state:'complete',results:[{...item,state:'updated',after:'Yes',confirmed:true}]}));
        await commit();expect(state.reccieTracker.rows[0].reccied).toBe('Yes');
        expect((await chrome.storage.session.get('reccieWritePreview:'+requestId))['reccieWritePreview:'+requestId]).toBeUndefined();
    });
    test('automatic opt-out at final send boundary prevents the network commit',async()=>{
        await preview();
        const beforeCommit=jest.fn(async()=>{throw Error('Automatic tracker updates were switched off.');});
        await expect(manual({operation:'commitTrackerWrite',mode:'main',month:'2026-09',revision:'original',requestId},{...context,automatic:true,beforeCommit})).rejects.toThrow('switched off');
        expect(beforeCommit).toHaveBeenCalledTimes(1);expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    test('previews authoritative snapshot identities without exposing tokens to UI',async()=>{
        const result=await preview();expect(result.write).not.toHaveProperty('token');expect(state.reccieTracker.rows[0].reccied).toBe('No');
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({operation:'preview',mode:'main',month:'2026-09',rows:[{dNumber:'D03120200',campaignId:'CP3G9KS'}]});
    });
    test('retries a connection-only response once as a read-only preview',async()=>{
        fetchMock.mockResolvedValueOnce(response({email:'user@example.com',manualEnabled:true}));
        const result=await preview();expect(result.write.requestId).toBe(requestId);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock.mock.calls.map(([,options])=>JSON.parse(options.body).operation)).toEqual(['preview','preview']);
    });
    test('rejects a repeated connection response without saving or accepting a malformed preview',async()=>{
        fetchMock.mockResolvedValue(response({email:'user@example.com',manualEnabled:true}));
        await expect(preview()).rejects.toThrow('No save was started');expect(fetchMock).toHaveBeenCalledTimes(2);
        await expect(commit()).rejects.toThrow('expired');
    });
    test('rejects a preview that duplicates one selected placement and omits another',async()=>{
        const item={dNumber:'D03120200',campaignId:'CP3G9KS',month:'2026-09',state:'eligible',before:'No'};
        fetchMock.mockResolvedValue(response({requestId,mode:'main',month:'2026-09',token:'secret-token',results:[item,{...item}]}));
        await expect(manual({operation:'previewTrackerWrite',mode:'main',month:'2026-09',revision:'original',rowIds:[2,3]},context)).rejects.toThrow('preview does not match');
        await expect(commit()).rejects.toThrow('expired');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    test('accepts a complete preview in a different order',async()=>{
        const results=['D03120201','D03120200'].map(dNumber=>({dNumber,campaignId:'CP3G9KS',month:'2026-09',state:'eligible',before:'No'}));
        fetchMock.mockResolvedValue(response({requestId,mode:'main',month:'2026-09',token:'secret-token',results}));
        await expect(manual({operation:'previewTrackerWrite',mode:'main',month:'2026-09',revision:'original',rowIds:[2,3]},context)).resolves.toMatchObject({write:{results}});
    });
    test('only confirmed receipt rows update local tracker and counts; failed rows stay No',async()=>{
        await preview();fetchMock.mockResolvedValue(response({requestId,mode:'main',month:'2026-09',state:'complete',results:[{dNumber:'D03120200',campaignId:'CP3G9KS',month:'2026-09',state:'updated',after:'Yes',confirmed:true},{dNumber:'D03120201',campaignId:'CP3G9KS',month:'2026-09',state:'failed',after:null,confirmed:false}]}));
        const result=await commit();expect(result.tracker.rows.map(r=>r.reccied)).toEqual(['Yes','No']);expect(result.tracker.checks[2].state).toBe('ready');expect(state.reccieTracker.revision).not.toBe('original');
        expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({token:'secret-token'});expect(state['reccieManualSave:main:2026-09']).toEqual({requestId,mode:'main',month:'2026-09'});
    });
    test.each(['csv','automatic'])('rejects non-live source %s',async type=>{
        state.reccieTracker.source.type=type;await expect(preview()).rejects.toThrow('live Ops');expect(fetchMock).not.toHaveBeenCalled();
    });
    test('rejects a different tracker, stale revision and bad selections before network',async()=>{
        state.reccieTracker.source.url=url.replace('1QxX7yZvfh75ENyvPG7xD_5ldLuoLwUsTZ6z0edkpORU','other-spreadsheet-12345678901234');await expect(preview()).rejects.toThrow('live Ops');state.reccieTracker.source.url=url;
        state.reccieTracker.revision='changed';await expect(preview()).rejects.toThrow('changed');state.reccieTracker.revision='original';
        await expect(manual({operation:'previewTrackerWrite',mode:'main',month:'2026-09',revision:'original',rowIds:[999]},context)).rejects.toThrow('Selection');expect(fetchMock).not.toHaveBeenCalled();
    });
    test('unknown network result never updates cache or retries commit automatically; status can recover',async()=>{
        await preview();fetchMock.mockRejectedValueOnce(Error('Connection lost'));await expect(commit()).rejects.toMatchObject({code:'TRANSPORT_UNCERTAIN'});expect(state.reccieTracker.rows[0].reccied).toBe('No');expect(fetchMock).toHaveBeenCalledTimes(2);
        fetchMock.mockResolvedValue(response({requestId,mode:'main',month:'2026-09',state:'complete',results:[{dNumber:'D03120200',campaignId:'CP3G9KS',month:'2026-09',state:'already_yes',after:'Yes',confirmed:true}]}));
        await manual({operation:'trackerWriteStatus',mode:'main',month:'2026-09',requestId},context);expect(state.reccieTracker.rows[0].reccied).toBe('Yes');expect(JSON.parse(fetchMock.mock.calls[2][1].body).operation).toBe('status');
    });
    test('refuses login HTML and missing permissions',async()=>{
        chrome.permissions.contains.mockResolvedValue(false);await expect(preview()).rejects.toThrow('Allow');expect(fetchMock).not.toHaveBeenCalled();chrome.permissions.contains.mockResolvedValue(true);
        fetchMock.mockResolvedValue({ok:true,url:'https://accounts.google.com/login',headers:{get:()=> 'text/html'}});await expect(preview()).rejects.toThrow('sign-in');
    });
    test('manual notes send selected edits and apply confirmed No/comments from receipt',async()=>{
        state.reccieTracker.rows[0].reccied='Yes';state.reccieTracker.rows[0].comments='Old';
        const item={dNumber:'D03120200',campaignId:'CP3G9KS',month:'2026-09',state:'eligible',before:'Yes',after:'No',commentsAfter:'Waiting on Supplier Spend'};
        fetchMock.mockResolvedValueOnce(response({kind:'edit',requestId,mode:'main',month:'2026-09',token:'secret-token',results:[item]}));
        await manual({operation:'previewTrackerEdit',mode:'main',month:'2026-09',revision:'original',rowIds:[2],edits:[{sourceRow:2,reccied:'No',comments:item.commentsAfter}]},context);
        expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({operation:'previewEdit',rows:[{before:'Yes',after:'No',commentsBefore:'Old',commentsAfter:item.commentsAfter}]});
        fetchMock.mockResolvedValueOnce(response({requestId,mode:'main',month:'2026-09',state:'complete',results:[{...item,state:'updated',confirmed:true}]}));
        const result=await commit();expect(result.tracker.rows[0]).toMatchObject({reccied:'No',comments:item.commentsAfter});
    });
    test('automatic callers cannot write notes or manual No',async()=>{
        await expect(manual({operation:'previewTrackerEdit',mode:'main',month:'2026-09',revision:'original',rowIds:[2],edits:[{sourceRow:2,reccied:'No',comments:'test'}]},{...context,automatic:true})).rejects.toThrow('Invalid manual');expect(fetchMock).not.toHaveBeenCalled();
    });
    test('rejects old service and mismatched comment previews before commit',async()=>{
        await expect(manual({operation:'previewTrackerEdit',mode:'main',month:'2026-09',revision:'original',rowIds:[2],edits:[{sourceRow:2,reccied:'No',comments:'test'}]},context)).rejects.toThrow('notes update');await expect(commit()).rejects.toThrow('expired');
    });

});

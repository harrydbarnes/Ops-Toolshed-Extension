const fs=require('fs'),path=require('path'),vm=require('vm');
const base=path.resolve(__dirname,'../integrations/reccie-write-pilot');
function setup(options={}) {
    let email=options.email ?? 'tester@example.com',value='No';
    const writes=[],audit=[],properties=new Map([['ALLOW_tester@example.com','true'],['ALLOW_other@example.com','true'],['TESTER_EMAIL','tester@example.com'],['WRITE_TEST_ENABLED','true']]),cache=new Map();
    const cell={getValue:()=>value,getFormula:()=>options.formula?'=A1':'',getDataValidation:()=>null,setValue:next=>{writes.push(next);if(next==='No'&&options.restoreFailure)throw Error('failed');value=next;}};
    const row=['D03120200','CP3G9KS','06/09/2026','No'];
    const sheet={getDataRange:()=>({getDisplayValues:()=>[['Serial Number','Campaign ID Mediaocean','Booking End Date','Reccied'],options.moved?['D99999999',...row.slice(1)]:row,...(options.duplicate?[row]:[])]}),getRange:(row,col)=>{expect([row,col]).toEqual([2,4]);return cell;}};
    const props={getProperty:key=>properties.get(key)??null,setProperty:(key,value)=>properties.set(key,value),setProperties:values=>Object.entries(values).forEach(([key,value])=>properties.set(key,value))};
    const context={Session:{getActiveUser:()=>({getEmail:()=>email})},PropertiesService:{getScriptProperties:()=>props},Utilities:{getUuid:()=> '01234567-89ab-cdef-0123-456789abcdef'},CacheService:{getScriptCache:()=>({put:(key,value)=>cache.set(key,value),get:key=>cache.get(key),remove:key=>cache.delete(key)})},LockService:{getScriptLock:()=>({tryLock:()=>{if(options.revokeWhileWaiting)properties.set('WRITE_TEST_ENABLED','false');return !options.busy;},releaseLock:jest.fn()})},SpreadsheetApp:{openById:jest.fn(()=>({getSheetByName:()=>sheet})),flush:jest.fn(()=>{if(value==='Yes'&&options.flushFailure)throw Error('failed');})},console:{log:value=>audit.push(JSON.parse(value)),error:jest.fn()},ContentService:{MimeType:{JSON:'json'},createTextOutput:value=>({value,setMimeType(){return this;}})}};
    vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(base,'server/Code.gs'),'utf8'),context);
    const post=input=>JSON.parse(context.doPost({postData:{contents:JSON.stringify(input)}}).value);
    const prepare=()=>post({operation:'prepare'});
    return {context,properties,prepare,post,writes,audit,setEmail:next=>email=next,value:()=>value};
}
test('previews without writing, then performs one round trip and disables itself',()=>{
    const test=setup(),preview=test.prepare();expect(preview).toMatchObject({ok:true,original:'No',dNumber:'D03120200'});expect(test.writes).toEqual([]);
    expect(test.post({operation:'roundTrip',token:preview.token})).toMatchObject({ok:true,yesConfirmed:true,restored:true});
    expect(test.writes).toEqual(['Yes','No']);expect(test.value()).toBe('No');expect(test.properties.get('WRITE_TEST_ENABLED')).toBe('false');expect(test.audit).toHaveLength(1);
    expect(test.post({operation:'roundTrip',token:preview.token}).error).toBe('WRITE_TEST_DISABLED');
});
test.each(['','outsider@example.com'])('denies missing or unlisted identity before accessing Sheets (%s)',email=>{
    const test=setup({email});expect(test.prepare().ok).toBe(false);expect(test.context.SpreadsheetApp.openById).not.toHaveBeenCalled();
});
test('honours immediate remote revocation between prepare and commit',()=>{
    const test=setup(),preview=test.prepare();test.properties.set('ALLOW_tester@example.com','false');
    expect(test.post({operation:'roundTrip',token:preview.token}).error).toBe('ACCESS_DENIED');expect(test.writes).toEqual([]);
});
test('a permitted colleague cannot run the owner-only test or use their token',()=>{
    const test=setup(),preview=test.prepare();test.setEmail('other@example.com');
    expect(test.post({operation:'roundTrip',token:preview.token}).error).toBe('WRITE_TEST_DISABLED');expect(test.writes).toEqual([]);
});
test.each([{moved:true},{duplicate:true},{formula:true},{busy:true},{revokeWhileWaiting:true}])('fails closed on changed targets or lock state %j',options=>{
    const test=setup(options);expect(test.prepare().ok).toBe(false);expect(test.writes).toEqual([]);
});
test('restores original after a flush error',()=>{
    const test=setup({flushFailure:true}),preview=test.prepare();expect(test.post({operation:'roundTrip',token:preview.token})).toMatchObject({ok:false,restored:true,yesConfirmed:false});expect(test.value()).toBe('No');
});
test('reports failed restoration prominently',()=>{
    const test=setup({restoreFailure:true}),preview=test.prepare();expect(test.post({operation:'roundTrip',token:preview.token})).toMatchObject({ok:false,restored:false,error:'RESTORE_FAILED_CHECK_TRACKER'});
});
test('token must be valid, issued and bound to Google identity',()=>{
    const test=setup();expect(test.post({operation:'roundTrip',token:'fake-token-that-was-never-issued'}).error).toBe('TOKEN_EXPIRED_USED_OR_WRONG_USER');expect(test.writes).toEqual([]);
});
test('access check ignores supplied email and does not expose the registry',()=>{
    const test=setup();const result=JSON.parse(test.context.doGet({parameter:{nonce:'01234567-89ab-cdef-0123-456789abcdef',email:'other@example.com'}}).value);
    expect(result).toMatchObject({email:'tester@example.com',allowed:true});expect(result).not.toHaveProperty('users');expect(test.context.SpreadsheetApp.openById).not.toHaveBeenCalled();
});
test('seed normalises the requested 20 unique entries and defaults writes off',()=>{
    const test=setup();vm.runInContext(fs.readFileSync(path.join(base,'server/SeedAccess.gs'),'utf8'),test.context);
    expect(test.context.seedAccess_()).toMatchObject({configuredUsers:20,writeTestEnabled:false});expect(test.properties.get('WRITE_TEST_ENABLED')).toBe('false');
    expect(()=>test.context.seedAccess_()).toThrow('ALREADY_INITIALIZED');
});
test('extension contains no server access list or tester email',()=>{
    const contents=fs.readdirSync(path.join(base,'extension')).map(file=>fs.readFileSync(path.join(base,'extension',file),'utf8')).join('\n');
    expect(contents).not.toMatch(/[a-z0-9._%+-]+@(?:wppmedia|groupm)\.com/i);
    expect(contents).not.toContain('ALLOW_');expect(contents).not.toContain('seedAccess_');
});
